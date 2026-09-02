import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { loadTenantAccess } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  CreateAdminUserInput,
  CreateUserInput,
  UpdateAdminUserInput,
  UpdateUserInput
} from './users.schemas';

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

interface UserRoleRow extends QueryResultRow {
  id: string;
  nombre_rol: string;
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
  email: string;
  id: string;
  name: string;
  passwordHash: string | null;
}

interface EmpresaReferenceRow extends QueryResultRow {
  activo: boolean;
  empresa_id: string;
  nombre_empresa: string;
}

interface ContratoReferenceRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string;
  empresa_id: string;
  entidad_contratante: string | null;
  numero_contrato: string | null;
}

interface UserIdRow extends QueryResultRow {
  id: string;
}

interface MutableUserContext {
  active: boolean;
  authUserId: string | null;
  currentContratoIds: number[];
  currentEmpresaIds: number[];
  currentRoleIds: number[];
  email: string;
  id: string;
  name: string;
  passwordHash: string | null;
}

interface RoleReference {
  id: number;
  nombre_rol: string;
}

interface EmpresaReference {
  activo: boolean;
  empresa_id: number;
  nombre_empresa: string;
}

interface ContratoReference {
  activo: boolean;
  contrato_id: number;
  empresa_id: number;
  entidad_contratante: string | null;
  numero_contrato: string | null;
}

interface NormalizedTenantSelection {
  contratoIds: number[];
  contratos: ContratoReference[];
  empresaIds: number[];
  empresas: EmpresaReference[];
  isGlobalAdmin: boolean;
  roleIds: number[];
}

interface AdminUserTenantContext {
  contratoIds: number[];
  contratos: ContratoReference[];
  empresas: EmpresaReference[];
  isGlobalAdmin: boolean;
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

export interface AdminUserRecord extends UserProfile {
  contratoIds: number[];
  contratos: ContratoReference[];
  empresas: EmpresaReference[];
  empresaIds: number[];
  isGlobalAdmin: boolean;
  primaryRole: string | null;
  roleIds: number[];
}

const BCRYPT_SALT_ROUNDS = 10;

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

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw createHttpError('Invalid numeric identifier returned by database', 500, 'INVALID_NUMERIC_ID');
  }

  return parsed;
};

const toUserIdText = (userId: string | number): string => String(userId);

const uniqueNumberIds = (values: number[]): number[] =>
  Array.from(new Set(values.filter((value) => Number.isFinite(value))));

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

const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

const ensureEmailAvailable = async (
  client: PoolClient,
  email: string,
  excludedUserId?: string | number,
  excludedAuthUserId?: string
): Promise<void> => {
  const existingPublicParams: unknown[] = [email];
  let existingPublicQuery = 'SELECT id::text AS id FROM usuarios WHERE LOWER(correo) = LOWER($1)';

  if (excludedUserId !== undefined) {
    existingPublicQuery += ' AND id::text <> $2';
    existingPublicParams.push(toUserIdText(excludedUserId));
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

const loadRoleReferences = async (client: PoolClient, roleIds: number[]): Promise<RoleReference[]> => {
  if (roleIds.length === 0) {
    return [];
  }

  const normalizedRoleIds = uniqueNumberIds(roleIds);
  const result = await client.query<UserRoleRow>(
    `
      SELECT id::text AS id, nombre_rol
      FROM roles
      WHERE id = ANY($1::bigint[])
        AND COALESCE(activo, TRUE) = TRUE
      ORDER BY nombre_rol ASC
    `,
    [normalizedRoleIds]
  );

  const existingRoleIds = new Set(result.rows.map((row) => toNumber(row.id)));
  const missingRoleIds = normalizedRoleIds.filter((roleId) => !existingRoleIds.has(roleId));

  if (missingRoleIds.length > 0) {
    throw createHttpError('One or more roles do not exist', 400, 'INVALID_ROLE_IDS', {
      missingRoleIds
    });
  }

  return result.rows.map((row) => ({
    id: toNumber(row.id),
    nombre_rol: row.nombre_rol
  }));
};

const loadEmpresaReferences = async (client: PoolClient, empresaIds: number[]): Promise<EmpresaReference[]> => {
  if (empresaIds.length === 0) {
    return [];
  }

  const normalizedEmpresaIds = uniqueNumberIds(empresaIds);
  const result = await client.query<EmpresaReferenceRow>(
    `
      SELECT
        e.id::text AS empresa_id,
        e.nombre_empresa,
        COALESCE(e.activo, TRUE) AS activo
      FROM empresas e
      WHERE e.id = ANY($1::bigint[])
      ORDER BY e.nombre_empresa ASC
    `,
    [normalizedEmpresaIds]
  );

  const existingIds = new Set(result.rows.map((row) => toNumber(row.empresa_id)));
  const missingIds = normalizedEmpresaIds.filter((empresaId) => !existingIds.has(empresaId));

  if (missingIds.length > 0) {
    throw createHttpError('One or more companies do not exist', 400, 'INVALID_EMPRESA_IDS', {
      missingEmpresaIds: missingIds
    });
  }

  return result.rows.map((row) => ({
    empresa_id: toNumber(row.empresa_id),
    nombre_empresa: row.nombre_empresa,
    activo: row.activo
  }));
};

const loadContratoReferences = async (client: PoolClient, contratoIds: number[]): Promise<ContratoReference[]> => {
  if (contratoIds.length === 0) {
    return [];
  }

  const normalizedContratoIds = uniqueNumberIds(contratoIds);
  const result = await client.query<ContratoReferenceRow>(
    `
      SELECT
        c.id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        c.numero_contrato,
        c.entidad_contratante,
        COALESCE(c.activo, TRUE) AS activo
      FROM contratos c
      WHERE c.id = ANY($1::bigint[])
      ORDER BY c.numero_contrato ASC NULLS LAST, c.id ASC
    `,
    [normalizedContratoIds]
  );

  const existingIds = new Set(result.rows.map((row) => toNumber(row.contrato_id)));
  const missingIds = normalizedContratoIds.filter((contratoId) => !existingIds.has(contratoId));

  if (missingIds.length > 0) {
    throw createHttpError('One or more contracts do not exist', 400, 'INVALID_CONTRATO_IDS', {
      missingContratoIds: missingIds
    });
  }

  return result.rows.map((row) => ({
    contrato_id: toNumber(row.contrato_id),
    empresa_id: toNumber(row.empresa_id),
    numero_contrato: row.numero_contrato,
    entidad_contratante: row.entidad_contratante,
    activo: row.activo
  }));
};

const normalizeTenantSelection = async (
  client: PoolClient,
  input: { contratoIds?: number[]; empresaIds?: number[]; roleIds: number[] }
): Promise<NormalizedTenantSelection> => {
  const roleIds = uniqueNumberIds(input.roleIds);

  if (roleIds.length === 0) {
    throw createHttpError('At least one role is required', 400, 'ROLE_REQUIRED');
  }

  const empresaIds = uniqueNumberIds(input.empresaIds ?? []);
  const contratoIds = uniqueNumberIds(input.contratoIds ?? []);
  const roles = await loadRoleReferences(client, roleIds);
  const isGlobalAdmin = roles.some((role) => role.nombre_rol === 'ADMINISTRADOR');
  const empresas = await loadEmpresaReferences(client, empresaIds);
  const contratos = await loadContratoReferences(client, contratoIds);

  if (!isGlobalAdmin && empresaIds.length < 1) {
    throw createHttpError(
      'Non-admin users must have at least one company assigned',
      400,
      'EMPRESA_REQUIRED'
    );
  }

  if (contratoIds.length > 0 && empresaIds.length === 0) {
    throw createHttpError(
      'Contracts require at least one selected company',
      400,
      'CONTRATOS_REQUIEREN_EMPRESA'
    );
  }

  const allowedEmpresaIds = new Set(empresaIds);
  const invalidContracts = contratos.filter((contrato) => !allowedEmpresaIds.has(contrato.empresa_id));

  if (invalidContracts.length > 0) {
    throw createHttpError(
      'One or more contracts do not belong to the selected company set',
      400,
      'CONTRATOS_EMPRESA_MISMATCH',
      {
        invalidContratoIds: invalidContracts.map((contrato) => contrato.contrato_id)
      }
    );
  }

  return {
    roleIds,
    isGlobalAdmin,
    empresaIds,
    empresas,
    contratoIds,
    contratos
  };
};

const syncUserRoles = async (client: PoolClient, userId: string | number, roleIds: number[]): Promise<void> => {
  const userIdText = toUserIdText(userId);
  await client.query(
    `
      UPDATE usuario_roles
      SET activo = FALSE
      WHERE usuario_id::text = $1
    `,
    [userIdText]
  );

  if (roleIds.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO usuario_roles (usuario_id, rol_id, activo)
      SELECT $1::bigint, role_id, TRUE
      FROM UNNEST($2::bigint[]) AS role_id
      ON CONFLICT (usuario_id, rol_id)
      DO UPDATE
      SET activo = TRUE
    `,
    [userIdText, uniqueNumberIds(roleIds)]
  );
};

const syncUserEmpresas = async (client: PoolClient, userId: string | number, empresaIds: number[]): Promise<void> => {
  const userIdText = toUserIdText(userId);
  await client.query(
    `
      UPDATE usuario_empresas
      SET activo = FALSE
      WHERE usuario_id::text = $1
    `,
    [userIdText]
  );

  if (empresaIds.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO usuario_empresas (usuario_id, empresa_id, activo)
      SELECT $1::bigint, empresa_id, TRUE
      FROM UNNEST($2::bigint[]) AS empresa_id
      ON CONFLICT (usuario_id, empresa_id)
      DO UPDATE
      SET activo = TRUE
    `,
    [userIdText, uniqueNumberIds(empresaIds)]
  );
};

const syncUserContratos = async (
  client: PoolClient,
  userId: string | number,
  contratoIds: number[]
): Promise<void> => {
  const userIdText = toUserIdText(userId);
  await client.query(
    `
      UPDATE usuario_contratos
      SET activo = FALSE
      WHERE usuario_id::text = $1
    `,
    [userIdText]
  );

  if (contratoIds.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO usuario_contratos (usuario_id, contrato_id, activo)
      SELECT $1::bigint, contrato_id, TRUE
      FROM UNNEST($2::bigint[]) AS contrato_id
      ON CONFLICT (usuario_id, contrato_id)
      DO UPDATE
      SET activo = TRUE
    `,
    [userIdText, uniqueNumberIds(contratoIds)]
  );
};

const syncAdminTerritorialScopes = async (
  client: PoolClient, userId: string | number, roleIds: number[], active: boolean,
  scopes: CreateAdminUserInput['territorialScopes'], actorUserId: string
): Promise<void> => {
  const roles = await client.query<{ nombre_rol: string }>('SELECT nombre_rol FROM roles WHERE id = ANY($1::bigint[]) AND COALESCE(activo, TRUE) = TRUE', [uniqueNumberIds(roleIds)]);
  const territorial = roles.rows.some((row) => row.nombre_rol === 'GESTOR' || row.nombre_rol === 'TALENTO_HUMANO');
  const desired = active && territorial ? (scopes ?? []) : [];
  const selectedContracts = new Set(await loadActiveNumberIds(client, 'usuario_contratos', 'contrato_id', userId));
  for (const scope of desired) {
    if (!selectedContracts.has(scope.contrato_id)) throw createHttpError('El alcance territorial requiere un contrato asignado al usuario.', 400, 'TERRITORIAL_CONTRACT_NOT_SELECTED');
    const dept = await client.query('SELECT id FROM departamentos WHERE id = $1::bigint LIMIT 1', [scope.departamento_id]);
    if (!dept.rows[0]) throw createHttpError('El departamento seleccionado no existe.', 400, 'INVALID_DEPARTAMENTO_ID');
    const municipalityIds = uniqueNumberIds(scope.municipio_ids);
    if (municipalityIds.length === 0) continue;
    const municipalities = await client.query<{ id: string }>('SELECT mu.id::text AS id FROM municipios mu WHERE mu.id = ANY($1::bigint[]) AND mu.departamento_id = $2::bigint AND EXISTS (SELECT 1 FROM focalizacion_final ff WHERE ff.contrato_id = $3::bigint AND ff.municipio_id = mu.id AND ff.activo = TRUE)', [municipalityIds, scope.departamento_id, scope.contrato_id]);
    const validIds = new Set(municipalities.rows.map((row) => Number(row.id)));
    const invalidIds = municipalityIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) throw createHttpError('Uno o m�s municipios no pertenecen al departamento o contrato seleccionado.', 400, 'INVALID_TERRITORIAL_SCOPE', { invalidIds });
  }
  await client.query('UPDATE gestor_municipio_asignaciones SET activo = FALSE, vigencia_hasta = CASE WHEN vigencia_desde > CURRENT_DATE - 1 THEN vigencia_desde ELSE CURRENT_DATE - 1 END, updated_by_user_id = $2::bigint, updated_at = NOW() WHERE usuario_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE', [toUserIdText(userId), actorUserId]);
  for (const scope of desired) for (const municipioId of uniqueNumberIds(scope.municipio_ids)) {
    await client.query(`INSERT INTO gestor_municipio_asignaciones (usuario_id, contrato_id, municipio_id, alcance_personal, vigencia_desde, vigencia_hasta, activo, observacion, created_by_user_id, updated_by_user_id) VALUES ($1::bigint, $2::bigint, $3::bigint, 'PERSONAL_SELECCIONADO', CURRENT_DATE, NULL, TRUE, 'Alcance territorial guardado con el usuario', $4::bigint, $4::bigint) ON CONFLICT DO NOTHING`, [toUserIdText(userId), scope.contrato_id, municipioId, actorUserId]);
  }
};
const isUniqueViolation = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
};

const isActiveGlobalAdmin = async (client: PoolClient, userId: string | number): Promise<boolean> => {
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
    [toUserIdText(userId)]
  );

  return result.rows[0]?.isGlobalAdmin === true;
};

const getLockedUser = async (client: PoolClient, userId: string | number): Promise<UserLockRow | null> => {
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
        ) AS "isGlobalAdmin"
      FROM usuarios u
      LEFT JOIN auth.users au ON au.id = u.auth_user_id
      WHERE u.id = $1::bigint
      FOR UPDATE OF u
    `,
    [toUserIdText(userId)]
  );

  return result.rows[0] ?? null;
};

const assertGlobalAdminActor = async (client: PoolClient, actor: UserMutationActor): Promise<void> => {
  if (!(await isActiveGlobalAdmin(client, actor.userId))) {
    throw createHttpError('Global administrator privileges are required', 403, 'GLOBAL_ADMIN_REQUIRED');
  }
};

const assertLastGlobalAdminProtected = async (client: PoolClient, userId: string | number): Promise<void> => {
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
    throw createHttpError('The last active global administrator is protected', 409, 'LAST_GLOBAL_ADMIN_PROTECTED', {
      userId: toUserIdText(userId)
    });
  }
};

const assertRoleMutationAllowed = async (
  client: PoolClient,
  actor: UserMutationActor,
  targetUserId: string | number,
  targetIsGlobalAdmin: boolean,
  nextRoleIds: number[] | undefined
): Promise<void> => {
  if (nextRoleIds === undefined) {
    return;
  }

  const targetUserIdText = toUserIdText(targetUserId);
  if (actor.userId === targetUserIdText) {
    throw createHttpError('Users cannot change their own roles', 403, 'SELF_ROLE_CHANGE_FORBIDDEN');
  }

  await assertGlobalAdminActor(client, actor);

  const adminRole = await client.query<{ id: string }>(
    "SELECT id::text AS id FROM roles WHERE nombre_rol = 'ADMINISTRADOR' AND COALESCE(activo, TRUE) = TRUE LIMIT 1"
  );
  const adminRoleId = adminRole.rows[0] ? toNumber(adminRole.rows[0].id) : undefined;

  if (targetIsGlobalAdmin && adminRoleId !== undefined && !nextRoleIds.includes(adminRoleId)) {
    await assertLastGlobalAdminProtected(client, targetUserIdText);
  }
};

const auditUserChange = async (
  client: PoolClient,
  actor: UserMutationActor,
  action: string,
  targetUserId: string | number,
  before: unknown,
  after: unknown
): Promise<void> => {
  await registerAuditEntry({
    client,
    accion: action,
    before,
    after,
    descripcion: action,
    registro_id: toUserIdText(targetUserId),
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

const updateAuthUser = async (
  client: PoolClient,
  authUserId: string,
  input: { email: string; name: string; passwordHash?: string | null }
): Promise<void> => {
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
      authUserId,
      input.email,
      input.passwordHash ?? null,
      JSON.stringify({
        name: input.name
      })
    ]
  );

  await createAuthIdentity(client, authUserId, input.email);
};

const loadActiveNumberIds = async (
  client: PoolClient,
  tableName: 'usuario_roles' | 'usuario_empresas' | 'usuario_contratos',
  fieldName: 'rol_id' | 'empresa_id' | 'contrato_id',
  userId: string | number
): Promise<number[]> => {
  const result = await client.query<UserIdRow>(
    `
      SELECT ${fieldName}::text AS id
      FROM ${tableName}
      WHERE usuario_id::text = $1
        AND COALESCE(activo, TRUE) = TRUE
      ORDER BY ${fieldName} ASC
    `,
    [toUserIdText(userId)]
  );

  return result.rows.map((row) => toNumber(row.id));
};

const loadMutableUserContext = async (
  client: PoolClient,
  userId: string | number
): Promise<MutableUserContext> => {
  const userIdText = toUserIdText(userId);
  const existingUserResult = await client.query<UserAuthRow>(
    `
      SELECT
        u.id::text AS id,
        u.correo AS email,
        u.nombre_completo AS name,
        COALESCE(u.activo, TRUE) AS active,
        u.auth_user_id::text AS "authUserId",
        au.encrypted_password AS "passwordHash"
      FROM usuarios u
      LEFT JOIN auth.users au ON au.id = u.auth_user_id
      WHERE u.id::text = $1
      LIMIT 1
    `,
    [userIdText]
  );

  const existingUser = existingUserResult.rows[0];

  if (!existingUser) {
    throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
  }

  const [roleIds, empresaIds, contratoIds] = await Promise.all([
    loadActiveNumberIds(client, 'usuario_roles', 'rol_id', userIdText),
    loadActiveNumberIds(client, 'usuario_empresas', 'empresa_id', userIdText),
    loadActiveNumberIds(client, 'usuario_contratos', 'contrato_id', userIdText)
  ]);

  return {
    id: existingUser.id,
    email: existingUser.email,
    name: existingUser.name,
    active: existingUser.active,
    authUserId: existingUser.authUserId,
    passwordHash: existingUser.passwordHash,
    currentRoleIds: roleIds,
    currentEmpresaIds: empresaIds,
    currentContratoIds: contratoIds
  };
};

const loadUserRoleAssignments = async (
  userId: string | number
): Promise<{ primaryRole: string | null; roleIds: number[] }> => {
  const result = await dbQuery<UserRoleRow>(
    `
      SELECT r.id::text AS id, r.nombre_rol
      FROM usuario_roles ur
      INNER JOIN roles r ON r.id = ur.rol_id
      WHERE ur.usuario_id::text = $1
        AND COALESCE(ur.activo, TRUE) = TRUE
        AND COALESCE(r.activo, TRUE) = TRUE
      ORDER BY CASE WHEN r.nombre_rol = 'ADMINISTRADOR' THEN 0 ELSE 1 END, r.nombre_rol ASC
    `,
    [toUserIdText(userId)]
  );

  return {
    roleIds: result.rows.map((row) => toNumber(row.id)),
    primaryRole: result.rows[0]?.nombre_rol ?? null
  };
};

const loadAdminUserTenantContext = async (userId: string | number): Promise<AdminUserTenantContext> => {
  const userIdText = toUserIdText(userId);
  const tenantAccess = await loadTenantAccess(userIdText);
  const [empresasResult, contratosResult] = await Promise.all([
    dbQuery<EmpresaReferenceRow>(
      `
        SELECT
          ue.empresa_id::text AS empresa_id,
          e.nombre_empresa,
          COALESCE(ue.activo, TRUE) AS activo
        FROM usuario_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id::text = $1
          AND COALESCE(ue.activo, TRUE) = TRUE
        ORDER BY e.nombre_empresa ASC
      `,
      [userIdText]
    ),
    dbQuery<ContratoReferenceRow>(
      `
        SELECT
          uc.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id,
          c.numero_contrato,
          c.entidad_contratante,
          COALESCE(uc.activo, TRUE) AS activo
        FROM usuario_contratos uc
        INNER JOIN contratos c ON c.id = uc.contrato_id
        WHERE uc.usuario_id::text = $1
          AND COALESCE(uc.activo, TRUE) = TRUE
        ORDER BY c.numero_contrato ASC NULLS LAST, c.id ASC
      `,
      [userIdText]
    )
  ]);

  const contratos = contratosResult.rows.map((row) => ({
    contrato_id: toNumber(row.contrato_id),
    empresa_id: toNumber(row.empresa_id),
    numero_contrato: row.numero_contrato,
    entidad_contratante: row.entidad_contratante,
    activo: row.activo
  }));

  return {
    isGlobalAdmin: tenantAccess.isGlobalAdmin,
    empresas: empresasResult.rows.map((row) => ({
      empresa_id: toNumber(row.empresa_id),
      nombre_empresa: row.nombre_empresa,
      activo: row.activo
    })),
    contratos,
    contratoIds: contratos.map((contrato) => contrato.contrato_id)
  };
};

const enrichAdminUserProfile = async (profile: UserProfile): Promise<AdminUserRecord> => {
  const [roles, tenantContext] = await Promise.all([
    loadUserRoleAssignments(profile.id),
    loadAdminUserTenantContext(profile.id)
  ]);

  return {
    ...profile,
    primaryRole: roles.primaryRole,
    roleIds: roles.roleIds,
    isGlobalAdmin: tenantContext.isGlobalAdmin,
    empresaIds: tenantContext.empresas.map((empresa) => empresa.empresa_id),
    empresas: tenantContext.empresas,
    contratoIds: tenantContext.contratoIds,
    contratos: tenantContext.contratos
  };
};

export const findUserByEmailForAuth = async (email: string): Promise<UserAuthRecord | null> => {
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

export const findUserProfileById = async (userId: string | number): Promise<UserProfile | null> => {
  const result = await dbQuery<UserProfileRow>(
    `
      ${getUserProfileSelect()}
      WHERE u.id::text = $1
      LIMIT 1
    `,
    [toUserIdText(userId)]
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

export const createUser = async (
  input: CreateUserInput,
  actor: UserMutationActor
): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertGlobalAdminActor(client, actor);
    await ensureEmailAvailable(client, input.email);
    await loadRoleReferences(client, input.roleIds);
    await assertRoleMutationAllowed(client, actor, '-1', false, input.roleIds);

    const passwordHash = await hashPassword(input.password);
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
  userId: string | number,
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

    const existingUser = await loadMutableUserContext(client, userId);

    if (input.email) {
      await ensureEmailAvailable(client, input.email, userId, existingUser.authUserId ?? undefined);
    }

    if (input.roleIds) {
      await loadRoleReferences(client, input.roleIds);
    }

    const nextEmail = input.email ?? existingUser.email;
    const nextName = input.name ?? existingUser.name;
    const nextActive = input.active ?? existingUser.active;
    const nextPasswordHash = input.password ? await hashPassword(input.password) : existingUser.passwordHash;
    const userIdText = toUserIdText(userId);

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
      [userIdText, nextEmail, nextName, nextActive, input.active !== undefined]
    );

    if (input.roleIds) {
      await syncUserRoles(client, userIdText, input.roleIds);
    }

    await auditUserChange(
      client,
      actor,
      input.password ? 'USER_PASSWORD_CHANGE' : input.roleIds ? 'USER_ROLES_UPDATE' : 'USER_UPDATE',
      userIdText,
      {
        email: existingUser.email,
        name: existingUser.name,
        active: existingUser.active,
        roleIds: existingUser.currentRoleIds
      },
      {
        email: nextEmail,
        name: nextName,
        active: nextActive,
        roleIds: input.roleIds ?? existingUser.currentRoleIds
      }
    );

    await client.query('COMMIT');

    const user = await findUserProfileById(userIdText);

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
  userId: string | number,
  active: boolean,
  actor?: UserMutationActor
): Promise<UserProfile> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const target = await getLockedUser(client, userId);

    if (!target) {
      throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (target.isGlobalAdmin) {
      if (actor) {
        await assertGlobalAdminActor(client, actor);
      }

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
      [toUserIdText(userId), active]
    );

    if (!result.rows[0]) {
      throw createHttpError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (actor) {
      await auditUserChange(client, actor, active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', userId, {
        active: target.active
      }, {
        active
      });
    }

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

export const listAdminUsers = async (): Promise<AdminUserRecord[]> => {
  const users = await listUsers();
  return Promise.all(users.map((user) => enrichAdminUserProfile(user)));
};

export const findAdminUserById = async (userId: string | number): Promise<AdminUserRecord | null> => {
  const user = await findUserProfileById(userId);
  return user ? enrichAdminUserProfile(user) : null;
};

export const createAdminUser = async (input: CreateAdminUserInput, actor: UserMutationActor): Promise<AdminUserRecord> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureEmailAvailable(client, input.email);

    const normalizedSelection = await normalizeTenantSelection(client, {
      roleIds: input.roleIds,
      empresaIds: input.empresaIds,
      contratoIds: input.contratoIds
    });

    const passwordHash = await hashPassword(input.password);
    const authUserId = randomUUID();
    await createAuthUser(client, authUserId, input.email, passwordHash, input.name);

    const createdUserResult = await client.query<UserIdRow>(
      `
        INSERT INTO usuarios (nombre_completo, correo, telefono, activo, auth_user_id)
        VALUES ($1, $2, NULL, $3, $4::uuid)
        RETURNING id::text AS id
      `,
      [input.name, input.email, input.active, authUserId]
    );

    const createdUser = createdUserResult.rows[0];

    if (!createdUser) {
      throw createHttpError('Failed to create user', 500, 'USER_CREATION_FAILED');
    }

    await syncUserRoles(client, createdUser.id, normalizedSelection.roleIds);
    await syncUserEmpresas(client, createdUser.id, normalizedSelection.empresaIds);
    await syncUserContratos(client, createdUser.id, normalizedSelection.contratoIds);
    await syncAdminTerritorialScopes(client, createdUser.id, normalizedSelection.roleIds, input.active, input.territorialScopes, actor.userId);
    await client.query('COMMIT');

    const user = await findAdminUserById(createdUser.id);

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

export const updateAdminUser = async (
  userId: string | number,
  input: UpdateAdminUserInput,
  actor: UserMutationActor
): Promise<AdminUserRecord> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const existingUser = await loadMutableUserContext(client, userId);
    const nextEmail = input.email ?? existingUser.email;
    const nextName = input.name ?? existingUser.name;
    const nextActive = input.active ?? existingUser.active;
    const nextRoleIds = input.roleIds ?? existingUser.currentRoleIds;
    const nextEmpresaIds = input.empresaIds ?? existingUser.currentEmpresaIds;
    const nextContratoIds = input.contratoIds ?? existingUser.currentContratoIds;
    const userIdText = toUserIdText(userId);

    if (nextEmail !== existingUser.email) {
      await ensureEmailAvailable(client, nextEmail, userIdText, existingUser.authUserId ?? undefined);
    }

    const normalizedSelection = await normalizeTenantSelection(client, {
      roleIds: nextRoleIds,
      empresaIds: nextEmpresaIds,
      contratoIds: nextContratoIds
    });

    if (existingUser.authUserId && (nextEmail !== existingUser.email || nextName !== existingUser.name)) {
      await updateAuthUser(client, existingUser.authUserId, {
        email: nextEmail,
        name: nextName
      });
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
      [userIdText, nextEmail, nextName, nextActive]
    );

    await syncUserRoles(client, userIdText, normalizedSelection.roleIds);
    await syncUserEmpresas(client, userIdText, normalizedSelection.empresaIds);
    await syncUserContratos(client, userIdText, normalizedSelection.contratoIds);
    if (input.territorialScopes !== undefined) await syncAdminTerritorialScopes(client, userIdText, normalizedSelection.roleIds, nextActive, input.territorialScopes, actor.userId);

    await client.query('COMMIT');

    const user = await findAdminUserById(userIdText);

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

export const updateAdminUserPassword = async (
  userId: string | number,
  password: string
): Promise<AdminUserRecord> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const existingUser = await loadMutableUserContext(client, userId);

    if (!existingUser.authUserId) {
      throw createHttpError('User auth linkage is missing', 500, 'USER_AUTH_LINKAGE_MISSING');
    }

    await updateAuthUser(client, existingUser.authUserId, {
      email: existingUser.email,
      name: existingUser.name,
      passwordHash: await hashPassword(password)
    });

    await client.query('COMMIT');

    const user = await findAdminUserById(userId);

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

export const updateAdminUserState = async (
  userId: string | number,
  active: boolean
): Promise<AdminUserRecord> => {
  await setUserActiveState(userId, active);

  const user = await findAdminUserById(userId);

  if (!user) {
    throw createHttpError('User could not be loaded', 500, 'USER_LOAD_FAILED');
  }

  return user;
};

export const deleteAdminUser = async (userId: string | number): Promise<AdminUserRecord> => {
  return updateAdminUserState(userId, false);
};
