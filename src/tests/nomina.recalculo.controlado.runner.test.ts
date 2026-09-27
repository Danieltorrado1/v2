import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const service = readFileSync(join(process.cwd(), 'src/modules/nomina/nomina.service.ts'), 'utf8');
const runner = readFileSync(join(process.cwd(), 'src/scripts/recalculate-nomina-controlado.ts'), 'utf8');
const releaseRunner = readFileSync(join(process.cwd(), 'release/recalculate-nomina-controlado.ps1'), 'utf8');

test('controlled recalc skips operational snapshot repair and external account sync', () => {
  assert.match(service, /if \(!options\?\.controlledScope\?\.preserveOperationalSources\)/);
  assert.match(service, /if \(!options\?\.nomina_empleado_id && !options\?\.controlledScope\?\.suppressExternalSync\)/);
  assert.match(runner, /preserveOperationalSources: true/);
  assert.match(runner, /suppressExternalSync: true/);
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
  assert.match(releaseRunner, /if \(-not \$PreflightOnly -and -not \$Mutate\) \{ \$PreflightOnly = \$true \}/);
  assert.match(releaseRunner, /if \(\$Mutate -and \[string\]::IsNullOrWhiteSpace\(\$Confirmation\)\)/);
  assert.match(runner, /assertExactConfirmation\(preflight\.candidateEmployeeIds\.length, confirmation\)/);
  assert.match(runner, /status: 'FAILED'/);
  assert.match(runner, /completed/);
});
