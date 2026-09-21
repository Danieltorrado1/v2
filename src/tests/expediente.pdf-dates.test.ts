import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHvDateDDMMYYYY, inclusiveCalendarDays } from '../modules/expedientes/expedientes.service';

test('HV normaliza fechas calendario sin timezone', () => {
  assert.equal(formatHvDateDDMMYYYY('2026-09-16'), '16-09-2026');
  assert.equal(formatHvDateDDMMYYYY(new Date('2026-09-16T00:00:00.000Z')), '16-09-2026');
});
test('HV calcula días calendario inclusivos', () => {
  assert.equal(inclusiveCalendarDays('2026-09-16', '2026-09-20'), 5);
  assert.equal(inclusiveCalendarDays('2026-09-20', '2026-09-20'), 1);
  assert.equal(inclusiveCalendarDays('2026-09-01', '2026-09-30'), 30);
});
