import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ENTRY_CASE, buildPendingEntryPhrase, verifyPendingEntryPhrase, type EntryEvidence } from '../scripts/nomina-turno-202-entry-contract';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const baseline = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(ENTRY_CASE.before).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
const now = Date.parse('2026-10-15T14:00:00.000Z');
function evidence(): EntryEvidence {
  const pdf = {sha256:sha('historical pdf'),referenceSha256:sha('reference'),size:3051,mime:'application/pdf' as const,etag:'"sealed"'};
  const sequenceBaseline={auditoria_eventos:'60068',auditoria:'14878',nomina_revision_operativa:'20113',historial_cambios:'213656'};
  const digestSet = Object.fromEntries(['critical_schema','sources','movement_192','detail_220','account_77','revision_20114','related_audits','related_history','protected_tables','write_set_before'].map(k=>[k,sha(k)]));
  const pdfMetadataSha = sha(JSON.stringify({etag:pdf.etag,mime:pdf.mime,referenceSha256:pdf.referenceSha256,sha256:pdf.sha256,size:pdf.size}));
  digestSet.pdf_metadata=pdfMetadataSha;digestSet.sequence_baseline=sha(JSON.stringify(Object.fromEntries(Object.entries(sequenceBaseline).sort(([a],[b])=>a.localeCompare(b)))));
  const first = { connectionId:'synthetic-connection-a', observedAt:'2026-10-15T13:58:00.000Z', digestSet, values:{beforeStateSha:baseline,pdfMetadataSha} };
  const second = { connectionId:'synthetic-connection-b', observedAt:'2026-10-15T13:59:00.000Z', digestSet:{...first.digestSet}, values:{beforeStateSha:baseline,pdfMetadataSha} };
  return {
    codeSha:sha('code'), evidenceSha:sha('evidence'), dumpSha:sha('dump'), historicalPdfSha:sha('historical pdf'),
    runId:'c00dbeef-1111-4111-8111-123456789abc', nonce:'a'.repeat(48), expiresAt:'2026-10-15T14:14:00.000Z', first, second, runIdUnique:true, nonceUnused:true,
    healthFinal:{httpStatus:200,databaseStatus:'ok',outbox:false,sync:false,recalcRequested:false,recalcActive:false,workerStopped:true},
    executionTimeline:{read1_rollback_completed_at:'2026-10-15T13:59:00.000Z',read1_closed_at:'2026-10-15T13:59:01.000Z',read2_rollback_completed_at:'2026-10-15T13:59:02.000Z',read2_closed_at:'2026-10-15T13:59:03.000Z',final_health_completed_at:'2026-10-15T13:59:04.000Z'},
    health:{http:200,database:'ok',outbox:false,sync:false,recalc:false,worker:false,waitingLocks:0,activeDdl:0},
    pdfAttestation:'NOT_SENT_OR_DELIVERED_NOT_APPROVED_OR_SIGNED_NOT_PAID_OR_POSTED_NOT_USED_OFFICIALLY',
    historyHasNoLaterRelatedAudit:true,duplicateCount:0,priorRepairCount:0,lifecycleBlockerCount:0,
    pdf, exactBeforeState:true,
    sequenceBaseline,
  };
}

test('pending phrase binds all evidence and remains an inert review string',()=>{
  const e=evidence(), phrase=buildPendingEntryPhrase(e,now);
  assert.equal(verifyPendingEntryPhrase(phrase,e,now),true);
  assert.match(phrase,/PENDING_USER_CONFIRMATION/);
  assert.match(phrase,/write_set=nomina_movimientos,cobertura_cuenta_cobro_externa_detalle,cobertura_cuentas_cobro_externas,nomina_revision_operativa,auditoria,auditoria_eventos,historial_cambios/);
  assert.match(phrase,/allowed_sequence_advances=public\.auditoria_id_seq=\+4;public\.auditoria_eventos_id_seq=\+4;public\.nomina_revision_operativa_id_seq=\+1;public\.historial_cambios_id_seq=\+42/);
  assert.match(phrase,/SIN_RECALCULO_NOMINA SIN_SINCRONIZACION_EXTERNA/);
  assert.doesNotMatch(phrase,/ACTIVE|APPLY|EXECUTE/);
  assert.equal(verifyPendingEntryPhrase(phrase+' ',e,now),false);
});

test('entry fails closed on read drift, unresolved health and an expired or overlong window',()=>{
  const e=evidence();
  assert.throws(()=>buildPendingEntryPhrase({...e,second:{...e.second,digestSet:{...e.second.digestSet,schema:sha('drift')}}},now),/READS_DIFFER/);
  assert.throws(()=>buildPendingEntryPhrase({...e,health:{...e.health,sync:true} as unknown as EntryEvidence['health']},now),/HEALTH_OR_QUIESCENCE/);
  assert.throws(()=>buildPendingEntryPhrase({...e,expiresAt:'2026-10-15T14:15:01.000Z'},now),/EXPIRY/);
  assert.throws(()=>buildPendingEntryPhrase({...e,expiresAt:'2026-10-15T13:59:59.000Z'},now),/EXPIRY/);
});

test('entry rejects the historically revoked nonce and missing or reordered publication timestamps',()=>{
  const e=evidence();
  const revoked='43ab161c1c007f373a531352f063ad0a243cbfc7d5b5fd6a';
  assert.throws(()=>buildPendingEntryPhrase({...e,nonce:revoked},now),/NONCE_REVOKED_NO_UTILIZABLE/);
  assert.throws(()=>buildPendingEntryPhrase({...e,executionTimeline:{...e.executionTimeline,read2_closed_at:''}},now),/EXECUTION_TIMELINE_INVALID/);
  assert.throws(()=>buildPendingEntryPhrase({...e,executionTimeline:{...e.executionTimeline,final_health_completed_at:'2026-10-15T13:59:02.000Z'}},now),/EXECUTION_TIMELINE_INVALID/);
  assert.throws(()=>buildPendingEntryPhrase({...e,runIdUnique:false as unknown as true},now),/RUN_OR_NONCE_REUSED/);
  assert.throws(()=>buildPendingEntryPhrase({...e,nonceUnused:false as unknown as true},now),/RUN_OR_NONCE_REUSED/);
});

test('entry binds the current-use PDF attestation and exact before state',()=>{
  const e=evidence();
  assert.throws(()=>buildPendingEntryPhrase({...e,pdfAttestation:'UNCONFIRMED' as never},now),/DOCUMENT_ATTESTATION/);
  assert.throws(()=>buildPendingEntryPhrase({...e,pdf:{...e.pdf,sha256:sha('different')}},now),/HISTORICAL_DOCUMENT/);
  assert.throws(()=>buildPendingEntryPhrase({...e,exactBeforeState:false as unknown as true},now),/CASE_GATES/);
});
