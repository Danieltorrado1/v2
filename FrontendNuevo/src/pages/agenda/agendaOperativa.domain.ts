export function canManageAgendaAction(permissions: string[], specific: string) {
  return permissions.includes(specific) || permissions.includes('agenda.manage');
}

export type TaskLike = { id: number; fecha_prevista: string; hora_inicio?: string | null };

export type AgendaParticipant = { id: number; nombre?: string; nombre_completo?: string; rol?: string; activo?: boolean; active?: boolean };

export function participantIds(items: Array<{ id?: number | string; usuario_id?: number | string }> = []) {
  return Array.from(new Set(items.map((item) => Number(item.id ?? item.usuario_id)).filter(Number.isSafeInteger)));
}

export function addParticipant(ids: number[], id: number, responsibleId: number) {
  if (!Number.isSafeInteger(id) || id <= 0 || id === responsibleId || ids.includes(id)) return ids;
  return [...ids, id];
}

export function removeParticipant(ids: number[], id: number) {
  return ids.filter((current) => current !== id);
}

export function validateParticipantIds(ids: number[], responsibleId: number) {
  if (new Set(ids).size !== ids.length) return 'No se permiten participantes duplicados.';
  if (ids.includes(responsibleId)) return 'El responsable principal no puede ser participante.';
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return 'La lista contiene un usuario no válido.';
  return null;
}

export function participantListIsDirty(initialIds: number[], currentIds: number[]) {
  return initialIds.length !== currentIds.length || initialIds.some((id) => !currentIds.includes(id));
}

export function activeAssignableUsers(items: AgendaParticipant[], responsibleId: number) {
  return items.filter((user) => user.activo !== false && user.active !== false && Number(user.id) !== responsibleId);
}

export function availableAssignableUsers(items: AgendaParticipant[], responsibleId: number, selectedIds: number[]) {
  return activeAssignableUsers(items, responsibleId).filter((user) => !selectedIds.includes(Number(user.id)));
}

export function participantPayload(ids: number[], responsibleId: number) {
  const error = validateParticipantIds(ids, responsibleId);
  return error ? { error, payload: null } : { error: null, payload: { participantes: [...ids] } };
}

export function mergeParticipantUpdate<T extends { participantes?: unknown[]; seguimientos?: unknown[] }>(current: T, updated: Partial<T>): T {
  return { ...current, ...updated };
}

const statesThatAllowReschedule = new Set(['PENDIENTE', 'EN_PROCESO']);
const statesThatAllowCancel = new Set(['PENDIENTE', 'EN_PROCESO']);

export function canRescheduleAgendaTask(state: string, permissions: string[]) {
  return statesThatAllowReschedule.has(state) && (permissions.includes('agenda.update') || permissions.includes('agenda.manage'));
}

export function canCancelAgendaTask(state: string, permissions: string[]) {
  return statesThatAllowCancel.has(state) && (permissions.includes('agenda.cancel') || permissions.includes('agenda.manage'));
}

export function canStartAgendaTask(state: string, permissions: string[]) {
  return (state === 'PENDIENTE' || state === 'REPROGRAMADA') && (permissions.includes('agenda.update') || permissions.includes('agenda.manage'));
}

export function canCompleteAgendaTask(state: string, permissions: string[]) {
  return (state === 'PENDIENTE' || state === 'EN_PROCESO') && (permissions.includes('agenda.complete') || permissions.includes('agenda.manage'));
}

export function canReopenAgendaTask(state: string, permissions: string[]) {
  return (state === 'TERMINADA' || state === 'CANCELADA') && (permissions.includes('agenda.reopen') || permissions.includes('agenda.manage'));
}

export function transitionPayload(version?: number) {
  return version ? { version } : {};
}

export function isAgendaDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}

export function buildReschedulePayload(input: {
  fechaActual: string;
  fechaNueva: string;
  fechaLimite?: string | null;
  motivo: string;
  version?: number;
}) {
  if (!isAgendaDate(input.fechaNueva)) return { error: 'La nueva fecha no es válida.', payload: null };
  if (input.fechaNueva === input.fechaActual) return { error: 'La nueva fecha debe ser diferente de la programación vigente.', payload: null };
  if (input.motivo.trim().length < 3) return { error: 'El motivo debe tener al menos 3 caracteres.', payload: null };
  return {
    error: null,
    payload: {
      fecha_prevista: input.fechaNueva,
      fecha_limite: input.fechaLimite ?? null,
      motivo: input.motivo.trim(),
      ...(input.version ? { version: input.version } : {}),
    },
  };
}

export function buildCancelPayload(motivo: string, version?: number) {
  if (motivo.trim().length < 3) return { error: 'El motivo debe tener al menos 3 caracteres.', payload: null };
  return { error: null, payload: { motivo: motivo.trim(), ...(version ? { version } : {}) } };
}

export function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year!, month! - 1, day! + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function weekStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year!, month! - 1, day!);
  return addDays(date, -((value.getDay() + 6) % 7));
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function groupTasksByDate<T extends TaskLike>(tasks: T[], dates: string[]) {
  return dates.map((date) => ({
    date,
    timed: tasks.filter((task) => task.fecha_prevista === date && Boolean(task.hora_inicio)),
    untimed: tasks.filter((task) => task.fecha_prevista === date && !task.hora_inicio),
  }));
}

export function closeDayPayload(input: {
  fecha: string;
  resumen_dia: string;
  observaciones: string;
  tareas: { tarea_id: number; clasificacion: 'TERMINADA' | 'PENDIENTE' | 'REPROGRAMADA' }[];
}) {
  return {
    fecha: input.fecha,
    resumen_dia: input.resumen_dia,
    observaciones: input.observaciones,
    terminadas: input.tareas.filter((task) => task.clasificacion === 'TERMINADA').map((task) => task.tarea_id),
    pendientes: input.tareas.filter((task) => task.clasificacion === 'PENDIENTE').map((task) => task.tarea_id),
    reprogramadas: input.tareas.filter((task) => task.clasificacion === 'REPROGRAMADA').map((task) => task.tarea_id),
  };
}

export function closeDayFormFromRecord(record: any) {
  const tareas = Array.isArray(record?.tareas) ? record.tareas : [];
  return {
    resumen_dia: record?.resumen_dia ?? record?.resumen ?? '',
    observaciones: record?.observaciones ?? '',
    clasificaciones: Object.fromEntries(tareas.map((task: any) => [String(task.tarea_id), task.clasificacion])) as Record<string, string>,
  };
}
