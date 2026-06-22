import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  CreateSstMatrizRiesgoInput,
  ListSstMatrizRiesgosAlertasQuery,
  ListSstMatrizRiesgosDashboardQuery,
  ListSstMatrizRiesgosQuery,
  SstRiesgoClasificacion,
  SstRiesgoTipoPeligro,
  UpdateSstMatrizRiesgoInput
} from './sst.schemas';
import { ensureContratoExists, ensureEmpresaExists } from './sst.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface SstContratoScopeRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

interface SstMatrizRiesgoRow extends QueryResultRow {
  activo: boolean | null;
  actividad: string;
  clasificacion_riesgo: SstRiesgoClasificacion;
  consecuencia: string | null;
  controles_existentes: string | null;
  controles_recomendados: string | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  descripcion_peligro: string;
  empresa_id: string;
  empresa_nombre: string;
  id: string;
  impacto: number;
  nivel_riesgo: number;
  probabilidad: number;
  proceso: string;
  tarea: string | null;
  tipo_peligro: SstRiesgoTipoPeligro;
}

interface AggregateRiskClassificationRow extends QueryResultRow {
  riesgos_altos: number;
  riesgos_bajos: number;
  riesgos_criticos: number;
  riesgos_medios: number;
  riesgos_total: number;
}

interface AggregateRiskControlsRow extends QueryResultRow {
  con_controles: number;
  riesgos_total: number;
}

interface AggregateRiskTypeRow extends QueryResultRow {
  tipo_peligro: SstRiesgoTipoPeligro;
  total: number;
}

export interface SstMatrizRiesgo {
  activo: boolean;
  actividad: string;
  clasificacion_riesgo: SstRiesgoClasificacion;
  consecuencia: string | null;
  controles_existentes: string | null;
  controles_recomendados: string | null;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  descripcion_peligro: string;
  empresa: {
    id: number;
    nombre_empresa: string;
  };
  id: number;
  impacto: number;
  nivel_riesgo: number;
  probabilidad: number;
  proceso: string;
  tarea: string | null;
  tipo_peligro: SstRiesgoTipoPeligro;
}

export interface PaginatedSstMatrizRiesgos {
  items: SstMatrizRiesgo[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface SstMatrizRiesgosDashboard {
  cumplimiento_controles_porcentaje: number;
  por_tipo_peligro: Array<{
    tipo_peligro: SstRiesgoTipoPeligro;
    total: number;
  }>;
  riesgos_altos: number;
  riesgos_bajos: number;
  riesgos_criticos: number;
  riesgos_medios: number;
  riesgos_total: number;
}

export interface SstMatrizRiesgoAlerta {
  clasificacion_riesgo: 'ALTO' | 'CRITICO';
  descripcion: string;
  estado: 'ACTIVA';
  fecha_alerta: string;
  id: string;
  riesgo: {
    id: number;
    nivel_riesgo: number;
    proceso: string;
    tipo_peligro: SstRiesgoTipoPeligro;
  };
  severidad: 'ALTA' | 'CRITICA';
  tipo_alerta: 'RIESGO_ALTO' | 'RIESGO_CRITICO';
  titulo: string;
}

export interface PaginatedSstMatrizRiesgoAlertas {
  items: SstMatrizRiesgoAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

const toBigintNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableBigintNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBooleanValue = (value: boolean | null | undefined): boolean => value ?? false;

const toDateIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const appendTenantScopeConditions = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  contratoColumn: string,
  empresaColumn: string
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  const tenantClauses: string[] = [];

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    tenantClauses.push(`${contratoColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    tenantClauses.push(`${empresaColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenantClauses.length > 0) {
    conditions.push(`(${tenantClauses.join(' OR ')})`);
  }
};

const ensureTenantScopeForEntity = (
  tenant: TenantAccessContext | undefined,
  contratoId: number | null,
  empresaId: number | null
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (contratoId !== null && tenant.contratoIds.includes(contratoId)) {
    return;
  }

  if (empresaId !== null && tenant.empresaIds.includes(empresaId)) {
    return;
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const ensureFilterWithinTenant = (
  tenant: TenantAccessContext | undefined,
  filters: { contrato_id?: string | null; empresa_id?: string | null }
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (filters.contrato_id && !tenant.contratoIds.includes(Number(filters.contrato_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (filters.empresa_id && !tenant.empresaIds.includes(Number(filters.empresa_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const resolveRiskClassification = (nivelRiesgo: number): SstRiesgoClasificacion => {
  if (nivelRiesgo >= 17) {
    return 'CRITICO';
  }

  if (nivelRiesgo >= 10) {
    return 'ALTO';
  }

  if (nivelRiesgo >= 5) {
    return 'MEDIO';
  }

  return 'BAJO';
};

const calculateRiskDerivedFields = (probabilidad: number, impacto: number): {
  clasificacion_riesgo: SstRiesgoClasificacion;
  nivel_riesgo: number;
} => {
  const nivel_riesgo = probabilidad * impacto;

  return {
    nivel_riesgo,
    clasificacion_riesgo: resolveRiskClassification(nivel_riesgo)
  };
};

const getSstMatrizRiesgoSelect = (): string => {
  return `
    SELECT
      smr.id::text AS id,
      smr.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      smr.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      smr.proceso,
      smr.actividad,
      smr.tarea,
      smr.tipo_peligro,
      smr.descripcion_peligro,
      smr.consecuencia,
      smr.probabilidad,
      smr.impacto,
      smr.nivel_riesgo,
      smr.clasificacion_riesgo,
      smr.controles_existentes,
      smr.controles_recomendados,
      smr.activo,
      smr.created_at
    FROM sst_matriz_riesgos smr
    INNER JOIN empresas e ON e.id = smr.empresa_id
    LEFT JOIN contratos c ON c.id = smr.contrato_id
  `;
};

const mapSstMatrizRiesgo = (row: SstMatrizRiesgoRow): SstMatrizRiesgo => {
  return {
    id: toBigintNumber(row.id),
    empresa: {
      id: toBigintNumber(row.empresa_id),
      nombre_empresa: row.empresa_nombre
    },
    contrato: {
      id: toNullableBigintNumber(row.contrato_id),
      numero_contrato: row.contrato_numero
    },
    proceso: row.proceso,
    actividad: row.actividad,
    tarea: row.tarea,
    tipo_peligro: row.tipo_peligro,
    descripcion_peligro: row.descripcion_peligro,
    consecuencia: row.consecuencia,
    probabilidad: Number(row.probabilidad),
    impacto: Number(row.impacto),
    nivel_riesgo: Number(row.nivel_riesgo),
    clasificacion_riesgo: row.clasificacion_riesgo,
    controles_existentes: row.controles_existentes,
    controles_recomendados: row.controles_recomendados,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const loadContratoScope = async (
  contratoId: string,
  client?: PoolClient
): Promise<{ contrato_id: number; empresa_id: number | null }> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstContratoScopeRow>(
    `
      SELECT
        id::text AS id,
        empresa_id::text AS empresa_id
      FROM contratos
      WHERE id::text = $1
      LIMIT 1
    `,
    [contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Contrato not found', 400, 'CONTRATO_NOT_FOUND');
  }

  return {
    contrato_id: toBigintNumber(row.id),
    empresa_id: toNullableBigintNumber(row.empresa_id)
  };
};

const validateRiskScope = async (input: {
  client?: PoolClient;
  contratoId?: string | null;
  empresaId: string;
  tenant?: TenantAccessContext;
}): Promise<void> => {
  await ensureEmpresaExists(input.empresaId, input.client);

  if (input.contratoId) {
    await ensureContratoExists(input.contratoId, input.client);
    const contratoScope = await loadContratoScope(input.contratoId, input.client);
    const empresaId = toBigintNumber(input.empresaId);

    if (contratoScope.empresa_id !== empresaId) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'SST_RIESGO_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, toBigintNumber(input.empresaId));
};

const ensureSstMatrizRiesgoExists = async (
  riesgoId: string,
  client?: PoolClient
): Promise<SstMatrizRiesgoRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstMatrizRiesgoRow>(
    `
      ${getSstMatrizRiesgoSelect()}
      WHERE smr.id::text = $1
      LIMIT 1
    `,
    [riesgoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST risk matrix entry not found', 404, 'SST_RIESGO_NOT_FOUND');
  }

  return row;
};

const buildSstMatrizRiesgosWhere = (
  filters: ListSstMatrizRiesgosQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'smr.contrato_id', 'smr.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`smr.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`smr.contrato_id::text = $${params.length}`);
  }

  if (filters.tipo_peligro) {
    params.push(filters.tipo_peligro);
    conditions.push(`smr.tipo_peligro = $${params.length}`);
  }

  if (filters.clasificacion_riesgo) {
    params.push(filters.clasificacion_riesgo);
    conditions.push(`smr.clasificacion_riesgo = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(smr.activo, TRUE) = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(smr.proceso ILIKE $${params.length} OR smr.actividad ILIKE $${params.length} OR COALESCE(smr.tarea, '') ILIKE $${params.length} OR smr.descripcion_peligro ILIKE $${params.length})`
    );
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildExpedienteScopeClause = (
  params: unknown[],
  contratoIds: number[],
  empresaIds: number[],
  contratoColumn: string,
  empresaColumn: string
): string => {
  const clauses: string[] = [];

  if (contratoIds.length > 0) {
    params.push(contratoIds);
    clauses.push(`${contratoColumn} = ANY($${params.length}::bigint[])`);
  }

  if (empresaIds.length > 0) {
    params.push(empresaIds);
    clauses.push(`(${contratoColumn} IS NULL AND ${empresaColumn} = ANY($${params.length}::bigint[]))`);
  }

  return clauses.length > 0 ? `(${clauses.join(' OR ')})` : '1 = 0';
};

export const listSstMatrizRiesgos = async (
  filters: ListSstMatrizRiesgosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstMatrizRiesgos> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const { params, whereClause } = buildSstMatrizRiesgosWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_matriz_riesgos smr
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstMatrizRiesgoRow>(
    `
      ${getSstMatrizRiesgoSelect()}
      ${whereClause}
      ORDER BY smr.nivel_riesgo DESC, smr.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstMatrizRiesgo),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstMatrizRiesgo = async (
  input: CreateSstMatrizRiesgoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstMatrizRiesgo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validateRiskScope({
      client,
      empresaId: input.empresa_id,
      contratoId: input.contrato_id,
      tenant
    });

    const derived = calculateRiskDerivedFields(input.probabilidad, input.impacto);
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_matriz_riesgos (
          empresa_id,
          contrato_id,
          proceso,
          actividad,
          tarea,
          tipo_peligro,
          descripcion_peligro,
          consecuencia,
          probabilidad,
          impacto,
          nivel_riesgo,
          clasificacion_riesgo,
          controles_existentes,
          controles_recomendados,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15
        )
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.proceso,
        input.actividad,
        input.tarea,
        input.tipo_peligro,
        input.descripcion_peligro,
        input.consecuencia,
        input.probabilidad,
        input.impacto,
        derived.nivel_riesgo,
        derived.clasificacion_riesgo,
        input.controles_existentes,
        input.controles_recomendados,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST risk matrix entry', 500, 'SST_RIESGO_CREATE_FAILED');
    }

    const created = mapSstMatrizRiesgo(await ensureSstMatrizRiesgoExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_RIESGO_CREATE',
      tabla: 'sst_matriz_riesgos',
      registro_id: String(created.id),
      descripcion: 'Creacion de riesgo SST',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstMatrizRiesgo = async (
  riesgoId: string,
  input: UpdateSstMatrizRiesgoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstMatrizRiesgo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstMatrizRiesgoExists(riesgoId, client);
    const current = mapSstMatrizRiesgo(currentRow);

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);

    await validateRiskScope({
      client,
      empresaId: nextEmpresaId,
      contratoId: nextContratoId,
      tenant
    });

    const nextProbabilidad = input.probabilidad ?? current.probabilidad;
    const nextImpacto = input.impacto ?? current.impacto;
    const derived = calculateRiskDerivedFields(nextProbabilidad, nextImpacto);

    await client.query(
      `
        UPDATE sst_matriz_riesgos
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          proceso = $4,
          actividad = $5,
          tarea = $6,
          tipo_peligro = $7,
          descripcion_peligro = $8,
          consecuencia = $9,
          probabilidad = $10,
          impacto = $11,
          nivel_riesgo = $12,
          clasificacion_riesgo = $13,
          controles_existentes = $14,
          controles_recomendados = $15,
          activo = $16
        WHERE id::text = $1
      `,
      [
        riesgoId,
        nextEmpresaId,
        nextContratoId,
        input.proceso ?? current.proceso,
        input.actividad ?? current.actividad,
        input.tarea !== undefined ? input.tarea : current.tarea,
        input.tipo_peligro ?? current.tipo_peligro,
        input.descripcion_peligro ?? current.descripcion_peligro,
        input.consecuencia !== undefined ? input.consecuencia : current.consecuencia,
        nextProbabilidad,
        nextImpacto,
        derived.nivel_riesgo,
        derived.clasificacion_riesgo,
        input.controles_existentes !== undefined ? input.controles_existentes : current.controles_existentes,
        input.controles_recomendados !== undefined
          ? input.controles_recomendados
          : current.controles_recomendados,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstMatrizRiesgo(await ensureSstMatrizRiesgoExists(riesgoId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_RIESGO_UPDATE',
      tabla: 'sst_matriz_riesgos',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de riesgo SST',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstMatrizRiesgo = async (
  riesgoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstMatrizRiesgo> => {
  return updateSstMatrizRiesgo(
    riesgoId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_RIESGO_DEACTIVATE',
      tabla: 'sst_matriz_riesgos',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de riesgo SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const getSstMatrizRiesgosDashboard = async (
  filters: ListSstMatrizRiesgosDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstMatrizRiesgosDashboard> => {
  ensureFilterWithinTenant(tenant, filters);

  const buildBaseConditions = (): { conditions: string[]; params: unknown[] } => {
    const conditions: string[] = ['COALESCE(smr.activo, TRUE) = TRUE'];
    const params: unknown[] = [];

    appendTenantScopeConditions(conditions, params, tenant, 'smr.contrato_id', 'smr.empresa_id');

    if (filters.empresa_id) {
      params.push(filters.empresa_id);
      conditions.push(`smr.empresa_id::text = $${params.length}`);
    }

    if (filters.contrato_id) {
      params.push(filters.contrato_id);
      conditions.push(`smr.contrato_id::text = $${params.length}`);
    }

    return { conditions, params };
  };

  const classificationQuery = (() => {
    const { conditions, params } = buildBaseConditions();
    return dbQuery<AggregateRiskClassificationRow>(
      `
        SELECT
          COUNT(*)::int AS riesgos_total,
          COUNT(*) FILTER (WHERE smr.clasificacion_riesgo = 'BAJO')::int AS riesgos_bajos,
          COUNT(*) FILTER (WHERE smr.clasificacion_riesgo = 'MEDIO')::int AS riesgos_medios,
          COUNT(*) FILTER (WHERE smr.clasificacion_riesgo = 'ALTO')::int AS riesgos_altos,
          COUNT(*) FILTER (WHERE smr.clasificacion_riesgo = 'CRITICO')::int AS riesgos_criticos
        FROM sst_matriz_riesgos smr
        WHERE ${conditions.join(' AND ')}
      `,
      params
    );
  })();

  const typeQuery = (() => {
    const { conditions, params } = buildBaseConditions();
    return dbQuery<AggregateRiskTypeRow>(
      `
        SELECT smr.tipo_peligro, COUNT(*)::int AS total
        FROM sst_matriz_riesgos smr
        WHERE ${conditions.join(' AND ')}
        GROUP BY smr.tipo_peligro
        ORDER BY total DESC, smr.tipo_peligro ASC
      `,
      params
    );
  })();

  const controlsQuery = (() => {
    const { conditions, params } = buildBaseConditions();
    return dbQuery<AggregateRiskControlsRow>(
      `
        SELECT
          COUNT(*)::int AS riesgos_total,
          COUNT(*) FILTER (
            WHERE LENGTH(TRIM(COALESCE(smr.controles_existentes, ''))) > 0
          )::int AS con_controles
        FROM sst_matriz_riesgos smr
        WHERE ${conditions.join(' AND ')}
      `,
      params
    );
  })();

  const [classificationResult, typeResult, controlsResult] = await Promise.all([
    classificationQuery,
    typeQuery,
    controlsQuery
  ]);

  const classification = classificationResult.rows[0];
  const controls = controlsResult.rows[0];

  const dashboard: SstMatrizRiesgosDashboard = {
    riesgos_total: classification?.riesgos_total ?? 0,
    riesgos_bajos: classification?.riesgos_bajos ?? 0,
    riesgos_medios: classification?.riesgos_medios ?? 0,
    riesgos_altos: classification?.riesgos_altos ?? 0,
    riesgos_criticos: classification?.riesgos_criticos ?? 0,
    por_tipo_peligro: typeResult.rows.map((row) => ({
      tipo_peligro: row.tipo_peligro,
      total: row.total
    })),
    cumplimiento_controles_porcentaje:
      !controls || controls.riesgos_total === 0
        ? 100
        : Math.round((controls.con_controles / controls.riesgos_total) * 10000) / 100
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_RIESGO_DASHBOARD_VIEW',
    tabla: 'sst_matriz_riesgos',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de matriz de riesgos',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getSstMatrizRiesgosAlertas = async (
  filters: ListSstMatrizRiesgosAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstMatrizRiesgoAlertas> => {
  ensureFilterWithinTenant(tenant, filters);

  const result = await listSstMatrizRiesgos(
    {
      page: 1,
      limit: 5000,
      empresa_id: filters.empresa_id,
      contrato_id: filters.contrato_id,
      activo: true
    },
    tenant
  );

  const items: SstMatrizRiesgoAlerta[] = [];
  for (const riesgo of result.items) {
    if (riesgo.clasificacion_riesgo === 'CRITICO') {
      items.push({
        id: `RIESGO_CRITICO:${riesgo.id}`,
        tipo_alerta: 'RIESGO_CRITICO',
        severidad: 'CRITICA',
        estado: 'ACTIVA',
        fecha_alerta: riesgo.created_at.slice(0, 10),
        titulo: `Riesgo critico: ${riesgo.proceso}`,
        descripcion: riesgo.descripcion_peligro,
        clasificacion_riesgo: riesgo.clasificacion_riesgo,
        riesgo: {
          id: riesgo.id,
          proceso: riesgo.proceso,
          tipo_peligro: riesgo.tipo_peligro,
          nivel_riesgo: riesgo.nivel_riesgo
        }
      });
    } else if (riesgo.clasificacion_riesgo === 'ALTO') {
      items.push({
        id: `RIESGO_ALTO:${riesgo.id}`,
        tipo_alerta: 'RIESGO_ALTO',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: riesgo.created_at.slice(0, 10),
        titulo: `Riesgo alto: ${riesgo.proceso}`,
        descripcion: riesgo.descripcion_peligro,
        clasificacion_riesgo: riesgo.clasificacion_riesgo,
        riesgo: {
          id: riesgo.id,
          proceso: riesgo.proceso,
          tipo_peligro: riesgo.tipo_peligro,
          nivel_riesgo: riesgo.nivel_riesgo
        }
      });
    }
  }

  items.sort((left, right) => {
    const leftWeight = left.severidad === 'CRITICA' ? 2 : 1;
    const rightWeight = right.severidad === 'CRITICA' ? 2 : 1;

    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight;
    }

    return right.riesgo.nivel_riesgo - left.riesgo.nivel_riesgo;
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_RIESGO_ALERTAS_VIEW',
    tabla: 'sst_matriz_riesgos',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de matriz de riesgos',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return {
    items: pagedItems,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: items.length,
      total_pages: items.length === 0 ? 0 : Math.ceil(items.length / filters.limit)
    }
  };
};

export const listSstMatrizRiesgosForExpediente = async (
  input: {
    contratoIds: number[];
    empresaIds: number[];
  },
  tenant?: TenantAccessContext
): Promise<SstMatrizRiesgo[]> => {
  const params: unknown[] = [];
  const conditions: string[] = ['COALESCE(smr.activo, TRUE) = TRUE'];

  appendTenantScopeConditions(conditions, params, tenant, 'smr.contrato_id', 'smr.empresa_id');
  conditions.push(
    buildExpedienteScopeClause(params, input.contratoIds, input.empresaIds, 'smr.contrato_id', 'smr.empresa_id')
  );

  const result = await dbQuery<SstMatrizRiesgoRow>(
    `
      ${getSstMatrizRiesgoSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY smr.nivel_riesgo DESC, smr.id DESC
    `,
    params
  );

  return result.rows.map(mapSstMatrizRiesgo);
};
