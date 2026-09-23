import type { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { assertTenantAccessForVinculacionId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';

export interface ActividadLaboralQuery {
  contrato_id?: number;
  page: number;
  limit: number;
  includeEconomic: boolean;
}

interface HeaderRow extends QueryResultRow {
  vinculacion_id: string;
  empresa_id: string;
  contrato_id: string;
  persona_id: string;
}

interface PeriodRow extends QueryResultRow {
  periodo_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  periodo_estado: string;
  dias_habilitados: number;
  dias_asistencia: number;
  ausencias: number;
  novedades: unknown;
  turnos: unknown;
  liquidacion_estado: string;
  liquidacion_id: string | null;
  neto: string | number | null;
  conceptos: unknown;
  revision_operativa: string | null;
  ultimo_cambio: string | null;
  ultimo_origen: string | null;
}

interface EventRow extends QueryResultRow {
  event_type: string;
  status: string;
  effective_date: string;
  periodo_id: string | null;
  created_at: string;
  impact_status: string | null;
}

const economicPermissions = ['nomina.economico.read', 'nomina.read'];

const jsonValue = (value: unknown, fallback: unknown): unknown => value ?? fallback;

export const getActividadLaboral = async (
  vinculacionId: number,
  query: ActividadLaboralQuery,
  tenant?: TenantAccessContext
) => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const params: unknown[] = [vinculacionId];
  const contractFilter = query.contrato_id ? ' AND v.contrato_id = $2::bigint' : '';
  if (query.contrato_id) params.push(query.contrato_id);
  const header = await dbQuery<HeaderRow>(`
    SELECT v.id::text vinculacion_id, c.empresa_id::text empresa_id,
           c.id::text contrato_id, v.persona_id::text persona_id
    FROM vinculaciones v JOIN contratos c ON c.id=v.contrato_id
    WHERE v.id=$1::bigint${contractFilter} LIMIT 1
  `, params);
  const context = header.rows[0];
  if (!context) throw new AppError('Vinculación no encontrada', 404, 'VINCULACION_NOT_FOUND');

  const offset = (query.page - 1) * query.limit;
  const periodParams = [Number(context.contrato_id), vinculacionId, query.limit, offset];
  const count = await dbQuery<{ total: number }>(
    'SELECT COUNT(*)::int total FROM nomina_periodos WHERE contrato_id=$1::bigint',
    [Number(context.contrato_id)]
  );
  const periods = await dbQuery<PeriodRow>(`
    WITH p AS (
      SELECT np.id, np.fecha_inicio, np.fecha_fin, np.estado
      FROM nomina_periodos np WHERE np.contrato_id=$1::bigint
      ORDER BY np.fecha_inicio DESC, np.id DESC LIMIT $3 OFFSET $4
    ), a AS (
      SELECT periodo_id, COUNT(*) FILTER (WHERE COALESCE(activo,TRUE) AND estado_dia='PRESENTE')::int dias_asistencia,
             COUNT(*) FILTER (WHERE COALESCE(activo,TRUE) AND estado_dia<>'PRESENTE')::int ausencias
      FROM nomina_asistencia_diaria WHERE vinculacion_id=$2::bigint GROUP BY periodo_id
    ), n AS (
      SELECT nn.periodo_id, jsonb_agg(jsonb_build_object('id',nn.id::text,'codigo',COALESCE(nn.tipo_novedad_codigo_operativo,ntn.codigo_operativo),'fecha_inicio',nn.fecha_inicio,'fecha_fin',nn.fecha_fin,'estado',CASE WHEN COALESCE(nn.activo,TRUE) THEN 'ACTIVA' ELSE 'INACTIVA' END,'activa',COALESCE(nn.activo,TRUE)) ORDER BY nn.id) items
      FROM nomina_novedades nn LEFT JOIN nomina_tipos_novedad ntn ON ntn.id=nn.tipo_novedad_id
      WHERE nn.vinculacion_id=$2::bigint GROUP BY nn.periodo_id
    ), t AS (
      SELECT nm.periodo_id,
        jsonb_build_object('internos',COUNT(*) FILTER (WHERE COALESCE(nm.externo_id IS NULL,TRUE)), 'externos',COUNT(*) FILTER (WHERE nm.externo_id IS NOT NULL), 'valor_interno',COALESCE(SUM(nm.valor_total) FILTER (WHERE nm.externo_id IS NULL),0), 'valor_externo',COALESCE(SUM(nm.valor_total) FILTER (WHERE nm.externo_id IS NOT NULL),0)) datos
      FROM nomina_movimientos nm WHERE nm.vinculacion_id=$2::bigint AND COALESCE(nm.activo,TRUE) GROUP BY nm.periodo_id
    ), l AS (
      SELECT nl.periodo_id,nl.id::text liquidacion_id,nl.estado, nl.total_liquidacion, nl.deducciones,
        jsonb_build_object('total_liquidacion',nl.total_liquidacion,'deducciones',nl.deducciones,'salario_base',nl.salario_base) conceptos
      FROM nomina_liquidaciones nl WHERE nl.vinculacion_id=$2::bigint
    ), r AS (
      SELECT periodo_id, COALESCE(estado_revision,'PENDIENTE') estado
      FROM nomina_revision_operativa WHERE vinculacion_id=$2::bigint
    )
    SELECT p.id::text periodo_id,p.fecha_inicio::text,p.fecha_fin::text,p.estado periodo_estado,
      (p.fecha_fin-p.fecha_inicio+1)::int dias_habilitados,COALESCE(a.dias_asistencia,0) dias_asistencia,COALESCE(a.ausencias,0) ausencias,
      COALESCE(n.items,'[]'::jsonb) novedades,COALESCE(t.datos,'{"internos":0,"externos":0,"valor_interno":0,"valor_externo":0}'::jsonb) turnos,
      CASE WHEN l.liquidacion_id IS NULL THEN 'INEXISTENTE' WHEN l.estado IN ('FINALIZADA','FINALIZADO') THEN 'FINALIZADA' WHEN l.estado IN ('CALCULADA','CALCULADO') THEN 'CALCULADA' ELSE 'PRELIMINAR' END liquidacion_estado,
      l.liquidacion_id,${query.includeEconomic ? 'l.total_liquidacion' : 'NULL'} neto,${query.includeEconomic ? 'l.conceptos' : 'NULL'} conceptos,
      COALESCE(r.estado,'PENDIENTE') revision_operativa,NULL::text ultimo_cambio,NULL::text ultimo_origen
    FROM p LEFT JOIN a ON a.periodo_id=p.id LEFT JOIN n ON n.periodo_id=p.id LEFT JOIN t ON t.periodo_id=p.id LEFT JOIN l ON l.periodo_id=p.id LEFT JOIN r ON r.periodo_id=p.id
  `, periodParams);

  const eventResult = await dbQuery<EventRow>(`
    SELECT e.event_type,e.status,e.effective_date::text,e.periodo_id::text,e.created_at::text,i.estado impact_status
    FROM integracion_eventos e LEFT JOIN integracion_evento_impactos i ON i.evento_id=e.id
    WHERE e.vinculacion_id=$1::bigint ORDER BY e.created_at DESC LIMIT 100
  `, [vinculacionId]);
  const items = periods.rows.map((row) => {
    const periodEvents = eventResult.rows.filter((event) => event.periodo_id === row.periodo_id);
    const lastEvent = periodEvents[0];
    const rawTurnos = (jsonValue(row.turnos, { internos: 0, externos: 0 }) as Record<string, unknown>);
    const turnos = query.includeEconomic ? rawTurnos : { internos: rawTurnos.internos ?? 0, externos: rawTurnos.externos ?? 0 };
    return {
    periodo: { id: row.periodo_id, fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin, estado: row.periodo_estado },
    dias_habilitados: row.dias_habilitados,
    asistencia: { dias: row.dias_asistencia, ausencias: row.ausencias },
    novedades: jsonValue(row.novedades, []),
    turnos,
    revision_operativa: row.revision_operativa ?? 'PENDIENTE',
    liquidacion: { estado: row.liquidacion_estado, id: row.liquidacion_id, ...(query.includeEconomic ? { neto: row.neto, conceptos: row.conceptos } : {}) },
    sincronizacion: { eventos: periodEvents.map((event) => ({ tipo: event.event_type, estado: event.impact_status ?? event.status, fecha: event.created_at })) },
    ultimo_cambio: lastEvent?.created_at ?? row.ultimo_cambio,
    origen: lastEvent ? (lastEvent.event_type.startsWith('ASISTENCIA') ? 'Planilla' : lastEvent.event_type.startsWith('NOVEDAD') ? 'Novedades' : lastEvent.event_type.startsWith('TURNO') ? 'Turnos' : 'Nómina') : row.ultimo_origen
    };
  });
  return { vinculacion_id: context.vinculacion_id, empresa_id: context.empresa_id, contrato_id: context.contrato_id, items, eventos_integracion: eventResult.rows.map((event) => ({ tipo: event.event_type, estado: event.impact_status ?? event.status, fecha: event.created_at })), pagination: { page: query.page, limit: query.limit, total: count.rows[0]?.total ?? 0, total_pages: Math.ceil((count.rows[0]?.total ?? 0) / query.limit) } };
};

export const canReadActividadEconomica = (permissions: string[]): boolean => economicPermissions.some((permission) => permissions.includes(permission));
