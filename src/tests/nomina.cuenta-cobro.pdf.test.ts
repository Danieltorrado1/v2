import assert from 'node:assert/strict';
import test from 'node:test';
import { numberToSpanishWords } from '../modules/nomina/cobertura.externos.service';

test('la cuenta de cobro convierte 227100 a letras correctamente', () => {
  assert.equal(
    `${numberToSpanishWords(227100)} PESOS M/CTE.`,
    'DOSCIENTOS VEINTISIETE MIL CIEN PESOS M/CTE.',
  );
});
