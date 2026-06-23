import { randomUUID } from 'node:crypto';
import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { findUserProfileById, UserProfile } from '../users/users.service';

interface EmpresaAccessRow extends QueryResultRow {
  activo: boolean;
  empresa_id: string;
  nombre_empresa: string;
}

interface ContratoAccessRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string;
  entidad_contratante: string | null;
  numero_contrato: string | null;
}

interface AccessEntityRow extends QueryResultRow {
  id: string;
}

interface UserRoleRow extends QueryResultRow {
  nombre_rol: string;
}

interface UserAccessResult {
  contratos: Array<{
    activo: boolean;
    contrato_id: number;
    entidad_contratante: string | null;
    numero_contrato: string | null;
  }>;
  empresas: Array<{
    activo: boolean;
    empresa_id: number;
    nombre_empresa: string;
  }>;
  usuario: UserProfile;
}

interface TenantMeEmpresaRow extends QueryResultRow {
  id: string;
  nombre_empresa: string;
}

interface TenantMeContratoRow extends QueryResultRow {
  empresa_id: string | null;
  entidad_contratante: string | null;
  id: string;
  numero_contrato: string | null;
}

export interface TenantMeEmpresa {
  id: number;
  nombre_empresa: string;
}

export interface TenantMeContrato {
  empresa_id: number | null;
  entidad_contratante: string | null;
  id: number;
  numero_contrato: string | null;
}

export interface TenantMeContext {
  contratoIds: number[];
  contratos: TenantMeContrato[];
  contrato_default_id: number | null;
  empresaIds: number[];
  empresas: TenantMeEmpresa[];
  empresa_default_id: number | null;
  isGlobalAdmin: boolean;
}

const toNumber = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: number | string | null): number | null => {
  if (value === null) {
    return null;
  }

  return toNumber(value);
};

// Empresas/contratos "disponibles" para el selector de tenant del frontend.
// Un ADMINISTRADOR (isGlobalAdmin) no tiene empresaIds/contratoIds explícitos
// (bypassea el alcance en todos lados), así que para él se listan todas las
// empresas/contratos; para el resto se resuelven los nombres de los ids que ya
// le otorgó tenantMiddleware.
export const getTenantMeContext = async (tenant: TenantAccessContext): Promise<TenantMeContext> => {
  const empresasResult = tenant.isGlobalAdmin
    ? await dbQuery<TenantMeEmpresaRow>(
        `SELECT id::text AS id, nombre_empresa FROM empresas ORDER BY nombre_empresa ASC`
      )
    : tenant.empresaIds.length === 0
      ? null
      : await dbQuery<TenantMeEmpresaRow>(
          `SELECT id::text AS id, nombre_empresa FROM empresas WHERE id = ANY($1::bigint[]) ORDER BY nombre_empresa ASC`,
          [tenant.empresaIds]
        );

  const contratosResult = tenant.isGlobalAdmin
    ? await dbQuery<TenantMeContratoRow>(
        `
          SELECT id::text AS id, numero_contrato, entidad_contratante, empresa_id::text AS empresa_id
          FROM contratos
          ORDER BY numero_contrato ASC NULLS LAST, id ASC
        `
      )
    : tenant.contratoIds.length === 0
      ? null
      : await dbQuery<TenantMeContratoRow>(
          `
            SELECT id::text AS id, numero_contrato, entidad_contratante, empresa_id::text AS empresa_id
            FROM contratos
            WHERE id = ANY($1::bigint[])
            ORDER BY numero_contrato ASC NULLS LAST, id ASC
          `,
          [tenant.contratoIds]
        );

  const empresas: TenantMeEmpresa[] = (empresasResult?.rows ?? []).map((row) => ({
    id: toNumber(row.id),
    nombre_empresa: row.nombre_empresa
  }));

  const contratos: TenantMeContrato[] = (contratosResult?.rows ?? []).map((row) => ({
    id: toNumber(row.id),
    numero_contrato: row.numero_contrato,
    entidad_contratante: row.entidad_contratante,
    empresa_id: toNullableNumber(row.empresa_id)
  }));

  const empresa_default_id = empresas[0]?.id ?? null;
  const contrato_default_id =
    (empresa_default_id !== null
      ? contratos.find((contrato) => contrato.empresa_id === empresa_default_id)?.id
      : contratos[0]?.id) ?? null;

  return {
    isGlobalAdmin: tenant.isGlobalAdmin,
    empresaIds: tenant.empresaIds,
    contratoIds: tenant.contratoIds,
    empresas,
    contratos,
    empresa_default_id,
    contrato_default_id
  };
};

const ensureAdminAccessLocked = async (client: PoolClient, userId: string): Promise<void> => {
  const result = await client.query<UserRoleRow>(
    `
      SELECT r.nombre_rol
      FROM usuario_roles ur
      INNER JOIN roles r ON r.id = ur.rol_id
      WHERE ur.usuario_id::text = $1
        AND COALESCE(ur.activo, TRUE) = TRUE
        AND COALESCE(r.activo, TRUE) = TRUE
    `,
    [userId]
  );

  if (result.rows.some((row) => row.nombre_rol === 'ADMINISTRADOR')) {
    throw new AppError(
      'No se pueden modificar accesos de un usuario ADMINISTRADOR',
      409,
      'TENANT_ADMIN_ACCESS_LOCKED'
    );
  }
};

const ensureEntityExists = async (
  client: PoolClient,
  tableName: 'empresas' | 'contratos',
  id: number,
  errorCode: string,
  label: string
): Promise<void> => {
  const result = await client.query<AccessEntityRow>(
    `SELECT id::text AS id FROM ${tableName} WHERE id = $1::bigint LIMIT 1`,
    [id]
  );

  if (!result.rows[0]) {
    throw new AppError(`${label} not found`, 404, errorCode, { id });
  }
};

const assertEditableUserExists = async (client: PoolClient, userId: string): Promise<void> => {
  const result = await client.query<AccessEntityRow>(
    `
      SELECT id::text AS id
      FROM usuarios
      WHERE id::text = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await ensureAdminAccessLocked(client, userId);
};

const mapUserAccess = async (userId: string): Promise<UserAccessResult> => {
  const usuario = await findUserProfileById(userId);

  if (!usuario) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const [empresasResult, contratosResult] = await Promise.all([
    dbQuery<EmpresaAccessRow>(
      `
        SELECT
          ue.empresa_id::text AS empresa_id,
          e.nombre_empresa,
          COALESCE(ue.activo, TRUE) AS activo
        FROM usuario_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id::text = $1
        ORDER BY e.nombre_empresa ASC
      `,
      [userId]
    ),
    dbQuery<ContratoAccessRow>(
      `
        SELECT
          uc.contrato_id::text AS contrato_id,
          c.numero_contrato,
          c.entidad_contratante,
          COALESCE(uc.activo, TRUE) AS activo
        FROM usuario_contratos uc
        INNER JOIN contratos c ON c.id = uc.contrato_id
        WHERE uc.usuario_id::text = $1
        ORDER BY c.numero_contrato ASC, c.id ASC
      `,
      [userId]
    )
  ]);

  return {
    usuario,
    empresas: empresasResult.rows.map((row) => ({
      empresa_id: toNumber(row.empresa_id),
      nombre_empresa: row.nombre_empresa,
      activo: row.activo
    })),
    contratos: contratosResult.rows.map((row) => ({
      contrato_id: toNumber(row.contrato_id),
      entidad_contratante: row.entidad_contratante,
      numero_contrato: row.numero_contrato,
      activo: row.activo
    }))
  };
};

const upsertUserEmpresaAccess = async (
  client: PoolClient,
  userId: string,
  empresaId: number
): Promise<EmpresaAccessRow> => {
  const result = await client.query<EmpresaAccessRow>(
    `
      INSERT INTO usuario_empresas (usuario_id, empresa_id, activo)
      VALUES ($1::bigint, $2::bigint, TRUE)
      ON CONFLICT (usuario_id, empresa_id)
      DO UPDATE
      SET activo = TRUE
      RETURNING
        empresa_id::text AS empresa_id,
        TRUE AS activo,
        (SELECT nombre_empresa FROM empresas WHERE id = usuario_empresas.empresa_id) AS nombre_empresa
    `,
    [userId, empresaId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to grant company access', 500, 'TENANT_EMPRESA_GRANT_FAILED');
  }

  return row;
};

const upsertUserContratoAccess = async (
  client: PoolClient,
  userId: string,
  contratoId: number
): Promise<ContratoAccessRow> => {
  const result = await client.query<ContratoAccessRow>(
    `
      INSERT INTO usuario_contratos (usuario_id, contrato_id, activo)
      VALUES ($1::bigint, $2::bigint, TRUE)
      ON CONFLICT (usuario_id, contrato_id)
      DO UPDATE
      SET activo = TRUE
      RETURNING
        contrato_id::text AS contrato_id,
        TRUE AS activo,
        (SELECT numero_contrato FROM contratos WHERE id = usuario_contratos.contrato_id) AS numero_contrato,
        (SELECT entidad_contratante FROM contratos WHERE id = usuario_contratos.contrato_id) AS entidad_contratante
    `,
    [userId, contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to grant contract access', 500, 'TENANT_CONTRATO_GRANT_FAILED');
  }

  return row;
};

const deactivateUserEmpresaAccess = async (
  client: PoolClient,
  userId: string,
  empresaId: number
): Promise<EmpresaAccessRow> => {
  const result = await client.query<EmpresaAccessRow>(
    `
      UPDATE usuario_empresas
      SET activo = FALSE
      WHERE usuario_id::text = $1
        AND empresa_id = $2::bigint
      RETURNING
        empresa_id::text AS empresa_id,
        COALESCE(activo, TRUE) AS activo,
        (SELECT nombre_empresa FROM empresas WHERE id = usuario_empresas.empresa_id) AS nombre_empresa
    `,
    [userId, empresaId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Tenant company access not found', 404, 'TENANT_EMPRESA_ACCESS_NOT_FOUND');
  }

  return row;
};

const deactivateUserContratoAccess = async (
  client: PoolClient,
  userId: string,
  contratoId: number
): Promise<ContratoAccessRow> => {
  const result = await client.query<ContratoAccessRow>(
    `
      UPDATE usuario_contratos
      SET activo = FALSE
      WHERE usuario_id::text = $1
        AND contrato_id = $2::bigint
      RETURNING
        contrato_id::text AS contrato_id,
        COALESCE(activo, TRUE) AS activo,
        (SELECT numero_contrato FROM contratos WHERE id = usuario_contratos.contrato_id) AS numero_contrato,
        (SELECT entidad_contratante FROM contratos WHERE id = usuario_contratos.contrato_id) AS entidad_contratante
    `,
    [userId, contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Tenant contract access not found', 404, 'TENANT_CONTRATO_ACCESS_NOT_FOUND');
  }

  return row;
};

const auditBestEffort = async (input: {
  accion: string;
  after?: unknown;
  before?: unknown;
  descripcion: string;
  registroId: string;
  tabla: string;
  usuarioId: string | null;
}): Promise<void> => {
  try {
    await registerAuditEntry({
      accion: input.accion,
      after: input.after,
      before: input.before,
      descripcion: input.descripcion,
      registro_id: input.registroId,
      tabla: input.tabla,
      usuario_id: input.usuarioId
    });
  } catch (error) {
    console.error('Failed to register tenant access audit entry', error);
  }
};

export const getUserAccess = async (userId: string): Promise<UserAccessResult> => {
  return mapUserAccess(userId);
};

export const grantUserEmpresaAccess = async (
  userId: string,
  empresaId: number,
  actorUserId: string
): Promise<EmpresaAccessRow> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertEditableUserExists(client, userId);
    await ensureEntityExists(client, 'empresas', empresaId, 'EMPRESA_NOT_FOUND', 'Empresa');

    const before = await dbQuery<EmpresaAccessRow>(
      `
        SELECT
          ue.empresa_id::text AS empresa_id,
          COALESCE(ue.activo, TRUE) AS activo,
          (SELECT nombre_empresa FROM empresas WHERE id = ue.empresa_id) AS nombre_empresa
        FROM usuario_empresas ue
        WHERE ue.usuario_id::text = $1
          AND ue.empresa_id = $2::bigint
        LIMIT 1
      `,
      [userId, empresaId]
    );

    const row = await upsertUserEmpresaAccess(client, userId, empresaId);
    await client.query('COMMIT');

    void auditBestEffort({
      accion: before.rows[0] ? 'UPDATE' : 'CREATE',
      after: row,
      before: before.rows[0] ?? null,
      descripcion: 'Asignacion de acceso a empresa',
      registroId: randomUUID(),
      tabla: 'usuario_empresas',
      usuarioId: actorUserId
    });

    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const revokeUserEmpresaAccess = async (
  userId: string,
  empresaId: number,
  actorUserId: string
): Promise<EmpresaAccessRow> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertEditableUserExists(client, userId);

    const before = await dbQuery<EmpresaAccessRow>(
      `
        SELECT
          ue.empresa_id::text AS empresa_id,
          COALESCE(ue.activo, TRUE) AS activo,
          (SELECT nombre_empresa FROM empresas WHERE id = ue.empresa_id) AS nombre_empresa
        FROM usuario_empresas ue
        WHERE ue.usuario_id::text = $1
          AND ue.empresa_id = $2::bigint
        LIMIT 1
      `,
      [userId, empresaId]
    );

    if (!before.rows[0]) {
      throw new AppError('Tenant company access not found', 404, 'TENANT_EMPRESA_ACCESS_NOT_FOUND');
    }

    const row = await deactivateUserEmpresaAccess(client, userId, empresaId);
    await client.query('COMMIT');

    void auditBestEffort({
      accion: 'UPDATE',
      after: row,
      before: before.rows[0],
      descripcion: 'Revocacion de acceso a empresa',
      registroId: randomUUID(),
      tabla: 'usuario_empresas',
      usuarioId: actorUserId
    });

    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const grantUserContratoAccess = async (
  userId: string,
  contratoId: number,
  actorUserId: string
): Promise<ContratoAccessRow> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertEditableUserExists(client, userId);
    await ensureEntityExists(client, 'contratos', contratoId, 'CONTRATO_NOT_FOUND', 'Contrato');

    const before = await dbQuery<ContratoAccessRow>(
      `
        SELECT
          uc.contrato_id::text AS contrato_id,
          COALESCE(uc.activo, TRUE) AS activo,
          (SELECT numero_contrato FROM contratos WHERE id = uc.contrato_id) AS numero_contrato,
          (SELECT entidad_contratante FROM contratos WHERE id = uc.contrato_id) AS entidad_contratante
        FROM usuario_contratos uc
        WHERE uc.usuario_id::text = $1
          AND uc.contrato_id = $2::bigint
        LIMIT 1
      `,
      [userId, contratoId]
    );

    const row = await upsertUserContratoAccess(client, userId, contratoId);
    await client.query('COMMIT');

    void auditBestEffort({
      accion: before.rows[0] ? 'UPDATE' : 'CREATE',
      after: row,
      before: before.rows[0] ?? null,
      descripcion: 'Asignacion de acceso a contrato',
      registroId: randomUUID(),
      tabla: 'usuario_contratos',
      usuarioId: actorUserId
    });

    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const revokeUserContratoAccess = async (
  userId: string,
  contratoId: number,
  actorUserId: string
): Promise<ContratoAccessRow> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertEditableUserExists(client, userId);

    const before = await dbQuery<ContratoAccessRow>(
      `
        SELECT
          uc.contrato_id::text AS contrato_id,
          COALESCE(uc.activo, TRUE) AS activo,
          (SELECT numero_contrato FROM contratos WHERE id = uc.contrato_id) AS numero_contrato,
          (SELECT entidad_contratante FROM contratos WHERE id = uc.contrato_id) AS entidad_contratante
        FROM usuario_contratos uc
        WHERE uc.usuario_id::text = $1
          AND uc.contrato_id = $2::bigint
        LIMIT 1
      `,
      [userId, contratoId]
    );

    if (!before.rows[0]) {
      throw new AppError('Tenant contract access not found', 404, 'TENANT_CONTRATO_ACCESS_NOT_FOUND');
    }

    const row = await deactivateUserContratoAccess(client, userId, contratoId);
    await client.query('COMMIT');

    void auditBestEffort({
      accion: 'UPDATE',
      after: row,
      before: before.rows[0],
      descripcion: 'Revocacion de acceso a contrato',
      registroId: randomUUID(),
      tabla: 'usuario_contratos',
      usuarioId: actorUserId
    });

    return row;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
