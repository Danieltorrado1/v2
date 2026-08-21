import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceSource = readFileSync(
  path.resolve(process.cwd(), 'src/modules/cobertura/cobertura.focalizacion.service.ts'),
  'utf8',
);

test('prioriza el municipio explicito del XLSX antes del codigo embebido en el consecutivo', () => {
  const byNameIndex = serviceSource.indexOf('const byName = municipios.filter');
  const byCodeIndex = serviceSource.indexOf('const byCode = municipios.filter');
  const byEmbeddedCodeIndex = serviceSource.indexOf('const byEmbeddedCode = municipios.filter');

  assert.notEqual(byNameIndex, -1);
  assert.notEqual(byCodeIndex, -1);
  assert.notEqual(byEmbeddedCodeIndex, -1);
  assert.ok(byNameIndex < byCodeIndex);
  assert.ok(byCodeIndex < byEmbeddedCodeIndex);
});

test('conserva el consecutivo embebido como fallback cuando no resuelve ni por nombre ni por codigo explicito', () => {
  assert.match(serviceSource, /if \(byEmbeddedCode\.length === 1 && byEmbeddedCode\[0\]\) \{\s*return toNumber\(byEmbeddedCode\[0\]\.id\);/s);
});
