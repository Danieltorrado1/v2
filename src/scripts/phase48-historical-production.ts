// No dotenv, application bootstrap, jobs, outbox, external synchronization or
// productive connection is loaded by default. This authorization is REVOKED.
import {Client} from 'pg';
import {verifiedProductionConfig,clearReadTlsEnvironment} from '../modules/cobertura/phase48-readonly-tls';
import {parseProductionGrant} from '../modules/cobertura/phase48-production-authorization';
import {consumeCurrentNonce,validateCurrentNonce,publishAtomicReceipt} from '../modules/cobertura/phase48-readonly-receipts';
import {MUTATOR_COMMIT,assertCertifiedContract} from '../modules/cobertura/phase48-readonly-contract';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {BACKUP_SHA,PROJECT_REF,PRODUCTION_AUTHORIZATION,executeAtomic,validateOptions,validatePreconnectionOptions,assertProductionUrl,type Options,type Flags} from '../modules/cobertura/phase48-production-executor';

async function main(){
 const args=process.argv.slice(2);const value=(name:string)=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
 const known=['--mode','--backup','--receipt-directory','--authorization-file','--target'];if(args.some(a=>!known.some(k=>a.startsWith(k+'=')))||new Set(args.map(a=>a.split('=')[0])).size!==args.length)throw Error('UNKNOWN_ARGUMENT');
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const opts:Options={mode:value('--mode')??'PreflightOnly',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:BACKUP_SHA,commit,actualCommit:commit,projectRef:PROJECT_REF,runId:'phase48-'+randomUUID(),flags:{health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false}};
 opts.target=(value('--target')??(opts.mode==='MutateProduction'?'Production':'Local')) as Options['target'];
 if(opts.mode==='MutateProduction'||opts.target==='Production'){
  const approval=value('--authorization-file');if(!approval)throw Error('AUTHORIZATION_REVOKED');
  if(!approval.toLowerCase().endsWith('.json'))throw Error('AUTHORIZATION_FILE_FORMAT_INVALID');
  const grant=parseProductionGrant(readFileSync(approval,'utf8'));
  validateCurrentNonce(JSON.parse(readFileSync('reports/phase48-production-preflight-current.json','utf8')),grant.authorizationPhrase);
  if((grant.authorization??PRODUCTION_AUTHORIZATION)!=='ACTIVE')throw Error('AUTHORIZATION_REVOKED');
  Object.assign(opts,{actor:grant.actor,empresa:grant.empresa,contrato:grant.contrato,expectedRows:grant.expectedRows,backupSha:grant.backupSha,commit:grant.commit,runId:grant.runId,projectRef:grant.projectRef,baseline:grant.baseline,confirmation:grant.confirmation,authorization:grant.authorization,authorizationIssuedAt:grant.authorizationIssuedAt,authorizationExpiresAt:grant.authorizationExpiresAt,certificateSha:grant.certificate_sha256,authorizationPhrase:grant.authorizationPhrase,nonceConsumed:false,enabled:process.env.PHASE48_PRODUCTION_EXECUTOR_ENABLED==='true'});
  opts.observeFlags=()=>productionFlags(grant.syncManualConfirmation===false);
  opts.saveBaseline=async()=>{throw Error('BASELINE_DESTINATION_NOT_CONFIGURED');};
  validatePreconnectionOptions(opts); // Static approval checks before public health or credentials.
  opts.flags=await opts.observeFlags();
 }
 // Reject productive authorization BEFORE reading any credentials or connecting.
 validatePreconnectionOptions(opts);
 if(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='fix/phase48-schema-identity-forensic'||execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(line=>line&&line!=='?? reports/phase48-production-preflight-current.json'&&!/^\?\? reports\/phase48-consumed-[a-f0-9]{64}\.json$/.test(line)).length)throw Error('CERTIFIED_CLEAN_BRANCH_REQUIRED');
 assertCertifiedContract(commit);
 execFileSync('git',['diff','--exit-code',MUTATOR_COMMIT,commit,'--','src/modules/cobertura/phase48-production-executor.ts','src/scripts/phase48-historical-production.ts','src/modules/cobertura/phase48-readonly-schema-catalog.ts','src/modules/cobertura/phase48-readonly-schema-identity.ts','src/modules/cobertura/phase48-readonly-schema-scope.ts','src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-production-authorization.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-historical-domain.ts','src/modules/cobertura/phase48-historical-controlled.ts','sql/phase-48-operational-assignment-identities.sql'],{stdio:'ignore'});
 const backup=value('--backup');if(!backup||createHash('sha256').update(readFileSync(backup)).digest('hex')!==BACKUP_SHA)throw Error('BACKUP_SHA_INVALID');
 const dir=value('--receipt-directory')??'tmp/phase48-production-receipts';
 const config=opts.mode==='MutateProduction'||opts.target==='Production'?productionConfig():{host:'127.0.0.1',port:55466,user:'modalidad_verifier',database:'phase48_production',password:'',connectionTimeoutMillis:5000,options:'-c timezone=UTC'};
 if(opts.mode==='MutateProduction'){consumeCurrentNonce('reports',opts.authorizationPhrase!);opts.nonceConsumed=true;validateOptions(opts);}
 const db=new Client(config),observer=new Client(config);
 try{
  let result;
  try{await db.connect();await observer.connect();opts.saveBaseline=async r=>{publishAtomicReceipt(dir,opts.runId+'.baseline.json',r);};result=await executeAtomic(db,observer,opts);}
  catch(e){const error=e as Error & {code?:string};result={status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(error.message)?error.message:'CONNECTION_OR_CONFIGURATION_ERROR',sqlstate:error.code};}
  publishAtomicReceipt(dir,opts.runId+'.receipt.json',{...result,run_id:opts.runId});
  console.log(JSON.stringify({run_id:opts.runId,status:result.status,reason:'reason' in result?result.reason:undefined}));if(!['READY','SUCCESS','ALREADY_APPLIED'].includes(result.status))process.exitCode=1;
 }
 finally{await db.end().catch(()=>{});await observer.end().catch(()=>{});clearReadTlsEnvironment();}
}
function productionConfig(){
 // Unreachable while authorization is REVOKED. No dotenv or credential shell.
 return verifiedProductionConfig(()=>{const url=process.env.PRODUCTION_MIGRATION_DATABASE_URL;if(!url)throw Error('TEMPORARY_CREDENTIAL_REQUIRED');assertProductionUrl(url);return url;}).config;
}
async function productionFlags(syncOff:boolean):Promise<Flags>{
 const r=await fetch('https://api.empiriasuite.com/api/health',{signal:AbortSignal.timeout(15000)}),body=await r.json(),data=body.data,outbox=data?.integracion_outbox;
 return {health200:r.status===200&&body.success===true,databaseOk:data?.database?.status==='ok',outbox:outbox?.configured!==false||outbox?.enabled!==false,sync:!syncOff||outbox?.sync_enabled===true||outbox?.sync?.enabled===true,recalc:outbox?.recalc?.requested!==false||outbox?.recalc?.active!==false,worker:outbox?.started!==false||outbox?.running!==false};
}
main().catch(e=>{clearReadTlsEnvironment();console.error(JSON.stringify({status:'STOPPED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CONNECTION_OR_CONFIGURATION_ERROR',sqlstate:e.code}));process.exitCode=1;});
