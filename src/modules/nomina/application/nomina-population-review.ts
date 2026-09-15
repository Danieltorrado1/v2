import { classifyNominaMultipleLinks, intersectsNominaPeriodo, type NominaPopulationLink } from '../nomina.population';

export interface NominaImportCandidateForReview {
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  metodo_pago: string | null;
  persona_id: string;
  tipo_vinculacion_codigo: string | null;
  vinculacion_id: string;
}

const dateString = (value: Date | string | null): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};

export const buildImportCandidateReviewSet = (
  candidates: NominaImportCandidateForReview[],
  periodoFechaInicio: string,
  periodoFechaFin: string
): Set<string> => {
  const byPersona = new Map<string, NominaPopulationLink[]>();

  for (const candidate of candidates) {
    const current = byPersona.get(candidate.persona_id) ?? [];
    current.push({
      vinculacion_id: candidate.vinculacion_id,
      persona_id: candidate.persona_id,
      fecha_inicio: dateString(candidate.fecha_inicio) ?? periodoFechaInicio,
      fecha_fin: dateString(candidate.fecha_fin),
      metodo_pago: candidate.metodo_pago,
      tipo_vinculacion_codigo: candidate.tipo_vinculacion_codigo
    });
    byPersona.set(candidate.persona_id, current);
  }

  const reviewSet = new Set<string>();
  for (const links of byPersona.values()) {
    const classification = classifyNominaMultipleLinks(links, periodoFechaInicio, periodoFechaFin);
    if (classification === 'SOLAPADA' || classification === 'REQUIERE_REVISION') {
      for (const link of links) {
        if (intersectsNominaPeriodo(link.fecha_inicio, link.fecha_fin, periodoFechaInicio, periodoFechaFin)) {
          reviewSet.add(link.vinculacion_id);
        }
      }
    }
  }
  return reviewSet;
};
