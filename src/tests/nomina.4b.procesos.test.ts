import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateNominaProcessAccess, NOMINA_PROCESOS } from '../modules/nomina/nomina.procesos';

const sql = readFileSync(resolve('sql/phase-36-nomina-4b-procesos.sql'), 'utf8');
const processService = readFileSync(resolve('src/modules/nomina/nomina.procesos.ts'), 'utf8');
const router = readFileSync(resolve('src/modules/nomina/nomina.routes.ts'), 'utf8');

test('4B modela COBERTURA, ASISTENCIA y OPS como procesos estables independientes', () => assert.deepEqual(NOMINA_PROCESOS, ['COBERTURA','ASISTENCIA','OPS']));
test('responsabilidad es independiente de roles y admite NINGUNO por ausencia de filas', () => { assert.match(sql, /nomina_responsabilidades_usuario/); assert.match(processService, /nombre_rol|talento_humano|GESTOR/); assert.match(processService, /nomina_responsabilidades_usuario/); });
test('municipios reutilizan catálogo existente y áreas son configurables por empresa', () => { assert.match(sql, /REFERENCES municipios/); assert.match(sql, /CREATE TABLE IF NOT EXISTS nomina_areas/); assert.match(sql, /empresa_id BIGINT NOT NULL REFERENCES empresas/); });
test('scopes bloquean municipio/área y acceso cruzado en backend', () => { assert.match(processService, /NOMINA_MUNICIPIO_FORBIDDEN/); assert.match(processService, /NOMINA_AREA_FORBIDDEN/); assert.match(processService, /TENANT_FORBIDDEN/); });
test('OPS no se mezcla con scopes de COBERTURA o ASISTENCIA', () => { assert.match(processService, /proceso === 'COBERTURA'/); assert.match(processService, /proceso === 'ASISTENCIA'/); assert.doesNotMatch(processService, /proceso === 'OPS'.*municipio|proceso === 'OPS'.*area/); });
test('migración protege área de otra empresa', () => assert.match(sql, /Área fuera de la empresa/));
test('rutas existentes de Nómina conservan compatibilidad', () => { assert.match(router, /nominaRoutes\.get\(\s*['"]\/periodos/); assert.match(router, /nominaRoutes\.get\(\s*['"]\/movimientos/); });
test('matriz 4B cubre ninguno, municipio A/B, áreas A/B, combinación y OPS', () => {
  const none = evaluateNominaProcessAccess([]); assert.equal(none.every((item) => !item.responsable), true);
  const combo = evaluateNominaProcessAccess([{ proceso: 'COBERTURA', municipios: [1] }, { proceso: 'ASISTENCIA', areas: [10, 11] }, { proceso: 'OPS' }]);
  assert.deepEqual(combo.find((item) => item.proceso === 'COBERTURA')?.municipios, [1]);
  assert.deepEqual(combo.find((item) => item.proceso === 'ASISTENCIA')?.areas, [10, 11]);
  assert.equal(combo.find((item) => item.proceso === 'OPS')?.responsable, true);
});
test('histórico trabajador/área usa vigencias y no overwrite', () => { assert.match(sql, /CREATE TABLE IF NOT EXISTS nomina_vinculacion_areas/); assert.match(processService, /vigencia_desde <= \$2::date/); });
test('administración de responsabilidades y áreas reutiliza rutas autenticadas de Nómina', () => { assert.match(router, /procesos\/areas/); assert.match(router, /procesos\/responsabilidades/); assert.match(processService, /replaceNominaResponsibility/); });
