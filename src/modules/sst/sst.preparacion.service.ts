import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import type {
  ListSstPendingCaptureQuery,
  ListSstPreparationPlanQuery,
  ListSstReviewCasesQuery,
  ResolveSstReviewCaseInput
} from './sst.preparacion.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface PreparationSummaryRow extends QueryResultRow {
  automaticos: number;
  parciales: number;
  revision: number;
  sin_datos: number;
  pendientes_captura: number;
  contactos_propuestos: number;
  formacion_propuesta: number;
  afiliaciones_propuestas: number;
}

interface ReviewCaseRow extends QueryResultRow {
  id: number | string;
  preparacion_id: number | string | null;
  persona_id: number | string | null;
  contrato_id: number | string | null;
  empresa_id: number | string | null;
  documento: string;
  persona_nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  cargo: string | null;
  tipo_conflicto: 'FORMULARIOS' | 'DUPLICADO_F2' | 'AFILIACION';
  campo: string;
  fuente_a: string;
  valor_a: string | null;
  fuente_b: string;
  valor_b: string | null;
  recomendacion: string | null;
  decision: string | null;
  valor_resuelto: string | null;
  estado: 'PENDIENTE' | 'RESUELTO' | 'DESCARTADO';
  observacion: string | null;
  fecha_resolucion: Date | null;
  resuelto_por_user_id: number | string | null;
  updated_at: Date;
}

interface PreparationRow extends QueryResultRow {
  id: number | string;
  persona_id: number | string;
  vinculacion_id: number | string | null;
  empresa_id: number | string;
  contrato_id: number | string;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  cargo: string | null;
  fuente_formulario_1: boolean;
  fuente_formulario_2: boolean;
  estado_digital: string;
  estado_preparacion: string;
  porcentaje_completitud: number;
  completitud_estado: string;
  conflictos_aparentes: number;
  conflictos_reales: number;
  requiere_revision_humana: boolean;
  requiere_captura: boolean;
  apto_apply: boolean;
  propuesta_sst: Record<string, unknown>;
  propuesta_contacto_emergencia: Record<string, unknown>;
  propuesta_formacion_academica: Array<Record<string, unknown>>;
  propuesta_afiliaciones: Array<Record<string, unknown>>;
  campos_restringidos: Array<string> | Record<string, unknown>;
  fuentes: Array<string>;
  origen_principal: string;
  observaciones: string | null;
}

export interface SstPreparationSummary {
  automaticos: number;
  parciales: number;
  revision: number;
  sin_datos: number;
  pendientes_captura: number;
  contactos_propuestos: number;
  formacion_propuesta: number;
  afiliaciones_propuestas: number;
}

export interface SstReviewCaseItem {
  id: number;
  preparacion_id: number | null;
  persona_id: number | null;
  contrato_id: number | null;
  empresa_id: number | null;
  documento: string;
  persona_nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  cargo: string | null;
  tipo_conflicto: 'FORMULARIOS' | 'DUPLICADO_F2' | 'AFILIACION';
  campo: string;
  fuente_a: string;
  valor_a: string | null;
  fuente_b: string;
  valor_b: string | null;
  recomendacion: string | null;
  decision: string | null;
  valor_resuelto: string | null;
  estado: 'PENDIENTE' | 'RESUELTO' | 'DESCARTADO';
  observacion: string | null;
  fecha_resolucion: string | null;
  resuelto_por_user_id: number | null;
  updated_at: string;
}

export interface SstPreparationPlanItem {
  id: number;
  persona_id: number;
  vinculacion_id: number | null;
  contrato_id: number;
  empresa_id: number;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  cargo: string | null;
  fuente_formulario_1: boolean;
  fuente_formulario_2: boolean;
  estado_digital: string;
  estado_preparacion: string;
  porcentaje_completitud: number;
  completitud_estado: string;
  requiere_captura: boolean;
  apto_apply: boolean;
  conflictos_reales: number;
  propuesta_sst: Record<string, unknown>;
  propuesta_contacto_emergencia: Record<string, unknown>;
  propuesta_formacion_academica: Array<Record<string, unknown>>;
  propuesta_afiliaciones: Array<Record<string, unknown>>;
  campos_restringidos: Array<string> | Record<string, unknown>;
  fuentes: Array<string>;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRequiredNumber = (value: string | number | null | undefined, code = 'INVALID_NUMERIC_VALUE'): number => {
  const parsed = toNumber(value);
  if (parsed === null) {
    throw new AppError('Invalid numeric value returned by database', 500, code);
  }
  return parsed;
};

const buildTenantFilter = (
  tenant: TenantAccessContext | undefined,
  params: unknown[],
  alias: string
): string[] => {
  if (!tenant || tenant.isGlobalAdmin) {
    return [];
  }

  if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
    return ['1 = 0'];
  }

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    return [`${alias}.contrato_id = ANY($${params.length}::bigint[])`];
  }

  params.push(tenant.empresaIds);
  return [`${alias}.empresa_id = ANY($${params.length}::bigint[])`];
};

const mapReviewCase = (row: ReviewCaseRow): SstReviewCaseItem => ({
  id: toRequiredNumber(row.id),
  preparacion_id: toNumber(row.preparacion_id),
  persona_id: toNumber(row.persona_id),
  contrato_id: toNumber(row.contrato_id),
  empresa_id: toNumber(row.empresa_id),
  documento: row.documento,
  persona_nombre: row.persona_nombre,
  municipio: row.municipio,
  institucion: row.institucion,
  sede: row.sede,
  cargo: row.cargo,
  tipo_conflicto: row.tipo_conflicto,
  campo: row.campo,
  fuente_a: row.fuente_a,
  valor_a: row.valor_a,
  fuente_b: row.fuente_b,
  valor_b: row.valor_b,
  recomendacion: row.recomendacion,
  decision: row.decision,
  valor_resuelto: row.valor_resuelto,
  estado: row.estado,
  observacion: row.observacion,
  fecha_resolucion: row.fecha_resolucion?.toISOString() ?? null,
  resuelto_por_user_id: toNumber(row.resuelto_por_user_id),
  updated_at: row.updated_at.toISOString()
});

const mapPreparation = (row: PreparationRow): SstPreparationPlanItem => ({
  id: toRequiredNumber(row.id),
  persona_id: toRequiredNumber(row.persona_id),
  vinculacion_id: toNumber(row.vinculacion_id),
  contrato_id: toRequiredNumber(row.contrato_id),
  empresa_id: toRequiredNumber(row.empresa_id),
  documento: row.documento,
  nombre: row.nombre,
  municipio: row.municipio,
  institucion: row.institucion,
  sede: row.sede,
  modalidad: row.modalidad,
  cargo: row.cargo,
  fuente_formulario_1: row.fuente_formulario_1,
  fuente_formulario_2: row.fuente_formulario_2,
  estado_digital: row.estado_digital,
  estado_preparacion: row.estado_preparacion,
  porcentaje_completitud: row.porcentaje_completitud,
  completitud_estado: row.completitud_estado,
  requiere_captura: row.requiere_captura,
  apto_apply: row.apto_apply,
  conflictos_reales: row.conflictos_reales,
  propuesta_sst: row.propuesta_sst ?? {},
  propuesta_contacto_emergencia: row.propuesta_contacto_emergencia ?? {},
  propuesta_formacion_academica: row.propuesta_formacion_academica ?? [],
  propuesta_afiliaciones: row.propuesta_afiliaciones ?? [],
  campos_restringidos: row.campos_restringidos ?? [],
  fuentes: row.fuentes ?? []
});

const buildPagination = <T>(items: T[], page: number, limit: number, total: number): PaginatedResult<T> => ({
  items,
  pagination: {
    page,
    limit,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / limit)
  }
});

export const getSstPreparationSummary = async (
  tenant?: TenantAccessContext
): Promise<SstPreparationSummary> => {
  const params: unknown[] = [];
  const conditions = ['sp.activo = TRUE', ...buildTenantFilter(tenant, params, 'sp')];
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await dbQuery<PreparationSummaryRow>(
    `
      SELECT
        COUNT(*) FILTER (WHERE sp.estado_preparacion = 'APTO_APPLY_AUTOMATICO')::int AS automaticos,
        COUNT(*) FILTER (WHERE sp.estado_preparacion = 'APTO_APPLY_PARCIAL')::int AS parciales,
        COUNT(*) FILTER (WHERE sp.estado_preparacion = 'REQUIERE_REVISION')::int AS revision,
        COUNT(*) FILTER (WHERE sp.estado_preparacion = 'SIN_DATOS_DIGITALES')::int AS sin_datos,
        COUNT(*) FILTER (WHERE sp.requiere_captura = TRUE)::int AS pendientes_captura,
        COUNT(*) FILTER (
          WHERE jsonb_typeof(sp.propuesta_contacto_emergencia) = 'object'
            AND sp.propuesta_contacto_emergencia <> '{}'::jsonb
        )::int AS contactos_propuestos,
        COALESCE(SUM(jsonb_array_length(sp.propuesta_formacion_academica)), 0)::int AS formacion_propuesta,
        COALESCE(SUM(jsonb_array_length(sp.propuesta_afiliaciones)), 0)::int AS afiliaciones_propuestas
      FROM sst_preparacion_personas sp
      ${whereClause}
    `,
    params
  );

  const row = result.rows[0];
  return {
    automaticos: row?.automaticos ?? 0,
    parciales: row?.parciales ?? 0,
    revision: row?.revision ?? 0,
    sin_datos: row?.sin_datos ?? 0,
    pendientes_captura: row?.pendientes_captura ?? 0,
    contactos_propuestos: row?.contactos_propuestos ?? 0,
    formacion_propuesta: row?.formacion_propuesta ?? 0,
    afiliaciones_propuestas: row?.afiliaciones_propuestas ?? 0
  };
};

export const listSstReviewCases = async (
  query: ListSstReviewCasesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResult<SstReviewCaseItem>> => {
  const params: unknown[] = [];
  const conditions = ['sr.activo = TRUE', ...buildTenantFilter(tenant, params, 'sr')];

  if (query.tipo === 'DIGITAL') {
    conditions.push(`sr.tipo_conflicto IN ('FORMULARIOS', 'DUPLICADO_F2')`);
  } else if (query.tipo === 'AFILIACION') {
    conditions.push(`sr.tipo_conflicto = 'AFILIACION'`);
  }

  if (query.campo) {
    params.push(query.campo.trim().toLowerCase());
    conditions.push(`LOWER(sr.campo) = $${params.length}`);
  }

  if (query.municipio) {
    params.push(`%${query.municipio.trim().toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(sr.municipio, '')) LIKE $${params.length}`);
  }

  if (query.estado !== 'TODOS') {
    params.push(query.estado);
    conditions.push(`sr.estado = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await dbQuery<CountRow>(
    `SELECT COUNT(*)::int AS total FROM sst_revision_casos sr ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<ReviewCaseRow>(
    `
      SELECT
        sr.id,
        sr.preparacion_id,
        sr.persona_id,
        sr.contrato_id,
        sr.empresa_id,
        sr.documento,
        sr.persona_nombre,
        sr.municipio,
        sr.institucion,
        sr.sede,
        sr.cargo,
        sr.tipo_conflicto,
        sr.campo,
        sr.fuente_a,
        sr.valor_a,
        sr.fuente_b,
        sr.valor_b,
        sr.recomendacion,
        sr.decision,
        sr.valor_resuelto,
        sr.estado,
        sr.observacion,
        sr.fecha_resolucion,
        sr.resuelto_por_user_id,
        sr.updated_at
      FROM sst_revision_casos sr
      ${whereClause}
      ORDER BY
        CASE WHEN sr.estado = 'PENDIENTE' THEN 0 ELSE 1 END,
        sr.municipio ASC NULLS LAST,
        sr.persona_nombre ASC,
        sr.id ASC
      LIMIT $${listParams.length - 1}::int
      OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return buildPagination(result.rows.map(mapReviewCase), query.page, query.limit, total);
};

export const listSstPreparationPlan = async (
  query: ListSstPreparationPlanQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResult<SstPreparationPlanItem>> => {
  const params: unknown[] = [];
  const conditions = ['sp.activo = TRUE', ...buildTenantFilter(tenant, params, 'sp')];

  if (query.estado !== 'TODOS') {
    params.push(query.estado);
    conditions.push(`sp.estado_preparacion = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await dbQuery<CountRow>(
    `SELECT COUNT(*)::int AS total FROM sst_preparacion_personas sp ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<PreparationRow>(
    `
      SELECT
        sp.id,
        sp.persona_id,
        sp.vinculacion_id,
        sp.empresa_id,
        sp.contrato_id,
        sp.documento,
        sp.nombre,
        sp.municipio,
        sp.institucion,
        sp.sede,
        sp.modalidad,
        sp.cargo,
        sp.fuente_formulario_1,
        sp.fuente_formulario_2,
        sp.estado_digital,
        sp.estado_preparacion,
        sp.porcentaje_completitud,
        sp.completitud_estado,
        sp.conflictos_aparentes,
        sp.conflictos_reales,
        sp.requiere_revision_humana,
        sp.requiere_captura,
        sp.apto_apply,
        sp.propuesta_sst,
        sp.propuesta_contacto_emergencia,
        sp.propuesta_formacion_academica,
        sp.propuesta_afiliaciones,
        sp.campos_restringidos,
        sp.fuentes,
        sp.origen_principal,
        sp.observaciones
      FROM sst_preparacion_personas sp
      ${whereClause}
      ORDER BY
        CASE sp.estado_preparacion
          WHEN 'APTO_APPLY_AUTOMATICO' THEN 0
          WHEN 'APTO_APPLY_PARCIAL' THEN 1
          WHEN 'REQUIERE_REVISION' THEN 2
          ELSE 3
        END,
        sp.municipio ASC NULLS LAST,
        sp.nombre ASC,
        sp.id ASC
      LIMIT $${listParams.length - 1}::int
      OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return buildPagination(result.rows.map(mapPreparation), query.page, query.limit, total);
};

export const listSstPendingCapture = async (
  query: ListSstPendingCaptureQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResult<SstPreparationPlanItem>> => {
  const plan = await listSstPreparationPlan(
    {
      page: query.page,
      limit: query.limit,
      estado: 'SIN_DATOS_DIGITALES'
    },
    tenant
  );

  if (!query.municipio) {
    return plan;
  }

  const filtered = plan.items.filter((item) =>
    (item.municipio ?? '').toLowerCase().includes(query.municipio!.trim().toLowerCase())
  );

  return buildPagination(filtered, query.page, query.limit, filtered.length);
};

const getReviewCaseRow = async (client: PoolClient, id: number): Promise<ReviewCaseRow | null> => {
  const result = await client.query<ReviewCaseRow>(
    `
      SELECT
        id,
        preparacion_id,
        persona_id,
        contrato_id,
        empresa_id,
        documento,
        persona_nombre,
        municipio,
        institucion,
        sede,
        cargo,
        tipo_conflicto,
        campo,
        fuente_a,
        valor_a,
        fuente_b,
        valor_b,
        recomendacion,
        decision,
        valor_resuelto,
        estado,
        observacion,
        fecha_resolucion,
        resuelto_por_user_id,
        updated_at
      FROM sst_revision_casos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] ?? null;
};

export const resolveSstReviewCase = async (
  id: number,
  input: ResolveSstReviewCaseInput,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<SstReviewCaseItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await getReviewCaseRow(client, id);
    if (!current) {
      throw new AppError('Caso de revision SST no encontrado', 404, 'SST_REVIEW_CASE_NOT_FOUND');
    }

    const tenantConditions = buildTenantFilter(tenant, [], 'sr');
    if (tenantConditions.length > 0) {
      const allowed =
        (!tenant?.contratoIds.length || tenant.contratoIds.includes(toRequiredNumber(current.contrato_id))) ||
        (!tenant?.empresaIds.length || tenant.empresaIds.includes(toRequiredNumber(current.empresa_id)));
      if (!allowed && !tenant?.isGlobalAdmin) {
        throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
      }
    }

    const nextState = input.decision === 'DESCARTAR_CAMBIO' ? 'DESCARTADO' : 'RESUELTO';
    const resolvedValue =
      input.decision === 'USAR_FUENTE_A'
        ? current.valor_a
        : input.decision === 'USAR_FUENTE_B'
          ? current.valor_b
          : input.decision === 'MANTENER_MAESTRO'
            ? current.valor_a
            : input.decision === 'DESCARTAR_CAMBIO'
              ? null
              : input.valor_resuelto ?? null;

    await client.query(
      `
        UPDATE sst_revision_casos
        SET
          decision = $2,
          valor_resuelto = $3,
          estado = $4,
          observacion = $5,
          resuelto_por_user_id = $6::bigint,
          fecha_resolucion = NOW(),
          updated_by_user_id = $6::bigint,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id, input.decision, resolvedValue, nextState, input.observacion ?? null, Number(actorUserId)]
    );

    const updated = await getReviewCaseRow(client, id);
    if (!updated) {
      throw new AppError('No fue posible recargar el caso resuelto', 500, 'SST_REVIEW_CASE_RELOAD_FAILED');
    }

    await registerAuditEntry({
      client,
      accion: 'SST_REVISION_CASO_RESOLVER',
      tabla: 'sst_revision_casos',
      registro_id: String(id),
      descripcion: input.observacion ?? `Decision ${input.decision} registrada para conflicto SST`,
      usuario_id: actorUserId,
      before: mapReviewCase(current),
      after: mapReviewCase(updated)
    });

    await client.query('COMMIT');
    return mapReviewCase(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
