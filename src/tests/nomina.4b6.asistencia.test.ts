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

test('4B.6: clic directo usa una sola escritura, mantiene menú avanzado y evita duplicados rápidos', () => {
  const source = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'), 'utf8');
  assert.match(source, /pendingAttendanceRef/);
  assert.match(source, /if \(pendingAttendanceRef\.current\.has\(key\)\)/);
  assert.match(source, /void toggleAttendance\(employee, date\);/);
  assert.match(source, /onContextMenu=\{/);
  assert.match(source, /onDoubleClick=\{/);
  assert.doesNotMatch(source, /const wasSelected = selected\?\.employee\.id === employee\.id && selected\.date === date/);
});

test('4B.6: la celda muestra feedback por guardado y el check confirmado no depende de otra solicitud', () => {
  const source = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'), 'utf8');
  const css = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css'), 'utf8');
  assert.match(source, /isPendingAttendance && !isPresent/);
  assert.match(source, /op-attendance-pending-mark/);
  assert.match(source, /mergeAttendance\(current, nextItem, !shouldPresent\)/);
  assert.match(css, /\.op-attendance-pending-mark/);
  assert.match(css, /\.op-cell\.pending-attendance/);
});
