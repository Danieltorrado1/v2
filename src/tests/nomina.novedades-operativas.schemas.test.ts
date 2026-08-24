import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNominaNovedadSchema,
  updateNominaNovedadSchema
} from '../modules/nomina/nomina.schemas';

test('createNominaNovedadSchema acepta tipo por codigo operativo', () => {
  const parsed = createNominaNovedadSchema.parse({
    periodo_id: '1',
    nomina_empleado_id: '2',
    vinculacion_id: '3',
    tipo_novedad_codigo: 'PR2',
    fecha_inicio: '2026-08-10',
    fecha_fin: '2026-08-12'
  });

  assert.equal(parsed.tipo_novedad_codigo, 'PR2');
  assert.equal(parsed.tipo_novedad_id, undefined);
});

test('createNominaNovedadSchema acepta tipo por nombre', () => {
  const parsed = createNominaNovedadSchema.parse({
    periodo_id: '1',
    nomina_empleado_id: '2',
    vinculacion_id: '3',
    tipo_novedad_nombre: 'PERMISO NO REMUNERADO'
  });

  assert.equal(parsed.tipo_novedad_nombre, 'PERMISO NO REMUNERADO');
});

test('createNominaNovedadSchema exige id, codigo o nombre', () => {
  assert.throws(
    () =>
      createNominaNovedadSchema.parse({
        periodo_id: '1',
        nomina_empleado_id: '2',
        vinculacion_id: '3'
      }),
    /tipo_novedad_id, tipo_novedad_codigo or tipo_novedad_nombre is required/
  );
});

test('updateNominaNovedadSchema permite editar documento_persona_id y codigo', () => {
  const parsed = updateNominaNovedadSchema.parse({
    tipo_novedad_codigo: 'PR4',
    documento_persona_id: '99',
    observacion: 'Soporte oficial'
  });

  assert.equal(parsed.tipo_novedad_codigo, 'PR4');
  assert.equal(parsed.documento_persona_id, '99');
});
