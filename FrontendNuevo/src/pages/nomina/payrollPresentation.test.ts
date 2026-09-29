import assert from "node:assert/strict";
import test from "node:test";
import { buildPayrollPresentation } from "./payrollPresentation";

test("presenta turnos internos una sola vez y fuera del IBC", () => {
  const result = buildPayrollPresentation({ salario: 1042205, transporte: 232488, recargos: 0, turnosInternos: 104220, otrosPagos: 0, deducciones: 83400 });
  assert.equal(result.totalDevengado, 1378913);
  assert.equal(result.neto, 1295513);
  assert.equal(result.turnosEnIbc, false);
});
