import type { NominaEmpleadoApi, NominaMovimientoApi, NominaNovedadApi } from "../../types/nomina.types";

export interface PlanillaContexto { municipio?:string|null;institucion?:string|null;sede?:string|null;modalidad?:string|null }
export interface PlanillaCambio { id:string;vinculacion_id:string;fecha_inicio_efectiva:string;contexto_nuevo:PlanillaContexto;contexto_anterior:PlanillaContexto;tipo:string;activo:boolean }
export interface PlanillaTramo { inicio:string;fin:string;contexto:PlanillaContexto;cambioId:string|null }
export const dateKey=(year:number,month:number,day:number)=>`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
export const employeeBaseContext=(e:NominaEmpleadoApi):PlanillaContexto=>({municipio:e.sede?.municipio??e.municipio,institucion:e.institucion,sede:e.sede?.nombre_sede,modalidad:e.modalidad??e.categoria_salarial?.modalidad});
export function buildTramos(e:NominaEmpleadoApi,periodStart:string,periodEnd:string,cambios:PlanillaCambio[]):PlanillaTramo[]{
  const start=(e.vinculacion.fecha_inicio??periodStart)>periodStart?(e.vinculacion.fecha_inicio??periodStart):periodStart;
  const rawEnd=e.vinculacion.fecha_fin??periodEnd;const end=rawEnd<periodEnd?rawEnd:periodEnd;if(start>end)return[];
  const relevant=cambios.filter(c=>c.activo&&c.fecha_inicio_efectiva>=start&&c.fecha_inicio_efectiva<=end).sort((a,b)=>a.fecha_inicio_efectiva.localeCompare(b.fecha_inicio_efectiva));
  const result:PlanillaTramo[]=[];let cursor=start;let context=employeeBaseContext(e);let source:string|null=null;
  for(const c of relevant){if(c.fecha_inicio_efectiva>cursor){const d=new Date(`${c.fecha_inicio_efectiva}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);result.push({inicio:cursor,fin:d.toISOString().slice(0,10),contexto:context,cambioId:source});}cursor=c.fecha_inicio_efectiva;context=c.contexto_nuevo;source=c.id;}
  result.push({inicio:cursor,fin:end,contexto:context,cambioId:source});return result;
}
export const novedadesOnDate=(items:NominaNovedadApi[],date:string)=>items.filter(n=>n.activo&&(n.fecha_inicio_evento_canonico??n.fecha_inicio??date)<=date&&(n.fecha_fin_evento_canonico??n.fecha_fin??n.fecha_inicio??date)>=date);
export const movimientosOnDate=(items:NominaMovimientoApi[],date:string)=>items.filter(m=>m.activo&&m.fecha===date);
export const novedadCode=(n:NominaNovedadApi)=>n.tipo_novedad.codigo_operativo??n.tipo_novedad.nombre??"NOV";
export const novedadState=(n:NominaNovedadApi)=>n.revisado?"VALIDADA":n.tipo_novedad.requiere_revision?"REQUIERE_REVISION":"REGISTRADA";
export const isOutsideEmployment=(e:NominaEmpleadoApi,date:string)=>(e.vinculacion.fecha_inicio!==null&&date<e.vinculacion.fecha_inicio)||(e.vinculacion.fecha_fin!==null&&date>e.vinculacion.fecha_fin);
export interface PlanillaAsistencia { vinculacion_id:string; fecha:string; estado_dia:string; activo:boolean }
export function mergeAttendance(items:PlanillaAsistencia[], next:PlanillaAsistencia, remove=false):PlanillaAsistencia[]{const key=(item:PlanillaAsistencia)=>`${item.vinculacion_id}|${item.fecha}`;const target=key(next);const without=items.filter(item=>key(item)!==target);return remove?without:[...without,next];}
