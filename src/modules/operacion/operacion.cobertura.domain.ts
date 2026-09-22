export type CoberturaPersonalEstado =
  | 'COMPLETA'
  | 'FALTANTE'
  | 'EXCEDENTE'
  | 'SIN_PERSONAL_REQUERIDO'
  | 'SIN_SERVICIO_FOCALIZADO'
  | 'FUERA_DE_RANGO'
  | 'MODALIDAD_SIN_REGLA';

export interface CoberturaRuleRange {
  minimo: number;
  maximo: number | null;
  personal: number;
  mensaje: string | null;
}

export interface CoberturaRule {
  tipo: string;
  multiplicador: number;
  rangos: CoberturaRuleRange[];
}

export interface CoberturaPersonalResult {
  tipo_regla: string | null;
  raciones_base: number;
  multiplicador: number;
  raciones_calculadas: number;
  rango_desde: number | null;
  rango_hasta: number | null;
  requeridas: number | null;
  vinculadas: number;
  diferencia: number | null;
  estado: CoberturaPersonalEstado;
  mensaje: string | null;
  advertencia: string | null;
}

export const resolveCoberturaPersonal = (input: {
  modalidadCodigo: string | null | undefined;
  raciones: number;
  cuposFocalizados?: number;
  vinculadas: number;
  regla: CoberturaRule | null;
}): CoberturaPersonalResult => {
  const base = Math.max(0, Math.trunc(input.raciones));
  const vinculadas = Math.max(0, Math.trunc(input.vinculadas));
  const cuposFocalizados = Math.max(0, Math.trunc(input.cuposFocalizados ?? input.raciones));

  if (cuposFocalizados === 0) {
    return { tipo_regla: input.regla?.tipo ?? null, raciones_base: 0, multiplicador: input.regla?.multiplicador ?? 1, raciones_calculadas: 0, rango_desde: null, rango_hasta: null, requeridas: 0, vinculadas, diferencia: vinculadas, estado: 'SIN_SERVICIO_FOCALIZADO', mensaje: 'La sede no tiene cupos focalizados para esta modalidad.', advertencia: vinculadas > 0 ? 'Personal vinculado sin cupos focalizados.' : null };
  }

  if (!input.regla) {
    return {
      tipo_regla: null,
      raciones_base: base,
      multiplicador: 1,
      raciones_calculadas: base,
      rango_desde: null,
      rango_hasta: null,
      requeridas: null,
      vinculadas,
      diferencia: null,
      estado: 'MODALIDAD_SIN_REGLA',
      mensaje: input.modalidadCodigo ? `Modalidad ${input.modalidadCodigo} sin regla contractual` : 'Modalidad sin regla contractual',
      advertencia: null
    };
  }

  const multiplicador = Number(input.regla.multiplicador || 1);
  const calculadas = base * multiplicador;
  const rango = input.regla.rangos.find((item) => calculadas >= item.minimo && (item.maximo === null || calculadas <= item.maximo));

  if (!rango) {
    return {
      tipo_regla: input.regla.tipo,
      raciones_base: base,
      multiplicador,
      raciones_calculadas: calculadas,
      rango_desde: null,
      rango_hasta: null,
      requeridas: null,
      vinculadas,
      diferencia: null,
      estado: 'FUERA_DE_RANGO',
      advertencia: null,
      mensaje: 'Las raciones focalizadas están fuera del rango contractual'
    };
  }

  const diferencia = vinculadas - rango.personal;
  const estado: CoberturaPersonalEstado = rango.personal === 0
    ? 'SIN_PERSONAL_REQUERIDO'
    : diferencia === 0 ? 'COMPLETA' : diferencia < 0 ? 'FALTANTE' : 'EXCEDENTE';

  return {
    tipo_regla: input.regla.tipo,
    raciones_base: base,
    multiplicador,
    raciones_calculadas: calculadas,
    rango_desde: rango.minimo,
    rango_hasta: rango.maximo,
    requeridas: rango.personal,
    vinculadas,
    diferencia,
    estado,
    mensaje: rango.mensaje,
    advertencia: null
  };
};
