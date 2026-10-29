import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { buildPlanillaOperativaXlsx, planillaDates, planillaTypeRequirements } from '../modules/nomina/planilla-operativa.xlsx';
import { syntheticSnapshot, syntheticType } from './fixtures/planilla-operativa.synthetic';

function read(snapshot = syntheticSnapshot()) {
  const buffer = buildPlanillaOperativaXlsx(snapshot, 'firma-sintetica');
  const zip = XLSX.CFB.read(buffer, { type: 'buffer' });
  const xml = (name: string) => Buffer.from(XLSX.CFB.find(zip, '/' + name).content).toString('utf8');
  return { buffer, book: XLSX.read(buffer, { type: 'buffer', cellNF: true }), xml };
}
test('corte exacto 26–25 incluyendo bisiesto y cambio anual', () => {
  assert.equal(planillaDates('2026-10-26', '2026-11-25').length, 31);
  assert.equal(planillaDates('2024-02-26', '2024-03-25').length, 29);
  assert.equal(planillaDates('2026-02-26', '2026-03-25').length, 28);
  assert.equal(planillaDates('2026-12-26', '2027-01-25').length, 31);
  assert.throws(() => planillaDates('2026-11-01', '2026-11-25'));
});
test('una hoja visible municipal, una fila por persona, identidad texto y calendario completo', () => {
  const { buffer, book } = read();
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const visible = book.Workbook!.Sheets!.filter(s => !s.Hidden);
  assert.deepEqual(visible.map(s => s.name), ['Municipio sintético']);
  const sheet = book.Sheets[visible[0]!.name!]!;
  assert.equal(XLSX.utils.decode_range(sheet['!ref']!).e.r + 1, 8);
  assert.equal(sheet.E7.v, '00001234'); assert.equal(sheet.E7.t, 's');
  assert.equal(sheet.AM7.v, '9007199254740993'); assert.equal(sheet.AM7.t, 's');
  assert.equal(sheet.F8.t, 's'); assert.equal(sheet.F8.f, undefined);
  assert.equal(sheet.H6.v, '2026-10-26'); assert.equal(sheet.AL6.v, '2026-11-25');
  assert.ok(sheet['!cols'] === undefined || sheet['!cols']![38]?.hidden);
});
test('edicion directa sin formulas ni controles y originales independientes', () => {
  const { xml, book } = read();
  const sheet = xml('xl/worksheets/sheet1.xml');
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.doesNotMatch(sheet, /ACTIVAR|APLICA|Corregir|Volver/);
  assert.match(sheet, /r="J8"[^>]*s="2"/);
  assert.match(sheet, /r="H8"[^>]*s="0"/); // before entry
  assert.match(sheet, /r="H7"[^>]*s="2"/); // manual edit cannot delete the separate undated original
  assert.equal(book.Sheets['Municipio sintético']!.I7.v, 'PNR + TA [DET]');
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Detalle_novedades!).length, 4);
  const original = XLSX.utils.sheet_to_json(book.Sheets._Original!);
  assert.equal(original.length, 62);
  assert.equal(book.Workbook!.Sheets!.find(s => s.name === '_Base')!.Hidden, 2);
});
test('validacion con catalogo activo real, proteccion y filtros OOXML', () => {
  const { xml, book } = read(); const sheet = xml('xl/worksheets/sheet1.xml');
  assert.match(sheet, /sqref="H7:AL8"/); assert.match(sheet, /<formula1>MarcasDiarias<\/formula1>/);
  assert.match(sheet, /errorStyle="stop"/); assert.match(sheet, /allowBlank="1"/);
  assert.match(sheet, /<sheetProtection[^>]*autoFilter="0"/);
  assert.match(sheet, /<pane xSplit="6" ySplit="6"/);
  assert.match(sheet, /<autoFilter ref="A6:AO8"/);
  assert.match(xml('xl/styles.xml'), /<protection locked="0"/);
  assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets._Listas!, { header: 1 }).slice(1), [['PRESENTE'], ['PENDIENTE'], ['PNR'], ['TA'], ['DCO']]);
});
test('ningun valor economico en ZIP ni base; detalle y firma conservados', () => {
  const { book, xml } = read();
  const strings = book.SheetNames.map((_, i) => xml(`xl/worksheets/sheet${i + 1}.xml`)).join('');
  assert.doesNotMatch(strings, /999999999|valor_manual|neto_pagar|salario_base|dias_pagados/);
  assert.match(strings, /firma-sintetica/); assert.match(strings, /evento_canonico_id/);
});
test('defensa adicional contra identidad territorial ausente y detalles de personal ajeno', () => {
  const s = syntheticSnapshot(); s.trabajadores[0]!.municipio_id = undefined;
  assert.throws(() => read(s), { code: 'PLANILLA_AMBIGUOUS_SCOPE' });
  const s2 = syntheticSnapshot(); s2.novedades[0]!.nomina_empleado_id = 'ajeno';
  assert.throws(() => read(s2), { code: 'PLANILLA_ACCESS_DENIED' });
  const s3 = syntheticSnapshot(); s3.trabajadores[1]!.persona_id = s3.trabajadores[0]!.persona_id;
  assert.throws(() => read(s3), { code: 'PLANILLA_AMBIGUOUS_SCOPE' });
});
test('nombres municipales seguros, unicos, cortos e independientes de sus IDs', () => {
  const s = syntheticSnapshot(); s.trabajadores[0]!.municipio = 'Norte/Sur';
  s.trabajadores[1]!.municipio_id = '2'; s.trabajadores[1]!.municipio = 'Norte:Sur';
  const { book } = read(s); const visible = book.Workbook!.Sheets!.filter(s => !s.Hidden);
  assert.equal(visible.length, 2); assert.notEqual(visible[0]!.name, visible[1]!.name);
  assert.ok(visible.every(s => s.name!.length <= 31 && !/[\\/?*\[\]:]/.test(s.name!)));
});
test('requisitos especiales no homogeneizan novedades ni confunden receso con vacaciones', () => {
  assert.match(planillaTypeRequirements(syntheticType('1', 'TA')), /turno, reemplazante/);
  assert.match(planillaTypeRequirements(syntheticType('2', 'X', { requiere_horas: true })), /Horas/);
  assert.doesNotMatch(planillaTypeRequirements(syntheticType('3', 'X')), /Horas/);
});
