import dotenv from 'dotenv';
import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

dotenv.config();

interface PermisoRow extends QueryResultRow {
  accion: string;
  id: string;
  modulo: string;
}

interface RolRow extends QueryResultRow {
  id: string;
}

const PERMISOS = [
  {
    modulo: 'tenant.access',
    accion: 'read',
    descripcion: 'Permiso base para tenant.access.read'
  },
  {
    modulo: 'tenant.access',
    accion: 'update',
    descripcion: 'Permiso base para tenant.access.update'
  }
] as const;

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const shouldUseSsl =
    databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.');

  return new Pool({
    connectionString: databaseUrl,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
  });
};

const ensureAdminRole = async (client: PoolClient): Promise<string> => {
  const result = await client.query<RolRow>(
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

const ensurePermissions = async (client: PoolClient): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();

  for (const permiso of PERMISOS) {
    const result = await client.query<PermisoRow>(
      `
        INSERT INTO permisos (modulo, accion, descripcion, activo)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (modulo, accion)
        DO UPDATE
        SET
          descripcion = EXCLUDED.descripcion,
          activo = TRUE
        RETURNING id::text AS id, modulo, accion
      `,
      [permiso.modulo, permiso.accion, permiso.descripcion]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(`Failed to seed permission ${permiso.modulo}.${permiso.accion}`);
    }

    ids.set(`${row.modulo}.${row.accion}`, row.id);
  }

  return ids;
};

const assignPermissionsToRole = async (
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
        DO UPDATE
        SET activo = TRUE
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

    const roleId = await ensureAdminRole(client);
    const permissions = await ensurePermissions(client);
    await assignPermissionsToRole(client, roleId, permissions.values());

    await client.query('COMMIT');

    console.log('Tenant access permissions seeded successfully.');
    console.log(`Role ID: ${roleId}`);
    console.log(`Permissions: ${Array.from(permissions.keys()).join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Tenant access permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
