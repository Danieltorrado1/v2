import test from "node:test";
import assert from "node:assert/strict";
import { matchesPlanillaFilters } from "./planillaOperativa.domain";

const row = {
  searchText: "ana 123 san juan colegio sede principal caa",
  municipio: "SAN JUAN DE ARAMA",
  institucion: "COLEGIO CENTRAL",
  sede: "SEDE PRINCIPAL",
  gestorId: "7",
  modalidad: "CAA",
  reviewState: "PENDIENTE",
  needsReview: false,
  noveltyCount: 0,
  hasInconsistencies: false,
};

const base = { query: "", municipio: "", institucion: "", sede: "", gestor: "", modalidad: "", review: "TODOS", events: "TODOS" };

test("los filtros de institución y sede son autónomos", () => {
  assert.equal(matchesPlanillaFilters(row, { ...base, institucion: "COLEGIO CENTRAL" }), true);
  assert.equal(matchesPlanillaFilters(row, { ...base, sede: "SEDE PRINCIPAL" }), true);
  assert.equal(matchesPlanillaFilters(row, { ...base, municipio: "OTRO" }), false);
});

test("los filtros incompatibles producen cero sin limpiar silenciosamente la selección", () => {
  assert.equal(matchesPlanillaFilters(row, { ...base, municipio: "SAN JUAN DE ARAMA", sede: "SEDE DISTINTA" }), false);
  assert.equal(matchesPlanillaFilters(row, { ...base, sede: "SEDE PRINCIPAL", modalidad: "CAA" }), true);
});
