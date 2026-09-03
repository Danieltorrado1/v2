import { AppError } from '../../utils/AppError';
import type { NominaDayEffectSummary } from './nomina.effects';

export const COBERTURA_DIAS_BASE_NOMINA = 30;
export const COBERTURA_PORCENTAJE_SALUD = 0.04;
export const COBERTURA_PORCENTAJE_PENSION = 0.04;

export interface CoberturaCategoriaSnapshot {
  auxilio_transporte: number;
  categoria_id: string | null;
  codigo_categoria: string | null;
  configuracion_id?: string | null;
  nombre_categoria: string | null;
  recargo_mensual: number;
  salario_base: number;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
}

export interface CoberturaTramoInput {
  categoria: CoberturaCategoriaSnapshot;
  contexto?: Record<string, unknown> | null;
  fecha_fin: string;
  fecha_inicio: string;
  movimiento_origen_id?: string | null;
}

export interface CoberturaAdicionInternaInput {
  afecta_seguridad_social?: boolean | null;
  aporta_pension: boolean;
  categoria: CoberturaCategoriaSnapshot;
  contexto?: Record<string, unknown> | null;
  fecha_fin: string;
  fecha_inicio: string;
  id?: string | null;
  observacion?: string | null;
  origen?: string | null;
  valor_aplicado?: number | null;
}

export interface CoberturaCalculationInput {
  adiciones_internas?: CoberturaAdicionInternaInput[];
  aporta_pension: boolean;
  descuentos_autorizados?: number;
  dias_base_nomina?: number;
  dias_efectos: NominaDayEffectSummary[];
  empleo: {
    fecha_fin: string;
    fecha_inicio: string;
  };
  otras_deducciones_reales?: number;
  otros_devengos_reales?: number;
  porcentaje_pension?: number;
  porcentaje_salud?: number;
  tramos: CoberturaTramoInput[];
}

export interface CoberturaTramoCalculado extends CoberturaTramoInput {
  auxilio_aplicado: number;
  codigos_novedad: string[];
  dias_cotizacion_ss: number;
  dias_recargo: number;
  dias_recargo_descuento: number;
  dias_salario: number;
  dias_salario_descuento: number;
  dias_transporte: number;
  dias_transporte_descuento: number;
  dias_vinculacion: number;
  recargo_aplicado: number;
  recargo_causado: number;
  salario_base_aplicado: number;
  salario_causado: number;
  transporte_causado: number;
}

export interface CoberturaAdicionInternaCalculada extends CoberturaAdicionInternaInput {
  devengado_turno: number;
  dias_turno: number;
  neto_turno: number;
  pension_turno: number;
  recargo_turno: number;
  salario_turno: number;
  salud_turno: number;
  transporte_turno: number;
}

export interface CoberturaCalculationResult {
  adiciones_internas: CoberturaAdicionInternaCalculada[];
  aporta_pension: boolean;
  auditoria: {
    dias_efectos: NominaDayEffectSummary[];
    dias_vinculacion: number;
    tramos: CoberturaTramoCalculado[];
  };
  descuentos_autorizados: number;
  dias_base_nomina: number;
  dias_cotizacion_ss: number;
  dias_recargo: number;
  dias_salario: number;
  dias_transporte: number;
  dias_vinculacion: number;
  neto_nomina: number;
  otras_deducciones_reales: number;
  otros_devengos_reales: number;
  pension_adiciones_internas: number;
  pension_ordinaria: number;
  porcentaje_pension: number;
  porcentaje_salud: number;
  recargos_ordinarios: number;
  salario_ordinario: number;
  salud_adiciones_internas: number;
  salud_ordinaria: number;
  total_deducciones: number;
  total_devengado: number;
  transporte_ordinario: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf())) {
    throw new AppError('Invalid COBERTURA date', 400, 'NOMINA_COBERTURA_FECHA_INVALIDA', { value });
  }
  return date;
};

const formatDate = (value: Date): string => value.toISOString().slice(0, 10);

const isLastDayOfMonth = (value: Date): boolean => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCDate() === 1;
};

const commercialDay = (value: Date): number => {
  const day = value.getUTCDate();
  if (day === 31 || isLastDayOfMonth(value)) {
    return 30;
  }
  return day;
};

const commercialOrdinal = (value: string): number => {
  const date = parseDate(value);
  return date.getUTCFullYear() * 360 + (date.getUTCMonth() + 1) * 30 + commercialDay(date);
};

const listDateStringsBetween = (start: string, end: string): string[] => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const values: string[] = [];
  for (const current = new Date(startDate); current <= endDate; current.setUTCDate(current.getUTCDate() + 1)) {
    values.push(formatDate(current));
  }
  return values;
};

const floorNominaValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new AppError('Invalid COBERTURA amount', 400, 'NOMINA_COBERTURA_VALOR_INVALIDO', { value });
  }
  return Math.floor(value + 1e-9);
};

export const roundUpToHundreds = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.ceil((value - 1e-9) / 100) * 100;
};

export const countCommercialInclusiveDays = (start: string, end: string): number => {
  if (commercialOrdinal(start) > commercialOrdinal(end)) {
    throw new AppError('Invalid commercial range', 400, 'NOMINA_COBERTURA_RANGO_INVALIDO', { start, end });
  }
  return commercialOrdinal(end) - commercialOrdinal(start) + 1;
};

const countActualInclusiveDays = (start: string, end: string): number => {
  const startDate = parseDate(start).valueOf();
  const endDate = parseDate(end).valueOf();
  if (startDate > endDate) {
    throw new AppError('Invalid actual range', 400, 'NOMINA_COBERTURA_RANGO_REAL_INVALIDO', { start, end });
  }
  return Math.floor((endDate - startDate) / DAY_MS) + 1;
};

const normalizeAmount = (value: number | null | undefined): number => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Number(value);
};

const normalizePercentage = (value: number | null | undefined, fallback: number): number => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value > 1 ? value / 100 : value;
};

const buildEffectsByDate = (items: NominaDayEffectSummary[]): Map<string, NominaDayEffectSummary> => {
  const map = new Map<string, NominaDayEffectSummary>();
  for (const item of items) {
    map.set(item.fecha, item);
  }
  return map;
};

const uniqueCodesForDates = (dates: string[], effectsByDate: Map<string, NominaDayEffectSummary>): string[] => {
  return Array.from(
    new Set(
      dates.flatMap((date) => effectsByDate.get(date)?.codigos ?? []).filter((value) => value.trim().length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));
};

const countDiscountDays = (
  dates: string[],
  effectsByDate: Map<string, NominaDayEffectSummary>,
  key: 'salario_descuento' | 'recargo_excluido' | 'transporte_descuento'
): number => dates.filter((date) => Boolean(effectsByDate.get(date)?.[key])).length;

const assertCoverageTramos = (tramos: CoberturaTramoInput[]): void => {
  if (tramos.length === 0) {
    throw new AppError('COBERTURA requires at least one tramo', 400, 'NOMINA_COBERTURA_TRAMO_REQUERIDO');
  }

  const ordered = [...tramos].sort((left, right) =>
    left.fecha_inicio.localeCompare(right.fecha_inicio) || left.fecha_fin.localeCompare(right.fecha_fin)
  );

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (!current) {
      continue;
    }
    if (current.fecha_inicio > current.fecha_fin) {
      throw new AppError('COBERTURA tramo has invalid range', 400, 'NOMINA_COBERTURA_TRAMO_INVALIDO', current);
    }
    if (index === 0) {
      continue;
    }
    const previous = ordered[index - 1];
    if (!previous) {
      continue;
    }
    const expectedStart = formatDate(new Date(parseDate(previous.fecha_fin).valueOf() + DAY_MS));
    if (current.fecha_inicio !== expectedStart) {
      throw new AppError('COBERTURA tramos must be contiguous', 409, 'NOMINA_COBERTURA_TRAMO_HUECO', {
        previous,
        current,
      });
    }
  }
};

const calculateTramo = (
  tramo: CoberturaTramoInput,
  effectsByDate: Map<string, NominaDayEffectSummary>
): CoberturaTramoCalculado => {
  const dates = listDateStringsBetween(tramo.fecha_inicio, tramo.fecha_fin);
  const diasVinculacion = countCommercialInclusiveDays(tramo.fecha_inicio, tramo.fecha_fin);
  const diasSalarioDescuento = countDiscountDays(dates, effectsByDate, 'salario_descuento');
  const diasRecargoDescuento = countDiscountDays(dates, effectsByDate, 'recargo_excluido');
  const diasTransporteDescuento = countDiscountDays(dates, effectsByDate, 'transporte_descuento');
  const diasSalario = Math.max(0, diasVinculacion - diasSalarioDescuento);
  const diasRecargo = Math.max(0, diasVinculacion - diasRecargoDescuento);
  const diasTransporte = Math.max(0, diasVinculacion - diasTransporteDescuento);
  const salarioBase = normalizeAmount(tramo.categoria.salario_base);
  const recargoMensual = normalizeAmount(tramo.categoria.recargo_mensual);
  const auxilioTransporte = normalizeAmount(tramo.categoria.auxilio_transporte);

  return {
    ...tramo,
    salario_base_aplicado: salarioBase,
    recargo_aplicado: recargoMensual,
    auxilio_aplicado: auxilioTransporte,
    dias_vinculacion: diasVinculacion,
    dias_salario_descuento: diasSalarioDescuento,
    dias_recargo_descuento: diasRecargoDescuento,
    dias_transporte_descuento: diasTransporteDescuento,
    dias_salario: diasSalario,
    dias_recargo: diasRecargo,
    dias_transporte: diasTransporte,
    dias_cotizacion_ss: diasVinculacion,
    salario_causado: floorNominaValue((salarioBase / COBERTURA_DIAS_BASE_NOMINA) * diasSalario),
    recargo_causado: recargoMensual > 0
      ? floorNominaValue((recargoMensual / COBERTURA_DIAS_BASE_NOMINA) * diasRecargo)
      : 0,
    transporte_causado: auxilioTransporte > 0
      ? floorNominaValue((auxilioTransporte / COBERTURA_DIAS_BASE_NOMINA) * diasTransporte)
      : 0,
    codigos_novedad: uniqueCodesForDates(dates, effectsByDate),
  };
};

const calculateAdicionInterna = (
  adicion: CoberturaAdicionInternaInput,
  porcentajeSalud: number,
  porcentajePension: number
): CoberturaAdicionInternaCalculada => {
  const diasTurno = countActualInclusiveDays(adicion.fecha_inicio, adicion.fecha_fin);
  const valorSnapshot =
    adicion.valor_aplicado === null || adicion.valor_aplicado === undefined
      ? null
      : floorNominaValue(normalizeAmount(adicion.valor_aplicado));
  const usaValorSnapshot = valorSnapshot !== null;
  const salarioTurno = usaValorSnapshot
    ? valorSnapshot
    : floorNominaValue((normalizeAmount(adicion.categoria.salario_base) / COBERTURA_DIAS_BASE_NOMINA) * diasTurno);
  const recargoTurno = usaValorSnapshot
    ? 0
    : floorNominaValue((normalizeAmount(adicion.categoria.recargo_mensual) / COBERTURA_DIAS_BASE_NOMINA) * diasTurno);
  const transporteTurno = usaValorSnapshot
    ? 0
    : floorNominaValue((normalizeAmount(adicion.categoria.auxilio_transporte) / COBERTURA_DIAS_BASE_NOMINA) * diasTurno);
  const devengadoTurno = usaValorSnapshot ? valorSnapshot : salarioTurno + recargoTurno + transporteTurno;
  const baseSeguridadSocialTurno = adicion.afecta_seguridad_social === false ? 0 : salarioTurno;
  const saludTurno = roundUpToHundreds(baseSeguridadSocialTurno * porcentajeSalud);
  const pensionTurno = adicion.aporta_pension
    ? roundUpToHundreds(baseSeguridadSocialTurno * porcentajePension)
    : 0;

  return {
    ...adicion,
    dias_turno: diasTurno,
    salario_turno: salarioTurno,
    recargo_turno: recargoTurno,
    transporte_turno: transporteTurno,
    devengado_turno: devengadoTurno,
    salud_turno: saludTurno,
    pension_turno: pensionTurno,
    neto_turno: devengadoTurno - saludTurno - pensionTurno,
  };
};

export const calculateCoberturaPayroll = (
  input: CoberturaCalculationInput
): CoberturaCalculationResult => {
  const diasBaseNomina = input.dias_base_nomina ?? COBERTURA_DIAS_BASE_NOMINA;
  if (diasBaseNomina !== COBERTURA_DIAS_BASE_NOMINA) {
    throw new AppError('COBERTURA payroll uses a fixed 30-day base', 409, 'NOMINA_COBERTURA_DIAS_BASE_INVALIDO', {
      dias_base_nomina: diasBaseNomina,
    });
  }

  assertCoverageTramos(input.tramos);

  const effectsByDate = buildEffectsByDate(input.dias_efectos);
  const tramos = input.tramos.map((tramo) => calculateTramo(tramo, effectsByDate));
  const diasVinculacion = tramos.reduce((accumulator, tramo) => accumulator + tramo.dias_vinculacion, 0);
  const diasSalario = tramos.reduce((accumulator, tramo) => accumulator + tramo.dias_salario, 0);
  const diasRecargo = tramos.reduce((accumulator, tramo) => accumulator + tramo.dias_recargo, 0);
  const diasTransporte = tramos.reduce((accumulator, tramo) => accumulator + tramo.dias_transporte, 0);
  const diasCotizacionSs = tramos.reduce((accumulator, tramo) => accumulator + tramo.dias_cotizacion_ss, 0);

  const salarioOrdinario = tramos.reduce((accumulator, tramo) => accumulator + tramo.salario_causado, 0);
  const recargosOrdinarios = tramos.reduce((accumulator, tramo) => accumulator + tramo.recargo_causado, 0);
  const transporteOrdinario = tramos.reduce((accumulator, tramo) => accumulator + tramo.transporte_causado, 0);

  const porcentajeSalud = normalizePercentage(input.porcentaje_salud, COBERTURA_PORCENTAJE_SALUD);
  const porcentajePension = normalizePercentage(input.porcentaje_pension, COBERTURA_PORCENTAJE_PENSION);
  const saludOrdinaria = roundUpToHundreds(salarioOrdinario * porcentajeSalud);
  const pensionOrdinaria = input.aporta_pension ? roundUpToHundreds(salarioOrdinario * porcentajePension) : 0;

  const adicionesInternas = (input.adiciones_internas ?? []).map((adicion) =>
    calculateAdicionInterna(adicion, porcentajeSalud, porcentajePension)
  );
  const totalDevengadoAdiciones = adicionesInternas.reduce(
    (accumulator, adicion) => accumulator + adicion.devengado_turno,
    0
  );
  const saludAdicionesInternas = adicionesInternas.reduce(
    (accumulator, adicion) => accumulator + adicion.salud_turno,
    0
  );
  const pensionAdicionesInternas = adicionesInternas.reduce(
    (accumulator, adicion) => accumulator + adicion.pension_turno,
    0
  );

  const otrosDevengosReales = normalizeAmount(input.otros_devengos_reales);
  const descuentosAutorizados = normalizeAmount(input.descuentos_autorizados);
  const otrasDeduccionesReales = normalizeAmount(input.otras_deducciones_reales);
  const totalDevengado =
    salarioOrdinario +
    recargosOrdinarios +
    transporteOrdinario +
    totalDevengadoAdiciones +
    otrosDevengosReales;
  const totalDeducciones =
    saludOrdinaria +
    pensionOrdinaria +
    saludAdicionesInternas +
    pensionAdicionesInternas +
    descuentosAutorizados +
    otrasDeduccionesReales;

  return {
    dias_base_nomina: diasBaseNomina,
    dias_vinculacion: diasVinculacion,
    dias_salario: diasSalario,
    dias_recargo: diasRecargo,
    dias_transporte: diasTransporte,
    dias_cotizacion_ss: diasCotizacionSs,
    salario_ordinario: salarioOrdinario,
    recargos_ordinarios: recargosOrdinarios,
    transporte_ordinario: transporteOrdinario,
    salud_ordinaria: saludOrdinaria,
    pension_ordinaria: pensionOrdinaria,
    porcentaje_salud: porcentajeSalud,
    porcentaje_pension: porcentajePension,
    aporta_pension: input.aporta_pension,
    adiciones_internas: adicionesInternas,
    salud_adiciones_internas: saludAdicionesInternas,
    pension_adiciones_internas: pensionAdicionesInternas,
    descuentos_autorizados: descuentosAutorizados,
    otros_devengos_reales: otrosDevengosReales,
    otras_deducciones_reales: otrasDeduccionesReales,
    total_devengado: totalDevengado,
    total_deducciones: totalDeducciones,
    neto_nomina: totalDevengado - totalDeducciones,
    auditoria: {
      dias_vinculacion: diasVinculacion,
      dias_efectos: input.dias_efectos,
      tramos,
    },
  };
};
