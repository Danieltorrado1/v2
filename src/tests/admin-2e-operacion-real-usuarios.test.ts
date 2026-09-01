import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const usersUi = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/UsuariosTab.tsx', 'utf8');
const vincService = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const nominaProcesos = readFileSync('src/modules/nomina/nomina.procesos.ts', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const migration = readFileSync('src/scripts/migrate-admin-2e-user-territorial-scope.ts', 'utf8');
const permissions = readFileSync('src/scripts/seed-admin-2e-operational-permissions.ts', 'utf8');

test('ADMIN-2E permite territorio para GESTOR y TALENTO_HUMANO sin exigir gestor user', () => {
  assert.ok(usersUi.includes('TALENTO_HUMANO'));
  assert.ok(usersUi.includes('Municipios a cargo'));
  assert.ok(usersUi.includes('getGestorMunicipios'));
  assert.ok(vincService.includes('ensureTerritorialAssignmentUserExists'));
  assert.ok(vincService.includes('TERRITORIAL_USER_NOT_FOUND'));
  assert.ok(vincService.includes("r_scope.nombre_rol IN ('GESTOR', 'TALENTO_HUMANO')"));
});

test('ADMIN-2E separa municipio autorizado de personal seleccionado o dinamico', () => {
  assert.ok(migration.includes('TODO_MUNICIPIO'));
  assert.ok(migration.includes('PERSONAL_SELECCIONADO'));
  assert.ok(vincService.includes('gestor_personal_asignaciones'));
  assert.ok(vincService.includes('gestor_municipio_asignaciones'));
  assert.ok(usersUi.includes('Personal seleccionado'));
  assert.ok(usersUi.includes('Todo el municipio'));
  assert.ok(usersUi.includes('saveGestorAssignments'));
});

test('ADMIN-2E usa una fuente efectiva de gestor en personal y nomina', () => {
  assert.ok(vincService.includes('gestor_actual'));
  assert.ok(vincService.includes('alcance_personal'));
  assert.ok(nominaService.includes('gestor_personal_asignaciones'));
  assert.ok(nominaService.includes('gestor_municipio_asignaciones'));
  assert.ok(nominaProcesos.includes('NOMINA_SCOPE_FORBIDDEN'));
});

test('ADMIN-2E filtra municipios por departamento y valida pertenencia real', () => {
  assert.ok(usersUi.includes('Selecciona primero un departamento para consultar sus municipios'));
  assert.ok(usersUi.includes('getContractPersonalFilterOptions'));
  assert.ok(vincService.includes('departamento_id'));
  assert.ok(vincService.includes('MUNICIPIO_DEPARTAMENTO_INVALIDO'));
  assert.ok(vincService.includes('GESTOR_MUNICIPIO_CONTRATO_INVALIDO'));
});

test('ADMIN-2E mantiene permisos operativos minimos e idempotentes', () => {
  assert.ok(permissions.includes('GESTOR'));
  assert.ok(permissions.includes('TALENTO_HUMANO'));
  assert.ok(permissions.includes('ON CONFLICT (rol_id, permiso_id)'));
  assert.ok(permissions.includes("['nomina', 'read'"));
  assert.equal(permissions.includes('administracion'), false);
});

test('ADMIN-2E conserva vigencias y auditoria al cambiar municipio', () => {
  const personalService = readFileSync('src/modules/vinculaciones/vinculaciones.personal.service.ts', 'utf8');
  assert.ok(personalService.includes('vigencia_hasta'));
  assert.ok(personalService.includes('gestor_personal_asignaciones'));
  assert.ok(vincService.includes('registerAuditEntry'));
});
