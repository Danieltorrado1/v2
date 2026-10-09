// One connection, TLS metadata and two scalar expressions. Never a preflight.
import {Pool,Client,type PoolClient} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifiedProductionConfig,inspectProductionTls,clearReadTlsEnvironment} from '../modules/cobertura/phase48-readonly-tls';
import {readDatabaseUrl} from '../modules/cobertura/phase48-readonly-target';
async function main(){
 let pool:Pool|undefined,client:PoolClient|undefined,begun=false;
 const evidence:any={scope:'MINIMAL_TLS_TRANSPORT_AND_READONLY_SCALARS',status:'STOPPED',connection_attempts:0,table_queries:0,catalog_queries:0,productive_data_writes:0,ddl:0,dml:0,health_requests:0};
 try{
  const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--verify-tls-only'||!args[1]?.startsWith('--credential-file='))throw Error('READ_TLS_PROBE_ARGUMENT_INVALID');
  const git=(...a:string[])=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if(git('branch','--show-current')!=='fix/phase48-tls13-runtime-validation')throw Error('READ_TLS_PROBE_BRANCH_INVALID');
  evidence.code_commit=git('rev-parse','HEAD');
  const credentialFile=args[1]!.slice('--credential-file='.length);
  const verified=verifiedProductionConfig(()=>readDatabaseUrl(readFileSync(credentialFile,'utf8')));
  if(verified.config.port!==6543)throw Error('READ_TRANSACTION_POOLER_REQUIRED');
  let secureConnectObserved=false;
  class ProbeClient extends Client {
   constructor(config:any){super(config);const connection=(this as any).connection;connection.once('sslconnect',()=>connection.stream.once('secureConnect',()=>{secureConnectObserved=true;}));}
  }
  pool=new Pool({...verified.config,Client:ProbeClient,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000} as any);pool.on('error',()=>{});
  evidence.connection_attempts=1;client=await pool.connect();
  if(!secureConnectObserved)throw Error('READ_TLS_HANDSHAKE_INCOMPLETE');
  evidence.tls=inspectProductionTls(client);evidence.secureConnect_observed=true;
  await client.query('BEGIN READ ONLY');begun=true;
  const result=await client.query("SELECT version(), current_setting('transaction_read_only') AS transaction_read_only");
  const row=result.rows[0],version=String(row?.version??'').match(/^PostgreSQL (\d+\.\d+(?:\.\d+)?)(?:\s|$)/)?.[1];
  if(!version||row?.transaction_read_only!=='on')throw Error('READ_TLS_PROBE_RESULT_INVALID');
  evidence.postgresql_version=version;evidence.transaction_read_only='on';
  await client.query('ROLLBACK');begun=false;evidence.rollback='CONFIRMED';evidence.status='TLS_VERIFIED';
 }catch(error){const e=error as Error;evidence.reason=/^READ_[A-Z0-9_]+$/.test(e.message)?e.message:'READ_TLS_PROBE_FAILED';process.exitCode=1;}
 finally{
  if(client){if(begun){try{await client.query('ROLLBACK');evidence.rollback='CONFIRMED';}catch{evidence.rollback='UNCONFIRMED';evidence.status='STOPPED';process.exitCode=1;}}client.release(true);evidence.client_closed=true;}
  if(pool){try{await pool.end();evidence.pool_closed=true;}catch{evidence.status='STOPPED';evidence.reason='READ_TLS_POOL_CLOSE_FAILED';process.exitCode=1;}}
  clearReadTlsEnvironment();evidence.completed_utc=new Date().toISOString();
  writeFileSync('reports/phase48-tls13-minimal-probe.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(evidence));
 }
}
main().catch(()=>{clearReadTlsEnvironment();console.error('READ_TLS_PROBE_EVIDENCE_FAILED');process.exitCode=1;});
