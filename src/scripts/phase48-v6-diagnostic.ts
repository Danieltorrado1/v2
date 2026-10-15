import {Client} from 'pg';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseDiagnosticLauncherArgs,verifyDiagnosticOffline,launchReadQueryDiagnostic} from '../modules/cobertura/phase48-v6-diagnostic-launcher';
import {fetchProductionHealth} from '../modules/cobertura/phase48-v6-diagnostic-health';
import {readDatabaseUrl} from '../modules/cobertura/phase48-readonly-target';
import {verifiedProductionConfig,inspectProductionTls} from '../modules/cobertura/phase48-readonly-tls';
import {inspectReadCa} from '../modules/cobertura/phase48-readonly-tls';
import {scopedCapture} from '../modules/cobertura/phase48-scoped-repository';
import {v6Digests,V6_DIGESTS} from '../modules/cobertura/phase48-v6-contract';
import type {DiagnosticClient,DiagnosticTlsEvidence} from '../modules/cobertura/phase48-v6-read-query-diagnostic';
import {runReadQueryDiagnostic} from '../modules/cobertura/phase48-v6-read-query-diagnostic';

async function main(){
const args=parseDiagnosticLauncherArgs(process.argv.slice(2)),root=resolve(__dirname,'../..');
const precheck=()=>{
 const result=verifyDiagnosticOffline(root),ca=readFileSync(args.caPath),actual=createHash('sha256').update(ca).digest('hex');
 if(ca.length!==1367||actual!==args.caSha256||actual!=='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')throw Error('DIAGNOSTIC_CA_PIN_INVALID');
 const cert=inspectReadCa(ca);if(cert.sha256!==actual)throw Error('DIAGNOSTIC_CA_CERTIFICATE_INVALID');
 return {...result,ca_sha256:actual,ca_valid:true,client_version:process.versions.node};
};
let clientCount=0;
const outcome=await launchReadQueryDiagnostic({root,directory:args.directory,syncManuallyConfirmedFalse:true,precheck,health:()=>fetchProductionHealth({syncManuallyConfirmedFalse:true,timeoutMs:8000,maxBytes:65536}),readCredential:()=>readDatabaseUrl(readFileSync(args.credentialPath,'utf8')),
 async runInstrument({runId,credential,publish}){
  if(++clientCount>1)throw Error('DIAGNOSTIC_CONNECTION_LIMIT');
  const env={...process.env,PHASE48_SSL_ROOT_CERT_PATH:args.caPath,PHASE48_SSL_ROOT_CERT_SHA256:args.caSha256};
  const verified=verifiedProductionConfig(()=>credential,env);let native:Client|undefined;
  const api:DiagnosticClient={async connect(){native=new Client({...verified.config,query_timeout:10000,application_name:'phase48_read_query_diagnostic'});native.on('error',()=>{});await native.connect();},async query(sql,values){if(!native)throw Error('DIAGNOSTIC_CLIENT_NOT_CONNECTED');const result=await native.query(sql,values as any[]|undefined);return {rows:result.rows,rowCount:result.rowCount};},async end(){if(native)await native.end();}};
  return runReadQueryDiagnostic({directory:args.directory,runId,createClient:()=>{if(clientCount!==1)throw Error('DIAGNOSTIC_CONNECTION_LIMIT');return api;},validateTls:async()=>{
   if(!native)throw Error('DIAGNOSTIC_TLS_CLIENT_MISSING');const observed=inspectProductionTls(native);return {...observed,ca_pinned:observed.certificate_sha256===args.caSha256,authorization_error:observed.authorizationError} as unknown as DiagnosticTlsEvidence;
  },async capture(db){
   await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp');await db.query("SET LOCAL timezone='UTC'");await db.query("SET LOCAL statement_timeout='12s'");await db.query("SET LOCAL lock_timeout='2s'");
   const identity=(await db.query("SELECT current_setting('server_version') version,current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,current_database() database,pg_backend_pid() pid,pg_current_snapshot()::text snapshot,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_backend_pid() AND virtualxid IS NOT NULL LIMIT 1) virtual_tx")).rows[0];
   if(!/^17\./.test(identity?.version??'')||identity.database!=='postgres'||identity.read_only!=='on'||identity.isolation!=='repeatable read')throw Error('DIAGNOSTIC_SERVER_IDENTITY_INVALID');
   await db.query('SELECT current_database() database,current_user actor');
   const capture=await scopedCapture(db as any),digests=v6Digests(capture);if(capture.set.candidate_count!==740||Object.keys(digests).length!==17||Object.keys(digests).some((key,index)=>key!==V6_DIGESTS[index]))throw Error('DIAGNOSTIC_CAPTURE_MISMATCH');
   return {set:capture.set,digests,identity};
  },publish});
 }});
process.stdout.write(JSON.stringify(outcome)+'\n');
if(outcome.status!=='CAPTURED')process.exitCode=2;
}
main().catch(error=>{const code=(error as any)?.code;process.stderr.write(JSON.stringify({status:'STOPPED',code:typeof code==='string'?code:'DIAGNOSTIC_LAUNCH_FAILED'})+'\n');process.exitCode=1;});
