import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import {
  assertTenantAccessForPersonaId,
  assertTenantAccessForVinculacionId,
  buildTenantWhereClause,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  ensureEmpresaExists,
  ensurePersonaExists,
  ensureVinculacionExists
} from './nomina.validator';
import type {
  CreateInteresesCesantiaInput,
  InteresesCesantiasAlertasQuery,
  InteresesCesantiasDashboardQuery,
  ListInteresesCesantiasQuery,
  NominaInteresesCesantiasEstado,
  UpdateInteresesCesantiaInput
} from './intereses-cesantias.schemas';

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

interface CountRow extends QueryResultRow {
  total: number;
}

interface InteresesCesantiaRow extends QueryResultRow {
  activo: boolean | null;
  cesantia_id: string | null;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaInteresesCesantiasEstado;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_pago: Date | string | null;
  id: string;
  periodo: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  porcentaje_interes: number | string;
  valor_cesantias: number | string;
  valor_intereses: number | string;
  vinculacion_id: string;
}

interface InteresesCesantiaAlertRow extends QueryResultRow {
  activo: boolean | null;
  cesantia_id: string | null;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaInteresesCesantiasEstado;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_pago: Date | string | null;
  id: string;
  periodo: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  porcentaje_interes: number | string;
  tipo_alerta: 'INTERESES_CESANTIAS_PENDIENTES_PAGO' | 'INTERESES_CESANTIAS_SIN_LIQUIDAR';
  valor_cesantias: number | string;
  valor_intereses: number | string;
  vinculacion_id: string;
}

interface InteresesCesantiaExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  cesantia_id: string | null;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaInteresesCesantiasEstado;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_pago: Date | string | null;
  id: string;
  periodo: string;
  porcentaje_interes: number | string;
  valor_cesantias: number | string;
  valor_intereses: number | string;
  vinculacion_id: string;
}

export interface InteresesCesantiaItem {
  activo: boolean;
  cesantia_id: number | null;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaInteresesCesantiasEstado;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_pago: string | null;
  id: number;
  periodo: string;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  porcentaje_interes: number;
  valor_cesantias: number;
  valor_intereses: number;
  vinculacion_id: number;
}

export interface InteresesCesantiasDashboard {
  intereses_total: number;
  liquidados: number;
  pagados: number;
  pendientes: number;
  valor_total_intereses: number;
  valor_total_pagado: number;
}

export interface InteresesCesantiaAlertItem {
  activo: boolean;
  cesantia_id: number | null;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaInteresesCesantiasEstado;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_pago: string | null;
  id: number;
  periodo: string;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  porcentaje_interes: number;
  tipo_alerta: 'INTERESES_CESANTIAS_PENDIENTES_PAGO' | 'INTERESES_CESANTIAS_SIN_LIQUIDAR';
  valor_cesantias: number;
  valor_intereses: number;
  vinculacion_id: number;
}

export interface InteresesCesantiaExpedienteItem {
  activo: boolean;
  cesantia_id: number | null;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaInteresesCesantiasEstado;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_pago: string | null;
  id: number;
  periodo: string;
  porcentaje_interes: number;
  valor_cesantias: number;
  valor_intereses: number;
  vinculacion_id: number;
}

export interface InteresesCesantiasExpedienteIndicadores {
  intereses_cesantias_pagados: number;
  intereses_cesantias_total: number;
  ultimo_interes_cesantias: string | null;
}

export interface InteresesCesantiasExpediente {
  indicadores: InteresesCesantiasExpedienteIndicadores;
  items: InteresesCesantiaExpedienteItem[];
}

export interface PaginatedInteresesCesantias {
  items: InteresesCesantiaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedInteresesCesantiasAlertas {
  items: InteresesCesantiaAlertItem[];
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

const calculateInteresesValue = (
  valorCesantias: number,
  porcentajeInteres: number,
  diasLiquidados: number
): number => {
  return Number(((valorCesantias * (porcentajeInteres / 100) * diasLiquidados) / 360).toFixed(2));
};

const buildPagination = (
  page: number,
  limit: number,
  total: number
): PaginatedInteresesCesantias['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const buildAlertasPagination = (
  page: number,
  limit: number,
  total: number
): PaginatedInteresesCesantiasAlertas['pagination'] => ({
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

const buildTenantScope = (tenant: TenantAccessContext | undefined, alias = 'nic'): { params: unknown[]; sql: string } => {
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
  const conditions: string[] = [];
  if (scope.sql) {
    conditions.push(scope.sql.replace(/^WHERE\s+/i, '').trim());
  }
  conditions.push(...filters);
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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

const assertCesantiaRelacionada = async (
  cesantiaId: string,
  personaId: string,
  vinculacionId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = client ?? dbPool;
  const result = await executor.query<{ persona_id: string; vinculacion_id: string }>(
    `
      SELECT
        persona_id::text AS persona_id,
        vinculacion_id::text AS vinculacion_id
      FROM nomina_cesantias
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [cesantiaId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Cesantia not found', 404, 'NOMINA_INTERESES_CESANTIAS_CESANTIA_NOT_FOUND');
  }

  if (row.persona_id !== personaId || row.vinculacion_id !== vinculacionId) {
    throw new AppError(
      'Cesantia does not belong to the same persona or vinculacion',
      400,
      'NOMINA_INTERESES_CESANTIAS_CESANTIA_INVALIDA'
    );
  }
};

const assertInteresesCoreRelations = async (
  input: {
    cesantia_id: string | null;
    contrato_id: string;
    empresa_id: string;
    persona_id: string;
    vinculacion_id: string;
  },
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<void> => {
  await assertTenantAccessForPersonaId(tenant, input.persona_id);
  await assertTenantAccessForVinculacionId(tenant, input.vinculacion_id);
  await ensureEmpresaExists(input.empresa_id, client);
  await ensurePersonaExists(input.persona_id, client);

  const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
  if (vinculacion.persona_id !== input.persona_id) {
    throw new AppError(
      'Vinculacion does not belong to persona',
      400,
      'NOMINA_INTERESES_CESANTIAS_VINCULACION_INVALIDA'
    );
  }

  if (vinculacion.empresa_id !== input.empresa_id) {
    throw new AppError('Vinculacion does not belong to empresa', 400, 'NOMINA_INTERESES_CESANTIAS_EMPRESA_INVALIDA');
  }

  if (vinculacion.contrato_id !== input.contrato_id) {
    throw new AppError(
      'Vinculacion does not belong to contrato',
      400,
      'NOMINA_INTERESES_CESANTIAS_CONTRATO_INVALIDO'
    );
  }

  const contrato = await loadContractOrThrow(input.contrato_id, tenant, client);
  if (contrato.empresa_id !== input.empresa_id) {
    throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_INTERESES_CESANTIAS_EMPRESA_INVALIDA');
  }

  if (input.cesantia_id) {
    await assertCesantiaRelacionada(input.cesantia_id, input.persona_id, input.vinculacion_id, client);
  }
};

const loadInteresesCesantiaOrThrow = async (
  id: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<InteresesCesantiaRow> => {
  const scope = buildTenantScope(tenant, 'nic');
  const executor = client ?? dbPool;
  const result = await executor.query<InteresesCesantiaRow>(
    `
      SELECT
        nic.activo,
        nic.cesantia_id::text AS cesantia_id,
        nic.contrato_id::text AS contrato_id,
        nic.created_at,
        nic.dias_liquidados,
        nic.empresa_id::text AS empresa_id,
        nic.estado,
        nic.fecha_fin,
        nic.fecha_inicio,
        nic.fecha_pago,
        nic.id::text AS id,
        nic.periodo,
        p.numero_documento AS persona_documento,
        nic.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nic.porcentaje_interes,
        nic.valor_cesantias,
        nic.valor_intereses,
        nic.vinculacion_id::text AS vinculacion_id
      FROM nomina_intereses_cesantias nic
      INNER JOIN personas p ON p.id = nic.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nic.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, id]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Intereses cesantias record not found', 404, 'NOMINA_INTERESES_CESANTIAS_NOT_FOUND');
  }

  return row;
};

const mapInteresesCesantia = (row: InteresesCesantiaRow): InteresesCesantiaItem => ({
  activo: toBoolean(row.activo),
  cesantia_id: toNullableNumber(row.cesantia_id),
  contrato_id: toNullableNumber(row.contrato_id),
  created_at: toDateOnlyString(row.created_at),
  dias_liquidados: toNullableNumber(row.dias_liquidados) ?? 0,
  empresa_id: toNumber(row.empresa_id),
  estado: row.estado,
  fecha_fin: toDateOnlyString(row.fecha_fin),
  fecha_inicio: toDateOnlyString(row.fecha_inicio),
  fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
  id: toNumber(row.id),
  periodo: row.periodo,
  persona_documento: row.persona_documento,
  persona_id: toNumber(row.persona_id),
  persona_nombre: row.persona_nombre,
  porcentaje_interes: toNullableNumber(row.porcentaje_interes) ?? 0,
  valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
  valor_intereses: toNullableNumber(row.valor_intereses) ?? 0,
  vinculacion_id: toNumber(row.vinculacion_id)
});

const appendInteresesCesantiaFilters = (
  filters: string[],
  params: unknown[],
  query: {
    activo?: boolean;
    contrato_id?: string | null;
    empresa_id?: string | null;
    estado?: string;
    persona_id?: string | null;
    vinculacion_id?: string | null;
  },
  alias = 'nic'
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
};

export const listInteresesCesantias = async (
  query: ListInteresesCesantiasQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedInteresesCesantias> => {
  const scope = buildTenantScope(tenant, 'nic');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  appendInteresesCesantiaFilters(filters, params, query, 'nic');
  const whereSql = scopeWhereSql(scope, filters);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_intereses_cesantias nic
      INNER JOIN personas p ON p.id = nic.persona_id
      ${whereSql || 'WHERE 1 = 1'}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<InteresesCesantiaRow>(
    `
      SELECT
        nic.activo,
        nic.cesantia_id::text AS cesantia_id,
        nic.contrato_id::text AS contrato_id,
        nic.created_at,
        nic.dias_liquidados,
        nic.empresa_id::text AS empresa_id,
        nic.estado,
        nic.fecha_fin,
        nic.fecha_inicio,
        nic.fecha_pago,
        nic.id::text AS id,
        nic.periodo,
        p.numero_documento AS persona_documento,
        nic.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nic.porcentaje_interes,
        nic.valor_cesantias,
        nic.valor_intereses,
        nic.vinculacion_id::text AS vinculacion_id
      FROM nomina_intereses_cesantias nic
      INNER JOIN personas p ON p.id = nic.persona_id
      ${whereSql || 'WHERE 1 = 1'}
      ORDER BY nic.created_at DESC, nic.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapInteresesCesantia),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

export const createInteresesCesantia = async (
  input: CreateInteresesCesantiaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<InteresesCesantiaItem> => {
  const result = await runInTransaction(async (client) => {
    const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
    const selectedContratoId = input.contrato_id ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError(
        'Contrato is required for intereses cesantias records',
        400,
        'NOMINA_INTERESES_CESANTIAS_CONTRATO_INVALIDO'
      );
    }

    await assertInteresesCoreRelations(
      {
        cesantia_id: input.cesantia_id,
        contrato_id: selectedContratoId,
        empresa_id: input.empresa_id,
        persona_id: input.persona_id,
        vinculacion_id: input.vinculacion_id
      },
      tenant,
      client
    );

    const diasLiquidados = Number(input.dias_liquidados ?? 0);
    if (diasLiquidados < 0 || diasLiquidados > 360) {
      throw new AppError('dias_liquidados must be between 0 and 360', 400, 'NOMINA_INTERESES_CESANTIAS_DIAS_INVALIDOS');
    }

    const valorCesantias = Number(input.valor_cesantias ?? 0);
    if (valorCesantias < 0) {
      throw new AppError('valor_cesantias must be greater than or equal to 0', 400, 'NOMINA_INTERESES_CESANTIAS_VALOR_INVALIDO');
    }

    const porcentajeInteres = Number(input.porcentaje_interes ?? 12);
    if (porcentajeInteres < 0 || porcentajeInteres > 100) {
      throw new AppError(
        'porcentaje_interes must be between 0 and 100',
        400,
        'NOMINA_INTERESES_CESANTIAS_PORCENTAJE_INVALIDO'
      );
    }

    const valorIntereses = calculateInteresesValue(valorCesantias, porcentajeInteres, diasLiquidados);
    const fechaPago = input.fecha_pago ?? (input.estado === 'PAGADO' ? getTodayDateOnly() : null);

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_intereses_cesantias (
          empresa_id,
          contrato_id,
          persona_id,
          vinculacion_id,
          cesantia_id,
          periodo,
          fecha_inicio,
          fecha_fin,
          dias_liquidados,
          valor_cesantias,
          porcentaje_interes,
          valor_intereses,
          estado,
          fecha_pago,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5::bigint,
          $6,
          $7::date,
          $8::date,
          $9::numeric,
          $10::numeric,
          $11::numeric,
          $12::numeric,
          $13,
          $14::date,
          $15
        )
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        selectedContratoId,
        input.persona_id,
        input.vinculacion_id,
        input.cesantia_id,
        input.periodo,
        input.fecha_inicio,
        input.fecha_fin,
        diasLiquidados,
        valorCesantias,
        porcentajeInteres,
        valorIntereses,
        input.estado,
        fechaPago,
        input.activo
      ]
    );

    const row = created.rows[0];
    if (!row) {
      throw new AppError('Failed to create intereses cesantias record', 500, 'NOMINA_INTERESES_CESANTIAS_CREATE_FAILED');
    }

    return loadInteresesCesantiaOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_INTERESES_CESANTIAS_CREATE',
    after: mapInteresesCesantia(result),
    descripcion: 'Creacion de intereses de cesantias',
    registro_id: result.id,
    tabla: 'nomina_intereses_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapInteresesCesantia(result);
};

export const updateInteresesCesantia = async (
  id: number,
  input: UpdateInteresesCesantiaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<InteresesCesantiaItem> => {
  const current = await loadInteresesCesantiaOrThrow(id, tenant);
  const nextEmpresaId = input.empresa_id ?? current.empresa_id;
  const nextPersonaId = input.persona_id ?? current.persona_id;
  const nextVinculacionId = input.vinculacion_id ?? current.vinculacion_id;
  const nextContratoId = input.contrato_id === undefined ? current.contrato_id : input.contrato_id;
  const nextCesantiaId = input.cesantia_id === undefined ? current.cesantia_id : input.cesantia_id;

  const result = await runInTransaction(async (client) => {
    const vinculacion = await ensureVinculacionExists(String(nextVinculacionId), client);
    const selectedContratoId = nextContratoId ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError(
        'Contrato is required for intereses cesantias records',
        400,
        'NOMINA_INTERESES_CESANTIAS_CONTRATO_INVALIDO'
      );
    }

    await assertInteresesCoreRelations(
      {
        cesantia_id: nextCesantiaId,
        contrato_id: String(selectedContratoId),
        empresa_id: String(nextEmpresaId),
        persona_id: String(nextPersonaId),
        vinculacion_id: String(nextVinculacionId)
      },
      tenant,
      client
    );

    const nextDiasLiquidados = input.dias_liquidados ?? (toNullableNumber(current.dias_liquidados) ?? 0);
    if (nextDiasLiquidados < 0 || nextDiasLiquidados > 360) {
      throw new AppError('dias_liquidados must be between 0 and 360', 400, 'NOMINA_INTERESES_CESANTIAS_DIAS_INVALIDOS');
    }

    const nextValorCesantias = input.valor_cesantias ?? (toNullableNumber(current.valor_cesantias) ?? 0);
    if (nextValorCesantias < 0) {
      throw new AppError('valor_cesantias must be greater than or equal to 0', 400, 'NOMINA_INTERESES_CESANTIAS_VALOR_INVALIDO');
    }

    const nextPorcentajeInteres = input.porcentaje_interes ?? (toNullableNumber(current.porcentaje_interes) ?? 12);
    if (nextPorcentajeInteres < 0 || nextPorcentajeInteres > 100) {
      throw new AppError(
        'porcentaje_interes must be between 0 and 100',
        400,
        'NOMINA_INTERESES_CESANTIAS_PORCENTAJE_INVALIDO'
      );
    }

    const nextValorIntereses = calculateInteresesValue(nextValorCesantias, nextPorcentajeInteres, nextDiasLiquidados);
    const nextEstado = input.estado ?? current.estado;
    const nextFechaPago =
      input.fecha_pago !== undefined
        ? input.fecha_pago
        : nextEstado === 'PAGADO'
          ? current.fecha_pago ?? getTodayDateOnly()
          : current.fecha_pago;

    const updated = await client.query<{ id: string }>(
      `
        UPDATE nomina_intereses_cesantias
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          persona_id = $4::bigint,
          vinculacion_id = $5::bigint,
          cesantia_id = $6::bigint,
          periodo = COALESCE($7, periodo),
          fecha_inicio = COALESCE($8::date, fecha_inicio),
          fecha_fin = COALESCE($9::date, fecha_fin),
          dias_liquidados = $10::numeric,
          valor_cesantias = $11::numeric,
          porcentaje_interes = $12::numeric,
          valor_intereses = $13::numeric,
          estado = $14,
          fecha_pago = $15::date,
          activo = COALESCE($16, activo)
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        id,
        nextEmpresaId,
        selectedContratoId,
        nextPersonaId,
        nextVinculacionId,
        nextCesantiaId,
        input.periodo ?? current.periodo,
        input.fecha_inicio ?? current.fecha_inicio,
        input.fecha_fin ?? current.fecha_fin,
        nextDiasLiquidados,
        nextValorCesantias,
        nextPorcentajeInteres,
        nextValorIntereses,
        nextEstado,
        nextFechaPago,
        input.activo ?? toBoolean(current.activo)
      ]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError('Intereses cesantias record not found', 404, 'NOMINA_INTERESES_CESANTIAS_NOT_FOUND');
    }

    return loadInteresesCesantiaOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_INTERESES_CESANTIAS_UPDATE',
    after: mapInteresesCesantia(result),
    before: mapInteresesCesantia(current),
    descripcion: 'Actualizacion de intereses de cesantias',
    registro_id: result.id,
    tabla: 'nomina_intereses_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapInteresesCesantia(result);
};

export const payInteresesCesantia = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<InteresesCesantiaItem> => {
  const current = await loadInteresesCesantiaOrThrow(id, tenant);
  if (current.estado === 'PAGADO') {
    return mapInteresesCesantia(current);
  }

  if (current.estado !== 'LIQUIDADO') {
    throw new AppError(
      'Only liquidated intereses cesantias can be paid',
      409,
      'NOMINA_INTERESES_CESANTIAS_ESTADO_INVALIDO'
    );
  }

  const result = await runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_intereses_cesantias
        SET estado = 'PAGADO', fecha_pago = CURRENT_DATE
        WHERE id = $1::bigint
      `,
      [id]
    );

    return loadInteresesCesantiaOrThrow(id, tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_INTERESES_CESANTIAS_PAGADOS',
    after: mapInteresesCesantia(result),
    before: mapInteresesCesantia(current),
    descripcion: 'Pago de intereses de cesantias',
    registro_id: result.id,
    tabla: 'nomina_intereses_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapInteresesCesantia(result);
};

export const deactivateInteresesCesantia = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<InteresesCesantiaItem> => {
  const current = await loadInteresesCesantiaOrThrow(id, tenant);
  const result = await dbQuery<InteresesCesantiaRow>(
    `
      UPDATE nomina_intereses_cesantias
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        cesantia_id::text AS cesantia_id,
        contrato_id::text AS contrato_id,
        created_at,
        dias_liquidados,
        empresa_id::text AS empresa_id,
        estado,
        fecha_fin,
        fecha_inicio,
        fecha_pago,
        id::text AS id,
        periodo,
        NULL::text AS persona_documento,
        persona_id::text AS persona_id,
        NULL::text AS persona_nombre,
        porcentaje_interes,
        valor_cesantias,
        valor_intereses,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = result.rows[0] ?? current;

  await registerAuditEntry({
    accion: 'NOMINA_INTERESES_CESANTIAS_DEACTIVATE',
    after: mapInteresesCesantia(row),
    descripcion: 'Desactivacion de intereses de cesantias',
    registro_id: String(id),
    tabla: 'nomina_intereses_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapInteresesCesantia(row);
};

export const getInteresesCesantiasDashboard = async (
  query: InteresesCesantiasDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<InteresesCesantiasDashboard> => {
  const scope = buildTenantScope(tenant, 'nic');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nic.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nic.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);

  const result = await dbQuery<{
    intereses_total: number;
    liquidados: number;
    pagados: number;
    pendientes: number;
    valor_total_intereses: number | string | null;
    valor_total_pagado: number | string | null;
  }>(
    `
      SELECT
        COUNT(*)::int AS intereses_total,
        COUNT(*) FILTER (WHERE nic.estado = 'PENDIENTE')::int AS pendientes,
        COUNT(*) FILTER (WHERE nic.estado = 'LIQUIDADO')::int AS liquidados,
        COUNT(*) FILTER (WHERE nic.estado = 'PAGADO')::int AS pagados,
        COALESCE(SUM(nic.valor_intereses), 0) AS valor_total_intereses,
        COALESCE(SUM(CASE WHEN nic.estado = 'PAGADO' THEN nic.valor_intereses ELSE 0 END), 0) AS valor_total_pagado
      FROM nomina_intereses_cesantias nic
      ${whereSql || 'WHERE 1 = 1'}
      AND COALESCE(nic.activo, TRUE) = TRUE
    `,
    params
  );

  const row = result.rows[0];

  await registerAuditEntry({
    accion: 'NOMINA_INTERESES_CESANTIAS_DASHBOARD_VIEW',
    after: {
      intereses_total: row?.intereses_total ?? 0
    },
    descripcion: 'Consulta del dashboard de intereses de cesantias',
    registro_id: '0',
    tabla: 'nomina_intereses_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    intereses_total: row?.intereses_total ?? 0,
    pendientes: row?.pendientes ?? 0,
    liquidados: row?.liquidados ?? 0,
    pagados: row?.pagados ?? 0,
    valor_total_intereses: toNullableNumber(row?.valor_total_intereses) ?? 0,
    valor_total_pagado: toNullableNumber(row?.valor_total_pagado) ?? 0
  };
};

export const getInteresesCesantiasAlertas = async (
  query: InteresesCesantiasAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedInteresesCesantiasAlertas> => {
  const scope = buildTenantScope(tenant, 'nic');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  const countFilters: string[] = [];
  const countParams: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nic.empresa_id = $${params.length}::bigint`);
    countParams.push(query.empresa_id);
    countFilters.push(`nic.empresa_id = $${countParams.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nic.contrato_id = $${params.length}::bigint`);
    countParams.push(query.contrato_id);
    countFilters.push(`nic.contrato_id = $${countParams.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);
  const countWhereSql = scopeWhereSql(scope, countFilters);
  const alertCondition =
    `(nic.estado = 'LIQUIDADO' AND nic.fecha_pago IS NULL) OR (nic.estado = 'PENDIENTE' AND nic.fecha_fin < CURRENT_DATE)`;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_intereses_cesantias nic
      INNER JOIN personas p ON p.id = nic.persona_id
      ${countWhereSql || 'WHERE 1 = 1'}
        AND COALESCE(nic.activo, TRUE) = TRUE
        AND (${alertCondition})
    `,
    countParams
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const rows = await dbQuery<InteresesCesantiaAlertRow>(
    `
      SELECT
        nic.activo,
        nic.cesantia_id::text AS cesantia_id,
        nic.contrato_id::text AS contrato_id,
        nic.created_at,
        nic.dias_liquidados,
        nic.empresa_id::text AS empresa_id,
        nic.estado,
        nic.fecha_fin,
        nic.fecha_inicio,
        nic.fecha_pago,
        nic.id::text AS id,
        nic.periodo,
        p.numero_documento AS persona_documento,
        nic.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nic.porcentaje_interes,
        nic.valor_cesantias,
        nic.valor_intereses,
        nic.vinculacion_id::text AS vinculacion_id,
        CASE
          WHEN nic.estado = 'LIQUIDADO' AND nic.fecha_pago IS NULL THEN 'INTERESES_CESANTIAS_PENDIENTES_PAGO'
          ELSE 'INTERESES_CESANTIAS_SIN_LIQUIDAR'
        END AS tipo_alerta
      FROM nomina_intereses_cesantias nic
      INNER JOIN personas p ON p.id = nic.persona_id
      ${whereSql || 'WHERE 1 = 1'}
        AND COALESCE(nic.activo, TRUE) = TRUE
        AND (
          (nic.estado = 'LIQUIDADO' AND nic.fecha_pago IS NULL)
          OR (nic.estado = 'PENDIENTE' AND nic.fecha_fin < CURRENT_DATE)
        )
      ORDER BY
        CASE WHEN nic.estado = 'LIQUIDADO' AND nic.fecha_pago IS NULL THEN 0 ELSE 1 END,
        nic.fecha_fin ASC,
        nic.created_at DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  const items = rows.rows.map((row) => ({
    activo: toBoolean(row.activo),
    cesantia_id: toNullableNumber(row.cesantia_id),
    contrato_id: toNullableNumber(row.contrato_id),
    created_at: toDateOnlyString(row.created_at),
    dias_liquidados: toNullableNumber(row.dias_liquidados) ?? 0,
    empresa_id: toNumber(row.empresa_id),
    estado: row.estado,
    fecha_fin: toDateOnlyString(row.fecha_fin),
    fecha_inicio: toDateOnlyString(row.fecha_inicio),
    fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
    id: toNumber(row.id),
    periodo: row.periodo,
    persona_documento: row.persona_documento,
    persona_id: toNumber(row.persona_id),
    persona_nombre: row.persona_nombre,
    porcentaje_interes: toNullableNumber(row.porcentaje_interes) ?? 0,
    tipo_alerta: row.tipo_alerta,
    valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
    valor_intereses: toNullableNumber(row.valor_intereses) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  await registerAuditEntry({
    accion: 'NOMINA_INTERESES_CESANTIAS_ALERTAS_VIEW',
    after: { total: items.length },
    descripcion: 'Consulta de alertas de intereses de cesantias',
    registro_id: '0',
    tabla: 'nomina_intereses_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildAlertasPagination(query.page, query.limit, total)
  };
};

export const loadInteresesCesantiasExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<InteresesCesantiasExpediente> => {
  const scope = buildTenantScope(tenant, 'nic');

  const rows = await dbQuery<InteresesCesantiaExpedienteRow>(
    `
      SELECT
        nic.activo,
        nic.cesantia_id::text AS cesantia_id,
        nic.contrato_id::text AS contrato_id,
        nic.created_at,
        nic.dias_liquidados,
        nic.empresa_id::text AS empresa_id,
        nic.estado,
        nic.fecha_fin,
        nic.fecha_inicio,
        nic.fecha_pago,
        nic.id::text AS id,
        nic.periodo,
        nic.porcentaje_interes,
        nic.valor_cesantias,
        nic.valor_intereses,
        nic.vinculacion_id::text AS vinculacion_id
      FROM nomina_intereses_cesantias nic
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nic.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(nic.activo, TRUE) = TRUE
      ORDER BY nic.fecha_fin DESC, nic.created_at DESC, nic.id DESC
    `,
    [...scope.params, personaId]
  );

  const items = rows.rows.map((row) => ({
    activo: toBoolean(row.activo),
    cesantia_id: toNullableNumber(row.cesantia_id),
    contrato_id: toNullableNumber(row.contrato_id),
    created_at: toDateOnlyString(row.created_at),
    dias_liquidados: toNullableNumber(row.dias_liquidados) ?? 0,
    empresa_id: toNumber(row.empresa_id),
    estado: row.estado,
    fecha_fin: toDateOnlyString(row.fecha_fin),
    fecha_inicio: toDateOnlyString(row.fecha_inicio),
    fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
    id: toNumber(row.id),
    periodo: row.periodo,
    porcentaje_interes: toNullableNumber(row.porcentaje_interes) ?? 0,
    valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
    valor_intereses: toNullableNumber(row.valor_intereses) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  const pagados = items.filter((item) => item.estado === 'PAGADO').length;
  const ultimoInteres = rows.rows[0]?.fecha_fin ?? null;

  return {
    indicadores: {
      intereses_cesantias_pagados: pagados,
      intereses_cesantias_total: items.length,
      ultimo_interes_cesantias: toDateOnlyStringNullable(ultimoInteres)
    },
    items
  };
};
