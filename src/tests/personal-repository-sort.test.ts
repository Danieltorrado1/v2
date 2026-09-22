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

test('Repositorio filtra cargo y pendientes en backend antes de paginar', () => {
  assert.match(service, /filters\.contrato_cargo_id[\s\S]{0,240}v\.contrato_cargo_id =/);
  assert.match(service, /filters\.estado_documental === 'PENDIENTE_REVISION'/);
  assert.match(service, /dv_pending\.estado_revision = 'PENDIENTE_REVISION'/);
  assert.match(service, /ORDER BY \$\{sortExpression\}[\s\S]{0,180}LIMIT/);
  assert.match(panel, /estado_documental: estadoDocumental/);
  assert.match(panel, /aria-label="Estado documental del repositorio"/);
  assert.match(panel, /por revisar/);
});

test('Municipio se ordena por nombre canónico con desempate estable', () => {
  assert.match(service, /COALESCE\(mu\.nombre_municipio, NULLIF\(ff\.municipio_texto, ''\)\) AS municipio_actual/);
  assert.match(service, /municipio: `COALESCE\(caa\.municipio_actual, ''\) \$\{direction\}`/);
  assert.match(service, /p\.primer_nombre ASC, p\.segundo_nombre ASC/);
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
