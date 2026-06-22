import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  CloseSstAccionInspeccionInput,
  CreateSstAccionInspeccionInput,
  CreateSstInspeccionHallazgoInput,
  CreateSstInspeccionInput,
  ListSstAccionesInspeccionQuery,
  ListSstInspeccionHallazgosQuery,
  ListSstInspeccionesAlertasQuery,
  ListSstInspeccionesDashboardQuery,
  ListSstInspeccionesQuery,
  SstAccionInspeccionEstado,
  SstInspeccionEstado,
  SstInspeccionHallazgoNivel,
  SstInspeccionHallazgoTipo,
  SstInspeccionTipo,
  UpdateSstAccionInspeccionInput,
  UpdateSstInspeccionHallazgoInput,
  UpdateSstInspeccionInput
} from './sst.schemas';
import { ensureContratoExists, ensureEmpresaExists } from './sst.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface SstContratoScopeRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

interface SstInspeccionRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  empresa_id: string;
  empresa_nombre: string;
  estado: SstInspeccionEstado;
  estado_alerta: SstInspeccionEstado;
  fecha_programada: Date | string | null;
  fecha_realizada: Date | string | null;
  id: string;
  nombre_inspeccion: string;
  observacion: string | null;
  responsable: string | null;
  tipo_inspeccion: SstInspeccionTipo;
}

interface SstInspeccionHallazgoRow extends QueryResultRow {
  activo: boolean | null;
  created_at: Date | string;
  descripcion: string;
  genera_alerta_critica: boolean | null;
  id: string;
  inspeccion_activo: boolean | null;
  inspeccion_contrato_id: string | null;
  inspeccion_contrato_numero: string | null;
  inspeccion_created_at: Date | string;
  inspeccion_empresa_id: string;
  inspeccion_empresa_nombre: string;
  inspeccion_estado: SstInspeccionEstado;
  inspeccion_estado_alerta: SstInspeccionEstado;
  inspeccion_fecha_programada: Date | string | null;
  inspeccion_fecha_realizada: Date | string | null;
  inspeccion_id: string;
  inspeccion_nombre: string;
  inspeccion_observacion: string | null;
  inspeccion_responsable: string | null;
  inspeccion_tipo: SstInspeccionTipo;
  nivel_riesgo: SstInspeccionHallazgoNivel;
  requiere_accion: boolean | null;
  tipo_hallazgo: SstInspeccionHallazgoTipo;
}

interface SstAccionInspeccionRow extends QueryResultRow {
  activo: boolean | null;
  created_at: Date | string;
  descripcion: string;
  estado: SstAccionInspeccionEstado;
  estado_alerta: 'vigente' | 'vencida' | 'proxima_a_vencer' | 'sin_fecha';
  fecha_cierre: Date | string | null;
  fecha_compromiso: Date | string | null;
  hallazgo_activo: boolean | null;
  hallazgo_created_at: Date | string;
  hallazgo_descripcion: string;
  hallazgo_genera_alerta_critica: boolean | null;
  hallazgo_id: string;
  hallazgo_inspeccion_activo: boolean | null;
  hallazgo_inspeccion_contrato_id: string | null;
  hallazgo_inspeccion_contrato_numero: string | null;
  hallazgo_inspeccion_created_at: Date | string;
  hallazgo_inspeccion_empresa_id: string;
  hallazgo_inspeccion_empresa_nombre: string;
  hallazgo_inspeccion_estado: SstInspeccionEstado;
  hallazgo_inspeccion_estado_alerta: SstInspeccionEstado;
  hallazgo_inspeccion_fecha_programada: Date | string | null;
  hallazgo_inspeccion_fecha_realizada: Date | string | null;
  hallazgo_inspeccion_id: string;
  hallazgo_inspeccion_nombre: string;
  hallazgo_inspeccion_observacion: string | null;
  hallazgo_inspeccion_responsable: string | null;
  hallazgo_inspeccion_tipo: SstInspeccionTipo;
  hallazgo_nivel_riesgo: SstInspeccionHallazgoNivel;
  hallazgo_requiere_accion: boolean | null;
  hallazgo_tipo_hallazgo: SstInspeccionHallazgoTipo;
  id: string;
  responsable: string | null;
}

interface AggregateInspeccionesRow extends QueryResultRow {
  inspecciones_canceladas: number;
  inspecciones_programadas: number;
  inspecciones_realizadas: number;
  inspecciones_total: number;
  inspecciones_vencidas: number;
}

interface AggregateHallazgosRow extends QueryResultRow {
  hallazgos_altos: number;
  hallazgos_bajos: number;
  hallazgos_criticos: number;
  hallazgos_medios: number;
  hallazgos_total: number;
}

interface AggregateAccionesRow extends QueryResultRow {
  acciones_abiertas: number;
  acciones_cerradas: number;
  acciones_en_proceso: number;
  acciones_total: number;
  acciones_vencidas: number;
}

export interface SstInspeccion {
  activo: boolean;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  empresa: {
    id: number;
    nombre_empresa: string;
  };
  estado: SstInspeccionEstado;
  estado_alerta: SstInspeccionEstado;
  fecha_programada: string | null;
  fecha_realizada: string | null;
  id: number;
  nombre_inspeccion: string;
  observacion: string | null;
  responsable: string | null;
  tipo_inspeccion: SstInspeccionTipo;
}

export interface SstInspeccionHallazgo {
  activo: boolean;
  created_at: string;
  descripcion: string;
  genera_alerta_critica: boolean;
  id: number;
  inspeccion: SstInspeccion;
  nivel_riesgo: SstInspeccionHallazgoNivel;
  requiere_accion: boolean;
  tipo_hallazgo: SstInspeccionHallazgoTipo;
}

export interface SstAccionInspeccion {
  activo: boolean;
  created_at: string;
  descripcion: string;
  estado: SstAccionInspeccionEstado;
  estado_alerta: 'vigente' | 'vencida' | 'proxima_a_vencer' | 'sin_fecha';
  fecha_cierre: string | null;
  fecha_compromiso: string | null;
  hallazgo: SstInspeccionHallazgo;
  id: number;
  responsable: string | null;
}

export interface PaginatedSstInspecciones {
  items: SstInspeccion[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstInspeccionHallazgos {
  items: SstInspeccionHallazgo[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstAccionesInspeccion {
  items: SstAccionInspeccion[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface SstInspeccionesDashboard {
  acciones_abiertas: number;
  acciones_cerradas: number;
  acciones_en_proceso: number;
  acciones_total: number;
  acciones_vencidas: number;
  cumplimiento_acciones_porcentaje: number;
  hallazgos_altos: number;
  hallazgos_bajos: number;
  hallazgos_criticos: number;
  hallazgos_medios: number;
  hallazgos_total: number;
  inspecciones_canceladas: number;
  inspecciones_programadas: number;
  inspecciones_realizadas: number;
  inspecciones_total: number;
  inspecciones_vencidas: number;
}

export interface SstInspeccionAlerta {
  accion: {
    id: number | null;
  } | null;
  descripcion: string;
  dias_restantes: number | null;
  estado: 'ACTIVA';
  fecha_alerta: string;
  fecha_compromiso: string | null;
  hallazgo: {
    id: number | null;
    nivel_riesgo: SstInspeccionHallazgoNivel | null;
    tipo_hallazgo: SstInspeccionHallazgoTipo | null;
  } | null;
  id: string;
  inspeccion: {
    id: number;
    nombre_inspeccion: string;
    tipo_inspeccion: SstInspeccionTipo;
  };
  severidad: 'CRITICA' | 'ALTA' | 'MEDIA';
  tipo_alerta:
    | 'INSPECCION_PROGRAMADA_VENCIDA'
    | 'HALLAZGO_CRITICO'
    | 'ACCION_INSPECCION_VENCIDA'
    | 'ACCION_INSPECCION_PROXIMA_VENCER';
  titulo: string;
}

export interface PaginatedSstInspeccionesAlertas {
  items: SstInspeccionAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface SstInspeccionExpediente {
  acciones: SstAccionInspeccion[];
  hallazgos: Array<SstInspeccionHallazgo & { acciones: SstAccionInspeccion[] }>;
  inspeccion: SstInspeccion;
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

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const getDateAfter30Days = (): string => {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 30);
  return next.toISOString().slice(0, 10);
};

const calculateDaysRemaining = (fechaVencimiento: string | null): number | null => {
  if (!fechaVencimiento) {
    return null;
  }

  const target = new Date(`${fechaVencimiento}T00:00:00.000Z`);
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.floor((target.getTime() - utcToday.getTime()) / 86400000);
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

const getSstInspeccionSelect = (): string => {
  return `
    SELECT
      si.id::text AS id,
      si.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      si.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      si.nombre_inspeccion,
      si.tipo_inspeccion,
      si.fecha_programada,
      si.fecha_realizada,
      si.responsable,
      si.estado,
      CASE
        WHEN si.estado = 'REALIZADA' THEN 'REALIZADA'
        WHEN si.estado = 'CANCELADA' THEN 'CANCELADA'
        WHEN si.estado = 'VENCIDA' THEN 'VENCIDA'
        WHEN si.estado = 'PROGRAMADA' AND si.fecha_programada IS NOT NULL AND si.fecha_programada < CURRENT_DATE THEN 'VENCIDA'
        ELSE 'PROGRAMADA'
      END AS estado_alerta,
      si.observacion,
      si.activo,
      si.created_at
    FROM sst_inspecciones si
    INNER JOIN empresas e ON e.id = si.empresa_id
    LEFT JOIN contratos c ON c.id = si.contrato_id
  `;
};

const getSstInspeccionHallazgoSelect = (): string => {
  return `
    SELECT
      sih.id::text AS id,
      sih.inspeccion_id::text AS inspeccion_id,
      sih.tipo_hallazgo,
      sih.descripcion,
      sih.nivel_riesgo,
      sih.requiere_accion,
      CASE WHEN sih.nivel_riesgo = 'CRITICO' THEN TRUE ELSE FALSE END AS genera_alerta_critica,
      sih.activo,
      sih.created_at,
      si.id::text AS inspeccion_id,
      si.empresa_id::text AS inspeccion_empresa_id,
      e.nombre_empresa AS inspeccion_empresa_nombre,
      si.contrato_id::text AS inspeccion_contrato_id,
      c.numero_contrato AS inspeccion_contrato_numero,
      si.nombre_inspeccion AS inspeccion_nombre,
      si.tipo_inspeccion AS inspeccion_tipo,
      si.fecha_programada AS inspeccion_fecha_programada,
      si.fecha_realizada AS inspeccion_fecha_realizada,
      si.responsable AS inspeccion_responsable,
      si.estado AS inspeccion_estado,
      CASE
        WHEN si.estado = 'REALIZADA' THEN 'REALIZADA'
        WHEN si.estado = 'CANCELADA' THEN 'CANCELADA'
        WHEN si.estado = 'VENCIDA' THEN 'VENCIDA'
        WHEN si.estado = 'PROGRAMADA' AND si.fecha_programada IS NOT NULL AND si.fecha_programada < CURRENT_DATE THEN 'VENCIDA'
        ELSE 'PROGRAMADA'
      END AS inspeccion_estado_alerta,
      si.observacion AS inspeccion_observacion,
      si.activo AS inspeccion_activo,
      si.created_at AS inspeccion_created_at
    FROM sst_inspecciones_hallazgos sih
    INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
    INNER JOIN empresas e ON e.id = si.empresa_id
    LEFT JOIN contratos c ON c.id = si.contrato_id
  `;
};

const getSstAccionInspeccionSelect = (): string => {
  return `
    SELECT
      sia.id::text AS id,
      sia.hallazgo_id::text AS hallazgo_id,
      sia.descripcion,
      sia.responsable,
      sia.fecha_compromiso,
      sia.fecha_cierre,
      sia.estado,
      CASE
        WHEN sia.estado = 'CERRADA' THEN 'vigente'
        WHEN sia.estado = 'VENCIDA' THEN 'vencida'
        WHEN sia.fecha_compromiso IS NULL THEN 'sin_fecha'
        WHEN sia.fecha_compromiso < CURRENT_DATE THEN 'vencida'
        WHEN sia.fecha_compromiso <= CURRENT_DATE + 30 THEN 'proxima_a_vencer'
        ELSE 'vigente'
      END AS estado_alerta,
      sia.activo,
      sia.created_at,
      sih.tipo_hallazgo AS hallazgo_tipo_hallazgo,
      sih.descripcion AS hallazgo_descripcion,
      sih.nivel_riesgo AS hallazgo_nivel_riesgo,
      sih.requiere_accion AS hallazgo_requiere_accion,
      CASE WHEN sih.nivel_riesgo = 'CRITICO' THEN TRUE ELSE FALSE END AS hallazgo_genera_alerta_critica,
      sih.activo AS hallazgo_activo,
      sih.created_at AS hallazgo_created_at,
      si.id::text AS hallazgo_inspeccion_id,
      si.empresa_id::text AS hallazgo_inspeccion_empresa_id,
      e.nombre_empresa AS hallazgo_inspeccion_empresa_nombre,
      si.contrato_id::text AS hallazgo_inspeccion_contrato_id,
      c.numero_contrato AS hallazgo_inspeccion_contrato_numero,
      si.nombre_inspeccion AS hallazgo_inspeccion_nombre,
      si.tipo_inspeccion AS hallazgo_inspeccion_tipo,
      si.fecha_programada AS hallazgo_inspeccion_fecha_programada,
      si.fecha_realizada AS hallazgo_inspeccion_fecha_realizada,
      si.responsable AS hallazgo_inspeccion_responsable,
      si.estado AS hallazgo_inspeccion_estado,
      CASE
        WHEN si.estado = 'REALIZADA' THEN 'REALIZADA'
        WHEN si.estado = 'CANCELADA' THEN 'CANCELADA'
        WHEN si.estado = 'VENCIDA' THEN 'VENCIDA'
        WHEN si.estado = 'PROGRAMADA' AND si.fecha_programada IS NOT NULL AND si.fecha_programada < CURRENT_DATE THEN 'VENCIDA'
        ELSE 'PROGRAMADA'
      END AS hallazgo_inspeccion_estado_alerta,
      si.observacion AS hallazgo_inspeccion_observacion,
      si.activo AS hallazgo_inspeccion_activo,
      si.created_at AS hallazgo_inspeccion_created_at
    FROM sst_inspecciones_acciones sia
    INNER JOIN sst_inspecciones_hallazgos sih ON sih.id = sia.hallazgo_id
    INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
    INNER JOIN empresas e ON e.id = si.empresa_id
    LEFT JOIN contratos c ON c.id = si.contrato_id
  `;
};

const mapSstInspeccion = (row: SstInspeccionRow): SstInspeccion => {
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
    nombre_inspeccion: row.nombre_inspeccion,
    tipo_inspeccion: row.tipo_inspeccion,
    fecha_programada: toDateIsoString(row.fecha_programada),
    fecha_realizada: toDateIsoString(row.fecha_realizada),
    responsable: row.responsable,
    estado: row.estado,
    estado_alerta: row.estado_alerta,
    observacion: row.observacion,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstInspeccionHallazgo = (row: SstInspeccionHallazgoRow): SstInspeccionHallazgo => {
  return {
    id: toBigintNumber(row.id),
    inspeccion: mapSstInspeccion({
      id: row.inspeccion_id,
      empresa_id: row.inspeccion_empresa_id,
      empresa_nombre: row.inspeccion_empresa_nombre,
      contrato_id: row.inspeccion_contrato_id,
      contrato_numero: row.inspeccion_contrato_numero,
      nombre_inspeccion: row.inspeccion_nombre,
      tipo_inspeccion: row.inspeccion_tipo,
      fecha_programada: row.inspeccion_fecha_programada,
      fecha_realizada: row.inspeccion_fecha_realizada,
      responsable: row.inspeccion_responsable,
      estado: row.inspeccion_estado,
      estado_alerta: row.inspeccion_estado_alerta,
      observacion: row.inspeccion_observacion,
      activo: row.inspeccion_activo,
      created_at: row.inspeccion_created_at
    } as SstInspeccionRow),
    tipo_hallazgo: row.tipo_hallazgo,
    descripcion: row.descripcion,
    nivel_riesgo: row.nivel_riesgo,
    requiere_accion: toBooleanValue(row.requiere_accion),
    genera_alerta_critica: toBooleanValue(row.genera_alerta_critica),
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstAccionInspeccion = (row: SstAccionInspeccionRow): SstAccionInspeccion => {
  return {
    id: toBigintNumber(row.id),
    hallazgo: mapSstInspeccionHallazgo({
      id: row.hallazgo_id,
      inspeccion_id: row.hallazgo_inspeccion_id,
      tipo_hallazgo: row.hallazgo_tipo_hallazgo,
      descripcion: row.hallazgo_descripcion,
      nivel_riesgo: row.hallazgo_nivel_riesgo,
      requiere_accion: row.hallazgo_requiere_accion,
      genera_alerta_critica: row.hallazgo_genera_alerta_critica,
      activo: row.hallazgo_activo,
      created_at: row.hallazgo_created_at,
      inspeccion_empresa_id: row.hallazgo_inspeccion_empresa_id,
      inspeccion_empresa_nombre: row.hallazgo_inspeccion_empresa_nombre,
      inspeccion_contrato_id: row.hallazgo_inspeccion_contrato_id,
      inspeccion_contrato_numero: row.hallazgo_inspeccion_contrato_numero,
      inspeccion_nombre: row.hallazgo_inspeccion_nombre,
      inspeccion_tipo: row.hallazgo_inspeccion_tipo,
      inspeccion_fecha_programada: row.hallazgo_inspeccion_fecha_programada,
      inspeccion_fecha_realizada: row.hallazgo_inspeccion_fecha_realizada,
      inspeccion_responsable: row.hallazgo_inspeccion_responsable,
      inspeccion_estado: row.hallazgo_inspeccion_estado,
      inspeccion_estado_alerta: row.hallazgo_inspeccion_estado_alerta,
      inspeccion_observacion: row.hallazgo_inspeccion_observacion,
      inspeccion_activo: row.hallazgo_inspeccion_activo,
      inspeccion_created_at: row.hallazgo_inspeccion_created_at
    } as SstInspeccionHallazgoRow),
    descripcion: row.descripcion,
    responsable: row.responsable,
    fecha_compromiso: toDateIsoString(row.fecha_compromiso),
    fecha_cierre: toDateIsoString(row.fecha_cierre),
    estado: row.estado,
    estado_alerta: row.estado_alerta,
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

const validateInspeccionScope = async (input: {
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
        'SST_INSPECCION_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, toBigintNumber(input.empresaId));
};

const ensureSstInspeccionExists = async (
  inspeccionId: string,
  client?: PoolClient
): Promise<SstInspeccionRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstInspeccionRow>(
    `
      ${getSstInspeccionSelect()}
      WHERE si.id::text = $1
      LIMIT 1
    `,
    [inspeccionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST inspection not found', 404, 'SST_INSPECCION_NOT_FOUND');
  }

  return row;
};

const ensureSstInspeccionHallazgoExists = async (
  hallazgoId: string,
  client?: PoolClient
): Promise<SstInspeccionHallazgoRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstInspeccionHallazgoRow>(
    `
      ${getSstInspeccionHallazgoSelect()}
      WHERE sih.id::text = $1
      LIMIT 1
    `,
    [hallazgoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST inspection finding not found', 404, 'SST_INSPECCION_HALLAZGO_NOT_FOUND');
  }

  return row;
};

const ensureSstAccionInspeccionExists = async (
  accionId: string,
  client?: PoolClient
): Promise<SstAccionInspeccionRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstAccionInspeccionRow>(
    `
      ${getSstAccionInspeccionSelect()}
      WHERE sia.id::text = $1
      LIMIT 1
    `,
    [accionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST inspection action not found', 404, 'SST_INSPECCION_ACCION_NOT_FOUND');
  }

  return row;
};

const buildSstInspeccionesWhere = (
  filters: ListSstInspeccionesQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`si.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`si.contrato_id::text = $${params.length}`);
  }

  if (filters.tipo_inspeccion) {
    params.push(filters.tipo_inspeccion);
    conditions.push(`si.tipo_inspeccion = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`si.estado = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(si.activo, TRUE) = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(si.nombre_inspeccion ILIKE $${params.length} OR COALESCE(si.responsable, '') ILIKE $${params.length})`);
  }

  if (filters.fecha_programada_desde) {
    params.push(filters.fecha_programada_desde);
    conditions.push(`si.fecha_programada >= $${params.length}`);
  }

  if (filters.fecha_programada_hasta) {
    params.push(filters.fecha_programada_hasta);
    conditions.push(`si.fecha_programada <= $${params.length}`);
  }

  if (filters.fecha_realizada_desde) {
    params.push(filters.fecha_realizada_desde);
    conditions.push(`si.fecha_realizada >= $${params.length}`);
  }

  if (filters.fecha_realizada_hasta) {
    params.push(filters.fecha_realizada_hasta);
    conditions.push(`si.fecha_realizada <= $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstInspeccionHallazgosWhere = (
  inspeccionId: string,
  filters: ListSstInspeccionHallazgosQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');

  params.push(inspeccionId);
  conditions.push(`sih.inspeccion_id::text = $${params.length}`);

  if (filters.tipo_hallazgo) {
    params.push(filters.tipo_hallazgo);
    conditions.push(`sih.tipo_hallazgo = $${params.length}`);
  }

  if (filters.nivel_riesgo) {
    params.push(filters.nivel_riesgo);
    conditions.push(`sih.nivel_riesgo = $${params.length}`);
  }

  if (filters.requiere_accion !== undefined) {
    params.push(filters.requiere_accion);
    conditions.push(`COALESCE(sih.requiere_accion, TRUE) = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sih.activo, TRUE) = $${params.length}`);
  }

  return {
    params,
    whereClause: `WHERE ${conditions.join(' AND ')}`
  };
};

const buildSstAccionesInspeccionWhere = (
  filters: ListSstAccionesInspeccionQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`si.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`si.contrato_id::text = $${params.length}`);
  }

  if (filters.hallazgo_id) {
    params.push(filters.hallazgo_id);
    conditions.push(`sia.hallazgo_id::text = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`sia.estado = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sia.activo, TRUE) = $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const listSstInspeccionHallazgosByScope = async (
  filters: {
    activo?: boolean;
    contrato_id?: string | null;
    empresa_id?: string | null;
    inspeccion_id?: string | null;
  },
  tenant?: TenantAccessContext
): Promise<SstInspeccionHallazgo[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`si.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`si.contrato_id::text = $${params.length}`);
  }

  if (filters.inspeccion_id) {
    params.push(filters.inspeccion_id);
    conditions.push(`sih.inspeccion_id::text = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sih.activo, TRUE) = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery<SstInspeccionHallazgoRow>(
    `
      ${getSstInspeccionHallazgoSelect()}
      ${whereClause}
      ORDER BY sih.created_at DESC, sih.id DESC
    `,
    params
  );

  return result.rows.map(mapSstInspeccionHallazgo);
};

const listSstAccionesInspeccionByScope = async (
  filters: {
    activo?: boolean;
    contrato_id?: string | null;
    empresa_id?: string | null;
    hallazgo_id?: string | null;
  },
  tenant?: TenantAccessContext
): Promise<SstAccionInspeccion[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`si.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`si.contrato_id::text = $${params.length}`);
  }

  if (filters.hallazgo_id) {
    params.push(filters.hallazgo_id);
    conditions.push(`sia.hallazgo_id::text = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sia.activo, TRUE) = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery<SstAccionInspeccionRow>(
    `
      ${getSstAccionInspeccionSelect()}
      ${whereClause}
      ORDER BY sia.fecha_compromiso ASC NULLS LAST, sia.id DESC
    `,
    params
  );

  return result.rows.map(mapSstAccionInspeccion);
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

export const listSstInspecciones = async (
  filters: ListSstInspeccionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstInspecciones> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const { params, whereClause } = buildSstInspeccionesWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_inspecciones si
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstInspeccionRow>(
    `
      ${getSstInspeccionSelect()}
      ${whereClause}
      ORDER BY si.fecha_programada DESC NULLS LAST, si.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstInspeccion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstInspeccion = async (
  input: CreateSstInspeccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validateInspeccionScope({
      client,
      empresaId: input.empresa_id,
      contratoId: input.contrato_id,
      tenant
    });

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_inspecciones (
          empresa_id,
          contrato_id,
          nombre_inspeccion,
          tipo_inspeccion,
          fecha_programada,
          fecha_realizada,
          responsable,
          estado,
          observacion,
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
          $10
        )
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.nombre_inspeccion,
        input.tipo_inspeccion,
        input.fecha_programada,
        input.fecha_realizada,
        input.responsable,
        input.estado,
        input.observacion,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST inspection', 500, 'SST_INSPECCION_CREATE_FAILED');
    }

    const created = mapSstInspeccion(await ensureSstInspeccionExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_CREATE',
      tabla: 'sst_inspecciones',
      registro_id: String(created.id),
      descripcion: 'Creacion de inspeccion SST',
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

export const updateSstInspeccion = async (
  inspeccionId: string,
  input: UpdateSstInspeccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstInspeccionExists(inspeccionId, client);
    const current = mapSstInspeccion(currentRow);

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);

    await validateInspeccionScope({
      client,
      empresaId: nextEmpresaId,
      contratoId: nextContratoId,
      tenant
    });

    await client.query(
      `
        UPDATE sst_inspecciones
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          nombre_inspeccion = $4,
          tipo_inspeccion = $5,
          fecha_programada = $6,
          fecha_realizada = $7,
          responsable = $8,
          estado = $9,
          observacion = $10,
          activo = $11
        WHERE id::text = $1
      `,
      [
        inspeccionId,
        nextEmpresaId,
        nextContratoId,
        input.nombre_inspeccion ?? current.nombre_inspeccion,
        input.tipo_inspeccion ?? current.tipo_inspeccion,
        input.fecha_programada !== undefined ? input.fecha_programada : current.fecha_programada,
        input.fecha_realizada !== undefined ? input.fecha_realizada : current.fecha_realizada,
        input.responsable !== undefined ? input.responsable : current.responsable,
        input.estado ?? current.estado,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstInspeccion(await ensureSstInspeccionExists(inspeccionId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_UPDATE',
      tabla: 'sst_inspecciones',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de inspeccion SST',
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

export const deactivateSstInspeccion = async (
  inspeccionId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccion> => {
  return updateSstInspeccion(
    inspeccionId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_DEACTIVATE',
      tabla: 'sst_inspecciones',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de inspeccion SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const listSstInspeccionHallazgos = async (
  inspeccionId: string,
  filters: ListSstInspeccionHallazgosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstInspeccionHallazgos> => {
  const inspeccion = await ensureSstInspeccionExists(inspeccionId);
  ensureTenantScopeForEntity(
    tenant,
    inspeccion.contrato_id ? Number(inspeccion.contrato_id) : null,
    inspeccion.empresa_id ? Number(inspeccion.empresa_id) : null
  );

  const { params, whereClause } = buildSstInspeccionHallazgosWhere(inspeccionId, filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_inspecciones_hallazgos sih
      INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstInspeccionHallazgoRow>(
    `
      ${getSstInspeccionHallazgoSelect()}
      ${whereClause}
      ORDER BY sih.created_at DESC, sih.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstInspeccionHallazgo),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstInspeccionHallazgo = async (
  input: CreateSstInspeccionHallazgoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccionHallazgo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const inspeccion = await ensureSstInspeccionExists(input.inspeccion_id, client);
    ensureTenantScopeForEntity(
      tenant,
      inspeccion.contrato_id ? Number(inspeccion.contrato_id) : null,
      inspeccion.empresa_id ? Number(inspeccion.empresa_id) : null
    );

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_inspecciones_hallazgos (
          inspeccion_id,
          tipo_hallazgo,
          descripcion,
          nivel_riesgo,
          requiere_accion,
          activo
        )
        VALUES (
          $1::bigint,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING id::text AS id
      `,
      [
        input.inspeccion_id,
        input.tipo_hallazgo,
        input.descripcion,
        input.nivel_riesgo,
        input.requiere_accion,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST inspection finding', 500, 'SST_INSPECCION_HALLAZGO_CREATE_FAILED');
    }

    const created = mapSstInspeccionHallazgo(await ensureSstInspeccionHallazgoExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_HALLAZGO_CREATE',
      tabla: 'sst_inspecciones_hallazgos',
      registro_id: String(created.id),
      descripcion: 'Creacion de hallazgo de inspeccion SST',
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

export const updateSstInspeccionHallazgo = async (
  hallazgoId: string,
  input: UpdateSstInspeccionHallazgoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccionHallazgo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstInspeccionHallazgoExists(hallazgoId, client);
    const current = mapSstInspeccionHallazgo(currentRow);
    const nextInspeccionId = input.inspeccion_id ?? String(current.inspeccion.id);
    const inspeccion = await ensureSstInspeccionExists(nextInspeccionId, client);

    ensureTenantScopeForEntity(
      tenant,
      inspeccion.contrato_id ? Number(inspeccion.contrato_id) : null,
      inspeccion.empresa_id ? Number(inspeccion.empresa_id) : null
    );

    await client.query(
      `
        UPDATE sst_inspecciones_hallazgos
        SET
          inspeccion_id = $2::bigint,
          tipo_hallazgo = $3,
          descripcion = $4,
          nivel_riesgo = $5,
          requiere_accion = $6,
          activo = $7
        WHERE id::text = $1
      `,
      [
        hallazgoId,
        nextInspeccionId,
        input.tipo_hallazgo ?? current.tipo_hallazgo,
        input.descripcion ?? current.descripcion,
        input.nivel_riesgo ?? current.nivel_riesgo,
        input.requiere_accion ?? current.requiere_accion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstInspeccionHallazgo(await ensureSstInspeccionHallazgoExists(hallazgoId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_HALLAZGO_UPDATE',
      tabla: 'sst_inspecciones_hallazgos',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de hallazgo de inspeccion SST',
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

export const deactivateSstInspeccionHallazgo = async (
  hallazgoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccionHallazgo> => {
  return updateSstInspeccionHallazgo(
    hallazgoId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_HALLAZGO_DEACTIVATE',
      tabla: 'sst_inspecciones_hallazgos',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de hallazgo de inspeccion SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const listSstAccionesInspeccion = async (
  filters: ListSstAccionesInspeccionQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstAccionesInspeccion> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  if (filters.hallazgo_id) {
    const hallazgo = await ensureSstInspeccionHallazgoExists(filters.hallazgo_id);
    ensureTenantScopeForEntity(
      tenant,
      hallazgo.inspeccion_contrato_id ? Number(hallazgo.inspeccion_contrato_id) : null,
      hallazgo.inspeccion_empresa_id ? Number(hallazgo.inspeccion_empresa_id) : null
    );
  }

  const { params, whereClause } = buildSstAccionesInspeccionWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_inspecciones_acciones sia
      INNER JOIN sst_inspecciones_hallazgos sih ON sih.id = sia.hallazgo_id
      INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstAccionInspeccionRow>(
    `
      ${getSstAccionInspeccionSelect()}
      ${whereClause}
      ORDER BY sia.fecha_compromiso ASC NULLS LAST, sia.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstAccionInspeccion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstAccionInspeccion = async (
  input: CreateSstAccionInspeccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionInspeccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const hallazgo = await ensureSstInspeccionHallazgoExists(input.hallazgo_id, client);
    ensureTenantScopeForEntity(
      tenant,
      hallazgo.inspeccion_contrato_id ? Number(hallazgo.inspeccion_contrato_id) : null,
      hallazgo.inspeccion_empresa_id ? Number(hallazgo.inspeccion_empresa_id) : null
    );

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_inspecciones_acciones (
          hallazgo_id,
          descripcion,
          responsable,
          fecha_compromiso,
          fecha_cierre,
          estado,
          activo
        )
        VALUES (
          $1::bigint,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING id::text AS id
      `,
      [
        input.hallazgo_id,
        input.descripcion,
        input.responsable,
        input.fecha_compromiso,
        input.fecha_cierre,
        input.estado,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST inspection action', 500, 'SST_INSPECCION_ACCION_CREATE_FAILED');
    }

    const created = mapSstAccionInspeccion(await ensureSstAccionInspeccionExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_ACCION_CREATE',
      tabla: 'sst_inspecciones_acciones',
      registro_id: String(created.id),
      descripcion: 'Creacion de accion de inspeccion SST',
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

export const updateSstAccionInspeccion = async (
  accionId: string,
  input: UpdateSstAccionInspeccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionInspeccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstAccionInspeccionExists(accionId, client);
    const current = mapSstAccionInspeccion(currentRow);
    const nextHallazgoId = input.hallazgo_id ?? String(current.hallazgo.id);
    const hallazgo = await ensureSstInspeccionHallazgoExists(nextHallazgoId, client);

    ensureTenantScopeForEntity(
      tenant,
      hallazgo.inspeccion_contrato_id ? Number(hallazgo.inspeccion_contrato_id) : null,
      hallazgo.inspeccion_empresa_id ? Number(hallazgo.inspeccion_empresa_id) : null
    );

    const nextFechaCompromiso =
      input.fecha_compromiso !== undefined ? input.fecha_compromiso : current.fecha_compromiso;
    const nextFechaCierre = input.fecha_cierre !== undefined ? input.fecha_cierre : current.fecha_cierre;

    if (nextFechaCompromiso && nextFechaCierre && nextFechaCompromiso > nextFechaCierre) {
      throw new AppError(
        'fecha_cierre must be greater than or equal to fecha_compromiso',
        400,
        'SST_INSPECCION_ACCION_INVALID_DATE_RANGE'
      );
    }

    await client.query(
      `
        UPDATE sst_inspecciones_acciones
        SET
          hallazgo_id = $2::bigint,
          descripcion = $3,
          responsable = $4,
          fecha_compromiso = $5,
          fecha_cierre = $6,
          estado = $7,
          activo = $8
        WHERE id::text = $1
      `,
      [
        accionId,
        nextHallazgoId,
        input.descripcion ?? current.descripcion,
        input.responsable !== undefined ? input.responsable : current.responsable,
        nextFechaCompromiso,
        nextFechaCierre,
        input.estado ?? current.estado,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstAccionInspeccion(await ensureSstAccionInspeccionExists(accionId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_ACCION_UPDATE',
      tabla: 'sst_inspecciones_acciones',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de accion de inspeccion SST',
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

export const closeSstAccionInspeccion = async (
  accionId: string,
  input: CloseSstAccionInspeccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionInspeccion> => {
  const fechaCierre = input.fecha_cierre ?? getTodayDateOnly();

  const currentRow = await ensureSstAccionInspeccionExists(accionId);
  const current = mapSstAccionInspeccion(currentRow);
  ensureTenantScopeForEntity(
    tenant,
    current.hallazgo.inspeccion.contrato.id,
    current.hallazgo.inspeccion.empresa.id
  );

  if (current.fecha_compromiso && fechaCierre < current.fecha_compromiso) {
    throw new AppError(
      'fecha_cierre must be greater than or equal to fecha_compromiso',
      400,
      'SST_INSPECCION_ACCION_INVALID_DATE_RANGE'
    );
  }

  const result = await updateSstAccionInspeccion(
    accionId,
    {
      fecha_cierre: fechaCierre,
      estado: 'CERRADA'
    },
    actorUserId,
    tenant,
    auditMeta
  );

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_INSPECCION_ACCION_CLOSE',
    tabla: 'sst_inspecciones_acciones',
    registro_id: String(result.id),
    descripcion: 'Cierre de accion de inspeccion SST',
    after: result,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return result;
};

export const deactivateSstAccionInspeccion = async (
  accionId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionInspeccion> => {
  return updateSstAccionInspeccion(
    accionId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_INSPECCION_ACCION_DEACTIVATE',
      tabla: 'sst_inspecciones_acciones',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de accion de inspeccion SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const getSstInspeccionesDashboard = async (
  filters: ListSstInspeccionesDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstInspeccionesDashboard> => {
  ensureFilterWithinTenant(tenant, filters);

  const buildBaseConditions = (): { conditions: string[]; params: unknown[] } => {
    const conditions: string[] = ['COALESCE(si.activo, TRUE) = TRUE'];
    const params: unknown[] = [];
    appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');

    if (filters.empresa_id) {
      params.push(filters.empresa_id);
      conditions.push(`si.empresa_id::text = $${params.length}`);
    }

    if (filters.contrato_id) {
      params.push(filters.contrato_id);
      conditions.push(`si.contrato_id::text = $${params.length}`);
    }

    return { conditions, params };
  };

  const inspeccionesQuery = (() => {
    const { conditions, params } = buildBaseConditions();
    return dbQuery<AggregateInspeccionesRow>(
      `
        SELECT
          COUNT(*)::int AS inspecciones_total,
          COUNT(*) FILTER (
            WHERE si.estado = 'PROGRAMADA'
              AND (si.fecha_programada IS NULL OR si.fecha_programada >= CURRENT_DATE)
          )::int AS inspecciones_programadas,
          COUNT(*) FILTER (WHERE si.estado = 'REALIZADA')::int AS inspecciones_realizadas,
          COUNT(*) FILTER (WHERE si.estado = 'CANCELADA')::int AS inspecciones_canceladas,
          COUNT(*) FILTER (
            WHERE si.estado = 'VENCIDA'
               OR (si.estado = 'PROGRAMADA' AND si.fecha_programada IS NOT NULL AND si.fecha_programada < CURRENT_DATE)
          )::int AS inspecciones_vencidas
        FROM sst_inspecciones si
        WHERE ${conditions.join(' AND ')}
      `,
      params
    );
  })();

  const hallazgosQuery = (() => {
    const { conditions, params } = buildBaseConditions();
    return dbQuery<AggregateHallazgosRow>(
      `
        SELECT
          COUNT(*)::int AS hallazgos_total,
          COUNT(*) FILTER (WHERE sih.nivel_riesgo = 'BAJO')::int AS hallazgos_bajos,
          COUNT(*) FILTER (WHERE sih.nivel_riesgo = 'MEDIO')::int AS hallazgos_medios,
          COUNT(*) FILTER (WHERE sih.nivel_riesgo = 'ALTO')::int AS hallazgos_altos,
          COUNT(*) FILTER (WHERE sih.nivel_riesgo = 'CRITICO')::int AS hallazgos_criticos
        FROM sst_inspecciones_hallazgos sih
        INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
        WHERE ${conditions.join(' AND ')}
          AND COALESCE(sih.activo, TRUE) = TRUE
      `,
      params
    );
  })();

  const accionesQuery = (() => {
    const { conditions, params } = buildBaseConditions();
    return dbQuery<AggregateAccionesRow>(
      `
        SELECT
          COUNT(*)::int AS acciones_total,
          COUNT(*) FILTER (WHERE sia.estado = 'ABIERTA')::int AS acciones_abiertas,
          COUNT(*) FILTER (WHERE sia.estado = 'EN_PROCESO')::int AS acciones_en_proceso,
          COUNT(*) FILTER (WHERE sia.estado = 'CERRADA')::int AS acciones_cerradas,
          COUNT(*) FILTER (
            WHERE sia.estado = 'VENCIDA'
               OR (sia.estado <> 'CERRADA' AND sia.fecha_compromiso IS NOT NULL AND sia.fecha_compromiso < CURRENT_DATE)
          )::int AS acciones_vencidas
        FROM sst_inspecciones_acciones sia
        INNER JOIN sst_inspecciones_hallazgos sih ON sih.id = sia.hallazgo_id
        INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
        WHERE ${conditions.join(' AND ')}
          AND COALESCE(sih.activo, TRUE) = TRUE
          AND COALESCE(sia.activo, TRUE) = TRUE
      `,
      params
    );
  })();

  const [inspeccionesResult, hallazgosResult, accionesResult] = await Promise.all([
    inspeccionesQuery,
    hallazgosQuery,
    accionesQuery
  ]);

  const inspecciones = inspeccionesResult.rows[0];
  const hallazgos = hallazgosResult.rows[0];
  const acciones = accionesResult.rows[0];

  const dashboard: SstInspeccionesDashboard = {
    inspecciones_total: inspecciones?.inspecciones_total ?? 0,
    inspecciones_programadas: inspecciones?.inspecciones_programadas ?? 0,
    inspecciones_realizadas: inspecciones?.inspecciones_realizadas ?? 0,
    inspecciones_canceladas: inspecciones?.inspecciones_canceladas ?? 0,
    inspecciones_vencidas: inspecciones?.inspecciones_vencidas ?? 0,
    hallazgos_total: hallazgos?.hallazgos_total ?? 0,
    hallazgos_bajos: hallazgos?.hallazgos_bajos ?? 0,
    hallazgos_medios: hallazgos?.hallazgos_medios ?? 0,
    hallazgos_altos: hallazgos?.hallazgos_altos ?? 0,
    hallazgos_criticos: hallazgos?.hallazgos_criticos ?? 0,
    acciones_total: acciones?.acciones_total ?? 0,
    acciones_abiertas: acciones?.acciones_abiertas ?? 0,
    acciones_en_proceso: acciones?.acciones_en_proceso ?? 0,
    acciones_cerradas: acciones?.acciones_cerradas ?? 0,
    acciones_vencidas: acciones?.acciones_vencidas ?? 0,
    cumplimiento_acciones_porcentaje:
      !acciones || acciones.acciones_total === 0
        ? 100
        : Math.round((acciones.acciones_cerradas / acciones.acciones_total) * 10000) / 100
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_INSPECCION_DASHBOARD_VIEW',
    tabla: 'sst_inspecciones',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de inspecciones',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getSstInspeccionesAlertas = async (
  filters: ListSstInspeccionesAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstInspeccionesAlertas> => {
  ensureFilterWithinTenant(tenant, filters);

  const [inspecciones, hallazgos, acciones] = await Promise.all([
    listSstInspecciones(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstInspeccionHallazgosByScope(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstAccionesInspeccionByScope(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    )
  ]);

  const today = getTodayDateOnly();
  const items: SstInspeccionAlerta[] = [];

  for (const inspeccion of inspecciones.items) {
    if (inspeccion.estado === 'PROGRAMADA' && inspeccion.estado_alerta === 'VENCIDA') {
      items.push({
        id: `INSPECCION_PROGRAMADA_VENCIDA:${inspeccion.id}`,
        tipo_alerta: 'INSPECCION_PROGRAMADA_VENCIDA',
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: inspeccion.fecha_programada ?? today,
        fecha_compromiso: inspeccion.fecha_programada,
        dias_restantes: calculateDaysRemaining(inspeccion.fecha_programada),
        titulo: `Inspeccion vencida: ${inspeccion.nombre_inspeccion}`,
        descripcion: 'La inspeccion programada supero la fecha esperada y sigue pendiente.',
        inspeccion: {
          id: inspeccion.id,
          nombre_inspeccion: inspeccion.nombre_inspeccion,
          tipo_inspeccion: inspeccion.tipo_inspeccion
        },
        hallazgo: null,
        accion: null
      });
    }
  }

  for (const hallazgo of hallazgos) {
    if (hallazgo.nivel_riesgo === 'CRITICO') {
      items.push({
        id: `HALLAZGO_CRITICO:${hallazgo.id}`,
        tipo_alerta: 'HALLAZGO_CRITICO',
        severidad: 'CRITICA',
        estado: 'ACTIVA',
        fecha_alerta: hallazgo.created_at.slice(0, 10),
        fecha_compromiso: null,
        dias_restantes: null,
        titulo: `Hallazgo critico: ${hallazgo.inspeccion.nombre_inspeccion}`,
        descripcion: hallazgo.descripcion,
        inspeccion: {
          id: hallazgo.inspeccion.id,
          nombre_inspeccion: hallazgo.inspeccion.nombre_inspeccion,
          tipo_inspeccion: hallazgo.inspeccion.tipo_inspeccion
        },
        hallazgo: {
          id: hallazgo.id,
          nivel_riesgo: hallazgo.nivel_riesgo,
          tipo_hallazgo: hallazgo.tipo_hallazgo
        },
        accion: null
      });
    }
  }

  for (const accion of acciones) {
    if (accion.estado === 'CERRADA') {
      continue;
    }

    if (accion.estado_alerta === 'vencida') {
      items.push({
        id: `ACCION_INSPECCION_VENCIDA:${accion.id}`,
        tipo_alerta: 'ACCION_INSPECCION_VENCIDA',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: accion.fecha_compromiso ?? today,
        fecha_compromiso: accion.fecha_compromiso,
        dias_restantes: calculateDaysRemaining(accion.fecha_compromiso),
        titulo: 'Accion de inspeccion vencida',
        descripcion: accion.descripcion,
        inspeccion: {
          id: accion.hallazgo.inspeccion.id,
          nombre_inspeccion: accion.hallazgo.inspeccion.nombre_inspeccion,
          tipo_inspeccion: accion.hallazgo.inspeccion.tipo_inspeccion
        },
        hallazgo: {
          id: accion.hallazgo.id,
          nivel_riesgo: accion.hallazgo.nivel_riesgo,
          tipo_hallazgo: accion.hallazgo.tipo_hallazgo
        },
        accion: {
          id: accion.id
        }
      });
    } else if (accion.estado_alerta === 'proxima_a_vencer') {
      items.push({
        id: `ACCION_INSPECCION_PROXIMA_VENCER:${accion.id}`,
        tipo_alerta: 'ACCION_INSPECCION_PROXIMA_VENCER',
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_compromiso: accion.fecha_compromiso,
        dias_restantes: calculateDaysRemaining(accion.fecha_compromiso),
        titulo: 'Accion de inspeccion proxima a vencer',
        descripcion: accion.descripcion,
        inspeccion: {
          id: accion.hallazgo.inspeccion.id,
          nombre_inspeccion: accion.hallazgo.inspeccion.nombre_inspeccion,
          tipo_inspeccion: accion.hallazgo.inspeccion.tipo_inspeccion
        },
        hallazgo: {
          id: accion.hallazgo.id,
          nivel_riesgo: accion.hallazgo.nivel_riesgo,
          tipo_hallazgo: accion.hallazgo.tipo_hallazgo
        },
        accion: {
          id: accion.id
        }
      });
    }
  }

  items.sort((left, right) => {
    const severityWeight = (value: SstInspeccionAlerta['severidad']): number => {
      if (value === 'CRITICA') return 3;
      if (value === 'ALTA') return 2;
      return 1;
    };

    const severityDiff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return right.fecha_alerta.localeCompare(left.fecha_alerta);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_INSPECCION_ALERTAS_VIEW',
    tabla: 'sst_inspecciones',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de inspecciones',
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

export const listSstInspeccionesForExpediente = async (
  input: {
    contratoIds: number[];
    empresaIds: number[];
  },
  tenant?: TenantAccessContext
): Promise<SstInspeccion[]> => {
  const params: unknown[] = [];
  const conditions: string[] = ['COALESCE(si.activo, TRUE) = TRUE'];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');
  conditions.push(
    buildExpedienteScopeClause(params, input.contratoIds, input.empresaIds, 'si.contrato_id', 'si.empresa_id')
  );

  const result = await dbQuery<SstInspeccionRow>(
    `
      ${getSstInspeccionSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY si.fecha_programada DESC NULLS LAST, si.id DESC
    `,
    params
  );

  return result.rows.map(mapSstInspeccion);
};

export const listSstInspeccionHallazgosForExpediente = async (
  input: {
    contratoIds: number[];
    empresaIds: number[];
  },
  tenant?: TenantAccessContext
): Promise<SstInspeccionHallazgo[]> => {
  const params: unknown[] = [];
  const conditions: string[] = ['COALESCE(sih.activo, TRUE) = TRUE', 'COALESCE(si.activo, TRUE) = TRUE'];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');
  conditions.push(
    buildExpedienteScopeClause(params, input.contratoIds, input.empresaIds, 'si.contrato_id', 'si.empresa_id')
  );

  const result = await dbQuery<SstInspeccionHallazgoRow>(
    `
      ${getSstInspeccionHallazgoSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY sih.created_at DESC, sih.id DESC
    `,
    params
  );

  return result.rows.map(mapSstInspeccionHallazgo);
};

export const listSstAccionesInspeccionForExpediente = async (
  input: {
    contratoIds: number[];
    empresaIds: number[];
  },
  tenant?: TenantAccessContext
): Promise<SstAccionInspeccion[]> => {
  const params: unknown[] = [];
  const conditions: string[] = [
    'COALESCE(sia.activo, TRUE) = TRUE',
    'COALESCE(sih.activo, TRUE) = TRUE',
    'COALESCE(si.activo, TRUE) = TRUE'
  ];

  appendTenantScopeConditions(conditions, params, tenant, 'si.contrato_id', 'si.empresa_id');
  conditions.push(
    buildExpedienteScopeClause(params, input.contratoIds, input.empresaIds, 'si.contrato_id', 'si.empresa_id')
  );

  const result = await dbQuery<SstAccionInspeccionRow>(
    `
      ${getSstAccionInspeccionSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY sia.fecha_compromiso ASC NULLS LAST, sia.id DESC
    `,
    params
  );

  return result.rows.map(mapSstAccionInspeccion);
};

export const buildSstInspeccionesExpediente = async (
  input: {
    contratoIds: number[];
    empresaIds: number[];
  },
  tenant?: TenantAccessContext
): Promise<SstInspeccionExpediente[]> => {
  const [inspecciones, hallazgos, acciones] = await Promise.all([
    listSstInspeccionesForExpediente(input, tenant),
    listSstInspeccionHallazgosForExpediente(input, tenant),
    listSstAccionesInspeccionForExpediente(input, tenant)
  ]);

  return inspecciones.map((inspeccion) => {
    const hallazgosInspeccion = hallazgos.filter((item) => item.inspeccion.id === inspeccion.id);
    const accionesInspeccion = acciones.filter((item) => item.hallazgo.inspeccion.id === inspeccion.id);

    return {
      inspeccion,
      acciones: accionesInspeccion,
      hallazgos: hallazgosInspeccion.map((hallazgo) => ({
        ...hallazgo,
        acciones: accionesInspeccion.filter((accion) => accion.hallazgo.id === hallazgo.id)
      }))
    };
  });
};
