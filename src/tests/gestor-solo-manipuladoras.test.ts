import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isGestorApplicableCargo } from '../modules/vinculaciones/vinculaciones.personal.domain';

const personalListService = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const nominaPage = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.tsx', 'utf8');
const planillaPage = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
const contractPersonalPage = readFileSync('FrontendNuevo/src/pages/personal/ContractPersonalPage.tsx', 'utf8');
const operationalPersonalPage = readFileSync('FrontendNuevo/src/pages/personal/OperationalPersonalPage.tsx', 'utf8');

test('gestor solo aplica al cargo canónico de manipuladora de alimentos', () => {
  assert.equal(isGestorApplicableCargo('MANIPULADORA DE ALIMENTOS'), true);
  assert.equal(isGestorApplicableCargo('MANIPULADOR(A) DE ALIMENTOS'), true);
  assert.equal(isGestorApplicableCargo('MANIPULADOR DE ALIMENTOS'), true);
  assert.equal(isGestorApplicableCargo('Administrativo'), false);
  assert.equal(isGestorApplicableCargo('Coordinador de zona'), false);
  assert.equal(isGestorApplicableCargo('Profesional de apoyo'), false);
});

test('Personal resuelve el alcance vigente con el helper canónico de cargo', () => {
  assert.match(personalListService, /gestorApplicableCargoSql/);
  assert.match(personalListService, /COUNT\(DISTINCT usuario_id\) = 1/);
  assert.match(personalListService, /gestor_municipio_asignaciones/);
  assert.match(personalListService, /gestor_institucion_asignaciones/);
  assert.match(personalListService, /gestor_personal_asignaciones/);
});

test('Personal y Nómina comparten filtro de aplicabilidad y no muestran gestor para otros cargos', () => {
  assert.match(personalListService, /gestorApplicableCargoSql/);
  assert.match(nominaService, /gestorApplicableCargoSql/);
  assert.match(nominaService, /gestor_aplica: isGestorApplicableCargo/);
  assert.match(nominaPage, /empleado\.gestor_aplica === false/);
  assert.match(planillaPage, /employee\.gestor_aplica === false/);
  assert.match(contractPersonalPage, /item\.es_manipuladora \?/);
  assert.match(operationalPersonalPage, /item\.gestor_aplica \?/);
  assert.doesNotMatch(nominaPage, /if \(empleado\.gestor_aplica === false\) return \"No aplica\"/);
  assert.doesNotMatch(planillaPage, /if \(employee\.gestor_aplica === false\) return \"No aplica\"/);
});
