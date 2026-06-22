import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient, QueryResultRow } from 'pg';

dotenv.config();

const ADMIN_EMAIL = 'admin@empiria.local';
const ADMIN_PASSWORD = 'Admin123456*';
const ADMIN_NAME = 'Administrador Empiria';
const ADMIN_ROLE_NAME = 'ADMINISTRADOR';
const ADMIN_ROLE_DESCRIPTION = 'Acceso total al sistema';
const AUTH_INSTANCE_ID = '00000000-0000-0000-0000-000000000000';
const BCRYPT_SALT_ROUNDS = 10;

interface RoleRow extends QueryResultRow {
  id: string;
}

interface PermissionRow extends QueryResultRow {
  accion: string;
  id: string;
  modulo: string;
}

interface AuthUserRow extends QueryResultRow {
  id: string;
}

interface PublicUserRow extends QueryResultRow {
  authUserId: string | null;
  id: string;
}

interface PermissionSeed {
  accion: string;
  code: string;
  descripcion: string;
  modulo: string;
}

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

const walkDirectory = (directoryPath: string): string[] => {
  const filePaths: string[] = [];

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...walkDirectory(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.routes.ts')) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
};

const buildPermissionDescription = (code: string): string => {
  return `Permiso base para ${code}`;
};

const parsePermissionCode = (code: string): PermissionSeed => {
  const segments = code.split('.');

  if (segments.length < 2) {
    throw new Error(`Invalid permission code: ${code}`);
  }

  const accion = segments[segments.length - 1];

  if (!accion) {
    throw new Error(`Permission action is missing for code: ${code}`);
  }

  const modulo = segments.slice(0, -1).join('.');

  return {
    code,
    modulo,
    accion,
    descripcion: buildPermissionDescription(code)
  };
};

const collectBasePermissions = (): PermissionSeed[] => {
  const modulesDirectory = path.resolve(process.cwd(), 'src', 'modules');
  const routeFiles = walkDirectory(modulesDirectory);
  const permissionCodes = new Set<string>();

  for (const routeFile of routeFiles) {
    const source = readFileSync(routeFile, 'utf8');
    const permissionCalls = source.matchAll(/requirePermissions\(([\s\S]*?)\)/g);

    for (const permissionCall of permissionCalls) {
      const args = permissionCall[1] ?? '';
      const permissions = args.matchAll(/'([^']+)'/g);

      for (const permission of permissions) {
        const code = permission[1];

        if (code) {
          permissionCodes.add(code);
        }
      }
    }
  }

  const seeds = [...permissionCodes]
    .sort((left, right) => left.localeCompare(right))
    .map(parsePermissionCode);

  if (seeds.length === 0) {
    throw new Error('No base permissions were found in route files');
  }

  return seeds;
};

const ensureAdminRole = async (client: PoolClient): Promise<string> => {
  const result = await client.query<RoleRow>(
    `
      INSERT INTO roles (nombre_rol, descripcion, activo)
      VALUES ($1, $2, TRUE)
      ON CONFLICT (nombre_rol)
      DO UPDATE
      SET
        descripcion = EXCLUDED.descripcion,
        activo = TRUE
      RETURNING id::text AS id
    `,
    [ADMIN_ROLE_NAME, ADMIN_ROLE_DESCRIPTION]
  );

  const role = result.rows[0];

  if (!role) {
    throw new Error('Failed to create or load ADMINISTRADOR role');
  }

  return role.id;
};

const ensurePermissions = async (
  client: PoolClient,
  permissions: PermissionSeed[]
): Promise<Map<string, string>> => {
  const permissionIds = new Map<string, string>();

  for (const permission of permissions) {
    const result = await client.query<PermissionRow>(
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
      [permission.modulo, permission.accion, permission.descripcion]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(`Failed to create or load permission ${permission.code}`);
    }

    permissionIds.set(`${row.modulo}.${row.accion}`, row.id);
  }

  return permissionIds;
};

const ensureRolePermissions = async (
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

const loadExistingAuthUserId = async (
  client: PoolClient,
  email: string
): Promise<string | null> => {
  const result = await client.query<AuthUserRow>(
    `
      SELECT id::text AS id
      FROM auth.users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0]?.id ?? null;
};

const ensureAuthIdentity = async (
  client: PoolClient,
  authUserId: string,
  email: string
): Promise<void> => {
  await client.query(
    `
      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $2::text,
        $3::jsonb,
        'email',
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (provider_id, provider)
      DO UPDATE
      SET
        identity_data = EXCLUDED.identity_data,
        updated_at = NOW()
    `,
    [
      randomUUID(),
      authUserId,
      JSON.stringify({
        sub: authUserId,
        email,
        email_verified: true,
        phone_verified: false
      })
    ]
  );
};

const ensureAuthUser = async (client: PoolClient): Promise<string> => {
  const existingAuthUserId = await loadExistingAuthUserId(client, ADMIN_EMAIL);

  if (existingAuthUserId) {
    await ensureAuthIdentity(client, existingAuthUserId, ADMIN_EMAIL);
    return existingAuthUserId;
  }

  const authUserId = randomUUID();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);

  await client.query(
    `
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'authenticated',
        'authenticated',
        $3,
        $4,
        NOW(),
        $5::jsonb,
        $6::jsonb,
        NOW(),
        NOW()
      )
    `,
    [
      AUTH_INSTANCE_ID,
      authUserId,
      ADMIN_EMAIL,
      passwordHash,
      JSON.stringify({
        provider: 'email',
        providers: ['email']
      }),
      JSON.stringify({
        name: ADMIN_NAME
      })
    ]
  );

  await ensureAuthIdentity(client, authUserId, ADMIN_EMAIL);

  return authUserId;
};

const ensurePublicUser = async (
  client: PoolClient,
  authUserId: string
): Promise<string> => {
  const existingUserResult = await client.query<PublicUserRow>(
    `
      SELECT
        id::text AS id,
        auth_user_id::text AS "authUserId"
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
         OR auth_user_id = $2::uuid
      ORDER BY id ASC
      LIMIT 1
    `,
    [ADMIN_EMAIL, authUserId]
  );

  const existingUser = existingUserResult.rows[0];

  if (existingUser) {
    const updatedUserResult = await client.query<PublicUserRow>(
      `
        UPDATE usuarios
        SET
          nombre_completo = $2,
          correo = $3,
          activo = TRUE,
          auth_user_id = $4::uuid
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          auth_user_id::text AS "authUserId"
      `,
      [existingUser.id, ADMIN_NAME, ADMIN_EMAIL, authUserId]
    );

    const updatedUser = updatedUserResult.rows[0];

    if (!updatedUser) {
      throw new Error('Failed to update admin user');
    }

    return updatedUser.id;
  }

  const createdUserResult = await client.query<PublicUserRow>(
    `
      INSERT INTO usuarios (nombre_completo, correo, telefono, activo, auth_user_id)
      VALUES ($1, $2, NULL, TRUE, $3::uuid)
      RETURNING
        id::text AS id,
        auth_user_id::text AS "authUserId"
    `,
    [ADMIN_NAME, ADMIN_EMAIL, authUserId]
  );

  const createdUser = createdUserResult.rows[0];

  if (!createdUser) {
    throw new Error('Failed to create admin user');
  }

  return createdUser.id;
};

const ensureUserRole = async (
  client: PoolClient,
  userId: string,
  roleId: string
): Promise<void> => {
  await client.query(
    `
      INSERT INTO usuario_roles (usuario_id, rol_id, activo)
      VALUES ($1::bigint, $2::bigint, TRUE)
      ON CONFLICT (usuario_id, rol_id)
      DO UPDATE
      SET activo = TRUE
    `,
    [userId, roleId]
  );
};

const main = async (): Promise<void> => {
  const permissions = collectBasePermissions();
  const pool = createPool();
  const client = await pool.connect();

  try {
    console.log(`Seeding ${permissions.length} base permissions...`);
    await client.query('BEGIN');

    const roleId = await ensureAdminRole(client);
    const permissionIds = await ensurePermissions(client, permissions);

    await ensureRolePermissions(client, roleId, permissionIds.values());

    const authUserId = await ensureAuthUser(client);
    const userId = await ensurePublicUser(client, authUserId);

    await ensureUserRole(client, userId, roleId);
    await client.query('COMMIT');

    console.log('Admin seed completed successfully.');
    console.log(`Role ID: ${roleId}`);
    console.log(`User ID: ${userId}`);
    console.log(`Auth User ID: ${authUserId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
