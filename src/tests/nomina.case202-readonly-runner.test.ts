import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CERTIFIED_REPORT_SHA256, CORRECTOR_COMMIT, DUMP_SHA256, ENTRY_READONLY_REPORT_SHA256, HISTORICAL_PDF_SHA256, SEQUENCE_MAX_ADVANCES, WRITE_SET, assertCertificationReports, assertPostgres17ToolVersions, publishReadOnlyReceipt, runReadOnlyEntryPreflight, validateOfflinePlan, validateUntrackedArtifactInventory, verifyProductionTargetPinEvidence, type OfflinePlan } from '../scripts/nomina-turno-202-readonly-runner';

const plan=(patch:Partial<OfflinePlan>={}):OfflinePlan=>({
  workspaceRoot:path.resolve('.'),branch:'fix/nomina-turno-202-correction-entry-gate',head:'9c2fc6a4907c9411473fc30c27c33eb35eaa5507',contractCommit:'9c2fc6a4907c9411473fc30c27c33eb35eaa5507',correctorCommit:CORRECTOR_COMMIT,
  dumpPath:'C:/local/full.dump',dumpSha256:DUMP_SHA256,historicalPdfPath:'C:/local/account.pdf',historicalPdfSha256:HISTORICAL_PDF_SHA256,
  reportPath:'C:/local/report.json',reportSha256:CERTIFIED_REPORT_SHA256,expectedReportSha256:CERTIFIED_REPORT_SHA256,
  entryReportPath:'C:/local/entry-report.json',entryReportSha256:ENTRY_READONLY_REPORT_SHA256,expectedEntryReportSha256:ENTRY_READONLY_REPORT_SHA256,
  caPath:'C:/local/ca.crt',caSha256:'b'.repeat(64),expectedCaSha256:'b'.repeat(64),projectRefSha256:'0'.repeat(64),
  host:'127.0.0.1',servername:'localhost',expectedServername:'localhost',port:61001,database:'restore',healthUrl:'http://127.0.0.1:61002/health',healthHostname:'127.0.0.1',localCertification:true,...patch,
});
const dependencies={plan:plan(),readCredentials:async()=>({user:'never-read',password:''}),readPdf:async()=>({bytes:Buffer.alloc(0),reference:'',mime:'application/pdf',etag:''}),syncConfirmation:{source:'MANUAL_CURRENT' as const,enabled:false as const,observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString()}};

test('independent target pins reconcile to the versioned sanitized source reports',async()=>{
  const evidence=await verifyProductionTargetPinEvidence(path.resolve('.'));
  assert.equal(evidence.sources,3);
  assert.match(evidence.projectRefSha256,/^[a-f0-9]{64}$/);
});

test('four sequence maxima are fixed and the database write-set is exactly seven tables',()=>{
  assert.deepEqual(SEQUENCE_MAX_ADVANCES,{'public.auditoria_id_seq':4,'public.auditoria_eventos_id_seq':4,'public.nomina_revision_operativa_id_seq':1,'public.historial_cambios_id_seq':42});
  assert.equal(WRITE_SET.length,7);assert.equal(new Set(WRITE_SET).size,7);
});

test('PostgreSQL 17 toolchain accepts 17.11 and rejects a 16.x fallback',()=>{
  assert.doesNotThrow(()=>assertPostgres17ToolVersions({psql:'psql (PostgreSQL) 17.11',pg_dump:'pg_dump (PostgreSQL) 17.11',pg_restore:'pg_restore (PostgreSQL) 17.11'}));
  assert.throws(()=>assertPostgres17ToolVersions({psql:'psql (PostgreSQL) 16.13',pg_dump:'pg_dump (PostgreSQL) 17.11',pg_restore:'pg_restore (PostgreSQL) 17.11'}),/STOPPED_POSTGRES17_TOOL_REQUIRED_PSQL/);
});

test('corrector and READ ONLY evidence reports have separate fixed pins',()=>{
  assert.equal(CERTIFIED_REPORT_SHA256,'4d9456973bc1433b5c6175d347497d603999fb1ed35995e7e2493415cda3da41');
  assert.equal(ENTRY_READONLY_REPORT_SHA256,'1e2d8cfed0889bd238383054296870c1226be0f5fc89793d652755c584cabca8');
  assert.notEqual(CERTIFIED_REPORT_SHA256,ENTRY_READONLY_REPORT_SHA256);
});

test('both pinned reports match their own purpose and certified source commits',async()=>{
  const root=path.resolve('.');
  const native=await readFile(path.join(root,'reports/nomina-202-performance-20261015T150430Z/report.json'));
  const entry=await readFile(path.join(root,'reports/nomina-202-performance-20261015T155014Z/report.json'));
  assert.deepEqual(assertCertificationReports(native,entry,root),{
    correctorReportSha256:CERTIFIED_REPORT_SHA256,entryReadonlyReportSha256:ENTRY_READONLY_REPORT_SHA256,
    correctorCommit:'95fc6bb6879409d37a088e451fb64f2edafacb5f',nativeReportCodeCommit:'9c2fc6a4907c9411473fc30c27c33eb35eaa5507',entryCodeCommit:'62e8c52f6a3ac4e3a7e495931beb0e535f299e03',sharedSourceCount:5,sourceHashCount:18,reportOnlyHarnessPinCount:1,
  });
  assert.throws(()=>assertCertificationReports(native,Buffer.from('altered'),root),/STOPPED_CERTIFICATION_REPORT_HASH_MISMATCH/);
});

test('untracked offline evidence is allowed only when all 384 paths and hashes match the sealed manifest',async()=>{
  const inventory=await validateUntrackedArtifactInventory(path.resolve('.'));
  assert.deepEqual(inventory,{count:384,aggregateSha256:'9c77ae07a8f4478b6e3a9d92d72f5074816a2888c2a98ef807c2ec19354f11c7'});
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
