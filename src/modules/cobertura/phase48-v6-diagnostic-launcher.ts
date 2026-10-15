import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {publishAtomicReceipt} from './phase48-readonly-receipts';
import {fetchProductionHealth,type HealthSummary} from './phase48-v6-diagnostic-health';

export const DIAGNOSTIC_PINS=Object.freeze({diagnostic_runner_commit:'f9e9c53a4a0c8bbd9cfd7821d0d15b1c5667cbaa',readonly_runner_commit:'f9e9c53a4a0c8bbd9cfd7821d0d15b1c5667cbaa',mutator_commit:'58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911'});
export const EXPECTED_DIAGNOSTIC_BRANCH='fix/phase48-v6-diagnostic-metadata';
export const CERTIFIED_DIAGNOSTIC_BASE_HEAD='febba7042337fe9a0055f5e7882ac01640b59b06';
export const PRESERVED_INVALID_RECEIPT=Object.freeze({path:'reports/phase48-diagnostic-1a56c5bb-7c53-4acb-92d9-8cfbcac1e4dd.receipt.json',size:1402,sha256:'ca2688f45c0c7da7717c277163a45488a24ee0e8f7ba7c0cdbd4f704a6f5c2bb'});
export const PRESERVED_STOPPED_RECEIPT=Object.freeze({path:'reports/phase48-diagnostic-cb2fe336-7a88-4ac0-bd01-0021a224288f.receipt.json',size:1341,sha256:'6dbec67ff2bdf74dc48493f63894b352fdbae1793c9d617ecf09051f446dca89'});
export const LOCAL_CERTIFICATE=Object.freeze({path:'reports/phase48-v6-read-query-certificate-20261015T165906922Z-6b9eadce573b42fd84a265387903cf37.local.json',sha256:'24a8d02a55ce9096df2696cbe50d23a242c940f1d0723624fad6a53a47ee566e'});
export const PRIOR_LOCAL_CERTIFICATE=Object.freeze({path:'reports/phase48-v6-read-query-certificate-20261015T172112962Z-74c6cf3fd77f4f168f67436e3d304c60.local.json',size:2499,sha256:'4c9698e9c521031f0f4608f7abd0451aa56b313b8a1eef394772c1959b21c437'});
export const PRIOR_LOCAL_RECEIPT=Object.freeze({path:'reports/phase48-v6-read-query-20261015T172112962Z-74c6cf3fd77f4f168f67436e3d304c60.receipt.json',size:34378,sha256:'1bce3e9f2bf98391c4bfca68c635876316d9369bdd280c5f39d88f16bf85b00c'});
export const HISTORICAL_STOPPED_RECEIPTS=Object.freeze({status:'NOT_AVAILABLE' as const,blocking:false as const,expected_sha256:Object.freeze(['e5a71ee01913b1ef778a80854a4ba8d2ac46189f81c1ac87dc25d2adeb26d9a4','b6368989c72dd8b21ecd48e52b0495d066fd51e22dce98dfbe986761c73b481a'] as const)});
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const need:(ok:unknown,code:string)=>asserts ok=(ok,code)=>{if(!ok)throw Error(code);};
export function assertSha256Pin(expected:string,actual:string){
 need(/^[a-f0-9]{64}$/.test(expected),'DIAGNOSTIC_SHA256_PIN_INVALID');
 need(/^[a-f0-9]{64}$/i.test(actual),'DIAGNOSTIC_SHA256_ACTUAL_INVALID');
 const left=Buffer.from(expected,'hex'),right=Buffer.from(actual.toLowerCase(),'hex');
 need(left.length===32&&right.length===32&&timingSafeEqual(left,right),'DIAGNOSTIC_EVIDENCE_SHA_MISMATCH');
}
export function verifyPinnedFile(path:string,expectedSha256:string,expectedSize?:number){
 need(/^[a-f0-9]{64}$/.test(expectedSha256),'DIAGNOSTIC_SHA256_PIN_INVALID');
 const bytes=readFileSync(path);if(expectedSize!==undefined)need(bytes.length===expectedSize,'DIAGNOSTIC_EVIDENCE_SIZE_MISMATCH');
 assertSha256Pin(expectedSha256,hash(bytes));return {bytes:bytes.length,sha256:hash(bytes)};
}

export function parseDiagnosticLauncherArgs(args:string[]){
 const allowed=new Set(['mode','receipt-directory','credential-path','ca-path','ca-sha256','sync-manually-confirmed']);const out:Record<string,string>=Object.create(null);
 for(const arg of args){const m=/^--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)=(.+)$/.exec(arg);need(m!==null,'DIAGNOSTIC_ARGUMENT_INVALID');need(allowed.has(m[1]!)&&!Object.hasOwn(out,m[1]!), 'DIAGNOSTIC_ARGUMENT_INVALID');out[m[1]!]=m[2]!;}
 need(out.mode==='ProductiveDiagnostic','DIAGNOSTIC_MODE_REQUIRED');for(const key of ['receipt-directory','credential-path','ca-path','ca-sha256','sync-manually-confirmed'])need(!!out[key],'DIAGNOSTIC_ARGUMENT_REQUIRED');need(/^[a-f0-9]{64}$/i.test(out['ca-sha256']!), 'DIAGNOSTIC_CA_HASH_INVALID');need(out['sync-manually-confirmed']==='false','DIAGNOSTIC_SYNC_MANUAL_CONFIRMATION_REQUIRED');
 return {mode:'ProductiveDiagnostic' as const,directory:resolve(out['receipt-directory']!),credentialPath:resolve(out['credential-path']!),caPath:resolve(out['ca-path']!),caSha256:out['ca-sha256']!.toLowerCase()};
}

export interface DiagnosticGitState {branch:string;head:string;parentHead:string;remoteHead:string;remoteRef:string;trackedStatus:string}
export function validateDiagnosticGitState(state:DiagnosticGitState){
 need(state.branch===EXPECTED_DIAGNOSTIC_BRANCH,'DIAGNOSTIC_BRANCH_INVALID');
 need(/^[a-f0-9]{40}$/.test(state.head),'DIAGNOSTIC_HEAD_INVALID');
 need(state.parentHead===CERTIFIED_DIAGNOSTIC_BASE_HEAD,'DIAGNOSTIC_HEAD_NOT_CERTIFIED');
 need(state.remoteRef===`refs/heads/${EXPECTED_DIAGNOSTIC_BRANCH}`&&state.remoteHead===state.head,'DIAGNOSTIC_REMOTE_HEAD_MISMATCH');
 need(state.trackedStatus==='','DIAGNOSTIC_WORKTREE_DIRTY');
}
export function verifyDiagnosticOffline(root:string,exec=(file:string,args:string[])=>execFileSync(file,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})){
 const git=(...args:string[])=>exec('git',args).trim(),branch=git('branch','--show-current'),head=git('rev-parse','HEAD'),parentHead=git('rev-parse','HEAD^'),remoteLine=exec('git',['ls-remote','origin',`refs/heads/${EXPECTED_DIAGNOSTIC_BRANCH}`]).trim(),[remoteHead='',remoteRef='']=remoteLine.split(/\s+/),trackedStatus=git('status','--porcelain','--untracked-files=no');
 validateDiagnosticGitState({branch,head,parentHead,remoteHead,remoteRef,trackedStatus});
 for(const pin of Object.values(DIAGNOSTIC_PINS)){try{exec('git',['merge-base','--is-ancestor',pin,head]);}catch{throw Error('DIAGNOSTIC_PIN_NOT_ANCESTOR');}}
 for(const item of [{...PRESERVED_INVALID_RECEIPT},{...PRESERVED_STOPPED_RECEIPT},{...LOCAL_CERTIFICATE,size:undefined},{...PRIOR_LOCAL_CERTIFICATE},{...PRIOR_LOCAL_RECEIPT}])verifyPinnedFile(join(root,item.path),item.sha256,item.size);
 const diagnosticSource=readFileSync(join(root,'src/modules/cobertura/phase48-v6-read-query-diagnostic.ts'),'utf8');need(!/phase48-v6-(?:atomic|entry|production-host)|phase48-production-executor/.test(diagnosticSource),'DIAGNOSTIC_MUTATOR_REFERENCE_FORBIDDEN');
 return {branch,head,remote_verified:true,pins:{...DIAGNOSTIC_PINS},preserved_invalid_receipt:true,preserved_stopped_receipt:true,certificate_verified:true,mutator_imported:false,tracked_worktree_clean:true};
}

export interface LauncherReceipt {run_id:string;diagnostic_run_id:string;kind:'PHASE48_V6_READ_QUERY_DIAGNOSTIC';status:'STOPPED'|'CAPTURED';phase:string;final_status:string;precheck:any;health_attempted:boolean;health_validated:boolean;health:HealthSummary|null;credential_read_attempted:boolean;client_created:boolean;connect_attempted:boolean;tls_validated:boolean;transaction_started:boolean;query_id:string|null;rollback_attempted:boolean;rollback_confirmed:boolean;close_attempted:boolean;close_confirmed:boolean;connection_count:number;instrument:Record<string,unknown>|null;error_code:string|null;historical_stopped_receipts:typeof HISTORICAL_STOPPED_RECEIPTS;writes:0;mutator_invoked:false;nonce_generated:false;phrase_generated:false;pins:typeof DIAGNOSTIC_PINS}
export interface LauncherDependencies {root:string;directory:string;syncManuallyConfirmedFalse:true;precheck():unknown;health():Promise<HealthSummary>;readCredential():string;runInstrument(input:{runId:string;credential:string;publish:(directory:string,name:string,receipt:unknown)=>{path:string;sha256:string}}):Promise<{receipt:any;primary_error?:unknown}>;publish?:(directory:string,name:string,receipt:any,exclusive:boolean)=>string}
function sanitizeCode(error:unknown){const m=(error as any)?.message;return typeof m==='string'&&/^[A-Z0-9_:. -]{1,120}$/.test(m)?m.replace(/ /g,'_'):'DIAGNOSTIC_FAILED';}
export function validateDiagnosticLauncherReceipt(r:LauncherReceipt){need(r.kind==='PHASE48_V6_READ_QUERY_DIAGNOSTIC'&&/^phase48-diagnostic-[a-f0-9-]{36}$/.test(r.run_id)&&r.diagnostic_run_id===r.run_id.slice('phase48-diagnostic-'.length),'DIAGNOSTIC_RECEIPT_SCHEMA_INVALID');need(r.writes===0&&r.mutator_invoked===false&&r.nonce_generated===false&&r.phrase_generated===false&&r.connection_count<=1,'DIAGNOSTIC_RECEIPT_SCHEMA_INVALID');need(!r.health_validated||r.health?.http_status===200,'DIAGNOSTIC_RECEIPT_SCHEMA_INVALID');const h=r.historical_stopped_receipts;need(!!h&&h.status==='NOT_AVAILABLE'&&h.blocking===false&&Array.isArray(h.expected_sha256)&&h.expected_sha256.length===HISTORICAL_STOPPED_RECEIPTS.expected_sha256.length&&h.expected_sha256.every((value,index)=>value===HISTORICAL_STOPPED_RECEIPTS.expected_sha256[index]),'DIAGNOSTIC_HISTORICAL_RECEIPTS_SCHEMA_INVALID');}
function publishVerified(directory:string,name:string,receipt:LauncherReceipt){
 validateDiagnosticLauncherReceipt(receipt);const serialized=JSON.stringify(receipt,null,2)+'\n',bytes=Buffer.from(serialized,'utf8');JSON.parse(bytes.toString('utf8'));
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
  const receipt:LauncherReceipt={run_id:runId,diagnostic_run_id:diagnosticRunId,kind:'PHASE48_V6_READ_QUERY_DIAGNOSTIC',status:passed?'CAPTURED':'STOPPED',phase,final_status:passed?'DIAGNOSTIC_READ_COMPLETED':'STOPPED',precheck,health_attempted:healthAttempted,health_validated:healthValidated,health,credential_read_attempted:credentialReadAttempted,...state,instrument,error_code:errorCode,historical_stopped_receipts:HISTORICAL_STOPPED_RECEIPTS,writes:0,mutator_invoked:false,nonce_generated:false,phrase_generated:false,pins:{...DIAGNOSTIC_PINS}};
  const name=`${runId}.receipt.json`;try{const publisher=deps.publish??publishVerified;publishedPath=publisher(deps.directory,name,receipt,true);}catch(pub){if(!primary)primary=pub;}
 }
 if(primary&&!publishedPath)throw Object.assign(Error('DIAGNOSTIC_RECEIPT_PUBLICATION_FAILED'),{code:'DIAGNOSTIC_RECEIPT_PUBLICATION_FAILED',cause:primary});
 return {diagnostic_run_id:diagnosticRunId,receipt_path:publishedPath??join(deps.directory,`${runId}.receipt.json`),receipt_name:`${runId}.receipt.json`,status:instrument?.status==='CAPTURED'&&healthValidated?'CAPTURED':'STOPPED',error_code:errorCode};
}
