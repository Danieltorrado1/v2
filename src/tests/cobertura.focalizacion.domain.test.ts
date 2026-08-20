import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.focalizacion.domain.ts'),
  'utf8',
);

test('dominio reconoce vigencia efectiva con patron dia a dia mes anio', () => {
  assert.match(source, /\(\\d\{1,2\}\)\\s\+\(\?:AL\|A\|-\)\\s\+\(\\d\{1,2\}\)\\s\+\(\[A-Z\]\+\)\\s\+\(\\d\{4\}\)/);
  assert.match(source, /fecha_inicio_vigencia/);
  assert.match(source, /fecha_fin_vigencia/);
});

test('dominio separa duplicado exacto y duplicado conflictivo dentro del archivo', () => {
  assert.match(source, /duplicateRows/);
  assert.match(source, /conflictRows/);
  assert.match(source, /signatureSet\.size > 1 \? conflictRows : duplicateRows/);
});

test('dominio aplica factor_previo para CAARES y detecta fuera de rango', () => {
  assert.match(source, /rule\.factor_previo !== null/);
  assert.match(source, /baseValues\.cupos \* rule\.factor_previo/);
  assert.match(source, /status: 'SIN_REGLA_COBERTURA'/);
});

test('dominio resuelve RI mayor a 800 sin fracciones', () => {
  assert.match(source, /range\.hasta === null \|\| cuposCalculo <= range\.hasta/);
  assert.match(source, /slice\(\)\s*\.sort\(\(left, right\) => left\.desde - right\.desde\)/);
});

test('dominio clasifica aumento, disminucion, sin cambio y nueva combinacion', () => {
  assert.match(source, /'NUEVA_COMBINACION'/);
  assert.match(source, /'AUMENTO'/);
  assert.match(source, /'DISMINUCION'/);
  assert.match(source, /'SIN_CAMBIO'/);
});
