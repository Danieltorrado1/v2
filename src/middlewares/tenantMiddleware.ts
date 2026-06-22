import { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';

import { dbQuery } from '../config/db';
import { AppError } from '../utils/AppError';

export interface TenantAccessContext {
  contratoIds: number[];
  empresaIds: number[];
  isGlobalAdmin: boolean;
}

interface RoleRow extends QueryResultRow {
  nombre_rol: string;
}

interface TenantIdRow extends QueryResultRow {
  id: string;
}

interface ContractCompanyRow extends QueryResultRow {
  empresa_id: string | null;
}

interface VinculacionAccessRow extends QueryResultRow {
  contrato_id: string;
  empresa_id: string | null;
}

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid tenant identifier returned by database', 500, 'TENANT_INVALID_ID');
  }

  return parsed;
};

const toUniqueNumbers = (rows: TenantIdRow[]): number[] => {
  return Array.from(
    new Set(
      rows
        .map((row) => toNumber(row.id))
        .filter((value) => Number.isFinite(value))
    )
  );
};

export const loadTenantAccess = async (
  userId: string | number
): Promise<TenantAccessContext> => {
  const numericUserId = toNumber(userId);

  const rolesResult = await dbQuery<RoleRow>(
    `
      SELECT r.nombre_rol
      FROM usuario_roles ur
      INNER JOIN roles r ON r.id = ur.rol_id
      WHERE ur.usuario_id = $1::bigint
        AND COALESCE(ur.activo, TRUE) = TRUE
        AND COALESCE(r.activo, TRUE) = TRUE
    `,
    [numericUserId]
  );

  const isGlobalAdmin = rolesResult.rows.some((row) => row.nombre_rol === 'ADMINISTRADOR');

  if (isGlobalAdmin) {
    return {
      isGlobalAdmin: true,
      empresaIds: [],
      contratoIds: []
    };
  }

  const [empresasResult, contratosResult] = await Promise.all([
    dbQuery<TenantIdRow>(
      `
        SELECT ue.empresa_id::text AS id
        FROM usuario_empresas ue
        WHERE ue.usuario_id = $1::bigint
          AND COALESCE(ue.activo, TRUE) = TRUE
        ORDER BY ue.empresa_id ASC
      `,
      [numericUserId]
    ),
    dbQuery<TenantIdRow>(
      `
        SELECT uc.contrato_id::text AS id
        FROM usuario_contratos uc
        WHERE uc.usuario_id = $1::bigint
          AND COALESCE(uc.activo, TRUE) = TRUE
        ORDER BY uc.contrato_id ASC
      `,
      [numericUserId]
    )
  ]);

  return {
    isGlobalAdmin: false,
    empresaIds: toUniqueNumbers(empresasResult.rows),
    contratoIds: toUniqueNumbers(contratosResult.rows)
  };
};

const getUserId = (req: Request): string | number | undefined => {
  return req.user?.userId;
};

const getTenantOrThrow = (req: Request): TenantAccessContext => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  if (!req.tenant) {
    throw new AppError('Tenant context is required', 500, 'TENANT_CONTEXT_MISSING');
  }

  return req.tenant;
};

const hasTenantScope = (tenant: TenantAccessContext, contratoId: number, empresaId: number | null): boolean => {
  if (tenant.isGlobalAdmin) {
    return true;
  }

  if (tenant.contratoIds.includes(contratoId)) {
    return true;
  }

  return empresaId !== null && tenant.empresaIds.includes(empresaId);
};

export const assertTenantAccessForVinculacionId = async (
  tenant: TenantAccessContext | undefined,
  vinculacionId: string | number
): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  const numericVinculacionId = toNumber(vinculacionId);
  const result = await dbQuery<VinculacionAccessRow>(
    `
      SELECT
        v.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [numericVinculacionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const contratoId = toNumber(row.contrato_id);
  const empresaId = row.empresa_id === null ? null : toNumber(row.empresa_id);

  if (!hasTenantScope(tenant, contratoId, empresaId)) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

export const assertTenantAccessForPersonaId = async (
  tenant: TenantAccessContext | undefined,
  personaId: string | number
): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  const numericPersonaId = toNumber(personaId);
  const result = await dbQuery<VinculacionAccessRow>(
    `
      SELECT
        v.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      WHERE v.persona_id = $1::bigint
      ORDER BY v.id ASC
    `,
    [numericPersonaId]
  );

  const hasAccess = result.rows.some((row) =>
    hasTenantScope(tenant, toNumber(row.contrato_id), row.empresa_id === null ? null : toNumber(row.empresa_id))
  );

  if (!hasAccess) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

export const tenantMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = getUserId(req);

    if (userId === undefined || userId === null) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    req.tenant = await loadTenantAccess(userId);
    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError('Failed to resolve tenant access', 500, 'TENANT_ACCESS_LOAD_FAILED')
    );
  }
};

export const requireEmpresaAccess =
  (empresaId: number) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const tenant = getTenantOrThrow(req);

      if (tenant.isGlobalAdmin || tenant.empresaIds.includes(empresaId)) {
        next();
        return;
      }

      throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
    } catch (error) {
      next(error);
    }
  };

export const requireContratoAccess =
  (contratoId: number) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = getTenantOrThrow(req);

      if (tenant.isGlobalAdmin || tenant.contratoIds.includes(contratoId)) {
        next();
        return;
      }

      if (tenant.empresaIds.length === 0) {
        throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
      }

      const contratoResult = await dbQuery<ContractCompanyRow>(
        `
          SELECT empresa_id::text AS empresa_id
          FROM contratos
          WHERE id = $1::bigint
          LIMIT 1
        `,
        [contratoId]
      );

      const contrato = contratoResult.rows[0];

      if (contrato?.empresa_id && tenant.empresaIds.includes(toNumber(contrato.empresa_id))) {
        next();
        return;
      }

      throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
    } catch (error) {
      next(error);
    }
  };

export const buildTenantWhereClause = (input: {
  contratoColumn?: string;
  empresaColumn?: string;
  tenant: TenantAccessContext;
}): { params: unknown[]; sql: string } => {
  const contratoColumn = input.contratoColumn ?? 'contrato_id';
  const empresaColumn = input.empresaColumn ?? 'empresa_id';

  if (input.tenant.isGlobalAdmin) {
    return {
      params: [],
      sql: ''
    };
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.tenant.contratoIds.length > 0) {
    params.push(input.tenant.contratoIds);
    clauses.push(`${contratoColumn} = ANY($${paramIndex}::bigint[])`);
    paramIndex += 1;
  }

  if (input.tenant.empresaIds.length > 0) {
    params.push(input.tenant.empresaIds);
    clauses.push(`${empresaColumn} = ANY($${paramIndex}::bigint[])`);
  }

  if (clauses.length === 0) {
    return {
      params: [],
      sql: 'WHERE 1 = 0'
    };
  }

  return {
    params,
    sql: `WHERE (${clauses.join(' OR ')})`
  };
};
