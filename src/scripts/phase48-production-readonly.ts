// Dedicated read-only entry: no mutation dispatcher, approval or enabling flags.
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runReadOnlyLifecycle,validateReadOptions,READ_BACKUP_SHA,READ_PROJECT_REF,type ReadFlags} from '../modules/cobertura/phase48-readonly-preflight';
import {saveReadReceipt} from '../modules/cobertura/phase48-readonly-receipts';
async function main(){
 const args=process.argv.slice(2),known=['--mode','--target','--backup','--credential-file','--receipt-directory','--sync-manually-confirmed-off','--local-observation-file'];
 if(args.some(a=>!known.some(k=>a.startsWith(k+'=')))||new Set(args.map(a=>a.split('=')[0])).size!==args.length)throw Error('READ_ARGUMENT_NOT_ALLOWED');
 const value=(name:string)=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const target=(value('--target')??'Local') as 'Local'|'Production';
 const options={mode:value('--mode')??'PreflightAndPreview',target,commit,backupSha:READ_BACKUP_SHA,observeFlags:async()=>{
  if(target==='Production')return health(value('--sync-manually-confirmed-off')==='true');
  const file=value('--local-observation-file');if(!file)throw Error('LOCAL_OBSERVATION_REQUIRED');return JSON.parse(readFileSync(file,'utf8'));
 }};
 validateReadOptions(options); // Unknown modes fail before files, health or transport.
 const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(s=>s&&s!=='?? reports/phase48-production-preflight-current.json');
 if(branch!=='fix/phase48-readonly-preflight-contract'||dirty.length)throw Error('CLEAN_READ_BRANCH_REQUIRED');
 execFileSync('git',['merge-base','--is-ancestor','b3b61f6',commit],{stdio:'ignore'});
 execFileSync('git',['diff','--exit-code','dcbd37a',commit,'--','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-historical-controlled.ts','src/modules/cobertura/phase48-historical-domain.ts','src/scripts/phase48-historical-production.ts','sql/phase-48-operational-assignment-identities.sql'],{stdio:'ignore'});
 if(target==='Production'&&value('--receipt-directory'))throw Error('PRODUCTION_RECEIPT_PATH_FIXED');
 const backup=value('--backup');if(!backup||createHash('sha256').update(readFileSync(backup)).digest('hex')!==READ_BACKUP_SHA)throw Error('BACKUP_SHA_INVALID');
 // This entry never loads dotenv automatically. A future read-only invocation
 // may explicitly provide an authorized credential file, read only in memory.
 let config:any={host:'127.0.0.1',port:55466,user:'modalidad_verifier',database:'phase48_production',password:'',options:'-c default_transaction_read_only=on -c timezone=UTC'};
 if(target==='Production'){
  if(value('--sync-manually-confirmed-off')!=='true')throw Error('CURRENT_MANUAL_SYNC_CONFIRMATION_REQUIRED');
  const file=value('--credential-file');if(!file)throw Error('READ_CREDENTIAL_REQUIRED');
  const match=readFileSync(file,'utf8').match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m);if(!match)throw Error('READ_CREDENTIAL_REQUIRED');
  const u=new URL(match[1]!.replace(/^(['"])(.*)\1$/,'$2'));
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.port!=='5432'||decodeURIComponent(u.pathname)!=='/postgres'||!(u.hostname===`db.${READ_PROJECT_REF}.supabase.co`||u.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(u.username)===`postgres.${READ_PROJECT_REF}`))throw Error('READ_PROJECT_TARGET_INVALID');
  config={host:u.hostname,port:Number(u.port),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:'postgres',ssl:{rejectUnauthorized:true},options:'-c default_transaction_read_only=on -c timezone=UTC'};
 }else if(value('--credential-file'))throw Error('LOCAL_CREDENTIAL_FILE_FORBIDDEN');
 const pool=new Pool({...config,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000});pool.on('error',()=>{});
 try{
  const receipt=await runReadOnlyLifecycle(async()=>{const client=await pool.connect();return {client,close:async()=>{client.release(true);}};},options);
  const path=saveReadReceipt(target==='Production'?'reports':value('--receipt-directory')??'tmp/phase48-production-receipts',receipt);
  console.log(JSON.stringify({status:receipt.status,run_id:receipt.run_id,receipt:path,reason:receipt.reason,writes:0}));if(receipt.status!=='PENDIENTE_DE_AUTORIZACION')process.exitCode=1;
 }finally{await pool.end();delete process.env.PGPASSWORD;delete process.env.PRODUCTION_MIGRATION_DATABASE_URL;}
}
async function health(syncOff:boolean):Promise<ReadFlags>{
 const response=await fetch('https://api.empiriasuite.com/api/health',{signal:AbortSignal.timeout(15000)}),body=await response.json(),data=body.data,outbox=data?.integracion_outbox;
 if(response.status!==200||body.success!==true||data?.database?.status!=='ok'||!outbox||typeof outbox.configured!=='boolean'||typeof outbox.enabled!=='boolean'||typeof outbox.started!=='boolean'||typeof outbox.running!=='boolean'||typeof outbox.recalc?.requested!=='boolean'||typeof outbox.recalc?.active!=='boolean')throw Error('FLAGS_UNAVAILABLE_OR_UNSAFE');
 return {health200:true,databaseOk:true,outbox:outbox.configured||outbox.enabled,sync:!syncOff||outbox.sync_enabled===true||outbox.sync?.enabled===true,recalc:outbox.recalc.requested||outbox.recalc.active,worker:outbox.started||outbox.running};
}
main().catch(e=>{delete process.env.PGPASSWORD;delete process.env.PRODUCTION_MIGRATION_DATABASE_URL;console.error(JSON.stringify({status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_TRANSPORT_OR_CONFIGURATION_FAILED',writes:0}));process.exitCode=1;});
