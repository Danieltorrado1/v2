// One additional forensic transaction only. Never issues a mutation grant.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {freshReadConnectionFactory} from '../src/modules/cobertura/phase48-readonly-connection';
import {verifiedProductionConfig,clearReadTlsEnvironment} from '../src/modules/cobertura/phase48-readonly-tls';
import {readDatabaseUrl} from '../src/modules/cobertura/phase48-readonly-target';
import {assertCriticalSchema} from '../src/modules/cobertura/phase48-readonly-schema-identity';
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const actor=(id:any)=>id==null?null:'actor-'+sha({purpose:'phase48-delta',id:String(id)}).slice(0,16);
const wanted=['1277','1278','1279'];
const historical=JSON.parse(readFileSync('tmp/phase48-historical-cert/restore-forensic-result.json','utf8').replace(/^\uFEFF/,'')).preflight.dry_run.identities;
if(historical.length!==730||new Set(historical.map((r:any)=>String(r.cobertura_id))).size!==730)throw Error('BASELINE_IDS_INVALID');
const report:any={kind:'PHASE48_SECOND_DELTA_READ_ONLY',started_at:new Date().toISOString(),status:'STOPPED',production_connections:0,production_writes:0,mutation_authorization:false,rows:[],baseline_count:730,baseline_evidence_digest:sha(historical)};
export function dataValidity(input:{referenceErrors:string[];contradictions:string[];unknown:string[];duplicates:string[];overlaps:string[];salaryReview:boolean;salaryBlocked:boolean}){
 if(input.duplicates.length)return 'DUPLICATE';if(input.overlaps.length)return 'OVERLAP';
 if(input.referenceErrors.length)return 'INVALID_REFERENCE';if(input.contradictions.length)return 'CONTRADICTORY';
 if(input.unknown.length||input.salaryReview&&!input.salaryBlocked)return 'NOT_DETERMINABLE';
 return input.salaryReview?'VALID_REQUIRES_SALARY_REVIEW':'VALID_COMPATIBLE';
}
export function originAttribution(direct:any[],indirect:any[],historyCount:number,operationalActivity:number){
 if(direct.some(r=>r.actor&&['INSERT','CREATE','VERSION_ASSIGNMENT','CREATE_ASSIGNMENT','cobertura.asignacion.create'].includes(r.action)))return 'DIRECT_AUDIT_CONFIRMED';
 if(indirect.some(r=>r.temporally_correlated&&r.actor))return 'INDIRECT_AUDIT_CORRELATED';
 if(operationalActivity>0)return 'OPERATIONAL_ORIGIN_PROBABLE';
 return direct.length||indirect.length||historyCount?'AUDIT_INCOMPLETE':'NOT_DETERMINABLE';
}
export async function inspect(db:any,output:any=report){
 const query=async(sql:string,values?:any[])=>{
  if(!/^SELECT\b/i.test(sql)||sql.includes(';'))throw Error('SELECT_ONLY_REQUIRED');
  output.last_query_digest=sha(sql);return (await db.query(sql,values)).rows;
 };
 const raw=async(table:string,where:string,params?:any[])=> (await query('SELECT to_jsonb(t) row FROM public.'+q(table)+' t WHERE '+where,params)).map(r=>r.row);
 const technical=await query('SELECT id::text id FROM public.cobertura_asignaciones WHERE contrato_id=24 ORDER BY id');
 output.candidate_ids=technical.map(r=>r.id);output.candidate_count=technical.length;output.candidate_ids_digest=sha(output.candidate_ids);
 const historicIds=new Set(historical.map((r:any)=>String(r.cobertura_id)));
 output.delta_ids=output.candidate_ids.filter((id:string)=>!historicIds.has(id));
 output.historical_missing=[...historicIds].filter(id=>!output.candidate_ids.includes(id));
 output.unexamined_additional_ids=output.delta_ids.filter((id:string)=>!wanted.includes(id));
 const cas=await raw('cobertura_asignaciones','id=ANY($1::bigint[])',[wanted]);
 const contract=(await raw('contratos','id=24'))[0];
 const columns=await query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN('nomina_novedad_turnos','nomina_revision_operativa','nomina_empleado_detalle','nomina_contextos_operativos_base') ORDER BY table_name,ordinal_position");
 const has=(table:string,col:string)=>columns.some(r=>r.table_name===table&&r.column_name===col);
 const fkCache=new Map<string,any[]>();
 const fk=async(table:string,row:any)=>{
  if(!fkCache.has(table))fkCache.set(table,await query(`SELECT k.conname name,k.confmatchtype match_type,n.nspname reference_schema,c.relname reference_table,
   ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.num ORDER BY u.ord) source_columns,
   ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=u.num ORDER BY u.ord) reference_columns
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.confrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.conrelid=$1::regclass AND k.contype='f' ORDER BY k.conname`,['public.'+table]));
  const checks=[];
  for(const f of fkCache.get(table)!){
   if(!Array.isArray(f.source_columns)||!Array.isArray(f.reference_columns))throw Error('FK_TEXT_ARRAY_REQUIRED');
   const values=f.source_columns.map((col:string)=>row[col]);const nulls=values.filter((v:any)=>v==null).length;
   if(nulls){checks.push({table,name:f.name,valid:f.match_type!=='f'||nulls===values.length,null_key:true});continue;}
   const found=await query('SELECT count(*)::int n FROM '+q(f.reference_schema)+'.'+q(f.reference_table)+' WHERE '+f.reference_columns.map((col:string,i:number)=>q(col)+'=$'+(i+1)).join(' AND '),values);
   checks.push({table,name:f.name,valid:found[0].n===1});
  }return checks;
 };
 for(const id of wanted){
  const ca=cas.find(r=>String(r.id)===id);if(!ca){output.rows.push({id,DATA_VALIDITY:'NOT_DETERMINABLE',ORIGIN_ATTRIBUTION:'NOT_DETERMINABLE',unknown:['ASSIGNMENT_MISSING']});continue;}
  const referenceErrors:string[]=[],contradictions:string[]=[],unknown:string[]=[];
  const v=(await raw('vinculaciones','id=$1',[ca.vinculacion_id]))[0];
  const ff=ca.focalizacion_final_id?(await raw('focalizacion_final','id=$1',[ca.focalizacion_final_id]))[0]:null;
  const i=ff?(await raw('instituciones','id=$1',[ff.institucion_id]))[0]:null;
  const s=ff?(await raw('sedes','id=$1',[ff.sede_id]))[0]:null;
  const m=ff?(await raw('modalidades','id=$1',[ff.modalidad_id]))[0]:null;
  const municipalityId=ca.municipio_id??ff?.municipio_id;
  const municipio=municipalityId?(await query('SELECT id::text id FROM municipios WHERE id=$1',[municipalityId]))[0]:null;
  const employees=await raw('nomina_empleados','vinculacion_id=$1',[ca.vinculacion_id]);
  const same=await raw('cobertura_asignaciones','contrato_id=24 AND vinculacion_id=$1',[ca.vinculacion_id]);
  const dates=(a:any,b:any)=>a==null||b==null||String(a)<=String(b);
  const contractEnd=contract?.fecha_final_real??contract?.fecha_final_estimada??contract?.fecha_finalizacion;
  if(!contract||String(contract.empresa_id)!=='15'||!v||String(v.empresa_id)!=='15'||String(v.contrato_id)!=='24'||String(ca.contrato_id)!=='24')referenceErrors.push('TENANT_OR_LINKAGE_INVALID');
  if(!ff||!i||!s||!m||!municipio)referenceErrors.push('IDENTITY_SOURCE_MISSING');
  if(ff&&String(ff.contrato_id)!=='24'||i&&String(i.contrato_id)!=='24'||s&&String(s.institucion_id)!==String(i?.id)||s&&String(s.municipio_id)!==String(municipalityId)||ff&&String(ff.municipio_id)!==String(municipalityId))contradictions.push('CONTEXT_ID_MISMATCH');
  if(!ca.fecha_inicio||!dates(ca.fecha_inicio,ca.fecha_fin)||!dates(contract?.fecha_inicio,ca.fecha_inicio)||!dates(ca.fecha_inicio,contractEnd)||!dates(ca.fecha_fin,contractEnd)||!dates(v?.fecha_inicio,ca.fecha_inicio)||!dates(ca.fecha_fin??ca.fecha_inicio,v?.fecha_fin))contradictions.push('INVALID_DATE_VALIDITY');
  if(typeof ca.activo!=='boolean')unknown.push('ACTIVE_STATE_UNKNOWN');
  const norm=(x:any)=>String(x??'').trim().toLowerCase();
  const textMatches={institution:norm(ca.institucion)===norm(ff?.institucion_final),site:norm(ca.sede)===norm(ff?.sede_final),modality:norm(ca.modalidad)===norm(ff?.modalidad_final)||norm(ca.modalidad)===norm(m?.codigo_original??m?.nombre_modalidad)};
  if(Object.values(textMatches).some(x=>!x))contradictions.push('TEXT_IDENTITY_MISMATCH');
  const fkChecks=[];
  for(const [table,row] of [['cobertura_asignaciones',ca],['vinculaciones',v],['focalizacion_final',ff],['instituciones',i],['sedes',s],['modalidades',m]] as any[]){if(row)fkChecks.push(...await fk(table,row));}
  for(const employee of employees)fkChecks.push(...await fk('nomina_empleados',employee));
  if(fkChecks.some(r=>!r.valid))referenceErrors.push('FK_INVALID');
  const other=same.filter(r=>String(r.id)!==id);
  const duplicates=other.filter(r=>r.fecha_inicio===ca.fecha_inicio&&r.fecha_fin===ca.fecha_fin&&String(r.focalizacion_final_id)===String(ca.focalizacion_final_id)&&r.activo===ca.activo).map(r=>String(r.id));
  const overlaps=other.filter(r=>ca.activo&&r.activo&&r.fecha_inicio<=(ca.fecha_fin??'9999-12-31')&&(r.fecha_fin??'9999-12-31')>=ca.fecha_inicio).map(r=>String(r.id));
  const intersected=await query('SELECT id::text id,estado,fecha_inicio::text,fecha_fin::text FROM nomina_periodos WHERE contrato_id=24 AND fecha_fin >= $1::date AND ($2::date IS NULL OR fecha_inicio <= $2::date) ORDER BY id',[ca.fecha_inicio,ca.fecha_fin]);
  const salaryEnd=ca.fecha_fin??contractEnd??ca.fecha_inicio;
  const categories=await query('SELECT id::text id,modalidad,vigente_desde::text,vigente_hasta::text FROM nomina_categorias_salariales WHERE contrato_id=24 AND activo AND LOWER(BTRIM(modalidad))=LOWER(BTRIM($1)) AND (vigente_desde IS NULL OR vigente_desde <= $3::date) AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date) ORDER BY id',[m?.codigo_original??m?.nombre_modalidad??'',ca.fecha_inicio,salaryEnd]);
  const matching=categories.filter(r=>dates(r.vigente_desde,ca.fecha_inicio)&&dates(salaryEnd,r.vigente_hasta));
  const salaryReview=matching.length!==1||categories.length!==1;
  const details=has('nomina_empleado_detalle','nomina_empleado_id')&&employees.length?await raw('nomina_empleado_detalle','nomina_empleado_id=ANY($1::bigint[])',[employees.map(r=>String(r.id))]):[];
  const context=has('nomina_contextos_operativos_base','nomina_empleado_id')&&employees.length?await raw('nomina_contextos_operativos_base','nomina_empleado_id=ANY($1::bigint[])',[employees.map(r=>String(r.id))]):[];
  const blockedRows=[ca,...employees,...details,...context].filter(r=>/REQUIERE_REVISION_SALARIAL/.test(JSON.stringify(r)));
  const salaryBlocked=blockedRows.length>0;
  if(salaryReview&&!salaryBlocked)unknown.push('SALARY_REVIEW_WITHOUT_EXPLICIT_BLOCK');
  const audits=await query("SELECT id::text id,usuario_id::text actor_id,accion action,created_at::text timestamp FROM auditoria WHERE tabla_afectada='cobertura_asignaciones' AND registro_id=$1 ORDER BY id",[id]);
  const events=await query("SELECT id::text id,usuario_id::text actor_id,accion action,created_at::text timestamp,empresa_id::text empresa_id,contrato_id::text contrato_id FROM auditoria_eventos WHERE entidad='cobertura_asignaciones' AND entidad_id=$1 ORDER BY id",[id]);
  const history=await query("SELECT id::text id,usuario_id::text actor_id,campo,created_at::text timestamp FROM historial_cambios WHERE tabla_afectada='cobertura_asignaciones' AND registro_id=$1 ORDER BY id",[id]);
  const indirect=await query("SELECT id::text id,usuario_id::text actor_id,accion action,created_at::text timestamp,tabla_afectada entity,registro_id::text entity_id FROM auditoria WHERE (tabla_afectada='vinculaciones' AND registro_id=$1) OR (tabla_afectada='nomina_empleados' AND registro_id=ANY($2::bigint[])) ORDER BY id",[ca.vinculacion_id,employees.map(r=>String(r.id))]);
  const indirectEvents=await query("SELECT id::text id,usuario_id::text actor_id,accion action,created_at::text timestamp,entidad entity,entidad_id entity_id FROM auditoria_eventos WHERE (entidad='vinculaciones' AND entidad_id=$1) OR (entidad='nomina_empleados' AND entidad_id=ANY($2::text[])) ORDER BY id",[String(ca.vinculacion_id),employees.map(r=>String(r.id))]);
  const linkageHistory=await query('SELECT id::text id,usuario_id::text actor_id,tipo_cambio,fecha_cambio::text timestamp FROM vinculacion_historial_cambios WHERE vinculacion_id=$1 ORDER BY id',[ca.vinculacion_id]);
  const safeAudit=(r:any)=>{const {actor_id,...rest}=r;return {...rest,actor:actor(actor_id)};};
  const direct=[...audits.map(r=>({...safeAudit(r),table:'auditoria'})),...events.map(r=>({...safeAudit(r),table:'auditoria_eventos'}))];
  const indirectSafe=[...indirect,...indirectEvents].map(r=>({...safeAudit(r),temporally_correlated:Math.abs(Date.parse(r.timestamp)-Date.parse(ca.created_at))<=300000}));
  const activity:any={};
  for(const table of ['nomina_asistencia_diaria','nomina_novedades','nomina_movimientos','nomina_novedad_turnos']){
   activity[table]=(await query('SELECT count(*)::int count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E\'\\n\' ORDER BY to_jsonb(t)::text),\'\'),\'UTF8\')),\'hex\') digest FROM public.'+q(table)+' t WHERE vinculacion_id=$1',[ca.vinculacion_id]))[0];
  }
  const backfill={institucion_id:ff?.institucion_id==null?null:String(ff.institucion_id),sede_id:ff?.sede_id==null?null:String(ff.sede_id),modalidad_id:ff?.modalidad_id==null?null:String(ff.modalidad_id)};
  if(Object.values(backfill).some(x=>x===null))referenceErrors.push('PHASE48_BACKFILL_IDENTITY_UNKNOWN');
  const validity=dataValidity({referenceErrors,contradictions,unknown,duplicates,overlaps,salaryReview,salaryBlocked});
  output.rows.push({id,DATA_VALIDITY:validity,ORIGIN_ATTRIBUTION:originAttribution(direct,indirectSafe,history.length,Object.values(activity).reduce((sum:number,r:any)=>sum+r.count,0)),scope:{empresa_id:String(contract?.empresa_id),contrato_id:String(ca.contrato_id)},vinculacion:{id:String(ca.vinculacion_id),fecha_inicio:v?.fecha_inicio,fecha_fin:v?.fecha_fin,estado:v?.estado_vinculacion},employees:employees.map(r=>({id:String(r.id),periodo_id:String(r.periodo_id),categoria_salarial_id:r.categoria_salarial_id==null?null:String(r.categoria_salarial_id),estado:r.estado,activo:r.activo})),references:{focalizacion_final_id:String(ca.focalizacion_final_id),municipio_id:municipalityId==null?null:String(municipalityId),...backfill},fecha_inicio:ca.fecha_inicio,fecha_fin:ca.fecha_fin,activo:ca.activo,created_at:ca.created_at,contract_validity:{fecha_inicio:contract?.fecha_inicio,fecha_fin:contractEnd},modality_code:m?.codigo_original??null,text_identity_matches:textMatches,salary:{compatible_category_ids:matching.map(r=>r.id),intersecting_category_ids:categories.map(r=>r.id),requires_review:salaryReview,explicit_block:salaryBlocked,block_evidence_count:blockedRows.length,inferred_category:false},fk_checks:fkChecks,duplicate_ids:duplicates,overlap_ids:overlaps,periods_intersected:intersected,activity,direct_audits:direct,indirect_audits:indirectSafe,direct_history:history.map(safeAudit),linkage_history:linkageHistory.map(safeAudit),phase48_expected_backfill:backfill,phase48_columns_to_fill:Object.keys(backfill),other_historical_correction:validity.startsWith('VALID_')?{required:false,reason:'IDENTITIES_ONLY_NO_HISTORY_WRITE_IDENTIFIED'}:{required:'NOT_DETERMINED',reason:'DATA_VALIDITY_BLOCKED'},errors:referenceErrors,contradictions,unknown,before_row_digest:sha(ca)});
 }
 output.periods_4_6=await query('SELECT id::text id,estado,encode(sha256(convert_to(to_jsonb(t)::text,\'UTF8\')),\'hex\') digest FROM nomina_periodos t WHERE id IN(4,6) ORDER BY id');
 output.status=output.historical_missing.length||output.unexamined_additional_ids.length||output.rows.some((r:any)=>!r.DATA_VALIDITY.startsWith('VALID_'))?'STOPPED_MATERIAL_DELTA':'RECONCILED_READ_ONLY_DELTA';
}
async function main(){
 if(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='fix/phase48-scoped-dynamic-contract')throw Error('BRANCH_REQUIRED');
 process.env.PHASE48_SSL_ROOT_CERT_PATH='C:/Users/CORE ULTRA/Documents/EmpiriaCertificates/supabase-prod-ca.crt';
 process.env.PHASE48_SSL_ROOT_CERT_SHA256='700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7';
 const verified=verifiedProductionConfig(()=>readDatabaseUrl(readFileSync('C:/Users/CORE ULTRA/Desktop/V2/.env','utf8')));
 const config={...verified.config};delete config.options;
 const conn=await freshReadConnectionFactory(config,'Production')();report.production_connections=1;
 let begun=false;
 try{
  await conn.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  for(const statement of ["SET LOCAL search_path=pg_catalog,public","SET LOCAL timezone='UTC'","SET LOCAL statement_timeout='120s'","SET LOCAL lock_timeout='5s'"])await conn.client.query(statement);
  report.session=(await conn.client.query("SELECT current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,pg_current_snapshot()::text snapshot,pg_backend_pid() pid,current_setting('server_version') version")).rows[0];
  if(report.session.read_only!=='on'||report.session.isolation!=='repeatable read')throw Error('READ_ONLY_REQUIRED');
  report.critical_schema=await assertCriticalSchema(conn.client);
  await inspect(conn.client);
 }finally{
  try{if(begun){await conn.client.query('ROLLBACK');report.rollback='CONFIRMED';conn.evidence.rollback_at=new Date().toISOString();}}
  finally{await conn.close();report.connection_closed=conn.isClosed();report.connection_evidence=conn.evidence;}
 }
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/phase48-delta-second.ts'))main().catch(e=>{report.status='STOPPED';report.reason=/^[A-Z0-9_:]+$/.test(e.message)?e.message:'FORENSIC_QUERY_OR_TRANSPORT_FAILED';report.sqlstate=e.code;process.exitCode=1;}).finally(()=>{
 clearReadTlsEnvironment();report.finished_at=new Date().toISOString();
 writeFileSync('reports/phase48-scoped-delta-readonly-attempt2.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,reason:report.reason,population:report.candidate_count,rows:report.rows.map((r:any)=>({id:r.id,DATA_VALIDITY:r.DATA_VALIDITY,ORIGIN_ATTRIBUTION:r.ORIGIN_ATTRIBUTION,errors:r.errors,contradictions:r.contradictions,unknown:r.unknown})),rollback:report.rollback,production_connections:report.production_connections,production_writes:0}));
});
