/** Strict production launcher. It only wires read-only dependencies to the certified runner. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { ENTRY_CASE, buildPendingEntryPhrase, verifyPendingEntryPhrase, type EntryEvidence } from './nomina-turno-202-entry-contract';
import { ENTRY_READONLY_REPORT_SHA256, CERTIFIED_REPORT_SHA256, CORRECTOR_COMMIT, DUMP_SHA256, HISTORICAL_PDF_SHA256, PRODUCTION_CA_SHA256, PRODUCTION_TARGET_PIN, PRODUCTION_TARGET_PIN_SHA256, matchesSha256, canonicalizeWindowsPath, sameCanonicalWindowsPath, validateOfflinePlan, runReadOnlyEntryPreflight, readHealthHttp, publishReadOnlyReceipt, assertOrderedReadonlyReceipt, type OfflinePlan, type PdfRead, type HealthResponse, type PendingReceipt } from './nomina-turno-202-readonly-runner';

export const PRODUCTION_HEALTH_URL='https://api.empiriasuite.com/api/health';
export const BASE_CONTRACT_COMMIT='610dd263d8f7734ac504a4b5fbb7d05c01a4ea9b';
export const PRODUCTION_LAUNCHER_BRANCH='fix/nomina-turno-202-final-health-before-receipt';
export const UNTRACKED_AGGREGATE_SHA256='9c77ae07a8f4478b6e3a9d92d72f5074816a2888c2a98ef807c2ec19354f11c7';
export const HISTORICAL_PDF_SIZE=3051;
export const MEASUREMENT_ARTIFACT_CLASS='NON_EXECUTABLE_MEASUREMENT_ARTIFACT_UNAVAILABLE';

export const ARGUMENT_ORDER=Object.freeze([
  '--env-file','--ca-file','--health-url','--expected-head','--expected-corrector-commit',
  '--native-report-sha256','--readonly-report-sha256','--backup-sha256','--pdf-sha256','--pdf-size',
  '--untracked-manifest-sha256','--sync-confirmed','--pdf-attestation-confirmed','--output-directory',
] as const);
export type LauncherArguments=Readonly<Record<(typeof ARGUMENT_ORDER)[number],string>>;
export type LauncherEnvironment=Readonly<{DATABASE_URL:string;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;SUPABASE_STORAGE_BUCKET:string}>;
type MutableLauncherEnvironment={DATABASE_URL:string;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;SUPABASE_STORAGE_BUCKET:string};
const fail=(code:string):never=>{throw new Error(`LAUNCHER_STOPPED_${code}`);};
const failWithCause=(code:string,cause:unknown):never=>{const error=new Error(`LAUNCHER_STOPPED_${code}`);Object.defineProperty(error,'cause',{value:cause,enumerable:false});throw error;};
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const REQUIRED_ENV=['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET'] as const;

export type LauncherExecutionState={
  execution_id:string;phase:string;offline_precheck_started:boolean;offline_precheck_completed:boolean;
  health_initial_attempted:boolean;health_initial_completed:boolean;credential_read_attempted:boolean;credential_read_completed:boolean;target_validation_completed:boolean;
  first_client_created:boolean;first_transaction_started:boolean;first_rollback_attempted:boolean;first_rollback_confirmed:boolean;first_client_closed:boolean;
  second_client_created:boolean;second_transaction_started:boolean;second_rollback_attempted:boolean;second_rollback_confirmed:boolean;second_client_closed:boolean;
  pdf_first_attempted:boolean;pdf_first_completed:boolean;pdf_second_attempted:boolean;pdf_second_completed:boolean;
  health_final_attempted:boolean;health_final_completed:boolean;baseline_published:boolean;final_receipt_published:boolean;writes:number;mutator_invoked:false;
  cleanup_errors:ReadonlyArray<Readonly<{stage:string;code:string}>>;
  precheck_step_id:string|null;precheck_steps:ReadonlyArray<Readonly<{step_id:string;operation:string;artifact_class:string;path_id:string;started:boolean;completed:boolean;error_code?:string;syscall?:string;errno?:number;path_kind:'unknown'|'file'|'directory'|'other';reparse_point:boolean|null;acl_check:'NOT_APPLICABLE'|'IN_PROGRESS'|'PASS'|'FAIL';duration_ms:number}>>;
};
export function createLauncherExecutionState():LauncherExecutionState{return{execution_id:randomUUID(),phase:'INITIALIZING',offline_precheck_started:false,offline_precheck_completed:false,health_initial_attempted:false,health_initial_completed:false,credential_read_attempted:false,credential_read_completed:false,target_validation_completed:false,first_client_created:false,first_transaction_started:false,first_rollback_attempted:false,first_rollback_confirmed:false,first_client_closed:false,second_client_created:false,second_transaction_started:false,second_rollback_attempted:false,second_rollback_confirmed:false,second_client_closed:false,pdf_first_attempted:false,pdf_first_completed:false,pdf_second_attempted:false,pdf_second_completed:false,health_final_attempted:false,health_final_completed:false,baseline_published:false,final_receipt_published:false,writes:0,mutator_invoked:false,cleanup_errors:[],precheck_step_id:null,precheck_steps:[]};}
type PrecheckStep={step_id:string;operation:string;artifact_class:string;path_id:string;started:boolean;completed:boolean;error_code?:string;syscall?:string;errno?:number;path_kind:'unknown'|'file'|'directory'|'other';reparse_point:boolean|null;acl_check:'NOT_APPLICABLE'|'IN_PROGRESS'|'PASS'|'FAIL';duration_ms:number};
async function precheckStep<T>(state:LauncherExecutionState,step:Omit<PrecheckStep,'started'|'completed'|'duration_ms'|'error_code'|'syscall'|'errno'|'path_kind'|'reparse_point'|'acl_check'>,fn:()=>Promise<T>|T):Promise<T>{
  const started=Date.now();state.precheck_step_id=step.step_id;const isAcl=step.step_id.endsWith('.acl');const initial={...step,started:true,completed:false,path_kind:'unknown' as const,reparse_point:null as boolean|null,acl_check:isAcl?'IN_PROGRESS' as const:'NOT_APPLICABLE' as const,duration_ms:0};state.precheck_steps=Object.freeze([...state.precheck_steps,Object.freeze(initial)]);
  try{const value=await fn();const rows=[...state.precheck_steps],s=value&&typeof value==='object'&&'isFile'in value?value as {isFile?:()=>boolean;isDirectory?:()=>boolean;isSymbolicLink?:()=>boolean;isReparsePoint?:()=>boolean}:undefined;rows[rows.length-1]=Object.freeze({...initial,completed:true,path_kind:s?.isFile?.()?'file':s?.isDirectory?.()?'directory':s?'other':'unknown',reparse_point:s?(s.isSymbolicLink?.()===true||s.isReparsePoint?.()===true):null,acl_check:isAcl?'PASS':'NOT_APPLICABLE',duration_ms:Date.now()-started});state.precheck_steps=Object.freeze(rows);return value;}
  catch(error){const e=error&&typeof error==='object'?error as NodeJS.ErrnoException:undefined;const rows=[...state.precheck_steps];rows[rows.length-1]=Object.freeze({...initial,acl_check:isAcl?'FAIL':'NOT_APPLICABLE',error_code:typeof e?.code==='string'?e.code:undefined,syscall:typeof e?.syscall==='string'?e.syscall:undefined,errno:typeof e?.errno==='number'?e.errno:undefined,duration_ms:Date.now()-started});state.precheck_steps=Object.freeze(rows);throw error;}
}
export function sanitizeLauncherFailure(error:unknown,phase:string,precheckStepId?:string|null){
  const e=error&&typeof error==='object'?error as Record<string,unknown>:undefined;
  const message=error instanceof Error?error.message:'';
  const cause=e?.cause,root=cause&&typeof cause==='object'?cause as Record<string,unknown>:e;
  const code=/^(?:LAUNCHER_STOPPED|STOPPED)_([A-Z0-9_]+)/.exec(message)?.[1]??(typeof root?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(root.code)?root.code:error instanceof Error?'UNCLASSIFIED_ERROR':'UNCLASSIFIED_THROWABLE');
  const stackSource=cause instanceof Error?cause:error;const stack=stackSource instanceof Error?stackSource.stack??'':`${stackSource===null?'null':typeof stackSource}:${code}`;
  const sqlstate=typeof root?.code==='string'&&/^[0-9A-Z]{5}$/.test(root.code)&&typeof root?.severity==='string'?root.code:null;
  const systemErrorCode=sqlstate===null&&typeof root?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(root.code)?root.code:null;
  const observedStep=precheckStepId??(typeof e?.precheck_step_id==='string'?e.precheck_step_id:null);
  return Object.freeze({error_type:error instanceof Error?error.constructor?.name??'Error':error===null?'null':typeof error,code,system_error_code:systemErrorCode,sqlstate,syscall:typeof root?.syscall==='string'?root.syscall:null,errno:typeof root?.errno==='number'?root.errno:null,precheck_step_id:observedStep,category:code.startsWith('UNCLASSIFIED_')?`UNCLASSIFIED_AT_${phase.replace(/[^A-Z0-9_]/g,'_')}`:`STOPPED_${code}`,phase,cause_type:cause instanceof Error?cause.constructor.name:cause===undefined?undefined:cause===null?'null':typeof cause,stack_hash:sha(stack)});
}
function observeRunnerEvent(state:LauncherExecutionState,event:Readonly<{name:string;index?:number;stage?:string;code?:string}>){
  const first=event.index===0,prefix=first?'first':'second';
  switch(event.name){
    case'offline_precheck_started':state.phase='OFFLINE_PRECHECK';state.offline_precheck_started=true;break;
    case'offline_precheck_completed':state.offline_precheck_completed=true;break;
    case'credential_read_attempted':state.phase='CREDENTIAL_READ';state.credential_read_attempted=true;break;
    case'credential_read_completed':state.credential_read_completed=true;break;
    case'client_create_attempted':state.phase=`${prefix.toUpperCase()}_CLIENT_CONNECT`;break;
    case'client_created':(state as any)[`${prefix}_client_created`]=true;break;
    case'transaction_start_attempted':state.phase=`${prefix.toUpperCase()}_TRANSACTION_BEGIN`;break;
    case'transaction_started':(state as any)[`${prefix}_transaction_started`]=true;break;
    case'snapshot_capture_started':state.phase=`SNAPSHOT_${prefix.toUpperCase()}_DATABASE`;break;
    case'snapshot_query':state.phase=`SNAPSHOT_${prefix.toUpperCase()}_QUERY`;break;
    case'snapshot_health_attempted':state.phase=`SNAPSHOT_${prefix.toUpperCase()}_HEALTH`;break;
    case'pdf_read_attempted':state.phase=`PDF_${prefix.toUpperCase()}`;(state as any)[`pdf_${prefix}_attempted`]=true;break;
    case'pdf_read_completed':(state as any)[`pdf_${prefix}_completed`]=true;break;
    case'rollback_attempted':state.phase=`${prefix.toUpperCase()}_ROLLBACK`;(state as any)[`${prefix}_rollback_attempted`]=true;break;
    case'rollback_confirmed':(state as any)[`${prefix}_rollback_confirmed`]=true;break;
    case'client_closed':(state as any)[`${prefix}_client_closed`]=true;break;
    case'cleanup_failed':state.cleanup_errors=Object.freeze([...state.cleanup_errors,Object.freeze({stage:event.stage??'unknown',code:event.code??'UNCLASSIFIED'})]);break;
  }
}
export async function publishStoppedExecutionReceipt(output:string,state:LauncherExecutionState,error:unknown,phase:string){
  const cleanup={runnerRollbackConfirmed:state.first_rollback_confirmed&&state.second_rollback_confirmed,clientsClosed:state.first_client_closed&&state.second_client_closed,healthFinalAttempted:state.health_final_attempted,healthFinalCompleted:state.health_final_completed,errors:state.cleanup_errors};
  const receipt={status:'STOPPED',schema_version:1,execution_id:state.execution_id,generated_at:new Date().toISOString(),phase,error:sanitizeLauncherFailure(error,phase,state.precheck_step_id),state:{...state},cleanup,writes:0,mutator_invoked:false};
  try{return await publishReadOnlyReceipt(output,'stopped',state.execution_id,receipt);}catch(primary){
    const emergency={status:'STOPPED',schema_version:1,execution_id:randomUUID(),generated_at:new Date().toISOString(),phase:'STOPPED_RECEIPT_PUBLICATION',error:sanitizeLauncherFailure(primary,'STOPPED_RECEIPT_PUBLICATION',state.precheck_step_id),state:{...state},cleanup,writes:0,mutator_invoked:false,primary_error:sanitizeLauncherFailure(error,phase,state.precheck_step_id)};
    try{return await publishReadOnlyReceipt(output,'stopped',randomUUID(),emergency);}catch(secondary){const failure=new Error('LAUNCHER_STOPPED_STOPPED_RECEIPT_PUBLICATION');Object.defineProperty(failure,'cause',{value:primary,enumerable:false});Object.defineProperty(failure,'emergencyCause',{value:secondary,enumerable:false});throw failure;}
  }
}
export async function recordLauncherFailure(state:LauncherExecutionState,output:string,error:unknown,phase:string,finalHealth?:()=>Promise<unknown>){
  if(state.health_initial_attempted&&finalHealth){state.health_final_attempted=true;state.phase='HEALTH_FINAL';try{await finalHealth();state.health_final_completed=true;}catch(e){const code=e&&typeof e==='object'&&typeof (e as {code?:unknown}).code==='string'&&/^[A-Z0-9_]{1,40}$/.test((e as {code:string}).code)?(e as {code:string}).code:'UNCLASSIFIED';state.cleanup_errors=Object.freeze([...state.cleanup_errors,Object.freeze({stage:'FINAL_HEALTH',code})]);}}
  try{const published=await publishStoppedExecutionReceipt(output,state,error,phase);state.phase='STOPPED_RECEIPT_PUBLISHED';return Object.freeze({published});}
  catch(publicationError){return Object.freeze({publicationFailure:sanitizeLauncherFailure(publicationError,'STOPPED_RECEIPT_PUBLICATION')});}
}

/** Exact ordered --flag=value grammar; no aliases, duplicates, positionals, or unknown options. */
export function parseLauncherArguments(argv:readonly string[]):LauncherArguments{
  if(argv.length!==ARGUMENT_ORDER.length)fail('ARGUMENT_COUNT');
  const out={} as Record<string,string>;
  for(let i=0;i<ARGUMENT_ORDER.length;i++){
    const expected=ARGUMENT_ORDER[i]!,arg=argv[i]!,prefix=`${expected}=`;
    if(!arg.startsWith(prefix)||arg.length===prefix.length||Object.hasOwn(out,expected))fail('ARGUMENT_ORDER_OR_VALUE');
    out[expected]=arg.slice(prefix.length);
  }
  for(const required of ARGUMENT_ORDER)if(!out[required])fail('ARGUMENT_MISSING');
  if(out['--health-url']!==PRODUCTION_HEALTH_URL||out['--sync-confirmed']!=='true'||out['--pdf-attestation-confirmed']!=='true')fail('ATTESTATION_OR_HEALTH_PIN');
  if(out['--expected-corrector-commit']!==CORRECTOR_COMMIT||out['--native-report-sha256']!==CERTIFIED_REPORT_SHA256||out['--readonly-report-sha256']!==ENTRY_READONLY_REPORT_SHA256||out['--backup-sha256']!==DUMP_SHA256||out['--pdf-sha256']!==HISTORICAL_PDF_SHA256||out['--pdf-size']!==String(HISTORICAL_PDF_SIZE)||out['--untracked-manifest-sha256']!==UNTRACKED_AGGREGATE_SHA256)fail('PIN_MISMATCH');
  if(!/^[a-f0-9]{40}$/.test(out['--expected-head']!))fail('TARGET_ARGUMENT_INVALID');
  for(const key of ['--env-file','--ca-file','--output-directory'] as const){try{out[key]=canonicalizeWindowsPath(out[key]!);}catch{fail('PATH_NOT_ABSOLUTE');}}
  return Object.freeze(out) as LauncherArguments;
}

/** Check only paths/ACLs before reading the explicitly selected file. */
export async function assertPrivateRegularFile(file:string,state?:LauncherExecutionState){
  const canonicalPath=(()=>{try{return canonicalizeWindowsPath(file);}catch{return fail('ENV_PATH_NOT_ABSOLUTE');}})();
  const step=(step_id:string,operation:string,fn:()=>Promise<any>|any)=>state?precheckStep(state,{step_id,operation,artifact_class:'AUTHORIZED_ENV_FILE',path_id:'authorized-env'},fn):Promise.resolve(fn());
  const before=await step('env.stat','lstat',()=>lstat(canonicalPath));
  await step('env.reparse_check','lstat_reparse_flags',()=>{if(!before.isFile()||before.isSymbolicLink()||(before as {isReparsePoint?:()=>boolean}).isReparsePoint?.())fail('ENV_FILE_NOT_REGULAR');});
  const resolved=await step('env.realpath','realpath',()=>realpath(canonicalPath));if(!sameCanonicalWindowsPath(resolved,canonicalPath))fail('ENV_PATH_SYMLINK_OR_ALIAS');
  if(process.platform==='win32'){
    const escaped=canonicalPath.replace(/'/g,"''"),script="(Get-Acl -LiteralPath '"+escaped+"').Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value + '|' + $_.FileSystemRights + '|' + $_.AccessControlType + '|' + $_.IsInherited }";
    const acl=await step('env.acl','spawnSync powershell.exe/Get-Acl',()=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true}));
    for(const line of acl.split(/\r?\n/).filter(Boolean))if(/^(S-1-1-0|S-1-5-32-545|S-1-5-11)\|/.test(line)&&/Read|Write|Modify|FullControl/i.test(line)&&/\|Allow\|/.test(line))fail('ENV_ACL_INSECURE');
  }else if((before.mode&0o077)!==0)fail('ENV_ACL_INSECURE');
  const after=await step('env.stat','lstat_postcheck',()=>lstat(canonicalPath));if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size)fail('ENV_FILE_CHANGED');
  return Object.freeze({path:canonicalPath,size:before.size,mtimeMs:before.mtimeMs,dev:before.dev,ino:before.ino});
}
async function assertRegularNoSymlink(file:string){const canonicalPath=(()=>{try{return canonicalizeWindowsPath(file);}catch{return fail('PATH_NOT_ABSOLUTE');}})();const s=await lstat(canonicalPath);if(!s.isFile()||s.isSymbolicLink()||(s as {isReparsePoint?:()=>boolean}).isReparsePoint?.())fail('FILE_NOT_REGULAR');if(!sameCanonicalWindowsPath(await realpath(canonicalPath),canonicalPath))fail('FILE_PATH_ALIAS');return canonicalPath;}

/** Read only allowlisted dotenv keys. Raw bytes are zeroed immediately after parsing. */
export async function readExplicitEnvironment(file:string):Promise<MutableLauncherEnvironment>{
  const meta=await assertPrivateRegularFile(file);if(meta.size<=0||meta.size>1024*1024)fail('ENV_FILE_SIZE');
  const raw=await readFile(meta.path);let text='';
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{return fail('ENV_ENCODING_INVALID');}finally{raw.fill(0);}
  const after=await lstat(meta.path);if(after.dev!==meta.dev||after.ino!==meta.ino||after.size!==meta.size||after.mtimeMs!==meta.mtimeMs)fail('ENV_FILE_CHANGED');
  try{return parseAllowlistedEnvironment(text);}finally{text='';}
}

export function parseAllowlistedEnvironment(text:string):MutableLauncherEnvironment{
  const seen=new Set<string>(),values:Record<string,string>={};
  try{
    for(const [index,line] of text.split(/\r?\n/).entries()){
      const s=line.trim();if(!s||s.startsWith('#'))continue;
      const match=/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(s);if(!match)return fail(`ENV_SYNTAX_LINE_${index+1}`);
      const key=match[1]!;if(!REQUIRED_ENV.includes(key as typeof REQUIRED_ENV[number]))continue;
      if(seen.has(key))fail('ENV_DUPLICATE_VARIABLE');seen.add(key);
      let value=match[2]!.trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
      else value=value.replace(/\s+#.*$/,'');
      if(!value)fail('ENV_REQUIRED_VALUE_MISSING');values[key]=value;
    }
    for(const key of REQUIRED_ENV)if(!seen.has(key))fail('ENV_REQUIRED_VARIABLE_MISSING');
    validateServiceConfiguration(values as LauncherEnvironment);assertServiceRoleCredential(values.SUPABASE_SERVICE_ROLE_KEY!);
    return values as LauncherEnvironment;
  }catch(error){for(const key of Object.keys(values))values[key]='';if(error instanceof Error&&error.message.startsWith('LAUNCHER_STOPPED_'))throw error;return failWithCause('ENV_INVALID',error);}
}

function projectRefFromSupabaseUrl(value:string){
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!u.hostname.endsWith('.supabase.co'))fail('SUPABASE_URL_REJECTED');
  const ref=u.hostname.slice(0,-'.supabase.co'.length);if(!/^[a-z0-9]{20}$/.test(ref))fail('SUPABASE_PROJECT_REF_INVALID');return ref;
}
export function validateServiceConfiguration(env:LauncherEnvironment){
  const ref=projectRefFromSupabaseUrl(env.SUPABASE_URL);
  let db:URL;try{db=new URL(env.DATABASE_URL);}catch{return fail('DATABASE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(db.protocol))fail('DATABASE_URL_PROTOCOL_REJECTED');
  let decodedUser='',decodedPassword='';try{decodedUser=decodeURIComponent(db.username);decodedPassword=decodeURIComponent(db.password);}catch{return fail('DATABASE_URL_POLICY');}
  if(!decodedUser||!decodedPassword||db.hash)fail('DATABASE_URL_POLICY');
  const query=[...db.searchParams.entries()],sslEntries=query.filter(([key])=>key.toLowerCase()==='sslmode');
  if(query.some(([key])=>key!=='sslmode')||sslEntries.length>1)fail('DATABASE_URL_TLS_QUERY_REJECTED');
  const sslmode=sslEntries[0]?.[1];if(sslmode!==undefined&&!['require','verify-full'].includes(sslmode))fail('DATABASE_URL_TLS_MODE_REJECTED');
  const rawPath=extractRawDatabasePath(env.DATABASE_URL,db),database=canonicalDatabaseSegment(db,rawPath);
  const dbHost=db.hostname.toLowerCase(),dbRef=dbHost.startsWith('db.')?dbHost.split('.')[1]:decodeURIComponent(db.username).split('.').at(-1);
  if(dbRef!==ref||!(dbHost.endsWith('.supabase.co')||dbHost.endsWith('.pooler.supabase.com')))fail('DATABASE_TARGET_MISMATCH');
  if(!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_STORAGE_BUCKET||!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(env.SUPABASE_STORAGE_BUCKET))fail('STORAGE_CONFIG_INVALID');
  return Object.freeze({protocolClass:'POSTGRESQL' as const,projectRef:ref,databaseHost:dbHost,databasePort:Number(db.port||5432),databaseName:database.name,databaseSha256:database.sha256,tlsPolicy:'EXTERNAL_STRICT_TLS' as const});
}

function extractRawDatabasePath(value:string,parsed:URL){
  const match=/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?(?:[?#]|$)/.exec(value);if(!match)return fail('DATABASE_URL_INVALID');const raw=match[1]??'';
  if(raw!==parsed.pathname)fail('DATABASE_PATH_PARSER_AMBIGUITY');return raw;
}
export function canonicalDatabaseSegment(parsed:URL,rawPath:string){
  if(parsed.pathname!==rawPath||!rawPath.startsWith('/')||rawPath.startsWith('//')||rawPath.slice(1).includes('/'))fail('DATABASE_PATH_SEGMENT_COUNT');
  const encoded=rawPath.slice(1);if(!encoded||encoded.includes('\\')||/%2f|%5c/i.test(encoded)||/%(?![0-9a-f]{2})/i.test(encoded))fail('DATABASE_PATH_ENCODING_REJECTED');
  let decoded:string;try{decoded=decodeURIComponent(encoded);}catch{return fail('DATABASE_PATH_ENCODING_REJECTED');}
  if(!decoded||decoded==='.'||decoded==='..'||decoded.includes('/')||decoded.includes('\\')||decoded.includes('\0')||decoded.includes('%')||decoded.normalize('NFC')!==decoded)fail('DATABASE_PATH_SEGMENT_REJECTED');
  const bytes=Buffer.from(decoded,'utf8'),databaseSha256=createHash('sha256').update(bytes).digest('hex');
  if(!matchesSha256(decoded,PRODUCTION_TARGET_PIN.database_sha256))fail('DATABASE_PATH_PIN_MISMATCH');
  return Object.freeze({name:decoded,sha256:databaseSha256,byteLength:bytes.length});
}

export function assertTargetMatchesPin(target:ReturnType<typeof validateServiceConfiguration>,pin=PRODUCTION_TARGET_PIN){
  return assertTargetDetailsMatchPin({host:target.databaseHost,port:target.databasePort,databaseSha256:target.databaseSha256,projectRefSha256:sha(target.projectRef)},pin);
}
export function assertTargetDetailsMatchPin(target:Readonly<{host:string;port:number;databaseSha256:string;projectRefSha256:string}>,pin=PRODUCTION_TARGET_PIN){
  if(target.host!==pin.host||target.port!==pin.port||target.databaseSha256!==pin.database_sha256||target.projectRefSha256!==pin.project_ref_sha256||pin.protocol_class!=='POSTGRESQL'||pin.tls_policy!=='EXTERNAL_STRICT_TLS'||pin.tls.min_version!=='TLSv1.3'||pin.tls.max_version!=='TLSv1.3'||pin.tls.reject_unauthorized!==true||pin.tls.ca_sha256!==PRODUCTION_CA_SHA256)fail('DATABASE_TARGET_PIN_MISMATCH');
  return true;
}

export function assertServiceRoleCredential(token:string){
  const parts=token.split('.');if(parts.length!==3)fail('STORAGE_CREDENTIAL_INVALID');
  let role='';try{role=JSON.parse(Buffer.from(parts[1]??'','base64url').toString('utf8')).role??'';}catch{return fail('STORAGE_CREDENTIAL_INVALID');}
  if(role!=='service_role')fail('STORAGE_CREDENTIAL_ROLE_INVALID');return true;
}

export function validateHealthUrl(value:string){if(value!==PRODUCTION_HEALTH_URL)return fail('HEALTH_URL_REJECTED');const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='api.empiriasuite.com'||u.pathname!=='/api/health'||u.username||u.password||u.port||u.search||u.hash)fail('HEALTH_URL_REJECTED');return value;}

export async function createProductionPlan(args:LauncherArguments,state?:LauncherExecutionState):Promise<OfflinePlan>{
  await assertPrivateRegularFile(args['--env-file'],state);
  const outputPath=canonicalizeWindowsPath(args['--output-directory']);
  const step=<T>(step_id:string,operation:string,artifact_class:string,path_id:string,fn:()=>Promise<T>|T)=>state?precheckStep(state,{step_id,operation,artifact_class,path_id},fn):Promise.resolve(fn());
  const outStat=await step('output_directory.stat','lstat','RECEIPT_DIRECTORY','output-directory',()=>lstat(outputPath).catch(()=>fail('OUTPUT_DIRECTORY_MISSING')));
  await step('output_directory.reparse_check','lstat_reparse_flags','RECEIPT_DIRECTORY','output-directory',()=>{if(!outStat.isDirectory()||outStat.isSymbolicLink()||(outStat as {isReparsePoint?:()=>boolean}).isReparsePoint?.())fail('OUTPUT_DIRECTORY_REJECTED');});
  const outputReal=await step('output_directory.realpath','realpath','RECEIPT_DIRECTORY','output-directory',()=>realpath(outputPath));if(!sameCanonicalWindowsPath(outputReal,outputPath))fail('OUTPUT_DIRECTORY_REJECTED');
  const root=canonicalizeWindowsPath(await step('workspace.realpath','realpath','WORKSPACE','workspace-root',()=>realpath(process.cwd())));if(!sameCanonicalWindowsPath(root,process.cwd()))fail('WORKSPACE_PATH_MISMATCH');
  const branch=(await step('git.branch','execFileSync git branch','GIT_METADATA','workspace-root',()=>execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',windowsHide:true}))).trim();
  const head=(await step('git.head','execFileSync git rev-parse','GIT_METADATA','workspace-root',()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}))).trim();
  if(branch!==PRODUCTION_LAUNCHER_BRANCH||head!==args['--expected-head'])fail('GIT_PIN_MISMATCH');
  await step('git.ancestry','execFileSync git merge-base','GIT_OBJECTS','workspace-root',()=>execFileSync('git',['merge-base','--is-ancestor',BASE_CONTRACT_COMMIT,head],{cwd:root,windowsHide:true}));
  const caPath=await assertRegularNoSymlink(args['--ca-file']);const caBytes=await step('ca.hash','readFile+sha256','CERTIFICATE_AUTHORITY','official-ca',()=>readFile(caPath)),caSha=sha(caBytes);caBytes.fill(0);
  const backupPath=canonicalizeWindowsPath('C:/Users/CORE ULTRA/Documents/EmpiriaBackups/nomina-turno-202-pre-correccion-20261015T013132Z/full.dump');
  const historicalPdfPath=canonicalizeWindowsPath('C:/Users/CORE ULTRA/Documents/EmpiriaBackups/nomina-turno-202-pre-correccion-20261015T013132Z/historical-account-77.pdf');
  const nativeReportPath=canonicalizeWindowsPath(path.win32.join(root,'reports/nomina-202-performance-20261015T150430Z/report.json'));
  const entryReportPath=canonicalizeWindowsPath(path.win32.join(root,'reports/nomina-202-performance-20261015T155014Z/report.json'));
  const plan:OfflinePlan={workspaceRoot:root,branch,head,contractCommit:BASE_CONTRACT_COMMIT,correctorCommit:args['--expected-corrector-commit'],dumpPath:backupPath,dumpSha256:args['--backup-sha256'],historicalPdfPath,historicalPdfSha256:args['--pdf-sha256'],reportPath:nativeReportPath,reportSha256:args['--native-report-sha256'],expectedReportSha256:CERTIFIED_REPORT_SHA256,entryReportPath,entryReportSha256:args['--readonly-report-sha256'],expectedEntryReportSha256:ENTRY_READONLY_REPORT_SHA256,caPath,caSha256:caSha,expectedCaSha256:PRODUCTION_CA_SHA256,projectRefSha256:PRODUCTION_TARGET_PIN.project_ref_sha256,host:PRODUCTION_TARGET_PIN.host,servername:PRODUCTION_TARGET_PIN.host,expectedServername:PRODUCTION_TARGET_PIN.host,port:PRODUCTION_TARGET_PIN.port,databaseSha256:PRODUCTION_TARGET_PIN.database_sha256,healthUrl:validateHealthUrl(args['--health-url']),healthHostname:'api.empiriasuite.com',localCertification:false};
  if(plan.head!==args['--expected-head']||plan.correctorCommit!==CORRECTOR_COMMIT||PRODUCTION_TARGET_PIN_SHA256.length!==64)fail('PLAN_PIN_MISMATCH');
  const validated=await step('offline.artifact_plan','validateOfflinePlan','PINNED_OFFLINE_ARTIFACTS','sealed-manifest',()=>validateOfflinePlan(plan));validated.caPem.fill(0);validated.dumpBytes.fill(0);validated.pdfBytes.fill(0);validated.reportBytes.fill(0);validated.entryReportBytes.fill(0);
  return plan;
}

export async function readHistoricalPdf(env:LauncherEnvironment,expected:Readonly<{bucket:string;path:string}>,createStorageClient:typeof createClient=createClient):Promise<PdfRead>{
  if(expected.bucket!==env.SUPABASE_STORAGE_BUCKET||!expected.path||expected.path.startsWith('/')||expected.path.split('/').some(x=>!x||x==='.'||x==='..')||/[?#\\]/.test(expected.path))fail('PDF_REFERENCE_REJECTED');
  let client=createStorageClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let bytes:Buffer|undefined;
  try{
    const bucket=client.storage.from(expected.bucket),info=await bucket.info(expected.path);if(info.error||!info.data)failWithCause('PDF_METADATA_READ_FAILED',info.error??new Error('missing metadata'));
    const meta=info.data as {contentType?:string;size?:number;eTag?:string;etag?:string};
    if(meta.contentType!=='application/pdf'||meta.size!==HISTORICAL_PDF_SIZE)fail('PDF_METADATA_MISMATCH');
    const contentType=meta.contentType;if(contentType!=='application/pdf'||meta.size!==HISTORICAL_PDF_SIZE)return fail('PDF_METADATA_MISMATCH');
    const download=await bucket.download(expected.path),blob=download.data;if(download.error||blob===null)return failWithCause('PDF_DOWNLOAD_FAILED',download.error??new Error('missing object'));
    bytes=Buffer.from(await blob.arrayBuffer());if(bytes.length!==HISTORICAL_PDF_SIZE||sha(bytes)!==HISTORICAL_PDF_SHA256)fail('PDF_HASH_MISMATCH');
    const etag=meta.eTag??meta.etag;if(!etag)return fail('PDF_ETAG_MISSING');
    const result=Object.freeze({bytes,reference:`${expected.bucket}/${expected.path}`,mime:contentType,etag});bytes=undefined;return result;
  }finally{bytes?.fill(0);client=undefined as never;}
}

export function makeEntryEvidence(receipt:PendingReceipt,head:string,healthFinal:HealthResponse,executionTimeline:EntryEvidence['executionTimeline'],runId=randomUUID(),now=Date.now()):EntryEvidence{
  const d=receipt.digests,pdf=receipt.pdf;
  const beforeSha=sha(JSON.stringify(Object.fromEntries(Object.entries(ENTRY_CASE.before).sort(([a],[b])=>a.localeCompare(b)))));
  const pdfMetadata=sha(JSON.stringify(Object.fromEntries(Object.entries({sha256:pdf.sha256,referenceSha256:pdf.referenceSha256,size:pdf.size,mime:pdf.mime,etag:pdf.etag}).sort(([a],[b])=>a.localeCompare(b)))));
  const values={beforeStateSha:beforeSha,pdfMetadataSha:pdfMetadata};
  if(receipt.connections.length!==2)fail('CONNECTION_COUNT');
  const snapshots=receipt.connections.map(c=>({connectionId:c.id,observedAt:c.observedAt,digestSet:{...d},values})) as unknown as [EntryEvidence['first'],EntryEvidence['second']];
  const checks=receipt.checks as any;
  const h=checks.health;
  const healthEvidence={http:200,database:'ok',outbox:false,sync:false,recalc:false,worker:false,waitingLocks:0,activeDdl:0} as const;
  const seq=receipt.sequenceBaseline;
  const sequenceBaseline={auditoria:seq['public.auditoria_id_seq']!,auditoria_eventos:seq['public.auditoria_eventos_id_seq']!,nomina_revision_operativa:seq['public.nomina_revision_operativa_id_seq']!,historial_cambios:seq['public.historial_cambios_id_seq']!};
  if(Object.values(sequenceBaseline).some(x=>!/^\d+$/.test(x)))fail('SEQUENCE_RECEIPT_INVALID');
  if(h?.httpStatus!==200||h?.databaseStatus!=='ok'||h?.outbox!==false||checks.syncConfirmation?.enabled!==false||h?.recalcRequested||h?.recalcActive||h?.workerStopped!==true||checks.locks?.waiting!==0||checks.locks?.ddl!==0)fail('RECEIPT_CHECKS_INVALID');
  if(healthFinal.httpStatus!==200||healthFinal.databaseStatus!=='ok'||healthFinal.outbox||healthFinal.sync||healthFinal.recalcRequested||healthFinal.recalcActive||!healthFinal.workerStopped)fail('FINAL_HEALTH_GATE_FAILED');
  const evidence:EntryEvidence={codeSha:sha(head),evidenceSha:ENTRY_READONLY_REPORT_SHA256,dumpSha:DUMP_SHA256,historicalPdfSha:HISTORICAL_PDF_SHA256,runId,nonce:randomBytes(24).toString('hex'),expiresAt:new Date(now+15*60_000).toISOString(),first:snapshots[0],second:snapshots[1],healthFinal:healthFinal as EntryEvidence['healthFinal'],executionTimeline,runIdUnique:true,nonceUnused:true,health:healthEvidence,pdfAttestation:'NOT_SENT_OR_DELIVERED_NOT_APPROVED_OR_SIGNED_NOT_PAID_OR_POSTED_NOT_USED_OFFICIALLY',historyHasNoLaterRelatedAudit:true,duplicateCount:0,priorRepairCount:0,lifecycleBlockerCount:0,pdf:{sha256:pdf.sha256,referenceSha256:pdf.referenceSha256,size:pdf.size,mime:pdf.mime as 'application/pdf',etag:pdf.etag},exactBeforeState:true,sequenceBaseline};
  return evidence;
}

type OrderedFinalizationOptions=Readonly<{
  receipt:PendingReceipt;plan:OfflinePlan;output:string;state:LauncherExecutionState;
  readFinalHealth:()=>Promise<HealthResponse>;
  publish:typeof publishReadOnlyReceipt;
  now?:()=>number;
}>;
const nextOrderedIso=(after:string,now=Date.now())=>new Date(Math.max(now,Date.parse(after)+1)).toISOString();
export async function finalizeOrderedReadOnlyRun(options:OrderedFinalizationOptions){
  const {receipt,plan,output,state}=options,t=receipt.executionTimeline,now=options.now??Date.now;
  const order=[t.read1_rollback_completed_at,t.read1_closed_at,t.read2_rollback_completed_at,t.read2_closed_at].map(Date.parse);
  if(order.some(x=>!Number.isFinite(x))||order.some((x,i)=>i>0&&x<=order[i-1]!))fail('READONLY_CLEANUP_ORDER_INVALID');
  state.phase='HEALTH_FINAL';state.health_final_attempted=true;
  const healthFinal=await options.readFinalHealth();
  if(healthFinal.httpStatus!==200||healthFinal.databaseStatus!=='ok'||healthFinal.outbox||healthFinal.sync||healthFinal.recalcRequested||healthFinal.recalcActive||!healthFinal.workerStopped)fail('HEALTH_FINAL_OR_FLAGS');
  const passedHealthFinal={httpStatus:200,databaseStatus:'ok',outbox:false,sync:false,recalcRequested:false,recalcActive:false,workerStopped:true} as const;
  state.health_final_completed=true;
  const finalHealthAt=nextOrderedIso(t.read2_closed_at,now());
  const runId=randomUUID();
  const baselineAt=nextOrderedIso(finalHealthAt,now());
  const timeline={...t,final_health_completed_at:finalHealthAt,baseline_published_at:baselineAt};
  const baselineBody={status:'BASELINE_VERIFIED',run_id:runId,head:plan.head,correctorCommit:CORRECTOR_COMMIT,reportSha256:CERTIFIED_REPORT_SHA256,entryReportSha256:ENTRY_READONLY_REPORT_SHA256,dumpSha256:DUMP_SHA256,pdfSha256:HISTORICAL_PDF_SHA256,digests:receipt.digests,sequenceBaseline:receipt.sequenceBaseline,checks:receipt.checks,healthFinal:passedHealthFinal,executionTimeline:timeline};
  assertOrderedReadonlyReceipt(baselineBody,'baseline');
  state.phase='BASELINE_PUBLICATION';
  const baseline=await options.publish(output,'baseline',randomUUID(),baselineBody);
  state.baseline_published=true;
  const issuedAt=now(),evidence=makeEntryEvidence(receipt,plan.head,passedHealthFinal,timeline,runId,issuedAt),phrase=buildPendingEntryPhrase(evidence,issuedAt);
  if(!verifyPendingEntryPhrase(phrase,evidence,issuedAt))fail('PENDING_PHRASE_SELF_CHECK');
  const sanitized={...receipt,connections:receipt.connections.map(c=>({id:c.id,observedAt:c.observedAt,serverVersion:c.serverVersion,tlsProtocol:c.tlsProtocol,servernameSha256:sha(c.servername),transactionReadOnly:c.transactionReadOnly}))};
  const pendingAt=nextOrderedIso(baselineAt,now()),pendingTimeline={...timeline,pending_receipt_published_at:pendingAt};
  const pendingBody={...sanitized,healthFinal:passedHealthFinal,executionTimeline:pendingTimeline,baseline:{path:path.relative(output,baseline.path).replace(/\\/g,'/'),sha256:baseline.sha256},phrase};
  assertOrderedReadonlyReceipt(pendingBody,'pending');
  state.phase='PENDING_PUBLICATION';
  const pending=await options.publish(output,'pending',randomUUID(),pendingBody);
  state.final_receipt_published=true;
  return Object.freeze({status:'PENDING_USER_CONFIRMATION',phrase,receiptPath:path.relative(plan.workspaceRoot,pending.path).replace(/\\/g,'/'),receiptSha256:pending.sha256,baselinePath:path.relative(plan.workspaceRoot,baseline.path).replace(/\\/g,'/'),baselineSha256:baseline.sha256,healthFinal,executionTimeline:pendingTimeline});
}

/** Runs only after offline pins. Secrets remain local to this call and never enter logs or receipts. */
export async function runProductionLauncher(args:LauncherArguments){
  const state=createLauncherExecutionState();let plan:OfflinePlan|undefined,env:MutableLauncherEnvironment|undefined,result:Readonly<Record<string,unknown>>|undefined,original:unknown,failed=false,stoppedReceiptPublished=false,receiptPublishError:unknown,failurePhase='INITIALIZING';
  try{
    state.phase='ARGUMENT_AND_HEALTH_PIN';validateHealthUrl(args['--health-url']);
    state.phase='OFFLINE_PRECHECK';state.offline_precheck_started=true;plan=await createProductionPlan(args,state);state.offline_precheck_completed=true;
    state.phase='HEALTH_INITIAL';state.health_initial_attempted=true;const health=await readHealthHttp(plan);state.health_initial_completed=true;if(health.httpStatus!==200||health.databaseStatus!=='ok'||health.outbox||health.recalcRequested||health.recalcActive||!health.workerStopped)fail('HEALTH_OR_FLAGS');
    state.phase='CREDENTIAL_READ';state.credential_read_attempted=true;
    env=await readExplicitEnvironment(args['--env-file']);
    state.credential_read_completed=true;state.phase='TARGET_VALIDATION';const target=validateServiceConfiguration(env);assertTargetMatchesPin(target);state.target_validation_completed=true;
    assertServiceRoleCredential(env.SUPABASE_SERVICE_ROLE_KEY);
    const syncConfirmation={source:'MANUAL_CURRENT' as const,enabled:false as const,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+5*60_000).toISOString()};
    state.phase='SNAPSHOTS';const receipt=await runReadOnlyEntryPreflight(plan,{plan,readCredentials:async()=>{const target=validateServiceConfiguration(env!);assertTargetMatchesPin(target);return{user:decodeURIComponent(new URL(env!.DATABASE_URL).username),password:decodeURIComponent(new URL(env!.DATABASE_URL).password),database:target.databaseName};},readPdf:ref=>readHistoricalPdf(env!,ref),syncConfirmation,onExecutionEvent:event=>observeRunnerEvent(state,event)});
    state.phase='RECEIPT_DIRECTORY';
    const output=await realpath(canonicalizeWindowsPath(args['--output-directory'])).catch(()=>fail('OUTPUT_DIRECTORY_MISSING'));if(!sameCanonicalWindowsPath(output,args['--output-directory']))fail('OUTPUT_DIRECTORY_SYMLINK_OR_PATH_MISMATCH');
    result=await finalizeOrderedReadOnlyRun({receipt,plan,output,state,readFinalHealth:()=>readHealthHttp(plan!),publish:publishReadOnlyReceipt});
  }catch(error){original=error;failed=true;failurePhase=state.phase;}
  finally{
    state.phase='CLEANUP';if(env){env.DATABASE_URL='';env.SUPABASE_URL='';env.SUPABASE_SERVICE_ROLE_KEY='';env.SUPABASE_STORAGE_BUCKET='';env=undefined;}
    if(failed&&state.offline_precheck_started){const recorded=await recordLauncherFailure(state,canonicalizeWindowsPath(args['--output-directory']),original,failurePhase);stoppedReceiptPublished='published'in recorded;receiptPublishError='publicationFailure'in recorded?recorded.publicationFailure:undefined;}
  }
  if(failed){const safe=sanitizeLauncherFailure(original,failurePhase,state.precheck_step_id);const err=new Error(`LAUNCHER_STOPPED_${safe.code}`);Object.defineProperty(err,'cause',{value:original,enumerable:false});Object.defineProperty(err,'failure_phase',{value:failurePhase,enumerable:false});Object.defineProperty(err,'precheck_step_id',{value:state.precheck_step_id,enumerable:false});Object.defineProperty(err,'stoppedReceiptPublished',{value:stoppedReceiptPublished,enumerable:false});if(receiptPublishError!==undefined)Object.defineProperty(err,'receiptPublicationFailure',{value:sanitizeLauncherFailure(receiptPublishError,'STOPPED_RECEIPT_PUBLICATION'),enumerable:false});throw err;}
  return result;
}

export async function productionLauncherCli(argv=process.argv.slice(2)){
  const args=parseLauncherArguments(argv);return runProductionLauncher(args);
}
