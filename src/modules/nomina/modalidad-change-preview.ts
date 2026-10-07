import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { contractModalityContext } from '../cobertura/modalidad-contract-catalog';
import { resolveOperationalContextTimeline } from '../integracion/contexto-laboral.service';

export interface ModalityPreviewInput {
  periodo_id: string; nomina_empleado_id: string; vinculacion_id: string;
  fecha_inicio_efectiva: string; contexto_nuevo: {institucion_id?: unknown;sede_id?: unknown;modalidad_id?: unknown;municipio_id?: unknown};
}
const date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)
    throw new AppError('Fecha efectiva inválida',400,'ASIGNACION_FECHA_INVALIDA');
  return value;
};

export async function previewModalityChange(client: Pick<PoolClient,'query'>, input: ModalityPreviewInput) {
  const effective=date(input.fecha_inicio_efectiva);
  const columns=(await client.query<{column_name:string}>(`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='cobertura_asignaciones'`)).rows;
  if(!['institucion_id','sede_id','modalidad_id'].every(name=>columns.some(row=>row.column_name===name)))
    throw new AppError('El cambio temporal no está habilitado en esta instalación',503,'ASIGNACION_ESQUEMA_REQUERIDO');
  const base=(await client.query<any>(`SELECT c.id::text contrato_id,c.empresa_id::text,
    c.fecha_inicio::text contrato_inicio,COALESCE(c.fecha_final_real,c.fecha_final_estimada,c.fecha_finalizacion)::text contrato_fin,
    v.fecha_inicio::text vinculacion_inicio,v.fecha_fin::text vinculacion_fin,
    np.fecha_inicio::text periodo_inicio,np.fecha_fin::text periodo_fin,np.estado,
    ne.categoria_salarial_id::text categoria_actual_id
    FROM nomina_empleados ne JOIN nomina_periodos np ON np.id=ne.periodo_id
    JOIN vinculaciones v ON v.id=ne.vinculacion_id JOIN contratos c ON c.id=v.contrato_id AND c.id=np.contrato_id
    WHERE ne.id=$1::bigint AND np.id=$2::bigint AND v.id=$3::bigint AND COALESCE(ne.activo,TRUE)`,
    [input.nomina_empleado_id,input.periodo_id,input.vinculacion_id])).rows[0];
  if (!base) throw new AppError('Empleado fuera del contrato/período',409,'NOMINA_CAMBIO_EMPLEADO_INVALIDO');
  if (base.estado!=='ABIERTO') throw new AppError('Período cerrado o anulado',409,'NOMINA_CAMBIO_PERIODO_CERRADO');
  if (effective<base.contrato_inicio || (base.contrato_fin && effective>base.contrato_fin)
    || effective<base.vinculacion_inicio || (base.vinculacion_fin && effective>base.vinculacion_fin)
    || effective<base.periodo_inicio || effective>base.periodo_fin)
    throw new AppError('Fecha fuera del contrato, vinculación o período',409,'ASIGNACION_FECHA_FUERA_RANGO');
  const target=await contractModalityContext(client,base.contrato_id,input.contexto_nuevo);
  const history=(await client.query<any>(`SELECT ca.*,ca.fecha_inicio::text desde,ca.fecha_fin::text hasta,
    COALESCE((to_jsonb(ca)->>'institucion_id')::bigint,ff.institucion_id)::text institucion_id,
    COALESCE((to_jsonb(ca)->>'sede_id')::bigint,ff.sede_id)::text sede_id,
    COALESCE((to_jsonb(ca)->>'modalidad_id')::bigint,ff.modalidad_id)::text modalidad_id
    FROM cobertura_asignaciones ca LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
    WHERE ca.vinculacion_id=$1::bigint AND ca.contrato_id=$2::bigint AND COALESCE(ca.activo,TRUE)
    ORDER BY ca.fecha_inicio,ca.id`,[input.vinculacion_id,base.contrato_id])).rows;
  for (let index=1;index<history.length;index++) {
    const previous=history[index-1]!; const current=history[index]!;
    if (!previous.hasta || previous.hasta>=current.desde) throw new AppError('Solapamiento de vigencias',409,'ASIGNACION_OPERATIVA_SOLAPADA');
    const next=new Date(`${previous.hasta}T00:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
    if (next.toISOString().slice(0,10)!==current.desde) throw new AppError('Hueco de vigencias',409,'ASIGNACION_OPERATIVA_HUECO');
  }
  const matches=history.filter(row=>row.desde<=effective && (!row.hasta || row.hasta>=effective));
  if (matches.length!==1) throw new AppError('Falta asignación vigente inequívoca',409,'ASIGNACION_OPERATIVA_INVALIDA');
  const current=matches[0]!;
  const newEnd=[current.hasta,base.contrato_fin,base.vinculacion_fin].filter((value):value is string=>Boolean(value)).sort()[0]??null;
  if (current.institucion_id!==target.institucion_id || current.sede_id!==target.sede_id)
    throw new AppError('El cambio de modalidad debe conservar institución y sede',409,'ASIGNACION_SEDE_INVALIDA');
  const periods=(await client.query<any>(`SELECT np.id::text,np.estado,np.fecha_inicio::text,np.fecha_fin::text
    FROM nomina_periodos np WHERE np.contrato_id=$1::bigint
    AND np.fecha_fin>=$2::date AND ($3::date IS NULL OR np.fecha_inicio<=$3::date)
    ORDER BY np.id`,[base.contrato_id,effective,newEnd])).rows;
  // An annulled projection cannot veto canonical history. It remains immutable:
  // only the open subset is passed to snapshot repair / recalculation markers.
  if (periods.some(row=>row.estado==='CERRADO'))
    throw new AppError('La nueva vigencia afecta un período cerrado',409,'NOMINA_CAMBIO_PERIODO_CERRADO');
  const candidates=(await client.query<any>(`SELECT ncs.id::text,ncs.codigo_categoria,ncs.nombre_categoria,
    ncs.vigente_desde::text,ncs.vigente_hasta::text FROM nomina_categorias_salariales ncs
    JOIN contratos c ON c.id=ncs.contrato_id AND c.empresa_id=$1::bigint
    WHERE ncs.contrato_id=$2::bigint AND COALESCE(ncs.activo,TRUE)
    AND LOWER(BTRIM(ncs.modalidad))=LOWER(BTRIM($3))
    AND (ncs.vigente_desde IS NULL OR ncs.vigente_desde<=$4::date)
    AND (ncs.vigente_hasta IS NULL OR ncs.vigente_hasta>=$4::date) ORDER BY ncs.id`,
    [base.empresa_id,base.contrato_id,target.modalidad,effective])).rows;
  const same=current.modalidad_id===target.modalidad_id;
  const timeline=await resolveOperationalContextTimeline({empresaId:Number(base.empresa_id),contratoId:Number(base.contrato_id),
    vinculacionId:Number(input.vinculacion_id),fechaInicio:base.periodo_inicio>base.vinculacion_inicio?base.periodo_inicio:base.vinculacion_inicio,
    fechaFin:base.vinculacion_fin && base.vinculacion_fin<base.periodo_fin?base.vinculacion_fin:base.periodo_fin},client);
  if (timeline.huecos.length) throw new AppError('La línea temporal tiene huecos',409,'ASIGNACION_OPERATIVA_HUECO');
  const previousEnd=new Date(`${effective}T00:00:00Z`); previousEnd.setUTCDate(previousEnd.getUTCDate()-1);
  const preview={empresa_id:base.empresa_id,contrato_id:base.contrato_id,
    anterior:{...current,id:String(current.id)},nuevo:target,fecha_efectiva:effective,
    cierre_anterior:current.desde===effective?null:previousEnd.toISOString().slice(0,10),
    nueva_vigencia:{desde:effective,hasta:newEnd},
    categoria_actual_id:base.categoria_actual_id,
    categoria_propuesta:candidates.length===1?candidates[0]:null,
    estado_salarial:candidates.length===1?'PROPUESTA':'REQUIERE_REVISION_SALARIAL',
    periodos_abiertos:periods.filter(row=>row.estado==='ABIERTO'),
    periodos_protegidos:periods.filter(row=>row.estado!=='ABIERTO'),requiere_recalculo:!same,
    sin_cambio:same,historial:history};
  // The revision binds the confirmation to assignments, periods and salary rules.
  return {...preview,revision:createHash('sha256').update(JSON.stringify(preview)).digest('hex')};
}
