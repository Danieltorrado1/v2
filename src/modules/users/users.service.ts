import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
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
  id: number;
}

interface UserLockRow extends QueryResultRow {
  active: boolean;
  authUserExists: boolean;
  authIdentityExists: boolean;
  authUserId: string | null;
  email: string;
  id: string;
  isGlobalAdmin: boolean;
  name: string;
}

export interface UserMutationActor {
  ip: string | null;
  userAgent: string | null;
  userId: string;
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
            AND COALESCE(ur.activo, TRUE) = TRUE
            AND COALESCE(r.activo, TRUE) = TRUE
          ORDER BY r.nombre_rol
        ),
        ARRAY[]::text[]
      ) AS roles,
      COALESCE(
        ARRAY(
          SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
          FROM usuario_roles ur
          INNER JOIN roles r ON r.id = ur.rol_id
          INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
          INNER JOIN permisos p ON p.id = rp.permiso_id
          WHERE ur.usuario_id = u.id
            AND COALESCE(ur.activo, TRUE) = TRUE
            AND COALESCE(r.activo, TRUE) = TRUE
            AND COALESCE(rp.activo, TRUE) = TRUE
            AND COALESCE(p.activo, TRUE) = TRUE
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
    throw createHttpError('Email is already in use', 409, 'USER_EMAIL_DUPLICATE');
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
    throw createHttpError('Email is already in use', 409, 'USER_EMAIL_DUPLICATE');
  }
};

const validateRoleIds = async (client: PoolClient, roleIds: number[]): Promise<void> => {
  if (roleIds.length === 0) {
    return;
  }

  const result = await client.query<ExistingRoleRow>(
    'SELECT id FROM roles WHERE id = ANY($1::bigint[]) AND COALESCE(activo, TRUE) = TRUE',
    [roleIds]
  );

  const existingRoleIds = new Set(result.rows.map((row) => Number(row.id)));
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
  roleIds: number[]
): Promise<void> => {
  await client.query(
    `
      UPDATE usuario_roles
      SET activo = FALSE
      WHERE usuario_id = $1::bigint
        AND NOT (rol_id = ANY($2::bigint[]))
    `,
    [userId, roleIds]
  );

  if (roleIds.length > 0) {
    await client.query(
      `
        INSERT INTO usuario_roles (usuario_id, rol_id, activo)
        SELECT $1::bigint, role_id, TRUE
        FROM UNNEST($2::bigint[]) AS role_id
        ON CONFLICT (usuario_id, rol_id)
        DO UPDATE SET activo = TRUE
      `,
      [userId, roleIds]
    );
  }
};

const isUniqueViolation = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
};

const isActiveGlobalAdmin = async (client: PoolClient, userId: string): Promise<boolean> => {
  const result = await client.query<{ isGlobalAdmin: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM usuario_roles ur
        INNER JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = $1::bigint
          AND r.nombre_rol = 'ADMINISTRADOR'
          AND COALESCE(ur.activo, TRUE) = TRUE
          AND COALESCE(r.activo, TRUE) = TRUE
      ) AS "isGlobalAdmin"
    `,
    [userId]
  );

  return result.rows[0]?.isGlobalAdmin === true;
};

const getLockedUser = async (client: PoolClient, userId: string): Promise<UserLockRow | null> => {
  const result = await client.query<UserLockRow>(
    `
      SELECT
        u.id::text AS id,
        u.correo AS email,
        u.nombre_completo AS name,
        COALESCE(u.activo, TRUE) AS active,
        u.auth_user_id::text AS "authUserId",
        (au.id IS NOT NULL) AS "authUserExists",
        EXISTS (
          SELECT 1 FROM auth.identities ai
          WHERE ai.user_id = u.auth_user_id AND ai.provider = 'email'
        ) AS "authIdentityExists",
        EXISTS (
          SELECT 1
          FROM usuario_roles ur
          INNER JOIN roles r ON r.id = ur.rol_id
          WHERE ur.usuario_id = u.id
            AND COALESCE(ur.activo, TRUE) = TRUE
            AND COALESCE(r.activo, TRUE) = TRUE
            AND r.nombre_rol = 'ADMINISTRADOR'
            AND COALESCE(ur.activo, TRUE) = TRUE
            AND COALESCE(r.activo, TRUE) = TRUE
        ) AS "isGlobalAdmin"
      FROM usuarios u
      LEFT JOIN auth.users au ON au.id = u.auth_user_id
      WHERE u.id = $1::bigint
      FOR UPDATE OF u
    `,
    [userId]
  );

  return result.rows[0] ?? null;
};

const assertGlobalAdminActor = async (client: PoolClient, actor: UserMutationActor): Promise<void> => {
  if (!(await isActiveGlobalAdmin(client, actor.userId))) {
    throw createHttpError('Global administrator privileges are required', 403, 'GLOBAL_ADMIN_REQUIRED');
  }
};

const assertLastGlobalAdminProtected = async (client: PoolClient, userId: string): Promise<void> => {
  // Serializa cambios que podrían dejar el sistema sin un ADMINISTRADOR global.
  await client.query('SELECT pg_advisory_xact_lock(918273645)');
  const result = await client.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM usuarios u
      INNER JOIN usuario_roles ur ON ur.usuario_id = u.id
      INNER JOIN roles r ON r.id = ur.rol_id
      WHERE r.nombre_rol = 'ADMINISTRADOR'
        AND COALESCE(u.activo, TRUE) = TRUE
        AND COALESCE(ur.activo, TRUE) = TRUE
        AND COALESCE(r.activo, TRUE) = TRUE
    `
  );

  if (Number(result.rows[0]?.total ?? '0') <= 1) {
    throw createHttpError('The last active global administrator is protected', 409, 'LAST_GLOBAL_ADMIN_PROTECTED', { userId });
  }
};

const assertRoleMutationAllowed = async (
  client: PoolClient,
  actor: UserMutationActor,
  targetUserId: string,
  targetIsGlobalAdmin: boolean,
  nextRoleIds: number[] | undefined
): Promise<void> => {
  if (nextRoleIds === undefined) {
    return;
  }

  if (actor.userId === targetUserId) {
    throw createHttpError('Users cannot change their own roles', 403, 'SELF_ROLE_CHANGE_FORBIDDEN');
  }

  await assertGlobalAdminActor(client, actor);

  const adminRole = await client.query<{ id: string }>(
    "SELECT id FROM roles WHERE nombre_rol = 'ADMINISTRADOR' AND COALESCE(activo, TRUE) = TRUE LIMIT 1"
  );
  const adminRoleId = adminRole.rows[0] ? Number(adminRole.rows[0].id) : undefined;

  if (targetIsGlobalAdmin && adminRoleId !== undefined && !nextRoleIds.includes(adminRoleId)) {
    await assertLastGlobalAdminProtected(client, targetUserId);
  }
};

const auditUserChange = async (
  client: PoolClient,
  actor: UserMutationActor,
  action: string,
  targetUserId: string,
  before: unknown,
  after: unknown
): Promise<void> => {
  await registerAuditEntry({
    client,
    accion: action,
    before,
    after,
    descripcion: action,
    registro_id: targetUserId,
    tabla: 'usuarios',
    usuario_id: actor.userId,
    ip: actor.ip,
    user_agent: actor.userAgent
  });
};

const assertAuthLinkConsistent = (target: UserLockRow): void => {
  if (!target.authUserId) {
    throw createHttpError('User authentication linkage is missing', 409, 'USER_AUTH_LINK_MISSING');
  }

  if (!target.authUserExists || !target.authIdentityExists) {
    throw createHttpError('User authentication linkage is inconsistent', 409, 'USER_AUTH_IDENTITY_INCONSISTENT');
  }
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
            AND COALESCE(ur.activo, TRUE) = TRUE
            AND COALESCE(r.activo, TRUE) = TRUE
          ORDER BY r.nombre_rol
        ),
        ARRAY[]::text[]
      ) AS roles,
      COALESCE(
        ARRAY(
          SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
          FROM usuario_roles ur
          INNER JOIN roles r ON r.id = ur.rol_id
          INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
          INNER JOIN permisos p ON p.id = rp.permiso_id
          WHERE ur.usuario_id = u.id
            AND COALESCE(ur.activo, TRUE) = TRUE
            AND COALESCE(r.activo, TRUE) = TRUE
            AND COALESCE(rp.activo, TRUE) = TRUE
            AND COALESCE(p.activo, TRUE) = TRUE
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

export const createUser = async (input: CreateUserInput, actor: UserMutationActor): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertGlobalAdminActor(client, actor);
    await ensureEmailAvailable(client, input.email);
    await validateRoleIds(client, input.roleIds);
    await assertRoleMutationAllowed(client, actor, '-1', false, input.roleIds);

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
    await auditUserChange(client, actor, 'USER_CREATE', createdUser.id, null, {
      id: createdUser.id,
      email: input.email,
      name: input.name,
      active: input.active,
      roleIds: input.roleIds
    });
    await client.query('COMMIT');

    const user = await findUserProfileById(createdUser.id);

    if (!user) {
      throw createHttpError('Created user could not be loaded', 500, 'USER_LOAD_FAILED');
    }

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      throw createHttpError('Email is already in use', 409, 'USER_EMAIL_DUPLICATE');
    }
    throw error;
  } finally {
    client.release();
  }
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput,
  actor: UserMutationActor
): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const lockedTarget = await getLockedUser(client, userId);
    if (!lockedTarget) {
      throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (lockedTarget.isGlobalAdmin) {
      await assertGlobalAdminActor(client, actor);
    }

    await assertRoleMutationAllowed(client, actor, userId, lockedTarget.isGlobalAdmin, input.roleIds);

    const changesAuthIdentity = input.email !== undefined || input.name !== undefined || input.password !== undefined;
    if (changesAuthIdentity) {
      assertAuthLinkConsistent(lockedTarget);
    }

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

    if (existingUser.authUserId && changesAuthIdentity) {
      await client.query(
        `
          UPDATE auth.users
          SET
            email = $2,
            encrypted_password = COALESCE($3, encrypted_password),
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

      const identityUpdate = await client.query(
        `
          UPDATE auth.identities
          SET identity_data = $2::jsonb, updated_at = NOW()
          WHERE user_id = $1::uuid AND provider = 'email'
        `,
        [
          existingUser.authUserId,
          JSON.stringify({
            sub: existingUser.authUserId,
            email: nextEmail,
            email_verified: true,
            phone_verified: false
          })
        ]
      );
      if ((identityUpdate.rowCount ?? 0) !== 1) {
        throw createHttpError('User authentication linkage is inconsistent', 409, 'USER_AUTH_IDENTITY_INCONSISTENT');
      }
    } else if (changesAuthIdentity) {
      throw createHttpError('User authentication linkage is missing', 409, 'USER_AUTH_LINK_MISSING');
    }

    await client.query(
      `
        UPDATE usuarios
        SET
          correo = $2,
          nombre_completo = $3,
          activo = CASE WHEN $5::boolean THEN $4 ELSE activo END
        WHERE id::text = $1
      `,
      [userId, nextEmail, nextName, nextActive, input.active !== undefined]
    );

    if (input.roleIds) {
      await syncUserRoles(client, userId, input.roleIds);
    }

    await auditUserChange(client, actor, input.password ? 'USER_PASSWORD_CHANGE' : input.roleIds ? 'USER_ROLES_UPDATE' : 'USER_UPDATE', userId, {
      email: existingUser.email,
      name: existingUser.name,
      active: existingUser.active
    }, {
      email: nextEmail,
      name: nextName,
      active: nextActive,
      roleIds: input.roleIds
    });

    await client.query('COMMIT');

    const user = await findUserProfileById(userId);

    if (!user) {
      throw createHttpError('Updated user could not be loaded', 500, 'USER_LOAD_FAILED');
    }

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      throw createHttpError('Email is already in use', 409, 'USER_EMAIL_DUPLICATE');
    }
    throw error;
  } finally {
    client.release();
  }
};

export const setUserActiveState = async (
  userId: string,
  active: boolean,
  actor: UserMutationActor
): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const target = await getLockedUser(client, userId);

    if (!target) {
      throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (target.isGlobalAdmin) {
      await assertGlobalAdminActor(client, actor);
      if (!active) {
        await assertLastGlobalAdminProtected(client, userId);
      }
    }

    const result = await client.query<UserProfileRow>(
      `
        UPDATE usuarios
        SET activo = $2
        WHERE id = $1::bigint
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

    if (!result.rows[0]) {
      throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
    }

    await auditUserChange(client, actor, active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', userId, {
      active: target.active
    }, {
      active
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const user = await findUserProfileById(userId);
  if (!user) {
    throw createHttpError('User could not be loaded', 500, 'USER_LOAD_FAILED');
  }
  return user;
};
