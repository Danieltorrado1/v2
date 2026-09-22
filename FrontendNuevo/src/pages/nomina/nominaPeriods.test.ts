import assert from "node:assert/strict";
import test from "node:test";
import type { NominaPeriodoApi } from "../../types/nomina.types";
import { normalizeNominaPeriods } from "./nominaPeriods";

const period = (overrides: Partial<NominaPeriodoApi>): NominaPeriodoApi => ({
  id: "3",
  contrato_id: "24",
  nombre_periodo: "SEPTIEMBRE 2026",
  tipo_periodo: "MENSUAL",
  fecha_inicio: "2026-08-26",
  fecha_fin: "2026-09-25",
  requiere_asistencia: true,
  estado: "ABIERTO",
  activo: true,
  created_at: "2026-08-26T00:00:00.000Z",
  contrato: null,
  ...overrides,
});

test("normaliza período canónico: excluye residual inactivo y deduplica por identidad completa", () => {
  const result = normalizeNominaPeriods([
    period({ id: 3 }),
    period({ id: 4, activo: false }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "3");
  assert.equal(result[0]?.fecha_inicio, "2026-08-26");
  assert.equal(result[0]?.fecha_fin, "2026-09-25");
});

test("normaliza IDs number/string sin reinsertar el período seleccionado", () => {
  const result = normalizeNominaPeriods([
    period({ id: 3 }),
    period({ id: "3", activo: true }),
  ]);

  assert.deepEqual(result.map((item) => String(item.id)), ["3"]);
});

test("mantiene períodos históricos especiales cuando cambia tipo_periodo", () => {
  const result = normalizeNominaPeriods([
    period({ id: 3, tipo_periodo: "MENSUAL" }),
    period({ id: 8, tipo_periodo: "ESPECIAL" }),
  ]);

  assert.deepEqual(result.map((item) => item.id).sort(), ["3", "8"]);
});

test("es idempotente frente a doble fetch/render", () => {
  const apiResult = [period({ id: 3 }), period({ id: 4, activo: false })];
  const once = normalizeNominaPeriods(apiResult);
  const twice = normalizeNominaPeriods([...once, ...once]);

  assert.deepEqual(twice, once);
});
