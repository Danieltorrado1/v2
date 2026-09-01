import type { NominaEmpleadoApi, NominaMovimientoApi, NominaNovedadApi } from "../../types/nomina.types";
import { addDaysToDateOnly } from "./dateOnly";

export interface PlanillaContexto {
  municipio?: string | null;
  institucion?: string | null;
  sede?: string | null;
  modalidad?: string | null;
}

export interface PlanillaCambio {
  id: string;
  vinculacion_id: string;
  fecha_inicio_efectiva: string;
  contexto_nuevo: PlanillaContexto;
  contexto_anterior: PlanillaContexto;
  tipo: string;
  activo: boolean;
}

export interface PlanillaTramo {
  inicio: string;
  fin: string;
  contexto: PlanillaContexto;
  cambioId: string | null;
}

export const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const employeeBaseContext = (employee: NominaEmpleadoApi): PlanillaContexto => ({
  municipio: employee.contexto_operativo?.municipio ?? employee.sede?.municipio ?? employee.municipio,
  institucion: employee.contexto_operativo?.institucion ?? employee.institucion,
  sede: employee.sede?.nombre_sede ?? employee.contexto_operativo?.sede,
  modalidad:
    employee.contexto_operativo?.modalidad_codigo ??
    employee.modalidad ??
    employee.categoria_salarial?.modalidad,
});

export function buildTramos(
  employee: NominaEmpleadoApi,
  periodStart: string,
  periodEnd: string,
  cambios: PlanillaCambio[],
): PlanillaTramo[] {
  const start =
    (employee.vinculacion.fecha_inicio ?? periodStart) > periodStart
      ? (employee.vinculacion.fecha_inicio ?? periodStart)
      : periodStart;
  const rawEnd = employee.vinculacion.fecha_fin ?? periodEnd;
  const end = rawEnd < periodEnd ? rawEnd : periodEnd;

  if (start > end) {
    return [];
  }

  const relevant = cambios
    .filter((cambio) => cambio.activo && cambio.fecha_inicio_efectiva >= start && cambio.fecha_inicio_efectiva <= end)
    .sort((left, right) => left.fecha_inicio_efectiva.localeCompare(right.fecha_inicio_efectiva));

  const result: PlanillaTramo[] = [];
  let cursor = start;
  let context = employeeBaseContext(employee);
  let source: string | null = null;

  for (const cambio of relevant) {
    if (cambio.fecha_inicio_efectiva > cursor) {
      result.push({
        inicio: cursor,
        fin: addDaysToDateOnly(cambio.fecha_inicio_efectiva, -1),
        contexto: context,
        cambioId: source,
      });
    }

    cursor = cambio.fecha_inicio_efectiva;
    context = cambio.contexto_nuevo;
    source = cambio.id;
  }

  result.push({ inicio: cursor, fin: end, contexto: context, cambioId: source });
  return result;
}

export const normalizeDateOnly = (value: string | null | undefined) => {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
};

export const dedupeNominaNovedades = (items: NominaNovedadApi[]) => {
  const unique = new Map<string, NominaNovedadApi>();

  for (const item of items) {
    if (!unique.has(item.id)) {
      unique.set(item.id, item);
    }
  }

  return [...unique.values()];
};

export const upsertNominaNovedad = (items: NominaNovedadApi[], next: NominaNovedadApi) => {
  const deduped = dedupeNominaNovedades(items);
  const index = deduped.findIndex((item) => item.id === next.id);

  if (index === -1) {
    return [...deduped, next];
  }

  deduped[index] = next;
  return deduped;
};

export const novedadesOnDate = (items: NominaNovedadApi[], date: string) => {
  const normalizedDate = normalizeDateOnly(date);
  if (!normalizedDate) {
    return [];
  }

  return dedupeNominaNovedades(items).filter((item) => {
    const start = normalizeDateOnly(item.fecha_inicio_evento_canonico ?? item.fecha_inicio) ?? normalizedDate;
    const end = normalizeDateOnly(item.fecha_fin_evento_canonico ?? item.fecha_fin ?? item.fecha_inicio) ?? normalizedDate;
    return item.activo && start <= normalizedDate && end >= normalizedDate;
  });
};

export const movimientosOnDate = (items: NominaMovimientoApi[], date: string) =>
  items.filter((item) => item.activo && item.fecha === date);

export const novedadCode = (item: NominaNovedadApi) =>
  item.tipo_novedad.codigo_operativo ?? item.tipo_novedad.nombre ?? "NOV";

export const novedadState = (item: NominaNovedadApi) =>
  item.revisado ? "VALIDADA" : item.tipo_novedad.requiere_revision ? "REQUIERE_REVISION" : "REGISTRADA";

export const isOutsideEmployment = (employee: NominaEmpleadoApi, date: string) =>
  (employee.vinculacion.fecha_inicio !== null && date < employee.vinculacion.fecha_inicio) ||
  (employee.vinculacion.fecha_fin !== null && date > employee.vinculacion.fecha_fin);

export const getEmploymentStatusMessage = (employee: NominaEmpleadoApi, date: string) => {
  if (employee.vinculacion.fecha_inicio !== null && date < employee.vinculacion.fecha_inicio) {
    return `Vinculacion inicia el ${employee.vinculacion.fecha_inicio}`;
  }

  if (employee.vinculacion.fecha_fin !== null && date > employee.vinculacion.fecha_fin) {
    return `Vinculacion finalizo el ${employee.vinculacion.fecha_fin}`;
  }

  return null;
};
export interface PlanillaAsistencia {
  vinculacion_id: string;
  fecha: string;
  estado_dia: string;
  activo: boolean;
}

export function mergeAttendance(
  items: PlanillaAsistencia[],
  next: PlanillaAsistencia,
  remove = false,
): PlanillaAsistencia[] {
  const key = (item: PlanillaAsistencia) => `${item.vinculacion_id}|${item.fecha}`;
  const target = key(next);
  const without = items.filter((item) => key(item) !== target);
  return remove ? without : [...without, next];
}
