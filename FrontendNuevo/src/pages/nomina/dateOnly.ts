const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeDateOnly(value: string | null | undefined) {
  const candidate = value?.trim().slice(0, 10) ?? "";
  return DATE_ONLY_PATTERN.test(candidate) ? candidate : null;
}

export function parseDateOnly(value: string | null | undefined) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  },
) {
  const date = parseDateOnly(value);
  if (!date) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CO", options).format(date);
}

export function formatDateOnlyRange(
  start: string | null | undefined,
  end: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  },
) {
  if (!start || !end) {
    return "Rango no disponible";
  }

  return `${formatDateOnly(start, options)} - ${formatDateOnly(end, options)}`;
}

export function addDaysToDateOnly(value: string, days: number) {
  const date = parseDateOnly(value);
  if (!date) {
    return value;
  }

  const shifted = new Date(date.getTime() + days * DAY_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateOnlyTimestamp(value: string | null | undefined) {
  return parseDateOnly(value)?.getTime() ?? 0;
}

export function todayDateOnly(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}