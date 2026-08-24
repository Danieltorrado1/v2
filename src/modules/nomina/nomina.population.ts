import { compareDateStrings } from './nomina.calculator';

export interface NominaPopulationLink {
  fecha_fin: string | null;
  fecha_inicio: string;
  metodo_pago?: string | null;
  persona_id: string;
  tipo_vinculacion_codigo?: string | null;
  vinculacion_id: string;
}

export type NominaPopulationKind = 'LABORAL' | 'OPS' | 'OTRO';
export type NominaMetodoLiquidacion = 'ASISTENCIA' | 'CATEGORIA_SALARIAL' | 'MANUAL';

export type NominaMultipleLinkClassification =
  | 'VALIDA'
  | 'REINGRESO'
  | 'CONSECUTIVA'
  | 'SOLAPADA'
  | 'REQUIERE_REVISION';

const normalizeUpperToken = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeComparableNullable = (value: string | null | undefined): string | null => {
  const normalized = normalizeUpperToken(value);
  return normalized === null ? null : normalized.replace(/\s+/g, ' ');
};

const differenceInDays = (left: string, right: string): number => {
  const leftDate = new Date(`${left}T00:00:00.000Z`);
  const rightDate = new Date(`${right}T00:00:00.000Z`);
  return Math.round((rightDate.getTime() - leftDate.getTime()) / (24 * 60 * 60 * 1000));
};

export const intersectsNominaPeriodo = (
  fechaInicio: string,
  fechaFin: string | null | undefined,
  periodoInicio: string,
  periodoFin: string
): boolean => {
  const effectiveEnd = fechaFin ?? periodoFin;

  return (
    compareDateStrings(fechaInicio, periodoFin) <= 0 &&
    compareDateStrings(effectiveEnd, periodoInicio) >= 0
  );
};

export const classifyNominaPopulationKind = (input: {
  metodo_pago?: string | null;
  tipo_vinculacion_codigo?: string | null;
}): NominaPopulationKind => {
  const metodoPago = normalizeUpperToken(input.metodo_pago);
  const tipoVinculacionCodigo = normalizeUpperToken(input.tipo_vinculacion_codigo);

  if (metodoPago?.startsWith('OPS') || tipoVinculacionCodigo === 'OPS') {
    return 'OPS';
  }

  if (
    metodoPago === 'ASISTENCIA' ||
    metodoPago === 'SALARIO' ||
    tipoVinculacionCodigo === 'OL' ||
    tipoVinculacionCodigo === 'LABORAL'
  ) {
    return 'LABORAL';
  }

  return 'OTRO';
};

export const resolveNominaMetodoLiquidacion = (input: {
  metodo_pago?: string | null;
}): NominaMetodoLiquidacion => {
  const metodoPago = normalizeUpperToken(input.metodo_pago);

  if (metodoPago === 'ASISTENCIA') {
    return 'ASISTENCIA';
  }

  return 'CATEGORIA_SALARIAL';
};

const haveEquivalentEmploymentSignature = (
  left: NominaPopulationLink,
  right: NominaPopulationLink
): boolean => {
  return (
    normalizeComparableNullable(left.metodo_pago) === normalizeComparableNullable(right.metodo_pago) &&
    normalizeComparableNullable(left.tipo_vinculacion_codigo) ===
      normalizeComparableNullable(right.tipo_vinculacion_codigo) &&
    left.fecha_inicio === right.fecha_inicio &&
    (left.fecha_fin ?? null) === (right.fecha_fin ?? null)
  );
};

export const classifyNominaMultipleLinks = (
  links: NominaPopulationLink[],
  periodoInicio: string,
  periodoFin: string
): NominaMultipleLinkClassification => {
  const relevant = links
    .filter((link) => intersectsNominaPeriodo(link.fecha_inicio, link.fecha_fin, periodoInicio, periodoFin))
    .sort((left, right) => {
      const byStart = compareDateStrings(left.fecha_inicio, right.fecha_inicio);
      if (byStart !== 0) {
        return byStart;
      }

      const leftEnd = left.fecha_fin ?? '9999-12-31';
      const rightEnd = right.fecha_fin ?? '9999-12-31';
      const byEnd = compareDateStrings(leftEnd, rightEnd);
      if (byEnd !== 0) {
        return byEnd;
      }

      return Number(left.vinculacion_id) - Number(right.vinculacion_id);
    });

  if (relevant.length <= 1) {
    return 'VALIDA';
  }

  let hasSequentialGap = false;
  let hasImmediateSequence = false;

  for (let index = 0; index < relevant.length - 1; index += 1) {
    const current = relevant[index];
    const next = relevant[index + 1];
    if (!current || !next) {
      continue;
    }
    const currentEnd = current.fecha_fin ?? periodoFin;

    if (
      haveEquivalentEmploymentSignature(current, next) &&
      current.vinculacion_id !== next.vinculacion_id
    ) {
      return 'REQUIERE_REVISION';
    }

    if (compareDateStrings(next.fecha_inicio, currentEnd) <= 0) {
      return 'SOLAPADA';
    }

    const gapDays = differenceInDays(currentEnd, next.fecha_inicio);
    if (gapDays === 1) {
      hasImmediateSequence = true;
      continue;
    }

    if (gapDays > 1) {
      hasSequentialGap = true;
    }
  }

  if (hasSequentialGap) {
    return 'REINGRESO';
  }

  if (hasImmediateSequence) {
    return 'CONSECUTIVA';
  }

  return 'VALIDA';
};
