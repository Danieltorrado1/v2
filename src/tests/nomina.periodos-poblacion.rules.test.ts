import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const serviceSource = readFileSync(
  path.resolve(process.cwd(), 'src/modules/nomina/nomina.service.ts'),
  'utf8'
);

const getSection = (marker: string): string => {
  const start = serviceSource.indexOf(marker);
  assert.notEqual(start, -1, `No se encontro la seccion ${marker}`);
  return serviceSource.slice(start);
};

test('createNominaPeriodo reutiliza el periodo exacto existente para evitar duplicados logicos', () => {
  const section = getSection('export const createNominaPeriodo = async');

  assert.match(section, /findExistingNominaPeriodoByContractAndRange/);
  assert.match(section, /if \(existing\) \{\s*await client\.query\('COMMIT'\);\s*return existing;/);
});

test('importNominaEmpleados usa interseccion por fechas y no depende de estado ACTIVA como filtro absoluto', () => {
  const section = getSection('export const importNominaEmpleados = async');

  assert.doesNotMatch(section, /estado_vinculacion = 'ACTIVA'/);
  assert.match(section, /v\.fecha_inicio <= \$2::date/);
  assert.match(section, /COALESCE\(v\.fecha_fin, \$2::date\) >= \$3::date/);
});

test('importNominaEmpleados omite vinculaciones ambiguas marcadas en revision', () => {
  const section = getSection('export const importNominaEmpleados = async');

  assert.match(section, /buildImportCandidateReviewSet/);
  assert.match(section, /skippedRequiresReview/);
  assert.match(section, /reviewVinculacionIds\.has\(candidate\.vinculacion_id\)/);
});

test('importNominaEmpleados resuelve metodo_liquidacion al catalogo valido y no copia metodo_pago crudo', () => {
  const section = getSection('export const importNominaEmpleados = async');

  assert.match(section, /resolveNominaMetodoLiquidacion/);
  assert.doesNotMatch(section, /candidate\.metodo_pago\?\.trim\(\) \|\| 'SALARIO'/);
});
