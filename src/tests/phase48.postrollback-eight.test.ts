import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as contract from '../modules/cobertura/phase48-readonly-contract';
import {parseProductionGrant} from '../modules/cobertura/phase48-production-authorization';

const flags={health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false};
const options={target:'Local',commit:'f'.repeat(40),backupSha:contract.BACKUP_SHA256,certificateSha:contract.CERTIFICATE_SHA256,observeFlags:async()=>({...flags})};
async function exercise(change?:string,fail?:string){
 const traces:any[]=[];const clients:any[]=[];const connections:any[]=[];let repoCalls=0;let firstSnapshot:any;
 const createReadOnlyRepository=(client:any)=>{
  const index=client.index;repoCalls++;
  const altered=(name:string)=>index===1&&change===name;
  const read=async(name:string,value:any)=>{traces[index].reads.push(name);if(!(index===1&&fail==='cached_clone'))traces[index].queryCount++;if(index===1&&fail===name)throw Error('INDUCED_POST_DIGEST_FAILURE');if(name==='snapshot'&&index===1&&fail==='shared_result')return firstSnapshot;const result=structuredClone(value);if(name==='snapshot'&&index===0&&!firstSnapshot)firstSnapshot=result;return result;};
  return {
   session:()=>read('session',{pid:fail==='same_pid'?100:100+index,snapshot:fail==='different_snapshot'&&index===1?'2:2:':'1:1:',virtual_transaction:fail==='same_transaction'?'1/1':'1/'+(index+1),read_only:'on',isolation:'repeatable read',version:'17.11',host:'127.0.0.1',port:55466}),
   safePolicies:()=>read('safePolicies',true),targetIdentity:()=>{if(fail==='schema_identity'||fail==='post_schema_identity'&&index===1)throw Object.assign(Error('READ_SCHEMA_IDENTITY_MISMATCH'),{expected_schema_digest:'a'.repeat(64),observed_schema_digest:'b'.repeat(64),canonicalization_version:'phase48-global-canonical-v1',schema_divergence_phase:'server_identity.public_schema'});return read('targetIdentity',{});},actor:()=>read('actor',true),ssl:()=>read('ssl',true),
   activity:()=>read('activity',{waiting:0,ddl:0}),verify:()=>read('verify',true),
   snapshot:()=>read('snapshot',{schema:[{value:altered('schema_digest')?2:1}],constraints:[],indexes:[],routines:[],triggers:[],sequences:[],data:[{table:'cobertura_asignaciones',count:'730'},...Array.from({length:223},(_,i)=>({table:'t'+i,count:altered('protected_tables_digest')?'2':'1'}))],digest:(altered('source_digest')?'c':'a').repeat(64)}),
   candidates:()=>read('candidates',Array.from({length:730},(_,i)=>({id:i,value:altered('phase48_candidates_digest')?2:1}))),
   plan:()=>read('plan',[{applied:false,category_id:'34',target:{},vinculacion:'1555'},{applied:false,category_id:null,estado_salarial:'REQUIERE_REVISION_SALARIAL',target:{},vinculacion:'249'}]),
   coverage:()=>read('coverage',[]),affected:()=>read('affected',[]),
   minimalState:()=>read('minimalState',{phase48_state:'NO_APLICADA',count:730,candidate_count:730,...Object.fromEntries(['albeny_before_digest','dary_before_digest','periods_4_6_digest'].map(k=>[k,(altered(k)?'c':'a').repeat(64)]))}),
   writeSet:(...args:any[])=>{assert.equal(args.length,4);return read('writeSet',(altered('write_set_before_digest')?'c':'a').repeat(64));}
  };
 };
 const exports:any={};
 const source=ts.transpileModule(readFileSync('src/modules/cobertura/phase48-readonly-preflight.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(source,{exports,Date,Buffer,require:(n:string)=>n==='./phase48-readonly-repository'?{createReadOnlyRepository}:n==='./phase48-readonly-contract'?contract:n==='node:crypto'?require(n):assert.fail(n)});
 const result=await exports.runReadOnlyLifecycle(async()=>{
  if(traces.length===1){assert.equal(traces[0].closed,true);assert.equal(traces[0].queries.at(-1),'ROLLBACK');if(fail==='open')throw Error('SECOND_OPEN_FAILED');}
  const trace={queries:[] as string[],reads:[] as string[],closed:false,queryCount:0};const index=traces.length;traces.push(trace);
  const client={index,query:async(sql:string)=>{trace.queries.push(sql);trace.queryCount++;if(index===1&&fail==='rollback'&&sql==='ROLLBACK')throw Error('ROLLBACK_FAILED');}};clients.push(client);
  const stream={destroyed:false};
  const evidence={connection_instance_id:'connection-'+index,opened_at:new Date().toISOString(),handshake_events:index===1&&fail==='handshake'?0:1,handshake_at:new Date().toISOString(),tls_protocol:'TLSv1.3',tls_cipher:'TLS_AES_256_GCM_SHA384',rollback_at:null,closed_at:null,query_count:0};
  const connection={pool:{},client,stream,tlsSocket:stream,evidence,queryCount:()=>trace.queryCount,isClosed:()=>trace.closed&&stream.destroyed,close:async()=>{if(index===0&&fail==='first_close')throw Error('FIRST_CLOSE_FAILED');trace.closed=true;stream.destroyed=!(index===0&&fail==='still_open');evidence.query_count=trace.queryCount;(evidence as any).closed_at=new Date().toISOString();if(index===1&&fail==='close')throw Error('CLOSE_FAILED');}};
  if(index===1){if(fail==='same_pool')connection.pool=connections[0].pool;if(fail==='same_client')connection.client=clients[0];if(fail==='same_stream')connection.stream=connections[0].stream;if(fail==='same_tls')connection.tlsSocket=connections[0].tlsSocket;}
  connections.push(connection);return connection;
 },options);
 return {result,traces,repoCalls};
}
test('eight independent reads match, two explicit rollbacks, no reused repository/results and no extra files',async()=>{
 const {result:r,traces,repoCalls}=await exercise();
 assert.equal(r.status,'PENDIENTE_DE_AUTORIZACION');assert.equal(r.stable,true);assert.equal(repoCalls,2);
 assert.deepEqual(Object.keys(r.first_digests),[...contract.DIGEST_FIELDS]);assert.deepEqual(r.first_digests,r.post_rollback_digests);
 assert.notEqual(r.first_digests,r.post_rollback_digests);assert.notEqual(r.first_snapshot.pid,r.post_rollback_snapshot.pid);assert.notEqual(r.first_snapshot.virtual_transaction,r.post_rollback_snapshot.virtual_transaction);
 // Equal PostgreSQL snapshot strings do not imply reused snapshots/backends.
 for(const trace of traces){assert.equal(trace.closed,true);assert.equal(trace.queries[0],'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(trace.queries[1],'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(trace.queries.at(-1),'ROLLBACK');}
 for(const method of ['snapshot','candidates','coverage','affected','minimalState','writeSet','plan','verify','activity','session','actor','targetIdentity'])assert.ok(traces[1].reads.includes(method),method);
 assert.equal(Object.values(r.digest_comparison).filter(Boolean).length,8);
 const fields=contract.parseAuthorizationPhrase(r.authorization_phrase);
 for(const [k,v] of Object.entries(contract.HISTORICAL_ASSERTIONS))assert.equal(fields[k],v);
 const grant={authorization:'ACTIVE',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:contract.BACKUP_SHA256,commit:r.commit,runId:r.run_id,projectRef:contract.PROJECT_REF,baseline:'a'.repeat(64),confirmation:'test',authorizationIssuedAt:r.issued_at,authorizationExpiresAt:r.expires_at,syncManualConfirmation:false,certificate_sha256:contract.CERTIFICATE_SHA256,authorizationPhrase:r.authorization_phrase};
 assert.equal(parseProductionGrant(JSON.stringify(grant)).authorizationPhrase,r.authorization_phrase);
});
for(const fail of ['schema_identity','post_schema_identity'])test('schema STOPPED preserves mismatch evidence without nonce: '+fail,async()=>{
 const {result:r,traces}=await exercise(undefined,fail);
 assert.equal(r.status,'STOPPED');assert.equal(r.reason,'READ_SCHEMA_IDENTITY_MISMATCH');assert.equal(r.expected_schema_digest,'a'.repeat(64));assert.equal(r.observed_schema_digest,'b'.repeat(64));assert.equal(r.canonicalization_version,'phase48-global-canonical-v1');assert.equal(r.schema_divergence_phase,'server_identity.public_schema');assert.equal(r.schema_divergence_connection,fail==='schema_identity'?'principal':'post_rollback');assert.equal(r.nonce,null);assert.equal(r.authorization_phrase,null);assert.equal(r.writes_productive,0);assert.ok(traces.every(t=>t.closed&&t.queries.at(-1)==='ROLLBACK'));
});
for(const field of contract.DIGEST_FIELDS)test('individual drift STOPPED_DRIFT: '+field,async()=>{
 const {result:r,traces}=await exercise(field);assert.equal(r.status,'STOPPED_DRIFT');assert.deepEqual(Array.from(r.changed_digests),[field]);assert.equal(r.stable,false);assert.equal(r.authorization_phrase,null);assert.equal(r.nonce,null);assert.equal(r.authorization_status,'REVOCADA');assert.equal(Object.values(r.digest_comparison).filter(Boolean).length,7);assert.equal(traces[1].queries.at(-1),'ROLLBACK');assert.equal(traces[1].closed,true);
});
for(const fail of ['open','snapshot','candidates','coverage','affected','minimalState','writeSet','rollback'])test('posterior failure revokes authorization: '+fail,async()=>{
 const {result:r,traces}=await exercise(undefined,fail);assert.equal(r.status,'STOPPED_DRIFT');assert.equal(r.authorization_phrase,null);assert.equal(r.nonce,null);assert.equal(r.stable,false);assert.equal(r.authorization_status,'REVOCADA');for(const t of traces)assert.equal(t.closed,true);if(traces.length===2)assert.equal(traces[1].queries.at(-1),'ROLLBACK');
});
for(const fail of ['same_pool','same_client','same_stream','same_tls','still_open','same_transaction','handshake','first_close','close','cached_clone','shared_result'])test('connection/session independence and complete release required: '+fail,async()=>{
 const {result:r}=await exercise(undefined,fail);assert.equal(r.status,['first_close','still_open'].includes(fail)?'STOPPED':'STOPPED_DRIFT');assert.equal(r.stable,false);assert.equal(r.nonce,null);assert.equal(r.authorization_phrase,null);assert.equal(r.authorization_status,'REVOCADA');
});
for(const scenario of ['same_pid','different_snapshot'])test('transaction pooler accepts independent sockets: '+scenario,async()=>{
 const {result:r,traces}=await exercise(undefined,scenario);assert.equal(r.status,'PENDIENTE_DE_AUTORIZACION');assert.equal(Object.values(r.digest_comparison).filter(Boolean).length,8);assert.equal(r.independence.independent_handshakes,2);assert.equal(r.independence.first_closed_before_second,true);assert.ok(r.independence.posterior_digest_query_count>=6);assert.ok(traces.every(t=>t.closed));if(scenario==='same_pid')assert.equal(r.first_snapshot.pid,r.post_rollback_snapshot.pid);else assert.notEqual(r.first_snapshot.snapshot,r.post_rollback_snapshot.snapshot);
});
for(const scenario of ['first_close','still_open'])test('Pool A must finish closing before creating Pool B: '+scenario,async()=>{
 const {result:r,traces}=await exercise(undefined,scenario);assert.equal(traces.length,1);assert.equal(r.nonce,null);assert.notEqual(r.status,'PENDIENTE_DE_AUTORIZACION');
});
test('exact ordered fields reject aliases, duplicates, every missing/extra/altered field and prior contract',async()=>{
 const {result:r}=await exercise();const phrase=r.authorization_phrase,fields=contract.parseAuthorizationPhrase(phrase);
 for(const key of contract.AUTHORIZATION_ORDER){
  const token='|'+key+'='+fields[key];assert.throws(()=>contract.parseAuthorizationPhrase(phrase.replace(token,'')));assert.throws(()=>contract.parseAuthorizationPhrase(phrase+token));assert.throws(()=>contract.parseAuthorizationPhrase(phrase.replace(token,token+'x')));
 }
 for(const bad of [phrase.replace('phase48_candidates_digest','phase48_candidate_digest'),phrase.replace('readonly_runner_commit','read_only_commit'),phrase+'|extra=true',phrase.replace('empresa=15|contrato=24','contrato=24|empresa=15'),phrase.replace(r.commit,'dba731471164e5ff3c24ec64d868dbabddd327d8'),phrase.replace(r.commit,'d25043019fca8c5dd6dc8513f67f083a30de5540'),phrase.replace(contract.BACKUP_SHA256,'0'.repeat(64)),phrase.replace(contract.CERTIFICATE_SHA256,'0'.repeat(64))])assert.throws(()=>contract.parseAuthorizationPhrase(bad));
});
