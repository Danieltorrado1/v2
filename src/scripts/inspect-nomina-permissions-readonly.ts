import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config(process.env.ENV_FILE?.trim() ? { path: process.env.ENV_FILE.trim() } : undefined);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TARGET_PERMISSIONS = [
  'nomina.economico.read',
  'nomina.desprendibles.read',
  'nomina.desprendibles.generate',
  'nomina.periodos.update',
  'nomina.periodos.close',
  'nomina.periodos.reopen'
];

const main = async (): Promise<void> => {
  const result = await pool.query(
    `
      WITH permisos_objetivo AS (
        SELECT UNNEST($1::text[]) AS permiso
      )
      SELECT
        r.nombre_rol,
        po.permiso,
        EXISTS (
          SELECT 1
          FROM rol_permisos rp
          JOIN permisos p ON p.id = rp.permiso_id
          WHERE rp.rol_id = r.id
            AND COALESCE(rp.activo, TRUE) = TRUE
            AND COALESCE(p.activo, TRUE) = TRUE
            AND CONCAT(p.modulo, '.', p.accion) = po.permiso
        ) AS asignado
      FROM roles r
      CROSS JOIN permisos_objetivo po
      WHERE COALESCE(r.activo, TRUE) = TRUE
        AND r.nombre_rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO')
      ORDER BY r.nombre_rol, po.permiso
    `,
    [TARGET_PERMISSIONS]
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
