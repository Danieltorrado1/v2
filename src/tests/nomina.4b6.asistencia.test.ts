import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { markNominaAsistenciaSchema } from '../modules/nomina/nomina.schemas';

test('4B.6: marcar asistencia acepta el payload real de la cuadrícula', () => {
  assert.deepEqual(
    markNominaAsistenciaSchema.parse({
      vinculacion_id: '123',
      fecha: '2026-08-01',
      presente: true,
    }),
    { vinculacion_id: 123, fecha: '2026-08-01', presente: true },
  );
});

test('4B.6: marcar asistencia rechaza payload incompleto o claves desconocidas', () => {
  assert.throws(() => markNominaAsistenciaSchema.parse({ vinculacion_id: '123', fecha: '01/08/2026' }));
  assert.throws(() => markNominaAsistenciaSchema.parse({ vinculacion_id: '-1', fecha: '2026-08-01' }));
  assert.throws(() => markNominaAsistenciaSchema.parse({ vinculacion_id: '123', fecha: '2026-08-01', foo: 'bar' }));
});

test('4B.6: la revisión y la asistencia mantienen endpoints distintos', () => {
  const source = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'), 'utf8');
  assert.match(source, /updateRevisionOperativa\(periodId, employee\.id, "REVISADO"\)/);
  assert.match(source, /markNominaAsistencia\(periodId, employee\.vinculacion_id, date, shouldPresent\)/);
  assert.match(source, /Marcar asistencia/);
});
