import { countsAsApproved, type DocumentPolicy, type DocumentState } from './documentos.review.domain';

export type ManipulationMode = 'COMBINADO' | 'SEPARADO';
export interface ManipulationMetadata {
  manipulacion_modalidad?: ManipulationMode;
  componentes?: string[];
  manipulacion_policy?: DocumentPolicy;
}
export interface ManipulationEvidence {
  metadata?: ManipulationMetadata | null;
  /** Explicit component from the canonical alias. Legacy general documents have null. */
  component?: string | null;
}
export function combinedManipulationPolicy(policies: DocumentPolicy[]): DocumentPolicy {
  const days = policies.flatMap(p=>p.days ? [p.days] : []);
  return {kind:'EXISTENTE',emission:policies.some(p=>p.emission),expiration:policies.some(p=>p.expiration),
    months:null,days:days.length ? Math.min(...days) : null,warningDays:Math.max(30,...policies.map(p=>p.warningDays))};
}
export const isCombined = (metadata?: ManipulationMetadata | null) =>
  metadata?.manipulacion_modalidad === 'COMBINADO';

export function inferManipulationMode(stored: ManipulationMode | null, documents: ManipulationEvidence[]): ManipulationMode | null {
  if (stored) return stored;
  if (!documents.length) return null;
  if (documents.some(d => isCombined(d.metadata))) return 'COMBINADO';
  const explicit = documents.filter(d => d.component === 'CURSO' || d.component === 'EXAMENES');
  const general = documents.filter(d => !d.component);
  // A pre-modalidad MANIPULACION record is a single general support. It is
  // the documented legacy equivalent of the combined PDF, but two explicit
  // components remain separated even when their metadata is empty.
  if (general.length === 1 && explicit.length === 0) return 'COMBINADO';
  return 'SEPARADO';
}

export function aggregateManipulation(states: DocumentState[]): DocumentState | 'PARCIAL' {
  for (const state of ['RECHAZADO', 'VENCIDO', 'PENDIENTE_REVISION'] as const) {
    if (states.includes(state)) return state;
  }
  if (states.length === 2 && states.every(countsAsApproved)) return states.includes('POR_VENCER') ? 'POR_VENCER' : 'APROBADO';
  return states.some(countsAsApproved) ? 'PARCIAL' : 'SIN_DOCUMENTO';
}
