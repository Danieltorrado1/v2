import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config(process.env.ENV_FILE?.trim() ? { path: process.env.ENV_FILE.trim() } : undefined);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const INDEX_NAMES = [
  'idx_nomina_categoria_salarial_contrato_vigencia',
  'uq_nomina_desprendibles_vigente',
  'idx_nomina_parametros_empresa_fecha'
];

const main = async (): Promise<void> => {
  const result = await pool.query(
    `
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname
    `,
    [INDEX_NAMES]
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
