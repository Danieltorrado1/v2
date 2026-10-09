// Fixed minimal probe. No table access, health call, preflight or mutation import.
import {Pool, type PoolClient} from 'pg';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {checkServerIdentity, type TLSSocket} from 'node:tls';
import {readDatabaseUrl,validateReadTarget} from '../modules/cobertura/phase48-readonly-target';
import {loadReadTls,clearReadTlsEnvironment} from '../modules/cobertura/phase48-readonly-tls';

async function main(){
 let pool:Pool|undefined,client:PoolClient|undefined,begun=false,rollback=false;
 try{
  const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--verify-tls-only'||!args[1]?.startsWith('--credential-file='))throw Error('READ_TLS_PROBE_ARGUMENT_INVALID');
  const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(git('branch','--show-current')!=='fix/phase48-read-tls-ca'||git('status','--porcelain','--untracked-files=all'))throw Error('CLEAN_READ_BRANCH_REQUIRED');
  const commit=git('rev-parse','HEAD');if(git('rev-parse','@{upstream}')!==commit)throw Error('READ_TLS_PUSH_REQUIRED');
  const target=validateReadTarget(readDatabaseUrl(readFileSync(args[1].slice('--credential-file='.length),'utf8')));
  if(target.config.port!==6543)throw Error('READ_TRANSACTION_POOLER_REQUIRED');
  const tls=loadReadTls(target.config.host);let hostnameVerified=false;
  tls.ssl.checkServerIdentity=(host,cert)=>{const error=checkServerIdentity(host,cert);hostnameVerified=host===target.config.host&&!error;return error;};
  const {options:unused,...config}=target.config;
  pool=new Pool({...config,ssl:tls.ssl,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});pool.on('error',()=>{});
  client=await pool.connect();
  const socket=(client as unknown as {connection:{stream:TLSSocket}}).connection.stream;
  const peer=socket.getPeerCertificate(true);
  if(!socket.encrypted||!socket.authorized||!hostnameVerified||!peer.raw||checkServerIdentity(target.config.host,peer))throw Error('READ_TLS_VERIFICATION_FAILED');
  await client.query('BEGIN TRANSACTION READ ONLY');begun=true;
  const result=await client.query({text:"SELECT current_setting('transaction_read_only'), current_setting('server_version'), pg_backend_pid()",rowMode:'array'});
  await client.query('ROLLBACK');begun=false;rollback=true;
  const row=result.rows[0];if(row?.[0]!=='on'||!/^17\./.test(row?.[1])||!Number.isInteger(row?.[2]))throw Error('READ_TLS_PROBE_RESULT_INVALID');
  console.log(JSON.stringify({status:'TLS_VERIFIED',commit,certificate:tls.receipt,tls_active:true,rejectUnauthorized:true,hostname_verified:hostnameVerified,chain_verified:true,peer_certificate_present:true,peer_fingerprint:peer.fingerprint256,tls_version:socket.getProtocol(),transaction_read_only:row[0],postgresql:row[1],backend_pid:row[2],rollback,writes:0,ddl:0,dml:0,audit_writes:0,sequence_operations:0,decision:'TLS PRODUCTIVO VERIFICADO — LISTO PARA PREFLIGHT READ ONLY'}));
 }finally{
  if(client){if(begun)await client.query('ROLLBACK').catch(()=>{});client.release(true);}
  if(pool)await pool.end();clearReadTlsEnvironment();
 }
}
main().catch((error:unknown)=>{clearReadTlsEnvironment();const e=error as {message?:string;code?:string};console.error(JSON.stringify({status:'STOPPED',reason:e.message&&/^READ_[A-Z_]+$/.test(e.message)?e.message:'READ_TLS_PROBE_FAILED',code:e.code&&/^[A-Z0-9_]{1,64}$/.test(e.code)?e.code:null,writes:0,decision:'OPERACIÓN DETENIDA — TLS PRODUCTIVO NO VERIFICADO'}));process.exitCode=1;});
