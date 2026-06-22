import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import {
  assertTenantAccessForPersonaId,
  TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  CreateSstPlanAnualActividadInput,
  CreateSstPlanAnualInput,
  ListSstPlanAnualActividadesQuery,
  ListSstPlanAnualAlertasQuery,
  ListSstPlanAnualDashboardQuery,
  ListSstPlanAnualQuery,
  SstPlanAnualActividadEstado,
  SstPlanAnualActividadEstadoAlerta,
  SstPlanAnualEstado,
  UpdateSstPlanAnualActividadInput,
  UpdateSstPlanAnualInput
} from './sst.schemas';
import { ensureContratoExists, ensureEmpresaExists } from './sst.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface SstContratoScopeRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

interface DocumentoPersonaLookupRow extends QueryResultRow {
  id: string;
  persona_id: string;
}

interface SstPlanAnualRow extends QueryResultRow {
  activo: boolean | null;
  anio: number;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  empresa_id: string;
  empresa_nombre: string;
  estado: SstPlanAnualEstado;
  id: string;
  nombre_plan: string;
  objetivo: string | null;
  presupuesto: number | string | null;
}

interface SstPlanAnualActividadRow extends QueryResultRow {
  activo: boolean | null;
  actividad: string;
  created_at: Date | string;
  descripcion: string | null;
  documento_archivo_path: string | null;
  documento_id: string | null;
  documento_mime_type: string | null;
  documento_nombre_original: string | null;
  documento_storage_bucket: string | null;
  documento_storage_path: string | null;
  documento_tamano_bytes: string | number | null;
  estado: SstPlanAnualActividadEstado;
  estado_alerta: SstPlanAnualActividadEstadoAlerta;
  fecha_ejecucion: Date | string | null;
  fecha_programada: Date | string;
  id: string;
  observacion: string | null;
  plan_activo: boolean | null;
  plan_anio: number;
  plan_contrato_id: string | null;
  plan_contrato_numero: string | null;
  plan_created_at: Date | string;
  plan_empresa_id: string;
  plan_empresa_nombre: string;
  plan_estado: SstPlanAnualEstado;
  plan_id: string;
  plan_nombre: string;
  plan_objetivo: string | null;
  plan_presupuesto: number | string | null;
  porcentaje_avance: number;
  presupuesto: number | string | null;
  responsable: string;
}

interface AggregatePlanAnnualRow extends QueryResultRow {
  anio: number;
  presupuesto_total: number | string | null;
  total_planes: number;
}

interface AggregatePlanAnnualActivitiesRow extends QueryResultRow {
  actividades_total: number;
  cumplimiento_porcentaje: number | string | null;
  ejecutadas: number;
  en_proceso: number;
  pendientes: number;
  presupuesto_ejecutado: number | string | null;
  vencidas: number;
}

export interface SstPlanAnual {
  activo: boolean;
  anio: number;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  empresa: {
    id: number;
    nombre_empresa: string;
  };
  estado: SstPlanAnualEstado;
  id: number;
  nombre_plan: string;
  objetivo: string | null;
  presupuesto: number | null;
}

export interface PaginatedSstPlanAnual {
  items: SstPlanAnual[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface SstPlanAnualActividad {
  activo: boolean;
  actividad: string;
  created_at: string;
  descripcion: string | null;
  documento_persona: {
    archivo_path: string | null;
    id: number;
    mime_type: string | null;
    nombre_original: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    tamano_bytes: number | null;
  } | null;
  estado: SstPlanAnualActividadEstado;
  estado_alerta: SstPlanAnualActividadEstadoAlerta;
  fecha_ejecucion: string | null;
  fecha_programada: string;
  id: number;
  observacion: string | null;
  plan: SstPlanAnual;
  porcentaje_avance: number;
  presupuesto: number | null;
  responsable: string;
}

export interface PaginatedSstPlanAnualActividades {
  items: SstPlanAnualActividad[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface SstPlanAnualDashboard {
  actividades_total: number;
  cumplimiento_porcentaje: number;
  ejecutadas: number;
  en_proceso: number;
  pendientes: number;
  planes_total: number;
  presupuesto_ejecutado: number;
  presupuesto_total: number;
  vencidas: number;
}

export interface SstPlanAnualAlerta {
  actividad: {
    id: number;
    nombre: string;
    responsable: string;
  };
  descripcion: string;
  dias_restantes: number | null;
  estado: 'ACTIVA';
  fecha_alerta: string;
  fecha_programada: string;
  id: string;
  plan: {
    anio: number;
    id: number;
    nombre_plan: string;
  };
  severidad: 'MEDIA' | 'ALTA';
  tipo_alerta: 'ACTIVIDAD_PROXIMA_VENCER' | 'ACTIVIDAD_VENCIDA';
}

export interface PaginatedSstPlanAnualAlertas {
  items: SstPlanAnualAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

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

const toNullableDecimalNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDateIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const getDateAfter30Days = (): string => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 30);
  return value.toISOString().slice(0, 10);
};

const calculateDaysRemaining = (dateValue: string | null): number | null => {
  if (!dateValue) {
    return null;
  }

  const current = new Date(`${getTodayDateOnly()}T00:00:00.000Z`);
  const target = new Date(`${dateValue}T00:00:00.000Z`);
  const diff = target.getTime() - current.getTime();
  return Math.ceil(diff / 86400000);
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
  filters: { contrato_id?: string | number | null; empresa_id?: string | number | null }
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (
    filters.contrato_id !== undefined &&
    filters.contrato_id !== null &&
    !tenant.contratoIds.includes(Number(filters.contrato_id))
  ) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (
    filters.empresa_id !== undefined &&
    filters.empresa_id !== null &&
    !tenant.empresaIds.includes(Number(filters.empresa_id))
  ) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

const getSstPlanAnualSelect = (): string => {
  return `
    SELECT
      spa.id::text AS id,
      spa.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      spa.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      spa.anio,
      spa.nombre_plan,
      spa.objetivo,
      spa.presupuesto,
      spa.estado,
      spa.activo,
      spa.created_at
    FROM sst_plan_anual spa
    INNER JOIN empresas e ON e.id = spa.empresa_id
    LEFT JOIN contratos c ON c.id = spa.contrato_id
  `;
};

const getSstPlanAnualActividadSelect = (): string => {
  return `
    SELECT
      spaa.id::text AS id,
      spaa.actividad,
      spaa.descripcion,
      spaa.responsable,
      spaa.fecha_programada,
      spaa.fecha_ejecucion,
      spaa.presupuesto,
      spaa.porcentaje_avance,
      spaa.estado,
      CASE
        WHEN spaa.estado = 'CANCELADA' THEN 'cancelada'
        WHEN spaa.estado = 'EJECUTADA' OR spaa.fecha_ejecucion IS NOT NULL THEN 'ejecutada'
        WHEN spaa.estado = 'VENCIDA' THEN 'vencida'
        WHEN spaa.fecha_programada < CURRENT_DATE THEN 'vencida'
        WHEN spaa.fecha_programada <= CURRENT_DATE + 30 THEN 'proxima_a_vencer'
        ELSE 'vigente'
      END AS estado_alerta,
      spaa.documento_persona_id::text AS documento_id,
      spaa.observacion,
      spaa.activo,
      spaa.created_at,
      spa.id::text AS plan_id,
      spa.empresa_id::text AS plan_empresa_id,
      e.nombre_empresa AS plan_empresa_nombre,
      spa.contrato_id::text AS plan_contrato_id,
      c.numero_contrato AS plan_contrato_numero,
      spa.anio AS plan_anio,
      spa.nombre_plan AS plan_nombre,
      spa.objetivo AS plan_objetivo,
      spa.presupuesto AS plan_presupuesto,
      spa.estado AS plan_estado,
      spa.activo AS plan_activo,
      spa.created_at AS plan_created_at,
      dp.archivo_path AS documento_archivo_path,
      dp.nombre_original AS documento_nombre_original,
      dp.mime_type AS documento_mime_type,
      dp.storage_bucket AS documento_storage_bucket,
      dp.storage_path AS documento_storage_path,
      dp.tamano_bytes AS documento_tamano_bytes
    FROM sst_plan_anual_actividades spaa
    INNER JOIN sst_plan_anual spa ON spa.id = spaa.plan_id
    INNER JOIN empresas e ON e.id = spa.empresa_id
    LEFT JOIN contratos c ON c.id = spa.contrato_id
    LEFT JOIN documentos_persona dp ON dp.id = spaa.documento_persona_id
  `;
};

const mapSstPlanAnual = (row: SstPlanAnualRow): SstPlanAnual => {
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
    anio: row.anio,
    nombre_plan: row.nombre_plan,
    objetivo: row.objetivo,
    presupuesto: toNullableDecimalNumber(row.presupuesto),
    estado: row.estado,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstPlanAnualActividad = (row: SstPlanAnualActividadRow): SstPlanAnualActividad => {
  return {
    id: toBigintNumber(row.id),
    plan: {
      id: toBigintNumber(row.plan_id),
      empresa: {
        id: toBigintNumber(row.plan_empresa_id),
        nombre_empresa: row.plan_empresa_nombre
      },
      contrato: {
        id: toNullableBigintNumber(row.plan_contrato_id),
        numero_contrato: row.plan_contrato_numero
      },
      anio: row.plan_anio,
      nombre_plan: row.plan_nombre,
      objetivo: row.plan_objetivo,
      presupuesto: toNullableDecimalNumber(row.plan_presupuesto),
      estado: row.plan_estado,
      activo: toBooleanValue(row.plan_activo),
      created_at:
        row.plan_created_at instanceof Date
          ? row.plan_created_at.toISOString()
          : String(row.plan_created_at)
    },
    actividad: row.actividad,
    descripcion: row.descripcion,
    responsable: row.responsable,
    fecha_programada: toDateIsoString(row.fecha_programada) ?? '',
    fecha_ejecucion: toDateIsoString(row.fecha_ejecucion),
    presupuesto: toNullableDecimalNumber(row.presupuesto),
    porcentaje_avance: row.porcentaje_avance,
    estado: row.estado,
    estado_alerta: row.estado_alerta,
    documento_persona: row.documento_id
      ? {
          id: toBigintNumber(row.documento_id),
          archivo_path: row.documento_archivo_path,
          nombre_original: row.documento_nombre_original,
          mime_type: row.documento_mime_type,
          storage_bucket: row.documento_storage_bucket,
          storage_path: row.documento_storage_path,
          tamano_bytes: toNullableBigintNumber(row.documento_tamano_bytes)
        }
      : null,
    observacion: row.observacion,
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
        c.id::text AS id,
        c.empresa_id::text AS empresa_id
      FROM contratos c
      WHERE c.id::text = $1
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

const validatePlanAnualScope = async (input: {
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

    if (contratoScope.empresa_id !== null && contratoScope.empresa_id !== empresaId) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'SST_PLAN_ANUAL_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, toBigintNumber(input.empresaId));
};

const assertDocumentoPersonaAccess = async (
  documentoPersonaId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<void> => {
  const executor = client ?? dbPool;
  const result = await executor.query<DocumentoPersonaLookupRow>(
    `
      SELECT
        dp.id::text AS id,
        dp.persona_id::text AS persona_id
      FROM documentos_persona dp
      WHERE dp.id::text = $1
      LIMIT 1
    `,
    [documentoPersonaId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Documento persona not found', 400, 'DOCUMENTO_PERSONA_NOT_FOUND');
  }

  await assertTenantAccessForPersonaId(tenant, row.persona_id);
};

const ensureSstPlanAnualExists = async (
  planId: string,
  client?: PoolClient
): Promise<SstPlanAnualRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstPlanAnualRow>(
    `
      ${getSstPlanAnualSelect()}
      WHERE spa.id::text = $1
      LIMIT 1
    `,
    [planId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST annual plan not found', 404, 'SST_PLAN_ANUAL_NOT_FOUND');
  }

  return row;
};

const ensureSstPlanAnualActividadExists = async (
  actividadId: string,
  client?: PoolClient
): Promise<SstPlanAnualActividadRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstPlanAnualActividadRow>(
    `
      ${getSstPlanAnualActividadSelect()}
      WHERE spaa.id::text = $1
      LIMIT 1
    `,
    [actividadId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST annual plan activity not found', 404, 'SST_PLAN_ANUAL_ACTIVIDAD_NOT_FOUND');
  }

  return row;
};

const buildSstPlanAnualWhere = (
  filters: ListSstPlanAnualQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'spa.contrato_id', 'spa.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`spa.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`spa.contrato_id::text = $${params.length}`);
  }

  if (filters.anio !== undefined && filters.anio !== null) {
    params.push(filters.anio);
    conditions.push(`spa.anio = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`spa.estado = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(spa.activo, TRUE) = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(spa.nombre_plan ILIKE $${params.length} OR COALESCE(spa.objetivo, '') ILIKE $${params.length})`
    );
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstPlanAnualActividadesWhere = (
  planId: string,
  filters: ListSstPlanAnualActividadesQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = ['spaa.plan_id::text = $1'];
  const params: unknown[] = [planId];

  appendTenantScopeConditions(conditions, params, tenant, 'spa.contrato_id', 'spa.empresa_id');

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`spaa.estado = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(spaa.activo, TRUE) = $${params.length}`);
  }

  if (filters.estado_alerta) {
    params.push(filters.estado_alerta);
    conditions.push(
      `(
        CASE
          WHEN spaa.estado = 'CANCELADA' THEN 'cancelada'
          WHEN spaa.estado = 'EJECUTADA' OR spaa.fecha_ejecucion IS NOT NULL THEN 'ejecutada'
          WHEN spaa.estado = 'VENCIDA' THEN 'vencida'
          WHEN spaa.fecha_programada < CURRENT_DATE THEN 'vencida'
          WHEN spaa.fecha_programada <= CURRENT_DATE + 30 THEN 'proxima_a_vencer'
          ELSE 'vigente'
        END
      ) = $${params.length}`
    );
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(spaa.actividad ILIKE $${params.length} OR COALESCE(spaa.descripcion, '') ILIKE $${params.length} OR spaa.responsable ILIKE $${params.length})`
    );
  }

  return {
    params,
    whereClause: `WHERE ${conditions.join(' AND ')}`
  };
};

const buildPlanScopeConditions = (
  filters: {
    anio?: number | null;
    contrato_id?: string | number | null;
    empresa_id?: string | number | null;
  },
  tenant?: TenantAccessContext
): { conditions: string[]; params: unknown[] } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'spa.contrato_id', 'spa.empresa_id');

  if (filters.empresa_id !== undefined && filters.empresa_id !== null) {
    params.push(filters.empresa_id);
    conditions.push(`spa.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id !== undefined && filters.contrato_id !== null) {
    params.push(filters.contrato_id);
    conditions.push(`spa.contrato_id::text = $${params.length}`);
  }

  if (filters.anio !== undefined && filters.anio !== null) {
    params.push(filters.anio);
    conditions.push(`spa.anio = $${params.length}`);
  }

  return { conditions, params };
};

const normalizeCreateActividadState = (
  input: CreateSstPlanAnualActividadInput
): { estado: SstPlanAnualActividadEstado; fecha_ejecucion: string | null; porcentaje_avance: number } => {
  const fechaEjecucion = input.fecha_ejecucion ?? null;
  const estado = input.estado ?? (fechaEjecucion ? 'EJECUTADA' : 'PENDIENTE');

  if (estado === 'EJECUTADA' && !fechaEjecucion) {
    throw new AppError(
      'fecha_ejecucion is required when estado is EJECUTADA',
      400,
      'SST_PLAN_ANUAL_ACTIVIDAD_INVALID_EJECUCION'
    );
  }

  return {
    estado,
    fecha_ejecucion: fechaEjecucion,
    porcentaje_avance: estado === 'EJECUTADA' ? 100 : input.porcentaje_avance
  };
};

const normalizeUpdateActividadState = (
  current: SstPlanAnualActividad,
  input: UpdateSstPlanAnualActividadInput
): { estado: SstPlanAnualActividadEstado; fecha_ejecucion: string | null; porcentaje_avance: number } => {
  const nextFechaEjecucion =
    input.fecha_ejecucion !== undefined ? input.fecha_ejecucion : current.fecha_ejecucion;
  let nextEstado = input.estado ?? current.estado;

  if (input.estado === undefined && input.fecha_ejecucion !== undefined && nextFechaEjecucion && nextEstado !== 'CANCELADA') {
    nextEstado = 'EJECUTADA';
  }

  if (nextEstado === 'EJECUTADA' && !nextFechaEjecucion) {
    throw new AppError(
      'fecha_ejecucion is required when estado is EJECUTADA',
      400,
      'SST_PLAN_ANUAL_ACTIVIDAD_INVALID_EJECUCION'
    );
  }

  const nextPorcentajeBase =
    input.porcentaje_avance !== undefined ? input.porcentaje_avance : current.porcentaje_avance;

  return {
    estado: nextEstado,
    fecha_ejecucion: nextFechaEjecucion,
    porcentaje_avance: nextEstado === 'EJECUTADA' ? 100 : nextPorcentajeBase
  };
};

export const listSstPlanAnual = async (
  filters: ListSstPlanAnualQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstPlanAnual> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const { params, whereClause } = buildSstPlanAnualWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_plan_anual spa
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstPlanAnualRow>(
    `
      ${getSstPlanAnualSelect()}
      ${whereClause}
      ORDER BY spa.anio DESC, spa.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstPlanAnual),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstPlanAnual = async (
  input: CreateSstPlanAnualInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnual> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validatePlanAnualScope({
      client,
      empresaId: input.empresa_id,
      contratoId: input.contrato_id,
      tenant
    });

    const insertResult = await client.query<{ id: string }>(
      `
        INSERT INTO sst_plan_anual (
          empresa_id,
          contrato_id,
          anio,
          nombre_plan,
          objetivo,
          presupuesto,
          estado,
          activo
        )
        VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8)
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.anio,
        input.nombre_plan,
        input.objetivo,
        input.presupuesto,
        input.estado,
        input.activo
      ]
    );

    const createdId = insertResult.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST annual plan', 500, 'SST_PLAN_ANUAL_CREATE_FAILED');
    }

    const created = mapSstPlanAnual(await ensureSstPlanAnualExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_PLAN_CREATE',
      tabla: 'sst_plan_anual',
      registro_id: String(created.id),
      descripcion: 'Creacion de plan anual SST',
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

export const updateSstPlanAnual = async (
  planId: string,
  input: UpdateSstPlanAnualInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnual> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstPlanAnualExists(planId, client);
    const current = mapSstPlanAnual(currentRow);

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);

    await validatePlanAnualScope({
      client,
      empresaId: nextEmpresaId,
      contratoId: nextContratoId,
      tenant
    });

    await client.query(
      `
        UPDATE sst_plan_anual
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          anio = $4,
          nombre_plan = $5,
          objetivo = $6,
          presupuesto = $7,
          estado = $8,
          activo = $9
        WHERE id::text = $1
      `,
      [
        planId,
        nextEmpresaId,
        nextContratoId,
        input.anio ?? current.anio,
        input.nombre_plan ?? current.nombre_plan,
        input.objetivo !== undefined ? input.objetivo : current.objetivo,
        input.presupuesto !== undefined ? input.presupuesto : current.presupuesto,
        input.estado ?? current.estado,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstPlanAnual(await ensureSstPlanAnualExists(planId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_PLAN_UPDATE',
      tabla: 'sst_plan_anual',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de plan anual SST',
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

export const deactivateSstPlanAnual = async (
  planId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnual> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstPlanAnualExists(planId, client);
    const current = mapSstPlanAnual(currentRow);

    ensureTenantScopeForEntity(tenant, current.contrato.id, current.empresa.id);

    await client.query(
      `
        UPDATE sst_plan_anual
        SET activo = FALSE
        WHERE id::text = $1
      `,
      [planId]
    );

    const updated = mapSstPlanAnual(await ensureSstPlanAnualExists(planId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_PLAN_DEACTIVATE',
      tabla: 'sst_plan_anual',
      registro_id: String(updated.id),
      descripcion: 'Desactivacion de plan anual SST',
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

export const listSstPlanAnualActividades = async (
  planId: string,
  filters: ListSstPlanAnualActividadesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstPlanAnualActividades> => {
  const plan = mapSstPlanAnual(await ensureSstPlanAnualExists(planId));
  ensureTenantScopeForEntity(tenant, plan.contrato.id, plan.empresa.id);

  const { params, whereClause } = buildSstPlanAnualActividadesWhere(planId, filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_plan_anual_actividades spaa
      INNER JOIN sst_plan_anual spa ON spa.id = spaa.plan_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstPlanAnualActividadRow>(
    `
      ${getSstPlanAnualActividadSelect()}
      ${whereClause}
      ORDER BY spaa.fecha_programada ASC, spaa.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstPlanAnualActividad),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstPlanAnualActividad = async (
  input: CreateSstPlanAnualActividadInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnualActividad> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const plan = mapSstPlanAnual(await ensureSstPlanAnualExists(input.plan_id, client));
    ensureTenantScopeForEntity(tenant, plan.contrato.id, plan.empresa.id);

    if (input.documento_persona_id) {
      await assertDocumentoPersonaAccess(input.documento_persona_id, tenant, client);
    }

    const normalized = normalizeCreateActividadState(input);
    const insertResult = await client.query<{ id: string }>(
      `
        INSERT INTO sst_plan_anual_actividades (
          plan_id,
          actividad,
          descripcion,
          responsable,
          fecha_programada,
          fecha_ejecucion,
          presupuesto,
          porcentaje_avance,
          estado,
          documento_persona_id,
          observacion,
          activo
        )
        VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8, $9, $10::bigint, $11, $12)
        RETURNING id::text AS id
      `,
      [
        input.plan_id,
        input.actividad,
        input.descripcion,
        input.responsable,
        input.fecha_programada,
        normalized.fecha_ejecucion,
        input.presupuesto,
        normalized.porcentaje_avance,
        normalized.estado,
        input.documento_persona_id,
        input.observacion,
        input.activo
      ]
    );

    const createdId = insertResult.rows[0]?.id;

    if (!createdId) {
      throw new AppError(
        'Failed to create SST annual plan activity',
        500,
        'SST_PLAN_ANUAL_ACTIVIDAD_CREATE_FAILED'
      );
    }

    const created = mapSstPlanAnualActividad(await ensureSstPlanAnualActividadExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_PLAN_ACTIVIDAD_CREATE',
      tabla: 'sst_plan_anual_actividades',
      registro_id: String(created.id),
      descripcion: 'Creacion de actividad de plan anual SST',
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

export const updateSstPlanAnualActividad = async (
  actividadId: string,
  input: UpdateSstPlanAnualActividadInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnualActividad> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstPlanAnualActividadExists(actividadId, client);
    const current = mapSstPlanAnualActividad(currentRow);

    const nextPlanId = input.plan_id ?? String(current.plan.id);
    const nextPlan = mapSstPlanAnual(await ensureSstPlanAnualExists(nextPlanId, client));
    ensureTenantScopeForEntity(tenant, nextPlan.contrato.id, nextPlan.empresa.id);

    if (input.documento_persona_id !== undefined && input.documento_persona_id !== null) {
      await assertDocumentoPersonaAccess(input.documento_persona_id, tenant, client);
    } else if (
      input.documento_persona_id === undefined &&
      current.documento_persona?.id !== undefined &&
      current.documento_persona !== null
    ) {
      await assertDocumentoPersonaAccess(String(current.documento_persona.id), tenant, client);
    }

    const normalized = normalizeUpdateActividadState(current, input);

    await client.query(
      `
        UPDATE sst_plan_anual_actividades
        SET
          plan_id = $2::bigint,
          actividad = $3,
          descripcion = $4,
          responsable = $5,
          fecha_programada = $6,
          fecha_ejecucion = $7,
          presupuesto = $8,
          porcentaje_avance = $9,
          estado = $10,
          documento_persona_id = $11::bigint,
          observacion = $12,
          activo = $13
        WHERE id::text = $1
      `,
      [
        actividadId,
        nextPlanId,
        input.actividad ?? current.actividad,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        input.responsable ?? current.responsable,
        input.fecha_programada ?? current.fecha_programada,
        normalized.fecha_ejecucion,
        input.presupuesto !== undefined ? input.presupuesto : current.presupuesto,
        normalized.porcentaje_avance,
        normalized.estado,
        input.documento_persona_id !== undefined
          ? input.documento_persona_id
          : current.documento_persona?.id ?? null,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstPlanAnualActividad(await ensureSstPlanAnualActividadExists(actividadId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_PLAN_ACTIVIDAD_UPDATE',
      tabla: 'sst_plan_anual_actividades',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de actividad de plan anual SST',
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

export const deactivateSstPlanAnualActividad = async (
  actividadId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnualActividad> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstPlanAnualActividadExists(actividadId, client);
    const current = mapSstPlanAnualActividad(currentRow);

    ensureTenantScopeForEntity(tenant, current.plan.contrato.id, current.plan.empresa.id);

    await client.query(
      `
        UPDATE sst_plan_anual_actividades
        SET activo = FALSE
        WHERE id::text = $1
      `,
      [actividadId]
    );

    const updated = mapSstPlanAnualActividad(await ensureSstPlanAnualActividadExists(actividadId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_PLAN_ACTIVIDAD_DEACTIVATE',
      tabla: 'sst_plan_anual_actividades',
      registro_id: String(updated.id),
      descripcion: 'Desactivacion de actividad de plan anual SST',
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

export const getSstPlanAnualDashboard = async (
  filters: ListSstPlanAnualDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAnualDashboard> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const baseConditions = buildPlanScopeConditions(filters, tenant);
  const planWhereClause = baseConditions.conditions.length > 0 ? `WHERE ${baseConditions.conditions.join(' AND ')}` : '';
  const activityConditions = [...baseConditions.conditions, 'COALESCE(spaa.activo, TRUE) = TRUE'];
  const activityWhereClause =
    activityConditions.length > 0 ? `WHERE ${activityConditions.join(' AND ')}` : '';

  const [plansResult, activitiesResult] = await Promise.all([
    dbQuery<AggregatePlanAnnualRow>(
      `
        SELECT
          COUNT(*)::int AS total_planes,
          COALESCE(SUM(COALESCE(spa.presupuesto, 0)), 0)::numeric AS presupuesto_total,
          COALESCE(MAX(spa.anio), 0)::int AS anio
        FROM sst_plan_anual spa
        ${planWhereClause}
          ${planWhereClause ? 'AND' : 'WHERE'} COALESCE(spa.activo, TRUE) = TRUE
      `,
      baseConditions.params
    ),
    dbQuery<AggregatePlanAnnualActivitiesRow>(
      `
        SELECT
          COUNT(*)::int AS actividades_total,
          COUNT(*) FILTER (
            WHERE spaa.estado = 'PENDIENTE'
          )::int AS pendientes,
          COUNT(*) FILTER (
            WHERE spaa.estado = 'EN_PROCESO'
          )::int AS en_proceso,
          COUNT(*) FILTER (
            WHERE spaa.estado = 'EJECUTADA' OR spaa.fecha_ejecucion IS NOT NULL
          )::int AS ejecutadas,
          COUNT(*) FILTER (
            WHERE spaa.estado <> 'CANCELADA'
              AND (spaa.estado = 'VENCIDA' OR ((spaa.estado <> 'EJECUTADA' AND spaa.fecha_ejecucion IS NULL) AND spaa.fecha_programada < CURRENT_DATE))
          )::int AS vencidas,
          COALESCE(SUM(
            CASE
              WHEN spaa.estado = 'EJECUTADA' OR spaa.fecha_ejecucion IS NOT NULL THEN COALESCE(spaa.presupuesto, 0)
              ELSE 0
            END
          ), 0)::numeric AS presupuesto_ejecutado,
          COALESCE(AVG(spaa.porcentaje_avance::numeric), 0)::numeric AS cumplimiento_porcentaje
        FROM sst_plan_anual_actividades spaa
        INNER JOIN sst_plan_anual spa ON spa.id = spaa.plan_id
        ${activityWhereClause}
          ${activityWhereClause ? 'AND' : 'WHERE'} COALESCE(spa.activo, TRUE) = TRUE
      `,
      baseConditions.params
    )
  ]);

  const plans = plansResult.rows[0];
  const activities = activitiesResult.rows[0];

  const dashboard: SstPlanAnualDashboard = {
    planes_total: plans?.total_planes ?? 0,
    actividades_total: activities?.actividades_total ?? 0,
    pendientes: activities?.pendientes ?? 0,
    en_proceso: activities?.en_proceso ?? 0,
    ejecutadas: activities?.ejecutadas ?? 0,
    vencidas: activities?.vencidas ?? 0,
    presupuesto_total: Number(plans?.presupuesto_total ?? 0),
    presupuesto_ejecutado: Number(activities?.presupuesto_ejecutado ?? 0),
    cumplimiento_porcentaje: Math.round(Number(activities?.cumplimiento_porcentaje ?? 0) * 100) / 100
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_PLAN_DASHBOARD_VIEW',
    tabla: 'sst_plan_anual',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}:${filters.anio ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de plan anual',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

const listSstPlanAnualActividadesByScope = async (
  filters: {
    anio?: number | null;
    contrato_id?: string | number | null;
    empresa_id?: string | number | null;
  },
  tenant?: TenantAccessContext
): Promise<SstPlanAnualActividad[]> => {
  const { conditions, params } = buildPlanScopeConditions(filters, tenant);
  conditions.push('COALESCE(spa.activo, TRUE) = TRUE');
  conditions.push('COALESCE(spaa.activo, TRUE) = TRUE');

  const result = await dbQuery<SstPlanAnualActividadRow>(
    `
      ${getSstPlanAnualActividadSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY spaa.fecha_programada ASC, spaa.id DESC
    `,
    params
  );

  return result.rows.map(mapSstPlanAnualActividad);
};

export const getSstPlanAnualAlertas = async (
  filters: ListSstPlanAnualAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstPlanAnualAlertas> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const actividades = await listSstPlanAnualActividadesByScope(
    {
      empresa_id: filters.empresa_id,
      contrato_id: filters.contrato_id,
      anio: filters.anio
    },
    tenant
  );

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();
  const items: SstPlanAnualAlerta[] = [];

  for (const actividad of actividades) {
    if (actividad.estado === 'CANCELADA' || actividad.estado === 'EJECUTADA' || actividad.fecha_ejecucion) {
      continue;
    }

    if (actividad.estado_alerta === 'vencida') {
      items.push({
        id: `ACTIVIDAD_VENCIDA:${actividad.id}`,
        tipo_alerta: 'ACTIVIDAD_VENCIDA',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: actividad.fecha_programada,
        fecha_programada: actividad.fecha_programada,
        dias_restantes: calculateDaysRemaining(actividad.fecha_programada),
        plan: {
          id: actividad.plan.id,
          anio: actividad.plan.anio,
          nombre_plan: actividad.plan.nombre_plan
        },
        actividad: {
          id: actividad.id,
          nombre: actividad.actividad,
          responsable: actividad.responsable
        },
        descripcion:
          actividad.descripcion ?? 'La actividad supero la fecha programada y aun no se registra como ejecutada.'
      });
    } else if (
      actividad.estado_alerta === 'proxima_a_vencer' &&
      actividad.fecha_programada >= today &&
      actividad.fecha_programada <= thresholdDate
    ) {
      items.push({
        id: `ACTIVIDAD_PROXIMA_VENCER:${actividad.id}`,
        tipo_alerta: 'ACTIVIDAD_PROXIMA_VENCER',
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_programada: actividad.fecha_programada,
        dias_restantes: calculateDaysRemaining(actividad.fecha_programada),
        plan: {
          id: actividad.plan.id,
          anio: actividad.plan.anio,
          nombre_plan: actividad.plan.nombre_plan
        },
        actividad: {
          id: actividad.id,
          nombre: actividad.actividad,
          responsable: actividad.responsable
        },
        descripcion: actividad.descripcion ?? 'La actividad debe ejecutarse dentro de los proximos 30 dias.'
      });
    }
  }

  items.sort((left, right) => {
    const severityWeight = (value: SstPlanAnualAlerta['severidad']): number => {
      if (value === 'ALTA') return 2;
      return 1;
    };

    const diff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (diff !== 0) {
      return diff;
    }

    return left.fecha_programada.localeCompare(right.fecha_programada);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_PLAN_ALERTAS_VIEW',
    tabla: 'sst_plan_anual_actividades',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}:${filters.anio ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de plan anual',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null,
      anio: filters.anio ?? null
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
