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
  CreateLiquidacionFinalInput,
  ListLiquidacionesFinalesQuery,
  LiquidacionesFinalesAlertasQuery,
  LiquidacionesFinalesDashboardQuery,
  NominaLiquidacionFinalEstado,
  PagarLiquidacionFinalInput,
  UpdateLiquidacionFinalInput
} from './liquidaciones-finales.schemas';

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

interface CountRow extends QueryResultRow {
  total: number;
}

interface LiquidacionFinalRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  deducciones: number | string;
  dias_pendientes_pago: number | string;
  dias_trabajados: number | string;
  dias_vacaciones_pendientes: number | string;
  empresa_id: string;
  estado: NominaLiquidacionFinalEstado;
  fecha_inicio_vinculacion: Date | string;
  fecha_pago: Date | string | null;
  fecha_retiro: Date | string;
  id: string;
  indemnizacion: number | string;
  motivo_retiro: string | null;
  neto_pagar: number | string;
  observacion: string | null;
  otros_devengos: number | string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  salario_base: number | string;
  total_deducciones: number | string;
  total_devengado: number | string;
  valor_cesantias: number | string;
  valor_intereses_cesantias: number | string;
  valor_prima: number | string;
  valor_salario_pendiente: number | string;
  valor_vacaciones: number | string;
  vinculacion_id: string;
}

interface LiquidacionFinalAlertRow extends LiquidacionFinalRow {
  tipo_alerta: 'LIQUIDACION_FINAL_BORRADOR' | 'LIQUIDACION_FINAL_PENDIENTE_PAGO';
}

interface LiquidacionFinalExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  created_at: Date | string;
  estado: NominaLiquidacionFinalEstado;
  fecha_inicio_vinculacion: Date | string;
  fecha_pago: Date | string | null;
  fecha_retiro: Date | string;
  id: string;
  neto_pagar: number | string;
  total_devengado: number | string;
  vinculacion_id: string;
}

export interface LiquidacionFinalItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  deducciones: number;
  dias_pendientes_pago: number;
  dias_trabajados: number;
  dias_vacaciones_pendientes: number;
  empresa_id: number;
  estado: NominaLiquidacionFinalEstado;
  fecha_inicio_vinculacion: string;
  fecha_pago: string | null;
  fecha_retiro: string;
  id: number;
  indemnizacion: number;
  motivo_retiro: string | null;
  neto_pagar: number;
  observacion: string | null;
  otros_devengos: number;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  salario_base: number;
  total_deducciones: number;
  total_devengado: number;
  valor_cesantias: number;
  valor_intereses_cesantias: number;
  valor_prima: number;
  valor_salario_pendiente: number;
  valor_vacaciones: number;
  vinculacion_id: number;
}

export interface LiquidacionFinalAlertItem extends LiquidacionFinalItem {
  tipo_alerta: 'LIQUIDACION_FINAL_BORRADOR' | 'LIQUIDACION_FINAL_PENDIENTE_PAGO';
}

export interface LiquidacionFinalExpedienteItem {
  activo: boolean;
  contrato_id: number | null;
  created_at: string;
  estado: NominaLiquidacionFinalEstado;
  fecha_inicio_vinculacion: string;
  fecha_pago: string | null;
  fecha_retiro: string;
  id: number;
  neto_pagar: number;
  total_devengado: number;
  vinculacion_id: number;
}

export interface LiquidacionesFinalesDashboard {
  anuladas: number;
  borradores: number;
  liquidaciones_total: number;
  liquidadas: number;
  pagadas: number;
  promedio_liquidacion: number;
  valor_total_liquidaciones: number;
  valor_total_pagado: number;
}

export interface LiquidacionesFinalesExpedienteIndicadores {
  liquidaciones_finales_pagadas: number;
  liquidaciones_finales_total: number;
  ultima_liquidacion_final: string | null;
}

export interface LiquidacionesFinalesExpediente {
  indicadores: LiquidacionesFinalesExpedienteIndicadores;
  items: LiquidacionFinalExpedienteItem[];
}

export interface PaginatedLiquidacionesFinales {
  items: LiquidacionFinalItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedLiquidacionesFinalesAlertas {
  items: LiquidacionFinalAlertItem[];
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

const round2 = (value: number): number => Number(value.toFixed(2));

const calculateValorSalarioPendiente = (salarioBase: number, diasPendientesPago: number): number =>
  round2((salarioBase / 30) * diasPendientesPago);

const calculateValorVacaciones = (
  salarioBase: number,
  diasTrabajados: number,
  diasVacacionesPendientes: number
): number => {
  if (diasVacacionesPendientes > 0) {
    return round2((salarioBase / 30) * diasVacacionesPendientes);
  }

  return round2((salarioBase / 720) * diasTrabajados);
};

const calculateValorPrimaOCesantias = (
  salarioBase: number,
  auxilioTransporte: number,
  diasTrabajados: number
): number => round2(((salarioBase + auxilioTransporte) * diasTrabajados) / 360);

const calculateValorInteresesCesantias = (valorCesantias: number, diasTrabajados: number): number =>
  round2((valorCesantias * 0.12 * diasTrabajados) / 360);

const buildPagination = (
  page: number,
  limit: number,
  total: number
): PaginatedLiquidacionesFinales['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const buildAlertasPagination = (
  page: number,
  limit: number,
  total: number
): PaginatedLiquidacionesFinalesAlertas['pagination'] => ({
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

const buildTenantScope = (
  tenant: TenantAccessContext | undefined,
  alias = 'nlf'
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

const assertLiquidacionFinalCoreRelations = async (
  input: {
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
      'NOMINA_LIQUIDACION_FINAL_VINCULACION_INVALIDA'
    );
  }

  if (vinculacion.empresa_id !== input.empresa_id) {
    throw new AppError('Vinculacion does not belong to empresa', 400, 'NOMINA_LIQUIDACION_FINAL_EMPRESA_INVALIDA');
  }

  if (vinculacion.contrato_id !== input.contrato_id) {
    throw new AppError(
      'Vinculacion does not belong to contrato',
      400,
      'NOMINA_LIQUIDACION_FINAL_CONTRATO_INVALIDO'
    );
  }

  const contrato = await loadContractOrThrow(input.contrato_id, tenant, client);
  if (contrato.empresa_id !== input.empresa_id) {
    throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_LIQUIDACION_FINAL_EMPRESA_INVALIDA');
  }
};

const tryCerrarVinculacion = async (
  vinculacionId: string,
  fechaRetiro: string,
  client: PoolClient
): Promise<void> => {
  const savepointName = `cierre_vinculacion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await client.query(`SAVEPOINT ${savepointName}`);
    await client.query(
      `
        UPDATE vinculaciones
        SET fecha_fin = $2::date, estado_vinculacion = 'RETIRADA'
        WHERE id = $1::bigint
      `,
      [vinculacionId, fechaRetiro]
    );
    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      await client.query(`RELEASE SAVEPOINT ${savepointName}`);
    } catch (rollbackError) {
      console.error('Failed to rollback cierre_vinculacion savepoint', rollbackError);
    }

    console.error('No se pudo cerrar la vinculacion automaticamente al pagar la liquidacion final', {
      vinculacionId,
      error
    });
  }
};

const loadLiquidacionFinalOrThrow = async (
  id: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<LiquidacionFinalRow> => {
  const scope = buildTenantScope(tenant, 'nlf');
  const executor = client ?? dbPool;
  const result = await executor.query<LiquidacionFinalRow>(
    `
      SELECT
        nlf.activo,
        nlf.auxilio_transporte,
        nlf.contrato_id::text AS contrato_id,
        nlf.created_at,
        nlf.deducciones,
        nlf.dias_pendientes_pago,
        nlf.dias_trabajados,
        nlf.dias_vacaciones_pendientes,
        nlf.empresa_id::text AS empresa_id,
        nlf.estado,
        nlf.fecha_inicio_vinculacion,
        nlf.fecha_pago,
        nlf.fecha_retiro,
        nlf.id::text AS id,
        nlf.indemnizacion,
        nlf.motivo_retiro,
        nlf.neto_pagar,
        nlf.observacion,
        nlf.otros_devengos,
        p.numero_documento AS persona_documento,
        nlf.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nlf.salario_base,
        nlf.total_deducciones,
        nlf.total_devengado,
        nlf.valor_cesantias,
        nlf.valor_intereses_cesantias,
        nlf.valor_prima,
        nlf.valor_salario_pendiente,
        nlf.valor_vacaciones,
        nlf.vinculacion_id::text AS vinculacion_id
      FROM nomina_liquidaciones_finales nlf
      INNER JOIN personas p ON p.id = nlf.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nlf.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, id]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Liquidacion final record not found', 404, 'NOMINA_LIQUIDACION_FINAL_NOT_FOUND');
  }

  return row;
};

const mapLiquidacionFinal = (row: LiquidacionFinalRow): LiquidacionFinalItem => ({
  activo: toBoolean(row.activo),
  auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
  contrato_id: toNullableNumber(row.contrato_id),
  created_at: toDateOnlyString(row.created_at),
  deducciones: toNullableNumber(row.deducciones) ?? 0,
  dias_pendientes_pago: toNullableNumber(row.dias_pendientes_pago) ?? 0,
  dias_trabajados: toNullableNumber(row.dias_trabajados) ?? 0,
  dias_vacaciones_pendientes: toNullableNumber(row.dias_vacaciones_pendientes) ?? 0,
  empresa_id: toNumber(row.empresa_id),
  estado: row.estado,
  fecha_inicio_vinculacion: toDateOnlyString(row.fecha_inicio_vinculacion),
  fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
  fecha_retiro: toDateOnlyString(row.fecha_retiro),
  id: toNumber(row.id),
  indemnizacion: toNullableNumber(row.indemnizacion) ?? 0,
  motivo_retiro: row.motivo_retiro,
  neto_pagar: toNullableNumber(row.neto_pagar) ?? 0,
  observacion: row.observacion,
  otros_devengos: toNullableNumber(row.otros_devengos) ?? 0,
  persona_documento: row.persona_documento,
  persona_id: toNumber(row.persona_id),
  persona_nombre: row.persona_nombre,
  salario_base: toNullableNumber(row.salario_base) ?? 0,
  total_deducciones: toNullableNumber(row.total_deducciones) ?? 0,
  total_devengado: toNullableNumber(row.total_devengado) ?? 0,
  valor_cesantias: toNullableNumber(row.valor_cesantias) ?? 0,
  valor_intereses_cesantias: toNullableNumber(row.valor_intereses_cesantias) ?? 0,
  valor_prima: toNullableNumber(row.valor_prima) ?? 0,
  valor_salario_pendiente: toNullableNumber(row.valor_salario_pendiente) ?? 0,
  valor_vacaciones: toNullableNumber(row.valor_vacaciones) ?? 0,
  vinculacion_id: toNumber(row.vinculacion_id)
});

const appendLiquidacionFinalFilters = (
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
  alias = 'nlf'
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

export const listLiquidacionesFinales = async (
  query: ListLiquidacionesFinalesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedLiquidacionesFinales> => {
  const scope = buildTenantScope(tenant, 'nlf');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  appendLiquidacionFinalFilters(filters, params, query, 'nlf');
  const whereSql = scopeWhereSql(scope, filters);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_liquidaciones_finales nlf
      INNER JOIN personas p ON p.id = nlf.persona_id
      ${whereSql || 'WHERE 1 = 1'}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<LiquidacionFinalRow>(
    `
      SELECT
        nlf.activo,
        nlf.auxilio_transporte,
        nlf.contrato_id::text AS contrato_id,
        nlf.created_at,
        nlf.deducciones,
        nlf.dias_pendientes_pago,
        nlf.dias_trabajados,
        nlf.dias_vacaciones_pendientes,
        nlf.empresa_id::text AS empresa_id,
        nlf.estado,
        nlf.fecha_inicio_vinculacion,
        nlf.fecha_pago,
        nlf.fecha_retiro,
        nlf.id::text AS id,
        nlf.indemnizacion,
        nlf.motivo_retiro,
        nlf.neto_pagar,
        nlf.observacion,
        nlf.otros_devengos,
        p.numero_documento AS persona_documento,
        nlf.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nlf.salario_base,
        nlf.total_deducciones,
        nlf.total_devengado,
        nlf.valor_cesantias,
        nlf.valor_intereses_cesantias,
        nlf.valor_prima,
        nlf.valor_salario_pendiente,
        nlf.valor_vacaciones,
        nlf.vinculacion_id::text AS vinculacion_id
      FROM nomina_liquidaciones_finales nlf
      INNER JOIN personas p ON p.id = nlf.persona_id
      ${whereSql || 'WHERE 1 = 1'}
      ORDER BY nlf.created_at DESC, nlf.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapLiquidacionFinal),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

const computeTotales = (input: {
  auxilioTransporte: number;
  diasPendientesPago: number;
  diasTrabajados: number;
  diasVacacionesPendientes: number;
  deducciones: number;
  indemnizacion: number;
  otrosDevengos: number;
  salarioBase: number;
}): {
  netoPagar: number;
  totalDeducciones: number;
  totalDevengado: number;
  valorCesantias: number;
  valorInteresesCesantias: number;
  valorPrima: number;
  valorSalarioPendiente: number;
  valorVacaciones: number;
} => {
  const valorSalarioPendiente = calculateValorSalarioPendiente(input.salarioBase, input.diasPendientesPago);
  const valorVacaciones = calculateValorVacaciones(
    input.salarioBase,
    input.diasTrabajados,
    input.diasVacacionesPendientes
  );
  const valorPrima = calculateValorPrimaOCesantias(input.salarioBase, input.auxilioTransporte, input.diasTrabajados);
  const valorCesantias = calculateValorPrimaOCesantias(
    input.salarioBase,
    input.auxilioTransporte,
    input.diasTrabajados
  );
  const valorInteresesCesantias = calculateValorInteresesCesantias(valorCesantias, input.diasTrabajados);
  const totalDevengado = round2(
    valorSalarioPendiente +
      valorVacaciones +
      valorPrima +
      valorCesantias +
      valorInteresesCesantias +
      input.otrosDevengos +
      input.indemnizacion
  );
  const totalDeducciones = round2(input.deducciones);
  const netoPagar = round2(totalDevengado - totalDeducciones);

  return {
    valorSalarioPendiente,
    valorVacaciones,
    valorPrima,
    valorCesantias,
    valorInteresesCesantias,
    totalDevengado,
    totalDeducciones,
    netoPagar
  };
};

export const createLiquidacionFinal = async (
  input: CreateLiquidacionFinalInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<LiquidacionFinalItem> => {
  const result = await runInTransaction(async (client) => {
    const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
    const selectedContratoId = input.contrato_id ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError(
        'Contrato is required for liquidacion final records',
        400,
        'NOMINA_LIQUIDACION_FINAL_CONTRATO_INVALIDO'
      );
    }

    await assertLiquidacionFinalCoreRelations(
      {
        contrato_id: selectedContratoId,
        empresa_id: input.empresa_id,
        persona_id: input.persona_id,
        vinculacion_id: input.vinculacion_id
      },
      tenant,
      client
    );

    const diasTrabajados = Number(input.dias_trabajados ?? 0);
    if (diasTrabajados < 0 || diasTrabajados > 1080) {
      throw new AppError('dias_trabajados must be between 0 and 1080', 400, 'NOMINA_LIQUIDACION_FINAL_DIAS_INVALIDOS');
    }

    const diasPendientesPago = Number(input.dias_pendientes_pago ?? 0);
    if (diasPendientesPago < 0) {
      throw new AppError(
        'dias_pendientes_pago must be greater than or equal to 0',
        400,
        'NOMINA_LIQUIDACION_FINAL_DIAS_INVALIDOS'
      );
    }

    const diasVacacionesPendientes = Number(input.dias_vacaciones_pendientes ?? 0);
    if (diasVacacionesPendientes < 0) {
      throw new AppError(
        'dias_vacaciones_pendientes must be greater than or equal to 0',
        400,
        'NOMINA_LIQUIDACION_FINAL_DIAS_INVALIDOS'
      );
    }

    const salarioBase = Number(input.salario_base ?? 0);
    const auxilioTransporte = Number(input.auxilio_transporte ?? 0);
    const otrosDevengos = Number(input.otros_devengos ?? 0);
    const deducciones = Number(input.deducciones ?? 0);
    const indemnizacion = Number(input.indemnizacion ?? 0);

    const totales = computeTotales({
      salarioBase,
      auxilioTransporte,
      diasPendientesPago,
      diasTrabajados,
      diasVacacionesPendientes,
      otrosDevengos,
      deducciones,
      indemnizacion
    });

    if (totales.netoPagar < 0) {
      throw new AppError(
        'neto_pagar must be greater than or equal to 0',
        400,
        'NOMINA_LIQUIDACION_FINAL_NETO_INVALIDO'
      );
    }

    const fechaPago = input.fecha_pago ?? (input.estado === 'PAGADA' ? getTodayDateOnly() : null);

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_liquidaciones_finales (
          empresa_id,
          contrato_id,
          persona_id,
          vinculacion_id,
          fecha_inicio_vinculacion,
          fecha_retiro,
          motivo_retiro,
          dias_trabajados,
          dias_pendientes_pago,
          dias_vacaciones_pendientes,
          salario_base,
          auxilio_transporte,
          valor_salario_pendiente,
          valor_vacaciones,
          valor_prima,
          valor_cesantias,
          valor_intereses_cesantias,
          otros_devengos,
          deducciones,
          indemnizacion,
          total_devengado,
          total_deducciones,
          neto_pagar,
          estado,
          fecha_pago,
          observacion,
          activo
        )
        VALUES (
          $1::bigint, $2::bigint, $3::bigint, $4::bigint,
          $5::date, $6::date, $7,
          $8::numeric, $9::numeric, $10::numeric,
          $11::numeric, $12::numeric,
          $13::numeric, $14::numeric, $15::numeric, $16::numeric, $17::numeric,
          $18::numeric, $19::numeric, $20::numeric,
          $21::numeric, $22::numeric, $23::numeric,
          $24, $25::date, $26, $27
        )
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        selectedContratoId,
        input.persona_id,
        input.vinculacion_id,
        input.fecha_inicio_vinculacion,
        input.fecha_retiro,
        input.motivo_retiro,
        diasTrabajados,
        diasPendientesPago,
        diasVacacionesPendientes,
        salarioBase,
        auxilioTransporte,
        totales.valorSalarioPendiente,
        totales.valorVacaciones,
        totales.valorPrima,
        totales.valorCesantias,
        totales.valorInteresesCesantias,
        otrosDevengos,
        deducciones,
        indemnizacion,
        totales.totalDevengado,
        totales.totalDeducciones,
        totales.netoPagar,
        input.estado,
        fechaPago,
        input.observacion,
        input.activo
      ]
    );

    const row = created.rows[0];
    if (!row) {
      throw new AppError('Failed to create liquidacion final record', 500, 'NOMINA_LIQUIDACION_FINAL_CREATE_FAILED');
    }

    return loadLiquidacionFinalOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_CREATE',
    after: mapLiquidacionFinal(result),
    descripcion: 'Creacion de liquidacion final laboral',
    registro_id: result.id,
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapLiquidacionFinal(result);
};

export const updateLiquidacionFinal = async (
  id: number,
  input: UpdateLiquidacionFinalInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<LiquidacionFinalItem> => {
  const current = await loadLiquidacionFinalOrThrow(id, tenant);
  const nextEmpresaId = input.empresa_id ?? current.empresa_id;
  const nextPersonaId = input.persona_id ?? current.persona_id;
  const nextVinculacionId = input.vinculacion_id ?? current.vinculacion_id;
  const nextContratoId = input.contrato_id === undefined ? current.contrato_id : input.contrato_id;

  const result = await runInTransaction(async (client) => {
    const vinculacion = await ensureVinculacionExists(String(nextVinculacionId), client);
    const selectedContratoId = nextContratoId ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError(
        'Contrato is required for liquidacion final records',
        400,
        'NOMINA_LIQUIDACION_FINAL_CONTRATO_INVALIDO'
      );
    }

    await assertLiquidacionFinalCoreRelations(
      {
        contrato_id: String(selectedContratoId),
        empresa_id: String(nextEmpresaId),
        persona_id: String(nextPersonaId),
        vinculacion_id: String(nextVinculacionId)
      },
      tenant,
      client
    );

    const nextFechaInicioVinculacion = input.fecha_inicio_vinculacion ?? toDateOnlyString(current.fecha_inicio_vinculacion);
    const nextFechaRetiro = input.fecha_retiro ?? toDateOnlyString(current.fecha_retiro);
    if (nextFechaRetiro < nextFechaInicioVinculacion) {
      throw new AppError(
        'fecha_retiro must be greater than or equal to fecha_inicio_vinculacion',
        400,
        'NOMINA_LIQUIDACION_FINAL_FECHAS_INVALIDAS'
      );
    }

    const nextDiasTrabajados = input.dias_trabajados ?? (toNullableNumber(current.dias_trabajados) ?? 0);
    if (nextDiasTrabajados < 0 || nextDiasTrabajados > 1080) {
      throw new AppError('dias_trabajados must be between 0 and 1080', 400, 'NOMINA_LIQUIDACION_FINAL_DIAS_INVALIDOS');
    }

    const nextDiasPendientesPago = input.dias_pendientes_pago ?? (toNullableNumber(current.dias_pendientes_pago) ?? 0);
    if (nextDiasPendientesPago < 0) {
      throw new AppError(
        'dias_pendientes_pago must be greater than or equal to 0',
        400,
        'NOMINA_LIQUIDACION_FINAL_DIAS_INVALIDOS'
      );
    }

    const nextDiasVacacionesPendientes =
      input.dias_vacaciones_pendientes ?? (toNullableNumber(current.dias_vacaciones_pendientes) ?? 0);
    if (nextDiasVacacionesPendientes < 0) {
      throw new AppError(
        'dias_vacaciones_pendientes must be greater than or equal to 0',
        400,
        'NOMINA_LIQUIDACION_FINAL_DIAS_INVALIDOS'
      );
    }

    const nextSalarioBase = input.salario_base ?? (toNullableNumber(current.salario_base) ?? 0);
    const nextAuxilioTransporte = input.auxilio_transporte ?? (toNullableNumber(current.auxilio_transporte) ?? 0);
    const nextOtrosDevengos = input.otros_devengos ?? (toNullableNumber(current.otros_devengos) ?? 0);
    const nextDeducciones = input.deducciones ?? (toNullableNumber(current.deducciones) ?? 0);
    const nextIndemnizacion = input.indemnizacion ?? (toNullableNumber(current.indemnizacion) ?? 0);

    const totales = computeTotales({
      salarioBase: nextSalarioBase,
      auxilioTransporte: nextAuxilioTransporte,
      diasPendientesPago: nextDiasPendientesPago,
      diasTrabajados: nextDiasTrabajados,
      diasVacacionesPendientes: nextDiasVacacionesPendientes,
      otrosDevengos: nextOtrosDevengos,
      deducciones: nextDeducciones,
      indemnizacion: nextIndemnizacion
    });

    if (totales.netoPagar < 0) {
      throw new AppError(
        'neto_pagar must be greater than or equal to 0',
        400,
        'NOMINA_LIQUIDACION_FINAL_NETO_INVALIDO'
      );
    }

    const nextEstado = input.estado ?? current.estado;
    const nextFechaPago =
      input.fecha_pago !== undefined
        ? input.fecha_pago
        : nextEstado === 'PAGADA'
          ? current.fecha_pago ?? getTodayDateOnly()
          : current.fecha_pago;
    const nextMotivoRetiro = input.motivo_retiro !== undefined ? input.motivo_retiro : current.motivo_retiro;
    const nextObservacion = input.observacion !== undefined ? input.observacion : current.observacion;

    const updated = await client.query<{ id: string }>(
      `
        UPDATE nomina_liquidaciones_finales
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          persona_id = $4::bigint,
          vinculacion_id = $5::bigint,
          fecha_inicio_vinculacion = $6::date,
          fecha_retiro = $7::date,
          motivo_retiro = $8,
          dias_trabajados = $9::numeric,
          dias_pendientes_pago = $10::numeric,
          dias_vacaciones_pendientes = $11::numeric,
          salario_base = $12::numeric,
          auxilio_transporte = $13::numeric,
          valor_salario_pendiente = $14::numeric,
          valor_vacaciones = $15::numeric,
          valor_prima = $16::numeric,
          valor_cesantias = $17::numeric,
          valor_intereses_cesantias = $18::numeric,
          otros_devengos = $19::numeric,
          deducciones = $20::numeric,
          indemnizacion = $21::numeric,
          total_devengado = $22::numeric,
          total_deducciones = $23::numeric,
          neto_pagar = $24::numeric,
          estado = $25,
          fecha_pago = $26::date,
          observacion = $27,
          activo = COALESCE($28, activo)
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        id,
        nextEmpresaId,
        selectedContratoId,
        nextPersonaId,
        nextVinculacionId,
        nextFechaInicioVinculacion,
        nextFechaRetiro,
        nextMotivoRetiro,
        nextDiasTrabajados,
        nextDiasPendientesPago,
        nextDiasVacacionesPendientes,
        nextSalarioBase,
        nextAuxilioTransporte,
        totales.valorSalarioPendiente,
        totales.valorVacaciones,
        totales.valorPrima,
        totales.valorCesantias,
        totales.valorInteresesCesantias,
        nextOtrosDevengos,
        nextDeducciones,
        nextIndemnizacion,
        totales.totalDevengado,
        totales.totalDeducciones,
        totales.netoPagar,
        nextEstado,
        nextFechaPago,
        nextObservacion,
        input.activo ?? toBoolean(current.activo)
      ]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError('Liquidacion final record not found', 404, 'NOMINA_LIQUIDACION_FINAL_NOT_FOUND');
    }

    return loadLiquidacionFinalOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_UPDATE',
    after: mapLiquidacionFinal(result),
    before: mapLiquidacionFinal(current),
    descripcion: 'Actualizacion de liquidacion final laboral',
    registro_id: result.id,
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapLiquidacionFinal(result);
};

export const liquidarLiquidacionFinal = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<LiquidacionFinalItem> => {
  const current = await loadLiquidacionFinalOrThrow(id, tenant);
  if (current.estado === 'LIQUIDADA' || current.estado === 'PAGADA') {
    return mapLiquidacionFinal(current);
  }

  if (current.estado !== 'BORRADOR') {
    throw new AppError(
      'Only draft liquidacion final records can be liquidated',
      409,
      'NOMINA_LIQUIDACION_FINAL_ESTADO_INVALIDO'
    );
  }

  const result = await runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_liquidaciones_finales
        SET estado = 'LIQUIDADA'
        WHERE id = $1::bigint
      `,
      [id]
    );

    return loadLiquidacionFinalOrThrow(id, tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_LIQUIDADA',
    after: mapLiquidacionFinal(result),
    before: mapLiquidacionFinal(current),
    descripcion: 'Liquidacion de liquidacion final laboral',
    registro_id: result.id,
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapLiquidacionFinal(result);
};

export const payLiquidacionFinal = async (
  id: number,
  input: PagarLiquidacionFinalInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<LiquidacionFinalItem> => {
  const current = await loadLiquidacionFinalOrThrow(id, tenant);
  if (current.estado === 'PAGADA') {
    return mapLiquidacionFinal(current);
  }

  if (current.estado !== 'LIQUIDADA') {
    throw new AppError(
      'Only liquidated liquidacion final records can be paid',
      409,
      'NOMINA_LIQUIDACION_FINAL_ESTADO_INVALIDO'
    );
  }

  const result = await runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_liquidaciones_finales
        SET estado = 'PAGADA', fecha_pago = COALESCE($2::date, fecha_pago, CURRENT_DATE)
        WHERE id = $1::bigint
      `,
      [id, input.fecha_pago ?? null]
    );

    if (input.cerrar_vinculacion) {
      await tryCerrarVinculacion(current.vinculacion_id, toDateOnlyString(current.fecha_retiro), client);
    }

    return loadLiquidacionFinalOrThrow(id, tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_PAGADA',
    after: mapLiquidacionFinal(result),
    before: mapLiquidacionFinal(current),
    descripcion: 'Pago de liquidacion final laboral',
    registro_id: result.id,
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapLiquidacionFinal(result);
};

export const deactivateLiquidacionFinal = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<LiquidacionFinalItem> => {
  const current = await loadLiquidacionFinalOrThrow(id, tenant);
  const result = await dbQuery<LiquidacionFinalRow>(
    `
      UPDATE nomina_liquidaciones_finales
      SET activo = FALSE
      WHERE id = $1::bigint
      RETURNING
        activo,
        auxilio_transporte,
        contrato_id::text AS contrato_id,
        created_at,
        deducciones,
        dias_pendientes_pago,
        dias_trabajados,
        dias_vacaciones_pendientes,
        empresa_id::text AS empresa_id,
        estado,
        fecha_inicio_vinculacion,
        fecha_pago,
        fecha_retiro,
        id::text AS id,
        indemnizacion,
        motivo_retiro,
        neto_pagar,
        observacion,
        otros_devengos,
        NULL::text AS persona_documento,
        persona_id::text AS persona_id,
        NULL::text AS persona_nombre,
        salario_base,
        total_deducciones,
        total_devengado,
        valor_cesantias,
        valor_intereses_cesantias,
        valor_prima,
        valor_salario_pendiente,
        valor_vacaciones,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = result.rows[0] ?? current;

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_DEACTIVATE',
    after: mapLiquidacionFinal(row),
    descripcion: 'Desactivacion de liquidacion final laboral',
    registro_id: String(id),
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapLiquidacionFinal(row);
};

export const getLiquidacionesFinalesDashboard = async (
  query: LiquidacionesFinalesDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<LiquidacionesFinalesDashboard> => {
  const scope = buildTenantScope(tenant, 'nlf');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nlf.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nlf.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);

  const result = await dbQuery<{
    anuladas: number;
    borradores: number;
    liquidaciones_total: number;
    liquidadas: number;
    pagadas: number;
    promedio_liquidacion: number | string | null;
    valor_total_liquidaciones: number | string | null;
    valor_total_pagado: number | string | null;
  }>(
    `
      SELECT
        COUNT(*)::int AS liquidaciones_total,
        COUNT(*) FILTER (WHERE nlf.estado = 'BORRADOR')::int AS borradores,
        COUNT(*) FILTER (WHERE nlf.estado = 'LIQUIDADA')::int AS liquidadas,
        COUNT(*) FILTER (WHERE nlf.estado = 'PAGADA')::int AS pagadas,
        COUNT(*) FILTER (WHERE nlf.estado = 'ANULADA')::int AS anuladas,
        COALESCE(SUM(nlf.neto_pagar), 0) AS valor_total_liquidaciones,
        COALESCE(SUM(CASE WHEN nlf.estado = 'PAGADA' THEN nlf.neto_pagar ELSE 0 END), 0) AS valor_total_pagado,
        COALESCE(AVG(nlf.neto_pagar), 0) AS promedio_liquidacion
      FROM nomina_liquidaciones_finales nlf
      ${whereSql || 'WHERE 1 = 1'}
      AND COALESCE(nlf.activo, TRUE) = TRUE
    `,
    params
  );

  const row = result.rows[0];

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_DASHBOARD_VIEW',
    after: {
      liquidaciones_total: row?.liquidaciones_total ?? 0
    },
    descripcion: 'Consulta del dashboard de liquidaciones finales',
    registro_id: '0',
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    liquidaciones_total: row?.liquidaciones_total ?? 0,
    borradores: row?.borradores ?? 0,
    liquidadas: row?.liquidadas ?? 0,
    pagadas: row?.pagadas ?? 0,
    anuladas: row?.anuladas ?? 0,
    valor_total_liquidaciones: toNullableNumber(row?.valor_total_liquidaciones) ?? 0,
    valor_total_pagado: toNullableNumber(row?.valor_total_pagado) ?? 0,
    promedio_liquidacion: round2(toNullableNumber(row?.promedio_liquidacion) ?? 0)
  };
};

export const getLiquidacionesFinalesAlertas = async (
  query: LiquidacionesFinalesAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedLiquidacionesFinalesAlertas> => {
  const scope = buildTenantScope(tenant, 'nlf');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  const countFilters: string[] = [];
  const countParams: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`nlf.empresa_id = $${params.length}::bigint`);
    countParams.push(query.empresa_id);
    countFilters.push(`nlf.empresa_id = $${countParams.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`nlf.contrato_id = $${params.length}::bigint`);
    countParams.push(query.contrato_id);
    countFilters.push(`nlf.contrato_id = $${countParams.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);
  const countWhereSql = scopeWhereSql(scope, countFilters);
  const alertCondition =
    `(nlf.estado = 'LIQUIDADA' AND nlf.fecha_pago IS NULL) OR (nlf.estado = 'BORRADOR' AND nlf.fecha_retiro < CURRENT_DATE)`;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_liquidaciones_finales nlf
      INNER JOIN personas p ON p.id = nlf.persona_id
      ${countWhereSql || 'WHERE 1 = 1'}
        AND COALESCE(nlf.activo, TRUE) = TRUE
        AND (${alertCondition})
    `,
    countParams
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const rows = await dbQuery<LiquidacionFinalAlertRow>(
    `
      SELECT
        nlf.activo,
        nlf.auxilio_transporte,
        nlf.contrato_id::text AS contrato_id,
        nlf.created_at,
        nlf.deducciones,
        nlf.dias_pendientes_pago,
        nlf.dias_trabajados,
        nlf.dias_vacaciones_pendientes,
        nlf.empresa_id::text AS empresa_id,
        nlf.estado,
        nlf.fecha_inicio_vinculacion,
        nlf.fecha_pago,
        nlf.fecha_retiro,
        nlf.id::text AS id,
        nlf.indemnizacion,
        nlf.motivo_retiro,
        nlf.neto_pagar,
        nlf.observacion,
        nlf.otros_devengos,
        p.numero_documento AS persona_documento,
        nlf.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        nlf.salario_base,
        nlf.total_deducciones,
        nlf.total_devengado,
        nlf.valor_cesantias,
        nlf.valor_intereses_cesantias,
        nlf.valor_prima,
        nlf.valor_salario_pendiente,
        nlf.valor_vacaciones,
        nlf.vinculacion_id::text AS vinculacion_id,
        CASE
          WHEN nlf.estado = 'LIQUIDADA' AND nlf.fecha_pago IS NULL THEN 'LIQUIDACION_FINAL_PENDIENTE_PAGO'
          ELSE 'LIQUIDACION_FINAL_BORRADOR'
        END AS tipo_alerta
      FROM nomina_liquidaciones_finales nlf
      INNER JOIN personas p ON p.id = nlf.persona_id
      ${whereSql || 'WHERE 1 = 1'}
        AND COALESCE(nlf.activo, TRUE) = TRUE
        AND (
          (nlf.estado = 'LIQUIDADA' AND nlf.fecha_pago IS NULL)
          OR (nlf.estado = 'BORRADOR' AND nlf.fecha_retiro < CURRENT_DATE)
        )
      ORDER BY
        CASE WHEN nlf.estado = 'LIQUIDADA' AND nlf.fecha_pago IS NULL THEN 0 ELSE 1 END,
        nlf.fecha_retiro ASC,
        nlf.created_at DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  const items = rows.rows.map((row) => ({
    ...mapLiquidacionFinal(row),
    tipo_alerta: row.tipo_alerta
  }));

  await registerAuditEntry({
    accion: 'NOMINA_LIQUIDACION_FINAL_ALERTAS_VIEW',
    after: { total: items.length },
    descripcion: 'Consulta de alertas de liquidaciones finales',
    registro_id: '0',
    tabla: 'nomina_liquidaciones_finales',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildAlertasPagination(query.page, query.limit, total)
  };
};

export const loadLiquidacionesFinalesExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<LiquidacionesFinalesExpediente> => {
  const scope = buildTenantScope(tenant, 'nlf');

  const rows = await dbQuery<LiquidacionFinalExpedienteRow>(
    `
      SELECT
        nlf.activo,
        nlf.contrato_id::text AS contrato_id,
        nlf.created_at,
        nlf.estado,
        nlf.fecha_inicio_vinculacion,
        nlf.fecha_pago,
        nlf.fecha_retiro,
        nlf.id::text AS id,
        nlf.neto_pagar,
        nlf.total_devengado,
        nlf.vinculacion_id::text AS vinculacion_id
      FROM nomina_liquidaciones_finales nlf
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} nlf.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(nlf.activo, TRUE) = TRUE
      ORDER BY nlf.fecha_retiro DESC, nlf.created_at DESC, nlf.id DESC
    `,
    [...scope.params, personaId]
  );

  const items = rows.rows.map((row) => ({
    activo: toBoolean(row.activo),
    contrato_id: toNullableNumber(row.contrato_id),
    created_at: toDateOnlyString(row.created_at),
    estado: row.estado,
    fecha_inicio_vinculacion: toDateOnlyString(row.fecha_inicio_vinculacion),
    fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
    fecha_retiro: toDateOnlyString(row.fecha_retiro),
    id: toNumber(row.id),
    neto_pagar: toNullableNumber(row.neto_pagar) ?? 0,
    total_devengado: toNullableNumber(row.total_devengado) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  const pagadas = items.filter((item) => item.estado === 'PAGADA').length;
  const ultimaLiquidacion = rows.rows[0]?.fecha_retiro ?? null;

  return {
    indicadores: {
      liquidaciones_finales_pagadas: pagadas,
      liquidaciones_finales_total: items.length,
      ultima_liquidacion_final: toDateOnlyStringNullable(ultimaLiquidacion)
    },
    items
  };
};
