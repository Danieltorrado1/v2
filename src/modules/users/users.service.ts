import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { CreateUserInput, UpdateUserInput } from './users.schemas';

interface UserProfileRow extends QueryResultRow {
  active: boolean;
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  permissions: string[] | null;
  roles: string[] | null;
  updatedAt: Date;
}

interface ExistingRoleRow extends QueryResultRow {
  id: string;
}

interface UserAuthRow extends QueryResultRow {
  active: boolean;
  authUserId: string | null;
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  passwordHash: string | null;
  updatedAt: Date;
}

export interface UserProfile {
  active: boolean;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  permissions: string[];
  roles: string[];
  updatedAt: string;
}

export interface UserAuthRecord extends UserProfile {
  passwordHash: string;
}

const createHttpError = (
  message: string,
  statusCode: number,
  code: string,
  details?: unknown
): Error & { code: string; details?: unknown; statusCode: number } => {
  return Object.assign(new Error(message), {
    code,
    details,
    statusCode
  });
};

const mapUserProfile = (row: UserProfileRow): UserProfile => {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    active: row.active,
    roles: Array.isArray(row.roles) ? row.roles.filter((role): role is string => typeof role === 'string') : [],
    permissions: Array.isArray(row.permissions)
      ? row.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
};

const mapUserAuthRecord = (row: UserProfileRow & { passwordHash: string }): UserAuthRecord => {
  return {
    ...mapUserProfile(row),
    passwordHash: row.passwordHash
  };
};

const getUserProfileSelect = (): string => {
  return `
    SELECT
      u.id::text AS id,
      u.correo AS email,
      u.nombre_completo AS name,
      COALESCE(u.activo, TRUE) AS active,
      u.created_at AS "createdAt",
      u.created_at AS "updatedAt",
      COALESCE(
        ARRAY(
          SELECT DISTINCT r.nombre_rol
          FROM usuario_roles ur
          INNER JOIN roles r ON r.id = ur.rol_id
          WHERE ur.usuario_id = u.id
          ORDER BY r.nombre_rol
        ),
        ARRAY[]::text[]
      ) AS roles,
      COALESCE(
        ARRAY(
          SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
          FROM usuario_roles ur
          INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
          INNER JOIN permisos p ON p.id = rp.permiso_id
          WHERE ur.usuario_id = u.id
          ORDER BY CONCAT_WS('.', p.modulo, p.accion)
        ),
        ARRAY[]::text[]
      ) AS permissions
    FROM usuarios u
  `;
};

const ensureEmailAvailable = async (
  client: PoolClient,
  email: string,
  excludedUserId?: string,
  excludedAuthUserId?: string
): Promise<void> => {
  const existingPublicParams: unknown[] = [email];
  let existingPublicQuery = 'SELECT id::text AS id FROM usuarios WHERE LOWER(correo) = LOWER($1)';

  if (excludedUserId) {
    existingPublicQuery += ' AND id::text <> $2';
    existingPublicParams.push(excludedUserId);
  }

  existingPublicQuery += ' LIMIT 1';

  const publicResult = await client.query<{ id: string }>(existingPublicQuery, existingPublicParams);

  if ((publicResult.rowCount ?? 0) > 0) {
    throw createHttpError('Email is already in use', 409, 'EMAIL_ALREADY_IN_USE');
  }

  const existingAuthParams: unknown[] = [email];
  let existingAuthQuery = 'SELECT id::text AS id FROM auth.users WHERE LOWER(email) = LOWER($1)';

  if (excludedAuthUserId) {
    existingAuthQuery += ' AND id::text <> $2';
    existingAuthParams.push(excludedAuthUserId);
  }

  existingAuthQuery += ' LIMIT 1';

  const authResult = await client.query<{ id: string }>(existingAuthQuery, existingAuthParams);

  if ((authResult.rowCount ?? 0) > 0) {
    throw createHttpError('Email is already in use', 409, 'EMAIL_ALREADY_IN_USE');
  }
};

const validateRoleIds = async (client: PoolClient, roleIds: string[]): Promise<void> => {
  if (roleIds.length === 0) {
    return;
  }

  const result = await client.query<ExistingRoleRow>(
    'SELECT id::text AS id FROM roles WHERE id::text = ANY($1::text[])',
    [roleIds]
  );

  const existingRoleIds = new Set(result.rows.map((row) => row.id));
  const missingRoleIds = roleIds.filter((roleId) => !existingRoleIds.has(roleId));

  if (missingRoleIds.length > 0) {
    throw createHttpError('One or more roles do not exist', 400, 'INVALID_ROLE_IDS', {
      missingRoleIds
    });
  }
};

const syncUserRoles = async (
  client: PoolClient,
  userId: string,
  roleIds: string[]
): Promise<void> => {
  await client.query('DELETE FROM usuario_roles WHERE usuario_id::text = $1', [userId]);

  if (roleIds.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO usuario_roles (usuario_id, rol_id)
      SELECT $1::uuid, role_id::uuid
      FROM UNNEST($2::text[]) AS role_id
    `,
    [userId, roleIds]
  );
};

const getUserAuthQuery = (): string => {
  return `
    SELECT
      u.id::text AS id,
      u.correo AS email,
      u.nombre_completo AS name,
      au.encrypted_password AS "passwordHash",
      COALESCE(u.activo, TRUE) AS active,
      u.created_at AS "createdAt",
      u.created_at AS "updatedAt",
      COALESCE(
        ARRAY(
          SELECT DISTINCT r.nombre_rol
          FROM usuario_roles ur
          INNER JOIN roles r ON r.id = ur.rol_id
          WHERE ur.usuario_id = u.id
          ORDER BY r.nombre_rol
        ),
        ARRAY[]::text[]
      ) AS roles,
      COALESCE(
        ARRAY(
          SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
          FROM usuario_roles ur
          INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
          INNER JOIN permisos p ON p.id = rp.permiso_id
          WHERE ur.usuario_id = u.id
          ORDER BY CONCAT_WS('.', p.modulo, p.accion)
        ),
        ARRAY[]::text[]
      ) AS permissions
    FROM usuarios u
    INNER JOIN auth.users au ON au.id = u.auth_user_id
  `;
};

export const findUserByEmailForAuth = async (
  email: string
): Promise<UserAuthRecord | null> => {
  const result = await dbQuery<UserProfileRow & { passwordHash: string }>(
    `
      ${getUserAuthQuery()}
      WHERE LOWER(u.correo) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  const row = result.rows[0];
  return row ? mapUserAuthRecord(row) : null;
};

export const findUserProfileById = async (userId: string): Promise<UserProfile | null> => {
  const result = await dbQuery<UserProfileRow>(
    `
      ${getUserProfileSelect()}
      WHERE u.id::text = $1
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  return row ? mapUserProfile(row) : null;
};

export const listUsers = async (): Promise<UserProfile[]> => {
  const result = await dbQuery<UserProfileRow>(
    `
      ${getUserProfileSelect()}
      ORDER BY u.created_at DESC, u.correo ASC
    `
  );

  return result.rows.map(mapUserProfile);
};

const createAuthIdentity = async (
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

const createAuthUser = async (
  client: PoolClient,
  authUserId: string,
  email: string,
  passwordHash: string,
  name: string
): Promise<void> => {
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
        '00000000-0000-0000-0000-000000000000'::uuid,
        $1::uuid,
        'authenticated',
        'authenticated',
        $2,
        $3,
        NOW(),
        $4::jsonb,
        $5::jsonb,
        NOW(),
        NOW()
      )
    `,
    [
      authUserId,
      email,
      passwordHash,
      JSON.stringify({
        provider: 'email',
        providers: ['email']
      }),
      JSON.stringify({
        name
      })
    ]
  );

  await createAuthIdentity(client, authUserId, email);
};

export const createUser = async (input: CreateUserInput): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureEmailAvailable(client, input.email);
    await validateRoleIds(client, input.roleIds);

    const passwordHash = await bcrypt.hash(input.password, 10);
    const authUserId = randomUUID();
    await createAuthUser(client, authUserId, input.email, passwordHash, input.name);

    const createdUserResult = await client.query<UserProfileRow>(
      `
        INSERT INTO usuarios (nombre_completo, correo, telefono, activo, auth_user_id)
        VALUES ($1, $2, NULL, $3, $4::uuid)
        RETURNING
          id::text AS id,
          created_at AS "createdAt",
          created_at AS "updatedAt",
          correo AS email,
          nombre_completo AS name,
          COALESCE(activo, TRUE) AS active
      `,
      [input.name, input.email, input.active, authUserId]
    );

    const createdUser = createdUserResult.rows[0];

    if (!createdUser) {
      throw createHttpError('Failed to create user', 500, 'USER_CREATION_FAILED');
    }

    await syncUserRoles(client, createdUser.id, input.roleIds);
    await client.query('COMMIT');

    const user = await findUserProfileById(createdUser.id);

    if (!user) {
      throw createHttpError('Created user could not be loaded', 500, 'USER_LOAD_FAILED');
    }

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput
): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const existingUserResult = await client.query<UserAuthRow>(
      `
        SELECT
          id::text AS id,
          correo AS email,
          nombre_completo AS name,
          COALESCE(activo, TRUE) AS active,
          created_at AS "createdAt",
          created_at AS "updatedAt",
          auth_user_id::text AS "authUserId",
          au.encrypted_password AS "passwordHash"
        FROM usuarios
        LEFT JOIN auth.users au ON au.id = usuarios.auth_user_id
        WHERE usuarios.id::text = $1
        LIMIT 1
      `,
      [userId]
    );

    const existingUser = existingUserResult.rows[0];

    if (!existingUser) {
      throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (input.email) {
      await ensureEmailAvailable(client, input.email, userId, existingUser.authUserId ?? undefined);
    }

    if (input.roleIds) {
      await validateRoleIds(client, input.roleIds);
    }

    const nextEmail = input.email ?? existingUser.email;
    const nextName = input.name ?? existingUser.name;
    const nextActive = input.active ?? existingUser.active;
    const nextPasswordHash = input.password
      ? await bcrypt.hash(input.password, 10)
      : existingUser.passwordHash;

    if (existingUser.authUserId && input.password) {
      await client.query(
        `
          UPDATE auth.users
          SET
            email = $2,
            encrypted_password = $3,
            raw_user_meta_data = $4::jsonb,
            updated_at = NOW()
          WHERE id::text = $1
        `,
        [
          existingUser.authUserId,
          nextEmail,
          nextPasswordHash,
          JSON.stringify({
            name: nextName
          })
        ]
      );

      await createAuthIdentity(client, existingUser.authUserId, nextEmail);
    } else if (input.password) {
      throw createHttpError('User auth linkage is missing', 500, 'USER_AUTH_LINKAGE_MISSING');
    }

    await client.query(
      `
        UPDATE usuarios
        SET
          correo = $2,
          nombre_completo = $3,
          activo = $4
        WHERE id::text = $1
      `,
      [userId, nextEmail, nextName, nextActive]
    );

    if (input.roleIds) {
      await syncUserRoles(client, userId, input.roleIds);
    }

    await client.query('COMMIT');

    const user = await findUserProfileById(userId);

    if (!user) {
      throw createHttpError('Updated user could not be loaded', 500, 'USER_LOAD_FAILED');
    }

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const setUserActiveState = async (
  userId: string,
  active: boolean
): Promise<UserProfile> => {
  const result = await dbQuery<UserProfileRow>(
    `
      UPDATE usuarios
      SET
        activo = $2
      WHERE id::text = $1
      RETURNING
        id::text AS id,
        created_at AS "createdAt",
        created_at AS "updatedAt",
        correo AS email,
        nombre_completo AS name,
        COALESCE(activo, TRUE) AS active
    `,
    [userId, active]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
  }

  const user = await findUserProfileById(userId);

  if (!user) {
    throw createHttpError('User could not be loaded', 500, 'USER_LOAD_FAILED');
  }

  return user;
};
