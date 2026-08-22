import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const modulePromise = import('../modules/cobertura/' + 'cobertura.temporal.ts');

const serviceSource = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.service.ts'),
  'utf8',
);
const schemaSource = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.schemas.ts'),
  'utf8',
);

test('fecha_fin inclusiva cuenta 2026-08-01 y 2026-08-02 pero no 2026-08-03', async () => {
  const { isCoberturaAssignmentActiveOnDate } = await modulePromise;
  const base = {
    assignmentStartDate: '2026-08-01',
    assignmentEndDate: '2026-08-02',
    vinculacionStartDate: '2026-08-01',
    vinculacionEndDate: null,
  };

  assert.equal(isCoberturaAssignmentActiveOnDate({ ...base, queryDate: '2026-08-01' }), true);
  assert.equal(isCoberturaAssignmentActiveOnDate({ ...base, queryDate: '2026-08-02' }), true);
  assert.equal(isCoberturaAssignmentActiveOnDate({ ...base, queryDate: '2026-08-03' }), false);
});

test('consulta fecha usa la fecha explicita o cae al fallback', async () => {
  const { resolveCoberturaFechaConsulta } = await modulePromise;
  assert.equal(resolveCoberturaFechaConsulta('2026-08-05', '2026-08-22'), '2026-08-05');
  assert.equal(resolveCoberturaFechaConsulta(undefined, '2026-08-22'), '2026-08-22');
});

test('resumen de cobertura filtra asignaciones y vinculaciones por fecha de consulta', () => {
  assert.match(serviceSource, /ca\.fecha_inicio <= \$\{datePlaceholder\}::date/);
  assert.match(serviceSource, /\(ca\.fecha_fin IS NULL OR ca\.fecha_fin >= \$\{datePlaceholder\}::date\)/);
  assert.match(serviceSource, /v\.fecha_inicio <= \$\{datePlaceholder\}::date/);
  assert.match(serviceSource, /\(v\.fecha_fin IS NULL OR v\.fecha_fin >= \$\{datePlaceholder\}::date\)/);
  assert.match(serviceSource, /fecha_consulta/);
  assert.match(schemaSource, /fecha:\s*nullableDateSchema\.optional\(\)/);
});
