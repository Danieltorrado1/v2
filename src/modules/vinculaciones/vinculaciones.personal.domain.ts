export type CoberturaConteoEstado = 'COMPLETA' | 'DEFICIT' | 'EXCESO' | 'SIN_REGLA';
export type LicitationQuotaEstado = 'CUMPLE' | 'DEFICIT' | 'EXCESO';

export interface VigenciaRange {
  desde: string;
  hasta: string | null;
}

export interface CoverageDelta {
  asignadas: number;
  diferencia: number;
  estado: CoberturaConteoEstado;
  requeridas: number;
}

export interface LicitacionQuotaDelta {
  acreditadas: number;
  diferencia: number;
  estado: LicitationQuotaEstado;
  requeridas: number;
}

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const toEpochDay = (value: string): number => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  return parsed;
};

export const looksLikeManipuladoraCargo = (nombreCargo: string | null | undefined): boolean => {
  if (!nombreCargo) {
    return false;
  }

  const normalized = normalizeText(nombreCargo);
  return normalized.includes('manipulador') || normalized.includes('manipuladora');
};

export const validateVigenciaRange = (range: VigenciaRange): void => {
  if (!range.hasta) {
    return;
  }

  if (toEpochDay(range.hasta) < toEpochDay(range.desde)) {
    throw new Error('vigencia_hasta must be greater than or equal to vigencia_desde');
  }
};

export const rangesOverlap = (left: VigenciaRange, right: VigenciaRange): boolean => {
  validateVigenciaRange(left);
  validateVigenciaRange(right);

  const leftStart = toEpochDay(left.desde);
  const leftEnd = left.hasta ? toEpochDay(left.hasta) : Number.POSITIVE_INFINITY;
  const rightStart = toEpochDay(right.desde);
  const rightEnd = right.hasta ? toEpochDay(right.hasta) : Number.POSITIVE_INFINITY;

  return leftStart <= rightEnd && rightStart <= leftEnd;
};

export const buildCoverageDelta = (
  requeridas: number | null,
  asignadas: number
): CoverageDelta => {
  if (requeridas === null) {
    return {
      requeridas: 0,
      asignadas,
      diferencia: asignadas,
      estado: 'SIN_REGLA'
    };
  }

  const diferencia = Number((asignadas - requeridas).toFixed(6));

  return {
    requeridas,
    asignadas,
    diferencia,
    estado:
      diferencia === 0
        ? 'COMPLETA'
        : diferencia < 0
          ? 'DEFICIT'
          : 'EXCESO'
  };
};

export const buildLicitacionQuotaDelta = (
  requeridas: number,
  acreditadas: number
): LicitacionQuotaDelta => {
  const diferencia = acreditadas - requeridas;

  return {
    requeridas,
    acreditadas,
    diferencia,
    estado: diferencia === 0 ? 'CUMPLE' : diferencia < 0 ? 'DEFICIT' : 'EXCESO'
  };
};

export const deriveCumpleRequisitosState = (input: {
  checklistCumplimientoPorcentaje?: number | null;
  checklistTieneConfiguracion?: boolean | null;
  cumpleRequisitosExplicit?: boolean | null;
}): 'CUMPLE' | 'NO_CUMPLE' | 'PENDIENTE' => {
  if (input.cumpleRequisitosExplicit === true) {
    return 'CUMPLE';
  }

  if (input.cumpleRequisitosExplicit === false) {
    return 'NO_CUMPLE';
  }

  if (!input.checklistTieneConfiguracion) {
    return 'PENDIENTE';
  }

  if ((input.checklistCumplimientoPorcentaje ?? 0) >= 100) {
    return 'CUMPLE';
  }

  return 'PENDIENTE';
};
