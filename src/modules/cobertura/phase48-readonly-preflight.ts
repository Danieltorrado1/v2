import type {PoolClient} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import type {ReadConnection} from './phase48-readonly-connection';
import {createReadOnlyRepository} from './phase48-readonly-repository';
import {contractDigest,authorizationFields,buildAuthorizationPhrase,MUTATOR_COMMIT,validateCertificateHash,DIGEST_FIELDS,exactEqual} from './phase48-readonly-contract';
import {sha256HexEqual} from './phase48-sha256';

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
 need(['Local','Production'].includes(o.target)&&/^[a-f0-9]{40}$/.test(o.commit)&&sha256HexEqual(o.backupSha,READ_BACKUP_SHA)&&typeof o.observeFlags==='function','READ_CONFIGURATION_INVALID');
 validateCertificateHash(o.certificateSha);
 need(Object.keys(o).every(k=>['mode','target','commit','backupSha','certificateSha','observeFlags'].includes(k)),'READ_OPTION_NOT_ALLOWED');
}
function flagsGate(f:ReadFlags){need(f&&Object.values(f).length===6&&Object.values(f).every(v=>typeof v==='boolean')&&f.health200===true&&f.databaseOk===true&&f.outbox===false&&f.sync===false&&f.recalc===false&&f.worker===false,'FLAGS_UNAVAILABLE_OR_UNSAFE');}
function emptyReceipt(o:ReadOptions){return {schema_version:4,status:'STOPPED',run_id:'phase48-preflight-'+randomUUID(),issued_at:new Date().toISOString(),expires_at:null,commit:o.commit,commits:{readonly_runner_commit:o.commit,mutator_commit:MUTATOR_COMMIT},backup_sha:READ_BACKUP_SHA,certificate_sha256:o.certificateSha,project_ref:READ_PROJECT_REF,scope:{actor:12,empresa:15,contrato:24},mode:o.mode??'PreflightAndPreview',postgresql:null,session:null,health:{initial:null,final:null},flags:null,locks:null,counts:null,digests:null,first_snapshot:null,post_rollback_snapshot:null,first_digests:null,post_rollback_digests:null,digest_comparison:null,stable:false,preview:null,phase48_state:'NOT_OBSERVED',post_rollback_verification:{status:'NOT_EXECUTED'},authorization_status:'NOT_ISSUED',authorization_phrase:null,nonce:null,writes:0,new_audits:0};}
export async function productionReadOnlyPreflight(client:Pick<PoolClient,'query'>,o:ReadOptions,capture?:(inputs:unknown[])=>void){
 let begun=false,result:any=emptyReceipt(o);
 try{
  validateReadOptions(o);const firstFlags=await o.observeFlags();result.health.initial=firstFlags;result.flags=firstFlags;flagsGate(firstFlags);
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL search_path=pg_catalog,public");
  const repo=createReadOnlyRepository(client),session=await repo.session();
  result.session={pid:session.pid,snapshot:session.snapshot,virtual_transaction:session.virtual_transaction,read_only:session.read_only,isolation:session.isolation,server_version:session.version};
  result.first_snapshot={...result.session};
  need(session.read_only==='on'&&session.isolation==='repeatable read'&&typeof session.virtual_transaction==='string'&&/^\d+\/\d+$/.test(session.virtual_transaction),'READ_TRANSACTION_REQUIRED');
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
  capture?.([initial,candidates,coverage,affected,minimal]);
  result.first_digests={...digests};
  const preview=plan.map(p=>({vinculacion:p.vinculacion,institucion_id:p.target.institucion_id,sede_id:p.target.sede_id,municipio_id:p.target.municipio_id,coverage_id:p.coverage_id,desde:p.desde,hasta:p.hasta,modalidad_id:p.modalidad,category_id:p.category_id,estado_salarial:p.estado_salarial,following_coverage_id:p.siguiente,following_from:p.siguienteDesde,preserved_attendances:p.vinculacion==='1555'?16:0,created_attendances:0,automatic_recalculation:false,external_sync:false}));
  const final=await repo.snapshot(),finalMinimal=await repo.minimalState(),finalWriteSet=await repo.writeSet(final,await repo.candidates(),await repo.coverage(),await repo.affected()),finalSession=await repo.session(),finalLocks=await repo.activity(),finalFlags=await o.observeFlags();flagsGate(finalFlags);
  need(sha256HexEqual(initial.digest,final.digest)&&sha256HexEqual(digests.write_set_before_digest,finalWriteSet)&&sha256HexEqual(digest(minimal),digest(finalMinimal))&&sha256HexEqual(digest(session),digest(finalSession))&&sha256HexEqual(digest(locks),digest(finalLocks))&&sha256HexEqual(digest(firstFlags),digest(finalFlags)),'READ_SAMPLE_CHANGED');
  Object.assign(result,{status:'READY_POSTCHECK',phase48_state:'NO_APLICADA',phase48_rows:730,counts:initial.data,digests,locks,preview,minimal_baseline:minimal,stability:{same_snapshot:true,same_session:true,snapshot_digest_unchanged:true}});
 }catch(error){const e=error as Error&{code?:string};Object.assign(result,{status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_PREFLIGHT_FAILED',sqlstate:e.code});retainSchemaStop(result,error,'principal');}
 finally{if(begun)try{await client.query('ROLLBACK');result.rollback='CONFIRMED';}catch{result={...result,status:'STOPPED',reason:'READ_CONNECTION_LOST_ROLLBACK_UNCONFIRMED',authorization_phrase:null,rollback:'CONNECTION_CLOSED_REQUIRED'};}}
 return result;
}

// The same algorithm is invoked with newly read inputs in each transaction.
export async function recomputeDigests(repo:ReturnType<typeof createReadOnlyRepository>,snapshot:Awaited<ReturnType<typeof repo.snapshot>>,candidates:any[],coverage:any[],affected:any[],minimal:Awaited<ReturnType<typeof repo.minimalState>>){
 return {schema_digest:digest({schema:snapshot.schema,constraints:snapshot.constraints,indexes:snapshot.indexes,routines:snapshot.routines,triggers:snapshot.triggers}),source_digest:snapshot.digest,phase48_candidates_digest:digest(candidates),albeny_before_digest:minimal.albeny_before_digest,dary_before_digest:minimal.dary_before_digest,protected_tables_digest:digest(snapshot.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table))),periods_4_6_digest:minimal.periods_4_6_digest,write_set_before_digest:await repo.writeSet(snapshot,candidates,coverage,affected)};
}
export type {ReadConnection} from './phase48-readonly-connection';
// The principal client is destroyed before health and the fresh full-verification client.
// Neither connection is exposed to a mutator or accepts caller-provided SQL.
export async function runReadOnlyLifecycle(open:()=>Promise<ReadConnection>,o:ReadOptions){
 validateReadOptions(o);
 let principal:ReadConnection|undefined,post:ReadConnection|undefined,result:any;
 let postBegun=false;let first:ReadConnection|undefined;
 const firstObjects=new WeakSet<object>();
 function track(value:unknown,posterior=false){
  if(!value||typeof value!=='object')return;
  if(posterior)need(!firstObjects.has(value),'READ_RESULT_REUSED');else firstObjects.add(value);
  for(const child of Object.values(value))track(child,posterior);
 }
 function connectionGate(c:ReadConnection){
  need(c.pool&&c.client&&c.stream&&!c.stream.destroyed&&!c.isClosed(),'READ_CONNECTION_INVALID');
  need(c.evidence.connection_instance_id&&c.queryCount()===0,'READ_CONNECTION_ALREADY_USED');
  if(o.target==='Production'||c.tlsSocket)need(c.tlsSocket===c.stream&&c.evidence.handshake_events===1&&c.evidence.handshake_at&&c.evidence.tls_protocol==='TLSv1.3','READ_TLS_HANDSHAKE_NOT_OBSERVED');
 }
 try{
  principal=await open();first=principal;connectionGate(principal);
  result=await productionReadOnlyPreflight(principal.client,o,inputs=>track(inputs));
  result.connection_evidence={first:principal.evidence,second:null};
  Object.assign(principal.evidence,{backend_pid:result.session?.pid??null,virtual_transaction:result.session?.virtual_transaction??null,snapshot:result.session?.snapshot??null});
  if(result.rollback==='CONFIRMED')principal.evidence.rollback_at=new Date().toISOString();
  await principal.close();
  need(first.isClosed()&&first.stream.destroyed,'FIRST_READ_CONNECTION_STILL_OPEN');
  principal=undefined;
  result.principal_connection_closed=true;
  if(result.status!=='READY_POSTCHECK')return result;
  const health=await o.observeFlags();result.health.final=health;flagsGate(health);
  need(sha256HexEqual(digest(health),digest(result.flags)),'POST_ROLLBACK_FLAGS_CHANGED');
  post=await open();
  result.connection_evidence.second=post.evidence;
  need(post.pool!==first.pool,'SEPARATE_READ_POOL_REQUIRED');
  need(post.client!==first.client,'SEPARATE_READ_CLIENT_REQUIRED');
  need(post.stream!==first.stream,'SEPARATE_READ_STREAM_REQUIRED');
  need(!first.tlsSocket||post.tlsSocket!==first.tlsSocket,'SEPARATE_READ_TLS_SOCKET_REQUIRED');
  connectionGate(post);
  need(post.evidence.connection_instance_id!==first.evidence.connection_instance_id,'SEPARATE_READ_INSTANCE_REQUIRED');
  need(first.isClosed()&&first.stream.destroyed,'FIRST_READ_CONNECTION_STILL_OPEN');
  await post.client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');postBegun=true;
  await post.client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await post.client.query("SET LOCAL statement_timeout='120s'");
  await post.client.query("SET LOCAL lock_timeout='5s'");
  await post.client.query("SET LOCAL search_path=pg_catalog,public");
  const repo=createReadOnlyRepository(post.client),session=await repo.session();
  result.post_rollback_snapshot={pid:session.pid,snapshot:session.snapshot,virtual_transaction:session.virtual_transaction,read_only:session.read_only,isolation:session.isolation,server_version:session.version};
  Object.assign(post.evidence,{backend_pid:session.pid,virtual_transaction:session.virtual_transaction,snapshot:session.snapshot});
  need(session.read_only==='on'&&session.isolation==='repeatable read'&&typeof session.virtual_transaction==='string'&&/^\d+\/\d+$/.test(session.virtual_transaction)&&session.virtual_transaction!==result.session.virtual_transaction,'SEPARATE_READ_TRANSACTION_REQUIRED');
  // A transaction pooler may assign the same backend sequentially to distinct
  // frontend sockets. PID and snapshot text are informative, never independence gates.
  if(o.target==='Local')need(session.host==='127.0.0.1'&&session.port===55466&&session.version==='17.11','LOCAL_READ_TARGET_REQUIRED');
  else need(session.version==='17.6'&&await repo.ssl(),'PRODUCTION_TLS_OR_VERSION_INVALID');
  await repo.safePolicies();
  const posteriorStart=post.queryCount();
  const inputQueries:Record<string,number>={};
  const fresh=async<T>(name:string,read:()=>Promise<T>)=>{const before=post!.queryCount(),value=await read();inputQueries[name]=post!.queryCount()-before;need(inputQueries[name]!>0,'POST_READ_QUERY_NOT_EXECUTED');track(value,true);return value;};
  const snapshot=await fresh('snapshot',()=>repo.snapshot()),candidates=await fresh('candidates',()=>repo.candidates()),coverage=await fresh('coverage',()=>repo.coverage()),affected=await fresh('affected',()=>repo.affected()),minimal=await fresh('minimal_state',()=>repo.minimalState());
  const beforeWriteSet=post.queryCount();
  const digests=await recomputeDigests(repo,snapshot,candidates,coverage,affected,minimal);
  need(post.queryCount()>beforeWriteSet,'POST_READ_QUERY_NOT_EXECUTED');
  inputQueries.write_set=post.queryCount()-beforeWriteSet;
  result.independence={distinct_pools:true,distinct_clients:true,distinct_streams:true,distinct_tls_sockets:!!first.tlsSocket&&!!post.tlsSocket,independent_handshakes:first.evidence.handshake_events+post.evidence.handshake_events,first_closed_before_second:true,distinct_virtual_transactions:true,backend_pid_equal:session.pid===result.session.pid,snapshot_text_equal:session.snapshot===result.session.snapshot,posterior_input_queries:inputQueries,posterior_digest_query_count:post.queryCount()-posteriorStart,shared_result_objects:0};
  result.post_rollback_digests={...digests};
  result.digest_comparison=Object.fromEntries(DIGEST_FIELDS.map(k=>[k,sha256HexEqual(result.first_digests[k],digests[k])]));
  const changed=DIGEST_FIELDS.filter(k=>!result.digest_comparison[k]);
  if(changed.length){result.changed_digests=changed;throw Error('POST_ROLLBACK_DIGEST_DRIFT');}
  await repo.targetIdentity(o.target==='Production'?'postgres':'phase48_production');await repo.actor();
  await repo.verify(snapshot);
  const plan=await repo.plan(),locks=await repo.activity(),finalFlags=await o.observeFlags();flagsGate(finalFlags);
  need(locks.waiting===0&&locks.ddl===0,'POST_ROLLBACK_LOCK_OR_DDL');
  need(minimal.phase48_state==='NO_APLICADA'&&minimal.count===730&&minimal.candidate_count===730&&candidates.length===730,'POST_ROLLBACK_STATE_CHANGED');
  need(plan.every(p=>!p.applied)&&plan[0]?.category_id==='34'&&plan[1]?.category_id===null&&plan[1]?.estado_salarial==='REQUIERE_REVISION_SALARIAL','POST_ROLLBACK_HISTORICAL_STATE_CHANGED');
  need(sha256HexEqual(digest(finalFlags),digest(result.flags)),'POST_ROLLBACK_FLAGS_CHANGED');
  result.health.final=finalFlags;result.september='NOT_APPLICABLE';
  result.post_rollback_verification={status:'OBSERVED',session:result.post_rollback_snapshot,locks,minimal,digests_compared:8};
 }catch(error){
  const e=error as Error;
  result??=emptyReceipt(o);
  Object.assign(result,{status:result.status==='READY_POSTCHECK'?'STOPPED_DRIFT':'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_TRANSPORT_OR_CONFIGURATION_FAILED',stable:false,authorization_status:'REVOCADA',authorization_phrase:null,nonce:null,expires_at:null});
  retainSchemaStop(result,error,'post_rollback');
 }finally{
  if(postBegun&&post)try{await post.client.query('ROLLBACK');post.evidence.rollback_at=new Date().toISOString();result.post_rollback_verification.rollback='CONFIRMED';}catch{result.status='STOPPED_DRIFT';result.reason='POST_ROLLBACK_CONNECTION_LOST';result.authorization_status='REVOCADA';result.post_rollback_verification.rollback='UNCONFIRMED_CONNECTION_CLOSED';}
  if(post)try{await post.close();need(post.isClosed()&&post.stream.destroyed,'READ_SOCKET_CLOSE_UNCONFIRMED');result.post_rollback_verification.connection_closed=true;}catch{result.status='STOPPED_DRIFT';result.reason='POST_ROLLBACK_CLOSE_FAILED';result.authorization_status='REVOCADA';}
  if(principal)try{await principal.close();need(principal.isClosed()&&principal.stream.destroyed,'FIRST_READ_CONNECTION_STILL_OPEN');if(result)result.principal_connection_closed=true;}catch{if(result){result.status='STOPPED';result.reason='PRINCIPAL_CLOSE_FAILED';result.authorization_status='REVOCADA';}}
 }
 if(result.status!=='READY_POSTCHECK')Object.assign(result,{stable:false,authorization_status:'REVOCADA',authorization_phrase:null,nonce:null,expires_at:null});
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
