import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CORRECTOR_COMMIT, DUMP_SHA256, HISTORICAL_PDF_SHA256, SEQUENCE_MAX_ADVANCES, WRITE_SET, publishReadOnlyReceipt, runReadOnlyEntryPreflight, validateOfflinePlan, type OfflinePlan } from '../scripts/nomina-turno-202-readonly-runner';

const plan=(patch:Partial<OfflinePlan>={}):OfflinePlan=>({
  workspaceRoot:path.resolve('.'),branch:'fix/nomina-turno-202-correction-entry-gate',head:'9c2fc6a4907c9411473fc30c27c33eb35eaa5507',contractCommit:'9c2fc6a4907c9411473fc30c27c33eb35eaa5507',correctorCommit:CORRECTOR_COMMIT,
  dumpPath:'C:/local/full.dump',dumpSha256:DUMP_SHA256,historicalPdfPath:'C:/local/account.pdf',historicalPdfSha256:HISTORICAL_PDF_SHA256,
  reportPath:'C:/local/report.json',reportSha256:'a'.repeat(64),expectedReportSha256:'a'.repeat(64),caPath:'C:/local/ca.crt',caSha256:'b'.repeat(64),expectedCaSha256:'b'.repeat(64),
  host:'127.0.0.1',servername:'localhost',expectedServername:'localhost',port:61001,database:'restore',healthUrl:'http://127.0.0.1:61002/health',healthHostname:'127.0.0.1',localCertification:true,...patch,
});
const dependencies={plan:plan(),readCredentials:async()=>({user:'never-read',password:''}),readPdf:async()=>({bytes:Buffer.alloc(0),reference:'',mime:'application/pdf',etag:''}),syncConfirmation:{source:'MANUAL_CURRENT' as const,enabled:false as const,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString()}};

test('four sequence maxima are fixed and the database write-set is exactly seven tables',()=>{
  assert.deepEqual(SEQUENCE_MAX_ADVANCES,{'public.auditoria_id_seq':4,'public.auditoria_eventos_id_seq':4,'public.nomina_revision_operativa_id_seq':1,'public.historial_cambios_id_seq':42});
  assert.equal(WRITE_SET.length,7);assert.equal(new Set(WRITE_SET).size,7);
});

test('invalid offline contract is rejected before the credential callback',async()=>{
  let credentialReads=0;
  const invalid=plan({head:'x',contractCommit:'x'});
  await assert.rejects(runReadOnlyEntryPreflight(invalid,{...dependencies,plan:invalid,readCredentials:async()=>{credentialReads++;return{user:'x',password:'x'};}}),/STOPPED_CONTRACT_HEAD_MISMATCH/);
  assert.equal(credentialReads,0);
});

test('offline target, CA and evidence pins fail before filesystem access or credentials',async()=>{
  await assert.rejects(validateOfflinePlan(plan({head:'1'.repeat(40),contractCommit:'2'.repeat(40)})),/STOPPED_CONTRACT_HEAD_MISMATCH/);
  await assert.rejects(validateOfflinePlan(plan({servername:'wrong.local'})),/STOPPED_DESTINATION_REJECTED/);
  await assert.rejects(validateOfflinePlan(plan({caSha256:'c'.repeat(64)})),/STOPPED_OFFLINE_HASH_PIN_MISMATCH/);
  await assert.rejects(validateOfflinePlan(plan({reportSha256:'d'.repeat(64)})),/STOPPED_OFFLINE_HASH_PIN_MISMATCH/);
});

test('runner has no dependency path to the corrector or its mutator adapter',async()=>{
  const source=await readFile(path.resolve('src/scripts/nomina-turno-202-readonly-runner.ts'),'utf8');
  assert.doesNotMatch(source,/from ['"].*nomina-turno-202-(?:integral-local|native-local)/);
  assert.doesNotMatch(source,/nextval\s*\(|\bsetval\s*\(/i);
  assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source,/ROLLBACK/);
});

test('read-only receipts are routed separately, atomic, and cannot be replaced or misrouted',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'nomina202-readonly-receipt-'));
  try{
    const id=randomUUID();
    const pending={status:'PENDING_USER_CONFIRMATION',synthetic:true,digests:{movement_192:'a'.repeat(64)}};
    const published=await publishReadOnlyReceipt(root,'pending',id,pending);
    const bytes=await readFile(published.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),published.sha256);
    assert.equal(JSON.parse(bytes.toString()).status,'PENDING_USER_CONFIRMATION');
    await assert.rejects(publishReadOnlyReceipt(root,'pending',id,pending),/STOPPED_RECEIPT_PUBLICATION_FAILED/);
    await assert.rejects(publishReadOnlyReceipt(root,'pending',randomUUID(),{...pending,status:'COMMITTED'}),/STOPPED_RECEIPT_STATUS_ROUTE_MISMATCH/);
    const stopped=await publishReadOnlyReceipt(root,'stopped',id,{status:'STOPPED',reason:'LOCAL_TEST'});
    assert.notEqual(published.path,stopped.path);
    assert.ok(published.path.endsWith(path.join('reports','nomina-202-entry','pending',`${id}.json`)));
    assert.ok(stopped.path.endsWith(path.join('reports','nomina-202-entry','stopped',`${id}.json`)));
  }finally{
    if(path.basename(root).startsWith('nomina202-readonly-receipt-'))await rm(root,{recursive:true,force:true});
  }
});
