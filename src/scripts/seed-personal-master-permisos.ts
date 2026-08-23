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
  ['persona', 'ver', 'Permiso granular para consultar la ficha maestra de persona'],
  ['persona', 'editar', 'Permiso granular para editar la ficha maestra de persona'],
  ['persona', 'editar_identidad', 'Permiso para editar identidad de la persona'],
  ['persona', 'editar_contacto', 'Permiso para editar contacto de la persona'],
  ['vinculacion', 'ver', 'Permiso granular para consultar vinculaciones desde expediente'],
  ['vinculacion', 'editar', 'Permiso granular para editar vinculaciones'],
  ['vinculacion', 'editar_cargo', 'Permiso para editar cargo o tipo de vinculacion'],
  ['vinculacion', 'editar_fechas', 'Permiso para editar fechas de vinculacion'],
  ['vinculacion', 'editar_estado', 'Permiso para editar estado de vinculacion'],
  ['bancario', 'ver', 'Permiso para consultar informacion bancaria enmascarada'],
  ['bancario', 'ver_numero_completo', 'Permiso para consultar el numero completo de cuenta bancaria'],
  ['bancario', 'editar', 'Permiso para registrar o actualizar informacion bancaria'],
  ['bancario', 'verificar', 'Permiso para verificar o rechazar informacion bancaria'],
  ['importaciones', 'preparar', 'Permiso para preparar dry-run de importaciones masivas'],
  ['importaciones', 'aplicar', 'Permiso para aplicar importaciones masivas confirmadas'],
  ['exportaciones', 'generar', 'Permiso para generar exportaciones configurables de personal']
] as const;

const ROLE_ASSIGNMENTS: Record<string, string[]> = {
  ADMINISTRADOR: PERMISOS.map(([modulo, accion]) => `${modulo}.${accion}`),
  TALENTO_HUMANO: [
    'persona.ver',
    'vinculacion.ver',
    'importaciones.preparar',
    'exportaciones.generar'
  ]
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

  return new Map(result.rows.map((row) => [row.nombre_rol, row.id]));
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
    console.log('Personal master permissions seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Personal master permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
