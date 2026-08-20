import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/modules/importaciones/importaciones.service.ts'), 'utf8');

test('importaciones.service usa persona_identificaciones vigentes para matching', () => {
  assert.match(source, /FROM persona_identificaciones pi/);
  assert.match(source, /pi\.es_vigente = TRUE/);
});

test('importaciones.service mantiene confirmacion idempotente por lote y lock de fila', () => {
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /if \(lote\.estado === 'CONFIRMADO'\)/);
});

test('importaciones.service reutiliza createPersona y createVinculacion existentes', () => {
  assert.match(source, /createPersona\(/);
  assert.match(source, /createVinculacion\(/);
});
