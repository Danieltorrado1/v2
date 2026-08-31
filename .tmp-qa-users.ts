import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: process.env.ENV_FILE?.trim() || '.env.qa' });

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
        COALESCE(u.activo, TRUE) AS activo,
        COALESCE(
          ARRAY(
            SELECT DISTINCT r.nombre_rol
            FROM usuario_roles ur
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(r.activo, TRUE) = TRUE
            ORDER BY r.nombre_rol
          ),
          ARRAY[]::text[]
        ) AS roles
      FROM usuarios u
      ORDER BY u.correo
    `,
  );
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
}

void main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
