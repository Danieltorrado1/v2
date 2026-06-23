// Helpers defensivos para leer payloads de API con forma incierta o anidada,
// sin que un campo ausente, nulo o renombrado rompa la UI.

export function getNested(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function getNumber(obj: unknown, path: string[]): number | null {
  const value = getNested(obj, path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getString(obj: unknown, path: string[]): string | null {
  const value = getNested(obj, path);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getArray<T = unknown>(obj: unknown, path: string[]): T[] {
  const value = getNested(obj, path);
  return Array.isArray(value) ? (value as T[]) : [];
}

// Intenta varias rutas candidatas (por si el backend usa otro nombre de campo).
export function firstNumber(obj: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getNumber(obj, path);
    if (value !== null) return value;
  }
  return null;
}

export function firstString(obj: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    const value = getString(obj, path);
    if (value !== null) return value;
  }
  return null;
}

export function fmtNum(value: number | null): string | undefined {
  if (value === null) return undefined;
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

export function fmtPercent(value: number | null): string | undefined {
  return value === null ? undefined : `${Math.round(value)}%`;
}

export function fmtCurrency(value: number | null): string | undefined {
  if (value === null) return undefined;
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

// Acepta "YYYY-MM-DD" o timestamps ISO ("YYYY-MM-DDTHH:mm:ss...") sin lanzar.
export function fmtDateLoose(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const monthIndex = parseInt(match[2], 10) - 1;
  return months[monthIndex] ? `${match[3]} ${months[monthIndex]} ${match[1]}` : value;
}
