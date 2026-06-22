import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { buildTenantWhereClause, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { assertTenantAccessForPersonaId, assertTenantAccessForVinculacionId } from '../../middlewares/tenantMiddleware';
import { loadPlanesMejoraExpediente, type PlanesMejoraExpediente } from './planesMejora.service';
import {
  CreateCompetenciaInput,
  CreateEvaluacionInput,
  CreateEvaluacionPersonaInput,
  CreateRespuestaInput,
  DashboardQuery,
  DashboardGeneralAlertasQuery,
  DashboardGeneralQuery,
  DashboardGeneralRankingQuery,
  EvaluacionClasificacion,
  EvaluacionEstadoPersona,
  ListEvaluacionesPersonaQuery,
  ListEvaluacionesQuery,
  UpdateCompetenciaInput,
  UpdateEvaluacionInput,
  UpdateEvaluacionPersonaInput
} from './evaluaciones.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface EvaluacionRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  created_at: Date | string;
  descripcion: string | null;
  empresa_id: string;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  nombre_evaluacion: string;
}

interface CompetenciaRow extends QueryResultRow {
  activo: boolean | null;
  created_at: Date | string;
  descripcion: string | null;
  evaluacion_id: string;
  id: string;
  nombre_competencia: string;
  peso: string | number;
}

interface EvaluacionPersonaRow extends QueryResultRow {
  activo: boolean | null;
  calificacion_total: string | number | null;
  competencia_total?: number | null;
  created_at: Date | string;
  descripcion?: string | null;
  estado: EvaluacionEstadoPersona;
  evaluacion_id: string;
  fecha_fin?: Date | string | null;
  fecha_inicio?: Date | string | null;
  fortalezas: string | null;
  id: string;
  nombre_evaluacion?: string | null;
  oportunidades_mejora: string | null;
  persona_documento?: string | null;
  persona_id: string;
  persona_nombre?: string | null;
  plan_accion: string | null;
  respuestas_total?: number | null;
  vinculacion_id: string | null;
}

interface RespuestaRow extends QueryResultRow {
  activo: boolean | null;
  calificacion: string | number;
  competencia_id: string;
  created_at: Date | string;
  evaluacion_persona_id: string;
  id: string;
  observacion: string | null;
}

interface DashboardScoreRow extends QueryResultRow {
  calificacion_total: string | number | null;
  estado: EvaluacionEstadoPersona;
}

interface DashboardGeneralEvaluationRow extends QueryResultRow {
  calificacion_total: string | number | null;
  estado: EvaluacionEstadoPersona;
}

interface DashboardGeneralPlanRow extends QueryResultRow {
  estado: string;
  fecha_compromiso: Date | string;
  progreso_actual: number | string | null;
}

interface DashboardGeneralPlanAlertRow extends QueryResultRow {
  comentario_ultimo: string | null;
  contrato_id: string | null;
  created_at: Date | string;
  descripcion: string | null;
  empresa_id: string;
  evaluacion_id: string;
  fecha_compromiso: Date | string;
  fecha_cierre: Date | string | null;
  fecha_inicio: Date | string;
  id: string;
  objetivo: string;
  persona_id: string;
  progreso_actual: number | string | null;
  responsable: string | null;
  seguimiento_ultimo: Date | string | null;
  estado: string;
}

interface DashboardGeneralPendingEvaluationRow extends QueryResultRow {
  contrato_id: string | null;
  created_at: Date | string;
  descripcion: string | null;
  empresa_id: string;
  evaluacion_id: string;
  fecha_fin: Date | string;
  id: string;
  nombre_evaluacion: string;
  numero_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  estado: EvaluacionEstadoPersona;
}

interface DashboardGeneralLowPerformanceRow extends QueryResultRow {
  contrato_id: string | null;
  created_at: Date | string;
  empresa_id: string;
  evaluacion_id: string;
  fecha_fin: Date | string;
  id: string;
  nombre_evaluacion: string;
  numero_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  calificacion_total: string | number | null;
  estado: EvaluacionEstadoPersona;
}

interface DashboardGeneralRankingRow extends QueryResultRow {
  contrato_id: string | null;
  documento: string | null;
  empresa_id: string | null;
  nombre_completo: string;
  persona_id: string;
  promedio: string | number | null;
}

interface DashboardSummary {
  aceptables: number;
  deficiente: number;
  deficientes: number;
  buenos: number;
  excelente: number;
  excelentes: number;
  evaluaciones_total: number;
  en_proceso: number;
  finalizadas: number;
  pendientes: number;
  promedio_general: number;
}

export type DesempenoClasificacion = 'CRITICO' | 'MEDIO' | 'BUENO' | 'EXCELENTE';

export interface EvaluacionItem {
  activo: boolean;
  contrato_id: number | null;
  created_at: string;
  descripcion: string | null;
  empresa_id: number;
  fecha_fin: string;
  fecha_inicio: string;
  id: number;
  nombre_evaluacion: string;
}

export interface CompetenciaItem {
  activo: boolean;
  created_at: string;
  descripcion: string | null;
  evaluacion_id: number;
  id: number;
  nombre_competencia: string;
  peso: number;
}

export interface EvaluacionPersonaItem {
  activo: boolean;
  calificacion_total: number | null;
  created_at: string;
  estado: EvaluacionEstadoPersona;
  evaluacion: {
    created_at: string;
    descripcion: string | null;
    fecha_fin: string;
    fecha_inicio: string;
    id: number;
    nombre_evaluacion: string;
  };
  fortalezas: string | null;
  id: number;
  oportunidades_mejora: string | null;
  persona: {
    documento: string | null;
    id: number;
    nombre: string | null;
  };
  plan_accion: string | null;
  respuestas_total: number;
  vinculacion_id: number | null;
}

export interface RespuestaItem {
  activo: boolean;
  calificacion: number;
  competencia_id: number;
  created_at: string;
  evaluacion_persona_id: number;
  id: number;
  observacion: string | null;
}

export interface EvaluacionesDashboard {
  aceptables: number;
  buenos: number;
  deficientes: number;
  excelentes: number;
  evaluaciones_total: number;
  en_proceso: number;
  finalizadas: number;
  pendientes: number;
  promedio_general: number;
}

export interface EvaluacionesDashboardGeneral {
  aceptables: number;
  buenos: number;
  cumplimiento_desempeno: number;
  deficientes: number;
  en_proceso: number;
  excelentes: number;
  evaluaciones_total: number;
  finalizadas: number;
  planes_abiertos: number;
  planes_cerrados: number;
  planes_en_proceso: number;
  planes_mejora_total: number;
  planes_vencidos: number;
  promedio_avance_planes: number;
  promedio_general: number;
  pendientes: number;
}

export interface EvaluacionesDashboardGeneralAlertaItem {
  contrato_id: number | null;
  descripcion: string | null;
  empresa_id: number | null;
  evaluacion_id: number | null;
  estado: string;
  fecha: string | null;
  id: string;
  persona_id: number | null;
  plan_mejora_id: number | null;
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  tipo_alerta: 'PLAN_MEJORA_VENCIDO' | 'PLAN_MEJORA_PROXIMO_VENCER' | 'EVALUACION_PENDIENTE' | 'EVALUACION_BAJO_DESEMPENO';
  titulo: string;
}

export interface EvaluacionesDashboardGeneralAlertas {
  items: EvaluacionesDashboardGeneralAlertaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface EvaluacionesDashboardGeneralRankingItem {
  clasificacion: EvaluacionClasificacion | null;
  contrato_id: number | null;
  documento: string | null;
  empresa_id: number | null;
  անուն_completo: string;
  persona_id: number;
  promedio: number;
}

export interface EvaluacionesDashboardGeneralRanking {
  items: EvaluacionesDashboardGeneralRankingItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface EvaluacionesDashboardGeneralRankingItem {
  nombre_completo: string;
}

export interface EvaluacionesExpedienteItem {
  calificacion_total: number | null;
  created_at: string;
  estado: EvaluacionEstadoPersona;
  evaluacion: {
    fecha_fin: string;
    fecha_inicio: string;
    id: number;
    nombre_evaluacion: string;
  };
  id: number;
  persona_id: number;
  clasificacion: EvaluacionClasificacion | null;
}

export interface EvaluacionesExpedienteIndicadores {
  evaluaciones_total: number;
  clasificacion_desempeno: DesempenoClasificacion | null;
  planes_mejora_abiertos: number;
  planes_mejora_vencidos: number;
  promedio_desempeno: number;
  ultima_evaluacion: string | null;
}

export interface EvaluacionesExpedienteResumen {
  indicadores: EvaluacionesExpedienteIndicadores;
  planes_mejora: PlanesMejoraExpediente;
  items: EvaluacionesExpedienteItem[];
}

export interface PaginatedEvaluaciones {
  items: EvaluacionItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedEvaluacionesPersona {
  items: EvaluacionPersonaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedCompetencias {
  items: CompetenciaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

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
  if (value === null || value === undefined) {
    return '';
  }

  return value instanceof Date ? value.toISOString() : value;
};

const toDateStringNullable = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
};

const toClassification = (calificacion: number | null): EvaluacionClasificacion | null => {
  if (calificacion === null) {
    return null;
  }

  if (calificacion <= 2.9) {
    return 'DEFICIENTE';
  }

  if (calificacion <= 3.9) {
    return 'ACEPTABLE';
  }

  if (calificacion <= 4.5) {
    return 'BUENO';
  }

  return 'EXCELENTE';
};

const toDesempenoClasificacion = (cumplimiento: number | null): DesempenoClasificacion | null => {
  if (cumplimiento === null) {
    return null;
  }

  if (cumplimiento <= 59) {
    return 'CRITICO';
  }

  if (cumplimiento <= 79) {
    return 'MEDIO';
  }

  if (cumplimiento <= 89) {
    return 'BUENO';
  }

  return 'EXCELENTE';
};

const roundScore = (value: number): number => Number(value.toFixed(2));

const buildPagination = (page: number, limit: number, total: number): PaginatedEvaluaciones['pagination'] => {
  return {
    limit,
    page,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / limit)
  };
};

const buildTenantScope = (
  tenant: TenantAccessContext | undefined,
  alias = 'e'
): { params: unknown[]; sql: string } => {
  if (!tenant) {
    return {
      params: [],
      sql: ''
    };
  }

  return buildTenantWhereClause({
    contratoColumn: `${alias}.contrato_id`,
    empresaColumn: `${alias}.empresa_id`,
    tenant
  });
};

const assertEvaluationTenantAccess = async (
  evaluationId: number,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<EvaluacionRow> => {
  const query = `
    SELECT
      e.activo,
      e.contrato_id::text AS contrato_id,
      e.created_at,
      e.descripcion,
      e.empresa_id::text AS empresa_id,
      e.fecha_fin,
      e.fecha_inicio,
      e.id::text AS id,
      e.nombre_evaluacion
    FROM evaluaciones_desempeno e
    ${buildTenantScope(tenant, 'e').sql}
    ${buildTenantScope(tenant, 'e').sql ? 'AND' : 'WHERE'} e.id = $${buildTenantScope(tenant, 'e').params.length + 1}::bigint
    LIMIT 1
  `;
  const params = [...buildTenantScope(tenant, 'e').params, evaluationId];
  const executor = client ?? dbPool;
  const result = await executor.query<EvaluacionRow>(query, params);
  const row = result.rows[0];

  if (!row) {
    throw new AppError('Evaluation not found', 404, 'EVALUACION_NOT_FOUND');
  }

  return row;
};

const assertCompetenciaTenantAccess = async (
  competenciaId: number,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<CompetenciaRow> => {
  const scope = buildTenantScope(tenant, 'e');
  const query = `
    SELECT
      c.activo,
      c.created_at,
      c.descripcion,
      c.evaluacion_id::text AS evaluacion_id,
      c.id::text AS id,
      c.nombre_competencia,
      c.peso
    FROM evaluaciones_competencias c
    INNER JOIN evaluaciones_desempeno e ON e.id = c.evaluacion_id
    ${scope.sql}
    ${scope.sql ? 'AND' : 'WHERE'} c.id = $${scope.params.length + 1}::bigint
    LIMIT 1
  `;
  const params = [...scope.params, competenciaId];
  const executor = client ?? dbPool;
  const result = await executor.query<CompetenciaRow>(query, params);
  const row = result.rows[0];

  if (!row) {
    throw new AppError('Competencia not found', 404, 'EVALUACION_COMPETENCIA_NOT_FOUND');
  }

  return row;
};

const mapEvaluacion = (row: EvaluacionRow): EvaluacionItem => ({
  activo: toBoolean(row.activo),
  contrato_id: toNullableNumber(row.contrato_id),
  created_at: toDateString(row.created_at),
  descripcion: row.descripcion,
  empresa_id: toNumber(row.empresa_id),
  fecha_fin: toDateString(row.fecha_fin),
  fecha_inicio: toDateString(row.fecha_inicio),
  id: toNumber(row.id),
  nombre_evaluacion: row.nombre_evaluacion
});

const mapCompetencia = (row: CompetenciaRow): CompetenciaItem => ({
  activo: toBoolean(row.activo),
  created_at: toDateString(row.created_at),
  descripcion: row.descripcion,
  evaluacion_id: toNumber(row.evaluacion_id),
  id: toNumber(row.id),
  nombre_competencia: row.nombre_competencia,
  peso: toNumber(row.peso)
});

const mapEvaluacionPersona = (row: EvaluacionPersonaRow): EvaluacionPersonaItem => ({
  activo: toBoolean(row.activo),
  calificacion_total: toNullableNumber(row.calificacion_total),
  created_at: toDateString(row.created_at),
  estado: row.estado,
  evaluacion: {
    created_at: toDateString(row.created_at),
    descripcion: row.descripcion ?? null,
    fecha_fin: toDateString(row.fecha_fin),
    fecha_inicio: toDateString(row.fecha_inicio),
    id: toNumber(row.evaluacion_id),
    nombre_evaluacion: row.nombre_evaluacion ?? ''
  },
  fortalezas: row.fortalezas,
  id: toNumber(row.id),
  oportunidades_mejora: row.oportunidades_mejora,
  persona: {
    documento: row.persona_documento ?? null,
    id: toNumber(row.persona_id),
    nombre: row.persona_nombre ?? null
  },
  plan_accion: row.plan_accion,
  respuestas_total: Number(row.respuestas_total ?? 0),
  vinculacion_id: toNullableNumber(row.vinculacion_id)
});

const mapRespuesta = (row: RespuestaRow): RespuestaItem => ({
  activo: toBoolean(row.activo),
  calificacion: toNumber(row.calificacion),
  competencia_id: toNumber(row.competencia_id),
  created_at: toDateString(row.created_at),
  evaluacion_persona_id: toNumber(row.evaluacion_persona_id),
  id: toNumber(row.id),
  observacion: row.observacion
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
      console.error('Failed to rollback evaluations transaction', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
};

const assertEvaluationScope = async (
  input: { empresa_id: number; contrato_id: number | null },
  tenant: TenantAccessContext | undefined
): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (input.contrato_id !== null && tenant.contratoIds.includes(input.contrato_id)) {
    return;
  }

  if (tenant.empresaIds.includes(input.empresa_id)) {
    return;
  }

  if (input.contrato_id !== null) {
    const result = await dbQuery<{ empresa_id: string | null }>(
      `
        SELECT empresa_id::text AS empresa_id
        FROM contratos
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [input.contrato_id]
    );

    const row = result.rows[0];

    const empresaId = row?.empresa_id;

    if (empresaId !== null && empresaId !== undefined && tenant.empresaIds.includes(toNumber(empresaId))) {
      return;
    }
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const assertVinculacionMatchesPersona = async (
  personaId: number,
  vinculacionId: string | number,
  tenant: TenantAccessContext | undefined
): Promise<void> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const result = await dbQuery<{ persona_id: string }>(
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
    throw new AppError('Vinculacion does not belong to persona', 400, 'EVALUACION_VINCULACION_INVALIDA');
  }
};

export const listEvaluaciones = async (
  query: ListEvaluacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedEvaluaciones> => {
  const scope = buildTenantScope(tenant, 'e');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(e.activo, TRUE) = $${params.length}`);
  }

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`e.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`e.contrato_id = $${params.length}::bigint`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(e.nombre_evaluacion ILIKE $${params.length} OR COALESCE(e.descripcion, '') ILIKE $${params.length})`);
  }

  const whereParts = [scope.sql, filters.length > 0 ? `AND ${filters.join(' AND ')}` : '']
    .filter(Boolean)
    .join(' ');
  const countParams = [...params];
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM evaluaciones_desempeno e
      ${whereParts || 'WHERE 1 = 1'}
    `,
    countParams
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<EvaluacionRow>(
    `
      SELECT
        e.activo,
        e.contrato_id::text AS contrato_id,
        e.created_at,
        e.descripcion,
        e.empresa_id::text AS empresa_id,
        e.fecha_fin,
        e.fecha_inicio,
        e.id::text AS id,
        e.nombre_evaluacion
      FROM evaluaciones_desempeno e
      ${whereParts || 'WHERE 1 = 1'}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapEvaluacion),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

export const createEvaluacion = async (
  input: CreateEvaluacionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionItem> => {
  await assertEvaluationScope({ empresa_id: Number(input.empresa_id), contrato_id: input.contrato_id ? Number(input.contrato_id) : null }, tenant);

  const result = await dbQuery<EvaluacionRow>(
    `
      INSERT INTO evaluaciones_desempeno (
        empresa_id,
        contrato_id,
        nombre_evaluacion,
        descripcion,
        fecha_inicio,
        fecha_fin,
        activo
      )
      VALUES ($1::bigint, $2::bigint, $3, $4, $5::date, $6::date, $7)
      RETURNING
        activo,
        contrato_id::text AS contrato_id,
        created_at,
        descripcion,
        empresa_id::text AS empresa_id,
        fecha_fin,
        fecha_inicio,
        id::text AS id,
        nombre_evaluacion
    `,
    [
      input.empresa_id,
      input.contrato_id ?? null,
      input.nombre_evaluacion,
      input.descripcion ?? null,
      input.fecha_inicio,
      input.fecha_fin,
      input.activo
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to create evaluation', 500, 'EVALUACION_CREATE_FAILED');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_CREATE',
    after: mapEvaluacion(row),
    descripcion: 'Creacion de evaluacion de desempeno',
    registro_id: row.id,
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapEvaluacion(row);
};

export const updateEvaluacion = async (
  id: number,
  input: UpdateEvaluacionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionItem> => {
  const current = await assertEvaluationTenantAccess(id, tenant);
  const nextEmpresaId = input.empresa_id ? Number(input.empresa_id) : toNumber(current.empresa_id);
  const nextContratoId = input.contrato_id === undefined ? toNullableNumber(current.contrato_id) : input.contrato_id === null ? null : Number(input.contrato_id);
  await assertEvaluationScope({ empresa_id: nextEmpresaId, contrato_id: nextContratoId }, tenant);

  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.empresa_id !== undefined) {
    params.push(input.empresa_id);
    fields.push(`empresa_id = $${params.length}::bigint`);
  }

  if (input.contrato_id !== undefined) {
    params.push(input.contrato_id);
    fields.push(`contrato_id = $${params.length}::bigint`);
  }

  if (input.nombre_evaluacion !== undefined) {
    params.push(input.nombre_evaluacion);
    fields.push(`nombre_evaluacion = $${params.length}`);
  }

  if (input.descripcion !== undefined) {
    params.push(input.descripcion);
    fields.push(`descripcion = $${params.length}`);
  }

  if (input.fecha_inicio !== undefined) {
    params.push(input.fecha_inicio);
    fields.push(`fecha_inicio = $${params.length}::date`);
  }

  if (input.fecha_fin !== undefined) {
    params.push(input.fecha_fin);
    fields.push(`fecha_fin = $${params.length}::date`);
  }

  if (input.activo !== undefined) {
    params.push(input.activo);
    fields.push(`activo = $${params.length}`);
  }

  params.push(id);

  const result = await dbQuery<EvaluacionRow>(
    `
      UPDATE evaluaciones_desempeno
      SET ${fields.join(', ')}
      WHERE id = $${params.length}::bigint
      RETURNING
        activo,
        contrato_id::text AS contrato_id,
        created_at,
        descripcion,
        empresa_id::text AS empresa_id,
        fecha_fin,
        fecha_inicio,
        id::text AS id,
        nombre_evaluacion
    `,
    params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Evaluation not found', 404, 'EVALUACION_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_UPDATE',
    after: mapEvaluacion(row),
    before: mapEvaluacion(current),
    descripcion: 'Actualizacion de evaluacion de desempeno',
    registro_id: row.id,
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapEvaluacion(row);
};

export const deactivateEvaluacion = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionItem> => {
  const current = await assertEvaluationTenantAccess(id, tenant);
  const result = await dbQuery<EvaluacionRow>(
    `
      UPDATE evaluaciones_desempeno
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        contrato_id::text AS contrato_id,
        created_at,
        descripcion,
        empresa_id::text AS empresa_id,
        fecha_fin,
        fecha_inicio,
        id::text AS id,
        nombre_evaluacion
    `,
    [id]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Evaluation not found', 404, 'EVALUACION_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_DELETE',
    after: mapEvaluacion(row),
    before: mapEvaluacion(current),
    descripcion: 'Desactivacion de evaluacion de desempeno',
    registro_id: row.id,
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapEvaluacion(row);
};

export const listCompetencias = async (
  evaluacionId: number,
  tenant?: TenantAccessContext
): Promise<PaginatedCompetencias> => {
  const evaluation = await assertEvaluationTenantAccess(evaluacionId, tenant);
  const result = await dbQuery<CompetenciaRow>(
    `
      SELECT
        c.activo,
        c.created_at,
        c.descripcion,
        c.evaluacion_id::text AS evaluacion_id,
        c.id::text AS id,
        c.nombre_competencia,
        c.peso
      FROM evaluaciones_competencias c
      WHERE c.evaluacion_id = $1::bigint
      ORDER BY c.created_at ASC, c.id ASC
    `,
    [evaluation.id]
  );

  return {
    items: result.rows.map(mapCompetencia),
    pagination: {
      limit: result.rows.length,
      page: 1,
      total: result.rows.length,
      total_pages: result.rows.length === 0 ? 0 : 1
    }
  };
};

export const createCompetencia = async (
  input: CreateCompetenciaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CompetenciaItem> => {
  await assertEvaluationTenantAccess(Number(input.evaluacion_id), tenant);
  const result = await dbQuery<CompetenciaRow>(
    `
      INSERT INTO evaluaciones_competencias (
        evaluacion_id,
        nombre_competencia,
        descripcion,
        peso,
        activo
      )
      VALUES ($1::bigint, $2, $3, $4, $5)
      RETURNING
        activo,
        created_at,
        descripcion,
        evaluacion_id::text AS evaluacion_id,
        id::text AS id,
        nombre_competencia,
        peso
    `,
    [
      input.evaluacion_id,
      input.nombre_competencia,
      input.descripcion ?? null,
      input.peso,
      input.activo
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to create competencia', 500, 'EVALUACION_COMPETENCIA_CREATE_FAILED');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_UPDATE',
    after: mapCompetencia(row),
    descripcion: 'Creacion de competencia de evaluacion',
    registro_id: row.id,
    tabla: 'evaluaciones_competencias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCompetencia(row);
};

export const updateCompetencia = async (
  id: number,
  input: UpdateCompetenciaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CompetenciaItem> => {
  const current = await assertCompetenciaTenantAccess(id, tenant);
  if (input.evaluacion_id !== undefined) {
    await assertEvaluationTenantAccess(Number(input.evaluacion_id), tenant);
  }

  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.evaluacion_id !== undefined) {
    params.push(input.evaluacion_id);
    fields.push(`evaluacion_id = $${params.length}::bigint`);
  }

  if (input.nombre_competencia !== undefined) {
    params.push(input.nombre_competencia);
    fields.push(`nombre_competencia = $${params.length}`);
  }

  if (input.descripcion !== undefined) {
    params.push(input.descripcion);
    fields.push(`descripcion = $${params.length}`);
  }

  if (input.peso !== undefined) {
    params.push(input.peso);
    fields.push(`peso = $${params.length}`);
  }

  if (input.activo !== undefined) {
    params.push(input.activo);
    fields.push(`activo = $${params.length}`);
  }

  params.push(id);

  const result = await dbQuery<CompetenciaRow>(
    `
      UPDATE evaluaciones_competencias
      SET ${fields.join(', ')}
      WHERE id = $${params.length}::bigint
      RETURNING
        activo,
        created_at,
        descripcion,
        evaluacion_id::text AS evaluacion_id,
        id::text AS id,
        nombre_competencia,
        peso
    `,
    params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Competencia not found', 404, 'EVALUACION_COMPETENCIA_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_UPDATE',
    after: mapCompetencia(row),
    before: mapCompetencia(current),
    descripcion: 'Actualizacion de competencia de evaluacion',
    registro_id: row.id,
    tabla: 'evaluaciones_competencias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCompetencia(row);
};

export const deactivateCompetencia = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CompetenciaItem> => {
  const current = await assertCompetenciaTenantAccess(id, tenant);
  const result = await dbQuery<CompetenciaRow>(
    `
      UPDATE evaluaciones_competencias
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        created_at,
        descripcion,
        evaluacion_id::text AS evaluacion_id,
        id::text AS id,
        nombre_competencia,
        peso
    `,
    [id]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Competencia not found', 404, 'EVALUACION_COMPETENCIA_NOT_FOUND');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_DELETE',
    after: mapCompetencia(row),
    before: mapCompetencia(current),
    descripcion: 'Desactivacion de competencia de evaluacion',
    registro_id: row.id,
    tabla: 'evaluaciones_competencias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCompetencia(row);
};

export const listEvaluacionesPersona = async (
  query: ListEvaluacionesPersonaQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedEvaluacionesPersona> => {
  const scope = buildTenantScope(tenant, 'e');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(ep.activo, TRUE) = $${params.length}`);
  }

  if (query.evaluacion_id) {
    params.push(query.evaluacion_id);
    filters.push(`ep.evaluacion_id = $${params.length}::bigint`);
  }

  if (query.persona_id) {
    params.push(query.persona_id);
    filters.push(`ep.persona_id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    filters.push(`ep.estado = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(
      ev.nombre_evaluacion ILIKE $${params.length}
      OR COALESCE(ev.descripcion, '') ILIKE $${params.length}
      OR COALESCE(p.primer_nombre, '') ILIKE $${params.length}
      OR COALESCE(p.primer_apellido, '') ILIKE $${params.length}
    )`);
  }

  const whereParts = [scope.sql, filters.length > 0 ? `AND ${filters.join(' AND ')}` : '']
    .filter(Boolean)
    .join(' ');
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${whereParts || 'WHERE 1 = 1'}
    `,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<EvaluacionPersonaRow>(
    `
      SELECT
        ep.activo,
        ep.calificacion_total,
        ep.created_at,
        ep.estado,
        ep.evaluacion_id::text AS evaluacion_id,
        ep.fortalezas,
        ep.id::text AS id,
        ep.oportunidades_mejora,
        ep.persona_id::text AS persona_id,
        ep.plan_accion,
        ep.vinculacion_id::text AS vinculacion_id,
        ev.descripcion,
        ev.fecha_fin,
        ev.fecha_inicio,
        ev.nombre_evaluacion,
        p.numero_documento AS persona_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM evaluaciones_respuestas er
          WHERE er.evaluacion_persona_id = ep.id
            AND COALESCE(er.activo, TRUE) = TRUE
        )::int AS respuestas_total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${whereParts || 'WHERE 1 = 1'}
      ORDER BY ep.created_at DESC, ep.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapEvaluacionPersona),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

export const createEvaluacionPersona = async (
  input: CreateEvaluacionPersonaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionPersonaItem> => {
  await assertEvaluationTenantAccess(Number(input.evaluacion_id), tenant);
  await assertTenantAccessForPersonaId(tenant, input.persona_id);

  if (input.vinculacion_id) {
    await assertVinculacionMatchesPersona(Number(input.persona_id), input.vinculacion_id, tenant);
  }

  const result = await dbQuery<EvaluacionPersonaRow>(
    `
      INSERT INTO evaluaciones_persona (
        evaluacion_id,
        persona_id,
        vinculacion_id,
        calificacion_total,
        fortalezas,
        oportunidades_mejora,
        plan_accion,
        estado,
        activo
      )
      VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6, $7, $8, $9)
      RETURNING
        activo,
        calificacion_total,
        created_at,
        estado,
        evaluacion_id::text AS evaluacion_id,
        fortalezas,
        id::text AS id,
        oportunidades_mejora,
        persona_id::text AS persona_id,
        plan_accion,
        vinculacion_id::text AS vinculacion_id
    `,
    [
      input.evaluacion_id,
      input.persona_id,
      input.vinculacion_id ?? null,
      input.calificacion_total ?? null,
      input.fortalezas ?? null,
      input.oportunidades_mejora ?? null,
      input.plan_accion ?? null,
      input.estado,
      input.activo
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to create evaluation assignment', 500, 'EVALUACION_PERSONA_CREATE_FAILED');
  }

  await registerAuditEntry({
    accion: 'EVALUACION_PERSONA_CREATE',
    after: mapEvaluacionPersona({
      ...row,
      descripcion: null,
      fecha_fin: null,
      fecha_inicio: null,
      nombre_evaluacion: null,
      persona_nombre: null,
      persona_documento: null,
      respuestas_total: 0
    }),
    descripcion: 'Creacion de evaluacion por persona',
    registro_id: row.id,
    tabla: 'evaluaciones_persona',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapEvaluacionPersona({
    ...row,
    descripcion: null,
    fecha_fin: null,
    fecha_inicio: null,
    nombre_evaluacion: null,
    persona_nombre: null,
    persona_documento: null,
    respuestas_total: 0
  });
};

export const updateEvaluacionPersona = async (
  id: number,
  input: UpdateEvaluacionPersonaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionPersonaItem> => {
  const currentResult = await dbQuery<EvaluacionPersonaRow>(
    `
      SELECT
        ep.activo,
        ep.calificacion_total,
        ep.created_at,
        ep.estado,
        ep.evaluacion_id::text AS evaluacion_id,
        ep.fortalezas,
        ep.id::text AS id,
        ep.oportunidades_mejora,
        ep.persona_id::text AS persona_id,
        ep.plan_accion,
        ep.vinculacion_id::text AS vinculacion_id,
        ev.descripcion,
        ev.fecha_fin,
        ev.fecha_inicio,
        ev.nombre_evaluacion,
        p.numero_documento AS persona_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM evaluaciones_respuestas er
          WHERE er.evaluacion_persona_id = ep.id
            AND COALESCE(er.activo, TRUE) = TRUE
        )::int AS respuestas_total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${buildTenantScope(tenant, 'ev').sql}
      ${buildTenantScope(tenant, 'ev').sql ? 'AND' : 'WHERE'} ep.id = $${buildTenantScope(tenant, 'ev').params.length + 1}::bigint
      LIMIT 1
    `,
    [...buildTenantScope(tenant, 'ev').params, id]
  );
  const current = currentResult.rows[0];

  if (!current) {
    throw new AppError('Evaluation assignment not found', 404, 'EVALUACION_PERSONA_NOT_FOUND');
  }

  if (input.persona_id !== undefined) {
    await assertTenantAccessForPersonaId(tenant, input.persona_id);
  }

  if (input.vinculacion_id !== undefined && input.vinculacion_id !== null) {
    await assertVinculacionMatchesPersona(
      Number(input.persona_id ?? current.persona_id),
      input.vinculacion_id,
      tenant
    );
  }

  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.evaluacion_id !== undefined) {
    await assertEvaluationTenantAccess(Number(input.evaluacion_id), tenant);
    params.push(input.evaluacion_id);
    fields.push(`evaluacion_id = $${params.length}::bigint`);
  }

  if (input.persona_id !== undefined) {
    params.push(input.persona_id);
    fields.push(`persona_id = $${params.length}::bigint`);
  }

  if (input.vinculacion_id !== undefined) {
    params.push(input.vinculacion_id);
    fields.push(`vinculacion_id = $${params.length}::bigint`);
  }

  if (input.calificacion_total !== undefined) {
    params.push(input.calificacion_total);
    fields.push(`calificacion_total = $${params.length}`);
  }

  if (input.fortalezas !== undefined) {
    params.push(input.fortalezas);
    fields.push(`fortalezas = $${params.length}`);
  }

  if (input.oportunidades_mejora !== undefined) {
    params.push(input.oportunidades_mejora);
    fields.push(`oportunidades_mejora = $${params.length}`);
  }

  if (input.plan_accion !== undefined) {
    params.push(input.plan_accion);
    fields.push(`plan_accion = $${params.length}`);
  }

  if (input.estado !== undefined) {
    params.push(input.estado);
    fields.push(`estado = $${params.length}`);
  }

  if (input.activo !== undefined) {
    params.push(input.activo);
    fields.push(`activo = $${params.length}`);
  }

  params.push(id);

  const result = await dbQuery<EvaluacionPersonaRow>(
    `
      UPDATE evaluaciones_persona
      SET ${fields.join(', ')}
      WHERE id = $${params.length}::bigint
      RETURNING
        activo,
        calificacion_total,
        created_at,
        estado,
        evaluacion_id::text AS evaluacion_id,
        fortalezas,
        id::text AS id,
        oportunidades_mejora,
        persona_id::text AS persona_id,
        plan_accion,
        vinculacion_id::text AS vinculacion_id
    `,
    params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Evaluation assignment not found', 404, 'EVALUACION_PERSONA_NOT_FOUND');
  }

  const merged = {
    ...row,
    descripcion: current.descripcion,
    fecha_fin: current.fecha_fin,
    fecha_inicio: current.fecha_inicio,
    nombre_evaluacion: current.nombre_evaluacion,
    persona_documento: current.persona_documento,
    persona_nombre: current.persona_nombre,
    respuestas_total: current.respuestas_total
  } satisfies EvaluacionPersonaRow;

  await registerAuditEntry({
    accion: 'EVALUACION_PERSONA_UPDATE',
    after: mapEvaluacionPersona(merged),
    before: mapEvaluacionPersona(current),
    descripcion: 'Actualizacion de evaluacion por persona',
    registro_id: row.id,
    tabla: 'evaluaciones_persona',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapEvaluacionPersona(merged);
};

const recalculateEvaluacionPersona = async (
  client: PoolClient,
  evaluacionPersonaId: number
): Promise<EvaluacionPersonaRow> => {
  await client.query(
    `
      WITH resumen AS (
        SELECT
          ev.descripcion,
          ev.fecha_fin,
          ev.fecha_inicio,
          ev.nombre_evaluacion,
          ep.activo,
          ep.calificacion_total,
          ep.created_at,
          ep.estado,
          ep.evaluacion_id::text AS evaluacion_id,
          ep.fortalezas,
          ep.id AS id,
          ep.oportunidades_mejora,
          ep.persona_id::text AS persona_id,
          ep.plan_accion,
          ep.vinculacion_id::text AS vinculacion_id,
          p.numero_documento AS persona_documento,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
          (
            SELECT COUNT(*)
            FROM evaluaciones_respuestas er
            WHERE er.evaluacion_persona_id = ep.id
              AND COALESCE(er.activo, TRUE) = TRUE
          )::int AS respuestas_total,
          (
            SELECT ROUND(
              COALESCE(SUM(er.calificacion * ec.peso) / NULLIF(SUM(ec.peso), 0), 0)::numeric,
              2
            )
            FROM evaluaciones_respuestas er
            INNER JOIN evaluaciones_competencias ec ON ec.id = er.competencia_id
            WHERE er.evaluacion_persona_id = ep.id
              AND COALESCE(er.activo, TRUE) = TRUE
              AND COALESCE(ec.activo, TRUE) = TRUE
          ) AS nueva_calificacion
        FROM evaluaciones_persona ep
        INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
        INNER JOIN personas p ON p.id = ep.persona_id
        WHERE ep.id = $1::bigint
        LIMIT 1
      )
      UPDATE evaluaciones_persona ep
      SET
        calificacion_total = resumen.nueva_calificacion,
        estado = CASE
          WHEN ep.estado = 'FINALIZADA' THEN ep.estado
          WHEN resumen.respuestas_total > 0 THEN 'EN_PROCESO'
          ELSE ep.estado
        END
      FROM resumen
      WHERE ep.id = resumen.id
    `,
    [evaluacionPersonaId]
  );

  const result = await client.query<EvaluacionPersonaRow>(
    `
      SELECT
        ep.activo,
        ep.calificacion_total,
        ep.created_at,
        ep.estado,
        ep.evaluacion_id::text AS evaluacion_id,
        ep.fortalezas,
        ep.id::text AS id,
        ep.oportunidades_mejora,
        ep.persona_id::text AS persona_id,
        ep.plan_accion,
        ep.vinculacion_id::text AS vinculacion_id,
        ev.descripcion,
        ev.fecha_fin,
        ev.fecha_inicio,
        ev.nombre_evaluacion,
        p.numero_documento AS persona_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM evaluaciones_respuestas er
          WHERE er.evaluacion_persona_id = ep.id
            AND COALESCE(er.activo, TRUE) = TRUE
        )::int AS respuestas_total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      WHERE ep.id = $1::bigint
      LIMIT 1
    `,
    [evaluacionPersonaId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Evaluation assignment not found', 404, 'EVALUACION_PERSONA_NOT_FOUND');
  }

  return row;
};

export const createRespuesta = async (
  input: CreateRespuestaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<{ respuesta: RespuestaItem; evaluacion_persona: EvaluacionPersonaItem }> => {
  const evaluacionPersona = await dbQuery<EvaluacionPersonaRow>(
    `
      SELECT
        ep.activo,
        ep.calificacion_total,
        ep.created_at,
        ep.estado,
        ep.evaluacion_id::text AS evaluacion_id,
        ep.fortalezas,
        ep.id::text AS id,
        ep.oportunidades_mejora,
        ep.persona_id::text AS persona_id,
        ep.plan_accion,
        ep.vinculacion_id::text AS vinculacion_id,
        ev.descripcion,
        ev.fecha_fin,
        ev.fecha_inicio,
        ev.nombre_evaluacion,
        p.numero_documento AS persona_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM evaluaciones_respuestas er
          WHERE er.evaluacion_persona_id = ep.id
            AND COALESCE(er.activo, TRUE) = TRUE
        )::int AS respuestas_total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${buildTenantScope(tenant, 'ev').sql}
      ${buildTenantScope(tenant, 'ev').sql ? 'AND' : 'WHERE'} ep.id = $${buildTenantScope(tenant, 'ev').params.length + 1}::bigint
      LIMIT 1
    `,
    [...buildTenantScope(tenant, 'ev').params, input.evaluacion_persona_id]
  );

  const current = evaluacionPersona.rows[0];

  if (!current) {
    throw new AppError('Evaluation assignment not found', 404, 'EVALUACION_PERSONA_NOT_FOUND');
  }

  const competencia = await assertCompetenciaTenantAccess(Number(input.competencia_id), tenant);

  if (toNumber(competencia.evaluacion_id) !== toNumber(current.evaluacion_id)) {
    throw new AppError('Competencia does not belong to the evaluation', 400, 'EVALUACION_COMPETENCIA_INVALIDA');
  }

  const result = await runInTransaction(async (client) => {
    const respuesta = await client.query<RespuestaRow>(
      `
        INSERT INTO evaluaciones_respuestas (
          evaluacion_persona_id,
          competencia_id,
          calificacion,
          observacion,
          activo
        )
        VALUES ($1::bigint, $2::bigint, $3, $4, TRUE)
        ON CONFLICT (evaluacion_persona_id, competencia_id)
        DO UPDATE SET
          calificacion = EXCLUDED.calificacion,
          observacion = EXCLUDED.observacion,
          activo = TRUE
        RETURNING
          activo,
          calificacion,
          competencia_id::text AS competencia_id,
          created_at,
          evaluacion_persona_id::text AS evaluacion_persona_id,
          id::text AS id,
          observacion
      `,
      [
        input.evaluacion_persona_id,
        input.competencia_id,
        input.calificacion,
        input.observacion ?? null
      ]
    );

    const updated = await recalculateEvaluacionPersona(client, Number(input.evaluacion_persona_id));
    const respuestaRow = respuesta.rows[0];

    if (!respuestaRow) {
      throw new AppError('Failed to register response', 500, 'EVALUACION_RESPUESTA_CREATE_FAILED');
    }

    return {
      evaluacion_persona: mapEvaluacionPersona(updated),
      respuesta: mapRespuesta(respuestaRow)
    };
  });

  await registerAuditEntry({
    accion: 'EVALUACION_PERSONA_UPDATE',
    after: result.evaluacion_persona,
    descripcion: 'Registro de respuesta de evaluacion',
    registro_id: String(input.evaluacion_persona_id),
    tabla: 'evaluaciones_respuestas',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return result;
};

export const getEvaluacionesDashboard = async (
  query: DashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionesDashboard> => {
  const scope = buildTenantScope(tenant, 'ev');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`ev.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`ev.contrato_id = $${params.length}::bigint`);
  }

  if (query.evaluacion_id) {
    params.push(query.evaluacion_id);
    filters.push(`ep.evaluacion_id = $${params.length}::bigint`);
  }

  const whereParts = [scope.sql, filters.length > 0 ? `AND ${filters.join(' AND ')}` : '']
    .filter(Boolean)
    .join(' ');
  const result = await dbQuery<DashboardScoreRow>(
    `
      SELECT
        ep.calificacion_total,
        ep.estado
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      ${whereParts || 'WHERE 1 = 1'}
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
    `,
    params
  );

  const scores = result.rows
    .map((row) => toNullableNumber(row.calificacion_total))
    .filter((value): value is number => value !== null);

  const evaluacionesTotal = result.rows.length;
  const pendientes = result.rows.filter((row) => row.estado === 'PENDIENTE').length;
  const enProceso = result.rows.filter((row) => row.estado === 'EN_PROCESO').length;
  const finalizadas = result.rows.filter((row) => row.estado === 'FINALIZADA').length;
  const deficientes = scores.filter((score) => score <= 2.9).length;
  const aceptables = scores.filter((score) => score >= 3.0 && score <= 3.9).length;
  const buenos = scores.filter((score) => score >= 4.0 && score <= 4.5).length;
  const excelentes = scores.filter((score) => score >= 4.6).length;
  const promedioGeneral = scores.length === 0 ? 0 : roundScore(scores.reduce((accumulator, value) => accumulator + value, 0) / scores.length);

  await registerAuditEntry({
    accion: 'EVALUACION_DASHBOARD_VIEW',
    after: {
      evaluaciones_total: evaluacionesTotal,
      pendientes,
      en_proceso: enProceso,
      finalizadas,
      promedio_general: promedioGeneral
    },
    descripcion: 'Consulta del dashboard de evaluaciones de desempeno',
    registro_id: '0',
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    aceptables,
    buenos,
    deficientes,
    excelentes,
    evaluaciones_total: evaluacionesTotal,
    en_proceso: enProceso,
    finalizadas,
    pendientes,
    promedio_general: promedioGeneral
  };
};

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const toDateOnlyString = (value: Date | string | null | undefined): string => {
  const dateString = toDateString(value);
  return dateString.length >= 10 ? dateString.slice(0, 10) : dateString;
};

const buildGeneralScopeFilters = (
  query: { empresa_id?: string | null; contrato_id?: string | null },
  tenant: TenantAccessContext | undefined
): { params: unknown[]; whereSql: string } => {
  const scope = buildTenantScope(tenant, 'ev');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`ev.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`ev.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = [scope.sql, filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''].filter(Boolean).join(' ');

  return {
    params,
    whereSql
  };
};

const normalizeDashboardGeneralClassification = (value: number): EvaluacionesDashboardGeneral['cumplimiento_desempeno'] =>
  roundScore(value);

const mapGeneralAlertSeverity = (
  tipo: EvaluacionesDashboardGeneralAlertaItem['tipo_alerta']
): EvaluacionesDashboardGeneralAlertaItem['severidad'] => {
  switch (tipo) {
    case 'PLAN_MEJORA_VENCIDO':
      return 'CRITICA';
    case 'EVALUACION_BAJO_DESEMPENO':
      return 'ALTA';
    case 'PLAN_MEJORA_PROXIMO_VENCER':
    case 'EVALUACION_PENDIENTE':
      return 'MEDIA';
    default:
      return 'BAJA';
  }
};

export const getEvaluacionesDashboardGeneral = async (
  query: DashboardGeneralQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionesDashboardGeneral> => {
  const scope = buildGeneralScopeFilters(query, tenant);

  const evaluationsResult = await dbQuery<DashboardGeneralEvaluationRow>(
    `
      SELECT
        ep.calificacion_total,
        ep.estado
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
    `,
    scope.params
  );

  const plansResult = await dbQuery<DashboardGeneralPlanRow>(
    `
      SELECT
        pm.estado,
        pm.fecha_compromiso,
        COALESCE(latest.porcentaje_avance, 0)::int AS progreso_actual
      FROM evaluaciones_planes_mejora pm
      INNER JOIN evaluaciones_persona ep ON ep.id = pm.evaluacion_persona_id
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      LEFT JOIN LATERAL (
        SELECT
          s.fecha_seguimiento AS ultimo_seguimiento,
          s.porcentaje_avance
        FROM evaluaciones_planes_mejora_seguimientos s
        WHERE s.plan_mejora_id = pm.id
          AND COALESCE(s.activo, TRUE) = TRUE
        ORDER BY s.fecha_seguimiento DESC, s.id DESC
        LIMIT 1
      ) latest ON TRUE
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(pm.activo, TRUE) = TRUE
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
    `,
    scope.params
  );

  const scores = evaluationsResult.rows
    .map((row) => toNullableNumber(row.calificacion_total))
    .filter((value): value is number => value !== null);

  const evaluacionesTotal = evaluationsResult.rows.length;
  const pendientes = evaluationsResult.rows.filter((row) => row.estado === 'PENDIENTE').length;
  const enProceso = evaluationsResult.rows.filter((row) => row.estado === 'EN_PROCESO').length;
  const finalizadas = evaluationsResult.rows.filter((row) => row.estado === 'FINALIZADA').length;
  const deficientes = scores.filter((score) => score <= 2.9).length;
  const aceptables = scores.filter((score) => score >= 3.0 && score <= 3.9).length;
  const buenos = scores.filter((score) => score >= 4.0 && score <= 4.5).length;
  const excelentes = scores.filter((score) => score >= 4.6).length;
  const promedioGeneral = scores.length === 0 ? 0 : roundScore(scores.reduce((accumulator, value) => accumulator + value, 0) / scores.length);
  const cumplimientoDesempeno = scores.length === 0 ? 0 : normalizeDashboardGeneralClassification(promedioGeneral * 20);

  const planesMejoraTotal = plansResult.rows.length;
  const planesAbiertos = plansResult.rows.filter((row) => row.estado === 'ABIERTO').length;
  const planesEnProceso = plansResult.rows.filter((row) => row.estado === 'EN_PROCESO').length;
  const planesCerrados = plansResult.rows.filter((row) => row.estado === 'CERRADO').length;
  const planesVencidos = plansResult.rows.filter((row) => {
    if (row.estado === 'VENCIDO') {
      return true;
    }

    const fechaCompromiso = toDateOnlyString(row.fecha_compromiso);
    return fechaCompromiso < getTodayDateOnly() && row.estado !== 'CERRADO' && row.estado !== 'CANCELADO';
  }).length;
  const promedioAvancePlanes =
    plansResult.rows.length === 0
      ? 0
      : roundScore(
          plansResult.rows.reduce((accumulator, row) => accumulator + (toNullableNumber(row.progreso_actual) ?? 0), 0) /
            plansResult.rows.length
        );

  await registerAuditEntry({
    accion: 'DESEMPENO_DASHBOARD_VIEW',
    after: {
      evaluaciones_total: evaluacionesTotal,
      pendientes,
      en_proceso: enProceso,
      finalizadas,
      promedio_general: promedioGeneral,
      planes_mejora_total: planesMejoraTotal,
      planes_abiertos: planesAbiertos,
      planes_en_proceso: planesEnProceso,
      planes_cerrados: planesCerrados,
      planes_vencidos: planesVencidos,
      promedio_avance_planes: promedioAvancePlanes,
      cumplimiento_desempeno: cumplimientoDesempeno
    },
    descripcion: 'Consulta del dashboard general de desempeno',
    registro_id: '0',
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    aceptables,
    buenos,
    cumplimiento_desempeno: cumplimientoDesempeno,
    deficientes,
    en_proceso: enProceso,
    excelentes,
    evaluaciones_total: evaluacionesTotal,
    finalizadas,
    planes_abiertos: planesAbiertos,
    planes_cerrados: planesCerrados,
    planes_en_proceso: planesEnProceso,
    planes_mejora_total: planesMejoraTotal,
    planes_vencidos: planesVencidos,
    promedio_avance_planes: promedioAvancePlanes,
    promedio_general: promedioGeneral,
    pendientes
  };
};

export const getEvaluacionesDashboardGeneralAlertas = async (
  query: DashboardGeneralAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionesDashboardGeneralAlertas> => {
  const scope = buildGeneralScopeFilters(query, tenant);

  const planAlertsResult = await dbQuery<DashboardGeneralPlanAlertRow>(
    `
      SELECT
        pm.activo,
        COALESCE(latest.comentario_ultimo, NULL)::text AS comentario_ultimo,
        pm.created_at,
        pm.descripcion,
        ev.empresa_id::text AS empresa_id,
        ep.evaluacion_id::text AS evaluacion_id,
        pm.fecha_compromiso,
        pm.fecha_cierre,
        pm.fecha_inicio,
        pm.id::text AS id,
        pm.objetivo,
        pm.persona_id::text AS persona_id,
        COALESCE(latest.porcentaje_avance, 0)::int AS progreso_actual,
        pm.responsable,
        latest.ultimo_seguimiento,
        pm.estado,
        ev.contrato_id::text AS contrato_id
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
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(pm.activo, TRUE) = TRUE
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
      ORDER BY pm.fecha_compromiso ASC, pm.id DESC
    `,
    scope.params
  );

  const pendingEvaluationsResult = await dbQuery<DashboardGeneralPendingEvaluationRow>(
    `
      SELECT
        ep.created_at,
        ev.contrato_id::text AS contrato_id,
        ev.descripcion,
        ev.empresa_id::text AS empresa_id,
        ev.id::text AS evaluacion_id,
        ev.fecha_fin,
        ep.id::text AS id,
        ev.nombre_evaluacion,
        p.numero_documento,
        ep.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        ep.estado
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
      AND ep.estado = 'PENDIENTE'
      ORDER BY ep.created_at DESC, ep.id DESC
    `,
    scope.params
  );

  const lowPerformanceResult = await dbQuery<DashboardGeneralLowPerformanceRow>(
    `
      SELECT
        ep.created_at,
        ev.contrato_id::text AS contrato_id,
        ev.empresa_id::text AS empresa_id,
        ev.id::text AS evaluacion_id,
        ev.fecha_fin,
        ep.id::text AS id,
        ev.nombre_evaluacion,
        p.numero_documento,
        ep.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        ep.calificacion_total,
        ep.estado
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
      AND ep.calificacion_total IS NOT NULL
      AND ep.calificacion_total <= 2.9
      ORDER BY ep.calificacion_total ASC, ep.created_at DESC, ep.id DESC
    `,
    scope.params
  );

  const alerts: EvaluacionesDashboardGeneralAlertaItem[] = [];

  for (const row of planAlertsResult.rows) {
    const fechaCompromiso = toDateOnlyString(row.fecha_compromiso);
    const estadoAlerta =
      row.estado === 'CERRADO' || row.estado === 'CANCELADO'
        ? null
        : fechaCompromiso < getTodayDateOnly()
          ? 'PLAN_MEJORA_VENCIDO'
          : fechaCompromiso <= getTodayDateOnly() ? 'PLAN_MEJORA_PROXIMO_VENCER' : null;

    if (!estadoAlerta) {
      continue;
    }

    alerts.push({
      contrato_id: toNullableNumber(row.contrato_id),
      descripcion: row.descripcion,
      empresa_id: toNullableNumber(row.empresa_id),
      evaluacion_id: toNullableNumber(row.evaluacion_id),
      estado: row.estado,
      fecha: fechaCompromiso,
      id: `plan-${row.id}`,
      persona_id: toNullableNumber(row.persona_id),
      plan_mejora_id: toNullableNumber(row.id),
      severidad: mapGeneralAlertSeverity(estadoAlerta),
      tipo_alerta: estadoAlerta,
      titulo: `Plan de mejora ${estadoAlerta === 'PLAN_MEJORA_VENCIDO' ? 'vencido' : 'por vencer'}: ${row.objetivo}`
    });
  }

  for (const row of pendingEvaluationsResult.rows) {
    alerts.push({
      contrato_id: toNullableNumber(row.contrato_id),
      descripcion: row.descripcion ?? 'Evaluacion pendiente de cierre',
      empresa_id: toNullableNumber(row.empresa_id),
      evaluacion_id: toNullableNumber(row.evaluacion_id),
      estado: row.estado,
      fecha: toDateString(row.fecha_fin) || toDateString(row.created_at),
      id: `eval-pending-${row.id}`,
      persona_id: toNullableNumber(row.persona_id),
      plan_mejora_id: null,
      severidad: mapGeneralAlertSeverity('EVALUACION_PENDIENTE'),
      tipo_alerta: 'EVALUACION_PENDIENTE',
      titulo: `Evaluacion pendiente: ${row.nombre_evaluacion}`
    });
  }

  for (const row of lowPerformanceResult.rows) {
    const promedio = toNullableNumber(row.calificacion_total);

    alerts.push({
      contrato_id: toNullableNumber(row.contrato_id),
      descripcion: `Calificacion actual ${promedio ?? 0}`,
      empresa_id: toNullableNumber(row.empresa_id),
      evaluacion_id: toNullableNumber(row.evaluacion_id),
      estado: row.estado,
      fecha: toDateString(row.fecha_fin) || toDateString(row.created_at),
      id: `eval-low-${row.id}`,
      persona_id: toNullableNumber(row.persona_id),
      plan_mejora_id: null,
      severidad: mapGeneralAlertSeverity('EVALUACION_BAJO_DESEMPENO'),
      tipo_alerta: 'EVALUACION_BAJO_DESEMPENO',
      titulo: `Bajo desempeño: ${row.nombre_evaluacion}`
    });
  }

  const severityRank: Record<EvaluacionesDashboardGeneralAlertaItem['severidad'], number> = {
    CRITICA: 4,
    ALTA: 3,
    MEDIA: 2,
    BAJA: 1
  };

  const sortedAlerts = alerts.sort((left, right) => {
    const severityDiff = severityRank[right.severidad] - severityRank[left.severidad];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    const leftDate = left.fecha ? new Date(left.fecha).getTime() : 0;
    const rightDate = right.fecha ? new Date(right.fecha).getTime() : 0;
    return rightDate - leftDate;
  });

  const total = sortedAlerts.length;
  const page = query.page;
  const limit = query.limit;
  const offset = (page - 1) * limit;
  const items = sortedAlerts.slice(offset, offset + limit);

  await registerAuditEntry({
    accion: 'DESEMPENO_ALERTAS_VIEW',
    after: {
      total_alertas: total,
      page,
      limit
    },
    descripcion: 'Consulta de alertas generales de desempeno',
    registro_id: '0',
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildPagination(page, limit, total)
  };
};

export const getEvaluacionesDashboardGeneralRanking = async (
  query: DashboardGeneralRankingQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<EvaluacionesDashboardGeneralRanking> => {
  const scope = buildGeneralScopeFilters(query, tenant);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(DISTINCT ep.persona_id)::int AS total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
      AND ep.calificacion_total IS NOT NULL
    `,
    scope.params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const params: unknown[] = [...scope.params];
  params.push(query.limit);

  const result = await dbQuery<DashboardGeneralRankingRow>(
    `
      SELECT
        CASE WHEN COUNT(DISTINCT ev.contrato_id) = 1 THEN MIN(ev.contrato_id)::text ELSE NULL END AS contrato_id,
        MIN(ev.empresa_id)::text AS empresa_id,
        p.numero_documento AS documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
        ep.persona_id::text AS persona_id,
        ROUND(AVG(ep.calificacion_total)::numeric, 2) AS promedio
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${scope.whereSql || 'WHERE 1 = 1'}
      AND COALESCE(ep.activo, TRUE) = TRUE
      AND COALESCE(ev.activo, TRUE) = TRUE
      AND ep.calificacion_total IS NOT NULL
      GROUP BY ep.persona_id, p.numero_documento, p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido
      ORDER BY promedio DESC, nombre_completo ASC
      LIMIT $${params.length}::int
    `,
    params
  );

  const items = result.rows.map((row) => {
    const promedio = toNullableNumber(row.promedio) ?? 0;

    return {
      clasificacion: toClassification(promedio),
      contrato_id: toNullableNumber(row.contrato_id),
      documento: row.documento,
      empresa_id: toNullableNumber(row.empresa_id),
      nombre_completo: row.nombre_completo,
      persona_id: toNumber(row.persona_id),
      promedio: roundScore(promedio)
    } as EvaluacionesDashboardGeneralRankingItem;
  });

  await registerAuditEntry({
    accion: 'DESEMPENO_RANKING_VIEW',
    after: {
      limit: query.limit,
      total
    },
    descripcion: 'Consulta del ranking general de desempeno',
    registro_id: '0',
    tabla: 'evaluaciones_desempeno',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildPagination(1, query.limit, total)
  };
};

export const loadEvaluacionesExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<EvaluacionesExpedienteResumen> => {
  const scope = buildTenantScope(tenant, 'ev');
  const result = await dbQuery<EvaluacionPersonaRow>(
    `
      SELECT
        ep.activo,
        ep.calificacion_total,
        ep.created_at,
        ep.estado,
        ep.evaluacion_id::text AS evaluacion_id,
        ep.fortalezas,
        ep.id::text AS id,
        ep.oportunidades_mejora,
        ep.persona_id::text AS persona_id,
        ep.plan_accion,
        ep.vinculacion_id::text AS vinculacion_id,
        ev.descripcion,
        ev.fecha_fin,
        ev.fecha_inicio,
        ev.nombre_evaluacion,
        p.numero_documento AS persona_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM evaluaciones_respuestas er
          WHERE er.evaluacion_persona_id = ep.id
            AND COALESCE(er.activo, TRUE) = TRUE
        )::int AS respuestas_total
      FROM evaluaciones_persona ep
      INNER JOIN evaluaciones_desempeno ev ON ev.id = ep.evaluacion_id
      INNER JOIN personas p ON p.id = ep.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} ep.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(ep.activo, TRUE) = TRUE
        AND COALESCE(ev.activo, TRUE) = TRUE
      ORDER BY ep.created_at DESC, ep.id DESC
    `,
    [...scope.params, personaId]
  );

  const items = result.rows.map((row) => ({
    calificacion_total: toNullableNumber(row.calificacion_total),
    created_at: toDateString(row.created_at),
    estado: row.estado,
    evaluacion: {
      fecha_fin: toDateString(row.fecha_fin),
      fecha_inicio: toDateString(row.fecha_inicio),
      id: toNumber(row.evaluacion_id),
      nombre_evaluacion: row.nombre_evaluacion ?? ''
    },
    id: toNumber(row.id),
    persona_id: toNumber(row.persona_id),
    clasificacion: toClassification(toNullableNumber(row.calificacion_total))
  }));

  const scores = items.map((item) => item.calificacion_total).filter((value): value is number => value !== null);
  const planesMejora = await loadPlanesMejoraExpediente(personaId, tenant);

  return {
    indicadores: {
      evaluaciones_total: items.length,
      clasificacion_desempeno: toDesempenoClasificacion(
        scores.length === 0 ? null : roundScore((scores.reduce((accumulator, value) => accumulator + value, 0) / scores.length) * 20)
      ),
      planes_mejora_abiertos: planesMejora.indicadores.planes_mejora_abiertos,
      planes_mejora_vencidos: planesMejora.indicadores.planes_mejora_vencidos,
      promedio_desempeno: scores.length === 0 ? 0 : roundScore(scores.reduce((accumulator, value) => accumulator + value, 0) / scores.length),
      ultima_evaluacion: items[0] ? items[0].evaluacion.fecha_fin || items[0].created_at : null
    },
    planes_mejora: planesMejora,
    items
  };
};
