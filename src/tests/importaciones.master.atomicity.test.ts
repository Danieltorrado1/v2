import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const importacionesMasterSource = readFileSync(
  path.join(root, 'src/modules/importaciones/importaciones.master.service.ts'),
  'utf8'
);
const personasSource = readFileSync(
  path.join(root, 'src/modules/personas/personas.service.ts'),
  'utf8'
);
const personasMasterSource = readFileSync(
  path.join(root, 'src/modules/personas/personas.master.service.ts'),
  'utf8'
);

const getSection = (source: string, marker: string): string => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `No se encontro la seccion ${marker}`);
  return source.slice(start);
};

test('applyMasterImportLote usa helpers transaccionales y no wrappers autonomos', () => {
  const applySection = getSection(
    importacionesMasterSource,
    'export const applyMasterImportLote = async'
  );

  assert.match(applySection, /\bcreatePersonaWithClient\(/);
  assert.match(applySection, /\bupdatePersonaWithClient\(/);
  assert.match(applySection, /\bcreatePersonaCuentaBancariaWithClient\(/);
  assert.match(applySection, /\bupdatePersonaCuentaBancariaWithClient\(/);
  assert.match(applySection, /\bupsertSstPerfilSociodemograficoWithClient\(/);
  assert.doesNotMatch(applySection, /\bcreatePersona\(/);
  assert.doesNotMatch(applySection, /\bupdatePersona\(/);
  assert.doesNotMatch(applySection, /\bcreatePersonaCuentaBancaria\(/);
  assert.doesNotMatch(applySection, /\bupdatePersonaCuentaBancaria\(/);
  assert.doesNotMatch(applySection, /\bupsertSstPerfilSociodemografico\(/);
});

test('applyMasterImportLote mantiene lock del lote y una transaccion maestra explicita', () => {
  assert.match(importacionesMasterSource, /const lote = await getLoteRow\(client, loteId, true\)/);
  assert.match(importacionesMasterSource, /await client\.query\('BEGIN'\)/);
  assert.match(importacionesMasterSource, /await client\.query\('ROLLBACK'\)/);
});

test('wrappers publicos de personas preservan su propia transaccion y delegan a helpers WithClient', () => {
  const createWrapperSection = getSection(personasSource, 'export const createPersona = async');
  const updateWrapperSection = getSection(personasSource, 'export const updatePersona = async');

  assert.match(personasSource, /export const createPersonaWithClient = async/);
  assert.match(personasSource, /export const updatePersonaWithClient = async/);
  assert.match(createWrapperSection, /await client\.query\('BEGIN'\)/);
  assert.match(createWrapperSection, /await createPersonaWithClient\(client, input, context\)/);
  assert.match(createWrapperSection, /await client\.query\('COMMIT'\)/);
  assert.match(updateWrapperSection, /await client\.query\('BEGIN'\)/);
  assert.match(
    updateWrapperSection,
    /await updatePersonaWithClient\(client, personaId, input, context, tenant\)/
  );
  assert.match(updateWrapperSection, /await client\.query\('COMMIT'\)/);
});

test('wrappers publicos bancarios preservan su propia transaccion y delegan a helpers WithClient', () => {
  const createWrapperSection = getSection(
    personasMasterSource,
    'export const createPersonaCuentaBancaria = async'
  );
  const updateWrapperSection = getSection(
    personasMasterSource,
    'export const updatePersonaCuentaBancaria = async'
  );

  assert.match(personasMasterSource, /export const createPersonaCuentaBancariaWithClient = async/);
  assert.match(personasMasterSource, /export const updatePersonaCuentaBancariaWithClient = async/);
  assert.match(createWrapperSection, /await client\.query\('BEGIN'\)/);
  assert.match(
    createWrapperSection,
    /await createPersonaCuentaBancariaWithClient\(\s*client,\s*personaId,\s*input,\s*context,\s*tenant\s*\)/
  );
  assert.match(createWrapperSection, /await client\.query\('COMMIT'\)/);
  assert.match(updateWrapperSection, /await client\.query\('BEGIN'\)/);
  assert.match(
    updateWrapperSection,
    /await updatePersonaCuentaBancariaWithClient\(\s*client,\s*personaId,\s*cuentaBancariaId,\s*input,\s*context,\s*tenant\s*\)/
  );
  assert.match(updateWrapperSection, /await client\.query\('COMMIT'\)/);
});
