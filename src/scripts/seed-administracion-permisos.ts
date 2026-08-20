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
  ['configuracion', 'read', 'Permiso base para consultar configuracion administrativa'],
  ['catalogos', 'read', 'Permiso para consultar catalogos administrativos'],
  ['administracion', 'configuracion_calculadoras.read', 'Permiso para consultar configuraciones de calculadoras administrativas'],
  ['administracion', 'configuracion_calculadoras.create', 'Permiso para crear configuraciones de calculadoras administrativas'],
  ['administracion', 'configuracion_calculadoras.update', 'Permiso para actualizar configuraciones de calculadoras administrativas'],
  ['administracion', 'configuracion_calculadoras.deactivate', 'Permiso para desactivar configuraciones de calculadoras administrativas'],
  ['empresas', 'read', 'Permiso para consultar empresas'],
  ['empresas', 'create', 'Permiso para crear empresas'],
  ['empresas', 'update', 'Permiso para actualizar empresas y su estado'],
  ['contratos', 'read', 'Permiso para consultar contratos'],
  ['contratos', 'create', 'Permiso para crear contratos'],
  ['contratos', 'update', 'Permiso para actualizar contratos y su estado'],
  ['cargos', 'read', 'Permiso para consultar cargos por contrato'],
  ['cargos', 'create', 'Permiso para crear cargos por contrato'],
  ['cargos', 'update', 'Permiso para actualizar cargos por contrato y su estado'],
  ['usuarios', 'read', 'Permiso para consultar usuarios administrativos'],
  ['usuarios', 'update', 'Permiso para actualizar usuarios administrativos y su estado'],
  ['roles', 'read', 'Permiso para consultar roles'],
  ['permisos', 'read', 'Permiso para consultar permisos']
] as const;

const ensureAdminRole = async (client: PoolClient): Promise<string> => {
  const result = await client.query<RolRow>(`
    SELECT id::text AS id
    FROM roles
    WHERE nombre_rol = 'ADMINISTRADOR'
    LIMIT 1
  `);

  const row = result.rows[0];

  if (!row) {
    throw new Error('ADMINISTRADOR role not found');
  }

  return row.id;
};

const ensurePermissions = async (client: PoolClient): Promise<string[]> => {
  const ids: string[] = [];

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

    ids.push(row.id);
  }

  return ids;
};

const assignPermissionsToRole = async (client: PoolClient, roleId: string, permissionIds: string[]): Promise<void> => {
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
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const roleId = await ensureAdminRole(client);
    const permissionIds = await ensurePermissions(client);
    await assignPermissionsToRole(client, roleId, permissionIds);
    await client.query('COMMIT');
    console.log('Administracion permissions seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('Administracion permissions seed failed.');
  console.error(error);
  process.exitCode = 1;
});
