import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createActividadLaboralSchemaNotReadyError, validateActividadLaboralSchemaRows } from '../modules/vinculaciones/actividad-laboral.service';

const requiredPairs: Array<[string, string]> = [
  ['integracion_eventos', 'vinculacion_id'], ['integracion_eventos', 'event_type'], ['integracion_eventos', 'status'], ['integracion_eventos', 'effective_date'], ['integracion_eventos', 'periodo_id'], ['integracion_eventos', 'created_at'],
  ['integracion_evento_impactos', 'evento_id'], ['integracion_evento_impactos', 'periodo_id'], ['integracion_evento_impactos', 'estado'],
  ['nomina_periodos', 'id'], ['nomina_periodos', 'contrato_id'], ['nomina_periodos', 'fecha_inicio'], ['nomina_periodos', 'fecha_fin'], ['nomina_periodos', 'estado'],
  ['nomina_asistencia_diaria', 'periodo_id'], ['nomina_asistencia_diaria', 'vinculacion_id'], ['nomina_asistencia_diaria', 'fecha'], ['nomina_asistencia_diaria', 'estado_dia'], ['nomina_asistencia_diaria', 'activo'],
  ['nomina_novedades', 'periodo_id'], ['nomina_novedades', 'vinculacion_id'], ['nomina_novedades', 'tipo_novedad_id'], ['nomina_novedades', 'fecha_inicio'], ['nomina_novedades', 'fecha_fin'], ['nomina_novedades', 'activo'],
  ['nomina_tipos_novedad', 'id'], ['nomina_tipos_novedad', 'codigo_operativo'],
  ['nomina_movimientos', 'periodo_id'], ['nomina_movimientos', 'vinculacion_id'], ['nomina_movimientos', 'externo_id'], ['nomina_movimientos', 'valor_total'], ['nomina_movimientos', 'activo'],
  ['nomina_liquidaciones', 'periodo_id'], ['nomina_liquidaciones', 'vinculacion_id'], ['nomina_liquidaciones', 'estado'], ['nomina_liquidaciones', 'total_liquidacion'], ['nomina_liquidaciones', 'deducciones'], ['nomina_liquidaciones', 'salario_base'],
  ['nomina_revision_operativa', 'periodo_id'], ['nomina_revision_operativa', 'vinculacion_id'], ['nomina_revision_operativa', 'estado_revision']
];

const requiredRows = requiredPairs.map(([table_name, column_name]) => ({ table_name, column_name }));

test('esquema ausente se identifica sin exponer SQL y usa el contrato 503', () => {
  const missing = validateActividadLaboralSchemaRows([]);
  assert.ok(missing.includes('integracion_eventos.vinculacion_id'));
  assert.ok(missing.includes('nomina_liquidaciones.total_liquidacion'));
  assert.equal(missing.some((item) => item.includes('SELECT') || item.includes('FROM')), false);
  const error = createActividadLaboralSchemaNotReadyError(missing);
  assert.equal(error.statusCode, 503);
  assert.equal(error.code, 'INTEGRATION_SCHEMA_NOT_READY');
  assert.equal(error.details, undefined);
});

test('esquema presente no tiene faltantes para actividad laboral', () => {
  assert.deepEqual(validateActividadLaboralSchemaRows(requiredRows), []);
});
