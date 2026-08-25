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

test('createNominaNovedadSchema acepta cobertura sin reemplazo', () => {
  const parsed = createNominaNovedadSchema.parse({
    periodo_id: '1',
    nomina_empleado_id: '2',
    vinculacion_id: '3',
    tipo_novedad_codigo: 'PR1',
    cobertura: {
      tipo_cobertura: 'SIN_REEMPLAZO',
      observacion_interna: 'No aplica reemplazo'
    }
  });

  assert.equal(parsed.cobertura?.tipo_cobertura, 'SIN_REEMPLAZO');
});

test('createNominaNovedadSchema exige persona y vinculacion para cobertura vinculada', () => {
  assert.throws(
    () =>
      createNominaNovedadSchema.parse({
        periodo_id: '1',
        nomina_empleado_id: '2',
        vinculacion_id: '3',
        tipo_novedad_codigo: 'PR2',
        cobertura: {
          tipo_cobertura: 'PERSONAL_VINCULADO',
          persona_cubre_id: '88'
        }
      }),
    /vinculacion_cubre_id is required/
  );
});

test('updateNominaNovedadSchema exige nombre y documento para cobertura externa', () => {
  assert.throws(
    () =>
      updateNominaNovedadSchema.parse({
        cobertura: {
          tipo_cobertura: 'PERSONA_EXTERNA',
          nombre_externo: 'Apoyo temporal'
        }
      }),
    /documento_externo is required/
  );
});
