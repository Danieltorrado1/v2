import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePeriodSelection, type IntegracionEventRow } from '../modules/integracion/integracion.service';

const baseEvent = (event_type: IntegracionEventRow['event_type'], periodo_id: string | null, empresa_id = '15'): IntegracionEventRow => ({
  id: '1', event_type, aggregate_type: 'vinculacion', aggregate_id: '100', empresa_id, contrato_id: '24', persona_id: '200', vinculacion_id: '100',
  effective_date: '2026-09-10', periodo_id, payload_before: null, payload_after: null, idempotency_key: 'test', status: 'PENDIENTE', attempts: 0,
  available_at: '', locked_at: null, locked_by: null, processed_at: null, last_error_code: null, last_error_message: null, created_at: '', updated_at: ''
});

const executor = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;
const period = (id: string, empresa_id = '15'): Record<string, string> => ({ id, empresa_id, contrato_id: '24', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', estado: 'ABIERTO' });

test('Nómina usa exactamente el periodo de origen validado', async () => {
  const result = await resolvePeriodSelection(baseEvent('ASISTENCIA_CAMBIADA', '6'), '2026-09-10', executor([period('6')]));
  assert.deepEqual(result.rows.map(row => row.id), ['6']);
  assert.equal(result.blockedReason, null);
});

test('Personal bloquea periodización duplicada o solapada', async () => {
  const result = await resolvePeriodSelection(baseEvent('ASIGNACION_OPERATIVA_CAMBIADA', null), '2026-09-10', executor([period('3'), period('4')]));
  assert.deepEqual(result.rows, []);
  assert.match(result.blockedReason ?? '', /PERIODIZACION_AMBIGUA/);
});

test('La resolución por Personal no acepta una empresa ajena', async () => {
  const result = await resolvePeriodSelection(baseEvent('ASIGNACION_OPERATIVA_CAMBIADA', null, '99'), '2026-09-10', executor([]));
  assert.deepEqual(result.rows, []);
  assert.equal(result.blockedReason, null);
});
