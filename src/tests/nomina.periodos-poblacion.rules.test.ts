import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const serviceSource = readFileSync(
  path.resolve(process.cwd(), 'src/modules/nomina/application/nomina-poblacion.service.ts'),
  'utf8'
);
const facadeSource = readFileSync(path.resolve(process.cwd(), 'src/modules/nomina/nomina.service.ts'), 'utf8');
const repositorySource = readFileSync(path.resolve(process.cwd(), 'src/modules/nomina/infrastructure/repositories/nomina-poblacion.repository.ts'), 'utf8');
const reviewSource = readFileSync(path.resolve(process.cwd(), 'src/modules/nomina/application/nomina-population-review.ts'), 'utf8');

const getSection = (marker: string): string => {
  const start = serviceSource.indexOf(marker);
  assert.notEqual(start, -1, `No se encontro la seccion ${marker}`);
  return serviceSource.slice(start);
};

test('createNominaPeriodo reutiliza el periodo exacto existente para evitar duplicados logicos', () => {
  const section = facadeSource.slice(facadeSource.indexOf('export const createNominaPeriodo = async'));

  assert.match(section, /findExistingNominaPeriodoByContractAndRange/);
  assert.match(section, /if \(existing\) \{\s*await client\.query\('COMMIT'\);\s*return existing;/);
});

test('importNominaEmpleados usa interseccion por fechas y no depende de estado ACTIVA como filtro absoluto', () => {
  const section = serviceSource + repositorySource;

  assert.doesNotMatch(section, /estado_vinculacion = 'ACTIVA'/);
  assert.match(section, /v\.fecha_inicio <= \$2::date/);
  assert.match(section, /effectiveRetirementSql/);
});

test('importNominaEmpleados omite vinculaciones ambiguas marcadas en revision', () => {
  const section = serviceSource + reviewSource;

  assert.match(section, /buildImportCandidateReviewSet/);
  assert.match(section, /skippedRequiresReview/);
  assert.match(section, /reviewVinculacionIds\.has\(candidate\.vinculacion_id\)/);
});

test('importNominaEmpleados resuelve metodo_liquidacion al catalogo valido y no copia metodo_pago crudo', () => {
  const section = serviceSource + reviewSource;

  assert.match(section, /resolveNominaMetodoLiquidacion/);
  assert.doesNotMatch(section, /candidate\.metodo_pago\?\.trim\(\) \|\| 'SALARIO'/);
});
