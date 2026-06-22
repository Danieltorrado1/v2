import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { buildTenantWhereClause, assertTenantAccessForPersonaId, assertTenantAccessForVinculacionId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { ensureVinculacionExists } from './nomina.validator';
import type {
  CreatePrimaInput,
  ListPrimasQuery,
  NominaPrimaEstado,
  PrimaAlertasQuery,
  PrimaDashboardQuery,
  UpdatePrimaInput
} from './prima.schemas';

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

interface CountRow extends QueryResultRow {
  total: number;
}

interface PrimaRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaPrimaEstado;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_pago: Date | string | null;
  id: string;
  periodo: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  salario_base: number | string;
  valor_prima: number | string;
  vinculacion_id: string;
}

interface PrimaAlertRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaPrimaEstado;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_pago: Date | string | null;
  id: string;
  periodo: string;
  persona_documento: string | null;
  persona_id: string;
  persona_nombre: string | null;
  salario_base: number | string;
  tipo_alerta: 'PRIMA_PENDIENTE_PAGO' | 'PRIMA_SIN_LIQUIDAR';
  valor_prima: number | string;
  vinculacion_id: string;
}

interface PrimaExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string;
  contrato_id: string | null;
  created_at: Date | string;
  dias_liquidados: number | string;
  empresa_id: string;
  estado: NominaPrimaEstado;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  fecha_pago: Date | string | null;
  id: string;
  periodo: string;
  salario_base: number | string;
  valor_prima: number | string;
  vinculacion_id: string;
}

export interface PrimaItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaPrimaEstado;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_pago: string | null;
  id: number;
  periodo: string;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  salario_base: number;
  valor_prima: number;
  vinculacion_id: number;
}

export interface PrimaDashboard {
  primas_total: number;
  pendientes: number;
  liquidadas: number;
  pagadas: number;
  valor_total_primas: number;
  valor_total_pagado: number;
}

export interface PrimaAlertItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaPrimaEstado;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_pago: string | null;
  id: number;
  periodo: string;
  persona_documento: string | null;
  persona_id: number;
  persona_nombre: string | null;
  salario_base: number;
  tipo_alerta: 'PRIMA_PENDIENTE_PAGO' | 'PRIMA_SIN_LIQUIDAR';
  valor_prima: number;
  vinculacion_id: number;
}

export interface PrimaExpedienteItem {
  activo: boolean;
  auxilio_transporte: number;
  contrato_id: number | null;
  created_at: string;
  dias_liquidados: number;
  empresa_id: number;
  estado: NominaPrimaEstado;
  fecha_fin: string;
  fecha_inicio: string;
  fecha_pago: string | null;
  id: number;
  periodo: string;
  salario_base: number;
  valor_prima: number;
  vinculacion_id: number;
}

export interface PrimaExpedienteIndicadores {
  prima_pagada: number;
  prima_total: number;
  ultima_prima: string | null;
}

export interface PrimaExpediente {
  indicadores: PrimaExpedienteIndicadores;
  items: PrimaExpedienteItem[];
}

export interface PaginatedPrimas {
  items: PrimaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedPrimaAlertas {
  items: PrimaAlertItem[];
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

const calculatePrimaValue = (salarioBase: number, auxilioTransporte: number, diasLiquidados: number): number => {
  return Number(((((salarioBase + auxilioTransporte) * diasLiquidados) / 360)).toFixed(2));
};

const buildPagination = (page: number, limit: number, total: number): PaginatedPrimas['pagination'] => ({
  limit,
  page,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const buildPaginationAlertas = (page: number, limit: number, total: number): PaginatedPrimaAlertas['pagination'] => ({
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

const buildTenantScope = (tenant: TenantAccessContext | undefined, alias = 'np'): { params: unknown[]; sql: string } => {
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

const loadPrimaOrThrow = async (
  primaId: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<PrimaRow> => {
  const scope = buildTenantScope(tenant, 'np');
  const executor = client ?? dbPool;
  const result = await executor.query<PrimaRow>(
    `
      SELECT
        np.activo,
        np.auxilio_transporte,
        np.contrato_id::text AS contrato_id,
        np.created_at,
        np.dias_liquidados,
        np.empresa_id::text AS empresa_id,
        np.estado,
        np.fecha_fin,
        np.fecha_inicio,
        np.fecha_pago,
        np.id::text AS id,
        np.periodo,
        p.numero_documento AS persona_documento,
        np.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        np.salario_base,
        np.valor_prima,
        np.vinculacion_id::text AS vinculacion_id
      FROM nomina_prima np
      INNER JOIN personas p ON p.id = np.persona_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} np.id = $${scope.params.length + 1}::bigint
      LIMIT 1
    `,
    [...scope.params, primaId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Prima not found', 404, 'NOMINA_PRIMA_NOT_FOUND');
  }

  return row;
};

const mapPrima = (row: PrimaRow): PrimaItem => ({
  activo: toBoolean(row.activo),
  auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
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
  salario_base: toNullableNumber(row.salario_base) ?? 0,
  valor_prima: toNullableNumber(row.valor_prima) ?? 0,
  vinculacion_id: toNumber(row.vinculacion_id)
});

const appendPrimaFilters = (
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
  alias = 'np'
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

export const listPrimas = async (
  query: ListPrimasQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedPrimas> => {
  const scope = buildTenantScope(tenant, 'np');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  appendPrimaFilters(filters, params, query, 'np');
  const whereSql = scopeWhereSql(scope, filters);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_prima np
      INNER JOIN personas p ON p.id = np.persona_id
      ${whereSql || 'WHERE 1 = 1'}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const result = await dbQuery<PrimaRow>(
    `
      SELECT
        np.activo,
        np.auxilio_transporte,
        np.contrato_id::text AS contrato_id,
        np.created_at,
        np.dias_liquidados,
        np.empresa_id::text AS empresa_id,
        np.estado,
        np.fecha_fin,
        np.fecha_inicio,
        np.fecha_pago,
        np.id::text AS id,
        np.periodo,
        p.numero_documento AS persona_documento,
        np.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        np.salario_base,
        np.valor_prima,
        np.vinculacion_id::text AS vinculacion_id
      FROM nomina_prima np
      INNER JOIN personas p ON p.id = np.persona_id
      ${whereSql || 'WHERE 1 = 1'}
      ORDER BY np.created_at DESC, np.id DESC
      LIMIT $${params.length - 1}::int OFFSET $${params.length}::int
    `,
    params
  );

  return {
    items: result.rows.map(mapPrima),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

export const createPrima = async (
  input: CreatePrimaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PrimaItem> => {
  const result = await runInTransaction(async (client) => {
    await assertTenantAccessForPersonaId(tenant, input.persona_id);
    await assertTenantAccessForVinculacionId(tenant, input.vinculacion_id);
    const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
    if (vinculacion.persona_id !== input.persona_id) {
      throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_PRIMA_VINCULACION_INVALIDA');
    }

    const selectedContratoId = input.contrato_id ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError('Contrato is required for prima records', 400, 'NOMINA_PRIMA_CONTRATO_INVALIDO');
    }

    const contrato = await loadContractOrThrow(selectedContratoId, tenant, client);
    const selectedEmpresaId = input.empresa_id;
    if (!selectedEmpresaId) {
      throw new AppError('Empresa is required for prima records', 400, 'NOMINA_PRIMA_EMPRESA_INVALIDA');
    }
    if (selectedEmpresaId !== contrato.empresa_id) {
      throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_PRIMA_EMPRESA_INVALIDA');
    }

    const diasLiquidados = Number(input.dias_liquidados ?? 0);
    if (diasLiquidados < 0 || diasLiquidados > 360) {
      throw new AppError('dias_liquidados must be between 0 and 360', 400, 'NOMINA_PRIMA_DIAS_INVALIDOS');
    }

    const salarioBase = Number(input.salario_base ?? 0);
    const auxilioTransporte = Number(input.auxilio_transporte ?? 0);
    const valorPrima = calculatePrimaValue(salarioBase, auxilioTransporte, diasLiquidados);
    const fechaPago = input.fecha_pago ?? (input.estado === 'PAGADA' ? getTodayDateOnly() : null);

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_prima (
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
          valor_prima,
          estado,
          fecha_pago,
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
          $14
        )
        RETURNING id::text AS id
      `,
      [
        selectedEmpresaId,
        selectedContratoId,
        input.persona_id,
        input.vinculacion_id,
        input.periodo,
        input.fecha_inicio,
        input.fecha_fin,
        diasLiquidados,
        salarioBase,
        auxilioTransporte,
        valorPrima,
        input.estado,
        fechaPago,
        input.activo
      ]
    );

    const row = created.rows[0];
    if (!row) {
      throw new AppError('Failed to create prima record', 500, 'NOMINA_PRIMA_CREATE_FAILED');
    }

    return loadPrimaOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_PRIMA_CREATE',
    after: mapPrima(result),
    descripcion: 'Creacion de prima de servicios',
    registro_id: result.id,
    tabla: 'nomina_prima',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPrima(result);
};

export const updatePrima = async (
  id: number,
  input: UpdatePrimaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PrimaItem> => {
  const current = await loadPrimaOrThrow(id, tenant);
  const nextEmpresaId = input.empresa_id ? input.empresa_id : current.empresa_id;
  const nextPersonaId = input.persona_id ? input.persona_id : current.persona_id;
  const nextVinculacionId = input.vinculacion_id ? input.vinculacion_id : current.vinculacion_id;
  const nextContratoId = input.contrato_id === undefined ? current.contrato_id : input.contrato_id;

  const result = await runInTransaction(async (client) => {
    await assertTenantAccessForPersonaId(tenant, nextPersonaId);
    await assertTenantAccessForVinculacionId(tenant, nextVinculacionId);
    const vinculacion = await ensureVinculacionExists(String(nextVinculacionId), client);
    if (vinculacion.persona_id !== String(nextPersonaId)) {
      throw new AppError('Vinculacion does not belong to persona', 400, 'NOMINA_PRIMA_VINCULACION_INVALIDA');
    }

    const selectedContratoId = nextContratoId ?? vinculacion.contrato_id;
    if (!selectedContratoId) {
      throw new AppError('Contrato is required for prima records', 400, 'NOMINA_PRIMA_CONTRATO_INVALIDO');
    }

    const contrato = await loadContractOrThrow(selectedContratoId, tenant, client);
    const selectedEmpresaId = nextEmpresaId ?? current.empresa_id;
    if (!selectedEmpresaId) {
      throw new AppError('Empresa is required for prima records', 400, 'NOMINA_PRIMA_EMPRESA_INVALIDA');
    }
    if (String(selectedEmpresaId) !== contrato.empresa_id) {
      throw new AppError('Contrato does not belong to empresa', 400, 'NOMINA_PRIMA_EMPRESA_INVALIDA');
    }

    const nextDiasLiquidados = input.dias_liquidados ?? toNullableNumber(current.dias_liquidados) ?? 0;
    if (nextDiasLiquidados < 0 || nextDiasLiquidados > 360) {
      throw new AppError('dias_liquidados must be between 0 and 360', 400, 'NOMINA_PRIMA_DIAS_INVALIDOS');
    }

    const nextSalarioBase = input.salario_base ?? toNullableNumber(current.salario_base) ?? 0;
    const nextAuxilioTransporte = input.auxilio_transporte ?? toNullableNumber(current.auxilio_transporte) ?? 0;
    const nextValorPrima = calculatePrimaValue(nextSalarioBase, nextAuxilioTransporte, nextDiasLiquidados);
    const nextEstado = input.estado ?? current.estado;
    const nextFechaPago =
      input.fecha_pago !== undefined
        ? input.fecha_pago
        : nextEstado === 'PAGADA'
          ? current.fecha_pago ?? getTodayDateOnly()
          : current.fecha_pago;

    const updated = await client.query<{ id: string }>(
      `
        UPDATE nomina_prima
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
          valor_prima = $12::numeric,
          estado = $13,
          fecha_pago = $14::date,
          activo = COALESCE($15, activo)
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        id,
        selectedEmpresaId,
        selectedContratoId,
        nextPersonaId,
        nextVinculacionId,
        input.periodo ?? current.periodo,
        input.fecha_inicio ?? current.fecha_inicio,
        input.fecha_fin ?? current.fecha_fin,
        nextDiasLiquidados,
        nextSalarioBase,
        nextAuxilioTransporte,
        nextValorPrima,
        nextEstado,
        nextFechaPago,
        input.activo ?? toBoolean(current.activo)
      ]
    );

    const row = updated.rows[0];
    if (!row) {
      throw new AppError('Prima record not found', 404, 'NOMINA_PRIMA_NOT_FOUND');
    }

    return loadPrimaOrThrow(toNumber(row.id), tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_PRIMA_UPDATE',
    after: mapPrima(result),
    before: mapPrima(current),
    descripcion: 'Actualizacion de prima de servicios',
    registro_id: result.id,
    tabla: 'nomina_prima',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPrima(result);
};

export const payPrima = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PrimaItem> => {
  const current = await loadPrimaOrThrow(id, tenant);
  if (current.estado === 'PAGADA') {
    return mapPrima(current);
  }

  if (current.estado !== 'LIQUIDADA') {
    throw new AppError('Only liquidated primas can be paid', 409, 'NOMINA_PRIMA_ESTADO_INVALIDO');
  }

  const result = await runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_prima
        SET estado = 'PAGADA', fecha_pago = CURRENT_DATE
        WHERE id = $1::bigint
      `,
      [id]
    );

    return loadPrimaOrThrow(id, tenant, client);
  });

  await registerAuditEntry({
    accion: 'NOMINA_PRIMA_PAGADA',
    after: mapPrima(result),
    before: mapPrima(current),
    descripcion: 'Pago de prima de servicios',
    registro_id: result.id,
    tabla: 'nomina_prima',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPrima(result);
};

export const deactivatePrima = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PrimaItem> => {
  const current = await loadPrimaOrThrow(id, tenant);
  const result = await dbQuery<PrimaRow>(
    `
      UPDATE nomina_prima
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
        fecha_fin,
        fecha_inicio,
        fecha_pago,
        id::text AS id,
        periodo,
        NULL::text AS persona_documento,
        persona_id::text AS persona_id,
        NULL::text AS persona_nombre,
        salario_base,
        valor_prima,
        vinculacion_id::text AS vinculacion_id
    `,
    [id]
  );

  const row = result.rows[0] ?? current;

  await registerAuditEntry({
    accion: 'NOMINA_PRIMA_DEACTIVATE',
    after: mapPrima(row),
    descripcion: 'Desactivacion de prima de servicios',
    registro_id: String(id),
    tabla: 'nomina_prima',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return mapPrima(row);
};

export const getPrimaDashboard = async (
  query: PrimaDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PrimaDashboard> => {
  const scope = buildTenantScope(tenant, 'np');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`np.empresa_id = $${params.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`np.contrato_id = $${params.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);

  const result = await dbQuery<{
    liquidadas: number;
    pagadas: number;
    pendientes: number;
    primas_total: number;
    valor_total_pagado: number | string | null;
    valor_total_primas: number | string | null;
  }>(
    `
      SELECT
        COUNT(*)::int AS primas_total,
        COUNT(*) FILTER (WHERE np.estado = 'PENDIENTE')::int AS pendientes,
        COUNT(*) FILTER (WHERE np.estado = 'LIQUIDADA')::int AS liquidadas,
        COUNT(*) FILTER (WHERE np.estado = 'PAGADA')::int AS pagadas,
        COALESCE(SUM(np.valor_prima), 0) AS valor_total_primas,
        COALESCE(SUM(CASE WHEN np.estado = 'PAGADA' THEN np.valor_prima ELSE 0 END), 0) AS valor_total_pagado
      FROM nomina_prima np
      ${whereSql || 'WHERE 1 = 1'}
      AND COALESCE(np.activo, TRUE) = TRUE
    `,
    params
  );

  const row = result.rows[0];

  await registerAuditEntry({
    accion: 'NOMINA_PRIMA_DASHBOARD_VIEW',
    after: {
      primas_total: row?.primas_total ?? 0
    },
    descripcion: 'Consulta del dashboard de prima de servicios',
    registro_id: '0',
    tabla: 'nomina_prima',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    primas_total: row?.primas_total ?? 0,
    pendientes: row?.pendientes ?? 0,
    liquidadas: row?.liquidadas ?? 0,
    pagadas: row?.pagadas ?? 0,
    valor_total_primas: toNullableNumber(row?.valor_total_primas) ?? 0,
    valor_total_pagado: toNullableNumber(row?.valor_total_pagado) ?? 0
  };
};

export const getPrimaAlertas = async (
  query: PrimaAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedPrimaAlertas> => {
  const scope = buildTenantScope(tenant, 'np');
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  const countFilters: string[] = [];
  const countParams: unknown[] = [...scope.params];

  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`np.empresa_id = $${params.length}::bigint`);
    countParams.push(query.empresa_id);
    countFilters.push(`np.empresa_id = $${countParams.length}::bigint`);
  }

  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`np.contrato_id = $${params.length}::bigint`);
    countParams.push(query.contrato_id);
    countFilters.push(`np.contrato_id = $${countParams.length}::bigint`);
  }

  const whereSql = scopeWhereSql(scope, filters);
  const countWhereSql = scopeWhereSql(scope, countFilters);
  const alertCondition =
    `(np.estado = 'LIQUIDADA' AND np.fecha_pago IS NULL) OR (np.estado = 'PENDIENTE' AND np.fecha_fin < CURRENT_DATE)`;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_prima np
      INNER JOIN personas p ON p.id = np.persona_id
      ${countWhereSql || 'WHERE 1 = 1'}
        AND COALESCE(np.activo, TRUE) = TRUE
        AND (${alertCondition})
    `,
    countParams
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  params.push(query.limit, offset);

  const rows = await dbQuery<PrimaAlertRow>(
    `
      SELECT
        np.activo,
        np.auxilio_transporte,
        np.contrato_id::text AS contrato_id,
        np.created_at,
        np.dias_liquidados,
        np.empresa_id::text AS empresa_id,
        np.estado,
        np.fecha_fin,
        np.fecha_inicio,
        np.fecha_pago,
        np.id::text AS id,
        np.periodo,
        p.numero_documento AS persona_documento,
        np.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        np.salario_base,
        np.valor_prima,
        np.vinculacion_id::text AS vinculacion_id,
        CASE
          WHEN np.estado = 'LIQUIDADA' AND np.fecha_pago IS NULL THEN 'PRIMA_PENDIENTE_PAGO'
          ELSE 'PRIMA_SIN_LIQUIDAR'
        END AS tipo_alerta
      FROM nomina_prima np
      INNER JOIN personas p ON p.id = np.persona_id
      ${whereSql || 'WHERE 1 = 1'}
        AND COALESCE(np.activo, TRUE) = TRUE
        AND (
          (np.estado = 'LIQUIDADA' AND np.fecha_pago IS NULL)
          OR (np.estado = 'PENDIENTE' AND np.fecha_fin < CURRENT_DATE)
        )
      ORDER BY
        CASE WHEN np.estado = 'LIQUIDADA' AND np.fecha_pago IS NULL THEN 0 ELSE 1 END,
        np.fecha_fin ASC,
        np.created_at DESC
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
    fecha_fin: toDateOnlyString(row.fecha_fin),
    fecha_inicio: toDateOnlyString(row.fecha_inicio),
    fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
    id: toNumber(row.id),
    periodo: row.periodo,
    persona_documento: row.persona_documento,
    persona_id: toNumber(row.persona_id),
    persona_nombre: row.persona_nombre,
    salario_base: toNullableNumber(row.salario_base) ?? 0,
    tipo_alerta: row.tipo_alerta,
    valor_prima: toNullableNumber(row.valor_prima) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  await registerAuditEntry({
    accion: 'NOMINA_PRIMA_ALERTAS_VIEW',
    after: { total: items.length },
    descripcion: 'Consulta de alertas de prima de servicios',
    registro_id: '0',
    tabla: 'nomina_prima',
    usuario_id: actorUserId,
    ...auditMeta
  });

  return {
    items,
    pagination: buildPaginationAlertas(query.page, query.limit, total)
  };
};

export const loadPrimaExpediente = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<PrimaExpediente> => {
  const scope = buildTenantScope(tenant, 'np');

  const rows = await dbQuery<PrimaExpedienteRow>(
    `
      SELECT
        np.activo,
        np.auxilio_transporte,
        np.contrato_id::text AS contrato_id,
        np.created_at,
        np.dias_liquidados,
        np.empresa_id::text AS empresa_id,
        np.estado,
        np.fecha_fin,
        np.fecha_inicio,
        np.fecha_pago,
        np.id::text AS id,
        np.periodo,
        np.salario_base,
        np.valor_prima,
        np.vinculacion_id::text AS vinculacion_id
      FROM nomina_prima np
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} np.persona_id = $${scope.params.length + 1}::bigint
        AND COALESCE(np.activo, TRUE) = TRUE
      ORDER BY np.fecha_fin DESC, np.created_at DESC, np.id DESC
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
    fecha_fin: toDateOnlyString(row.fecha_fin),
    fecha_inicio: toDateOnlyString(row.fecha_inicio),
    fecha_pago: toDateOnlyStringNullable(row.fecha_pago),
    id: toNumber(row.id),
    periodo: row.periodo,
    salario_base: toNullableNumber(row.salario_base) ?? 0,
    valor_prima: toNullableNumber(row.valor_prima) ?? 0,
    vinculacion_id: toNumber(row.vinculacion_id)
  }));

  const paidTotal = items.filter((item) => item.estado === 'PAGADA').length;
  const ultimaPrima = rows.rows[0]?.fecha_fin ?? null;

  return {
    indicadores: {
      prima_pagada: paidTotal,
      prima_total: items.length,
      ultima_prima: toDateOnlyStringNullable(ultimaPrima)
    },
    items
  };
};
