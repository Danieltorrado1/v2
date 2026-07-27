import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import {
  assertTenantAccessForVinculacionId,
  buildTenantWhereClause,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { ensurePeriodoExists, ensureVinculacionExists } from './nomina.validator';
import {
  NOMINA_CORRECCION_APPLY_UNAVAILABLE_REASON,
  NOMINA_CORRECCION_EDITABLE_STATES,
  calculateNominaCorreccionDifference,
  canTransitionNominaCorreccion,
  type NominaCorreccionEstado,
  type NominaCorreccionTipo
} from './correcciones.constants';
import type {
  AprobarNominaCorreccionInput,
  CreateNominaCorreccionInput,
  ListNominaCorreccionesQuery,
  RevisarNominaCorreccionInput,
  RechazarNominaCorreccionInput,
  SolicitarNominaCorreccionInput,
  UpdateNominaCorreccionInput
} from './correcciones.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface NominaCorreccionRow extends QueryResultRow {
  activo: boolean;
  aplicado_por: string | null;
  aprobado_por: string | null;
  concepto: string;
  contrato_id: string;
  created_at: Date | string;
  desprendible_origen_id: string | null;
  desprendible_resultado_id: string | null;
  diferencia: number | string;
  empresa_id: string;
  estado: NominaCorreccionEstado;
  fecha_aplicacion: Date | string | null;
  fecha_aprobacion: Date | string | null;
  fecha_revision: Date | string | null;
  fecha_solicitud: Date | string | null;
  id: string;
  liquidacion_id: string | null;
  motivo: string;
  movimiento_id: string | null;
  nombre_periodo: string;
  nomina_empleado_id: string;
  novedad_id: string | null;
  observacion_revision: string | null;
  periodo_estado: string;
  periodo_id: string;
  persona_id: string;
  persona_nombre: string | null;
  persona_numero_documento: string | null;
  revisado_por: string | null;
  solicitado_por: string | null;
  tipo_correccion: NominaCorreccionTipo;
  updated_at: Date | string;
  valor_anterior: number | string;
  valor_nuevo: number | string;
  vinculacion_id: string;
}

interface NominaEmpleadoContextRow extends QueryResultRow {
  contrato_id: string;
  empresa_id: string;
  id: string;
  periodo_estado: string;
  periodo_id: string;
  persona_id: string;
  vinculacion_id: string;
}

interface MovimientoContextRow extends QueryResultRow {
  id: string;
  nomina_empleado_id: string;
  periodo_id: string;
  vinculacion_id: string;
}

interface NovedadContextRow extends QueryResultRow {
  id: string;
  nomina_empleado_id: string;
  periodo_id: string;
  vinculacion_id: string;
}

interface LiquidacionContextRow extends QueryResultRow {
  id: string;
  periodo_id: string;
  vinculacion_id: string;
}

interface DesprendibleContextRow extends QueryResultRow {
  id: string;
  nomina_empleado_id: string;
  periodo_id: string;
  vinculacion_id: string;
}

interface NominaCorreccionMutationPayload {
  concepto: string;
  desprendible_origen_id: number | null;
  liquidacion_id: number | null;
  movimiento_id: number | null;
  motivo: string;
  nomina_empleado_id: number;
  novedad_id: number | null;
  periodo_id: number;
  tipo_correccion: NominaCorreccionTipo;
  valor_anterior: number;
  valor_nuevo: number;
  vinculacion_id: number;
}

export interface NominaCorreccionItem {
  activo: boolean;
  aplicacion: {
    motivo: string | null;
    soportada: boolean;
  };
  actores: {
    aplicado_por: number | null;
    aprobado_por: number | null;
    revisado_por: number | null;
    solicitado_por: number | null;
  };
  concepto: string;
  created_at: string;
  empleado: {
    nombre_completo: string | null;
    nomina_empleado_id: number;
    numero_documento: string | null;
    persona_id: number;
    vinculacion_id: number;
  };
  estado: NominaCorreccionEstado;
  fechas: {
    fecha_aplicacion: string | null;
    fecha_aprobacion: string | null;
    fecha_revision: string | null;
    fecha_solicitud: string | null;
  };
  id: number;
  motivo: string;
  observacion_revision: string | null;
  periodo: {
    contrato_id: number;
    empresa_id: number;
    estado: string;
    id: number;
    nombre_periodo: string;
  };
  referencias: {
    desprendible_origen_id: number | null;
    desprendible_resultado_id: number | null;
    liquidacion_id: number | null;
    movimiento_id: number | null;
    novedad_id: number | null;
  };
  tipo_correccion: NominaCorreccionTipo;
  updated_at: string;
  valores: {
    diferencia: number;
    valor_anterior: number;
    valor_nuevo: number;
  };
}

export interface PaginatedNominaCorrecciones {
  items: NominaCorreccionItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

type QueryExecutor = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
};

const DEACTIVATABLE_STATES = new Set<NominaCorreccionEstado>(['BORRADOR', 'RECHAZADA', 'ANULADA']);

const getExecutor = (client?: PoolClient): QueryExecutor =>
  client
    ? {
        query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
          client.query<T>(text, params)
      }
    : {
        query: dbQuery
      };

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

const toDateTimeString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
};

const normalizeName = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
};

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
  tenant?: TenantAccessContext
): { params: unknown[]; sql: string } => {
  if (!tenant) {
    return { params: [], sql: '' };
  }

  return buildTenantWhereClause({
    contratoColumn: 'np.contrato_id',
    empresaColumn: 'c.empresa_id',
    tenant
  });
};

const getNominaCorreccionSelect = (): string => `
  SELECT
    nc.id::text AS id,
    nc.periodo_id::text AS periodo_id,
    nc.nomina_empleado_id::text AS nomina_empleado_id,
    nc.vinculacion_id::text AS vinculacion_id,
    nc.tipo_correccion,
    nc.concepto,
    nc.motivo,
    nc.valor_anterior,
    nc.valor_nuevo,
    nc.diferencia,
    nc.estado,
    nc.observacion_revision,
    nc.solicitado_por::text AS solicitado_por,
    nc.revisado_por::text AS revisado_por,
    nc.aprobado_por::text AS aprobado_por,
    nc.aplicado_por::text AS aplicado_por,
    nc.fecha_solicitud,
    nc.fecha_revision,
    nc.fecha_aprobacion,
    nc.fecha_aplicacion,
    nc.movimiento_id::text AS movimiento_id,
    nc.novedad_id::text AS novedad_id,
    nc.liquidacion_id::text AS liquidacion_id,
    nc.desprendible_origen_id::text AS desprendible_origen_id,
    nc.desprendible_resultado_id::text AS desprendible_resultado_id,
    nc.activo,
    nc.created_at,
    nc.updated_at,
    np.nombre_periodo,
    np.estado AS periodo_estado,
    np.contrato_id::text AS contrato_id,
    c.empresa_id::text AS empresa_id,
    p.id::text AS persona_id,
    p.numero_documento AS persona_numero_documento,
    CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre
  FROM nomina_correcciones nc
  INNER JOIN nomina_periodos np ON np.id = nc.periodo_id
  INNER JOIN contratos c ON c.id = np.contrato_id
  INNER JOIN nomina_empleados ne ON ne.id = nc.nomina_empleado_id
  INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
`;

const mapNominaCorreccion = (row: NominaCorreccionRow): NominaCorreccionItem => ({
  id: toNumber(row.id),
  periodo: {
    id: toNumber(row.periodo_id),
    nombre_periodo: row.nombre_periodo,
    estado: row.periodo_estado,
    contrato_id: toNumber(row.contrato_id),
    empresa_id: toNumber(row.empresa_id)
  },
  empleado: {
    nomina_empleado_id: toNumber(row.nomina_empleado_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    persona_id: toNumber(row.persona_id),
    nombre_completo: normalizeName(row.persona_nombre),
    numero_documento: row.persona_numero_documento
  },
  tipo_correccion: row.tipo_correccion,
  concepto: row.concepto,
  motivo: row.motivo,
  valores: {
    valor_anterior: toNumber(row.valor_anterior),
    valor_nuevo: toNumber(row.valor_nuevo),
    diferencia: toNumber(row.diferencia)
  },
  estado: row.estado,
  observacion_revision: row.observacion_revision,
  actores: {
    solicitado_por: toNullableNumber(row.solicitado_por),
    revisado_por: toNullableNumber(row.revisado_por),
    aprobado_por: toNullableNumber(row.aprobado_por),
    aplicado_por: toNullableNumber(row.aplicado_por)
  },
  fechas: {
    fecha_solicitud: toDateTimeString(row.fecha_solicitud),
    fecha_revision: toDateTimeString(row.fecha_revision),
    fecha_aprobacion: toDateTimeString(row.fecha_aprobacion),
    fecha_aplicacion: toDateTimeString(row.fecha_aplicacion)
  },
  referencias: {
    movimiento_id: toNullableNumber(row.movimiento_id),
    novedad_id: toNullableNumber(row.novedad_id),
    liquidacion_id: toNullableNumber(row.liquidacion_id),
    desprendible_origen_id: toNullableNumber(row.desprendible_origen_id),
    desprendible_resultado_id: toNullableNumber(row.desprendible_resultado_id)
  },
  activo: row.activo,
  created_at: toDateTimeString(row.created_at) ?? '',
  updated_at: toDateTimeString(row.updated_at) ?? '',
  aplicacion: {
    soportada: false,
    motivo: NOMINA_CORRECCION_APPLY_UNAVAILABLE_REASON
  }
});

const loadNominaCorreccionRowOrThrow = async (
  id: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaCorreccionRow> => {
  const executor = getExecutor(client);
  const scope = buildTenantScope(tenant);
  const idParamIndex = scope.params.length + 1;
  const result = await executor.query<NominaCorreccionRow>(
    `${getNominaCorreccionSelect()} ${scope.sql} ${scope.sql ? 'AND' : 'WHERE'} nc.id = $${idParamIndex}::bigint LIMIT 1`,
    [...scope.params, id]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Payroll correction not found', 404, 'NOMINA_CORRECCION_NOT_FOUND');
  }

  return row;
};

const loadNominaCorreccionOrThrow = async (
  id: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaCorreccionItem> => mapNominaCorreccion(await loadNominaCorreccionRowOrThrow(id, tenant, client));

const loadNominaEmpleadoContextOrThrow = async (
  nominaEmpleadoId: number,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaEmpleadoContextRow> => {
  const executor = getExecutor(client);
  const scope = buildTenantScope(tenant);
  const idParamIndex = scope.params.length + 1;
  const result = await executor.query<NominaEmpleadoContextRow>(
    `
      SELECT
        ne.id::text AS id,
        ne.periodo_id::text AS periodo_id,
        ne.vinculacion_id::text AS vinculacion_id,
        np.estado AS periodo_estado,
        np.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        v.persona_id::text AS persona_id
      FROM nomina_empleados ne
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      ${scope.sql}
      ${scope.sql ? 'AND' : 'WHERE'} ne.id = $${idParamIndex}::bigint
      LIMIT 1
    `,
    [...scope.params, nominaEmpleadoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Payroll employee not found', 404, 'NOMINA_EMPLEADO_NOT_FOUND');
  }

  return row;
};

const loadMovimientoContextOrThrow = async (
  movimientoId: number,
  client?: PoolClient
): Promise<MovimientoContextRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<MovimientoContextRow>(
    `
      SELECT
        id::text AS id,
        periodo_id::text AS periodo_id,
        nomina_empleado_id::text AS nomina_empleado_id,
        vinculacion_id::text AS vinculacion_id
      FROM nomina_movimientos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [movimientoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Payroll movement not found', 400, 'NOMINA_CORRECCION_MOVIMIENTO_NOT_FOUND');
  }

  return row;
};

const loadNovedadContextOrThrow = async (
  novedadId: number,
  client?: PoolClient
): Promise<NovedadContextRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<NovedadContextRow>(
    `
      SELECT
        id::text AS id,
        periodo_id::text AS periodo_id,
        nomina_empleado_id::text AS nomina_empleado_id,
        vinculacion_id::text AS vinculacion_id
      FROM nomina_novedades
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [novedadId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Payroll novelty not found', 400, 'NOMINA_CORRECCION_NOVEDAD_NOT_FOUND');
  }

  return row;
};

const loadLiquidacionContextOrThrow = async (
  liquidacionId: number,
  client?: PoolClient
): Promise<LiquidacionContextRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<LiquidacionContextRow>(
    `
      SELECT
        id::text AS id,
        periodo_id::text AS periodo_id,
        vinculacion_id::text AS vinculacion_id
      FROM nomina_liquidaciones
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [liquidacionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Payroll liquidation not found', 400, 'NOMINA_CORRECCION_LIQUIDACION_NOT_FOUND');
  }

  return row;
};

const loadDesprendibleContextOrThrow = async (
  desprendibleId: number,
  client?: PoolClient
): Promise<DesprendibleContextRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<DesprendibleContextRow>(
    `
      SELECT
        id::text AS id,
        periodo_id::text AS periodo_id,
        nomina_empleado_id::text AS nomina_empleado_id,
        vinculacion_id::text AS vinculacion_id
      FROM nomina_desprendibles
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [desprendibleId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Payroll slip not found', 400, 'NOMINA_CORRECCION_DESPRENDIBLE_NOT_FOUND');
  }

  return row;
};

const assertReferenceMatchesEmpleado = (
  resource: {
    nomina_empleado_id: string;
    periodo_id: string;
    vinculacion_id: string;
  },
  payload: NominaCorreccionMutationPayload,
  code: string,
  resourceName: string
): void => {
  if (
    toNumber(resource.periodo_id) !== payload.periodo_id ||
    toNumber(resource.nomina_empleado_id) !== payload.nomina_empleado_id ||
    toNumber(resource.vinculacion_id) !== payload.vinculacion_id
  ) {
    throw new AppError(
      `${resourceName} does not belong to the selected payroll employee`,
      400,
      code
    );
  }
};

const assertReferenceMatchesVinculacion = (
  resource: {
    periodo_id: string;
    vinculacion_id: string;
  },
  payload: NominaCorreccionMutationPayload,
  code: string,
  resourceName: string
): void => {
  if (
    toNumber(resource.periodo_id) !== payload.periodo_id ||
    toNumber(resource.vinculacion_id) !== payload.vinculacion_id
  ) {
    throw new AppError(
      `${resourceName} does not belong to the selected vinculacion`,
      400,
      code
    );
  }
};

const assertCorrectionStateEditable = (estado: NominaCorreccionEstado): void => {
  if (!NOMINA_CORRECCION_EDITABLE_STATES.some((item) => item === estado)) {
    throw new AppError(
      'Only draft or requested payroll corrections can be edited',
      409,
      'NOMINA_CORRECCION_ESTADO_BLOQUEADO'
    );
  }
};

const assertTransitionAllowed = (
  current: NominaCorreccionEstado,
  next: NominaCorreccionEstado
): void => {
  if (!canTransitionNominaCorreccion(current, next)) {
    throw new AppError(
      `Invalid payroll correction transition from ${current} to ${next}`,
      409,
      'NOMINA_CORRECCION_TRANSICION_INVALIDA'
    );
  }
};

const assertActiveCorrection = (item: NominaCorreccionItem): void => {
  if (!item.activo) {
    throw new AppError('Inactive payroll corrections cannot change state', 409, 'NOMINA_CORRECCION_INACTIVA');
  }
};

const buildMutationPayloadFromItem = (item: NominaCorreccionItem): NominaCorreccionMutationPayload => ({
  periodo_id: item.periodo.id,
  nomina_empleado_id: item.empleado.nomina_empleado_id,
  vinculacion_id: item.empleado.vinculacion_id,
  tipo_correccion: item.tipo_correccion,
  concepto: item.concepto,
  motivo: item.motivo,
  valor_anterior: item.valores.valor_anterior,
  valor_nuevo: item.valores.valor_nuevo,
  movimiento_id: item.referencias.movimiento_id,
  novedad_id: item.referencias.novedad_id,
  liquidacion_id: item.referencias.liquidacion_id,
  desprendible_origen_id: item.referencias.desprendible_origen_id
});

const recordNominaCorreccionAudit = async (input: {
  action: string;
  actorUserId: string;
  after?: NominaCorreccionItem;
  before?: NominaCorreccionItem;
  client?: PoolClient;
  descripcion: string;
  id: number;
  meta?: AuditRequestMeta;
}): Promise<void> => {
  await registerAuditEntry({
    accion: input.action,
    after: input.after,
    before: input.before,
    client: input.client,
    descripcion: input.descripcion,
    ip: input.meta?.ip ?? null,
    registro_id: String(input.id),
    tabla: 'nomina_correcciones',
    user_agent: input.meta?.user_agent ?? null,
    usuario_id: input.actorUserId
  });
};

const assertNoDuplicateCorrection = async (
  payload: NominaCorreccionMutationPayload,
  excludedId?: number,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const params: unknown[] = [
    payload.periodo_id,
    payload.nomina_empleado_id,
    payload.vinculacion_id,
    payload.tipo_correccion,
    payload.concepto,
    payload.movimiento_id,
    payload.novedad_id,
    payload.liquidacion_id,
    payload.desprendible_origen_id
  ];

  let sql = `
    SELECT id::text AS id
    FROM nomina_correcciones
    WHERE periodo_id = $1::bigint
      AND nomina_empleado_id = $2::bigint
      AND vinculacion_id = $3::bigint
      AND tipo_correccion = $4
      AND lower(concepto) = lower($5)
      AND COALESCE(movimiento_id, 0) = COALESCE($6::bigint, 0)
      AND COALESCE(novedad_id, 0) = COALESCE($7::bigint, 0)
      AND COALESCE(liquidacion_id, 0) = COALESCE($8::bigint, 0)
      AND COALESCE(desprendible_origen_id, 0) = COALESCE($9::bigint, 0)
      AND COALESCE(activo, TRUE) = TRUE
      AND estado IN ('BORRADOR', 'SOLICITADA', 'EN_REVISION', 'APROBADA')
  `;

  if (excludedId !== undefined) {
    params.push(excludedId);
    sql += ` AND id <> $${params.length}::bigint`;
  }

  sql += ' LIMIT 1';

  const result = await executor.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError(
      'An active payroll correction already exists for the selected resource and concept',
      409,
      'NOMINA_CORRECCION_DUPLICADA'
    );
  }
};

const validateNominaCorreccionPayload = async (
  payload: NominaCorreccionMutationPayload,
  tenant?: TenantAccessContext,
  client?: PoolClient,
  excludedId?: number
): Promise<{ diferencia: number }> => {
  await assertTenantAccessForVinculacionId(tenant, payload.vinculacion_id);

  const periodo = await ensurePeriodoExists(String(payload.periodo_id), client);

  if (periodo.estado === 'ANULADO') {
    throw new AppError('Cancelled payroll periods do not accept corrections', 409, 'NOMINA_CORRECCION_PERIODO_ANULADO');
  }

  const empleado = await loadNominaEmpleadoContextOrThrow(payload.nomina_empleado_id, tenant, client);

  if (toNumber(empleado.periodo_id) !== payload.periodo_id) {
    throw new AppError(
      'Payroll employee does not belong to the selected period',
      400,
      'NOMINA_CORRECCION_EMPLEADO_PERIODO_INVALIDO'
    );
  }

  if (toNumber(empleado.vinculacion_id) !== payload.vinculacion_id) {
    throw new AppError(
      'Vinculacion does not match the selected payroll employee',
      400,
      'NOMINA_CORRECCION_VINCULACION_INVALIDA'
    );
  }

  const vinculacion = await ensureVinculacionExists(String(payload.vinculacion_id), client);

  if (vinculacion.contrato_id !== periodo.contrato_id || vinculacion.empresa_id !== periodo.empresa_id) {
    throw new AppError(
      'Vinculacion does not belong to the payroll period contract',
      400,
      'NOMINA_CORRECCION_VINCULACION_PERIODO_INVALIDA'
    );
  }

  if (payload.movimiento_id !== null) {
    const movimiento = await loadMovimientoContextOrThrow(payload.movimiento_id, client);
    assertReferenceMatchesEmpleado(
      movimiento,
      payload,
      'NOMINA_CORRECCION_MOVIMIENTO_INCONSISTENTE',
      'Payroll movement'
    );
  }

  if (payload.novedad_id !== null) {
    const novedad = await loadNovedadContextOrThrow(payload.novedad_id, client);
    assertReferenceMatchesEmpleado(
      novedad,
      payload,
      'NOMINA_CORRECCION_NOVEDAD_INCONSISTENTE',
      'Payroll novelty'
    );
  }

  if (payload.liquidacion_id !== null) {
    const liquidacion = await loadLiquidacionContextOrThrow(payload.liquidacion_id, client);
    assertReferenceMatchesVinculacion(
      liquidacion,
      payload,
      'NOMINA_CORRECCION_LIQUIDACION_INCONSISTENTE',
      'Payroll liquidation'
    );
  }

  if (payload.desprendible_origen_id !== null) {
    const desprendible = await loadDesprendibleContextOrThrow(payload.desprendible_origen_id, client);
    assertReferenceMatchesEmpleado(
      desprendible,
      payload,
      'NOMINA_CORRECCION_DESPRENDIBLE_INCONSISTENTE',
      'Payroll slip'
    );
  }

  await assertNoDuplicateCorrection(payload, excludedId, client);

  return {
    diferencia: calculateNominaCorreccionDifference(payload.valor_anterior, payload.valor_nuevo)
  };
};

export const listNominaCorrecciones = async (
  query: ListNominaCorreccionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedNominaCorrecciones> => {
  const scope = buildTenantScope(tenant);
  const params: unknown[] = [...scope.params];
  const filters: string[] = [];

  if (query.periodo_id) {
    params.push(query.periodo_id);
    filters.push(`nc.periodo_id = $${params.length}::bigint`);
  }

  if (query.nomina_empleado_id) {
    params.push(query.nomina_empleado_id);
    filters.push(`nc.nomina_empleado_id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    filters.push(`nc.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    filters.push(`nc.estado = $${params.length}`);
  }

  if (query.tipo_correccion) {
    params.push(query.tipo_correccion);
    filters.push(`nc.tipo_correccion = $${params.length}`);
  }

  if (query.activo !== undefined) {
    params.push(query.activo);
    filters.push(`COALESCE(nc.activo, TRUE) = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    filters.push(`(
      nc.concepto ILIKE $${params.length}
      OR nc.motivo ILIKE $${params.length}
      OR COALESCE(nc.observacion_revision, '') ILIKE $${params.length}
      OR COALESCE(p.numero_documento, '') ILIKE $${params.length}
      OR COALESCE(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido), '') ILIKE $${params.length}
      OR np.nombre_periodo ILIKE $${params.length}
    )`);
  }

  const conditionParts: string[] = [];

  if (scope.sql) {
    conditionParts.push(scope.sql.replace(/^WHERE\s+/i, '').trim());
  }

  conditionParts.push(...filters);
  const whereSql = conditionParts.length > 0 ? `WHERE ${conditionParts.join(' AND ')}` : '';

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_correcciones nc
      INNER JOIN nomina_periodos np ON np.id = nc.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      INNER JOIN nomina_empleados ne ON ne.id = nc.nomina_empleado_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaCorreccionRow>(
    `
      ${getNominaCorreccionSelect()}
      ${whereSql}
      ORDER BY nc.created_at DESC, nc.id DESC
      LIMIT $${listParams.length - 1}::int
      OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return {
    items: result.rows.map(mapNominaCorreccion),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const getNominaCorreccionById = async (
  id: number,
  tenant?: TenantAccessContext
): Promise<NominaCorreccionItem> => loadNominaCorreccionOrThrow(id, tenant);

export const createNominaCorreccion = async (
  input: CreateNominaCorreccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const actorId = Number(actorUserId);

  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return runInTransaction(async (client) => {
    const payload: NominaCorreccionMutationPayload = {
      periodo_id: input.periodo_id,
      nomina_empleado_id: input.nomina_empleado_id,
      vinculacion_id: input.vinculacion_id,
      tipo_correccion: input.tipo_correccion,
      concepto: input.concepto,
      motivo: input.motivo,
      valor_anterior: input.valor_anterior,
      valor_nuevo: input.valor_nuevo,
      movimiento_id: input.movimiento_id,
      novedad_id: input.novedad_id,
      liquidacion_id: input.liquidacion_id,
      desprendible_origen_id: input.desprendible_origen_id
    };

    await validateNominaCorreccionPayload(payload, tenant, client);

    const insertResult = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_correcciones (
          periodo_id,
          nomina_empleado_id,
          vinculacion_id,
          tipo_correccion,
          concepto,
          motivo,
          valor_anterior,
          valor_nuevo,
          estado,
          observacion_revision,
          movimiento_id,
          novedad_id,
          liquidacion_id,
          desprendible_origen_id,
          activo,
          created_at,
          updated_at
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4,
          $5,
          $6,
          $7::numeric,
          $8::numeric,
          'BORRADOR',
          $9,
          $10::bigint,
          $11::bigint,
          $12::bigint,
          $13::bigint,
          TRUE,
          NOW(),
          NOW()
        )
        RETURNING id::text AS id
      `,
      [
        payload.periodo_id,
        payload.nomina_empleado_id,
        payload.vinculacion_id,
        payload.tipo_correccion,
        payload.concepto,
        payload.motivo,
        payload.valor_anterior,
        payload.valor_nuevo,
        input.observacion_revision,
        payload.movimiento_id,
        payload.novedad_id,
        payload.liquidacion_id,
        payload.desprendible_origen_id
      ]
    );

    const createdId = toNullableNumber(insertResult.rows[0]?.id);

    if (createdId === null) {
      throw new AppError('Failed to create payroll correction', 500, 'NOMINA_CORRECCION_CREATE_FAILED');
    }

    const created = await loadNominaCorreccionOrThrow(createdId, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_CREATE',
      actorUserId,
      after: created,
      client,
      descripcion: 'Creacion de correccion de nomina',
      id: createdId,
      meta: auditMeta
    });

    return created;
  });
};

export const updateNominaCorreccion = async (
  id: number,
  input: UpdateNominaCorreccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const current = await loadNominaCorreccionOrThrow(id, tenant);
  assertCorrectionStateEditable(current.estado);

  return runInTransaction(async (client) => {
    const payload: NominaCorreccionMutationPayload = {
      periodo_id: current.periodo.id,
      nomina_empleado_id: current.empleado.nomina_empleado_id,
      vinculacion_id: current.empleado.vinculacion_id,
      tipo_correccion: input.tipo_correccion ?? current.tipo_correccion,
      concepto: input.concepto ?? current.concepto,
      motivo: input.motivo ?? current.motivo,
      valor_anterior: input.valor_anterior ?? current.valores.valor_anterior,
      valor_nuevo: input.valor_nuevo ?? current.valores.valor_nuevo,
      movimiento_id:
        input.movimiento_id !== undefined ? input.movimiento_id : current.referencias.movimiento_id,
      novedad_id: input.novedad_id !== undefined ? input.novedad_id : current.referencias.novedad_id,
      liquidacion_id:
        input.liquidacion_id !== undefined ? input.liquidacion_id : current.referencias.liquidacion_id,
      desprendible_origen_id:
        input.desprendible_origen_id !== undefined
          ? input.desprendible_origen_id
          : current.referencias.desprendible_origen_id
    };

    await validateNominaCorreccionPayload(payload, tenant, client, id);

    await client.query(
      `
        UPDATE nomina_correcciones
        SET
          tipo_correccion = $2,
          concepto = $3,
          motivo = $4,
          valor_anterior = $5::numeric,
          valor_nuevo = $6::numeric,
          observacion_revision = $7,
          movimiento_id = $8::bigint,
          novedad_id = $9::bigint,
          liquidacion_id = $10::bigint,
          desprendible_origen_id = $11::bigint,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [
        id,
        payload.tipo_correccion,
        payload.concepto,
        payload.motivo,
        payload.valor_anterior,
        payload.valor_nuevo,
        input.observacion_revision === undefined
          ? current.observacion_revision
          : input.observacion_revision,
        payload.movimiento_id,
        payload.novedad_id,
        payload.liquidacion_id,
        payload.desprendible_origen_id
      ]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_UPDATE',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Actualizacion de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};

export const solicitarNominaCorreccion = async (
  id: number,
  input: SolicitarNominaCorreccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const actorId = Number(actorUserId);
  const current = await loadNominaCorreccionOrThrow(id, tenant);
  assertActiveCorrection(current);
  assertTransitionAllowed(current.estado, 'SOLICITADA');

  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_correcciones
        SET
          estado = 'SOLICITADA',
          solicitado_por = $2::bigint,
          fecha_solicitud = NOW(),
          observacion_revision = COALESCE($3, observacion_revision),
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id, actorId, input.observacion_revision]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_REQUEST',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Solicitud de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};

export const revisarNominaCorreccion = async (
  id: number,
  input: RevisarNominaCorreccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const actorId = Number(actorUserId);
  const current = await loadNominaCorreccionOrThrow(id, tenant);
  assertActiveCorrection(current);
  assertTransitionAllowed(current.estado, 'EN_REVISION');

  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_correcciones
        SET
          estado = 'EN_REVISION',
          revisado_por = $2::bigint,
          fecha_revision = NOW(),
          observacion_revision = COALESCE($3, observacion_revision),
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id, actorId, input.observacion_revision]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_REVIEW',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Inicio de revision de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};

export const aprobarNominaCorreccion = async (
  id: number,
  input: AprobarNominaCorreccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const actorId = Number(actorUserId);
  const current = await loadNominaCorreccionOrThrow(id, tenant);
  assertActiveCorrection(current);
  assertTransitionAllowed(current.estado, 'APROBADA');

  if (!Number.isFinite(actorId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return runInTransaction(async (client) => {
    await validateNominaCorreccionPayload(buildMutationPayloadFromItem(current), tenant, client, id);

    await client.query(
      `
        UPDATE nomina_correcciones
        SET
          estado = 'APROBADA',
          aprobado_por = $2::bigint,
          fecha_aprobacion = NOW(),
          observacion_revision = COALESCE($3, observacion_revision),
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id, actorId, input.observacion_revision]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_APPROVE',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Aprobacion de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};

export const rechazarNominaCorreccion = async (
  id: number,
  input: RechazarNominaCorreccionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const current = await loadNominaCorreccionOrThrow(id, tenant);
  assertActiveCorrection(current);
  assertTransitionAllowed(current.estado, 'RECHAZADA');

  return runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_correcciones
        SET
          estado = 'RECHAZADA',
          observacion_revision = $2,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id, input.observacion_revision]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_REJECT',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Rechazo de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};

export const anularNominaCorreccion = async (
  id: number,
  observacionRevision: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const current = await loadNominaCorreccionOrThrow(id, tenant);
  assertActiveCorrection(current);
  assertTransitionAllowed(current.estado, 'ANULADA');

  return runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_correcciones
        SET
          estado = 'ANULADA',
          observacion_revision = $2,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id, observacionRevision]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_CANCEL',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Anulacion de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};

export const deactivateNominaCorreccion = async (
  id: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaCorreccionItem> => {
  const current = await loadNominaCorreccionOrThrow(id, tenant);

  if (!current.activo) {
    return current;
  }

  if (!DEACTIVATABLE_STATES.has(current.estado)) {
    throw new AppError(
      'Only draft, rejected or cancelled payroll corrections can be deactivated',
      409,
      'NOMINA_CORRECCION_DEACTIVATE_INVALIDA'
    );
  }

  return runInTransaction(async (client) => {
    await client.query(
      `
        UPDATE nomina_correcciones
        SET activo = FALSE, updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [id]
    );

    const updated = await loadNominaCorreccionOrThrow(id, tenant, client);

    await recordNominaCorreccionAudit({
      action: 'NOMINA_CORRECCION_DEACTIVATE',
      actorUserId,
      before: current,
      after: updated,
      client,
      descripcion: 'Desactivacion de correccion de nomina',
      id,
      meta: auditMeta
    });

    return updated;
  });
};
