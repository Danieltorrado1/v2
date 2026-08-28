import dotenv from 'dotenv';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';

const envFileArgument = process.argv.find((argument) => argument.startsWith('--env-file='));
const envFile = envFileArgument?.slice('--env-file='.length);

dotenv.config(envFile ? { path: envFile } : undefined);

const ROLE_NAMES = ['ADMINISTRADOR', 'GESTOR', 'NOMINA', 'TALENTO_HUMANO'] as const;
const OPERATIONAL_ROLE_NAMES = ['ADMINISTRADOR', 'GESTOR', 'TALENTO_HUMANO'] as const;
const ECONOMIC_ROLE_NAMES = ['ADMINISTRADOR', 'NOMINA', 'TALENTO_HUMANO'] as const;
const PERMISSIONS = [
  ['nomina.operativa', 'read', 'Consultar contexto operativo de cobertura'],
  ['nomina', 'read', 'Consultar procesos, periodos y personal de nomina'],
  ['nomina.periodos', 'update', 'Registrar la operacion de un periodo abierto'],
  ['nomina.periodos', 'close', 'Cerrar la operacion cuando las reglas lo permitan'],
  ['nomina.periodos', 'reopen', 'Reabrir la operacion con auditoria'],
  ['nomina.novedades', 'create', 'Registrar novedades operativas'],
  ['nomina.novedades', 'update', 'Editar novedades operativas'],
  ['nomina.novedades', 'deactivate', 'Anular novedades operativas'],
] as const;
const ECONOMIC_PERMISSION = ['nomina.economico', 'read', 'Consultar información económica de nómina'] as const;
const GESTOR_FORBIDDEN_PERMISSIONS = [
  'nomina.economico.read',
  'nomina.periodos.close',
  'nomina.periodos.reopen'
] as const;

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const roles = await client.query<{ id: string; nombre_rol: string }>(
      `SELECT id::text AS id, nombre_rol FROM roles WHERE nombre_rol = ANY($1::text[])`,
      [ROLE_NAMES]
    );
    if (roles.rows.length !== ROLE_NAMES.length) {
      throw new Error('Required ADMINISTRADOR, GESTOR, NOMINA and TALENTO_HUMANO roles must exist');
    }

    const roleIds = new Map(roles.rows.map((role) => [role.nombre_rol, role.id]));
    const permissionIds: string[] = [];
    for (const [modulo, accion, descripcion] of PERMISSIONS) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO permisos (modulo, accion, descripcion, activo)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (modulo, accion) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = TRUE
         RETURNING id::text AS id`,
        [modulo, accion, descripcion]
      );
      const permission = result.rows[0];
      if (!permission) throw new Error(`Failed to seed permission ${modulo}.${accion}`);
      permissionIds.push(permission.id);
    }

    for (const roleName of OPERATIONAL_ROLE_NAMES) {
      const roleId = roleIds.get(roleName);
      for (const permissionId of permissionIds) {
        await client.query(
          `INSERT INTO rol_permisos (rol_id, permiso_id, activo) VALUES ($1::bigint, $2::bigint, TRUE)
           ON CONFLICT (rol_id, permiso_id) DO UPDATE SET activo = TRUE`,
          [roleId, permissionId]
        );
      }
    }
    const economicPermission = await client.query<{ id: string }>(
      `INSERT INTO permisos (modulo, accion, descripcion, activo)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (modulo, accion) DO UPDATE SET descripcion = EXCLUDED.descripcion, activo = TRUE
       RETURNING id::text AS id`,
      [...ECONOMIC_PERMISSION]
    );
    for (const roleName of ECONOMIC_ROLE_NAMES) {
      const roleId = roleIds.get(roleName);
      if (!roleId) throw new Error(`Required role ${roleName} was not loaded`);
      await client.query(
        `INSERT INTO rol_permisos (rol_id, permiso_id, activo) VALUES ($1::bigint, $2::bigint, TRUE)
         ON CONFLICT (rol_id, permiso_id) DO UPDATE SET activo = TRUE`,
        [roleId, economicPermission.rows[0]?.id]
      );
    }
    const nominaRoleId = roleIds.get('NOMINA');
    const nominaReadPermissionId = permissionIds[1];
    if (!nominaRoleId || !nominaReadPermissionId) {
      throw new Error('NOMINA role and nomina.read permission must exist');
    }
    await client.query(
      `INSERT INTO rol_permisos (rol_id, permiso_id, activo) VALUES ($1::bigint, $2::bigint, TRUE)
       ON CONFLICT (rol_id, permiso_id) DO UPDATE SET activo = TRUE`,
      [nominaRoleId, nominaReadPermissionId]
    );
    const gestorId = roleIds.get('GESTOR');
    if (gestorId) {
      await client.query(
        `UPDATE rol_permisos rp SET activo = FALSE
         FROM permisos p
         WHERE rp.permiso_id = p.id AND rp.rol_id = $1::bigint
           AND p.modulo || '.' || p.accion = ANY($2::text[])`,
        [gestorId, GESTOR_FORBIDDEN_PERMISSIONS]
      );
    }
    await client.query('COMMIT');
    console.log('ADMIN-2E operational and economic permissions seeded.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('ADMIN-2E operational permissions seed failed.');
  console.error(error);
  process.exitCode = 1;
});
