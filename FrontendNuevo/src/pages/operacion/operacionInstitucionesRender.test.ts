import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./OperacionInstitucionesFinalPage.tsx', import.meta.url), 'utf8');
const item = (id: number) => ({ id: String(id), focalizacion: { id: '168', nombre: 'Agosto 2026', anio: 2026, mes: 8 }, municipio: 'Meta', institucion: 'Institución', sede: 'Sede', modalidad: 'Regular', estado: 'ACTIVA', activo: true });
const fixture = { items: Array.from({ length: 50 }, (_, index) => item(index + 1)), total: 687, page: 1, page_size: 50, total_pages: 14, summary: { instituciones: 111, sedes: 605, combinaciones: 687, matriculados: 76650, cupos: 80355 }, filter_options: { focalizaciones: [{ id: '168', nombre: 'Agosto 2026', anio: 2026, mes: 8 }], municipios: [], instituciones: [], sedes: [], modalidades: [], rectores: [], gestores: [], estados: [] }, contrato_id: 24 };

test('success con 50 items monta buscador, ocho filtros, encabezados y filas', () => {
  assert.equal(fixture.items.length, 50);
  assert.match(source, /instituciones-search-row/);
  for (const text of ['Municipio', 'Institución', 'Sede', 'Modalidad', 'Rector', 'Gestor', 'Estado']) assert.match(source, new RegExp(text));
  assert.match(source, /rows\.map/);
  assert.match(source, /row\.focalizacion\?\.id/);
});

test('success vacío conserva filtros y muestra el estado vacío', () => {
  assert.match(source, /rows\.length === 0/);
  assert.match(source, /No hay resultados para los filtros actuales/);
  assert.match(source, /filter_options\.focalizaciones/);
});

test('loading y error no mezclan resultados residuales', () => {
  assert.match(source, /status === 'loading'/);
  assert.match(source, /status === 'error'/);
  assert.match(source, /setResult\(empty\)/);
});

test('cambio de focalización y paginación usan el contrato actual', () => {
  assert.match(source, /focalizacion_id: focalizacion/);
  assert.match(source, /setFocalizacion/);
  assert.match(source, /setPageSize/);
  assert.match(source, /page_size: pageSize/);
});
