/** Strict production launcher. It only wires read-only dependencies to the certified runner. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { ENTRY_CASE, buildPendingEntryPhrase, verifyPendingEntryPhrase, type EntryEvidence } from './nomina-turno-202-entry-contract';
import { ENTRY_READONLY_REPORT_SHA256, CERTIFIED_REPORT_SHA256, CORRECTOR_COMMIT, DUMP_SHA256, HISTORICAL_PDF_SHA256, PRODUCTION_CA_SHA256, validateOfflinePlan, runReadOnlyEntryPreflight, readHealthHttp, publishReadOnlyReceipt, type OfflinePlan, type PdfRead } from './nomina-turno-202-readonly-runner';

export const PRODUCTION_HEALTH_URL='https://api.empiriasuite.com/api/health';
export const BASE_CONTRACT_COMMIT='610dd263d8f7734ac504a4b5fbb7d05c01a4ea9b';
export const UNTRACKED_AGGREGATE_SHA256='9c77ae07a8f4478b6e3a9d92d72f5074816a2888c2a98ef807c2ec19354f11c7';
export const HISTORICAL_PDF_SIZE=3051;
export const MEASUREMENT_ARTIFACT_CLASS='NON_EXECUTABLE_MEASUREMENT_ARTIFACT_UNAVAILABLE';

export const ARGUMENT_ORDER=Object.freeze([
  '--env-file','--ca-file','--health-url','--expected-head','--expected-corrector-commit',
  '--native-report-sha256','--readonly-report-sha256','--backup-sha256','--pdf-sha256','--pdf-size',
  '--untracked-manifest-sha256','--sync-confirmed','--pdf-attestation-confirmed','--output-directory',
  '--db-host','--db-port','--db-name','--project-ref-sha256',
] as const);
export type LauncherArguments=Readonly<Record<(typeof ARGUMENT_ORDER)[number],string>>;
export type LauncherEnvironment=Readonly<{DATABASE_URL:string;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;SUPABASE_STORAGE_BUCKET:string}>;
type MutableLauncherEnvironment={DATABASE_URL:string;SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;SUPABASE_STORAGE_BUCKET:string};
const fail=(code:string):never=>{throw new Error(`LAUNCHER_STOPPED_${code}`);};
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const isAbsolute=(value:string)=>path.isAbsolute(value);
const normalizedPath=(value:string)=>path.resolve(value).replace(/^\\\\\?\\/,'').toLowerCase();
const REQUIRED_ENV=['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET'] as const;

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
  if(!/^[a-f0-9]{40}$/.test(out['--expected-head']!)||!/^\d{4,5}$/.test(out['--db-port']!)||Number(out['--db-port'])<1024||Number(out['--db-port'])>65535||!/^[a-f0-9]{64}$/.test(out['--project-ref-sha256']!))fail('TARGET_ARGUMENT_INVALID');
  for(const key of ['--env-file','--ca-file','--output-directory'] as const)if(!isAbsolute(out[key]!))fail('PATH_NOT_ABSOLUTE');
  if(!/^[a-z0-9.-]+$/.test(out['--db-host']!)||out['--db-host']!.includes('..')||out['--db-host']==='localhost'||!/^[a-zA-Z0-9_-]+$/.test(out['--db-name']!))fail('TARGET_ARGUMENT_INVALID');
  return Object.freeze(out) as LauncherArguments;
}

/** Check only paths/ACLs before reading the explicitly selected file. */
export async function assertPrivateRegularFile(file:string){
  if(!isAbsolute(file))fail('ENV_PATH_NOT_ABSOLUTE');
  const before=await lstat(file);if(!before.isFile()||before.isSymbolicLink()||(before as {isReparsePoint?:()=>boolean}).isReparsePoint?.())fail('ENV_FILE_NOT_REGULAR');
  if(normalizedPath(await realpath(file))!==normalizedPath(file))fail('ENV_PATH_SYMLINK_OR_ALIAS');
  if(process.platform==='win32'){
    const escaped=file.replace(/'/g,"''"),script="(Get-Acl -LiteralPath '"+escaped+"').Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value + '|' + $_.FileSystemRights + '|' + $_.AccessControlType + '|' + $_.IsInherited }";
    const acl=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true});
    for(const line of acl.split(/\r?\n/).filter(Boolean))if(/^(S-1-1-0|S-1-5-32-545|S-1-5-11)\|/.test(line)&&/Read|Write|Modify|FullControl/i.test(line)&&/\|Allow\|/.test(line))fail('ENV_ACL_INSECURE');
  }else if((before.mode&0o077)!==0)fail('ENV_ACL_INSECURE');
  const after=await lstat(file);if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size)fail('ENV_FILE_CHANGED');
  return Object.freeze({size:before.size,mtimeMs:before.mtimeMs,dev:before.dev,ino:before.ino});
}
async function assertRegularNoSymlink(file:string){if(!isAbsolute(file))fail('PATH_NOT_ABSOLUTE');const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink())fail('FILE_NOT_REGULAR');if(normalizedPath(await realpath(file))!==normalizedPath(file))fail('FILE_PATH_ALIAS');return s;}

/** Read only allowlisted dotenv keys. Raw bytes are zeroed immediately after parsing. */
export async function readExplicitEnvironment(file:string):Promise<MutableLauncherEnvironment>{
  const meta=await assertPrivateRegularFile(file);if(meta.size<=0||meta.size>1024*1024)fail('ENV_FILE_SIZE');
  const raw=await readFile(file);let text='';
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{return fail('ENV_ENCODING_INVALID');}finally{raw.fill(0);}
  const after=await lstat(file);if(after.dev!==meta.dev||after.ino!==meta.ino||after.size!==meta.size||after.mtimeMs!==meta.mtimeMs)fail('ENV_FILE_CHANGED');
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
  }catch(error){for(const key of Object.keys(values))values[key]='';throw error instanceof Error&&error.message.startsWith('LAUNCHER_STOPPED_')?error: new Error('LAUNCHER_STOPPED_ENV_INVALID');}
}

function projectRefFromSupabaseUrl(value:string){
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!u.hostname.endsWith('.supabase.co'))fail('SUPABASE_URL_REJECTED');
  const ref=u.hostname.slice(0,-'.supabase.co'.length);if(!/^[a-z0-9]{20}$/.test(ref))fail('SUPABASE_PROJECT_REF_INVALID');return ref;
}
export function validateServiceConfiguration(env:LauncherEnvironment){
  const ref=projectRefFromSupabaseUrl(env.SUPABASE_URL);
  let db:URL;try{db=new URL(env.DATABASE_URL);}catch{return fail('DATABASE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(db.protocol)||!db.username||!db.password||db.searchParams.has('sslmode')&& !['require','verify-full'].includes(db.searchParams.get('sslmode')??'')||[...db.searchParams.keys()].some(k=>k!=='sslmode'))fail('DATABASE_URL_POLICY');
  const dbHost=db.hostname.toLowerCase(),dbRef=dbHost.startsWith('db.')?dbHost.split('.')[1]:decodeURIComponent(db.username).split('.').at(-1);
  if(dbRef!==ref||!(dbHost.endsWith('.supabase.co')||dbHost.endsWith('.pooler.supabase.com')))fail('DATABASE_TARGET_MISMATCH');
  if(!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_STORAGE_BUCKET||!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(env.SUPABASE_STORAGE_BUCKET))fail('STORAGE_CONFIG_INVALID');
  return Object.freeze({projectRef:ref,databaseHost:dbHost,databasePort:Number(db.port||5432),databaseName:decodeURIComponent(db.pathname.slice(1))});
}

export function assertServiceRoleCredential(token:string){
  const parts=token.split('.');if(parts.length!==3)fail('STORAGE_CREDENTIAL_INVALID');
  let role='';try{role=JSON.parse(Buffer.from(parts[1]??'','base64url').toString('utf8')).role??'';}catch{return fail('STORAGE_CREDENTIAL_INVALID');}
  if(role!=='service_role')fail('STORAGE_CREDENTIAL_ROLE_INVALID');return true;
}

export function validateHealthUrl(value:string){if(value!==PRODUCTION_HEALTH_URL)return fail('HEALTH_URL_REJECTED');const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='api.empiriasuite.com'||u.pathname!=='/api/health'||u.username||u.password||u.port||u.search||u.hash)fail('HEALTH_URL_REJECTED');return value;}

export async function createProductionPlan(args:LauncherArguments):Promise<OfflinePlan>{
  await assertPrivateRegularFile(args['--env-file']);
  const outStat=await lstat(args['--output-directory']).catch(()=>fail('OUTPUT_DIRECTORY_MISSING'));
  if(!outStat.isDirectory()||outStat.isSymbolicLink()||await realpath(args['--output-directory'])!==args['--output-directory'])fail('OUTPUT_DIRECTORY_REJECTED');
  const root=await realpath(process.cwd());if(root!==process.cwd())fail('WORKSPACE_PATH_MISMATCH');
  const branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  if(branch!=='fix/nomina-turno-202-production-launcher'||head!==args['--expected-head'])fail('GIT_PIN_MISMATCH');
  execFileSync('git',['merge-base','--is-ancestor',BASE_CONTRACT_COMMIT,head],{cwd:root,windowsHide:true});
  const validateAbsolute=(arg:string)=>{if(!isAbsolute(arg))fail('PATH_NOT_ABSOLUTE');return arg;};
  const dbHost=args['--db-host'];
  const caPath=validateAbsolute(args['--ca-file']);await assertRegularNoSymlink(caPath);const caBytes=await readFile(caPath),caSha=sha(caBytes);caBytes.fill(0);
  const plan:OfflinePlan={workspaceRoot:root,branch,head,contractCommit:BASE_CONTRACT_COMMIT,correctorCommit:args['--expected-corrector-commit'],dumpPath:'C:/Users/CORE ULTRA/Documents/EmpiriaBackups/nomina-turno-202-pre-correccion-20261015T013132Z/full.dump',dumpSha256:args['--backup-sha256'],historicalPdfPath:'C:/Users/CORE ULTRA/Documents/EmpiriaBackups/nomina-turno-202-pre-correccion-20261015T013132Z/historical-account-77.pdf',historicalPdfSha256:args['--pdf-sha256'],reportPath:path.join(root,'reports/nomina-202-performance-20261015T150430Z/report.json'),reportSha256:args['--native-report-sha256'],expectedReportSha256:CERTIFIED_REPORT_SHA256,entryReportPath:path.join(root,'reports/nomina-202-performance-20261015T155014Z/report.json'),entryReportSha256:args['--readonly-report-sha256'],expectedEntryReportSha256:ENTRY_READONLY_REPORT_SHA256,caPath,caSha256:caSha,expectedCaSha256:PRODUCTION_CA_SHA256,host:dbHost,servername:dbHost,expectedServername:dbHost,port:Number(args['--db-port']),database:args['--db-name'],healthUrl:validateHealthUrl(args['--health-url']),healthHostname:'api.empiriasuite.com',localCertification:false};
  if(plan.head!==args['--expected-head']||plan.correctorCommit!==CORRECTOR_COMMIT||args['--project-ref-sha256'].length!==64)fail('PLAN_PIN_MISMATCH');
  const validated=await validateOfflinePlan(plan);validated.caPem.fill(0);validated.dumpBytes.fill(0);validated.pdfBytes.fill(0);validated.reportBytes.fill(0);validated.entryReportBytes.fill(0);
  return plan;
}

export async function readHistoricalPdf(env:LauncherEnvironment,expected:Readonly<{bucket:string;path:string}>,createStorageClient:typeof createClient=createClient):Promise<PdfRead>{
  if(expected.bucket!==env.SUPABASE_STORAGE_BUCKET||!expected.path||expected.path.startsWith('/')||expected.path.split('/').some(x=>!x||x==='.'||x==='..')||/[?#\\]/.test(expected.path))fail('PDF_REFERENCE_REJECTED');
  let client=createStorageClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let bytes:Buffer|undefined;
  try{
    const bucket=client.storage.from(expected.bucket),info=await bucket.info(expected.path);if(info.error||!info.data)fail('PDF_METADATA_READ_FAILED');
    const meta=info.data as {contentType?:string;size?:number;eTag?:string;etag?:string};
    if(meta.contentType!=='application/pdf'||meta.size!==HISTORICAL_PDF_SIZE)fail('PDF_METADATA_MISMATCH');
    const contentType=meta.contentType;if(contentType!=='application/pdf'||meta.size!==HISTORICAL_PDF_SIZE)return fail('PDF_METADATA_MISMATCH');
    const download=await bucket.download(expected.path),blob=download.data;if(download.error||blob===null)return fail('PDF_DOWNLOAD_FAILED');
    bytes=Buffer.from(await blob.arrayBuffer());if(bytes.length!==HISTORICAL_PDF_SIZE||sha(bytes)!==HISTORICAL_PDF_SHA256)fail('PDF_HASH_MISMATCH');
    const etag=meta.eTag??meta.etag;if(!etag)return fail('PDF_ETAG_MISSING');
    const result=Object.freeze({bytes,reference:`${expected.bucket}/${expected.path}`,mime:contentType,etag});bytes=undefined;return result;
  }finally{bytes?.fill(0);client=undefined as never;}
}

export function makeEntryEvidence(receipt:Awaited<ReturnType<typeof runReadOnlyEntryPreflight>>,head:string,now=Date.now()):EntryEvidence{
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
  const evidence:EntryEvidence={codeSha:sha(head),evidenceSha:ENTRY_READONLY_REPORT_SHA256,dumpSha:DUMP_SHA256,historicalPdfSha:HISTORICAL_PDF_SHA256,runId:randomUUID(),nonce:randomBytes(24).toString('hex'),expiresAt:new Date(now+15*60_000).toISOString(),first:snapshots[0],second:snapshots[1],runIdUnique:true,nonceUnused:true,health:healthEvidence,pdfAttestation:'NOT_SENT_OR_DELIVERED_NOT_APPROVED_OR_SIGNED_NOT_PAID_OR_POSTED_NOT_USED_OFFICIALLY',historyHasNoLaterRelatedAudit:true,duplicateCount:0,priorRepairCount:0,lifecycleBlockerCount:0,pdf:{sha256:pdf.sha256,referenceSha256:pdf.referenceSha256,size:pdf.size,mime:'application/pdf',etag:pdf.etag},exactBeforeState:true,sequenceBaseline};
  if(h?.httpStatus!==200||h?.databaseStatus!=='ok'||h?.outbox!==false||checks.syncConfirmation?.enabled!==false||h?.recalcRequested||h?.recalcActive||h?.workerStopped!==true||checks.locks?.waiting!==0||checks.locks?.ddl!==0)fail('RECEIPT_CHECKS_INVALID');
  return evidence;
}

/** Runs only after offline pins. Secrets remain local to this call and never enter logs or receipts. */
export async function runProductionLauncher(args:LauncherArguments){
  validateHealthUrl(args['--health-url']);
  const plan=await createProductionPlan(args);let env:MutableLauncherEnvironment|undefined;
  try{
    const health=await readHealthHttp(plan);if(health.httpStatus!==200||health.databaseStatus!=='ok'||health.outbox||health.recalcRequested||health.recalcActive||!health.workerStopped)fail('HEALTH_OR_FLAGS');
    env=await readExplicitEnvironment(args['--env-file']);
    const target=validateServiceConfiguration(env);if(target.databaseHost!==args['--db-host']||target.databasePort!==Number(args['--db-port'])||target.databaseName!==args['--db-name']||sha(target.projectRef)!==args['--project-ref-sha256'])fail('DATABASE_TARGET_PIN_MISMATCH');
    const projectRef=target.projectRef; if(sha(projectRef)!==args['--project-ref-sha256'])fail('PROJECT_REF_PIN_MISMATCH');
    assertServiceRoleCredential(env.SUPABASE_SERVICE_ROLE_KEY);
    const syncConfirmation={source:'MANUAL_CURRENT' as const,enabled:false as const,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+5*60_000).toISOString()};
    const receipt=await runReadOnlyEntryPreflight(plan,{plan,readCredentials:async()=>({user:decodeURIComponent(new URL(env!.DATABASE_URL).username),password:decodeURIComponent(new URL(env!.DATABASE_URL).password)}),readPdf:ref=>readHistoricalPdf(env!,ref),syncConfirmation});
    const issuedAt=Date.now(),evidence=makeEntryEvidence(receipt,plan.head,issuedAt),phrase=buildPendingEntryPhrase(evidence,issuedAt);if(!verifyPendingEntryPhrase(phrase,evidence,issuedAt))fail('PENDING_PHRASE_SELF_CHECK');
    const output=await realpath(args['--output-directory']).catch(()=>fail('OUTPUT_DIRECTORY_MISSING'));if(output!==args['--output-directory'])fail('OUTPUT_DIRECTORY_SYMLINK_OR_PATH_MISMATCH');
    const id=randomUUID(),baseline=await publishReadOnlyReceipt(output,'baseline',id,{status:'BASELINE_VERIFIED',run_id:evidence.runId,head:plan.head,correctorCommit:CORRECTOR_COMMIT,reportSha256:CERTIFIED_REPORT_SHA256,entryReportSha256:ENTRY_READONLY_REPORT_SHA256,dumpSha256:DUMP_SHA256,pdfSha256:HISTORICAL_PDF_SHA256,digests:receipt.digests,sequenceBaseline:receipt.sequenceBaseline,checks:receipt.checks});
    const sanitized={...receipt,connections:receipt.connections.map(c=>({id:c.id,observedAt:c.observedAt,serverVersion:c.serverVersion,tlsProtocol:c.tlsProtocol,servernameSha256:sha(c.servername),transactionReadOnly:c.transactionReadOnly}))};
    const pending=await publishReadOnlyReceipt(output,'pending',randomUUID(),{...sanitized,baseline:{path:path.relative(output,baseline.path).replace(/\\/g,'/'),sha256:baseline.sha256},phrase});
    return Object.freeze({status:'PENDING_USER_CONFIRMATION',phrase,receiptPath:path.relative(plan.workspaceRoot,pending.path).replace(/\\/g,'/'),receiptSha256:pending.sha256,baselinePath:path.relative(plan.workspaceRoot,baseline.path).replace(/\\/g,'/'),baselineSha256:baseline.sha256});
  }finally{if(env){env.DATABASE_URL='';env.SUPABASE_URL='';env.SUPABASE_SERVICE_ROLE_KEY='';env.SUPABASE_STORAGE_BUCKET='';env=undefined;}}
}

export async function productionLauncherCli(argv=process.argv.slice(2)){
  const args=parseLauncherArguments(argv);return runProductionLauncher(args);
}
