import { AppError } from '../../utils/AppError';
import { AfectaConcepto, TipoNovedad } from './nomina.schemas';

export interface DateRange {
  end: string;
  start: string;
}

export interface PayrollBaseInput {
  auxilioTransporte: number;
  diasConTransporte: number;
  diasLiquidados: number;
  salarioBase: number;
}

export interface PayrollNoveltyImpact {
  adiciones: number;
  deducciones: number;
  transporte: number;
}

export interface PayrollCalculationResult {
  auxilio_transporte_base: number;
  deduccion_pension: number;
  deduccion_salud: number;
  dias_con_transporte: number;
  dias_liquidados: number;
  devengado_salario: number;
  devengado_transporte: number;
  neto_pagar: number;
  total_adiciones: number;
  total_deducciones: number;
  total_devengado: number;
  valor_dia_salario: number;
  valor_dia_transporte: number;
}

const roundToCurrency = (value: number): number => {
  return Number(value.toFixed(2));
};

const toDate = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid date value', 400, 'INVALID_DATE', { value });
  }

  return date;
};

export const compareDateStrings = (left: string, right: string): number => {
  return toDate(left).getTime() - toDate(right).getTime();
};

export const maxDateString = (left: string, right: string): string => {
  return compareDateStrings(left, right) >= 0 ? left : right;
};

export const minDateString = (left: string, right: string): string => {
  return compareDateStrings(left, right) <= 0 ? left : right;
};

export const inclusiveDaysBetween = (start: string, end: string): number => {
  const startDate = toDate(start);
  const endDate = toDate(end);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay) + 1;
};

export const calculateDaysLiquidados = (
  periodo: DateRange,
  fechaInicioVinculacion: string,
  fechaFinVinculacion?: string | null
): number => {
  const effectiveStart = maxDateString(periodo.start, fechaInicioVinculacion);
  const effectiveEnd = fechaFinVinculacion
    ? minDateString(periodo.end, fechaFinVinculacion)
    : periodo.end;

  if (compareDateStrings(effectiveStart, effectiveEnd) > 0) {
    return 0;
  }

  return inclusiveDaysBetween(effectiveStart, effectiveEnd);
};

export const calculateNovedadOverlapDays = (
  periodo: DateRange,
  novedadStart?: string | null,
  novedadEnd?: string | null
): { overlapDays: number; totalNoveltyDays: number } => {
  if (!novedadStart && !novedadEnd) {
    return {
      overlapDays: inclusiveDaysBetween(periodo.start, periodo.end),
      totalNoveltyDays: inclusiveDaysBetween(periodo.start, periodo.end)
    };
  }

  const start = novedadStart ?? novedadEnd ?? periodo.start;
  const end = novedadEnd ?? novedadStart ?? periodo.end;

  if (compareDateStrings(start, end) > 0) {
    throw new AppError(
      'Novedad end date must be greater than or equal to start date',
      400,
      'NOVEDAD_INVALID_RANGE'
    );
  }

  const overlapStart = maxDateString(periodo.start, start);
  const overlapEnd = minDateString(periodo.end, end);

  if (compareDateStrings(overlapStart, overlapEnd) > 0) {
    return {
      overlapDays: 0,
      totalNoveltyDays: inclusiveDaysBetween(start, end)
    };
  }

  return {
    overlapDays: inclusiveDaysBetween(overlapStart, overlapEnd),
    totalNoveltyDays: inclusiveDaysBetween(start, end)
  };
};

export const calculateNoveltyImpact = (input: {
  afecta: AfectaConcepto;
  dias?: number | null;
  fechaFin?: string | null;
  fechaInicio?: string | null;
  horas?: number | null;
  periodo: DateRange;
  tipo: TipoNovedad;
  valor: number;
}): PayrollNoveltyImpact => {
  const overlap = calculateNovedadOverlapDays(
    input.periodo,
    input.fechaInicio,
    input.fechaFin
  );

  if (overlap.overlapDays <= 0) {
    return {
      adiciones: 0,
      deducciones: 0,
      transporte: 0
    };
  }

  let prorateFactor = overlap.overlapDays / overlap.totalNoveltyDays;

  if (input.dias && input.dias > 0) {
    prorateFactor = Math.min(prorateFactor, overlap.overlapDays / input.dias);
  }

  if (input.horas && input.horas > 0) {
    prorateFactor = Math.min(prorateFactor, 1);
  }

  const proportionalValue = roundToCurrency(input.valor * prorateFactor);
  const salaryPortion = input.afecta === 'TRANSPORTE' ? 0 : proportionalValue;
  const transportPortion = input.afecta === 'SALARIO' ? 0 : proportionalValue;

  if (input.tipo === 'ADICION') {
    return {
      adiciones: salaryPortion,
      deducciones: 0,
      transporte: transportPortion
    };
  }

  return {
    adiciones: 0,
    deducciones: salaryPortion + transportPortion,
    transporte: input.afecta === 'TRANSPORTE' || input.afecta === 'AMBOS' ? -transportPortion : 0
  };
};

export const calculatePayrollValues = (
  base: PayrollBaseInput,
  noveltyImpacts: PayrollNoveltyImpact[]
): PayrollCalculationResult => {
  const salarioBase = Math.max(0, base.salarioBase);
  const auxilioTransporte = Math.max(0, base.auxilioTransporte);
  const diasLiquidados = Math.max(0, base.diasLiquidados);
  const diasConTransporte = Math.max(0, Math.min(base.diasConTransporte, diasLiquidados));
  const valorDiaSalario = roundToCurrency(salarioBase / 30);
  const valorDiaTransporte = roundToCurrency(auxilioTransporte / 30);
  const devengadoSalario = roundToCurrency(valorDiaSalario * diasLiquidados);
  const auxilioTransporteBase = roundToCurrency(valorDiaTransporte * diasConTransporte);

  const noveltyTotals = noveltyImpacts.reduce(
    (accumulator, impact) => {
      accumulator.adiciones += impact.adiciones;
      accumulator.deducciones += impact.deducciones;
      accumulator.transporte += impact.transporte;
      return accumulator;
    },
    {
      adiciones: 0,
      deducciones: 0,
      transporte: 0
    }
  );

  const devengadoTransporte = roundToCurrency(
    Math.max(0, auxilioTransporteBase + noveltyTotals.transporte)
  );
  const salud = roundToCurrency(devengadoSalario * 0.04);
  const pension = roundToCurrency(devengadoSalario * 0.04);
  const totalAdiciones = roundToCurrency(Math.max(0, noveltyTotals.adiciones));
  const totalDevengado = roundToCurrency(
    devengadoSalario + devengadoTransporte + totalAdiciones
  );
  const totalDeducciones = roundToCurrency(
    salud + pension + Math.max(0, noveltyTotals.deducciones)
  );
  const netoPagar = roundToCurrency(totalDevengado - totalDeducciones);

  return {
    valor_dia_salario: valorDiaSalario,
    valor_dia_transporte: valorDiaTransporte,
    dias_liquidados: diasLiquidados,
    dias_con_transporte: diasConTransporte,
    devengado_salario: devengadoSalario,
    auxilio_transporte_base: auxilioTransporteBase,
    devengado_transporte: devengadoTransporte,
    deduccion_salud: salud,
    deduccion_pension: pension,
    total_adiciones: totalAdiciones,
    total_deducciones: totalDeducciones,
    total_devengado: totalDevengado,
    neto_pagar: netoPagar
  };
};
