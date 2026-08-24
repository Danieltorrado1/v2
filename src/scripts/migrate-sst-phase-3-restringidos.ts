import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

dotenv.config();

const SQL_FILE = path.resolve('sql/phase-sst-3-restringidos.sql');
const REPORT_FILE = path.resolve('reports/sst-phase-3-restringidos-migration-report.json');
const REQUIRED_BASELINES = [
  'personas',
  'vinculaciones',
  'cobertura_asignaciones',
  'focalizacion_final',
  'focalizacion_vigencias',
  'sst_perfil_demografico',
  'sst_perfil_demografico_versiones',
  'sst_perfil_restringido'
] as const;

interface CountRow extends QueryResultRow {
  total: string;
}

interface TableExistsRow extends QueryResultRow {
  exists: boolean;
}

interface ColumnRow extends QueryResultRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });
};

const queryCount = async (client: PoolClient, tableName: string): Promise<number> => {
  const result = await client.query<CountRow>(`SELECT COUNT(*)::text AS total FROM ${tableName}`);
  return Number(result.rows[0]?.total ?? 0);
};

const tableExists = async (client: PoolClient, tableName: string): Promise<boolean> => {
  const result = await client.query<TableExistsRow>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
};

const loadColumns = async (client: PoolClient, tableName: string): Promise<ColumnRow[]> => {
  const result = await client.query<ColumnRow>(
    `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );

  return result.rows;
};

const main = async (): Promise<void> => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await mkdir(path.dirname(REPORT_FILE), { recursive: true });
    const sql = await readFile(SQL_FILE, 'utf8');

    if (/\bDROP\b/i.test(sql) || /\bTRUNCATE\b/i.test(sql) || /\bDELETE\s+FROM\b/i.test(sql)) {
      throw new Error('La migracion contiene operaciones destructivas no permitidas.');
    }

    const baseline = Object.fromEntries(
      await Promise.all(
        REQUIRED_BASELINES.map(async (tableName) => [tableName, await queryCount(client, tableName)])
      )
    );

    if (!(await tableExists(client, 'sst_perfil_restringido'))) {
      throw new Error('La tabla sst_perfil_restringido no existe. SST-2.2 debe estar aplicada antes de SST-3.');
    }

    const columnsBefore = await loadColumns(client, 'sst_perfil_restringido');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const columnsAfter = await loadColumns(client, 'sst_perfil_restringido');
    const postCounts = Object.fromEntries(
      await Promise.all(
        REQUIRED_BASELINES.map(async (tableName) => [tableName, await queryCount(client, tableName)])
      )
    );

    const requiredColumns = [
      'tiene_discapacidad',
      'tipo_discapacidad',
      'presenta_alergias',
      'medicamentos_permanentes',
      'enfermedad'
    ];
    const missingColumns = requiredColumns.filter(
      (columnName) => !columnsAfter.some((column) => column.column_name === columnName)
    );

    if (missingColumns.length > 0) {
      throw new Error(`Columnas restringidas faltantes despues de la migracion: ${missingColumns.join(', ')}`);
    }

    const report = {
      executed_at: new Date().toISOString(),
      sql_file: SQL_FILE,
      baseline,
      post_counts: postCounts,
      columns_before: columnsBefore,
      columns_after: columnsAfter,
      missing_columns: missingColumns
    };

    await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`SST-3 migration completed successfully. Report: ${REPORT_FILE}`);
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('SST-3 migration failed.');
  console.error(error);
  process.exitCode = 1;
});
