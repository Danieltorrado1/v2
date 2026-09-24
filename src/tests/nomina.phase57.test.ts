import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(process.cwd());
const phase57 = readFileSync(resolve(root, 'sql/phase-57-nomina-periodizacion-controlada.sql'), 'utf8');
const reconcile = readFileSync(resolve(root, 'release/reconcile-periodos-3-4-6.sql'), 'utf8');
const runner = readFileSync(resolve(root, 'release/apply-integracion-phase56-57.ps1'), 'utf8');

test('Phase 57 modela anulacion trazable y calendario contractual sin hardcodear contrato', () => {
  assert.match(phase57, /motivo_anulacion/);
  assert.match(phase57, /periodo_canonico_id/);
  assert.match(phase57, /nomina_calendarios_contractuales/);
  assert.match(phase57, /REFERENCES public\.usuarios\(id\)/);
  assert.doesNotMatch(phase57, /REFERENCES public\.users\(id\)/);
  assert.match(phase57, /validate_nomina_periodo_anulacion/);
  assert.match(phase57, /SUPERSEDED/);
  assert.doesNotMatch(phase57, /contrato_id\s*=\s*24/);
});

test('reconciliacion protege las 47 revisiones y exige 5/5/5 impactos', () => {
  assert.match(reconcile, /revisions4 <> 47/);
  assert.match(reconcile, /impacts3 <> 5 OR impacts4 <> 5 OR impacts6 <> 5/);
  assert.match(reconcile, /RECONCILIACION_REVISIONES_MODIFICADAS/);
  assert.match(reconcile, /estado='SUPERSEDED'/);
  assert.match(reconcile, /periodo_canonico_id=CASE WHEN id=4 THEN 3 ELSE NULL END/);
  assert.match(reconcile, /Periodo 6 atraviesa dos ciclos 26-25; superseded sin canon unico/);
});

test('runner exige proyecto y confirmacion antes de Phase 56/57', () => {
  assert.match(runner, /scuvsocqibbubqnesvuf/);
  assert.match(runner, /Read-Host/);
  assert.match(runner, /ON_ERROR_STOP/);
  assert.match(runner, /PHASE_57 ALREADY_APPLIED/);
});
