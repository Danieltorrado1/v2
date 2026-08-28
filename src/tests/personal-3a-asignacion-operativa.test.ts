import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync('FrontendNuevo/src/pages/personal/PersonalPage.tsx', 'utf8');
const service = readFileSync('src/modules/vinculaciones/vinculaciones.personal.service.ts', 'utf8');
const schemas = readFileSync('src/modules/vinculaciones/vinculaciones.personal.schemas.ts', 'utf8');
const routes = readFileSync('src/modules/vinculaciones/vinculaciones.routes.ts', 'utf8');

test('PERSONAL-3A expone edicion operativa humana y dependiente', () => {
  assert.match(ui, /ASIGNACIÓN OPERATIVA/);
  assert.match(ui, /Buscar institución/);
  assert.match(ui, /Buscar sede/);
  assert.match(ui, /municipio_id===municipio/);
  assert.match(ui, /institucion_id===institucion/);
  assert.match(ui, /updateOperativeAssignment/);
});

test('PERSONAL-3A valida contexto real de contrato y fecha', () => {
  assert.match(service, /focalizacion_final_id/);
  assert.match(service, /ff\.contrato_id/);
  assert.match(service, /ASIGNACION_OPERATIVA_CONTEXTO_INVALIDO/);
  assert.match(schemas, /fecha_desde/);
  assert.match(service, /ASIGNACION_OPERATIVA_FECHA_REQUIERE_CAMBIO_OPERATIVO/);
});

test('PERSONAL-3A versiona asignaciones y conserva gestor por municipio', () => {
  assert.match(service, /UPDATE cobertura_asignaciones/);
  assert.match(service, /INSERT INTO cobertura_asignaciones/);
  assert.match(service, /gestor_personal_asignaciones/);
  assert.match(service, /gestor_municipio_asignaciones/);
  assert.match(service, /PERSONAL_ASIGNACION_OPERATIVA_UPDATE/);
});

test('PERSONAL-3A bloquea Gestor y limita TH en backend', () => {
  assert.match(routes, /requirePermissions\('vinculaciones\.update'\)/);
  assert.match(service, /El Gestor no puede modificar/);
  assert.match(service, /El municipio esta fuera del alcance autorizado/);
  assert.match(service, /tenant\.roleNames\.includes\('TALENTO_HUMANO'\)/);
});

test('PERSONAL-3A no cambia snapshots de nomina cerrados desde Personal', () => {
  assert.doesNotMatch(service, /UPDATE nomina_/);
  assert.match(service, /Correccion operativa desde Personal/);
  assert.match(ui, /Cambio Operativo/);
});
