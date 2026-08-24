import { AppError } from '../../utils/AppError';

export interface ContextoOperativo {
  municipio_id?: string | null;
  municipio?: string | null;
  institucion_id?: string | null;
  institucion?: string | null;
  sede_id?: string | null;
  sede?: string | null;
  modalidad_id?: string | null;
  modalidad?: string | null;
  cargo_operativo_id?: string | null;
  cargo_operativo?: string | null;
  ubicacion_laboral_id?: string | null;
  ubicacion_laboral?: string | null;
  cobertura_asignacion_id?: string | null;
  categoria_id?: string | null;
  categoria?: string | null;
  condicion_economica_id?: string | null;
  tarifa_config_id?: string | null;
  [key: string]: unknown;
}

export interface CambioOperativoDerivable {
  id: string;
  fecha_inicio_efectiva: string;
  fecha_fin_efectiva?: string | null;
  contexto_anterior: ContextoOperativo;
  contexto_nuevo: ContextoOperativo;
  activo?: boolean;
}

export interface TramoOperativo {
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  contexto: ContextoOperativo;
  movimiento_origen_id: string | null;
}

const DAY_MS = 86_400_000;
const parseDate = (value: string): Date => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.valueOf())) {
    throw new AppError('Fecha operativa invalida', 400, 'NOMINA_TRAMO_FECHA_INVALIDA');
  }
  return date;
};
const formatDate = (date: Date): string => date.toISOString().slice(0, 10);
const shiftDate = (value: string, days: number): string => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};
export const diasInclusivos = (inicio: string, fin: string): number =>
  Math.floor((parseDate(fin).valueOf() - parseDate(inicio).valueOf()) / DAY_MS) + 1;

const comparable = (value: ContextoOperativo): string => JSON.stringify(
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)))
);

export const contextosIguales = (a: ContextoOperativo, b: ContextoOperativo): boolean =>
  comparable(a) === comparable(b);

export const resolverTramosOperativos = (input: {
  periodo_inicio: string;
  periodo_fin: string;
  vinculacion_inicio: string;
  vinculacion_fin?: string | null;
  contexto_base: ContextoOperativo;
  cambios: CambioOperativoDerivable[];
}): TramoOperativo[] => {
  const inicio = input.vinculacion_inicio > input.periodo_inicio ? input.vinculacion_inicio : input.periodo_inicio;
  const finVinculacion = input.vinculacion_fin ?? input.periodo_fin;
  const fin = finVinculacion < input.periodo_fin ? finVinculacion : input.periodo_fin;
  if (inicio > fin) return [];

  const cambios = input.cambios
    .filter((item) => item.activo !== false)
    .sort((a, b) => a.fecha_inicio_efectiva.localeCompare(b.fecha_inicio_efectiva) || a.id.localeCompare(b.id));
  const tramos: TramoOperativo[] = [];
  let cursor = inicio;
  let contexto = input.contexto_base;

  for (const cambio of cambios) {
    if (cambio.fecha_inicio_efectiva < inicio || cambio.fecha_inicio_efectiva > fin) {
      throw new AppError('Cambio fuera del rango liquidable', 409, 'NOMINA_CAMBIO_FUERA_RANGO');
    }
    if (cambio.fecha_fin_efectiva && cambio.fecha_fin_efectiva < cambio.fecha_inicio_efectiva) {
      throw new AppError('Rango efectivo invalido', 409, 'NOMINA_CAMBIO_RANGO_INVALIDO');
    }
    if (cambio.fecha_inicio_efectiva < cursor) {
      throw new AppError('Cambios operativos solapados', 409, 'NOMINA_CAMBIO_SOLAPADO');
    }
    if (!contextosIguales(contexto, cambio.contexto_anterior)) {
      throw new AppError('El contexto anterior no coincide; el cambio dejaria un hueco logico', 409, 'NOMINA_CAMBIO_HUECO_LOGICO');
    }
    if (contextosIguales(cambio.contexto_anterior, cambio.contexto_nuevo)) {
      throw new AppError('Cambio operativo sin diferencia real', 409, 'NOMINA_CAMBIO_REDUNDANTE');
    }
    if (cambio.fecha_inicio_efectiva > cursor) {
      const tramoFin = shiftDate(cambio.fecha_inicio_efectiva, -1);
      tramos.push({ fecha_inicio: cursor, fecha_fin: tramoFin, dias: diasInclusivos(cursor, tramoFin), contexto, movimiento_origen_id: null });
    }
    cursor = cambio.fecha_inicio_efectiva;
    contexto = cambio.contexto_nuevo;
    if (cambio.fecha_fin_efectiva && cambio.fecha_fin_efectiva < fin) {
      throw new AppError('Los cambios temporales requieren un evento de retorno explicito', 409, 'NOMINA_CAMBIO_RETORNO_REQUERIDO');
    }
    tramos.push({ fecha_inicio: cursor, fecha_fin: fin, dias: diasInclusivos(cursor, fin), contexto, movimiento_origen_id: cambio.id });
  }

  if (tramos.length === 0) {
    return [{ fecha_inicio: inicio, fecha_fin: fin, dias: diasInclusivos(inicio, fin), contexto, movimiento_origen_id: null }];
  }
  // Cada evento provisionalmente extendio el ultimo tramo; normalizar sus limites con el siguiente.
  for (let index = 0; index < tramos.length - 1; index += 1) {
    const current = tramos[index];
    const next = tramos[index + 1];
    if (current && next && current.fecha_fin >= next.fecha_inicio) {
      current.fecha_fin = shiftDate(next.fecha_inicio, -1);
      current.dias = diasInclusivos(current.fecha_inicio, current.fecha_fin);
    }
  }
  return tramos.filter((tramo) => tramo.fecha_inicio <= tramo.fecha_fin);
};

export const intersectarRangoConTramos = (
  fechaInicio: string,
  fechaFin: string,
  tramos: TramoOperativo[]
): Array<TramoOperativo & { dias_interseccion: number }> => tramos.flatMap((tramo) => {
  const inicio = fechaInicio > tramo.fecha_inicio ? fechaInicio : tramo.fecha_inicio;
  const fin = fechaFin < tramo.fecha_fin ? fechaFin : tramo.fecha_fin;
  return inicio <= fin ? [{ ...tramo, fecha_inicio: inicio, fecha_fin: fin, dias: diasInclusivos(inicio, fin), dias_interseccion: diasInclusivos(inicio, fin) }] : [];
});
