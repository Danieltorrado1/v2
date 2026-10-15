import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {createServer as createTlsServer,type Server as TlsServer} from 'node:https';
import {request as httpsRequest} from 'node:https';
import {mkdtempSync,readdirSync,statSync,readFileSync as readFs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fetchProductionHealth,PHASE48_HEALTH_URL,requestHealthAtUrl,validateProductionHealthUrl} from '../modules/cobertura/phase48-v6-diagnostic-health';
import {DIAGNOSTIC_PINS,launchReadQueryDiagnostic,parseDiagnosticLauncherArgs,type LauncherDependencies} from '../modules/cobertura/phase48-v6-diagnostic-launcher';
import {publishAtomicReceipt} from '../modules/cobertura/phase48-readonly-receipts';

const good={success:true,data:{database:{status:'ok'},integracion_outbox:{configured:false,enabled:false,recalc:{requested:false,active:false},started:false,running:false}}};
async function serve(handler:(req:any,res:any)=>void){const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a==='object');return {server,url:`http://127.0.0.1:${a.port}/api/health`};}
async function close(server:Server){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
async function closeTls(server:TlsServer){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
const opts={timeoutMs:100,maxBytes:2048,syncManuallyConfirmedFalse:true as const};

test('health client validates the fixed production URL and GET-only policy',async()=>{
 assert.equal(validateProductionHealthUrl(PHASE48_HEALTH_URL),PHASE48_HEALTH_URL);
 for(const u of ['http://api.empiriasuite.com/api/health','https://evil.example/api/health','https://api.empiriasuite.com/other','https://user:pass@api.empiriasuite.com/api/health','https://api.empiriasuite.com/api/health?x=1','https://api.empiriasuite.com/api/health#x'])assert.throws(()=>validateProductionHealthUrl(u));
 let method='';const result=await fetchProductionHealth({...opts,transport:async(_url,init)=>{method=String(init?.method);return new Response(JSON.stringify(good),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});}});assert.equal(result.database_status,'ok');assert.equal(method,'GET');
});
test('launcher parser rejects unknown, duplicate, missing and non-false sync confirmation arguments',()=>{
 const valid=['--mode=ProductiveDiagnostic','--receipt-directory=./reports','--credential-path=C:/secure/db.env','--ca-path=C:/secure/root.crt','--ca-sha256='+'a'.repeat(64),'--sync-manually-confirmed=false'];assert.equal(parseDiagnosticLauncherArgs(valid).mode,'ProductiveDiagnostic');
 for(const a of [[],[...valid,'--unknown=x'],[...valid,'--mode=ProductiveDiagnostic'],valid.filter(x=>!x.startsWith('--ca-sha256=')),valid.map(x=>x==='--sync-manually-confirmed=false'?'--sync-manually-confirmed=true':x)])assert.throws(()=>parseDiagnosticLauncherArgs(a));
});
test('diagnostic launcher pins the recertified runners and keeps the unchanged mutator pin',()=>{assert.deepEqual(DIAGNOSTIC_PINS,{diagnostic_runner_commit:'38f5242ddb283ab8af03d0ea5dca1aae5fe44922',readonly_runner_commit:'38f5242ddb283ab8af03d0ea5dca1aae5fe44922',mutator_commit:'58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911'});assert.notEqual(DIAGNOSTIC_PINS.diagnostic_runner_commit,'0160238c317637196bb38c8abde1ced5e4737339');assert.notEqual(DIAGNOSTIC_PINS.readonly_runner_commit,'154dbdaf01d75685c6306a81a92bf7ab11a69585');});
test('local HTTP fixture accepts a valid health response',async()=>{const x=await serve((_q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(good));});try{const result=await requestHealthAtUrl(x.url,(url,init)=>fetch(url,init),opts);assert.equal(result.http_status,200);assert.equal(result.outbox,false);}finally{await close(x.server);}});
test('local HTTPS fixture performs a verified TLS handshake with the test-only CA',async()=>{
 const fixture=join(process.cwd(),'src/tests/fixtures/phase48-tls'),server=createTlsServer({key:readFs(join(fixture,'server-test-only.key')),cert:readFs(join(fixture,'server.crt'))},(_q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(good));});await new Promise<void>(resolve=>server.listen(0,'::1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const url=`https://localhost:${address.port}/api/health`;
 try{const result=await requestHealthAtUrl(url,(target,init)=>new Promise<Response>((resolve,reject)=>{const req=httpsRequest(target,{method:init?.method,ca:readFs(join(fixture,'ca.crt')),servername:'localhost',rejectUnauthorized:true},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(Buffer.from(c)));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers as any})));});req.on('error',reject);req.on('socket',socket=>{socket.setTimeout(5000,()=>req.destroy(Error('timeout')));});req.end();}),opts);assert.equal(result.database_status,'ok');}finally{await closeTls(server);}
});
test('local HTTP fixture rejects redirect, 500 and 503 without following redirects',async()=>{for(const status of [302,500,503]){const x=await serve((_q,r)=>{r.writeHead(status,{location:'/api/health','content-type':'application/json'});r.end('{}');});try{await assert.rejects(()=>requestHealthAtUrl(x.url,(url,init)=>fetch(url,init),opts),status===302?/HEALTH_REDIRECT_REJECTED/:/HEALTH_HTTP_STATUS_INVALID/);}finally{await close(x.server);}}});
test('local HTTP fixture rejects malformed, duplicate, oversized, BOM and invalid UTF-8 bodies',async()=>{
 const cases:[Buffer,string][]=[[Buffer.from('{bad'), 'application/json'],[Buffer.from('{"success":true,"success":false}'),'application/json'],[Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(good))]),'application/json'],[Buffer.from([0xff,0xfe]),'application/json'],[Buffer.from(JSON.stringify(good)),'text/plain']];
 for(const [body,type] of cases){const x=await serve((_q,r)=>{r.writeHead(200,{'content-type':type});r.end(body);});try{await assert.rejects(()=>requestHealthAtUrl(x.url,(url,init)=>fetch(url,init),opts));}finally{await close(x.server);}}
 const large=await serve((_q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(' '.repeat(3000));});try{await assert.rejects(()=>requestHealthAtUrl(large.url,(url,init)=>fetch(url,init),opts),/HEALTH_BODY_TOO_LARGE/);}finally{await close(large.server);}
});
test('local HTTP fixture enforces health value types and timeout',async()=>{
 const wrong={success:true,data:{database:{status:'ok'},integracion_outbox:{configured:0,enabled:false,recalc:{requested:false,active:false},started:false,running:false}}};const x=await serve((_q,r)=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(wrong));});try{await assert.rejects(()=>requestHealthAtUrl(x.url,(url,init)=>fetch(url,init),opts),/HEALTH_OUTBOX_ENABLED/);}finally{await close(x.server);}
 const slow=await serve(()=>{});try{await assert.rejects(()=>requestHealthAtUrl(slow.url,(url,init)=>fetch(url,init),opts),/HEALTH_TIMEOUT/);}finally{slow.server.closeAllConnections();await close(slow.server);}
});
test('simulated PowerShell-style NullReference is collapsed to a sanitized transport failure',async()=>{
 await assert.rejects(()=>requestHealthAtUrl('https://api.empiriasuite.com/api/health',async()=>{throw new ReferenceError('private response payload');},opts),(e:any)=>e.message==='HEALTH_REQUEST_FAILED'&&!e.message.includes('private'));
});
test('launcher publishes valid STOPPED receipt before credential read when health fails',async()=>{
 const d=mkdtempSync(join(tmpdir(),'phase48-launcher-'));let credentialReads=0,clients=0;const deps:LauncherDependencies={root:process.cwd(),directory:d,syncManuallyConfirmedFalse:true,precheck:()=>({ok:true}),async health(){throw Error('HEALTH_HTTP_STATUS_INVALID');},readCredential(){credentialReads++;return 'never';},async runInstrument(){clients++;throw Error('UNEXPECTED');}};
 const outcome=await launchReadQueryDiagnostic(deps);assert.equal(outcome.status,'STOPPED');assert.equal(credentialReads,0);assert.equal(clients,0);const names=readdirSync(d).filter(n=>n.endsWith('.receipt.json'));assert.equal(names.length,1);assert.equal(outcome.receipt_name,names[0]);const path=join(d,names[0]!);const bytes=readFs(path);const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const r=JSON.parse(text);assert.equal(bytes.at(-1),10);assert.equal(bytes.at(-2),125);assert.equal(r.health_attempted,true);assert.equal(r.health_validated,false);assert.equal(r.credential_read_attempted,false);assert.equal(r.connection_count,0);assert.equal(r.final_status,'STOPPED');assert.equal(r.mutator_invoked,false);
});
test('invalid historical diagnostic artifact remains byte-for-byte preserved and fails JSON parsing at literal suffix',()=>{const p=join(process.cwd(),'reports/phase48-diagnostic-1a56c5bb-7c53-4acb-92d9-8cfbcac1e4dd.receipt.json'),b=readFs(p);assert.equal(b.length,1402);assert.equal(createHash('sha256').update(b).digest('hex'),'ca2688f45c0c7da7717c277163a45488a24ee0e8f7ba7c0cdbd4f704a6f5c2bb');assert.deepEqual([...b.subarray(-5)], [0x0d,0x0a,0x7d,0x60,0x6e]);assert.throws(()=>JSON.parse(b.toString('utf8')));});
test('successful orchestration caps client count at one and preserves instrument cleanup facts',async()=>{
 const d=mkdtempSync(join(tmpdir(),'phase48-launcher-'));let credentials=0,clients=0;const deps:LauncherDependencies={root:process.cwd(),directory:d,syncManuallyConfirmedFalse:true,precheck:()=>({ok:true}),async health(){return {http_status:200,success:true,database_status:'ok',outbox:false,recalc_requested:false,recalc_active:false,worker_stopped:true,sync_manually_confirmed_false:true};},readCredential(){credentials++;return 'synthetic';},async runInstrument({runId,publish}){clients++;const receipt={run_id:runId,status:'CAPTURED',client_created:true,connect_attempted:true,tls_validated:true,transaction_started:true,query_id:'read.test.0001',rollback_attempted:true,rollback_confirmed:true,client_end_attempted:true,client_closed:true,connection_count:1,operation_error:null};publish(d,'unused',receipt);return {receipt};}};
 const result=await launchReadQueryDiagnostic(deps);assert.equal(result.status,'CAPTURED');assert.equal(credentials,1);assert.equal(clients,1);
});
test('failure after health publishes STOPPED without leaking credentials or opening another client',async()=>{
 const d=mkdtempSync(join(tmpdir(),'phase48-launcher-'));let clients=0;const deps:LauncherDependencies={root:process.cwd(),directory:d,syncManuallyConfirmedFalse:true,precheck:()=>({ok:true}),async health(){return {http_status:200,success:true,database_status:'ok',outbox:false,recalc_requested:false,recalc_active:false,worker_stopped:true,sync_manually_confirmed_false:true};},readCredential(){return 'synthetic-secret';},async runInstrument({runId}){clients++;return {receipt:{run_id:runId,status:'STOPPED',client_created:true,connect_attempted:true,tls_validated:false,transaction_started:false,query_id:null,rollback_attempted:true,rollback_confirmed:false,client_end_attempted:true,client_closed:false,connection_count:1,operation_error:{error_type:'Error',sqlstate:'08006'}}};}};
 const result=await launchReadQueryDiagnostic(deps);assert.equal(result.status,'STOPPED');assert.equal(clients,1);const name=readdirSync(d).find(n=>n.endsWith('.receipt.json'))!;const r=JSON.parse(readFs(join(d,name),'utf8'));assert.equal(r.final_status,'STOPPED');assert.equal(r.tls_validated,false);assert.equal(r.rollback_confirmed,false);assert.equal(r.close_confirmed,false);assert.equal(JSON.stringify(r).includes('synthetic-secret'),false);
});
test('atomic publisher emits one LF, valid JSON, exact hash and refuses destination collision',()=>{
 const d=mkdtempSync(join(tmpdir(),'phase48-json-receipt-')),run='phase48-diagnostic-'+cryptoRandom(),name=run+'.receipt.json',r={run_id:run,status:'STOPPED'};const path=publishAtomicReceipt(d,name,r,{exclusive:true}),bytes=readFs(path);assert.equal(bytes.at(-1),10);assert.equal(bytes.at(-2),125);assert.deepEqual(JSON.parse(bytes.toString('utf8')),r);assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(JSON.stringify(r,null,2)+'\n').digest('hex'));assert.throws(()=>publishAtomicReceipt(d,name,r,{exclusive:true}),/RECEIPT_DESTINATION_EXISTS/);assert.equal(statSync(path).size,bytes.length);
});
function cryptoRandom(){return '01234567-89ab-4cde-8fab-'+Math.random().toString(16).slice(2).padEnd(12,'0').slice(0,12);}
