import dotenv from 'dotenv';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';

dotenv.config();

interface PermissionRow {
  accion: string;
  id: string;
  modulo: string;
}

interface RoleRow {
  id: string;
}

const PERMISSIONS = [
  {
    modulo: 'nomina.prima',
    accion: 'read',
    descripcion: 'Permiso base para nomina.prima.read'
  },
  {
    modulo: 'nomina.prima',
    accion: 'write',
    descripcion: 'Permiso base para nomina.prima.write'
  },
  {
    modulo: 'nomina.prima',
    accion: 'dashboard',
    descripcion: 'Permiso base para nomina.prima.dashboard'
  },
  {
    modulo: 'nomina.prima',
    accion: 'alertas',
    descripcion: 'Permiso base para nomina.prima.alertas'
  }
] as const;

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });
};

const loadAdminRoleId = async (client: PoolClient): Promise<string> => {
  const result = await client.query<RoleRow>(
    `
      SELECT id::text AS id
      FROM roles
      WHERE nombre_rol = 'ADMINISTRADOR'
      LIMIT 1
    `
  );

  const role = result.rows[0];
  if (!role) {
    throw new Error('ADMINISTRADOR role not found');
  }

  return role.id;
};

const seedPermissions = async (client: PoolClient): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();

  for (const permission of PERMISSIONS) {
    const result = await client.query<PermissionRow>(
      `
        INSERT INTO permisos (modulo, accion, descripcion, activo)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (modulo, accion)
        DO UPDATE SET
          descripcion = EXCLUDED.descripcion,
          activo = TRUE
        RETURNING id::text AS id, modulo, accion
      `,
      [permission.modulo, permission.accion, permission.descripcion]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Failed to seed permission ${permission.modulo}.${permission.accion}`);
    }

    ids.set(`${row.modulo}.${row.accion}`, row.id);
  }

  return ids;
};

const assignPermissions = async (
  client: PoolClient,
  roleId: string,
  permissionIds: Iterable<string>
): Promise<void> => {
  for (const permissionId of permissionIds) {
    await client.query(
      `
        INSERT INTO rol_permisos (rol_id, permiso_id, activo)
        VALUES ($1::bigint, $2::bigint, TRUE)
        ON CONFLICT (rol_id, permiso_id)
        DO UPDATE SET activo = TRUE
      `,
      [roleId, permissionId]
    );
  }
};

const main = async (): Promise<void> => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const roleId = await loadAdminRoleId(client);
    const permissions = await seedPermissions(client);
    await assignPermissions(client, roleId, permissions.values());
    await client.query('COMMIT');

    console.log('Nomina prima permissions seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Nomina prima permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
