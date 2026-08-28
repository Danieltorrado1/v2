import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { getColombianCalendarDay, getColombianHoliday } from "./colombiaHolidays";

describe("calendario nacional de Colombia", () => {
  it("resuelve festivos fijos y fines de semana sin depender del año", () => {
    assert.equal(getColombianHoliday("2026-05-01"), "Día del Trabajo");
    assert.equal(getColombianCalendarDay("2026-08-29").isSaturday, true);
    assert.equal(getColombianCalendarDay("2026-08-30").isSunday, true);
  });

  it("traslada festivos de Ley Emiliani al lunes", () => {
    assert.equal(getColombianHoliday("2026-01-12"), "Día de los Reyes Magos");
    assert.equal(getColombianHoliday("2026-11-16"), "Independencia de Cartagena");
    assert.equal(getColombianHoliday("2025-01-06"), "Día de los Reyes Magos");
  });

  it("resuelve festivos dependientes de Pascua y conserva años bisiestos", () => {
    assert.equal(getColombianHoliday("2026-04-02"), "Jueves Santo");
    assert.equal(getColombianHoliday("2026-04-03"), "Viernes Santo");
    assert.equal(getColombianHoliday("2024-03-28"), "Jueves Santo");
    assert.equal(getColombianHoliday("2024-02-29"), null);
  });

  it("expone texto identificable para la celda sin cambiar su semántica operativa", () => {
    const day = getColombianCalendarDay("2026-11-16");
    assert.equal(day.className, "is-holiday");
    assert.match(day.tooltip, /Festivo: Independencia de Cartagena/);
  });
});
