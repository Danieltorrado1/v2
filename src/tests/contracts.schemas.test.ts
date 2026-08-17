import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('schema documental permite enviar a revision', () => {
  const source = readFileSync(path.join(root, 'src/modules/contratos/contratos.schemas.ts'), 'utf8');
  assert.match(source, /estado: contratoDocumentoWorkflowEstadoSchema\.optional\(\)\.default\('APROBADO'\)/);
  assert.match(source, /z\.enum\(\['EN_REVISION', 'APROBADO'\]\)/);
});

test('excepcion contractual mantiene validacion de requisito o documento', () => {
  const source = readFileSync(path.join(root, 'src/modules/contratos/contratos.schemas.ts'), 'utf8');
  assert.match(source, /Se requiere requisito_id o documento_id/);
});
