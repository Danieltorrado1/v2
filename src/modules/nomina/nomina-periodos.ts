const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;

export type NominaPeriodRange = {
  fecha_inicio: string;
  fecha_fin: string;
  nombre_periodo: string;
  mes: number;
  anio: number;
};

const dateOnly = (year: number, monthIndex: number, day: number) => {
  const value = new Date(Date.UTC(year, monthIndex, day));
  return value.toISOString().slice(0, 10);
};

/** Monthly payroll periods close on day 25 and start on day 26 of the prior month. */
export const getNominaPeriodRange = (year: number, month: number): NominaPeriodRange => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Nomina period requires a valid year and month');
  }

  return {
    fecha_inicio: dateOnly(year, month - 2, 26),
    fecha_fin: dateOnly(year, month - 1, 25),
    nombre_periodo: `${MONTH_NAMES[month - 1]} ${year}`,
    mes: month,
    anio: year,
  };
};

export const getNominaPeriodRangeForDate = (date: string | Date) => {
  const value = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date;
  if (Number.isNaN(value.getTime())) throw new Error('Invalid date for nomina period');
  const year = value.getUTCFullYear();
  const month = value.getUTCDate() >= 26 ? value.getUTCMonth() + 2 : value.getUTCMonth() + 1;
  return getNominaPeriodRange(month > 12 ? year + 1 : year, month > 12 ? month - 12 : month);
};
