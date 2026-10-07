// No dotenv, application bootstrap, jobs, outbox, external synchronization or
// productive connection is loaded by default. This authorization is REVOKED.
import {Client} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {BACKUP_SHA,PROJECT_REF,PRODUCTION_AUTHORIZATION,executeAtomic,validateOptions,assertProductionUrl,type Options,type Flags} from '../modules/cobertura/phase48-production-executor';

async function main(){
 const args=process.argv.slice(2);const value=(name:string)=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
 const known=['--mode','--backup','--receipt-directory','--authorization-file','--target'];if(args.some(a=>!known.some(k=>a.startsWith(k+'='))))throw Error('UNKNOWN_ARGUMENT');
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const opts:Options={mode:value('--mode')??'PreflightOnly',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:BACKUP_SHA,commit,actualCommit:commit,projectRef:PROJECT_REF,runId:'phase48-'+randomUUID(),flags:{health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false}};
 opts.target=(value('--target')??(opts.mode==='MutateProduction'?'Production':'Local')) as Options['target'];
 if(opts.mode==='MutateProduction'||opts.target==='Production'){
  const approval=value('--authorization-file');if(!approval)throw Error('AUTHORIZATION_REVOKED');
  if(!approval.toLowerCase().endsWith('.json'))throw Error('AUTHORIZATION_FILE_FORMAT_INVALID');
  const grant=JSON.parse(readFileSync(approval,'utf8'));
  if((grant.authorization??PRODUCTION_AUTHORIZATION)!=='ACTIVE')throw Error('AUTHORIZATION_REVOKED');
  Object.assign(opts,{actor:grant.actor,empresa:grant.empresa,contrato:grant.contrato,expectedRows:grant.expectedRows,backupSha:grant.backupSha,commit:grant.commit,runId:grant.runId,projectRef:grant.projectRef,baseline:grant.baseline,confirmation:grant.confirmation,authorization:grant.authorization,authorizationIssuedAt:grant.authorizationIssuedAt,authorizationExpiresAt:grant.authorizationExpiresAt,enabled:process.env.PHASE48_PRODUCTION_EXECUTOR_ENABLED==='true'});
  opts.observeFlags=()=>productionFlags(grant.syncManualConfirmation===false);
  opts.saveBaseline=async()=>{throw Error('BASELINE_DESTINATION_NOT_CONFIGURED');};
  validateOptions(opts); // Static approval checks before public health or credentials.
  opts.flags=await opts.observeFlags();
 }
 // Reject productive authorization BEFORE reading any credentials or connecting.
 validateOptions(opts);
 if(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='fix/phase48-production-runner'||execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('CERTIFIED_CLEAN_BRANCH_REQUIRED');
 const backup=value('--backup');if(!backup||createHash('sha256').update(readFileSync(backup)).digest('hex')!==BACKUP_SHA)throw Error('BACKUP_SHA_INVALID');
 const dir=resolve(value('--receipt-directory')??'tmp/phase48-production-receipts');mkdirSync(dir,{recursive:true});
 const config=opts.mode==='MutateProduction'||opts.target==='Production'?productionConfig():{host:'127.0.0.1',port:55466,user:'modalidad_verifier',database:'phase48_production',password:'',connectionTimeoutMillis:5000,options:'-c timezone=UTC'};
 const db=new Client(config),observer=new Client(config);
 try{await db.connect();await observer.connect();opts.saveBaseline=async r=>{writeFileSync(resolve(dir,opts.runId+'.baseline.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx'});};const result=await executeAtomic(db,observer,opts);writeFileSync(resolve(dir,opts.runId+'.receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({run_id:opts.runId,status:result.status,reason:'reason' in result?result.reason:undefined}));if(!['READY','SUCCESS','ALREADY_APPLIED'].includes(result.status))process.exitCode=1;}
 finally{await db.end().catch(()=>{});await observer.end().catch(()=>{});delete process.env.PGPASSWORD;delete process.env.PRODUCTION_MIGRATION_DATABASE_URL;}
}
function productionConfig(){
 // Unreachable while authorization is REVOKED. No dotenv or credential shell.
 const url=process.env.PRODUCTION_MIGRATION_DATABASE_URL;if(!url)throw Error('TEMPORARY_CREDENTIAL_REQUIRED');assertProductionUrl(url);
 const u=new URL(url);
 // Do not let connection-string sslmode parameters override explicit TLS.
 return {host:u.hostname,port:Number(u.port),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:decodeURIComponent(u.pathname.slice(1)),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,options:'-c timezone=UTC'};
}
async function productionFlags(syncOff:boolean):Promise<Flags>{
 const r=await fetch('https://api.empiriasuite.com/api/health',{signal:AbortSignal.timeout(15000)}),body=await r.json(),data=body.data,outbox=data?.integracion_outbox;
 return {health200:r.status===200&&body.success===true,databaseOk:data?.database?.status==='ok',outbox:outbox?.configured!==false||outbox?.enabled!==false,sync:!syncOff||outbox?.sync_enabled===true||outbox?.sync?.enabled===true,recalc:outbox?.recalc?.requested!==false||outbox?.recalc?.active!==false,worker:outbox?.started!==false||outbox?.running!==false};
}
main().catch(e=>{delete process.env.PGPASSWORD;delete process.env.PRODUCTION_MIGRATION_DATABASE_URL;console.error(JSON.stringify({status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CONNECTION_OR_CONFIGURATION_ERROR',sqlstate:e.code}));process.exitCode=1;});
