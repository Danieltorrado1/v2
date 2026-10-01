export type InstitutionMetric = {
  primaria: number | null;
  secundaria: number | null;
  total: number | null;
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function normalizeInstitutionMetric(value: unknown): InstitutionMetric {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { primaria: null, secundaria: null, total: value };
  }

  if (!value || typeof value !== 'object') {
    return { primaria: null, secundaria: null, total: null };
  }

  const metric = value as Record<string, unknown>;
  return {
    primaria: finiteNumber(metric.primaria ?? metric.preescolar_primaria),
    secundaria: finiteNumber(metric.secundaria),
    total: finiteNumber(metric.total),
  };
}

export function formatInstitutionNumber(value: unknown): string {
  const number = finiteNumber(value) ?? normalizeInstitutionMetric(value).total;
  return number === null ? 'Sin dato' : number.toLocaleString('es-CO');
}

export function canManageOperationalChange(user: { roles?: string[]; permissions?: string[] } | null | undefined): boolean {
  const roles = (user?.roles ?? []).map((role) => role.toUpperCase());
  const permissions = user?.permissions ?? [];
  return !roles.includes('GESTOR') && permissions.some((permission) =>
    ['nomina.movimientos.create', 'nomina.movimientos.update'].includes(permission),
  );
}
