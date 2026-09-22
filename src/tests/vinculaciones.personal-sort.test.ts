import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const schema = readFileSync('src/modules/vinculaciones/vinculaciones.schemas.ts', 'utf8');
const service = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const page = readFileSync('FrontendNuevo/src/pages/personal/OperationalPersonalPage.tsx', 'utf8');

test('Personal expone orden global antes de paginar', () => {
  assert.match(schema, /sort_by: z\.enum\(\['nombre', 'ingreso', 'municipio', 'institucion', 'cargo', 'cumplimiento'\]\)/);
  assert.match(schema, /sort_dir: z\.enum\(\['asc', 'desc'\]\)/);
  const order = service.indexOf('ORDER BY ${sortExpression}');
  const limit = service.indexOf('LIMIT $${listParams.length - 1}', order);
  assert.ok(order >= 0 && limit > order);
});

test('Personal mantiene criterios de orden y label de sedes', () => {
  for (const option of ['Nombre A–Z', 'Nombre Z–A', 'Ingreso reciente', 'Ingreso antiguo', 'Municipio A–Z', 'Institución A–Z', 'Cargo A–Z']) assert.match(page, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(page.includes('<option value="">Sedes</option>'));
  assert.match(page, /sort_by: sortBy/);
  assert.match(page, /sort_dir: sortBy/);
  assert.match(page, /getContractPersonal\(currentFilters!, controller\.signal\)/);
  assert.match(page, /sortBy,\s*\n\s*\]\);/);
});
