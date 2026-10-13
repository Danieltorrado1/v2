import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {TLSSocket,createSecureContext,checkServerIdentity} from 'node:tls';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {Pool} from 'pg';
import ts from 'typescript';
import {inspectProductionTls as pinnedInspect} from '../modules/cobertura/phase48-readonly-tls';
import {runReadOnlyLifecycle} from '../modules/cobertura/phase48-readonly-preflight';
import {saveReadReceipt} from '../modules/cobertura/phase48-readonly-receipts';
import {authorizationFields,buildAuthorizationPhrase,MUTATOR_COMMIT,BACKUP_SHA256,CERTIFICATE_SHA256,PROJECT_REF,DIGEST_FIELDS} from '../modules/cobertura/phase48-readonly-contract';

const fixture=resolve('src/tests/fixtures/phase48-tls');
const ca=readFileSync(fixture+'/ca.crt'),peerCert=new (require('node:crypto').X509Certificate)(readFileSync(fixture+'/server.crt'));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
// Only the pinned hash is replaced with the synthetic fixture hash. The runtime
// implementation, Node TLS class, identity checker and pg driver are unchanged.
const runtimeExports:any={};
runInNewContext(ts.transpileModule(readFileSync('src/modules/cobertura/phase48-readonly-tls.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:runtimeExports,Buffer,Date,__dirname:resolve('src/modules/cobertura'),require:(n:string)=>n==='./phase48-readonly-contract'?{CERTIFICATE_SHA256:hash(ca).toUpperCase(),validateCertificateHash:(s:string)=>assert.equal(s,hash(ca).toUpperCase())}:n==='./phase48-readonly-target'?{}:require(n)});
const inspect:typeof pinnedInspect=runtimeExports.inspectProductionTls;
const connectionExports:any={};
runInNewContext(ts.transpileModule(readFileSync('src/modules/cobertura/phase48-readonly-connection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:connectionExports,Buffer,Date,setTimeout,clearTimeout,require:(n:string)=>n==='./phase48-readonly-tls'?runtimeExports:require(n)});
const repositoryExports:any={};
runInNewContext(ts.transpileModule(readFileSync('src/modules/cobertura/phase48-readonly-repository.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:repositoryExports,Buffer,Date,require:(n:string)=>n==='./phase48-readonly-tls'?runtimeExports:n.startsWith('./')?{}:require(n)});
function client(patch:Record<string,unknown>={}){
 const ssl={ca,minVersion:'TLSv1.3',rejectUnauthorized:true,servername:'localhost',checkServerIdentity};
 const socket=Object.create(TLSSocket.prototype);
 const fields={encrypted:true,authorized:true,authorizationError:undefined,servername:'localhost',_secureEstablished:true,secureConnecting:false,destroyed:false,getProtocol:()=> 'TLSv1.3',getCipher:()=>({standardName:'TLS_AES_256_GCM_SHA384',version:'TLSv1.3'}),getPeerCertificate:()=>({raw:peerCert.raw,subjectaltname:'DNS:localhost'}),...patch};
 for(const [k,v] of Object.entries(fields))Object.defineProperty(socket,k,{value:v,configurable:true});
 return {connection:{stream:socket,ssl},connectionParameters:{host:'localhost',ssl}};
}
test('exact TLSv1.3 accepted through pg Client/PoolClient wrapper',()=>{
 const evidence=inspect(client());assert.equal(evidence.protocol,'TLSv1.3');assert.equal(evidence.socket_path,'client.connection.stream');assert.ok(!JSON.stringify(evidence).includes('localhost'));
});
for(const protocol of ['TLSv1.2',null,'unknown','TLS1.3','tlsv1.3',' TLSv1.3','TLSv1.3 '])test('runtime rejects protocol '+JSON.stringify(protocol),()=>assert.throws(()=>inspect(client({getProtocol:()=>protocol})),/READ_TLS_PROTOCOL_INVALID/));
for(const [name,patch,code] of [
 ['before secureConnect',{_secureEstablished:false,secureConnecting:true},'HANDSHAKE_INCOMPLETE'],
 ['authorized=false',{authorized:false},'AUTHORIZATION_INVALID'],
 ['authorizationError present',{authorizationError:'CERT_HAS_EXPIRED'},'AUTHORIZATION_INVALID'],
 ['wrong servername',{servername:'wrong.invalid'},'SERVERNAME_INVALID'],
 ['wrong peer hostname',{getPeerCertificate:()=>({raw:peerCert.raw,subjectaltname:'DNS:wrong.invalid'})},'PEER_IDENTITY_INVALID'],
 ['peer missing',{getPeerCertificate:()=>({})},'PEER_IDENTITY_INVALID']
] as const)test('runtime rejects '+name,()=>assert.throws(()=>inspect(client(patch)),new RegExp('READ_TLS_'+code)));
test('wrong socket and arbitrary nested TLS decoys are rejected',()=>{
 const c=client();c.connection.stream={socket:c.connection.stream};assert.throws(()=>inspect(c),/READ_TLS_SOCKET_INVALID/);
 assert.throws(()=>inspect({stream:client().connection.stream}),/READ_TLS_CLIENT_INVALID/);
});
test('wrong CA, disabled rejectUnauthorized, wrong checker and mismatched config rejected',()=>{
 for(const patch of [{ca:Buffer.from('wrong')},{rejectUnauthorized:false},{checkServerIdentity:()=>undefined}]){const c=client();Object.assign(c.connection.ssl,patch);assert.throws(()=>inspect(c));}
 assert.throws(()=>pinnedInspect(client()),/CERTIFICATE_SHA256_INVALID/);
 const c=client();c.connectionParameters.ssl={...c.connection.ssl};assert.throws(()=>inspect(c),/READ_TLS_CLIENT_INVALID/);
});
test('runner and mutator use same runtime helper; no backend pg_stat_ssl inference',()=>{
 for(const path of ['src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-production-executor.ts']){const source=readFileSync(path,'utf8');assert.match(source,/import \{inspectProductionTls\} from '.\/phase48-readonly-tls'/);assert.match(source,/inspectProductionTls\((?:client|db)\)/);assert.ok(!source.includes('pg_stat_ssl'));}
 assert.match(readFileSync('src/modules/cobertura/phase48-readonly-connection.ts','utf8'),/tlsEvidence=inspectProductionTls\(client\)/);
});
test('repository inspects original client, not SELECT-only query wrapper, with zero queries',async()=>{
 let queries=0;const c={...client(),query:()=>{queries++;throw Error('SQL_FORBIDDEN');}};
 assert.equal(await repositoryExports.createReadOnlyRepository(c).ssl(),true);
 await assert.rejects(()=>repositoryExports.createReadOnlyRepository({query:c.query}).ssl(),/READ_TLS_CLIENT_INVALID/);
 assert.equal(queries,0);
});
test('TLS rejection before SQL publishes a complete immutable STOPPED receipt atomically',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phase48-tls-stopped-'));
 try{
  const result=await runReadOnlyLifecycle(async()=>{pinnedInspect({});throw Error('UNREACHABLE');},{target:'Production',commit:'f'.repeat(40),backupSha:BACKUP_SHA256,certificateSha:CERTIFICATE_SHA256,observeFlags:async()=>({health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false})});
  assert.equal(result.status,'STOPPED');assert.equal(result.reason,'READ_TLS_CLIENT_INVALID');assert.equal(result.writes,0);assert.equal(result.authorization_phrase,null);assert.equal(result.nonce,null);
  const file=saveReadReceipt(dir,result),bytes=readFileSync(file);assert.equal(JSON.parse(bytes.toString()).status,'STOPPED');assert.equal(readdirSync(dir).length,1);
  saveReadReceipt(dir,result);assert.deepEqual(readFileSync(file),bytes);
 }finally{for(const file of readdirSync(dir))unlinkSync(join(dir,file));rmdirSync(dir);}
});
test('base runner and old mutator phrases revoked',()=>{
 const r={commit:'f'.repeat(40),backup_sha:BACKUP_SHA256,certificate_sha256:CERTIFICATE_SHA256,project_ref:PROJECT_REF,scope:{empresa:15,contrato:24,actor:12},phase48_rows:730,digests:Object.fromEntries(DIGEST_FIELDS.map(k=>[k,'a'.repeat(64)])),nonce:'b'.repeat(64),issued_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+60000).toISOString()};
 const fields=authorizationFields(r);assert.throws(()=>buildAuthorizationPhrase({...fields,readonly_runner_commit:'9428f22644e895592e940193579d03202b9df1ec'}),/REVOKED/);
 if(String(MUTATOR_COMMIT)!=='bdebcb2b0fcd1ab63f50c0177c6c403a7b36c7e7')assert.throws(()=>buildAuthorizationPhrase({...fields,mutator_commit:'bdebcb2b0fcd1ab63f50c0177c6c403a7b36c7e7'}),/INVALID/);
});
test('real pg SSLRequest wrapper resolves TLSv1.3 only after secureConnect, without SQL',async()=>{
 const context=createSecureContext({key:readFileSync(fixture+'/server-test-only.key'),cert:readFileSync(fixture+'/server.crt'),minVersion:'TLSv1.3'});
 const sockets=new Set<TLSSocket>();
 const server=createServer(raw=>raw.once('data',packet=>{
  assert.equal(packet.toString('hex'),'0000000804d2162f');raw.write('S');
  const socket=new TLSSocket(raw,{isServer:true,secureContext:context});sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.once('data',()=>socket.write(Buffer.from('5200000008000000005a0000000549','hex')));
 }));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const ssl=client().connection.ssl;
 const pool=new Pool({host:'localhost',port:(server.address() as {port:number}).port,user:'synthetic',database:'synthetic',ssl:ssl as any,max:1,connectionTimeoutMillis:2000});pool.on('error',()=>{});
 try{const acquired=await pool.connect();try{const evidence=inspect(acquired);assert.equal(evidence.protocol,'TLSv1.3');assert.equal(await repositoryExports.createReadOnlyRepository(acquired).ssl(),true);console.log(JSON.stringify({scope:'LOOPBACK_SYNTHETIC',...evidence}));}finally{acquired.release(true);}}
 finally{await pool.end();for(const socket of sockets)socket.destroy();await new Promise<void>(done=>server.close(()=>done()));}
});

test('fresh Pool factory observes two real TLS handshakes and closes A before B with identical pooler backend PID',async()=>{
 const context=createSecureContext({key:readFileSync(fixture+'/server-test-only.key'),cert:readFileSync(fixture+'/server.crt'),minVersion:'TLSv1.3'});
 const sockets=new Set<TLSSocket>();let startups=0;
 const server=createServer(raw=>raw.once('data',packet=>{
  assert.equal(packet.toString('hex'),'0000000804d2162f');raw.write('S');
  const socket=new TLSSocket(raw,{isServer:true,secureContext:context});sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.once('data',()=>{startups++;socket.write(Buffer.from('5200000008000000004b0000000c00000064000000015a0000000549','hex'));});
 }));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const open=connectionExports.freshReadConnectionFactory({host:'localhost',port:(server.address() as {port:number}).port,user:'synthetic',database:'synthetic',ssl:client().connection.ssl},'Production');
 try{
  const a=await open();assert.equal(a.evidence.handshake_events,1);await a.close();assert.equal(a.isClosed(),true);assert.equal(a.stream.destroyed,true);
  const b=await open();try{
   assert.notEqual(a.pool,b.pool);assert.notEqual(a.client,b.client);assert.notEqual(a.stream,b.stream);assert.notEqual(a.tlsSocket,b.tlsSocket);assert.notEqual(a.evidence.connection_instance_id,b.evidence.connection_instance_id);
   assert.equal(a.client.processID,b.client.processID);assert.equal(b.evidence.handshake_events,1);assert.equal(startups,2);assert.equal(a.evidence.tls_protocol,'TLSv1.3');assert.equal(b.evidence.tls_protocol,'TLSv1.3');assert.equal(b.queryCount(),0);
   assert.ok(!/localhost|synthetic|BEGIN CERTIFICATE/.test(JSON.stringify([a.evidence,b.evidence])));
  }finally{await b.close();assert.equal(b.isClosed(),true);}
 }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(done=>server.close(()=>done()));}
});
