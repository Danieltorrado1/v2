import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { buildTenantWhereClause, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  assertTenantAccessForPersonaId,
  assertTenantAccessForVinculacionId
} from '../../middlewares/tenantMiddleware';
import type { PlanMejoraEstado } from './planesMejora.schemas';
import {
  CreatePlanMejoraInput,
  CreateSeguimientoInput,
  DashboardPlanesMejoraQuery,
  ListPlanesMejoraQuery,
  UpdatePlanMejoraInput,
  UpdateSeguimientoInput
} from './planesMejora.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface EvaluacionPersonaScopeRow extends QueryResultRow {
  contrato_id: string | null;
  evaluacion_id: string;
  empresa_id: string;
  fecha_fin: Date | string;
  id: string;
  persona_id: string;
  vinculacion_id: string | null;
}

interface PlanMejoraRow extends QueryResultRow {
  activo: boolean | null;
  comentario_ultimo?: string | null;
  created_at: Date | string;
  descripcion: string | null;
  evaluacion_persona_id: string;
  fecha_cierre: Date | string | null;
  fecha_compromiso: Date | string;
  fecha_inicio: Date | string;
  estado: PlanMejoraEstado;
  objetivo: string;
  persona_id: string;
  progreso_actual: number | string | null;
  responsable: string | null;
  seguimientos_total: number | string | null;
  id: string;
  ultimo_seguimiento: Date | string | null;
  vinculacion_id: string | null;
}

interface SeguimientoRow extends QueryResultRow {
  activo: boolean | null;
  comentario: string;
  created_at: Date | string;
  fecha_seguimiento: Date | string;
  id: string;
  porcentaje_avance: number | string;
  plan_mejora_id: string;
  responsable: string | null;
}

interface PlanAlertRow extends PlanMejoraRow {
  dias_restantes: number | null;
  estado_alerta: 'PLAN_MEJORA_VENCIDO' | 'PLAN_MEJORA_PROXIMO_VENCER';
}

export interface SeguimientoItem {
  activo: boolean;
  comentario: string;
  created_at: string;
  fecha_seguimiento: string;
  id: number;
  porcentaje_avance: number;
  plan_mejora_id: number;
  responsable: string | null;
}

export interface PlanMejoraItem {
  activo: boolean;
  comentario_ultimo: string | null;
  created_at: string;
  descripcion: string | null;
  evaluacion_persona_id: number;
  fecha_cierre: string | null;
  fecha_compromiso: string;
  fecha_inicio: string;
  estado: PlanMejoraEstado;
  estado_alerta: 'VIGENTE' | 'PLAN_MEJORA_VENCIDO' | 'PLAN_MEJORA_PROXIMO_VENCER';
  id: number;
  objetivo: string;
  persona_id: number;
  progreso_actual: number;
  responsable: string | null;
  seguimientos_total: number;
  ultimo_seguimiento: string | null;
  vinculacion_id: number | null;
}

export interface PlanMejoraDashboard {
  abiertos: number;
  cancelados: number;
  cerrados: number;
  cumplimiento_porcentaje: number;
  en_proceso: number;
  planes_total: number;
  promedio_avance: number;
  seguimientos_total: number;
  vencidos: number;
}

export interface PlanMejoraAlertaItem {
  comentario_ultimo: string | null;
  created_at: string;
  dias_restantes: number | null;
  estado: PlanMejoraEstado;
  estado_alerta: 'PLAN_MEJORA_VENCIDO' | 'PLAN_MEJORA_PROXIMO_VENCER';
  fecha_compromiso: string;
  id: number;
  objetivo: string;
  persona_id: number;
  progreso_actual: number;
  responsable: string | null;
  seguimiento_ultimo: string | null;
  vinculacion_id: number | null;
}

export interface PlanMejoraExpedienteItem {
  activo: boolean;
  comentario_ultimo: string | null;
  created_at: string;
  descripcion: string | null;
  evaluacion_persona_id: number;
  estado: PlanMejoraEstado;
  fecha_cierre: string | null;
  fecha_compromiso: string;
  fecha_inicio: string;
  id: number;
  objetivo: string;
  persona_id: number;
  progreso_actual: number;
  responsable: string | null;
  seguimientos: SeguimientoItem[];
  estado_alerta: 'VIGENTE' | 'PLAN_MEJORA_VENCIDO' | 'PLAN_MEJORA_PROXIMO_VENCER';
  vinculacion_id: number | null;
}

export interface PlanesMejoraExpedienteIndicadores {
  planes_mejora_abiertos: number;
  planes_mejora_promedio_avance: number;
  planes_mejora_total: number;
  planes_mejora_vencidos: number;
}

export interface PlanesMejoraExpediente {
  indicadores: PlanesMejoraExpedienteIndicadores;
  items: PlanMejoraExpedienteItem[];
}

export interface PaginatedPlanesMejora {
  items: PlanMejoraItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toNumber = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: boolean | null | undefined): boolean => value ?? false;

const toDateString = (value: Date | string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};

const toDateStringNullable = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const buildPagination = (page: number, limit: number, total: number): PaginatedPlanesMejora['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const buildTenantScope = (
  tenant: TenantAccessContext | undefined,
  alias = 'ev'
): { params: unknown[]; sql: string } => {
  if (!tenant) {
    return { params: [], sql: '' };
  }

  return buildTenantWhereClause({
    contratoColumn: `${alias}.contrato_id`,
    empresaColumn: `${alias}.empresa_id`,
    tenant
  });
};

const scopeWhereSql = (scope: { params: unknown[]; sql: string }, filters: string[]): string => {
  const filterSql = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  if (scope.sql) {
    return `${scope.sql} ${filterSql}`.trim();
  }

  if (filters.length > 0) {
    return `WHERE ${filters.join(' AND ')}`;
  }

  return '';
};

const loadEvaluacionPersonaScope = async (
  evaluacionPersonaId: number,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<EvaluacionPersonaScopeRow> => {
  const scope = buildTenantScope(tenant, 'ev');
  const executor = client ?? dbPool;
  const result = await executor.query<EvaluacionPersonaScopeRow>(
    `
      SELECT
        ev.contrato_id::text AS contrato_id,
        ep.evaluacion_id::text AS evaluacion_id,
        ev.empresa_id::text AS empresa_id,
        ev.fecha_fin,
        ep.id::text AS id,
        ep.persona_id::text AS persona_id,
        ep.vinculacion_id::text AS vinculacion_id
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} ep.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, evaluacionPersonaId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Evaluation assignment not found', 404, 'EVALUACION_PERSONA_NOT_FOUND');
  }

  return row;
};

const assertPlanTenantAccess = async (
  planMejoraId: number,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<PlanMejoraRow> => {
  const scope = buildTenantScope(tenant, 'ev');
  const executor = client ?? dbPool;
  const result = await executor.query<PlanMejoraRow>(
    `
      SELECT
        pm.activo,
        COALESCE(latest.comentario_ultimo, NULL)::text AS comentario_ultimo,
        pm.created_at,
        pm.descripcion,
        pm.evaluacion_persona_id::text AS evaluacion_persona_id,
        pm.fecha_cierre,
        pm.fecha_compromiso,
        pm.fecha_inicio,
        pm.estado,
        pm.objetivo,
        pm.persona_id::text AS persona_id,
        COALESCE(latest.progreso_actual, 0)::int AS progreso_actual,
        pm.responsable,
        COALESCE(stats.seguimientos_total, 0)::int AS seguimientos_total,
        pm.id::text AS id,
        latest.ultimo_seguimiento,
        pm.vinculacion_id::text AS vinculacion_id
      FROM evaluaciones_planes_mejora pm
      INNER JOIN evaluaciones_persona ep ON ep.id = pm.evaluacion_persona_id
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      LEFT JOIN LATERAL (
        SELECT
          s.fecha_seguimiento AS ultimo_seguimiento,
          s.porcentaje_avance AS progreso_actual,
          s.comentario AS comentario_ultimo
        FROM evaluaciones_planes_mejora_seguimientos s
        WHERE s.plan_mejora_id = pm.id
          AND COALESCE(s.activo, TRUE) = TRUE
        ORDER BY s.fecha_seguimiento DESC, s.id DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS seguimientos_total
        FROM evaluaciones_planes_mejora_seguimientos s
        WHERE s.plan_mejora_id = pm.id
          AND COALESCE(s.activo, TRUE) = TRUE
      ) stats ON TRUE
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} pm.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, planMejoraId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Plan de mejora not found', 404, 'PLAN_MEJORA_NOT_FOUND');
  }

  return row;
};

const assertSeguimientoTenantAccess = async (
  seguimientoId: number,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<SeguimientoRow & { plan_mejora_id: string }> => {
  const scope = buildTenantScope(tenant, 'ev');
  const executor = client ?? dbPool;
  const result = await executor.query<SeguimientoRow>(
    `
      SELECT
        s.activo,
        s.comentario,
        s.created_at,
        s.fecha_seguimiento,
        s.id::text AS id,
        s.porcentaje_avance,
        s.plan_mejora_id::text AS plan_mejora_id,
        s.responsable
      FROM evaluaciones_planes_mejora_seguimientos s
      INNER JOIN evaluaciones_planes_mejora pm ON pm.id = s.plan_mejora_id
      INNER JOIN evaluaciones_persona ep ON ep.id = pm.evaluacion_persona_id
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} s.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, seguimientoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Seguimiento not found', 404, 'PLAN_MEJORA_SEGUIMIENTO_NOT_FOUND');
  }

  return row as SeguimientoRow & { plan_mejora_id: string };
};

const assertVinculacionMatchesPersona = async (
  personaId: number,
  vinculacionId: string | number,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<void> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const executor = client ?? dbPool;
  const result = await executor.query<{ persona_id: string }>(
    `
      SELECT persona_id::text AS persona_id
      FROM vinculaciones
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );

  const row = result.rows[0];

  if (!row || toNumber(row.persona_id) !== personaId) {
    throw new AppError('Vinculacion does not belong to persona', 400, 'PLAN_MEJORA_VINCULACION_INVALIDA');
  }
};

const assertPlanPersonaScope = async (
  input: { evaluacion_persona_id: number; persona_id: number; vinculacion_id: number | null },
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<EvaluacionPersonaScopeRow> => {
  const evaluacionPersona = await loadEvaluacionPersonaScope(input.evaluacion_persona_id, tenant, client);

  if (toNumber(evaluacionPersona.persona_id) !== input.persona_id) {
    throw new AppError('Evaluation assignment does not belong to persona', 400, 'PLAN_MEJORA_PERSONA_INVALIDA');
  }

  await assertTenantAccessForPersonaId(tenant, input.persona_id);

  if (input.vinculacion_id !== null) {
    await assertVinculacionMatchesPersona(input.persona_id, input.vinculacion_id, tenant, client);
  }

  return evaluacionPersona;
};

const mapPlanMejora = (row: PlanMejoraRow | PlanAlertRow): PlanMejoraItem => {
  const today = getTodayDateOnly();
  const compromiso = toDateString(row.fecha_compromiso);
  let estado_alerta: PlanMejoraItem['estado_alerta'] = 'VIGENTE';

  if (row.estado !== 'CERRADO' && row.estado !== 'CANCELADO') {
    if (compromiso < today) {
      estado_alerta = 'PLAN_MEJORA_VENCIDO';
    } else {
      const diffDays = Math.ceil((new Date(compromiso).getTime() - new Date(today).getTime()) / MS_PER_DAY);
      if (diffDays >= 0 && diffDays <= 30) {
        estado_alerta = 'PLAN_MEJORA_PROXIMO_VENCER';
      }
    }
  }

  return {
    activo: toBoolean(row.activo),
    comentario_ultimo: row.comentario_ultimo ?? null,
    created_at: toDateString(row.created_at),
    descripcion: row.descripcion,
    evaluacion_persona_id: toNumber(row.evaluacion_persona_id),
    fecha_cierre: toDateStringNullable(row.fecha_cierre),
    fecha_compromiso: compromiso,
    fecha_inicio: toDateString(row.fecha_inicio),
    estado: row.estado,
    estado_alerta,
    id: toNumber(row.id),
    objetivo: row.objetivo,
    persona_id: toNumber(row.persona_id),
    progreso_actual: toNullableNumber(row.progreso_actual) ?? 0,
    responsable: row.responsable,
    seguimientos_total: toNumber(row.seguimientos_total ?? 0),
    ultimo_seguimiento: toDateStringNullable(row.ultimo_seguimiento),
    vinculacion_id: toNullableNumber(row.vinculacion_id)
  };
};

const mapSeguimiento = (row: SeguimientoRow): SeguimientoItem => ({
  activo: toBoolean(row.activo),
  comentario: row.comentario,
  created_at: toDateString(row.created_at),
  fecha_seguimiento: toDateString(row.fecha_seguimiento),
  id: toNumber(row.id),
  porcentaje_avance: toNumber(row.porcentaje_avance),
  plan_mejora_id: toNumber(row.plan_mejora_id),
  responsable: row.responsable
});

const runInTransaction = async <T>(executor: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const result = await executor(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback plan de mejora transaction', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
};

const touchPlanEstadoFromSeguimiento = async (
  client: PoolClient,
  planMejoraId: number,
  porcentajeAvance: number
): Promise<void> => {
  const currentResult = await client.query<{ estado: PlanMejoraEstado; fecha_cierre: Date | string | null }>(
    `
      SELECT estado, fecha_cierre
      FROM evaluaciones_planes_mejora
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [planMejoraId]
  );

  const current = currentResult.rows[0];

  if (!current || current.estado === 'CERRADO' || current.estado === 'CANCELADO') {
    return;
  }

  const nextEstado = porcentajeAvance >= 100 && current.fecha_cierre ? 'CERRADO' : 'EN_PROCESO';

  await client.query(
    `
      UPDATE evaluaciones_planes_mejora
      SET estado = $2
      WHERE id = $1::bigint
    `,
    [planMejoraId, nextEstado]
  );
};

const buildPlanQueryFilters = (
  query: ListPlanesMejoraQuery | DashboardPlanesMejoraQuery,
  filters: string[],
  params: unknown[]
): void => {
  if ('activo' in query && query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(pm.activo, TRUE) = $${params.length}`);
  }

  if ('estado' in query && query.estado) {
    params.push(query.estado);
    filters.push(`pm.estado = $${params.length}`);
  }

  if ('evaluacion_persona_id' in query && query.evaluacion_persona_id) {
    params.push(query.evaluacion_persona_id);
    filters.push(`pm.evaluacion_persona_id = $${params.length}::bigint`);
  }

  if ('persona_id' in query && query.persona_id) {
    params.push(query.persona_id);
    filters.push(`pm.persona_id = $${params.length}::bigint`);
  }

  if ('search' in query && query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(
      pm.objetivo ILIKE $${params.length}
      OR COALESCE(pm.descripcion, '') ILIKE $${params.length}
      OR COALESCE(pm.responsable, '') ILIKE $${params.length}
    )`);
  }
};

const fetchPlanRows = async (
  query: ListPlanesMejoraQuery | DashboardPlanesMejoraQuery,
  tenant?: TenantAccessContext
): Promise<PlanMejoraRow[]> => {
  const scope = buildTenantScope(tenant, 'ev');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  buildPlanQueryFilters(query, filters, params);
  const whereSql = scopeWhereSql(scope, filters);

  const result = await dbQuery<PlanMejoraRow>(
    `
      SELECT
        pm.activo,
        COALESCE(latest.comentario_ultimo, NULL)::text AS comentario_ultimo,
        pm.created_at,
        pm.descripcion,
        pm.evaluacion_persona_id::text AS evaluacion_persona_id,
        pm.fecha_cierre,
        pm.fecha_compromiso,
        pm.fecha_inicio,
        pm.estado,
        pm.objetivo,
        pm.persona_id::text AS persona_id,
        COALESCE(latest.porcentaje_avance, 0)::int AS progreso_actual,
        pm.responsable,
        COALESCE(stats.seguimientos_total, 0)::int AS seguimientos_total,
        pm.id::text AS id,
        latest.ultimo_seguimiento,
        pm.vinculacion_id::text AS vinculacion_id
      FROM evaluaciones_planes_mejora pm
      INNER JOIN evaluaciones_persona ep ON ep.id = pm.evaluacion_persona_id
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      LEFT JOIN LATERAL (
        SELECT
          s.fecha_seguimiento AS ultimo_seguimiento,
          s.porcentaje_avance,
          s.comentario AS comentario_ultimo
        FROM evaluaciones_planes_mejora_seguimientos s
        WHERE s.plan_mejora_id = pm.id
          AND COALESCE(s.activo, TRUE) = TRUE
        ORDER BY s.fecha_seguimiento DESC, s.id DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS seguimientos_total
        FROM evaluaciones_planes_mejora_seguimientos s
        WHERE s.plan_mejora_id = pm.id
          AND COALESCE(s.activo, TRUE) = TRUE
      ) stats ON TRUE
      ${whereSql}
      ORDER BY pm.created_at DESC, pm.id DESC
    `,
    params
  );

  return result.rows;
};

export const listPlanesMejora = async (
  query: ListPlanesMejoraQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedPlanesMejora> => {
  const rows = await fetchPlanRows(query, tenant);
  const offset = (query.page - 1) * query.limit;
  const items = rows.slice(offset, offset + query.limit).map(mapPlanMejora);

  return {
    items,
    pagination: buildPagination(query.page, query.limit, rows.length)
  };
};

export const createPlanMejora = async (
  input: CreatePlanMejoraInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PlanMejoraItem> => {
  const evaluacionPersona = await assertPlanPersonaScope(
    {
      evaluacion_persona_id: Number(input.evaluacion_persona_id),
      persona_id: Number(input.persona_id),
      vinculacion_id: input.vinculacion_id ? Number(input.vinculacion_id) : null
    },
    tenant
  );

  const result = await dbQuery<PlanMejoraRow>(
    `
      INSERT INTO evaluaciones_planes_mejora (
        evaluacion_persona_id,
        persona_id,
        vinculacion_id,
        objetivo,
        descripcion,
        responsable,
        fecha_inicio,
        fecha_compromiso,
        fecha_cierre,
        estado,
        activo
      )
      VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6, $7::date, $8::date, $9::date, $10, $11)
      RETURNING
        activo,
        NULL::text AS comentario_ultimo,
        created_at,
        descripcion,
        evaluacion_persona_id::text AS evaluacion_persona_id,
        fecha_cierre,
        fecha_compromiso,
        fecha_inicio,
        estado,
        objetivo,
        persona_id::text AS persona_id,
        0::int AS progreso_actual,
        responsable,
        0::int AS seguimientos_total,
        id::text AS id,
        NULL::date AS ultimo_seguimiento,
        vinculacion_id::text AS vinculacion_id
    `,
    [
      input.evaluacion_persona_id,
      input.persona_id,
      input.vinculacion_id ?? null,
      input.objetivo,
      input.descripcion ?? null,
      input.responsable ?? null,
      input.fecha_inicio,
      input.fecha_compromiso,
      input.fecha_cierre ?? null,
      input.estado,
      input.activo
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to create plan de mejora', 500, 'PLAN_MEJORA_CREATE_FAILED');
  }

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_CREATE',
    after: mapPlanMejora(row),
    descripcion: 'Creacion de plan de mejora de desempeno',
    registro_id: row.id,
    tabla: 'evaluaciones_planes_mejora',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPlanMejora(row);
};

export const updatePlanMejora = async (
  id: number,
  input: UpdatePlanMejoraInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PlanMejoraItem> => {
  const current = await assertPlanTenantAccess(id, tenant);
  const nextEvaluacionPersonaId = input.evaluacion_persona_id ? Number(input.evaluacion_persona_id) : toNumber(current.evaluacion_persona_id);
  const nextPersonaId = input.persona_id ? Number(input.persona_id) : toNumber(current.persona_id);
  const nextVinculacionId =
    input.vinculacion_id === undefined
      ? toNullableNumber(current.vinculacion_id)
      : input.vinculacion_id === null
        ? null
        : Number(input.vinculacion_id);

  await assertPlanPersonaScope(
    {
      evaluacion_persona_id: nextEvaluacionPersonaId,
      persona_id: nextPersonaId,
      vinculacion_id: nextVinculacionId
    },
    tenant
  );

  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.evaluacion_persona_id !== undefined) {
    params.push(input.evaluacion_persona_id);
    fields.push(`evaluacion_persona_id = $${params.length}::bigint`);
  }

  if (input.persona_id !== undefined) {
    params.push(input.persona_id);
    fields.push(`persona_id = $${params.length}::bigint`);
  }

  if (input.vinculacion_id !== undefined) {
    params.push(input.vinculacion_id);
    fields.push(`vinculacion_id = $${params.length}::bigint`);
  }

  if (input.objetivo !== undefined) {
    params.push(input.objetivo);
    fields.push(`objetivo = $${params.length}`);
  }

  if (input.descripcion !== undefined) {
    params.push(input.descripcion);
    fields.push(`descripcion = $${params.length}`);
  }

  if (input.responsable !== undefined) {
    params.push(input.responsable);
    fields.push(`responsable = $${params.length}`);
  }

  if (input.fecha_inicio !== undefined) {
    params.push(input.fecha_inicio);
    fields.push(`fecha_inicio = $${params.length}::date`);
  }

  if (input.fecha_compromiso !== undefined) {
    params.push(input.fecha_compromiso);
    fields.push(`fecha_compromiso = $${params.length}::date`);
  }

  if (input.fecha_cierre !== undefined) {
    params.push(input.fecha_cierre);
    fields.push(`fecha_cierre = $${params.length}::date`);
  }

  if (input.estado !== undefined) {
    params.push(input.estado);
    fields.push(`estado = $${params.length}`);
  }

  if (input.activo !== undefined) {
    params.push(input.activo);
    fields.push(`activo = $${params.length}`);
  }

  if (input.fecha_cierre !== undefined && input.fecha_cierre !== null && input.estado === undefined) {
    params.push('CERRADO');
    fields.push(`estado = $${params.length}`);
  }

  params.push(id);

  const result = await dbQuery<PlanMejoraRow>(
    `
      UPDATE evaluaciones_planes_mejora
      SET ${fields.join(', ')}
      WHERE id = $${params.length}::bigint
      RETURNING
        activo,
        NULL::text AS comentario_ultimo,
        created_at,
        descripcion,
        evaluacion_persona_id::text AS evaluacion_persona_id,
        fecha_cierre,
        fecha_compromiso,
        fecha_inicio,
        estado,
        objetivo,
        persona_id::text AS persona_id,
        0::int AS progreso_actual,
        responsable,
        0::int AS seguimientos_total,
        id::text AS id,
        NULL::date AS ultimo_seguimiento,
        vinculacion_id::text AS vinculacion_id
    `,
    params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Plan de mejora not found', 404, 'PLAN_MEJORA_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_UPDATE',
    after: mapPlanMejora(row),
    before: mapPlanMejora(current),
    descripcion: 'Actualizacion de plan de mejora de desempeno',
    registro_id: row.id,
    tabla: 'evaluaciones_planes_mejora',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPlanMejora(row);
};

export const deactivatePlanMejora = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PlanMejoraItem> => {
  const current = await assertPlanTenantAccess(id, tenant);
  const result = await dbQuery<PlanMejoraRow>(
    `
      UPDATE evaluaciones_planes_mejora
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        NULL::text AS comentario_ultimo,
        created_at,
        descripcion,
        evaluacion_persona_id::text AS evaluacion_persona_id,
        fecha_cierre,
        fecha_compromiso,
        fecha_inicio,
        estado,
        objetivo,
        persona_id::text AS persona_id,
        0::int AS progreso_actual,
        responsable,
        0::int AS seguimientos_total,
        id::text AS id,
        NULL::date AS ultimo_seguimiento,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Plan de mejora not found', 404, 'PLAN_MEJORA_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_DEACTIVATE',
    after: mapPlanMejora(row),
    before: mapPlanMejora(current),
    descripcion: 'Desactivacion de plan de mejora de desempeno',
    registro_id: row.id,
    tabla: 'evaluaciones_planes_mejora',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPlanMejora(row);
};

export const listSeguimientos = async (
  planMejoraId: number,
  tenant?: TenantAccessContext
): Promise<SeguimientoItem[]> => {
  await assertPlanTenantAccess(planMejoraId, tenant);
  const result = await dbQuery<SeguimientoRow>(
    `
      SELECT
        s.activo,
        s.comentario,
        s.created_at,
        s.fecha_seguimiento,
        s.id::text AS id,
        s.porcentaje_avance,
        s.plan_mejora_id::text AS plan_mejora_id,
        s.responsable
      FROM evaluaciones_planes_mejora_seguimientos s
      WHERE s.plan_mejora_id = $1::bigint
        AND COALESCE(s.activo, TRUE) = TRUE
      ORDER BY s.fecha_seguimiento ASC, s.id ASC
    `,
    [planMejoraId]
  );

  return result.rows.map(mapSeguimiento);
};

export const createSeguimiento = async (
  input: CreateSeguimientoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<{ plan_mejora: PlanMejoraItem; seguimiento: SeguimientoItem }> => {
  const plan = await assertPlanTenantAccess(Number(input.plan_mejora_id), tenant);

  const result = await runInTransaction(async (client) => {
    const seguimientoResult = await client.query<SeguimientoRow>(
      `
        INSERT INTO evaluaciones_planes_mejora_seguimientos (
          plan_mejora_id,
          fecha_seguimiento,
          comentario,
          porcentaje_avance,
          responsable,
          activo
        )
        VALUES ($1::bigint, $2::date, $3, $4, $5, $6)
        RETURNING
          activo,
          comentario,
          created_at,
          fecha_seguimiento,
          id::text AS id,
          porcentaje_avance,
          plan_mejora_id::text AS plan_mejora_id,
          responsable
      `,
      [
        input.plan_mejora_id,
        input.fecha_seguimiento,
        input.comentario,
        input.porcentaje_avance,
        input.responsable ?? null,
        input.activo
      ]
    );

    await touchPlanEstadoFromSeguimiento(client, Number(input.plan_mejora_id), input.porcentaje_avance);

    const refreshedPlan = await client.query<PlanMejoraRow>(
      `
      SELECT
        pm.activo,
        COALESCE(latest.comentario_ultimo, NULL)::text AS comentario_ultimo,
        pm.created_at,
        pm.descripcion,
        pm.evaluacion_persona_id::text AS evaluacion_persona_id,
          pm.fecha_cierre,
          pm.fecha_compromiso,
          pm.fecha_inicio,
          pm.estado,
          pm.objetivo,
          pm.persona_id::text AS persona_id,
          COALESCE(latest.porcentaje_avance, 0)::int AS progreso_actual,
          pm.responsable,
          COALESCE(stats.seguimientos_total, 0)::int AS seguimientos_total,
          pm.id::text AS id,
          latest.ultimo_seguimiento,
          pm.vinculacion_id::text AS vinculacion_id
        FROM evaluaciones_planes_mejora pm
      LEFT JOIN LATERAL (
        SELECT
          s.fecha_seguimiento AS ultimo_seguimiento,
          s.porcentaje_avance,
          s.comentario AS comentario_ultimo
        FROM evaluaciones_planes_mejora_seguimientos s
        WHERE s.plan_mejora_id = pm.id
          AND COALESCE(s.activo, TRUE) = TRUE
          ORDER BY s.fecha_seguimiento DESC, s.id DESC
          LIMIT 1
        ) latest ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS seguimientos_total
          FROM evaluaciones_planes_mejora_seguimientos s
          WHERE s.plan_mejora_id = pm.id
            AND COALESCE(s.activo, TRUE) = TRUE
        ) stats ON TRUE
        WHERE pm.id = $1::bigint
        LIMIT 1
      `,
      [input.plan_mejora_id]
    );

    const seguimiento = seguimientoResult.rows[0];
    const refreshed = refreshedPlan.rows[0];

    if (!seguimiento || !refreshed) {
      throw new AppError('Failed to create plan de mejora seguimiento', 500, 'PLAN_MEJORA_SEGUIMIENTO_CREATE_FAILED');
    }

    return {
      plan_mejora: mapPlanMejora(refreshed),
      seguimiento: mapSeguimiento(seguimiento)
    };
  });

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_SEGUIMIENTO_CREATE',
    after: result.seguimiento,
    descripcion: 'Creacion de seguimiento de plan de mejora',
    registro_id: String(result.seguimiento.id),
    tabla: 'evaluaciones_planes_mejora_seguimientos',
    usuario_id: actorUserId,
    ...auditMeta
  });

  if (result.plan_mejora.estado === 'CERRADO' && result.plan_mejora.fecha_cierre) {
    await registerAuditEntry({
      accion: 'PLAN_MEJORA_UPDATE',
      after: result.plan_mejora,
      descripcion: 'Cierre de plan de mejora por seguimiento',
      registro_id: String(result.plan_mejora.id),
      tabla: 'evaluaciones_planes_mejora',
      usuario_id: actorUserId,
      ...auditMeta
    });
  }

  return result;
};

export const updateSeguimiento = async (
  id: number,
  input: UpdateSeguimientoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SeguimientoItem> => {
  const current = await assertSeguimientoTenantAccess(id, tenant);
  if (input.plan_mejora_id !== undefined) {
    await assertPlanTenantAccess(Number(input.plan_mejora_id), tenant);
  }

  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.plan_mejora_id !== undefined) {
    params.push(input.plan_mejora_id);
    fields.push(`plan_mejora_id = $${params.length}::bigint`);
  }

  if (input.fecha_seguimiento !== undefined) {
    params.push(input.fecha_seguimiento);
    fields.push(`fecha_seguimiento = $${params.length}::date`);
  }

  if (input.comentario !== undefined) {
    params.push(input.comentario);
    fields.push(`comentario = $${params.length}`);
  }

  if (input.porcentaje_avance !== undefined) {
    params.push(input.porcentaje_avance);
    fields.push(`porcentaje_avance = $${params.length}`);
  }

  if (input.responsable !== undefined) {
    params.push(input.responsable);
    fields.push(`responsable = $${params.length}`);
  }

  if (input.activo !== undefined) {
    params.push(input.activo);
    fields.push(`activo = $${params.length}`);
  }

  params.push(id);

  const result = await dbQuery<SeguimientoRow>(
    `
      UPDATE evaluaciones_planes_mejora_seguimientos
      SET ${fields.join(', ')}
      WHERE id = $${params.length}::bigint
      RETURNING
        activo,
        comentario,
        created_at,
        fecha_seguimiento,
        id::text AS id,
        porcentaje_avance,
        plan_mejora_id::text AS plan_mejora_id,
        responsable
    `,
    params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Seguimiento not found', 404, 'PLAN_MEJORA_SEGUIMIENTO_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_SEGUIMIENTO_UPDATE',
    after: mapSeguimiento(row),
    before: mapSeguimiento(current),
    descripcion: 'Actualizacion de seguimiento de plan de mejora',
    registro_id: row.id,
    tabla: 'evaluaciones_planes_mejora_seguimientos',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapSeguimiento(row);
};

export const deactivateSeguimiento = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SeguimientoItem> => {
  const current = await assertSeguimientoTenantAccess(id, tenant);
  const result = await dbQuery<SeguimientoRow>(
    `
      UPDATE evaluaciones_planes_mejora_seguimientos
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        comentario,
        created_at,
        fecha_seguimiento,
        id::text AS id,
        porcentaje_avance,
        plan_mejora_id::text AS plan_mejora_id,
        responsable
    `,
    [id]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Seguimiento not found', 404, 'PLAN_MEJORA_SEGUIMIENTO_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_SEGUIMIENTO_DEACTIVATE',
    after: mapSeguimiento(row),
    before: mapSeguimiento(current),
    descripcion: 'Desactivacion de seguimiento de plan de mejora',
    registro_id: row.id,
    tabla: 'evaluaciones_planes_mejora_seguimientos',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapSeguimiento(row);
};

export const getPlanesMejoraDashboard = async (
  query: DashboardPlanesMejoraQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PlanMejoraDashboard> => {
  const rows = await fetchPlanRows(query, tenant);
  const plansTotal = rows.length;
  let abiertos = 0;
  let enProceso = 0;
  let cerrados = 0;
  let vencidos = 0;
  let cancelados = 0;
  let seguimientosTotal = 0;
  let avanceSum = 0;
  let trackedPlans = 0;

  for (const row of rows) {
    const plan = mapPlanMejora(row);
    seguimientosTotal += plan.seguimientos_total;
    avanceSum += plan.progreso_actual;
    trackedPlans += 1;

    if (plan.estado === 'CANCELADO') {
      cancelados += 1;
    } else if (plan.estado === 'CERRADO') {
      cerrados += 1;
    } else if (plan.estado_alerta === 'PLAN_MEJORA_VENCIDO') {
      vencidos += 1;
    } else if (plan.estado === 'EN_PROCESO') {
      enProceso += 1;
    } else {
      abiertos += 1;
    }
  }

  const promedioAvance = trackedPlans === 0 ? 0 : Number((avanceSum / trackedPlans).toFixed(2));
  const cumplimientoBase = plansTotal - cancelados;
  const cumplimientoPorcentaje = cumplimientoBase === 0 ? 0 : Number(((cerrados / cumplimientoBase) * 100).toFixed(2));

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_DASHBOARD_VIEW',
    after: {
      abiertos,
      cancelados,
      cerrados,
      cumplimiento_porcentaje: cumplimientoPorcentaje,
      en_proceso: enProceso,
      planes_total: plansTotal,
      promedio_avance: promedioAvance,
      seguimientos_total: seguimientosTotal,
      vencidos
    },
    descripcion: 'Consulta del dashboard de planes de mejora',
    registro_id: '0',
    tabla: 'evaluaciones_planes_mejora',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    abiertos,
    cancelados,
    cerrados,
    cumplimiento_porcentaje: cumplimientoPorcentaje,
    en_proceso: enProceso,
    planes_total: plansTotal,
    promedio_avance: promedioAvance,
    seguimientos_total: seguimientosTotal,
    vencidos
  };
};

export const getPlanesMejoraAlertas = async (
  query: DashboardPlanesMejoraQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PlanMejoraAlertaItem[]> => {
  const rows = await fetchPlanRows(query, tenant);
  const items = rows
    .map((row) => mapPlanMejora(row))
    .filter((plan) => plan.estado_alerta !== 'VIGENTE')
    .map((plan) => {
      const diffDays = Math.ceil(
        (new Date(plan.fecha_compromiso).getTime() - new Date(getTodayDateOnly()).getTime()) / MS_PER_DAY
      );

      return {
        comentario_ultimo: plan.comentario_ultimo,
        created_at: plan.created_at,
        dias_restantes: diffDays,
        estado: plan.estado,
        estado_alerta: plan.estado_alerta as 'PLAN_MEJORA_VENCIDO' | 'PLAN_MEJORA_PROXIMO_VENCER',
        fecha_compromiso: plan.fecha_compromiso,
        id: plan.id,
        objetivo: plan.objetivo,
        persona_id: plan.persona_id,
        progreso_actual: plan.progreso_actual,
        responsable: plan.responsable,
        seguimiento_ultimo: plan.ultimo_seguimiento,
        vinculacion_id: plan.vinculacion_id
      };
    });

  await registerAuditEntry({
    accion: 'PLAN_MEJORA_ALERTAS_VIEW',
    after: { total: items.length },
    descripcion: 'Consulta de alertas de planes de mejora',
    registro_id: '0',
    tabla: 'evaluaciones_planes_mejora',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return items;
};

export const loadPlanesMejoraExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<PlanesMejoraExpediente> => {
  const rows = await fetchPlanRows({ persona_id: String(personaId), page: 1, limit: 100 } as ListPlanesMejoraQuery, tenant);
  const items = rows.map((row) => mapPlanMejora(row));
  const followups = await dbQuery<SeguimientoRow>(
    `
      SELECT
        s.activo,
        s.comentario,
        s.created_at,
        s.fecha_seguimiento,
        s.id::text AS id,
        s.porcentaje_avance,
        s.plan_mejora_id::text AS plan_mejora_id,
        s.responsable
      FROM evaluaciones_planes_mejora_seguimientos s
      INNER JOIN evaluaciones_planes_mejora pm ON pm.id = s.plan_mejora_id
      INNER JOIN evaluaciones_persona ep ON ep.id = pm.evaluacion_persona_id
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      ${buildTenantScope(tenant, 'ev').sql}
      ${buildTenantScope(tenant, 'ev').sql ? 'AND' : 'WHERE'} pm.persona_id = $${buildTenantScope(tenant, 'ev').params.length + 1}::bigint
        AND COALESCE(s.activo, TRUE) = TRUE
      ORDER BY s.fecha_seguimiento ASC, s.id ASC
    `,
    [...buildTenantScope(tenant, 'ev').params, personaId]
  );

  const followupsByPlan = new Map<number, SeguimientoItem[]>();

  for (const row of followups.rows) {
    const item = mapSeguimiento(row);
    const current = followupsByPlan.get(item.plan_mejora_id) ?? [];
    current.push(item);
    followupsByPlan.set(item.plan_mejora_id, current);
  }

  const expedienteItems = items.map((item) => ({
    ...item,
    seguimientos: followupsByPlan.get(item.id) ?? []
  }));

  const activos = items.filter((item) => item.estado !== 'CANCELADO');
  const abiertos = activos.filter((item) => item.estado === 'ABIERTO').length;
  const vencidos = activos.filter((item) => item.estado_alerta === 'PLAN_MEJORA_VENCIDO').length;
  const promedio =
    items.length === 0 ? 0 : Number((items.reduce((accumulator, item) => accumulator + item.progreso_actual, 0) / items.length).toFixed(2));

  return {
    indicadores: {
      planes_mejora_abiertos: abiertos,
      planes_mejora_promedio_avance: promedio,
      planes_mejora_total: items.length,
      planes_mejora_vencidos: vencidos
    },
    items: expedienteItems
  };
};
