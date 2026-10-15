import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {publishAtomicReceipt} from './phase48-readonly-receipts';
import {fetchProductionHealth,type HealthSummary} from './phase48-v6-diagnostic-health';

export const DIAGNOSTIC_PINS=Object.freeze({diagnostic_runner_commit:'0160238c317637196bb38c8abde1ced5e4737339',readonly_runner_commit:'154dbdaf01d75685c6306a81a92bf7ab11a69585',mutator_commit:'58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911'});
export const PRESERVED_INVALID_RECEIPT=Object.freeze({path:'reports/phase48-diagnostic-1a56c5bb-7c53-4acb-92d9-8cfbcac1e4dd.receipt.json',size:1402,sha256:'ca2688f45c0c7da7717c277163a45488a24ee0e8f7ba7c0cdbd4f704a6f5c2bb'});
export const LOCAL_CERTIFICATE=Object.freeze({path:'reports/phase48-v6-read-query-certificate-20261015T162859144Z-3ecc13c737384db89363cbbe05b3485f.local.json',sha256:'24688bf41e0751f223defd72afd9c0f2b1275485bd44b3cb9ec00edaa389a1d'});
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const need:(ok:unknown,code:string)=>asserts ok=(ok,code)=>{if(!ok)throw Error(code);};

export function parseDiagnosticLauncherArgs(args:string[]){
 const allowed=new Set(['mode','receipt-directory','credential-path','ca-path','ca-sha256','sync-manually-confirmed']);const out:Record<string,string>=Object.create(null);
 for(const arg of args){const m=/^--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)=(.+)$/.exec(arg);need(m!==null,'DIAGNOSTIC_ARGUMENT_INVALID');need(allowed.has(m[1]!)&&!Object.hasOwn(out,m[1]!), 'DIAGNOSTIC_ARGUMENT_INVALID');out[m[1]!]=m[2]!;}
 need(out.mode==='ProductiveDiagnostic','DIAGNOSTIC_MODE_REQUIRED');for(const key of ['receipt-directory','credential-path','ca-path','ca-sha256','sync-manually-confirmed'])need(!!out[key],'DIAGNOSTIC_ARGUMENT_REQUIRED');need(/^[a-f0-9]{64}$/i.test(out['ca-sha256']!), 'DIAGNOSTIC_CA_HASH_INVALID');need(out['sync-manually-confirmed']==='false','DIAGNOSTIC_SYNC_MANUAL_CONFIRMATION_REQUIRED');
 return {mode:'ProductiveDiagnostic' as const,directory:resolve(out['receipt-directory']!),credentialPath:resolve(out['credential-path']!),caPath:resolve(out['ca-path']!),caSha256:out['ca-sha256']!.toLowerCase()};
}

export function verifyDiagnosticOffline(root:string,exec=(file:string,args:string[])=>execFileSync(file,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})){
 const git=(...args:string[])=>exec('git',args).trim();
 need(git('branch','--show-current')==='fix/phase48-v6-diagnostic-launcher','DIAGNOSTIC_BRANCH_INVALID');
 const head=git('rev-parse','HEAD');need(/^[a-f0-9]{40}$/.test(head),'DIAGNOSTIC_HEAD_INVALID');
 for(const pin of Object.values(DIAGNOSTIC_PINS)){try{execFileSync('git',['merge-base','--is-ancestor',pin,head],{cwd:root,stdio:'ignore'});}catch{throw Error('DIAGNOSTIC_PIN_NOT_ANCESTOR');}}
 const status=git('status','--porcelain','--untracked-files=all').split(/\r?\n/).filter(Boolean);
 need(status.every(line=>line==='?? '+PRESERVED_INVALID_RECEIPT.path),'DIAGNOSTIC_WORKTREE_DIRTY');
 for(const item of [{...PRESERVED_INVALID_RECEIPT,size:1402},{...LOCAL_CERTIFICATE,size:undefined}]){const bytes=readFileSync(join(root,item.path));if(typeof item.size==='number')need(bytes.length===item.size,'DIAGNOSTIC_EVIDENCE_SIZE_MISMATCH');need(hash(bytes)===item.sha256,'DIAGNOSTIC_EVIDENCE_SHA_MISMATCH');}
 const diagnosticSource=readFileSync(join(root,'src/modules/cobertura/phase48-v6-read-query-diagnostic.ts'),'utf8');need(!/phase48-v6-(?:atomic|entry|production-host)|phase48-production-executor/.test(diagnosticSource),'DIAGNOSTIC_MUTATOR_REFERENCE_FORBIDDEN');
 return {branch:'fix/phase48-v6-diagnostic-launcher',head,pins:{...DIAGNOSTIC_PINS},preserved_invalid_receipt:true,certificate_verified:true,mutator_imported:false,working_tree_clean_except_preserved_receipt:true};
}

export interface LauncherReceipt {run_id:string;diagnostic_run_id:string;kind:'PHASE48_V6_READ_QUERY_DIAGNOSTIC';status:'STOPPED'|'CAPTURED';phase:string;final_status:string;precheck:any;health_attempted:boolean;health_validated:boolean;health:HealthSummary|null;credential_read_attempted:boolean;client_created:boolean;connect_attempted:boolean;tls_validated:boolean;transaction_started:boolean;query_id:string|null;rollback_attempted:boolean;rollback_confirmed:boolean;close_attempted:boolean;close_confirmed:boolean;connection_count:number;instrument:Record<string,unknown>|null;error_code:string|null;writes:0;mutator_invoked:false;nonce_generated:false;phrase_generated:false;pins:typeof DIAGNOSTIC_PINS}
export interface LauncherDependencies {root:string;directory:string;syncManuallyConfirmedFalse:true;precheck():unknown;health():Promise<HealthSummary>;readCredential():string;runInstrument(input:{runId:string;credential:string;publish:(directory:string,name:string,receipt:unknown)=>{path:string;sha256:string}}):Promise<{receipt:any;primary_error?:unknown}>;publish?:(directory:string,name:string,receipt:any,exclusive:boolean)=>string}
function sanitizeCode(error:unknown){const m=(error as any)?.message;return typeof m==='string'&&/^[A-Z0-9_:. -]{1,120}$/.test(m)?m.replace(/ /g,'_'):'DIAGNOSTIC_FAILED';}
function validateReceipt(r:LauncherReceipt){need(r.kind==='PHASE48_V6_READ_QUERY_DIAGNOSTIC'&&/^phase48-diagnostic-[a-f0-9-]{36}$/.test(r.run_id)&&r.diagnostic_run_id===r.run_id.slice('phase48-diagnostic-'.length),'DIAGNOSTIC_RECEIPT_SCHEMA_INVALID');need(r.writes===0&&r.mutator_invoked===false&&r.nonce_generated===false&&r.phrase_generated===false&&r.connection_count<=1,'DIAGNOSTIC_RECEIPT_SCHEMA_INVALID');need(!r.health_validated||r.health?.http_status===200,'DIAGNOSTIC_RECEIPT_SCHEMA_INVALID');}
function publishVerified(directory:string,name:string,receipt:LauncherReceipt){
 validateReceipt(receipt);const serialized=JSON.stringify(receipt,null,2)+'\n',bytes=Buffer.from(serialized,'utf8');JSON.parse(bytes.toString('utf8'));
 const path=publishAtomicReceipt(directory,name,receipt,{exclusive:true});const stored=readFileSync(path);need(stored.length===bytes.length&&hash(stored)===hash(bytes)&&stored.equals(bytes),'DIAGNOSTIC_RECEIPT_VERIFY_FAILED');need(stored.at(-1)===10&&stored.at(-2)!==13,'DIAGNOSTIC_RECEIPT_LF_INVALID');JSON.parse(stored.toString('utf8'));return path;
}
export async function launchReadQueryDiagnostic(deps:LauncherDependencies){
 const diagnosticRunId=randomUUID(),runId=`phase48-diagnostic-${diagnosticRunId}`;let precheck:any=null,health:HealthSummary|null=null,healthAttempted=false,healthValidated=false,credentialReadAttempted=false,instrument:LauncherReceipt['instrument']=null,phase='precheck',errorCode:string|null=null,primary:any;
 let publishedPath:string|undefined;
 let state={client_created:false,connect_attempted:false,tls_validated:false,transaction_started:false,query_id:null as string|null,rollback_attempted:false,rollback_confirmed:false,close_attempted:false,close_confirmed:false,connection_count:0};
 try{
  precheck=deps.precheck();phase='health';healthAttempted=true;health=await deps.health();healthValidated=true;
  phase='credential';credentialReadAttempted=true;const credential=deps.readCredential();need(typeof credential==='string'&&credential.length>0,'DIAGNOSTIC_CREDENTIAL_REQUIRED');
  phase='read_query';let captured:any;const result=await deps.runInstrument({runId:diagnosticRunId,credential,publish(_d,_n,r){captured=r;return {path:'deferred-to-launcher',sha256:'0'.repeat(64)};}});instrument=captured??result.receipt;
  const ir=result.receipt;state={client_created:ir.client_created,connect_attempted:ir.connect_attempted,tls_validated:ir.tls_validated,transaction_started:ir.transaction_started,query_id:ir.query_id,rollback_attempted:ir.rollback_attempted,rollback_confirmed:ir.rollback_confirmed,close_attempted:ir.client_end_attempted,close_confirmed:ir.client_closed,connection_count:ir.connection_count};
  errorCode=ir.operation_error?.error_type?sanitizeCode({message:ir.operation_error.error_type}):null;
 }catch(e){primary=e;errorCode=sanitizeCode(e);}
 finally{
  const passed=!!healthValidated&&!!instrument&&instrument.status==='CAPTURED'&&instrument.operation_error==null&&instrument.tls_validated===true&&instrument.transaction_started===true&&instrument.rollback_confirmed===true&&instrument.client_closed===true;
  const receipt:LauncherReceipt={run_id:runId,diagnostic_run_id:diagnosticRunId,kind:'PHASE48_V6_READ_QUERY_DIAGNOSTIC',status:passed?'CAPTURED':'STOPPED',phase,final_status:passed?'DIAGNOSTIC_READ_COMPLETED':'STOPPED',precheck,health_attempted:healthAttempted,health_validated:healthValidated,health,credential_read_attempted:credentialReadAttempted,...state,instrument,error_code:errorCode,writes:0,mutator_invoked:false,nonce_generated:false,phrase_generated:false,pins:{...DIAGNOSTIC_PINS}};
  const name=`${runId}.receipt.json`;try{const publisher=deps.publish??publishVerified;publishedPath=publisher(deps.directory,name,receipt,true);}catch(pub){if(!primary)primary=pub;}
 }
 if(primary&&!publishedPath)throw Object.assign(Error('DIAGNOSTIC_RECEIPT_PUBLICATION_FAILED'),{code:'DIAGNOSTIC_RECEIPT_PUBLICATION_FAILED',cause:primary});
 return {diagnostic_run_id:diagnosticRunId,receipt_path:publishedPath??join(deps.directory,`${runId}.receipt.json`),receipt_name:`${runId}.receipt.json`,status:instrument?.status==='CAPTURED'&&healthValidated?'CAPTURED':'STOPPED',error_code:errorCode};
}
