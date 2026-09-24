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
  const today = new Date().toISOString().slice(0, 10);
  const currentMonthPeriods = periodos
    .filter((periodo) => periodo.fecha_inicio <= today && periodo.fecha_fin >= today)
    .sort((left, right) => Number(right.activo) - Number(left.activo) || toTimestamp(right.created_at) - toTimestamp(left.created_at));
  if (currentMonthPeriods[0]) return currentMonthPeriods[0];

  return (
    [...periodos].sort((left, right) => {
      return (
        Number(right.activo) - Number(left.activo) ||
        toTimestamp(right.fecha_fin) - toTimestamp(left.fecha_fin) ||
        toTimestamp(right.fecha_inicio) - toTimestamp(left.fecha_inicio) ||
        toTimestamp(right.created_at) - toTimestamp(left.created_at)
      );
    })[0] ?? null
  );
}

/**
 * The only normalization boundary for the payroll period catalog.
 * IDs are strings at the UI boundary so URL/session values cannot create a
 * second representation of the selected period.
 */
export function normalizeNominaPeriods(periods: NominaPeriodoApi[]): NominaPeriodoApi[] {
  const canonical = new Map<string, NominaPeriodoApi>();

  for (const rawPeriod of periods) {
    const periodFlags = rawPeriod as NominaPeriodoApi & { residual?: boolean; es_residual?: boolean };
    if (rawPeriod.activo === false || rawPeriod.estado === "ANULADO" || periodFlags.residual === true || periodFlags.es_residual === true) {
      continue;
    }

    const period: NominaPeriodoApi = { ...rawPeriod, id: String(rawPeriod.id) };
    const key = [
      String(period.contrato_id ?? ""),
      period.fecha_inicio,
      period.fecha_fin,
      String(period.tipo_periodo ?? ""),
    ].join("|");
    const current = canonical.get(key);

    if (!current || compareCanonicalNominaPeriods(period, current) < 0) {
      canonical.set(key, period);
    }
  }

  const normalized = [...canonical.values()].sort((left, right) =>
    toTimestamp(right.fecha_inicio) - toTimestamp(left.fecha_inicio) ||
    toTimestamp(right.fecha_fin) - toTimestamp(left.fecha_fin) ||
    Number(right.id) - Number(left.id),
  );

  return normalized;
}

function compareCanonicalNominaPeriods(left: NominaPeriodoApi, right: NominaPeriodoApi) {
  return Number(right.activo) - Number(left.activo) ||
    toTimestamp(left.created_at) - toTimestamp(right.created_at) ||
    Number(left.id) - Number(right.id);
}

export function isNominaPeriodSelectorDisabled(
  periodos: NominaPeriodoApi[],
  periodsLoading: boolean,
) {
  return periodsLoading || periodos.length < 2;
}
