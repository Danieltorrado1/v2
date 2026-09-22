import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getNominaPeriodRange, getNominaPeriodRangeForDate } from '../modules/nomina/nomina-periodos';

test('periodos mensuales usan 26 del mes anterior a 25 del mes de cierre', () => {
  assert.deepEqual(getNominaPeriodRange(2026, 9), {
    fecha_inicio: '2026-08-26', fecha_fin: '2026-09-25', nombre_periodo: 'SEPTIEMBRE 2026', mes: 9, anio: 2026,
  });
  assert.equal(getNominaPeriodRange(2026, 10).fecha_inicio, '2026-09-26');
  assert.equal(getNominaPeriodRange(2027, 1).fecha_inicio, '2026-12-26');
});

test('las fechas 25 y 26 caen en periodos de cierre distintos', () => {
  assert.equal(getNominaPeriodRangeForDate('2026-09-25').nombre_periodo, 'SEPTIEMBRE 2026');
  assert.equal(getNominaPeriodRangeForDate('2026-09-26').nombre_periodo, 'OCTUBRE 2026');
  assert.equal(getNominaPeriodRangeForDate('2026-08-31').nombre_periodo, 'SEPTIEMBRE 2026');
});

test('selector y ensure excluyen residuales y reutilizan identidad activa', () => {
  const repository = readFileSync('src/modules/nomina/infrastructure/repositories/nomina-periodo.repository.ts', 'utf8');
  const api = readFileSync('FrontendNuevo/src/services/nominaApi.ts', 'utf8');
  const canonicalizer = readFileSync('FrontendNuevo/src/pages/nomina/nominaPeriods.ts', 'utf8');
  assert.match(repository, /COALESCE\(np\.activo, TRUE\) = TRUE/);
  assert.match(api, /normalizeNominaPeriods/);
  assert.match(canonicalizer, /String\(period\.contrato_id/);
  assert.match(canonicalizer, /period\.fecha_inicio/);
  assert.match(canonicalizer, /period\.fecha_fin/);
  assert.match(canonicalizer, /period\.tipo_periodo/);
  assert.match(canonicalizer, /rawPeriod\.activo === false/);
});
