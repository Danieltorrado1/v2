import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,copyFileSync,symlinkSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer,connect,TLSSocket,createSecureContext} from 'node:tls';
import {createServer as netServer} from 'node:net';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {loadReadTls,inspectReadCa,clearReadTlsEnvironment} from '../modules/cobertura/phase48-readonly-tls';
import {validateReadTarget} from '../modules/cobertura/phase48-readonly-target';

const fixture=resolve('src/tests/fixtures/phase48-tls'),repo=resolve('.');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('TLS certification: external paths, CA constraints, strict trust, hostname and pg SSLRequest',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phase48-tls-test-'));let assertions=0;
 const env=(name='ca'):NodeJS.ProcessEnv=>({PHASE48_SSL_ROOT_CERT_PATH:join(dir,name+'.crt'),PHASE48_SSL_ROOT_CERT_SHA256:hash(readFileSync(join(fixture,name+'.crt'))),PHASE48_SSL_ROOT_CERT_ALLOWLIST:JSON.stringify([dir])});
 const rejects=(e:NodeJS.ProcessEnv,code:RegExp)=>{assert.throws(()=>loadReadTls('localhost',e,repo),code);assertions++;};
 try{
  if(process.platform==='win32'){
   // Test directory only: remove inherited writers before creating trusted fixtures.
   const script="$ErrorActionPreference='Stop'; $acl=[System.Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; foreach($sid in @($me,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}; Set-Acl -LiteralPath $env:PHASE48_TEST_DIRECTORY -AclObject $acl";
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,PHASE48_TEST_DIRECTORY:dir},stdio:'pipe',windowsHide:true});
  }
  for(const name of ['ca','wrong-ca','expired','non-ca','malformed'])copyFileSync(join(fixture,name+'.crt'),join(dir,name+'.crt'));
  const before=readdirSync(dir).sort(),good=loadReadTls('localhost',env(),repo);assertions++;
  assert.equal(good.receipt.self_signed,true);assert.equal(good.ssl.rejectUnauthorized,true);assert.equal(good.ssl.servername,'localhost');assert.equal(typeof good.ssl.checkServerIdentity,'function');
  assert.ok(!JSON.stringify(good.receipt).includes('BEGIN CERTIFICATE'));assert.ok(!JSON.stringify(good.receipt).includes(dir));assertions++;
  assert.equal(loadReadTls('localhost',{...env(),PHASE48_SSL_ROOT_CERT_SHA256:env().PHASE48_SSL_ROOT_CERT_SHA256!.toUpperCase()},repo).receipt.sha256,good.receipt.sha256);assertions++;
  rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:undefined},/READ_CA_PATH_REQUIRED/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_SHA256:undefined},/READ_CA_SHA_REQUIRED/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_SHA256:'0'.repeat(64)},/READ_CA_SHA_MISMATCH/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:'relative.crt'},/READ_CA_PATH_ABSOLUTE_REQUIRED/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:join(dir,'missing.crt')},/READ_CA_PATH_OR_CONFIGURATION_INVALID/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:dir},/READ_CA_FILE_REQUIRED/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:join(fixture,'ca.crt')},/READ_CA_REPOSITORY_FORBIDDEN/);
  rejects({...env(),PHASE48_SSL_ROOT_CERT_ALLOWLIST:JSON.stringify([fixture])},/READ_CA_OUTSIDE_ALLOWLIST/);
  rejects(env('expired'),/READ_CA_NOT_CURRENT/);rejects(env('non-ca'),/READ_CA_NOT_CA/);rejects(env('malformed'),/READ_CA_FORMAT_INVALID/);
  rejects({...env(),NODE_TLS_REJECT_UNAUTHORIZED:'0'},/READ_TLS_ENV_CONFLICT/);
  rejects({...env(),PGSSLMODE:'disable'},/READ_TLS_ENV_CONFLICT/);
  rejects({...env(),PGSSLROOTCERT:'anything'},/READ_TLS_ENV_CONFLICT/);
  assert.throws(()=>inspectReadCa(Buffer.alloc(0)),/READ_CA_FORMAT_INVALID/);assertions++;
  writeFileSync(join(dir,'short.crt'),'short');rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:join(dir,'short.crt')},/READ_CA_SIZE_INVALID/);unlinkSync(join(dir,'short.crt'));
  if(process.platform==='win32'){
   const unsafe=join(dir,'unsafe.crt');copyFileSync(join(dir,'ca.crt'),unsafe);
   const script="$ErrorActionPreference='Stop'; $acl=Get-Acl -LiteralPath $env:PHASE48_UNSAFE_TEST_FILE; $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Write','Allow')); Set-Acl -LiteralPath $env:PHASE48_UNSAFE_TEST_FILE -AclObject $acl";
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,PHASE48_UNSAFE_TEST_FILE:unsafe},stdio:'pipe',windowsHide:true});
   rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:unsafe},/READ_CA_ACL_UNSAFE/);unlinkSync(unsafe);
  }
  symlinkSync(dir,join(dir,'link'),process.platform==='win32'?'junction':'dir');rejects({...env(),PHASE48_SSL_ROOT_CERT_PATH:join(dir,'link','ca.crt')},/READ_CA_SYMLINK_FORBIDDEN/);if(process.platform==='win32')rmdirSync(join(dir,'link'));else unlinkSync(join(dir,'link'));
  const url='postgresql://postgres.abcdefghijklmnopqrst:synthetic@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
  for(const params of ['sslmode=disable','sslmode=require&sslmode=disable','sslrootcert=anything','sslcert=anything','sslmode=prefer']){assert.throws(()=>validateReadTarget(url+'?'+params,'abcdefghijklmnopqrst'),/READ_TARGET_/);assertions++;}
  const server=createServer({key:readFileSync(join(fixture,'server-test-only.key')),cert:readFileSync(join(fixture,'server.crt'))},socket=>socket.end());server.on('tlsClientError',()=>{});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;
  const handshake=(name:string,hostname:string)=>new Promise<void>((done,fail)=>{const socket=connect({host:'127.0.0.1',port,...loadReadTls(hostname,env(name),repo).ssl});socket.once('secureConnect',()=>{try{assert.equal(socket.authorized,true);socket.end();done();}catch(e){socket.destroy();fail(e);}});socket.once('error',e=>{socket.destroy();fail(e);});});
  try{await handshake('ca','localhost');assertions++;await assert.rejects(()=>handshake('wrong-ca','localhost'));assertions++;await assert.rejects(()=>handshake('ca','wrong.localhost'),/Hostname\/IP does not match/);assertions++;}finally{await new Promise<void>(done=>server.close(()=>done()));}
  // pg driver must perform PostgreSQL SSLRequest and retain strict CA validation.
  let pgRequests=0;const fake=netServer(socket=>{socket.once('data',packet=>{pgRequests++;assert.equal(packet.toString('hex'),'0000000804d2162f');socket.end('N');});});
  fake.listen(0,'127.0.0.1');await once(fake,'listening');const pool=new Pool({host:'127.0.0.1',port:(fake.address() as {port:number}).port,user:'test',database:'test',ssl:good.ssl,max:1,connectionTimeoutMillis:1000});pool.on('error',()=>{});
  try{await assert.rejects(()=>pool.connect(),/does not support SSL/);assert.equal(pgRequests,1);assertions++;}finally{await pool.end();await new Promise<void>(done=>fake.close(()=>done()));}
  const context=createSecureContext({key:readFileSync(join(fixture,'server-test-only.key')),cert:readFileSync(join(fixture,'server.crt'))});
  const sockets=new Set<TLSSocket>();
  const pgTls=netServer(socket=>{socket.once('data',packet=>{
   assert.equal(packet.toString('hex'),'0000000804d2162f');socket.write('S');
   const secure=new TLSSocket(socket,{isServer:true,secureContext:context});sockets.add(secure);secure.on('error',()=>{});secure.on('close',()=>sockets.delete(secure));
   secure.once('data',()=>secure.write(Buffer.from('5200000008000000005a0000000549','hex')));
  });});
  pgTls.listen(0,'127.0.0.1');await once(pgTls,'listening');
  try{
   for(const [name,hostname,success] of [['ca','localhost',true],['wrong-ca','localhost',false],['ca','wrong.localhost',false]] as const){
    const driver=new Pool({host:'127.0.0.1',port:(pgTls.address() as {port:number}).port,user:'test',database:'test',ssl:loadReadTls(hostname,env(name),repo).ssl,max:1,connectionTimeoutMillis:2000});driver.on('error',()=>{});
    try{if(success){const c=await driver.connect();assert.equal((c as any).connection.stream.authorized,true);c.release(true);}else await assert.rejects(()=>driver.connect());assertions++;}finally{await driver.end();}
   }
  }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(done=>pgTls.close(()=>done()));}
  assert.deepEqual(readdirSync(dir).sort(),before);assertions++;
  for(const key of ['DATABASE_URL','PGPASSWORD','PRODUCTION_MIGRATION_DATABASE_URL','PHASE48_SSL_ROOT_CERT_PATH','PHASE48_SSL_ROOT_CERT_SHA256'])process.env[key]='synthetic';clearReadTlsEnvironment();assert.equal(process.env.DATABASE_URL,undefined);assertions++;
  console.log(JSON.stringify({tls_local_assertions:assertions,trust_valid:true,wrong_ca_rejected:true,hostname_mismatch_rejected:true,insecure_fallback:false,sanitized_receipt:true,additional_files:0}));
 }finally{for(const file of readdirSync(dir))unlinkSync(join(dir,file));rmdirSync(dir);}
});
