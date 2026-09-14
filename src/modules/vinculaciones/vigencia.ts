import { compareDateStrings } from '../nomina/nomina.calculator';

export type EstadoVinculacionProyectado = 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA' | 'ANULADA';

export interface VigenciaVinculacion {
  fecha_inicio: string;
  fecha_fin: string | null | undefined;
  fecha_retiro_efectiva?: string | null;
}

export const effectiveRetirementSql = (alias = 'v'): string => `LEAST(${alias}.fecha_fin, (
  SELECT MIN(COALESCE(n.fecha_inicio, n.fecha_fin))
  FROM nomina_novedades n
  JOIN nomina_tipos_novedad t ON t.id = n.tipo_novedad_id
  WHERE n.vinculacion_id = ${alias}.id
    AND COALESCE(n.activo, TRUE)
    AND UPPER(TRIM(t.nombre)) = 'FECHA DE RETIRO'
))`;

export const isVinculacionVigenteEnFecha = (
  vinculacion: VigenciaVinculacion,
  fecha: string
): boolean => {
  const fechaRetiro = vinculacion.fecha_retiro_efectiva ?? vinculacion.fecha_fin ?? null;
  return compareDateStrings(vinculacion.fecha_inicio, fecha) <= 0 &&
    (fechaRetiro === null || compareDateStrings(fechaRetiro, fecha) >= 0);
};

export const vinculacionSolapaIntervalo = (
  vinculacion: VigenciaVinculacion,
  inicio: string,
  fin: string
): boolean => {
  const fechaRetiro = vinculacion.fecha_retiro_efectiva ?? vinculacion.fecha_fin ?? null;
  return compareDateStrings(vinculacion.fecha_inicio, fin) <= 0 &&
    (fechaRetiro === null || compareDateStrings(fechaRetiro, inicio) >= 0);
};

export const resolveEstadoVinculacionProyectado = (
  estadoActual: string | null | undefined,
  fechaRetiroEfectiva: string | null | undefined
): EstadoVinculacionProyectado => {
  if (estadoActual === 'ANULADA') {
    return 'ANULADA';
  }

  if (fechaRetiroEfectiva) {
    return 'RETIRADA';
  }

  if (estadoActual === 'SUSPENDIDA') {
    return 'SUSPENDIDA';
  }

  return 'ACTIVA';
};
