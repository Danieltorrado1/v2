import { manipulationContext } from './documentos.manipulacion.service';
import { combinedManipulationPolicy, isCombined } from './documentos.manipulacion.domain';
import type { PoolClient } from 'pg';
import { dbPool, dbQuery } from '../../config/db';
import { assertTenantAccessForPersonaId, assertTenantAccessForVinculacionId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';

import { documentPolicy, documentState, experienceDays, normalizeDocumentMetadata, type DocumentPolicy } from './documentos.review.domain';

async function registerAuditEntry(input: {client:PoolClient;usuario_id:string;accion:string;tabla:string;registro_id:string;descripcion:string;before?:unknown;after?:unknown}) {
  await input.client.query(`INSERT INTO auditoria_eventos(usuario_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1::bigint,'DOCUMENTOS',$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,[input.usuario_id,input.tabla,input.registro_id,input.accion,input.descripcion,JSON.stringify(input.before??null),JSON.stringify(input.after??null)]);
}
export type ReviewScope = 'persona' | 'vinculacion';
const tableFor = (scope: ReviewScope) => scope === 'persona' ? 'documentos_persona' : 'documentos_vinculacion';
const authorize = (scope: ReviewScope, owner: string, tenant?: TenantAccessContext) => scope === 'persona' ? assertTenantAccessForPersonaId(tenant,owner) : assertTenantAccessForVinculacionId(tenant,owner);
export async function loadDocumentPolicies(ids: number[], client?: PoolClient) {
  const query = client ? client.query.bind(client) : dbQuery;
  const result = await query(`SELECT t.*, c.codigo AS canonical_code, a.componente_codigo FROM tipos_documentos t
    LEFT JOIN documentos_requisitos_aliases a ON a.tipo_documento_id=t.id
    LEFT JOIN documentos_requisitos_canonicos c ON c.id=a.requisito_canonico_id
    WHERE t.id=ANY($1::bigint[]) ORDER BY c.activo DESC NULLS LAST,c.id`,[ids]);
  const found = new Map<number, { id:number; nombre:string; code:string; component:string|null; policy:DocumentPolicy }>();
  for(const row of result.rows) if(!found.has(Number(row.id))) found.set(Number(row.id),{id:Number(row.id),nombre:row.nombre_documento,code:row.canonical_code ?? row.codigo,component:row.componente_codigo ?? null,policy:documentPolicy(row.canonical_code ?? row.codigo,row)});
  return [...found.values()];
}
export async function prepareDocumentUpload(typeId: string, input: Parameters<typeof normalizeDocumentMetadata>[1], client: PoolClient) {
  const rule = (await loadDocumentPolicies([Number(typeId)],client))[0];
  if(!rule) throw new AppError('Tipo documental no encontrado',400,'DOCUMENT_TYPE_NOT_FOUND');
  if(rule.code==='MANIPULACION' && input.manipulacion_modalidad==='COMBINADO') {
    const aliases=await client.query(`SELECT a.tipo_documento_id FROM documentos_requisitos_aliases a JOIN documentos_requisitos_canonicos c ON c.id=a.requisito_canonico_id WHERE c.codigo='MANIPULACION'`,[]);
    const policies=await loadDocumentPolicies(aliases.rows.map(r=>Number(r.tipo_documento_id)),client);
    if(!['CURSO','EXAMENES'].every(component=>policies.some(p=>p.component===component))) throw new AppError('Configura Curso y Exámenes antes de cargar soporte combinado.',409,'MANIPULATION_CATALOG_INCOMPLETE');
    rule.policy=combinedManipulationPolicy(policies.map(p=>p.policy));
  }
  try {
    const normalized=normalizeDocumentMetadata(rule.policy,input);
    return {...normalized,metadata:{...normalized.metadata,...(rule.code==='MANIPULACION'&&input.manipulacion_modalidad==='COMBINADO'?{manipulacion_policy:rule.policy}:{})},rule};
  }
  catch(error) { throw new AppError((error as Error).message,400,'DOCUMENT_METADATA_INVALID'); }
}
export async function persistUploadReview(client: PoolClient, scope: ReviewScope, id: string, actor: string, metadata: object) {
  await client.query(`UPDATE ${tableFor(scope)} SET estado_revision='PENDIENTE_REVISION', cargado_por=$2::bigint, revisado_por=NULL, revisado_en=NULL, motivo_rechazo=NULL, metadatos_revision=$3::jsonb WHERE id=$1::bigint`,[id,actor,JSON.stringify(metadata)]);
  await registerAuditEntry({client,usuario_id:actor,accion:'DOCUMENT_UPLOAD',tabla:tableFor(scope),registro_id:id,descripcion:'Archivo cargado pendiente de revisión',after:{estado_revision:'PENDIENTE_REVISION',cargado_por:actor,metadata}});
}
export async function reviewDocument(scope: ReviewScope, id: string, decision: 'APROBADO'|'RECHAZADO', reason: string | undefined, actor: string, tenant?: TenantAccessContext) {
  if(decision==='RECHAZADO'&&!reason?.trim()) throw new AppError('El motivo de rechazo es obligatorio',400,'DOCUMENT_REJECTION_REASON_REQUIRED');
  const client=await dbPool.connect();
  try {
    await client.query('BEGIN');
    const table=tableFor(scope);
    const result=await client.query(`SELECT * FROM ${table} WHERE id=$1::bigint FOR UPDATE`,[id]); const before=result.rows[0];
    if(!before)throw new AppError('Documento no encontrado',404,'DOCUMENT_NOT_FOUND');
    await authorize(scope,String(before[scope+'_id']),tenant);
    if(!before.activo||!before.es_vigente)throw new AppError('Solo se puede revisar la versión actual',409,'DOCUMENT_HISTORICAL');
    if(decision==='APROBADO'&&!before.storage_path&&!before.archivo_path)throw new AppError('No existe un archivo para revisar',409,'DOCUMENT_FILE_MISSING');
    const normalized=decision==='APROBADO' ? await prepareDocumentUpload(String(before.tipo_documento_id),{...before,...before.metadatos_revision,fecha_expedicion:dateOnly(before.fecha_expedicion),fecha_vencimiento:dateOnly(before.fecha_vencimiento)},client) : null;
    const updated=await client.query(`UPDATE ${table} SET estado_revision=$2,revisado_por=$3::bigint,revisado_en=NOW(),motivo_rechazo=$4, fecha_expedicion=$5::date, fecha_vencimiento=$6::date, metadatos_revision=COALESCE(metadatos_revision,'{}'::jsonb) || $7::jsonb WHERE id=$1::bigint RETURNING *`,[id,decision,actor,decision==='RECHAZADO'?reason!.trim():null,normalized?normalized.fecha_expedicion:dateOnly(before.fecha_expedicion),normalized?normalized.fecha_vencimiento:dateOnly(before.fecha_vencimiento),JSON.stringify(normalized?.metadata??{})]);
    await registerAuditEntry({client,usuario_id:actor,accion:'DOCUMENT_REVIEW',tabla:table,registro_id:id,descripcion:decision==='APROBADO'?'Documento aprobado':reason!.trim(),before,after:updated.rows[0]});
    await client.query('COMMIT');return {id,estado_revision:decision};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
const dateOnly=(v: Date|string|null) => v instanceof Date?v.toISOString().slice(0,10):v?.slice(0,10)??null;
export async function documentReviewDossier(scope: ReviewScope, owner: string, ids: number[], tenant?: TenantAccessContext) {
  await authorize(scope,owner,tenant);
  const table=tableFor(scope);
  const [types,docs]=await Promise.all([loadDocumentPolicies(ids),dbQuery(`SELECT d.*,u.nombre_completo AS cargado_nombre,r.nombre_completo AS revisado_nombre FROM ${table} d LEFT JOIN usuarios u ON u.id=d.cargado_por LEFT JOIN usuarios r ON r.id=d.revisado_por WHERE d.${scope}_id=$1::bigint AND d.tipo_documento_id=ANY($2::bigint[]) ORDER BY d.fecha_carga DESC,d.id DESC`,[owner,ids])]);
  const history=docs.rows.length?await dbQuery(`SELECT entidad_id,accion,descripcion,fecha_evento,usuario_id,datos_nuevos FROM auditoria_eventos WHERE entidad=$1 AND entidad_id=ANY($2::text[]) AND accion IN ('DOCUMENT_UPLOAD','DOCUMENT_REPLACE','DOCUMENT_REVIEW') ORDER BY fecha_evento DESC,id DESC`,[table,docs.rows.map(d=>String(d.id))]):{rows:[]};
  const documents=docs.rows.map(d=>{const type=types.find(t=>t.id===Number(d.tipo_documento_id))!;return {id:String(d.id),tipo_documento_id:Number(d.tipo_documento_id),nombre:d.nombre_original,version:d.version,documento_reemplaza_id:d.documento_reemplaza_id,actual:d.activo&&d.es_vigente,estado_revision:d.estado_revision,estado:documentState({...d,fecha_expedicion:dateOnly(d.fecha_expedicion),fecha_vencimiento:dateOnly(d.fecha_vencimiento)},(isCombined(d.metadatos_revision)?d.metadatos_revision?.manipulacion_policy:null)??type.policy),fecha_expedicion:dateOnly(d.fecha_expedicion),fecha_vencimiento:dateOnly(d.fecha_vencimiento),metadata:d.metadatos_revision,cargado_por:d.cargado_nombre??d.cargado_por,fecha_carga:d.fecha_carga,revisado_por:d.revisado_nombre??d.revisado_por,revisado_en:d.revisado_en,motivo_rechazo:d.motivo_rechazo};});
  const manipulation = types.some(t=>t.code==='MANIPULACION') ? await manipulationContext(scope,owner) : null;
  return {manipulacion_modalidad:manipulation?.mode ?? null,types,documents,history:history.rows,experiencia_dias:experienceDays(documents.filter(d=>d.actual&&types.find(t=>t.id===d.tipo_documento_id)?.code==='CERT_LABORAL').map(d=>d.metadata))};
}
