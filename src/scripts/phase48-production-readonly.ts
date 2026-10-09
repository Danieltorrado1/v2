// Dedicated read-only entry: no mutation dispatcher, approval or enabling flags.
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runReadOnlyLifecycle,validateReadOptions,READ_BACKUP_SHA,READ_PROJECT_REF,type ReadFlags} from '../modules/cobertura/phase48-readonly-preflight';
import {CERTIFICATE_SHA256,MUTATOR_COMMIT,assertCertifiedContract} from '../modules/cobertura/phase48-readonly-contract';
import {saveReadReceipt} from '../modules/cobertura/phase48-readonly-receipts';
import {readDatabaseUrl} from '../modules/cobertura/phase48-readonly-target';
import {verifiedProductionConfig,clearReadTlsEnvironment} from '../modules/cobertura/phase48-readonly-tls';
async function main(){
 const args=process.argv.slice(2),known=['--mode','--target','--backup','--credential-file','--receipt-directory','--sync-manually-confirmed-off','--local-observation-file'];
 if(args.some(a=>!known.some(k=>a.startsWith(k+'=')))||new Set(args.map(a=>a.split('=')[0])).size!==args.length)throw Error('READ_ARGUMENT_NOT_ALLOWED');
 const value=(name:string)=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const target=(value('--target')??'Local') as 'Local'|'Production';
 const options={mode:value('--mode')??'PreflightAndPreview',target,commit,backupSha:READ_BACKUP_SHA,certificateSha:CERTIFICATE_SHA256,observeFlags:async()=>{
  if(target==='Production')return health(value('--sync-manually-confirmed-off')==='true');
  const file=value('--local-observation-file');if(!file)throw Error('LOCAL_OBSERVATION_REQUIRED');return JSON.parse(readFileSync(file,'utf8'));
 }};
 validateReadOptions(options); // Unknown modes fail before files, health or transport.
 const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(s=>s&&s!=='?? reports/phase48-production-preflight-current.json'&&!/^\?\? reports\/phase48-consumed-[a-f0-9]{64}\.json$/.test(s));
 if(branch!=='fix/phase48-atomic-receipt'||dirty.length)throw Error('CLEAN_READ_BRANCH_REQUIRED');
 execFileSync('git',['merge-base','--is-ancestor','b653184',commit],{stdio:'ignore'});
 assertCertifiedContract(commit);
 execFileSync('git',['diff','--exit-code',MUTATOR_COMMIT,commit,'--','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-historical-controlled.ts','src/modules/cobertura/phase48-historical-domain.ts','src/scripts/phase48-historical-production.ts','sql/phase-48-operational-assignment-identities.sql','src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-production-authorization.ts'],{stdio:'ignore'});
 if(target==='Production'&&value('--receipt-directory'))throw Error('PRODUCTION_RECEIPT_PATH_FIXED');
 const backup=value('--backup');if(!backup||createHash('sha256').update(readFileSync(backup)).digest('hex')!==READ_BACKUP_SHA)throw Error('BACKUP_SHA_INVALID');
 // This entry never loads dotenv automatically. A future read-only invocation
 // may explicitly provide an authorized credential file, read only in memory.
 let tlsEvidence:any=null;
 let config:any={host:'127.0.0.1',port:55466,user:'modalidad_verifier',database:'phase48_production',password:'',options:'-c default_transaction_read_only=on -c timezone=UTC'};
 if(target==='Production'){
  if(value('--sync-manually-confirmed-off')!=='true')throw Error('CURRENT_MANUAL_SYNC_CONFIRMATION_REQUIRED');
  const file=value('--credential-file');if(!file)throw Error('READ_CREDENTIAL_REQUIRED');
  const verified=verifiedProductionConfig(()=>readDatabaseUrl(readFileSync(file,'utf8')));config=verified.config;tlsEvidence=verified.tls;
  // Transaction pooler: all required settings are set within the transaction.
  delete config.options;
 }else if(value('--credential-file'))throw Error('LOCAL_CREDENTIAL_FILE_FORBIDDEN');
 const pool=new Pool({...config,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});pool.on('error',()=>{});
 let poolClosed=false;
 try{
  const receipt=await runReadOnlyLifecycle(async()=>{const client=await pool.connect();return {client,close:async()=>{client.release(true);}};},options);
  try{await pool.end();poolClosed=true;receipt.pool_closed=true;}catch{Object.assign(receipt,{status:'STOPPED_DRIFT',reason:'POOL_CLOSE_FAILED',stable:false,authorization_status:'REVOCADA',authorization_phrase:null,nonce:null,expires_at:null,pool_closed:false});}
  if(tlsEvidence)receipt.tls={...tlsEvidence,protocol:receipt.postgresql?.ssl?'TLSv1.3':null};
  const path=saveReadReceipt(target==='Production'?'reports':value('--receipt-directory')??'tmp/phase48-production-receipts',receipt);
  console.log(JSON.stringify({status:receipt.status,run_id:receipt.run_id,receipt:path,reason:receipt.reason,writes:0}));if(receipt.status!=='PENDIENTE_DE_AUTORIZACION')process.exitCode=1;
 }finally{if(!poolClosed)await pool.end();clearReadTlsEnvironment();}
}
async function health(syncOff:boolean):Promise<ReadFlags>{
 const response=await fetch('https://api.empiriasuite.com/api/health',{signal:AbortSignal.timeout(15000)}),body=await response.json(),data=body.data,outbox=data?.integracion_outbox;
 if(response.status!==200||body.success!==true||data?.database?.status!=='ok'||!outbox||typeof outbox.configured!=='boolean'||typeof outbox.enabled!=='boolean'||typeof outbox.started!=='boolean'||typeof outbox.running!=='boolean'||typeof outbox.recalc?.requested!=='boolean'||typeof outbox.recalc?.active!=='boolean')throw Error('FLAGS_UNAVAILABLE_OR_UNSAFE');
 return {health200:true,databaseOk:true,outbox:outbox.configured||outbox.enabled,sync:!syncOff||outbox.sync_enabled===true||outbox.sync?.enabled===true,recalc:outbox.recalc.requested||outbox.recalc.active,worker:outbox.started||outbox.running};
}
main().catch(e=>{clearReadTlsEnvironment();console.error(JSON.stringify({status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_TRANSPORT_OR_CONFIGURATION_FAILED',writes:0}));process.exitCode=1;});
