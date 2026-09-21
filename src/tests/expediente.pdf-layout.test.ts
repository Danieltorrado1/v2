import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHvRowHeight, formatHvDateDDMMYYYY, inclusiveCalendarDays } from '../modules/expedientes/expedientes.service';

test('HV tabla calcula una sola altura por fila', () => {
  const rowY = 200;
  const cells = ['CONSORCIO PAE META-26', 'MANIPULADOR(A) DE ALIMENTOS', '16-09-2026 – Actual', '5'];
  const heights = cells.map((value, index) => index === 1 ? 30 : 18);
  const rowHeight = calculateHvRowHeight(heights);
  assert.equal(rowHeight, 30);
  assert.equal(rowY, 200);
  assert.equal(rowY + rowHeight, 230);
});

test('HV normaliza fechas y calcula días inclusivos', () => {
  assert.equal(formatHvDateDDMMYYYY('2026-09-16'), '16-09-2026');
  assert.equal(inclusiveCalendarDays('2026-09-16', '2026-09-20'), 5);
  assert.equal(inclusiveCalendarDays('2026-09-20', '2026-09-20'), 1);
  assert.equal(inclusiveCalendarDays('2026-09-01', '2026-09-30'), 30);
});
