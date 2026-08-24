import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

dotenv.config();

const SQL_FILE = path.resolve('sql/phase-sst-2-2-fuentes-maestras-revision.sql');
const REPORT_FILE = path.resolve('reports/sst-phase-2-2-migration-report.json');

const REQUIRED_BASELINES = [
  'personas',
  'vinculaciones',
  'cobertura_asignaciones',
  'focalizacion_final',
  'focalizacion_vigencias',
  'sst_perfil_demografico',
  'sst_perfil_demografico_versiones'
] as const;

const TARGET_TABLES = [
  'persona_formacion_academica',
  'sst_preparacion_personas',
  'sst_revision_casos',
  'sst_perfil_restringido'
] as const;

const REQUIRED_DEPENDENCIES = [
  'personas',
  'vinculaciones',
  'empresas',
  'contratos',
  'usuarios',
  'documentos_persona',
  'importacion_lotes'
] as const;

type TableName = (typeof TARGET_TABLES)[number];
type BaselineTable = (typeof REQUIRED_BASELINES)[number];

interface TableExistsRow extends QueryResultRow {
  exists: boolean;
}

interface CountRow extends QueryResultRow {
  total: string;
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

    const baseline: Record<BaselineTable, number> = {} as Record<BaselineTable, number>;
    for (const tableName of REQUIRED_BASELINES) {
      baseline[tableName] = await queryCount(client, tableName);
    }

    const dependencies: Record<string, boolean> = {};
    for (const dependency of REQUIRED_DEPENDENCIES) {
      dependencies[dependency] = await tableExists(client, dependency);
    }

    const missingDependencies = Object.entries(dependencies)
      .filter(([, exists]) => !exists)
      .map(([tableName]) => tableName);

    if (missingDependencies.length > 0) {
      throw new Error(`Dependencias faltantes: ${missingDependencies.join(', ')}`);
    }

    const existedBefore: Record<TableName, boolean> = {} as Record<TableName, boolean>;
    for (const tableName of TARGET_TABLES) {
      existedBefore[tableName] = await tableExists(client, tableName);
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const existedAfter: Record<TableName, boolean> = {} as Record<TableName, boolean>;
    const postCounts: Record<string, number> = {};
    const columns: Record<string, ColumnRow[]> = {};

    for (const tableName of TARGET_TABLES) {
      existedAfter[tableName] = await tableExists(client, tableName);
      postCounts[tableName] = existedAfter[tableName] ? await queryCount(client, tableName) : -1;
      columns[tableName] = existedAfter[tableName] ? await loadColumns(client, tableName) : [];
    }

    const report = {
      executed_at: new Date().toISOString(),
      sql_file: SQL_FILE,
      baseline,
      dependencies,
      existed_before: existedBefore,
      existed_after: existedAfter,
      post_counts: postCounts,
      columns
    };

    await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`SST-2.2 migration completed successfully. Report: ${REPORT_FILE}`);
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('SST-2.2 migration failed.');
  console.error(error);
  process.exitCode = 1;
});
