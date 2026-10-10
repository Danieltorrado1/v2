import type {PoolClient} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {createReadOnlyRepository} from './phase48-readonly-repository';
import {contractDigest,authorizationFields,buildAuthorizationPhrase,MUTATOR_COMMIT,validateCertificateHash,DIGEST_FIELDS,exactEqual} from './phase48-readonly-contract';

export const READ_MODES=['PreflightOnly','PreviewOnly','PreflightAndPreview'] as const;
export const READ_BACKUP_SHA='4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26';
export const READ_PROJECT_REF='scuvsocqibbubqnesvuf';
export const digest=contractDigest;
export interface ReadFlags {health200:boolean;databaseOk:boolean;outbox:boolean;sync:boolean;recalc:boolean;worker:boolean;}
export interface ReadOptions {mode?:string;target:'Local'|'Production';commit:string;backupSha:string;certificateSha:string;observeFlags:()=>Promise<ReadFlags>;}
function need(value:unknown,code:string):asserts value {if(!value)throw Error(code);}
function retainSchemaStop(result:any,error:unknown,connectionPhase:string){
 const e=error as Record<string,unknown>;
 if(e.message!=='READ_SCHEMA_IDENTITY_MISMATCH')return;
 Object.assign(result,{status:'STOPPED',nonce:null,authorization_phrase:null,expires_at:null,writes_productive:0,expected_schema_digest:e.expected_schema_digest,observed_schema_digest:e.observed_schema_digest,canonicalization_version:e.canonicalization_version,schema_identity_version:e.schema_identity_version??e.canonicalization_version,observed_global_schema_digest:e.observed_global_schema_digest,schema_divergence_phase:e.schema_divergence_phase,schema_divergence_connection:connectionPhase});
}
export function validateReadOptions(o:ReadOptions){
 need(READ_MODES.includes((o.mode??'PreflightAndPreview') as typeof READ_MODES[number]),'UNKNOWN_READ_MODE');
 need(['Local','Production'].includes(o.target)&&/^[a-f0-9]{40}$/.test(o.commit)&&o.backupSha===READ_BACKUP_SHA&&typeof o.observeFlags==='function','READ_CONFIGURATION_INVALID');
 validateCertificateHash(o.certificateSha);
 need(Object.keys(o).every(k=>['mode','target','commit','backupSha','certificateSha','observeFlags'].includes(k)),'READ_OPTION_NOT_ALLOWED');
}
function flagsGate(f:ReadFlags){need(f&&Object.values(f).length===6&&Object.values(f).every(v=>typeof v==='boolean')&&f.health200===true&&f.databaseOk===true&&f.outbox===false&&f.sync===false&&f.recalc===false&&f.worker===false,'FLAGS_UNAVAILABLE_OR_UNSAFE');}
function emptyReceipt(o:ReadOptions){return {schema_version:4,status:'STOPPED',run_id:'phase48-preflight-'+randomUUID(),issued_at:new Date().toISOString(),expires_at:null,commit:o.commit,commits:{readonly_runner_commit:o.commit,mutator_commit:MUTATOR_COMMIT},backup_sha:READ_BACKUP_SHA,certificate_sha256:o.certificateSha,project_ref:READ_PROJECT_REF,scope:{actor:12,empresa:15,contrato:24},mode:o.mode??'PreflightAndPreview',postgresql:null,session:null,health:{initial:null,final:null},flags:null,locks:null,counts:null,digests:null,first_snapshot:null,post_rollback_snapshot:null,first_digests:null,post_rollback_digests:null,digest_comparison:null,stable:false,preview:null,phase48_state:'NOT_OBSERVED',post_rollback_verification:{status:'NOT_EXECUTED'},authorization_status:'NOT_ISSUED',authorization_phrase:null,nonce:null,writes:0,new_audits:0};}
export async function productionReadOnlyPreflight(client:Pick<PoolClient,'query'>,o:ReadOptions){
 let begun=false,result:any=emptyReceipt(o);
 try{
  validateReadOptions(o);const firstFlags=await o.observeFlags();result.health.initial=firstFlags;result.flags=firstFlags;flagsGate(firstFlags);
  await client.query('BEGIN');begun=true;
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL search_path=pg_catalog,public");
  const repo=createReadOnlyRepository(client),session=await repo.session();
  result.session={pid:session.pid,snapshot:session.snapshot,virtual_transaction:session.virtual_transaction,read_only:session.read_only,isolation:session.isolation,server_version:session.version};
  result.first_snapshot={...result.session};
  need(session.read_only==='on'&&session.isolation==='repeatable read','READ_TRANSACTION_REQUIRED');
  if(o.target==='Local')need(session.host==='127.0.0.1'&&session.port===55466&&session.version==='17.11','LOCAL_READ_TARGET_REQUIRED');
  else need(session.version==='17.6'&&await repo.ssl(),'PRODUCTION_TLS_OR_VERSION_INVALID');
  result.postgresql={server_version:session.version,ssl:o.target==='Production'};
  await repo.safePolicies();const locks=await repo.activity();result.locks=locks;need(locks.waiting===0&&locks.ddl===0,'LOCK_OR_DDL_DETECTED');
  result.target_identity=await repo.targetIdentity(o.target==='Production'?'postgres':'phase48_production');
  if(result.target_identity.schema_identity_version)Object.assign(result,{schema_identity_version:result.target_identity.schema_identity_version,expected_schema_digest:result.target_identity.schema_digest,observed_schema_digest:result.target_identity.schema_digest,observed_global_schema_digest:result.target_identity.global_schema_digest});
  await repo.actor();
  const initial=await repo.snapshot();result.counts=initial.data;need(initial.data.length===224,'PUBLIC_TABLE_POPULATION_CHANGED');await repo.verify(initial);
  const candidates=await repo.candidates();need(candidates.length===730&&initial.data.find(r=>r.table==='cobertura_asignaciones')?.count==='730','PHASE48_POPULATION_CHANGED');
  const plan=await repo.plan();need(plan.every(p=>!p.applied)&&plan[0]?.category_id==='34'&&plan[1]?.category_id===null&&plan[1]?.estado_salarial==='REQUIERE_REVISION_SALARIAL','HISTORICAL_STATE_CHANGED');
  const coverage=await repo.coverage(),affected=await repo.affected(),minimal=await repo.minimalState();
  need(minimal.phase48_state==='NO_APLICADA'&&minimal.count===730&&minimal.candidate_count===730,'PARTIAL_OR_APPLIED_STATE');
  const digests=await recomputeDigests(repo,initial,candidates,coverage,affected,minimal);
  result.first_digests={...digests};
  const preview=plan.map(p=>({vinculacion:p.vinculacion,institucion_id:p.target.institucion_id,sede_id:p.target.sede_id,municipio_id:p.target.municipio_id,coverage_id:p.coverage_id,desde:p.desde,hasta:p.hasta,modalidad_id:p.modalidad,category_id:p.category_id,estado_salarial:p.estado_salarial,following_coverage_id:p.siguiente,following_from:p.siguienteDesde,preserved_attendances:p.vinculacion==='1555'?16:0,created_attendances:0,automatic_recalculation:false,external_sync:false}));
  const final=await repo.snapshot(),finalMinimal=await repo.minimalState(),finalWriteSet=await repo.writeSet(final,await repo.candidates(),await repo.coverage(),await repo.affected()),finalSession=await repo.session(),finalLocks=await repo.activity(),finalFlags=await o.observeFlags();flagsGate(finalFlags);
  need(initial.digest===final.digest&&digests.write_set_before_digest===finalWriteSet&&digest(minimal)===digest(finalMinimal)&&digest(session)===digest(finalSession)&&digest(locks)===digest(finalLocks)&&digest(firstFlags)===digest(finalFlags),'READ_SAMPLE_CHANGED');
  Object.assign(result,{status:'READY_POSTCHECK',phase48_state:'NO_APLICADA',phase48_rows:730,counts:initial.data,digests,locks,preview,minimal_baseline:minimal,stability:{same_snapshot:true,same_session:true,snapshot_digest_unchanged:true}});
 }catch(error){const e=error as Error&{code?:string};Object.assign(result,{status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_PREFLIGHT_FAILED',sqlstate:e.code});retainSchemaStop(result,error,'principal');}
 finally{if(begun)try{await client.query('ROLLBACK');result.rollback='CONFIRMED';}catch{result={...result,status:'STOPPED',reason:'READ_CONNECTION_LOST_ROLLBACK_UNCONFIRMED',authorization_phrase:null,rollback:'CONNECTION_CLOSED_REQUIRED'};}}
 return result;
}

// The same algorithm is invoked with newly read inputs in each transaction.
export async function recomputeDigests(repo:ReturnType<typeof createReadOnlyRepository>,snapshot:Awaited<ReturnType<typeof repo.snapshot>>,candidates:any[],coverage:any[],affected:any[],minimal:Awaited<ReturnType<typeof repo.minimalState>>){
 return {schema_digest:digest({schema:snapshot.schema,constraints:snapshot.constraints,indexes:snapshot.indexes,routines:snapshot.routines,triggers:snapshot.triggers}),source_digest:snapshot.digest,phase48_candidates_digest:digest(candidates),albeny_before_digest:minimal.albeny_before_digest,dary_before_digest:minimal.dary_before_digest,protected_tables_digest:digest(snapshot.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table))),periods_4_6_digest:minimal.periods_4_6_digest,write_set_before_digest:await repo.writeSet(snapshot,candidates,coverage,affected)};
}
export interface ReadConnection {client:Pick<PoolClient,'query'>;close:()=>Promise<void>;}
// The principal client is destroyed before health and the fresh full-verification client.
// Neither connection is exposed to a mutator or accepts caller-provided SQL.
export async function runReadOnlyLifecycle(open:()=>Promise<ReadConnection>,o:ReadOptions){
 validateReadOptions(o);
 let principal:ReadConnection|undefined,post:ReadConnection|undefined,result:any;
 let postBegun=false;let firstClient:ReadConnection['client']|undefined;
 try{
  principal=await open();firstClient=principal.client;
  result=await productionReadOnlyPreflight(principal.client,o);
  await principal.close();principal=undefined;
  result.principal_connection_closed=true;
  if(result.status!=='READY_POSTCHECK')return result;
  const health=await o.observeFlags();result.health.final=health;flagsGate(health);
  need(digest(health)===digest(result.flags),'POST_ROLLBACK_FLAGS_CHANGED');
  post=await open();
  need(post.client!==firstClient,'SEPARATE_READ_CONNECTION_REQUIRED');
  await post.client.query('BEGIN');postBegun=true;
  await post.client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await post.client.query("SET LOCAL statement_timeout='120s'");
  await post.client.query("SET LOCAL lock_timeout='5s'");
  await post.client.query("SET LOCAL search_path=pg_catalog,public");
  const repo=createReadOnlyRepository(post.client),session=await repo.session();
  result.post_rollback_snapshot={pid:session.pid,snapshot:session.snapshot,virtual_transaction:session.virtual_transaction,read_only:session.read_only,isolation:session.isolation,server_version:session.version};
  need(session.read_only==='on'&&session.isolation==='repeatable read'&&session.pid!==result.session.pid&&session.virtual_transaction!==result.session.virtual_transaction,'SEPARATE_READ_CONNECTION_REQUIRED');
  // Snapshot text can legitimately match without intervening commits. Independence
  // is established by the new backend and virtual transaction, never cached text.
  if(o.target==='Local')need(session.host==='127.0.0.1'&&session.port===55466&&session.version==='17.11','LOCAL_READ_TARGET_REQUIRED');
  else need(session.version==='17.6'&&await repo.ssl(),'PRODUCTION_TLS_OR_VERSION_INVALID');
  await repo.safePolicies();
  const snapshot=await repo.snapshot(),candidates=await repo.candidates(),coverage=await repo.coverage(),affected=await repo.affected(),minimal=await repo.minimalState();
  const digests=await recomputeDigests(repo,snapshot,candidates,coverage,affected,minimal);
  result.post_rollback_digests={...digests};
  result.digest_comparison=Object.fromEntries(DIGEST_FIELDS.map(k=>[k,exactEqual(result.first_digests[k],digests[k])]));
  const changed=DIGEST_FIELDS.filter(k=>!result.digest_comparison[k]);
  if(changed.length){result.changed_digests=changed;throw Error('POST_ROLLBACK_DIGEST_DRIFT');}
  await repo.targetIdentity(o.target==='Production'?'postgres':'phase48_production');await repo.actor();
  await repo.verify(snapshot);
  const plan=await repo.plan(),locks=await repo.activity(),finalFlags=await o.observeFlags();flagsGate(finalFlags);
  need(locks.waiting===0&&locks.ddl===0,'POST_ROLLBACK_LOCK_OR_DDL');
  need(minimal.phase48_state==='NO_APLICADA'&&minimal.count===730&&minimal.candidate_count===730&&candidates.length===730,'POST_ROLLBACK_STATE_CHANGED');
  need(plan.every(p=>!p.applied)&&plan[0]?.category_id==='34'&&plan[1]?.category_id===null&&plan[1]?.estado_salarial==='REQUIERE_REVISION_SALARIAL','POST_ROLLBACK_HISTORICAL_STATE_CHANGED');
  need(digest(finalFlags)===digest(result.flags),'POST_ROLLBACK_FLAGS_CHANGED');
  result.health.final=finalFlags;result.september='NOT_APPLICABLE';
  result.post_rollback_verification={status:'OBSERVED',session:result.post_rollback_snapshot,locks,minimal,digests_compared:8};
 }catch(error){
  const e=error as Error;
  result??=emptyReceipt(o);
  Object.assign(result,{status:result.status==='READY_POSTCHECK'?'STOPPED_DRIFT':'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_TRANSPORT_OR_CONFIGURATION_FAILED',stable:false,authorization_status:'REVOCADA',authorization_phrase:null,nonce:null,expires_at:null});
  retainSchemaStop(result,error,'post_rollback');
 }finally{
  if(postBegun&&post)try{await post.client.query('ROLLBACK');result.post_rollback_verification.rollback='CONFIRMED';}catch{result.status='STOPPED_DRIFT';result.reason='POST_ROLLBACK_CONNECTION_LOST';result.authorization_status='REVOCADA';result.post_rollback_verification.rollback='UNCONFIRMED_CONNECTION_CLOSED';}
  if(post)try{await post.close();result.post_rollback_verification.connection_closed=true;}catch{result.status='STOPPED_DRIFT';result.reason='POST_ROLLBACK_CLOSE_FAILED';result.authorization_status='REVOCADA';}
  if(principal)try{await principal.close();if(result)result.principal_connection_closed=true;}catch{if(result){result.status='STOPPED';result.reason='PRINCIPAL_CLOSE_FAILED';result.authorization_status='REVOCADA';}}
 }
 if(result.status==='READY_POSTCHECK'&&result.post_rollback_verification.rollback==='CONFIRMED'&&result.post_rollback_verification.connection_closed===true){
  result.stable=true;result.post_rollback_verification.status='STABLE';
  const now=Date.now();result.issued_at=new Date(now).toISOString();result.expires_at=new Date(now+600_000).toISOString();result.nonce=randomBytes(32).toString('hex');
  try{
   result.authorization_phrase=buildAuthorizationPhrase(authorizationFields(result));
   result.status='PENDIENTE_DE_AUTORIZACION';result.authorization_status='PENDIENTE_DE_AUTORIZACION';
  }catch{
   Object.assign(result,{status:'STOPPED',reason:'AUTHORIZATION_CONTRACT_INVALID',stable:false,authorization_status:'REVOCADA',authorization_phrase:null,nonce:null,expires_at:null});
  }
 }
 return result;
}
