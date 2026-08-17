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
  nombre_rol: string;
}

const PERMISOS = [
  ['empresas', 'read', 'Permiso para consultar empresas autorizadas en el flujo operativo'],
  ['cargos', 'read', 'Permiso para consultar cargos autorizados en el flujo operativo'],
  ['catalogos', 'read', 'Permiso para consultar catalogos del flujo operativo'],
  ['personas', 'read', 'Permiso para consultar personas del flujo operativo'],
  ['personas', 'create', 'Permiso para crear personas en el flujo operativo'],
  ['personas', 'update', 'Permiso para actualizar personas e identificaciones en el flujo operativo'],
  ['vinculaciones', 'read', 'Permiso para consultar vinculaciones del flujo operativo'],
  ['vinculaciones', 'create', 'Permiso para crear vinculaciones del flujo operativo'],
  ['documentos', 'read', 'Permiso para consultar documentos del flujo operativo'],
  ['documentos', 'upload', 'Permiso para cargar documentos del flujo operativo'],
  ['documentos', 'download', 'Permiso para descargar documentos del flujo operativo'],
  ['documentos', 'update', 'Permiso para actualizar metadatos documentales del flujo operativo']
] as const;

const ROLE_ASSIGNMENTS: Record<string, string[]> = {
  ADMINISTRADOR: PERMISOS.map(([modulo, accion]) => `${modulo}.${accion}`),
  TALENTO_HUMANO: PERMISOS.map(([modulo, accion]) => `${modulo}.${accion}`)
};

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const shouldUseSsl = databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.');

  return new Pool({
    connectionString: databaseUrl,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
  });
};

const ensureRoles = async (client: PoolClient): Promise<Map<string, string>> => {
  const result = await client.query<RolRow>(
    `
      SELECT id::text AS id, nombre_rol
      FROM roles
      WHERE nombre_rol = ANY($1::text[])
    `,
    [Object.keys(ROLE_ASSIGNMENTS)]
  );

  const roles = new Map<string, string>();

  for (const row of result.rows) {
    roles.set(row.nombre_rol, row.id);
  }

  if (!roles.has('ADMINISTRADOR')) {
    throw new Error('ADMINISTRADOR role not found');
  }

  if (!roles.has('TALENTO_HUMANO')) {
    throw new Error('TALENTO_HUMANO role not found');
  }

  return roles;
};

const ensurePermissions = async (client: PoolClient): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();

  for (const [modulo, accion, descripcion] of PERMISOS) {
    const result = await client.query<PermisoRow>(
      `
        INSERT INTO permisos (modulo, accion, descripcion, activo)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (modulo, accion)
        DO UPDATE
        SET descripcion = EXCLUDED.descripcion,
            activo = TRUE
        RETURNING id::text AS id, modulo, accion
      `,
      [modulo, accion, descripcion]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(`Failed to seed permission ${modulo}.${accion}`);
    }

    ids.set(`${row.modulo}.${row.accion}`, row.id);
  }

  return ids;
};

const assignPermissionsToRole = async (
  client: PoolClient,
  roleId: string,
  permissionCodes: string[],
  permissionIds: Map<string, string>
): Promise<void> => {
  for (const permissionCode of permissionCodes) {
    const permissionId = permissionIds.get(permissionCode);

    if (!permissionId) {
      throw new Error(`Permission ${permissionCode} was not created`);
    }

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

    const roles = await ensureRoles(client);
    const permissions = await ensurePermissions(client);

    for (const [roleName, permissionCodes] of Object.entries(ROLE_ASSIGNMENTS)) {
      const roleId = roles.get(roleName);

      if (!roleId) {
        continue;
      }

      await assignPermissionsToRole(client, roleId, permissionCodes, permissions);
    }

    await client.query('COMMIT');

    console.log('Personal operativo permissions seeded successfully.');
    for (const [roleName, permissionCodes] of Object.entries(ROLE_ASSIGNMENTS)) {
      console.log(`${roleName}: ${permissionCodes.join(', ')}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Personal operativo permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
