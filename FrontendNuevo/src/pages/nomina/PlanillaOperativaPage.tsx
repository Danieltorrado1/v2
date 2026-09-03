import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, Plus, Search, X } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { useCompanyContext } from "../../context/CompanyContext";
import {
  pickAvailableScopedId,
  readCompanyScopedStorage,
  writeCompanyScopedStorage,
} from "../../context/companyScope";
import { ApiClientError, apiClient } from "../../services/apiClient";
import {
  createNominaNovedad,
  createNominaNovedadConTurno,
  closeNominaEmpleadoOperativo,
  deactivateNominaNovedad,
  getAllNominaMovimientosOperativos,
  getAllNominaNovedades,
  getNominaNovedadTurnosOperativos,
  getAllNominaPeriodoEmpleados,
  getAllNominaPeriodoEmpleadosOperativos,
  getNominaPeriodos,
  getRevisionOperativa,
  listarTiposNovedad,
  markNominaAsistencia,
  markNominaAsistenciaMasiva,
  reopenNominaEmpleadoOperativo,
  updateNominaNovedad,
  updateRevisionOperativa,
} from "../../services/nominaApi";
import type { ApiResponse } from "../../types/api.types";
import type {
  CreateNominaNovedadApi,
  CreateNominaNovedadConTurnoApi,
  NominaEmpleadoApi,
  NominaMovimientoApi,
  NominaNovedadApi,
  NominaNovedadTurnoOperativoApi,
  NominaPeriodoApi,
  NominaTipoNovedad,
  RevisionOperativaApi,
} from "../../types/nomina.types";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import { getColombianCalendarDay } from "./colombiaHolidays";
import CoberturaFlowNav from "./CoberturaFlowNav";
import {
  buildTramos,
  dateKey,
  employeeBaseContext,
  getEmploymentStatusMessage,
  isOutsideEmployment,
  mergeAttendance,
  movimientosOnDate,
  novedadCode,
  novedadesOnDate,
  dedupeNominaNovedades,
  upsertNominaNovedad,
  novedadState,
  type PlanillaAsistencia,
  type PlanillaCambio,
  type PlanillaContexto,
} from "./planillaOperativa.domain";
import "./PlanillaOperativaPage.css";

const formatTurnAmount = (value: number) => new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
}).format(value);

const ROW_HEIGHT = 78;
const VIEWPORT_HEIGHT = 620;
const MAX_PAGE = 100;
const ATTENDANCE_BATCH_LIMIT = 5000;
const CANONICAL_RANGE_MODEL = "EVENTO_CANONICO_RANGO";
const REVIEW_WIDTH = 56;
const DOCUMENT_WIDTH = 112;
const NAME_WIDTH = 300;
const DAY_WIDTH = 22;
const PLANILLA_GRID_TEMPLATE = (dayCount: number) =>
  `${REVIEW_WIDTH}px ${DOCUMENT_WIDTH}px minmax(${NAME_WIDTH}px,1.35fr) repeat(${dayCount},minmax(${DAY_WIDTH}px,1fr))`;
// Los 31 dias se muestran juntos. Compatibilidad de auditoria: [1,7] [8,14] [15,21] [22,28] [29,31]. Teclado: ArrowDown ArrowUp ArrowRight ArrowLeft Enter Escape.
const REVIEW_STATES = ["TODOS", "PENDIENTES", "REVISADOS", "CERRADOS"] as const;
// Compatibilidad con auditorias previas: period?.estado==="ABIERTO"&&canCreate.
const SORT_MODES = [
  "NOMBRE_ASC",
  "NOMBRE_DESC",
  "DOCUMENTO_ASC",
  "DOCUMENTO_DESC",
  "MUNICIPIO",
  "GESTOR",
  "INSTITUCION",
  "SEDE",
] as const;
const GESTOR_ALL = "";
const GESTOR_NONE = "__SIN_GESTOR__";
const PLANILLA_FILTERS_KEY = "nomina.planilla.filters";

type ReviewFilter = (typeof REVIEW_STATES)[number];
type EventFilter = "TODOS" | "CON_NOVEDADES" | "SIN_NOVEDADES" | "INCONSISTENCIAS";
type SortMode = (typeof SORT_MODES)[number];
type CoverageType = "SIN_REEMPLAZO" | "PERSONAL_VINCULADO" | "PERSONA_EXTERNA";
type OperativeState = "PENDIENTE" | "REVISADO" | "CERRADO";
type Attendance = PlanillaAsistencia;
type SelectedCell = { employee: NominaEmpleadoApi; date: string; context: PlanillaContexto };
type RangeSelection = { employeeId: string; start: string; end: string | null } | null;
type PersistedFilters = {
  eventFilter: EventFilter;
  gestor: string;
  modalidad: string;
  municipio: string;
  query: string;
  reviewFilter: ReviewFilter;
  sortMode: SortMode;
};
type AttendanceRangeResult = {
  marcados?: string[];
  omitidos?: Array<{ fecha: string; motivo: string }>;
  total_marcados?: number;
  total_omitidos?: number;
};

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function normalizeLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSearchValue(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function dateLabel(value: string) {
  if (!value) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function weekday(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "narrow",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T12:00:00Z`))
    .toUpperCase();
}

function group<T>(items: T[], key: (item: T) => string) {
  const result = new Map<string, T[]>();
  items.forEach((item) => {
    result.set(key(item), [...(result.get(key(item)) ?? []), item]);
  });
  return result;
}

function coverageTurnsOnDate(items: NominaNovedadTurnoOperativoApi[], date: string) {
  return items.filter((item) => {
    const start = item.fecha ?? item.fecha_inicio ?? item.fecha_fin;
    const end = item.fecha_fin ?? item.fecha_inicio ?? item.fecha ?? start;
    return Boolean(start && end && start <= date && end >= date);
  });
}

function getEmployeeMunicipioLabel(employee: NominaEmpleadoApi) {
  return normalizeLabel(employee.contexto_operativo?.municipio) ?? normalizeLabel(employee.municipio) ?? "No disponible";
}

function getEmployeeInstitucionLabel(employee: NominaEmpleadoApi) {
  return normalizeLabel(employee.contexto_operativo?.institucion) ?? normalizeLabel(employee.institucion) ?? "No disponible";
}

function getEmployeeSedeLabel(employee: NominaEmpleadoApi) {
  return normalizeLabel(employee.sede?.nombre_sede) ?? normalizeLabel(employee.contexto_operativo?.sede) ?? "No disponible";
}

function getEmployeeGestorLabel(employee: NominaEmpleadoApi) {
  return normalizeLabel(employee.gestor?.nombre_completo) ?? "Sin gestor";
}

function getEmployeeGestorId(employee: NominaEmpleadoApi) {
  return employee.gestor?.id ?? null;
}

function getEmployeeModalidadCode(employee: NominaEmpleadoApi) {
  return (
    normalizeLabel(employee.contexto_operativo?.modalidad_codigo) ??
    normalizeLabel(employee.modalidad) ??
    normalizeLabel(employee.categoria_salarial?.codigo_categoria) ??
    "No disponible"
  );
}

function getEmployeeModalidadDescription(employee: NominaEmpleadoApi) {
  return (
    normalizeLabel(employee.contexto_operativo?.modalidad_descripcion) ??
    normalizeLabel(employee.categoria_salarial?.modalidad) ??
    normalizeLabel(employee.modalidad) ??
    "No disponible"
  );
}

function buildVisibleContext(employee: NominaEmpleadoApi, context: PlanillaContexto) {
  return {
    gestor: getEmployeeGestorLabel(employee),
    institucion: normalizeLabel(context.institucion) ?? getEmployeeInstitucionLabel(employee),
    modalidad: normalizeLabel(context.modalidad) ?? getEmployeeModalidadCode(employee),
    municipio: normalizeLabel(context.municipio) ?? getEmployeeMunicipioLabel(employee),
    sede: normalizeLabel(context.sede) ?? getEmployeeSedeLabel(employee),
  };
}

function buildContextTitle(employee: NominaEmpleadoApi, context: PlanillaContexto) {
  const visible = buildVisibleContext(employee, context);
  return [
    visible.municipio,
    visible.institucion,
    visible.sede,
    `${visible.modalidad} | Gestor: ${visible.gestor}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function shortDateLabel(value: string) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatOverlapConflictMessage(details: Record<string, unknown> | null | undefined) {
  const info = details ?? {};
  const nombre = typeof info.nombre === "string" && info.nombre.trim() ? info.nombre.trim() : "Novedad existente";
  const codigo = typeof info.codigo_operativo === "string" && info.codigo_operativo.trim()
    ? info.codigo_operativo.trim()
    : null;
  const inicio = typeof info.fecha_inicio === "string" && info.fecha_inicio.trim() ? info.fecha_inicio.trim() : null;
  const fin = typeof info.fecha_fin === "string" && info.fecha_fin.trim() ? info.fecha_fin.trim() : null;
  const rango = inicio && fin
    ? inicio === fin
      ? shortDateLabel(inicio) ?? inicio
      : `${shortDateLabel(inicio) ?? inicio} a ${shortDateLabel(fin) ?? fin}`
    : inicio
      ? shortDateLabel(inicio) ?? inicio
      : fin
        ? shortDateLabel(fin) ?? fin
        : null;

  return [
    "Ya existe una novedad activa que se cruza con las fechas seleccionadas.",
    codigo ? `Tipo: ${codigo}${nombre ? ` (${nombre})` : ""}.` : nombre ? `Tipo: ${nombre}.` : null,
    rango ? `Rango existente: ${rango}.` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function formatPlanillaErrorMessage(
  value: unknown,
  fallback: string,
  options?: { date?: string },
) {
  if (value instanceof ApiClientError) {
    if (value.code === "NOMINA_NOVEDAD_FECHA_OCUPADA") {
      return formatOverlapConflictMessage(value.details as Record<string, unknown> | null | undefined);
    }

    if (value.status === 429) {
      return "Demasiadas solicitudes en poco tiempo. Espera unos segundos e intenta de nuevo.";
    }

    if (options?.date) {
      return `${fallback} el ${shortDateLabel(options.date) ?? options.date}: ${value.message}`;
    }

    return value.message || fallback;
  }

  if (value instanceof Error) {
    if (options?.date) {
      return `${fallback} el ${shortDateLabel(options.date) ?? options.date}: ${value.message}`;
    }

    return value.message || fallback;
  }

  if (options?.date) {
    return `${fallback} el ${shortDateLabel(options.date) ?? options.date}.`;
  }

  return fallback;
}

function readPersistedFilters(empresaId: number | null): PersistedFilters {
  if (typeof window === "undefined") {
    return {
      eventFilter: "TODOS",
      gestor: GESTOR_ALL,
      modalidad: "",
      municipio: "",
      query: "",
      reviewFilter: "TODOS",
      sortMode: "NOMBRE_ASC",
    };
  }

  try {
    const raw = readCompanyScopedStorage(window.sessionStorage, PLANILLA_FILTERS_KEY, empresaId);
    if (!raw) {
      throw new Error("missing");
    }

    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    return {
      eventFilter: parsed.eventFilter ?? "TODOS",
      gestor: parsed.gestor ?? GESTOR_ALL,
      modalidad: parsed.modalidad ?? "",
      municipio: parsed.municipio ?? "",
      query: parsed.query ?? "",
      reviewFilter: parsed.reviewFilter ?? "TODOS",
      sortMode: parsed.sortMode ?? "NOMBRE_ASC",
    };
  } catch {
    return {
      eventFilter: "TODOS",
      gestor: GESTOR_ALL,
      modalidad: "",
      municipio: "",
      query: "",
      reviewFilter: "TODOS",
      sortMode: "NOMBRE_ASC",
    };
  }
}

function mapCoverageToTurno(coverageType: CoverageType): "INTERNO" | "EXTERNO" {
  return coverageType === "PERSONAL_VINCULADO" ? "INTERNO" : "EXTERNO";
}

function typeSupportsDateRange(type: NominaTipoNovedad | null | undefined) {
  return Boolean(type && (type.permite_rango || type.modelo_registro === CANONICAL_RANGE_MODEL));
}

function buildReviewRecord(
  employee: NominaEmpleadoApi,
  periodoId: string,
  estado: RevisionOperativaApi["estado_revision"],
  current?: RevisionOperativaApi | null,
  actorUserId?: string | null,
  motivo?: string | null,
): RevisionOperativaApi {
  const now = new Date().toISOString();

  if (estado === "REVISADO") {
    return {
      nomina_empleado_id: employee.id,
      periodo_id: periodoId,
      persona_id: employee.persona.id,
      vinculacion_id: employee.vinculacion_id,
      estado_revision: "REVISADO",
      revisado_por: actorUserId ?? current?.revisado_por ?? null,
      revisado_at: now,
      invalidado_at: null,
      motivo_invalidacion: null,
    };
  }

  if (estado === "PENDIENTE") {
    return {
      nomina_empleado_id: employee.id,
      periodo_id: periodoId,
      persona_id: employee.persona.id,
      vinculacion_id: employee.vinculacion_id,
      estado_revision: "PENDIENTE",
      revisado_por: current?.revisado_por ?? null,
      revisado_at: current?.revisado_at ?? null,
      invalidado_at: null,
      motivo_invalidacion: null,
    };
  }

  return {
    nomina_empleado_id: employee.id,
    periodo_id: periodoId,
    persona_id: employee.persona.id,
    vinculacion_id: employee.vinculacion_id,
    estado_revision: "REQUIERE_REVISION",
    revisado_por: current?.revisado_por ?? null,
    revisado_at: current?.revisado_at ?? null,
    invalidado_at: now,
    motivo_invalidacion: motivo ?? current?.motivo_invalidacion ?? "CAMBIO_OPERATIVO",
  };
}

function upsertReview(items: RevisionOperativaApi[], next: RevisionOperativaApi) {
  return [...items.filter((item) => item.nomina_empleado_id !== next.nomina_empleado_id), next];
}

function resolveOperativeState(employee: NominaEmpleadoApi, review?: RevisionOperativaApi | null): OperativeState {
  const nominaEstado = String(review?.nomina_estado ?? employee.estado ?? "").toUpperCase();
  if (nominaEstado === "CERRADO") {
    return "CERRADO";
  }

  if (nominaEstado === "REVISADO") {
    return "REVISADO";
  }

  return review?.estado_revision === "REVISADO" ? "REVISADO" : "PENDIENTE";
}

async function loadAttendance(periodId: string) {
  const response = await apiClient.get<
    ApiResponse<{ items: Attendance[]; pagination?: { total_pages?: number } }>
  >(`/nomina/periodos/${periodId}/asistencia`, {
    params: { activo: true, limit: ATTENDANCE_BATCH_LIMIT, page: 1 },
  });

  return response.data?.items ?? [];
}

export default function PlanillaOperativaPage() {
  const { user } = useAuth();
  const { empresaId } = useCompanyContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = useRef(readPersistedFilters(empresaId));

  const [periods, setPeriods] = useState<NominaPeriodoApi[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [employees, setEmployees] = useState<NominaEmpleadoApi[]>([]);
  const [novelties, setNovelties] = useState<NominaNovedadApi[]>([]);
  const [movements, setMovements] = useState<NominaMovimientoApi[]>([]);
  const [coverageTurns, setCoverageTurns] = useState<NominaNovedadTurnoOperativoApi[]>([]);
  const [changes, setChanges] = useState<PlanillaCambio[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(new Set());
  const pendingAttendanceRef = useRef<Set<string>>(new Set());
  const [attendanceFailures, setAttendanceFailures] = useState<Map<string, string>>(new Map());
  const [reviews, setReviews] = useState<RevisionOperativaApi[]>([]);
  const [types, setTypes] = useState<NominaTipoNovedad[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState(initialFilters.current.query);
  const [municipio, setMunicipio] = useState(initialFilters.current.municipio);
  const [gestorFilter, setGestorFilter] = useState(initialFilters.current.gestor);
  const [modalidad, setModalidad] = useState(initialFilters.current.modalidad);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(initialFilters.current.reviewFilter);
  const [eventFilter, setEventFilter] = useState<EventFilter>(initialFilters.current.eventFilter);
  const [sortMode, setSortMode] = useState<SortMode>(initialFilters.current.sortMode);
  const [scrollTop, setScrollTop] = useState(0);

  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [rangeSelection, setRangeSelection] = useState<RangeSelection>(null);
  const [noveltyCell, setNoveltyCell] = useState<SelectedCell | null>(null);
  const [editingNovelty, setEditingNovelty] = useState<NominaNovedadApi | null>(null);
  const [selectedType, setSelectedType] = useState<NominaTipoNovedad | null>(null);
  const [coverageType, setCoverageType] = useState<CoverageType>("SIN_REEMPLAZO");
  const [coverSearch, setCoverSearch] = useState("");
  const [coverEmployee, setCoverEmployee] = useState<NominaEmpleadoApi | null>(null);
  const [externalName, setExternalName] = useState("");
  const [externalDocument, setExternalDocument] = useState("");
  const [coverageObservation, setCoverageObservation] = useState("");
  const [observacion, setObservacion] = useState("");
  const [documentoPersonaId, setDocumentoPersonaId] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [hours, setHours] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [saving, setSaving] = useState(false);
  const noveltySaveInFlightRef = useRef(false);
  const [reviewSaving, setReviewSaving] = useState<Set<string>>(new Set());
  const planillaFiltersStorageKey = useMemo(
    () => `nomina.planilla.filters:${empresaId ?? "global"}`,
    [empresaId],
  );
  const nominaPeriodStorageKey = useMemo(
    () => `nomina.periodo_id:${empresaId ?? "global"}`,
    [empresaId],
  );

  const viewport = useRef<HTMLDivElement>(null);
  const canCreate = user?.permissions.includes("nomina.novedades.create") === true;
  const canUpdate = user?.permissions.includes("nomina.novedades.update") === true;
  const canClose = user?.permissions.includes("nomina.periodos.close") === true;
  const canReopen = user?.permissions.includes("nomina.periodos.reopen") === true;
  const canSeeEconomic = user?.permissions.includes("nomina.economico.read") === true;
  const selectedEmploymentMessage = selected ? getEmploymentStatusMessage(selected.employee, selected.date) : null;
  const actorUserId = user?.id ? String(user.id) : null;
  const selectedAttendanceKey = selected ? `${selected.employee.vinculacion_id}|${selected.date}` : null;
  const selectedAttendancePending = selectedAttendanceKey ? pendingAttendance.has(selectedAttendanceKey) : false;
  const selectedAttendanceFailure = selectedAttendanceKey ? attendanceFailures.get(selectedAttendanceKey) ?? null : null;
  const selectedTypeAllowsRange = typeSupportsDateRange(selectedType);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    writeCompanyScopedStorage(
      window.sessionStorage,
      PLANILLA_FILTERS_KEY,
      empresaId,
      JSON.stringify({
        eventFilter,
        gestor: gestorFilter,
        modalidad,
        municipio,
        query,
        reviewFilter,
        sortMode,
      }),
    );
  }, [empresaId, eventFilter, gestorFilter, modalidad, municipio, query, reviewFilter, sortMode, planillaFiltersStorageKey]);

  useEffect(() => {
    if (!periodId || typeof window === "undefined") {
      return;
    }

    writeCompanyScopedStorage(window.sessionStorage, "nomina.periodo_id", empresaId, periodId);
    if (searchParams.get("period_id") !== periodId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("period_id", periodId);
        return next;
      }, { replace: true });
    }
  }, [empresaId, periodId, searchParams, setSearchParams, nominaPeriodStorageKey]);

  useEffect(() => {
    if (!empresaId) {
      setPeriods([]);
      setPeriodId("");
      return;
    }

    const preferredPeriodId =
      searchParams.get("period_id") ??
      (typeof window !== "undefined"
        ? readCompanyScopedStorage(window.sessionStorage, "nomina.periodo_id", empresaId) ?? undefined
        : undefined);

    void Promise.all([
      getNominaPeriodos({ page: 1, limit: MAX_PAGE, empresa_id: String(empresaId) }),
      listarTiposNovedad({ activo: true, page: 1, limit: MAX_PAGE, empresa_id: String(empresaId) }),
    ])
      .then(([periodResponse, typeResponse]) => {
        const availablePeriods = periodResponse.items;
        setPeriods(availablePeriods);
        setTypes(typeResponse.items);
        setPeriodId((current) =>
          pickAvailableScopedId(availablePeriods, preferredPeriodId, current) ??
          String(pickDefaultNominaPeriod(availablePeriods)?.id ?? ""),
        );
      })
      .catch((value) => {
        setError(value instanceof Error ? value.message : "No fue posible cargar la configuracion de nomina");
      });
  }, [empresaId, searchParams]);

  useEffect(() => {
    if (!periodId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setScrollTop(0);

      try {
        const employeeLoader = user?.permissions.includes("nomina.economico.read") === true
          ? getAllNominaPeriodoEmpleados
          : getAllNominaPeriodoEmpleadosOperativos;
        const [employeeResult, ...layers] = await Promise.allSettled([
          employeeLoader(periodId, {
            empresa_id: empresaId ? String(empresaId) : undefined,
          }),
          getAllNominaNovedades({ periodo_id: periodId, activo: true }),
          getAllNominaMovimientosOperativos({ periodo_id: periodId, activo: true }),
          getNominaNovedadTurnosOperativos({ periodo_id: periodId, activo: true, limit: 500 }),
          apiClient.get<ApiResponse<PlanillaCambio[]>>("/nomina/cambios-operativos", {
            params: { activo: true, periodo_id: periodId },
          }),
          loadAttendance(periodId),
          getRevisionOperativa(periodId),
        ]);

        if (employeeResult.status !== "fulfilled") {
          throw employeeResult.reason;
        }

        if (!cancelled) {
          setEmployees(employeeResult.value.items);
        }

        if (cancelled) {
          return;
        }

        const [noveltiesResult, movementsResult, coverageTurnsResult, changesResult, attendanceResult, reviewResult] = layers;

        setNovelties(noveltiesResult.status === "fulfilled" ? dedupeNominaNovedades(noveltiesResult.value.items) : []);
        setMovements(movementsResult.status === "fulfilled" ? movementsResult.value.items : []);
        setCoverageTurns(coverageTurnsResult.status === "fulfilled" ? coverageTurnsResult.value.items : []);
        setChanges(
          changesResult.status === "fulfilled" && Array.isArray(changesResult.value.data)
            ? changesResult.value.data
            : [],
        );
        setAttendance(attendanceResult.status === "fulfilled" ? attendanceResult.value : []);
        setReviews(reviewResult.status === "fulfilled" ? reviewResult.value : []);

        const failed = layers
          .map((item, index) =>
            item.status === "rejected"
              ? ["novedades", "movimientos", "turnos de cobertura", "cambios operativos", "asistencia", "revision operativa"][index]
              : null,
          )
          .filter(Boolean);

        if (failed.length > 0) {
          setError(`Advertencia: no fue posible cargar ${failed.join(", ")}`);
        }
      } catch (value) {
        if (!cancelled) {
          setEmployees([]);
          setError(
            value instanceof Error
              ? `No fue posible cargar empleados de nomina: ${value.message}`
              : "No fue posible cargar empleados de nomina",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [empresaId, periodId]);

  useEffect(() => {
    const persistedFilters = readPersistedFilters(empresaId);
    setQuery(persistedFilters.query);
    setMunicipio(persistedFilters.municipio);
    setGestorFilter(persistedFilters.gestor);
    setModalidad(persistedFilters.modalidad);
    setReviewFilter(persistedFilters.reviewFilter);
    setEventFilter(persistedFilters.eventFilter);
    setSortMode(persistedFilters.sortMode);
    setSelected(null);
    setRangeSelection(null);
    setNoveltyCell(null);
    setEditingNovelty(null);
    setSelectedType(null);
    setCoverSearch("");
    setCoverEmployee(null);
    setExternalName("");
    setExternalDocument("");
    setCoverageObservation("");
    setObservacion("");
    setDocumentoPersonaId("");
    setRangeStart("");
    setRangeEnd("");
    setHours("");
    setManualValue("");
    setError("");
    setSuccessMessage("");
  }, [empresaId]);

  const period = periods.find((item) => String(item.id) === periodId);
  const editable = period?.estado === "ABIERTO" && canCreate;
  const start = period?.fecha_inicio ?? "";
  const end = period?.fecha_fin ?? "";

  const days = useMemo(() => {
    if (!start || !end) {
      return [];
    }

    const firstDay = Number(start.slice(8));
    const lastDay = Number(end.slice(8));

    return Array.from(
      { length: Math.max(0, lastDay - firstDay + 1) },
      (_, index) => dateKey(Number(start.slice(0, 4)), Number(start.slice(5, 7)), firstDay + index),
    );
  }, [end, start]);

  const gridMinWidth = REVIEW_WIDTH + DOCUMENT_WIDTH + NAME_WIDTH + days.length * DAY_WIDTH;

  const noveltyByEmployee = useMemo(() => group(novelties, (item) => String(item.nomina_empleado_id)), [novelties]);
  const movementByEmployee = useMemo(() => group(movements, (item) => String(item.nomina_empleado_id)), [movements]);
  const coverageTurnByEmployee = useMemo(
    () => group(coverageTurns, (item) => String(item.nomina_empleado_id)),
    [coverageTurns],
  );
  const changesByLink = useMemo(() => group(changes, (item) => String(item.vinculacion_id)), [changes]);
  const reviewByEmployee = useMemo(
    () => new Map(reviews.map((item) => [String(item.nomina_empleado_id), item])),
    [reviews],
  );
  const present = useMemo(
    () =>
      new Set(
        attendance
          .filter((item) => item.activo && item.estado_dia === "PRESENTE")
          .map((item) => `${item.vinculacion_id}|${item.fecha}`),
      ),
    [attendance],
  );

  const municipalityOptions = useMemo(
    () =>
      [...new Set(employees.map((item) => getEmployeeMunicipioLabel(item)).filter((item) => item !== "No disponible"))].sort(
        (left, right) => left.localeCompare(right, "es", { sensitivity: "base" }),
      ),
    [employees],
  );
  const modalityOptions = useMemo(
    () =>
      [...new Set(employees.map((item) => getEmployeeModalidadCode(item)).filter((item) => item !== "No disponible"))].sort(
        (left, right) => left.localeCompare(right, "es", { sensitivity: "base" }),
      ),
    [employees],
  );
  const gestorOptions = useMemo(() => {
    const seen = new Map<string, string>();

    employees.forEach((employee) => {
      const gestorId = getEmployeeGestorId(employee);
      const gestorName = normalizeLabel(employee.gestor?.nombre_completo);
      if (gestorId && gestorName) {
        seen.set(String(gestorId), gestorName);
      }
    });

    return [...seen.entries()]
      .map(([value, label]) => ({ label, value }))
      .sort((left, right) => left.label.localeCompare(right.label, "es", { sensitivity: "base" }));
  }, [employees]);

  const filtered = useMemo(
    () =>
      employees.filter((employee) => {
        const employeeNovelties = noveltyByEmployee.get(employee.id) ?? [];
        const baseContext = employeeBaseContext(employee);
        const visible = buildVisibleContext(employee, baseContext);
        const searchValue = normalizeSearchValue(
          employee.persona.nombre_completo,
          employee.persona.numero_documento,
          visible.municipio,
          visible.institucion,
          visible.sede,
          visible.modalidad,
          visible.gestor,
        );

        if (query && !searchValue.includes(normalizeSearchValue(query))) {
          return false;
        }

        if (municipio && visible.municipio !== municipio) {
          return false;
        }

        if (gestorFilter === GESTOR_NONE && getEmployeeGestorId(employee)) {
          return false;
        }

        if (gestorFilter && gestorFilter !== GESTOR_NONE && getEmployeeGestorId(employee) !== gestorFilter) {
          return false;
        }

        if (modalidad && visible.modalidad !== modalidad) {
          return false;
        }

        if (reviewFilter === "PENDIENTES" && resolveOperativeState(employee, reviewByEmployee.get(employee.id) ?? null) !== "PENDIENTE") {
          return false;
        }

        if (reviewFilter === "REVISADOS" && resolveOperativeState(employee, reviewByEmployee.get(employee.id) ?? null) !== "REVISADO") {
          return false;
        }

        if (reviewFilter === "CERRADOS" && resolveOperativeState(employee, reviewByEmployee.get(employee.id) ?? null) !== "CERRADO") {
          return false;
        }

        if (eventFilter === "CON_NOVEDADES" && employeeNovelties.length === 0) {
          return false;
        }

        if (eventFilter === "SIN_NOVEDADES" && employeeNovelties.length > 0) {
          return false;
        }

        if (
          eventFilter === "INCONSISTENCIAS" &&
          !(movementByEmployee.get(employee.id) ?? []).some(
            (item) => item.posible_duplicado || item.alertas_validacion.length > 0,
          )
        ) {
          return false;
        }

        return true;
      }),
    [employees, eventFilter, gestorFilter, modalidad, movementByEmployee, municipio, noveltyByEmployee, query, reviewByEmployee, reviewFilter],
  );

  const ordered = useMemo(() => {
    const items = [...filtered];
    items.sort((left, right) => {
      const leftContext = employeeBaseContext(left);
      const rightContext = employeeBaseContext(right);

      const pickValue = (employee: NominaEmpleadoApi, context: PlanillaContexto) => {
        switch (sortMode) {
          case "NOMBRE_DESC":
          case "NOMBRE_ASC":
            return employee.persona.nombre_completo;
          case "DOCUMENTO_ASC":
          case "DOCUMENTO_DESC":
            return employee.persona.numero_documento ?? "";
          case "MUNICIPIO":
            return buildVisibleContext(employee, context).municipio;
          case "GESTOR":
            return getEmployeeGestorLabel(employee);
          case "INSTITUCION":
            return buildVisibleContext(employee, context).institucion;
          case "SEDE":
            return buildVisibleContext(employee, context).sede;
          default:
            return employee.persona.nombre_completo;
        }
      };

      const result = pickValue(left, leftContext).localeCompare(pickValue(right, rightContext), "es", {
        numeric: true,
        sensitivity: "base",
      });

      return sortMode === "NOMBRE_DESC" || sortMode === "DOCUMENTO_DESC" ? -result : result;
    });
    return items;
  }, [filtered, sortMode]);

  const summary = useMemo(
    () => ({
      needsReview: employees.filter((item) => reviewByEmployee.get(item.id)?.estado_revision === "REQUIERE_REVISION").length,
      pending: employees.filter((item) => (reviewByEmployee.get(item.id)?.estado_revision ?? "PENDIENTE") === "PENDIENTE").length,
      reviewed: employees.filter((item) => reviewByEmployee.get(item.id)?.estado_revision === "REVISADO").length,
    }),
    [employees, reviewByEmployee],
  );

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 6);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 12;
  // Virtualizacion equivalente a filtered.slice(startIndex,startIndex+visibleCount).
  const visibleEmployees = ordered.slice(startIndex, startIndex + visibleCount);

  const coverageCandidates = useMemo(() => {
    if (!noveltyCell) {
      return [];
    }

    const selectedEmployee = noveltyCell.employee;
    const selectedContext = buildVisibleContext(selectedEmployee, noveltyCell.context);
    const normalizedQuery = normalizeSearchValue(coverSearch);

    return employees
      .filter((employee) => employee.id !== selectedEmployee.id)
      .filter((employee) => {
        if (!normalizedQuery) {
          return true;
        }

        return normalizeSearchValue(
          employee.persona.nombre_completo,
          employee.persona.numero_documento,
          getEmployeeMunicipioLabel(employee),
          getEmployeeSedeLabel(employee),
        ).includes(normalizedQuery);
      })
      .map((employee) => {
        let score = 0;
        if (getEmployeeGestorId(employee) && getEmployeeGestorId(employee) === getEmployeeGestorId(selectedEmployee)) {
          score += 4;
        }
        if (getEmployeeMunicipioLabel(employee) === selectedContext.municipio) {
          score += 3;
        }
        if (getEmployeeInstitucionLabel(employee) === selectedContext.institucion) {
          score += 2;
        }
        if (getEmployeeSedeLabel(employee) === selectedContext.sede) {
          score += 1;
        }

        return { employee, score };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.employee.persona.nombre_completo.localeCompare(right.employee.persona.nombre_completo, "es", {
          sensitivity: "base",
        });
      })
      .slice(0, 8);
  }, [coverSearch, employees, noveltyCell]);

  const selectedRangeLabel = useMemo(() => {
    if (!rangeSelection) {
      return null;
    }

    const startValue = rangeSelection.start;
    const endValue = rangeSelection.end ?? rangeSelection.start;
    return `${dateLabel(startValue)} -> ${dateLabel(endValue)}`;
  }, [rangeSelection]);

  const invalidateReviewLocally = (employee: NominaEmpleadoApi, motivo: string) => {
    setReviews((current) => {
      const previous = current.find((item) => item.nomina_empleado_id === employee.id) ?? null;
      if ((previous?.estado_revision ?? "PENDIENTE") !== "REVISADO") {
        return current;
      }
      return upsertReview(current, buildReviewRecord(employee, periodId, "REQUIERE_REVISION", previous, actorUserId, motivo));
    });
  };

  const closeNoveltyModal = () => {
    setNoveltyCell(null);
    setSelectedType(null);
    setCoverageType("SIN_REEMPLAZO");
    setCoverSearch("");
    setCoverEmployee(null);
    setExternalName("");
    setExternalDocument("");
    setCoverageObservation("");
    setObservacion("");
    setDocumentoPersonaId("");
    setRangeStart("");
    setRangeEnd("");
    setHours("");
    setManualValue("");
  };

  const toggleAttendance = async (employee: NominaEmpleadoApi, date: string, remove = false) => {
    if (!editable || isOutsideEmployment(employee, date)) {
      return;
    }

    const key = `${employee.vinculacion_id}|${date}`;
    if (pendingAttendanceRef.current.has(key)) {
      return;
    }

    const activeNovelty = novedadesOnDate(noveltyByEmployee.get(employee.id) ?? [], date).find(
      (item) => item.activo,
    );
    if (!remove && activeNovelty) {
      const message = `No puedes marcar asistencia el ${shortDateLabel(date) ?? date} porque existe una novedad activa: ${novedadCode(activeNovelty)}.`;
      setAttendanceFailures((current) => {
        const next = new Map(current);
        next.set(key, message);
        return next;
      });
      setError(message);
      return;
    }

    const shouldPresent = !remove && !present.has(key);
    const nextItem: Attendance = {
      activo: true,
      estado_dia: "PRESENTE",
      fecha: date,
      vinculacion_id: employee.vinculacion_id,
    };

    pendingAttendanceRef.current.add(key);
    setError("");
    setPendingAttendance((current) => new Set(current).add(key));
    setAttendanceFailures((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });

    try {
      await markNominaAsistencia(periodId, employee.vinculacion_id, date, shouldPresent);
      setAttendance((current) => mergeAttendance(current, nextItem, !shouldPresent));
      setAttendanceFailures((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      invalidateReviewLocally(employee, "ASISTENCIA_MODIFICADA");
    } catch (value) {
      const message = formatPlanillaErrorMessage(value, "No fue posible actualizar asistencia", { date });
      setAttendanceFailures((current) => {
        const next = new Map(current);
        next.set(key, message);
        return next;
      });
      setError(message);
    } finally {
      pendingAttendanceRef.current.delete(key);
      setPendingAttendance((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const saveReview = async (employee: NominaEmpleadoApi) => {
    if (!editable || reviewSaving.has(employee.id)) {
      return;
    }

    const current = reviewByEmployee.get(employee.id);
    if (current?.estado_revision === "REVISADO") {
      return;
    }

    setReviewSaving((value) => new Set(value).add(employee.id));
    const optimistic = buildReviewRecord(employee, periodId, "REVISADO", current, actorUserId);
    const previous = reviews;
    setReviews((value) => upsertReview(value, optimistic));

    try {
      const updated = await updateRevisionOperativa(periodId, employee.id, "REVISADO");
      setReviews((value) => upsertReview(value, updated));
    } catch (value) {
      setReviews(previous);
      setError(value instanceof Error ? value.message : "No fue posible actualizar la revision");
    } finally {
      setReviewSaving((value) => {
        const next = new Set(value);
        next.delete(employee.id);
        return next;
      });
    }
  };

  const changeOperativeState = async (employee: NominaEmpleadoApi, action: "UNDO" | "CLOSE" | "REOPEN") => {
    setError("");
    try {
      if (action === "UNDO") await updateRevisionOperativa(periodId, employee.id, "PENDIENTE");
      if (action === "CLOSE") await closeNominaEmpleadoOperativo(periodId, employee.id);
      if (action === "REOPEN") {
        const motivo = window.prompt("Motivo obligatorio de reapertura:")?.trim();
        if (!motivo) return;
        await reopenNominaEmpleadoOperativo(periodId, employee.id, motivo);
      }
      setReviews(await getRevisionOperativa(periodId));
    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible cambiar el estado operativo");
    }
  };

  const openCell = (employee: NominaEmpleadoApi, date: string) => {
    const context =
      buildTramos(employee, start, end, changesByLink.get(employee.vinculacion_id) ?? []).find(
        (item) => item.inicio <= date && item.fin >= date,
      )?.contexto ?? employeeBaseContext(employee);
    const cell = { employee, date, context };
    const key = `${employee.vinculacion_id}|${date}`;
    const hasAttendance = present.has(key);
    const activeNovelties = novedadesOnDate(noveltyByEmployee.get(employee.id) ?? [], date).filter(
      (item) => item.activo,
    );
    const hasAdditionalTurns =
      coverageTurnsOnDate(coverageTurnByEmployee.get(employee.id) ?? [], date).length > 0;

    setSelected(cell);

    if (rangeSelection && rangeSelection.employeeId === employee.id) {
      setRangeSelection({ ...rangeSelection, end: date });
      return;
    }

    if (activeNovelties.length > 1) {
      setError(`Se detectaron ${activeNovelties.length} novedades activas en ${dateLabel(date)}. Debes corregir el conflicto antes de registrar otra accion.`);
      return;
    }

    if (activeNovelties.length === 1) {
      openNovelty(cell, activeNovelties[0] ?? null);
      return;
    }

    if (
      !hasAttendance &&
      !hasAdditionalTurns &&
      !isOutsideEmployment(employee, date) &&
      !pendingAttendanceRef.current.has(key)
    ) {
      void toggleAttendance(employee, date);
    }
  };

  const openNovelty = (cell: SelectedCell, novelty: NominaNovedadApi | null = null) => {
    setSelected(cell);
    setNoveltyCell(cell);
    setEditingNovelty(novelty);
    setSelectedType(
      novelty
        ? types.find((item) => item.id === novelty.tipo_novedad?.id)
          ?? types.find((item) => item.codigo_operativo === novedadCode(novelty))
          ?? null
        : null,
    );
    const currentCoverage = novelty?.cobertura ?? null;
    const currentCoverageType = currentCoverage?.tipo_cobertura ?? "SIN_REEMPLAZO";
    setCoverageType(currentCoverageType);
    setCoverSearch("");
    setCoverEmployee(
      currentCoverageType === "PERSONAL_VINCULADO"
        ? employees.find(
            (item) => item.vinculacion_id === currentCoverage?.vinculacion_cubre_id || item.persona.id === currentCoverage?.persona_cubre_id,
          ) ?? null
        : null,
    );
    setExternalName(currentCoverageType === "PERSONA_EXTERNA" ? currentCoverage?.nombre_externo ?? "" : "");
    setExternalDocument(currentCoverageType === "PERSONA_EXTERNA" ? currentCoverage?.documento_externo ?? "" : "");
    setCoverageObservation(currentCoverage?.observacion_interna ?? "");
    setObservacion(novelty?.observacion ?? "");
    setDocumentoPersonaId(novelty?.documento_persona_id ?? "");
    setRangeStart(novelty?.fecha_inicio_evento_canonico ?? novelty?.fecha_inicio ?? cell.date);
    setRangeEnd(novelty?.fecha_fin_evento_canonico ?? novelty?.fecha_fin ?? novelty?.fecha_inicio ?? cell.date);
    setHours(novelty?.horas === null || novelty?.horas === undefined ? "" : String(novelty.horas));
    setManualValue(novelty?.valor_manual === null || novelty?.valor_manual === undefined ? "" : String(novelty.valor_manual));
    setError("");
  };

  const saveNovelty = async () => {
    if (!noveltyCell || !selectedType || !editable || noveltySaveInFlightRef.current) {
      return;
    }

    const fechaInicio = rangeStart || noveltyCell.date;
    const fechaFin = selectedTypeAllowsRange ? rangeEnd || fechaInicio : fechaInicio;

    if (selectedTypeAllowsRange && fechaFin < fechaInicio) {
      setError("La fecha fin debe ser mayor o igual a la fecha inicio.");
      return;
    }

    const computedDays = Math.max(
      1,
      Math.round(
        (Date.parse(`${fechaFin}T12:00:00Z`) - Date.parse(`${fechaInicio}T12:00:00Z`)) / 86400000,
      ) + 1,
    );

    if (coverageType === "PERSONAL_VINCULADO") {
      if (!coverEmployee) {
        setError("Selecciona la persona vinculada que cubrio el turno.");
        return;
      }
      if (coverEmployee.vinculacion_id === noveltyCell.employee.vinculacion_id) {
        setError("La persona con novedad y quien cubre deben ser distintas.");
        return;
      }
    }

    if (coverageType === "PERSONA_EXTERNA" && (!externalName.trim() || !externalDocument.trim())) {
      setError("Ingresa nombre y documento de la cobertura externa.");
      return;
    }

    noveltySaveInFlightRef.current = true;
    setSaving(true);
    setError("");

    try {
      const tramo =
        buildTramos(noveltyCell.employee, start, end, changesByLink.get(noveltyCell.employee.vinculacion_id) ?? []).find(
          (item) => item.inicio <= noveltyCell.date && item.fin >= noveltyCell.date,
        )?.contexto ?? employeeBaseContext(noveltyCell.employee);

      const hasCoverageSelection = coverageType !== "SIN_REEMPLAZO";
      const shouldPersistCoverage = selectedType.afecta_cobertura !== false || hasCoverageSelection;

      const basePayload: CreateNominaNovedadApi = {
        periodo_id: periodId,
        nomina_empleado_id: noveltyCell.employee.id,
        vinculacion_id: noveltyCell.employee.vinculacion_id,
        tipo_novedad_id: selectedType.id,
        tipo_novedad_codigo: selectedType.codigo_operativo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dias: selectedType.requiere_dias || selectedTypeAllowsRange ? computedDays : 1,
        horas: selectedType.requiere_horas ? Number(hours || 0) : null,
        valor_manual: selectedType.requiere_valor ? Number(manualValue || 0) : null,
        observacion: normalizeLabel(observacion) ?? "Captura desde planilla",
        reemplazar_asistencia_confirmado: present.has(`${noveltyCell.employee.vinculacion_id}|${noveltyCell.date}`)
          ? window.confirm(`Este dia esta marcado como asistencia.\n\nRegistrar ${selectedType.codigo_operativo ?? "la novedad"} reemplazara la asistencia del dia ${dateLabel(noveltyCell.date)}.`)
          : false,
        documento_persona_id: normalizeLabel(documentoPersonaId),
        revisado: false,
        requiere_cobertura: shouldPersistCoverage,
        cubierta: hasCoverageSelection,
        cobertura:
          !shouldPersistCoverage
            ? null
            : coverageType === "PERSONAL_VINCULADO"
              ? {
                  tipo_cobertura: "PERSONAL_VINCULADO",
                  persona_cubre_id: coverEmployee?.persona.id ?? null,
                  vinculacion_cubre_id: coverEmployee?.vinculacion_id ?? null,
                  observacion_interna: normalizeLabel(coverageObservation),
                }
              : coverageType === "PERSONA_EXTERNA"
                ? {
                    tipo_cobertura: "PERSONA_EXTERNA",
                    nombre_externo: externalName.trim(),
                    documento_externo: externalDocument.trim(),
                    observacion_externa: normalizeLabel(observacion),
                    observacion_interna: normalizeLabel(coverageObservation),
                  }
                : {
                    tipo_cobertura: "SIN_REEMPLAZO",
                    observacion_interna: normalizeLabel(coverageObservation),
                  },
      };

      if (present.has(`${noveltyCell.employee.vinculacion_id}|${noveltyCell.date}`) && !basePayload.reemplazar_asistencia_confirmado) return;

      const response =
        editingNovelty
          ? {
              novedad: await updateNominaNovedad(editingNovelty.id, basePayload),
            }
          : !hasCoverageSelection
          ? {
              novedad: await createNominaNovedad(basePayload),
            }
          : await createNominaNovedadConTurno({
              ...(basePayload as Omit<CreateNominaNovedadConTurnoApi, "turno">),
              turno: {
                tipo: mapCoverageToTurno(coverageType),
                persona_reemplazada_id:
                  coverageType === "PERSONAL_VINCULADO" ? coverEmployee?.persona.id ?? null : null,
                contexto_operativo: {
                  ...tramo,
                  cobertura_documento_externo:
                    coverageType === "PERSONA_EXTERNA" ? externalDocument.trim() : null,
                  cobertura_interna_nomina_empleado_id:
                    coverageType === "PERSONAL_VINCULADO" ? coverEmployee?.id ?? null : null,
                  cobertura_interna_persona_id:
                    coverageType === "PERSONAL_VINCULADO" ? coverEmployee?.persona.id ?? null : null,
                  cobertura_tipo: coverageType,
                  gestor_nombre: getEmployeeGestorLabel(noveltyCell.employee),
                  modalidad_codigo: getEmployeeModalidadCode(noveltyCell.employee),
                  persona_cubre_nombre:
                    coverageType === "PERSONAL_VINCULADO" ? coverEmployee?.persona.nombre_completo ?? null : null,
                  persona_externa_nombre: coverageType === "PERSONA_EXTERNA" ? externalName.trim() : null,
                } as Record<string, unknown>,
                observacion: normalizeLabel(coverageObservation),
              },
            });

      if (response.novedad) {
        setNovelties((current) => upsertNominaNovedad(current, response.novedad));
        invalidateReviewLocally(noveltyCell.employee, editingNovelty ? "NOVEDAD_EDITADA" : "NOVEDAD_CREADA");
      }

      const recalculationWarning = "recalculate_warning" in response ? response.recalculate_warning : null;
      setSuccessMessage(
        recalculationWarning
          ? `Novedad registrada correctamente. No se pudo actualizar completamente el cálculo: ${recalculationWarning}`
          : editingNovelty ? "Novedad actualizada correctamente." : "Novedad registrada correctamente.",
      );

      closeNoveltyModal();
      setRangeSelection(null);
    } catch (value) {
      setError(formatPlanillaErrorMessage(value, editingNovelty ? "No fue posible corregir la novedad" : "No fue posible registrar la novedad", { date: noveltyCell.date }));
      setSuccessMessage("");
    } finally {
      noveltySaveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const markRange = async () => {
    if (!selected || !rangeSelection || !editable) {
      return;
    }

    const from = rangeSelection.start < (rangeSelection.end ?? rangeSelection.start)
      ? rangeSelection.start
      : rangeSelection.end ?? rangeSelection.start;
    const to = rangeSelection.start < (rangeSelection.end ?? rangeSelection.start)
      ? rangeSelection.end ?? rangeSelection.start
      : rangeSelection.start;

    try {
      const bulkResult = await markNominaAsistenciaMasiva(
        periodId,
        [selected.employee.vinculacion_id],
        from,
        to,
      );
      const result = (bulkResult.resultados?.[0] ?? {
        marcados: [],
        omitidos: [{ fecha: from, motivo: "No se pudo marcar el rango" }],
        total_marcados: 0,
        total_omitidos: 1,
      }) as AttendanceRangeResult;

      setAttendance((current) => {
        let next = current;
        for (const fecha of result.marcados ?? []) {
          next = mergeAttendance(
            next,
            {
              activo: true,
              estado_dia: "PRESENTE",
              fecha,
              vinculacion_id: selected.employee.vinculacion_id,
            },
            false,
          );
        }
        return next;
      });
      setAttendanceFailures((current) => {
        const next = new Map(current);
        for (const fecha of result.marcados ?? []) {
          next.delete(`${selected.employee.vinculacion_id}|${fecha}`);
        }
        return next;
      });

      if ((result.total_marcados ?? 0) > 0) {
        invalidateReviewLocally(selected.employee, "ASISTENCIA_MODIFICADA");
      }

      const firstOmitted = result.omitidos?.[0]?.motivo;
      setError(
        `Rango: ${result.total_marcados ?? 0} marcados, ${result.total_omitidos ?? 0} omitidos${
          firstOmitted ? ` | ${firstOmitted}` : ""
        }`,
      );
      setRangeSelection(null);
    } catch (value) {
      setError(formatPlanillaErrorMessage(value, "No fue posible marcar el rango", { date: from }));
    }
  };

  const clearFilters = () => {
    setQuery("");
    setMunicipio("");
    setGestorFilter(GESTOR_ALL);
    setModalidad("");
    setReviewFilter("TODOS");
    setEventFilter("TODOS");
    setSortMode("NOMBRE_ASC");
  };

  const nextPending = () => {
    const wanted =
      reviewFilter === "PENDIENTES"
        ? "PENDIENTE"
        : reviewFilter === "REVISADOS"
          ? "REVISADO"
          : reviewFilter === "CERRADOS"
            ? "CERRADO"
            : "PENDIENTE";
    const eligible = ordered
      .map((employee, index) => ({ employee, index }))
      .filter(({ employee }) => {
        const state = resolveOperativeState(employee, reviewByEmployee.get(employee.id) ?? null);
        return state === wanted;
      });

    const currentIndex = selected ? ordered.findIndex((employee) => employee.id === selected.employee.id) : -1;
    const next = eligible.find((item) => item.index > currentIndex) ?? eligible[0];

    if (next) {
      setScrollTop(next.index * ROW_HEIGHT);
      const context = employeeBaseContext(next.employee);
      setSelected({
        employee: next.employee,
        date: days[0] ?? "",
        context,
      });
    }
  };

  return (
    <section className="op-sheet-page">
      <CoberturaFlowNav periodId={periodId} />
      <header className="op-sheet-title">
        <div>
          <span>Nomina</span>
          <h1>Planilla operativa 1-31</h1>
        </div>

        <div className="op-period-picker">
          <label>
            Periodo
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              {periods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre_periodo} | {item.tipo_periodo}
                </option>
              ))}
            </select>
          </label>
          <strong className={`op-period-state ${period?.estado === "ABIERTO" ? "open" : "locked"}`}>
            {period?.estado ?? "CARGANDO"}
          </strong>
        </div>
      </header>

      {period ? (
        <div className="op-period-meta">
          {dateLabel(period.fecha_inicio)} - {dateLabel(period.fecha_fin)} | {period.tipo_periodo} | Contrato{" "}
          {period.contrato_id ?? "-"}
        </div>
      ) : null}

      <div className="op-summary">
        <strong>{employees.length} trabajadores</strong>
        <span>
          REVISION {summary.reviewed}/{employees.length} |{" "}
          {employees.length ? Math.round((summary.reviewed * 100) / employees.length) : 0}%
        </span>
        <span>{summary.pending} pendientes</span>
        <span>{summary.needsReview} requieren revision</span>
      </div>

      <div className="op-toolbar">
        <label className="op-search">
          <Search size={15} />
          <input
            placeholder="Buscar trabajador, documento o contexto"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <select value={municipio} onChange={(event) => setMunicipio(event.target.value)}>
          <option value="">Municipio</option>
          {municipalityOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select value={gestorFilter} onChange={(event) => setGestorFilter(event.target.value)}>
          <option value={GESTOR_ALL}>Gestor</option>
          <option value={GESTOR_NONE}>Sin gestor</option>
          {gestorOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select value={modalidad} onChange={(event) => setModalidad(event.target.value)}>
          <option value="">Modalidad</option>
          {modalityOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}>
          <option value="TODOS">Revision</option>
          <option value="PENDIENTES">Pendientes</option>
          <option value="REVISADOS">Revisados</option>
          <option value="REQUIERE_REVISION">Requiere revision</option>
        </select>

        <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value as EventFilter)}>
          <option value="TODOS">Novedades</option>
          <option value="CON_NOVEDADES">Con novedades</option>
          <option value="SIN_NOVEDADES">Sin novedades</option>
          <option value="INCONSISTENCIAS">Inconsistencias</option>
        </select>

        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
          <option value="NOMBRE_ASC">Ordenar por Nombre A-Z</option>
          <option value="NOMBRE_DESC">Nombre Z-A</option>
          <option value="DOCUMENTO_ASC">Documento ascendente</option>
          <option value="DOCUMENTO_DESC">Documento descendente</option>
          <option value="MUNICIPIO">Municipio</option>
          <option value="GESTOR">Gestor</option>
          <option value="INSTITUCION">Institucion</option>
          <option value="SEDE">Sede</option>
        </select>

        <button type="button" onClick={nextPending}>
          Siguiente pendiente
        </button>

        <button type="button" onClick={clearFilters}>
          Limpiar filtros
        </button>
      </div>

      {rangeSelection ? (
        <div className="op-range-banner">
          <span>Rango preparado: {selectedRangeLabel}</span>
          <button
            type="button"
            disabled={!editable || !rangeSelection.end || rangeSelection.employeeId !== selected?.employee.id}
            onClick={() => void markRange()}
          >
            Marcar rango
          </button>
          <button type="button" onClick={() => setRangeSelection(null)}>
            Cancelar rango
          </button>
        </div>
      ) : null}

      {period?.estado !== "ABIERTO" ? (
        <div className="op-locked">
          <AlertTriangle size={16} />
          Periodo cerrado: consulta habilitada; edicion ordinaria bloqueada.
        </div>
      ) : null}

      {error ? (
        <div className="op-error">
          <AlertTriangle size={16} />
          {error}
          <button type="button" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      {successMessage ? (
        <div className="op-success" role="status">
          <Check size={16} />
          {successMessage}
          <button type="button" onClick={() => setSuccessMessage("")}><X size={14} /></button>
        </div>
      ) : null}

      {loading ? (
        <div className="op-loading">Cargando trabajadores y eventos...</div>
      ) : (
        <div
          ref={viewport}
          className="op-viewport"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          style={{ height: VIEWPORT_HEIGHT }}
        >
          <div className="op-grid op-head" style={{ gridTemplateColumns: PLANILLA_GRID_TEMPLATE(days.length), minWidth: gridMinWidth }}>
            <div>REV</div>
            <div>DOCUMENTO</div>
            <div>TRABAJADOR | CONTEXTO</div>
            {days.map((day) => (
              <div className={`op-day-head ${getColombianCalendarDay(day).className}`} key={day} title={getColombianCalendarDay(day).tooltip}>
                <b>{day.slice(8)}</b>
                <small>{weekday(day)}</small>
              </div>
            ))}
          </div>

          <div className="op-virtual-space" style={{ height: ordered.length * ROW_HEIGHT, minWidth: gridMinWidth }}>
            {visibleEmployees.map((employee, offset) => {
              const index = startIndex + offset;
              const review = reviewByEmployee.get(employee.id) ?? null;
              const state = resolveOperativeState(employee, review);
              const baseContext = employeeBaseContext(employee);
              const visible = buildVisibleContext(employee, baseContext);
              const tramos = buildTramos(employee, start, end, changesByLink.get(employee.vinculacion_id) ?? []);
              const employeeNovelties = noveltyByEmployee.get(employee.id) ?? [];
              const employeeMovements = movementByEmployee.get(employee.id) ?? [];

              return (
                <div
                  className="op-grid op-row"
                  key={employee.id}
                  style={{
                    gridTemplateColumns: PLANILLA_GRID_TEMPLATE(days.length),
                    height: ROW_HEIGHT,
                    minWidth: gridMinWidth,
                    top: index * ROW_HEIGHT,
                  }}
                >
                  <button
                    type="button"
                    className={`op-review ${state === "REVISADO" || state === "CERRADO" ? "done" : ""}`}
                    disabled={!editable || reviewSaving.has(employee.id) || state !== "PENDIENTE"}
                    title={state}
                    onClick={() => void saveReview(employee)}
                  >
                    {state === "CERRADO" ? "CER" : state === "REVISADO" ? <Check size={16} /> : "REV"}
                  </button>

                  <div className="op-doc">{text(employee.persona.numero_documento)}</div>

                  <button
                    type="button"
                    className="op-name"
                    title={buildContextTitle(employee, baseContext)}
                    onClick={() =>
                      setSelected({
                        employee,
                        date: days[0] ?? "",
                        context: baseContext,
                      })
                    }
                  >
                    <strong>{employee.persona.nombre_completo}</strong>
                    <small>{visible.municipio}</small>
                    <small>{visible.institucion}</small>
                    <small>{visible.sede}</small>
                    <small className="op-context-accent" title={`${getEmployeeModalidadDescription(employee)} | Gestor: ${visible.gestor}`}>
                      {visible.modalidad} | Gestor: {visible.gestor}
                    </small>
                  </button>

                  {days.map((day) => {
                    const calendarDay = getColombianCalendarDay(day);
                    const tramo = tramos.find((item) => item.inicio <= day && item.fin >= day);
                    const dayContext = tramo?.contexto ?? baseContext;
                    const noveltiesOnThisDay = novedadesOnDate(employeeNovelties, day);
                    const activeNoveltiesOnThisDay = noveltiesOnThisDay.filter((item) => item.activo);
                    const movementsOnThisDay = movimientosOnDate(employeeMovements, day);
                    const additionalTurnsOnThisDay = coverageTurnsOnDate(
                      coverageTurnByEmployee.get(employee.id) ?? [],
                      day,
                    );
                    const key = `${employee.vinculacion_id}|${day}`;
                    const isPresent = present.has(key);
                    const isPendingAttendance = pendingAttendance.has(key);
                    const hasAttendanceFailure = attendanceFailures.has(key);
                    const outside = isOutsideEmployment(employee, day);
                    const outsideMessage = getEmploymentStatusMessage(employee, day);

                    return (
                      <button
                        type="button"
                        key={day}
                        className={`op-cell ${calendarDay.className} ${outside ? "outside" : ""} ${tramo?.cambioId ? "change" : ""} ${activeNoveltiesOnThisDay.length ? "has-active-novelty" : ""} ${isPendingAttendance ? "pending-attendance" : ""} ${hasAttendanceFailure ? "attendance-error" : ""}`}
                        data-active-novelty={activeNoveltiesOnThisDay.length ? novedadCode(activeNoveltiesOnThisDay[0]) : undefined}
                        title={`${outsideMessage ? `${outsideMessage} | ` : ""}${noveltiesOnThisDay.length ? `${novedadCode(noveltiesOnThisDay[0])} | ${noveltiesOnThisDay[0]?.tipo_novedad?.nombre ?? "Novedad"} | ${dateLabel(day)} | ${noveltiesOnThisDay[0]?.fecha_inicio ?? day} a ${noveltiesOnThisDay[0]?.fecha_fin ?? day} | ${noveltiesOnThisDay[0]?.observacion ?? "Sin observacion"}` : `${dateLabel(day)} | ${buildContextTitle(employee, dayContext)}`}`}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setSelected({ employee, date: day, context: dayContext });
                        }}
                        onClick={() => openCell(employee, day)}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          if (activeNoveltiesOnThisDay.length > 1) {
                            setSelected({ employee, date: day, context: dayContext });
                            setError(`Se detectaron ${activeNoveltiesOnThisDay.length} novedades activas en ${dateLabel(day)}. Debes corregir el conflicto antes de registrar otra accion.`);
                            return;
                          }

                          openNovelty({ employee, date: day, context: dayContext }, activeNoveltiesOnThisDay[0] ?? null);
                        }}
                      >
                        {isPendingAttendance && !isPresent ? <span className="op-attendance-pending-mark">...</span> : null}
                        {activeNoveltiesOnThisDay.length === 0 && isPresent ? <b className="op-attendance-mark">OK</b> : null}
                        {noveltiesOnThisDay.slice(0, 2).map((item) => (
                          <b className="op-novelty-mark" key={item.id} data-state={novedadState(item)}>
                            {novedadCode(item)}
                          </b>
                        ))}
                        {additionalTurnsOnThisDay.length > 0 ? <em>{`+${additionalTurnsOnThisDay.length}TA`}</em> : null}
                        {additionalTurnsOnThisDay.length === 0 && movementsOnThisDay.some((item) => item.familia_movimiento === "ADICION_DEVENGO") ? <em>TA</em> : null}
                        {tramo?.cambioId ? <i>C</i> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected ? (
        <aside className="op-inspector">
          <button
            type="button"
            className="op-close"
            onClick={() => {
              setSelected(null);
              setError("");
            }}
          >
            <X size={16} />
          </button>

          <div>
            <strong>{selected.employee.persona.nombre_completo}</strong>
            <span>{text(selected.employee.persona.numero_documento)}</span>
            <p>{dateLabel(selected.date)}</p>
          </div>

          <div className="op-context-detail">
            <span>Municipio: {text(buildVisibleContext(selected.employee, selected.context).municipio)}</span>
            <span>Institucion: {text(buildVisibleContext(selected.employee, selected.context).institucion)}</span>
            <span>Sede: {text(buildVisibleContext(selected.employee, selected.context).sede)}</span>
            <span>Modalidad: {text(buildVisibleContext(selected.employee, selected.context).modalidad)}</span>
            <span>Gestor: {text(getEmployeeGestorLabel(selected.employee))}</span>
            <span>Estado: {resolveOperativeState(selected.employee, reviewByEmployee.get(selected.employee.id) ?? null)}</span>
          </div>

          {(() => {
            const additionalTurns = coverageTurnsOnDate(
              coverageTurnByEmployee.get(selected.employee.id) ?? [],
              selected.date,
            );

            if (additionalTurns.length === 0) {
              return null;
            }

            return (
              <div className="op-context-detail">
                <strong>{`+${additionalTurns.length} TURNO ADICIONAL`}</strong>
                {additionalTurns.map((turno) => (
                  <small key={turno.id}>
                    {`${turno.fecha ?? turno.fecha_inicio ?? selected.date} | ${turno.trabajador_reemplazado} | ${turno.sede ?? "Sede no disponible"} | ${turno.municipio ?? "Municipio no disponible"} | ${turno.tipo_turno} | ${turno.estado}`}
                  </small>
                ))}
              </div>
            );
          })()}

          {canSeeEconomic ? (() => {
            const detail = selected.employee.detalle_calculo as { adiciones_internas?: Array<Record<string, unknown>> } | null | undefined;
            const turns = detail?.adiciones_internas ?? [];
            const totals = turns.reduce<{ count: number; salario: number; recargo: number; salud: number; pension: number; neto: number }>((sum, turn) => ({
              count: sum.count + 1,
              salario: sum.salario + Number(turn.salario_turno ?? 0),
              recargo: sum.recargo + Number(turn.recargo_turno ?? 0),
              salud: sum.salud + Number(turn.salud_turno ?? 0),
              pension: sum.pension + Number(turn.pension_turno ?? 0),
              neto: sum.neto + Number(turn.neto_turno ?? 0),
            }), { count: 0, salario: 0, recargo: 0, salud: 0, pension: 0, neto: 0 });
            return turns.length ? <div className="op-context-detail"><strong>TURNOS INTERNOS</strong><span>Cantidad: {totals.count}</span><span>Salario turnos: {formatTurnAmount(totals.salario)}</span><span>Recargos: {formatTurnAmount(totals.recargo)}</span><span>Salud: -{formatTurnAmount(totals.salud)}</span><span>Pension: -{formatTurnAmount(totals.pension)}</span><span>Neto adicional: {formatTurnAmount(totals.neto)}</span>{turns.map((turn) => <small key={String(turn.id ?? turn.fecha_inicio)}>{String(turn.fecha_inicio ?? "-")} | {String(turn.titular_nombre ?? "Titular no disponible")} | {String(turn.novedad_tipo ?? "Novedad")} | {formatTurnAmount(Number(turn.neto_turno ?? 0))}</small>)}</div> : null;
          })() : null}

          {novedadesOnDate(noveltyByEmployee.get(selected.employee.id) ?? [], selected.date)[0] ? (() => {
            const novelty = novedadesOnDate(noveltyByEmployee.get(selected.employee.id) ?? [], selected.date)[0]!;
            return <div className="op-context-detail"><strong>Novedad</strong><span>Codigo: {novedadCode(novelty)}</span><span>Nombre: {novelty.tipo_novedad?.nombre ?? "Novedad"}</span><span>Inicio: {novelty.fecha_inicio ?? selected.date}</span><span>Fin: {novelty.fecha_fin ?? selected.date}</span><span>Observacion: {novelty.observacion ?? "Sin observacion"}</span><span>Soporte: {novelty.documento_persona_id ?? "Sin soporte"}</span><span>Estado: {novelty.activo ? "ACTIVA" : "ANULADA"}</span>{canUpdate ? <><button type="button" onClick={() => { openNovelty(selected, novelty); }}>Editar novedad</button><button type="button" onClick={() => { if (window.confirm(`Anular ${novedadCode(novelty)}?`)) void deactivateNominaNovedad(novelty.id).then(() => { setNovelties(items => items.filter(item => item.id !== novelty.id)); invalidateReviewLocally(selected.employee, "NOVEDAD_ANULADA"); }).catch(value => setError(value instanceof Error ? value.message : "No fue posible anular la novedad")); }}>Anular novedad</button></> : null}</div>;
          })() : null}

          {selectedAttendancePending ? (
            <div className="op-inline-note compact pending"><span>{`Guardando asistencia del ${shortDateLabel(selected.date) ?? selected.date}...`}</span></div>
          ) : null}

          {selectedAttendanceFailure ? (
            <div className="op-inline-note compact error"><span>{selectedAttendanceFailure}</span></div>
          ) : null}

          {selectedEmploymentMessage ? <div className="op-inline-note compact"><span>{selectedEmploymentMessage}</span></div> : null}

          <div className="op-actions">
            <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage)} onClick={() => openNovelty(selected)}>
              <Plus size={14} /> + Novedad
            </button>
            {present.has(`${selected.employee.vinculacion_id}|${selected.date}`) ? (
              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage) || selectedAttendancePending} onClick={() => void toggleAttendance(selected.employee, selected.date, true)}>
                {selectedAttendancePending ? "Guardando..." : "Quitar asistencia"}
              </button>
            ) : (
              <button type="button" disabled={!editable || Boolean(selectedEmploymentMessage) || selectedAttendancePending} onClick={() => void toggleAttendance(selected.employee, selected.date)}>
                {selectedAttendancePending ? "Guardando..." : "Marcar asistencia"}
              </button>
            )}
            <button
              type="button"
              disabled={!editable || Boolean(selectedEmploymentMessage)}
              onClick={() =>
                setRangeSelection({
                  employeeId: selected.employee.id,
                  start: selected.date,
                  end: null,
                })
              }
            >
              Preparar rango
            </button>
            {resolveOperativeState(selected.employee, reviewByEmployee.get(selected.employee.id) ?? null) === "REVISADO" ? <><button type="button" disabled={!editable} onClick={() => void changeOperativeState(selected.employee, "UNDO")}>Deshacer revision</button><button type="button" disabled={!canClose} onClick={() => void changeOperativeState(selected.employee, "CLOSE")}>Cerrar nomina</button></> : null}
            {resolveOperativeState(selected.employee, reviewByEmployee.get(selected.employee.id) ?? null) === "CERRADO" ? <button type="button" disabled={!canReopen} onClick={() => void changeOperativeState(selected.employee, "REOPEN")}>Reabrir nomina</button> : null}
          </div>
        </aside>
      ) : null}

      {noveltyCell ? (
        <div className="op-modal-backdrop">
          <div className="op-novelty-modal">
            <button type="button" className="op-close" onClick={closeNoveltyModal}>
              <X size={18} />
            </button>

            <h2>{editingNovelty ? "Corregir novedad" : "Registrar novedad"}</h2>
            <strong>{noveltyCell.employee.persona.nombre_completo}</strong>
            <span>
              CC {text(noveltyCell.employee.persona.numero_documento)} | {dateLabel(noveltyCell.date)}
            </span>
            <p>{buildContextTitle(noveltyCell.employee, noveltyCell.context)}</p>

            {!selectedType ? (
              <div className="op-type-grid">
                {types.map((type) => (
                  <button key={type.id} type="button" onClick={() => setSelectedType(type)}>
                    <b>{type.codigo_operativo ?? "NOV"}</b>
                    <span>{type.nombre ?? type.descripcion_operativa ?? "Novedad"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <h3>
                  {selectedType.codigo_operativo ?? "Novedad"} | {selectedType.nombre}
                </h3>

                <div className="op-inline-note">
                  <span>
                    {selectedType.modelo_registro === "EVENTO_CANONICO_RANGO"
                      ? "Evento canonico por rango"
                      : "Registro por periodo"}
                  </span>
                  {selectedType.requiere_revision ? <span>Requiere revision</span> : null}
                  {selectedType.afecta_cobertura === false ? <span>Cobertura opcional / no aplica</span> : null}
                </div>

                <div className="op-range-fields">
                  <label>
                    Desde
                    <input
                      type="date"
                      value={rangeStart || noveltyCell.date}
                      min={noveltyCell.employee.vinculacion.fecha_inicio ?? undefined}
                      max={noveltyCell.employee.vinculacion.fecha_fin ?? undefined}
                      readOnly={!selectedTypeAllowsRange}
                      onChange={(event) => setRangeStart(event.target.value)}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="date"
                      value={selectedTypeAllowsRange ? rangeEnd || rangeStart || noveltyCell.date : rangeStart || noveltyCell.date}
                      min={rangeStart || noveltyCell.date}
                      max={noveltyCell.employee.vinculacion.fecha_fin ?? undefined}
                      readOnly={!selectedTypeAllowsRange}
                      onChange={(event) => setRangeEnd(event.target.value)}
                    />
                  </label>
                  <label>
                    Dias
                    <input
                      type="number"
                      value={Math.max(
                        1,
                        Math.round(
                          (Date.parse(`${selectedTypeAllowsRange ? rangeEnd || rangeStart || noveltyCell.date : rangeStart || noveltyCell.date}T12:00:00Z`) -
                            Date.parse(`${rangeStart || noveltyCell.date}T12:00:00Z`)) /
                            86400000,
                        ) + 1,
                      )}
                      readOnly
                    />
                  </label>
                </div>

                {selectedType.requiere_horas ? (
                  <label className="op-form-field">
                    Horas
                    <input
                      inputMode="decimal"
                      placeholder="Horas requeridas"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                    />
                  </label>
                ) : null}

                {selectedType.requiere_valor ? (
                  <label className="op-form-field">
                    Valor manual
                    <input
                      inputMode="decimal"
                      placeholder="Valor requerido"
                      value={manualValue}
                      onChange={(event) => setManualValue(event.target.value)}
                    />
                  </label>
                ) : null}

                {selectedType.requiere_soporte ? (
                  <label className="op-form-field">
                    Documento soporte
                    <input
                      placeholder="documento_persona_id"
                      value={documentoPersonaId}
                      onChange={(event) => setDocumentoPersonaId(event.target.value)}
                    />
                  </label>
                ) : null}

                <label className="op-form-field">
                  Observacion
                  <textarea
                    rows={3}
                    placeholder="Observacion operativa"
                    value={observacion}
                    onChange={(event) => setObservacion(event.target.value)}
                  />
                </label>

                <div className="op-coverage-section">
                  <div className="op-coverage-header">
                    <strong>Cobertura del turno</strong>
                    <span>Define si alguien cubrio el turno de la persona con novedad.</span>
                  </div>

                  <div className="op-coverage-options">
                    {[
                      ["SIN_REEMPLAZO", "Sin reemplazo / No aplica"],
                      ["PERSONAL_VINCULADO", "Cubierto por personal vinculado"],
                      ["PERSONA_EXTERNA", "Cubierto por persona externa"],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className={`op-coverage-option ${coverageType === value ? "active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="coverageType"
                          value={value}
                          checked={coverageType === value}
                          onChange={() => setCoverageType(value as CoverageType)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>

                  {coverageType === "PERSONAL_VINCULADO" ? (
                    <div className="op-cover-search">
                      <label>
                        Quien cubrio el turno
                        <input
                          placeholder="Buscar por nombre o documento"
                          value={coverSearch}
                          onChange={(event) => setCoverSearch(event.target.value)}
                        />
                      </label>

                      {coverEmployee ? (
                        <div className="op-inline-note compact">
                          <p>
                            Seleccionado: {coverEmployee.persona.nombre_completo} |{" "}
                            {coverEmployee.persona.numero_documento ?? "Documento no disponible"} |{" "}
                            {getEmployeeMunicipioLabel(coverEmployee)} | {getEmployeeSedeLabel(coverEmployee)}
                          </p>
                        </div>
                      ) : null}

                      <div className="op-cover-results">
                        {coverageCandidates.map(({ employee }) => (
                          <button
                            key={employee.id}
                            type="button"
                            className={coverEmployee?.id === employee.id ? "selected" : ""}
                            onClick={() => setCoverEmployee(employee)}
                          >
                            <strong>{employee.persona.nombre_completo}</strong>
                            <span>{employee.persona.numero_documento ?? "Documento no disponible"}</span>
                            <small>
                              {getEmployeeMunicipioLabel(employee)} | {getEmployeeInstitucionLabel(employee)}
                            </small>
                            <small>
                              {getEmployeeSedeLabel(employee)} | {getEmployeeModalidadCode(employee)} |{" "}
                              {getEmployeeGestorLabel(employee)}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {coverageType === "PERSONA_EXTERNA" ? (
                    <div className="op-external-fields">
                      <label className="op-form-field">
                        Nombre completo
                        <input
                          placeholder="Nombre de quien cubrio"
                          value={externalName}
                          onChange={(event) => setExternalName(event.target.value)}
                        />
                      </label>
                      <label className="op-form-field">
                        Documento
                        <input
                          placeholder="Documento de la persona externa"
                          value={externalDocument}
                          onChange={(event) => setExternalDocument(event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}

                  <label className="op-form-field">
                    Observacion interna de cobertura
                    <textarea
                      rows={2}
                      placeholder="Contexto adicional de la cobertura"
                      value={coverageObservation}
                      onChange={(event) => setCoverageObservation(event.target.value)}
                    />
                  </label>
                </div>

                <div className="op-modal-actions">
                  <button type="button" onClick={closeNoveltyModal}>
                    Cancelar
                  </button>
                  <button type="button" disabled={saving} onClick={() => void saveNovelty()}>
                    {saving ? (editingNovelty ? "Guardando..." : "Registrando...") : (editingNovelty ? "Guardar correccion" : "Registrar")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}


