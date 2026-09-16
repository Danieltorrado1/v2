import { canManageAgendaAction, isAgendaDate } from './agendaOperativa.domain';

export const manualFollowupTypes = ['COMENTARIO', 'EVIDENCIA'] as const;
export type FollowupDraft = { tipo: string; comentario: string; fecha: string; requiere: boolean };
export type FollowupPayload = { tipo: 'COMENTARIO' | 'EVIDENCIA'; comentario: string; fecha_proxima_seguimiento: string | null; requiere_seguimiento: boolean };
export const canAddAgendaFollowup = (permissions: string[]) => canManageAgendaAction(permissions, 'agenda.update');

export function buildFollowupPayload(draft: FollowupDraft): FollowupPayload {
  if (!manualFollowupTypes.includes(draft.tipo as FollowupPayload['tipo'])) throw new Error('Selecciona un tipo de seguimiento manual.');
  if (!draft.comentario.trim()) throw new Error('El comentario es obligatorio.');
  if (draft.comentario.trim().length > 5000) throw new Error('El comentario admite hasta 5000 caracteres.');
  if (draft.fecha && (!isAgendaDate(draft.fecha) || draft.fecha.startsWith('0000'))) throw new Error('La próxima fecha no es válida. Usa YYYY-MM-DD.');
  return { tipo: draft.tipo as FollowupPayload['tipo'], comentario: draft.comentario.trim(), fecha_proxima_seguimiento: draft.fecha || null, requiere_seguimiento: draft.requiere };
}

export function followupErrorMessage(value: unknown) {
  const status = (value as { status?: number })?.status;
  const messages: Record<number, string> = {
    400: 'Revisa los datos del seguimiento.', 403: 'No tienes permiso para registrar este seguimiento.',
    404: 'La tarea ya no está disponible.', 429: 'Hay demasiadas solicitudes. Espera un momento antes de reintentar.',
  };
  return `${messages[status ?? 0] ?? (status && status >= 500 ? 'El servidor no pudo guardar el seguimiento.' : value instanceof Error ? value.message : 'No fue posible guardar el seguimiento.')} El borrador se conserva.`;
}

export function followupDraftIsDirty(draft: FollowupDraft, initial: FollowupDraft) {
  return (Object.keys(draft) as (keyof FollowupDraft)[]).some(key => draft[key] !== initial[key]);
}

export function allowFollowupDiscard(dirty: boolean, saving: boolean, confirm: (message: string) => boolean) {
  return !saving && (!dirty || confirm('Hay cambios sin guardar. ¿Descartarlos?'));
}

// A synchronous lock protects the interval before React renders disabled controls.
export class FollowupFormState {
  private listeners = new Set<() => void>();
  private state: { draft: FollowupDraft; saving: boolean; saved: boolean; error: string };
  readonly initial: FollowupDraft;
  constructor(initial: FollowupDraft) {
    this.initial = { ...initial };
    this.state = { draft: { ...initial }, saving: false, saved: false, error: '' };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  change(patch: Partial<FollowupDraft>) {
    if (this.state.saving || this.state.saved) return;
    this.state = { ...this.state, draft: { ...this.state.draft, ...patch }, error: '' };
    this.emit();
  }
  async save<T>(request: (payload: FollowupPayload) => Promise<T>): Promise<{ result: T; payload: FollowupPayload } | undefined> {
    if (this.state.saving || this.state.saved) return;
    let payload: FollowupPayload;
    try { payload = buildFollowupPayload(this.state.draft); }
    catch (error) { this.state = { ...this.state, error: (error as Error).message }; this.emit(); return; }
    this.state = { ...this.state, saving: true, error: '' }; this.emit();
    try {
      const result = await request(payload);
      this.state = { draft: { tipo: 'COMENTARIO', comentario: '', fecha: '', requiere: false }, saving: false, saved: true, error: '' };
      this.emit();
      return { result, payload };
    } catch (error) {
      this.state = { ...this.state, saving: false, error: followupErrorMessage(error) }; this.emit();
      return;
    }
  }
}

export function mergeSavedFollowup<T extends { seguimientos: any[] }>(detail: T, item: any, payload: FollowupPayload): T {
  return { ...detail, fecha_proxima_seguimiento: payload.fecha_proxima_seguimiento, requiere_seguimiento: payload.requiere_seguimiento,
    seguimientos: [...detail.seguimientos.filter(entry => String(entry.id) !== String(item.id)), { ...item, fecha_proxima_seguimiento: payload.fecha_proxima_seguimiento }] };
}

export async function refreshFollowupDetail<T>(getDetail: () => Promise<T>, reload: () => Promise<unknown>, apply: (detail: T) => void) {
  const [detail, refreshed] = await Promise.allSettled([getDetail(), reload()]);
  if (detail.status === 'fulfilled') apply(detail.value);
  if (detail.status === 'rejected') throw detail.reason;
  if (refreshed.status === 'rejected') throw refreshed.reason;
}

export function followupTimestamp(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
