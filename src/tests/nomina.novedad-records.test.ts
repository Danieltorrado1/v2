import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError';
import {
  buildNominaCanonicalProjectedRecordId,
  parseNominaNovedadRecordId
} from '../modules/nomina/nomina.novedad-records';

test('construye y parsea ids proyectados de novedades canonicas', () => {
  const recordId = buildNominaCanonicalProjectedRecordId('15', '2');
  assert.equal(recordId, 'canonica:15:2');
  assert.deepEqual(parseNominaNovedadRecordId(recordId), {
    entidad_id: '15',
    periodo_id: '2',
    registro_tipo: 'CANONICA_PROYECTADA'
  });
});

test('parsea ids ordinarios sin prefijo', () => {
  assert.deepEqual(parseNominaNovedadRecordId('99'), {
    entidad_id: '99',
    periodo_id: null,
    registro_tipo: 'ORDINARIA'
  });
});

test('rechaza ids canonicos incompletos', () => {
  assert.throws(
    () => parseNominaNovedadRecordId('canonica:15'),
    (error: unknown) =>
      error instanceof AppError && error.code === 'NOMINA_NOVEDAD_CANONICA_ID_INVALIDO'
  );
});
