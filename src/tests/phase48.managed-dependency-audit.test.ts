import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {checkServerIdentity} from 'node:tls';
import {runManagedDependencyAuditEntry} from '../modules/cobertura/phase48-managed-dependency-audit-entry';
import {GRAPH_SERIALIZATION_VERSION,validateGraphInventory,validateGraphEvidence} from '../modules/cobertura/phase48-managed-dependency-graph';
import {sha256HexEqual} from '../modules/cobertura/phase48-sha256';
import {MANAGED_AUDIT_QUERY_MANIFEST,MANAGED_AUDIT_QUERY_MANIFEST_DIGEST,MANAGED_AUDIT_CATALOGS,validateManagedAuditManifest,validateVirtualTransactionSql,validateDependencyGraphBounds,validateManagedRootRows,auditManagedDependencyGraph,type ManagedAuditClient} from '../modules/cobertura/phase48-managed-dependency-audit';

test('sealed manifest is complete, fixed, catalog-only and unique',()=>{
  assert.equal(validateManagedAuditManifest(),true);
  assert.equal(MANAGED_AUDIT_QUERY_MANIFEST.length,5);
  assert.equal(new Set(MANAGED_AUDIT_QUERY_MANIFEST.map(q=>q.query_id)).size,5);
  assert.equal(MANAGED_AUDIT_QUERY_MANIFEST.every(q=>/^[0-9a-f]{64}$/.test(q.sql_sha256)&&q.classification==='READ_ONLY'),true);
  assert.match(MANAGED_AUDIT_QUERY_MANIFEST_DIGEST,/^[0-9a-f]{64}$/);
  assert.ok(MANAGED_AUDIT_CATALOGS.includes('pg_catalog.pg_locks'));
});

test('virtual transaction query is uniquely sealed to own PID and minimal fields',()=>{
  const q=MANAGED_AUDIT_QUERY_MANIFEST.find(x=>x.query_id==='session.virtual_transaction')!;
  assert.equal(validateVirtualTransactionSql(q.sql,q.sql_sha256),true);
  for(const sql of [
    q.sql.replace('pid = pg_backend_pid()','pid > 0'),
    q.sql.replace('pg_backend_pid()','$1'),
    q.sql.replace("locktype = 'virtualxid'","locktype = 'transactionid'"),
    q.sql.replace('count(*)::integer AS match_count','pid'),
    q.sql.replace('min(virtualxid::text) AS virtualxid','min(virtualxid::text) AS virtualxid, max(pid) AS pid'),
    q.sql+' LIMIT 2',
    q.sql+' LIMIT 1',
    q.sql+' OFFSET 0',
    q.sql.replace('count(*)::integer AS match_count,\n       min(virtualxid::text) AS virtualxid','virtualxid'),
    q.sql.replace('pid = pg_backend_pid()','true'),
    q.sql.replace('AND granted = true',''),
    q.sql.replace('AND virtualxid IS NOT NULL',''),
    q.sql.replace("AND locktype = 'virtualxid'",''),
    q.sql.replace('pg_backend_pid()','1234'),
    q.sql.replace("locktype = 'virtualxid'",'locktype = $1'),
    q.sql.replace('virtualxid IS NOT NULL','virtualxid IS NULL'),
    q.sql.replace('pid = pg_backend_pid()','pid <> pg_backend_pid()'),
  ]) {
    assert.throws(()=>validateVirtualTransactionSql(sql),/AUDIT_VIRTUAL_TRANSACTION/);
    // Recomputing the hash cannot authorize a different scope or projection.
    assert.throws(()=>validateVirtualTransactionSql(sql,createHash('sha256').update(sql.replace(/\s+/g,' ').trim()).digest('hex')),/AUDIT_VIRTUAL_TRANSACTION/);
  }
});

test('manifest rejects import/query expansion, hash edits and duplicate ids',()=>{
  const original=[...MANAGED_AUDIT_QUERY_MANIFEST];
  assert.throws(()=>validateManagedAuditManifest([...original,{...original[0]!}]),/AUDIT_QUERY_ID_DUPLICATE/);
  assert.throws(()=>validateManagedAuditManifest(original.map((q,i)=>i===0?{...q,sql:q.sql+' SELECT 2'}:q)),/AUDIT_QUERY_HASH_MISMATCH/);
  assert.throws(()=>validateManagedAuditManifest(original.map((q,i)=>i===0?{...q,sql_sha256:'0'.repeat(64)}:q)),/AUDIT_QUERY_HASH_MISMATCH/);
  assert.throws(()=>validateManagedAuditManifest(original.map((q,i)=>i===2?{...q,sql:q.sql.replace('pg_catalog.pg_proc','public.business_table'),sql_sha256:q.sql_sha256}:q)),/AUDIT_QUERY_HASH_MISMATCH/);
  const publicSql=original[0]!.sql+' JOIN public.business_table b ON true';
  const altered=original.map((q,i)=>i===0?{...q,sql:publicSql,sql_sha256:createHash('sha256').update(publicSql.replace(/\s+/g,' ').trim()).digest('hex')}:q);
  assert.throws(()=>validateManagedAuditManifest(altered),/AUDIT_RELATION_NOT_ALLOWLISTED/);
  const source=readFileSync('src/modules/cobertura/phase48-managed-dependency-audit.ts','utf8');
  const entry=readFileSync('src/modules/cobertura/phase48-managed-dependency-audit-entry.ts','utf8');
  for(const file of [source,entry]){
    const imports=[...file.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(m=>m[1]!);
    assert.equal(imports.some(x=>/scoped|repository|production-executor|v6-atomic|v6-entry|mutator|albeny|dary|1203/i.test(x)),false,JSON.stringify(imports));
  }
});

test('structural gate rejects DDL, DML, nextval, volatile functions and multi-statement SQL',()=>{
  const original=[...MANAGED_AUDIT_QUERY_MANIFEST],q=original[0]!;
  for(const [index,addition] of ['; SELECT 1','; DROP TABLE pg_catalog.pg_class',' INSERT INTO public.t VALUES(1)',' SELECT nextval(\'s\')',' SELECT setval(\'s\',1)',' SELECT pg_catalog.pg_sleep(1)',' SELECT * INTO public.t FROM pg_catalog.pg_class'].entries()){
    const sql=q.sql+addition,hash=createHash('sha256').update(sql.replace(/\s+/g,' ').trim()).digest('hex');
    assert.throws(()=>validateManagedAuditManifest(original.map((v,i)=>i===0?{...v,sql,sql_sha256:hash}:v)),/AUDIT_SQL_OPERATION_FORBIDDEN|AUDIT_SQL_FUNCTION_FORBIDDEN/,`negative case ${index}`);
  }
  const locks=original.findIndex(v=>v.query_id==='session.virtual_transaction');
  assert.throws(()=>validateManagedAuditManifest(original.map((v,i)=>i===locks?{...v,query_id:'other.query'}:v)),/AUDIT_PG_LOCKS_QUERY_ID_FORBIDDEN/);
});

test('graph traversal accepts and reports cycles while enforcing depth and cardinality bounds',()=>{
  const cycle=[{class_oid:'1259',object_oid:'1',depth:0,cycle:false},{class_oid:'1259',object_oid:'2',depth:1,cycle:false},{class_oid:'1259',object_oid:'1',depth:2,cycle:true}];
  const measured=validateDependencyGraphBounds(cycle);assert.equal(measured.node_count,2);assert.equal(measured.cycles,1);
  assert.throws(()=>validateDependencyGraphBounds(Array.from({length:513},(_,i)=>({class_oid:'1259',object_oid:String(i),depth:1}))),/AUDIT_EDGE_LIMIT_EXCEEDED/);
  assert.throws(()=>validateDependencyGraphBounds([{class_oid:'1259',object_oid:'1',depth:13}]),/AUDIT_DEPTH_LIMIT_EXCEEDED/);
  assert.throws(()=>validateDependencyGraphBounds(Array.from({length:257},(_,i)=>({class_oid:'1259',object_oid:String(i),depth:1}))),/AUDIT_NODE_LIMIT_EXCEEDED/);
});

test('missing or duplicated roots are rejected',()=>{
  const rows=[{function_schema:'extensions',function_name:'pgrst_ddl_watch'},{function_schema:'extensions',function_name:'pgrst_drop_watch'}];
  assert.equal(validateManagedRootRows(rows),true);
  assert.throws(()=>validateManagedRootRows(rows.slice(1)),/AUDIT_ROOT_MISSING_OR_DUPLICATED/);
  assert.throws(()=>validateManagedRootRows([...rows,rows[0]!]),/AUDIT_ROOT_MISSING_OR_DUPLICATED/);
});

test('aggregate fixtures reject count 0 or >1, multiple rows, extra columns and invalid virtualxid',async()=>{
  const meta={server_version:'PostgreSQL 17.11',backend_pid:41,snapshot:'1:1:',read_only:'on',isolation:'repeatable read'};
  const badRows=[[],[{match_count:0,virtualxid:null}],[{match_count:2,virtualxid:'1/2'}],[{match_count:1,virtualxid:null}],[{match_count:1,virtualxid:'invalid'}],[{match_count:'1',virtualxid:'1/2'}],[{match_count:1,virtualxid:'1/2',pid:42}],[{match_count:1,virtualxid:'1/2'},{match_count:1,virtualxid:'1/3'}]];
  for(const rows of badRows){
    const calls:string[]=[];const fake:ManagedAuditClient={async connect(){calls.push('connect');},async query(sql){calls.push(sql);if(sql.includes('AS server_version'))return {rows:[meta],rowCount:1};if(sql.includes('FROM pg_catalog.pg_locks'))return {rows,rowCount:rows.length};if(sql==='ROLLBACK')return {rows:[],rowCount:0};if(sql==='BEGIN'||sql.startsWith('SET TRANSACTION'))return {rows:[],rowCount:0};throw Error('query should stop before roots');},async end(){calls.push('end');}};
    await assert.rejects(auditManagedDependencyGraph(fake,{alreadyConnected:true}),(error:any)=>error.message==='MANAGED_AUDIT_OPERATION_FAILED'&&error.query_id==='session.virtual_transaction'&&/AUDIT_(?:QUERY_CARDINALITY_EXCEEDED|VIRTUAL_TRANSACTION)/.test(error.cause.message));
    assert.equal(calls.at(-1),'end');assert.equal(calls.includes('ROLLBACK'),true);assert.equal(calls.some(s=>s.includes('pg_event_trigger')),false);
  }
});

test('one aggregate match proceeds without persisting aggregate internals',async()=>{
  const calls:string[]=[];
  const fake:ManagedAuditClient={async connect(){},async end(){calls.push('end');},async query(sql,values){
    calls.push(sql);
    if(sql.includes('AS server_version'))return {rows:[{server_version:'PostgreSQL 17.11',backend_pid:41,snapshot:'1:1:',read_only:'on',isolation:'repeatable read'}],rowCount:1};
    if(sql.includes('FROM pg_catalog.pg_locks')){assert.equal(values,undefined);return {rows:[{match_count:1,virtualxid:'1/2'}],rowCount:1};}
    if(sql===MANAGED_AUDIT_QUERY_MANIFEST.find(q=>q.query_id==='roots.managed_event_triggers')!.sql)return {rows:[{function_schema:'extensions',function_name:'pgrst_ddl_watch'},{function_schema:'extensions',function_name:'pgrst_drop_watch'}],rowCount:2};
    return {rows:[],rowCount:0};
  }};
  const result=await auditManagedDependencyGraph(fake);
  assert.equal(result.virtual_transaction,'1/2');assert.equal(JSON.stringify(result).includes('match_count'),false);
  assert.deepEqual(calls.slice(-2),['ROLLBACK','end']);
});

test('real local PG can execute fixed graph audit and closes after explicit rollback', {skip:process.env.PHASE48_MANAGED_AUDIT_LOCAL!=='true'},async()=>{
  const {Client}=await import('pg');
  const port=Number(process.env.PHASE48_MANAGED_AUDIT_PORT),ca=readFileSync(process.env.PHASE48_MANAGED_AUDIT_CA!,'utf8');
  const raw=new Client({host:'127.0.0.1',port,database:'postgres',user:'postgres',ssl:{ca,rejectUnauthorized:true,servername:'localhost',minVersion:'TLSv1.3'},connectionTimeoutMillis:5000});
  let connects=0,ends=0,healthCalls=0,aggregateVerified=false,tlsProtocol='',socket:any;
  const calls:string[]=[];
  const client:ManagedAuditClient={
    async connect(){connects++;await raw.connect();},
    async query(sql,values){
      calls.push(sql);
      const response=await raw.query(sql,values);
      if(sql===MANAGED_AUDIT_QUERY_MANIFEST.find(q=>q.query_id==='session.virtual_transaction')!.sql){
        assert.equal(values,undefined);
        assert.equal(response.rows.length,1);assert.equal(response.rows[0].match_count,1);
        assert.equal(typeof response.rows[0].match_count,'number');
        assert.match(response.rows[0].virtualxid,/^\d+\/\d+$/);
        assert.deepEqual(Object.keys(response.rows[0]).sort(),['match_count','virtualxid']);aggregateVerified=true;
      }
      return {rows:response.rows,rowCount:response.rowCount};
    },
    async end(){ends++;await raw.end();},
  };
  const entry=await runManagedDependencyAuditEntry({
    directory:process.env.PHASE48_MANAGED_AUDIT_RECEIPTS!,
    precheck:async()=>({branch:'fix/phase48-managed-dependency-audit-entry',head:'local-fixture',remote:'local-only',tracked_clean:true,ca_valid:true,destination_valid:true,manifest_valid:validateManagedAuditManifest()}),
    // Local adapter fixture only: no HTTP request or production health adapter.
    health:async()=>{healthCalls++;if(healthCalls===2)assert.equal(ends,1);return {http_status:200,success:true,database_status:'ok',outbox:false,recalc:false,worker_stopped:true};},
    readCredential:async()=>null,
    createClient:()=>client,
    validateTls:async()=>{
      socket=(raw as any).connection.stream;tlsProtocol=socket.getProtocol();
      assert.equal(checkServerIdentity('localhost',socket.getPeerCertificate()),undefined);
      return {protocol:tlsProtocol,encrypted:socket.encrypted,authorized:socket.authorized,rejectUnauthorized:true,ca_pinned:true,hostname_verified:true,servername_matches:socket.servername==='localhost',authorization_error:socket.authorizationError??null};
    },
  });
  assert.equal(entry.receipt.status,'CAPTURED');assert.equal(connects,1);assert.equal(ends,1);assert.equal(healthCalls,2);assert.equal(aggregateVerified,true);
  const durable=readFileSync(entry.path,'utf8');assert.equal(durable.includes('match_count'),false);assert.equal(durable.includes('locktype'),false);
  assert.equal(createHash('sha256').update(durable).digest('hex'),entry.sha256);
  assert.equal(calls[0],'BEGIN');assert.equal(calls[1],'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');assert.equal(calls.length,8);
  assert.equal('nodes' in entry.receipt.graph!,false);assert.equal('edges' in entry.receipt.graph!,false);
  const result=entry.localEvidence!;
  const summary=validateGraphInventory(result,entry.receipt.graph);
  assert.equal(summary.graph_serialization_version,GRAPH_SERIALIZATION_VERSION);
  assert.ok(sha256HexEqual(summary.dependency_nodes_digest,result.dependency_nodes_digest));assert.ok(sha256HexEqual(summary.dependency_edges_digest,result.dependency_edges_digest));
  assert.equal(result.status,'CAPTURED');assert.equal(result.read_only,'on');assert.equal(result.isolation,'repeatable read');assert.equal(result.virtual_transaction!==undefined,true);assert.equal(result.snapshot!==undefined,true);assert.equal(Number(result.node_count)>0,true);assert.equal(result.query_manifest_digest,MANAGED_AUDIT_QUERY_MANIFEST_DIGEST);assert.equal(result.transaction_started,true);assert.equal(result.rollback_confirmed,true);assert.equal(result.client_closed,true);assert.equal((result.query_invocations as any[]).length,5);assert.equal((result.root_events as any[]).length,2);assert.equal((result.root_events as any[]).some(e=>e.event_name==='unrelated_audit_event'),false);
  const funcs=(result.nodes as any[]).filter(node=>node.object_type==='function'&&String(node.structural_identity).includes('extensions.pgrst_'));
  assert.equal(new Set(funcs.map(node=>node.owner_sha256)).size,2,'fixture uses two different function owners');
  assert.equal((result.nodes as any[]).some(node=>node.extension_identity==='plpgsql'),true,'fixture includes managed plpgsql extension dependency');
  const certificatePath=process.env.PHASE48_MANAGED_AUDIT_CERTIFICATE_PATH;
  if(certificatePath){
    const source=readFileSync('src/modules/cobertura/phase48-managed-dependency-audit.ts');
    const cycleFixture=[{class_oid:'pg_proc',object_oid:'1',depth:0,cycle:false},{class_oid:'pg_proc',object_oid:'2',depth:1,cycle:false},{class_oid:'pg_proc',object_oid:'1',depth:2,cycle:true}];
    const certificate={schema_version:1,classification:'LOCAL_FIXTURE_ONLY',created_at_utc:new Date().toISOString(),postgres_version:result.server_version,tls:{protocol:tlsProtocol,encrypted:socket.encrypted===true,authorized:socket.authorized===true,servername:socket.servername},cluster:{host:'127.0.0.1',port:Number(process.env.PHASE48_MANAGED_AUDIT_PORT),data_directory:process.env.PHASE48_MANAGED_AUDIT_DATA_DIRECTORY,postmaster_pid:Number(process.env.PHASE48_MANAGED_AUDIT_POSTMASTER_PID)},connection_count:1,transaction:{backend_pid:result.backend_pid,virtual_transaction:result.virtual_transaction,snapshot:result.snapshot,read_only:result.read_only,isolation:result.isolation},audit:{graph_serialization_version:result.graph_serialization_version,status:result.status,roots:result.roots,root_events:result.root_events,nodes:result.nodes,edges:result.edges,node_count:result.node_count,edge_count:result.edge_count,cycle_count:result.cycle_count,max_depth:result.max_depth,root_digests:result.root_digests,dependency_nodes_digest:result.dependency_nodes_digest,dependency_edges_digest:result.dependency_edges_digest,query_manifest_digest:result.query_manifest_digest,query_manifest:result.query_manifest,query_invocations:result.query_invocations},cycle_detection_fixture:{source:'synthetic catalog-edge unit fixture',cycle_marked:true,rows:cycleFixture.length},rollback_attempted:result.rollback_attempted,rollback_confirmed:result.rollback_confirmed,client_end_attempted:result.client_end_attempted,client_closed:result.client_closed,writes:0,mutator_invoked:false,source_sha256:createHash('sha256').update(source).digest('hex')};
    const certifiedFiles=['src/modules/cobertura/phase48-managed-dependency-graph.ts','src/tests/phase48.managed-dependency-graph.test.ts','src/tests/fixtures/phase48-managed-graph-v1-vectors.json','src/modules/cobertura/phase48-managed-dependency-audit.ts','src/modules/cobertura/phase48-managed-dependency-audit-entry.ts','src/modules/cobertura/phase48-readonly-contract.ts','src/modules/cobertura/phase48-sha256.ts','src/tests/phase48.managed-dependency-audit.test.ts','src/tests/phase48.managed-dependency-audit-entry.test.ts','src/tests/phase48.authorization-tls-contract.test.ts','src/tests/phase48.readonly-runner.test.ts','src/tests/phase48.v6-cli-parser.test.ts','src/tests/fixtures/phase48-v6-cli-git-fixture.ts','tmp/certify-phase48-managed-audit-local.ps1'];
    const replacement={...certificate,schema_version:4,...summary,supersedes:'phase48-managed-dependency-audit-local-bf984c52971e487bbb77a56af37c5ba2.json',supersedes_sha256:createHash('sha256').update(readFileSync('reports/phase48-managed-dependency-audit-local-bf984c52971e487bbb77a56af37c5ba2.json')).digest('hex'),supersedes_reason:'Versioned global node and edge digests now generated by the executed module; prior incomplete certificate preserved.',source_hash_encoding:'UTF-8 with CRLF normalized to LF',source_hashes:Object.fromEntries(certifiedFiles.map(path=>[path,createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex')])),aggregate_contract_verified:true,local_health_adapter:'controlled fixture; no HTTP requests',receipt:{path:entry.path,sha256:entry.sha256,size_bytes:entry.size_bytes},entry_source_sha256:createHash('sha256').update(readFileSync('src/modules/cobertura/phase48-managed-dependency-audit-entry.ts')).digest('hex')};
    validateGraphInventory(replacement.audit,summary);validateGraphEvidence(replacement,summary);
    writeFileSync(certificatePath,JSON.stringify(replacement,null,2)+'\n',{flag:'wx'});
    const published=JSON.parse(readFileSync(certificatePath,'utf8'));validateGraphInventory(published.audit,summary);validateGraphEvidence(published,summary);
  }
});
