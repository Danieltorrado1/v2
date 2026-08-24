import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Calculator,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  IdCard,
  Lock,
  Plus,
  Search,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  createNominaNovedad,
  deactivateNominaNovedad,
  exportNomina,
  generateNominaDesprendibles,
  getAllNominaNovedades,
  getAllNominaPeriodoEmpleados,
  getNominaDesprendibles,
  getNominaPeriodo,
  getNominaPeriodoDashboard,
  getNominaPeriodos,
  listarTiposNovedad,
  openNominaDesprendible,
  recalculateNominaPeriodo,
  updateNominaNovedad,
} from "../../services/nominaApi";
import { ApiClientError } from "../../services/apiClient";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import type {
  GenerateNominaDesprendiblesResponse,
  NominaDesprendibleApi,
  NominaEmpleadoApi,
  NominaExportTipo,
  NominaNovedadApi,
  NominaPeriodoApi,
  NominaPeriodoDashboardApi,
  NominaTipoNovedad,
  NominaTipoNovedadResponse,
  PaginatedNominaEmpleadosApi,
  PaginatedNominaNovedadesApi,
  PaginatedNominaPeriodosApi,
} from "../../types/nomina.types";
import "./NominaPage.css";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type FilterOption = {
  value: string;
  label: string;
};

type KpiCard = {
  tone: Exclude<Tone, "neutral" | "purple">;
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  caption: string;
};

type NovedadFormState = {
  nomina_empleado_id: string;
  tipo_novedad_id: string;
  tipo_novedad_query: string;
  documento_persona_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: string;
  horas: string;
  valor_manual: string;
  observacion: string;
  revisado: boolean;
  requiere_cobertura: boolean;
  cubierta: boolean;
};

type FeedbackState = {
  message: string;
  tone: "success" | "error";
} | null;

type NovedadTipoDisplay = Omit<NominaTipoNovedad, "created_at"> & {
  created_at?: string;
};

const PERIODS_LIMIT = 100;
const EMPLOYEE_PAGE_SIZE_OPTIONS = [25, 50, 100];
const AVATAR_TONES = ["green", "blue", "purple", "orange", "red", "cyan"];
const EMPTY_ASYNC_STATE = { data: null, loading: false, error: null } as const;
const NOMINA_EXPORT_OPTIONS: FilterOption[] = [
  { value: "todo", label: "Exporte completo" },
  { value: "resumen", label: "Resumen" },
  { value: "dashboard", label: "Dashboard" },
  { value: "empleados", label: "Empleados" },
  { value: "novedades", label: "Novedades" },
  { value: "movimientos", label: "Movimientos" },
  { value: "desprendibles", label: "Desprendibles" },
  { value: "liquidaciones", label: "Liquidaciones" },
  { value: "plano_bancario", label: "Plano bancario" },
];
const NOMINA_OPERATIONAL_LEGEND = [
  { code: "L50", label: "Dia de no clase" },
  { code: "PR1", label: "Cita medica" },
  { code: "PR2", label: "Incapacidad medica" },
  { code: "PR3", label: "Calamidad familiar" },
  { code: "PR4", label: "Citacion oficial" },
  { code: "PNR", label: "Permiso no remunerado" },
  { code: "S", label: "Suspension" },
] as const;
const tabs = [
  { id: "resumen", label: "Resumen" },
  { id: "nomina", label: "Nomina" },
  { id: "novedades", label: "Novedades" },
  { id: "turnos", label: "Turnos" },
  { id: "soportes", label: "Soportes" },
] as const;

function createInitialNovedadForm(empleadoId = ""): NovedadFormState {
  return {
    nomina_empleado_id: empleadoId,
    tipo_novedad_id: "",
    tipo_novedad_query: "",
    documento_persona_id: "",
    fecha_inicio: "",
    fecha_fin: "",
    dias: "",
    horas: "",
    valor_manual: "",
    observacion: "",
    revisado: false,
    requiere_cobertura: false,
    cubierta: false,
  };
}

function formatCOP(value: number) {
  return `$${value.toLocaleString("es-CO")}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("es-CO");
}

function formatDateTime(value: string) {
  if (!value) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPeriodRange(fechaInicio: string, fechaFin: string) {
  if (!fechaInicio || !fechaFin) {
    return "Rango no disponible";
  }

  const formatter = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
  });

  return `${formatter.format(new Date(fechaInicio))} - ${formatter.format(new Date(fechaFin))}`;
}

function formatNovedadRange(novedad: NominaNovedadApi) {
  if (novedad.fecha_inicio && novedad.fecha_fin) {
    return formatPeriodRange(novedad.fecha_inicio, novedad.fecha_fin);
  }

  if (novedad.fecha_inicio) {
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(novedad.fecha_inicio));
  }

  if (novedad.fecha_fin) {
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(novedad.fecha_fin));
  }

  return "Sin fechas";
}

function isCanonicalProjectedNovedad(novedad: NominaNovedadApi) {
  return novedad.registro_tipo === "CANONICA_PROYECTADA";
}

function getNovedadProjectionLabel(novedad: NominaNovedadApi) {
  if (!isCanonicalProjectedNovedad(novedad)) {
    return null;
  }

  if (!novedad.fecha_inicio_evento_canonico || !novedad.fecha_fin_evento_canonico) {
    return "Evento canónico proyectado";
  }

  return `Evento canonico ${formatPeriodRange(
    novedad.fecha_inicio_evento_canonico,
    novedad.fecha_fin_evento_canonico,
  )}`;
}

function normalizeTextValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumberValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPeriodStatusLabel(estado: string) {
  switch (estado) {
    case "ABIERTO":
      return "Abierto";
    case "REVISADO":
      return "Revisado";
    case "CERRADO":
      return "Cerrado";
    case "PAGADO":
      return "Pagado";
    case "ANULADO":
      return "Anulado";
    default:
      return titleCase(estado);
  }
}

function getPeriodStatusTone(estado: string): Tone {
  switch (estado) {
    case "ABIERTO":
      return "info";
    case "REVISADO":
      return "warning";
    case "PAGADO":
      return "success";
    case "ANULADO":
      return "danger";
    default:
      return "neutral";
  }
}

function getNovedadStatusLabel(novedad: NominaNovedadApi) {
  if (!novedad.activo) {
    return "Inactiva";
  }

  return novedad.revisado ? "Revisada" : "Pendiente";
}

function getNovedadStatusTone(novedad: NominaNovedadApi): Tone {
  if (!novedad.activo) {
    return "neutral";
  }

  return novedad.revisado ? "success" : "warning";
}

function normalizeNovedadSearchValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getOperationalNovedadCodeLabel(tipo: Pick<NovedadTipoDisplay, "codigo_operativo" | "nombre">) {
  const code = tipo.codigo_operativo?.trim();
  const name = tipo.nombre?.trim();

  if (code && name) {
    return `${code} - ${name}`;
  }

  return code ?? name ?? "Tipo sin nombre";
}

function matchesNovedadTypeSearch(
  tipo: Pick<NovedadTipoDisplay, "codigo_operativo" | "nombre" | "categoria" | "descripcion_operativa">,
  normalizedQuery: string,
) {
  if (!normalizedQuery) {
    return true;
  }

  return [
    tipo.codigo_operativo,
    tipo.nombre,
    tipo.categoria,
    tipo.descripcion_operativa,
    getOperationalNovedadCodeLabel(tipo),
  ]
    .map((value) => normalizeNovedadSearchValue(value))
    .some((candidate) => candidate.includes(normalizedQuery));
}

function buildHistoricalNovedadType(tipo: NominaNovedadApi["tipo_novedad"]): NovedadTipoDisplay {
  return {
    ...tipo,
    activo: tipo.activo,
  };
}

function getVisibleNovedadTipoLabel(
  tipo: Pick<NovedadTipoDisplay, "id" | "nombre" | "categoria" | "codigo_operativo">,
) {
  const operational = getOperationalNovedadCodeLabel(tipo);
  const category = tipo.categoria?.trim();

  if (category) {
    return `${operational} - ${category}`;
  }

  return operational;
}

function isCatalogPermissionError(error: unknown) {
  return error instanceof ApiClientError && error.status === 403;
}

function getEmployeeStatusLabel(empleado: NominaEmpleadoApi) {
  if (empleado.estado) {
    return titleCase(empleado.estado);
  }

  return empleado.revisado ? "Revisado" : "Pendiente";
}

function getEmployeeStatusTone(empleado: NominaEmpleadoApi): Tone {
  const normalized = (empleado.estado ?? "").toUpperCase();

  if (normalized.includes("LIQ") || normalized.includes("PAG")) {
    return "success";
  }

  if (normalized.includes("REV")) {
    return "purple";
  }

  if (normalized.includes("PEND")) {
    return "warning";
  }

  if (normalized.includes("NOVED")) {
    return "info";
  }

  return empleado.revisado ? "success" : "neutral";
}

type EmployeeDocumentStatusSummary = {
  porcentajeCumplimiento: number | null;
  totalCargados: number;
  totalFaltantes: number;
  totalRequeridos: number;
};
function normalizeOptionalLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
function formatOptionalPercentage(value: number | null) {
  if (value === null) {
    return null;
  }

  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
}

function getEmployeeDocumentLabel(empleado: NominaEmpleadoApi) {
  return empleado.persona.numero_documento ?? "Documento no disponible";
}

function getEmployeeMunicipioLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.municipio) ?? "No disponible";
}

function getEmployeeContractLabel(empleado: NominaEmpleadoApi) {
  const numeroContrato = normalizeOptionalLabel(empleado.numero_contrato);

  if (numeroContrato) {
    return numeroContrato;
  }

  const contratoId = empleado.contrato_id ?? empleado.vinculacion.contrato_id;
  return contratoId ? `#${contratoId}` : "No disponible";
}

function getEmployeeClassificationValue(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.clasificacion);
}

function getEmployeeClassificationLabel(empleado: NominaEmpleadoApi) {
  return getEmployeeClassificationValue(empleado) ?? "No disponible";
}

function getEmployeeClassificationTone(empleado: NominaEmpleadoApi): Tone {
  switch (getEmployeeClassificationValue(empleado)?.toUpperCase()) {
    case "TC":
      return "success";
    case "MT":
      return "warning";
    case "OPS":
      return "info";
    case "ASISTENCIA":
      return "purple";
    default:
      return "neutral";
  }
}

function getEmployeeMetodoLiquidacionLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.metodo_liquidacion) ?? "No disponible";
}

function getEmployeeCargoLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.cargo?.nombre_cargo) ?? "No disponible";
}

function getEmployeeModalidadLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.modalidad) ?? normalizeOptionalLabel(empleado.categoria_salarial?.modalidad) ?? "No disponible";
}

function getEmployeeSedeLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.sede?.nombre_sede) ?? "No disponible";
}

function getEmployeeTotalNovedades(empleado: NominaEmpleadoApi) {
  return typeof empleado.total_novedades === "number" && Number.isFinite(empleado.total_novedades)
    ? empleado.total_novedades
    : 0;
}

function getEmployeeDocumentSummary(empleado: NominaEmpleadoApi) {
  return `${getEmployeeDocumentLabel(empleado)} • Contrato ${getEmployeeContractLabel(empleado)}`;
}

function getEmployeeDocumentStatusSummary(empleado: NominaEmpleadoApi): EmployeeDocumentStatusSummary | null {
  const estadoDocumental = empleado.estado_documental;
  if (!estadoDocumental) {
    return null;
  }
  return {
    porcentajeCumplimiento:
      typeof estadoDocumental.porcentaje_cumplimiento === "number" && Number.isFinite(estadoDocumental.porcentaje_cumplimiento)
        ? estadoDocumental.porcentaje_cumplimiento
        : null,
    totalCargados:
      typeof estadoDocumental.total_cargados === "number" && Number.isFinite(estadoDocumental.total_cargados)
        ? estadoDocumental.total_cargados
        : 0,
    totalFaltantes:
      typeof estadoDocumental.total_faltantes === "number" && Number.isFinite(estadoDocumental.total_faltantes)
        ? estadoDocumental.total_faltantes
        : 0,
    totalRequeridos:
      typeof estadoDocumental.total_requeridos === "number" && Number.isFinite(estadoDocumental.total_requeridos)
        ? estadoDocumental.total_requeridos
        : 0,
  };
}
function getEmployeeDocumentStatusLabel(empleado: NominaEmpleadoApi) {
  const summary = getEmployeeDocumentStatusSummary(empleado);

  if (!summary) {
    return "No disponible";
  }

  const parts = [
    summary.totalFaltantes === 0 ? "Completo" : `Pendientes ${formatNumber(summary.totalFaltantes)}`,
    `Total ${formatNumber(summary.totalRequeridos)}`,
  ];
  const porcentaje = formatOptionalPercentage(summary.porcentajeCumplimiento);

  if (porcentaje) {
    parts.push(porcentaje);
  }

  return parts.join(" • ");
}

function getInitials(nombreCompleto: string) {
  const parts = nombreCompleto
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "NA";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function getAvatarTone(id: string) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index)) % AVATAR_TONES.length;
  }

  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

function getDesprendibleStatusLabel(desprendible: NominaDesprendibleApi) {
  return desprendible.estado ? titleCase(desprendible.estado) : "No disponible";
}

function getDesprendibleStatusTone(desprendible: NominaDesprendibleApi): Tone {
  const normalized = desprendible.estado.trim().toUpperCase();

  if (!desprendible.activo) {
    return "neutral";
  }

  if (normalized.includes("FINAL")) {
    return "success";
  }

  if (normalized.includes("BORRADOR") || normalized.includes("PEND")) {
    return "warning";
  }

  return desprendible.es_vigente ? "primary" : "info";
}

function getDesprendibleFileLabel(desprendible: NominaDesprendibleApi) {
  return (
    desprendible.documento.nombre_original ??
    desprendible.documento.storage_path?.split("/").filter(Boolean).pop() ??
    "No disponible"
  );
}

function buildGenerateDesprendiblesMessage(result: GenerateNominaDesprendiblesResponse) {
  return `Desprendibles generados: ${formatNumber(result.desprendibles_generados)}.`;
}

function getVisiblePages(totalPages: number, currentPage: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const adjustedStart = Math.max(1, end - 4);
  const pages: number[] = [];

  for (let page = adjustedStart; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

function buildKpis(
  dashboard: NominaPeriodoDashboardApi | null,
  loading: boolean,
  error: string | null,
  hasSelectedPeriod: boolean,
  totalNovedadesOverride?: number | null,
): KpiCard[] {
  const unavailable = hasSelectedPeriod && !loading && !dashboard && Boolean(error);
  const countValue = (value?: number) => {
    if (loading) return "â€”";
    if (unavailable && value === undefined) return "No disponible";
    return formatNumber(value ?? 0);
  };
  const moneyValue = (value?: number) => {
    if (loading) return "â€”";
    if (unavailable && value === undefined) return "No disponible";
    return formatCOP(value ?? 0);
  };

  return [
    {
      tone: "primary",
      icon: Users,
      label: "Empleados del periodo",
      value: countValue(dashboard?.empleados_total),
      caption: hasSelectedPeriod ? "Base real del periodo seleccionado" : "Selecciona un periodo",
    },
    {
      tone: "success",
      icon: CheckCircle2,
      label: "Revisadas",
      value: countValue(dashboard?.empleados_revisados),
      caption: "Empleados revisados",
    },
    {
      tone: "warning",
      icon: AlertTriangle,
      label: "Pendientes",
      value: countValue(dashboard?.empleados_pendientes),
      caption: "Pendientes por revisar",
    },
    {
      tone: "info",
      icon: FileText,
      label: "Novedades",
      value: countValue(totalNovedadesOverride ?? dashboard?.total_novedades),
      caption: "Registradas en backend",
    },
    {
      tone: "primary",
      icon: Wallet,
      label: "Devengado",
      value: moneyValue(dashboard?.total_devengado),
      caption: "Total reportado por backend",
    },
    {
      tone: "danger",
      icon: Banknote,
      label: "Neto",
      value: moneyValue(dashboard?.total_neto),
      caption: "Neto total del periodo",
    },
  ];
}

export default function NominaPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("nomina");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [documentTerm, setDocumentTerm] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [clasificacionFilter, setClasificacionFilter] = useState("");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isNovedadModalOpen, setIsNovedadModalOpen] = useState(false);
  const [editingNovedad, setEditingNovedad] = useState<NominaNovedadApi | null>(null);
  const [novedadForm, setNovedadForm] = useState<NovedadFormState>(createInitialNovedadForm());
  const [novedadFormError, setNovedadFormError] = useState<string | null>(null);
  const [isSubmittingNovedad, setIsSubmittingNovedad] = useState(false);
  const [mutatingNovedadId, setMutatingNovedadId] = useState<string | null>(null);
  const [mutatingNovedadAction, setMutatingNovedadAction] = useState<"review" | "deactivate" | null>(null);
  const [novedadActionError, setNovedadActionError] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [desprendiblesState, setDesprendiblesState] = useState<AsyncState<NominaDesprendibleApi[]>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [desprendiblesDataId, setDesprendiblesDataId] = useState<string | null>(null);
  const [includeDesprendibleVersions, setIncludeDesprendibleVersions] = useState(false);
  const [selectedExportType, setSelectedExportType] = useState<NominaExportTipo>("todo");
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingDesprendibles, setIsGeneratingDesprendibles] = useState(false);
  const [downloadingDesprendibleId, setDownloadingDesprendibleId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<FeedbackState>(null);

  const [periodsState, setPeriodsState] = useState<AsyncState<PaginatedNominaPeriodosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [periodState, setPeriodState] = useState<AsyncState<NominaPeriodoApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [periodDataId, setPeriodDataId] = useState<string | null>(null);
  const [dashboardState, setDashboardState] = useState<AsyncState<NominaPeriodoDashboardApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [dashboardDataId, setDashboardDataId] = useState<string | null>(null);
  const [employeesState, setEmployeesState] = useState<AsyncState<PaginatedNominaEmpleadosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [employeesDataId, setEmployeesDataId] = useState<string | null>(null);
  const [novedadesState, setNovedadesState] = useState<AsyncState<PaginatedNominaNovedadesApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [novedadesDataId, setNovedadesDataId] = useState<string | null>(null);
  const [tiposNovedadState, setTiposNovedadState] = useState<AsyncState<NominaTipoNovedadResponse>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [tiposNovedadStatusCode, setTiposNovedadStatusCode] = useState<number | null>(null);
  const [dashboardCache, setDashboardCache] = useState<Record<string, NominaPeriodoDashboardApi>>({});

  const periodsRequestRef = useRef(0);
  const periodRequestRef = useRef(0);
  const dashboardRequestRef = useRef(0);
  const employeesRequestRef = useRef(0);
  const novedadesRequestRef = useRef(0);
  const tiposNovedadRequestRef = useRef(0);
  const desprendiblesRequestRef = useRef(0);
  const dashboardCacheRef = useRef<Record<string, NominaPeriodoDashboardApi>>({});

  useEffect(() => {
    const path = location.pathname;
    setActiveTab(path.endsWith("/novedades") ? "novedades" : path.endsWith("/documentos") ? "soportes" : "nomina");
  }, [location.pathname]);

  const periodos = useMemo(() => periodsState.data?.items ?? [], [periodsState.data]);
  const selectedPeriodFromList = periodos.find((periodo) => periodo.id === selectedPeriodId) ?? null;
  const selectedPeriod =
    periodState.data && periodDataId === selectedPeriodId ? periodState.data : selectedPeriodFromList;
  const selectedDashboard =
    selectedPeriodId && dashboardDataId === selectedPeriodId && dashboardState.data
      ? dashboardState.data
      : selectedPeriodId
        ? dashboardCache[selectedPeriodId] ?? null
        : null;
  const allEmployees = useMemo(
    () =>
      selectedPeriodId && employeesDataId === selectedPeriodId && employeesState.data
        ? employeesState.data.items
        : [],
    [employeesDataId, employeesState.data, selectedPeriodId],
  );
  const allNovedades = useMemo(
    () =>
      selectedPeriodId && novedadesDataId === selectedPeriodId && novedadesState.data
        ? novedadesState.data.items
        : [],
    [novedadesDataId, novedadesState.data, selectedPeriodId],
  );
  const catalogoTiposNovedad = useMemo(() => tiposNovedadState.data?.items ?? [], [tiposNovedadState.data]);
  const allDesprendibles = useMemo(
    () =>
      selectedPeriodId && desprendiblesDataId === selectedPeriodId && desprendiblesState.data
        ? desprendiblesState.data
        : [],
    [desprendiblesDataId, desprendiblesState.data, selectedPeriodId],
  );
  const isNominaTab = activeTab === "nomina";
  const isNovedadesTab = activeTab === "novedades";
  const isSupportsTab = activeTab === "soportes";
  const isRecordsTab = isNominaTab || isNovedadesTab || isSupportsTab;

  const loadPeriods = useCallback(async (preferredPeriodId?: string) => {
    const requestId = ++periodsRequestRef.current;

    setPeriodsState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));

    try {
      const data = await getNominaPeriodos({ page: 1, limit: PERIODS_LIMIT });

      if (requestId !== periodsRequestRef.current) {
        return;
      }

      setPeriodsState({
        data,
        loading: false,
        error: null,
      });

      setSelectedPeriodId((current) => {
        if (preferredPeriodId && data.items.some((periodo) => periodo.id === preferredPeriodId)) {
          return preferredPeriodId;
        }

        if (current && data.items.some((periodo) => periodo.id === current)) {
          return current;
        }

        return pickDefaultNominaPeriod(data.items)?.id ?? null;
      });
    } catch (error) {
      if (requestId !== periodsRequestRef.current) {
        return;
      }

      setPeriodsState((current) => ({
        data: current.data,
        loading: false,
        error: toMessage(error),
      }));
    }
  }, []);

  const loadPeriod = useCallback(async (periodId: string) => {
    const requestId = ++periodRequestRef.current;
    setPeriodDataId(periodId);

    setPeriodState({
      data: null,
      loading: true,
      error: null,
    });

    try {
      const data = await getNominaPeriodo(periodId);

      if (requestId !== periodRequestRef.current) {
        return;
      }

      setPeriodState({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== periodRequestRef.current) {
        return;
      }

      setPeriodState({
        data: null,
        loading: false,
        error: toMessage(error),
      });
    }
  }, []);

  const loadDashboard = useCallback(async (periodId: string) => {
    const requestId = ++dashboardRequestRef.current;
    const cachedDashboard = dashboardCacheRef.current[periodId] ?? null;
    setDashboardDataId(periodId);

    setDashboardState({
      data: cachedDashboard,
      loading: true,
      error: null,
    });

    try {
      const data = await getNominaPeriodoDashboard(periodId);

      if (requestId !== dashboardRequestRef.current) {
        return;
      }

      dashboardCacheRef.current = {
        ...dashboardCacheRef.current,
        [periodId]: data,
      };
      setDashboardCache(dashboardCacheRef.current);
      setDashboardState({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== dashboardRequestRef.current) {
        return;
      }

      setDashboardState({
        data: cachedDashboard,
        loading: false,
        error: toMessage(error),
      });
    }
  }, []);

  const loadEmployees = useCallback(async (periodId: string) => {
    const requestId = ++employeesRequestRef.current;
    setEmployeesDataId(periodId);

    setEmployeesState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));

    try {
      const data = await getAllNominaPeriodoEmpleados(periodId);

      if (requestId !== employeesRequestRef.current) {
        return;
      }

      setEmployeesState({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== employeesRequestRef.current) {
        return;
      }

      setEmployeesState({
        data: null,
        loading: false,
        error: toMessage(error),
      });
    }
  }, []);

  const loadNovedades = useCallback(async (periodId: string) => {
    const requestId = ++novedadesRequestRef.current;
    setNovedadesDataId(periodId);

    setNovedadesState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));

    try {
      const data = await getAllNominaNovedades({ periodo_id: periodId });

      if (requestId !== novedadesRequestRef.current) {
        return;
      }

      setNovedadesState({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== novedadesRequestRef.current) {
        return;
      }

      setNovedadesState({
        data: null,
        loading: false,
        error: toMessage(error),
      });
    }
  }, []);

  const loadTiposNovedad = useCallback(async () => {
    const requestId = ++tiposNovedadRequestRef.current;

    setTiposNovedadState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));
    setTiposNovedadStatusCode(null);

    try {
      const data = await listarTiposNovedad();

      if (requestId !== tiposNovedadRequestRef.current) {
        return;
      }

      setTiposNovedadState({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== tiposNovedadRequestRef.current) {
        return;
      }

      setTiposNovedadState((current) => ({
        data: current.data,
        loading: false,
        error: toMessage(error),
      }));
      setTiposNovedadStatusCode(isCatalogPermissionError(error) ? 403 : error instanceof ApiClientError ? error.status : null);
    }
  }, []);

  const loadDesprendibles = useCallback(async (periodId: string, includeVersions: boolean) => {
    const requestId = ++desprendiblesRequestRef.current;
    setDesprendiblesDataId(periodId);

    setDesprendiblesState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));

    try {
      const data = await getNominaDesprendibles(periodId, includeVersions ? { include_versiones: true } : {});

      if (requestId !== desprendiblesRequestRef.current) {
        return;
      }

      setDesprendiblesState({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== desprendiblesRequestRef.current) {
        return;
      }

      setDesprendiblesState({
        data: null,
        loading: false,
        error: toMessage(error),
      });
    }
  }, []);

  const refreshSelectedPeriodData = useCallback(async (periodId: string) => {
    await Promise.all([
      loadPeriod(periodId),
      loadDashboard(periodId),
      loadEmployees(periodId),
      loadNovedades(periodId),
    ]);
  }, [loadDashboard, loadEmployees, loadNovedades, loadPeriod]);

  useEffect(() => {
    void loadPeriods(searchParams.get("period_id") ?? (typeof window !== "undefined" ? window.sessionStorage.getItem("nomina.periodo_id") ?? undefined : undefined));
  }, [loadPeriods, searchParams]);

  useEffect(() => {
    void loadTiposNovedad();
  }, [loadTiposNovedad]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setPeriodState({ ...EMPTY_ASYNC_STATE });
      setPeriodDataId(null);
      setDashboardState({ ...EMPTY_ASYNC_STATE });
      setDashboardDataId(null);
      setEmployeesState({ ...EMPTY_ASYNC_STATE });
      setEmployeesDataId(null);
      setNovedadesState({ ...EMPTY_ASYNC_STATE });
      setNovedadesDataId(null);
      setDesprendiblesState({ ...EMPTY_ASYNC_STATE });
      setDesprendiblesDataId(null);
      setIsNovedadModalOpen(false);
      return;
    }

    setTablePage(1);
    setExpandedEmployeeId(null);
    setNovedadActionError(null);
    void refreshSelectedPeriodData(selectedPeriodId);
  }, [refreshSelectedPeriodData, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) {
      return;
    }

    void loadDesprendibles(selectedPeriodId, includeDesprendibleVersions);
  }, [includeDesprendibleVersions, loadDesprendibles, selectedPeriodId]);

  useEffect(() => {
    setTablePage(1);
  }, [activeTab, selectedPeriodId, searchTerm, documentTerm, estadoFilter, clasificacionFilter, pageSize]);

  useEffect(() => {
    if (!actionFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionFeedback(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [actionFeedback]);

  useEffect(() => {
    if (!novedadActionError) {
      return;
    }

    setActionFeedback({
      tone: "error",
      message: novedadActionError,
    });
    setNovedadActionError(null);
  }, [novedadActionError]);

  useEffect(() => {
    if (!recalculateError) {
      return;
    }

    setActionFeedback({
      tone: "error",
      message: recalculateError,
    });
    setRecalculateError(null);
  }, [recalculateError]);

  useEffect(() => {
    if (!isNovedadModalOpen || allEmployees.length === 0) {
      return;
    }

    const selectedEmployeeExists = allEmployees.some((employee) => employee.id === novedadForm.nomina_empleado_id);

    if (!selectedEmployeeExists) {
      setNovedadForm((current) => ({
        ...current,
        nomina_empleado_id: allEmployees[0]?.id ?? "",
      }));
    }
  }, [allEmployees, isNovedadModalOpen, novedadForm.nomina_empleado_id]);

  const employeeStatusOptions = useMemo(() => {
    const labels = new Set<string>();

    for (const empleado of allEmployees) {
      labels.add(getEmployeeStatusLabel(empleado));
    }

    return Array.from(labels)
      .sort((left, right) => left.localeCompare(right, "es"))
      .map((label) => ({
        value: label,
        label,
      }));
  }, [allEmployees]);
  const employeeClassificationOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const empleado of allEmployees) {
      const clasificacion = getEmployeeClassificationValue(empleado);
      if (clasificacion) {
        labels.add(clasificacion);
      }
    }
    return Array.from(labels)
      .sort((left, right) => left.localeCompare(right, "es"))
      .map((label) => ({
        value: label,
        label,
      }));
  }, [allEmployees]);

  const novedadStatusOptions = useMemo(() => {
    const labels = new Set<string>();

    for (const novedad of allNovedades) {
      labels.add(getNovedadStatusLabel(novedad));
    }

    return Array.from(labels)
      .sort((left, right) => left.localeCompare(right, "es"))
      .map((label) => ({
        value: label,
        label,
      }));
  }, [allNovedades]);

  const desprendibleStatusOptions = useMemo(() => {
    const labels = new Set<string>();

    for (const desprendible of allDesprendibles) {
      labels.add(getDesprendibleStatusLabel(desprendible));
    }

    return Array.from(labels)
      .sort((left, right) => left.localeCompare(right, "es"))
      .map((label) => ({
        value: label,
        label,
      }));
  }, [allDesprendibles]);

  const currentStatusOptions = isNovedadesTab
    ? novedadStatusOptions
    : isSupportsTab
      ? desprendibleStatusOptions
      : employeeStatusOptions;

  const novedadTypesById = useMemo(() => {
    const tipos = new Map<string, NovedadTipoDisplay>();

    for (const tipo of catalogoTiposNovedad) {
      tipos.set(tipo.id, tipo);
    }

    for (const novedad of allNovedades) {
      if (!tipos.has(novedad.tipo_novedad.id)) {
        tipos.set(novedad.tipo_novedad.id, buildHistoricalNovedadType(novedad.tipo_novedad));
      }
    }

    return tipos;
  }, [allNovedades, catalogoTiposNovedad]);

  const groupedNovedadTypes = useMemo(() => {
    const grupos = new Map<string, NominaTipoNovedad[]>();

    for (const tipo of catalogoTiposNovedad) {
      const categoria = tipo.categoria?.trim() || "Sin categoria";
      const current = grupos.get(categoria) ?? [];
      current.push(tipo);
      grupos.set(categoria, current);
    }

    return Array.from(grupos.entries()).map(([categoria, items]) => ({
      categoria,
      items,
    }));
  }, [catalogoTiposNovedad]);

  const selectedNovedadType = useMemo(
    () => novedadTypesById.get(novedadForm.tipo_novedad_id.trim()) ?? null,
    [novedadForm.tipo_novedad_id, novedadTypesById],
  );

  const filteredNovedadTypeSuggestions = useMemo(() => {
    const normalizedQuery = normalizeNovedadSearchValue(novedadForm.tipo_novedad_query);

    return catalogoTiposNovedad
      .filter((tipo) => matchesNovedadTypeSearch(tipo, normalizedQuery))
      .sort((left, right) => {
        const leftHasCode = left.codigo_operativo ? 0 : 1;
        const rightHasCode = right.codigo_operativo ? 0 : 1;

        if (leftHasCode !== rightHasCode) {
          return leftHasCode - rightHasCode;
        }

        return getVisibleNovedadTipoLabel(left).localeCompare(getVisibleNovedadTipoLabel(right), "es-CO");
      })
      .slice(0, normalizedQuery ? 8 : 12);
  }, [catalogoTiposNovedad, novedadForm.tipo_novedad_query]);

  const selectedFormEmployee =
    allEmployees.find((employee) => employee.id === novedadForm.nomina_empleado_id) ?? null;

  const novedadesCountByEmpleadoId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const novedad of allNovedades) {
      counts.set(novedad.nomina_empleado_id, (counts.get(novedad.nomina_empleado_id) ?? 0) + 1);
    }

    return counts;
  }, [allNovedades]);

  const filteredEmployees = useMemo(() => {
    const searchNeedle = searchTerm.trim().toLowerCase();
    const documentNeedle = documentTerm.trim().toLowerCase();
    const selectedClassification = clasificacionFilter.trim().toLowerCase();
    return allEmployees.filter((empleado) => {
      const nombre = empleado.persona.nombre_completo.toLowerCase();
      const documento = (empleado.persona.numero_documento ?? "").toLowerCase();
      const estado = getEmployeeStatusLabel(empleado).toLowerCase();
      const clasificacion = (getEmployeeClassificationValue(empleado) ?? "").toLowerCase();
      if (searchNeedle && !nombre.includes(searchNeedle)) {
        return false;
      }
      if (documentNeedle && !documento.includes(documentNeedle)) {
        return false;
      }
      if (estadoFilter && estado !== estadoFilter.toLowerCase()) {
        return false;
      }
      if (selectedClassification && clasificacion !== selectedClassification) {
        return false;
      }
      return true;
    });
  }, [allEmployees, clasificacionFilter, documentTerm, estadoFilter, searchTerm]);

  const filteredNovedades = useMemo(() => {
    const searchNeedle = searchTerm.trim().toLowerCase();
    const documentNeedle = documentTerm.trim().toLowerCase();

    return allNovedades.filter((novedad) => {
      const nombre = novedad.persona.nombre_completo.toLowerCase();
      const documento = (novedad.persona.numero_documento ?? "").toLowerCase();
      const estado = getNovedadStatusLabel(novedad).toLowerCase();

      if (searchNeedle && !nombre.includes(searchNeedle)) {
        return false;
      }

      if (documentNeedle && !documento.includes(documentNeedle)) {
        return false;
      }

      if (estadoFilter && estado !== estadoFilter.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [allNovedades, documentTerm, estadoFilter, searchTerm]);

  const filteredDesprendibles = useMemo(() => {
    const searchNeedle = searchTerm.trim().toLowerCase();
    const documentNeedle = documentTerm.trim().toLowerCase();

    return allDesprendibles.filter((desprendible) => {
      const nombre = desprendible.persona.nombre_completo.toLowerCase();
      const documento = (desprendible.persona.numero_documento ?? "").toLowerCase();
      const estado = getDesprendibleStatusLabel(desprendible).toLowerCase();

      if (searchNeedle && !nombre.includes(searchNeedle)) {
        return false;
      }

      if (documentNeedle && !documento.includes(documentNeedle)) {
        return false;
      }

      if (estadoFilter && estado !== estadoFilter.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [allDesprendibles, documentTerm, estadoFilter, searchTerm]);

  const totalFilteredRecords = isNominaTab
    ? filteredEmployees.length
    : isNovedadesTab
      ? filteredNovedades.length
      : isSupportsTab
        ? filteredDesprendibles.length
        : 0;
  const totalPages = Math.max(1, Math.ceil(totalFilteredRecords / pageSize));
  const currentPage = Math.min(tablePage, totalPages);
  const pageStart = totalFilteredRecords === 0 ? 0 : (currentPage - 1) * pageSize;
  const visibleEmployees = filteredEmployees.slice(pageStart, pageStart + pageSize);
  const visibleNovedades = filteredNovedades.slice(pageStart, pageStart + pageSize);
  const visibleDesprendibles = filteredDesprendibles.slice(pageStart, pageStart + pageSize);
  const pageNumbers = getVisiblePages(totalPages, currentPage);
  const showingFrom = totalFilteredRecords === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + pageSize, totalFilteredRecords);

  useEffect(() => {
    if (tablePage > totalPages) {
      setTablePage(totalPages);
    }
  }, [tablePage, totalPages]);

  const periodOptions: FilterOption[] = periodos.map((periodo) => ({
    value: periodo.id,
    label: periodo.nombre_periodo,
  }));

  const kpis = buildKpis(
    selectedDashboard,
    dashboardState.loading,
    dashboardState.error,
    Boolean(selectedPeriodId),
    selectedPeriodId ? allNovedades.length : null,
  );

  const currentTabLoading = isNovedadesTab
    ? novedadesState.loading
    : isSupportsTab
      ? desprendiblesState.loading
      : employeesState.loading;
  const catalogPermissionDenied = tiposNovedadStatusCode === 403;
  const catalogIsEmpty = !tiposNovedadState.loading && !tiposNovedadState.error && catalogoTiposNovedad.length === 0;
  const catalogInlineError = catalogPermissionDenied
    ? "No tienes permisos para consultar el catalogo de tipos de novedad. La creacion de novedades esta deshabilitada."
    : tiposNovedadState.error;
  const globalInlineError = dashboardState.error;
  const canOpenNovedadModal =
    Boolean(selectedPeriodId) &&
    !employeesState.loading &&
    allEmployees.length > 0 &&
    !catalogPermissionDenied;
  const novedadesBadgeCount = allNovedades.length;

  const handleSelectPeriod = (periodId: string) => {
    setSelectedPeriodId(periodId);
    setExpandedEmployeeId(null);
    setRecalculateError(null);
    setNovedadActionError(null);
    setActionFeedback(null);
  };
  const handleClearFilters = () => {
    setSearchTerm("");
    setDocumentTerm("");
    setEstadoFilter("");
    setClasificacionFilter("");
    setExpandedEmployeeId(null);
    setTablePage(1);
  };
  const handleToggleEmployeeDetail = (employeeId: string) => {
    setExpandedEmployeeId((current) => (current === employeeId ? null : employeeId));
  };
  const handleRetry = () => {
    if (!selectedPeriodId) {
      void loadTiposNovedad();
      void loadPeriods();
      return;
    }

    void Promise.all([
      loadTiposNovedad(),
      loadPeriods(selectedPeriodId),
      refreshSelectedPeriodData(selectedPeriodId),
      loadDesprendibles(selectedPeriodId, includeDesprendibleVersions),
    ]);
  };

  const handleRecalculate = async () => {
    if (!selectedPeriodId) {
      return;
    }

    setIsRecalculating(true);
    setRecalculateError(null);
    setActionFeedback(null);

    try {
      await recalculateNominaPeriodo(selectedPeriodId);
      await Promise.all([
        loadPeriods(selectedPeriodId),
        refreshSelectedPeriodData(selectedPeriodId),
        loadDesprendibles(selectedPeriodId, includeDesprendibleVersions),
      ]);
      setActionFeedback({
        tone: "success",
        message: "El perÃ­odo fue recalculado y los datos se refrescaron desde el backend.",
      });
    } catch (error) {
      setRecalculateError(toMessage(error));
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleExportNomina = async () => {
    if (!selectedPeriodId || isExporting) {
      return;
    }

    setIsExporting(true);
    setActionFeedback(null);

    try {
      const metadata = await exportNomina(selectedPeriodId, {
        include_versiones: selectedExportType === "desprendibles" ? includeDesprendibleVersions : undefined,
        tipo: selectedExportType,
      });
      setActionFeedback({
        tone: "success",
        message: `Se generÃ³ la exportaciÃ³n real del backend: ${metadata.file_name}.`,
      });
    } catch (error) {
      setActionFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateDesprendibles = async () => {
    if (!selectedPeriodId || isGeneratingDesprendibles) {
      return;
    }

    setIsGeneratingDesprendibles(true);
    setActionFeedback(null);

    try {
      const result = await generateNominaDesprendibles(selectedPeriodId);
      await loadDesprendibles(selectedPeriodId, includeDesprendibleVersions);
      setActionFeedback({
        tone: "success",
        message: buildGenerateDesprendiblesMessage(result),
      });
    } catch (error) {
      setActionFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setIsGeneratingDesprendibles(false);
    }
  };

  const handleOpenDesprendible = async (desprendible: NominaDesprendibleApi) => {
    if (!desprendible.es_vigente || downloadingDesprendibleId) {
      return;
    }

    setDownloadingDesprendibleId(desprendible.id);
    setActionFeedback(null);

    try {
      const metadata = await openNominaDesprendible(desprendible.periodo_id, desprendible.vinculacion_id);
      setActionFeedback({
        tone: "success",
        message: `Se abriÃ³ el desprendible vigente: ${metadata.file_name}.`,
      });
    } catch (error) {
      setActionFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setDownloadingDesprendibleId(null);
    }
  };

  const openNovedadModal = (employeeId: string | null, novedad?: NominaNovedadApi | null) => {
    if (!selectedPeriodId || allEmployees.length === 0 || catalogPermissionDenied) {
      return;
    }

    if (!tiposNovedadState.data && !tiposNovedadState.loading) {
      void loadTiposNovedad();
    }

    const fallbackEmployeeId = novedad
      ? novedad.nomina_empleado_id
      : employeeId && allEmployees.some((employee) => employee.id === employeeId)
        ? employeeId
        : allEmployees[0]?.id ?? "";

    const nextForm = createInitialNovedadForm(fallbackEmployeeId);

    if (novedad) {
      nextForm.tipo_novedad_id = novedad.tipo_novedad.id;
      nextForm.tipo_novedad_query = getVisibleNovedadTipoLabel(novedad.tipo_novedad);
      nextForm.documento_persona_id = novedad.documento_persona_id ?? "";
      nextForm.fecha_inicio = novedad.fecha_inicio ?? "";
      nextForm.fecha_fin = novedad.fecha_fin ?? "";
      nextForm.dias = novedad.dias !== null ? String(novedad.dias) : "";
      nextForm.horas = novedad.horas !== null ? String(novedad.horas) : "";
      nextForm.valor_manual = novedad.valor_manual !== null ? String(novedad.valor_manual) : "";
      nextForm.observacion = novedad.observacion ?? "";
      nextForm.revisado = novedad.revisado;
      nextForm.requiere_cobertura = novedad.requiere_cobertura;
      nextForm.cubierta = novedad.cubierta;
    }

    setEditingNovedad(novedad ?? null);
    setNovedadForm(nextForm);
    setNovedadFormError(null);
    setIsNovedadModalOpen(true);
  };

  const closeNovedadModal = () => {
    setIsNovedadModalOpen(false);
    setEditingNovedad(null);
    setNovedadFormError(null);
    setIsSubmittingNovedad(false);
  };

  const handleFormValueChange = <K extends keyof NovedadFormState>(key: K, value: NovedadFormState[K]) => {
    setNovedadFormError(null);
    setNovedadForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleNovedadTypeChange = (tipoNovedadId: string, queryOverride?: string) => {
    const nextType = novedadTypesById.get(tipoNovedadId) ?? null;

    setNovedadFormError(null);
    setNovedadForm((current) => ({
      ...current,
      tipo_novedad_id: tipoNovedadId,
      tipo_novedad_query: queryOverride ?? (nextType ? getVisibleNovedadTipoLabel(nextType) : current.tipo_novedad_query),
      documento_persona_id: nextType?.requiere_soporte ? current.documento_persona_id : "",
      fecha_inicio: nextType?.requiere_fechas ? current.fecha_inicio : "",
      fecha_fin: nextType?.requiere_fechas ? current.fecha_fin : "",
      dias: nextType?.requiere_dias ? current.dias : "",
      horas: nextType?.requiere_horas ? current.horas : "",
      valor_manual: nextType?.requiere_valor ? current.valor_manual : "",
    }));
  };

  const handleNovedadTypeQueryChange = (query: string) => {
    const normalizedQuery = normalizeNovedadSearchValue(query);
    const exactMatch =
      catalogoTiposNovedad.find((tipo) => {
        return [
          tipo.codigo_operativo,
          tipo.nombre,
          tipo.descripcion_operativa,
          getVisibleNovedadTipoLabel(tipo),
        ]
          .map((value) => normalizeNovedadSearchValue(value))
          .some((candidate) => candidate === normalizedQuery);
      }) ?? null;

    setNovedadFormError(null);
    setNovedadForm((current) => ({
      ...current,
      tipo_novedad_query: query,
      tipo_novedad_id: exactMatch?.id ?? "",
      documento_persona_id: exactMatch?.requiere_soporte ? current.documento_persona_id : "",
    }));
  };

  const validateNovedadForm = () => {
    if (!selectedPeriodId) {
      return "Selecciona un periodo antes de registrar una novedad.";
    }

    if (catalogPermissionDenied) {
      return "No tienes permisos para consultar el catalogo de tipos de novedad.";
    }

    if (tiposNovedadState.loading) {
      return "Cargando catalogo de tipos de novedad.";
    }

    if (tiposNovedadState.error && !tiposNovedadState.data) {
      return "No fue posible cargar el catalogo de tipos de novedad.";
    }

    if (catalogIsEmpty) {
      return "El catalogo de tipos de novedad no tiene registros activos disponibles.";
    }

    if (!selectedFormEmployee) {
      return "Selecciona un empleado del periodo.";
    }

    if (!novedadForm.tipo_novedad_id.trim()) {
      return novedadForm.tipo_novedad_query.trim()
        ? "El codigo o descripcion digitado no corresponde a un tipo de novedad activo."
        : "Debes seleccionar un tipo de novedad.";
    }

    if (!selectedNovedadType) {
      return "El tipo de novedad seleccionado no es valido.";
    }

    if (selectedNovedadType.requiere_fechas && (!novedadForm.fecha_inicio || !novedadForm.fecha_fin)) {
      return "El tipo seleccionado requiere fecha inicial y fecha final.";
    }

    if (selectedNovedadType.requiere_dias && !novedadForm.dias.trim()) {
      return "El tipo seleccionado requiere dias.";
    }

    if (selectedNovedadType.requiere_horas && !novedadForm.horas.trim()) {
      return "El tipo seleccionado requiere horas.";
    }

    if (selectedNovedadType.requiere_valor && !novedadForm.valor_manual.trim()) {
      return "El tipo seleccionado requiere valor_manual.";
    }

    return null;
  };

  const handleSubmitNovedad = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationMessage = validateNovedadForm();

    if (validationMessage) {
      setNovedadFormError(validationMessage);
      return;
    }

    if (!selectedPeriodId || !selectedFormEmployee || !selectedNovedadType) {
      return;
    }

    setIsSubmittingNovedad(true);
    setNovedadFormError(null);
    setNovedadActionError(null);

    try {
      const createPayload = {
        periodo_id: selectedPeriodId,
        nomina_empleado_id: selectedFormEmployee.id,
        vinculacion_id: selectedFormEmployee.vinculacion_id,
        tipo_novedad_id: selectedNovedadType.id,
        tipo_novedad_codigo: selectedNovedadType.codigo_operativo ?? null,
        revisado: novedadForm.revisado,
        requiere_cobertura: novedadForm.requiere_cobertura,
        cubierta: novedadForm.cubierta,
        activo: true,
      } as const;

      const sharedPayload = {
        tipo_novedad_id: selectedNovedadType.id,
        tipo_novedad_codigo: selectedNovedadType.codigo_operativo ?? null,
        revisado: novedadForm.revisado,
        requiere_cobertura: novedadForm.requiere_cobertura,
        cubierta: novedadForm.cubierta,
        activo: true,
        ...(selectedNovedadType.requiere_fechas
          ? {
              fecha_inicio: novedadForm.fecha_inicio,
              fecha_fin: novedadForm.fecha_fin,
            }
          : {}),
        ...(selectedNovedadType.requiere_dias
          ? {
              dias: parseOptionalNumberValue(novedadForm.dias),
            }
          : {}),
        ...(selectedNovedadType.requiere_horas
          ? {
              horas: parseOptionalNumberValue(novedadForm.horas),
            }
          : {}),
        ...(selectedNovedadType.requiere_valor
          ? {
              valor_manual: parseOptionalNumberValue(novedadForm.valor_manual),
            }
          : {}),
        ...(normalizeTextValue(novedadForm.observacion)
          ? {
              observacion: normalizeTextValue(novedadForm.observacion),
            }
          : {}),
        ...(normalizeTextValue(novedadForm.documento_persona_id)
          ? {
              documento_persona_id: normalizeTextValue(novedadForm.documento_persona_id),
            }
          : {}),
      };

      if (editingNovedad) {
        await updateNominaNovedad(editingNovedad.id, sharedPayload);
      } else {
        await createNominaNovedad({
          ...createPayload,
          ...sharedPayload,
        });
      }

      await refreshSelectedPeriodData(selectedPeriodId);
      closeNovedadModal();
    } catch (error) {
      setNovedadFormError(toMessage(error));
    } finally {
      setIsSubmittingNovedad(false);
    }
  };

  const handleMarkNovedadReviewed = async (novedad: NominaNovedadApi) => {
    if (!selectedPeriodId || novedad.revisado || !novedad.activo || isCanonicalProjectedNovedad(novedad)) {
      return;
    }

    setMutatingNovedadId(novedad.id);
    setMutatingNovedadAction("review");
    setNovedadActionError(null);

    try {
      await updateNominaNovedad(novedad.id, { revisado: true });
      await refreshSelectedPeriodData(selectedPeriodId);
    } catch (error) {
      setNovedadActionError(toMessage(error));
    } finally {
      setMutatingNovedadId(null);
      setMutatingNovedadAction(null);
    }
  };

  const handleDeactivateNovedad = async (novedad: NominaNovedadApi) => {
    if (!selectedPeriodId || !novedad.activo) {
      return;
    }

    setMutatingNovedadId(novedad.id);
    setMutatingNovedadAction("deactivate");
    setNovedadActionError(null);

    try {
      await deactivateNominaNovedad(novedad.id);
      await refreshSelectedPeriodData(selectedPeriodId);
    } catch (error) {
      setNovedadActionError(toMessage(error));
    } finally {
      setMutatingNovedadId(null);
      setMutatingNovedadAction(null);
    }
  };

  const handleEditNovedad = (novedad: NominaNovedadApi) => {
    openNovedadModal(novedad.nomina_empleado_id, novedad);
  };

  const selectedPeriodLabel = selectedPeriod?.nombre_periodo ?? "Periodo seleccionado";
  const modalSubtitle = selectedFormEmployee?.persona.nombre_completo ?? selectedPeriodLabel;
  const canSubmitNovedad =
    Boolean(selectedFormEmployee) &&
    Boolean(selectedNovedadType) &&
    !tiposNovedadState.loading &&
    !catalogIsEmpty &&
    !catalogPermissionDenied;

  return (
    <div className="nomina-page">
      <div className="payroll-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <div className={`payroll-kpi ${kpi.tone}`} key={kpi.label}>
              <div className="payroll-kpi-icon">
                <Icon size={20} />
              </div>

              <div className="payroll-kpi-body">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                <small>{kpi.caption}</small>
              </div>
            </div>
          );
        })}
      </div>

      {globalInlineError ? (
        <div className="payroll-inline-state error" role="alert">
          <AlertTriangle size={16} />
          <span>{globalInlineError}</span>
          <button type="button" onClick={handleRetry}>
            Reintentar
          </button>
        </div>
      ) : null}

      {actionFeedback ? (
        <div className={`payroll-inline-state ${actionFeedback.tone}`} role={actionFeedback.tone === "error" ? "alert" : "status"}>
          {actionFeedback.tone === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{actionFeedback.message}</span>
          <button type="button" className="payroll-inline-dismiss" onClick={() => setActionFeedback(null)} aria-label="Cerrar mensaje">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="payroll-filterbar">
        <div className="payroll-filter-group">
          <FilterSelect
            label="Periodo"
            icon={CalendarRange}
            value={selectedPeriodId ?? ""}
            onChange={handleSelectPeriod}
            options={periodOptions}
            disabled={periodsState.loading || periodOptions.length === 0}
          />

          <FilterSelect
            label="Contrato / Municipio / Area"
            icon={Building2}
            value=""
            onChange={() => undefined}
            options={[]}
            disabled
          />

          <div className="payroll-search">
            <Search size={18} />
            <input
              placeholder="Buscar colaborador"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!selectedPeriodId || currentTabLoading}
            />
          </div>

          <div className="payroll-search">
            <IdCard size={18} />
            <input
              placeholder="Buscar documento"
              value={documentTerm}
              onChange={(event) => setDocumentTerm(event.target.value)}
              disabled={!selectedPeriodId || currentTabLoading}
            />
          </div>

          <FilterSelect
            label="Estado"
            value={estadoFilter}
            onChange={setEstadoFilter}
            options={currentStatusOptions}
            disabled={!selectedPeriodId || currentStatusOptions.length === 0}
          />

          <FilterSelect
            label="Clasificacion"
            value={clasificacionFilter}
            onChange={setClasificacionFilter}
            options={employeeClassificationOptions}
            disabled={!isNominaTab || !selectedPeriodId || employeeClassificationOptions.length === 0}
          />
        </div>

        <button type="button" className="payroll-clear-button" onClick={handleClearFilters}>
          Limpiar filtros
        </button>
      </div>

      <div className="payroll-actionbar">
        <button
          type="button"
          className="payroll-action primary"
          disabled
          title="No existe un endpoint real para crear perÃ­odos desde esta pantalla."
        >
          <Plus size={18} />
          Crear periodo
        </button>

        <button
          type="button"
          className="payroll-action primary"
          onClick={() => openNovedadModal(null)}
          disabled={!canOpenNovedadModal}
        >
          <FilePlus2 size={18} />
          Registrar novedad
        </button>

        <button
          type="button"
          className="payroll-action"
          disabled
          title="No existe un endpoint real para cargar personal desde esta pantalla."
        >
          <Upload size={18} />
          Cargar personal
        </button>

        <button
          type="button"
          className="payroll-action"
          onClick={handleRecalculate}
          disabled={!selectedPeriodId || isRecalculating}
        >
          <Calculator size={18} />
          {isRecalculating ? "Recalculando..." : "Recalcular periodo"}
        </button>

        <FilterSelect
          label="Tipo de exporte"
          value={selectedExportType}
          onChange={(value) => setSelectedExportType((value as NominaExportTipo) || "todo")}
          options={NOMINA_EXPORT_OPTIONS}
          disabled={!selectedPeriodId || isExporting}
        />

        <button
          type="button"
          className="payroll-action"
          onClick={handleGenerateDesprendibles}
          disabled={!selectedPeriodId || isGeneratingDesprendibles}
        >
          <FileText size={18} />
          {isGeneratingDesprendibles ? "Generando desprendibles..." : "Generar desprendibles"}
        </button>

        <button
          type="button"
          className="payroll-action"
          onClick={handleExportNomina}
          disabled={!selectedPeriodId || isExporting}
        >
          <Download size={18} />
          {isExporting ? "Exportando..." : "Exportar"}
        </button>
        <button
          type="button"
          className="payroll-action danger-outline"
          disabled
          title="No existe un endpoint real para cerrar perÃ­odos en esta pantalla."
        >
          <Lock size={18} />
          Cerrar periodo
        </button>
      </div>

      {catalogInlineError ? (
        <div className="payroll-inline-state error" role="alert">
          <AlertTriangle size={16} />
          <span>{catalogInlineError}</span>
          {!catalogPermissionDenied ? (
            <button type="button" onClick={() => void loadTiposNovedad()}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="payroll-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`payroll-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.id === "novedades" && selectedPeriodId ? (
              <span className="payroll-tab-badge">{formatNumber(novedadesBadgeCount)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === "nomina" ? (
        <>
          {periodsState.loading && periodos.length === 0 ? (
            <StateCard
              title="Cargando periodos"
              message="Consultando periodos reales de nomina..."
            />
          ) : periodsState.error && periodos.length === 0 ? (
            <StateCard
              title="No fue posible cargar periodos"
              message={periodsState.error}
              tone="error"
              actionLabel="Reintentar"
              onAction={handleRetry}
            />
          ) : periodos.length === 0 ? (
            <StateCard
              title="Sin periodos"
              message="No hay periodos de nomina registrados en el backend."
            />
          ) : (
            <div className="payroll-periods">
              {periodos.map((periodo) => {
                const isOpen = selectedPeriodId === periodo.id;
                const summaryDashboard =
                  (isOpen ? selectedDashboard : null) ?? dashboardCache[periodo.id] ?? null;

                return (
                  <div className={`payroll-period-card ${isOpen ? "open" : ""}`} key={periodo.id}>
                    <button
                      type="button"
                      className="payroll-period-summary"
                      onClick={() => handleSelectPeriod(periodo.id)}
                      aria-expanded={isOpen}
                    >
                      <div className="payroll-period-main">
                        <h3>{periodo.nombre_periodo}</h3>
                        <span className={`payroll-period-status ${getPeriodStatusTone(periodo.estado)}`}>
                          {getPeriodStatusLabel(periodo.estado)}
                        </span>
                      </div>

                      <div className="payroll-period-meta">
                        <span>{formatPeriodRange(periodo.fecha_inicio, periodo.fecha_fin)}</span>
                        <span>
                          {summaryDashboard
                            ? `${formatNumber(summaryDashboard.empleados_total)} empleados`
                            : "Empleados no disponibles"}
                        </span>
                      </div>

                      <div className="payroll-period-totals">
                        <div>
                          <span>Devengado</span>
                          <strong>
                            {summaryDashboard ? formatCOP(summaryDashboard.total_devengado) : "No disponible"}
                          </strong>
                        </div>
                        <div>
                          <span>Neto</span>
                          <strong>
                            {summaryDashboard ? formatCOP(summaryDashboard.total_neto) : "No disponible"}
                          </strong>
                        </div>
                      </div>

                      <span className="payroll-expand-button" aria-hidden="true">
                        <ChevronDown size={20} className={isOpen ? "rotated" : ""} />
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="payroll-period-detail">
                        <div className="payroll-table-scroll">
                          <div className="payroll-table-head">
                            <span>Empleado</span>
                            <span>Municipio</span>
                            <span>Clasificacion</span>
                            <span>Metodo</span>
                            <span>Devengado</span>
                            <span>Deduccion</span>
                            <span>Neto</span>
                            <span>Novedades</span>
                            <span>Estado</span>
                            <span>Acciones</span>
                          </div>

                          {employeesState.loading && allEmployees.length === 0 ? (
                            <div className="payroll-table-state">Cargando empleados del periodo...</div>
                          ) : employeesState.error ? (
                            <div className="payroll-table-state error">{employeesState.error}</div>
                          ) : visibleEmployees.length === 0 ? (
                            <div className="payroll-table-state">
                              {allEmployees.length === 0
                                ? "Este periodo no tiene empleados cargados."
                                : "No hay empleados que coincidan con los filtros actuales."}
                            </div>
                          ) : (
                            visibleEmployees.map((empleado) => {
                              const isExpanded = expandedEmployeeId === empleado.id;
                              const documentStatusSummary = getEmployeeDocumentStatusSummary(empleado);
                              const documentStatusPercentage = formatOptionalPercentage(
                                documentStatusSummary?.porcentajeCumplimiento ?? null,
                              );

                              return (
                                <Fragment key={empleado.id}>
                                  <div className={`payroll-table-row ${isExpanded ? "expanded" : ""}`}>
                                    <div className="cell-employee">
                                      <div className={`avatar ${getAvatarTone(empleado.id)}`}>
                                        {getInitials(empleado.persona.nombre_completo)}
                                      </div>
                                      <div className="cell-employee-meta">
                                        <strong title={empleado.persona.nombre_completo}>{empleado.persona.nombre_completo}</strong>
                                        <p title={getEmployeeDocumentSummary(empleado)}>{getEmployeeDocumentSummary(empleado)}</p>
                                      </div>
                                    </div>

                                    <div className="cell-municipio">
                                      <strong title={getEmployeeMunicipioLabel(empleado)}>{getEmployeeMunicipioLabel(empleado)}</strong>
                                      <small title={`Sede: ${getEmployeeSedeLabel(empleado)}`}>Sede: {getEmployeeSedeLabel(empleado)}</small>
                                    </div>

                                    <span className={`payroll-type-pill ${getEmployeeClassificationTone(empleado)}`} title={getEmployeeClassificationLabel(empleado)}>
                                      {getEmployeeClassificationLabel(empleado)}
                                    </span>

                                    <div className="cell-stack">
                                      <strong title={getEmployeeMetodoLiquidacionLabel(empleado)}>{getEmployeeMetodoLiquidacionLabel(empleado)}</strong>
                                      <small title={`Modalidad: ${getEmployeeModalidadLabel(empleado)}`}>Modalidad: {getEmployeeModalidadLabel(empleado)}</small>
                                    </div>

                                    <span className="cell-devengado">{formatCOP(empleado.total_adiciones)}</span>

                                    <span className="cell-deduccion">{formatCOP(empleado.total_deducciones)}</span>

                                    <span className="cell-neto">{formatCOP(empleado.neto_pagar)}</span>

                                    <span className="cell-novedades">
                                      {formatNumber(
                                        novedadesCountByEmpleadoId.get(empleado.id) ?? getEmployeeTotalNovedades(empleado),
                                      )}
                                    </span>

                                    <span className={`payroll-status-badge ${getEmployeeStatusTone(empleado)}`}>
                                      {getEmployeeStatusLabel(empleado)}
                                    </span>

                                    <div className="cell-row-actions">
                                      <button
                                        type="button"
                                        title={isExpanded ? "Ocultar detalle" : "Ver detalle"}
                                        aria-label={`${isExpanded ? "Ocultar detalle" : "Ver detalle"} de ${empleado.persona.nombre_completo}`}
                                        aria-expanded={isExpanded}
                                        onClick={() => handleToggleEmployeeDetail(empleado.id)}
                                      >
                                        <Eye size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Registrar novedad"
                                        aria-label={`Registrar novedad de ${empleado.persona.nombre_completo}`}
                                        onClick={() => openNovedadModal(empleado.id)}
                                        disabled={!selectedPeriodId}
                                      >
                                        <FilePlus2 size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        title="No existe un endpoint real para editar liquidaciones desde esta vista."
                                        aria-label={`Edicion no disponible para ${empleado.persona.nombre_completo}`}
                                        disabled
                                      >
                                        <Edit3 size={16} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Consulta el tab de desprendibles para abrir soportes vigentes reales."
                                        aria-label={`Soportes de ${empleado.persona.nombre_completo} disponibles en desprendibles`}
                                        disabled
                                      >
                                        <FileText size={16} />
                                      </button>
                                    </div>
                                  </div>

                                  {isExpanded ? (
                                    <div className="payroll-table-row-detail">
                                      <div className="payroll-detail-grid">
                                        <div className="payroll-detail-item">
                                          <span>Municipio</span>
                                          <strong>{getEmployeeMunicipioLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Contrato</span>
                                          <strong>{getEmployeeContractLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Cargo</span>
                                          <strong>{getEmployeeCargoLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Clasificacion</span>
                                          <strong>{getEmployeeClassificationLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Metodo de liquidacion</span>
                                          <strong>{getEmployeeMetodoLiquidacionLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Total novedades</span>
                                          <strong>
                                            {formatNumber(
                                              novedadesCountByEmpleadoId.get(empleado.id) ?? getEmployeeTotalNovedades(empleado),
                                            )}
                                          </strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Sede</span>
                                          <strong>{getEmployeeSedeLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item">
                                          <span>Modalidad</span>
                                          <strong>{getEmployeeModalidadLabel(empleado)}</strong>
                                        </div>
                                        <div className="payroll-detail-item wide">
                                          <span>Estado documental</span>
                                          <strong>{getEmployeeDocumentStatusLabel(empleado)}</strong>
                                          {documentStatusSummary ? (
                                            <div className="payroll-detail-chips">
                                              <span>Cargados {formatNumber(documentStatusSummary.totalCargados)}</span>
                                              <span>Faltantes {formatNumber(documentStatusSummary.totalFaltantes)}</span>
                                              <span>Total {formatNumber(documentStatusSummary.totalRequeridos)}</span>
                                              {documentStatusPercentage ? <span>{documentStatusPercentage}</span> : null}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </Fragment>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : activeTab === "novedades" ? (
        <>
          {!selectedPeriodId ? (
            <StateCard
              title="Selecciona un periodo"
              message="El listado real de novedades depende del periodo de nomina."
            />
          ) : novedadesState.loading && allNovedades.length === 0 ? (
            <StateCard
              title="Cargando novedades"
              message="Consultando novedades reales del periodo seleccionado..."
            />
          ) : novedadesState.error ? (
            <StateCard
              title="No fue posible cargar novedades"
              message={novedadesState.error}
              tone="error"
              actionLabel="Reintentar"
              onAction={handleRetry}
            />
          ) : allNovedades.length === 0 ? (
            <StateCard
              title="Sin novedades"
              message="El backend no reporta novedades para este periodo."
            />
          ) : visibleNovedades.length === 0 ? (
            <StateCard
              title="Sin resultados"
              message="No hay novedades que coincidan con los filtros actuales."
            />
          ) : (
            <div className="payroll-novedades-list">
              {visibleNovedades.map((novedad) => {
                const isReviewing = mutatingNovedadId === novedad.id && mutatingNovedadAction === "review";
                const isDeactivating = mutatingNovedadId === novedad.id && mutatingNovedadAction === "deactivate";
                const novedadType =
                  novedadTypesById.get(novedad.tipo_novedad.id) ?? buildHistoricalNovedadType(novedad.tipo_novedad);

                return (
                  <article className="payroll-novedad-card" key={novedad.id}>
                    <div className="payroll-novedad-top">
                      <div className="payroll-novedad-persona">
                        <div className={`avatar ${getAvatarTone(novedad.nomina_empleado_id)}`}>
                          {getInitials(novedad.persona.nombre_completo)}
                        </div>
                        <div>
                          <strong>{novedad.persona.nombre_completo}</strong>
                          <p>
                            {novedad.persona.numero_documento ?? "Documento no disponible"} Â·{" "}
                            {getVisibleNovedadTipoLabel(novedadType)}
                          </p>
                        </div>
                      </div>

                      <div className="payroll-novedad-badges">
                        <span className={`payroll-status-badge ${getNovedadStatusTone(novedad)}`}>
                          {getNovedadStatusLabel(novedad)}
                        </span>
                        <span className={`payroll-status-badge ${novedad.activo ? "info" : "neutral"}`}>
                          {novedad.activo ? "Activa" : "Inactiva"}
                        </span>
                        {isCanonicalProjectedNovedad(novedad) ? (
                          <span className="payroll-status-badge purple">Evento canonico</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="payroll-novedad-grid">
                      <div>
                        <span>Rango</span>
                        <strong>{formatNovedadRange(novedad)}</strong>
                      </div>
                      <div>
                        <span>Modelo</span>
                        <strong>
                          {isCanonicalProjectedNovedad(novedad) ? "Evento unico proyectado" : "Novedad por periodo"}
                        </strong>
                      </div>
                      <div>
                        <span>Dias / Horas</span>
                        <strong>
                          {novedad.dias ?? 0} / {novedad.horas ?? 0}
                        </strong>
                      </div>
                      <div>
                        <span>Valor manual</span>
                        <strong>{novedad.valor_manual !== null ? formatCOP(novedad.valor_manual) : "No aplica"}</strong>
                      </div>
                      <div>
                        <span>Registrada</span>
                        <strong>{formatDateTime(novedad.created_at)}</strong>
                      </div>
                    </div>

                    <div className="payroll-novedad-meta">
                      <span>
                        Revision: {isCanonicalProjectedNovedad(novedad) ? "No aplica" : novedad.revisado ? "Revisada" : "Pendiente"}
                      </span>
                      <span>
                        Cobertura: {novedad.requiere_cobertura ? (novedad.cubierta ? "Cubierta" : "Pendiente") : "No requerida"}
                      </span>
                      <span>Categoria: {novedadType.categoria ?? "No disponible"}</span>
                      {getNovedadProjectionLabel(novedad) ? (
                        <span>{getNovedadProjectionLabel(novedad)}</span>
                      ) : null}
                    </div>

                    <div className="payroll-novedad-footer">
                      <p>{novedad.observacion ?? "Sin observacion registrada."}</p>

                      <div className="payroll-novedad-actions">
                        <button
                          type="button"
                          className="payroll-inline-button"
                          onClick={() => handleEditNovedad(novedad)}
                          disabled={isReviewing || isDeactivating}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="payroll-inline-button"
                          onClick={() => handleMarkNovedadReviewed(novedad)}
                          disabled={!novedad.activo || novedad.revisado || isReviewing || isDeactivating || isCanonicalProjectedNovedad(novedad)}
                        >
                          {isCanonicalProjectedNovedad(novedad)
                            ? "Revision no aplica"
                            : isReviewing
                              ? "Marcando..."
                              : novedad.revisado
                                ? "Revisada"
                                : "Marcar revisada"}
                        </button>
                        <button
                          type="button"
                          className="payroll-inline-button danger"
                          onClick={() => handleDeactivateNovedad(novedad)}
                          disabled={!novedad.activo || isReviewing || isDeactivating}
                        >
                          {isDeactivating ? "Desactivando..." : novedad.activo ? "Desactivar" : "Inactiva"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : activeTab === "soportes" ? (
        <>
          {!selectedPeriodId ? (
            <StateCard
              title="Selecciona un periodo"
              message="La consulta real de desprendibles depende del perÃ­odo de nÃ³mina."
            />
          ) : desprendiblesState.loading && allDesprendibles.length === 0 ? (
            <StateCard
              title="Cargando desprendibles"
              message="Consultando desprendibles reales del perÃ­odo seleccionado..."
            />
          ) : desprendiblesState.error ? (
            <StateCard
              title="No fue posible cargar desprendibles"
              message={desprendiblesState.error}
              tone="error"
              actionLabel="Reintentar"
              onAction={handleRetry}
            />
          ) : allDesprendibles.length === 0 ? (
            <StateCard
              title="Sin desprendibles"
              message="El backend no reporta desprendibles para este perÃ­odo."
            />
          ) : (
            <>
              <div className="payroll-inline-note compact">
                <strong>Desprendibles reales</strong>
                <p>
                  Esta pestaÃ±a usa `GET /nomina/desprendibles/:periodo_id` y permite alternar entre
                  vigentes e historial. La apertura usa `GET /nomina/desprendibles/:periodo_id/:vinculacion_id`,
                  que solo resuelve el desprendible vigente.
                </p>
              </div>

              <div className="payroll-support-actions">
                <button
                  type="button"
                  className="payroll-inline-button"
                  onClick={() => setIncludeDesprendibleVersions((current) => !current)}
                  disabled={desprendiblesState.loading}
                >
                  {includeDesprendibleVersions ? "Mostrar solo vigentes" : "Mostrar historial"}
                </button>
              </div>

              {visibleDesprendibles.length === 0 ? (
                <StateCard
                  title="Sin resultados"
                  message="No hay desprendibles que coincidan con los filtros actuales."
                />
              ) : (
                <div className="payroll-period-card">
                  <div className="payroll-table-scroll">
                    <div className="payroll-table-head">
                      <span>Persona</span>
                      <span>Documento</span>
                      <span>PerÃ­odo</span>
                      <span>VersiÃ³n</span>
                      <span>Generado</span>
                      <span>Estado</span>
                      <span>Vigente</span>
                      <span>Archivo</span>
                      <span>Tipo</span>
                      <span>Acciones</span>
                    </div>

                    {visibleDesprendibles.map((desprendible) => {
                      const isDownloading = downloadingDesprendibleId === desprendible.id;

                      return (
                        <div className="payroll-table-row" key={desprendible.id}>
                          <div className="cell-employee">
                            <div className={`avatar ${getAvatarTone(desprendible.vinculacion_id)}`}>
                              {getInitials(desprendible.persona.nombre_completo)}
                            </div>
                            <div>
                              <strong>{desprendible.persona.nombre_completo}</strong>
                              <p>{getDesprendibleFileLabel(desprendible)}</p>
                            </div>
                          </div>

                          <span>{desprendible.persona.numero_documento ?? "No disponible"}</span>
                          <span>{desprendible.periodo.nombre_periodo}</span>
                          <span>V{formatNumber(desprendible.version)}</span>
                          <span>{formatDateTime(desprendible.fecha_generacion ?? desprendible.created_at)}</span>
                          <span className={`payroll-status-badge ${getDesprendibleStatusTone(desprendible)}`}>
                            {getDesprendibleStatusLabel(desprendible)}
                          </span>
                          <span>{desprendible.es_vigente ? "SÃ­" : "No"}</span>
                          <span>{getDesprendibleFileLabel(desprendible)}</span>
                          <span>{desprendible.tipo_desprendible ?? "No disponible"}</span>

                          <div className="cell-row-actions">
                            <button
                              type="button"
                              title={
                                desprendible.es_vigente
                                  ? "Abrir desprendible vigente"
                                  : "El backend no expone descarga directa para versiones histÃ³ricas."
                              }
                              aria-label={`Abrir desprendible de ${desprendible.persona.nombre_completo}`}
                              onClick={() => void handleOpenDesprendible(desprendible)}
                              disabled={!desprendible.es_vigente || isDownloading}
                            >
                              <Download size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="payroll-placeholder">
          <p>Esta pestana se conectara despues de finalizar Nomina base.</p>
        </div>
      )}

      {isRecordsTab ? (
        <div className="payroll-pagination">
          <span>
            Mostrando {showingFrom}-{showingTo} de {formatNumber(totalFilteredRecords)}{" "}
            {isNominaTab ? "empleados" : isNovedadesTab ? "novedades" : "desprendibles"}
          </span>

          <div>
            <select
              value={String(pageSize)}
              onChange={(event) => setPageSize(Number(event.target.value))}
              disabled={totalFilteredRecords === 0}
            >
              {EMPLOYEE_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} por pagina
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setTablePage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1 || totalFilteredRecords === 0}
            >
              <ChevronLeft size={16} />
            </button>

            {pageNumbers.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={pageNumber === currentPage ? "active-page" : ""}
                onClick={() => setTablePage(pageNumber)}
                disabled={totalFilteredRecords === 0}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setTablePage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages || totalFilteredRecords === 0}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {isNovedadModalOpen ? (
        <div className="payroll-modal-overlay" onClick={closeNovedadModal}>
          <div className="payroll-modal" onClick={(event) => event.stopPropagation()}>
            <div className="payroll-modal-header">
              <div>
                <h3>{editingNovedad ? "Editar novedad" : "Registrar novedad"}</h3>
                <p>{modalSubtitle}</p>
              </div>

              <button
                type="button"
                className="payroll-modal-close"
                onClick={closeNovedadModal}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <form className="payroll-modal-form" onSubmit={handleSubmitNovedad}>
              <div className="payroll-inline-note">
                <strong>Catalogo real conectado</strong>
                <p>
                  La captura rapida consulta `GET /nomina/tipos-novedad`, resuelve codigo operativo o
                  descripcion y persiste el `tipo_novedad_id` canonico junto con el codigo operativo
                  registrado.
                </p>
              </div>

              <div className="payroll-form-grid">
                <label className="payroll-form-field">
                  <span>Empleado del periodo</span>
                  <select
                    value={novedadForm.nomina_empleado_id}
                    onChange={(event) => handleFormValueChange("nomina_empleado_id", event.target.value)}
                    disabled={isSubmittingNovedad}
                  >
                    {allEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.persona.nombre_completo} Â· {employee.persona.numero_documento ?? "Documento no disponible"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="payroll-form-field">
                  <span>Codigo o descripcion</span>
                  <input
                    value={novedadForm.tipo_novedad_query}
                    onChange={(event) => handleNovedadTypeQueryChange(event.target.value)}
                    placeholder="PR2, PNR, suspension, incapacidad..."
                    disabled={isSubmittingNovedad || tiposNovedadState.loading || catalogIsEmpty}
                  />
                  <small className="payroll-form-help">
                    Escribe codigo operativo o descripcion. Ejemplo: `PR2`.
                  </small>
                </label>

                <label className="payroll-form-field">
                  <span>Tipo canonico</span>
                  <select
                    value={novedadForm.tipo_novedad_id}
                    onChange={(event) => handleNovedadTypeChange(event.target.value)}
                    disabled={isSubmittingNovedad || tiposNovedadState.loading || catalogIsEmpty}
                  >
                    <option value="">
                      {tiposNovedadState.loading
                        ? "Cargando tipos..."
                        : catalogIsEmpty
                          ? "Sin tipos activos disponibles"
                          : "Selecciona un tipo"}
                    </option>
                    {groupedNovedadTypes.map((group) => (
                      <optgroup key={group.categoria} label={group.categoria}>
                        {group.items.map((tipo) => (
                          <option key={tipo.id} value={tipo.id}>
                            {getVisibleNovedadTipoLabel(tipo)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {selectedNovedadType?.requiere_fechas ? (
                  <>
                    <label className="payroll-form-field">
                      <span>Fecha inicio</span>
                      <input
                        type="date"
                        value={novedadForm.fecha_inicio}
                        onChange={(event) => handleFormValueChange("fecha_inicio", event.target.value)}
                        disabled={isSubmittingNovedad}
                      />
                    </label>

                    <label className="payroll-form-field">
                      <span>Fecha fin</span>
                      <input
                        type="date"
                        value={novedadForm.fecha_fin}
                        onChange={(event) => handleFormValueChange("fecha_fin", event.target.value)}
                        disabled={isSubmittingNovedad}
                      />
                    </label>
                  </>
                ) : null}

                {selectedNovedadType?.requiere_dias ? (
                  <label className="payroll-form-field">
                    <span>Dias</span>
                    <input
                      inputMode="decimal"
                      value={novedadForm.dias}
                      onChange={(event) => handleFormValueChange("dias", event.target.value)}
                      placeholder="Cantidad requerida"
                      disabled={isSubmittingNovedad}
                    />
                  </label>
                ) : null}

                {selectedNovedadType?.requiere_horas ? (
                  <label className="payroll-form-field">
                    <span>Horas</span>
                    <input
                      inputMode="decimal"
                      value={novedadForm.horas}
                      onChange={(event) => handleFormValueChange("horas", event.target.value)}
                      placeholder="Cantidad requerida"
                      disabled={isSubmittingNovedad}
                    />
                  </label>
                ) : null}

                {selectedNovedadType?.requiere_valor ? (
                  <label className="payroll-form-field">
                    <span>Valor manual</span>
                    <input
                      inputMode="decimal"
                      value={novedadForm.valor_manual}
                      onChange={(event) => handleFormValueChange("valor_manual", event.target.value)}
                      placeholder="Valor requerido"
                      disabled={isSubmittingNovedad}
                    />
                  </label>
                ) : null}
              </div>

              {filteredNovedadTypeSuggestions.length > 0 ? (
                <div className="payroll-type-search-results">
                  {filteredNovedadTypeSuggestions.map((tipo) => (
                    <button
                      key={tipo.id}
                      type="button"
                      className={`payroll-type-search-option ${
                        novedadForm.tipo_novedad_id === tipo.id ? "active" : ""
                      }`}
                      onClick={() => handleNovedadTypeChange(tipo.id, getVisibleNovedadTipoLabel(tipo))}
                      disabled={isSubmittingNovedad}
                    >
                      <strong>{getOperationalNovedadCodeLabel(tipo)}</strong>
                      <span>{tipo.descripcion_operativa ?? tipo.categoria ?? "Tipo de novedad"}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <details className="payroll-operational-legend">
                <summary>Leyenda operativa</summary>
                <div className="payroll-operational-legend-grid">
                  {NOMINA_OPERATIONAL_LEGEND.map((item) => (
                    <div key={item.code}>
                      <strong>{item.code}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </details>

              {selectedNovedadType ? (
                <div className="payroll-type-hints">
                  <span>{getVisibleNovedadTipoLabel(selectedNovedadType)}</span>
                  <span>Modelo: {selectedNovedadType.modelo_registro === "EVENTO_CANONICO_RANGO" ? "Evento canonico" : "Por periodo"}</span>
                  <span>Salario: {selectedNovedadType.efecto_salario}</span>
                  <span>Transporte: {selectedNovedadType.efecto_auxilio_transporte}</span>
                  <span>Recargos: {selectedNovedadType.efecto_recargos}</span>
                  <span>Liquidacion: {selectedNovedadType.efecto_liquidacion}</span>
                  <span>Efecto pago: {selectedNovedadType.efecto_pago ?? "Pendiente"}</span>
                  <span>
                    {selectedNovedadType.es_adicion
                      ? "Adicion"
                      : selectedNovedadType.es_deduccion
                        ? "Deduccion"
                        : "Sin efecto contable"}
                  </span>
                  {selectedNovedadType.requiere_fechas ? <span>Requiere fechas</span> : null}
                  {selectedNovedadType.requiere_dias ? <span>Requiere dias</span> : null}
                  {selectedNovedadType.requiere_horas ? <span>Requiere horas</span> : null}
                  {selectedNovedadType.requiere_valor ? <span>Requiere valor</span> : null}
                  {selectedNovedadType.requiere_soporte ? <span>Requiere soporte</span> : null}
                  {selectedNovedadType.permite_rango ? <span>Permite rango</span> : null}
                  {selectedNovedadType.requiere_revision ? <span>Requiere revision</span> : null}
                  {selectedNovedadType.es_incapacidad ? <span>Es incapacidad</span> : null}
                  {selectedNovedadType.es_suspension ? <span>Es suspension</span> : null}
                  {selectedNovedadType.es_evento_operativo ? <span>Evento operativo</span> : null}
                  {selectedNovedadType.proyecta_periodos ? <span>Proyecta periodos</span> : null}
                  {selectedNovedadType.bloquea_otras_novedades ? <span>Bloquea otras novedades</span> : null}
                </div>
              ) : null}

              {tiposNovedadState.loading ? (
                <div className="payroll-inline-state" role="status">
                  <span>Cargando catalogo de tipos de novedad...</span>
                </div>
              ) : null}

              {!catalogPermissionDenied && tiposNovedadState.error && !tiposNovedadState.loading ? (
                <div className="payroll-inline-state error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{tiposNovedadState.error}</span>
                  <button type="button" onClick={() => void loadTiposNovedad()}>
                    Reintentar
                  </button>
                </div>
              ) : null}

              {catalogIsEmpty ? (
                <div className="payroll-inline-state" role="status">
                  <span>El catalogo no tiene tipos de novedad activos disponibles.</span>
                </div>
              ) : null}

              <label className="payroll-form-field">
                <span>Observacion</span>
                <textarea
                  value={novedadForm.observacion}
                  onChange={(event) => handleFormValueChange("observacion", event.target.value)}
                  placeholder="Observacion opcional"
                  rows={4}
                  disabled={isSubmittingNovedad}
                />
              </label>

              {selectedNovedadType?.requiere_soporte ? (
                <label className="payroll-form-field">
                  <span>Documento soporte</span>
                  <input
                    value={novedadForm.documento_persona_id}
                    onChange={(event) => handleFormValueChange("documento_persona_id", event.target.value)}
                    placeholder="ID tecnico de documento_persona"
                    disabled={isSubmittingNovedad}
                  />
                  <small className="payroll-form-help">
                    La relacion con expediente queda preparada usando `documento_persona_id`.
                  </small>
                </label>
              ) : null}

              {selectedNovedadType?.modelo_registro === "EVENTO_CANONICO_RANGO" ? (
                <div className="payroll-inline-note compact">
                  <p>
                    Esta novedad se persistira como un evento canonico unico y Empiria proyectara
                    automaticamente los tramos visibles en cada periodo intersectado.
                  </p>
                </div>
              ) : null}

              <div className="payroll-form-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={novedadForm.revisado}
                    onChange={(event) => handleFormValueChange("revisado", event.target.checked)}
                    disabled={isSubmittingNovedad}
                  />
                  <span>Crear como revisada</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={novedadForm.requiere_cobertura}
                    onChange={(event) => handleFormValueChange("requiere_cobertura", event.target.checked)}
                    disabled={isSubmittingNovedad}
                  />
                  <span>Requiere cobertura</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={novedadForm.cubierta}
                    onChange={(event) => handleFormValueChange("cubierta", event.target.checked)}
                    disabled={isSubmittingNovedad}
                  />
                  <span>Ya cubierta</span>
                </label>
              </div>

              {selectedFormEmployee ? (
                <div className="payroll-inline-note compact">
                  <p>
                    La novedad se asocia automaticamente al periodo activo, al empleado seleccionado y a su
                    vinculacion real.
                  </p>
                </div>
              ) : null}

              {novedadFormError ? (
                <div className="payroll-inline-state error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{novedadFormError}</span>
                </div>
              ) : null}

              <div className="payroll-modal-actions">
                <button type="button" className="payroll-action" onClick={closeNovedadModal}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="payroll-action primary"
                  disabled={isSubmittingNovedad || !canSubmitNovedad}
                >
                  {isSubmittingNovedad
                    ? "Guardando..."
                    : editingNovedad
                      ? "Guardar cambios"
                      : "Crear novedad"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StateCard({
  title,
  message,
  tone = "neutral",
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  tone?: "neutral" | "error";
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`payroll-state-card ${tone}`}>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>

      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  icon?: ComponentType<{ size?: number }>;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  disabled?: boolean;
}) {
  return (
    <div className="payroll-filter-select-wrap">
      {Icon ? <Icon size={16} /> : null}
      <select
        className="payroll-filter-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}










