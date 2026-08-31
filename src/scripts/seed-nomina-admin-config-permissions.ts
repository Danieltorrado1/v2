import dotenv from 'dotenv';
import { Pool } from 'pg';

const envFileArgument = process.argv.find((argument) => argument.startsWith('--env-file='));
const envFile = envFileArgument?.slice('--env-file='.length);

dotenv.config(envFile ? { path: envFile } : undefined);

const ROLE_NAME = 'ADMINISTRADOR';
const REQUIRED_PERMISSIONS = [
  ['nomina.economico', 'read', 'Consultar información económica de nómina'],
  ['nomina.parametros', 'manage', 'Gestionar vigencias y parámetros económicos de nómina'],
  ['nomina.categorias', 'manage', 'Gestionar categorías salariales y sus vigencias']
] as const;

type RoleRow = {
  id: string;
};

type PermissionRow = {
  id: string;
  permiso: string;
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roleResult = await client.query<RoleRow>(
      `SELECT id::text AS id FROM roles WHERE nombre_rol = $1 LIMIT 1`,
      [ROLE_NAME]
    );
    const role = roleResult.rows[0];

    if (!role) {
      throw new Error(`Required role ${ROLE_NAME} was not found`);
    }

    const beforeResult = await client.query<PermissionRow>(
      `
        SELECT
          p.id::text AS id,
          CONCAT_WS('.', p.modulo, p.accion) AS permiso
        FROM rol_permisos rp
        INNER JOIN permisos p ON p.id = rp.permiso_id
        WHERE rp.rol_id = $1::bigint
          AND COALESCE(rp.activo, TRUE) = TRUE
          AND COALESCE(p.activo, TRUE) = TRUE
          AND CONCAT_WS('.', p.modulo, p.accion) = ANY($2::text[])
        ORDER BY permiso
      `,
      [role.id, REQUIRED_PERMISSIONS.map(([module, action]) => `${module}.${action}`)]
    );

    for (const [module, action, description] of REQUIRED_PERMISSIONS) {
      const permissionResult = await client.query<{ id: string }>(
        `
          INSERT INTO permisos (modulo, accion, descripcion, activo)
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (modulo, accion)
          DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = TRUE
          RETURNING id::text AS id
        `,
        [module, action, description]
      );
      const permission = permissionResult.rows[0];

      if (!permission) {
        throw new Error(`Failed to upsert permission ${module}.${action}`);
      }

      await client.query(
        `
          INSERT INTO rol_permisos (rol_id, permiso_id, activo)
          VALUES ($1::bigint, $2::bigint, TRUE)
          ON CONFLICT (rol_id, permiso_id)
          DO UPDATE SET activo = TRUE
        `,
        [role.id, permission.id]
      );
    }

    const afterResult = await client.query<PermissionRow>(
      `
        SELECT
          p.id::text AS id,
          CONCAT_WS('.', p.modulo, p.accion) AS permiso
        FROM rol_permisos rp
        INNER JOIN permisos p ON p.id = rp.permiso_id
        WHERE rp.rol_id = $1::bigint
          AND COALESCE(rp.activo, TRUE) = TRUE
          AND COALESCE(p.activo, TRUE) = TRUE
          AND CONCAT_WS('.', p.modulo, p.accion) = ANY($2::text[])
        ORDER BY permiso
      `,
      [role.id, REQUIRED_PERMISSIONS.map(([module, action]) => `${module}.${action}`)]
    );

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          role: ROLE_NAME,
          before: beforeResult.rows.map((row) => row.permiso),
          after: afterResult.rows.map((row) => row.permiso)
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('Nomina admin config permission seed failed.');
  console.error(error);
  process.exitCode = 1;
});
