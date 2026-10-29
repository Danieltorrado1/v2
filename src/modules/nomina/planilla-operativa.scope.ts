import type { PoolClient } from 'pg';
import { AUTH_USER_LOOKUP_QUERY } from '../../middlewares/authMiddleware';
import { AppError } from '../../utils/AppError';
import { gestorApplicableCargoSql } from '../vinculaciones/vinculaciones.personal.domain';

// Recognized only when explicitly granted in PostgreSQL. No role/absence fallback,
// no automatic permission seed, and never a substitute for enterprise/contract access.
export const PLANILLA_ALL_MUNICIPALITIES_PERMISSION = 'nomina.municipios.read_all';
export interface PlanillaAuthorizedContext {
  empleado_id: string; vinculacion_id: string; municipio_id: string; municipio: string;
  institucion_id: string; sede_id: string; modalidad_id: string;
  institucion: string; sede: string; modalidad: string; autorizado: boolean; consistente: boolean;
  tipo_contexto?: 'CONTRACTUAL'; historico?: boolean;
}

export async function resolvePlanillaAuthorizedContexts(client: Pick<PoolClient, 'query'>,
  userId: number, period: { id: string; contrato_id: string; contrato_empresa_id?: string | null;
    fecha_inicio: unknown; fecha_fin: unknown }) {
  const actor = (await client.query(AUTH_USER_LOOKUP_QUERY, [userId])).rows[0];
  if (!actor?.active || !['nomina.export', 'nomina.operativa.read'].every(p => actor.permissions?.includes(p))) {
    throw new AppError('No tiene permisos vigentes para descargar esta planilla', 403, 'PLANILLA_ACCESS_DENIED');
  }
  const membership = await client.query(`SELECT EXISTS (
    SELECT 1 FROM contratos c WHERE c.id = $2::bigint AND c.empresa_id = $3::bigint
      AND COALESCE(c.activo, TRUE) = TRUE AND (
        EXISTS (SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id = $1::bigint
          AND ue.empresa_id = c.empresa_id AND COALESCE(ue.activo, TRUE) = TRUE)
        OR EXISTS (SELECT 1 FROM usuario_contratos uc WHERE uc.usuario_id = $1::bigint
          AND uc.contrato_id = c.id AND COALESCE(uc.activo, TRUE) = TRUE))) AS autorizado`,
  [userId, period.contrato_id, period.contrato_empresa_id]);
  if (membership.rows[0]?.autorizado !== true) {
    throw new AppError('Sin asignacion empresarial/contractual vigente', 403, 'PLANILLA_ACCESS_DENIED');
  }
  const general = actor.permissions.includes(PLANILLA_ALL_MUNICIPALITIES_PERMISSION);
  const territorialRole = actor.roles?.some((r: string) => ['GESTOR', 'TALENTO_HUMANO'].includes(r)) === true;
  const gestor = actor.roles?.includes('GESTOR') === true;
  const gestorOnly = actor.roles?.includes('GESTOR') && !actor.roles?.includes('TALENTO_HUMANO');
  const result = await client.query<PlanillaAuthorizedContext>(`SELECT
    ne.id::text AS empleado_id, v.id::text AS vinculacion_id, (ne.activo IS FALSE) AS historico,
    ff.municipio_id::text, mu.nombre_municipio AS municipio,
    ff.institucion_id::text, ff.sede_id::text, ff.modalidad_id::text,
    i.nombre_institucion AS institucion, s.nombre_sede AS sede, m.nombre_modalidad AS modalidad,
    (ff.contrato_id = $2::bigint AND i.contrato_id = $2::bigint AND i.municipio_id = ff.municipio_id
      AND s.institucion_id = i.id AND s.municipio_id = ff.municipio_id) AS consistente,
    ($6::boolean OR (($7::boolean = FALSE OR ${gestorApplicableCargoSql('cc')}) AND (
      ($9::boolean AND EXISTS (SELECT 1 FROM gestor_municipio_asignaciones g WHERE g.usuario_id = $1::bigint
        AND g.contrato_id = $2::bigint AND g.municipio_id = ff.municipio_id AND g.activo = TRUE
        AND g.vigencia_desde <= CURRENT_DATE AND (g.vigencia_hasta IS NULL OR g.vigencia_hasta >= CURRENT_DATE)))
      OR ($10::boolean AND EXISTS (SELECT 1 FROM gestor_institucion_asignaciones g WHERE g.usuario_id = $1::bigint
        AND g.contrato_id = $2::bigint AND g.municipio_id = ff.municipio_id AND g.institucion_id = ff.institucion_id
        AND g.activo = TRUE AND g.vigencia_desde <= CURRENT_DATE AND (g.vigencia_hasta IS NULL OR g.vigencia_hasta >= CURRENT_DATE)))
      OR ($10::boolean AND EXISTS (SELECT 1 FROM gestor_personal_asignaciones g WHERE g.usuario_id = $1::bigint
        AND g.contrato_id = $2::bigint AND g.vinculacion_id = v.id AND g.activo = TRUE
        AND g.vigencia_desde <= CURRENT_DATE AND (g.vigencia_hasta IS NULL OR g.vigencia_hasta >= CURRENT_DATE)))
      OR (NOT $9::boolean AND EXISTS (SELECT 1 FROM nomina_responsabilidades_usuario r
        JOIN nomina_responsabilidad_municipios rm ON rm.responsabilidad_id = r.id
        WHERE r.usuario_id = $1::bigint AND r.empresa_id = $3::bigint AND r.contrato_id = $2::bigint
          AND r.proceso = 'COBERTURA' AND r.activo = TRUE AND rm.municipio_id = ff.municipio_id))
    ))) AS autorizado
    FROM nomina_empleados ne JOIN vinculaciones v ON v.id = ne.vinculacion_id
    JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
    JOIN cobertura_asignaciones ca ON ca.vinculacion_id = v.id AND ca.activo = TRUE
      AND ca.fecha_inicio <= $5::date AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= $4::date)
    JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id AND ff.activo = TRUE
    LEFT JOIN municipios mu ON mu.id = ff.municipio_id
    LEFT JOIN instituciones i ON i.id = ff.institucion_id LEFT JOIN sedes s ON s.id = ff.sede_id
    LEFT JOIN modalidades m ON m.id = ff.modalidad_id
    WHERE ne.periodo_id = $8::bigint
      AND v.fecha_inicio <= $5::date AND (v.fecha_fin IS NULL OR v.fecha_fin >= $4::date)
      AND v.contrato_id = $2::bigint AND v.empresa_id = $3::bigint
    ORDER BY ne.id, ca.fecha_inicio DESC, ca.id DESC`,
  [userId, period.contrato_id, period.contrato_empresa_id, period.fecha_inicio, period.fecha_fin, general, !!gestorOnly, period.id, territorialRole, gestor]);
  const grouped = new Map<string, PlanillaAuthorizedContext[]>();
  for (const row of result.rows) grouped.set(row.empleado_id, [...(grouped.get(row.empleado_id) ?? []), row]);
  const contexts = new Map<string, PlanillaAuthorizedContext>();
  for (const [id, rows] of grouped) {
    if (!rows.some(r => r.autorizado === true)) continue;
    // An authorized historical assignment must not expose a later foreign context.
    if (rows.some(r => r.autorizado !== true) || new Set(rows.map(r => r.municipio_id)).size !== 1 ||
      rows.some(r => r.consistente !== true || !r.municipio_id || !r.municipio || !r.institucion || !r.sede || !r.modalidad)) {
      throw new AppError('Contexto territorial ambiguo; requiere revision antes de descargar', 409, 'PLANILLA_AMBIGUOUS_SCOPE');
    }
    contexts.set(id, rows[0]!);
  }
  // A municipal assignment is not a municipality for non-school personnel.
  // Only an explicit contract administrator with the whole contract assigned may
  // consult these records; missing context never authorizes an import write.
  if (actor.roles?.includes('ADMINISTRADOR')) {
    const contractual = await client.query<PlanillaAuthorizedContext>(`SELECT ne.id::text AS empleado_id,
      v.id::text AS vinculacion_id, ''::text AS municipio_id, ''::text AS municipio,
      ''::text AS institucion_id, ''::text AS sede_id, ''::text AS modalidad_id,
      ''::text AS institucion, ''::text AS sede, ''::text AS modalidad,
      TRUE AS autorizado, TRUE AS consistente, 'CONTRACTUAL'::text AS tipo_contexto,
      (ne.activo IS FALSE) AS historico
      FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id
      JOIN contrato_cargos cc ON cc.id=v.contrato_cargo_id
      WHERE ne.periodo_id=$1::bigint AND v.contrato_id=$2::bigint AND v.empresa_id=$3::bigint
        AND v.fecha_inicio<=$5::date AND (v.fecha_fin IS NULL OR v.fecha_fin>=$4::date)
        AND UPPER(TRIM(cc.nombre_cargo)) IN ('ADMINISTRATIVO','OPERARIOS DE BODEGA, TRANSPORTADORES Y AUXILIARES')
        AND EXISTS(SELECT 1 FROM usuario_contratos uc WHERE uc.usuario_id=$6::bigint AND uc.contrato_id=$2::bigint AND COALESCE(uc.activo,TRUE))
        AND EXISTS(SELECT 1 FROM focalizacion_final f WHERE f.contrato_id=$2::bigint AND f.activo=TRUE)
        AND NOT EXISTS(SELECT 1 FROM focalizacion_final f WHERE f.contrato_id=$2::bigint AND f.activo=TRUE AND NOT EXISTS(
          SELECT 1 FROM nomina_responsabilidades_usuario r JOIN nomina_responsabilidad_municipios rm ON rm.responsabilidad_id=r.id
          WHERE r.usuario_id=$6::bigint AND r.empresa_id=$3::bigint AND r.contrato_id=$2::bigint
            AND r.proceso='COBERTURA' AND r.activo=TRUE AND rm.municipio_id=f.municipio_id))
        AND NOT EXISTS(SELECT 1 FROM cobertura_asignaciones ca WHERE ca.vinculacion_id=v.id
          AND ca.fecha_inicio<=$5::date AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=$4::date))`,
    [period.id,period.contrato_id,period.contrato_empresa_id,period.fecha_inicio,period.fecha_fin,userId]);
    for (const row of contractual.rows) if (!contexts.has(row.empleado_id)) contexts.set(row.empleado_id,row);
  }
  if (!contexts.size) throw new AppError('Sin personal dentro del alcance municipal vigente', 403, 'PLANILLA_ACCESS_DENIED');
  return { contexts, allContexts: result.rows.filter(r => contexts.has(r.empleado_id)), general };
}
