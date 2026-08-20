import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parseWorkbookRows } from '../modules/cobertura/cobertura.focalizacion.service';

test('parser productivo reconoce el XLSX oficial completo y su vigencia', () => {
  const parsed = parseWorkbookRows(readFileSync(path.resolve('data/focalizacion-agosto-2026.xlsx')));
  assert.equal(parsed.rows.length, 687);
  assert.deepEqual(parsed.fechaDetectada, { fecha_inicio_vigencia: '2026-08-01', fecha_fin_vigencia: '2026-08-31' });
  assert.equal(parsed.rows[0]?.consecutivo, '15000600093403');
  assert.equal(parsed.rows[0]?.modalidad, 'CAA');
});
