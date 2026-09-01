import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');

test('traslapes de novedades usan un validador unificado por incompatibilidad', () => {
  assert.ok(service.includes('const findNominaNovedadOverlap = async'));
  assert.ok(service.includes('normalizeNominaGrupoExclusividad'));
  assert.ok(service.includes('blocksNominaNovedadOverlap'));
  assert.ok(service.includes('NOMINA_NOVEDAD_FECHA_OCUPADA'));
  assert.equal(service.includes('ensureNoOrdinaryNovedadOverlapWithCanonical'), false);
});

test('crear y actualizar novedades envian tipo_novedad al validador de traslape', () => {
  assert.ok(service.includes('tipo_novedad: tipoNovedad'));
  assert.ok(service.includes('excludeCanonicalId'));
  assert.ok(service.includes('excludeNovedadId'));
});

test('mutaciones de novedades usan lock transaccional por vinculacion para evitar doble submit concurrente', () => {
  assert.ok(service.includes('const lockNominaNovedadMutation = async'));
  assert.ok(service.includes('pg_advisory_xact_lock'));
  assert.ok(service.includes('await lockNominaNovedadMutation(client, input.vinculacion_id)'));
  assert.ok(service.includes('await lockNominaNovedadMutation(client, current.vinculacion_id)'));
});
