import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertMunicipioRepairPreflight,
  MUNICIPIO_REPAIR_CONFIRMATION,
  runMunicipioRepairTransaction,
  validateMunicipioRepairProtection,
} from '../modules/cobertura/cobertura.maestros.municipio-repair';
import { AppError } from '../utils/AppError';

const scriptSource = readFileSync(
  path.join(process.cwd(), 'src/scripts/cobertura-maestros-repair-7-4.ts'),
  'utf8',
);

const expectAppErrorCode = (expectedCode: string) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, expectedCode);
  return true;
};

test('proteccion exige contract, official-load y confirmacion exactos', () => {
  assert.throws(
    () => validateMunicipioRepairProtection({ apply: true, contractId: '23', officialLoadId: '4', confirm: MUNICIPIO_REPAIR_CONFIRMATION }),
    expectAppErrorCode('MUNICIPIO_REPAIR_CONTRACT_ID_REQUIRED'),
  );
  assert.throws(
    () => validateMunicipioRepairProtection({ apply: true, contractId: '24', officialLoadId: '3', confirm: MUNICIPIO_REPAIR_CONFIRMATION }),
    expectAppErrorCode('MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID_REQUIRED'),
  );
  assert.throws(
    () => validateMunicipioRepairProtection({ apply: true, contractId: '24', officialLoadId: '4', confirm: 'OTRO' }),
    expectAppErrorCode('MUNICIPIO_REPAIR_CONFIRMATION_REQUIRED'),
  );
  assert.doesNotThrow(
    () => validateMunicipioRepairProtection({ apply: true, contractId: '24', officialLoadId: '4', confirm: MUNICIPIO_REPAIR_CONFIRMATION }),
  );
});

test('preflight acepta exactamente 57/11/43 o 0/0/0 ya reparado', () => {
  assert.doesNotThrow(
    () => assertMunicipioRepairPreflight({ relacionesIncorrectas: 57, institucionesAfectadas: 11, sedesAfectadas: 43 }),
  );
  assert.doesNotThrow(
    () => assertMunicipioRepairPreflight({ relacionesIncorrectas: 0, institucionesAfectadas: 0, sedesAfectadas: 0 }),
  );
  assert.throws(
    () => assertMunicipioRepairPreflight({ relacionesIncorrectas: 56, institucionesAfectadas: 11, sedesAfectadas: 43 }),
    expectAppErrorCode('MUNICIPIO_REPAIR_PREFLIGHT_RELACIONES_MISMATCH'),
  );
});

test('wrapper transaccional usa commit o rollback una sola vez', async () => {
  const queries: string[] = [];
  const client = { query: async (sql: string) => { queries.push(sql); } };
  await runMunicipioRepairTransaction(client as never, async () => 'ok');
  assert.deepEqual(queries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);

  const rollbackQueries: string[] = [];
  const rollbackClient = { query: async (sql: string) => { rollbackQueries.push(sql); } };
  await assert.rejects(
    runMunicipioRepairTransaction(rollbackClient as never, async () => {
      throw new Error('mid');
    }),
    /mid/,
  );
  assert.deepEqual(rollbackQueries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
});

test('CLI exige los flags protegidos de reparacion municipal', () => {
  assert.match(scriptSource, /--apply/);
  assert.match(scriptSource, /--contract-id=24/);
  assert.match(scriptSource, /--official-load-id=4/);
  assert.match(scriptSource, /REPARAR_MUNICIPIOS_FOCALIZACION_META26/);
});
