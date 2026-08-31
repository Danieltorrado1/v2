import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const routes = readFileSync('src/modules/empresa-configuracion/empresa-configuracion.routes.ts', 'utf8');
const seed = readFileSync('src/scripts/seed-nomina-admin-config-permissions.ts', 'utf8');

test('payroll parameters separa lectura de gestión', () => {
  assert.match(
    routes,
    /router\.get\(\s*'\/:empresaId\/payroll-parameters',\s*requirePermissions\('nomina\.economico\.read'\)/
  );
  assert.match(
    routes,
    /router\.post\(\s*'\/:empresaId\/payroll-parameters',\s*requirePermissions\('nomina\.parametros\.manage'\)/
  );
});

test('salary categories exigen gestión específica para escritura', () => {
  assert.match(
    routes,
    /router\.get\(\s*'\/:empresaId\/salary-categories',\s*requirePermissions\('nomina\.economico\.read'\)/
  );
  assert.match(
    routes,
    /router\.post\(\s*'\/:empresaId\/salary-categories',\s*requirePermissions\('nomina\.categorias\.manage'\)/
  );
  assert.match(
    routes,
    /router\.patch\(\s*'\/:empresaId\/salary-categories\/:categoryId',\s*requirePermissions\('nomina\.categorias\.manage'\)/
  );
});

test('seed mínimo solo fortalece ADMINISTRADOR', () => {
  assert.match(seed, /const ROLE_NAME = 'ADMINISTRADOR'/);
  assert.match(seed, /nomina\.economico', 'read'/);
  assert.match(seed, /nomina\.parametros', 'manage'/);
  assert.match(seed, /nomina\.categorias', 'manage'/);
  assert.doesNotMatch(seed, /TALENTO_HUMANO/);
});
