import type { PoolClient } from 'pg';
import { dbPool } from '../../config/db';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { assertTenantAccessForEmpresaId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { agendaRepository } from './agenda.repository';
import type { AgendaEstado, AgendaScope } from './agenda.types';
import { followupSchema, followupListSchema, closeDaySchema, rescheduleSchema, topSchema, topQuerySchema, type AgendaListQuery } from './agenda.schemas';

const transitions: Record<AgendaEstado, AgendaEstado[]> = {
  PENDIENTE:['EN_PROCESO','TERMINADA','REPROGRAMADA','CANCELADA'], EN_PROCESO:['TERMINADA','REPROGRAMADA','CANCELADA'],
  REPROGRAMADA:['PENDIENTE','EN_PROCESO'], TERMINADA:['PENDIENTE'], CANCELADA:['PENDIENTE']
};
const assertPermission=(permissions:string[],specific:string)=>{if(!permissions.includes(specific)&&!permissions.includes('agenda.manage'))throw new AppError('Sin permiso para gestionar Agenda',403,'FORBIDDEN');};
const actorId=(id:string|number)=>{const n=Number(id);if(!Number.isInteger(n)||n<1)throw new AppError('Usuario autenticado invalido',401,'UNAUTHORIZED');return n;};
const company=(tenant:TenantAccessContext|undefined):number=>{if(!tenant||tenant.empresaIds.length!==1)throw new AppError('Debe existir una empresa activa para operar Agenda',403,'AGENDA_EMPRESA_REQUERIDA');return tenant.empresaIds[0]!;};
const scope=(actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]):AgendaScope=>{const empresaId=company(tenant);assertTenantAccessForEmpresaId(tenant,empresaId);return {empresaId,userId:actorId(actor),canManage:permissions.includes('agenda.manage'),canAudit:permissions.includes('agenda.audit')};};
async function validateUsers(ids:number[],empresaId:number,e:PoolClient){const expected=[...new Set(ids)];const found=await agendaRepository.usersBelong(expected,empresaId,e);if(expected.some(id=>!found.has(id)))throw new AppError('Usuario no pertenece a la empresa',403,'AGENDA_USUARIO_EMPRESA_INVALIDA');}
const compatible:Record<string,string[]>={PERSONAL:['PERSONA','VINCULACION'],COBERTURA:['INSTITUCION','SEDE','VINCULACION'],NOMINA:['VINCULACION','CONTRATO','PERIODO'],DOCUMENTOS:['DOCUMENTO'],SST:['CASO_SST','PERSONA'],REMISIONES:['REMISION'],CONTRATOS:['CONTRATO'],ADMINISTRACION:['PERSONA','VINCULACION']};
async function validateInput(input:any,empresaId:number,e:PoolClient){if(input.modulo_relacionado&&input.tipo_entidad_relacionada&&!compatible[input.modulo_relacionado]?.includes(input.tipo_entidad_relacionada))throw new AppError('Referencia incompatible con el modulo',400,'AGENDA_REFERENCIA_INVALIDA');await agendaRepository.validateReferences(input,empresaId,e);}
async function audit(e:PoolClient,action:string,id:number,userId:number,before:any,after:any,meta?:AuditRequestMeta){await registerAuditEntry({client:e,usuario_id:String(userId),accion:action,tabla:'agenda_tareas',registro_id:String(id),descripcion:`Agenda: ${action}`,before,after,...meta});}
export async function listTasks(query:AgendaListQuery,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){return agendaRepository.list(query,scope(actor,tenant,permissions));}
export async function listAssignableUsers(query:{search?:string;limit:number;empresa_id?:number},actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){if(!permissions.some(p=>['agenda.create','agenda.assign','agenda.update','agenda.manage','agenda.read'].includes(p)))throw new AppError('Sin permiso para consultar usuarios asignables',403,'AGENDA_ASSIGNABLE_USERS_FORBIDDEN');const s=scope(actor,tenant,permissions);if(query.empresa_id!==undefined&&query.empresa_id!==s.empresaId)throw new AppError('Empresa activa fuera del alcance',403,'AGENDA_FORBIDDEN');return agendaRepository.listAssignableUsers(query,s);}
export async function getTask(id:number,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){const s=scope(actor,tenant,permissions);const row=await agendaRepository.detail(id,s);if(!row)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');return row;}
export async function createTask(input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){assertPermission(permissions,'agenda.create');const s=scope(actor,tenant,permissions);const e=await dbPool.connect();try{await e.query('BEGIN');await validateUsers([s.userId,input.responsable_id,...(input.participantes??[])],s.empresaId,e);await validateInput(input,s.empresaId,e);const row=await agendaRepository.insert(input,s,e);await agendaRepository.assignment({empresaId:s.empresaId,tareaId:row.id,previous:null,next:input.responsable_id,assignedBy:s.userId},e);await agendaRepository.participants(row.id,input.participantes??[],e);await audit(e,'CREATE',row.id,s.userId,null,row,meta);await e.query('COMMIT');return row;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
export async function updateTask(id:number,input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){assertPermission(permissions,'agenda.update');const s=scope(actor,tenant,permissions);const e=await dbPool.connect();try{await e.query('BEGIN');const before=await agendaRepository.get(id,{...s,canManage:true},e);if(!before)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');if(!s.canManage&&Number(before.creador_id)!==s.userId&&Number(before.responsable_id)!==s.userId)throw new AppError('Sin alcance sobre la tarea',403,'AGENDA_FORBIDDEN');if(input.estado)throw new AppError('Use el endpoint de transición',409,'AGENDA_TRANSICION_REQUERIDA');if(input.responsable_id)throw new AppError('Use el endpoint de asignacion',409,'AGENDA_ASIGNACION_REQUERIDA');await validateInput(input,s.empresaId,e);const row=await agendaRepository.update(id,input,s,e);await audit(e,'UPDATE',id,s.userId,before,row,meta);await e.query('COMMIT');return row;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
async function transition(id:number,state:AgendaEstado,comment:string|undefined,version:number|undefined,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){assertPermission(permissions,state==='TERMINADA'?'agenda.complete':state==='CANCELADA'?'agenda.cancel':state==='PENDIENTE'?'agenda.reopen':'agenda.update');const s=scope(actor,tenant,permissions);const e=await dbPool.connect();try{await e.query('BEGIN');const before=await agendaRepository.get(id,{...s,canManage:true},e);if(!before)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');if(!s.canManage&&Number(before.responsable_id)!==s.userId&&Number(before.creador_id)!==s.userId)throw new AppError('Sin alcance sobre la tarea',403,'AGENDA_FORBIDDEN');if(!transitions[before.estado as AgendaEstado]?.includes(state))throw new AppError('Transicion de estado no permitida',409,'AGENDA_TRANSICION_INVALIDA');if(state==='TERMINADA'&&before.estado==='TERMINADA')throw new AppError('Tarea ya terminada',409,'AGENDA_VERSION_CONFLICT');const row=await agendaRepository.transition(id,state,comment,s,version,e);if(!row)throw new AppError('La tarea fue modificada por otro usuario',409,'AGENDA_VERSION_CONFLICT');await agendaRepository.followup(id,{tipo:state==='TERMINADA'?'CIERRE':'CAMBIO_ESTADO',comentario:comment??`Estado: ${state}`,estado_anterior:before.estado,estado_nuevo:state},s,e);await audit(e,`STATUS_${state}`,id,s.userId,before,row,meta);await e.query('COMMIT');return row;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
export const startTask=(...a:any[])=>transition(a[0],'EN_PROCESO',a[1],a[2],a[3],a[4],a[5],a[6]);
export const completeTask=(...a:any[])=>transition(a[0],'TERMINADA',a[1],a[2],a[3],a[4],a[5],a[6]);
export const reopenTask=(...a:any[])=>transition(a[0],'PENDIENTE',a[1],a[2],a[3],a[4],a[5],a[6]);
export async function assignTask(id:number,input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){if(!permissions.includes('agenda.assign')&&!permissions.includes('agenda.manage'))throw new AppError('Sin permiso para asignar tareas',403,'FORBIDDEN');const s=scope(actor,tenant,permissions),e=await dbPool.connect();try{await e.query('BEGIN');await validateUsers([input.responsable_id],s.empresaId,e);const before=await agendaRepository.get(id,{...s,canManage:true},e);if(before&&!s.canManage&&Number(before.creador_id)!==s.userId&&Number(before.responsable_id)!==s.userId)throw new AppError('Sin alcance sobre la tarea',403,'AGENDA_FORBIDDEN');const row=await agendaRepository.reassign(id,input.responsable_id,s,input.motivo,e);if(!row||!before)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');await agendaRepository.followup(id,{tipo:'REASIGNACION',comentario:input.motivo??'Responsable actualizado'},s,e);await audit(e,'ASSIGN',id,s.userId,before,row,meta);await e.query('COMMIT');return row;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
export async function replaceParticipants(id:number,input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){if(!permissions.includes('agenda.update')&&!permissions.includes('agenda.manage'))throw new AppError('Sin permiso para actualizar participantes',403,'FORBIDDEN');const s=scope(actor,tenant,permissions),e=await dbPool.connect();try{await e.query('BEGIN');const before=await agendaRepository.get(id,{...s,canManage:true},e);if(!before)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');if(!s.canManage&&Number(before.creador_id)!==s.userId&&Number(before.responsable_id)!==s.userId)throw new AppError('Sin alcance sobre la tarea',403,'AGENDA_FORBIDDEN');if(input.participantes.includes(Number(before.responsable_id)))throw new AppError('El responsable no puede duplicarse como participante',400,'AGENDA_PARTICIPANTE_RESPONSABLE_DUPLICADO');if(new Set(input.participantes).size!==input.participantes.length)throw new AppError('No se permiten participantes duplicados',400,'AGENDA_PARTICIPANTES_DUPLICADOS');await validateUsers(input.participantes,s.empresaId,e);await agendaRepository.followup(id,{tipo:'COMENTARIO',comentario:'Participantes actualizados'},s,e);const row=await agendaRepository.replaceParticipants(id,input.participantes,s,e);await audit(e,'PARTICIPANTS_UPDATE',id,s.userId,before,row,meta);await e.query('COMMIT');return row;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
export async function rescheduleTask(id:number,input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){assertPermission(permissions,'agenda.update');const s=scope(actor,tenant,permissions),e=await dbPool.connect();try{await e.query('BEGIN');const parsed=rescheduleSchema.safeParse(input);if(!parsed.success)throw new AppError('Reprogramacion no valida',400,'AGENDA_REPROGRAMACION_INVALIDA');const result=await agendaRepository.reschedule(id,parsed.data,s,e);if(!result)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');await agendaRepository.followup(id,{tipo:'REPROGRAMACION',comentario:input.motivo,fecha_anterior:result.old.fecha_prevista,fecha_nueva:input.fecha_prevista},s,e);await audit(e,'RESCHEDULE',id,s.userId,result.old,result.current,meta);await e.query('COMMIT');return result.current;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
export async function cancelTask(id:number,input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){return transition(id,'CANCELADA',input.motivo,input.version,actor,tenant,permissions,meta);}
export async function addFollowup(id:number,input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){
  assertPermission(permissions,'agenda.update');
  const s=scope(actor,tenant,permissions);
  const parsed=followupSchema.safeParse(input);
  if(!parsed.success)throw new AppError('Seguimiento no valido',400,'AGENDA_SEGUIMIENTO_INVALIDO');
  const data=parsed.data;
  if(data.evidencia_documento_id)throw new AppError('Las evidencias documentales estan fuera de esta fase',409,'AGENDA_EVIDENCIA_FUERA_DE_FASE');
  const e=await dbPool.connect();
  try{
    await e.query('BEGIN');
    // Serialize the optional scheduling update and its history snapshot.
    await e.query('SELECT id FROM agenda_tareas WHERE id=$1 AND empresa_id=$2 FOR UPDATE',[id,s.empresaId]);
    const row=await agendaRepository.get(id,s,e);
    if(!row)throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');
    const scheduling={
      ...(data.fecha_proxima_seguimiento!==undefined?{fecha_proxima_seguimiento:data.fecha_proxima_seguimiento}:{}),
      ...(data.requiere_seguimiento!==undefined?{requiere_seguimiento:data.requiere_seguimiento}:{})
    };
    if(Object.keys(scheduling).length){
      const updated=await agendaRepository.update(id,scheduling,s,e);
      await audit(e,'FOLLOWUP_SCHEDULE',id,s.userId,row,updated,meta);
    }
    // For manual entries these existing date columns snapshot the next follow-up date.
    const f=await agendaRepository.followup(id,{
      ...data,fecha_anterior:row.fecha_proxima_seguimiento??null,
      fecha_nueva:data.fecha_proxima_seguimiento!==undefined?data.fecha_proxima_seguimiento:row.fecha_proxima_seguimiento??null
    },s,e);
    await audit(e,'FOLLOWUP',id,s.userId,null,f,meta);
    await e.query('COMMIT');
    return f;
  }catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}
}
export async function history(id:number,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){const s=scope(actor,tenant,permissions);if(!(await agendaRepository.get(id,s)))throw new AppError('Tarea no encontrada',404,'AGENDA_TAREA_NOT_FOUND');return agendaRepository.history(id,s);}
export async function listFollowups(input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){
  assertPermission(permissions,'agenda.read');
  const parsed=followupListSchema.safeParse(input);
  if(!parsed.success)throw new AppError('Filtros de seguimientos invalidos',400,'AGENDA_SEGUIMIENTOS_FILTROS_INVALIDOS');
  const s=scope(actor,tenant,permissions);
  if(parsed.data.empresa_id!==undefined&&parsed.data.empresa_id!==s.empresaId)throw new AppError('Empresa activa fuera del alcance',403,'AGENDA_FORBIDDEN');
  return agendaRepository.listFollowups(parsed.data,s);
}
export async function summary(actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){const s=scope(actor,tenant,permissions);const [data,top]=await Promise.all([agendaRepository.summary(s),agendaRepository.top(new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'}),s,dbPool)]);return {...data,top_3:top};}
const topPositions = (rows:any[]):(number|null)[] => [1,2,3].map(position => {
  const row=rows.find(item=>Number(item.posicion)===position);
  return row ? Number(row.tarea_id) : null;
});
const normalizeTop = (ids:(number|null)[]) => [0,1,2].map(index=>ids[index]??null);
const topResult = (fecha:string,items:any[]) => ({fecha,items,tarea_ids:topPositions(items)});
export async function getTop(date:string,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){
  if(!permissions.some(p=>['agenda.read','agenda.update','agenda.manage'].includes(p)))throw new AppError('Sin permiso para consultar Top 3',403,'FORBIDDEN');
  const parsed=topQuerySchema.safeParse({fecha:date});
  if(!parsed.success)throw new AppError('Fecha de Top 3 invalida',400,'AGENDA_TOP_INVALIDO');
  const s=scope(actor,tenant,permissions);
  return topResult(date,await agendaRepository.top(date,s,dbPool));
}
export async function replaceTop(input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){
  assertPermission(permissions,'agenda.update');
  const s=scope(actor,tenant,permissions);
  const parsed=topSchema.safeParse(input);
  if(!parsed.success)throw new AppError('Top 3 invalido: revise fecha, posiciones, duplicados y estado esperado',400,'AGENDA_TOP_INVALIDO');
  const data=parsed.data,e=await dbPool.connect();
  try{
    await e.query('BEGIN');
    // Lock also covers an empty Top 3, where there are no rows to lock yet.
    await e.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`agenda_top:${s.empresaId}:${s.userId}:${data.fecha}`]);
    const before=await agendaRepository.top(data.fecha,s,e);
    if(JSON.stringify(topPositions(before))!==JSON.stringify(normalizeTop(data.esperado)))throw new AppError('Tu Top 3 cambio. Recargalo antes de guardar.',409,'AGENDA_TOP_CONFLICT');
    const ids=data.tarea_ids.filter((id):id is number=>id!==null);
    const accessible=await agendaRepository.accessibleTasks(ids,s,e);
    if(accessible.length!==ids.length)throw new AppError('Tarea fuera del alcance',403,'AGENDA_FORBIDDEN');
    const rows=await agendaRepository.replaceTop(data.fecha,data.tarea_ids,s,e);
    await registerAuditEntry({client:e,usuario_id:String(s.userId),empresa_id:s.empresaId,accion:'TOP_UPDATE',tabla:'agenda_top_tareas',registro_id:`${s.userId}:${data.fecha}`,descripcion:'Agenda: Top 3 actualizado',before:topPositions(before),after:normalizeTop(data.tarea_ids),...meta});
    await e.query('COMMIT');
    return topResult(data.fecha,rows);
  }catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}
}
export async function closeDay(input:any,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[],meta?:AuditRequestMeta){assertPermission(permissions,'agenda.update');const s=scope(actor,tenant,permissions),e=await dbPool.connect();try{await e.query('BEGIN');const parsed=closeDaySchema.safeParse(input);if(!parsed.success)throw new AppError('Cierre diario no valido',400,'AGENDA_CIERRE_INVALIDO');const row=await agendaRepository.closeDay(parsed.data,s,e);await audit(e,'CLOSE_DAY',row.id,s.userId,null,row,meta);await e.query('COMMIT');return row;}catch(err){await e.query('ROLLBACK');throw err;}finally{e.release();}}
export async function getCloseDay(date:string,actor:string|number,tenant:TenantAccessContext|undefined,permissions:string[]){return agendaRepository.getCloseDay(date,scope(actor,tenant,permissions));}
