import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { planBootstrap, type BootstrapCatalogs, type BootstrapSourceRow } from '../modules/cobertura/cobertura.bootstrap.domain';

const catalogs = (): BootstrapCatalogs => ({
  municipios: [{ id: '1', codigo_dane: '50006', nombre_municipio: 'ACACÍAS' }],
  instituciones: [{ id: '10', contrato_id: '99', municipio_id: '1', codigo_dane: '150006000934', nombre_institucion: 'INSTITUCIÓN EDUCATIVA ESCUELA NORMAL' }],
  sedes: [{ id: '20', institucion_id: '10', municipio_id: '1', codigo_dane: '15000600093403', consecutivo_sede: '15000600093403', nombre_sede: 'SEDE PRINCIPAL' }],
  modalidades: [{ id: '30', codigo_original: 'CAA', codigo_base: 'CAA', nombre_modalidad: 'CAA' }, { id: '31', codigo_original: 'CAJU-RI', codigo_base: 'CAJU-RI', nombre_modalidad: 'CAJU-RI' }],
  modalidadAliases: [{ modalidad_id: '30', alias: 'ALMUERZO CAA' }], institucionHistorial: [], sedeHistorial: [],
  sedeModalidades: [{ id: '40', sede_id: '20', modalidad_id: '30', contrato_id: '99' }],
});
const row = (overrides: Partial<BootstrapSourceRow> = {}): BootstrapSourceRow => ({ fila: 3, municipio: 'ACACIAS', institucion: 'I.E. ESCUELA NORMAL', sede: 'SEDE PRINCIPAL', modalidad: 'CAA', consecutivo: '15000600093403', focalizacion: 10, ...overrides });

test('normaliza ACACIAS/ACACÍAS e IE/I.E./INSTITUCIÓN EDUCATIVA', () => {
  const [result] = planBootstrap([row()], catalogs(), '99');
  assert.equal(result?.municipio_resuelto, 'ACACÍAS');
  assert.equal(result?.accion_institucion, 'REUTILIZAR');
});

test('resuelve modalidad por alias y rechaza modalidad desconocida', () => {
  const results = planBootstrap([row({ modalidad: 'ALMUERZO CAA' }), row({ fila: 4, modalidad: 'DESCONOCIDA' })], catalogs(), '99');
  assert.equal(results[0]?.modalidad_id, '30');
  assert.ok(results[1]?.observaciones.includes('MODALIDAD_NO_RECONOCIDA'));
});

test('marca municipio desconocido', () => {
  assert.ok(planBootstrap([row({ municipio: 'OTRO', consecutivo: null })], catalogs(), '99')[0]?.observaciones.includes('MUNICIPIO_NO_RECONOCIDO'));
});

test('detecta institución y sede ambiguas', () => {
  const data = catalogs();
  data.instituciones.push({ ...data.instituciones[0]!, id: '11' });
  data.sedes.push({ ...data.sedes[0]!, id: '21', institucion_id: '11' });
  const result = planBootstrap([row()], data, '99')[0];
  assert.ok(result?.observaciones.includes('INSTITUCION_AMBIGUA'));
  assert.ok(result?.observaciones.includes('SEDE_AMBIGUA'));
});

test('concilia históricos homónimos dentro del municipio correcto', () => {
  const data = catalogs();
  data.municipios.push({ id: '2', codigo_dane: '50001', nombre_municipio: 'VILLAVICENCIO' });
  data.instituciones.push({ ...data.instituciones[0]!, id: '11', municipio_id: '2' });
  data.institucionHistorial = [
    { institucion_id: '10', nombre_normalizado: 'INSTITUCION EDUCATIVA ESCUELA NORMAL', codigo_dane: null },
    { institucion_id: '11', nombre_normalizado: 'INSTITUCION EDUCATIVA ESCUELA NORMAL', codigo_dane: null },
  ];
  assert.equal(planBootstrap([row()], data, '99')[0]?.accion_institucion, 'REUTILIZAR');
});

test('deduplica institución, sede y permite varias modalidades por sede', () => {
  const data = catalogs(); data.instituciones = []; data.sedes = []; data.sedeModalidades = [];
  const results = planBootstrap([row(), row({ fila: 4, modalidad: 'CAJU-RI' })], data, '99');
  assert.equal(results[0]?.accion_institucion, 'CREAR'); assert.equal(results[1]?.accion_institucion, 'CREAR');
  assert.equal(results[0]?.accion_sede, 'CREAR'); assert.equal(results[1]?.accion_sede, 'CREAR');
  assert.equal(results[0]?.accion_sede_modalidad, 'CREAR'); assert.equal(results[1]?.accion_sede_modalidad, 'CREAR');
});

test('detecta duplicado exacto y planificación idempotente', () => {
  const rows = [row(), row({ fila: 4 })];
  const first = planBootstrap(rows, catalogs(), '99');
  const second = planBootstrap(rows, catalogs(), '99');
  assert.deepEqual(first, second);
  assert.ok(first.every((item) => item.observaciones.some((value) => value.startsWith('DUPLICADO_EXACTO'))));
});

test('bloquea un mismo consecutivo de sede con nombres diferentes', () => {
  const data = catalogs(); data.instituciones = []; data.sedes = [];
  const results = planBootstrap([row(), row({ fila: 4, sede: 'SEDE DIFERENTE' })], data, '99');
  assert.ok(results.every((item) => item.accion_sede === 'REVISAR'));
  assert.ok(results.every((item) => item.observaciones.some((value) => value.startsWith('SEDE_CODIGO_CONFLICTIVO'))));
});

test('contrato ausente no se sustituye y bloquea el plan', () => {
  const result = planBootstrap([row()], catalogs(), null)[0];
  assert.ok(result?.observaciones.includes('CONTRATO_DESTINO_NO_EXISTE'));
  assert.equal(result?.estado, 'ERROR');
});

test('el comando dry-run no contiene sentencias SQL de escritura', () => {
  const source = readFileSync(path.resolve('src/scripts/bootstrap-focalizacion-dry-run.ts'), 'utf8');
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /const apply = args\.includes\('--apply'\)/);
  assert.match(source, /if \(apply\)/);
  assert.doesNotMatch(source, /`\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/i);
});
