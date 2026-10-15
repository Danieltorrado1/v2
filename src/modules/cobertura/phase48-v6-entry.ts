import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createScopedLocalAuthority,scopedDigest,requireScoped,type ScopedAuthority} from './phase48-scoped-contract';
import {scopedCapture,type ScopedCapture} from './phase48-scoped-repository';
import {publishAtomicReceipt} from './phase48-readonly-receipts';
import {executeV6Atomic,rollbackV6Published,type V6Client,type V6Runtime,type V6Input,type ScopedHooks} from './phase48-v6-atomic';
import {compareV6Capture,v6Digests,v6Flags,parseV6Approval,parseV6Phrase,V6_HASHES,V6_DIGESTS,type V6Flags,type V6Fields,type V6Preflight} from './phase48-v6-contract';
import {v6Hash} from './phase48-v6-evidence';
import {publishV6Receipt,v6ReceiptPath,claimV6Attempt} from './phase48-v6-receipts';
import {createV6WindowAuthority,V6_WINDOW_POLICY_SHA256} from './phase48-v6-window-authority';
import {v6Timed,withV6Timings,type V6Timing} from './phase48-v6-timing';
import {verifyV6Published} from './phase48-v6-atomic';
export interface V6Host {offline():Promise<{release:{readonly_runner_commit:string;mutator_commit:string};evidence:Record<string,string>}>;flags():Promise<V6Flags>;client(role:'writer'|'observer'):V6Client;identity(db:V6Client,readOnly:boolean):Promise<any>;key():Buffer;directory:string;enabled:boolean;now?:()=>number;}
const now=(h:V6Host)=>h.now?.()??Date.now();
function compareFields(f:V6Fields,pre:V6Preflight,sha:string,env:Awaited<ReturnType<V6Host['offline']>>,clock:number){
 requireScoped(pre.kind==='PHASE48_V6_PREFLIGHT'&&pre.status==='VERIFIED'&&pre.authorization==='REVOKED'&&clock>=Date.parse(pre.issued_at)&&clock<Date.parse(pre.expires_at),'V6_FRESH_PREFLIGHT_REQUIRED');
 requireScoped(pre.set.candidate_count===f.candidate_count&&pre.set.candidate_count!==730,'V6_CANDIDATE_COUNT_DRIFT');
 requireScoped(pre.release.readonly_runner_commit===f.readonly_runner_commit&&pre.release.mutator_commit===f.mutator_commit&&env.release.readonly_runner_commit===f.readonly_runner_commit&&env.release.mutator_commit===f.mutator_commit,'V6_COMMIT_MISMATCH');
 for(const k of V6_HASHES)requireScoped(f[k]===(k==='preflight_receipt_sha256'?sha:env.evidence[k]),'V6_EVIDENCE_BINDING:'+k);
 for(const k of V6_DIGESTS)requireScoped(f[k]===pre.digests[k],'V6_PREFLIGHT_DIGEST_BINDING:'+k);
 requireScoped(pre.connections.length===2&&pre.connections.every(c=>c.rollback&&c.closed)&&pre.connections[0].instance!==pre.connections[1].instance,'V6_INDEPENDENT_PREFLIGHT_REQUIRED');v6Flags(pre.flags);
}
async function withRead(h:V6Host,fn:(db:V6Client)=>Promise<ScopedCapture>){const db=h.client('observer');let began=false;const ev:any={instance:randomUUID(),rollback:false,closed:false};try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp');await db.query("SET LOCAL timezone='UTC'");await db.query("SET LOCAL statement_timeout='120s'");ev.identity=await h.identity(db,true);const capture=await fn(db);return {capture,evidence:ev};}finally{try{if(began){await db.query('ROLLBACK');ev.rollback=true;}}finally{await db.end();ev.closed=true;}}}
export async function preflightV6(h:V6Host):Promise<V6Preflight>{
 const off=await h.offline(),flags=await h.flags();v6Flags(flags);const a=await withRead(h,scopedCapture),b=await withRead(h,scopedCapture);requireScoped(scopedDigest(a.capture.set)===scopedDigest(b.capture.set)&&scopedDigest(v6Digests(a.capture))===scopedDigest(v6Digests(b.capture)),'V6_INDEPENDENT_READ_DRIFT');v6Flags(await h.flags());
 const c=a.capture,t=now(h);requireScoped(c.set.candidate_count!==730,'V6_LEGACY_POPULATION_REJECTED');
 return {run_id:'phase48-'+randomUUID(),kind:'PHASE48_V6_PREFLIGHT',status:'VERIFIED',issued_at:new Date(t).toISOString(),expires_at:new Date(t+900000).toISOString(),release:off.release,evidence:off.evidence,set:c.set,digests:v6Digests(c),manifest:c.manifest,preview:c.salary_preview,operational_preview:c.operational,historical_preview:c.plan.map(({target,...p})=>p),informational:{global_digest:c.informational_global_digest,excluded_digest:c.informational_excluded_digest},connections:[a.evidence,b.evidence],flags,authorization:'REVOKED'};
}
export function publishV6Preflight(h:V6Host,p:V6Preflight){return publishV6Receipt(h.directory,p.run_id,'preflight',p).path;}
export function revokeV6Nonce(h:V6Host,f:V6Fields,reason='REVOKED'){const name='phase48-consumed-'+String(f.nonce)+'.json';if(!existsSync(join(h.directory,name)))publishAtomicReceipt(h.directory,name,{run_id:String(f.run_id),status:'REVOKED',reason,nonce:f.nonce});}
export function publishV6Pending(h:V6Host,request:any,preflight:{path:string;sha256:string}){
 requireScoped(request.authorization==='REVOKED'&&request.status==='PENDIENTE_DE_AUTORIZACION','V6_PENDING_REQUEST_REQUIRED');
 return publishV6Receipt(h.directory,request.run_id,'pending',{...request,authorization:'PENDING_USER_CONFIRMATION'},[preflight]);
}
export async function mutateV6(h:V6Host,approvalRaw:string,hooks?:ScopedHooks){
 const timings:V6Timing[]=[];
 return withV6Timings(timings,async()=>{
 requireScoped(h.enabled===true,'V6_MUTATION_ENV_REQUIRED');
 const parsed=await v6Timed('authorization_read',async()=>parseV6Approval(approvalRaw,now(h),false)),f=parsed.fields,approval=parsed.approval;
 const off=await v6Timed('offline',()=>h.offline());
 const bytes=readFileSync(approval.preflight_path),sha=v6Hash(bytes);
 requireScoped(sha===approval.preflight_sha256,'V6_PREFLIGHT_HASH_MISMATCH');const pre=JSON.parse(bytes.toString('utf8')) as V6Preflight;
 requireScoped(pre.release.readonly_runner_commit===off.release.readonly_runner_commit&&pre.release.mutator_commit===off.release.mutator_commit,'V6_COMMIT_MISMATCH');
 const run=String(f.run_id),phraseHash=v6Hash(approval.phrase),authority=createV6WindowAuthority(()=>now(h),h.key());
 const marker=join(h.directory,'phase48-consumed-'+f.nonce+'.json');
 const sealPath=v6ReceiptPath(h.directory,run,'seal');
 if(existsSync(marker)||existsSync(join(h.directory,'phase48-consumed-'+f.nonce+'.claim'))){
  // Restart recovery is read-only. Consumed attempts can never acquire a new seal.
  requireScoped(existsSync(sealPath),'V6_NONCE_REVOKED_OR_REUSED');
  const saved=JSON.parse(readFileSync(sealPath,'utf8'));authority.authenticate(saved.seal);
  requireScoped(saved.phrase_sha256===phraseHash&&saved.preflight_sha256===sha,'V6_RUN_BINDING_MISMATCH');
  authority.verifyWitness(saved.seal,{phrase_sha256:phraseHash,preflight_sha256:sha},saved.witness_mac);
  const db=h.client('observer');let began=false;
  try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp');await db.query("SET LOCAL timezone='UTC'");await h.identity(db,false);
   requireScoped(await verifyV6Published(db,authority,saved.seal),'V6_CONSUMED_ATTEMPT_NOT_COMMITTED');
  }finally{try{if(began)await db.query('ROLLBACK');}finally{await db.end();}}
  const commitPath=v6ReceiptPath(h.directory,run,'committed');
  if(existsSync(commitPath)){
   const prior=JSON.parse(readFileSync(commitPath,'utf8'));
   requireScoped(prior.run_id===run&&prior.receipt_type==='committed'&&prior.committed===true&&prior.phrase_sha256===phraseHash&&scopedDigest(prior.seal)===scopedDigest(saved.seal)&&prior.parents?.some((p:any)=>p.path===sealPath&&p.sha256===v6Hash(readFileSync(sealPath))),'V6_COMMITTED_RECEIPT_BINDING_MISMATCH');
   const postPath=v6ReceiptPath(h.directory,run,'postflight');if(existsSync(postPath)){const post=JSON.parse(readFileSync(postPath,'utf8'));requireScoped(post.parents?.some((p:any)=>p.path===commitPath&&p.sha256===v6Hash(readFileSync(commitPath))),'V6_COMMITTED_RECEIPT_HASH_DRIFT');}
  }
  const commit=existsSync(commitPath)?{path:commitPath,sha256:v6Hash(readFileSync(commitPath))}:publishV6Receipt(h.directory,run,'committed',{status:'V6_COMMITTED_RECOVERED',seal:saved.seal,phrase_sha256:phraseHash,committed:true},[{path:sealPath,sha256:v6Hash(readFileSync(sealPath))}]);
  const idempotency=publishV6Receipt(h.directory,run,'idempotency',{status:'ALREADY_APPLIED',writes:0,timings},[commit]);
  return {run_id:run,status:'ALREADY_APPLIED',committed:true,result:{writes:0},publication:idempotency};
 }
 parseV6Phrase(approval.phrase,now(h));compareFields(f,pre,sha,off,now(h));v6Flags(await h.flags());
 claimV6Attempt(h.directory,run,String(f.nonce));
 const parents=[{path:approval.preflight_path,sha256:sha}];
 const pendingPath=v6ReceiptPath(h.directory,run,'pending');if(existsSync(pendingPath)){
  const pending=JSON.parse(readFileSync(pendingPath,'utf8'));requireScoped(pending.phrase===approval.phrase&&pending.authorization==='PENDING_USER_CONFIRMATION','V6_PENDING_BINDING_MISMATCH');parents.push({path:pendingPath,sha256:v6Hash(readFileSync(pendingPath))});
 }
 const started=publishV6Receipt(h.directory,run,'started',{status:'ATTEMPT_STARTED',authorization_digest:scopedDigest(f),phrase_sha256:phraseHash,preflight_sha256:sha,issued_at:new Date(now(h)).toISOString(),window_policy_sha256:V6_WINDOW_POLICY_SHA256},parents);
 // Consume authorization at the first attempt; never restore it after a crash.
 publishAtomicReceipt(h.directory,'phase48-consumed-'+f.nonce+'.json',{run_id:run,status:'CONSUMED',nonce:f.nonce,phrase_sha256:phraseHash,started},{exclusive:true});
 let sealPublication:ReturnType<typeof publishV6Receipt>|undefined,input:V6Input={...pre,economic_authorization:false};
 const runtime:V6Runtime={client:r=>h.client(r),identity:db=>h.identity(db,false),validateCapture:async c=>{compareFields(f,pre,sha,off,now(h));compareV6Capture(f,c);},beforeCommit:async()=>{requireScoped(input.seal,'V6_INTERNAL_SEAL_REQUIRED');authority.assertLive(input.seal);v6Flags(await h.flags());},
  issueLocked:async(c,db)=>{
   parseV6Phrase(approval.phrase,now(h));compareFields(f,pre,sha,off,now(h));compareV6Capture(f,c);v6Flags(await h.flags());
   const tx=(await db.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text transaction_id,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='virtualxid') virtual_transaction,current_setting('transaction_isolation') isolation")).rows[0];
   requireScoped(tx.isolation==='serializable'&&tx.transaction_id,'V6_SERIALIZABLE_AUTHORITY_REQUIRED');
   const activity=(await db.query("SELECT (SELECT count(*)::int FROM pg_locks WHERE NOT granted) locks_waiting,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|GRANT|REVOKE)\\s') ddl_active")).rows[0];
   requireScoped(activity.locks_waiting===0&&activity.ddl_active===0,'V6_ACTIVITY_UNSAFE_BEFORE_AUTHORITY');
   const locks=(await db.query("SELECT locktype,relation::text,mode,granted,classid::text,objid::text FROM pg_locks WHERE pid=pg_backend_pid() AND granted ORDER BY locktype,relation,mode")).rows;
   requireScoped(locks.some(l=>l.locktype==='advisory'&&l.classid==='15'&&l.objid==='2449'),'V6_ADVISORY_LOCK_REQUIRED');
   const required=(await db.query("SELECT c.oid::text oid,c.relname name,c.relkind kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname",[[...c.manifest.tables,...c.manifest.sequences]])).rows;
   requireScoped(required.length===c.manifest.tables.length+c.manifest.sequences.length&&required.every(r=>locks.some(l=>l.relation===r.oid&&['ShareRowExclusiveLock','AccessExclusiveLock'].includes(l.mode))),'V6_ALL_SCOPE_LOCKS_REQUIRED');
   await db.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
   await db.query("SET LOCAL statement_timeout='5s'");
   const digests=v6Digests(c);parseV6Phrase(approval.phrase,now(h));
   const seal=authority.issueBound(c.set,run,{readonly_runner_commit:off.release.readonly_runner_commit,mutator_commit:off.release.mutator_commit},{authorization_digest:scopedDigest(f),phrase_sha256:phraseHash,preflight_sha256:sha,digests,pid:tx.pid,transaction_id:tx.transaction_id,virtual_transaction:tx.virtual_transaction,locks_digest:scopedDigest(locks),required_locks:required,write_set_digest:c.set.write_set_before_digest,sequence_locks:c.sequences});
   sealPublication=publishV6Receipt(h.directory,run,'seal',{status:'INTERNAL_SEAL_CREATED',seal,phrase_sha256:phraseHash,preflight_sha256:sha,witness_mac:authority.signWitness(seal,{phrase_sha256:phraseHash,preflight_sha256:sha})},[started]);
   await hooks?.checkpoint?.('INTERNAL_SEAL_CREATED',db);authority.assertLive(seal);return seal;
  }};
 try{
  const result=await executeV6Atomic(authority,input,runtime,{mode:'Commit',definitions_window_confirmed:approval.definitions_window_confirmed,hooks});
  requireScoped(input.seal&&sealPublication,'V6_INTERNAL_SEAL_REQUIRED');
  const receipt={run_id:run,status:'V6_COMMITTED',authorization_digest:scopedDigest(f),phrase_sha256:phraseHash,preflight_sha256:sha,seal:input.seal,economic_authorization:false,result,committed:true,timings};
  let committed;try{committed=await v6Timed('receipt_publication',async()=>publishV6Receipt(h.directory,run,'committed',receipt,[sealPublication!]));}catch(e){throw Object.assign(Error('COMMITTED_REQUIRES_RECOVERY'),{committed:true,cause:e});}
  const postflight=publishV6Receipt(h.directory,run,'postflight',{status:'VERIFIED',external_validation:result.status,timings,sequence_locks:(input.seal as any).binding.sequence_locks,sequence_postchecks:'sequence_postchecks' in result?result.sequence_postchecks:[]},[committed]);
  return {...receipt,publication:committed,postflight};
 }catch(e){const error=e as any;
  // COMMIT acknowledgement loss is not evidence of rollback. Never reverse it automatically.
  if(!error.committed&&!error.commit_unknown){const stopped=publishV6Receipt(h.directory,run,'stopped',{status:'STOPPED_NO_COMMIT',reason:/^[A-Z0-9_:.]+$/.test(error.message)?error.message:'CONTROL_FAILED',nonce:'CONSUMED',rollback_confirmed:error.rollback_confirmed===true,connections_closed:error.connections_closed===true,timings},[started]);if(error.rollback_confirmed&&error.connections_closed)publishV6Receipt(h.directory,run,'rolledback',{status:'ROLLED_BACK',timings},[stopped]);}
  throw e;
 }
 });
}
export const V6_REVERSAL_ORDER=['contract_version','action','run_id','publication_receipt_sha256','readonly_runner_commit','mutator_commit','nonce','issued_at','expires_at','preserve_audits','no_sequence_rewind'] as const;
export function parseV6Reversal(raw:string,clock=Date.now()){let a:any;try{a=JSON.parse(raw);}catch{throw Error('V6_REVERSAL_JSON_INVALID');}requireScoped(a&&Object.keys(a).join('|')==='authorization|phrase|definitions_window_confirmed|sync_manual_confirmation'&&JSON.stringify(a)===raw&&a.authorization==='ACTIVE'&&a.definitions_window_confirmed===true&&a.sync_manual_confirmation===false,'V6_REVERSAL_APPROVAL_REQUIRED');const parts=String(a.phrase).split('|');requireScoped(parts.shift()==='ROLLBACK_PHASE48_SCOPED_V6'&&parts.length===V6_REVERSAL_ORDER.length,'V6_REVERSAL_PHRASE_INVALID');const f:Record<string,string>={};V6_REVERSAL_ORDER.forEach((k,i)=>{const part=parts[i]!;requireScoped(part.startsWith(k+'=')&&!part.slice(k.length+1).includes('='),'V6_REVERSAL_PHRASE_INVALID');f[k]=part.slice(k.length+1);});requireScoped(f.contract_version==='phase48-scoped-v6-window-1'&&f.action==='RollbackPublished'&&f.preserve_audits==='true'&&f.no_sequence_rewind==='true'&&/^[a-f0-9]{64}$/.test(f.nonce??'')&&/^[a-f0-9]{64}$/.test(f.publication_receipt_sha256??'')&&/^phase48-[a-f0-9-]{36}$/.test(f.run_id??''),'V6_REVERSAL_SCOPE_INVALID');const i=Date.parse(f.issued_at!),e=Date.parse(f.expires_at!);requireScoped(i<=clock&&e>clock&&e>i&&e-i<=900000&&new Date(i).toISOString()===f.issued_at&&new Date(e).toISOString()===f.expires_at,'V6_REVERSAL_EXPIRED');return f;}
export async function reverseV6(h:V6Host,raw:string){
 requireScoped(h.enabled,'V6_MUTATION_ENV_REQUIRED');const f=parseV6Reversal(raw,now(h)),off=await h.offline();
 requireScoped(off.release.readonly_runner_commit===f.readonly_runner_commit&&off.release.mutator_commit===f.mutator_commit,'V6_REVERSAL_COMMIT_MISMATCH');
 const publicationPath=v6ReceiptPath(h.directory,f.run_id!,'committed'),publication=readFileSync(publicationPath);
 requireScoped(v6Hash(publication)===f.publication_receipt_sha256,'V6_REVERSAL_RECEIPT_HASH');
 const pub=JSON.parse(publication.toString('utf8')),authority=createV6WindowAuthority(()=>now(h),h.key());authority.authenticate(pub.seal);v6Flags(await h.flags());
 const name='phase48-consumed-'+f.nonce+'.json';requireScoped(!existsSync(join(h.directory,name)),'V6_REVERSAL_NONCE_REUSED');
 const run='phase48-'+randomUUID();claimV6Attempt(h.directory,run,f.nonce!);
 const started=publishV6Receipt(h.directory,run,'started',{status:'REVERSAL_STARTED',published_run_id:f.run_id,authorization_digest:scopedDigest(f)},[{path:publicationPath,sha256:f.publication_receipt_sha256!}]);
 publishAtomicReceipt(h.directory,name,{run_id:run,status:'REVERSAL_CONSUMED',publication_receipt_sha256:f.publication_receipt_sha256},{exclusive:true});
 let sealPublication:ReturnType<typeof publishV6Receipt>|undefined;
 const runtime:V6Runtime={client:r=>h.client(r),identity:db=>h.identity(db,false),validateCapture:async()=>{throw Error('REVERSAL_USES_PUBLISHED_POSTIMAGES');},beforeCommit:async()=>{v6Flags(await h.flags());},
  issueReversalLocked:async(journal,db)=>{
   parseV6Reversal(raw,now(h));v6Flags(await h.flags());
   const tx=(await db.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text transaction_id,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='virtualxid') virtual_transaction,current_setting('transaction_isolation') isolation")).rows[0];
   requireScoped(tx.isolation==='serializable','V6_SERIALIZABLE_AUTHORITY_REQUIRED');
   const locks=(await db.query("SELECT relation::text,mode,locktype,classid::text,objid::text FROM pg_locks WHERE pid=pg_backend_pid() AND granted ORDER BY relation,mode")).rows;
   const binding=pub.seal.binding;requireScoped(binding.required_locks.every((r:any)=>locks.some(l=>l.relation===r.oid&&['ShareRowExclusiveLock','AccessExclusiveLock'].includes(l.mode)))&&locks.some(l=>l.locktype==='advisory'&&l.classid==='15'&&l.objid==='2449'),'V6_ALL_SCOPE_LOCKS_REQUIRED');
   await db.query("SET LOCAL statement_timeout='5s'");await db.query("SET LOCAL idle_in_transaction_session_timeout='5s'");parseV6Reversal(raw,now(h));
   const internal=authority.issueBound(pub.seal.set,run,off.release,{...binding,authorization_digest:scopedDigest(f),phrase_sha256:v6Hash(raw),pid:tx.pid,transaction_id:tx.transaction_id,virtual_transaction:tx.virtual_transaction,locks_digest:scopedDigest(locks),write_set_digest:journal.payload.coverage_after_digest,sequence_locks:journal.sequence_postchecks});
   sealPublication=publishV6Receipt(h.directory,run,'seal',{status:'REVERSAL_INTERNAL_SEAL',seal:internal},[started]);return internal;
  }};
 try{const result=await rollbackV6Published(authority,pub.seal,runtime,{definitions_window_confirmed:true});
  requireScoped(sealPublication,'V6_REVERSAL_SEAL_REQUIRED');const receipt={run_id:run,status:'V6_REVERSED',published_run_id:f.run_id,result};const publication=publishV6Receipt(h.directory,run,'reversed',receipt,[sealPublication]);return {...receipt,publication};
 }catch(e){const error=e as any;if(!error.committed&&!error.commit_unknown){const stopped=publishV6Receipt(h.directory,run,'stopped',{status:'REVERSAL_STOPPED',rollback_confirmed:error.rollback_confirmed===true},[started]);if(error.rollback_confirmed)publishV6Receipt(h.directory,run,'rolledback',{status:'REVERSAL_ROLLED_BACK'},[stopped]);}throw e;}
}
