import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildRecoverySnapshot, validateRecoverySnapshot } from '../modules/nomina/nomina.resume.snapshot.js';

const service = readFileSync(join(process.cwd(), 'src/modules/nomina/nomina.service.ts'), 'utf8');
const auditService = readFileSync(join(process.cwd(), 'src/modules/nomina/application/nomina-audit.service.ts'), 'utf8');
const auditHelper = readFileSync(join(process.cwd(), 'src/modules/auditoria/auditoria.helper.ts'), 'utf8');
const runner = readFileSync(join(process.cwd(), 'src/scripts/recalculate-nomina-controlado.ts'), 'utf8');
const releaseRunner = readFileSync(join(process.cwd(), 'release/recalculate-nomina-controlado.ps1'), 'utf8');
const backupRunner = readFileSync(join(process.cwd(), 'release/backup-nomina-controlado.ps1'), 'utf8');

test('controlled recalc skips operational snapshot repair and external account sync', () => {
  assert.match(service, /if \(!options\?\.controlledScope\?\.preserveOperationalSources\)/);
  assert.match(service, /if \(!options\?\.previewOnly && !options\?\.nomina_empleado_id && !options\?\.controlledScope\?\.suppressExternalSync\)/);
  assert.match(runner, /preserveOperationalSources: true/);
  assert.match(runner, /suppressExternalSync: true/);
  assert.match(service, /previewOnly \? 'BEGIN READ ONLY' : 'BEGIN'/);
  assert.match(service, /if \(options\?\.previewOnly\) previewResults\.push/);
  assert.match(service, /if \(!options\?\.previewOnly\)/);
  assert.match(runner, /mode === 'preview'/);
  assert.match(runner, /preview-ids/);
  assert.match(runner, /mode === 'resume'/);
  assert.match(runner, /CONTROLLED_RECOVERY_VALIDATED_IDS/);
  assert.match(runner, /NOMINA_RECALCULO_CONTROLADO_RECUPERADO/);
  assert.match(runner, /backup_manifest/);
  assert.match(releaseRunner, /\[switch\]\$Resume/);
  assert.match(releaseRunner, /RecoverySnapshot/);
  assert.match(releaseRunner, /RecoveryOriginalManifest/);
  assert.match(backupRunner, /--format=custom/);
  assert.doesNotMatch(backupRunner, /--dbname/);
});

test('controlled runner is scoped, protected and sanitizes its output', () => {
  assert.match(runner, /CONTROLLED_RECALC_SCOPE/);
  assert.match(runner, /periodo_id=\$1::bigint/);
  assert.match(runner, /c\.id=\$2::bigint AND c\.empresa_id=\$3::bigint/);
  assert.match(runner, /periodRows\.some\(\(row\) => \(row\.id === '4' \|\| row\.id === '6'\)/);
  assert.match(runner, /protectedLiquidations/);
  assert.match(runner, /movementDigest/);
  assert.doesNotMatch(runner, /primer_nombre|numero_documento|correo/);
});

test('default release mode is preflight and mutation requires exact confirmation', () => {
  assert.match(releaseRunner, /if \(-not \$PreflightOnly -and -not \$PreviewOnly -and -not \$Resume -and -not \$ResumeDryRun -and -not \$Mutate\) \{ \$PreflightOnly = \$true \}/);
  assert.match(releaseRunner, /if \(\(\$Mutate -or \$Resume -or \$ResumeDryRun\) -and \[string\]::IsNullOrWhiteSpace\(\$Confirmation\)\)/);
  assert.match(runner, /assertExactConfirmation\(preflight\.candidateEmployeeIds\.length, confirmation\)/);
  assert.match(runner, /status: 'FAILED'/);
  assert.match(runner, /completed/);
  assert.match(releaseRunner, /ActorUserId/);
  assert.match(releaseRunner, /ActorUserId -le 0/);
  assert.match(runner, /actor-user-id/);
  assert.match(runner, /usuario_roles/);
  assert.match(auditService, /strict: true/);
  assert.match(auditHelper, /if \(input\.strict\) throw error/);
  assert.match(service, /set_config\('app\.current_user_id'/);
  assert.match(releaseRunner, /\[switch\]\$ResumeDryRun/);
  assert.match(runner, /mode === 'resume-dry-run'/);
});

const snapshotRows = (ids: string[], detail: Record<string, unknown> = { source: 'test' }) => ids.map((empleado_id) => ({
  empleado_id, dias_pagados: 30, horas_trabajadas: 240, devengado_basico: 100, devengado_transporte: 10,
  devengado_otros: 0, salud: 4, pension: 4, total_adiciones: 110, total_deducciones: 8, neto_pagar: 102,
  detalle_calculo: detail
}));

test('resume snapshot has one strict shared schema and rejects incompatible shapes', () => {
  const ids = ['1020', '1021', '1022', '1023', '1097', '1098', '1099', '1101', '1102', '1104', '1105', '1106', '1107', '1108', '1109'];
  const manifest = 'manifest.json';
  const snapshot = buildRecoverySnapshot(snapshotRows(ids), snapshotRows(ids, { source: 'after' }), manifest);
  assert.equal(validateRecoverySnapshot(snapshot, manifest).length, 15);
  const legacy = snapshot.map((row) => { const copy = structuredClone(row) as Record<string, unknown>; delete copy.empleado_id; copy.id = row.empleado_id; return copy; });
  assert.throws(() => validateRecoverySnapshot(legacy, manifest), /empleado_id|desconocido/);
  assert.throws(() => buildRecoverySnapshot(snapshotRows(ids).map(({ empleado_id, ...row }) => ({ ...row, id: empleado_id })), snapshotRows(ids), manifest), /empleado_id/);
  assert.throws(() => validateRecoverySnapshot(snapshot.map((row, index) => index === 1 ? { ...row, empleado_id: '1020' } : row), manifest), /duplicados/);
  assert.throws(() => validateRecoverySnapshot(snapshot.map((row) => ({ ...row, unexpected: true })), manifest), /desconocido/);
  assert.throws(() => validateRecoverySnapshot(snapshot.map((row) => ({ ...row, empresa_id: '99' })), manifest), /Alcance/);
});
