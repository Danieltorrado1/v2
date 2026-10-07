import type {PoolClient} from 'pg';
import {AppError} from '../../utils/AppError';
import {resolveOperationalContextTimeline} from '../integracion/contexto-laboral.service';

export async function canonicalSalaryTimeline(client:Pick<PoolClient,'query'>,input:{
  empresaId:number;contratoId:number;vinculacionId:number;fechaInicio:string;fechaFin:string;
}) {
  // Independent versions and explicitly corrected history require canonical
  // salary compatibility. Never reuse a snapshot's category by similarity.
  const versioned=await client.query(`SELECT 1 FROM cobertura_asignaciones ca
    WHERE ca.contrato_id=$1::bigint AND ca.vinculacion_id=$2::bigint AND COALESCE(ca.activo,TRUE)
    AND (ca.focalizacion_final_id IS NULL OR ca.observacion LIKE 'PHASE48_HISTORICAL_15_24_V1:%')
    AND to_jsonb(ca)->>'modalidad_id' IS NOT NULL
    AND ca.fecha_inicio<=$4::date AND (ca.fecha_fin IS NULL OR ca.fecha_fin>=$3::date)`,
    [input.contratoId,input.vinculacionId,input.fechaInicio,input.fechaFin]);
  if(!versioned.rows.length)return null;
  const timeline=await resolveOperationalContextTimeline(input,client);
  if(timeline.huecos.length)throw new AppError('Huecos en la vigencia salarial',409,'REQUIERE_REVISION_SALARIAL');
  const rows=[];
  for(const tramo of timeline.tramos) {
    const categories=(await client.query<any>(`SELECT ncs.*,ncs.id::text categoria_id,
      ncs.vigente_desde::text desde,ncs.vigente_hasta::text hasta
      FROM nomina_categorias_salariales ncs JOIN contratos c ON c.id=ncs.contrato_id
      WHERE c.empresa_id=$1::bigint AND c.id=$2::bigint AND COALESCE(ncs.activo,TRUE)
      AND LOWER(BTRIM(ncs.modalidad))=LOWER(BTRIM($3))
      AND (ncs.vigente_desde IS NULL OR ncs.vigente_desde<=$5::date)
      AND (ncs.vigente_hasta IS NULL OR ncs.vigente_hasta>=$4::date) ORDER BY ncs.id`,
      [input.empresaId,input.contratoId,tramo.modalidad,tramo.fecha_inicio,tramo.fecha_fin])).rows;
    const end=tramo.fecha_fin??input.fechaFin;
    const nextDay=(value:string)=>{const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
    const cuts=[...new Set([tramo.fecha_inicio,nextDay(end),...categories.flatMap(row=>[
      row.desde&&row.desde>tramo.fecha_inicio&&row.desde<=end?row.desde:null,
      row.hasta&&row.hasta>=tramo.fecha_inicio&&row.hasta<end?nextDay(row.hasta):null,
    ]).filter((value):value is string=>Boolean(value))])].sort();
    for(let index=0;index<cuts.length-1;index++) {
      const inicio=cuts[index]!;const fin=new Date(`${cuts[index+1]}T00:00:00Z`);fin.setUTCDate(fin.getUTCDate()-1);
      const fechaFin=fin.toISOString().slice(0,10);
      const valid=categories.filter(row=>(!row.desde||row.desde<=inicio)&&(!row.hasta||row.hasta>=fechaFin));
      if(valid.length!==1)throw new AppError('REQUIERE_REVISION_SALARIAL: falta una categoría única para la modalidad y vigencia',409,
        'REQUIERE_REVISION_SALARIAL',{modalidad:tramo.modalidad,fecha_inicio:inicio,fecha_fin:fechaFin});
      rows.push({fecha_inicio:inicio,fecha_fin:fechaFin,
        dias:Math.floor((fin.valueOf()-Date.parse(`${inicio}T00:00:00Z`))/86400000)+1,
        contexto:{...tramo,categoria_id:valid[0]!.categoria_id},categoria:valid[0]!});
    }
  }
  return rows;
}
