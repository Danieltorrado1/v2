/**
 * Pure local contract for reviewing a future 202/192 productive entry.
 * Deliberately has no database, environment, filesystem, network, or mutator imports.
 * It can validate/build a pending confirmation string; it cannot activate or execute it.
 */
import { createHash } from 'node:crypto';

export const ENTRY_CASE = Object.freeze({
  empresa: 15, contrato: 24, periodo: 3, actor: 12, turno: 202, movimiento: 192,
  cuenta: 77, detalle: 220, empleado: 837, revision: 20114,
  before: Object.freeze({ cantidad: 1, tarifa: 97800, total: 97800, cuenta: 'PENDIENTE', revision: 'REVISADO/v30', afecta_seguridad_social: false }),
  after: Object.freeze({ cantidad: 2, tarifa: 97800, total: 195600, cuenta: 'PENDIENTE', revision: 'REQUIERE_REVISION/v31', referencia_anterior: 'INVALIDADA', afecta_seguridad_social: false }),
  writeSet: Object.freeze(['nomina_movimientos','cobertura_cuenta_cobro_externa_detalle','cobertura_cuentas_cobro_externas','nomina_revision_operativa','auditoria','auditoria_eventos','historial_cambios']),
  allowedSequenceAdvances: Object.freeze({ 'public.auditoria_id_seq': 4, 'public.auditoria_eventos_id_seq': 4, 'public.nomina_revision_operativa_id_seq': 1, 'public.historial_cambios_id_seq': 42 }),
});

export type ReadSnapshot = Readonly<{
  connectionId: string;
  observedAt: string;
  digestSet: Readonly<Record<string, string>>;
  values: Readonly<Record<string, unknown>>;
}>;
export type EntryEvidence = Readonly<{
  codeSha: string; evidenceSha: string; dumpSha: string; historicalPdfSha: string;
  runId: string; nonce: string; expiresAt: string;
  first: ReadSnapshot; second: ReadSnapshot;
  runIdUnique: true; nonceUnused: true;
  health: Readonly<{ http: 200; database: 'ok'; outbox: false; sync: false; recalc: false; worker: false; waitingLocks: 0; activeDdl: 0 }>;
  pdfAttestation: 'NOT_SENT_OR_DELIVERED_NOT_APPROVED_OR_SIGNED_NOT_PAID_OR_POSTED_NOT_USED_OFFICIALLY';
  historyHasNoLaterRelatedAudit: true;
  duplicateCount: 0;
  priorRepairCount: 0;
  lifecycleBlockerCount: 0;
  pdf: Readonly<{ sha256: string; referenceSha256: string; size: number; mime: 'application/pdf'; etag: string }>;
  exactBeforeState: true;
  sequenceBaseline: Readonly<Record<string, string>>;
}>;

const fail = (code: string): never => { throw new Error(code); };
const sha = (s: string) => /^[a-f0-9]{64}$/.test(s);
const noncePattern = /^[a-f0-9]{48}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_DIGESTS = ['critical_schema','sources','movement_192','detail_220','account_77','revision_20114','related_audits','related_history','pdf_metadata','protected_tables','write_set_before','sequence_baseline'] as const;
const SEQUENCE_ADVANCES_CANONICAL = 'public.auditoria_id_seq=+4;public.auditoria_eventos_id_seq=+4;public.nomina_revision_operativa_id_seq=+1;public.historial_cambios_id_seq=+42';
const sorted = (o: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))));
const digest = (o: Record<string, unknown>) => createHash('sha256').update(sorted(o)).digest('hex');
const sequenceAdvancesSha = createHash('sha256').update(sorted(ENTRY_CASE.allowedSequenceAdvances)).digest('hex');

function validate(e: EntryEvidence, now: number) {
  for (const [name, value] of Object.entries({code:e.codeSha,evidence:e.evidenceSha,dump:e.dumpSha,pdf:e.historicalPdfSha})) if (!sha(value)) fail(`INVALID_${name.toUpperCase()}_SHA`);
  if (!uuidPattern.test(e.runId) || !noncePattern.test(e.nonce)) fail('INVALID_RUN_OR_NONCE');
  if (e.runIdUnique !== true || e.nonceUnused !== true) fail('RUN_OR_NONCE_REUSED');
  const expiry = Date.parse(e.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 15 * 60_000) fail('EXPIRY_OUTSIDE_15_MINUTES');
  if (!e.first.connectionId || !e.second.connectionId || e.first.connectionId === e.second.connectionId || e.first.observedAt === e.second.observedAt || sorted(e.first.digestSet) !== sorted(e.second.digestSet)) fail('READS_DIFFER_OR_NOT_INDEPENDENT');
  if (REQUIRED_DIGESTS.some(k => !sha(e.first.digestSet[k] ?? '')) || Object.keys(e.first.digestSet).length !== REQUIRED_DIGESTS.length) fail('REQUIRED_DIGEST_SET_INCOMPLETE');
  if (e.first.values.beforeStateSha !== digest(ENTRY_CASE.before) || e.second.values.beforeStateSha !== digest(ENTRY_CASE.before)) fail('BEFORE_STATE_MISMATCH');
  if (e.health.http !== 200 || e.health.database !== 'ok' || e.health.outbox || e.health.sync || e.health.recalc || e.health.worker || e.health.waitingLocks !== 0 || e.health.activeDdl !== 0) fail('HEALTH_OR_QUIESCENCE_GATE_FAILED');
  if (e.pdfAttestation !== 'NOT_SENT_OR_DELIVERED_NOT_APPROVED_OR_SIGNED_NOT_PAID_OR_POSTED_NOT_USED_OFFICIALLY') fail('DOCUMENT_ATTESTATION_MISSING');
  if (!e.exactBeforeState || e.historyHasNoLaterRelatedAudit !== true || e.duplicateCount !== 0 || e.priorRepairCount !== 0 || e.lifecycleBlockerCount !== 0) fail('CASE_GATES_FAILED');
  if (e.pdf.sha256 !== e.historicalPdfSha || !sha(e.pdf.referenceSha256) || e.pdf.size <= 0 || !e.pdf.etag) fail('HISTORICAL_DOCUMENT_MISMATCH');
  const pdfMetadata = digest({ sha256:e.pdf.sha256, referenceSha256:e.pdf.referenceSha256, size:e.pdf.size, mime:e.pdf.mime, etag:e.pdf.etag });
  if (e.first.values.pdfMetadataSha !== pdfMetadata || e.second.values.pdfMetadataSha !== pdfMetadata) fail('PDF_METADATA_READS_MISMATCH');
  if (sorted(e.sequenceBaseline) !== sorted({ auditoria_eventos: e.sequenceBaseline.auditoria_eventos, auditoria: e.sequenceBaseline.auditoria, nomina_revision_operativa: e.sequenceBaseline.nomina_revision_operativa, historial_cambios: e.sequenceBaseline.historial_cambios })) fail('SEQUENCE_SCOPE_INVALID');
  if (Object.keys(e.sequenceBaseline).length !== 4 || Object.values(e.sequenceBaseline).some(v => !/^\d+$/.test(v))) fail('SEQUENCE_BASELINE_INVALID');
}

/** Returns a review phrase only. There is intentionally no activation or execute API. */
export function buildPendingEntryPhrase(e: EntryEvidence, now = Date.now()): string {
  validate(e, now);
  const digestSet = digest(e.first.digestSet);
  return [
    'PENDING_USER_CONFIRMATION NOMINA_202_192',
    `code_sha=${e.codeSha} evidence_sha=${e.evidenceSha} dump_sha=${e.dumpSha} historical_pdf_sha=${e.historicalPdfSha}`,
    `empresa=15 contrato=24 periodo=3 actor=12 turno=202 movimiento=192 cuenta=77 detalle=220 empleado=837 revision=20114`,
    'before=cantidad:1,tarifa:97800,total:97800,cuenta:PENDIENTE,revision:REVISADO/v30,afecta_seguridad_social:false',
    'after=cantidad:2,tarifa:97800,total:195600,cuenta:PENDIENTE,revision:REQUIERE_REVISION/v31,referencia_anterior:INVALIDADA,afecta_seguridad_social:false',
    `digest_set=${digestSet} write_set=${ENTRY_CASE.writeSet.join(',')} allowed_sequence_advances=${SEQUENCE_ADVANCES_CANONICAL} allowed_sequence_advances_sha256=${sequenceAdvancesSha}`,
    `run_id=${e.runId} nonce=${e.nonce} expires_at=${new Date(Date.parse(e.expiresAt)).toISOString()}`,
    'AUDITORIAS_ESTRICTAS=4+4 HISTORIAL_CANONICO=42 IDEMPOTENCIA=ALREADY_APPLIED ROLLBACK=DATOS_SIN_FILAS_PERSISTIDAS_SECUENCIAS_SOLO_MONOTONICAS_SIN_SETVAL_RESTART_NI_REUTILIZACION',
    'PDF_HISTORICO=PRESERVADO DOCUMENTO_NUEVO=VERSIONADO_POST_COMMIT RECUPERACION_DOCUMENTAL=SIN_REPETIR_CORRECCION_ECONOMICA',
    'SIN_RECALCULO_NOMINA SIN_SINCRONIZACION_EXTERNA SIN_CAMBIOS_INSTITUCIONES',
    'CONFIRMAR_LITERAL_PARA_SOLICITAR_AUTORIZACION_SEPARADA',
  ].join(' ');
}

/** A parser for local review fixtures; it never grants authorization or consumes the nonce. */
export function verifyPendingEntryPhrase(phrase: string, e: EntryEvidence, now = Date.now()): boolean {
  return phrase === buildPendingEntryPhrase(e, now);
}

