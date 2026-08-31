import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE?.trim() || '.env.qa' });

import { app } from './src/app.ts';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const result = await pool.query(
    `
      SELECT
        u.id::text AS id,
        u.correo,
        u.nombre_completo,
        COALESCE(u.activo, TRUE) AS activo
      FROM usuarios u
      WHERE u.id = 10
    `,
  );

  console.log(JSON.stringify({
    hasApp: Boolean(app),
    rowCount: result.rowCount,
    rows: result.rows,
  }, null, 2));

  await pool.end();
}

void main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
