import type { NextFunction, Request, Response } from 'express';
import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { assertEmpresaModuleEnabled } from './saas.service';

interface NominaRouteHints {
  area_id?: string;
  asistencia_id?: string;
  contrato_id?: string;
  correccion_id?: string;
  cuenta_cobro_ops_id?: string;
  empresa_id?: string;
  liquidacion_final_id?: string;
  liquidacion_id?: string;
  movimiento_id?: string;
  nomina_empleado_id?: string;
  novedad_id?: string;
  periodo_id?: string;
  vinculacion_id?: string;
}

interface NominaEntityContext {
  source: string;
  area_id?: string | null;
  asistencia_id?: string | null;
  contrato_id?: string | null;
  correccion_id?: string | null;
  cuenta_cobro_ops_id?: string | null;
  empresa_id: string;
  liquidacion_final_id?: string | null;
  liquidacion_id?: string | null;
  movimiento_id?: string | null;
  nomina_empleado_id?: string | null;
  novedad_id?: string | null;
  periodo_id?: string | null;
  vinculacion_id?: string | null;
}

const CANONICA_NOVEDAD_PREFIX = 'canonica:';
const NOMINA_CONTEXT_KEYS = [
  'empresa_id',
  'contrato_id',
  'periodo_id',
  'nomina_empleado_id',
  'vinculacion_id'
] as const;

type NominaContextKey = (typeof NOMINA_CONTEXT_KEYS)[number];

const normalizeNumericIdentifier = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : null;
};

const normalizeStringIdentifier = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getPathSegments = (req: Request): string[] => {
  const rawPath = req.originalUrl?.split('?')[0] ?? `${req.baseUrl}${req.path}`;
  const segments = rawPath.split('/').filter(Boolean);
  const nominaIndex = segments.indexOf('nomina');
  return nominaIndex >= 0 ? segments.slice(nominaIndex + 1) : segments;
};

const extractNominaRouteHints = (req: Request): NominaRouteHints => {
  const segments = getPathSegments(req);
  const [resource, second, third, fourth] = segments;
  const hints: NominaRouteHints = {};

  if (resource === 'periodos' && second) {
    const periodoId = normalizeNumericIdentifier(second);
    if (periodoId) hints.periodo_id = periodoId;
    if (third === 'revision-operativa') {
      const nominaEmpleadoId = normalizeNumericIdentifier(fourth);
      if (nominaEmpleadoId) hints.nomina_empleado_id = nominaEmpleadoId;
    }
    if (third === 'vinculaciones') {
      const vinculacionId = normalizeNumericIdentifier(fourth);
      if (vinculacionId) hints.vinculacion_id = vinculacionId;
    }
    return hints;
  }

  if (resource === 'liquidaciones' && second) {
    const periodoId = normalizeNumericIdentifier(second);
    if (periodoId) hints.periodo_id = periodoId;
    const vinculacionId = normalizeNumericIdentifier(third);
    if (vinculacionId) hints.vinculacion_id = vinculacionId;
    return hints;
  }

  if (resource === 'desprendibles' && second) {
    const periodoId = normalizeNumericIdentifier(second);
    if (periodoId) hints.periodo_id = periodoId;
    const vinculacionId = normalizeNumericIdentifier(third);
    if (vinculacionId) hints.vinculacion_id = vinculacionId;
    return hints;
  }

  if (resource === 'export' && second) {
    const periodoId = normalizeNumericIdentifier(second);
    if (periodoId) hints.periodo_id = periodoId;
    return hints;
  }

  if (resource === 'empleados' && second) {
    const nominaEmpleadoId = normalizeNumericIdentifier(second);
    if (nominaEmpleadoId) hints.nomina_empleado_id = nominaEmpleadoId;
    return hints;
  }

  if (resource === 'asistencia' && second) {
    const asistenciaId = normalizeNumericIdentifier(second);
    if (asistenciaId) hints.asistencia_id = asistenciaId;
    return hints;
  }

  if (resource === 'movimientos' && second !== 'recargo') {
    const movimientoId = normalizeNumericIdentifier(second);
    if (movimientoId) hints.movimiento_id = movimientoId;
    return hints;
  }

  if (resource === 'cambios-operativos' && second) {
    const movimientoId = normalizeNumericIdentifier(second);
    if (movimientoId) hints.movimiento_id = movimientoId;
    return hints;
  }

  if (resource === 'novedades' && second && second !== 'con-turno') {
    hints.novedad_id = decodeURIComponent(second);
    return hints;
  }

  if (resource === 'correcciones' && second) {
    const correccionId = normalizeNumericIdentifier(second);
    if (correccionId) hints.correccion_id = correccionId;
    return hints;
  }

  if (resource === 'liquidaciones-finales' && second) {
    const liquidacionFinalId = normalizeNumericIdentifier(second);
    if (liquidacionFinalId) hints.liquidacion_final_id = liquidacionFinalId;
    return hints;
  }

  if (resource === 'cuentas-cobro-ops' && second) {
    const cuentaCobroOpsId = normalizeNumericIdentifier(second);
    if (cuentaCobroOpsId) hints.cuenta_cobro_ops_id = cuentaCobroOpsId;
    return hints;
  }

  if (resource === 'procesos') {
    if (second === 'areas') {
      const areaId = normalizeNumericIdentifier(third);
      if (areaId) hints.area_id = areaId;
      return hints;
    }
    if (second === 'asistencia' && third === 'areas') {
      const areaId = normalizeNumericIdentifier(fourth);
      if (areaId) hints.area_id = areaId;
      return hints;
    }
  }

  return hints;
};

const collectUniqueValues = (
  entries: Array<{ label: string; value: string | null }>
): Array<{ label: string; value: string }> => {
  const seen = new Map<string, { label: string; value: string }>();
  for (const entry of entries) {
    if (!entry.value || seen.has(entry.value)) {
      continue;
    }
    seen.set(entry.value, { label: entry.label, value: entry.value });
  }
  return [...seen.values()];
};

const resolveUniqueIdentifier = (
  label: string,
  entries: Array<{ label: string; value: string | null }>
): string | null => {
  const values = collectUniqueValues(entries);
  if (values.length > 1) {
    throw new AppError(`Conflicting ${label} values were provided`, 400, 'EMPRESA_CONTEXT_CONFLICT');
  }
  return values[0]?.value ?? null;
};

const getNumericIdentifier = (
  req: Request,
  hints: NominaRouteHints,
  key: keyof NominaRouteHints,
  aliases: string[]
): string | null =>
  resolveUniqueIdentifier(
    String(key),
    [
      ...aliases.map((alias) => ({
        label: `params.${alias}`,
        value: normalizeNumericIdentifier((req.params as Record<string, unknown> | undefined)?.[alias])
      })),
      { label: `route.${String(key)}`, value: normalizeNumericIdentifier(hints[key]) },
      ...aliases.map((alias) => ({
        label: `query.${alias}`,
        value: normalizeNumericIdentifier((req.query as Record<string, unknown> | undefined)?.[alias])
      })),
      ...aliases.map((alias) => ({
        label: `body.${alias}`,
        value: normalizeNumericIdentifier((req.body as Record<string, unknown> | undefined)?.[alias])
      }))
    ]
  );

const getStringIdentifier = (
  req: Request,
  hints: NominaRouteHints,
  key: keyof NominaRouteHints,
  aliases: string[]
): string | null =>
  resolveUniqueIdentifier(
    String(key),
    [
      ...aliases.map((alias) => ({
        label: `params.${alias}`,
        value: normalizeStringIdentifier((req.params as Record<string, unknown> | undefined)?.[alias])
      })),
      { label: `route.${String(key)}`, value: normalizeStringIdentifier(hints[key]) },
      ...aliases.map((alias) => ({
        label: `query.${alias}`,
        value: normalizeStringIdentifier((req.query as Record<string, unknown> | undefined)?.[alias])
      })),
      ...aliases.map((alias) => ({
        label: `body.${alias}`,
        value: normalizeStringIdentifier((req.body as Record<string, unknown> | undefined)?.[alias])
      }))
    ]
  );

const queryContext = async (
  sql: string,
  params: unknown[],
  source: string
): Promise<NominaEntityContext | null> => {
  const row = (await dbQuery<NominaEntityContext>(sql, params)).rows[0];
  return row ? { ...row, source } : null;
};

const assertContextFound = <T>(
  context: T | null,
  message: string,
  code: string
): T => {
  if (!context) {
    throw new AppError(message, 404, code);
  }
  return context;
};

const resolveContratoContext = async (contratoId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          c.id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM contratos c
        WHERE c.id = $1::bigint
        LIMIT 1
      `,
      [contratoId],
      'contrato'
    ),
    'Contrato not found',
    'CONTRATO_NOT_FOUND'
  );

const resolvePeriodoContext = async (periodoId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          np.id::text AS periodo_id,
          c.id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_periodos np
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE np.id = $1::bigint
        LIMIT 1
      `,
      [periodoId],
      'periodo'
    ),
    'Nomina period not found',
    'NOMINA_PERIODO_NOT_FOUND'
  );

const resolveNominaEmpleadoContext = async (nominaEmpleadoId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          ne.id::text AS nomina_empleado_id,
          ne.periodo_id::text AS periodo_id,
          ne.vinculacion_id::text AS vinculacion_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_empleados ne
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE ne.id = $1::bigint
        LIMIT 1
      `,
      [nominaEmpleadoId],
      'nomina_empleado'
    ),
    'Payroll employee not found',
    'NOMINA_EMPLEADO_NOT_FOUND'
  );

const resolveVinculacionContext = async (vinculacionId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          v.id::text AS vinculacion_id,
          v.contrato_id::text AS contrato_id,
          v.empresa_id::text AS empresa_id
        FROM vinculaciones v
        WHERE v.id = $1::bigint
        LIMIT 1
      `,
      [vinculacionId],
      'vinculacion'
    ),
    'Vinculacion not found',
    'VINCULACION_NOT_FOUND'
  );

const resolveNominaLiquidacionContext = async (liquidacionId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          nl.id::text AS liquidacion_id,
          nl.periodo_id::text AS periodo_id,
          nl.vinculacion_id::text AS vinculacion_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_liquidaciones nl
        INNER JOIN nomina_periodos np ON np.id = nl.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE nl.id = $1::bigint
        LIMIT 1
      `,
      [liquidacionId],
      'nomina_liquidacion'
    ),
    'Payroll liquidation not found',
    'NOMINA_LIQUIDACION_NOT_FOUND'
  );

const resolveNominaMovimientoContext = async (movimientoId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          nm.id::text AS movimiento_id,
          nm.periodo_id::text AS periodo_id,
          nm.nomina_empleado_id::text AS nomina_empleado_id,
          nm.vinculacion_id::text AS vinculacion_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_movimientos nm
        INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE nm.id = $1::bigint
        LIMIT 1
      `,
      [movimientoId],
      'nomina_movimiento'
    ),
    'Payroll movement not found',
    'NOMINA_MOVIMIENTO_NOT_FOUND'
  );

const resolveNominaAsistenciaContext = async (asistenciaId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          nad.id::text AS asistencia_id,
          nad.periodo_id::text AS periodo_id,
          nad.vinculacion_id::text AS vinculacion_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_asistencia_diaria nad
        INNER JOIN nomina_periodos np ON np.id = nad.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE nad.id = $1::bigint
        LIMIT 1
      `,
      [asistenciaId],
      'nomina_asistencia'
    ),
    'Payroll attendance record not found',
    'NOMINA_ASISTENCIA_NOT_FOUND'
  );

const resolveNominaNovedadContext = async (novedadId: string) => {
  if (novedadId.startsWith(CANONICA_NOVEDAD_PREFIX)) {
    const parts = novedadId.split(':');
    const periodoId = normalizeNumericIdentifier(parts[2]);
    if (!periodoId) {
      throw new AppError('Canonical payroll novelty id is invalid', 400, 'NOMINA_NOVEDAD_CANONICA_ID_INVALIDO');
    }
    return resolvePeriodoContext(periodoId);
  }

  const numericId = normalizeNumericIdentifier(novedadId);
  if (!numericId) {
    throw new AppError('Payroll novelty id is invalid', 400, 'NOMINA_NOVEDAD_ID_INVALIDO');
  }

  return assertContextFound(
    await queryContext(
      `
        SELECT
          nn.id::text AS novedad_id,
          nn.periodo_id::text AS periodo_id,
          nn.nomina_empleado_id::text AS nomina_empleado_id,
          nn.vinculacion_id::text AS vinculacion_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_novedades nn
        INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE nn.id = $1::bigint
        LIMIT 1
      `,
      [numericId],
      'nomina_novedad'
    ),
    'Payroll novelty not found',
    'NOMINA_NOVEDAD_NOT_FOUND'
  );
};

const resolveNominaCorreccionContext = async (correccionId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          nc.id::text AS correccion_id,
          nc.periodo_id::text AS periodo_id,
          nc.nomina_empleado_id::text AS nomina_empleado_id,
          nc.vinculacion_id::text AS vinculacion_id,
          np.contrato_id::text AS contrato_id,
          c.empresa_id::text AS empresa_id
        FROM nomina_correcciones nc
        INNER JOIN nomina_periodos np ON np.id = nc.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE nc.id = $1::bigint
        LIMIT 1
      `,
      [correccionId],
      'nomina_correccion'
    ),
    'Payroll correction not found',
    'NOMINA_CORRECCION_NOT_FOUND'
  );

const resolveNominaLiquidacionFinalContext = async (liquidacionFinalId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          nlf.id::text AS liquidacion_final_id,
          nlf.vinculacion_id::text AS vinculacion_id,
          COALESCE(nlf.contrato_id::text, v.contrato_id::text) AS contrato_id,
          nlf.empresa_id::text AS empresa_id
        FROM nomina_liquidaciones_finales nlf
        INNER JOIN vinculaciones v ON v.id = nlf.vinculacion_id
        WHERE nlf.id = $1::bigint
        LIMIT 1
      `,
      [liquidacionFinalId],
      'nomina_liquidacion_final'
    ),
    'Final payroll liquidation not found',
    'NOMINA_LIQUIDACION_FINAL_NOT_FOUND'
  );

const resolveNominaAreaContext = async (areaId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          na.id::text AS area_id,
          na.empresa_id::text AS empresa_id
        FROM nomina_areas na
        WHERE na.id = $1::bigint
        LIMIT 1
      `,
      [areaId],
      'nomina_area'
    ),
    'Nomina area not found',
    'NOMINA_AREA_NOT_FOUND'
  );

const resolveCuentaCobroOpsContext = async (cuentaCobroOpsId: string) =>
  assertContextFound(
    await queryContext(
      `
        SELECT
          ncco.id::text AS cuenta_cobro_ops_id,
          ncco.periodo_id::text AS periodo_id,
          ncco.vinculacion_id::text AS vinculacion_id,
          ncco.contrato_id::text AS contrato_id,
          ncco.empresa_id::text AS empresa_id
        FROM nomina_cuentas_cobro_ops ncco
        WHERE ncco.id = $1::bigint
        LIMIT 1
      `,
      [cuentaCobroOpsId],
      'nomina_cuenta_cobro_ops'
    ),
    'OPS billing account not found',
    'NOMINA_CUENTA_COBRO_OPS_NOT_FOUND'
  );

const resolvePeriodoVinculacionContext = async (periodoId: string, vinculacionId: string) =>
  queryContext(
    `
      SELECT
        ne.id::text AS nomina_empleado_id,
        ne.periodo_id::text AS periodo_id,
        ne.vinculacion_id::text AS vinculacion_id,
        np.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id
      FROM nomina_empleados ne
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE ne.periodo_id = $1::bigint
        AND ne.vinculacion_id = $2::bigint
      LIMIT 1
    `,
    [periodoId, vinculacionId],
    'periodo_vinculacion'
  );

const resolveGenericNominaContext = async (id: string) =>
  queryContext(
    `
      SELECT c.empresa_id::text AS empresa_id
      FROM nomina_periodos np INNER JOIN contratos c ON c.id=np.contrato_id
      WHERE np.id=$1::bigint
      UNION ALL
      SELECT c.empresa_id::text AS empresa_id
      FROM nomina_empleados ne INNER JOIN nomina_periodos np ON np.id=ne.periodo_id INNER JOIN contratos c ON c.id=np.contrato_id
      WHERE ne.id=$1::bigint
      UNION ALL
      SELECT c.empresa_id::text AS empresa_id
      FROM nomina_liquidaciones nl INNER JOIN nomina_periodos np ON np.id=nl.periodo_id INNER JOIN contratos c ON c.id=np.contrato_id
      WHERE nl.id=$1::bigint
      LIMIT 1
    `,
    [id],
    'nomina_generic_id'
  );

const mergeNominaContexts = (contexts: NominaEntityContext[]): NominaEntityContext | null => {
  let merged: NominaEntityContext | null = null;

  for (const context of contexts) {
    if (!merged) {
      merged = { ...context };
      continue;
    }

    for (const key of NOMINA_CONTEXT_KEYS) {
      const currentValue = merged[key as NominaContextKey];
      const nextValue = context[key as NominaContextKey];
      if (currentValue && nextValue && currentValue !== nextValue) {
        throw new AppError(
          `Payroll entities from ${merged.source} and ${context.source} do not belong to the same company context`,
          400,
          'NOMINA_CONTEXT_MISMATCH'
        );
      }
      if (!currentValue && nextValue) {
        merged[key as NominaContextKey] = nextValue;
      }
    }
  }

  return merged;
};

export async function resolveEmpresaId(req: Request): Promise<number> {
  const hints = extractNominaRouteHints(req);
  const direct = resolveUniqueIdentifier('empresa_id', [
    { label: 'params.empresaId', value: normalizeNumericIdentifier((req.params as Record<string, unknown> | undefined)?.empresaId) },
    { label: 'query.empresa_id', value: normalizeNumericIdentifier((req.query as Record<string, unknown> | undefined)?.empresa_id) },
    { label: 'body.empresa_id', value: normalizeNumericIdentifier((req.body as Record<string, unknown> | undefined)?.empresa_id) }
  ]);
  const contrato = getNumericIdentifier(req, hints, 'contrato_id', ['contratoId', 'contrato_id']);
  const periodo = getNumericIdentifier(req, hints, 'periodo_id', ['periodoId', 'periodo_id']);
  const nominaEmpleado = getNumericIdentifier(req, hints, 'nomina_empleado_id', ['nominaEmpleadoId', 'nomina_empleado_id']);
  const vinculacion = getNumericIdentifier(req, hints, 'vinculacion_id', ['vinculacionId', 'vinculacion_id']);
  const liquidacion = getNumericIdentifier(req, hints, 'liquidacion_id', ['liquidacionId', 'liquidacion_id']);
  const movimiento = getNumericIdentifier(req, hints, 'movimiento_id', ['movimientoId', 'movimiento_id']);
  const asistencia = getNumericIdentifier(req, hints, 'asistencia_id', ['asistenciaId', 'asistencia_id']);
  const correccion = getNumericIdentifier(req, hints, 'correccion_id', ['correccionId', 'correccion_id']);
  const liquidacionFinal = getNumericIdentifier(req, hints, 'liquidacion_final_id', ['liquidacionFinalId', 'liquidacion_final_id']);
  const area = getNumericIdentifier(req, hints, 'area_id', ['areaId', 'area_id']);
  const cuentaCobroOps = getNumericIdentifier(req, hints, 'cuenta_cobro_ops_id', ['cuentaCobroOpsId', 'cuenta_cobro_ops_id']);
  const novedad = getStringIdentifier(req, hints, 'novedad_id', ['novedadId', 'novedad_id']);

  const contexts = (
    await Promise.all([
      contrato ? resolveContratoContext(contrato) : null,
      periodo ? resolvePeriodoContext(periodo) : null,
      nominaEmpleado ? resolveNominaEmpleadoContext(nominaEmpleado) : null,
      vinculacion ? resolveVinculacionContext(vinculacion) : null,
      liquidacion ? resolveNominaLiquidacionContext(liquidacion) : null,
      movimiento ? resolveNominaMovimientoContext(movimiento) : null,
      asistencia ? resolveNominaAsistenciaContext(asistencia) : null,
      correccion ? resolveNominaCorreccionContext(correccion) : null,
      liquidacionFinal ? resolveNominaLiquidacionFinalContext(liquidacionFinal) : null,
      area ? resolveNominaAreaContext(area) : null,
      cuentaCobroOps ? resolveCuentaCobroOpsContext(cuentaCobroOps) : null,
      novedad ? resolveNominaNovedadContext(novedad) : null
    ])
  ).filter((context): context is NominaEntityContext => context !== null);

  const periodoVinculacionContext =
    periodo && vinculacion ? await resolvePeriodoVinculacionContext(periodo, vinculacion) : null;
  if (periodo && vinculacion && !periodoVinculacionContext) {
    throw new AppError(
      'Selected vinculacion does not belong to the payroll period snapshot',
      400,
      'NOMINA_PERIODO_VINCULACION_INVALIDA'
    );
  }
  if (periodoVinculacionContext) {
    contexts.push(periodoVinculacionContext);
  }

  const merged = mergeNominaContexts(contexts);

  if (direct && merged?.empresa_id && direct !== merged.empresa_id) {
    throw new AppError(
      'Explicit empresa_id does not match the authoritative payroll entity context',
      400,
      'EMPRESA_CONTEXT_MISMATCH'
    );
  }

  if (merged?.empresa_id) {
    return Number(merged.empresa_id);
  }

  if (direct) {
    return Number(direct);
  }

  // Varias rutas historicas de Nomina usan el parametro generico :id.
  // Resolverlo aqui evita perder el contexto al navegar directamente a /nomina/cobertura.
  const genericId = req.params.id;
  if (genericId && /^\d+$/.test(String(genericId))) {
    const row = await resolveGenericNominaContext(String(genericId));
    if (row?.empresa_id) return Number(row.empresa_id);
  }

  if (req.tenant && !req.tenant.isGlobalAdmin && req.tenant.empresaIds.length === 1) return req.tenant.empresaIds[0]!;
  throw new AppError('Company context is required for module access',400,'EMPRESA_CONTEXT_REQUIRED');
}

export const requireModule = (code: string) => async (req:Request,_res:Response,next:NextFunction) => {
  try { const empresaId=await resolveEmpresaId(req); await assertEmpresaModuleEnabled(empresaId,code,req.tenant); next(); }
  catch(error){next(error);}
};
