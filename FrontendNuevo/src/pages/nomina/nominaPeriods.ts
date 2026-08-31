import type { NominaPeriodoApi } from "../../types/nomina.types";
import { dateOnlyTimestamp, normalizeDateOnly } from "./dateOnly";

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const normalizedDateOnly = normalizeDateOnly(value);
  const timestamp = normalizedDateOnly ? dateOnlyTimestamp(normalizedDateOnly) : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function pickDefaultNominaPeriod(periodos: NominaPeriodoApi[]) {
  const activePeriod = periodos.find((periodo) => periodo.activo);
  if (activePeriod) {
    return activePeriod;
  }

  return (
    [...periodos].sort((left, right) => {
      return (
        toTimestamp(right.fecha_fin) - toTimestamp(left.fecha_fin) ||
        toTimestamp(right.fecha_inicio) - toTimestamp(left.fecha_inicio) ||
        toTimestamp(right.created_at) - toTimestamp(left.created_at)
      );
    })[0] ?? null
  );
}
