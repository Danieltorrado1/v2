export type PersonalChangeKind =
  | 'PERSONA'
  | 'VINCULACION'
  | 'ASIGNACION_OPERATIVA'
  | 'POBLACION';

export interface PersonalInvalidationDetail {
  kind: PersonalChangeKind;
  personaId?: number;
  vinculacionId?: number;
}

export const PERSONAL_INVALIDATION_EVENT = 'empiria:personal-invalidated';

export function emitPersonalInvalidation(detail: PersonalInvalidationDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PersonalInvalidationDetail>(PERSONAL_INVALIDATION_EVENT, { detail }));
  }
}

export function onPersonalInvalidation(
  listener: (detail: PersonalInvalidationDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<PersonalInvalidationDetail>).detail);
  window.addEventListener(PERSONAL_INVALIDATION_EVENT, handler);
  return () => window.removeEventListener(PERSONAL_INVALIDATION_EVENT, handler);
}
