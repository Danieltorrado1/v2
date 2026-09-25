import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const repository = readFileSync('src/modules/nomina/infrastructure/repositories/nomina-novedad.repository.ts', 'utf8');
const page = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.tsx', 'utf8');

test('el listado de gestión excluye DNC y DCO por código operacional', () => {
  assert.match(repository, /excludeInformative\?: boolean/);
  assert.match(repository, /codigo_operativo, ''\)\) NOT IN \('DNC', 'DCO'\)/);
  assert.match(service, /excludeInformative: false/);
  assert.doesNotMatch(service, /codigoOperativo === 'DNC' \|\| codigoOperativo === 'DCO'/);
});

test('TA no forma parte de la exclusión informativa', () => {
  assert.doesNotMatch(repository, /NOT IN \('DNC', 'DCO', 'TA'\)/);
  assert.doesNotMatch(page, /codigo !== "DNC" && codigo !== "DCO"/);
});

test('el listado continúa usando el scope territorial canónico', () => {
  assert.match(repository, /buildNoveltyWhere[\s\S]*appendNominaCoberturaScope/);
});
