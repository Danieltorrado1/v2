import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyNominaMultipleLinks,
  classifyNominaPopulationKind,
  intersectsNominaPeriodo,
  resolveNominaMetodoLiquidacion
} from '../modules/nomina/nomina.population';

const PERIODO_INICIO = '2026-08-01';
const PERIODO_FIN = '2026-08-31';

test('interseccion completa incluye vinculaciones activas durante agosto', () => {
  assert.equal(
    intersectsNominaPeriodo('2026-07-29', null, PERIODO_INICIO, PERIODO_FIN),
    true
  );
});

test('ingreso durante agosto queda incluido', () => {
  assert.equal(
    intersectsNominaPeriodo('2026-08-14', null, PERIODO_INICIO, PERIODO_FIN),
    true
  );
});

test('retiro durante agosto queda incluido', () => {
  assert.equal(
    intersectsNominaPeriodo('2026-07-29', '2026-08-17', PERIODO_INICIO, PERIODO_FIN),
    true
  );
});

test('retiro previo a agosto queda excluido', () => {
  assert.equal(
    intersectsNominaPeriodo('2026-07-01', '2026-07-31', PERIODO_INICIO, PERIODO_FIN),
    false
  );
});

test('ingreso posterior a agosto queda excluido', () => {
  assert.equal(
    intersectsNominaPeriodo('2026-09-01', null, PERIODO_INICIO, PERIODO_FIN),
    false
  );
});

test('clasifica reingreso cuando la misma persona tiene dos vinculaciones separadas en el mes', () => {
  const result = classifyNominaMultipleLinks(
    [
      {
        vinculacion_id: '100',
        persona_id: '1',
        fecha_inicio: '2026-07-15',
        fecha_fin: '2026-08-10',
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      },
      {
        vinculacion_id: '101',
        persona_id: '1',
        fecha_inicio: '2026-08-20',
        fecha_fin: null,
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      }
    ],
    PERIODO_INICIO,
    PERIODO_FIN
  );

  assert.equal(result, 'REINGRESO');
});

test('clasifica consecutiva cuando no hay hueco entre dos vinculaciones de la misma persona', () => {
  const result = classifyNominaMultipleLinks(
    [
      {
        vinculacion_id: '200',
        persona_id: '2',
        fecha_inicio: '2026-07-29',
        fecha_fin: '2026-08-15',
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      },
      {
        vinculacion_id: '201',
        persona_id: '2',
        fecha_inicio: '2026-08-16',
        fecha_fin: null,
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      }
    ],
    PERIODO_INICIO,
    PERIODO_FIN
  );

  assert.equal(result, 'CONSECUTIVA');
});

test('clasifica solapada cuando dos vinculaciones se traslapan en agosto', () => {
  const result = classifyNominaMultipleLinks(
    [
      {
        vinculacion_id: '300',
        persona_id: '3',
        fecha_inicio: '2026-07-29',
        fecha_fin: '2026-08-20',
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      },
      {
        vinculacion_id: '301',
        persona_id: '3',
        fecha_inicio: '2026-08-10',
        fecha_fin: null,
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      }
    ],
    PERIODO_INICIO,
    PERIODO_FIN
  );

  assert.equal(result, 'SOLAPADA');
});

test('clasifica requiere revision cuando hay duplicado simultaneo con la misma firma laboral', () => {
  const result = classifyNominaMultipleLinks(
    [
      {
        vinculacion_id: '400',
        persona_id: '4',
        fecha_inicio: '2026-07-29',
        fecha_fin: null,
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      },
      {
        vinculacion_id: '401',
        persona_id: '4',
        fecha_inicio: '2026-07-29',
        fecha_fin: null,
        metodo_pago: 'ASISTENCIA',
        tipo_vinculacion_codigo: 'OL'
      }
    ],
    PERIODO_INICIO,
    PERIODO_FIN
  );

  assert.equal(result, 'REQUIERE_REVISION');
});

test('clasifica OPS usando tipo de vinculacion o metodo de pago', () => {
  assert.equal(
    classifyNominaPopulationKind({
      metodo_pago: null,
      tipo_vinculacion_codigo: 'OPS'
    }),
    'OPS'
  );

  assert.equal(
    classifyNominaPopulationKind({
      metodo_pago: 'OPS_MENSUAL',
      tipo_vinculacion_codigo: null
    }),
    'OPS'
  );
});

test('resuelve metodo_liquidacion al catalogo valido de nomina_empleados', () => {
  assert.equal(
    resolveNominaMetodoLiquidacion({
      metodo_pago: 'ASISTENCIA'
    }),
    'ASISTENCIA'
  );

  assert.equal(
    resolveNominaMetodoLiquidacion({
      metodo_pago: 'COBERTURA'
    }),
    'CATEGORIA_SALARIAL'
  );

  assert.equal(
    resolveNominaMetodoLiquidacion({
      metodo_pago: 'CASO_ESPECIAL'
    }),
    'CATEGORIA_SALARIAL'
  );
});
