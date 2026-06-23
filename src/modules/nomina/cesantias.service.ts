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
  CesantiasAlertasQuery,
  CesantiasDashboardQuery,
  ConsignCesantiaInput,
  CreateCesantiaInput,
  ListCesantiasQuery,
  NominaCesantiaEstado,
  UpdateCesantiaInput
} from './cesantias.schemas';

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

interface CountRow extends QueryResultRow {
  total: number;
}

interface CesantiaRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaCesantiaEstado;
  fecha_consignacion: Date | string | null;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fondo_cesantias: string | null;
  id: string;
  periodo: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  salario_base: number | string;
  valor_cesantias: number | string;
  vinculacion_id: string;
}

interface CesantiaAlertRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaCesantiaEstado;
  fecha_consignacion: Date | string | null;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fondo_cesantias: string | null;
  id: string;
  periodo: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  salario_base: number | string;
  tipo_alerta: 'CESANTIAS_PENDIENTES_CONSIGNACION' | 'CESANTIAS_SIN_LIQUIDAR';
  valor_cesantias: number | string;
  vinculacion_id: string;
}

interface CesantiaExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaCesantiaEstado;
  fecha_consignacion: Date | string | null;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fondo_cesantias: string | null;
  id: string;
  periodo: string;
  salario_base: number | string;
  valor_cesantias: number | string;
  vinculacion_id: string;
}

export interface CesantiaItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaCesantiaEstado;
  fecha_consignacion: string | null;
  fecha_fin: string;
  fecha_inicio: string;
  fondo_cesantias: string | null;
  id: number;
  periodo: string;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  salario_base: number;
  valor_cesantias: number;
  vinculacion_id: number;
}

export interface CesantiasDashboard {
  cesantias_total: number;
  consignadas: number;
  liquidadas: number;
  pagadas: number;
  pendientes: number;
  valor_total_cesantias: number;
  valor_total_consignado: number;
  valor_total_pagado: number;
}

export interface CesantiaAlertItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaCesantiaEstado;
  fecha_consignacion: string | null;
  fecha_fin: string;
  fecha_inicio: string;
  fondo_cesantias: string | null;
  id: number;
  periodo: string;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  salario_base: number;
  tipo_alerta: 'CESANTIAS_PENDIENTES_CONSIGNACION' | 'CESANTIAS_SIN_LIQUIDAR';
  valor_cesantias: number;
  vinculacion_id: number;
}

export interface CesantiaExpedienteItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaCesantiaEstado;
  fecha_consignacion: string | null;
  fecha_fin: string;
  fecha_inicio: string;
  fondo_cesantias: string | null;
  id: number;
  periodo: string;
  salario_base: number;
  valor_cesantias: number;
  vinculacion_id: number;
}

export interface CesantiasExpedienteIndicadores {
  cesantias_consignadas: number;
  cesantias_total: number;
  ultima_cesantia: string | null;
}

export interface CesantiasExpediente {
  indicadores: CesantiasExpedienteIndicadores;
  items: CesantiaExpedienteItem[];
}

export interface PaginatedCesantias {
  items: CesantiaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedCesantiasAlertas {
  items: CesantiaAlertItem[];
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

const calculateCesantiaValue = (
  salarioBase: number,
  auxilioTransporte: number,
  diasLiquidados: number
): number => {
  return Number((((salarioBase + auxilioTransporte) * diasLiquidados) / 360).toFixed(2));
};

const buildPagination = (page: number, limit: number, total: number): PaginatedCesantias['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const buildAlertasPagination = (
  page: number,
  limit: number,
  total: number
): PaginatedCesantiasAlertas['pagination'] => ({
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

const buildTenantScope = (tenant: TenantAccessContext | undefined, alias = 'nc'): { params: unknown[]; sql: string } => {
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

const loadCesantiaOrThrow = async (
  cesantiaId: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<CesantiaRow> => {
  const scope = buildTenantScope(tenant, 'nc');
  const executor = client ?? dbPool;
  const result = await executor.query<CesantiaRow>(
    `
      SELECT
        nc.activo,
        nc.auxilio_transporte,
        nc.contrato_id::text AS contrato_id,
        nc.created_at,
        nc.dias_liquidados,
        nc.empresa_id::text AS empresa_id,
        nc.estado,
        nc.fecha_consignacion,
        nc.fecha_fin,
        nc.fecha_inicio,
        nc.fondo_cesantias,
        nc.id::text AS id,
        nc.periodo,
        p.numero_documento AS persona_documento,
        nc.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nc.salario_base,
        nc.valor_cesantias,
        nc.vinculacion_id::text AS vinculacion_id
      FROM nomina_cesantias nc
      INNER JOIN personas p ON p.id = nc.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nc.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, cesantiaId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Cesantia not found', 404, 'NOMINA_CESANTIAS_NOT_FOUND');
  }

  return row;
};

const mapCesantia = (row: CesantiaRow): CesantiaItem => ({
  activo: toBoolean(row.activo),
  auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
  contrato_id: toNullableNumber(row.contrato_id),
  created_at: toDateOnlyString(row.created_at),
  dias_liquidados: toNullableNumber(row.dias_liquidados) ?? 0,
  empresa_id: toNumber(row.empresa_id),
  estado: row.estado,
  fecha_consignacion: toDateOnlyStringNullable(row.fecha_consignacion),
  fecha_fin: toDateOnlyString(row.fecha_fin),
  fecha_inicio: toDateOnlyString(row.fecha_inicio),
  fondo_cesantias: row.fondo_cesantias,
  id: toNumber(row.id),
  periodo: row.periodo,
  persona_documento: row.persona_documento,
  persona_id: toNumber(row.persona_id),
  persona_nombre: row.persona_nombre,
  salario_base: toNullableNumber(row.salario_base) ?? 0,
  valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
  vinculacion_id: toNumber(row.vinculacion_id)
});

const appendCesantiaFilters = (
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
  alias = 'nc'
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

const assertCesantiaCoreRelations = async (
  input: {
    empresa_id: string;
    contrato_id: string;
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
    throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_CESANTIAS_VINCULACION_INVALIDA');
  }

  if (vinculacion.empresa_id !== input.empresa_id) {
    throw new AppError('Vinculacion does not belong to empresa', 400, 'NOMINA_CESANTIAS_EMPRESA_INVALIDA');
  }

  if (vinculacion.contrato_id !== input.contrato_id) {
    throw new AppError('Vinculacion does not belong to contrato', 400, 'NOMINA_CESANTIAS_CONTRATO_INVALIDO');
  }

  const contrato = await loadContractOrThrow(input.contrato_id, tenant, client);
  if (contrato.empresa_id !== input.empresa_id) {
    throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_CESANTIAS_EMPRESA_INVALIDA');
  }
};

const assertEstadoTransition = (
  currentEstado: NominaCesantiaEstado,
  nextEstado: NominaCesantiaEstado
): void => {
  if (nextEstado === currentEstado) {
    return;
  }

  if ((nextEstado === 'CONSIGNADA' || nextEstado === 'PAGADA') && currentEstado !== 'LIQUIDADA') {
    throw new AppError(
      'Only liquidated cesantias can be marked as consigned or paid',
      409,
      'NOMINA_CESANTIAS_ESTADO_INVALIDO'
    );
  }
};

export const listCesantias = async (
  query: ListCesantiasQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedCesantias> => {
  const scope = buildTenantScope(tenant, 'nc');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  appendCesantiaFilters(filters, params, query, 'nc');
  const whereSql = scopeWhereSql(scope, filters);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_cesantias nc
      INNER JOIN personas p ON p.id = nc.persona_id
      ${whereSql || 'WHERE 1 = 1'}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<CesantiaRow>(
    `
      SELECT
        nc.activo,
        nc.auxilio_transporte,
        nc.contrato_id::text AS contrato_id,
        nc.created_at,
        nc.dias_liquidados,
        nc.empresa_id::text AS empresa_id,
        nc.estado,
        nc.fecha_consignacion,
        nc.fecha_fin,
        nc.fecha_inicio,
        nc.fondo_cesantias,
        nc.id::text AS id,
        nc.periodo,
        p.numero_documento AS persona_documento,
        nc.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nc.salario_base,
        nc.valor_cesantias,
        nc.vinculacion_id::text AS vinculacion_id
      FROM nomina_cesantias nc
      INNER JOIN personas p ON p.id = nc.persona_id
      ${whereSql || 'WHERE 1 = 1'}
      ORDER BY nc.created_at DESC, nc.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapCesantia),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

export const createCesantia = async (
  input: CreateCesantiaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CesantiaItem> => {
  const result = await runInTransaction(async (client) => {
    const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
    const selectedContratoId = input.contrato_id ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError('Contrato is required for cesantias records', 400, 'NOMINA_CESANTIAS_CONTRATO_INVALIDO');
    }

    await assertCesantiaCoreRelations(
      {
        empresa_id: input.empresa_id,
        contrato_id: selectedContratoId,
        persona_id: input.persona_id,
        vinculacion_id: input.vinculacion_id
      },
      tenant,
      client
    );

    const diasLiquidados = Number(input.dias_liquidados ?? 0);
    if (diasLiquidados < 0 || diasLiquidados > 360) {
      throw new AppError('dias_liquidados must be between 0 and 360', 400, 'NOMINA_CESANTIAS_DIAS_INVALIDOS');
    }

    const salarioBase = Number(input.salario_base ?? 0);
    const auxilioTransporte = Number(input.auxilio_transporte ?? 0);
    const valorCesantias = calculateCesantiaValue(salarioBase, auxilioTransporte, diasLiquidados);
    const fechaConsignacion =
      input.fecha_consignacion ?? (input.estado === 'CONSIGNADA' ? getTodayDateOnly() : null);

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_cesantias (
          empresa_id,
          contrato_id,
          persona_id,
          vinculacion_id,
          periodo,
          fecha_inicio,
          fecha_fin,
          dias_liquidados,
          salario_base,
          auxilio_transporte,
          valor_cesantias,
          fondo_cesantias,
          fecha_consignacion,
          estado,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5,
          $6::date,
          $7::date,
          $8::numeric,
          $9::numeric,
          $10::numeric,
          $11::numeric,
          $12,
          $13::date,
          $14,
          $15
        )
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        selectedContratoId,
        input.persona_id,
        input.vinculacion_id,
        input.periodo,
        input.fecha_inicio,
        input.fecha_fin,
        diasLiquidados,
        salarioBase,
        auxilioTransporte,
        valorCesantias,
        input.fondo_cesantias,
        fechaConsignacion,
        input.estado,
        input.activo
      ]
    );

    const row = created.rows[0];
    if (!row) {
      throw new AppError('Failed to create cesantia record', 500, 'NOMINA_CESANTIAS_CREATE_FAILED');
    }

    return loadCesantiaOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_CREATE',
    after: mapCesantia(result),
    descripcion: 'Creacion de cesantias',
    registro_id: result.id,
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCesantia(result);
};

export const updateCesantia = async (
  id: number,
  input: UpdateCesantiaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CesantiaItem> => {
  const current = await loadCesantiaOrThrow(id, tenant);
  const nextEmpresaId = input.empresa_id ?? current.empresa_id;
  const nextPersonaId = input.persona_id ?? current.persona_id;
  const nextVinculacionId = input.vinculacion_id ?? current.vinculacion_id;
  const nextContratoId = input.contrato_id === undefined ? current.contrato_id : input.contrato_id;

  const result = await runInTransaction(async (client) => {
    const vinculacion = await ensureVinculacionExists(String(nextVinculacionId), client);
    const selectedContratoId = nextContratoId ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError('Contrato is required for cesantias records', 400, 'NOMINA_CESANTIAS_CONTRATO_INVALIDO');
    }

    await assertCesantiaCoreRelations(
      {
        empresa_id: String(nextEmpresaId),
        contrato_id: String(selectedContratoId),
        persona_id: String(nextPersonaId),
        vinculacion_id: String(nextVinculacionId)
      },
      tenant,
      client
    );

    const nextDiasLiquidados = input.dias_liquidados ?? (toNullableNumber(current.dias_liquidados) ?? 0);
    if (nextDiasLiquidados < 0 || nextDiasLiquidados > 360) {
      throw new AppError('dias_liquidados must be between 0 and 360', 400, 'NOMINA_CESANTIAS_DIAS_INVALIDOS');
    }

    const nextSalarioBase = input.salario_base ?? (toNullableNumber(current.salario_base) ?? 0);
    const nextAuxilioTransporte = input.auxilio_transporte ?? (toNullableNumber(current.auxilio_transporte) ?? 0);
    const nextValorCesantias = calculateCesantiaValue(nextSalarioBase, nextAuxilioTransporte, nextDiasLiquidados);
    const nextEstado = input.estado ?? current.estado;
    assertEstadoTransition(current.estado, nextEstado);

    const nextFechaConsignacion =
      input.fecha_consignacion !== undefined
        ? input.fecha_consignacion
        : nextEstado === 'CONSIGNADA'
          ? current.fecha_consignacion ?? getTodayDateOnly()
          : current.fecha_consignacion;

    const updated = await client.query<{ id: string }>(
      `
        UPDATE nomina_cesantias
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          persona_id = $4::bigint,
          vinculacion_id = $5::bigint,
          periodo = COALESCE($6, periodo),
          fecha_inicio = COALESCE($7::date, fecha_inicio),
          fecha_fin = COALESCE($8::date, fecha_fin),
          dias_liquidados = $9::numeric,
          salario_base = $10::numeric,
          auxilio_transporte = $11::numeric,
          valor_cesantias = $12::numeric,
          fondo_cesantias = $13,
          fecha_consignacion = $14::date,
          estado = $15,
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
        input.periodo ?? current.periodo,
        input.fecha_inicio ?? current.fecha_inicio,
        input.fecha_fin ?? current.fecha_fin,
        nextDiasLiquidados,
        nextSalarioBase,
        nextAuxilioTransporte,
        nextValorCesantias,
        input.fondo_cesantias !== undefined ? input.fondo_cesantias : current.fondo_cesantias,
        nextFechaConsignacion,
        nextEstado,
        input.activo ?? toBoolean(current.activo)
      ]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError('Cesantia record not found', 404, 'NOMINA_CESANTIAS_NOT_FOUND');
    }

    return loadCesantiaOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_UPDATE',
    after: mapCesantia(result),
    before: mapCesantia(current),
    descripcion: 'Actualizacion de cesantias',
    registro_id: result.id,
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCesantia(result);
};

export const consignCesantia = async (
  id: number,
  input: ConsignCesantiaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CesantiaItem> => {
  const current = await loadCesantiaOrThrow(id, tenant);

  if (current.estado !== 'LIQUIDADA' && current.estado !== 'CONSIGNADA') {
    throw new AppError('Only liquidated cesantias can be consigned', 409, 'NOMINA_CESANTIAS_ESTADO_INVALIDO');
  }

  const result = await runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_cesantias
        SET
          estado = 'CONSIGNADA',
          fondo_cesantias = COALESCE($2, fondo_cesantias),
          fecha_consignacion = COALESCE($3::date, fecha_consignacion, CURRENT_DATE)
        WHERE id = $1::bigint
      `,
      [id, input.fondo_cesantias ?? null, input.fecha_consignacion ?? null]
    );

    return loadCesantiaOrThrow(id, tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_CONSIGNADAS',
    after: mapCesantia(result),
    before: mapCesantia(current),
    descripcion: 'Consignacion de cesantias',
    registro_id: result.id,
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCesantia(result);
};

export const payCesantia = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CesantiaItem> => {
  const current = await loadCesantiaOrThrow(id, tenant);
  if (current.estado === 'PAGADA') {
    return mapCesantia(current);
  }

  if (current.estado !== 'LIQUIDADA') {
    throw new AppError('Only liquidated cesantias can be paid', 409, 'NOMINA_CESANTIAS_ESTADO_INVALIDO');
  }

  const result = await runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_cesantias
        SET estado = 'PAGADA'
        WHERE id = $1::bigint
      `,
      [id]
    );

    return loadCesantiaOrThrow(id, tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_PAGADAS',
    after: mapCesantia(result),
    before: mapCesantia(current),
    descripcion: 'Pago de cesantias',
    registro_id: result.id,
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCesantia(result);
};

export const deactivateCesantia = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CesantiaItem> => {
  const current = await loadCesantiaOrThrow(id, tenant);
  const result = await dbQuery<CesantiaRow>(
    `
      UPDATE nomina_cesantias
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        auxilio_transporte,
        contrato_id::text AS contrato_id,
        created_at,
        dias_liquidados,
        empresa_id::text AS empresa_id,
        estado,
        fecha_consignacion,
        fecha_fin,
        fecha_inicio,
        fondo_cesantias,
        id::text AS id,
        periodo,
        NULL::text AS persona_documento,
        persona_id::text AS persona_id,
        NULL::text AS persona_nombre,
        salario_base,
        valor_cesantias,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = result.rows[0] ?? current;

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_DEACTIVATE',
    after: mapCesantia(row),
    descripcion: 'Desactivacion de cesantias',
    registro_id: String(id),
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapCesantia(row);
};

export const getCesantiasDashboard = async (
  query: CesantiasDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CesantiasDashboard> => {
  const scope = buildTenantScope(tenant, 'nc');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nc.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nc.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);

  const result = await dbQuery<{
    cesantias_total: number;
    consignadas: number;
    liquidadas: number;
    pagadas: number;
    pendientes: number;
    valor_total_cesantias: number | string | null;
    valor_total_consignado: number | string | null;
    valor_total_pagado: number | string | null;
  }>(
    `
      SELECT
        COUNT(*)::int AS cesantias_total,
        COUNT(*) FILTER (WHERE nc.estado = 'PENDIENTE')::int AS pendientes,
        COUNT(*) FILTER (WHERE nc.estado = 'LIQUIDADA')::int AS liquidadas,
        COUNT(*) FILTER (WHERE nc.estado = 'CONSIGNADA')::int AS consignadas,
        COUNT(*) FILTER (WHERE nc.estado = 'PAGADA')::int AS pagadas,
        COALESCE(SUM(nc.valor_cesantias), 0) AS valor_total_cesantias,
        COALESCE(SUM(CASE WHEN nc.estado = 'CONSIGNADA' THEN nc.valor_cesantias ELSE 0 END), 0) AS valor_total_consignado,
        COALESCE(SUM(CASE WHEN nc.estado = 'PAGADA' THEN nc.valor_cesantias ELSE 0 END), 0) AS valor_total_pagado
      FROM nomina_cesantias nc
      ${whereSql || 'WHERE 1 = 1'}
      AND COALESCE(nc.activo, TRUE) = TRUE
    `,
    params
  );

  const row = result.rows[0];

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_DASHBOARD_VIEW',
    after: {
      cesantias_total: row?.cesantias_total ?? 0
    },
    descripcion: 'Consulta del dashboard de cesantias',
    registro_id: '0',
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    cesantias_total: row?.cesantias_total ?? 0,
    pendientes: row?.pendientes ?? 0,
    liquidadas: row?.liquidadas ?? 0,
    consignadas: row?.consignadas ?? 0,
    pagadas: row?.pagadas ?? 0,
    valor_total_cesantias: toNullableNumber(row?.valor_total_cesantias) ?? 0,
    valor_total_consignado: toNullableNumber(row?.valor_total_consignado) ?? 0,
    valor_total_pagado: toNullableNumber(row?.valor_total_pagado) ?? 0
  };
};

export const getCesantiasAlertas = async (
  query: CesantiasAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedCesantiasAlertas> => {
  const scope = buildTenantScope(tenant, 'nc');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  const countFilters: string[] = [];
  const countParams: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nc.empresa_id = $${params.length}::bigint`);
    countParams.push(query.empresa_id);
    countFilters.push(`nc.empresa_id = $${countParams.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nc.contrato_id = $${params.length}::bigint`);
    countParams.push(query.contrato_id);
    countFilters.push(`nc.contrato_id = $${countParams.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);
  const countWhereSql = scopeWhereSql(scope, countFilters);
  const alertCondition =
    `(nc.estado = 'LIQUIDADA' AND nc.fecha_consignacion IS NULL) OR (nc.estado = 'PENDIENTE' AND nc.fecha_fin < CURRENT_DATE)`;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_cesantias nc
      INNER JOIN personas p ON p.id = nc.persona_id
      ${countWhereSql || 'WHERE 1 = 1'}
        AND COALESCE(nc.activo, TRUE) = TRUE
        AND (${alertCondition})
    `,
    countParams
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const rows = await dbQuery<CesantiaAlertRow>(
    `
      SELECT
        nc.activo,
        nc.auxilio_transporte,
        nc.contrato_id::text AS contrato_id,
        nc.created_at,
        nc.dias_liquidados,
        nc.empresa_id::text AS empresa_id,
        nc.estado,
        nc.fecha_consignacion,
        nc.fecha_fin,
        nc.fecha_inicio,
        nc.fondo_cesantias,
        nc.id::text AS id,
        nc.periodo,
        p.numero_documento AS persona_documento,
        nc.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nc.salario_base,
        nc.valor_cesantias,
        nc.vinculacion_id::text AS vinculacion_id,
        CASE
          WHEN nc.estado = 'LIQUIDADA' AND nc.fecha_consignacion IS NULL THEN 'CESANTIAS_PENDIENTES_CONSIGNACION'
          ELSE 'CESANTIAS_SIN_LIQUIDAR'
        END AS tipo_alerta
      FROM nomina_cesantias nc
      INNER JOIN personas p ON p.id = nc.persona_id
      ${whereSql || 'WHERE 1 = 1'}
        AND COALESCE(nc.activo, TRUE) = TRUE
        AND (
          (nc.estado = 'LIQUIDADA' AND nc.fecha_consignacion IS NULL)
          OR (nc.estado = 'PENDIENTE' AND nc.fecha_fin < CURRENT_DATE)
        )
      ORDER BY
        CASE WHEN nc.estado = 'LIQUIDADA' AND nc.fecha_consignacion IS NULL THEN 0 ELSE 1 END,
        nc.fecha_fin ASC,
        nc.created_at DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  const items = rows.rows.map((row) => ({
    activo: toBoolean(row.activo),
    auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
    contrato_id: toNullableNumber(row.contrato_id),
    created_at: toDateOnlyString(row.created_at),
    dias_liquidados: toNullableNumber(row.dias_liquidados) ?? 0,
    empresa_id: toNumber(row.empresa_id),
    estado: row.estado,
    fecha_consignacion: toDateOnlyStringNullable(row.fecha_consignacion),
    fecha_fin: toDateOnlyString(row.fecha_fin),
    fecha_inicio: toDateOnlyString(row.fecha_inicio),
    fondo_cesantias: row.fondo_cesantias,
    id: toNumber(row.id),
    periodo: row.periodo,
    persona_documento: row.persona_documento,
    persona_id: toNumber(row.persona_id),
    persona_nombre: row.persona_nombre,
    salario_base: toNullableNumber(row.salario_base) ?? 0,
    tipo_alerta: row.tipo_alerta,
    valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  await registerAuditEntry({
    accion: 'NOMINA_CESANTIAS_ALERTAS_VIEW',
    after: { total: items.length },
    descripcion: 'Consulta de alertas de cesantias',
    registro_id: '0',
    tabla: 'nomina_cesantias',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildAlertasPagination(query.page, query.limit, total)
  };
};

export const loadCesantiasExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<CesantiasExpediente> => {
  const scope = buildTenantScope(tenant, 'nc');

  const rows = await dbQuery<CesantiaExpedienteRow>(
    `
      SELECT
        nc.activo,
        nc.auxilio_transporte,
        nc.contrato_id::text AS contrato_id,
        nc.created_at,
        nc.dias_liquidados,
        nc.empresa_id::text AS empresa_id,
        nc.estado,
        nc.fecha_consignacion,
        nc.fecha_fin,
        nc.fecha_inicio,
        nc.fondo_cesantias,
        nc.id::text AS id,
        nc.periodo,
        nc.salario_base,
        nc.valor_cesantias,
        nc.vinculacion_id::text AS vinculacion_id
      FROM nomina_cesantias nc
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nc.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(nc.activo, TRUE) = TRUE
      ORDER BY nc.fecha_fin DESC, nc.created_at DESC, nc.id DESC
    `,
    [...scope.params, personaId]
  );

  const items = rows.rows.map((row) => ({
    activo: toBoolean(row.activo),
    auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
    contrato_id: toNullableNumber(row.contrato_id),
    created_at: toDateOnlyString(row.created_at),
    dias_liquidados: toNullableNumber(row.dias_liquidados) ?? 0,
    empresa_id: toNumber(row.empresa_id),
    estado: row.estado,
    fecha_consignacion: toDateOnlyStringNullable(row.fecha_consignacion),
    fecha_fin: toDateOnlyString(row.fecha_fin),
    fecha_inicio: toDateOnlyString(row.fecha_inicio),
    fondo_cesantias: row.fondo_cesantias,
    id: toNumber(row.id),
    periodo: row.periodo,
    salario_base: toNullableNumber(row.salario_base) ?? 0,
    valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  const consignadas = items.filter((item) => item.estado === 'CONSIGNADA').length;
  const ultimaCesantia = rows.rows[0]?.fecha_fin ?? null;

  return {
    indicadores: {
      cesantias_total: items.length,
      cesantias_consignadas: consignadas,
      ultima_cesantia: toDateOnlyStringNullable(ultimaCesantia)
    },
    items
  };
};
