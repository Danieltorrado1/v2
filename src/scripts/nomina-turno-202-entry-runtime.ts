/**
 * Fail-closed, side-effect-limited entry gate. It validates an externally ACTIVE
 * authorization and a sealed preflight receipt before any credential callback.
 * It has no PostgreSQL client and cannot activate an authorization or run payroll.
 */
import { createHash, randomUUID } from 'node:crypto';
import { open, link, unlink, readFile, realpath, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const RELEASE_PINS = Object.freeze({
  correctorCommit: '95fc6bb6879409d37a088e451fb64f2edafacb5f',
  dumpSha256: 'dd1f9d298e83fb9664d1795c4e452698c26b274569cca11715b2c2f03ff99d75',
  historicalPdfSha256: 'cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4',
});
export const ALLOWED_WRITE_SET = Object.freeze([
  'nomina_movimientos','cobertura_cuenta_cobro_externa_detalle','cobertura_cuentas_cobro_externas',
  'nomina_revision_operativa','auditoria','auditoria_eventos','historial_cambios',
]);
export const ALLOWED_SEQUENCE_ADVANCES = Object.freeze({
  'public.auditoria_id_seq':4,
  'public.auditoria_eventos_id_seq':4,
  'public.nomina_revision_operativa_id_seq':1,
  'public.historial_cambios_id_seq':42,
});
export const RECEIPT_ROUTES = Object.freeze({
  baseline:'baseline', pending:'pending', stopped:'stopped', committed:'committed', documentRecovery:'document-recovery',
});

export type EntryPins = Readonly<{contractCommit:string;correctorCommit:string;dumpSha256:string;historicalPdfSha256:string}>;
export type EntryClaims = Readonly<{
  version:'NOMINA-202-192-AUTH-V1'; status:'ACTIVE'; contractCommit:string; correctorCommit:string;
  dumpSha256:string; historicalPdfSha256:string; runId:string; nonce:string; expiresAt:string;
  preflightReceiptPath:string; preflightReceiptSha256:string; snapshotsDigestSha256:string;
  pdfAttestation:'UNUSED_OFFICIAL_DOCUMENT_CONFIRMED'; case:'15/24/3/12/202/192/77/220/837/20114';
  before:'qty1/rate97800/total97800/accountPENDING/revisionREVISADO-v30/ssfalse';
  after:'qty2/rate97800/total195600/accountPENDING/revisionREQUIERE_REVISION-v31/refINVALIDATED/ssfalse';
  writeSet:'nomina_movimientos,cobertura_cuenta_cobro_externa_detalle,cobertura_cuentas_cobro_externas,nomina_revision_operativa,auditoria,auditoria_eventos,historial_cambios';
  allowed_sequence_advances:'public.auditoria_id_seq=+4;public.auditoria_eventos_id_seq=+4;public.nomina_revision_operativa_id_seq=+1;public.historial_cambios_id_seq=+42';
  allowed_sequence_advances_sha256:string;
  audits:'auditoria=4,auditoria_eventos=4,historial_cambios=42';
  rollback:'data-atomic;sequences-monotonic-only;no-setval-restart-reuse';
  document:'preserve-old;version-new-after-commit;recover-without-economic-replay';
  noRecalculation:'true'; noExternalSync:'true'; noInstitutionChanges:'true';
}>;

const KEY_ORDER = Object.freeze([
  'version','status','contractCommit','correctorCommit','dumpSha256','historicalPdfSha256','runId','nonce','expiresAt',
  'preflightReceiptPath','preflightReceiptSha256','snapshotsDigestSha256','pdfAttestation','case','before','after',
  'writeSet','allowed_sequence_advances','allowed_sequence_advances_sha256','audits','rollback','document','noRecalculation','noExternalSync','noInstitutionChanges',
] as const);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[a-f0-9]{48}$/;
const SHA = /^[a-f0-9]{64}$/;
const fail = (s:string):never=>{throw new Error(s);};
const sha256=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const orderedCanonical=(x:unknown):string=>JSON.stringify(x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(v=>JSON.parse(orderedCanonical(v))):Object.fromEntries(Object.keys(x as object).sort().map(k=>[k,JSON.parse(orderedCanonical((x as Record<string,unknown>)[k]))])));
export const ALLOWED_SEQUENCE_ADVANCES_CANONICAL='public.auditoria_id_seq=+4;public.auditoria_eventos_id_seq=+4;public.nomina_revision_operativa_id_seq=+1;public.historial_cambios_id_seq=+42';
export const ALLOWED_SEQUENCE_ADVANCES_SHA256=createHash('sha256').update(orderedCanonical(ALLOWED_SEQUENCE_ADVANCES)).digest('hex');

/** Exact LF-delimited canonical phrase. Any changed order, duplicate, omission or addition differs. */
export function formatActivePhrase(c:EntryClaims):string {
  return KEY_ORDER.map(k=>`${k}=${c[k]}`).join('\n');
}

export type NonceState = Readonly<{status:'ISSUED'|'PENDING'|'REVOKED'|'USED'|'UNKNOWN';runId:string;nonce:string;expiresAt:string}>;
export type SealedReceipt = Readonly<{
  status:'BASELINE_VERIFIED'; synthetic:false; runId:string; nonce:string;
  firstConnectionId:string; secondConnectionId:string; firstSnapshotAt:string; secondSnapshotAt:string;
  digestSet:Readonly<Record<string,string>>; secondDigestSet:Readonly<Record<string,string>>;
  health:Readonly<{http:200;database:'ok';outbox:false;sync:false;recalcRequested:false;recalcActive:false;workerStopped:true;waitingLocks:0;activeDdl:0}>;
  pdf:Readonly<{sha256:string;size:3051;mime:'application/pdf';etag:string;referenceSha256:string}>;
  pdfAttestation:'UNUSED_OFFICIAL_DOCUMENT_CONFIRMED';
  actor:Readonly<{id:12;active:true;authorizedEmpresa:15;authorizedContrato:24}>;
  exactBeforeState:true; duplicateCount:0; priorRepairCount:0; lifecycleBlockerCount:0; laterRelatedAuditCount:0;
  caseChecks:Readonly<{
    periodOpen:true;movement:Readonly<{id:192;status:'PENDIENTE';quantity:1;unitRate:97800;calculated:97800;total:97800;socialSecurity:false}>;
    turn:Readonly<{id:202;movementId:192;startDate:'2026-09-08';endDate:'2026-09-09';inclusiveDays:2}>;
    detail:Readonly<{id:220;accountId:77;movementId:192;turnId:202;active:true;amount:97800}>;
    account:Readonly<{id:77;active:true;status:'PENDIENTE';total:97800}>;
    revision:Readonly<{id:20114;status:'REVISADO';version:30}>;
    linkedPayments:0;linkedSettlements:0;linkedPayslips:0;
  }>;
  sequences:Readonly<{auditoria:string;auditoria_eventos:string;nomina_revision_operativa:string;historial_cambios:string}>;
}>;

export type GateInput=Readonly<{
  phrase:string; claims:EntryClaims; pins:EntryPins; contractCommitFromGit:string;
  nonceState:NonceState; workspaceRoot:string; receiptPath:string; receiptBytes:Buffer; receiptSha256:string;
  receipt:SealedReceipt; now?:number; syntheticEvidence?:boolean;
}>;

function validateClaims(c:EntryClaims,p:EntryPins,now:number){
  if(c.version!=='NOMINA-202-192-AUTH-V1'||c.status!=='ACTIVE')fail('AUTHORIZATION_NOT_ACTIVE');
  if(p.correctorCommit!==RELEASE_PINS.correctorCommit||c.correctorCommit!==p.correctorCommit)fail('CORRECTOR_COMMIT_PIN_MISMATCH');
  if(!p.contractCommit||p.contractCommit.length!==40||!/^[a-f0-9]{40}$/.test(p.contractCommit))fail('CONTRACT_COMMIT_INVALID');
  if(c.contractCommit!==p.contractCommit)fail('CONTRACT_COMMIT_PIN_MISMATCH');
  if(c.dumpSha256!==RELEASE_PINS.dumpSha256||p.dumpSha256!==RELEASE_PINS.dumpSha256)fail('DUMP_HASH_PIN_MISMATCH');
  if(c.historicalPdfSha256!==RELEASE_PINS.historicalPdfSha256||p.historicalPdfSha256!==RELEASE_PINS.historicalPdfSha256)fail('PDF_HASH_PIN_MISMATCH');
  if(!UUID.test(c.runId)||!NONCE.test(c.nonce))fail('RUN_OR_NONCE_INVALID');
  const exp=Date.parse(c.expiresAt);if(!Number.isFinite(exp)||exp<=now||exp>now+15*60_000)fail('AUTHORIZATION_EXPIRED_OR_TOO_LONG');
  for(const k of ['preflightReceiptSha256','snapshotsDigestSha256'] as const)if(!SHA.test(c[k]))fail('CLAIM_DIGEST_INVALID_'+k);
  if(c.pdfAttestation!=='UNUSED_OFFICIAL_DOCUMENT_CONFIRMED')fail('DOCUMENT_ATTESTATION_REQUIRED');
  if(c.case!=='15/24/3/12/202/192/77/220/837/20114'||c.before!=='qty1/rate97800/total97800/accountPENDING/revisionREVISADO-v30/ssfalse'||c.after!=='qty2/rate97800/total195600/accountPENDING/revisionREQUIERE_REVISION-v31/refINVALIDATED/ssfalse')fail('ECONOMIC_CLAIMS_MISMATCH');
  if(c.writeSet!==ALLOWED_WRITE_SET.join(',')||c.allowed_sequence_advances!==ALLOWED_SEQUENCE_ADVANCES_CANONICAL||c.allowed_sequence_advances_sha256!==ALLOWED_SEQUENCE_ADVANCES_SHA256)fail('WRITE_OR_SEQUENCE_SCOPE_MISMATCH');
  if(c.audits!=='auditoria=4,auditoria_eventos=4,historial_cambios=42'||c.rollback!=='data-atomic;sequences-monotonic-only;no-setval-restart-reuse'||c.document!=='preserve-old;version-new-after-commit;recover-without-economic-replay'||c.noRecalculation!=='true'||c.noExternalSync!=='true'||c.noInstitutionChanges!=='true')fail('OPERATIONAL_GUARD_MISMATCH');
}

function validateReceipt(receipt:SealedReceipt,claims:EntryClaims,bytes:Buffer,actualSha:string){
  if(!SHA.test(actualSha)||sha256(bytes)!==actualSha||actualSha!==claims.preflightReceiptSha256)fail('PREFLIGHT_RECEIPT_HASH_MISMATCH');
  const root=JSON.parse(bytes.toString('utf8')) as unknown;
  if(orderedCanonical(root)!==orderedCanonical(receipt)||bytes.toString('utf8')!==JSON.stringify(root,null,2)+'\n')fail('PREFLIGHT_RECEIPT_NOT_CANONICAL_OR_MISMATCHED');
  if(receipt.status!=='BASELINE_VERIFIED'||receipt.synthetic!==false||receipt.runId!==claims.runId||receipt.nonce!==claims.nonce)fail('PREFLIGHT_RECEIPT_NOT_VERIFIED');
  if(receipt.firstConnectionId===receipt.secondConnectionId||receipt.firstSnapshotAt===receipt.secondSnapshotAt)fail('SNAPSHOTS_NOT_INDEPENDENT');
  const entries=Object.entries(receipt.digestSet);
  if(entries.length!==12||entries.some(([k,v])=>!['critical_schema','sources','movement_192','detail_220','account_77','revision_20114','related_audits','related_history','pdf_metadata','protected_tables','write_set_before','sequence_baseline'].includes(k)||!SHA.test(v)))fail('DIGEST_SET_INVALID');
  if(orderedCanonical(receipt.digestSet)!==orderedCanonical(receipt.secondDigestSet))fail('SNAPSHOT_DIGEST_DRIFT');
  if(sha256(orderedCanonical(receipt.digestSet))!==claims.snapshotsDigestSha256)fail('SNAPSHOT_DIGEST_PIN_MISMATCH');
  const h=receipt.health;if(h.http!==200||h.database!=='ok'||h.outbox||h.sync||h.recalcRequested||h.recalcActive||!h.workerStopped||h.waitingLocks!==0||h.activeDdl!==0)fail('PREFLIGHT_HEALTH_FAILED');
  if(receipt.pdf.sha256!==RELEASE_PINS.historicalPdfSha256||receipt.pdf.size!==3051||receipt.pdf.mime!=='application/pdf'||!receipt.pdf.etag||!SHA.test(receipt.pdf.referenceSha256)||receipt.pdfAttestation!==claims.pdfAttestation)fail('PREFLIGHT_PDF_FAILED');
  if(receipt.digestSet.pdf_metadata!==sha256(orderedCanonical(receipt.pdf)))fail('PDF_METADATA_DIGEST_MISMATCH');
  if(receipt.actor.id!==12||!receipt.actor.active||receipt.actor.authorizedEmpresa!==15||receipt.actor.authorizedContrato!==24)fail('ACTOR_AUTHORIZATION_FAILED');
  if(!receipt.exactBeforeState||receipt.duplicateCount||receipt.priorRepairCount||receipt.lifecycleBlockerCount||receipt.laterRelatedAuditCount)fail('PREFLIGHT_CASE_GATES_FAILED');
  const cc=receipt.caseChecks;
  if(!cc.periodOpen||cc.movement.id!==192||cc.movement.status!=='PENDIENTE'||cc.movement.quantity!==1||cc.movement.unitRate!==97800||cc.movement.calculated!==97800||cc.movement.total!==97800||cc.movement.socialSecurity!==false||
    cc.turn.id!==202||cc.turn.movementId!==192||cc.turn.startDate!=='2026-09-08'||cc.turn.endDate!=='2026-09-09'||cc.turn.inclusiveDays!==2||
    cc.detail.id!==220||cc.detail.accountId!==77||cc.detail.movementId!==192||cc.detail.turnId!==202||!cc.detail.active||cc.detail.amount!==97800||
    cc.account.id!==77||!cc.account.active||cc.account.status!=='PENDIENTE'||cc.account.total!==97800||cc.revision.id!==20114||cc.revision.status!=='REVISADO'||cc.revision.version!==30||cc.linkedPayments||cc.linkedSettlements||cc.linkedPayslips)fail('EXACT_BEFORE_STATE_FAILED');
  if(Object.keys(receipt.sequences).sort().join(',')!=='auditoria,auditoria_eventos,historial_cambios,nomina_revision_operativa')fail('SEQUENCE_SCOPE_INVALID');
  for(const v of Object.values(receipt.sequences))if(!/^\d+$/.test(v))fail('SEQUENCE_BASELINE_INVALID');
  if(receipt.digestSet.sequence_baseline!==sha256(orderedCanonical(receipt.sequences)))fail('SEQUENCE_BASELINE_DIGEST_MISMATCH');
}

/** Pure validation entry point. Must run before opening/parsing any credential file. */
export function validateActiveEntry(input:GateInput):Readonly<{runId:string;nonce:string;receiptPath:string;receiptSha256:string}> {
  const now=input.now??Date.now();if(input.syntheticEvidence)fail('SYNTHETIC_EVIDENCE_REJECTED');
  validateClaims(input.claims,input.pins,now);
  if(input.contractCommitFromGit!==input.pins.contractCommit)fail('CONTRACT_GIT_HEAD_MISMATCH');
  if(input.phrase!==formatActivePhrase(input.claims))fail('PHRASE_NOT_EXACT_CANONICAL');
  if(input.nonceState.status!=='ISSUED'||input.nonceState.runId!==input.claims.runId||input.nonceState.nonce!==input.claims.nonce||Date.parse(input.nonceState.expiresAt)!==Date.parse(input.claims.expiresAt))fail('NONCE_NOT_ISSUED_OR_REVOKED_USED_UNKNOWN');
  const requiredPath=receiptDestination(input.workspaceRoot,'baseline',input.claims.runId);
  if(!path.isAbsolute(input.receiptPath)||path.normalize(input.receiptPath)!==path.normalize(requiredPath)||path.normalize(input.claims.preflightReceiptPath)!==path.normalize(requiredPath))fail('PREFLIGHT_RECEIPT_PATH_MISMATCH');
  validateReceipt(input.receipt,input.claims,input.receiptBytes,input.receiptSha256);
  return Object.freeze({runId:input.claims.runId,nonce:input.claims.nonce,receiptPath:input.receiptPath,receiptSha256:input.receiptSha256});
}

/** Atomically claims the externally ACTIVE nonce only after every static/evidence gate passes. */
export async function claimNonceThenReadCredentials<T>(input:GateInput,claimNonce:(runId:string,nonce:string,expiresAt:string)=>Promise<boolean>,readCredentials:()=>Promise<T>):Promise<Readonly<{authorization:ReturnType<typeof validateActiveEntry>;credentials:T}>>{
  const authorization=validateActiveEntry(input);
  if(!(await claimNonce(authorization.runId,authorization.nonce,input.claims.expiresAt)))fail('NONCE_ALREADY_CLAIMED');
  const credentials=await readCredentials();
  return Object.freeze({authorization,credentials});
}

export type ReceiptKind=keyof typeof RECEIPT_ROUTES;
export function receiptDestination(root:string,kind:ReceiptKind,runId:string){
  if(!UUID.test(runId))fail('RECEIPT_RUN_ID_INVALID');
  return path.join(root,'reports','nomina-202-entry',RECEIPT_ROUTES[kind],`${runId}.json`);
}

/** Atomic no-replace receipt creation: exclusive temp, hard-link publication, cleanup of own temp only. */
export async function writeReceiptNoReplace(root:string,kind:ReceiptKind,runId:string,value:Readonly<Record<string,unknown>>){
  const target=receiptDestination(root,kind,runId),parent=path.dirname(target);
  if(path.resolve(parent)!==path.resolve(root,'reports','nomina-202-entry',RECEIPT_ROUTES[kind]))fail('RECEIPT_ROUTE_INVALID');
  const expectedStatus={baseline:'BASELINE_VERIFIED',pending:'PENDING_USER_CONFIRMATION',stopped:'STOPPED',committed:'COMMITTED',documentRecovery:'DOCUMENT_RECOVERY'}[kind];
  if(value.status!==expectedStatus||value.runId!==runId)fail('RECEIPT_KIND_STATUS_MISMATCH');
  const realRoot=await realpath(root);await mkdir(parent,{recursive:true});
  if(await realpath(parent)!==path.resolve(realRoot,'reports','nomina-202-entry',RECEIPT_ROUTES[kind]))fail('RECEIPT_PARENT_SYMLINK_REJECTED');
  const payload=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  const temp=path.join(parent,`.${runId}.${randomUUID()}.tmp`);
  const handle=await open(temp,'wx',0o600);
  try{await handle.writeFile(payload);await handle.sync();await handle.close();await link(temp,target);}
  catch(error){await handle.close().catch(()=>{});await unlink(temp).catch(()=>{});throw error;}
  await unlink(temp);
  return Object.freeze({path:target,sha256:sha256(payload)});
}

export async function readReceiptFromDisk(receiptPath:string):Promise<Buffer>{return readFile(receiptPath);}

/** Reads only the single canonical baseline route, verifies the resolved path, then validates. */
export async function readAndValidateActiveEntry(input:Omit<GateInput,'receiptBytes'|'receiptSha256'|'workspaceRoot'>,workspaceRoot:string){
  if(!path.isAbsolute(workspaceRoot))fail('WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
  const expected=receiptDestination(workspaceRoot,'baseline',input.claims.runId);
  if(path.resolve(input.receiptPath)!==path.resolve(expected)||path.resolve(input.claims.preflightReceiptPath)!==path.resolve(expected))fail('PREFLIGHT_RECEIPT_PATH_MISMATCH');
  const [resolved,realRoot]=await Promise.all([realpath(expected),realpath(workspaceRoot)]);
  const relative=path.relative(realRoot,resolved),requiredRelative=path.join('reports','nomina-202-entry','baseline',`${input.claims.runId}.json`);
  if(path.isAbsolute(relative)||relative.startsWith('..')||relative.toLowerCase()!==requiredRelative.toLowerCase())fail('PREFLIGHT_RECEIPT_SYMLINK_REJECTED');
  const bytes=await readFile(resolved);
  return validateActiveEntry({...input,workspaceRoot,receiptBytes:bytes,receiptSha256:sha256(bytes)});
}

export function assertExactWriteSet(changedTables:readonly string[]){
  const actual=[...new Set(changedTables)].sort(),expected=[...ALLOWED_WRITE_SET].sort();
  if(actual.length!==changedTables.length||JSON.stringify(actual)!==JSON.stringify(expected))fail('WRITE_SET_NOT_EXACT');
}

/** Rejects every sequence delta outside the three approved monotonic sequences. */
export function assertAllowedSequenceDeltas(before:Readonly<Record<string,string>>,after:Readonly<Record<string,string>>,outcome:'COMMIT'|'ROLLBACK'|'ALREADY_APPLIED'){
  const allowed=new Set(Object.keys(ALLOWED_SEQUENCE_ADVANCES));
  for(const name of new Set([...Object.keys(before),...Object.keys(after)])){
    const b=before[name],a=after[name];if(b===undefined||a===undefined||!/^\d+$/.test(b)||!/^\d+$/.test(a))fail('SEQUENCE_INVENTORY_DRIFT');
    const delta=BigInt(a!)-BigInt(b!);
    if(allowed.has(name)){
      if(delta<0n)fail('SEQUENCE_REWIND_FORBIDDEN');
      if(outcome==='COMMIT'&&delta!==BigInt(ALLOWED_SEQUENCE_ADVANCES[name as keyof typeof ALLOWED_SEQUENCE_ADVANCES]))fail('SEQUENCE_COMMIT_DELTA_MISMATCH_'+name);
      if(outcome==='ROLLBACK'&&delta>BigInt(ALLOWED_SEQUENCE_ADVANCES[name as keyof typeof ALLOWED_SEQUENCE_ADVANCES]))fail('SEQUENCE_ROLLBACK_DELTA_EXCEEDS_MAX_'+name);
      if(outcome==='ALREADY_APPLIED'&&delta!==0n)fail('SEQUENCE_IDEMPOTENCY_ADVANCE_'+name);
    }
    else if(delta!==0n)fail('UNAUTHORIZED_SEQUENCE_ADVANCE_'+name);
  }
}

export function assertWriteSetForOutcome(changedTables:readonly string[],outcome:'COMMIT'|'ROLLBACK'|'ALREADY_APPLIED'){
  if(outcome==='COMMIT')return assertExactWriteSet(changedTables);
  if(changedTables.length!==0)fail('PERSISTED_TABLE_CHANGES_AFTER_'+outcome);
}

/** Two independent, explicit read-only transactions; this utility has no DML surface. */
export type ReadOnlySnapshotClient=Readonly<{
  connectionId:string;
  beginRepeatableReadOnly():Promise<void>;
  verifyReadOnlyTransaction():Promise<boolean>;
  captureSnapshot():Promise<Readonly<Record<string,unknown>>>;
  rollback():Promise<void>;
  close():Promise<void>;
}>;
export async function captureIndependentReadOnlySnapshots(connect:()=>Promise<ReadOnlySnapshotClient>){
  const take=async()=>{
    const client=await connect();let began=false;
    try{await client.beginRepeatableReadOnly();began=true;if(!(await client.verifyReadOnlyTransaction()))fail('READ_ONLY_TRANSACTION_NOT_CONFIRMED');const snapshot=await client.captureSnapshot();return{connectionId:client.connectionId,snapshot};}
    finally{try{if(began)await client.rollback();}finally{await client.close();}}
  };
  const first=await take(),second=await take();
  if(!first.connectionId||first.connectionId===second.connectionId||orderedCanonical(first.snapshot)!==orderedCanonical(second.snapshot))fail('INDEPENDENT_READS_DRIFTED');
  return Object.freeze({first,second,digestSha256:sha256(orderedCanonical(first.snapshot))});
}
