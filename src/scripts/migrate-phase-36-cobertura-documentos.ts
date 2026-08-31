import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

dotenv.config();

const SQL_FILE = path.resolve(process.cwd(), 'sql', 'phase-36-cobertura-documentos.sql');

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = await readFile(SQL_FILE, 'utf8');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const columns = await pool.query<{ table_name: string; column_name: string }>(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'nomina_novedad_documentos' AND column_name = 'tipo_relacion')
            OR (table_name = 'nomina_tipos_novedad' AND column_name = 'requiere_solicitud_permiso')
          )
        ORDER BY table_name, column_name
      `
    );

    const indexes = await pool.query<{ indexname: string; indexdef: string }>(
      `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'nomina_novedad_documentos'
          AND indexname = 'ux_nomina_novedad_documento_tipo_activo'
      `
    );

    console.log(
      JSON.stringify(
        {
          migration: 'phase-36-cobertura-documentos.sql',
          applied: true,
          checks: {
            columns: columns.rows,
            unique_index: indexes.rows[0] ?? null,
          },
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
