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
        u.id::text AS usuario_id,
        u.nombre_completo,
        u.correo,
        ARRAY_AGG(DISTINCT r.nombre_rol ORDER BY r.nombre_rol) AS roles,
        (
          UPPER(COALESCE(u.nombre_completo, '')) ~ 'QA|TEST|ZZ_|PRUEBA|DEMO|MOCK'
          OR UPPER(COALESCE(u.correo, '')) ~ 'QA|TEST|ZZ_|PRUEBA|DEMO|MOCK'
        ) AS parece_qa
      FROM usuarios u
      JOIN usuario_roles ur ON ur.usuario_id = u.id AND COALESCE(ur.activo, TRUE) = TRUE
      JOIN roles r ON r.id = ur.rol_id AND COALESCE(r.activo, TRUE) = TRUE
      WHERE COALESCE(u.activo, TRUE) = TRUE
        AND r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
      GROUP BY u.id, u.nombre_completo, u.correo
      ORDER BY u.id ASC
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
