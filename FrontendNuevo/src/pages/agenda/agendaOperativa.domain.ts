export type TaskLike = { id: number; fecha_prevista: string; hora_inicio?: string | null };

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
