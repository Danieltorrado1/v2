import { AppError } from '../../utils/AppError';
import {
  compareDateStrings,
  inclusiveDaysBetween,
  maxDateString,
  minDateString
} from './nomina.calculator';

export const NOMINA_EFECTO_SALARIO_VALUES = [
  'SIN_EFECTO',
  'DESCUENTA_PROPORCIONAL',
  'LIQUIDACION_ESPECIAL',
  'PENDIENTE_CONFIGURACION'
] as const;

export const NOMINA_EFECTO_TRANSPORTE_VALUES = [
  'SIN_EFECTO',
  'DESCUENTA_DIA',
  'PENDIENTE_CONFIGURACION'
] as const;

export const NOMINA_EFECTO_RECARGOS_VALUES = [
  'SIN_EFECTO',
  'EXCLUIR_DIA',
  'PENDIENTE_CONFIGURACION'
] as const;

export const NOMINA_EFECTO_LIQUIDACION_VALUES = [
  'SIN_EFECTO',
  'PREPARAR_LIQUIDACION',
  'PENDIENTE_CONFIGURACION'
] as const;

export const NOMINA_EFECTO_COBERTURA_VALUES = [
  'SIN_EFECTO',
  'PENDIENTE_CONFIGURACION'
] as const;

export const NOMINA_EFECTO_OPERATIVO_VALUES = [
  'SIN_EFECTO',
  'PENDIENTE_NOMINA_3'
] as const;

export const NOMINA_MODELO_REGISTRO_VALUES = [
  'POR_PERIODO',
  'EVENTO_CANONICO_RANGO'
] as const;

export const NOMINA_GRUPO_EXCLUSIVIDAD_VALUES = [
  'NINGUNA',
  'LICENCIA_MATERNIDAD_PATERNIDAD'
] as const;

export type NominaEfectoSalario = (typeof NOMINA_EFECTO_SALARIO_VALUES)[number];
export type NominaEfectoTransporte = (typeof NOMINA_EFECTO_TRANSPORTE_VALUES)[number];
export type NominaEfectoRecargos = (typeof NOMINA_EFECTO_RECARGOS_VALUES)[number];
export type NominaEfectoLiquidacion = (typeof NOMINA_EFECTO_LIQUIDACION_VALUES)[number];
export type NominaEfectoCobertura = (typeof NOMINA_EFECTO_COBERTURA_VALUES)[number];
export type NominaEfectoOperativo = (typeof NOMINA_EFECTO_OPERATIVO_VALUES)[number];
export type NominaModeloRegistro = (typeof NOMINA_MODELO_REGISTRO_VALUES)[number];
export type NominaGrupoExclusividad = (typeof NOMINA_GRUPO_EXCLUSIVIDAD_VALUES)[number];

export interface NominaNovedadEffectMatrix {
  bloquea_otras_novedades: boolean;
  codigo_operativo: string | null;
  efecto_cobertura: NominaEfectoCobertura;
  efecto_liquidacion: NominaEfectoLiquidacion;
  efecto_operativo: NominaEfectoOperativo;
  efecto_recargos: NominaEfectoRecargos;
  efecto_salario: NominaEfectoSalario;
  efecto_transporte: NominaEfectoTransporte;
  grupo_exclusividad: NominaGrupoExclusividad;
  modelo_registro: NominaModeloRegistro;
  nombre: string | null;
  observacion_plantilla: string | null;
  proyecta_periodos: boolean;
}

export interface NominaEffectMatrixConfigInput {
  bloquea_otras_novedades: boolean | null;
  codigo_operativo: string | null;
  afecta_salario?: boolean | null;
  afecta_transporte?: boolean | null;
  efecto_auxilio_transporte: string | null;
  efecto_cobertura_config: string | null;
  efecto_liquidacion: string | null;
  efecto_operativo: string | null;
  efecto_recargos_detallado: string | null;
  efecto_salario: string | null;
  grupo_exclusividad: string | null;
  modelo_registro: string | null;
  nombre: string | null;
  observacion_plantilla: string | null;
  proyecta_periodos: boolean | null;
}

export interface NominaPeriodoDateRange {
  end: string;
  start: string;
}

export interface NominaEmploymentDateRange {
  end: string;
  start: string;
}

export interface NominaEffectEventInput {
  dias: number | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  fuente_id: string;
  matrix: NominaNovedadEffectMatrix;
  origen: 'CANONICO' | 'PERIODO';
}

export interface NominaEffectConflict {
  code: 'CONFLICTO_NOVEDADES';
  fecha: string;
  fuente_a: string;
  fuente_b: string;
  motivo: string;
}

export interface NominaDayEffectSummary {
  codigos: string[];
  fecha: string;
  fuentes: string[];
  liquidacion_especial: boolean;
  novedad_licencia: boolean;
  recargo_excluido: boolean;
  salario_descuento: boolean;
  transporte_descuento: boolean;
}

export interface NominaEffectResolution {
  conflictos: NominaEffectConflict[];
  days: NominaDayEffectSummary[];
  dias_liquidacion_especial: number;
  dias_recargo_excluido: number;
  dias_salario_descuento: number;
  dias_transporte_descuento: number;
}

export interface NominaEffectEventImpact {
  aplica_regla_recargo_mayor_tres_dias: boolean;
  dias_evento: number;
  dias_liquidacion_especial: number;
  dias_periodo: number;
  dias_recargo_excluido: number;
  dias_salario_descuento: number;
  dias_transporte_descuento: number;
  fecha_fin: string;
  fecha_inicio: string;
  projected_range: NominaProjectedDateRange | null;
  recargo_excluido_por_configuracion: boolean;
}
export interface NominaProjectedCanonicalEvent {
  fecha_fin: string;
  fecha_inicio: string;
  fuente_id: string;
  tipo_novedad_codigo_operativo: string | null;
  tipo_novedad_id: string | null;
  vinculacion_id: string;
}

export interface NominaProjectedDateRange {
  dias: number;
  fecha_fin: string;
  fecha_inicio: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toDate = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid date value', 400, 'INVALID_DATE', { value });
  }

  return date;
};

const listDateStringsBetween = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const current = toDate(start);
  const limit = toDate(end);

  while (current.getTime() <= limit.getTime()) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

const computeEventDateRange = (
  event: NominaEffectEventInput,
  periodo: NominaPeriodoDateRange,
  employment: NominaEmploymentDateRange
): { end: string; start: string } | null => {
  const start = event.fecha_inicio ?? event.fecha_fin ?? periodo.start;
  const end = event.fecha_fin ?? event.fecha_inicio ?? start;

  if (compareDateStrings(start, end) > 0) {
    throw new AppError(
      'Payroll novelty range is invalid',
      400,
      'NOMINA_NOVEDAD_INVALID_RANGE',
      {
        end,
        fuente_id: event.fuente_id,
        start
      }
    );
  }

  const overlapStart = maxDateString(maxDateString(periodo.start, employment.start), start);
  const overlapEnd = minDateString(minDateString(periodo.end, employment.end), end);

  if (compareDateStrings(overlapStart, overlapEnd) > 0) {
    return null;
  }

  return {
    start: overlapStart,
    end: overlapEnd
  };
};

export const resolveNominaEffectEventImpact = (input: {
  employment: NominaEmploymentDateRange;
  event: NominaEffectEventInput;
  periodo: NominaPeriodoDateRange;
}): NominaEffectEventImpact => {
  const fechaInicio = input.event.fecha_inicio ?? input.event.fecha_fin ?? input.periodo.start;
  const fechaFin = input.event.fecha_fin ?? input.event.fecha_inicio ?? fechaInicio;

  if (compareDateStrings(fechaInicio, fechaFin) > 0) {
    throw new AppError(
      'Payroll novelty range is invalid',
      400,
      'NOMINA_NOVEDAD_INVALID_RANGE',
      {
        end: fechaFin,
        fuente_id: input.event.fuente_id,
        start: fechaInicio
      }
    );
  }

  const projectedRange = projectNominaDateRangeToPeriodo({
    periodo: input.periodo,
    employment: input.employment,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin
  });
  const diasEvento = inclusiveDaysBetween(fechaInicio, fechaFin);
  const diasPeriodo = projectedRange?.dias ?? 0;
  const aplicaReglaRecargoMayorTresDias = diasEvento > 3;
  const recargoExcluidoPorConfiguracion = input.event.matrix.efecto_recargos === 'EXCLUIR_DIA';

  return {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    dias_evento: diasEvento,
    dias_periodo: diasPeriodo,
    dias_salario_descuento:
      input.event.matrix.efecto_salario === 'DESCUENTA_PROPORCIONAL' ? diasPeriodo : 0,
    dias_transporte_descuento:
      input.event.matrix.efecto_transporte === 'DESCUENTA_DIA' ? diasPeriodo : 0,
    dias_recargo_excluido:
      recargoExcluidoPorConfiguracion || aplicaReglaRecargoMayorTresDias ? diasPeriodo : 0,
    dias_liquidacion_especial:
      ['LIQUIDACION_ESPECIAL', 'PREPARAR_LIQUIDACION'].includes(input.event.matrix.efecto_liquidacion)
        ? diasPeriodo
        : 0,
    aplica_regla_recargo_mayor_tres_dias: aplicaReglaRecargoMayorTresDias,
    recargo_excluido_por_configuracion: recargoExcluidoPorConfiguracion,
    projected_range: projectedRange
  };
};
const buildFormattedDate = (value: string): string => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const toBooleanValue = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 't', 'yes', 'y', 'si', 'sÃ­'].includes(normalized);
  }

  return false;
};

const toNominaEfectoSalario = (value: string | null | undefined): NominaEfectoSalario => {
  switch (value) {
    case 'DESCUENTA_PROPORCIONAL':
    case 'LIQUIDACION_ESPECIAL':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoTransporte = (
  value: string | null | undefined
): NominaEfectoTransporte => {
  switch (value) {
    case 'DESCUENTA_DIA':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoRecargos = (value: string | null | undefined): NominaEfectoRecargos => {
  switch (value) {
    case 'EXCLUIR_DIA':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoLiquidacion = (
  value: string | null | undefined
): NominaEfectoLiquidacion => {
  switch (value) {
    case 'PREPARAR_LIQUIDACION':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoCobertura = (value: string | null | undefined): NominaEfectoCobertura => {
  switch (value) {
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoOperativo = (value: string | null | undefined): NominaEfectoOperativo => {
  switch (value) {
    case 'PENDIENTE_NOMINA_3':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaModeloRegistro = (value: string | null | undefined): NominaModeloRegistro => {
  return value === 'EVENTO_CANONICO_RANGO' ? value : 'POR_PERIODO';
};

const toNominaGrupoExclusividad = (
  value: string | null | undefined
): NominaGrupoExclusividad => {
  return value === 'LICENCIA_MATERNIDAD_PATERNIDAD' ? value : 'NINGUNA';
};

export const buildNominaEffectMatrixFromConfig = (
  row: NominaEffectMatrixConfigInput
): NominaNovedadEffectMatrix => {
  return {
    codigo_operativo: row.codigo_operativo,
    nombre: row.nombre,
    efecto_salario:
      row.efecto_salario === null && row.afecta_salario
        ? 'DESCUENTA_PROPORCIONAL'
        : toNominaEfectoSalario(row.efecto_salario),
    efecto_transporte:
      row.efecto_auxilio_transporte === null && row.afecta_transporte
        ? 'DESCUENTA_DIA'
        : toNominaEfectoTransporte(row.efecto_auxilio_transporte),
    efecto_recargos: toNominaEfectoRecargos(row.efecto_recargos_detallado),
    efecto_liquidacion: toNominaEfectoLiquidacion(row.efecto_liquidacion),
    efecto_cobertura: toNominaEfectoCobertura(row.efecto_cobertura_config),
    efecto_operativo: toNominaEfectoOperativo(row.efecto_operativo),
    modelo_registro: toNominaModeloRegistro(row.modelo_registro),
    proyecta_periodos: toBooleanValue(row.proyecta_periodos),
    bloquea_otras_novedades: toBooleanValue(row.bloquea_otras_novedades),
    grupo_exclusividad: toNominaGrupoExclusividad(row.grupo_exclusividad),
    observacion_plantilla: row.observacion_plantilla
  };
};

export const generateNominaNovedadObservation = (input: {
  dias: number;
  fecha_fin: string;
  fecha_inicio: string;
  matrix: NominaNovedadEffectMatrix;
}): string | null => {
  const template = input.matrix.observacion_plantilla?.trim();
  if (!template) {
    return null;
  }

  return template
    .replace(/\{dias\}/g, String(input.dias))
    .replace(/\{fecha_inicio\}/g, buildFormattedDate(input.fecha_inicio))
    .replace(/\{fecha_fin\}/g, buildFormattedDate(input.fecha_fin));
};

export const resolveNominaEfectosPorDia = (input: {
  employment: NominaEmploymentDateRange;
  events: NominaEffectEventInput[];
  periodo: NominaPeriodoDateRange;
}): NominaEffectResolution => {
  const byDate = new Map<
    string,
    Array<{
      fuente_id: string;
      matrix: NominaNovedadEffectMatrix;
      recargo_excluido: boolean;
    }>
  >();

  for (const event of input.events) {
    const impact = resolveNominaEffectEventImpact({
      event,
      periodo: input.periodo,
      employment: input.employment
    });
    const overlap = computeEventDateRange(event, input.periodo, input.employment);
    if (!overlap || impact.dias_periodo <= 0) {
      continue;
    }

    for (const date of listDateStringsBetween(overlap.start, overlap.end)) {
      const current = byDate.get(date) ?? [];
      current.push({
        fuente_id: event.fuente_id,
        matrix: event.matrix,
        recargo_excluido: impact.dias_recargo_excluido > 0
      });
      byDate.set(date, current);
    }
  }

  const days: NominaDayEffectSummary[] = [];
  const conflictos: NominaEffectConflict[] = [];

  for (const [fecha, events] of Array.from(byDate.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const uniqueSources = Array.from(new Set(events.map((event) => event.fuente_id)));
    if (uniqueSources.length > 1) {
      for (let leftIndex = 0; leftIndex < uniqueSources.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < uniqueSources.length; rightIndex += 1) {
          const fuenteA = uniqueSources[leftIndex];
          const fuenteB = uniqueSources[rightIndex];
          if (!fuenteA || !fuenteB) {
            continue;
          }
          conflictos.push({
            code: 'CONFLICTO_NOVEDADES',
            fecha,
            fuente_a: fuenteA,
            fuente_b: fuenteB,
            motivo: 'Existe mas de una novedad para la misma persona y fecha.'
          });
        }
      }
    }

    const codes = Array.from(
      new Set(events.map((event) => event.matrix.codigo_operativo).filter((value): value is string => !!value))
    );

    days.push({
      fecha,
      fuentes: uniqueSources,
      codigos: codes,
      salario_descuento: events.some(
        (event) => event.matrix.efecto_salario === 'DESCUENTA_PROPORCIONAL'
      ),
      transporte_descuento: events.some(
        (event) => event.matrix.efecto_transporte === 'DESCUENTA_DIA'
      ),
      recargo_excluido: events.some((event) => event.recargo_excluido),
      liquidacion_especial: events.some((event) =>
        ['LIQUIDACION_ESPECIAL', 'PREPARAR_LIQUIDACION'].includes(event.matrix.efecto_liquidacion)
      ),
      novedad_licencia: events.some(
        (event) => event.matrix.grupo_exclusividad === 'LICENCIA_MATERNIDAD_PATERNIDAD'
      )
    });
  }

  return {
    conflictos,
    days,
    dias_salario_descuento: days.filter((day) => day.salario_descuento).length,
    dias_transporte_descuento: days.filter((day) => day.transporte_descuento).length,
    dias_recargo_excluido: days.filter((day) => day.recargo_excluido).length,
    dias_liquidacion_especial: days.filter((day) => day.liquidacion_especial).length
  };
};

export const projectNominaCanonicalEventsToPeriodo = (input: {
  canonicalEvents: NominaProjectedCanonicalEvent[];
  employment: NominaEmploymentDateRange;
  periodo: NominaPeriodoDateRange;
}): NominaProjectedCanonicalEvent[] => {
  return input.canonicalEvents.filter((event) => {
    const overlapStart = maxDateString(
      maxDateString(input.periodo.start, input.employment.start),
      event.fecha_inicio
    );
    const overlapEnd = minDateString(
      minDateString(input.periodo.end, input.employment.end),
      event.fecha_fin
    );

    return compareDateStrings(overlapStart, overlapEnd) <= 0;
  });
};

export const projectNominaDateRangeToPeriodo = (input: {
  employment: NominaEmploymentDateRange;
  fecha_fin: string;
  fecha_inicio: string;
  periodo: NominaPeriodoDateRange;
}): NominaProjectedDateRange | null => {
  const overlapStart = maxDateString(
    maxDateString(input.periodo.start, input.employment.start),
    input.fecha_inicio
  );
  const overlapEnd = minDateString(
    minDateString(input.periodo.end, input.employment.end),
    input.fecha_fin
  );

  if (compareDateStrings(overlapStart, overlapEnd) > 0) {
    return null;
  }

  return {
    fecha_inicio: overlapStart,
    fecha_fin: overlapEnd,
    dias: inclusiveDaysBetween(overlapStart, overlapEnd)
  };
};

export const nominaDateRangesOverlap = (
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
): boolean => {
  return compareDateStrings(maxDateString(leftStart, rightStart), minDateString(leftEnd, rightEnd)) <= 0;
};

export const countInclusiveDays = (start: string, end: string): number => {
  return inclusiveDaysBetween(start, end);
};

export const buildDateRangeFromDays = (start: string, days: number): { end: string; start: string } => {
  if (days <= 0) {
    throw new AppError('days must be greater than zero', 400, 'NOMINA_NOVEDAD_DAYS_INVALID');
  }

  const startDate = toDate(start);
  const endDate = new Date(startDate.getTime() + (days - 1) * DAY_IN_MS);

  return {
    start,
    end: endDate.toISOString().slice(0, 10)
  };
};
