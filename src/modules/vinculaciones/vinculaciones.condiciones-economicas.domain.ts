export interface CondicionEconomicaVigencia {
  activo: boolean;
  id?: number;
  tipo_condicion: string;
  valor: number;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  vinculacion_id: number;
}

export interface CondicionEconomicaInput extends CondicionEconomicaVigencia {
  motivo: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const normalizedType = (value: string): string => value.trim().replace(/\s+/g, '_').toUpperCase();

export const validateCondicionEconomica = (input: CondicionEconomicaInput): CondicionEconomicaInput => {
  const tipo = normalizedType(input.tipo_condicion);
  if (!Number.isInteger(input.vinculacion_id) || input.vinculacion_id <= 0) throw new Error('VINCULACION_INVALIDA');
  if (!tipo) throw new Error('TIPO_CONDICION_REQUERIDO');
  if (!Number.isFinite(input.valor) || input.valor < 0) throw new Error('VALOR_CONDICION_INVALIDO');
  if (!ISO_DATE.test(input.vigencia_desde)) throw new Error('VIGENCIA_DESDE_INVALIDA');
  if (input.vigencia_hasta !== null && !ISO_DATE.test(input.vigencia_hasta)) throw new Error('VIGENCIA_HASTA_INVALIDA');
  if (input.vigencia_hasta !== null && input.vigencia_hasta < input.vigencia_desde) throw new Error('VIGENCIA_ECONOMICA_INVERTIDA');
  if (!input.motivo.trim()) throw new Error('MOTIVO_CONDICION_REQUERIDO');
  return { ...input, tipo_condicion: tipo, motivo: input.motivo.trim() };
};

export const vigenciasEconomicasSeSolapan = (
  left: Pick<CondicionEconomicaVigencia, 'vigencia_desde' | 'vigencia_hasta'>,
  right: Pick<CondicionEconomicaVigencia, 'vigencia_desde' | 'vigencia_hasta'>,
): boolean => {
  const leftEnd = left.vigencia_hasta ?? '9999-12-31';
  const rightEnd = right.vigencia_hasta ?? '9999-12-31';
  return left.vigencia_desde <= rightEnd && right.vigencia_desde <= leftEnd;
};

export const assertNoEconomicOverlap = (
  candidate: CondicionEconomicaVigencia,
  existing: CondicionEconomicaVigencia[],
): void => {
  const candidateType = normalizedType(candidate.tipo_condicion);
  const conflict = existing.some((item) =>
    item.activo &&
    item.id !== candidate.id &&
    item.vinculacion_id === candidate.vinculacion_id &&
    normalizedType(item.tipo_condicion) === candidateType &&
    vigenciasEconomicasSeSolapan(candidate, item)
  );
  if (conflict) throw new Error('VIGENCIA_ECONOMICA_SOLAPADA');
};

export const resolveCondicionEconomicaEnFecha = (
  rows: CondicionEconomicaVigencia[],
  vinculacionId: number,
  tipoCondicion: string,
  fecha: string,
): CondicionEconomicaVigencia | null => rows
  .filter((row) =>
    row.activo &&
    row.vinculacion_id === vinculacionId &&
    normalizedType(row.tipo_condicion) === normalizedType(tipoCondicion) &&
    row.vigencia_desde <= fecha &&
    (row.vigencia_hasta === null || row.vigencia_hasta >= fecha)
  )
  .sort((left, right) => right.vigencia_desde.localeCompare(left.vigencia_desde) || (right.id ?? 0) - (left.id ?? 0))[0] ?? null;

