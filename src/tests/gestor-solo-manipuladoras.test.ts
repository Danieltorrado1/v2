import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { looksLikeManipuladoraCargo } from '../modules/vinculaciones/vinculaciones.personal.domain';

const personalListService = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const nominaPage = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.tsx', 'utf8');
const planillaPage = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
const contractPersonalPage = readFileSync('FrontendNuevo/src/pages/personal/ContractPersonalPage.tsx', 'utf8');
const operationalPersonalPage = readFileSync('FrontendNuevo/src/pages/personal/OperationalPersonalPage.tsx', 'utf8');

test('gestor solo aplica al cargo canónico de manipuladora de alimentos', () => {
  assert.equal(looksLikeManipuladoraCargo('MANIPULADORA DE ALIMENTOS'), true);
  assert.equal(looksLikeManipuladoraCargo('MANIPULADOR(A) DE ALIMENTOS'), true);
  assert.equal(looksLikeManipuladoraCargo('MANIPULADOR DE ALIMENTOS'), true);
  assert.equal(looksLikeManipuladoraCargo('Administrativo'), false);
  assert.equal(looksLikeManipuladoraCargo('Coordinador de zona'), false);
  assert.equal(looksLikeManipuladoraCargo('Profesional de apoyo'), false);
});

test('Personal y Nómina conservan las fuentes actuales de gestor por alcance', () => {
  assert.match(personalListService, /gestor_actual/);
  assert.match(nominaService, /gestor_personal_asignaciones/);
  assert.match(nominaService, /gestor_municipio_asignaciones/);
});

test('la interfaz deja oculto el gestor cuando el dato de aplicabilidad es falso', () => {
  assert.match(nominaPage, /empleado\.gestor_aplica === false/);
  assert.match(planillaPage, /employee\.gestor_aplica === false/);
  assert.match(contractPersonalPage, /item\.es_manipuladora \?/);
  assert.match(operationalPersonalPage, /item\.gestor_aplica \?/);
  assert.doesNotMatch(nominaPage, /if \(empleado\.gestor_aplica === false\) return \"No aplica\"/);
  assert.doesNotMatch(planillaPage, /if \(employee\.gestor_aplica === false\) return \"No aplica\"/);
});
