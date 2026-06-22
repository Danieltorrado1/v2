import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { buildTenantWhereClause, assertTenantAccessForPersonaId, assertTenantAccessForVinculacionId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { ensureContratoExists, ensureVinculacionExists } from './nomina.validator';
import type {
  CreateSolicitudInput,
  CreateVacacionInput,
  ListSolicitudesQuery,
  ListVacacionesQuery,
  NominaVacacionEstado,
  NominaVacacionSolicitudEstado,
  NominaVacacionSolicitudTipo,
  SolicitudActionInput,
  UpdateSolicitudInput,
  UpdateVacacionInput,
  VacacionesAlertasQuery,
  VacacionesDashboardQuery
} from './vacaciones.schemas';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ALERTA_PENDIENTE_DIAS_MINIMOS = 15;

interface CountRow extends QueryResultRow {
  total: number;
}

interface VacacionRow extends QueryResultRow {
  activo: boolean | null;
  created_at: Date | string;
  dias_causados: number | string;
  dias_disfrutados: number | string;
  dias_pagados: number | string;
  dias_pendientes: number | string;
  empresa_id: string;
  estado: NominaVacacionEstado;
  fecha_fin_causacion: Date | string;
  fecha_inicio_causacion: Date | string;
  contrato_id: string | null;
  id: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  solicitudes_total?: number | string | null;
  vinculacion_id: string;
}

interface SolicitudRow extends QueryResultRow {
  activo: boolean | null;
  aprobado_por: string | null;
  contrato_id: string | null;
  created_at: Date | string;
  dias_calendario: number | string | null;
  dias_habiles: number | string | null;
  dias_solicitados: number | string;
  empresa_id: string;
  estado: NominaVacacionSolicitudEstado;
  fecha_aprobacion: Date | string | null;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_solicitud: Date | string;
  id: string;
  observacion: string | null;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  tipo_vacacion: NominaVacacionSolicitudTipo;
  vacacion_id: string;
  vinculacion_id: string;
}

interface VacacionAlertRow extends QueryResultRow {
  activo: boolean | null;
  creado_en: Date | string;
  dias_pendientes: number | string;
  dias_solicitados: number | string | null;
  empresa_id: string;
  estado: string;
  fecha_fin_causacion: Date | string;
  fecha_inicio: Date | string | null;
  fecha_solicitud: Date | string | null;
  id: string;
  nombre_completo: string | null;
  persona_documento: string | null;
  persona_id: string;
  solicitud_id: string | null;
  tipo_alerta: 'VACACIONES_PENDIENTES_ALTAS' | 'SOLICITUD_VACACIONES_PENDIENTE';
  vinculacion_id: string | null;
  contrato_id: string | null;
}

interface VacacionExpedienteSolicitudRow extends QueryResultRow {
  aprobado_por: string | null;
  created_at: Date | string;
  dias_solicitados: number | string;
  estado: NominaVacacionSolicitudEstado;
  fecha_aprobacion: Date | string | null;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_solicitud: Date | string;
  id: string;
  tipo_vacacion: NominaVacacionSolicitudTipo;
  vacacion_id: string;
}

interface VacacionExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  created_at: Date | string;
  dias_causados: number | string;
  dias_disfrutados: number | string;
  dias_pagados: number | string;
  dias_pendientes: number | string;
  empresa_id: string;
  estado: NominaVacacionEstado;
  fecha_fin_causacion: Date | string;
  fecha_inicio_causacion: Date | string;
  id: string;
  persona_id: string;
  vinculacion_id: string;
}

export interface VacacionItem {
  activo: boolean;
  contrato_id: number | null;
  created_at: string;
  dias_causados: number;
  dias_disfrutados: number;
  dias_pagados: number;
  dias_pendientes: number;
  empresa_id: number;
  estado: NominaVacacionEstado;
  fecha_fin_causacion: string;
  fecha_inicio_causacion: string;
  id: number;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  solicitudes_total: number;
  vinculacion_id: number;
}

export interface SolicitudItem {
  activo: boolean;
  aprobado_por: string | null;
  contrato_id: number | null;
  created_at: string;
  dias_calendario: number | null;
  dias_habiles: number | null;
  dias_solicitados: number;
  empresa_id: number;
  estado: NominaVacacionSolicitudEstado;
  fecha_aprobacion: string | null;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_solicitud: string;
  id: number;
  observacion: string | null;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  tipo_vacacion: NominaVacacionSolicitudTipo;
  vacacion_id: number;
  vinculacion_id: number;
}

export interface VacacionesDashboard {
  dias_causados_total: number;
  dias_disfrutados_total: number;
  dias_pagados_total: number;
  dias_pendientes_total: number;
  solicitudes_aprobadas: number;
  solicitudes_disfrutadas: number;
  solicitudes_pagadas: number;
  solicitudes_pendientes: number;
  solicitudes_rechazadas: number;
  solicitudes_total: number;
  vacaciones_total: number;
}

export interface VacacionesAlertaItem {
  activo: boolean;
  creado_en: string;
  dias_pendientes: number;
  dias_solicitados: number | null;
  empresa_id: number;
  estado: string;
  fecha_fin_causacion: string;
  fecha_inicio: string | null;
  fecha_solicitud: string | null;
  id: number;
  nombre_completo: string | null;
  persona_documento: string | null;
  persona_id: number;
  solicitud_id: number | null;
  tipo_alerta: 'VACACIONES_PENDIENTES_ALTAS' | 'SOLICITUD_VACACIONES_PENDIENTE';
  vinculacion_id: number | null;
  contrato_id: number | null;
}

export interface VacacionesExpedienteSolicitudItem {
  aprobado_por: string | null;
  created_at: string;
  dias_solicitados: number;
  estado: NominaVacacionSolicitudEstado;
  fecha_aprobacion: string | null;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_solicitud: string;
  id: number;
  tipo_vacacion: NominaVacacionSolicitudTipo;
  vacacion_id: number;
}

export interface VacacionesExpedienteItem {
  activo: boolean;
  contrato_id: number | null;
  created_at: string;
  dias_causados: number;
  dias_disfrutados: number;
  dias_pagados: number;
  dias_pendientes: number;
  estado: NominaVacacionEstado;
  fecha_fin_causacion: string;
  fecha_inicio_causacion: string;
  id: number;
  solicitudes: VacacionesExpedienteSolicitudItem[];
  vinculacion_id: number;
}

export interface VacacionesExpedienteIndicadores {
  vacaciones_dias_pendientes: number;
  vacaciones_solicitudes_total: number;
  vacaciones_ultima_solicitud: string | null;
}

export interface VacacionesExpediente {
  indicadores: VacacionesExpedienteIndicadores;
  items: VacacionesExpedienteItem[];
}

export interface PaginatedVacaciones {
  items: VacacionItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSolicitudes {
  items: SolicitudItem[];
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

const toDateOnlyString = (value: Date | string | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
};

const toDateOnlyStringNullable = (value: Date | string | null | undefined): string | null => {
  const date = toDateOnlyString(value);
  return date.length === 0 ? null : date;
};

const getTodayDateOnly = (): string => toDateOnlyString(new Date());

const buildPagination = (page: number, limit: number, total: number): PaginatedVacaciones['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const buildPaginationSolicitudes = (page: number, limit: number, total: number): PaginatedSolicitudes['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const runInTransaction = async <T>(executor: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await executor(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const buildTenantScope = (tenant: TenantAccessContext | undefined, alias = 'nv'): { params: unknown[]; sql: string } => {
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
  const pieces: string[] = [];
  if (scope.sql) {
    pieces.push(scope.sql.replace(/^WHERE\s+/i, '').trim());
  }
  if (filters.length > 0) {
    pieces.push(...filters);
  }
  return pieces.length > 0 ? `WHERE ${pieces.join(' AND ')}` : '';
};

const loadContractOrThrow = async (
  contratoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<{ empresa_id: string | null; id: string }> => {
  const scope = tenant
    ? buildTenantWhereClause({
        contratoColumn: 'c.id',
        empresaColumn: 'c.empresa_id',
        tenant
      })
    : { params: [], sql: '' };
  const executor = client ?? dbPool;
  const result = await executor.query<{ empresa_id: string | null; id: string }>(
    `
      SELECT
        c.empresa_id::text AS empresa_id,
        c.id::text AS id
      FROM contratos c
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} c.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, contratoId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  return row;
};

const loadVacacionOrThrow = async (
  vacacionId: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<VacacionRow> => {
  const scope = buildTenantScope(tenant, 'nv');
  const executor = client ?? dbPool;
  const result = await executor.query<VacacionRow>(
    `
      SELECT
        nv.activo,
        nv.created_at,
        nv.dias_causados,
        nv.dias_disfrutados,
        nv.dias_pagados,
        nv.dias_pendientes,
        nv.empresa_id::text AS empresa_id,
        nv.estado,
        nv.fecha_fin_causacion,
        nv.fecha_inicio_causacion,
        nv.contrato_id::text AS contrato_id,
        nv.id::text AS id,
        p.numero_documento AS persona_documento,
        nv.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM nomina_vacaciones_solicitudes s
          WHERE s.vacacion_id = nv.id
            AND COALESCE(s.activo, TRUE) = TRUE
        )::int AS solicitudes_total,
        nv.vinculacion_id::text AS vinculacion_id
      FROM nomina_vacaciones nv
      INNER JOIN personas p ON p.id = nv.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nv.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, vacacionId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Vacation record not found', 404, 'NOMINA_VACACION_NOT_FOUND');
  }

  return row;
};

const loadSolicitudOrThrow = async (
  solicitudId: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<SolicitudRow> => {
  const scope = buildTenantScope(tenant, 'nv');
  const executor = client ?? dbPool;
  const result = await executor.query<SolicitudRow>(
    `
      SELECT
        s.activo,
        s.aprobado_por,
        nv.contrato_id::text AS contrato_id,
        s.created_at,
        s.dias_calendario,
        s.dias_habiles,
        s.dias_solicitados,
        nv.empresa_id::text AS empresa_id,
        s.estado,
        s.fecha_aprobacion,
        s.fecha_fin,
        s.fecha_inicio,
        s.fecha_solicitud,
        s.id::text AS id,
        s.observacion,
        p.numero_documento AS persona_documento,
        s.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        s.tipo_vacacion,
        s.vacacion_id::text AS vacacion_id,
        s.vinculacion_id::text AS vinculacion_id
      FROM nomina_vacaciones_solicitudes s
      INNER JOIN nomina_vacaciones nv ON nv.id = s.vacacion_id
      INNER JOIN personas p ON p.id = s.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} s.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, solicitudId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Vacation request not found', 404, 'NOMINA_VACACION_SOLICITUD_NOT_FOUND');
  }

  return row;
};

const recalculateVacacionPendientes = async (client: PoolClient, vacacionId: number): Promise<void> => {
  await client.query(
    `
      UPDATE nomina_vacaciones
      SET dias_pendientes = GREATEST(dias_causados - dias_disfrutados - dias_pagados, 0)
      WHERE id = $1::bigint
    `,
    [vacacionId]
  );
};

const mapVacacion = (row: VacacionRow): VacacionItem => ({
  activo: toBoolean(row.activo),
  contrato_id: toNullableNumber(row.contrato_id),
  created_at: toDateOnlyString(row.created_at),
  dias_causados: toNullableNumber(row.dias_causados) ?? 0,
  dias_disfrutados: toNullableNumber(row.dias_disfrutados) ?? 0,
  dias_pagados: toNullableNumber(row.dias_pagados) ?? 0,
  dias_pendientes: toNullableNumber(row.dias_pendientes) ?? 0,
  empresa_id: toNumber(row.empresa_id),
  estado: row.estado,
  fecha_fin_causacion: toDateOnlyString(row.fecha_fin_causacion),
  fecha_inicio_causacion: toDateOnlyString(row.fecha_inicio_causacion),
  id: toNumber(row.id),
  persona_documento: row.persona_documento,
  persona_id: toNumber(row.persona_id),
  persona_nombre: row.persona_nombre,
  solicitudes_total: toNullableNumber(row.solicitudes_total) ?? 0,
  vinculacion_id: toNumber(row.vinculacion_id)
});

const mapSolicitud = (row: SolicitudRow): SolicitudItem => ({
  activo: toBoolean(row.activo),
  aprobado_por: row.aprobado_por,
  contrato_id: toNullableNumber(row.contrato_id),
  created_at: toDateOnlyString(row.created_at),
  dias_calendario: toNullableNumber(row.dias_calendario),
  dias_habiles: toNullableNumber(row.dias_habiles),
  dias_solicitados: toNumber(row.dias_solicitados),
  empresa_id: toNumber(row.empresa_id),
  estado: row.estado,
  fecha_aprobacion: toDateOnlyStringNullable(row.fecha_aprobacion),
  fecha_fin: toDateOnlyString(row.fecha_fin),
  fecha_inicio: toDateOnlyString(row.fecha_inicio),
  fecha_solicitud: toDateOnlyString(row.fecha_solicitud),
  id: toNumber(row.id),
  observacion: row.observacion,
  persona_documento: row.persona_documento,
  persona_id: toNumber(row.persona_id),
  persona_nombre: row.persona_nombre,
  tipo_vacacion: row.tipo_vacacion,
  vacacion_id: toNumber(row.vacacion_id),
  vinculacion_id: toNumber(row.vinculacion_id)
});

const appendVacationFilters = (
  filters: string[],
  params: unknown[],
  query: {
    activo?: boolean;
    contrato_id?: string | null;
    empresa_id?: string | null;
    estado?: string;
    persona_id?: string | null;
    search?: string | null;
    vinculacion_id?: string | null;
  },
  alias = 'nv'
): void => {
  if (query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(${alias}.activo, TRUE) = $${params.length}`);
  }

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`${alias}.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`${alias}.contrato_id = $${params.length}::bigint`);
  }

  if (query.persona_id) {
    params.push(query.persona_id);
    filters.push(`${alias}.persona_id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    filters.push(`${alias}.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    filters.push(`${alias}.estado = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(
      COALESCE(p.primer_nombre, '') ILIKE $${params.length}
      OR COALESCE(p.primer_apellido, '') ILIKE $${params.length}
      OR COALESCE(p.numero_documento, '') ILIKE $${params.length}
    )`);
  }
};

export const listVacaciones = async (
  query: ListVacacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedVacaciones> => {
  const scope = buildTenantScope(tenant, 'nv');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  appendVacationFilters(filters, params, query, 'nv');

  const whereSql = scopeWhereSql(scope, filters);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_vacaciones nv
      INNER JOIN personas p ON p.id = nv.persona_id
      ${whereSql || 'WHERE 1 = 1'}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<VacacionRow>(
    `
      SELECT
        nv.activo,
        nv.created_at,
        nv.dias_causados,
        nv.dias_disfrutados,
        nv.dias_pagados,
        nv.dias_pendientes,
        nv.empresa_id::text AS empresa_id,
        nv.estado,
        nv.fecha_fin_causacion,
        nv.fecha_inicio_causacion,
        nv.contrato_id::text AS contrato_id,
        nv.id::text AS id,
        p.numero_documento AS persona_documento,
        nv.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        (
          SELECT COUNT(*)
          FROM nomina_vacaciones_solicitudes s
          WHERE s.vacacion_id = nv.id
            AND COALESCE(s.activo, TRUE) = TRUE
        )::int AS solicitudes_total,
        nv.vinculacion_id::text AS vinculacion_id
      FROM nomina_vacaciones nv
      INNER JOIN personas p ON p.id = nv.persona_id
      ${whereSql || 'WHERE 1 = 1'}
      ORDER BY nv.created_at DESC, nv.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapVacacion),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

export const createVacacion = async (
  input: CreateVacacionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<VacacionItem> => {
  const result = await runInTransaction(async (client) => {
    await assertTenantAccessForPersonaId(tenant, input.persona_id);
    await assertTenantAccessForVinculacionId(tenant, input.vinculacion_id);
    const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
    if (vinculacion.persona_id !== input.persona_id) {
      throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_VACACION_VINCULACION_INVALIDA');
    }
    const selectedContratoId = input.contrato_id ?? vinculacion.contrato_id;
    const contrato = await loadContractOrThrow(selectedContratoId, tenant, client);
    const selectedEmpresaId = contrato.empresa_id ?? input.empresa_id;
    if (!selectedEmpresaId) {
      throw new AppError('Empresa is required for vacation records', 400, 'NOMINA_VACACION_EMPRESA_INVALIDA');
    }
    if (selectedEmpresaId !== contrato.empresa_id) {
      throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_VACACION_EMPRESA_INVALIDA');
    }

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_vacaciones (
          empresa_id,
          contrato_id,
          persona_id,
          vinculacion_id,
          fecha_inicio_causacion,
          fecha_fin_causacion,
          dias_causados,
          dias_disfrutados,
          dias_pagados,
          dias_pendientes,
          estado,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5::date,
          $6::date,
          $7::numeric,
          $8::numeric,
          $9::numeric,
          GREATEST(($7::numeric - $8::numeric - $9::numeric), 0::numeric),
          $10,
          $11
        )
        RETURNING id::text AS id
      `,
      [
        selectedEmpresaId,
        selectedContratoId,
        input.persona_id,
        input.vinculacion_id,
        input.fecha_inicio_causacion,
        input.fecha_fin_causacion,
        input.dias_causados,
        input.dias_disfrutados,
        input.dias_pagados,
        input.estado,
        input.activo
      ]
    );

    const row = created.rows[0];
    if (!row) {
      throw new AppError('Failed to create vacation record', 500, 'NOMINA_VACACION_CREATE_FAILED');
    }

    return loadVacacionOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_CREATE',
    after: mapVacacion(result),
    descripcion: 'Creacion de control de vacaciones',
    registro_id: result.id,
    tabla: 'nomina_vacaciones',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapVacacion(result);
};

export const updateVacacion = async (
  id: number,
  input: UpdateVacacionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<VacacionItem> => {
  const current = await loadVacacionOrThrow(id, tenant);
  const nextEmpresaId = input.empresa_id ? input.empresa_id : current.empresa_id;
  const nextPersonaId = input.persona_id ? input.persona_id : current.persona_id;
  const nextVinculacionId = input.vinculacion_id ? input.vinculacion_id : current.vinculacion_id;
  const nextContratoId = input.contrato_id === undefined ? current.contrato_id : input.contrato_id;

  const result = await runInTransaction(async (client) => {
    await assertTenantAccessForPersonaId(tenant, nextPersonaId);
    await assertTenantAccessForVinculacionId(tenant, nextVinculacionId);
    const vinculacion = await ensureVinculacionExists(nextVinculacionId, client);
    if (vinculacion.persona_id !== nextPersonaId) {
      throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_VACACION_VINCULACION_INVALIDA');
    }
    const selectedContratoId = nextContratoId ?? vinculacion.contrato_id;
    const contrato = await loadContractOrThrow(selectedContratoId, tenant, client);
    const selectedEmpresaId = nextEmpresaId ?? contrato.empresa_id;
    if (!selectedEmpresaId) {
      throw new AppError('Empresa is required for vacation records', 400, 'NOMINA_VACACION_EMPRESA_INVALIDA');
    }
    if (selectedEmpresaId !== contrato.empresa_id) {
      throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_VACACION_EMPRESA_INVALIDA');
    }

    const updated = await client.query<{ id: string }>(
      `
        UPDATE nomina_vacaciones
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          persona_id = $4::bigint,
          vinculacion_id = $5::bigint,
          fecha_inicio_causacion = $6::date,
          fecha_fin_causacion = $7::date,
          dias_causados = $8::numeric,
          dias_disfrutados = $9::numeric,
          dias_pagados = $10::numeric,
          dias_pendientes = GREATEST(($8::numeric - $9::numeric - $10::numeric), 0::numeric),
          estado = $11,
          activo = $12
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        id,
        selectedEmpresaId,
        selectedContratoId,
        nextPersonaId,
        nextVinculacionId,
        input.fecha_inicio_causacion ?? current.fecha_inicio_causacion,
        input.fecha_fin_causacion ?? current.fecha_fin_causacion,
        input.dias_causados ?? toNullableNumber(current.dias_causados) ?? 0,
        input.dias_disfrutados ?? toNullableNumber(current.dias_disfrutados) ?? 0,
        input.dias_pagados ?? toNullableNumber(current.dias_pagados) ?? 0,
        input.estado ?? current.estado,
        input.activo ?? toBoolean(current.activo)
      ]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError('Vacation record not found', 404, 'NOMINA_VACACION_NOT_FOUND');
    }

    return loadVacacionOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_UPDATE',
    after: mapVacacion(result),
    descripcion: 'Actualizacion de control de vacaciones',
    registro_id: result.id,
    tabla: 'nomina_vacaciones',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapVacacion(result);
};

export const deactivateVacacion = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<VacacionItem> => {
  const current = await loadVacacionOrThrow(id, tenant);
  const result = await dbQuery<VacacionRow>(
    `
      UPDATE nomina_vacaciones
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        created_at,
        dias_causados,
        dias_disfrutados,
        dias_pagados,
        dias_pendientes,
        empresa_id::text AS empresa_id,
        estado,
        fecha_fin_causacion,
        fecha_inicio_causacion,
        contrato_id::text AS contrato_id,
        id::text AS id,
        NULL::text AS persona_documento,
        persona_id::text AS persona_id,
        NULL::text AS persona_nombre,
        0::int AS solicitudes_total,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = result.rows[0] ?? current;

  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_DEACTIVATE',
    after: mapVacacion(row),
    descripcion: 'Desactivacion de control de vacaciones',
    registro_id: String(id),
    tabla: 'nomina_vacaciones',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapVacacion(row);
};

const applySolicitudStateChange = async (
  client: PoolClient,
  row: SolicitudRow,
  nextEstado: NominaVacacionSolicitudEstado
): Promise<void> => {
  const currentState = row.estado;
  if (currentState === nextEstado) {
    return;
  }

  if (nextEstado === 'DISFRUTADA' && currentState !== 'DISFRUTADA') {
    if (row.tipo_vacacion !== 'DISFRUTADA') {
      throw new AppError('Only disfrutada vacation requests can be marked as disfrutada', 409, 'NOMINA_VACACION_SOLICITUD_TIPO_INVALIDO');
    }

    await client.query(
      `
        UPDATE nomina_vacaciones
        SET dias_disfrutados = dias_disfrutados + $2::numeric
        WHERE id = $1::bigint
      `,
      [row.vacacion_id, row.dias_solicitados]
    );
  }

  if (nextEstado === 'PAGADA' && currentState !== 'PAGADA') {
    if (row.tipo_vacacion !== 'PAGADA' && row.tipo_vacacion !== 'COMPENSADA') {
      throw new AppError('Only paid or compensated vacation requests can be marked as paid', 409, 'NOMINA_VACACION_SOLICITUD_TIPO_INVALIDO');
    }

    await client.query(
      `
        UPDATE nomina_vacaciones
        SET dias_pagados = dias_pagados + $2::numeric
        WHERE id = $1::bigint
      `,
      [row.vacacion_id, row.dias_solicitados]
    );
  }

  if (nextEstado === 'SOLICITADA') {
    return;
  }

  await client.query(`UPDATE nomina_vacaciones SET dias_pendientes = GREATEST((dias_causados - dias_disfrutados - dias_pagados), 0::numeric) WHERE id = $1::bigint`, [
    row.vacacion_id
  ]);
};

export const listSolicitudes = async (
  query: ListSolicitudesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSolicitudes> => {
  const scope = buildTenantScope(tenant, 'nv');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(s.activo, TRUE) = $${params.length}`);
  }

  if (query.persona_id) {
    params.push(query.persona_id);
    filters.push(`s.persona_id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    filters.push(`s.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.vacacion_id) {
    params.push(query.vacacion_id);
    filters.push(`s.vacacion_id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    filters.push(`s.estado = $${params.length}`);
  }

  if (query.tipo_vacacion) {
    params.push(query.tipo_vacacion);
    filters.push(`s.tipo_vacacion = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(
      COALESCE(p.primer_nombre, '') ILIKE $${params.length}
      OR COALESCE(p.primer_apellido, '') ILIKE $${params.length}
      OR COALESCE(p.numero_documento, '') ILIKE $${params.length}
    )`);
  }

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nv.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nv.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = [scope.sql, filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''].filter(Boolean).join(' ');

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_vacaciones_solicitudes s
      INNER JOIN nomina_vacaciones nv ON nv.id = s.vacacion_id
      INNER JOIN personas p ON p.id = s.persona_id
      ${whereSql || 'WHERE 1 = 1'}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<SolicitudRow>(
    `
      SELECT
        s.activo,
        s.aprobado_por,
        nv.contrato_id::text AS contrato_id,
        s.created_at,
        s.dias_calendario,
        s.dias_habiles,
        s.dias_solicitados,
        nv.empresa_id::text AS empresa_id,
        s.estado,
        s.fecha_aprobacion,
        s.fecha_fin,
        s.fecha_inicio,
        s.fecha_solicitud,
        s.id::text AS id,
        s.observacion,
        p.numero_documento AS persona_documento,
        s.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        s.tipo_vacacion,
        s.vacacion_id::text AS vacacion_id,
        s.vinculacion_id::text AS vinculacion_id
      FROM nomina_vacaciones_solicitudes s
      INNER JOIN nomina_vacaciones nv ON nv.id = s.vacacion_id
      INNER JOIN personas p ON p.id = s.persona_id
      ${whereSql || 'WHERE 1 = 1'}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapSolicitud),
    pagination: buildPaginationSolicitudes(query.page, query.limit, total)
  };
};

export const createSolicitud = async (
  input: CreateSolicitudInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SolicitudItem> => {
  const vacacion = await loadVacacionOrThrow(Number(input.vacacion_id), tenant);
  if (toNumber(vacacion.persona_id) !== toNumber(input.persona_id)) {
    throw new AppError('Vacation record does not belong to persona', 400, 'NOMINA_VACACION_PERSONA_INVALIDA');
  }
  await assertTenantAccessForPersonaId(tenant, input.persona_id);
  await assertTenantAccessForVinculacionId(tenant, input.vinculacion_id);
  const vinculacion = await ensureVinculacionExists(input.vinculacion_id);
  if (vinculacion.persona_id !== input.persona_id) {
    throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_VACACION_VINCULACION_INVALIDA');
  }
  if (toNumber(vacacion.vinculacion_id) !== toNumber(input.vinculacion_id)) {
    throw new AppError('Vacation record does not belong to vinculacion', 400, 'NOMINA_VACACION_VINCULACION_INVALIDA');
  }

  const result = await dbPool.connect();
  try {
    await result.query('BEGIN');
    const created = await result.query<{ id: string }>(
      `
        INSERT INTO nomina_vacaciones_solicitudes (
          vacacion_id,
          persona_id,
          vinculacion_id,
          fecha_solicitud,
          fecha_inicio,
          fecha_fin,
          dias_solicitados,
          dias_habiles,
          dias_calendario,
          tipo_vacacion,
          estado,
          aprobado_por,
          fecha_aprobacion,
          observacion,
          activo
        )
        VALUES ($1::bigint, $2::bigint, $3::bigint, CURRENT_DATE, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12::date, $13, $14)
        RETURNING id::text AS id
      `,
      [
        input.vacacion_id,
        input.persona_id,
        input.vinculacion_id,
        input.fecha_inicio,
        input.fecha_fin,
        input.dias_solicitados,
        input.dias_habiles ?? null,
        input.dias_calendario ?? null,
        input.tipo_vacacion,
        'SOLICITADA',
        null,
        null,
        input.observacion ?? null,
        input.activo
      ]
    );

    const row = created.rows[0];
    if (!row) {
      throw new AppError('Failed to create vacation request', 500, 'NOMINA_VACACION_SOLICITUD_CREATE_FAILED');
    }

    const fullRow = await loadSolicitudOrThrow(toNumber(row.id), tenant, result);
    await result.query('COMMIT');
    await registerAuditEntry({
      accion: 'NOMINA_VACACIONES_SOLICITUD_CREATE',
      after: mapSolicitud(fullRow),
      descripcion: 'Creacion de solicitud de vacaciones',
      registro_id: fullRow.id,
      tabla: 'nomina_vacaciones_solicitudes',
      usuario_id: actorUserId,
      ...auditMeta
    });
    return mapSolicitud(fullRow);
  } catch (error) {
    await result.query('ROLLBACK');
    throw error;
  } finally {
    result.release();
  }
};

export const updateSolicitud = async (
  id: number,
  input: UpdateSolicitudInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SolicitudItem> => {
  const current = await loadSolicitudOrThrow(id, tenant);
  const nextVacacionId = input.vacacion_id ? toNumber(input.vacacion_id) : toNumber(current.vacacion_id);
  const nextPersonaId = input.persona_id ? toNumber(input.persona_id) : toNumber(current.persona_id);
  const nextVinculacionId = input.vinculacion_id ? toNumber(input.vinculacion_id) : toNumber(current.vinculacion_id);
  const nextVacacion = await loadVacacionOrThrow(nextVacacionId, tenant);
  if (toNumber(nextVacacion.persona_id) !== nextPersonaId) {
    throw new AppError('Vacation record does not belong to persona', 400, 'NOMINA_VACACION_PERSONA_INVALIDA');
  }
  await assertTenantAccessForPersonaId(tenant, nextPersonaId);
  await assertTenantAccessForVinculacionId(tenant, nextVinculacionId);
  const vinculacion = await ensureVinculacionExists(String(nextVinculacionId));
  if (vinculacion.persona_id !== String(nextPersonaId)) {
    throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_VACACION_VINCULACION_INVALIDA');
  }
  if (toNumber(nextVacacion.vinculacion_id) !== nextVinculacionId) {
    throw new AppError('Vacation record does not belong to vinculacion', 400, 'NOMINA_VACACION_VINCULACION_INVALIDA');
  }

  const result = await dbQuery<{ id: string }>(
    `
      UPDATE nomina_vacaciones_solicitudes
      SET
        vacacion_id = COALESCE($2::bigint, vacacion_id),
        persona_id = COALESCE($3::bigint, persona_id),
        vinculacion_id = COALESCE($4::bigint, vinculacion_id),
        fecha_inicio = COALESCE($5::date, fecha_inicio),
        fecha_fin = COALESCE($6::date, fecha_fin),
        dias_solicitados = COALESCE($7, dias_solicitados),
        dias_habiles = COALESCE($8, dias_habiles),
        dias_calendario = COALESCE($9, dias_calendario),
        tipo_vacacion = COALESCE($10, tipo_vacacion),
        observacion = COALESCE($11, observacion),
        activo = COALESCE($12, activo)
      WHERE id = $1::bigint
      RETURNING id::text AS id
    `,
    [
      id,
      input.vacacion_id ?? null,
      input.persona_id ?? null,
      input.vinculacion_id ?? null,
      input.fecha_inicio ?? null,
      input.fecha_fin ?? null,
      input.dias_solicitados ?? null,
      input.dias_habiles ?? null,
      input.dias_calendario ?? null,
      input.tipo_vacacion ?? null,
      input.observacion ?? null,
      input.activo ?? null
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Vacation request not found', 404, 'NOMINA_VACACION_SOLICITUD_NOT_FOUND');
  }

  const fullRow = await loadSolicitudOrThrow(id, tenant);
  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_SOLICITUD_UPDATE',
    after: mapSolicitud(fullRow),
    before: mapSolicitud(current),
    descripcion: 'Actualizacion de solicitud de vacaciones',
    registro_id: fullRow.id,
    tabla: 'nomina_vacaciones_solicitudes',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapSolicitud(fullRow);
};

const changeSolicitudState = async (
  id: number,
  nextEstado: NominaVacacionSolicitudEstado,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta,
  extra?: SolicitudActionInput
): Promise<SolicitudItem> => {
  const current = await loadSolicitudOrThrow(id, tenant);
  if (current.estado === nextEstado) {
    return mapSolicitud(current);
  }

  const result = await runInTransaction(async (client) => {
    if (nextEstado === 'APROBADA' && current.estado === 'SOLICITADA') {
      const vacacion = await loadVacacionOrThrow(toNumber(current.vacacion_id), tenant, client);
      const pendientes = toNullableNumber(vacacion.dias_pendientes) ?? 0;
      if ((toNullableNumber(current.dias_solicitados) ?? 0) > pendientes) {
        throw new AppError('Requested days exceed available balance', 409, 'NOMINA_VACACION_SALDO_INSUFICIENTE');
      }
    }

    if (nextEstado === 'DISFRUTADA' || nextEstado === 'PAGADA') {
      await applySolicitudStateChange(client, current, nextEstado);
    }

    const updated = await client.query<{ id: string }>(
      `
        UPDATE nomina_vacaciones_solicitudes
        SET
          estado = $2,
          aprobado_por = CASE WHEN $2 = 'APROBADA' THEN $3 ELSE aprobado_por END,
          fecha_aprobacion = CASE WHEN $2 = 'APROBADA' THEN CURRENT_DATE ELSE fecha_aprobacion END,
          observacion = COALESCE($4, observacion)
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [id, nextEstado, actorUserId, extra?.observacion ?? null]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError('Vacation request not found', 404, 'NOMINA_VACACION_SOLICITUD_NOT_FOUND');
    }

    await recalculateVacacionPendientes(client, toNumber(current.vacacion_id));
    return loadSolicitudOrThrow(id, tenant, client);
  });

  const auditAction =
    nextEstado === 'APROBADA'
      ? 'NOMINA_VACACIONES_SOLICITUD_APPROVE'
      : nextEstado === 'RECHAZADA'
        ? 'NOMINA_VACACIONES_SOLICITUD_REJECT'
        : nextEstado === 'DISFRUTADA'
          ? 'NOMINA_VACACIONES_SOLICITUD_DISFRUTADA'
          : 'NOMINA_VACACIONES_SOLICITUD_PAGADA';

  await registerAuditEntry({
    accion: auditAction,
    after: mapSolicitud(result),
    before: mapSolicitud(current),
    descripcion: `Cambio de estado de solicitud a ${nextEstado}`,
    registro_id: result.id,
    tabla: 'nomina_vacaciones_solicitudes',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapSolicitud(result);
};

export const approveSolicitud = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta,
  input?: SolicitudActionInput
): Promise<SolicitudItem> => changeSolicitudState(id, 'APROBADA', actorUserId, tenant, auditMeta, input);

export const rejectSolicitud = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta,
  input?: SolicitudActionInput
): Promise<SolicitudItem> => changeSolicitudState(id, 'RECHAZADA', actorUserId, tenant, auditMeta, input);

export const markSolicitudDisfrutada = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta,
  input?: SolicitudActionInput
): Promise<SolicitudItem> => changeSolicitudState(id, 'DISFRUTADA', actorUserId, tenant, auditMeta, input);

export const markSolicitudPagada = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta,
  input?: SolicitudActionInput
): Promise<SolicitudItem> => changeSolicitudState(id, 'PAGADA', actorUserId, tenant, auditMeta, input);

export const deactivateSolicitud = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SolicitudItem> => {
  const current = await loadSolicitudOrThrow(id, tenant);
  await dbQuery<SolicitudRow>(
    `
      UPDATE nomina_vacaciones_solicitudes
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        aprobado_por,
        contrato_id::text AS contrato_id,
        created_at,
        dias_calendario,
        dias_habiles,
        dias_solicitados,
        empresa_id::text AS empresa_id,
        estado,
        fecha_aprobacion,
        fecha_fin,
        fecha_inicio,
        fecha_solicitud,
        id::text AS id,
        observacion,
        NULL::text AS persona_documento,
        persona_id::text AS persona_id,
        NULL::text AS persona_nombre,
        tipo_vacacion,
        vacacion_id::text AS vacacion_id,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = await loadSolicitudOrThrow(id, tenant);
  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_SOLICITUD_DEACTIVATE',
    after: mapSolicitud(row),
    descripcion: 'Desactivacion de solicitud de vacaciones',
    registro_id: String(id),
    tabla: 'nomina_vacaciones_solicitudes',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapSolicitud(row);
};

export const getVacacionesDashboard = async (
  query: VacacionesDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<VacacionesDashboard> => {
  const scope = buildTenantScope(tenant, 'nv');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nv.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nv.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);

  const vacationsResult = await dbQuery<{
    dias_causados_total: number | string | null;
    dias_disfrutados_total: number | string | null;
    dias_pagados_total: number | string | null;
    dias_pendientes_total: number | string | null;
    vacaciones_total: number;
  }>(
    `
      SELECT
        COALESCE(SUM(nv.dias_causados), 0) AS dias_causados_total,
        COALESCE(SUM(nv.dias_disfrutados), 0) AS dias_disfrutados_total,
        COALESCE(SUM(nv.dias_pagados), 0) AS dias_pagados_total,
        COALESCE(SUM(nv.dias_pendientes), 0) AS dias_pendientes_total,
        COUNT(*)::int AS vacaciones_total
      FROM nomina_vacaciones nv
      ${whereSql || 'WHERE 1 = 1'}
      AND COALESCE(nv.activo, TRUE) = TRUE
    `,
    params
  );

  const solicitudesResult = await dbQuery<{
    solicitudes_aprobadas: number;
    solicitudes_disfrutadas: number;
    solicitudes_pagadas: number;
    solicitudes_pendientes: number;
    solicitudes_rechazadas: number;
    solicitudes_total: number;
  }>(
    `
      SELECT
        COUNT(*)::int AS solicitudes_total,
        COUNT(*) FILTER (WHERE s.estado = 'SOLICITADA')::int AS solicitudes_pendientes,
        COUNT(*) FILTER (WHERE s.estado = 'APROBADA')::int AS solicitudes_aprobadas,
        COUNT(*) FILTER (WHERE s.estado = 'RECHAZADA')::int AS solicitudes_rechazadas,
        COUNT(*) FILTER (WHERE s.estado = 'DISFRUTADA')::int AS solicitudes_disfrutadas,
        COUNT(*) FILTER (WHERE s.estado = 'PAGADA')::int AS solicitudes_pagadas
      FROM nomina_vacaciones_solicitudes s
      INNER JOIN nomina_vacaciones nv ON nv.id = s.vacacion_id
      ${whereSql || 'WHERE 1 = 1'}
      AND COALESCE(s.activo, TRUE) = TRUE
      AND COALESCE(nv.activo, TRUE) = TRUE
    `,
    params
  );

  const vacations = vacationsResult.rows[0];
  const requests = solicitudesResult.rows[0];

  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_DASHBOARD_VIEW',
    after: {
      vacaciones_total: vacations?.vacaciones_total ?? 0,
      solicitudes_total: requests?.solicitudes_total ?? 0
    },
    descripcion: 'Consulta del dashboard de vacaciones',
    registro_id: '0',
    tabla: 'nomina_vacaciones',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    vacaciones_total: vacations?.vacaciones_total ?? 0,
    dias_causados_total: toNullableNumber(vacations?.dias_causados_total) ?? 0,
    dias_disfrutados_total: toNullableNumber(vacations?.dias_disfrutados_total) ?? 0,
    dias_pagados_total: toNullableNumber(vacations?.dias_pagados_total) ?? 0,
    dias_pendientes_total: toNullableNumber(vacations?.dias_pendientes_total) ?? 0,
    solicitudes_total: requests?.solicitudes_total ?? 0,
    solicitudes_pendientes: requests?.solicitudes_pendientes ?? 0,
    solicitudes_aprobadas: requests?.solicitudes_aprobadas ?? 0,
    solicitudes_rechazadas: requests?.solicitudes_rechazadas ?? 0,
    solicitudes_disfrutadas: requests?.solicitudes_disfrutadas ?? 0,
    solicitudes_pagadas: requests?.solicitudes_pagadas ?? 0
  };
};

export const getVacacionesAlertas = async (
  query: VacacionesAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<{ items: VacacionesAlertaItem[]; pagination: { limit: number; page: number; total: number; total_pages: number } }> => {
  const scope = buildTenantScope(tenant, 'nv');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  const countFilters: string[] = [];
  const countParams: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nv.empresa_id = $${params.length}::bigint`);
    countParams.push(query.empresa_id);
    countFilters.push(`nv.empresa_id = $${countParams.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nv.contrato_id = $${params.length}::bigint`);
    countParams.push(query.contrato_id);
    countFilters.push(`nv.contrato_id = $${countParams.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);
  const countWhereSql = scopeWhereSql(scope, countFilters);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_vacaciones nv
      INNER JOIN personas p ON p.id = nv.persona_id
      ${countWhereSql || 'WHERE 1 = 1'}
    `,
    countParams
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const rows = await dbQuery<VacacionAlertRow>(
    `
      SELECT
        nv.activo,
        nv.created_at AS creado_en,
        nv.dias_pendientes,
        s.dias_solicitados,
        nv.empresa_id::text AS empresa_id,
        nv.estado,
        nv.fecha_fin_causacion,
        s.fecha_inicio,
        s.fecha_solicitud,
        nv.id::text AS id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
        p.numero_documento AS persona_documento,
        nv.persona_id::text AS persona_id,
        s.id::text AS solicitud_id,
        CASE
          WHEN nv.dias_pendientes >= ${ALERTA_PENDIENTE_DIAS_MINIMOS} THEN 'VACACIONES_PENDIENTES_ALTAS'
          ELSE 'SOLICITUD_VACACIONES_PENDIENTE'
        END AS tipo_alerta,
        nv.vinculacion_id::text AS vinculacion_id,
        nv.contrato_id::text AS contrato_id
      FROM nomina_vacaciones nv
      INNER JOIN personas p ON p.id = nv.persona_id
      LEFT JOIN nomina_vacaciones_solicitudes s
        ON s.vacacion_id = nv.id
       AND COALESCE(s.activo, TRUE) = TRUE
       AND s.estado = 'SOLICITADA'
      ${whereSql || 'WHERE 1 = 1'}
        AND COALESCE(nv.activo, TRUE) = TRUE
        AND (
          nv.dias_pendientes >= ${ALERTA_PENDIENTE_DIAS_MINIMOS}
          OR s.id IS NOT NULL
        )
      ORDER BY
        CASE WHEN nv.dias_pendientes >= ${ALERTA_PENDIENTE_DIAS_MINIMOS} THEN 0 ELSE 1 END,
        nv.dias_pendientes DESC,
        nv.created_at DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  const items = rows.rows.map((row) => ({
    activo: toBoolean(row.activo),
    creado_en: toDateOnlyString(row.creado_en),
    dias_pendientes: toNullableNumber(row.dias_pendientes) ?? 0,
    dias_solicitados: toNullableNumber(row.dias_solicitados),
    empresa_id: toNumber(row.empresa_id),
    estado: row.estado,
    fecha_fin_causacion: toDateOnlyString(row.fecha_fin_causacion),
    fecha_inicio: toDateOnlyStringNullable(row.fecha_inicio),
    fecha_solicitud: toDateOnlyStringNullable(row.fecha_solicitud),
    id: toNumber(row.id),
    nombre_completo: row.nombre_completo,
    persona_documento: row.persona_documento,
    persona_id: toNumber(row.persona_id),
    solicitud_id: toNullableNumber(row.solicitud_id),
    tipo_alerta: row.tipo_alerta,
    vinculacion_id: toNullableNumber(row.vinculacion_id),
    contrato_id: toNullableNumber(row.contrato_id)
  }));

  await registerAuditEntry({
    accion: 'NOMINA_VACACIONES_ALERTAS_VIEW',
    after: { total: items.length },
    descripcion: 'Consulta de alertas de vacaciones',
    registro_id: '0',
    tabla: 'nomina_vacaciones',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildPaginationSolicitudes(query.page, query.limit, total)
  };
};

export const loadVacacionesExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<VacacionesExpediente> => {
  const scope = buildTenantScope(tenant, 'nv');

  const vacaciones = await dbQuery<VacacionExpedienteRow>(
    `
      SELECT
        nv.activo,
        nv.contrato_id::text AS contrato_id,
        nv.created_at,
        nv.dias_causados,
        nv.dias_disfrutados,
        nv.dias_pagados,
        nv.dias_pendientes,
        nv.estado,
        nv.fecha_fin_causacion,
        nv.fecha_inicio_causacion,
        nv.id::text AS id,
        nv.persona_id::text AS persona_id,
        nv.vinculacion_id::text AS vinculacion_id
      FROM nomina_vacaciones nv
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nv.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(nv.activo, TRUE) = TRUE
      ORDER BY nv.created_at DESC, nv.id DESC
    `,
    [...scope.params, personaId]
  );

  const solicitudes = await dbQuery<VacacionExpedienteSolicitudRow>(
    `
      SELECT
        s.aprobado_por,
        s.created_at,
        s.dias_solicitados,
        s.estado,
        s.fecha_aprobacion,
        s.fecha_fin,
        s.fecha_inicio,
        s.fecha_solicitud,
        s.id::text AS id,
        s.tipo_vacacion,
        s.vacacion_id::text AS vacacion_id
      FROM nomina_vacaciones_solicitudes s
      INNER JOIN nomina_vacaciones nv ON nv.id = s.vacacion_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nv.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(s.activo, TRUE) = TRUE
        AND COALESCE(nv.activo, TRUE) = TRUE
      ORDER BY s.created_at DESC, s.id DESC
    `,
    [...scope.params, personaId]
  );

  const solicitudesByVacacion = new Map<number, VacacionesExpedienteSolicitudItem[]>();
  for (const row of solicitudes.rows) {
    const item: VacacionesExpedienteSolicitudItem = {
      aprobado_por: row.aprobado_por,
      created_at: toDateOnlyString(row.created_at),
      dias_solicitados: toNumber(row.dias_solicitados),
      estado: row.estado,
      fecha_aprobacion: toDateOnlyStringNullable(row.fecha_aprobacion),
      fecha_fin: toDateOnlyString(row.fecha_fin),
      fecha_inicio: toDateOnlyString(row.fecha_inicio),
      fecha_solicitud: toDateOnlyString(row.fecha_solicitud),
      id: toNumber(row.id),
      tipo_vacacion: row.tipo_vacacion,
      vacacion_id: toNumber(row.vacacion_id)
    };
    const current = solicitudesByVacacion.get(item.vacacion_id) ?? [];
    current.push(item);
    solicitudesByVacacion.set(item.vacacion_id, current);
  }

  const items = vacaciones.rows.map((row) => ({
    activo: toBoolean(row.activo),
    contrato_id: toNullableNumber(row.contrato_id),
    created_at: toDateOnlyString(row.created_at),
    dias_causados: toNullableNumber(row.dias_causados) ?? 0,
    dias_disfrutados: toNullableNumber(row.dias_disfrutados) ?? 0,
    dias_pagados: toNullableNumber(row.dias_pagados) ?? 0,
    dias_pendientes: toNullableNumber(row.dias_pendientes) ?? 0,
    estado: row.estado,
    fecha_fin_causacion: toDateOnlyString(row.fecha_fin_causacion),
    fecha_inicio_causacion: toDateOnlyString(row.fecha_inicio_causacion),
    id: toNumber(row.id),
    solicitudes: solicitudesByVacacion.get(toNumber(row.id)) ?? [],
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  const vacationPendingTotal = items.reduce((accumulator, item) => accumulator + item.dias_pendientes, 0);
  const ultimaSolicitud = solicitudes.rows[0]?.fecha_solicitud ?? null;

  return {
    indicadores: {
      vacaciones_dias_pendientes: vacationPendingTotal,
      vacaciones_solicitudes_total: solicitudes.rows.length,
      vacaciones_ultima_solicitud: toDateOnlyStringNullable(ultimaSolicitud)
    },
    items
  };
};
