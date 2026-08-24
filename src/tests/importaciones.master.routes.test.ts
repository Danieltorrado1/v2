import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'src/modules/importaciones/importaciones.routes.ts'),
  'utf8'
);
const controllerSource = readFileSync(
  path.join(process.cwd(), 'src/modules/importaciones/importaciones.master.controller.ts'),
  'utf8'
);

test('rutas maestras exigen preparar y aplicar en backend', () => {
  assert.match(source, /\/maestro\/analizar/);
  assert.match(source, /requirePermissions\('importaciones\.preparar'\)/);
  assert.match(source, /\/maestro\/lotes\/:id\/validar/);
  assert.match(source, /\/maestro\/lotes\/:id\/aplicar/);
  assert.match(source, /requirePermissions\('importaciones\.aplicar'\)/);
  assert.match(source, /\/maestro\/sst\/preparacion\/resumen/);
  assert.match(source, /\/maestro\/sst\/revision-casos/);
  assert.match(source, /\/maestro\/sst\/pendientes/);
  assert.match(source, /\/maestro\/sst\/apply-plan/);
  assert.match(source, /sst\.revision\.resolver/);
  assert.match(source, /\/informacion-bancaria\/template/);
  assert.match(source, /\/datos-personales\/template/);
  assert.match(source, /\/caracterizacion-sst\/template/);
  assert.match(controllerSource, /sst\.perfil\.importar/);
  assert.match(controllerSource, /sst\.perfil\.aplicar/);
});
