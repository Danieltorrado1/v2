import {sha256HexEqual} from './phase48-sha256';
import type {PoolClient} from 'pg';
import {inspectProductionTls} from './phase48-readonly-tls';
import {assertCriticalSchema} from './phase48-readonly-schema-identity';
import {validateReadTarget} from './phase48-readonly-target';
import {validateCertificateHash,parseAuthorizationPhrase,exactEqual,contractDigest,DIGEST_FIELDS} from './phase48-readonly-contract';
import {createReadOnlyRepository} from './phase48-readonly-repository';
import {createHash} from 'node:crypto';
import {actorGate,historicalPlan,historicalSnapshot,nextId,restartSequence,phaseSql} from './phase48-historical-domain';

type Db=Pick<PoolClient,'query'>;
type Snapshot=Awaited<ReturnType<typeof historicalSnapshot>>;
export const BACKUP_SHA='4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26';
export const PROJECT_REF='scuvsocqibbubqnesvuf';
export const PRODUCTION_AUTHORIZATION='REVOKED' as const;
export const MODES=['PreflightOnly','PreviewOnly','SimulateLocal','MutateProduction'] as const;
export const MARKER='PHASE48_ATOMIC_15_24_V1';
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const q=(n:string)=>'"'+n.replaceAll('"','""')+'"';
function need(ok:unknown,code:string):asserts ok{if(!ok)throw Error(code);}
export interface Flags {health200:boolean;databaseOk:boolean;outbox:boolean;sync:boolean;recalc:boolean;worker:boolean;}
export interface Options {
 mode?:string;target?:'Local'|'Production';actor:string;empresa:number;contrato:number;expectedRows:number;backupSha:string;
 commit:string;actualCommit:string;projectRef:string;runId:string;flags:Flags;
 enabled?:boolean;authorization?:'REVOKED'|'ACTIVE';confirmation?:string;baseline?:string;
 certificateSha?:string;authorizationPhrase?:string;nonceConsumed?:boolean;
 authorizationIssuedAt?:string;authorizationExpiresAt?:string;
 // Fault/concurrency hooks are accepted exclusively AFTER loopback identity checks.
 simulation?:{failAt?:'during-phase48'|'after-phase48'|'between-corrections'|'audit-events'|'audit';
 beforeLock?:()=>Promise<void>;insideLock?:()=>Promise<void>};
 observeFlags?:()=>Promise<Flags>;
 saveBaseline?:(receipt:unknown)=>Promise<void>;
}
export function confirmation(o:Options,baseline:string){return `MUTATE_PHASE48_HISTORICAL|project=${PROJECT_REF}|actor=12|empresa=15|contrato=24|rows=730|backup=${BACKUP_SHA}|commit=${o.commit}|run_id=${o.runId}|baseline=${baseline}|certificate_sha256=${o.certificateSha}|authorization_digest=${sha(o.authorizationPhrase??null)}`;}
export function assertProductionUrl(url:string){
 validateReadTarget(url);
}
export function validateOptions(o:Options){
 validatePreconnectionOptions(o);
 if(o.mode==='MutateProduction')need(o.nonceConsumed===true,'NONCE_NOT_CONSUMED');
}
export function validatePreconnectionOptions(o:Options){
 need(MODES.includes((o.mode??'PreflightOnly') as typeof MODES[number]),'UNKNOWN_MODE');
 need(o.target===undefined||['Local','Production'].includes(o.target),'UNKNOWN_TARGET');
 need(o.mode!=='SimulateLocal'||o.target!=='Production','SIMULATION_LOOPBACK_REQUIRED');
 need(o.actor==='12'&&o.empresa===15&&o.contrato===24,'SCOPE_OR_ACTOR_INVALID');
 need(o.expectedRows===730,'EXPECTED_ROWS_INVALID');need(sha256HexEqual(o.backupSha,BACKUP_SHA),'BACKUP_SHA_INVALID');
 need(/^[a-f0-9]{40}$/.test(o.commit)&&o.commit===o.actualCommit,'RUNNER_COMMIT_INVALID');
 need(o.projectRef===PROJECT_REF,'PROJECT_REF_INVALID');need(/^phase48-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(o.runId),'RUN_ID_INVALID');
 need(o.flags.health200&&o.flags.databaseOk&&!o.flags.outbox&&!o.flags.sync&&!o.flags.recalc&&!o.flags.worker,'HEALTH_OR_FLAGS_UNSAFE');
 if(o.mode==='MutateProduction'||o.target==='Production'){
  need(false,'LEGACY_PHASE48_CONTRACT_REVOKED');
  // Default is revoked. Only a NEW, explicit external approval can activate it;
  // certification never creates one or enables this process automatically.
  need((o.authorization??PRODUCTION_AUTHORIZATION)==='ACTIVE','AUTHORIZATION_REVOKED');
  need(o.enabled===true&&o.authorization==='ACTIVE'&&!o.simulation&&o.observeFlags&&o.saveBaseline,'PRODUCTION_GATES_REQUIRED');
  validateCertificateHash(o.certificateSha);
  const fields=parseAuthorizationPhrase(o.authorizationPhrase);
  need(exactEqual(fields.readonly_runner_commit,o.actualCommit),'RUNNER_COMMIT_INVALID');
  need(fields.issued_at===o.authorizationIssuedAt&&fields.expires_at===o.authorizationExpiresAt,'AUTHORIZATION_GRANT_MISMATCH');
  const issued=Date.parse(o.authorizationIssuedAt??''),expires=Date.parse(o.authorizationExpiresAt??'');
  need(Number.isFinite(issued)&&Number.isFinite(expires)&&issued<=Date.now()&&Date.now()-issued<=30*60_000&&expires>Date.now()&&expires-issued<=30*60_000,'AUTHORIZATION_EXPIRED_OR_INVALID');
  if(o.mode==='MutateProduction')need(/^[a-f0-9]{64}$/.test(o.baseline??'')&&o.confirmation===confirmation(o,o.baseline!),'EXACT_CONFIRMATION_REQUIRED');
 }
}
async function localIdentity(db:Db){
 const r=(await db.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version') version,current_setting('data_directory') directory,current_setting('listen_addresses') listen,current_setting('max_worker_processes') workers,current_setting('shared_preload_libraries') preload`)).rows[0];
 need(r.host==='127.0.0.1'&&r.port===55466&&r.version==='17.11'&&r.directory.replaceAll('\\','/')==='C:/Users/CORE ULTRA/Desktop/V2-instituciones-modalidad/tmp/phase48-production-cert/cluster'&&r.listen==='127.0.0.1'&&r.workers==='0'&&r.preload==='','SIMULATION_LOOPBACK_REQUIRED');
}
async function activity(db:Db){
 const r=(await db.query(`SELECT (SELECT count(*)::int FROM pg_locks WHERE NOT granted) waiting,(SELECT count(*)::int FROM pg_stat_activity WHERE state='active' AND pid<>pg_backend_pid() AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|GRANT|REVOKE)\\s') ddl`)).rows[0];
 need(r.waiting===0&&r.ddl===0,'LOCK_OR_DDL_DETECTED');
}
async function capture(db:Db){
 const snapshot=await historicalSnapshot(db);
 const coverage=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
 return {snapshot,coverage};
}
async function authorizationBaseline(db:Db,o:Options,s:Snapshot){
 const fields=parseAuthorizationPhrase(o.authorizationPhrase),repo=createReadOnlyRepository(db);
 await repo.safePolicies();
 const candidates=await repo.candidates(),coverage=await repo.coverage(),affected=await repo.affected(),minimal=await repo.minimalState();
 const actual={schema_digest:contractDigest({schema:s.schema,constraints:s.constraints,indexes:s.indexes,routines:s.routines,triggers:s.triggers}),source_digest:s.digest,phase48_candidates_digest:contractDigest(candidates),albeny_before_digest:minimal.albeny_before_digest,dary_before_digest:minimal.dary_before_digest,protected_tables_digest:contractDigest(s.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table))),periods_4_6_digest:minimal.periods_4_6_digest,write_set_before_digest:await repo.writeSet(s,candidates,coverage,affected)};
 for(const key of DIGEST_FIELDS)need(sha256HexEqual(actual[key],fields[key]),'AUTHORIZATION_BASELINE_CHANGED:'+key);
}
async function state(db:Db,s:Snapshot){
 await actorGate(db,'12');await activity(db);
 const columns=s.schema.filter(r=>r.table_name==='cobertura_asignaciones'),ids=columns.filter(r=>['institucion_id','sede_id','modalidad_id'].includes(r.column_name));
 const a=(await db.query(`SELECT id::text,usuario_id::text,accion,tabla_afectada,datos_nuevos FROM auditoria WHERE descripcion=$1 ORDER BY id`,[MARKER])).rows;
 const e=(await db.query(`SELECT id::text,usuario_id::text,empresa_id::text,contrato_id::text,accion,entidad,datos_nuevos FROM auditoria_eventos WHERE descripcion=$1 ORDER BY id`,[MARKER])).rows;
 need(a.length===0&&e.length===0||a.length===3&&e.length===3,'PARTIAL_STATE_DETECTED');
 if(ids.length===3&&a.length===3){
  need(ids.every(r=>r.data_type==='bigint'&&r.is_nullable==='YES')&&columns.find(r=>r.column_name==='focalizacion_final_id')?.is_nullable==='YES','PARTIAL_STATE_DETECTED');
  need(s.constraints.filter(r=>r.relname==='cobertura_asignaciones'&&r.definition.startsWith('FOREIGN KEY')&&/\((institucion_id|sede_id|modalidad_id)\)/.test(r.definition)).length===3&&s.indexes.some(r=>r.indexname==='idx_cobertura_asignaciones_timeline'),'PARTIAL_STATE_DETECTED');
  const p=await historicalPlan(db);need(p.every(r=>r.applied),'PARTIAL_STATE_DETECTED');
  need([...a,...e].every(r=>r.datos_nuevos&&typeof r.datos_nuevos==='object'&&!Array.isArray(r.datos_nuevos)&&/^phase48-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.datos_nuevos.run_id)&&/^[a-f0-9]{64}$/.test(r.datos_nuevos.before_digest)&&/^[a-f0-9]{64}$/.test(r.datos_nuevos.after_digest)&&r.datos_nuevos.result==='SUCCESS'&&typeof r.datos_nuevos.timestamp==='string'&&Number.isFinite(Date.parse(r.datos_nuevos.timestamp))),'PARTIAL_STATE_DETECTED');
  need(a.every(r=>r.datos_nuevos?.run_id===a[0].datos_nuevos.run_id)&&e.every(r=>r.datos_nuevos?.run_id===a[0].datos_nuevos.run_id),'PARTIAL_STATE_DETECTED');
  need(sha256HexEqual(a[0].datos_nuevos.backup_sha,BACKUP_SHA),'PARTIAL_STATE_DETECTED');
  need([...a,...e].every(r=>r.usuario_id==='12'&&r.accion==='UPDATE'&&r.datos_nuevos.actor===12&&r.datos_nuevos.empresa===15&&r.datos_nuevos.contrato===24&&sha256HexEqual(r.datos_nuevos.backup_sha,BACKUP_SHA)&&/^[a-f0-9]{40}$/.test(r.datos_nuevos.runner_commit))&&a.every(r=>r.tabla_afectada==='cobertura_asignaciones')&&e.every(r=>r.empresa_id==='15'&&r.contrato_id==='24'&&r.entidad==='cobertura_asignaciones'),'PARTIAL_STATE_DETECTED');
  need(sha256HexEqual(sha(a.map(r=>r.datos_nuevos.action).sort()),sha(['ALBENY','DARY','PHASE48']))&&sha256HexEqual(sha(e.map(r=>r.datos_nuevos.action).sort()),sha(['ALBENY','DARY','PHASE48'])),'PARTIAL_STATE_DETECTED');
  need(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id WHERE ca.institucion_id IS DISTINCT FROM ff.institucion_id OR ca.sede_id IS DISTINCT FROM ff.sede_id OR ca.modalidad_id IS DISTINCT FROM ff.modalidad_id LIMIT 1`)).rowCount,'PARTIAL_STATE_DETECTED');
  return {applied:true,plan:p,identities:[] as Record<string,any>[]};
 }
 need(ids.length===0&&a.length===0&&e.length===0&&columns.find(r=>r.column_name==='focalizacion_final_id')?.is_nullable==='NO'&&!s.indexes.some(r=>r.indexname==='idx_cobertura_asignaciones_timeline'),'PARTIAL_STATE_DETECTED');
 need(!(await db.query(`SELECT 1 FROM auditoria WHERE descripcion IN('PHASE48_IDENTITIES_15_24_V1','PHASE48_HISTORICAL_15_24_V1') LIMIT 1`)).rowCount,'PARTIAL_STATE_DETECTED');
 const identities=(await db.query(`SELECT ca.id::text cobertura_id,ff.institucion_id::text,ff.sede_id::text,ff.modalidad_id::text FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15 ORDER BY ca.id`)).rows;
 need(identities.length===730&&s.data.find(r=>r.table==='cobertura_asignaciones')?.count==='730','PHASE48_POPULATION_CHANGED');
 // Exact SELECT projection only, to validate historical prerequisites before DDL.
 const projected:Db={query:((sql:any,values?:any)=>{let text=String(sql);if(text.includes('SELECT ca.*,ca.id::text,ca.fecha_inicio::text desde'))text=text.replace('SELECT ca.*,','SELECT ca.*,ff.institucion_id,ff.sede_id,ff.modalidad_id,').replace(/FROM cobertura_asignaciones ca(?=\s+WHERE)/,'FROM cobertura_asignaciones ca LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id');return db.query(text,values);}) as Db['query']};
 const plan=await historicalPlan(projected);need(plan.every(r=>!r.applied)&&plan[0]?.category_id==='34'&&plan[1]?.category_id===null&&plan[1]?.estado_salarial==='REQUIERE_REVISION_SALARIAL','HISTORICAL_STATE_CHANGED');
 return {applied:false,plan,identities};
}
async function anomalies(db:Db){
 need(!(await db.query(`SELECT 1 FROM cobertura_asignaciones a JOIN cobertura_asignaciones b ON a.id<b.id AND a.contrato_id=b.contrato_id AND a.vinculacion_id=b.vinculacion_id AND a.activo AND b.activo AND a.fecha_inicio<=COALESCE(b.fecha_fin,'infinity'::date) AND b.fecha_inicio<=COALESCE(a.fecha_fin,'infinity'::date) LIMIT 1`)).rowCount,'COVERAGE_OVERLAP');
 need((await db.query(`SELECT count(*)::int n FROM nomina_periodos WHERE id IN(4,6) AND contrato_id=24 AND estado='ANULADO'`)).rows[0].n===2,'ANNULLED_PERIOD_CHANGED');
 need(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca LEFT JOIN vinculaciones v ON v.id=ca.vinculacion_id LEFT JOIN contratos c ON c.id=ca.contrato_id WHERE v.id IS NULL OR c.id IS NULL OR v.contrato_id<>ca.contrato_id OR v.empresa_id<>c.empresa_id LIMIT 1`)).rowCount,'TENANT_ORPHAN');
}
async function audit(db:Db,o:Options,action:string,ids:string[],before:string,after:string,expectedIds:{legacy:string,event:string}){
 const payload={run_id:o.runId,actor:12,empresa:15,contrato:24,action,ids,before_digest:before,after_digest:after,runner_commit:o.commit,backup_sha:BACKUP_SHA,timestamp:new Date().toISOString(),result:'SUCCESS'};
 const legacy=await nextId(db,'auditoria'),event=await nextId(db,'auditoria_eventos');
 need(legacy.id===expectedIds.legacy&&event.id===expectedIds.event,'SEQUENCE_DRIFT_DETECTED');
 if(o.simulation?.failAt==='audit')await db.query('INSERT INTO auditoria(id) VALUES(NULL)');
 need((await db.query(`INSERT INTO auditoria(id,usuario_id,tabla_afectada,registro_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,12,'cobertura_asignaciones',NULL,'UPDATE',$2,$3::jsonb,$4::jsonb) RETURNING id`,[legacy.id,MARKER,JSON.stringify({digest:before}),JSON.stringify(payload)])).rowCount===1,'STRICT_AUDIT_FAILED');
 await restartSequence(db,legacy.sequence,legacy.id);
 if(o.simulation?.failAt==='audit-events')await db.query('INSERT INTO auditoria_eventos(id) VALUES(NULL)');
 need((await db.query(`INSERT INTO auditoria_eventos(id,usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,12,15,24,'COBERTURA','cobertura_asignaciones',$2,'UPDATE',$3,$4::jsonb,$5::jsonb) RETURNING id`,[event.id,ids.join(','),MARKER,JSON.stringify({digest:before}),JSON.stringify(payload)])).rowCount===1,'STRICT_EVENT_AUDIT_FAILED');
 await restartSequence(db,event.sequence,event.id);
}
function protectedData(before:Snapshot,after:Snapshot){
 for(const r of before.data)if(!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table))need(sha256HexEqual(sha(r),sha(after.data.find(a=>a.table===r.table))),'PROTECTED_TABLE_CHANGED:'+r.table);
 for(const r of before.sequences)if(!['cobertura_asignaciones_id_seq','auditoria_id_seq','auditoria_eventos_id_seq'].includes(r.sequence))need(sha256HexEqual(sha(r),sha(after.sequences.find(a=>a.sequence===r.sequence))),'PROTECTED_SEQUENCE_CHANGED');
 need(sha256HexEqual(sha(before.routines),sha(after.routines))&&sha256HexEqual(sha(before.triggers),sha(after.triggers)),'FUNCTION_OR_TRIGGER_CHANGED');
}
export async function executeAtomic(db:Db,observer:Db,o:Options){
 let transaction=false,wrote=false,committed=false,commitAttempted=false;
 try{
  validateOptions(o);const mode=o.mode??'PreflightOnly';
  if(mode!=='MutateProduction'&&o.target!=='Production')await localIdentity(db);
  else {inspectProductionTls(db);inspectProductionTls(observer);await assertCriticalSchema(db);await assertCriticalSchema(observer);need((await db.query('SHOW server_version')).rows[0].server_version==='17.6','PRODUCTION_VERSION_INVALID');}
  if(mode!=='SimulateLocal')need(!o.simulation,'SIMULATION_HOOKS_FORBIDDEN');
  const sql=phaseSql();need(!/\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(sql),'INNER_TRANSACTION_BOUNDARY');
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY');transaction=true;
  if(mode==='MutateProduction'||o.target==='Production')await assertCriticalSchema(db);
  const initial=await capture(db),initialState=await state(db,initial.snapshot);await anomalies(db);
  const auditFirst:Record<string,string>={};
  for(const table of ['auditoria','auditoria_eventos']){
   const sequence=initial.snapshot.sequences.find(r=>r.sequence===table+'_id_seq')!;
   need(sequence,'EXPECTED_SEQUENCE_REQUIRED');
   const max=BigInt((await db.query(`SELECT COALESCE(max(id),0)::text id FROM ${q(table)}`)).rows[0].id),last=BigInt(sequence.last_value);
   auditFirst[table]=String((max>last?max:last)+1n);
  }
  if(!initialState.applied)need(!(await db.query(`SELECT 1 FROM auditoria WHERE datos_nuevos->>'run_id'=$1 UNION ALL SELECT 1 FROM auditoria_eventos WHERE datos_nuevos->>'run_id'=$1 LIMIT 1`,[o.runId])).rowCount,'RUN_ID_ALREADY_USED');
  if(mode==='MutateProduction'&&!initialState.applied){need(sha256HexEqual(o.baseline,initial.snapshot.digest),'IMMEDIATE_BASELINE_CHANGED');await authorizationBaseline(db,o,initial.snapshot);}
  await db.query('ROLLBACK');transaction=false;
  const receipt={run_id:o.runId,commit:o.commit,backup_sha:BACKUP_SHA,certificate_sha256:o.certificateSha??null,sql_sha256:createHash('sha256').update(sql).digest('hex'),baseline:initial.snapshot.digest,tables:initial.snapshot.data,sequences:initial.snapshot.sequences,schema_digest:sha({schema:initial.snapshot.schema,constraints:initial.snapshot.constraints,indexes:initial.snapshot.indexes,routines:initial.snapshot.routines,triggers:initial.snapshot.triggers}),affected_rows_digest:sha(initial.coverage),authorization:o.authorization??PRODUCTION_AUTHORIZATION,plan:initialState.plan.map(({target,...p})=>p)};
  if(initialState.applied)return {status:'ALREADY_APPLIED',writes:0,newAudits:0,receipt};
  if(mode==='PreflightOnly'||mode==='PreviewOnly')return {status:'READY',writes:0,newAudits:0,receipt,phase48Rows:730};
  if(mode==='MutateProduction')need(sha256HexEqual(o.baseline,initial.snapshot.digest),'IMMEDIATE_BASELINE_CHANGED');
  await o.saveBaseline?.(receipt);
  await o.simulation?.beforeLock?.();
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');transaction=true;
  await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'; SET LOCAL timezone='UTC'");
  await db.query("SELECT set_config('application_name',$1,true),set_config('empiria.run_id',$2,true),set_config('empiria.actor_id','12',true)",['phase48:'+o.runId,o.runId]);
  need((await db.query('SELECT pg_try_advisory_xact_lock(15,2448) locked')).rows[0].locked,'ADVISORY_LOCK_BUSY');
  await o.simulation?.insideLock?.();
  const live=await historicalSnapshot(observer);need(sha256HexEqual(live.digest,initial.snapshot.digest),'SOURCE_DRIFT_DETECTED');
  await db.query(`LOCK TABLE ${initial.snapshot.data.map(r=>'public.'+q(r.table)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  // SERIALIZABLE pins this session's snapshot at the first lock query. An
  // independent READ COMMITTED observer catches commits between that snapshot
  // and acquisition of every table lock; own-session rereads alone cannot.
  need(sha256HexEqual((await historicalSnapshot(observer)).digest,initial.snapshot.digest),'SOURCE_DRIFT_DETECTED');
  const locked=await capture(db);need(sha256HexEqual(locked.snapshot.digest,initial.snapshot.digest),'SOURCE_DRIFT_DETECTED');
  const lockedState=await state(db,locked.snapshot);need(!lockedState.applied&&sha256HexEqual(sha(lockedState.identities),sha(initialState.identities)),'SOURCE_DRIFT_DETECTED');
  if(mode==='MutateProduction'||o.target==='Production')await assertCriticalSchema(db);
  if(o.observeFlags){const flags=await o.observeFlags();validateOptions({...o,flags});}
  if(o.simulation?.failAt==='during-phase48'){await db.query('ALTER TABLE cobertura_asignaciones ADD COLUMN institucion_id bigint');wrote=true;throw Error('INDUCED_PHASE48_FAILURE');}
  await db.query(sql);wrote=true;
  const phaseRows=(await db.query(`SELECT ca.id::text cobertura_id,ca.institucion_id::text,ca.sede_id::text,ca.modalidad_id::text FROM cobertura_asignaciones ca ORDER BY ca.id`)).rows;
  need(sha256HexEqual(sha(phaseRows),sha(initialState.identities)),'PHASE48_POSTCHECK_FAILED');
  if(o.simulation?.failAt==='after-phase48')throw Error('INDUCED_AFTER_PHASE48');
  const plan=await historicalPlan(db);need(sha256HexEqual(sha(plan),sha(initialState.plan)),'HISTORICAL_PLAN_DRIFT_DETECTED');
  for(let i=0;i<plan.length;i++){
   const p=plan[i]!;
   if(p.historica)need((await db.query(`UPDATE cobertura_asignaciones SET activo=TRUE,observacion=$1 WHERE id=11 AND vinculacion_id=249 AND contrato_id=24 AND NOT activo RETURNING id`,[p.observation])).rowCount===1,'DARY_UPDATE_FAILED');
   else{
    const n=await nextId(db,'cobertura_asignaciones');need(n.id===p.coverage_id,'NEW_COVERAGE_ID_CHANGED');
    need((await db.query(`INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,municipio_id,focalizacion_final_id,institucion_id,sede_id,modalidad_id,institucion,sede,modalidad,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,observacion,activo) VALUES($1,24,1555,477,NULL,44,196,1,$2,$3,'CAA','PRINCIPAL',1,'2026-08-18','2026-09-08',$4,TRUE) RETURNING id`,[n.id,p.target.institucion,p.target.sede,p.observation])).rowCount===1,'ALBENY_INSERT_FAILED');await restartSequence(db,n.sequence,n.id);
   }
   if(i===0&&o.simulation?.failAt==='between-corrections')throw Error('INDUCED_BETWEEN_CORRECTIONS');
  }
  const applied=await historicalPlan(db);need(applied.every(p=>p.applied)&&applied[1]?.category_id===null,'HISTORICAL_POSTCHECK_FAILED');await anomalies(db);
  const afterCoverage=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
  for(const old of initial.coverage){const current=afterCoverage.find(r=>r.id===old.id);need(current,'EXISTING_COVERAGE_MISSING');const {institucion_id,sede_id,modalidad_id,...rest}=current;
   if(old.id===11){const {activo,observacion,...other}=rest;const {activo:oldActive,observacion:oldObservation,...expected}=old;need(sha256HexEqual(sha(other),sha(expected))&&activo===true&&observacion===applied[1]!.observation,'UNAUTHORIZED_COVERAGE_CHANGE');}
   else need(sha256HexEqual(sha(rest),sha(old)),'UNAUTHORIZED_COVERAGE_CHANGE');
  }
  need(afterCoverage.length===initial.coverage.length+1,'UNEXPECTED_COVERAGE_WRITE');
  let auditIndex=0;
  for(const [action,ids] of [['PHASE48',initialState.identities.map(r=>r.cobertura_id)],['ALBENY',[applied[0]!.coverage_id]],['DARY',['11']]] as [string,string[]][]){await audit(db,o,action,ids,sha(initial.coverage),sha(afterCoverage),{legacy:String(BigInt(auditFirst.auditoria!)+BigInt(auditIndex)*2n),event:String(BigInt(auditFirst.auditoria_eventos!)+BigInt(auditIndex)*2n)});auditIndex++;}
  const final=await historicalSnapshot(db);protectedData(initial.snapshot,final);
  for(const [sequence,last] of [['cobertura_asignaciones_id_seq',String(BigInt(applied[0]!.coverage_id)+1n)],['auditoria_id_seq',String(BigInt(auditFirst.auditoria!)+5n)],['auditoria_eventos_id_seq',String(BigInt(auditFirst.auditoria_eventos!)+5n)]]){
   const value=final.sequences.find(r=>r.sequence===sequence);need(value?.last_value===last&&value?.is_called===false,'SEQUENCE_DRIFT_DETECTED');
  }
  const newColumns=['institucion_id','sede_id','modalidad_id'];
  const originalSchema=final.schema.filter(r=>!(r.table_name==='cobertura_asignaciones'&&newColumns.includes(r.column_name))).map(r=>r.table_name==='cobertura_asignaciones'&&r.column_name==='focalizacion_final_id'?{...r,is_nullable:'NO'}:r);
  need(sha256HexEqual(sha(originalSchema),sha(initial.snapshot.schema)),'UNAUTHORIZED_SCHEMA_CHANGE');
  const addedFks=final.constraints.filter(r=>r.relname==='cobertura_asignaciones'&&r.definition.startsWith('FOREIGN KEY')&&/\((institucion_id|sede_id|modalidad_id)\)/.test(r.definition));
  need(addedFks.length===3&&sha256HexEqual(sha(final.constraints.filter(r=>!addedFks.includes(r))),sha(initial.snapshot.constraints)),'UNAUTHORIZED_CONSTRAINT_CHANGE');
  need(sha256HexEqual(sha(final.indexes.filter(r=>r.indexname!=='idx_cobertura_asignaciones_timeline')),sha(initial.snapshot.indexes))&&final.indexes.some(r=>r.tablename==='cobertura_asignaciones'&&r.indexname==='idx_cobertura_asignaciones_timeline'),'UNAUTHORIZED_INDEX_CHANGE');
  for(const table of ['auditoria','auditoria_eventos'])need(BigInt(final.data.find(r=>r.table===table)!.count)===BigInt(initial.snapshot.data.find(r=>r.table===table)!.count)+3n,'STRICT_AUDIT_COUNT_FAILED');
  // Each appended audit must be attributable to this run; existing audit rows
  // are protected by digest, not merely by the final row count.
  for(const table of ['auditoria','auditoria_eventos']){
   const existing=(await db.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM ${q(table)} t WHERE (descripcion=$1 AND datos_nuevos->>'run_id'=$2) IS NOT TRUE`,[MARKER,o.runId])).rows[0];
   const before=initial.snapshot.data.find(r=>r.table===table)!;need(existing.count===before.count&&sha256HexEqual(existing.digest,before.digest),'EXISTING_AUDIT_CHANGED');
  }
  await activity(db);if(o.observeFlags)validateOptions({...o,flags:await o.observeFlags()});
  commitAttempted=true;await db.query('COMMIT');transaction=false;committed=true;
  need(sha256HexEqual((await historicalSnapshot(observer)).digest,final.digest),'POST_COMMIT_DRIFT_DETECTED');
  need((await db.query("SELECT count(*)::int n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'")).rows[0].n===0,'ADVISORY_LOCK_NOT_RELEASED');
  if(o.observeFlags)validateOptions({...o,flags:await o.observeFlags()});
  return {status:'SUCCESS',writes:{phase48:730,coverages:2,auditoria:3,auditoria_eventos:3},newAudits:6,receipt,plan:applied.map(({target,...p})=>p),before:initial.snapshot,after:final};
 }catch(error){
  const e=error as Error&{code?:string};
  if(transaction)try{await db.query('ROLLBACK');}catch{return {status:'STOPPED',reason:commitAttempted?'COMMIT_OUTCOME_UNKNOWN':'ROLLBACK_NOT_CONFIRMED',run_id:o.runId,writes:'UNKNOWN',newAudits:'UNKNOWN',committed:'UNKNOWN',sqlstate:e.code};}
  if(commitAttempted&&!committed)return {status:'STOPPED',reason:'COMMIT_OUTCOME_UNKNOWN',run_id:o.runId,writes:'UNKNOWN',newAudits:'UNKNOWN',committed:'UNKNOWN',sqlstate:e.code};
  return {status:committed?'STOPPED':wrote?'ROLLED_BACK':'STOPPED',reason:/^[A-Z0-9_:a-z]+$/.test(e.message)?e.message:'DATABASE_ERROR',sqlstate:e.code,writes:committed?{phase48:730,coverages:2,auditoria:3,auditoria_eventos:3}:0,newAudits:committed?6:0,committed};
 }
}
