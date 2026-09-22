import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const withFilters = (filters: Partial<typeof base>) => ({ ...base, ...filters });

test("los filtros de institucion y sede son autonomos", () => {
  assert.equal(matchesPlanillaFilters(row, { ...base, institucion: "COLEGIO CENTRAL" }), true);
  assert.equal(matchesPlanillaFilters(row, { ...base, sede: "SEDE PRINCIPAL" }), true);
  assert.equal(matchesPlanillaFilters(row, { ...base, municipio: "OTRO" }), false);
});

test("los filtros incompatibles producen cero sin limpiar silenciosamente la seleccion", () => {
  assert.equal(matchesPlanillaFilters(row, { ...base, municipio: "SAN JUAN DE ARAMA", sede: "SEDE DISTINTA" }), false);
  assert.equal(matchesPlanillaFilters(row, { ...base, sede: "SEDE PRINCIPAL", modalidad: "CAA" }), true);
});

test("cada faceta funciona de forma autonoma y las combinaciones conservan AND", () => {
  const cases = [
    withFilters({ municipio: "SAN JUAN DE ARAMA" }),
    withFilters({ institucion: "COLEGIO CENTRAL" }),
    withFilters({ sede: "SEDE PRINCIPAL" }),
    withFilters({ modalidad: "CAA" }),
    withFilters({ gestor: "7" }),
    withFilters({ municipio: "SAN JUAN DE ARAMA", institucion: "COLEGIO CENTRAL" }),
    withFilters({ municipio: "SAN JUAN DE ARAMA", sede: "SEDE PRINCIPAL" }),
    withFilters({ institucion: "COLEGIO CENTRAL", sede: "SEDE PRINCIPAL" }),
    withFilters({ municipio: "SAN JUAN DE ARAMA", institucion: "COLEGIO CENTRAL", sede: "SEDE PRINCIPAL" }),
  ];
  for (const filters of cases) assert.equal(matchesPlanillaFilters(row, filters), true, JSON.stringify(filters));
  assert.equal(matchesPlanillaFilters({ ...row, gestorId: 7 as unknown as string }, withFilters({ gestor: "7" })), true);
});

test("normaliza espacios, mayusculas y tildes al aplicar facetas", () => {
  assert.equal(matchesPlanillaFilters(row, withFilters({ municipio: " san juan   de arama " })), true);
  assert.equal(matchesPlanillaFilters({ ...row, institucion: "Instituci\u00f3n Central" }, withFilters({ institucion: "institucion central" })), true);
});

test("las opciones facetadas ignoran su propio filtro", () => {
  const active = withFilters({ municipio: "SAN JUAN DE ARAMA", sede: "SEDE PRINCIPAL" });
  assert.equal(matchesPlanillaFilters(row, { ...active, municipio: "" }), true);
  assert.equal(matchesPlanillaFilters(row, { ...active, sede: "" }), true);
});

test("limpiar y cambio de filtro reinician la pagina, y la persistencia exige periodo", () => {
  const source = readFileSync("FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx", "utf8");
  assert.match(source, /const clearFilters = \(\) =>/);
  assert.match(source, /setSortMode\("NOMBRE_ASC"\);/);
  assert.match(source, /setCurrentPage\(1\);/);
  assert.match(source, /persistedPlanillaFiltersMatchPeriod/);
});
