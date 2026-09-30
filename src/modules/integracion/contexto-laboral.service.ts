import type { PoolClient, Pool, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';

type Executor = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export interface ContextoLaboralInput {
  empresa_id?: number;
  contrato_id?: number;
  vinculacion_id?: number;
  persona_id?: number;
  fecha: string;
}

export interface ContextoLaboral {
  estado_resolucion: 'RESUELTO' | 'AMBIGUO' | 'NO_ENCONTRADO';
  fecha_resolucion: string;
  persona_id: number;
  vinculacion_id: number;
  empresa_id: number;
  contrato_id: number;
  estado_vinculacion: string | null;
  fecha_ingreso: string;
  fecha_retiro: string | null;
  cargo_contractual: { id: number | null; nombre: string | null; origen: string };
  categoria_salarial: { id: number | null; codigo: string | null; nombre: string | null; salario_base: number | null; origen: string };
  condicion_pension: { id: number | null; aporta: boolean | null; tipo: string | null; valor: number | null; origen: string };
  asignacion_operativa: Record<string, unknown> | null;
  municipio: { id: number | null; nombre: string | null; origen: string };
  institucion: { id: number | null; nombre: string | null; origen: string };
  sede: { id: number | null; nombre: string | null; origen: string };
  modalidad: { id: number | null; nombre: string | null; origen: string };
  asignacion_laboral: Record<string, unknown> | null;
  gestor: { usuario_id: number | null; nombre: string | null; origen: string };
  ambiguedades: string[];
}

interface ContextRow extends QueryResultRow {
  persona_id: string; vinculacion_id: string; empresa_id: string; contrato_id: string;
  estado_vinculacion: string | null; fecha_ingreso: string; fecha_retiro: string | null; cotiza_pension: boolean | null;
  cargo_id: string | null; cargo_nombre: string | null;
  categoria_id: string | null; categoria_codigo: string | null; categoria_nombre: string | null; categoria_salario_base: string | null;
  pension_id: string | null; pension_aporta: boolean | null; pension_tipo: string | null; pension_valor: string | null;
  asignacion_operativa: Record<string, unknown> | null;
  municipio_id: string | null; municipio_nombre: string | null;
  institucion_id: string | null; institucion_nombre: string | null;
  sede_id: string | null; sede_nombre: string | null;
  modalidad_id: string | null; modalidad_nombre: string | null;
  asignacion_laboral: Record<string, unknown> | null;
  gestor_usuario_id: string | null; gestor_nombre: string | null; gestor_origen: string | null;
  assignment_candidates: string; category_candidates: string; pension_candidates: string; labor_candidates: string; gestor_candidates: string;
}

const dateOnly = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError('Fecha efectiva inválida', 400, 'INTEGRACION_FECHA_INVALIDA');
  return value;
};

const num = (value: string | null): number | null => value === null ? null : Number(value);
const text = (value: string | null): string | null => value === null ? null : String(value);

const tenantClause = (tenant: TenantAccessContext | undefined, params: unknown[], alias = 'c'): string => {
  if (!tenant || tenant.isGlobalAdmin) return 'TRUE';
  params.push(tenant.contratoIds);
  const contratoParam = `$${params.length}`;
  params.push(tenant.empresaIds);
  const empresaParam = `$${params.length}`;
  return `(${alias}.id = ANY(${contratoParam}::bigint[]) OR ${alias}.empresa_id = ANY(${empresaParam}::bigint[]))`;
};

export const resolveContextoLaboral = async (
  input: ContextoLaboralInput,
  tenant?: TenantAccessContext,
  executor: Executor = dbPool
): Promise<ContextoLaboral> => {
  const fecha = dateOnly(input.fecha);
  if (!input.vinculacion_id && !input.persona_id) throw new AppError('vinculacion_id o persona_id es requerido', 400, 'INTEGRACION_SUJETO_REQUERIDO');
  const params: unknown[] = [input.vinculacion_id ?? null, input.persona_id ?? null, fecha, input.empresa_id ?? null, input.contrato_id ?? null];
  const scope = tenantClause(tenant, params, 'c');
  const result = await executor.query<ContextRow>(`
    SELECT v.persona_id::text, v.id::text vinculacion_id, c.empresa_id::text, c.id::text contrato_id,
      v.estado_vinculacion, v.fecha_inicio::text fecha_ingreso, v.fecha_fin::text fecha_retiro, v.cotiza_pension,
      v.contrato_cargo_id::text cargo_id, cc.nombre_cargo cargo_nombre,
      CASE WHEN COALESCE(cat.category_candidates, 0) = 1 THEN cat.id::text END categoria_id,
      CASE WHEN COALESCE(cat.category_candidates, 0) = 1 THEN cat.codigo_categoria END categoria_codigo,
      CASE WHEN COALESCE(cat.category_candidates, 0) = 1 THEN cat.nombre_categoria END categoria_nombre,
      CASE WHEN COALESCE(cat.category_candidates, 0) = 1 THEN cat.salario_base::text END categoria_salario_base,
      pen.id::text pension_id, (LOWER(BTRIM(pen.tipo_condicion)) = 'aporta_pension') pension_aporta,
      pen.tipo_condicion pension_tipo, pen.valor::text pension_valor,
      CASE WHEN ca.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ca.id::text, 'focalizacion_final_id', ca.focalizacion_final_id::text,
        'fecha_inicio', ca.fecha_inicio::text, 'fecha_fin', ca.fecha_fin::text,
        'municipio_id', ca.municipio_id::text, 'institucion_id', ff.institucion_id::text,
        'sede_id', ff.sede_id::text, 'modalidad_id', ff.modalidad_id::text,
        'institucion', COALESCE(ff.institucion_final, ca.institucion),
        'sede', COALESCE(ff.sede_final, ca.sede), 'modalidad', COALESCE(ff.modalidad_final, ca.modalidad),
        'observacion', ca.observacion
      ) END asignacion_operativa,
      ca.municipio_id::text municipio_id, COALESCE(mu.nombre_municipio, ff.municipio_texto) municipio_nombre,
      ff.institucion_id::text institucion_id, COALESCE(ff.institucion_final, ca.institucion) institucion_nombre,
      ff.sede_id::text sede_id, COALESCE(ff.sede_final, ca.sede) sede_nombre,
      ff.modalidad_id::text modalidad_id, COALESCE(ff.modalidad_final, ca.modalidad) modalidad_nombre,
      CASE WHEN pal.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', pal.id::text, 'ubicacion_laboral_id', pal.ubicacion_laboral_id::text,
        'nombre', cul.nombre_ubicacion, 'vigencia_desde', pal.vigencia_desde::text,
        'vigencia_hasta', pal.vigencia_hasta::text, 'estado', pal.estado
      ) END asignacion_laboral,
      gestor.usuario_id::text gestor_usuario_id, gestor.nombre_completo gestor_nombre, gestor.origen gestor_origen,
      COALESCE(ca.assignment_candidates, 0)::text assignment_candidates,
      COALESCE(cat.category_candidates, 0)::text category_candidates,
      COALESCE(pen.pension_candidates, 0)::text pension_candidates,
      COALESCE(pal.labor_candidates, 0)::text labor_candidates,
      COALESCE(gestor.gestor_candidates, 0)::text gestor_candidates
    FROM vinculaciones v
    JOIN contratos c ON c.id = v.contrato_id
    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
    LEFT JOIN LATERAL (
      SELECT vce.*, COUNT(*) OVER () pension_candidates
      FROM vinculacion_condiciones_economicas vce
      WHERE vce.vinculacion_id = v.id AND vce.activo = TRUE
        AND LOWER(BTRIM(vce.tipo_condicion)) = 'aporta_pension'
        AND vce.vigencia_desde <= $3::date AND (vce.vigencia_hasta IS NULL OR vce.vigencia_hasta >= $3::date)
      ORDER BY vce.vigencia_desde DESC, vce.id DESC LIMIT 1
    ) pen ON TRUE
    LEFT JOIN LATERAL (
      SELECT ca0.*, ff0.institucion_id, ff0.sede_id, ff0.modalidad_id, ff0.institucion_final,
        ff0.sede_final, ff0.modalidad_final, ff0.municipio_texto, COUNT(*) OVER () assignment_candidates
      FROM cobertura_asignaciones ca0
      LEFT JOIN focalizacion_final ff0 ON ff0.id = ca0.focalizacion_final_id
      WHERE ca0.vinculacion_id = v.id AND COALESCE(ca0.activo, TRUE)
        AND ca0.fecha_inicio <= $3::date AND (ca0.fecha_fin IS NULL OR ca0.fecha_fin >= $3::date)
      ORDER BY ca0.fecha_inicio DESC, ca0.id DESC LIMIT 1
    ) ca ON TRUE
    LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
    LEFT JOIN municipios mu ON mu.id = ca.municipio_id
    LEFT JOIN LATERAL (
      SELECT ncs.*, COUNT(*) OVER () category_candidates
      FROM nomina_categorias_salariales ncs
      WHERE ncs.contrato_id = v.contrato_id AND COALESCE(ncs.activo, TRUE)
        AND LOWER(BTRIM(ncs.modalidad)) = LOWER(BTRIM(COALESCE(ff.modalidad_final, ca.modalidad)))
        AND (ncs.vigente_desde IS NULL OR ncs.vigente_desde <= $3::date)
        AND (ncs.vigente_hasta IS NULL OR ncs.vigente_hasta >= $3::date)
      ORDER BY ncs.vigente_desde DESC NULLS LAST, ncs.id DESC LIMIT 1
    ) cat ON TRUE
    LEFT JOIN LATERAL (
      SELECT pal0.*, cul0.nombre_ubicacion, COUNT(*) OVER () labor_candidates
      FROM personal_asignaciones_laborales pal0
      JOIN contrato_ubicaciones_laborales cul0 ON cul0.id = pal0.ubicacion_laboral_id
      WHERE pal0.vinculacion_id = v.id AND pal0.estado <> 'ANULADA'
        AND pal0.vigencia_desde <= $3::date AND (pal0.vigencia_hasta IS NULL OR pal0.vigencia_hasta >= $3::date)
      ORDER BY pal0.vigencia_desde DESC, pal0.id DESC LIMIT 1
    ) pal ON TRUE
    LEFT JOIN contrato_ubicaciones_laborales cul ON cul.id = pal.ubicacion_laboral_id
    LEFT JOIN LATERAL (
      SELECT candidate.usuario_id, candidate.nombre_completo, candidate.origen, candidate.gestor_candidates
      FROM (
        SELECT gpa.usuario_id, u.nombre_completo, 'PERSONA'::text origen, COUNT(*) OVER () gestor_candidates, 1 prioridad, gpa.vigencia_desde, gpa.id
        FROM gestor_personal_asignaciones gpa JOIN usuarios u ON u.id = gpa.usuario_id
        WHERE gpa.vinculacion_id = v.id AND COALESCE(gpa.activo, TRUE)
          AND gpa.vigencia_desde <= $3::date AND (gpa.vigencia_hasta IS NULL OR gpa.vigencia_hasta >= $3::date)
        UNION ALL
        SELECT gma.usuario_id, u.nombre_completo, 'MUNICIPIO'::text, COUNT(*) OVER (), 2, gma.vigencia_desde, gma.id
        FROM gestor_municipio_asignaciones gma JOIN usuarios u ON u.id = gma.usuario_id
        WHERE gma.contrato_id = v.contrato_id AND gma.municipio_id = ca.municipio_id AND COALESCE(gma.activo, TRUE)
          AND gma.vigencia_desde <= $3::date AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= $3::date)
      ) candidate ORDER BY candidate.prioridad, candidate.vigencia_desde DESC, candidate.id DESC LIMIT 1
    ) gestor ON TRUE
    WHERE v.id = COALESCE($1::bigint, v.id)
      AND v.persona_id = COALESCE($2::bigint, v.persona_id)
      AND ($4::bigint IS NULL OR c.empresa_id = $4::bigint)
      AND ($5::bigint IS NULL OR c.id = $5::bigint)
      AND ${scope}
    ORDER BY v.id DESC LIMIT 1
  `, params);
  const row = result.rows[0];
  if (!row) throw new AppError('Contexto laboral no encontrado', 404, 'INTEGRACION_CONTEXTO_NOT_FOUND');
  const ambiguities = [
    Number(row.assignment_candidates) > 1 ? 'ASIGNACION_OPERATIVA' : null,
    Number(row.category_candidates) > 1 ? 'CATEGORIA_SALARIAL' : null,
    Number(row.pension_candidates) > 1 ? 'CONDICION_PENSION' : null,
    Number(row.labor_candidates) > 1 ? 'ASIGNACION_LABORAL' : null,
    Number(row.gestor_candidates) > 1 ? 'GESTOR' : null
  ].filter((value): value is string => Boolean(value));
  return {
    estado_resolucion: ambiguities.length ? 'AMBIGUO' : 'RESUELTO', fecha_resolucion: fecha,
    persona_id: Number(row.persona_id), vinculacion_id: Number(row.vinculacion_id), empresa_id: Number(row.empresa_id), contrato_id: Number(row.contrato_id),
    estado_vinculacion: row.estado_vinculacion, fecha_ingreso: row.fecha_ingreso, fecha_retiro: row.fecha_retiro,
    cargo_contractual: { id: num(row.cargo_id), nombre: text(row.cargo_nombre), origen: 'vinculaciones.contrato_cargo_id' },
    categoria_salarial: { id: num(row.categoria_id), codigo: text(row.categoria_codigo), nombre: text(row.categoria_nombre), salario_base: row.categoria_salario_base === null ? null : Number(row.categoria_salario_base), origen: 'nomina_categorias_salariales' },
    condicion_pension: { id: num(row.pension_id), aporta: row.pension_id ? row.pension_aporta : row.cotiza_pension, tipo: text(row.pension_tipo), valor: row.pension_valor === null ? null : Number(row.pension_valor), origen: row.pension_id ? 'vinculacion_condiciones_economicas' : 'vinculaciones.cotiza_pension' },
    asignacion_operativa: row.asignacion_operativa, municipio: { id: num(row.municipio_id), nombre: text(row.municipio_nombre), origen: 'cobertura_asignaciones' },
    institucion: { id: num(row.institucion_id), nombre: text(row.institucion_nombre), origen: 'cobertura_asignaciones/focalizacion_final' },
    sede: { id: num(row.sede_id), nombre: text(row.sede_nombre), origen: 'cobertura_asignaciones/focalizacion_final' },
    modalidad: { id: num(row.modalidad_id), nombre: text(row.modalidad_nombre), origen: 'cobertura_asignaciones/focalizacion_final' },
    asignacion_laboral: row.asignacion_laboral, gestor: { usuario_id: num(row.gestor_usuario_id), nombre: text(row.gestor_nombre), origen: row.gestor_origen ?? 'SIN_ASIGNACION' },
    ambiguedades: ambiguities
  };
};

export const resolveContextoLaboralForClient = (input: ContextoLaboralInput, tenant: TenantAccessContext | undefined, client: PoolClient) => resolveContextoLaboral(input, tenant, client);

export const resolveContextoLaboralReadOnly = (input: ContextoLaboralInput, tenant?: TenantAccessContext) => resolveContextoLaboral(input, tenant, dbPool);

export interface OperationalContextAtDate {
  id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  municipio_id: number | null;
  institucion_id: number | null;
  sede_id: number | null;
  modalidad_id: number | null;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  origen: 'cobertura_asignaciones';
}

export interface OperationalContextTimeline {
  tramos: OperationalContextAtDate[];
  huecos: Array<{ fecha_inicio: string; fecha_fin: string }>;
}

const canonicalOperationalQuery = async (input: { empresaId: number; contratoId: number; vinculacionId: number; fechaInicio: string; fechaFin: string }, executor: Executor): Promise<OperationalContextAtDate[]> => {
  const result = await executor.query<OperationalContextAtDate>(`
    SELECT ca.id::int, GREATEST(ca.fecha_inicio, $4::date)::text fecha_inicio,
      LEAST(COALESCE(ca.fecha_fin, $5::date), $5::date)::text fecha_fin,
      ca.municipio_id::int, ff.institucion_id::int, ff.sede_id::int, ff.modalidad_id::int,
      COALESCE(ff.municipio_texto, mu.nombre_municipio) municipio,
      COALESCE(ff.institucion_final, ca.institucion) institucion,
      COALESCE(ff.sede_final, ca.sede) sede,
      COALESCE(ff.modalidad_final, ca.modalidad) modalidad,
      'cobertura_asignaciones'::text origen
    FROM cobertura_asignaciones ca
    JOIN contratos c ON c.id = ca.contrato_id AND c.empresa_id = $1::bigint
    LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
    LEFT JOIN municipios mu ON mu.id = ca.municipio_id
    WHERE ca.contrato_id = $2::bigint AND ca.vinculacion_id = $3::bigint
      AND COALESCE(ca.activo, TRUE)
      AND ca.fecha_inicio <= $5::date
      AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= $4::date)
    ORDER BY ca.fecha_inicio, ca.id`, [input.empresaId, input.contratoId, input.vinculacionId, input.fechaInicio, input.fechaFin]);
  return result.rows.map((row) => ({ ...row, fecha_inicio: String(row.fecha_inicio).slice(0, 10), fecha_fin: row.fecha_fin ? String(row.fecha_fin).slice(0, 10) : input.fechaFin }));
};

export const resolveOperationalContextAtDate = async (input: { empresaId: number; contratoId: number; vinculacionId: number; fecha: string }, executor: Executor = dbPool): Promise<OperationalContextAtDate | null> => {
  const date = dateOnly(input.fecha);
  const rows = await canonicalOperationalQuery({ ...input, fechaInicio: date, fechaFin: date }, executor);
  const matches = rows.filter((row) => row.fecha_inicio <= date && (row.fecha_fin === null || row.fecha_fin >= date));
  if (matches.length > 1) throw new AppError('Solapamiento de vigencias operativas', 409, 'ASIGNACION_OPERATIVA_SOLAPADA');
  return matches[0] ?? null;
};

export const resolveOperationalContextTimeline = async (input: { empresaId: number; contratoId: number; vinculacionId: number; fechaInicio: string; fechaFin: string }, executor: Executor = dbPool): Promise<OperationalContextTimeline> => {
  const inicio = dateOnly(input.fechaInicio); const fin = dateOnly(input.fechaFin);
  if (inicio > fin) throw new AppError('Rango operativo inválido', 400, 'ASIGNACION_OPERATIVA_RANGO_INVALIDO');
  const rows = await canonicalOperationalQuery({ ...input, fechaInicio: inicio, fechaFin: fin }, executor);
  const tramos: OperationalContextAtDate[] = [];
  const huecos: Array<{ fecha_inicio: string; fecha_fin: string }> = [];
  let cursor = inicio;
  for (const row of rows) {
    if (row.fecha_inicio > cursor) huecos.push({ fecha_inicio: cursor, fecha_fin: previousDateOnly(row.fecha_inicio) });
    if (tramos.length && row.fecha_inicio <= (tramos[tramos.length - 1]!.fecha_fin ?? fin)) throw new AppError('Solapamiento de vigencias operativas', 409, 'ASIGNACION_OPERATIVA_SOLAPADA');
    tramos.push(row); cursor = nextDateOnly(row.fecha_fin ?? fin);
  }
  if (cursor <= fin) huecos.push({ fecha_inicio: cursor, fecha_fin: fin });
  return { tramos, huecos };
};

const previousDateOnly = (value: string): string => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); };
const nextDateOnly = (value: string): string => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };
