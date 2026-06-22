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
    modulo: 'sst.capacitaciones',
    accion: 'read',
    descripcion: 'Permiso base para sst.capacitaciones.read'
  },
  {
    modulo: 'sst.capacitaciones',
    accion: 'write',
    descripcion: 'Permiso base para sst.capacitaciones.write'
  },
  {
    modulo: 'sst.dashboard',
    accion: 'read',
    descripcion: 'Permiso base para sst.dashboard.read'
  },
  {
    modulo: 'sst.alertas',
    accion: 'read',
    descripcion: 'Permiso base para sst.alertas.read'
  },
  {
    modulo: 'sst.dotacion_epp',
    accion: 'read',
    descripcion: 'Permiso base para sst.dotacion_epp.read'
  },
  {
    modulo: 'sst.dotacion_epp',
    accion: 'write',
    descripcion: 'Permiso base para sst.dotacion_epp.write'
  },
  {
    modulo: 'sst.dotacion_epp',
    accion: 'dashboard',
    descripcion: 'Permiso base para sst.dotacion_epp.dashboard'
  },
  {
    modulo: 'sst.dotacion_epp',
    accion: 'alertas',
    descripcion: 'Permiso base para sst.dotacion_epp.alertas'
  },
  {
    modulo: 'sst.examenes',
    accion: 'read',
    descripcion: 'Permiso base para sst.examenes.read'
  },
  {
    modulo: 'sst.examenes',
    accion: 'write',
    descripcion: 'Permiso base para sst.examenes.write'
  },
  {
    modulo: 'sst.examenes',
    accion: 'dashboard',
    descripcion: 'Permiso base para sst.examenes.dashboard'
  },
  {
    modulo: 'sst.examenes',
    accion: 'alertas',
    descripcion: 'Permiso base para sst.examenes.alertas'
  },
  {
    modulo: 'sst.accidentes',
    accion: 'read',
    descripcion: 'Permiso base para sst.accidentes.read'
  },
  {
    modulo: 'sst.accidentes',
    accion: 'write',
    descripcion: 'Permiso base para sst.accidentes.write'
  },
  {
    modulo: 'sst.accidentes',
    accion: 'dashboard',
    descripcion: 'Permiso base para sst.accidentes.dashboard'
  },
  {
    modulo: 'sst.accidentes',
    accion: 'alertas',
    descripcion: 'Permiso base para sst.accidentes.alertas'
  },
  {
    modulo: 'sst.inspecciones',
    accion: 'read',
    descripcion: 'Permiso base para sst.inspecciones.read'
  },
  {
    modulo: 'sst.inspecciones',
    accion: 'write',
    descripcion: 'Permiso base para sst.inspecciones.write'
  },
  {
    modulo: 'sst.inspecciones',
    accion: 'dashboard',
    descripcion: 'Permiso base para sst.inspecciones.dashboard'
  },
  {
    modulo: 'sst.inspecciones',
    accion: 'alertas',
    descripcion: 'Permiso base para sst.inspecciones.alertas'
  },
  {
    modulo: 'sst.riesgos',
    accion: 'read',
    descripcion: 'Permiso base para sst.riesgos.read'
  },
  {
    modulo: 'sst.riesgos',
    accion: 'write',
    descripcion: 'Permiso base para sst.riesgos.write'
  },
  {
    modulo: 'sst.riesgos',
    accion: 'dashboard',
    descripcion: 'Permiso base para sst.riesgos.dashboard'
  },
  {
    modulo: 'sst.riesgos',
    accion: 'alertas',
    descripcion: 'Permiso base para sst.riesgos.alertas'
  },
  {
    modulo: 'sst.dashboard_general',
    accion: 'read',
    descripcion: 'Permiso base para sst.dashboard_general.read'
  },
  {
    modulo: 'sst.indicadores',
    accion: 'read',
    descripcion: 'Permiso base para sst.indicadores.read'
  },
  {
    modulo: 'sst.indicadores',
    accion: 'write',
    descripcion: 'Permiso base para sst.indicadores.write'
  },
  {
    modulo: 'sst.indicadores',
    accion: 'calculate',
    descripcion: 'Permiso base para sst.indicadores.calculate'
  },
  {
    modulo: 'sst.plan',
    accion: 'read',
    descripcion: 'Permiso base para sst.plan.read'
  },
  {
    modulo: 'sst.plan',
    accion: 'write',
    descripcion: 'Permiso base para sst.plan.write'
  },
  {
    modulo: 'sst.plan',
    accion: 'dashboard',
    descripcion: 'Permiso base para sst.plan.dashboard'
  },
  {
    modulo: 'sst.plan',
    accion: 'alertas',
    descripcion: 'Permiso base para sst.plan.alertas'
  }
] as const;

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

    console.log('SST permissions seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('SST permissions seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
