import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import {
  assertTenantAccessForVinculacionId,
  buildTenantWhereClause,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { ensurePeriodoExists } from './nomina.validator';
import type {
  ChangeCuentaCobroOpsEstadoInput,
  CuentaCobroOpsDetalleInput,
  CuentaCobroOpsEstado,
  CreateCuentaCobroOpsInput,
  ListCuentasCobroOpsQuery,
  UpdateCuentaCobroOpsInput
} from './cuentas-cobro-ops.schemas';
import { OPS_METODOS_PAGO } from '../vinculaciones/vinculaciones.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface CuentaCobroOpsRow extends QueryResultRow {
  activo: boolean;
  cargo_nombre: string | null;
  contrato_cargo_id: string;
  contrato_id: string;
  contrato_numero: string | null;
  created_at: Date | string;
  created_by: string;
  descuentos: string | number;
  documento_fecha_carga: Date | string | null;
  documento_id: string | null;
  documento_nombre_original: string | null;
  documento_tipo_codigo: string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  entidad_contratante: string | null;
  estado: CuentaCobroOpsEstado;
  estado_vinculacion: string;
  fecha_fin: Date | string;
  fecha_generacion: Date | string;
  fecha_inicio: Date | string;
  metodo_pago: string;
  nombre_periodo: string;
  numero_cuenta: string;
  numero_documento: string;
  objeto_contractual: string | null;
  observaciones: string | null;
  periodo_estado: string | null;
  periodo_fecha_fin: Date | string;
  periodo_fecha_inicio: Date | string;
  periodo_id: string;
  persona_id: string;
  persona_nombre: string;
  tipo_periodo: string | null;
  tipo_vinculacion_codigo: string;
  tipo_vinculacion_id: string;
  tipo_vinculacion_nombre: string;
  updated_at: Date | string;
  updated_by: string | null;
  valor_bruto: string | number;
  valor_neto: string | number;
  vinculacion_fecha_fin: Date | string | null;
  vinculacion_fecha_inicio: Date | string;
  vinculacion_id: string;
}

interface CuentaCobroOpsDetalleRow extends QueryResultRow {
  activo: boolean;
  cantidad: string | number;
  concepto: string;
  cuenta_cobro_ops_id: string;
  id: string;
  observacion: string | null;
  orden: number;
  subtotal: string | number;
  valor_unitario: string | number;
}

interface VinculacionOpsContextRow extends QueryResultRow {
  contrato_id: string;
  empresa_id: string;
  estado_vinculacion: string;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  metodo_pago: string | null;
  tipo_vinculacion_codigo: string;
  vinculacion_id: string;
}

export interface CuentaCobroOpsDetalleItem {
  activo: boolean;
  cantidad: number;
  concepto: string;
  cuenta_cobro_ops_id: number;
  id: number;
  observacion: string | null;
  orden: number;
  subtotal: number;
  valor_unitario: number;
}

export interface CuentaCobroOpsItem {
  activo: boolean;
  cargo: { id: number; nombre_cargo: string | null };
  contrato: {
    entidad_contratante: string | null;
    id: number;
    numero_contrato: string | null;
    objeto_contractual: string | null;
  };
  created_at: string;
  created_by: number;
  detalles: CuentaCobroOpsDetalleItem[];
  documento: {
    fecha_carga: string | null;
    id: number;
    nombre_original: string | null;
    tipo_documento_codigo: string | null;
  } | null;
  empresa: { id: number; nombre_empresa: string | null };
  estado: CuentaCobroOpsEstado;
  fechas: { fecha_fin: string; fecha_generacion: string; fecha_inicio: string };
  id: number;
  numero_cuenta: number;
  observaciones: string | null;
  periodo: {
    estado: string | null;
    fecha_fin: string;
    fecha_inicio: string;
    id: number;
    nombre_periodo: string;
    tipo_periodo: string | null;
  };
  persona: { id: number; nombre_completo: string; numero_documento: string };
  updated_at: string;
  updated_by: number | null;
  valores: { descuentos: number; valor_bruto: number; valor_neto: number };
  vinculacion: {
    estado_vinculacion: string;
    fecha_fin: string | null;
    fecha_inicio: string;
    id: number;
    metodo_pago: string;
    tipo_vinculacion: { codigo: string; id: number; nombre_vinculacion: string };
  };
}

export interface PaginatedCuentasCobroOps {
  items: CuentaCobroOpsItem[];
  pagination: { limit: number; page: number; total: number; total_pages: number };
}

type QueryExecutor = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
};

const getExecutor = (client?: PoolClient): QueryExecutor =>
  client
    ? { query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => client.query<T>(text, params) }
    : { query: dbQuery };

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }
  return parsed;
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
};

const roundMoney = (value: number): number => Number(value.toFixed(2));

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

const getCuentaCobroOpsSelect = (): string => `
  SELECT
    ncco.id::text AS id,
    ncco.vinculacion_id::text AS vinculacion_id,
    ncco.periodo_id::text AS periodo_id,
    ncco.empresa_id::text AS empresa_id,
    ncco.contrato_id::text AS contrato_id,
    ncco.documento_id::text AS documento_id,
    ncco.numero_cuenta::text AS numero_cuenta,
    ncco.fecha_generacion,
    ncco.fecha_inicio,
    ncco.fecha_fin,
    ncco.valor_bruto,
    ncco.descuentos,
    ncco.valor_neto,
    ncco.estado,
    ncco.observaciones,
    ncco.activo,
    ncco.created_at,
    ncco.updated_at,
    ncco.created_by::text AS created_by,
    ncco.updated_by::text AS updated_by,
    np.nombre_periodo,
    np.tipo_periodo,
    np.fecha_inicio AS periodo_fecha_inicio,
    np.fecha_fin AS periodo_fecha_fin,
    np.estado AS periodo_estado,
    v.fecha_inicio AS vinculacion_fecha_inicio,
    v.fecha_fin AS vinculacion_fecha_fin,
    v.estado_vinculacion,
    v.metodo_pago,
    tv.id::text AS tipo_vinculacion_id,
    tv.codigo AS tipo_vinculacion_codigo,
    tv.nombre_vinculacion AS tipo_vinculacion_nombre,
    p.id::text AS persona_id,
    p.numero_documento,
    CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
    e.nombre_empresa,
    c.numero_contrato,
    c.entidad_contratante,
    c.objeto_contractual,
    cc.nombre_cargo AS cargo_nombre,
    dv.nombre_original AS documento_nombre_original,
    dv.fecha_carga AS documento_fecha_carga,
    td.codigo AS documento_tipo_codigo,
    cc.id::text AS contrato_cargo_id
  FROM nomina_cuentas_cobro_ops ncco
  INNER JOIN nomina_periodos np ON np.id = ncco.periodo_id
  INNER JOIN vinculaciones v ON v.id = ncco.vinculacion_id
  INNER JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
  INNER JOIN empresas e ON e.id = ncco.empresa_id
  INNER JOIN contratos c ON c.id = ncco.contrato_id
  LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
  LEFT JOIN documentos_vinculacion dv ON dv.id = ncco.documento_id
  LEFT JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
`;

const getCuentaCobroOpsDetalleSelect = (): string => `
  SELECT id::text AS id, cuenta_cobro_ops_id::text AS cuenta_cobro_ops_id, concepto, cantidad, valor_unitario, subtotal, observacion, orden, activo
  FROM nomina_cuenta_cobro_ops_detalle
`;
const mapDetalle = (row: CuentaCobroOpsDetalleRow): CuentaCobroOpsDetalleItem => ({
  id: toNumber(row.id),
  cuenta_cobro_ops_id: toNumber(row.cuenta_cobro_ops_id),
  concepto: row.concepto,
  cantidad: toNumber(row.cantidad),
  valor_unitario: toNumber(row.valor_unitario),
  subtotal: toNumber(row.subtotal),
  observacion: row.observacion,
  orden: row.orden,
  activo: row.activo
});

const mapCuentaCobroOps = (row: CuentaCobroOpsRow, detalles: CuentaCobroOpsDetalleItem[]): CuentaCobroOpsItem => {
  const fechaGeneracion = toDateString(row.fecha_generacion);
  const fechaInicio = toDateString(row.fecha_inicio);
  const fechaFin = toDateString(row.fecha_fin);
  const periodoFechaInicio = toDateString(row.periodo_fecha_inicio);
  const periodoFechaFin = toDateString(row.periodo_fecha_fin);
  const vinculacionFechaInicio = toDateString(row.vinculacion_fecha_inicio);

  if (!fechaGeneracion || !fechaInicio || !fechaFin || !periodoFechaInicio || !periodoFechaFin || !vinculacionFechaInicio) {
    throw new AppError('Invalid OPS cuenta de cobro date returned by database', 500, 'INVALID_DATE_VALUE');
  }

  return {
    id: toNumber(row.id),
    numero_cuenta: toNumber(row.numero_cuenta),
    periodo: {
      id: toNumber(row.periodo_id),
      nombre_periodo: row.nombre_periodo,
      tipo_periodo: row.tipo_periodo,
      fecha_inicio: periodoFechaInicio,
      fecha_fin: periodoFechaFin,
      estado: row.periodo_estado
    },
    empresa: { id: toNumber(row.empresa_id), nombre_empresa: row.empresa_nombre },
    contrato: {
      id: toNumber(row.contrato_id),
      numero_contrato: row.contrato_numero,
      entidad_contratante: row.entidad_contratante,
      objeto_contractual: row.objeto_contractual
    },
    persona: { id: toNumber(row.persona_id), nombre_completo: row.persona_nombre, numero_documento: row.numero_documento },
    cargo: { id: toNumber(row.contrato_cargo_id), nombre_cargo: row.cargo_nombre },
    vinculacion: {
      id: toNumber(row.vinculacion_id),
      fecha_inicio: vinculacionFechaInicio,
      fecha_fin: toDateString(row.vinculacion_fecha_fin),
      estado_vinculacion: row.estado_vinculacion,
      metodo_pago: row.metodo_pago,
      tipo_vinculacion: {
        id: toNumber(row.tipo_vinculacion_id),
        codigo: row.tipo_vinculacion_codigo,
        nombre_vinculacion: row.tipo_vinculacion_nombre
      }
    },
    documento: row.documento_id
      ? {
          id: toNumber(row.documento_id),
          tipo_documento_codigo: row.documento_tipo_codigo,
          nombre_original: row.documento_nombre_original,
          fecha_carga: toDateString(row.documento_fecha_carga)
        }
      : null,
    fechas: { fecha_generacion: fechaGeneracion, fecha_inicio: fechaInicio, fecha_fin: fechaFin },
    valores: {
      valor_bruto: toNumber(row.valor_bruto),
      descuentos: toNumber(row.descuentos),
      valor_neto: toNumber(row.valor_neto)
    },
    estado: row.estado,
    observaciones: row.observaciones,
    activo: row.activo,
    created_at: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
    created_by: toNumber(row.created_by),
    updated_by: row.updated_by ? toNumber(row.updated_by) : null,
    detalles
  };
};

const loadCuentaCobroOpsDetalles = async (cuentaCobroOpsId: number, client?: PoolClient): Promise<CuentaCobroOpsDetalleItem[]> => {
  const executor = getExecutor(client);
  const result = await executor.query<CuentaCobroOpsDetalleRow>(
    `${getCuentaCobroOpsDetalleSelect()} WHERE cuenta_cobro_ops_id = $1::bigint ORDER BY orden ASC, id ASC`,
    [cuentaCobroOpsId]
  );
  return result.rows.map(mapDetalle);
};

const loadCuentaCobroOpsRowOrThrow = async (id: number, tenant?: TenantAccessContext, client?: PoolClient): Promise<CuentaCobroOpsRow> => {
  const executor = getExecutor(client);
  const scope = tenant
    ? buildTenantWhereClause({ contratoColumn: 'ncco.contrato_id', empresaColumn: 'ncco.empresa_id', tenant })
    : { params: [], sql: '' };
  const idParamIndex = scope.params.length + 1;
  const result = await executor.query<CuentaCobroOpsRow>(
    `${getCuentaCobroOpsSelect()} ${scope.sql} ${scope.sql ? 'AND' : 'WHERE'} ncco.id = $${idParamIndex}::bigint LIMIT 1`,
    [...scope.params, id]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('OPS cuenta de cobro not found', 404, 'NOMINA_CUENTA_COBRO_OPS_NOT_FOUND');
  }
  return row;
};

const loadCuentaCobroOpsOrThrow = async (id: number, tenant?: TenantAccessContext, client?: PoolClient): Promise<CuentaCobroOpsItem> => {
  const row = await loadCuentaCobroOpsRowOrThrow(id, tenant, client);
  const detalles = await loadCuentaCobroOpsDetalles(id, client);
  return mapCuentaCobroOps(row, detalles);
};

const loadVinculacionOpsContextOrThrow = async (vinculacionId: number, tenant?: TenantAccessContext, client?: PoolClient): Promise<VinculacionOpsContextRow> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const executor = getExecutor(client);
  const result = await executor.query<VinculacionOpsContextRow>(
    `
      SELECT
        v.id::text AS vinculacion_id,
        v.empresa_id::text AS empresa_id,
        v.contrato_id::text AS contrato_id,
        v.fecha_inicio,
        v.fecha_fin,
        v.estado_vinculacion,
        v.metodo_pago,
        tv.codigo AS tipo_vinculacion_codigo
      FROM vinculaciones v
      INNER JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }
  return row;
};

const assertDocumentoCompatible = async (documentoId: number, vinculacionId: number, client?: PoolClient): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<{ codigo: string; vinculacion_id: string }>(
    `
      SELECT dv.vinculacion_id::text AS vinculacion_id, td.codigo
      FROM documentos_vinculacion dv
      INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
      WHERE dv.id = $1::bigint
      LIMIT 1
    `,
    [documentoId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Documento de vinculacion not found', 400, 'DOCUMENTO_VINCULACION_NOT_FOUND');
  }
  if (toNumber(row.vinculacion_id) !== vinculacionId) {
    throw new AppError('Documento does not belong to vinculacion', 400, 'NOMINA_CUENTA_COBRO_OPS_DOCUMENTO_INVALIDO');
  }
  if (row.codigo !== 'CUENTA_COBRO_OPS') {
    throw new AppError('Documento must be of type CUENTA_COBRO_OPS', 400, 'NOMINA_CUENTA_COBRO_OPS_DOCUMENTO_TIPO_INVALIDO');
  }
};

const assertPeriodoMatchesVinculacion = (
  periodo: Awaited<ReturnType<typeof ensurePeriodoExists>>,
  vinculacion: VinculacionOpsContextRow,
  empresaId: number,
  contratoId: number
): void => {
  const periodoContratoId = periodo.contrato_id ? Number(periodo.contrato_id) : null;
  const periodoEmpresaId = periodo.empresa_id ? Number(periodo.empresa_id) : null;
  if (periodoContratoId === null || periodoEmpresaId === null) {
    throw new AppError('Periodo payroll context is invalid', 400, 'NOMINA_PERIODO_INVALIDO');
  }
  if (empresaId !== toNumber(vinculacion.empresa_id) || empresaId !== periodoEmpresaId) {
    throw new AppError('Vinculacion does not belong to empresa', 400, 'NOMINA_CUENTA_COBRO_OPS_EMPRESA_INVALIDA');
  }
  if (contratoId !== toNumber(vinculacion.contrato_id) || contratoId !== periodoContratoId) {
    throw new AppError('Vinculacion does not belong to contrato', 400, 'NOMINA_CUENTA_COBRO_OPS_CONTRATO_INVALIDO');
  }
};
const assertVinculacionIsOps = (
  vinculacion: VinculacionOpsContextRow,
  periodo: Awaited<ReturnType<typeof ensurePeriodoExists>>
): void => {
  if (vinculacion.tipo_vinculacion_codigo !== 'OPS') {
    throw new AppError('Vinculacion must be OPS', 400, 'NOMINA_CUENTA_COBRO_OPS_VINCULACION_INVALIDA');
  }
  if (!vinculacion.metodo_pago || !OPS_METODOS_PAGO.includes(vinculacion.metodo_pago as typeof OPS_METODOS_PAGO[number])) {
    throw new AppError('Vinculacion metodo_pago must be OPS', 400, 'NOMINA_CUENTA_COBRO_OPS_METODO_PAGO_INVALIDO');
  }
  const vinculacionInicio = toDateString(vinculacion.fecha_inicio);
  const vinculacionFin = toDateString(vinculacion.fecha_fin) ?? periodo.fecha_fin;
  if (!vinculacionInicio) {
    throw new AppError('Vinculacion start date is invalid', 400, 'NOMINA_CUENTA_COBRO_OPS_VINCULACION_FECHA_INVALIDA');
  }
  if (vinculacionInicio > periodo.fecha_fin || vinculacionFin < periodo.fecha_inicio) {
    throw new AppError('Vinculacion does not intersect the selected periodo', 400, 'NOMINA_CUENTA_COBRO_OPS_PERIODO_NO_RELACIONADO');
  }
};

const assertDatesWithinPeriodo = (periodo: Awaited<ReturnType<typeof ensurePeriodoExists>>, fechaInicio: string, fechaFin: string): void => {
  if (fechaFin < fechaInicio) {
    throw new AppError('fecha_fin must be greater than or equal to fecha_inicio', 400, 'NOMINA_CUENTA_COBRO_OPS_FECHAS_INVALIDAS');
  }
  if (fechaInicio < periodo.fecha_inicio || fechaFin > periodo.fecha_fin) {
    throw new AppError('Cuenta de cobro dates must be inside the selected periodo', 400, 'NOMINA_CUENTA_COBRO_OPS_FECHAS_FUERA_DE_PERIODO');
  }
};

const calculateTotals = (input: { detalles: CuentaCobroOpsDetalleInput[]; descuentos: number; valorBruto?: number | null }) => {
  const detalleRows = input.detalles.map((detalle, index) => ({
    ...detalle,
    orden: detalle.orden ?? index,
    subtotal: roundMoney(detalle.cantidad * detalle.valor_unitario)
  }));
  const valorBruto = detalleRows.length > 0
    ? roundMoney(detalleRows.reduce((accumulator, detalle) => accumulator + detalle.subtotal, 0))
    : roundMoney(input.valorBruto ?? 0);
  const valorNeto = roundMoney(valorBruto - input.descuentos);
  if (valorNeto < 0) {
    throw new AppError('valor_neto cannot be negative', 400, 'NOMINA_CUENTA_COBRO_OPS_VALOR_INVALIDO');
  }
  return { detalleRows, valorBruto, valorNeto };
};

const assertMethodSpecificRules = (metodoPago: string | null, detalles: CuentaCobroOpsDetalleInput[]): void => {
  if (metodoPago === 'OPS_POR_PRODUCTO' && detalles.length === 0) {
    throw new AppError('OPS_POR_PRODUCTO accounts require detalle rows', 400, 'NOMINA_CUENTA_COBRO_OPS_DETALLE_REQUERIDO');
  }
};

const assertNoDuplicateCuenta = async (vinculacionId: number, periodoId: number, excludedId?: number, client?: PoolClient): Promise<void> => {
  const executor = getExecutor(client);
  const params: unknown[] = [vinculacionId, periodoId];
  let sql = `
    SELECT id::text AS id
    FROM nomina_cuentas_cobro_ops
    WHERE vinculacion_id = $1::bigint
      AND periodo_id = $2::bigint
      AND COALESCE(activo, TRUE) = TRUE
      AND estado <> 'ANULADA'
  `;
  if (excludedId !== undefined) {
    params.push(excludedId);
    sql += ` AND id <> $${params.length}::bigint`;
  }
  sql += ' LIMIT 1';
  const result = await executor.query<{ id: string }>(sql, params);
  if (result.rows[0]) {
    throw new AppError('An OPS cuenta de cobro already exists for vinculacion and periodo', 409, 'NOMINA_CUENTA_COBRO_OPS_DUPLICADA');
  }
};

const replaceDetalles = async (client: PoolClient, cuentaId: number, detalleRows: Array<CuentaCobroOpsDetalleInput & { orden: number; subtotal: number }>): Promise<void> => {
  await client.query('DELETE FROM nomina_cuenta_cobro_ops_detalle WHERE cuenta_cobro_ops_id = $1::bigint', [cuentaId]);
  for (const detalle of detalleRows) {
    await client.query(
      `
        INSERT INTO nomina_cuenta_cobro_ops_detalle (
          cuenta_cobro_ops_id, concepto, cantidad, valor_unitario, subtotal, observacion, orden, activo, created_at, updated_at
        )
        VALUES ($1::bigint, $2, $3::numeric, $4::numeric, $5::numeric, $6, $7::int, TRUE, NOW(), NOW())
      `,
      [cuentaId, detalle.concepto, detalle.cantidad, detalle.valor_unitario, detalle.subtotal, detalle.observacion ?? null, detalle.orden]
    );
  }
};

const recordCuentaCobroOpsAudit = async (input: {
  action: string;
  actorUserId: string;
  after?: CuentaCobroOpsItem;
  before?: CuentaCobroOpsItem;
  client?: PoolClient;
  descripcion: string;
  id: number;
  meta?: AuditRequestMeta;
}): Promise<void> => {
  await registerAuditEntry({
    client: input.client,
    usuario_id: input.actorUserId,
    accion: input.action,
    tabla: 'nomina_cuentas_cobro_ops',
    registro_id: String(input.id),
    descripcion: input.descripcion,
    before: input.before,
    after: input.after,
    ip: input.meta?.ip ?? null,
    user_agent: input.meta?.user_agent ?? null
  });
};

export const listCuentasCobroOps = async (query: ListCuentasCobroOpsQuery, tenant?: TenantAccessContext): Promise<PaginatedCuentasCobroOps> => {
  const scope = tenant
    ? buildTenantWhereClause({ contratoColumn: 'ncco.contrato_id', empresaColumn: 'ncco.empresa_id', tenant })
    : { params: [], sql: '' };
  const filters: string[] = [];
  const params: unknown[] = [...scope.params];
  if (query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(ncco.activo, TRUE) = $${params.length}`);
  }
  if (query.empresa_id) {
    params.push(query.empresa_id);
    filters.push(`ncco.empresa_id = $${params.length}::bigint`);
  }
  if (query.contrato_id) {
    params.push(query.contrato_id);
    filters.push(`ncco.contrato_id = $${params.length}::bigint`);
  }
  if (query.periodo_id) {
    params.push(query.periodo_id);
    filters.push(`ncco.periodo_id = $${params.length}::bigint`);
  }
  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    filters.push(`ncco.vinculacion_id = $${params.length}::bigint`);
  }
  if (query.persona_id) {
    params.push(query.persona_id);
    filters.push(`v.persona_id = $${params.length}::bigint`);
  }
  if (query.estado) {
    params.push(query.estado);
    filters.push(`ncco.estado = $${params.length}`);
  }
  if (query.metodo_pago) {
    params.push(query.metodo_pago);
    filters.push(`v.metodo_pago = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(
      CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) ILIKE $${params.length}
      OR p.numero_documento ILIKE $${params.length}
      OR COALESCE(c.numero_contrato, '') ILIKE $${params.length}
      OR ncco.numero_cuenta::text ILIKE $${params.length}
    )`);
  }
  const conditions: string[] = [];
  if (scope.sql) {
    conditions.push(scope.sql.replace(/^WHERE\s+/i, '').trim());
  }
  conditions.push(...filters);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await dbQuery<CountRow>(
    `SELECT COUNT(*)::int AS total FROM nomina_cuentas_cobro_ops ncco INNER JOIN vinculaciones v ON v.id = ncco.vinculacion_id INNER JOIN personas p ON p.id = v.persona_id INNER JOIN contratos c ON c.id = ncco.contrato_id ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const rows = await dbQuery<CuentaCobroOpsRow>(
    `${getCuentaCobroOpsSelect()} ${whereClause} ORDER BY ncco.created_at DESC, ncco.id DESC LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int`,
    listParams
  );
  const cuentaIds = rows.rows.map((row) => toNumber(row.id));
  const detallesResult = cuentaIds.length > 0
    ? await dbQuery<CuentaCobroOpsDetalleRow>(`${getCuentaCobroOpsDetalleSelect()} WHERE cuenta_cobro_ops_id = ANY($1::bigint[]) ORDER BY orden ASC, id ASC`, [cuentaIds])
    : { rows: [] as CuentaCobroOpsDetalleRow[] };
  const detallesByCuenta = new Map<number, CuentaCobroOpsDetalleItem[]>();
  for (const detalle of detallesResult.rows) {
    const cuentaId = toNumber(detalle.cuenta_cobro_ops_id);
    const current = detallesByCuenta.get(cuentaId) ?? [];
    current.push(mapDetalle(detalle));
    detallesByCuenta.set(cuentaId, current);
  }
  return {
    items: rows.rows.map((row) => mapCuentaCobroOps(row, detallesByCuenta.get(toNumber(row.id)) ?? [])),
    pagination: { page: query.page, limit: query.limit, total, total_pages: total === 0 ? 0 : Math.ceil(total / query.limit) }
  };
};

export const getCuentaCobroOpsById = async (id: number, tenant?: TenantAccessContext): Promise<CuentaCobroOpsItem> =>
  loadCuentaCobroOpsOrThrow(id, tenant);
export const createCuentaCobroOps = async (
  input: CreateCuentaCobroOpsInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CuentaCobroOpsItem> => {
  const actorId = Number(actorUserId);
  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return runInTransaction(async (client) => {
    const vinculacion = await loadVinculacionOpsContextOrThrow(input.vinculacion_id, tenant, client);
    const periodo = await ensurePeriodoExists(String(input.periodo_id), client);
    assertPeriodoMatchesVinculacion(periodo, vinculacion, input.empresa_id, input.contrato_id);
    assertVinculacionIsOps(vinculacion, periodo);
    assertDatesWithinPeriodo(periodo, input.fecha_inicio, input.fecha_fin);
    assertMethodSpecificRules(vinculacion.metodo_pago, input.detalles);
    await assertNoDuplicateCuenta(input.vinculacion_id, input.periodo_id, undefined, client);

    if (input.documento_id !== null) {
      await assertDocumentoCompatible(input.documento_id, input.vinculacion_id, client);
    }

    if (input.estado === 'APROBADA' || input.estado === 'PAGADA' || input.estado === 'ANULADA') {
      throw new AppError('Cuenta de cobro must be created in a draft or review state', 400, 'NOMINA_CUENTA_COBRO_OPS_ESTADO_CREACION_INVALIDO');
    }

    const descuentos = roundMoney(input.descuentos ?? 0);
    const totals = calculateTotals({ detalles: input.detalles, descuentos, valorBruto: input.valor_bruto ?? 0 });
    const createdResult = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_cuentas_cobro_ops (
          vinculacion_id, periodo_id, empresa_id, contrato_id, documento_id, numero_cuenta, fecha_generacion,
          fecha_inicio, fecha_fin, valor_bruto, descuentos, valor_neto, estado, observaciones,
          activo, created_at, updated_at, created_by, updated_by
        )
        VALUES (
          $1::bigint, $2::bigint, $3::bigint, $4::bigint, $5::bigint,
          COALESCE($6::bigint, nextval('nomina_cuentas_cobro_ops_numero_seq')),
          COALESCE($7::date, CURRENT_DATE), $8::date, $9::date, $10::numeric, $11::numeric, $12::numeric,
          $13, $14, TRUE, NOW(), NOW(), $15::bigint, $15::bigint
        )
        RETURNING id::text AS id
      `,
      [
        input.vinculacion_id,
        input.periodo_id,
        input.empresa_id,
        input.contrato_id,
        input.documento_id,
        input.numero_cuenta,
        input.fecha_generacion ?? null,
        input.fecha_inicio,
        input.fecha_fin,
        totals.valorBruto,
        descuentos,
        totals.valorNeto,
        input.estado,
        input.observaciones,
        actorId
      ]
    );

    const createdId = createdResult.rows[0] ? toNumber(createdResult.rows[0].id) : null;
    if (createdId === null) {
      throw new AppError('Failed to create OPS cuenta de cobro', 500, 'NOMINA_CUENTA_COBRO_OPS_CREATE_FAILED');
    }

    await replaceDetalles(client, createdId, totals.detalleRows);
    const created = await loadCuentaCobroOpsOrThrow(createdId, tenant, client);
    await recordCuentaCobroOpsAudit({
      action: 'NOMINA_CUENTA_COBRO_OPS_CREATE',
      actorUserId,
      after: created,
      client,
      descripcion: 'Creacion de cuenta de cobro OPS',
      id: createdId,
      meta: auditMeta
    });
    return created;
  });
};

const assertCuentaEditable = (current: CuentaCobroOpsItem): void => {
  if (current.estado === 'PAGADA' || current.estado === 'ANULADA') {
    throw new AppError('Paid or cancelled OPS cuentas de cobro cannot be edited', 409, 'NOMINA_CUENTA_COBRO_OPS_ESTADO_BLOQUEADO');
  }
};

export const updateCuentaCobroOps = async (
  id: number,
  input: UpdateCuentaCobroOpsInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CuentaCobroOpsItem> => {
  const actorId = Number(actorUserId);
  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  const current = await loadCuentaCobroOpsOrThrow(id, tenant);
  assertCuentaEditable(current);

  return runInTransaction(async (client) => {
    const nextEmpresaId = input.empresa_id ?? current.empresa.id;
    const nextContratoId = input.contrato_id ?? current.contrato.id;
    const nextVinculacionId = input.vinculacion_id ?? current.vinculacion.id;
    const nextPeriodoId = input.periodo_id ?? current.periodo.id;
    const nextFechaInicio = input.fecha_inicio ?? current.fechas.fecha_inicio;
    const nextFechaFin = input.fecha_fin ?? current.fechas.fecha_fin;
    const nextFechaGeneracion = input.fecha_generacion ?? current.fechas.fecha_generacion;
    const nextDocumentoId = input.documento_id === undefined ? current.documento?.id ?? null : input.documento_id;
    const nextNumeroCuenta = input.numero_cuenta === undefined ? current.numero_cuenta : input.numero_cuenta;
    const nextObservaciones = input.observaciones === undefined ? current.observaciones : input.observaciones;
    const nextActivo = input.activo ?? current.activo;
    const nextDescuentos = roundMoney(input.descuentos ?? current.valores.descuentos);
    const nextDetallesInput = input.detalles ?? current.detalles.map((detalle) => ({
      concepto: detalle.concepto,
      cantidad: detalle.cantidad,
      valor_unitario: detalle.valor_unitario,
      observacion: detalle.observacion,
      orden: detalle.orden
    }));

    const vinculacion = await loadVinculacionOpsContextOrThrow(nextVinculacionId, tenant, client);
    const periodo = await ensurePeriodoExists(String(nextPeriodoId), client);
    assertPeriodoMatchesVinculacion(periodo, vinculacion, nextEmpresaId, nextContratoId);
    assertVinculacionIsOps(vinculacion, periodo);
    assertDatesWithinPeriodo(periodo, nextFechaInicio, nextFechaFin);
    assertMethodSpecificRules(vinculacion.metodo_pago, nextDetallesInput);
    await assertNoDuplicateCuenta(nextVinculacionId, nextPeriodoId, id, client);

    if (nextDocumentoId !== null) {
      await assertDocumentoCompatible(nextDocumentoId, nextVinculacionId, client);
    }

    const totals = calculateTotals({
      detalles: nextDetallesInput,
      descuentos: nextDescuentos,
      valorBruto: input.valor_bruto ?? current.valores.valor_bruto
    });

    await client.query(
      `
        UPDATE nomina_cuentas_cobro_ops
        SET
          vinculacion_id = $2::bigint,
          periodo_id = $3::bigint,
          empresa_id = $4::bigint,
          contrato_id = $5::bigint,
          documento_id = $6::bigint,
          numero_cuenta = $7::bigint,
          fecha_generacion = $8::date,
          fecha_inicio = $9::date,
          fecha_fin = $10::date,
          valor_bruto = $11::numeric,
          descuentos = $12::numeric,
          valor_neto = $13::numeric,
          observaciones = $14,
          activo = $15,
          updated_at = NOW(),
          updated_by = $16::bigint
        WHERE id = $1::bigint
      `,
      [
        id,
        nextVinculacionId,
        nextPeriodoId,
        nextEmpresaId,
        nextContratoId,
        nextDocumentoId,
        nextNumeroCuenta,
        nextFechaGeneracion,
        nextFechaInicio,
        nextFechaFin,
        totals.valorBruto,
        nextDescuentos,
        totals.valorNeto,
        nextObservaciones,
        nextActivo,
        actorId
      ]
    );

    await replaceDetalles(client, id, totals.detalleRows);
    const updated = await loadCuentaCobroOpsOrThrow(id, tenant, client);
    await recordCuentaCobroOpsAudit({
      action: 'NOMINA_CUENTA_COBRO_OPS_UPDATE',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Actualizacion de cuenta de cobro OPS',
      id,
      meta: auditMeta
    });
    return updated;
  });
};
const assertTransitionAllowed = (current: CuentaCobroOpsEstado, next: CuentaCobroOpsEstado): void => {
  if (current === next) {
    return;
  }
  if (current === 'PAGADA' || current === 'ANULADA') {
    throw new AppError('Paid or cancelled OPS cuentas de cobro cannot change state', 409, 'NOMINA_CUENTA_COBRO_OPS_ESTADO_FINAL');
  }
  if (next === 'PAGADA' && current !== 'APROBADA') {
    throw new AppError('Only approved OPS cuentas de cobro can be marked as paid', 409, 'NOMINA_CUENTA_COBRO_OPS_PAGO_INVALIDO');
  }
};

export const changeCuentaCobroOpsEstado = async (
  id: number,
  input: ChangeCuentaCobroOpsEstadoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CuentaCobroOpsItem> => {
  const actorId = Number(actorUserId);
  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  const current = await loadCuentaCobroOpsOrThrow(id, tenant);
  assertTransitionAllowed(current.estado, input.estado);
  if ((input.estado === 'APROBADA' || input.estado === 'PAGADA') && current.valores.valor_neto <= 0) {
    throw new AppError('A valid valor_neto is required before approval or payment', 409, 'NOMINA_CUENTA_COBRO_OPS_NETO_INVALIDO');
  }

  return runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_cuentas_cobro_ops
        SET estado = $2, observaciones = COALESCE($3, observaciones), updated_at = NOW(), updated_by = $4::bigint
        WHERE id = $1::bigint
      `,
      [id, input.estado, input.observaciones, actorId]
    );

    const updated = await loadCuentaCobroOpsOrThrow(id, tenant, client);
    const auditAction =
      input.estado === 'APROBADA'
        ? 'NOMINA_CUENTA_COBRO_OPS_APPROVE'
        : input.estado === 'PAGADA'
          ? 'NOMINA_CUENTA_COBRO_OPS_PAY'
          : input.estado === 'ANULADA'
            ? 'NOMINA_CUENTA_COBRO_OPS_CANCEL'
            : 'NOMINA_CUENTA_COBRO_OPS_STATE_CHANGE';

    await recordCuentaCobroOpsAudit({
      action: auditAction,
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: `Cambio de estado de cuenta de cobro OPS a ${input.estado}`,
      id,
      meta: auditMeta
    });
    return updated;
  });
};

export const deactivateCuentaCobroOps = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<CuentaCobroOpsItem> => {
  const actorId = Number(actorUserId);
  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  const current = await loadCuentaCobroOpsOrThrow(id, tenant);
  assertCuentaEditable(current);
  if (!current.activo) {
    return current;
  }

  return runInTransaction(async (client) => {
    await client.query(
      `UPDATE nomina_cuentas_cobro_ops SET activo = FALSE, updated_at = NOW(), updated_by = $2::bigint WHERE id = $1::bigint`,
      [id, actorId]
    );
    const updated = await loadCuentaCobroOpsOrThrow(id, tenant, client);
    await recordCuentaCobroOpsAudit({
      action: 'NOMINA_CUENTA_COBRO_OPS_DEACTIVATE',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Desactivacion de cuenta de cobro OPS',
      id,
      meta: auditMeta
    });
    return updated;
  });
};
