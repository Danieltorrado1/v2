import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ALLOWED_WRITE_SET, ALLOWED_SEQUENCE_ADVANCES_SHA256, RELEASE_PINS, formatActivePhrase, validateActiveEntry,
  claimNonceThenReadCredentials, captureIndependentReadOnlySnapshots, readAndValidateActiveEntry,
  receiptDestination, writeReceiptNoReplace, assertExactWriteSet, assertAllowedSequenceDeltas, assertWriteSetForOutcome,
  type EntryClaims, type GateInput, type SealedReceipt,
} from '../scripts/nomina-turno-202-entry-runtime';

const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const canon=(v:unknown):string=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(canon):Object.fromEntries(Object.keys(v as object).sort().map(k=>[k,JSON.parse(canon((v as Record<string,unknown>)[k]))])));
const now=Date.parse('2026-10-15T14:00:00Z');
const contractCommit='a'.repeat(40),runId='c00dbeef-1111-4111-8111-123456789abc',nonce='b'.repeat(48);

function makeInput(patch:Partial<{claims:Partial<EntryClaims>;receipt:Partial<SealedReceipt>;receiptPath:string;workspaceRoot:string;nonceStatus:'ISSUED'|'PENDING'|'REVOKED'|'USED'|'UNKNOWN';synthetic:boolean}>={}):GateInput {
  const pdf={sha256:RELEASE_PINS.historicalPdfSha256,size:3051 as const,mime:'application/pdf' as const,etag:'"sealed"',referenceSha256:sha('pdf-reference')};
  const sequences={auditoria:'14878',auditoria_eventos:'60068',nomina_revision_operativa:'20113',historial_cambios:'213656'};
  const digestSet=Object.fromEntries(['critical_schema','sources','movement_192','detail_220','account_77','revision_20114','related_audits','related_history','protected_tables','write_set_before'].map(k=>[k,sha(k)]));
  digestSet.pdf_metadata=sha(canon(pdf));
  digestSet.sequence_baseline=sha(canon(sequences));
  const baseReceipt:SealedReceipt={
    status:'BASELINE_VERIFIED',synthetic:false,runId,nonce,firstConnectionId:'conn-a',secondConnectionId:'conn-b',firstSnapshotAt:'2026-10-15T13:58:00Z',secondSnapshotAt:'2026-10-15T13:59:00Z',digestSet,secondDigestSet:{...digestSet},
    health:{http:200,database:'ok',outbox:false,sync:false,recalcRequested:false,recalcActive:false,workerStopped:true,waitingLocks:0,activeDdl:0},
    pdf,pdfAttestation:'UNUSED_OFFICIAL_DOCUMENT_CONFIRMED',
    actor:{id:12,active:true,authorizedEmpresa:15,authorizedContrato:24},exactBeforeState:true,duplicateCount:0,priorRepairCount:0,lifecycleBlockerCount:0,laterRelatedAuditCount:0,
    caseChecks:{periodOpen:true,movement:{id:192,status:'PENDIENTE',quantity:1,unitRate:97800,calculated:97800,total:97800,socialSecurity:false},turn:{id:202,movementId:192,startDate:'2026-09-08',endDate:'2026-09-09',inclusiveDays:2},detail:{id:220,accountId:77,movementId:192,turnId:202,active:true,amount:97800},account:{id:77,active:true,status:'PENDIENTE',total:97800},revision:{id:20114,status:'REVISADO',version:30},linkedPayments:0,linkedSettlements:0,linkedPayslips:0},
    sequences,
  };
  const receipt={...baseReceipt,...patch.receipt};
  const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
  const workspaceRoot=patch.workspaceRoot??path.resolve('tmp','synthetic-entry-workspace');
  const receiptPath=patch.receiptPath??receiptDestination(workspaceRoot,'baseline',runId);
  const claims:EntryClaims={
    version:'NOMINA-202-192-AUTH-V1',status:'ACTIVE',contractCommit,correctorCommit:RELEASE_PINS.correctorCommit,
    dumpSha256:RELEASE_PINS.dumpSha256,historicalPdfSha256:RELEASE_PINS.historicalPdfSha256,runId,nonce,expiresAt:'2026-10-15T14:14:00.000Z',
    preflightReceiptPath:receiptPath,preflightReceiptSha256:sha(receiptBytes),snapshotsDigestSha256:sha(canon(digestSet)),pdfAttestation:'UNUSED_OFFICIAL_DOCUMENT_CONFIRMED',
    case:'15/24/3/12/202/192/77/220/837/20114',before:'qty1/rate97800/total97800/accountPENDING/revisionREVISADO-v30/ssfalse',
    after:'qty2/rate97800/total195600/accountPENDING/revisionREQUIERE_REVISION-v31/refINVALIDATED/ssfalse',writeSet:ALLOWED_WRITE_SET.join(',') as EntryClaims['writeSet'],
    allowed_sequence_advances:'public.auditoria_id_seq=+4;public.auditoria_eventos_id_seq=+4;public.nomina_revision_operativa_id_seq=+1;public.historial_cambios_id_seq=+42',allowed_sequence_advances_sha256:ALLOWED_SEQUENCE_ADVANCES_SHA256,audits:'auditoria=4,auditoria_eventos=4,historial_cambios=42',
    rollback:'data-atomic;sequences-monotonic-only;no-setval-restart-reuse',document:'preserve-old;version-new-after-commit;recover-without-economic-replay',noRecalculation:'true',noExternalSync:'true',noInstitutionChanges:'true',
    ...patch.claims,
  };
  const pins={contractCommit,correctorCommit:RELEASE_PINS.correctorCommit,dumpSha256:RELEASE_PINS.dumpSha256,historicalPdfSha256:RELEASE_PINS.historicalPdfSha256};
  const input:GateInput={phrase:formatActivePhrase(claims),claims,pins,contractCommitFromGit:contractCommit,nonceState:{status:patch.nonceStatus??'ISSUED',runId,nonce,expiresAt:claims.expiresAt},workspaceRoot,receiptPath,receiptBytes,receiptSha256:sha(receiptBytes),receipt,now,syntheticEvidence:patch.synthetic};
  return input;
}

test('exact canonical ACTIVE phrase accepts only pinned commits, backup, PDF and verified receipt',()=>{
  const input=makeInput();assert.equal(validateActiveEntry(input).runId,runId);
  const lines=input.phrase.split('\n');assert.equal(lines.length,25);
  assert.throws(()=>validateActiveEntry({...input,phrase:input.phrase+'\nextra=x'}),/PHRASE_NOT_EXACT/);
  const pendingClaims={...input.claims,status:'PENDING'} as never;
  assert.throws(()=>validateActiveEntry({...input,claims:pendingClaims,phrase:formatActivePhrase(pendingClaims)}),/AUTHORIZATION_NOT_ACTIVE/);
  assert.throws(()=>validateActiveEntry({...input,phrase:lines.slice(0,3).concat(lines.slice(4,5),lines.slice(3,4),lines.slice(5)).join('\n')}),/PHRASE_NOT_EXACT/);
  assert.throws(()=>validateActiveEntry({...input,phrase:input.phrase+'\nstatus=ACTIVE'}),/PHRASE_NOT_EXACT/);
});

test('invalid/expired/revoked/reused/unknown nonce and wrong runtime pins fail before credentials',async()=>{
  for(const nonceStatus of ['PENDING','REVOKED','USED','UNKNOWN'] as const)assert.throws(()=>validateActiveEntry(makeInput({nonceStatus})),/NONCE_NOT_ISSUED/);
  assert.throws(()=>validateActiveEntry(makeInput({claims:{expiresAt:'2026-10-15T13:59:59Z'}})),/EXPIRED/);
  assert.throws(()=>validateActiveEntry(makeInput({claims:{expiresAt:'2026-10-15T14:15:01Z'}})),/EXPIRED/);
  assert.throws(()=>validateActiveEntry({...makeInput(),contractCommitFromGit:'c'.repeat(40)}),/GIT_HEAD/);
  assert.throws(()=>validateActiveEntry(makeInput({synthetic:true})),/SYNTHETIC/);
  let reads=0,claims=0;
  await assert.rejects(claimNonceThenReadCredentials(makeInput({claims:{status:'PENDING' as never}}),async()=>{claims++;return true;},async()=>{reads++;return 'secret';}),/AUTHORIZATION_NOT_ACTIVE/);
  assert.equal(claims,0);assert.equal(reads,0);
  await assert.rejects(claimNonceThenReadCredentials(makeInput(),async()=>{claims++;return false;},async()=>{reads++;return 'secret';}),/NONCE_ALREADY_CLAIMED/);
  assert.equal(reads,0);
  const accepted=await claimNonceThenReadCredentials(makeInput(),async()=>{claims++;return true;},async()=>{reads++;return 'synthetic-secret';});
  assert.equal(accepted.credentials,'synthetic-secret');assert.equal(reads,1);
});

test('tampered claims, hashes, receipts, health, actor, PDF, sequence and case drift fail closed',()=>{
  const base=makeInput();
  const badClaims:Partial<EntryClaims>[]=[
    {correctorCommit:'f'.repeat(40)},{contractCommit:'c'.repeat(40)},{dumpSha256:'f'.repeat(64)},{historicalPdfSha256:'f'.repeat(64)},
    {preflightReceiptSha256:'f'.repeat(64)},{snapshotsDigestSha256:'f'.repeat(64)},{pdfAttestation:'NO' as never},
    {case:'15/24/3/12/202/193/77/220/837/20114' as never},{before:'qty2' as never},{after:'total999' as never},
    {writeSet:ALLOWED_WRITE_SET.concat('empresas').join(',') as never},{allowed_sequence_advances:'public.auditoria_id_seq=+4;public.auditoria_eventos_id_seq=+4;public.nomina_revision_operativa_id_seq=+1;public.historial_cambios_id_seq=+42;public.empresas_id_seq=+1' as never},{allowed_sequence_advances_sha256:'0'.repeat(64)},
    {audits:'auditoria=3' as never},{rollback:'setval' as never},{document:'overwrite' as never},{noRecalculation:'false' as never},
  ];
  for(const claims of badClaims){const changed={...base,claims:{...base.claims,...claims}} as GateInput;assert.throws(()=>validateActiveEntry(changed));}
  const receiptCases:Partial<SealedReceipt>[]=[
    {status:'STOPPED' as never},{synthetic:true as never},{firstConnectionId:'conn-b'},{health:{...base.receipt.health,sync:true} as never},
    {health:{...base.receipt.health,waitingLocks:1} as never},{pdf:{...base.receipt.pdf,sha256:'f'.repeat(64)}},{pdf:{...base.receipt.pdf,size:3052} as never},
    {actor:{...base.receipt.actor,active:false} as never},{exactBeforeState:false as never},{duplicateCount:1 as never},{priorRepairCount:1 as never},
    {lifecycleBlockerCount:1 as never},{laterRelatedAuditCount:1 as never},{sequences:{...base.receipt.sequences,unexpected:'1'} as never},
  ];
  for(const receipt of receiptCases){const altered={...base.receipt,...receipt};const bytes=Buffer.from(JSON.stringify(altered,null,2)+'\n');const claims={...base.claims,preflightReceiptSha256:sha(bytes)};const candidate={...base,claims,phrase:formatActivePhrase(claims),receipt:altered,receiptBytes:bytes,receiptSha256:sha(bytes)} as GateInput;assert.throws(()=>validateActiveEntry(candidate));}
  assert.throws(()=>validateActiveEntry({...base,receiptPath:base.receiptPath+'.other'}),/PATH/);
  assert.throws(()=>validateActiveEntry({...base,receiptBytes:Buffer.from(base.receiptBytes.toString().replace('BASELINE_VERIFIED','STOPPED'))}),/HASH/);
});

test('digest drift, identical DB sessions, altered PDF metadata and write-set scope are rejected',()=>{
  const base=makeInput();
  for(const receipt of [
    {...base.receipt,secondConnectionId:'conn-a'},
    {...base.receipt,firstSnapshotAt:base.receipt.secondSnapshotAt},
    {...base.receipt,digestSet:{...base.receipt.digestSet,movement_192:sha('drift')}},
    {...base.receipt,secondDigestSet:{...base.receipt.secondDigestSet,movement_192:sha('drift')}},
    {...base.receipt,pdf:{...base.receipt.pdf,etag:'different'}},
  ]){
    const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n'),claims={...base.claims,preflightReceiptSha256:sha(bytes),snapshotsDigestSha256:sha(canon(receipt.digestSet))};
    assert.throws(()=>validateActiveEntry({...base,receipt,receiptBytes:bytes,receiptSha256:sha(bytes),claims,phrase:formatActivePhrase(claims)}));
  }
});

test('exact write-set and four-sequence allowlist reject Institutions and unauthorized sequence advance',()=>{
  assertExactWriteSet(ALLOWED_WRITE_SET);
  assert.throws(()=>assertExactWriteSet([...ALLOWED_WRITE_SET,'instituciones']),/WRITE_SET/);
  const before={'public.auditoria_id_seq':'14878','public.auditoria_eventos_id_seq':'60068','public.nomina_revision_operativa_id_seq':'20113','public.historial_cambios_id_seq':'213656','public.other_id_seq':'9'};
  const committed={...before,'public.auditoria_id_seq':'14882','public.auditoria_eventos_id_seq':'60072','public.nomina_revision_operativa_id_seq':'20114','public.historial_cambios_id_seq':'213698'};
  assertAllowedSequenceDeltas(before,committed,'COMMIT');
  assertAllowedSequenceDeltas(before,before,'ALREADY_APPLIED');
  assertAllowedSequenceDeltas(before,{...before,'public.auditoria_id_seq':'14879','public.auditoria_eventos_id_seq':'60072','public.nomina_revision_operativa_id_seq':'20114','public.historial_cambios_id_seq':'213657'},'ROLLBACK');
  assert.throws(()=>assertAllowedSequenceDeltas(before,{...committed,'public.other_id_seq':'10'},'COMMIT'),/UNAUTHORIZED_SEQUENCE_ADVANCE/);
  assert.throws(()=>assertAllowedSequenceDeltas(before,{...before,'public.historial_cambios_id_seq':'213699'},'ROLLBACK'),/EXCEEDS_MAX/);
  assert.throws(()=>assertAllowedSequenceDeltas(before,{...committed,'public.historial_cambios_id_seq':'213697'},'COMMIT'),/SEQUENCE_COMMIT_DELTA_MISMATCH/);
  assert.throws(()=>assertAllowedSequenceDeltas(before,{...before,'public.historial_cambios_id_seq':'213657'},'ALREADY_APPLIED'),/IDEMPOTENCY/);
  assert.throws(()=>assertAllowedSequenceDeltas(before,{...before,'public.auditoria_id_seq':'14877'},'ROLLBACK'),/REWIND/);
  assertWriteSetForOutcome(ALLOWED_WRITE_SET,'COMMIT');assertWriteSetForOutcome([],'ROLLBACK');assertWriteSetForOutcome([],'ALREADY_APPLIED');
  assert.throws(()=>assertWriteSetForOutcome(['auditoria'],'ROLLBACK'),/PERSISTED_TABLE/);
});

test('independent snapshot helper starts two read-only transactions and rolls back even on capture failure',async()=>{
  let i=0,rollbacks=0,closes=0;
  const result=await captureIndependentReadOnlySnapshots(async()=>{const id=`db-${++i}`;return{connectionId:id,beginRepeatableReadOnly:async()=>{},verifyReadOnlyTransaction:async()=>true,captureSnapshot:async()=>({digest:sha('same')}),rollback:async()=>{rollbacks++;},close:async()=>{closes++;}};});
  assert.equal(result.first.connectionId,'db-1');assert.equal(result.second.connectionId,'db-2');assert.equal(rollbacks,2);assert.equal(closes,2);
  await assert.rejects(captureIndependentReadOnlySnapshots(async()=>{const id=`fail-${++i}`;return{connectionId:id,beginRepeatableReadOnly:async()=>{},verifyReadOnlyTransaction:async()=>true,captureSnapshot:async()=>{throw Error('injected');},rollback:async()=>{rollbacks++;},close:async()=>{closes++;}};}),/injected/);
  assert.equal(rollbacks,3);assert.equal(closes,3);
  await assert.rejects(captureIndependentReadOnlySnapshots(async()=>{const id='same';return{connectionId:id,beginRepeatableReadOnly:async()=>{},verifyReadOnlyTransaction:async()=>true,captureSnapshot:async()=>({x:1}),rollback:async()=>{},close:async()=>{}};}),/DRIFTED/);
});

test('receipt routes are separated and atomic publication never replaces an existing receipt',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'nomina202-entry-test-'));
  try{
    const run=randomUUID();
    for(const [kind,status] of [['baseline','BASELINE_VERIFIED'],['pending','PENDING_USER_CONFIRMATION'],['stopped','STOPPED'],['committed','COMMITTED'],['documentRecovery','DOCUMENT_RECOVERY']] as const){
      const receipt={status,runId:run};const written=await writeReceiptNoReplace(root,kind,run,receipt);const bytes=await readFile(written.path);
      assert.equal(sha(bytes),written.sha256);assert.equal(bytes.toString(),JSON.stringify(receipt,null,2)+'\n');
      await assert.rejects(writeReceiptNoReplace(root,kind,run,receipt));
    }
    assert.notEqual(receiptDestination(root,'pending',run),receiptDestination(root,'committed',run));
    await assert.rejects(writeReceiptNoReplace(root,'pending',run,{status:'COMMITTED',runId:run}),/KIND_STATUS/);
  }finally{
    if(path.basename(root).startsWith('nomina202-entry-test-'))await rm(root,{recursive:true,force:true});
  }
});

test('preflight receipt is read from its fixed baseline path and duplicate JSON fields fail',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'nomina202-entry-test-'));
  try{
    const input=makeInput({workspaceRoot:root});
    await writeReceiptNoReplace(root,'baseline',runId,input.receipt as unknown as Readonly<Record<string,unknown>>);
    const {receiptBytes:_bytes,receiptSha256:_sha,workspaceRoot:_root,...withoutFile}=input;
    const accepted=await readAndValidateActiveEntry(withoutFile,root);assert.equal(accepted.runId,runId);
    const duplicate=Buffer.from(input.receiptBytes.toString().replace('"status": "BASELINE_VERIFIED",','"status": "BASELINE_VERIFIED",\n  "status": "BASELINE_VERIFIED",'));
    const claims={...input.claims,preflightReceiptSha256:sha(duplicate)};
    assert.throws(()=>validateActiveEntry({...input,claims,phrase:formatActivePhrase(claims),receiptBytes:duplicate,receiptSha256:sha(duplicate)}),/CANONICAL/);
  }finally{
    if(path.basename(root).startsWith('nomina202-entry-test-'))await rm(root,{recursive:true,force:true});
  }
});
