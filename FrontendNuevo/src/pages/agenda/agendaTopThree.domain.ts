import { canManageAgendaAction, isAgendaDate } from './agendaOperativa.domain';

export type TopItem = { tarea_id: number; posicion: number; titulo: string };
export type TopSnapshot = { fecha: string; items: TopItem[]; tarea_ids: (number | null)[] };
export type TopWrite = { fecha: string; tarea_ids: (number | null)[]; esperado: (number | null)[] };
export type TopAction = 'place' | 'remove';
export const topToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const canManageOwnTop = (permissions: string[]) => canManageAgendaAction(permissions, 'agenda.update');
export const topPosition = (snapshot: TopSnapshot, taskId: number) => snapshot.tarea_ids.findIndex(id => Number(id) === taskId) + 1;

export function buildTopChange(snapshot: TopSnapshot, taskId: number, position: number, action: TopAction) {
  if (!Number.isSafeInteger(taskId) || taskId < 1) throw new Error('Tarea no válida.');
  if (!Number.isInteger(position) || position < 1 || position > 3) throw new Error('La posición debe ser 1, 2 o 3.');
  const slots = snapshot.tarea_ids;
  const ids = slots.filter(id => id !== null);
  if (slots.length > 3 || new Set(ids).size !== ids.length) throw new Error('Top 3 inválido. Recarga sus posiciones.');
  const next = [0, 1, 2].map(index => slots[index] ?? null);
  const current = next.indexOf(taskId);
  let confirmation = '';
  if (action === 'remove') {
    if (current < 0) throw new Error('La tarea no está en tu Top 3.');
    next[current] = null;
    confirmation = '¿Retirar esta tarea de tu Top 3?';
  } else {
    if (current === position - 1) throw new Error('La tarea ya ocupa esa posición.');
    const occupant = next[position - 1];
    const title = snapshot.items.find(item => Number(item.tarea_id) === occupant)?.titulo ?? `tarea ${occupant}`;
    if (occupant !== null) confirmation = current < 0 ? `¿Sustituir «${title}» en la posición ${position}?` : `¿Intercambiar posiciones con «${title}»?`;
    if (current >= 0) next[current] = occupant;
    next[position - 1] = taskId;
  }
  return { next, confirmation };
}

export function syncTopSummary<T extends { top_3?: TopItem[] }>(summary: T, snapshot: TopSnapshot, today: string): T {
  return snapshot.fecha === today ? { ...summary, top_3: snapshot.items } : summary;
}
export function canLeaveTop(dirty: boolean, saving: boolean, confirm: (message: string) => boolean) {
  return !saving && (!dirty || confirm('Hay una selección de Top 3 sin guardar. ¿Descartarla?'));
}
function topError(error: unknown) {
  const status = (error as { status?: number })?.status ?? 0;
  const messages: Record<number, string> = { 400: 'Revisa la fecha y la posición.', 403: 'No tienes acceso a esa tarea o permiso para gestionar tu Top 3.', 404: 'La tarea ya no está disponible.', 409: 'Tu Top 3 cambió. Recárgalo y revisa las posiciones antes de guardar.', 429: 'Demasiadas solicitudes. Espera un momento y reintenta.', 500: 'No se pudo guardar el Top 3.' };
  return { error: `${messages[status] ?? 'No se pudo conectar con Agenda.'} Tu selección se conserva.`, conflict: status === 409 };
}
type State = { fecha: string; position: number; snapshot: TopSnapshot | null; loading: boolean; saving: boolean; dirty: boolean; error: string; conflict: boolean; lastAction: TopAction | null };
export class TopThreeState {
  private state: State;
  private listeners = new Set<() => void>();
  private generation = 0;
  private taskId: number;
  constructor(taskId: number, fecha = topToday()) {
    this.taskId = taskId;
    this.state = { fecha, position: 1, snapshot: null, loading: true, saving: false, dirty: false, error: '', conflict: false, lastAction: null };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  selectDate(fecha: string) { if (!this.state.saving) { this.generation++; this.set({ fecha, dirty: true, snapshot: null, loading: true, error: '', conflict: false, lastAction: null }); } }
  selectPosition(position: number) { if (!this.state.saving) this.set({ position, dirty: true, error: '', lastAction: null }); }
  async load(request: (fecha: string) => Promise<TopSnapshot>) {
    if (this.state.saving) return;
    const generation = ++this.generation, fecha = this.state.fecha;
    if (!isAgendaDate(fecha) || fecha.startsWith('0000')) { this.set({ loading: false, error: 'Selecciona una fecha válida.' }); return; }
    this.set({ loading: true, error: '' });
    try {
      const snapshot = await request(fecha);
      if (generation !== this.generation) return;
      this.set({ snapshot, loading: false, conflict: false, ...(!this.state.dirty ? { position: topPosition(snapshot, this.taskId) || snapshot.tarea_ids.findIndex(id => id === null) + 1 || 1 } : {}) });
    } catch (error) { if (generation === this.generation) this.set({ snapshot: null, loading: false, ...topError(error) }); }
  }
  async save(action: TopAction, confirm: (message: string) => boolean, request: (payload: TopWrite) => Promise<TopSnapshot>) {
    const state = this.state;
    if (state.saving || state.loading || state.conflict || !state.snapshot || state.snapshot.fecha !== state.fecha) return;
    let change: ReturnType<typeof buildTopChange>;
    try { change = buildTopChange(state.snapshot, this.taskId, state.position, action); }
    catch (error) { this.set({ error: (error as Error).message }); return; }
    if (change.confirmation && !confirm(change.confirmation)) return;
    this.set({ saving: true, error: '', lastAction: action });
    try {
      const snapshot = await request({ fecha: state.fecha, tarea_ids: change.next, esperado: [...state.snapshot.tarea_ids] });
      this.set({ snapshot, saving: false, dirty: false, conflict: false, error: '', lastAction: null });
      return snapshot;
    } catch (error) { this.set({ saving: false, ...topError(error) }); return; }
  }
}
