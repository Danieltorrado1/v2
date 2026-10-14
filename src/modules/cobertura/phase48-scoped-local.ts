import {certifiedPseudorecordContext} from './phase48-pseudorecord-parser';
import {certifiedManagedEvents} from './phase48-managed-events';
import {operationalRowDigest,validateCloseRetirement} from './phase48-operational-close';
// Local certification implementation. There is no productive connection path.
import {Client} from 'pg';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {localClient,type LocalTarget} from './phase48-dynamic-local';
import {actorGate,historicalPlan,nextId,restartSequence} from './phase48-historical-domain';
import {publishAtomicReceipt} from './phase48-readonly-receipts';
import {SALARY_DECISION,requireScoped,scopedDigest,sortScopedIds,type ScopedAuthority,type ScopedSeal} from './phase48-scoped-contract';
import {scopedCapture,collectScopedSchema,scopedFunctions,scopedInformational,scopedManifest,projectScopedInventory,tableHashes,sequenceStates,sq,type ScopedCapture,type ScopedManifest,type ScopedDb} from './phase48-scoped-repository';
export const SCOPED_MARKER='PHASE48_SCOPED_15_24_CLOSE1203_V3';
const identities=['institucion_id','sede_id','modalidad_id'];
async function identity(db:ScopedDb,target:LocalTarget){
 const expected=resolve(process.cwd(),'tmp/phase48-pooler-local/dynamic-cluster');
 requireScoped(resolve(target.clusterDirectory)===expected,'LOCAL_TARGET_REQUIRED');
 const r=(await db.query("SELECT host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory,current_setting('server_version') version,current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,pg_backend_pid() pid,pg_current_snapshot()::text snapshot")).rows[0];
 requireScoped(r.host==='127.0.0.1'&&r.port===55470&&resolve(r.directory)===expected&&r.version==='17.11','LOCAL_TARGET_REQUIRED');return r;
}
async function ddlIdle(db:ScopedDb){requireScoped((await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|GRANT|REVOKE)\\s'")).rows[0].n===0,'DDL_ACTIVE');}
export async function preflightScopedLocal(authority:ScopedAuthority,target:LocalTarget,release:{readonly_runner_commit:string;mutator_commit:string},run_id='phase48-'+randomUUID()){
 let first:ScopedCapture|undefined;const connections=[];
 for(let i=0;i<2;i++){
  const db=localClient();await db.connect();let session:any;
  try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL search_path=pg_catalog,public,pg_temp");await db.query("SET LOCAL timezone='UTC'");
   session=await identity(db,target);requireScoped(session.read_only==='on'&&session.isolation==='repeatable read','INDEPENDENT_READ_ONLY_REQUIRED');
   const capture=await scopedCapture(db);
   if(first)requireScoped(scopedDigest(first.set)===scopedDigest(capture.set),'SCOPED_DRIFT');else first=capture;
  }finally{try{await db.query('ROLLBACK');}finally{await db.end();}}
  requireScoped((db as any).connection.stream.destroyed===true,'READ_CONNECTION_CLOSE_UNCONFIRMED');
  connections.push({...session,closed:true,connection_instance:i+1,rollback:'CONFIRMED'});
 }
 const capture=first!;const seal=authority.issue(capture.set,run_id,release.readonly_runner_commit,release.mutator_commit);
 return {seal,manifest:capture.manifest,preview:capture.salary_preview,operational_preview:capture.operational,historical_preview:capture.plan.map(({target,...p})=>p),connections,economic_authorization:false,requires_salary_review:capture.salary_preview.filter(r=>r.requires_salary_review).map(r=>r.id),informational:{global_digest:capture.informational_global_digest,excluded_digest:capture.informational_excluded_digest}};
}
export function publishScopedPreflight(directory:string,input:Awaited<ReturnType<typeof preflightScopedLocal>>){
 requireScoped(input.economic_authorization===false&&input.seal.economic_authorization===false,'ECONOMIC_AUTHORIZATION_FORBIDDEN');
 return publishAtomicReceipt(directory,input.seal.run_id+'.baseline.json',{run_id:input.seal.run_id,seal:input.seal,manifest:{...input.manifest,exclusions:[]},preview:input.preview,operational_preview:input.operational_preview,economic_authorization:false});
}
async function lockScope(db:ScopedDb,capture:{manifest:ScopedManifest;sequences:any[]}){
 await db.query('LOCK TABLE '+capture.manifest.tables.map(t=>'public.'+sq(t)).join(',')+' IN SHARE ROW EXCLUSIVE MODE NOWAIT');
 for(const sequence of capture.sequences){
  const cache=sequence.metadata.cache;requireScoped(/^[1-9]\d*$/.test(cache),'SEQUENCE_CACHE_INVALID');
  // ALTER CACHE to its already sealed value obtains a sequence lock, without
  // consuming IDs or resetting last_value/is_called. Revalidate AFTER all locks.
  await db.query('ALTER SEQUENCE public.'+sq(sequence.name)+' CACHE '+cache);
 }
}
async function freshDefinitions(observer:ScopedDb,manifest:ScopedManifest,expected:Record<string,any[]>){
 // Table locks already exclude ordinary trigger/constraint/index DDL. Reading
 // their formatted definitions from another session after our ALTER can wait
 // on our own exclusive lock. Read pg_proc directly for the unprotected part.
 const rows=(await scopedFunctions(observer)).filter(r=>manifest.functions.includes(r.name));
 requireScoped(scopedDigest(rows)===scopedDigest(expected.functions),'CRITICAL_DEFINITION_DRIFT');
 const pseudo=await certifiedPseudorecordContext(observer,manifest.tables);requireScoped(scopedDigest(pseudo)===scopedDigest(expected.trigger_pseudorecords),'CRITICAL_PSEUDORECORD_DRIFT');
 const events=await certifiedManagedEvents(observer);requireScoped(scopedDigest(events.critical)===scopedDigest(expected.managed_events),'CRITICAL_MANAGED_EVENT_DRIFT');
}
function normalizedInventory(inventory:Record<string,any[]>,before:Record<string,any[]>){
 const originalColumns=before.columns!.filter(r=>r.relation==='cobertura_asignaciones').map(r=>r.name);
 const hadIdentities=identities.every(k=>originalColumns.includes(k));
 return Object.fromEntries(Object.entries(inventory).map(([kind,rows])=>[kind,rows.filter(r=>{
  if(hadIdentities)return true;
  if(kind==='columns'&&r.relation==='cobertura_asignaciones'&&identities.includes(r.name))return false;
  if(kind==='constraints'&&r.relation==='cobertura_asignaciones'&&['cobertura_asignaciones_institucion_id_fkey','cobertura_asignaciones_sede_id_fkey','cobertura_asignaciones_modalidad_id_fkey'].includes(r.name))return false;
  if(kind==='indexes'&&r.relation==='cobertura_asignaciones'&&r.name==='idx_cobertura_asignaciones_timeline')return false;
  return true;
 }).map(r=>kind==='columns'&&r.relation==='cobertura_asignaciones'&&r.name==='focalizacion_final_id'?{...r,not_null:before.columns!.find(c=>c.relation===r.relation&&c.name===r.name)!.not_null}:r)]));
}
async function audit(db:ScopedDb,authority:ScopedAuthority,seal:ScopedSeal,action:string,payload:any,before:any=null){
 const a=await nextId(db,'auditoria'),e=await nextId(db,'auditoria_eventos');
 const body={version:seal.version,run_id:seal.run_id,action,actor:12,empresa:15,contrato:24,readonly_runner_commit:seal.readonly_runner_commit,mutator_commit:seal.mutator_commit,timestamp:new Date().toISOString(),result:'SUCCESS',legacy_audit_id:a.id,event_audit_id:e.id,economic_authorization:false,salary_decision:SALARY_DECISION,seal_digest:scopedDigest(seal),...payload};
 const complete={...body,witness_mac:authority.signWitness(seal,{body,before})};
 requireScoped((await db.query(`INSERT INTO auditoria(id,usuario_id,tabla_afectada,registro_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,12,'cobertura_asignaciones',$5::bigint,'UPDATE',$2,$3::jsonb,$4::jsonb) RETURNING id`,[a.id,SCOPED_MARKER,JSON.stringify(before),JSON.stringify(complete),action==='CLOSE1203'?'1203':null])).rowCount===1,'STRICT_AUDIT_FAILED');
 await restartSequence(db,a.sequence,a.id);
 requireScoped((await db.query(`INSERT INTO auditoria_eventos(id,usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,12,15,24,'COBERTURA','cobertura_asignaciones',$2,'UPDATE',$3,$4::jsonb,$5::jsonb) RETURNING id`,[e.id,action==='CLOSE1203'?'1203':seal.run_id,SCOPED_MARKER,JSON.stringify(before),JSON.stringify(complete)])).rowCount===1,'STRICT_EVENT_AUDIT_FAILED');
 await restartSequence(db,e.sequence,e.id);return {legacy:a.id,event:e.id};
}
async function originalAudits(db:ScopedDb,table:string,run_id:string){
 return (await db.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM public.${sq(table)} t WHERE (descripcion=$1 AND datos_nuevos->>'run_id'=$2) IS NOT TRUE`,[SCOPED_MARKER,run_id])).rows[0];
}
async function published(db:ScopedDb,authority:ScopedAuthority,seal:ScopedSeal){
 const logs=(await db.query('SELECT id::text id,usuario_id::text actor,datos_anteriores before,datos_nuevos payload FROM auditoria WHERE descripcion=$1 AND datos_nuevos->>\'run_id\'=$2 ORDER BY id',[SCOPED_MARKER,seal.run_id])).rows;
 if(!logs.length)return null;
 for(const r of logs){const {witness_mac,...body}=r.payload;authority.verifyWitness(seal,{body,before:r.before},witness_mac);}
 requireScoped(logs.length===4&&logs.every(r=>r.actor==='12'&&r.payload.seal_digest===scopedDigest(seal)&&r.payload.economic_authorization===false&&scopedDigest(r.payload.salary_decision)===scopedDigest(SALARY_DECISION)),'PUBLISHED_AUDIT_DIVERGENCE');
 requireScoped(logs.every(r=>r.id===r.payload.legacy_audit_id&&r.payload.actor===12&&r.payload.empresa===15&&r.payload.contrato===24),'PUBLISHED_AUDIT_IDENTITY_DIVERGENCE');
 const events=(await db.query('SELECT id::text id,usuario_id::text actor,empresa_id::text empresa,contrato_id::text contrato,datos_anteriores before,datos_nuevos payload FROM auditoria_eventos WHERE descripcion=$1 AND datos_nuevos->>\'run_id\'=$2 ORDER BY id',[SCOPED_MARKER,seal.run_id])).rows;
 requireScoped(events.length===4&&events.every((r,i)=>r.actor==='12'&&r.empresa==='15'&&r.contrato==='24'&&scopedDigest(r.payload)===scopedDigest(logs[i]!.payload)&&scopedDigest(r.before)===scopedDigest(logs[i]!.before)),'PUBLISHED_EVENT_DIVERGENCE');
 requireScoped(events.every(r=>r.id===r.payload.event_audit_id),'PUBLISHED_EVENT_IDENTITY_DIVERGENCE');
 const main=logs.find(r=>r.payload.action==='PHASE48');requireScoped(main&&logs.some(r=>r.payload.action==='ALBENY')&&logs.some(r=>r.payload.action==='DARY')&&logs.some(r=>r.payload.action==='CLOSE1203'),'PUBLISHED_ACTIONS_DIVERGENCE');
 const current=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
 requireScoped(scopedDigest(current)===main.payload.coverage_after_digest,'PUBLISHED_WRITE_SET_DIVERGENCE');
 const data=await tableHashes(db,main.before.manifest.tables);
 for(const old of main.before.data)if(!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(old.table))requireScoped(scopedDigest(old)===scopedDigest(data.find(r=>r.table===old.table)),'PUBLISHED_PROTECTED_DATA_DIVERGENCE');
 const forensic=await collectScopedSchema(db,main.before.manifest);forensic.inventory.functions=await scopedFunctions(db);forensic.inventory.managed_events=(await certifiedManagedEvents(db)).critical;forensic.inventory.trigger_pseudorecords=await certifiedPseudorecordContext(db,main.before.manifest.tables);const inventory=projectScopedInventory(forensic.inventory,main.before.manifest);
 requireScoped(scopedDigest(normalizedInventory(inventory,main.before.inventory))===scopedDigest(main.before.inventory),'PUBLISHED_SCHEMA_DIVERGENCE');
 const states=await sequenceStates(db,main.before.manifest,forensic.inventory);
 for(const state of states){const prior=main.before.sequences.find((s:any)=>s.name===state.name);
  const expected=state.name==='cobertura_asignaciones_id_seq'?String(BigInt(main.payload.albeny_id)+1n):state.name==='auditoria_id_seq'?String(BigInt(logs[3]!.id)+1n):state.name==='auditoria_eventos_id_seq'?String(BigInt(events[3]!.id)+1n):prior.last_value;
  requireScoped(state.last_value===expected&&state.is_called===(['cobertura_asignaciones_id_seq','auditoria_id_seq','auditoria_eventos_id_seq'].includes(state.name)?false:prior.is_called),'PUBLISHED_SEQUENCE_DIVERGENCE');
 }
 for(const table of ['auditoria','auditoria_eventos']){const old=main.before.data.find((r:any)=>r.table===table),actual=await originalAudits(db,table,seal.run_id);requireScoped(actual.count===old.count&&actual.digest===old.digest,'PUBLISHED_EXISTING_AUDIT_DIVERGENCE');}
 return main;
}
export type ScopedHooks={beforeLock?:()=>Promise<void>;afterLock?:(db:Client)=>Promise<void>;beforeDml?:()=>Promise<void>;afterUpdate?:(db:Client)=>Promise<void>;beforeCommit?:()=>Promise<void>;checkpoint?:(stage:string,db:Client)=>Promise<void>};
export async function executeScopedLocal(authority:ScopedAuthority,input:Awaited<ReturnType<typeof preflightScopedLocal>>,target:LocalTarget,options:{mode?:'Rollback'|'Commit';definitions_window_confirmed:boolean;receipt_directory?:string;hooks?:ScopedHooks}){
 const seal=structuredClone(input.seal);authority.authenticate(seal);
 requireScoped(options.definitions_window_confirmed===true,'DEFINITION_WINDOW_REQUIRED');
 const db=localClient(),observer=localClient();let begun=false,committed=false;
 try{
  await db.connect();await observer.connect();
  await identity(db,target);await identity(observer,target);await observer.query("SET statement_timeout='15s'");await observer.query("SET lock_timeout='2s'");
  const prior=await published(observer,authority,seal);if(prior)return {status:'ALREADY_APPLIED',run_id:seal.run_id,economic_authorization:false,writes:0};
  authority.consume(seal);await ddlIdle(observer);
  const initial=await scopedCapture(observer);authority.revalidate(seal,initial.set);
  if(options.receipt_directory)publishScopedPreflight(options.receipt_directory,{...input,seal});
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
  await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='120s'");await db.query("SET LOCAL search_path=pg_catalog,public,pg_temp");await db.query("SET LOCAL timezone='UTC'");
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  requireScoped((await db.query('SELECT pg_try_advisory_xact_lock(15,2449) locked')).rows[0].locked,'ADVISORY_LOCK_BUSY');
  await options.hooks?.beforeLock?.();
  await lockScope(db,initial);await options.hooks?.afterLock?.(db);
  // Advisory SELECT pins a snapshot before table locks. This fresh independent
  // observer is mandatory, including if the locks had to wait on a sequence.
  authority.revalidate(seal,(await scopedCapture(observer)).set);
  const locked=await scopedCapture(db,initial.manifest);authority.revalidate(seal,locked.set);
  await options.hooks?.beforeDml?.();await freshDefinitions(observer,locked.manifest,locked.inventory);authority.assertLive(seal);
  requireScoped(!locked.inventory.columns!.some(r=>r.relation==='cobertura_asignaciones'&&identities.includes(r.name)),'PHASE48_PARTIAL_SCHEMA');
  await options.hooks?.checkpoint?.('BEFORE_PHASE48',db);
  await db.query(`ALTER TABLE cobertura_asignaciones ADD COLUMN institucion_id bigint REFERENCES instituciones(id),ADD COLUMN sede_id bigint REFERENCES sedes(id),ADD COLUMN modalidad_id bigint REFERENCES modalidades(id)`);
  await db.query('ALTER TABLE cobertura_asignaciones ALTER COLUMN focalizacion_final_id DROP NOT NULL');
  const changed=(await db.query(`UPDATE cobertura_asignaciones ca SET institucion_id=ff.institucion_id,sede_id=ff.sede_id,modalidad_id=ff.modalidad_id FROM focalizacion_final ff,contratos c WHERE ca.id=ANY($1::bigint[]) AND ca.contrato_id=24 AND c.id=ca.contrato_id AND c.empresa_id=15 AND ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id AND ca.institucion_id IS NULL AND ca.sede_id IS NULL AND ca.modalidad_id IS NULL RETURNING ca.id::text id,ca.institucion_id::text institucion_id,ca.sede_id::text sede_id,ca.modalidad_id::text modalidad_id`,[seal.set.candidate_ids])).rows;
  changed.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);requireScoped(scopedDigest(sortScopedIds(changed.map(r=>r.id)))===seal.set.candidate_ids_digest&&scopedDigest(changed)===seal.set.phase48_candidates_digest,'EXACT_WRITE_SET_FAILED');
  await db.query('CREATE INDEX idx_cobertura_asignaciones_timeline ON cobertura_asignaciones(contrato_id,vinculacion_id,fecha_inicio,fecha_fin)');
  await options.hooks?.checkpoint?.('AFTER_PHASE48',db);
  const plan=await historicalPlan(db);requireScoped(scopedDigest(plan)===scopedDigest(locked.plan),'HISTORICAL_PLAN_DRIFT');
  const a=plan[0]!,d=plan[1]!,id=await nextId(db,'cobertura_asignaciones');requireScoped(id.id===a.coverage_id,'HISTORICAL_ID_DRIFT');
  requireScoped((await db.query(`INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,municipio_id,focalizacion_final_id,institucion_id,sede_id,modalidad_id,institucion,sede,modalidad,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,observacion,activo) VALUES($1,24,1555,477,NULL,44,196,1,$2,$3,'CAA','PRINCIPAL',1,'2026-08-18','2026-09-08',$4,TRUE) RETURNING id`,[id.id,a.target.institucion,a.target.sede,a.observation])).rowCount===1,'ALBENY_INSERT_FAILED');await restartSequence(db,id.sequence,id.id);
  const insertedAlbeny=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca WHERE id=$1',[id.id])).rows[0].row;
  await options.hooks?.checkpoint?.('AFTER_ALBENY',db);
  requireScoped((await db.query('UPDATE cobertura_asignaciones SET activo=TRUE,observacion=$1 WHERE id=11 AND vinculacion_id=249 AND contrato_id=24 AND NOT activo RETURNING id',[d.observation])).rowCount===1,'DARY_UPDATE_FAILED');
  await options.hooks?.checkpoint?.('AFTER_DARY',db);
  requireScoped((await historicalPlan(db)).every(p=>p.applied),'HISTORICAL_POSTCHECK_FAILED');
  await options.hooks?.checkpoint?.('BEFORE_CLOSE1203',db);
  const close=locked.operational.close;
  await validateCloseRetirement(db);
  const beforeClose=(await db.query('SELECT to_jsonb(t) row FROM cobertura_asignaciones t WHERE id=1203')).rows[0]?.row;
  const {institucion_id:ci,sede_id:cs,modalidad_id:cm,...closeOriginal}=beforeClose??{};
  requireScoped(ci===110&&cs===592&&cm===1&&operationalRowDigest(closeOriginal)===close.before_digest,'CLOSE1203_BEFORE_DML_DRIFT');
  requireScoped((await db.query(`UPDATE cobertura_asignaciones ca SET fecha_fin='2026-08-31' WHERE ca.id=1203 AND ca.vinculacion_id=1461 AND ca.contrato_id=24 AND ca.fecha_fin='2026-11-30' AND EXISTS(SELECT 1 FROM vinculaciones v WHERE v.id=ca.vinculacion_id AND v.persona_id=1134 AND v.empresa_id=15 AND v.fecha_fin='2026-08-31' AND v.estado_vinculacion='RETIRADA') RETURNING ca.id`)).rowCount===1,'CLOSE1203_UPDATE_FAILED');
  const closedRow=(await db.query('SELECT to_jsonb(t) row FROM cobertura_asignaciones t WHERE id=1203')).rows[0].row;
  requireScoped(scopedDigest(closedRow)===scopedDigest({...beforeClose,fecha_fin:'2026-08-31'}),'CLOSE1203_UNAUTHORIZED_FIELD_CHANGED');
  requireScoped(!(await db.query(`SELECT 1 FROM cobertura_asignaciones a JOIN cobertura_asignaciones b ON a.id<b.id AND a.vinculacion_id=b.vinculacion_id AND a.contrato_id=b.contrato_id AND a.activo AND b.activo AND a.fecha_inicio<=COALESCE(b.fecha_fin,'infinity'::date) AND b.fecha_inicio<=COALESCE(a.fecha_fin,'infinity'::date) LIMIT 1`)).rowCount,'CANDIDATE_OVERLAP');
  requireScoped(!(await db.query('SELECT 1 FROM cobertura_asignaciones ca JOIN vinculaciones v ON v.id=ca.vinculacion_id WHERE ca.id=1203 AND (ca.fecha_fin>v.fecha_fin OR ca.fecha_inicio>v.fecha_fin)')).rowCount,'CLOSE1203_AFTER_RETIREMENT');
  await options.hooks?.checkpoint?.('AFTER_CLOSE1203',db);
  await options.hooks?.afterUpdate?.(db);
  const after=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
  requireScoped(after.length===locked.coverage.length+1,'UNAUTHORIZED_COVERAGE_INSERT');
  requireScoped(scopedDigest(after.find(r=>String(r.id)===id.id))===scopedDigest(insertedAlbeny),'ALBENY_POSTIMAGE_CHANGED');
  for(const old of locked.coverage){const current=after.find(r=>r.id===old.id);requireScoped(current,'UNAUTHORIZED_COVERAGE_DELETE');const {institucion_id,sede_id,modalidad_id,...original}=current;
   if(String(old.id)==='11'){requireScoped(original.activo===true&&original.observacion===d.observation,'DARY_POSTIMAGE_CHANGED');original.activo=old.activo;original.observacion=old.observacion;}
   if(String(old.id)==='1203'){requireScoped(original.fecha_fin==='2026-08-31','CLOSE1203_POSTIMAGE_CHANGED');original.fecha_fin=old.fecha_fin;}
   requireScoped(scopedDigest(original)===scopedDigest(old),'PROTECTED_COVERAGE_CHANGED');
  }
  // SQL full-row projection keeps PostgreSQL numeric and timestamp precision;
  // JSON parsed by JavaScript is not the sole protection of an original field.
  const daryBefore=locked.coverage.find(r=>String(r.id)==='11');
  const expression="(CASE WHEN t.id=11 THEN (to_jsonb(t)-'institucion_id'-'sede_id'-'modalidad_id')||jsonb_build_object('activo',$2::boolean,'observacion',$3::text) WHEN t.id=1203 THEN (to_jsonb(t)-'institucion_id'-'sede_id'-'modalidad_id')||jsonb_build_object('fecha_fin','2026-11-30'::text) ELSE to_jsonb(t)-'institucion_id'-'sede_id'-'modalidad_id' END)::text";
  const originalCoverage=(await db.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(${expression},E'\n' ORDER BY ${expression}),''),'UTF8')),'hex') digest FROM cobertura_asignaciones t WHERE id<>$1::bigint`,[id.id,daryBefore.activo,daryBefore.observacion])).rows[0];
  const sealedCoverage=locked.data.find(r=>r.table==='cobertura_asignaciones');requireScoped(originalCoverage.count===sealedCoverage.count&&originalCoverage.digest===sealedCoverage.digest,'EXACT_ORIGINAL_COVERAGE_CHANGED');
  const protectedAfter=await tableHashes(db,locked.manifest.tables);
  for(const old of locked.data)if(!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(old.table))requireScoped(scopedDigest(old)===scopedDigest(protectedAfter.find(r=>r.table===old.table)),'PROTECTED_DATA_CHANGED:'+old.table);
  const beforeJournal={coverage:locked.coverage,inventory:locked.inventory,manifest:locked.manifest,data:locked.data,sequences:locked.sequences};
  const payload={coverage_after_digest:scopedDigest(after),albeny_id:id.id,candidate_count:seal.set.candidate_count,candidate_ids_digest:seal.set.candidate_ids_digest,before_digests:seal.set,requires_salary_review:locked.salary_preview.filter(r=>r.requires_salary_review).map(r=>r.id),preview:locked.salary_preview,operational_preview:locked.operational};
  for(const action of ['PHASE48','ALBENY','DARY','CLOSE1203']){await options.hooks?.checkpoint?.('AUDIT_'+action,db);await audit(db,authority,seal,action,action==='CLOSE1203'?{...payload,assignment_id:'1203',linkage_id:'1461',old_date:'2026-11-30',new_date:'2026-08-31',reason:'RETIRO_CONFIRMADO',before_digest:close.before_digest,after_digest:close.after_digest}:payload,action==='PHASE48'?beforeJournal:null);}
  const forensic=await collectScopedSchema(db,locked.manifest);forensic.inventory.functions=await scopedFunctions(db);forensic.inventory.managed_events=(await certifiedManagedEvents(db)).critical;forensic.inventory.trigger_pseudorecords=await certifiedPseudorecordContext(db,locked.manifest.tables);const finalInventory=projectScopedInventory(forensic.inventory,locked.manifest);
  requireScoped(scopedDigest(normalizedInventory(finalInventory,locked.inventory))===scopedDigest(locked.inventory),'UNAUTHORIZED_CRITICAL_DDL');
  await options.hooks?.checkpoint?.('BEFORE_COMMIT',db);await options.hooks?.beforeCommit?.();await published(db,authority,seal);await freshDefinitions(observer,locked.manifest,locked.inventory);authority.assertLive(seal);
  if((options.mode??'Rollback')==='Rollback'){
   await db.query('ROLLBACK');begun=false;
   authority.revalidate(seal,(await scopedCapture(observer)).set);
   return {status:'LOCAL_ROLLED_BACK',run_id:seal.run_id,processed_ids:seal.set.candidate_ids,preview:locked.salary_preview,operational_preview:locked.operational,rollback_verified:true,economic_authorization:false,informational_before:input.informational,informational_after:await scopedInformational(observer,locked.manifest)};
  }
  await db.query('COMMIT');begun=false;committed=true;await published(observer,authority,seal);
  const receipt={run_id:seal.run_id,status:'LOCAL_COMMITTED',candidate_count:seal.set.candidate_count,digests:seal.set,manifest:locked.manifest,preview:locked.salary_preview,operational_preview:locked.operational,requires_salary_review:payload.requires_salary_review,economic_authorization:false,external_validation:'VERIFIED',informational_before:input.informational,informational_after:await scopedInformational(observer,locked.manifest),definitions_window_confirmed:true,definitions_residual_risk:'An administrator can replace a routine after the last check. The no-deploy/no-migration window is an operational precondition, not a table-lock guarantee.'};
  if(options.receipt_directory)publishAtomicReceipt(options.receipt_directory,seal.run_id+'.receipt.json',receipt);
  return receipt;
 }catch(error){if(committed)throw Object.assign(new Error('COMMITTED_REQUIRES_RECOVERY'),{cause:error,committed:true});throw error;}
 finally{try{if(begun)await db.query('ROLLBACK');}finally{await Promise.allSettled([db.end(),observer.end()]);}}
}
// Reverses only this run after exact postimages have been verified. It never
// rewinds sequences or deletes publication audits; reversal audits are appended.
export async function rollbackScopedPublishedLocal(authority:ScopedAuthority,seal:ScopedSeal,target:LocalTarget,options:{definitions_window_confirmed:boolean}){
 authority.authenticate(seal);requireScoped(options.definitions_window_confirmed===true,'DEFINITION_WINDOW_REQUIRED');const db=localClient(),observer=localClient();let begun=false,committed=false;
 try{
  await db.connect();await observer.connect();await identity(observer,target);await ddlIdle(observer);
  await identity(db,target);const journal=await published(db,authority,seal);requireScoped(journal,'PUBLISHED_RUN_REQUIRED');
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;await db.query("SET LOCAL lock_timeout='2s'");
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  await lockScope(db,journal.before);await published(db,authority,seal);
  await freshDefinitions(observer,journal.before.manifest,journal.before.inventory);
  requireScoped((await db.query('DELETE FROM cobertura_asignaciones WHERE id=$1 AND vinculacion_id=1555 AND focalizacion_final_id IS NULL',[journal.payload.albeny_id])).rowCount===1,'REVERSAL_NEW_ROW_DIVERGENCE');
  const originalDary=journal.before.coverage.find((r:any)=>String(r.id)==='11');
  await db.query('UPDATE cobertura_asignaciones SET activo=$1,observacion=$2 WHERE id=11',[originalDary.activo,originalDary.observacion]);
  requireScoped((await db.query("UPDATE cobertura_asignaciones SET fecha_fin='2026-11-30' WHERE id=1203 AND vinculacion_id=1461 AND fecha_fin='2026-08-31' RETURNING id")).rowCount===1,'REVERSAL_CLOSE1203_DIVERGENCE');
  requireScoped((await db.query('UPDATE cobertura_asignaciones SET institucion_id=NULL,sede_id=NULL,modalidad_id=NULL WHERE id=ANY($1::bigint[])',[seal.set.candidate_ids])).rowCount===seal.set.candidate_count,'REVERSAL_IDS_DIVERGENCE');
  await db.query('DROP INDEX public.idx_cobertura_asignaciones_timeline');
  await db.query('ALTER TABLE cobertura_asignaciones DROP COLUMN institucion_id,DROP COLUMN sede_id,DROP COLUMN modalidad_id,ALTER COLUMN focalizacion_final_id SET NOT NULL');
  const restored=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
  requireScoped(scopedDigest(restored)===scopedDigest(journal.before.coverage),'REVERSAL_BEFORE_IMAGE_FAILED');
  const exact=(await tableHashes(db,['cobertura_asignaciones']))[0],original=journal.before.data.find((r:any)=>r.table==='cobertura_asignaciones');requireScoped(scopedDigest(exact)===scopedDigest(original),'REVERSAL_EXACT_IMAGE_FAILED');
  await audit(db,authority,seal,'REVERSAL',{published_run_id:seal.run_id,reversed_write_set:seal.set.candidate_ids,restored_coverage_digest:scopedDigest(restored)});
  const verifyRestored=async(reader:ScopedDb)=>{
   const rows=await tableHashes(reader,journal.before.manifest.tables);
   for(const row of journal.before.data)if(!['auditoria','auditoria_eventos'].includes(row.table))requireScoped(scopedDigest(row)===scopedDigest(rows.find(r=>r.table===row.table)),'REVERSAL_PROTECTED_DATA_CHANGED');
  };
  await verifyRestored(db);
  await freshDefinitions(observer,journal.before.manifest,journal.before.inventory);
  await db.query('COMMIT');begun=false;committed=true;await verifyRestored(observer);
  return {status:'LOCAL_REVERSED',run_id:seal.run_id,economic_authorization:false,publication_audits_preserved:true,external_validation:'VERIFIED'};
 }catch(error){if(committed)throw Object.assign(new Error('COMMITTED_REVERSAL_REQUIRES_RECOVERY'),{cause:error,committed:true});throw error;
 }finally{try{if(begun)await db.query('ROLLBACK');}finally{await Promise.allSettled([db.end(),observer.end()]);}}
}
