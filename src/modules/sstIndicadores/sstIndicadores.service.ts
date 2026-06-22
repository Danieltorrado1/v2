import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { buildTenantWhereClause, TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import { ensureContratoExists, ensureEmpresaExists } from '../sst/sst.validator';
import {
  CreateIndicadoresPeriodoInput,
  GetIndicadoresAlertasQuery,
  GetIndicadoresDashboardQuery,
  GetIndicadoresHistoricoQuery,
  IndicadoresAlertaTipo,
  IndicadoresClasificacion,
  ListIndicadoresPeriodosQuery
} from './sstIndicadores.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface IndicadoresPeriodoRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  empresa_id: string;
  empresa_nombre: string;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  nombre_periodo: string;
}

interface IndicadoresAccidentalidadRow extends QueryResultRow {
  accidentes_total: number;
  dias_incapacidad_total: number;
  incidentes_total: number;
  investigaciones_cerradas: number;
  investigaciones_pendientes: number;
}

interface IndicadoresCapacitacionesRow extends QueryResultRow {
  capacitaciones_total: number;
  capacitaciones_vencidas: number;
  capacitaciones_vigentes: number;
}

interface IndicadoresExamenesRow extends QueryResultRow {
  examenes_total: number;
  examenes_vencidos: number;
  examenes_vigentes: number;
}

interface IndicadoresDotacionRow extends QueryResultRow {
  epp_total: number;
  epp_vencidos: number;
  epp_vigentes: number;
}

interface IndicadoresInspeccionesRow extends QueryResultRow {
  acciones_abiertas: number;
  acciones_cerradas: number;
  hallazgos_criticos: number;
  inspecciones_total: number;
}

interface IndicadoresRiesgosRow extends QueryResultRow {
  riesgos_altos: number;
  riesgos_criticos: number;
}

interface IndicadoresPlanRow extends QueryResultRow {
  actividades_ejecutadas: number;
  actividades_programadas: number;
  actividades_vencidas: number;
}

export interface IndicadoresPeriodo {
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
  fecha_fin: string;
  fecha_inicio: string;
  id: number;
  nombre_periodo: string;
}

export interface IndicadoresAccidentalidad {
  accidentes_total: number;
  dias_incapacidad_total: number;
  incidentes_total: number;
  investigaciones_cerradas: number;
  investigaciones_pendientes: number;
}

export interface IndicadoresFrecuencia {
  indice_frecuencia: number;
}

export interface IndicadoresSeveridad {
  indice_severidad: number;
}

export interface IndicadoresCapacitaciones {
  capacitaciones_total: number;
  capacitaciones_vencidas: number;
  capacitaciones_vigentes: number;
  cumplimiento_capacitaciones: number;
}

export interface IndicadoresExamenes {
  cumplimiento_examenes: number;
  examenes_total: number;
  examenes_vencidos: number;
  examenes_vigentes: number;
}

export interface IndicadoresDotacion {
  cumplimiento_epp: number;
  epp_total: number;
  epp_vencidos: number;
  epp_vigentes: number;
}

export interface IndicadoresInspecciones {
  acciones_abiertas: number;
  acciones_cerradas: number;
  cumplimiento_inspecciones: number;
  hallazgos_criticos: number;
  inspecciones_total: number;
}

export interface IndicadoresRiesgos {
  riesgos_altos: number;
  riesgos_criticos: number;
  cumplimiento_riesgos: number;
}

export interface IndicadoresPlanAnual {
  actividades_ejecutadas: number;
  actividades_programadas: number;
  actividades_vencidas: number;
  cumplimiento_plan_anual: number;
}

export interface IndicadoresGenerales {
  clasificacion: IndicadoresClasificacion;
  cumplimiento_general_sst: number;
}

export interface IndicadoresDashboard {
  accidentalidad: IndicadoresAccidentalidad;
  capacitaciones: IndicadoresCapacitaciones;
  dotacion: IndicadoresDotacion;
  examenes: IndicadoresExamenes;
  frecuencia: IndicadoresFrecuencia;
  indicadores_generales: IndicadoresGenerales;
  inspecciones: IndicadoresInspecciones;
  periodo: IndicadoresPeriodo;
  plan_anual: IndicadoresPlanAnual;
  riesgos: IndicadoresRiesgos;
  severidad: IndicadoresSeveridad;
}

export interface IndicadoresHistoricoItem extends IndicadoresDashboard {}

export interface IndicadorAlerta {
  clasificacion: IndicadoresClasificacion;
  descripcion: string;
  estado: 'ACTIVA';
  fecha_alerta: string;
  id: string;
  periodo: IndicadoresPeriodo;
  severidad: 'CRITICA' | 'ALTA';
  tipo_alerta: IndicadoresAlertaTipo;
  titulo: string;
  cumplimiento_general_sst: number;
}

export interface PaginatedIndicadoresPeriodos {
  items: IndicadoresPeriodo[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedIndicadoresAlertas {
  items: IndicadorAlerta[];
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

const toDateIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, round2(value)));

const resolveClassification = (cumplimiento: number): IndicadoresClasificacion => {
  if (cumplimiento >= 90) {
    return 'EXCELENTE';
  }

  if (cumplimiento >= 80) {
    return 'BUENO';
  }

  if (cumplimiento >= 60) {
    return 'MEDIO';
  }

  return 'CRITICO';
};

const getPeriodDays = (fechaInicio: string, fechaFin: string): number => {
  const start = new Date(`${fechaInicio}T00:00:00.000Z`);
  const end = new Date(`${fechaFin}T00:00:00.000Z`);
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, diffDays);
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

const buildPeriodWhere = (
  filters: { contrato_id?: string | null; empresa_id?: string | null; activo?: boolean | null },
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const result = buildTenantWhereClause({
    contratoColumn: 'sp.contrato_id',
    empresaColumn: 'sp.empresa_id',
    tenant: tenant ?? { contratoIds: [], empresaIds: [], isGlobalAdmin: true }
  });

  const conditions: string[] = result.sql ? [result.sql.replace(/^WHERE\s+/i, '')] : [];
  const params = [...result.params];

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sp.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sp.contrato_id::text = $${params.length}`);
  }

  if (filters.activo !== undefined && filters.activo !== null) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sp.activo, TRUE) = $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const getPeriodSelect = (): string => `
  SELECT
    sp.id::text AS id,
    sp.empresa_id::text AS empresa_id,
    e.nombre_empresa AS empresa_nombre,
    sp.contrato_id::text AS contrato_id,
    c.numero_contrato AS contrato_numero,
    sp.nombre_periodo,
    sp.fecha_inicio,
    sp.fecha_fin,
    sp.activo,
    sp.created_at
  FROM sst_indicadores_periodos sp
  INNER JOIN empresas e ON e.id = sp.empresa_id
  LEFT JOIN contratos c ON c.id = sp.contrato_id
`;

const mapPeriodo = (row: IndicadoresPeriodoRow): IndicadoresPeriodo => {
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
    nombre_periodo: row.nombre_periodo,
    fecha_inicio: toDateIsoString(row.fecha_inicio) ?? '',
    fecha_fin: toDateIsoString(row.fecha_fin) ?? '',
    activo: Boolean(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const loadPeriodo = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<IndicadoresPeriodo> => {
  const result = await dbQuery<IndicadoresPeriodoRow>(
    `
      ${getPeriodSelect()}
      WHERE sp.id::text = $1
      LIMIT 1
    `,
    [periodoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Periodo not found', 404, 'INDICADORES_PERIODO_NOT_FOUND');
  }

  const periodo = mapPeriodo(row);
  ensureTenantScopeForEntity(tenant, periodo.contrato.id, periodo.empresa.id);
  return periodo;
};

const resolvePeriodo = async (
  filters: GetIndicadoresDashboardQuery | GetIndicadoresHistoricoQuery | GetIndicadoresAlertasQuery,
  tenant?: TenantAccessContext
): Promise<IndicadoresPeriodo> => {
  if (filters.periodo_id) {
    return loadPeriodo(filters.periodo_id, tenant);
  }

  const result = await dbQuery<IndicadoresPeriodoRow>(
    `
      ${getPeriodSelect()}
      ${buildPeriodWhere({ empresa_id: filters.empresa_id, contrato_id: filters.contrato_id, activo: true }, tenant).whereClause}
      ORDER BY sp.activo DESC, sp.fecha_fin DESC, sp.created_at DESC, sp.id DESC
      LIMIT 1
    `,
    buildPeriodWhere({ empresa_id: filters.empresa_id, contrato_id: filters.contrato_id, activo: true }, tenant).params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('No indicators period found for the current scope', 404, 'INDICADORES_PERIODO_NOT_FOUND');
  }

  return mapPeriodo(row);
};

const listPeriodos = async (
  filters: ListIndicadoresPeriodosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedIndicadoresPeriodos> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const { params, whereClause } = buildPeriodWhere(
    {
      empresa_id: filters.empresa_id,
      contrato_id: filters.contrato_id,
      activo: filters.activo
    },
    tenant
  );

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_indicadores_periodos sp
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<IndicadoresPeriodoRow>(
    `
      ${getPeriodSelect()}
      ${whereClause}
      ORDER BY sp.activo DESC, sp.fecha_fin DESC, sp.created_at DESC, sp.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapPeriodo),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

const validatePeriodoScope = async (input: {
  client?: PoolClient;
  contratoId: string | null;
  empresaId: string;
  tenant?: TenantAccessContext;
}): Promise<void> => {
  await ensureEmpresaExists(input.empresaId, input.client);

  if (input.contratoId) {
    await ensureContratoExists(input.contratoId, input.client);
    const contratoScope = await dbQuery<{ empresa_id: string | null; id: string }>(
      `
        SELECT c.id::text AS id, c.empresa_id::text AS empresa_id
        FROM contratos c
        WHERE c.id::text = $1
        LIMIT 1
      `,
      [input.contratoId]
    );

    const row = contratoScope.rows[0];

    if (!row) {
      throw new AppError('Contrato not found', 400, 'CONTRATO_NOT_FOUND');
    }

    const empresaId = toBigintNumber(input.empresaId);
    const contratoEmpresaId = toNullableBigintNumber(row.empresa_id);

    if (contratoEmpresaId !== null && contratoEmpresaId !== empresaId) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'INDICADORES_PERIODO_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, toBigintNumber(row.id), empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, toBigintNumber(input.empresaId));
};

const getAccidentalidad = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresAccidentalidad> => {
  const conditions: string[] = ['sai.fecha_evento >= $1::date', 'sai.fecha_evento <= $2::date', 'COALESCE(sai.activo, TRUE) = TRUE'];
  const params: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(conditions, params, tenant, 'sai.contrato_id', 'sai.empresa_id');

  if (periodo.contrato.id !== null) {
    params.push(periodo.contrato.id);
    conditions.push(`sai.contrato_id = $${params.length}::bigint`);
  }

  params.push(periodo.empresa.id);
  conditions.push(`sai.empresa_id = $${params.length}::bigint`);

  const result = await dbQuery<IndicadoresAccidentalidadRow>(
    `
      SELECT
        COUNT(*) FILTER (WHERE sai.tipo_evento = 'ACCIDENTE_TRABAJO')::int AS accidentes_total,
        COUNT(*) FILTER (WHERE sai.tipo_evento = 'INCIDENTE')::int AS incidentes_total,
        COALESCE(SUM(COALESCE(sai.dias_incapacidad, 0)), 0)::int AS dias_incapacidad_total,
        COUNT(*) FILTER (WHERE COALESCE(sai.requiere_investigacion, FALSE) = TRUE AND sai.estado <> 'CERRADO')::int AS investigaciones_pendientes,
        COUNT(*) FILTER (WHERE sai.estado = 'CERRADO')::int AS investigaciones_cerradas
      FROM sst_accidentes_incidentes sai
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  const row = result.rows[0];

  return {
    accidentes_total: row?.accidentes_total ?? 0,
    incidentes_total: row?.incidentes_total ?? 0,
    dias_incapacidad_total: row?.dias_incapacidad_total ?? 0,
    investigaciones_pendientes: row?.investigaciones_pendientes ?? 0,
    investigaciones_cerradas: row?.investigaciones_cerradas ?? 0
  };
};

const getCapacitaciones = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresCapacitaciones> => {
  const conditions: string[] = [
    'scp.fecha_capacitacion >= $1::date',
    'scp.fecha_capacitacion <= $2::date',
    'COALESCE(scp.activo, TRUE) = TRUE',
    'COALESCE(sc.activo, TRUE) = TRUE'
  ];
  const params: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(conditions, params, tenant, 'sc.contrato_id', 'sc.empresa_id');

  if (periodo.contrato.id !== null) {
    params.push(periodo.contrato.id);
    conditions.push(`sc.contrato_id = $${params.length}::bigint`);
  }

  params.push(periodo.empresa.id);
  conditions.push(`sc.empresa_id = $${params.length}::bigint`);

  const result = await dbQuery<IndicadoresCapacitacionesRow>(
    `
      SELECT
        COUNT(*)::int AS capacitaciones_total,
        COUNT(*) FILTER (
          WHERE scp.fecha_vencimiento IS NULL OR scp.fecha_vencimiento >= $2::date
        )::int AS capacitaciones_vigentes,
        COUNT(*) FILTER (
          WHERE scp.fecha_vencimiento IS NOT NULL AND scp.fecha_vencimiento < $2::date
        )::int AS capacitaciones_vencidas
      FROM sst_capacitaciones_persona scp
      INNER JOIN sst_capacitaciones sc ON sc.id = scp.capacitacion_id
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  const row = result.rows[0];
  const total = row?.capacitaciones_total ?? 0;
  const vigentes = row?.capacitaciones_vigentes ?? 0;
  const vencidas = row?.capacitaciones_vencidas ?? 0;

  return {
    capacitaciones_total: total,
    capacitaciones_vigentes: vigentes,
    capacitaciones_vencidas: vencidas,
    cumplimiento_capacitaciones: total === 0 ? 100 : clampPercentage((vigentes / total) * 100)
  };
};

const getExamenes = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresExamenes> => {
  const conditions: string[] = [
    'sep.fecha_examen >= $1::date',
    'sep.fecha_examen <= $2::date',
    'COALESCE(sep.activo, TRUE) = TRUE',
    'COALESCE(seo.activo, TRUE) = TRUE'
  ];
  const params: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(conditions, params, tenant, 'seo.contrato_id', 'seo.empresa_id');

  if (periodo.contrato.id !== null) {
    params.push(periodo.contrato.id);
    conditions.push(`seo.contrato_id = $${params.length}::bigint`);
  }

  params.push(periodo.empresa.id);
  conditions.push(`seo.empresa_id = $${params.length}::bigint`);

  const result = await dbQuery<IndicadoresExamenesRow>(
    `
      SELECT
        COUNT(*)::int AS examenes_total,
        COUNT(*) FILTER (
          WHERE sep.fecha_vencimiento IS NULL OR sep.fecha_vencimiento >= $2::date
        )::int AS examenes_vigentes,
        COUNT(*) FILTER (
          WHERE sep.fecha_vencimiento IS NOT NULL AND sep.fecha_vencimiento < $2::date
        )::int AS examenes_vencidos
      FROM sst_examenes_persona sep
      INNER JOIN sst_examenes_ocupacionales seo ON seo.id = sep.examen_id
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  const row = result.rows[0];
  const total = row?.examenes_total ?? 0;
  const vigentes = row?.examenes_vigentes ?? 0;
  const vencidos = row?.examenes_vencidos ?? 0;

  return {
    examenes_total: total,
    examenes_vigentes: vigentes,
    examenes_vencidos: vencidos,
    cumplimiento_examenes: total === 0 ? 100 : clampPercentage((vigentes / total) * 100)
  };
};

const getDotacion = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresDotacion> => {
  const conditions: string[] = [
    'sdee.fecha_entrega >= $1::date',
    'sdee.fecha_entrega <= $2::date',
    'COALESCE(sdee.activo, TRUE) = TRUE',
    'COALESCE(sde.activo, TRUE) = TRUE'
  ];
  const params: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(conditions, params, tenant, 'sde.contrato_id', 'sde.empresa_id');

  if (periodo.contrato.id !== null) {
    params.push(periodo.contrato.id);
    conditions.push(`sde.contrato_id = $${params.length}::bigint`);
  }

  params.push(periodo.empresa.id);
  conditions.push(`sde.empresa_id = $${params.length}::bigint`);

  const result = await dbQuery<IndicadoresDotacionRow>(
    `
      SELECT
        COUNT(*)::int AS epp_total,
        COUNT(*) FILTER (
          WHERE sdee.fecha_proxima_reposicion IS NULL OR sdee.fecha_proxima_reposicion >= $2::date
        )::int AS epp_vigentes,
        COUNT(*) FILTER (
          WHERE sdee.fecha_proxima_reposicion IS NOT NULL AND sdee.fecha_proxima_reposicion < $2::date
        )::int AS epp_vencidos
      FROM sst_dotacion_epp_entregas sdee
      INNER JOIN sst_dotacion_epp sde ON sde.id = sdee.item_id
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  const row = result.rows[0];
  const total = row?.epp_total ?? 0;
  const vigentes = row?.epp_vigentes ?? 0;
  const vencidos = row?.epp_vencidos ?? 0;

  return {
    epp_total: total,
    epp_vigentes: vigentes,
    epp_vencidos: vencidos,
    cumplimiento_epp: total === 0 ? 100 : clampPercentage((vigentes / total) * 100)
  };
};

const getInspecciones = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresInspecciones> => {
  const inspeccionesConditions: string[] = [
    'COALESCE(si.activo, TRUE) = TRUE',
    'si.fecha_programada >= $1::date',
    'si.fecha_programada <= $2::date'
  ];
  const inspeccionesParams: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(inspeccionesConditions, inspeccionesParams, tenant, 'si.contrato_id', 'si.empresa_id');

  if (periodo.contrato.id !== null) {
    inspeccionesParams.push(periodo.contrato.id);
    inspeccionesConditions.push(`si.contrato_id = $${inspeccionesParams.length}::bigint`);
  }

  inspeccionesParams.push(periodo.empresa.id);
  inspeccionesConditions.push(`si.empresa_id = $${inspeccionesParams.length}::bigint`);

  const hallazgosConditions: string[] = [
    'COALESCE(sih.activo, TRUE) = TRUE',
    'COALESCE(si.activo, TRUE) = TRUE',
    'sih.nivel_riesgo = ' + "'CRITICO'",
    'si.fecha_programada >= $1::date',
    'si.fecha_programada <= $2::date'
  ];
  const hallazgosParams: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(hallazgosConditions, hallazgosParams, tenant, 'si.contrato_id', 'si.empresa_id');

  if (periodo.contrato.id !== null) {
    hallazgosParams.push(periodo.contrato.id);
    hallazgosConditions.push(`si.contrato_id = $${hallazgosParams.length}::bigint`);
  }

  hallazgosParams.push(periodo.empresa.id);
  hallazgosConditions.push(`si.empresa_id = $${hallazgosParams.length}::bigint`);

  const accionesConditions: string[] = [
    'COALESCE(sia.activo, TRUE) = TRUE',
    'COALESCE(sih.activo, TRUE) = TRUE',
    'COALESCE(si.activo, TRUE) = TRUE',
    'si.fecha_programada >= $1::date',
    'si.fecha_programada <= $2::date'
  ];
  const accionesParams: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(accionesConditions, accionesParams, tenant, 'si.contrato_id', 'si.empresa_id');

  if (periodo.contrato.id !== null) {
    accionesParams.push(periodo.contrato.id);
    accionesConditions.push(`si.contrato_id = $${accionesParams.length}::bigint`);
  }

  accionesParams.push(periodo.empresa.id);
  accionesConditions.push(`si.empresa_id = $${accionesParams.length}::bigint`);

  const [inspeccionesResult, hallazgosResult, accionesResult] = await Promise.all([
    dbQuery<CountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM sst_inspecciones si
        WHERE ${inspeccionesConditions.join(' AND ')}
      `,
      inspeccionesParams
    ),
    dbQuery<CountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM sst_inspecciones_hallazgos sih
        INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
        WHERE ${hallazgosConditions.join(' AND ')}
      `,
      hallazgosParams
    ),
    dbQuery<IndicadoresInspeccionesRow>(
      `
        SELECT
          COUNT(*) FILTER (WHERE sia.estado IN ('ABIERTA', 'EN_PROCESO', 'VENCIDA'))::int AS acciones_abiertas,
          COUNT(*) FILTER (WHERE sia.estado = 'CERRADA')::int AS acciones_cerradas
        FROM sst_inspecciones_acciones sia
        INNER JOIN sst_inspecciones_hallazgos sih ON sih.id = sia.hallazgo_id
        INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
        WHERE ${accionesConditions.join(' AND ')}
      `,
      accionesParams
    )
  ]);

  const inspecciones_total = inspeccionesResult.rows[0]?.total ?? 0;
  const hallazgos_criticos = hallazgosResult.rows[0]?.total ?? 0;
  const acciones_abiertas = accionesResult.rows[0]?.acciones_abiertas ?? 0;
  const acciones_cerradas = accionesResult.rows[0]?.acciones_cerradas ?? 0;
  const acciones_total = acciones_abiertas + acciones_cerradas;
  const cumplimiento_inspecciones = clampPercentage(
    (acciones_total === 0 ? 100 : (acciones_cerradas / acciones_total) * 100) - hallazgos_criticos * 5
  );

  return {
    inspecciones_total,
    hallazgos_criticos,
    acciones_abiertas,
    acciones_cerradas,
    cumplimiento_inspecciones
  };
};

const getRiesgos = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresRiesgos> => {
  const conditions: string[] = [
    'COALESCE(smr.activo, TRUE) = TRUE',
    'smr.created_at::date >= $1::date',
    'smr.created_at::date <= $2::date'
  ];
  const params: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(conditions, params, tenant, 'smr.contrato_id', 'smr.empresa_id');

  if (periodo.contrato.id !== null) {
    params.push(periodo.contrato.id);
    conditions.push(`smr.contrato_id = $${params.length}::bigint`);
  }

  params.push(periodo.empresa.id);
  conditions.push(`smr.empresa_id = $${params.length}::bigint`);

  const result = await dbQuery<IndicadoresRiesgosRow>(
    `
      SELECT
        COUNT(*) FILTER (WHERE smr.clasificacion_riesgo = 'ALTO')::int AS riesgos_altos,
        COUNT(*) FILTER (WHERE smr.clasificacion_riesgo = 'CRITICO')::int AS riesgos_criticos
      FROM sst_matriz_riesgos smr
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  const row = result.rows[0];
  const riesgos_altos = row?.riesgos_altos ?? 0;
  const riesgos_criticos = row?.riesgos_criticos ?? 0;
  const cumplimiento_riesgos = clampPercentage(100 - (riesgos_altos * 5 + riesgos_criticos * 10));

  return {
    riesgos_altos,
    riesgos_criticos,
    cumplimiento_riesgos
  };
};

const getPlanAnual = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresPlanAnual> => {
  const conditions: string[] = [
    'COALESCE(spaa.activo, TRUE) = TRUE',
    'spaa.fecha_programada >= $1::date',
    'spaa.fecha_programada <= $2::date'
  ];
  const params: unknown[] = [periodo.fecha_inicio, periodo.fecha_fin];
  appendTenantScopeConditions(conditions, params, tenant, 'spa.contrato_id', 'spa.empresa_id');

  if (periodo.contrato.id !== null) {
    params.push(periodo.contrato.id);
    conditions.push(`spa.contrato_id = $${params.length}::bigint`);
  }

  params.push(periodo.empresa.id);
  conditions.push(`spa.empresa_id = $${params.length}::bigint`);

  const result = await dbQuery<IndicadoresPlanRow>(
    `
      SELECT
        COUNT(*)::int AS actividades_programadas,
        COUNT(*) FILTER (WHERE spaa.estado = 'EJECUTADA' OR spaa.fecha_ejecucion IS NOT NULL)::int AS actividades_ejecutadas,
        COUNT(*) FILTER (
          WHERE spaa.estado = 'VENCIDA'
            OR (spaa.estado <> 'CANCELADA' AND spaa.estado <> 'EJECUTADA' AND spaa.fecha_programada < $2::date)
        )::int AS actividades_vencidas
      FROM sst_plan_anual_actividades spaa
      INNER JOIN sst_plan_anual spa ON spa.id = spaa.plan_id
      WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  const row = result.rows[0];
  const actividades_programadas = row?.actividades_programadas ?? 0;
  const actividades_ejecutadas = row?.actividades_ejecutadas ?? 0;
  const actividades_vencidas = row?.actividades_vencidas ?? 0;
  const cumplimiento_plan_anual =
    actividades_programadas === 0
      ? 100
      : clampPercentage((actividades_ejecutadas / actividades_programadas) * 100 - actividades_vencidas * 2);

  return {
    actividades_ejecutadas,
    actividades_programadas,
    actividades_vencidas,
    cumplimiento_plan_anual
  };
};

const buildDashboard = async (
  periodo: IndicadoresPeriodo,
  tenant?: TenantAccessContext
): Promise<IndicadoresDashboard> => {
  const [accidentalidad, capacitaciones, examenes, dotacion, inspecciones, riesgos, plan_anual] =
    await Promise.all([
      getAccidentalidad(periodo, tenant),
      getCapacitaciones(periodo, tenant),
      getExamenes(periodo, tenant),
      getDotacion(periodo, tenant),
      getInspecciones(periodo, tenant),
      getRiesgos(periodo, tenant),
      getPlanAnual(periodo, tenant)
    ]);

  const periodDays = getPeriodDays(periodo.fecha_inicio, periodo.fecha_fin);
  const frecuencia = {
    indice_frecuencia: round2(((accidentalidad.accidentes_total + accidentalidad.incidentes_total) / periodDays) * 100)
  };
  const severidad = {
    indice_severidad: round2((accidentalidad.dias_incapacidad_total / periodDays) * 100)
  };

  const accidentalidad_score = clampPercentage(
    100 - (accidentalidad.accidentes_total * 12 + accidentalidad.incidentes_total * 6 + accidentalidad.dias_incapacidad_total * 0.5)
  );
  const frecuencia_score = clampPercentage(100 - frecuencia.indice_frecuencia);
  const severidad_score = clampPercentage(100 - severidad.indice_severidad);

  const complianceScores = [
    accidentalidad_score,
    frecuencia_score,
    severidad_score,
    capacitaciones.cumplimiento_capacitaciones,
    examenes.cumplimiento_examenes,
    dotacion.cumplimiento_epp,
    inspecciones.cumplimiento_inspecciones,
    riesgos.cumplimiento_riesgos,
    plan_anual.cumplimiento_plan_anual
  ];
  const cumplimiento_general_sst = round2(
    complianceScores.reduce((sum, value) => sum + value, 0) / complianceScores.length
  );

  return {
    periodo,
    accidentalidad,
    frecuencia,
    severidad,
    capacitaciones,
    examenes,
    dotacion,
    inspecciones,
    riesgos,
    plan_anual,
    indicadores_generales: {
      clasificacion: resolveClassification(cumplimiento_general_sst),
      cumplimiento_general_sst
    }
  };
};

export const listIndicadoresPeriodos = async (
  filters: ListIndicadoresPeriodosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedIndicadoresPeriodos> => {
  return listPeriodos(filters, tenant);
};

export const createIndicadoresPeriodo = async (
  input: CreateIndicadoresPeriodoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<IndicadoresPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validatePeriodoScope({
      client,
      empresaId: input.empresa_id,
      contratoId: input.contrato_id,
      tenant
    });

    const insertResult = await client.query<{ id: string }>(
      `
        INSERT INTO sst_indicadores_periodos (
          empresa_id,
          contrato_id,
          nombre_periodo,
          fecha_inicio,
          fecha_fin,
          activo
        )
        VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6)
        RETURNING id::text AS id
      `,
      [input.empresa_id, input.contrato_id, input.nombre_periodo, input.fecha_inicio, input.fecha_fin, input.activo]
    );

    const createdId = insertResult.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create indicators period', 500, 'INDICADORES_PERIODO_CREATE_FAILED');
    }

    const periodResult = await client.query<IndicadoresPeriodoRow>(
      `
        ${getPeriodSelect()}
        WHERE sp.id::text = $1
        LIMIT 1
      `,
      [createdId]
    );

    const row = periodResult.rows[0];

    if (!row) {
      throw new AppError('Failed to load created indicators period', 500, 'INDICADORES_PERIODO_LOAD_FAILED');
    }

    const periodo = mapPeriodo(row);

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_INDICADORES_PERIODO_CREATE',
      tabla: 'sst_indicadores_periodos',
      registro_id: String(periodo.id),
      descripcion: 'Creacion de periodo SST de indicadores',
      after: periodo,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return periodo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getIndicadoresDashboard = async (
  filters: GetIndicadoresDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<IndicadoresDashboard> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const periodo = await resolvePeriodo(filters, tenant);
  const dashboard = await buildDashboard(periodo, tenant);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_INDICADORES_VIEW',
    tabla: 'sst_indicadores_periodos',
    registro_id: `dashboard:${periodo.id}`,
    descripcion: 'Consulta de dashboard SST de indicadores legales',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getIndicadoresHistorico = async (
  filters: GetIndicadoresHistoricoQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<{ items: IndicadoresHistoricoItem[] }> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const { params, whereClause } = buildPeriodWhere(
    {
      empresa_id: filters.empresa_id,
      contrato_id: filters.contrato_id,
      activo: true
    },
    tenant
  );

  const periodos = await dbQuery<IndicadoresPeriodoRow>(
    `
      ${getPeriodSelect()}
      ${whereClause}
      ORDER BY sp.fecha_inicio ASC, sp.fecha_fin ASC, sp.id ASC
    `,
    params
  );

  const items = await Promise.all(
    periodos.rows.map(async (row) => {
      const periodo = mapPeriodo(row);
      return buildDashboard(periodo, tenant);
    })
  );

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_INDICADORES_HISTORICO_VIEW',
    tabla: 'sst_indicadores_periodos',
    registro_id: `historico:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de historico SST de indicadores legales',
    after: {
      total_periodos: items.length
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return { items };
};

export const getIndicadoresAlertas = async (
  filters: GetIndicadoresAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedIndicadoresAlertas> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });

  const periodo = await resolvePeriodo(filters, tenant);
  const dashboard = await buildDashboard(periodo, tenant);
  const items: IndicadorAlerta[] = [];

  if (dashboard.indicadores_generales.cumplimiento_general_sst < 60) {
    items.push({
      id: `INDICADOR_CRITICO:${periodo.id}`,
      tipo_alerta: 'INDICADOR_CRITICO',
      severidad: 'CRITICA',
      estado: 'ACTIVA',
      fecha_alerta: periodo.fecha_fin,
      clasificacion: dashboard.indicadores_generales.clasificacion,
      cumplimiento_general_sst: dashboard.indicadores_generales.cumplimiento_general_sst,
      periodo,
      descripcion: 'El indicador general SST se encuentra por debajo del 60%.',
      titulo: 'Indicador SST critico'
    });
  } else if (dashboard.indicadores_generales.cumplimiento_general_sst < 80) {
    items.push({
      id: `INDICADOR_BAJO_CUMPLIMIENTO:${periodo.id}`,
      tipo_alerta: 'INDICADOR_BAJO_CUMPLIMIENTO',
      severidad: 'ALTA',
      estado: 'ACTIVA',
      fecha_alerta: periodo.fecha_fin,
      clasificacion: dashboard.indicadores_generales.clasificacion,
      cumplimiento_general_sst: dashboard.indicadores_generales.cumplimiento_general_sst,
      periodo,
      descripcion: 'El indicador general SST se encuentra entre 60% y 79%.',
      titulo: 'Indicador SST bajo cumplimiento'
    });
  }

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_INDICADORES_VIEW',
    tabla: 'sst_indicadores_periodos',
    registro_id: `alertas:${periodo.id}`,
    descripcion: 'Consulta de alertas SST de indicadores legales',
    after: {
      total_alertas: items.length
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return {
    items,
    pagination: {
      page: 1,
      limit: 100,
      total: items.length,
      total_pages: items.length === 0 ? 0 : 1
    }
  };
};
