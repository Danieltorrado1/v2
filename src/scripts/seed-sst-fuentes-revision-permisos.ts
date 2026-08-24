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
  nombre_rol: string;
}

const PERMISSIONS = [
  ['sst.revision', 'ver', 'Permiso para consultar la cola de revision humana SST.'],
  ['sst.revision', 'resolver', 'Permiso para registrar decisiones tecnicas en conflictos SST.'],
  ['sst.restringido', 'ver', 'Permiso para consultar datos SST restringidos.'],
  ['formacion_academica', 'ver', 'Permiso para consultar la fuente maestra de formacion academica.'],
  ['formacion_academica', 'crear', 'Permiso para crear registros de formacion academica.'],
  ['formacion_academica', 'editar', 'Permiso para editar registros de formacion academica.']
] as const;

const ROLE_ASSIGNMENTS: Record<string, string[]> = {
  ADMINISTRADOR: PERMISSIONS.map(([modulo, accion]) => `${modulo}.${accion}`),
  SST: [
    'sst.revision.ver',
    'sst.revision.resolver',
    'sst.restringido.ver',
    'formacion_academica.ver',
    'formacion_academica.crear',
    'formacion_academica.editar'
  ],
  TALENTO_HUMANO: [
    'sst.revision.ver',
    'formacion_academica.ver'
  ]
};

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });
};

const loadRoles = async (client: PoolClient): Promise<Map<string, string>> => {
  const result = await client.query<RoleRow>(
    `
      SELECT id::text AS id, nombre_rol
      FROM roles
      WHERE nombre_rol = ANY($1::text[])
    `,
    [Object.keys(ROLE_ASSIGNMENTS)]
  );

  return new Map(result.rows.map((row) => [row.nombre_rol, row.id]));
};

const seedPermissions = async (client: PoolClient): Promise<Map<string, string>> => {
  const map = new Map<string, string>();

  for (const [modulo, accion, descripcion] of PERMISSIONS) {
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
      [modulo, accion, descripcion]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`No se pudo sembrar ${modulo}.${accion}`);
    }

    map.set(`${row.modulo}.${row.accion}`, row.id);
  }

  return map;
};

const assignPermissions = async (
  client: PoolClient,
  roleId: string,
  permissionKeys: string[],
  permissionMap: Map<string, string>
): Promise<void> => {
  for (const permissionKey of permissionKeys) {
    const permissionId = permissionMap.get(permissionKey);
    if (!permissionId) {
      throw new Error(`Permiso no encontrado: ${permissionKey}`);
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

    const roles = await loadRoles(client);
    const permissionMap = await seedPermissions(client);

    for (const [roleName, permissions] of Object.entries(ROLE_ASSIGNMENTS)) {
      const roleId = roles.get(roleName);
      if (!roleId) {
        continue;
      }

      await assignPermissions(client, roleId, permissions, permissionMap);
    }

    await client.query('COMMIT');
    console.log('SST fuente maestra/revision permissions seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('SST fuente maestra/revision permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
