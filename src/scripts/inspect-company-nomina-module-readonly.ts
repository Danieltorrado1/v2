import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config(process.env.ENV_FILE?.trim() ? { path: process.env.ENV_FILE.trim() } : undefined);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const main = async (): Promise<void> => {
  const result = await pool.query(
    `
      SELECT
        e.id::text AS empresa_id,
        e.nombre_empresa,
        m.codigo AS modulo_codigo,
        emc.estado,
        emc.observaciones,
        emc.updated_at
      FROM empresas e
      JOIN modulos m ON m.codigo = 'NOMINA'
      LEFT JOIN empresa_modulo_configuracion emc
        ON emc.empresa_id = e.id
       AND emc.modulo_id = m.id
      WHERE COALESCE(e.activo, TRUE) = TRUE
      ORDER BY e.id ASC
    `
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
