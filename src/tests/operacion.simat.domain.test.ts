import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { SIMAT_HEADERS, deduplicationKey, parseSimatWorkbook, summarizeRows } from '../modules/operacion/operacion.simat.domain';

test('SIMAT exige y conserva todos los encabezados fuente', () => {
  const row = Object.fromEntries(SIMAT_HEADERS.map((header, index) => [header, index === 18 ? 'PER-1' : index === 19 ? '123' : 'x']));
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([row]), 'SIMAT');
  const parsed = parseSimatWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.errors.length, 0); assert.equal(parsed.rows[0]?.source_data['SISBEN IV'], 'x'); assert.equal(parsed.headers.length, SIMAT_HEADERS.length);
});
test('deduplicación prioriza PER_ID y luego documento, nunca nombre', () => {
  const base = { source_row: 2, source_data: {} } as Record<string, unknown> & { source_row: number; source_data: Record<string, unknown> };
  assert.equal(deduplicationKey({ ...base, PERID: 'P1', ANO: '2026' }), 'PER_ID|P1|2026');
  assert.equal(deduplicationKey({ ...base, DOC: '9', ANO: '2026' }), 'DOC|9|2026');
  assert.equal(summarizeRows([{ ...base, DOC: '9', ANO: '2026' }, { ...base, DOC: '9', ANO: '2026', source_row: 3 }]).duplicadas, 1);
});
