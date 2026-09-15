import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTurnosConsolidado } from '../modules/nomina/nomina.exporter';

test('consolida varios turnos de una persona en la misma modalidad', () => {
  const result = buildTurnosConsolidado([
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'EXTERNO', modalidad: 'CAA', cantidad: 2, valor_total: 100 },
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'EXTERNO', modalidad: 'CAA', cantidad: 3, valor_total: 150 }
  ]);
  assert.deepEqual(result.rows, [{ 'CÉDULA REEMPLAZANTE': '1', 'NOMBRE REEMPLAZANTE': 'ANA', 'TIPO REEMPLAZANTE': 'EXTERNO', CAA: 5, 'TOTAL TURNOS': 5, 'TOTAL A PAGAR': 250 }]);
});

test('mantiene una fila por persona y tipo con modalidades dinamicas', () => {
  const result = buildTurnosConsolidado([
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'INTERNO', modalidad: 'CAA', cantidad: 2, valor_total: 100 },
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'INTERNO', modalidad: 'RI', cantidad: 4, valor_total: 400 },
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'EXTERNO', modalidad: 'CAA', cantidad: 1, valor_total: 80 },
    { documento_reemplazante: '2', nombre_reemplazante: 'BEA', tipo_reemplazante: 'EXTERNO', modalidad: 'NUEVA', cantidad: 3, valor_total: 210 }
  ]);
  assert.deepEqual(result.headers, ['CÉDULA REEMPLAZANTE', 'NOMBRE REEMPLAZANTE', 'TIPO REEMPLAZANTE', 'CAA', 'RI', 'NUEVA', 'TOTAL TURNOS', 'TOTAL A PAGAR']);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows[0], { 'CÉDULA REEMPLAZANTE': '1', 'NOMBRE REEMPLAZANTE': 'ANA', 'TIPO REEMPLAZANTE': 'INTERNO', CAA: 2, RI: 4, NUEVA: 0, 'TOTAL TURNOS': 6, 'TOTAL A PAGAR': 500 });
  assert.deepEqual(result.rows[1], { 'CÉDULA REEMPLAZANTE': '1', 'NOMBRE REEMPLAZANTE': 'ANA', 'TIPO REEMPLAZANTE': 'EXTERNO', CAA: 1, RI: 0, NUEVA: 0, 'TOTAL TURNOS': 1, 'TOTAL A PAGAR': 80 });
});

test('la suma consolidada cuadra cantidades y valor total del detalle', () => {
  const movements = [
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'EXTERNO', modalidad: 'CAA', cantidad: 2, valor_total: 100 },
    { documento_reemplazante: '1', nombre_reemplazante: 'ANA', tipo_reemplazante: 'EXTERNO', modalidad: 'RI', cantidad: 4, valor_total: 400 },
    { documento_reemplazante: '2', nombre_reemplazante: 'BEA', tipo_reemplazante: 'INTERNO', modalidad: 'CAA', cantidad: 3, valor_total: 210 }
  ];
  const result = buildTurnosConsolidado(movements);
  assert.equal(result.rows.reduce((sum, row) => sum + Number(row['TOTAL TURNOS']), 0), movements.reduce((sum, row) => sum + row.cantidad, 0));
  assert.equal(result.rows.reduce((sum, row) => sum + Number(row['TOTAL A PAGAR']), 0), movements.reduce((sum, row) => sum + row.valor_total, 0));
});
