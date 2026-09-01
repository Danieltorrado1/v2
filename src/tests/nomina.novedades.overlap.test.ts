import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');

test('traslapes de novedades usan un validador unificado por incompatibilidad', () => {
  assert.match(service, /const findNominaNovedadOverlap = async/);
  assert.match(service, /normalizeNominaGrupoExclusividad/);
  assert.match(service, /blocksNominaNovedadOverlap/);
  assert.match(service, /NOMINA_NOVEDAD_FECHA_OCUPADA/);
  assert.doesNotMatch(service, /ensureNoOrdinaryNovedadOverlapWithCanonical/);
});

test('crear y actualizar novedades envian tipo_novedad al validador de traslape', () => {
  assert.match(service, /ensureNoBlockingCanonicalOverlap\(client, \{[\s\S]*tipo_novedad: tipoNovedad/);
});
