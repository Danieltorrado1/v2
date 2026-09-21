import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const panel = readFileSync('FrontendNuevo/src/pages/personal/PersonalRepositoryPanel.tsx', 'utf8');
const service = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');

test('Repositorio usa únicamente estados canónicos para los iconos', () => {
  for (const state of ['APROBADO', 'PENDIENTE_REVISION', 'POR_VENCER', 'VENCIDO', 'RECHAZADO', 'NO_APLICA', 'SIN_DOCUMENTO']) {
    assert.match(panel, new RegExp(`state === ['"]${state}['"]`));
  }
  assert.match(panel, /Estado documental no reconocido/);
  assert.match(panel, /Pendiente.*revisión/);
  assert.doesNotMatch(panel, /state === ['"]PARCIAL['"].*Clock3/);
});

test('Repositorio expone todos los criterios y cumplimiento se ordena antes de paginar', () => {
  for (const option of ['Nombre A–Z', 'Nombre Z–A', 'Ingreso reciente', 'Ingreso antiguo', 'Municipio A–Z', 'Institución A–Z', 'Cargo A–Z', 'Cumplimiento mayor → menor', 'Cumplimiento menor → mayor']) {
    assert.match(panel, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(panel, /sort_by: sortBy/);
  assert.match(panel, /sort_dir: sortBy/);
  const branch = service.indexOf("filters.sort_by === 'cumplimiento'");
  const slice = service.indexOf('sortedItems.slice', branch);
  assert.ok(branch >= 0 && slice > branch);
});

test('Repositorio expone Cargo y las acciones de gestión quedan limitadas a Base de datos', () => {
  assert.match(panel, /aria-label="Cargo del repositorio"/);
  assert.match(panel, /contrato_cargo_id: cargo/);
  const page = readFileSync('FrontendNuevo/src/pages/personal/OperationalPersonalPage.tsx', 'utf8');
  assert.match(page, /activeTab === "base" &&/);
  assert.match(page, /Gestionar gestores/);
  assert.match(page, /Nuevo trabajador/);
});
