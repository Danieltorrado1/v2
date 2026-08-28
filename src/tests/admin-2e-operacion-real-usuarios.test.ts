import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const usersUi = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/UsuariosTab.tsx', 'utf8');
const vincService = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const nominaProcesos = readFileSync('src/modules/nomina/nomina.procesos.ts', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const migration = readFileSync('src/scripts/migrate-admin-2e-user-territorial-scope.ts', 'utf8');
const permissions = readFileSync('src/scripts/seed-admin-2e-operational-permissions.ts', 'utf8');

test('ADMIN-2E permite territorio para GESTOR y TALENTO_HUMANO', () => {
  assert.match(usersUi, /TALENTO_HUMANO/);
  assert.match(usersUi, /Municipios a cargo/);
  assert.match(usersUi, /getGestorMunicipios/);
  assert.match(vincService, /TALENTO_HUMANO_ROLE/);
});

test('ADMIN-2E separa municipio autorizado de personal seleccionado o dinamico', () => {
  assert.match(migration, /TODO_MUNICIPIO/);
  assert.match(migration, /PERSONAL_SELECCIONADO/);
  assert.match(vincService, /gestor_personal_asignaciones/);
  assert.match(vincService, /gestor_municipio_asignaciones/);
  assert.match(usersUi, /Personal seleccionado/);
  assert.match(usersUi, /Todo el municipio/);
  assert.match(usersUi, /saveGestorAssignments/);
});

test('ADMIN-2E usa una fuente efectiva de gestor en personal y nomina', () => {
  assert.match(vincService, /gestor_actual/);
  assert.match(vincService, /alcance_personal/);
  assert.match(nominaService, /gestor_personal_asignaciones/);
  assert.match(nominaService, /gestor_municipio_asignaciones/);
  assert.match(nominaProcesos, /NOMINA_SCOPE_FORBIDDEN/);
});

test('ADMIN-2E mantiene permisos operativos minimos e idempotentes', () => {
  assert.match(permissions, /GESTOR/);
  assert.match(permissions, /TALENTO_HUMANO/);
  assert.match(permissions, /ON CONFLICT \(rol_id, permiso_id\)/);
  assert.match(permissions, /\['nomina', 'read'/);
  assert.doesNotMatch(permissions, /administracion/);
});

test('ADMIN-2E conserva vigencias y auditoria al cambiar municipio', () => {
  assert.match(readFileSync('src/modules/vinculaciones/vinculaciones.personal.service.ts', 'utf8'), /vigencia_hasta/);
  assert.match(readFileSync('src/modules/vinculaciones/vinculaciones.personal.service.ts', 'utf8'), /gestor_personal_asignaciones/);
  assert.match(vincService, /registerAuditEntry/);
});
