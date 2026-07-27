import assert from 'node:assert/strict';

import {
  NOMINA_CORRECCION_AUDIT_ACTIONS,
  NOMINA_CORRECCION_EDITABLE_STATES,
  NOMINA_CORRECCION_PERMISSION_DEFINITIONS,
  calculateNominaCorreccionDifference,
  canTransitionNominaCorreccion
} from '../modules/nomina/correcciones.constants';
import {
  createNominaCorreccionSchema,
  rechazarNominaCorreccionSchema,
  updateNominaCorreccionSchema
} from '../modules/nomina/correcciones.schemas';

const requiredPermissions = [
  'nomina.correcciones.read',
  'nomina.correcciones.create',
  'nomina.correcciones.update',
  'nomina.correcciones.review',
  'nomina.correcciones.approve',
  'nomina.correcciones.apply',
  'nomina.correcciones.cancel'
];

const requiredAuditActions = [
  'NOMINA_CORRECCION_CREATE',
  'NOMINA_CORRECCION_UPDATE',
  'NOMINA_CORRECCION_REQUEST',
  'NOMINA_CORRECCION_REVIEW',
  'NOMINA_CORRECCION_APPROVE',
  'NOMINA_CORRECCION_REJECT',
  'NOMINA_CORRECCION_CANCEL',
  'NOMINA_CORRECCION_DEACTIVATE'
];

const run = (): void => {
  const parsed = createNominaCorreccionSchema.parse({
    periodo_id: 10,
    nomina_empleado_id: 20,
    vinculacion_id: 30,
    tipo_correccion: 'MOVIMIENTO',
    concepto: 'Ajuste recargo nocturno',
    motivo: 'Validacion controlada',
    valor_anterior: 150000,
    valor_nuevo: 175000,
    diferencia: 25000,
    movimiento_id: 40
  });

  assert.equal(parsed.movimiento_id, 40, 'valid create payload should parse');
  assert.equal(
    calculateNominaCorreccionDifference(parsed.valor_anterior, parsed.valor_nuevo),
    25000,
    'difference must be calculated by backend rule'
  );

  assert.equal(
    canTransitionNominaCorreccion('SOLICITADA', 'EN_REVISION'),
    true,
    'SOLICITADA -> EN_REVISION must be allowed'
  );
  assert.equal(
    canTransitionNominaCorreccion('EN_REVISION', 'ANULADA'),
    false,
    'EN_REVISION -> ANULADA must be blocked'
  );

  assert.throws(
    () => rechazarNominaCorreccionSchema.parse({ observacion_revision: '   ' }),
    /Too small|String must contain at least 1 character/,
    'rejecting a correction must require observation'
  );

  assert.throws(
    () =>
      createNominaCorreccionSchema.parse({
        periodo_id: 10,
        nomina_empleado_id: 20,
        vinculacion_id: 30,
        tipo_correccion: 'OTRO',
        concepto: 'Intento con estado manual',
        motivo: 'Validacion negativa',
        valor_anterior: 1,
        valor_nuevo: 2,
        estado: 'APROBADA'
      }),
    /Unrecognized key/,
    'create schema must reject manual estado field'
  );

  assert.throws(
    () => updateNominaCorreccionSchema.parse({ estado: 'APROBADA' }),
    /Unrecognized key/,
    'update schema must reject manual estado field'
  );

  for (const estado of ['APROBADA', 'APLICADA', 'RECHAZADA', 'ANULADA']) {
    assert.equal(
      NOMINA_CORRECCION_EDITABLE_STATES.includes(estado as never),
      false,
      `${estado} must not be editable`
    );
  }

  const currentPermissions = NOMINA_CORRECCION_PERMISSION_DEFINITIONS.map(
    (permission) => `${permission.modulo}.${permission.accion}`
  );

  assert.deepEqual(
    currentPermissions,
    requiredPermissions,
    'permission contract must remain stable'
  );
  assert.deepEqual(
    [...NOMINA_CORRECCION_AUDIT_ACTIONS],
    requiredAuditActions,
    'audit action contract must remain stable'
  );

  console.log('Nomina corrections contract checks passed.');
};

run();
