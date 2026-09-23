import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  'src/modules/vinculaciones/vinculaciones.personal.service.ts',
  'utf8'
);

test('gestorResult usa solo parametros PostgreSQL tipados y no envia el municipio nullable sin placeholder', () => {
  const start = source.indexOf('gestorResult');
  assert.notEqual(start, -1);
  const gestorResult = source.slice(start, start + 5000);
  assert.match(gestorResult, /\$1::bigint/);
  assert.match(gestorResult, /\$2::bigint/);
  assert.match(gestorResult, /\$3::bigint/);
  assert.doesNotMatch(gestorResult, /\$4/);
  assert.match(
    gestorResult,
    /\[vinculacionId, vinculacion\.contrato_id, vinculacion\.contrato_cargo_id\]/
  );
  assert.doesNotMatch(
    gestorResult,
    /asignacionActual\?\.municipio_id \?\? null/
  );
});
