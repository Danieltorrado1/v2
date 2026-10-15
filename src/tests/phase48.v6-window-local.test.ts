import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {spawn,spawnSync} from 'node:child_process';
import {setup} from './phase48.v6-production-local.test';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {scopedCapture} from '../modules/cobertura/phase48-scoped-repository';
import {mutateV6,preflightV6,publishV6Preflight,publishV6Pending} from '../modules/cobertura/phase48-v6-entry';
import {V6_RECEIPT_TYPES,publishV6Receipt,v6ReceiptPath} from '../modules/cobertura/phase48-v6-receipts';
import {V6_WINDOW_POLICY} from '../modules/cobertura/phase48-v6-window-authority';
import {v6Hash} from '../modules/cobertura/phase48-v6-evidence';
import {parseV6Phrase,buildV6Phrase,pendingV6Request} from '../modules/cobertura/phase48-v6-contract';
import {executeV6Atomic,publishV6Baseline} from '../modules/cobertura/phase48-v6-atomic';
async function sql(q:string,v?:any[]){const c=localClient();await c.connect();try{return await c.query(q,v);}finally{await c.end();}}
async function capture(){const c=localClient();await c.connect();try{return await scopedCapture(c);}finally{await c.end();}}
test('WINDOW slow validations consume human validity but never internal TTL',async()=>{
 const x=await setup();let offset=0;x.host.now=()=>Date.now()+offset;
 const result=await mutateV6(x.host,x.approval(),{beforeDml:async()=>{assert(!existsSync(v6ReceiptPath(x.host.directory,x.pending.run_id,'seal')));offset=180000;}});
 assert.equal(result.status,'V6_COMMITTED');assert('seal' in result);assert(result.seal.issued_at>=Date.now()+170000);assert.equal(result.seal.expires_at-result.seal.issued_at,V6_WINDOW_POLICY.internal_ttl_ms);
 const binding=(result.seal as any).binding;assert.equal(Object.keys(binding.digests).length,17);assert(binding.pid>0&&binding.transaction_id&&binding.locks_digest&&binding.required_locks.length>3);
 assert.equal(result.seal.set.candidate_count,740);
});
for(const stage of ['INTERNAL_SEAL_CREATED','AFTER_PHASE48','BEFORE_COMMIT'])test('WINDOW internal expiry rolls back at '+stage,async()=>{
 const x=await setup(),before=await capture();let offset=0;x.host.now=()=>Date.now()+offset;
 await assert.rejects(mutateV6(x.host,x.approval(),{checkpoint:async(s)=>{if(s===stage)offset=V6_WINDOW_POLICY.internal_ttl_ms+1000;}}),/V6_INTERNAL_SEAL_EXPIRED/);
 assert.deepEqual((await capture()).set,before.set);assert.deepEqual((await capture()).sequences,before.sequences);
 assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);assert(x.closed());
 const stopped=JSON.parse(readFileSync(v6ReceiptPath(x.host.directory,x.pending.run_id,'stopped'),'utf8'));assert.equal(stopped.rollback_confirmed,true);
 await assert.rejects(mutateV6(x.host,x.approval()),/CONSUMED_ATTEMPT_NOT_COMMITTED/);
});
test('WINDOW expired human authorization before authority forbids any schema/DML change',async()=>{
 const x=await setup(),before=await capture();let offset=0;x.host.now=()=>Date.now()+offset;
 await assert.rejects(mutateV6(x.host,x.approval(),{beforeDml:async()=>{offset=1000000;}}),/AUTHORIZATION_EXPIRED/);
 assert(!existsSync(v6ReceiptPath(x.host.directory,x.pending.run_id,'seal')));assert.deepEqual((await capture()).set,before.set);
});
test('WINDOW expiry in an actual internal postcheck rolls back all audits',async()=>{
 const x=await setup(),before=await capture(),base=x.host.client.bind(x.host);let checking=false,offset=0;
 x.host.now=()=>Date.now()+offset;
 x.host.client=role=>{const c=base(role),q=c.query.bind(c);c.query=(async(sql:any,values?:any)=>{const r=await q(sql,values);if(role==='writer'&&checking&&String(sql).startsWith('SELECT id::text id,usuario_id::text actor,datos_anteriores'))offset=V6_WINDOW_POLICY.internal_ttl_ms+1000;return r;}) as any;return c;};
 await assert.rejects(mutateV6(x.host,x.approval(),{checkpoint:async(s)=>{if(s==='BEFORE_COMMIT')checking=true;}}),/INTERNAL_SEAL_EXPIRED/);
 assert.deepEqual((await capture()).set,before.set);assert.equal((await sql('SELECT count(*)::int n FROM auditoria_eventos')).rows[0].n,0);
});
test('WINDOW no DML before internal seal; transaction binding cannot be replayed after rollback',async()=>{
 const x=await setup(),before=await capture();await assert.rejects(mutateV6(x.host,x.approval(),{afterLock:async(db)=>{await db.query("UPDATE cobertura_asignaciones SET observacion='FORBIDDEN' WHERE id=11");}}),/DML_BEFORE_INTERNAL_SEAL/);assert.deepEqual((await capture()).set,before.set);
 const y=await setup();await assert.rejects(mutateV6(y.host,y.approval(),{checkpoint:async(stage,db)=>{if(stage==='BEFORE_PHASE48')await db.query('ROLLBACK');}}),/TRANSACTION_OR_LOCK_BINDING_LOST/);
 assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);
});
test('WINDOW legacy early-seal API and legacy receipt routing are revoked offline',async()=>{
 assert.throws(()=>publishV6Baseline('unused',{} as any),/LEGACY_RECEIPT_ROUTE_REVOKED/);
 let connections=0;const runtime={client:()=>{connections++;throw Error('FORBIDDEN');}} as any;
 await assert.rejects(executeV6Atomic({authenticate:()=>{}} as any,{seal:{}} as any,runtime,{mode:'Commit',definitions_window_confirmed:true}),/LATE_SEAL_REQUIRED/);assert.equal(connections,0);
});
test('WINDOW committed receipt tampering blocks restart without new DML',async()=>{
 const x=await setup(),result=await mutateV6(x.host,x.approval());const file=result.publication.path,body=JSON.parse(readFileSync(file,'utf8'));body.phrase_sha256='0'.repeat(64);writeFileSync(file,JSON.stringify(body));
 await assert.rejects(mutateV6(x.host,x.approval()),/COMMITTED_RECEIPT_BINDING_MISMATCH/);assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);
});
for(const type of V6_RECEIPT_TYPES)test('WINDOW immutable collision for '+type,async()=>{
 const x=await setup(),file=v6ReceiptPath(x.host.directory,x.pending.run_id,type);
 if(!existsSync(file))publishV6Receipt(x.host.directory,x.pending.run_id,type,{status:'SYNTHETIC_REVOKED'});
 const before=readFileSync(file);assert.throws(()=>publishV6Receipt(x.host.directory,x.pending.run_id,type,{status:'SYNTHETIC_REVOKED'}),/DESTINATION_EXISTS/);assert.deepEqual(readFileSync(file),before);
 if(!['pending','preflight'].includes(type)){await assert.rejects(mutateV6(x.host,x.approval()),/DESTINATION_EXISTS/);assert(!existsSync(join(x.host.directory,'phase48-consumed-'+x.pending.fields.nonce+'.json')));}
});
test('WINDOW sequence locks block nextval and setval, preserve cache 1 and 7, rollback metadata',async()=>{
 const x=await setup();await sql('CREATE SEQUENCE public.nomina_periodo_26_25_auditoria_id_seq CACHE 7 OWNED BY public.auditoria.registro_id');
 // A changed dependency requires a new synthetic preflight, so inspect the
 // locking mechanism independently without issuing a mismatched approval.
 const writer=localClient(),other=localClient();await writer.connect();await other.connect();
 const names=['auditoria_id_seq','auditoria_eventos_id_seq','cobertura_asignaciones_id_seq','nomina_periodo_26_25_auditoria_id_seq'];
 try{const old=(await writer.query("SELECT c.relname,s.seqcache::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid WHERE c.relname=ANY($1::text[]) ORDER BY c.relname",[names])).rows;
  await writer.query('BEGIN');await other.query("SET lock_timeout='50ms'");
  for(const row of old)await writer.query('ALTER SEQUENCE public."'+row.relname+'" CACHE '+row.seqcache);
  const locks=(await writer.query("SELECT c.relname,l.mode FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE l.pid=pg_backend_pid() AND c.relname=ANY($1::text[]) AND l.granted ORDER BY c.relname,l.mode",[names])).rows;
  assert.equal(locks.filter(r=>r.mode==='ShareRowExclusiveLock').length,4);
  for(const name of names){await assert.rejects(other.query("SELECT nextval('public."+name+"')"),(e:any)=>e.code==='55P03');await assert.rejects(other.query("SELECT setval('public."+name+"',999)"),(e:any)=>e.code==='55P03');}
  await writer.query('ALTER SEQUENCE public.auditoria_id_seq CACHE 9');assert.equal((await writer.query("SELECT seqcache::text FROM pg_sequence WHERE seqrelid='public.auditoria_id_seq'::regclass")).rows[0].seqcache,'9');
  await writer.query('ROLLBACK');assert.deepEqual((await writer.query("SELECT c.relname,s.seqcache::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid WHERE c.relname=ANY($1::text[]) ORDER BY c.relname",[names])).rows,old);
  await writer.query('BEGIN');await assert.rejects(writer.query('LOCK TABLE public.auditoria_id_seq IN SHARE ROW EXCLUSIVE MODE'),(e:any)=>e.code==='42809');await writer.query('ROLLBACK');
  writeFileSync('tmp/phase48-v6-window-local/sequence-lock-audit-'+randomUUID()+'.json',JSON.stringify({old,locks,blocked_nextval:true,blocked_setval:true,lock_table_sequence_rejected:true,cache_rollback_verified:true},null,2),{flag:'wx'});
 }finally{await writer.end();await other.end();}
});
test('WINDOW full atomic operation with all four sequence locks and linked postflight',async()=>{
 const x=await setup();await sql('CREATE SEQUENCE public.nomina_periodo_26_25_auditoria_id_seq CACHE 1 OWNED BY public.auditoria.registro_id');
 const pre=await preflightV6(x.host),file=publishV6Preflight(x.host,pre),sha=v6Hash(readFileSync(file));
 const pending=pendingV6Request(pre,sha,'phase48-'+randomUUID(),Date.now(),900000);publishV6Pending(x.host,pending,{path:file,sha256:sha});
 const raw=JSON.stringify({authorization:'ACTIVE',phrase:pending.phrase,preflight_path:file,preflight_sha256:sha,definitions_window_confirmed:true,sync_manual_confirmation:false});
 const result=await mutateV6(x.host,raw);assert('seal' in result&&'postflight' in result);assert.equal((result.seal as any).binding.sequence_locks.length,4);
 const post=JSON.parse(readFileSync(result.postflight.path,'utf8'));assert.equal(post.sequence_postchecks.length,4);assert(post.sequence_postchecks.every((s:any)=>s.metadata.cache==='1'));
 writeFileSync('tmp/phase48-v6-window-local/four-sequence-full-'+randomUUID()+'.json',JSON.stringify({status:result.status,committed:result.publication,postflight:result.postflight,timings:post.timings},null,2),{flag:'wx'});
});
test('WINDOW prior production receipts byte-exact, old contract rejected, consumed nonce preserved',()=>{
 const manifest=JSON.parse(readFileSync('reports/phase48-v6-execution-window/preserved-evidence.json','utf8'));
 for(const item of manifest.files){const b=readFileSync(item.path);assert.equal(b.length,item.bytes);assert.equal(v6Hash(b),item.sha256);}
 const old=JSON.parse(readFileSync('tmp/phase48-pooler-local/final-readonly-receipts/phase48-d4cab040-3bdd-467b-a683-e03621fba6a3.receipt.json','utf8'));
 assert(Date.now()>Date.parse(old.expires_at));assert.throws(()=>parseV6Phrase(old.pending_request.phrase),/SCOPE_REQUIRED|PRIOR_COMMIT_REVOKED/);
 assert.equal(JSON.parse(readFileSync(manifest.files[2].path,'utf8')).status,'CONSUMED');
});
for(const stage of ['OFFLINE','CONNECTED','SERIALIZABLE','ADVISORY','TABLE_LOCKS','SEQUENCE_LOCKS','INTERNAL_SEAL_CREATED','BEFORE_PHASE48','AFTER_PHASE48','AFTER_ALBENY','AFTER_DARY','BEFORE_CLOSE1203','AFTER_CLOSE1203','AUDIT_PHASE48','AUDIT_ALBENY','AUDIT_DARY','AUDIT_CLOSE1203','BEFORE_COMMIT','COMMITTED'])test('WINDOW process death and restart at '+stage,async()=>{
 const x=await setup(),before=await capture(),approvalFile=join(x.host.directory,'synthetic-approval.json');writeFileSync(approvalFile,x.approval(),{flag:'wx'});
 const child=spawnSync(process.execPath,['--require','./src/scripts/phase48-dynamic-local-guard.cjs','--import','tsx','src/scripts/phase48-v6-window-local-crash.ts',x.host.directory,approvalFile,stage],{env:process.env,windowsHide:true,encoding:'utf8',timeout:30000});
 assert.equal(child.status,77,child.stdout+child.stderr);
 if(stage==='COMMITTED'){
  const result=await mutateV6(x.host,x.approval());assert.equal(result.status,'ALREADY_APPLIED');assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);
 }else{
  const after=await capture();assert.deepEqual(after.set,before.set);assert.deepEqual(after.sequences,before.sequences);
  if(stage!=='OFFLINE')await assert.rejects(mutateV6(x.host,x.approval()),/NONCE_REVOKED_OR_REUSED|CONSUMED_ATTEMPT_NOT_COMMITTED/);
 }
});
test('WINDOW two publishers race without replacing final evidence',async()=>{
 const dir=resolve('tmp/phase48-v6-local/receipts/'+randomUUID()),run='phase48-'+randomUUID();mkdirSync(dir,{recursive:true});
 const child=()=>new Promise<number|null>((done,reject)=>{const p=spawn(process.execPath,['--require','./src/scripts/phase48-dynamic-local-guard.cjs','--import','tsx','src/scripts/phase48-v6-window-local-publish.ts',dir,run],{env:process.env,windowsHide:true,stdio:'pipe'});p.on('error',reject);p.on('exit',done);});
 const results=await Promise.all([child(),child()]);assert.deepEqual(results.sort(),[0,5]);assert.equal(JSON.parse(readFileSync(v6ReceiptPath(dir,run,'pending'),'utf8')).status,'REVOKED_SYNTHETIC');
 assert(!readdirSync(dir).some(f=>f.endsWith('.tmp')));
});
for(const type of ['started','seal','committed','postflight','idempotency'])for(const boundary of ['BEFORE','AFTER'])test('WINDOW process death in immutable publication '+boundary+' '+type,async()=>{
 const x=await setup(),before=await capture(),approvalFile=join(x.host.directory,'synthetic-approval.json');writeFileSync(approvalFile,x.approval(),{flag:'wx'});
 const child=spawnSync(process.execPath,['--require','./src/scripts/phase48-dynamic-local-guard.cjs','--import','tsx','src/scripts/phase48-v6-window-local-crash.ts',x.host.directory,approvalFile,'PUBLISH_'+boundary+'_'+type],{env:process.env,windowsHide:true,encoding:'utf8',timeout:30000});assert.equal(child.status,77,child.stdout+child.stderr);
 const auditCount=(await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n;
 if(['started','seal'].includes(type)){assert.deepEqual((await capture()).set,before.set);assert.equal(auditCount,0);await assert.rejects(mutateV6(x.host,x.approval()),/NONCE_REVOKED_OR_REUSED|CONSUMED_ATTEMPT_NOT_COMMITTED/);}
 else{assert.equal(auditCount,4);if((type==='committed'&&boundary==='BEFORE')||type==='idempotency')await assert.rejects(mutateV6(x.host,x.approval()),/EEXIST|DESTINATION_EXISTS/);else assert.equal((await mutateV6(x.host,x.approval())).status,'ALREADY_APPLIED');assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);}
});
test('WINDOW real 121s slow gate precedes seal creation and successful COMMIT',async()=>{
 const x=await setup(),start=Date.now();const result=await mutateV6(x.host,x.approval(),{beforeDml:async()=>{await new Promise(r=>setTimeout(r,121000));}});
 assert('seal' in result&&'postflight' in result);assert(result.seal.issued_at-start>=121000);assert.equal(result.seal.expires_at-result.seal.issued_at,V6_WINDOW_POLICY.internal_ttl_ms);assert.equal(result.status,'V6_COMMITTED');
 writeFileSync('tmp/phase48-v6-window-local/real-slow-gate-'+randomUUID()+'.json',JSON.stringify({elapsed_ms:Date.now()-start,seal_created_after_ms:result.seal.issued_at-start,ttl_ms:V6_WINDOW_POLICY.internal_ttl_ms,postflight:result.postflight},null,2),{flag:'wx'});
});
test('WINDOW measured complete execution profiles 0ms, 25ms, 100ms roundtrip latency',async()=>{
 const samples=[];
 for(const delay of [0,25,100]){
  const x=await setup(),base=x.host.client.bind(x.host);let sealed=false;
  x.host.client=role=>{const c=base(role),q=c.query.bind(c);c.query=(async(...args:any[])=>{if(sealed&&delay)await new Promise(r=>setTimeout(r,delay));return (q as any)(...args);}) as any;return c;};
  const start=performance.now();const result=await mutateV6(x.host,x.approval(),{checkpoint:async(stage)=>{if(stage==='INTERNAL_SEAL_CREATED')sealed=true;}});
  assert('postflight' in result);const post=JSON.parse(readFileSync(result.postflight.path,'utf8')),timings=post.timings;const seal=timings.find((r:any)=>r.phase==='internal_seal_creation'),commit=timings.find((r:any)=>r.phase==='commit');
  const internal_ms=commit.started_ms+commit.duration_ms-seal.started_ms;
  samples.push({delay_ms:delay,total_ms:performance.now()-start,internal_ms,sealed_query_count:(result.result as any).sealed_query_count,timings});assert.equal(result.status,'V6_COMMITTED');
 }
 const max=Math.max(...samples.map(s=>s.internal_ms)),ttl=Math.ceil((max*V6_WINDOW_POLICY.safety_factor+V6_WINDOW_POLICY.fixed_margin_ms)/V6_WINDOW_POLICY.round_up_ms)*V6_WINDOW_POLICY.round_up_ms;
 assert(ttl<=V6_WINDOW_POLICY.maximum_ttl_ms,'Measured execution cannot be bounded under cap');
 const file='tmp/phase48-v6-window-local/window-measurement-'+randomUUID()+'.json';writeFileSync(file,JSON.stringify({samples,recommended_ttl_ms:ttl,formula:'ceil((max*3+2000)/5000)*5000',maximum_ms:V6_WINDOW_POLICY.maximum_ttl_ms},null,2),{flag:'wx'});
 console.log('WINDOW_MEASUREMENT='+file+' TTL='+ttl);
});
