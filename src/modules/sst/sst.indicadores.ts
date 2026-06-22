export interface SstIndicadoresBaseCounts {
  trabajadores_base: number;
  total_accidentes_trabajo: number;
  total_capacitaciones: number;
  total_enfermedades_laborales: number;
  total_entregas_epp: number;
  total_eventos: number;
  total_incidentes: number;
}

export interface SstIndicadoresPlanCounts {
  planes_abiertos: number;
  planes_cerrados: number;
  planes_vencidos: number;
}

export interface SstIndicadoresSnapshot
  extends SstIndicadoresBaseCounts,
    SstIndicadoresPlanCounts {
  porcentaje_cierre_planes: number;
  tasa_accidentalidad: number;
}

const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export const calculateTasaAccidentalidad = (
  totalAccidentesTrabajo: number,
  trabajadoresBase: number
): number => {
  if (trabajadoresBase <= 0) {
    return 0;
  }

  return roundToTwoDecimals((totalAccidentesTrabajo / trabajadoresBase) * 100);
};

export const calculatePorcentajeCierrePlanes = (
  planesCerrados: number,
  totalPlanes: number
): number => {
  if (totalPlanes <= 0) {
    return 0;
  }

  return roundToTwoDecimals((planesCerrados / totalPlanes) * 100);
};

export const buildSstIndicadoresSnapshot = (
  eventCounts: SstIndicadoresBaseCounts,
  planCounts: SstIndicadoresPlanCounts
): SstIndicadoresSnapshot => {
  const totalPlanes = planCounts.planes_abiertos + planCounts.planes_cerrados + planCounts.planes_vencidos;

  return {
    ...eventCounts,
    ...planCounts,
    tasa_accidentalidad: calculateTasaAccidentalidad(
      eventCounts.total_accidentes_trabajo,
      eventCounts.trabajadores_base
    ),
    porcentaje_cierre_planes: calculatePorcentajeCierrePlanes(
      planCounts.planes_cerrados,
      totalPlanes
    )
  };
};
