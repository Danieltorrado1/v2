import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';

export interface PlanillaImportGuard { id: string; revision: string; bloqueado: boolean; novedades_dependientes: string[] }

/** Raw operational/economic rows never enter the workbook: only a keyed HMAC.
 * Includes inactive rows and MVCC xmin: an edit restored to the same values is
 * still observable, even on legacy tables without an updated_at column.
 */
export async function loadPlanillaImportGuards(client: Pick<PoolClient, 'query'>, periodoId: string, employeeIds: string[]): Promise<PlanillaImportGuard[]> {
  const result = await client.query<{ id: string; snapshot: string; bloqueado: boolean; novedades_dependientes: string[] }>(`SELECT ne.id::text,
    jsonb_build_object('versiones',jsonb_build_array(ne.xmin::text,v.xmin::text,np.xmin::text),
      'empleado', to_jsonb(ne), 'vinculacion', to_jsonb(v), 'periodo', to_jsonb(np),
      'catalogo', (SELECT jsonb_agg(jsonb_build_array(t.id::text,t.xmin::text) ORDER BY t.id) FROM nomina_tipos_novedad t),
      'maestros_contexto', (SELECT jsonb_agg(jsonb_build_array(ff.id::text,ff.xmin::text,i.xmin::text,s.xmin::text,m.xmin::text) ORDER BY c.id)
        FROM cobertura_asignaciones c JOIN focalizacion_final ff ON ff.id=c.focalizacion_final_id
        LEFT JOIN instituciones i ON i.id=ff.institucion_id LEFT JOIN sedes s ON s.id=ff.sede_id LEFT JOIN modalidades m ON m.id=ff.modalidad_id
        WHERE c.vinculacion_id=v.id AND c.fecha_inicio<=np.fecha_fin AND (c.fecha_fin IS NULL OR c.fecha_fin>=np.fecha_inicio)),
      'asistencia', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(a),a.xmin::text) ORDER BY a.id) FROM nomina_asistencia_diaria a WHERE a.periodo_id=np.id AND a.vinculacion_id=v.id),
      'novedades', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(n),n.xmin::text) ORDER BY n.id) FROM nomina_novedades n WHERE n.periodo_id=np.id AND n.nomina_empleado_id=ne.id),
      'canonicas', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(n),n.xmin::text) ORDER BY n.id) FROM nomina_novedades_canonicas n WHERE n.vinculacion_id=v.id AND n.fecha_inicio<=np.fecha_fin AND n.fecha_fin>=np.fecha_inicio),
      'contexto', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(c),c.xmin::text)) FROM nomina_contextos_operativos_base c WHERE c.periodo_id=np.id AND c.nomina_empleado_id=ne.id),
      'asignaciones', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(c),c.xmin::text) ORDER BY c.id) FROM cobertura_asignaciones c WHERE c.vinculacion_id=v.id AND c.fecha_inicio<=np.fecha_fin AND (c.fecha_fin IS NULL OR c.fecha_fin>=np.fecha_inicio)),
      'movimientos', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(m),m.xmin::text) ORDER BY m.id) FROM nomina_movimientos m WHERE m.periodo_id=np.id AND m.vinculacion_id=v.id),
      'liquidaciones', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(l),l.xmin::text) ORDER BY l.id) FROM nomina_liquidaciones l WHERE l.periodo_id=np.id AND l.vinculacion_id=v.id),
      'desprendibles', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(d),d.xmin::text) ORDER BY d.id) FROM nomina_desprendibles d WHERE d.periodo_id=np.id AND d.nomina_empleado_id=ne.id),
      'ajustes', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(a),a.xmin::text) ORDER BY a.id) FROM nomina_ajustes_manuales a WHERE a.periodo_id=np.id AND a.nomina_empleado_id=ne.id),
      'revision', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(r),r.xmin::text) ORDER BY r.id) FROM nomina_revision_operativa r WHERE r.periodo_id=np.id AND r.nomina_empleado_id=ne.id),
      'documentos', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(d),d.xmin::text) ORDER BY d.id) FROM nomina_novedad_documentos d JOIN nomina_novedades n ON n.id=d.nomina_novedad_id WHERE n.periodo_id=np.id AND n.nomina_empleado_id=ne.id),
      'turnos', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(t),t.xmin::text) ORDER BY t.id) FROM nomina_novedad_turnos t JOIN nomina_novedades n ON n.id=t.nomina_novedad_id WHERE n.periodo_id=np.id AND n.nomina_empleado_id=ne.id),
      'coberturas', (SELECT jsonb_agg(jsonb_build_array(to_jsonb(c),c.xmin::text) ORDER BY c.id) FROM nomina_novedad_coberturas c JOIN nomina_novedades n ON n.id=c.nomina_novedad_id WHERE n.periodo_id=np.id AND n.nomina_empleado_id=ne.id)
    )::text AS snapshot,
    (EXISTS (SELECT 1 FROM nomina_liquidaciones l WHERE l.periodo_id=np.id AND l.vinculacion_id=v.id AND COALESCE(l.activo,TRUE))
      OR EXISTS (SELECT 1 FROM nomina_movimientos m WHERE m.periodo_id=np.id AND m.vinculacion_id=v.id AND COALESCE(m.activo,TRUE))
      OR EXISTS (SELECT 1 FROM nomina_desprendibles d WHERE d.periodo_id=np.id AND d.nomina_empleado_id=ne.id AND COALESCE(d.activo,TRUE))
      OR EXISTS (SELECT 1 FROM nomina_ajustes_manuales a WHERE a.periodo_id=np.id AND a.nomina_empleado_id=ne.id AND COALESCE(a.activo,TRUE))) AS bloqueado,
    ARRAY(SELECT n.id::text FROM nomina_novedades n WHERE n.periodo_id=np.id AND n.nomina_empleado_id=ne.id AND (
      EXISTS (SELECT 1 FROM nomina_novedad_documentos d WHERE d.nomina_novedad_id=n.id)
      OR EXISTS (SELECT 1 FROM nomina_novedad_turnos t WHERE t.nomina_novedad_id=n.id)
      OR EXISTS (SELECT 1 FROM nomina_novedad_coberturas c WHERE c.nomina_novedad_id=n.id))) AS novedades_dependientes
    FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id JOIN nomina_periodos np ON np.id=ne.periodo_id
    WHERE np.id=$1::bigint AND ne.id=ANY($2::bigint[]) ORDER BY ne.id`, [periodoId, employeeIds]);
  return result.rows.map(r => ({ id: r.id, revision: createHmac('sha256',env.JWT_SECRET).update(`planilla-revision:${periodoId}:${r.id}:`).update(r.snapshot).digest('hex'),
    bloqueado: r.bloqueado, novedades_dependientes: r.novedades_dependientes }));
}
