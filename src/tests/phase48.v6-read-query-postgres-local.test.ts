import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {checkServerIdentity} from 'node:tls';
import {runReadQueryDiagnostic,type DiagnosticClient,type DiagnosticTlsEvidence} from '../modules/cobertura/phase48-v6-read-query-diagnostic';
import {scopedCapture} from '../modules/cobertura/phase48-scoped-repository';
import {v6Digests,V6_DIGESTS} from '../modules/cobertura/phase48-v6-contract';

const enabled=process.env.PHASE48_READ_QUERY_LOCAL_CERT==='true';
const observed:{value:{digests:Record<string,string>;candidate_count:number;identity:any}|undefined}={value:undefined};
const latestCapture=()=>observed.value as NonNullable<typeof observed.value>;
const required=(key:string)=>{const v=process.env[key];if(!v)throw Error('LOCAL_CERT_ENV_REQUIRED:'+key);return v;};
const config=()=>{assert.equal(enabled,true);const port=Number(required('PHASE48_READ_QUERY_LOCAL_PORT'));assert.ok(Number.isInteger(port)&&port>49151&&port<65536);const ca=readFileSync(required('PHASE48_READ_QUERY_LOCAL_CA'));return {port,ca,caSha256:createHash('sha256').update(ca).digest('hex'),dataDirectory:resolve(required('PHASE48_READ_QUERY_LOCAL_CLUSTER')),serverPid:Number(required('PHASE48_READ_QUERY_LOCAL_PID'))};};
const makeClient=(port:number,ca:Buffer)=>{
 const c=new Client({host:'127.0.0.1',port,user:'phase48_dynamic_local',database:'postgres',ssl:{ca:ca.toString('utf8'),rejectUnauthorized:true,servername:'localhost'},connectionTimeoutMillis:4000});
 const calls:string[]=[];const api:DiagnosticClient={async connect(){await c.connect();},async query(sql,values){calls.push(sql);const r=await c.query(sql,values as any[]|undefined);return {rows:r.rows,rowCount:r.rowCount};},end:()=>c.end()};return {c,api,calls};
};
const tlsEvidence=(client:any,caSha:string)=>async():Promise<DiagnosticTlsEvidence>=>{
 const socket=client.connection.stream;const cert=socket.getPeerCertificate(true);const hostError=checkServerIdentity('localhost',cert);
 return {protocol:socket.getProtocol(),encrypted:socket.encrypted===true,authorized:socket.authorized===true,rejectUnauthorized:true,ca_pinned:caSha===createHash('sha256').update(readFileSync(required('PHASE48_READ_QUERY_LOCAL_CA'))).digest('hex'),hostname_verified:hostError===undefined,servername_matches:socket.servername==='localhost',authorization_error:socket.authorizationError??null} as DiagnosticTlsEvidence;
};
const setup=()=>{const {port,ca,caSha256}=config();const directory=required('PHASE48_READ_QUERY_LOCAL_RECEIPTS');mkdirSync(directory,{recursive:true});const holder=makeClient(port,ca);return {directory,holder,port,ca,caSha256};};
const readOnlyCapture=async(db:{query(sql:string,values?:unknown[]):Promise<any>})=>{
 await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp');await db.query("SET LOCAL timezone='UTC'");await db.query("SET LOCAL statement_timeout='30s'");await db.query("SET LOCAL lock_timeout='2s'");
 const identity=(await db.query("SELECT current_setting('server_version') version,current_setting('data_directory') data_directory,inet_server_port() port,current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,pg_current_snapshot()::text snapshot,pg_backend_pid() pid,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_backend_pid() AND virtualxid IS NOT NULL LIMIT 1) virtual_tx")).rows[0];
 assert.equal(identity.version,'17.11');assert.equal(identity.read_only,'on');assert.equal(identity.isolation,'repeatable read');
 const database=(await db.query('SELECT current_database() database,current_user actor')).rows[0];assert.equal(database.database,'postgres');assert.equal(database.actor,'phase48_dynamic_local');
 const capture=await scopedCapture(db as any);const digests=v6Digests(capture);assert.equal(capture.set.candidate_count,740);assert.deepEqual(Object.keys(digests),[...V6_DIGESTS]);observed.value={digests,candidate_count:capture.set.candidate_count,identity};return {set:capture.set,digests,identity};
};

test('REAL PostgreSQL 17.11 TLS fixture: V6 capture, 740 rows, 17 digests, rollback, end and atomic receipt',{skip:!enabled},async()=>{
 observed.value=undefined;const x=setup(),expected=config(),runId=randomUUID(),instrument=await runReadQueryDiagnostic({directory:x.directory,runId,createClient:()=>x.holder.api,validateTls:tlsEvidence(x.holder.c,x.caSha256),capture:readOnlyCapture});
 const failedHash=instrument.receipt.query_id?.split('.')[3];const failedIndex=x.holder.calls.findIndex(sql=>createHash('sha256').update(sql.replace(/\s+/g,' ').trim()).digest('hex').startsWith(failedHash??'!'));
 assert.equal(instrument.receipt.status,'CAPTURED',`query_id=${instrument.receipt.query_id}; raw_call_index=${failedIndex}; sqlstate=${instrument.receipt.first_error?.sqlstate}`);assert.equal(instrument.receipt.rollback_confirmed,true);assert.equal(instrument.receipt.client_closed,true);assert.equal(instrument.receipt.tls_validated,true);assert.equal(instrument.receipt.capture_summary?.candidate_count,740);assert.equal(instrument.receipt.capture_summary?.digest_count,17);assert.deepEqual(instrument.receipt.capture_summary?.digests,latestCapture().digests);
 const selectCount=x.holder.calls.filter(s=>/^\s*(SELECT|WITH)\b/i.test(s)).length;assert.equal(selectCount,159);assert.equal(instrument.receipt.queries.length,164);assert.ok(!x.holder.calls.some(s=>/^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|CALL)\b/i.test(s)||/\b(?:nextval|setval)\s*\(/i.test(s)));
 const receipt=readFileSync(instrument.publication.path,'utf8');assert.equal(createHash('sha256').update(receipt).digest('hex'),instrument.publication.sha256);assert.equal(JSON.parse(receipt).mutator_invoked,false);assert.equal(JSON.parse(receipt).tls.protocol,'TLSv1.3');assert.equal(JSON.parse(receipt).tls.encrypted,true);assert.equal(JSON.parse(receipt).tls.authorized,true);
 const receiptExport=required('PHASE48_READ_QUERY_LOCAL_RECEIPT_OUT');writeFileSync(receiptExport,receipt,{flag:'wx'});
 const capture=latestCapture();assert.ok(capture);assert.equal(resolve(capture.identity.data_directory),expected.dataDirectory);assert.equal(capture.identity.port,x.port);assert.ok(Number(capture.identity.pid)>0);assert.ok(capture.identity.snapshot);
 const certificate=JSON.parse(readFileSync(required('PHASE48_READ_QUERY_LOCAL_CERTIFICATE'),'utf8'));certificate.read_query={port:x.port,postmaster_pid:expected.serverPid,backend_pid:Number(capture.identity.pid),data_directory:expected.dataDirectory,snapshot:capture.identity.snapshot,virtual_tx:capture.identity.virtual_tx,read_only:capture.identity.read_only,isolation:capture.identity.isolation,queries:instrument.receipt.queries.length,selects:selectCount,candidate_count:740,digest_count:17,digests:capture.digests,rollback_confirmed:true,client_closed:true,tls_validated:true,receipt_path:receiptExport.replace(resolve(),'').replace(/^[/\\]/,''),receipt_sha256:instrument.publication.sha256};
 writeFileSync(required('PHASE48_READ_QUERY_LOCAL_CERTIFICATE'),JSON.stringify(certificate,null,2)+'\n',{flag:'w'});
});

test('REAL PostgreSQL errors stop at first SELECT, preserve SQLSTATE, then rollback and close',{skip:!enabled},async()=>{
 const cases:[string,(db:{query(sql:string):Promise<any>})=>Promise<void>,string][]=[['missing column',async db=>db.query('SELECT no_such_column FROM pg_catalog.pg_class'),'42703'],['missing relation',async db=>db.query('SELECT * FROM pg_catalog.no_such_relation'),'42P01'],['permission denied',async db=>{await db.query('SET LOCAL ROLE pg_monitor');await db.query('SELECT * FROM pg_catalog.pg_authid LIMIT 1');},'42501']];
 for(const [label,run,state] of cases){const x=setup(),later='SELECT 1';const r=await runReadQueryDiagnostic({directory:x.directory,runId:randomUUID(),createClient:()=>x.holder.api,validateTls:tlsEvidence(x.holder.c,x.caSha256),async capture(db){await run(db);await db.query(later);}});assert.equal(r.receipt.first_error?.sqlstate,state,label);assert.equal(x.holder.calls.includes(later),false,label);assert.equal(r.receipt.rollback_confirmed,true,label);assert.equal(r.receipt.client_closed,true,label);}
});

test('REAL PostgreSQL statement_timeout abort is followed by explicit rollback and close',{skip:!enabled},async()=>{
 const x=setup();const r=await runReadQueryDiagnostic({directory:x.directory,runId:randomUUID(),createClient:()=>x.holder.api,validateTls:tlsEvidence(x.holder.c,x.caSha256),async capture(db){await db.query("SET LOCAL statement_timeout='25ms'");await db.query('SELECT pg_sleep(1)');}});assert.equal(r.receipt.first_error?.sqlstate,'57014');assert.equal(r.receipt.rollback_confirmed,true);assert.equal(r.receipt.client_closed,true);
});

test('REAL PostgreSQL destination collision preserves prior bytes and closes connection',{skip:!enabled},async()=>{
 const x=setup(),runId=randomUUID(),target=join(x.directory,`phase48-diagnostic-${runId}.receipt.json`);writeFileSync(target,'KEEP',{flag:'wx'});const r=await runReadQueryDiagnostic({directory:x.directory,runId,createClient:()=>x.holder.api,validateTls:tlsEvidence(x.holder.c,x.caSha256),async capture(db){await db.query('SELECT 1');return {set:{candidate_count:740},digests:Object.fromEntries(V6_DIGESTS.map(k=>[k,'a'.repeat(64)]))};}}).catch(e=>e);assert.equal(readFileSync(target,'utf8'),'KEEP');assert.equal(r.receipt.client_closed,true);assert.ok(existsSync(target));
});
