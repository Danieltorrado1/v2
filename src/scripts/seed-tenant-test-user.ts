import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

dotenv.config();

const TEST_EMAIL = 'operador.tenant@empiria.local';
const TEST_PASSWORD = 'Operador123456*';
const TEST_NAME = 'Operador Tenant Prueba';
const TEST_ROLE_NAME = 'OPERADOR_TENANT';
const AUTH_INSTANCE_ID = '00000000-0000-0000-0000-000000000000';
const BCRYPT_SALT_ROUNDS = 10;

interface AuthUserRow extends QueryResultRow {
  id: string;
}

interface PublicUserRow extends QueryResultRow {
  authUserId: string | null;
  id: string;
}

interface RoleRow extends QueryResultRow {
  id: string;
}

interface UsuarioRoleRow extends QueryResultRow {
  rol_id: string;
}

interface PermissionRow extends QueryResultRow {
  accion: string;
  id: string;
  modulo: string;
}

const REQUIRED_PERMISSIONS = [
  {
    accion: 'read',
    descripcion: 'Permiso base para vinculaciones.read',
    modulo: 'vinculaciones'
  },
  {
    accion: 'read',
    descripcion: 'Permiso base para documentos.read',
    modulo: 'documentos'
  },
  {
    accion: 'upload',
    descripcion: 'Permiso base para documentos.upload',
    modulo: 'documentos'
  },
  {
    accion: 'read',
    descripcion: 'Permiso base para plantillas.read',
    modulo: 'plantillas'
  },
  {
    accion: 'generate',
    descripcion: 'Permiso base para plantillas.generate',
    modulo: 'plantillas'
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

const ensurePermission = async (
  client: PoolClient,
  input: (typeof REQUIRED_PERMISSIONS)[number]
): Promise<PermissionRow> => {
  const result = await client.query<PermissionRow>(
    `
      INSERT INTO permisos (modulo, accion, descripcion, activo)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (modulo, accion)
      DO UPDATE
      SET
        descripcion = EXCLUDED.descripcion,
        activo = TRUE
      RETURNING
        id::text AS id,
        modulo,
        accion
    `,
    [input.modulo, input.accion, input.descripcion]
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(`Failed to ensure permission ${input.modulo}.${input.accion}`);
  }

  return row;
};

const ensureRole = async (client: PoolClient): Promise<string> => {
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
    [TEST_ROLE_NAME, 'Rol de prueba con acceso limitado por tenant']
  );

  const role = result.rows[0];

  if (!role) {
    throw new Error('Failed to ensure OPERADOR_TENANT role');
  }

  return role.id;
};

const ensureAdminRoleId = async (client: PoolClient): Promise<string | null> => {
  const result = await client.query<RoleRow>(
    `
      SELECT id::text AS id
      FROM roles
      WHERE nombre_rol = 'ADMINISTRADOR'
      LIMIT 1
    `
  );

  return result.rows[0]?.id ?? null;
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
  const existingAuthUserId = await loadExistingAuthUserId(client, TEST_EMAIL);

  if (existingAuthUserId) {
    await client.query(
      `
        UPDATE auth.users
        SET
          email = $2,
          encrypted_password = $3,
          raw_user_meta_data = $4::jsonb,
          updated_at = NOW()
        WHERE id::uuid = $1::uuid
      `,
      [
        existingAuthUserId,
        TEST_EMAIL,
        await bcrypt.hash(TEST_PASSWORD, BCRYPT_SALT_ROUNDS),
        JSON.stringify({
          name: TEST_NAME
        })
      ]
    );

    await ensureAuthIdentity(client, existingAuthUserId, TEST_EMAIL);
    return existingAuthUserId;
  }

  const authUserId = randomUUID();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_SALT_ROUNDS);

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
      TEST_EMAIL,
      passwordHash,
      JSON.stringify({
        provider: 'email',
        providers: ['email']
      }),
      JSON.stringify({
        name: TEST_NAME
      })
    ]
  );

  await ensureAuthIdentity(client, authUserId, TEST_EMAIL);
  return authUserId;
};

const ensurePublicUser = async (client: PoolClient, authUserId: string): Promise<string> => {
  const result = await client.query<PublicUserRow>(
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
    [TEST_EMAIL, authUserId]
  );

  const existing = result.rows[0];

  if (existing) {
    const updated = await client.query<PublicUserRow>(
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
      [existing.id, TEST_NAME, TEST_EMAIL, authUserId]
    );

    const updatedRow = updated.rows[0];

    if (!updatedRow) {
      throw new Error('Failed to update tenant test user');
    }

    return updatedRow.id;
  }

  const created = await client.query<PublicUserRow>(
    `
      INSERT INTO usuarios (
        nombre_completo,
        correo,
        telefono,
        activo,
        auth_user_id
      )
      VALUES ($1, $2, NULL, TRUE, $3::uuid)
      RETURNING
        id::text AS id,
        auth_user_id::text AS "authUserId"
    `,
    [TEST_NAME, TEST_EMAIL, authUserId]
  );

  const createdRow = created.rows[0];

  if (!createdRow) {
    throw new Error('Failed to create tenant test user');
  }

  return createdRow.id;
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

const ensureNoAdminRole = async (client: PoolClient, userId: string): Promise<void> => {
  const adminRoleId = await ensureAdminRoleId(client);

  if (!adminRoleId) {
    return;
  }

  const existing = await client.query<UsuarioRoleRow>(
    `
      SELECT rol_id::text AS rol_id
      FROM usuario_roles
      WHERE usuario_id::text = $1
        AND rol_id::text = $2
      LIMIT 1
    `,
    [userId, adminRoleId]
  );

  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE usuario_roles
        SET activo = FALSE
        WHERE usuario_id::text = $1
          AND rol_id::text = $2
      `,
      [userId, adminRoleId]
    );
  }
};

const ensureUserEmpresaAccess = async (
  client: PoolClient,
  userId: string,
  empresaId: number
): Promise<void> => {
  await client.query(
    `
      INSERT INTO usuario_empresas (usuario_id, empresa_id, activo)
      VALUES ($1::bigint, $2::bigint, TRUE)
      ON CONFLICT (usuario_id, empresa_id)
      DO UPDATE
      SET activo = TRUE
    `,
    [userId, empresaId]
  );
};

const ensureUserContratoAccess = async (
  client: PoolClient,
  userId: string,
  contratoId: number
): Promise<void> => {
  await client.query(
    `
      INSERT INTO usuario_contratos (usuario_id, contrato_id, activo)
      VALUES ($1::bigint, $2::bigint, TRUE)
      ON CONFLICT (usuario_id, contrato_id)
      DO UPDATE
      SET activo = TRUE
    `,
    [userId, contratoId]
  );
};

const main = async (): Promise<void> => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const permissions: PermissionRow[] = [];
    for (const permiso of REQUIRED_PERMISSIONS) {
      permissions.push(await ensurePermission(client, permiso));
    }
    const roleId = await ensureRole(client);
    const authUserId = await ensureAuthUser(client);
    const userId = await ensurePublicUser(client, authUserId);

    for (const permission of permissions) {
      await client.query(
        `
          INSERT INTO rol_permisos (rol_id, permiso_id, activo)
          VALUES ($1::bigint, $2::bigint, TRUE)
          ON CONFLICT (rol_id, permiso_id)
          DO UPDATE
          SET activo = TRUE
        `,
        [roleId, permission.id]
      );
    }

    await ensureUserRole(client, userId, roleId);
    await ensureNoAdminRole(client, userId);
    await ensureUserEmpresaAccess(client, userId, 1);
    await ensureUserContratoAccess(client, userId, 3);

    await client.query('COMMIT');

    console.log('Tenant test user seeded successfully.');
    console.log(`User ID: ${userId}`);
    console.log(`Auth User ID: ${authUserId}`);
    console.log(`Role ID: ${roleId}`);
    console.log('Assigned company access: empresa_id=1');
    console.log('Assigned contract access: contrato_id=3');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Tenant test user seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
