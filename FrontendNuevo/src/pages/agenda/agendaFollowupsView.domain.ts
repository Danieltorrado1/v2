import { isAgendaDate } from './agendaOperativa.domain';

export type FollowupClassification = 'vencidos' | 'hoy' | 'proximos' | 'sin_fecha';
export const classificationLabels: Record<FollowupClassification, string> = { vencidos: 'Vencidos', hoy: 'Para hoy', proximos: 'Próximos', sin_fecha: 'Sin próxima fecha' };
export type FollowupRecord = { id: number; tarea_id: number; titulo: string; tipo: string; comentario?: string | null; usuario_registro_nombre?: string | null; responsable_nombre?: string | null; created_at: string; fecha_proxima_seguimiento: string | null; clasificacion: FollowupClassification; estado: string; tipo_tarea: string; modulo_relacionado?: string | null; contexto?: Record<string, string | number | null> };
export type FollowupPage = { items: FollowupRecord[]; page: number; limit: number; total: number; hoy: string };
export type FollowupFilters = { filtro: string; responsable_id: string; tipo_tarea: string; modulo_relacionado: string; desde: string; hasta: string; q: string };
export const emptyFollowupFilters: FollowupFilters = { filtro: '', responsable_id: '', tipo_tarea: '', modulo_relacionado: '', desde: '', hasta: '', q: '' };
export const followupLimits = [10, 25, 50, 100];
export const hasFollowupFilters = (filters: FollowupFilters) => Object.values(filters).some(value => value.trim() !== '');
export const totalFollowupPages = (total: number, limit: number) => Math.max(1, Math.ceil(total / limit));
export function followupQuery(filters: FollowupFilters, page: number, limit: number) {
  for (const date of [filters.desde, filters.hasta]) if (date && !isAgendaDate(date)) throw new Error('Revisa las fechas del rango.');
  if (filters.desde && filters.hasta && filters.desde > filters.hasta) throw new Error('Desde debe ser anterior o igual a Hasta.');
  if (!Number.isInteger(page) || page < 1 || !followupLimits.includes(limit)) throw new Error('Paginación inválida.');
  return { page, limit, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim()).map(([key, value]) => [key, key === 'responsable_id' ? Number(value) : value.trim()])) } as Record<string, string | number>;
}
export function followupsError(error: unknown) {
  const value = error as { status?: number; retryAfterMs?: number | null; message?: string };
  if (value?.status === 429) return `Demasiadas solicitudes. ${value.retryAfterMs != null ? `Reintenta después de ${Math.ceil(value.retryAfterMs / 1000)} segundos.` : 'Espera un momento y reintenta.'} Se conservan filtros y resultados.`;
  return value?.message || 'No fue posible cargar los seguimientos. Puedes reintentar.';
}
export function followupEmptyMessage(filters: FollowupFilters) { return hasFollowupFilters(filters) ? 'No hay seguimientos que coincidan con los filtros.' : 'Todavía no hay seguimientos.'; }
export function relatedFollowupTask(item: FollowupRecord, open: (id: number) => void) { open(Number(item.tarea_id)); }
export function followupContext(context: FollowupRecord['contexto']) {
  const labels: Record<string, string> = { municipio_id: 'Municipio', institucion_id: 'Institución', sede_id: 'Sede', persona_id: 'Persona', vinculacion_id: 'Vinculación' };
  const parts = Object.entries(labels).flatMap(([key, label]) => context?.[key] ? [`${label} #${context[key]}`] : []);
  if (context?.tipo_entidad_relacionada && context.entidad_relacionada_id) parts.push(`${context.tipo_entidad_relacionada} #${context.entidad_relacionada_id}`);
  return parts;
}
export type FollowupsState = { filters: FollowupFilters; page: number; limit: number; result: FollowupPage | null; loading: boolean; loaded: boolean; error: string };
export class FollowupsListState {
  private state: FollowupsState = { filters: { ...emptyFollowupFilters }, page: 1, limit: 25, result: null, loading: false, loaded: false, error: '' };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private active = false;
  private stale = true;
  private request: (params: Record<string, string | number>) => Promise<FollowupPage>;
  constructor(request: (params: Record<string, string | number>) => Promise<FollowupPage>) { this.request = request; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<FollowupsState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (active) { if (this.stale || !this.state.loaded) void this.load(); }
    else { clearTimeout(this.timer); this.timer = undefined; this.generation++; this.stale = this.stale || this.state.loading; this.set({ loading: false }); }
  }
  private schedule(delay: number) {
    clearTimeout(this.timer); this.generation++; this.stale = true;
    if (!this.active) return;
    this.set({ loading: true, error: '' });
    this.timer = setTimeout(() => { this.timer = undefined; void this.load(); }, delay);
  }
  setFilter(key: keyof FollowupFilters, value: string) {
    if (this.state.filters[key] === value) return;
    this.set({ filters: { ...this.state.filters, [key]: value }, page: 1 });
    this.schedule(key === 'q' ? 300 : 0);
  }
  clearFilters() { this.set({ filters: { ...emptyFollowupFilters }, page: 1 }); this.schedule(0); }
  setLimit(limit: number) { if (!followupLimits.includes(limit) || limit === this.state.limit) return; this.set({ limit, page: 1 }); this.schedule(0); }
  goPage(page: number) {
    if (this.state.loading || !Number.isInteger(page) || page < 1 || page > totalFollowupPages(this.state.result?.total ?? 0, this.state.limit) || page === this.state.page) return;
    this.set({ page }); void this.load();
  }
  refresh() { this.stale = true; if (!this.timer) this.schedule(100); }
  retry() { if (!this.state.loading) void this.load(); }
  private async load() {
    if (!this.active) return;
    clearTimeout(this.timer); this.timer = undefined;
    const generation = ++this.generation;
    let params: Record<string, string | number>;
    try { params = followupQuery(this.state.filters, this.state.page, this.state.limit); }
    catch (error) { this.set({ loading: false, error: followupsError(error) }); return; }
    this.set({ loading: true, error: '' });
    try {
      const result = await this.request(params);
      if (generation !== this.generation) return;
      if (this.state.page > totalFollowupPages(result.total, this.state.limit)) { this.set({ page: 1 }); await this.load(); return; }
      this.stale = false; this.set({ result, loading: false, loaded: true });
    } catch (error) { if (generation === this.generation) this.set({ loading: false, error: followupsError(error) }); }
  }
}
