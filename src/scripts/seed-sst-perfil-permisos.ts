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
  { modulo: 'sst.perfil', accion: 'ver', descripcion: 'Permiso para consultar perfil sociodemografico SST.' },
  { modulo: 'sst.perfil', accion: 'crear', descripcion: 'Permiso para crear perfil sociodemografico SST.' },
  { modulo: 'sst.perfil', accion: 'editar', descripcion: 'Permiso para editar perfil sociodemografico SST.' },
  { modulo: 'sst.perfil', accion: 'importar', descripcion: 'Permiso para preparar y validar importaciones SST.' },
  { modulo: 'sst.perfil', accion: 'aplicar', descripcion: 'Permiso para aplicar importaciones SST.' },
  { modulo: 'sst.perfil', accion: 'exportar', descripcion: 'Permiso para exportar perfil sociodemografico SST.' }
] as const;

const ROLE_ASSIGNMENTS: Record<string, string[]> = {
  ADMINISTRADOR: PERMISSIONS.map((permission) => `${permission.modulo}.${permission.accion}`),
  SST: PERMISSIONS.map((permission) => `${permission.modulo}.${permission.accion}`),
  TALENTO_HUMANO: ['sst.perfil.ver', 'sst.perfil.importar']
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
      throw new Error(`No se pudo sembrar ${permission.modulo}.${permission.accion}`);
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
      throw new Error(`Permiso no sembrado: ${permissionKey}`);
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
    console.log('SST perfil permissions seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('SST perfil permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
