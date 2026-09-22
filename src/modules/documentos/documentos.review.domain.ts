export type ReviewState = 'PENDIENTE_REVISION' | 'APROBADO' | 'RECHAZADO';
export type DocumentState = 'SIN_DOCUMENTO' | ReviewState | 'POR_VENCER' | 'VENCIDO' | 'NO_APLICA';
export interface DocumentPolicy {
  kind: 'NORMAL' | 'RESIDENCIA' | 'ANTECEDENTE' | 'SISBEN' | 'EXPERIENCIA' | 'EXISTENTE';
  emission: boolean; expiration: boolean; months: number | null; days: number | null; warningDays: number;
}
export function documentPolicy(code: string, type: { requiere_fecha_expedicion?: boolean; requiere_fecha_vencimiento?: boolean; tiene_vencimiento?: boolean; vigencia_dias_default?: number | null; dias_alerta_amarilla?: number } = {}): DocumentPolicy {
  const base: DocumentPolicy = { kind: 'NORMAL', emission: false, expiration: false, months: null, days: null, warningDays: type.dias_alerta_amarilla ?? 30 };
  if (code === 'RESIDENCIA') return { ...base, kind: 'RESIDENCIA', emission: true, expiration: true, months: 6 };
  if (['ANT_CONTRALORIA','ANT_PROCURADURIA','ANT_JUDICIALES','ANT_MEDIDAS_CORRECTIVAS','ANT_REDAM','ANT_INHABILIDADES'].includes(code)) return { ...base, kind: 'ANTECEDENTE', emission: true, months: 4 };
  if (code === 'SISBEN') return { ...base, kind: 'SISBEN' };
  if (code === 'CERT_LABORAL') return { ...base, kind: 'EXPERIENCIA' };
  if (['MANIPULACION','EXAMEN_OCUPACIONAL'].includes(code)) return { ...base, kind: 'EXISTENTE', emission: !!type.requiere_fecha_expedicion, expiration: !!type.requiere_fecha_vencimiento || !!type.tiene_vencimiento, days: type.vigencia_dias_default ?? null };
  return base;
}
export function addCalendarMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00Z`); const day = value.getUTCDate();
  value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, last)); return value.toISOString().slice(0, 10);
}
export interface SpecialMetadata { experiencia_inicio?: string | null; experiencia_fin?: string | null; sisben?: string | null }
export function normalizeDocumentMetadata(policy: DocumentPolicy, input: { fecha_expedicion?: string | null; fecha_vencimiento?: string | null } & SpecialMetadata) {
  let emission = policy.emission ? input.fecha_expedicion ?? null : null;
  let expiration = policy.expiration ? input.fecha_vencimiento ?? null : null;
  if (policy.emission && !emission) throw new Error('La fecha de emisión es obligatoria.');
  if (policy.months && emission) expiration = policy.kind === 'ANTECEDENTE' ? addCalendarMonths(emission, policy.months) : expiration ?? addCalendarMonths(emission, policy.months);
  if (policy.days && emission && !expiration) { const d = new Date(`${emission}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + policy.days); expiration = d.toISOString().slice(0,10); }
  if (policy.expiration && !expiration) throw new Error('La fecha de vencimiento definida para este documento es obligatoria.');
  if (emission && expiration && expiration < emission) throw new Error('El vencimiento no puede ser anterior a la emisión.');
  const metadata: SpecialMetadata = {};
  if (policy.kind === 'SISBEN') { if (!input.sisben?.trim()) throw new Error('Registra la categoría/subgrupo SISBEN.'); metadata.sisben = input.sisben.trim(); }
  if (policy.kind === 'EXPERIENCIA') {
    if (!!input.experiencia_inicio !== !!input.experiencia_fin) throw new Error('Registra ambas fechas de experiencia.');
    if (input.experiencia_inicio && input.experiencia_fin && input.experiencia_fin < input.experiencia_inicio) throw new Error('El fin de experiencia no puede ser anterior al inicio.');
    metadata.experiencia_inicio = input.experiencia_inicio ?? null; metadata.experiencia_fin = input.experiencia_fin ?? null;
  }
  return { fecha_expedicion: emission, fecha_vencimiento: expiration, metadata };
}
export function documentState(document: { estado_revision?: string | null; fecha_expedicion?: string | null; fecha_vencimiento?: string | null } | null, policy: DocumentPolicy, today = new Date().toISOString().slice(0,10)): DocumentState {
  if (!document) return 'SIN_DOCUMENTO';
  if (document.estado_revision === 'RECHAZADO') return 'RECHAZADO';
  if (document.estado_revision !== 'APROBADO') return 'PENDIENTE_REVISION';
  let expiration = policy.expiration ? document.fecha_vencimiento : null;
  if (policy.months && document.fecha_expedicion) expiration = policy.kind === 'ANTECEDENTE' ? addCalendarMonths(document.fecha_expedicion, policy.months) : expiration ?? addCalendarMonths(document.fecha_expedicion, policy.months);
  if (expiration) {
    const days = Math.round((Date.parse(expiration) - Date.parse(today)) / 86400000);
    if (days < 0) return 'VENCIDO';
    if (days <= policy.warningDays) return 'POR_VENCER';
  }
  return 'APROBADO';
}
export const countsAsApproved = (state: string) => state === 'APROBADO' || state === 'POR_VENCER';
// Merge overlapping periods instead of counting concurrent experience twice.
export function experienceDays(records: SpecialMetadata[]): number {
  const ranges = records.filter(r => r.experiencia_inicio && r.experiencia_fin).map(r => [Date.parse(r.experiencia_inicio!), Date.parse(r.experiencia_fin!)]).sort((a,b) => a[0]! - b[0]!);
  let start: number | undefined; let end = 0; let days = 0;
  for (const range of ranges) { const a = range[0]!; const b = range[1]!; if (start === undefined) { start = a; end = b; } else if (a <= end + 86400000) end = Math.max(end,b); else { days += (end-start)/86400000+1; start=a; end=b; } }
  return days + (start === undefined ? 0 : (end-start)/86400000+1);
}
