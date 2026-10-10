// Catalog audit only. No health, business rows, preflight or mutator imports.
import {Pool,type PoolClient} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifiedProductionConfig,inspectProductionTls,clearReadTlsEnvironment} from '../modules/cobertura/phase48-readonly-tls';
import {readDatabaseUrl,READ_SCHEMA_FINGERPRINT} from '../modules/cobertura/phase48-readonly-target';
import {collectSchemaForensic} from '../modules/cobertura/phase48-readonly-schema-catalog';
async function main(){
 let pool:Pool|undefined,client:PoolClient|undefined,begun=false;
 const evidence:any={scope:'SYSTEM_CATALOGS_ONLY',status:'STOPPED',writes_productive:0,business_row_queries:0,connection_attempts:0,expected_schema_digest:READ_SCHEMA_FINGERPRINT};
 try{
  const verified=verifiedProductionConfig(()=>readDatabaseUrl(readFileSync('C:/Users/CORE ULTRA/Desktop/V2/.env','utf8')));
  if(verified.config.port!==6543)throw Error('READ_TRANSACTION_POOLER_REQUIRED');
  pool=new Pool({...verified.config,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});pool.on('error',()=>{});
  evidence.connection_attempts=1;client=await pool.connect();evidence.tls=inspectProductionTls(client);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  await client.query("SET LOCAL search_path=pg_catalog,public");await client.query("SET LOCAL statement_timeout='120s'");
  const session=(await client.query("SELECT current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,current_setting('server_version') version,pg_backend_pid() pid,pg_current_snapshot()::text snapshot,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='virtualxid') virtual_transaction")).rows[0];
  if(session.read_only!=='on'||session.isolation!=='repeatable read')throw Error('READ_TRANSACTION_REQUIRED');evidence.session=session;
  evidence.schema=await collectSchemaForensic(client);evidence.observed_schema_digest=evidence.schema.global_digest;
  await client.query('ROLLBACK');begun=false;evidence.rollback='CONFIRMED';evidence.status='CATALOG_AUDIT_COMPLETE';
 }catch(e){const message=(e as Error).message;evidence.reason=/^[A-Z0-9_]+$/.test(message)?message:'READ_SCHEMA_FORENSIC_FAILED';process.exitCode=1;}
 finally{
  if(client){if(begun)try{await client.query('ROLLBACK');evidence.rollback='CONFIRMED';}catch{evidence.rollback='UNCONFIRMED';}client.release(true);evidence.client_closed=true;}
  if(pool){await pool.end();evidence.pool_closed=true;}clearReadTlsEnvironment();evidence.completed_utc=new Date().toISOString();
  writeFileSync('reports/phase48-schema-production-catalogs.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:evidence.status,reason:evidence.reason,observed_schema_digest:evidence.observed_schema_digest,rollback:evidence.rollback,writes_productive:0}));
 }
}
main().catch(()=>{clearReadTlsEnvironment();console.error('READ_SCHEMA_FORENSIC_OUTPUT_FAILED');process.exitCode=1;});
