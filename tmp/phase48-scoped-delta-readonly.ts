// Temporary forensic probe, not a preflight or mutation entry point.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {freshReadConnectionFactory} from '../src/modules/cobertura/phase48-readonly-connection';
import {verifiedProductionConfig,clearReadTlsEnvironment} from '../src/modules/cobertura/phase48-readonly-tls';
import {readDatabaseUrl} from '../src/modules/cobertura/phase48-readonly-target';
import {assertCriticalSchema} from '../src/modules/cobertura/phase48-readonly-schema-identity';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const baseline=JSON.parse(readFileSync('tmp/phase48-historical-cert/restore-forensic-result.json','utf8').replace(/^\uFEFF/,''));
const historical=baseline.preflight.dry_run.identities;
if(historical.length!==730||new Set(historical.map((r:any)=>r.cobertura_id)).size!==730)throw Error('HISTORICAL_IDS_UNVERIFIED');
const report:any={kind:'PHASE48_DELTA_FORENSIC_READ_ONLY',started_at:new Date().toISOString(),status:'STOPPED',production_connections:0,production_writes:0,authorization_issued:false,baseline_count:730,baseline_evidence_digest:hash(historical),additions:[]};
const ids=new Set(historical.map((r:any)=>String(r.cobertura_id)));
async function main(){
 process.env.PHASE48_SSL_ROOT_CERT_PATH='C:/Users/CORE ULTRA/Documents/EmpiriaCertificates/supabase-prod-ca.crt';
 process.env.PHASE48_SSL_ROOT_CERT_SHA256='700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7';
 const verified=verifiedProductionConfig(()=>readDatabaseUrl(readFileSync('C:/Users/CORE ULTRA/Desktop/V2/.env','utf8')));
 const config={...verified.config};delete config.options;
 const conn=await freshReadConnectionFactory(config,'Production')();report.production_connections=1;
 let begun=false;
 const query=async(text:string,values?:any[])=>{
  if(!/^SELECT\b/i.test(text)||text.includes(';'))throw Error('FORENSIC_SELECT_REQUIRED');
  return (await conn.client.query(text,values)).rows;
 };
 const rows=async(table:string,where:string,values?:any[])=> (await query('SELECT to_jsonb(t) row FROM public.'+quote(table)+' t WHERE '+where,values)).map(r=>r.row);
 try{
  await conn.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  await conn.client.query("SET LOCAL search_path=pg_catalog,public");
  await conn.client.query("SET LOCAL timezone='UTC'");
  await conn.client.query("SET LOCAL statement_timeout='120s'");
  await conn.client.query("SET LOCAL lock_timeout='5s'");
  report.session=(await query("SELECT current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,pg_current_snapshot()::text snapshot,pg_backend_pid() pid,current_setting('server_version') version"))[0];
  if(report.session.read_only!=='on'||report.session.isolation!=='repeatable read')throw Error('READ_ONLY_REQUIRED');
  report.tls=conn.evidence.tls_protocol;
  report.critical_schema=await assertCriticalSchema(conn.client);
  const all=await rows('cobertura_asignaciones','TRUE');
  const scoped=all.filter(r=>String(r.contrato_id)==='24');
  const additions=scoped.filter(r=>!ids.has(String(r.id)));
  report.observed_population=scoped.length;report.all_coverage_count=all.length;
  report.candidate_ids=scoped.map(r=>String(r.id)).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  report.candidate_count=report.candidate_ids.length;report.candidate_ids_digest=hash(report.candidate_ids);
  report.historical_missing=[...ids].filter(id=>!scoped.some(r=>String(r.id)===id));
  report.known_ids_presence=Object.fromEntries(['1277','1278','1279'].map(id=>[id,scoped.some(r=>String(r.id)===id)]));
  const contracts=await rows('contratos','id=24');const contract=contracts[0];
  const ff=await rows('focalizacion_final','contrato_id=24');
  const categories=await rows('nomina_categorias_salariales','contrato_id=24');
  const periods=await rows('nomina_periodos','id IN(4,6)');
  report.periods_4_6=periods.map(r=>({id:String(r.id),estado:r.estado,row_digest:hash(r)}));
  const candidates=scoped.map(r=>{
   const f=ff.find(f=>String(f.id)===String(r.focalizacion_final_id));
   return {id:String(r.id),institucion_id:f?.institucion_id??null,sede_id:f?.sede_id??null,modalidad_id:f?.modalidad_id??null};
  });
  report.phase48_candidates_digest=hash(candidates.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1));
  report.write_set_before_digest=hash(scoped.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1));
  report.digest_format='FORENSIC_ONLY_NOT_A_MUTATION_SEAL';
  report.scoped_source_digest=null;report.critical_definition_digest=null;report.critical_sequences_digest=null;
  const foreignKeys=await query(`SELECT c.conname name,ns.nspname reference_schema,rc.relname reference_table,
   ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) source_columns,
   ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) reference_columns
   FROM pg_constraint c JOIN pg_class rc ON rc.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=rc.relnamespace WHERE c.conrelid='public.cobertura_asignaciones'::regclass AND c.contype='f' ORDER BY c.conname`);
  for(const ca of additions){
   const errors:string[]=[],unknown:string[]=[];
   const linkage=(await rows('vinculaciones','id=$1',[ca.vinculacion_id]))[0];
   const f=ff.find(r=>String(r.id)===String(ca.focalizacion_final_id));
   const institution=f?(await rows('instituciones','id=$1',[f.institucion_id]))[0]:null;
   const site=f?(await rows('sedes','id=$1',[f.sede_id]))[0]:null;
   const modality=f?(await rows('modalidades','id=$1',[f.modalidad_id]))[0]:null;
   const municipalityId=ca.municipio_id??f?.municipio_id;
   const municipality=municipalityId?(await query('SELECT id::text FROM municipios WHERE id=$1',[municipalityId]))[0]:null;
   const employees=await rows('nomina_empleados','vinculacion_id=$1',[ca.vinculacion_id]);
   if(!contract||String(contract.empresa_id)!=='15'||!linkage||String(linkage.empresa_id)!=='15'||String(linkage.contrato_id)!=='24')errors.push('TENANT_OR_LINKAGE_INVALID');
   if(!f||!institution||!site||!modality||!municipality||String(f.contrato_id)!=='24'||String(site.institucion_id)!==String(institution.id)||String(site.municipio_id)!==String(municipalityId)||String(institution.contrato_id)!=='24')errors.push('IDENTITY_OR_CONTEXT_INVALID');
   if([f?.institucion_id,f?.sede_id,f?.modalidad_id].some(v=>v===null||v===undefined))errors.push('PHASE48_IDENTITY_UNRESOLVED');
   const end=ca.fecha_fin??'9999-12-31';
   const contractualEnd=contract?.fecha_final_real??contract?.fecha_final_estimada??contract?.fecha_finalizacion;
   if(!ca.fecha_inicio||end<ca.fecha_inicio||contract?.fecha_inicio>ca.fecha_inicio||(contractualEnd&&ca.fecha_inicio>contractualEnd)||(ca.fecha_fin&&contractualEnd&&ca.fecha_fin>contractualEnd)||linkage?.fecha_inicio>ca.fecha_inicio||(linkage?.fecha_fin&&end>linkage.fecha_fin))errors.push('INVALID_DATE_VALIDITY');
   if(typeof ca.activo!=='boolean')errors.push('INVALID_ACTIVE_FLAG');
   const fkChecks=[];
   for(const fk of foreignKeys){
    const vals=fk.source_columns.map((k:string)=>ca[k]);
    if(vals.some((v:any)=>v===null||v===undefined)){fkChecks.push({name:fk.name,valid:true,null_key:true});continue;}
    const count=await query('SELECT count(*)::int n FROM '+quote(fk.reference_schema)+'.'+quote(fk.reference_table)+' WHERE '+fk.reference_columns.map((k:string,i:number)=>quote(k)+'=$'+(i+1)).join(' AND '),vals);
    const valid=count[0].n===1;fkChecks.push({name:fk.name,valid});if(!valid)errors.push('FK_INVALID:'+fk.name);
   }
   const same=scoped.filter(r=>String(r.id)!==String(ca.id)&&String(r.vinculacion_id)===String(ca.vinculacion_id));
   const duplicates=same.filter(r=>r.fecha_inicio===ca.fecha_inicio&&r.fecha_fin===ca.fecha_fin&&String(r.focalizacion_final_id)===String(ca.focalizacion_final_id)&&r.activo===ca.activo);
   const overlaps=same.filter(r=>ca.activo&&r.activo&&r.fecha_inicio<=end&&(r.fecha_fin??'9999-12-31')>=ca.fecha_inicio);
   const code=String(modality?.codigo_original??modality?.nombre_modalidad??'').trim().toLowerCase();
   const salaryEnd=ca.fecha_fin??contractualEnd??ca.fecha_inicio;
   const matching=categories.filter(r=>r.activo&&String(r.modalidad).trim().toLowerCase()===code&&(!r.vigente_desde||r.vigente_desde<=ca.fecha_inicio)&&(!r.vigente_hasta||r.vigente_hasta>=salaryEnd));
   const intersecting=categories.filter(r=>r.activo&&String(r.modalidad).trim().toLowerCase()===code&&(!r.vigente_desde||r.vigente_desde<=salaryEnd)&&(!r.vigente_hasta||r.vigente_hasta>=ca.fecha_inicio));
   const salaryReview=matching.length!==1||intersecting.length!==1;
   const audits=await query(`SELECT id::text audit_id,usuario_id::text actor_id,accion FROM auditoria WHERE tabla_afectada='cobertura_asignaciones' AND registro_id=$1 ORDER BY id`,[ca.id]);
   const events=await query(`SELECT id::text audit_id,usuario_id::text actor_id,accion,empresa_id::text empresa_id,contrato_id::text contrato_id FROM auditoria_eventos WHERE entidad='cobertura_asignaciones' AND entidad_id=$1 ORDER BY id`,[String(ca.id)]);
   const actors=[...new Set([...audits,...events].map(r=>r.actor_id).filter(Boolean))];
   const actorChecks=[];
   for(const actor of actors){
    const check=(await query(`SELECT u.id::text id,u.activo,EXISTS(SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=15 AND ue.activo) empresa_scope,EXISTS(SELECT 1 FROM usuario_contratos uc WHERE uc.usuario_id=u.id AND uc.contrato_id=24 AND uc.activo) contrato_scope FROM usuarios u WHERE u.id=$1`,[actor]))[0];
    actorChecks.push(check??{id:actor,missing:true});
   }
   if(![...audits,...events].some(r=>['INSERT','CREATE','VERSION_ASSIGNMENT'].includes(String(r.accion).toUpperCase())))unknown.push('NO_ATTRIBUTABLE_CREATION_AUDIT');
   if(!actors.length)unknown.push('CREATION_ACTOR_UNRESOLVED');
   if(actorChecks.some(r=>r.missing))errors.push('AUDIT_ACTOR_MISSING');
   if(events.some(r=>r.empresa_id!=='15'||r.contrato_id!=='24'))errors.push('AUDIT_SCOPE_MISMATCH');
   const activity:any={};
   for(const table of ['nomina_asistencia_diaria','nomina_novedades','vinculacion_condiciones_economicas'])activity[table]=(await query('SELECT count(*)::int n FROM public.'+quote(table)+' WHERE vinculacion_id=$1',[ca.vinculacion_id]))[0].n;
   let classification=errors.length?'ERROR_DE_DATOS':unknown.length?'NO_DETERMINABLE':salaryReview?'ALTA_LEGÍTIMA_REQUIERE_REVISION_SALARIAL':'ALTA_OPERATIVA_LEGÍTIMA_COMPATIBLE';
   if(overlaps.length)classification='SOLAPAMIENTO';if(duplicates.length)classification='DUPLICADO';
   report.additions.push({id:String(ca.id),classification,material:errors.length>0||unknown.length>0||overlaps.length>0||duplicates.length>0,empresa_id:String(contract?.empresa_id),contrato_id:String(ca.contrato_id),vinculacion_id:String(ca.vinculacion_id),employee_ids:employees.map(r=>String(r.id)),identity:{institucion_id:String(f?.institucion_id??''),sede_id:String(f?.sede_id??''),municipio_id:String(municipalityId??''),modalidad_id:String(f?.modalidad_id??'')},fecha_inicio:ca.fecha_inicio,fecha_fin:ca.fecha_fin,activo:ca.activo,salary_category_ids:matching.map(r=>String(r.id)),salary_category_intersections:intersecting.length,employee_category_ids:[...new Set(employees.map(r=>r.categoria_salarial_id).filter(Boolean).map(String))],fk_checks:fkChecks,duplicate_ids:duplicates.map(r=>String(r.id)),overlap_ids:overlaps.map(r=>String(r.id)),audit:audits,events,actors:actorChecks,activity_counts:activity,errors,unknown,row_digest:hash(ca)});
  }
  report.status=report.historical_missing.length||report.additions.some((r:any)=>r.material)?'STOPPED_MATERIAL_DELTA':'RECONCILED_READ_ONLY_DELTA';
 }finally{
  if(begun){await conn.client.query('ROLLBACK');report.rollback='CONFIRMED';}
  await conn.close();report.connection_closed=conn.isClosed();report.connection_evidence=conn.evidence;
 }
}
main().catch(e=>{report.status='STOPPED';report.reason=/^[A-Z0-9_:]+$/.test(e.message)?e.message:'FORENSIC_QUERY_OR_TRANSPORT_FAILED';report.sqlstate=e.code;process.exitCode=1;}).finally(()=>{
 clearReadTlsEnvironment();report.finished_at=new Date().toISOString();
 writeFileSync('reports/phase48-scoped-delta-readonly.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,reason:report.reason,population:report.observed_population,additions:report.additions.map((r:any)=>({id:r.id,classification:r.classification,errors:r.errors,unknown:r.unknown})),production_connections:report.production_connections,production_writes:0}));
});
