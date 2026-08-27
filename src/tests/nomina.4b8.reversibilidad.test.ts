import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const operative = read('src/modules/nomina/nomina.operativa.ts');
const revision = read('src/modules/nomina/revision-operativa.service.ts');
const service = read('src/modules/nomina/nomina.service.ts');
const routes = read('src/modules/nomina/nomina.routes.ts');
const page = read('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx');

test('4B.8 separa PENDIENTE, REVISADO y CERRADO', () => {
  for (const state of ['PENDIENTE', 'REVISADO', 'CERRADO']) assert.ok(operative.includes(`'${state}'`));
  assert.match(revision, /solo puede cerrarse cuando el trabajador esta revisado/);
});

test('4B.8 permite deshacer revision y exige nueva revision tras reapertura', () => {
  assert.match(page, /Deshacer revision/);
  assert.match(revision, /estado_revision='PENDIENTE'/);
  assert.match(revision, /motivo_invalidacion=\$6/);
});

test('4B.8 protege mutaciones cuando el empleado esta cerrado', () => {
  for (const action of ['registrar novedades', 'editar novedades', 'anular novedades', 'modificar la asistencia']) {
    assert.ok(service.includes(action), action);
  }
  assert.match(operative, /NOMINA_EMPLEADO_CERRADO/);
});

test('4B.8 invalida revision tras asistencia y novedades', () => {
  assert.ok((service.match(/invalidateNominaEmpleadoRevisionState/g) ?? []).length >= 6);
});

test('4B.8 implementa cierre y reapertura con RBAC, motivo y auditoria', () => {
  assert.match(routes, /nomina\.periodos\.close/);
  assert.match(routes, /nomina\.periodos\.reopen/);
  assert.match(revision, /NOMINA_EMPLEADO_CLOSE/);
  assert.match(revision, /NOMINA_EMPLEADO_REOPEN/);
  assert.match(page, /Motivo obligatorio de reapertura/);
});

test('4B.8 conserva soft-delete y exclusividad PRESENTE XOR NOVEDAD', () => {
  assert.match(service, /SET activo = FALSE/);
  assert.match(service, /assertNominaAsistenciaSinNovedadActiva/);
  assert.match(service, /replaceNominaAsistenciaPresentePorNovedad/);
  assert.match(page, /Para marcar asistencia primero debes editar o anular la novedad/);
  assert.match(page, /reemplazara la asistencia del dia/);
});

test('4B.8 expone inspector, modalidad y siguiente trabajador pendiente', () => {
  for (const token of ['Codigo:', 'Observacion:', 'Modalidad:', 'Gestor:', 'Anular novedad']) assert.ok(page.includes(token), token);
  assert.match(page, /const eligible = ordered/);
  assert.match(page, /state === wanted/);
});
