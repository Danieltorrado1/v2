import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  Ban,
  ClipboardList,
  Eye,
  FileBarChart2,
  HardHat,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClientError } from "../../services/apiClient";
import { configuracionApi } from "../../services/configuracionApi";
import {
  actualizarAccidenteSst,
  actualizarAccionAccidenteSst,
  actualizarAccionInspeccionSst,
  actualizarEventoSst,
  actualizarHallazgoInspeccionSst,
  actualizarInspeccionSst,
  actualizarPlanSst,
  buscarPersonasSst,
  cerrarAccionInspeccionSst,
  cerrarPlanSst,
  crearAccidenteSst,
  crearAccionAccidenteSst,
  crearAccionInspeccionSst,
  crearEventoSst,
  crearHallazgoInspeccionSst,
  crearInspeccionSst,
  crearPlanSst,
  desactivarAccidenteSst,
  desactivarAccionAccidenteSst,
  desactivarAccionInspeccionSst,
  desactivarEventoSst,
  desactivarHallazgoInspeccionSst,
  desactivarInspeccionSst,
  desactivarPlanSst,
  listarAccidentesSst,
  listarAccionesAccidenteSst,
  listarAccionesInspeccionSst,
  listarEventosSst,
  listarHallazgosInspeccionSst,
  listarInspeccionesSst,
  listarPeriodosIndicadoresSst,
  listarPlanesSst,
  listarVinculacionesPersonaSst,
  obtenerAlertasAccidentesSst,
  obtenerAlertasIndicadoresSst,
  obtenerAlertasInspeccionesSst,
  obtenerDashboardAccidentesSst,
  obtenerDashboardIndicadoresSst,
  obtenerDashboardInspeccionesSst,
  obtenerEventoSst,
  obtenerHistoricoIndicadoresSst,
  obtenerIndicadoresSst,
  obtenerPlanSst,
} from "../../services/sstApi";
import type { Contrato, Empresa } from "../../types/configuracion.types";
import type {
  SstAccidente,
  SstAccidenteEstado,
  SstAccidenteSeveridad,
  SstAccidenteTipo,
  SstAccidenteAlerta,
  SstAccidenteDashboard,
  SstAccionAccidente,
  SstAccionEstado,
  SstAccionInspeccion,
  SstEvento,
  SstEventoEstado,
  SstEventoGravedad,
  SstEventoTipo,
  SstHallazgoInspeccion,
  SstHallazgoNivel,
  SstHallazgoTipo,
  SstIndicadorAlerta,
  SstIndicadorDashboard,
  SstIndicadorHistorico,
  SstIndicadoresOverview,
  SstIndicadorPeriodo,
  SstInspeccion,
  SstInspeccionAlerta,
  SstInspeccionDashboard,
  SstInspeccionEstado,
  SstInspeccionTipo,
  SstPaginatedResult,
  SstPersonaOption,
  SstPlanAccion,
  SstPlanEstado,
  SstPlanOrigen,
  SstVinculacionOption,
} from "../../types/sst.types";
import { SstBadge } from "./components/SstBadge";
import { SstKpis } from "./components/SstKpis";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstTable } from "./components/SstTable";
import {
  FormField,
  formatDate,
  formatNumber,
  formatPercent,
  InlineNotice,
  ModalShell,
  normalizeTextValue,
  Paginator,
  StateCard,
  titleCase,
  todayIso,
  toInputDate,
  toInputTime,
} from "./sstPage.helpers";
import { useCompanyContext } from "../../context/CompanyContext";
import "./SstPages.css";

type SstTab = "resumen" | "eventos" | "planes" | "inspecciones" | "hallazgos" | "accidentes" | "indicadores";
type AsyncState<T> = { data: T | null; error: string | null; loading: boolean };
type FeedbackState = { tone: "success" | "error"; message: string } | null;

type EventFormState = {
  vinculacion_id: string;
  tipo_evento: SstEventoTipo;
  fecha_evento: string;
  hora_evento: string;
  lugar: string;
  descripcion: string;
  gravedad: "" | SstEventoGravedad;
  requiere_investigacion: boolean;
  estado: SstEventoEstado;
};

type PlanFormState = {
  origen: SstPlanOrigen;
  origen_id: string;
  responsable: string;
  descripcion: string;
  fecha_compromiso: string;
  estado: SstPlanEstado;
};

type InspeccionFormState = {
  empresa_id: string;
  contrato_id: string;
  nombre_inspeccion: string;
  tipo_inspeccion: SstInspeccionTipo;
  fecha_programada: string;
  fecha_realizada: string;
  responsable: string;
  estado: SstInspeccionEstado;
  observacion: string;
};

type HallazgoFormState = {
  inspeccion_id: string;
  tipo_hallazgo: SstHallazgoTipo;
  descripcion: string;
  nivel_riesgo: SstHallazgoNivel;
  requiere_accion: boolean;
};

type AccionInspeccionFormState = {
  hallazgo_id: string;
  descripcion: string;
  responsable: string;
  fecha_compromiso: string;
  fecha_cierre: string;
  estado: SstAccionEstado;
};

type AccidenteFormState = {
  empresa_id: string;
  contrato_id: string;
  persona_id: string;
  vinculacion_id: string;
  tipo_evento: "ACCIDENTE_TRABAJO" | "INCIDENTE" | "CASI_ACCIDENTE";
  fecha_evento: string;
  hora_evento: string;
  lugar_evento: string;
  descripcion: string;
  lesionado: boolean;
  tipo_lesion: string;
  parte_cuerpo: string;
  dias_incapacidad: string;
  requiere_investigacion: boolean;
  severidad: "LEVE" | "MODERADO" | "GRAVE" | "MORTAL";
  estado: "ABIERTO" | "EN_INVESTIGACION" | "CERRADO";
};

type AccionAccidenteFormState = {
  descripcion: string;
  responsable: string;
  fecha_compromiso: string;
  fecha_cierre: string;
  estado: "ABIERTA" | "EN_PROCESO" | "CERRADA";
};

type AccidentesQueryState = {
  page: number;
  tipo_evento: "" | SstAccidenteTipo;
  severidad: "" | SstAccidenteSeveridad;
  estado: "" | SstAccidenteEstado;
};

type PlanOriginCatalogs = {
  EVENTO: SstEvento[];
  INSPECCION: SstInspeccion[];
  HALLAZGO: SstHallazgoInspeccion[];
  ACCIDENTE: SstAccidente[];
};

const EMPTY_ASYNC = { data: null, error: null, loading: false } as const;
const LIST_LIMIT = 10;
const LOOKUP_LIMIT = 100;
const CATALOG_LIMIT = 100;
const EMPTY_PAGINATION = { page: 1, limit: LIST_LIMIT, total: 0, total_pages: 1 };
const TABS: Array<{ id: SstTab; label: string }> = [
  { id: "resumen", label: "Resumen" },
  { id: "eventos", label: "Eventos" },
  { id: "planes", label: "Planes de accion" },
  { id: "inspecciones", label: "Inspecciones" },
  { id: "hallazgos", label: "Hallazgos y acciones" },
  { id: "accidentes", label: "Accidentes" },
  { id: "indicadores", label: "Indicadores" },
];
const EVENT_TYPES: SstEventoTipo[] = ["ACCIDENTE_TRABAJO", "INCIDENTE", "ENFERMEDAD_LABORAL", "CAPACITACION", "ENTREGA_EPP", "OTRO"];
const EVENT_GRAVEDADES: SstEventoGravedad[] = ["LEVE", "MODERADA", "GRAVE", "CRITICA"];
const EVENT_STATES: SstEventoEstado[] = ["ABIERTO", "EN_PROCESO", "CERRADO", "ANULADO"];
const PLAN_ORIGINS: SstPlanOrigen[] = ["EVENTO", "INSPECCION", "HALLAZGO", "ACCIDENTE"];
const PLAN_STATES: SstPlanEstado[] = ["PENDIENTE", "EN_PROCESO", "CERRADO", "ANULADO"];
const INSPECCION_TYPES: SstInspeccionTipo[] = ["LOCATIVA", "COCINA", "EPP", "EXTINTORES", "BOTIQUINES", "VEHICULOS", "ALMACENAMIENTO", "RIESGO_BIOLOGICO", "RIESGO_QUIMICO", "OTRO"];
const INSPECCION_STATES: SstInspeccionEstado[] = ["PROGRAMADA", "REALIZADA", "CANCELADA", "VENCIDA"];
const HALLAZGO_TYPES: SstHallazgoTipo[] = ["CONDICION_INSEGURA", "ACTO_INSEGURO", "NO_CONFORMIDAD", "OBSERVACION", "OPORTUNIDAD_MEJORA"];
const HALLAZGO_NIVELES: SstHallazgoNivel[] = ["BAJO", "MEDIO", "ALTO", "CRITICO"];
const ACCION_STATES: SstAccionEstado[] = ["ABIERTA", "EN_PROCESO", "CERRADA", "VENCIDA"];
const ACCIDENTE_TYPES = ["ACCIDENTE_TRABAJO", "INCIDENTE", "CASI_ACCIDENTE"] as const;
const ACCIDENTE_SEVERIDADES = ["LEVE", "MODERADO", "GRAVE", "MORTAL"] as const;
const ACCIDENTE_STATES = ["ABIERTO", "EN_INVESTIGACION", "CERRADO"] as const;
const ACCION_ACCIDENTE_STATES = ["ABIERTA", "EN_PROCESO", "CERRADA"] as const;

function hasAnyPermission(permissions: string[] | undefined, required: string[]): boolean {
  return required.some((permission) => permissions?.includes(permission));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function isIndicadoresPeriodoNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404 && error.code === "INDICADORES_PERIODO_NOT_FOUND";
}

function getSafeTab(value: string | null): SstTab {
  return TABS.some((tab) => tab.id === value) ? (value as SstTab) : "resumen";
}

function emptyPaginated<T>(): SstPaginatedResult<T> {
  return { items: [], pagination: EMPTY_PAGINATION };
}

async function fetchAllPages<T>(loader: (page: number) => Promise<SstPaginatedResult<T>>): Promise<T[]> {
  const first = await loader(1);
  const items = [...first.items];

  for (let page = 2; page <= first.pagination.total_pages; page += 1) {
    const next = await loader(page);
    items.push(...next.items);
  }

  return items;
}

async function resolveIndicadoresPeriodoId(scope: { empresa_id?: string | null; contrato_id?: string | null }): Promise<string | null> {
  const periodos = await listarPeriodosIndicadoresSst({ ...scope, activo: true, page: 1, limit: 1 });
  return periodos.items[0] ? String(periodos.items[0].id) : null;
}

async function obtenerAlertasIndicadoresResumen(scope: { empresa_id?: string | null; contrato_id?: string | null }): Promise<SstPaginatedResult<SstIndicadorAlerta>> {
  const periodoId = await resolveIndicadoresPeriodoId(scope);
  if (!periodoId) {
    return emptyPaginated<SstIndicadorAlerta>();
  }
  return obtenerAlertasIndicadoresSst({ ...scope, periodo_id: periodoId });
}

function buildEmpresaLabel(item: Empresa): string {
  return item.nombre_empresa ?? `Empresa #${item.id}`;
}

function buildContratoLabel(item: Contrato): string {
  return item.numero_contrato ?? `Contrato #${item.id}`;
}

function buildVinculacionSummary(item: SstVinculacionOption | null): string {
  return item?.label ?? "Seleccione una vinculacion";
}

function buildEventoSummary(item: SstEvento): string {
  return `${titleCase(item.tipo_evento)} - ${formatDate(item.fecha_evento)}`;
}

function buildInspeccionSummary(item: SstInspeccion): string {
  return `${item.nombre_inspeccion} - ${titleCase(item.tipo_inspeccion)}`;
}

function buildHallazgoSummary(item: SstHallazgoInspeccion): string {
  return `${titleCase(item.tipo_hallazgo)} - ${item.descripcion}`;
}

function buildAccidenteSummary(item: SstAccidente): string {
  return `${titleCase(item.tipo_evento)} - ${item.persona.nombre_completo}`;
}

function eventBadgeTone(value: string | null | undefined): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (value) {
    case "CERRADO":
    case "REALIZADA":
    case "CERRADA":
      return "success";
    case "EN_PROCESO":
    case "EN_INVESTIGACION":
      return "warning";
    case "ANULADO":
    case "CANCELADA":
    case "CRITICO":
    case "GRAVE":
    case "MORTAL":
    case "VENCIDA":
      return "danger";
    case "ABIERTO":
    case "PROGRAMADA":
    case "ABIERTA":
    case "PENDIENTE":
      return "info";
    default:
      return "neutral";
  }
}

const EMPTY_EVENT_FORM: EventFormState = {
  vinculacion_id: "",
  tipo_evento: "ACCIDENTE_TRABAJO",
  fecha_evento: todayIso(),
  hora_evento: "",
  lugar: "",
  descripcion: "",
  gravedad: "",
  requiere_investigacion: true,
  estado: "ABIERTO",
};
const EMPTY_PLAN_FORM: PlanFormState = {
  origen: "EVENTO",
  origen_id: "",
  responsable: "",
  descripcion: "",
  fecha_compromiso: "",
  estado: "PENDIENTE",
};
const EMPTY_INSPECCION_FORM: InspeccionFormState = {
  empresa_id: "",
  contrato_id: "",
  nombre_inspeccion: "",
  tipo_inspeccion: "LOCATIVA",
  fecha_programada: todayIso(),
  fecha_realizada: "",
  responsable: "",
  estado: "PROGRAMADA",
  observacion: "",
};
const EMPTY_HALLAZGO_FORM: HallazgoFormState = {
  inspeccion_id: "",
  tipo_hallazgo: "CONDICION_INSEGURA",
  descripcion: "",
  nivel_riesgo: "BAJO",
  requiere_accion: true,
};
const EMPTY_ACCION_INS_FORM: AccionInspeccionFormState = {
  hallazgo_id: "",
  descripcion: "",
  responsable: "",
  fecha_compromiso: "",
  fecha_cierre: "",
  estado: "ABIERTA",
};
const EMPTY_ACCIDENT_FORM: AccidenteFormState = {
  empresa_id: "",
  contrato_id: "",
  persona_id: "",
  vinculacion_id: "",
  tipo_evento: "ACCIDENTE_TRABAJO",
  fecha_evento: todayIso(),
  hora_evento: "",
  lugar_evento: "",
  descripcion: "",
  lesionado: false,
  tipo_lesion: "",
  parte_cuerpo: "",
  dias_incapacidad: "0",
  requiere_investigacion: true,
  severidad: "LEVE",
  estado: "ABIERTO",
};
const EMPTY_ACCION_ACCIDENTE_FORM: AccionAccidenteFormState = {
  descripcion: "",
  responsable: "",
  fecha_compromiso: "",
  fecha_cierre: "",
  estado: "ABIERTA",
};

export default function SstPage() {
  const { user } = useAuth();
  const { empresaActiva, empresaId } = useCompanyContext();
  const permissions = user?.permissions ?? [];
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getSafeTab(searchParams.get("tab"));

  const canReadEvents = hasAnyPermission(permissions, ["sst.read", "sst.eventos.read"]);
  const canWriteEvents = hasAnyPermission(permissions, ["sst.eventos.write", "sst.eventos.create", "sst.eventos.update", "sst.eventos.deactivate"]);
  const canReadPlans = hasAnyPermission(permissions, ["sst.planes.read"]);
  const canWritePlans = hasAnyPermission(permissions, ["sst.planes.write", "sst.planes.create", "sst.planes.update", "sst.planes.close", "sst.planes.deactivate"]);
  const canReadInspecciones = hasAnyPermission(permissions, ["sst.inspecciones.read"]);
  const canWriteInspecciones = hasAnyPermission(permissions, ["sst.inspecciones.write"]);
  const canReadIndicadores = hasAnyPermission(permissions, ["sst.indicadores.read"]);
  const canReadAccidentes = hasAnyPermission(permissions, ["sst.accidentes.read"]);
  const canWriteAccidentes = hasAnyPermission(permissions, ["sst.accidentes.write", "sst.accidentes.create", "sst.accidentes.update", "sst.accidentes.deactivate"]);

  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [empresasState, setEmpresasState] = useState<AsyncState<Empresa[]>>(EMPTY_ASYNC);
  const [contratosState, setContratosState] = useState<AsyncState<Contrato[]>>(EMPTY_ASYNC);
  const [scopeEmpresaId, setScopeEmpresaId] = useState("");
  const [scopeContratoId, setScopeContratoId] = useState("");

  const [summaryState, setSummaryState] = useState<AsyncState<{ eventosActivos: number; planesAbiertos: number; planesVencidos: number; inspecciones: number; hallazgosPendientes: number; accionesPendientes: number; accidentes: number; alertasIndicadores: number }>>(EMPTY_ASYNC);

  const [eventsQuery, setEventsQuery] = useState({ page: 1, search: "", estado: "", tipo_evento: "", gravedad: "" });
  const [eventsState, setEventsState] = useState<AsyncState<SstPaginatedResult<SstEvento>>>({ data: emptyPaginated<SstEvento>(), error: null, loading: false });
  const [selectedEvent, setSelectedEvent] = useState<SstEvento | null>(null);
  const [eventModalMode, setEventModalMode] = useState<"create" | "edit" | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(EMPTY_EVENT_FORM);

  const [plansQuery, setPlansQuery] = useState({ page: 1, search: "", estado: "", origen: "" });
  const [plansState, setPlansState] = useState<AsyncState<SstPaginatedResult<SstPlanAccion>>>({ data: emptyPaginated<SstPlanAccion>(), error: null, loading: false });
  const [selectedPlan, setSelectedPlan] = useState<SstPlanAccion | null>(null);
  const [planModalMode, setPlanModalMode] = useState<"create" | "edit" | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(EMPTY_PLAN_FORM);
  const [planOriginCatalogs, setPlanOriginCatalogs] = useState<PlanOriginCatalogs>({ EVENTO: [], INSPECCION: [], HALLAZGO: [], ACCIDENTE: [] });
  const [planOriginLoading, setPlanOriginLoading] = useState(false);

  const [inspeccionesQuery, setInspeccionesQuery] = useState({ page: 1, search: "", estado: "", tipo_inspeccion: "" });
  const [inspeccionesState, setInspeccionesState] = useState<AsyncState<SstPaginatedResult<SstInspeccion>>>({ data: emptyPaginated<SstInspeccion>(), error: null, loading: false });
  const [inspeccionDashboardState, setInspeccionDashboardState] = useState<AsyncState<SstInspeccionDashboard>>(EMPTY_ASYNC);
  const [inspeccionAlertasState, setInspeccionAlertasState] = useState<AsyncState<SstPaginatedResult<SstInspeccionAlerta>>>({ data: emptyPaginated<SstInspeccionAlerta>(), error: null, loading: false });
  const [selectedInspeccion, setSelectedInspeccion] = useState<SstInspeccion | null>(null);
  const [inspeccionModalMode, setInspeccionModalMode] = useState<"create" | "edit" | null>(null);
  const [inspeccionForm, setInspeccionForm] = useState<InspeccionFormState>(EMPTY_INSPECCION_FORM);

  const [inspeccionLookupState, setInspeccionLookupState] = useState<AsyncState<SstInspeccion[]>>({ data: [], error: null, loading: false });
  const [hallazgosQuery, setHallazgosQuery] = useState({ page: 1, inspeccion_id: "", tipo_hallazgo: "", nivel_riesgo: "", requiere_accion: "" });
  const [hallazgosState, setHallazgosState] = useState<AsyncState<SstPaginatedResult<SstHallazgoInspeccion>>>({ data: emptyPaginated<SstHallazgoInspeccion>(), error: null, loading: false });
  const [selectedHallazgo, setSelectedHallazgo] = useState<SstHallazgoInspeccion | null>(null);
  const [hallazgoModalMode, setHallazgoModalMode] = useState<"create" | "edit" | null>(null);
  const [hallazgoForm, setHallazgoForm] = useState<HallazgoFormState>(EMPTY_HALLAZGO_FORM);
  const [creatingHallazgo, setCreatingHallazgo] = useState(false);
  const [updatingHallazgo, setUpdatingHallazgo] = useState(false);
  const [deactivatingHallazgoId, setDeactivatingHallazgoId] = useState<string | null>(null);
  const [accionesInsQuery, setAccionesInsQuery] = useState({ page: 1, estado: "", hallazgo_id: "" });
  const [accionesInspeccionState, setAccionesInspeccionState] = useState<AsyncState<SstPaginatedResult<SstAccionInspeccion>>>({ data: emptyPaginated<SstAccionInspeccion>(), error: null, loading: false });
  const [accionInspeccionModalMode, setAccionInspeccionModalMode] = useState<"create" | "edit" | null>(null);
  const [accionInspeccionForm, setAccionInspeccionForm] = useState<AccionInspeccionFormState>(EMPTY_ACCION_INS_FORM);
  const [selectedAccionInspeccion, setSelectedAccionInspeccion] = useState<SstAccionInspeccion | null>(null);
  const [creatingAccionInspeccion, setCreatingAccionInspeccion] = useState(false);
  const [updatingAccionInspeccion, setUpdatingAccionInspeccion] = useState(false);
  const [closingAccionInspeccionId, setClosingAccionInspeccionId] = useState<string | null>(null);
  const [deactivatingAccionInspeccionId, setDeactivatingAccionInspeccionId] = useState<string | null>(null);

  const [accidentesQuery, setAccidentesQuery] = useState<AccidentesQueryState>({ page: 1, tipo_evento: "", severidad: "", estado: "" });
  const [accidentesState, setAccidentesState] = useState<AsyncState<SstPaginatedResult<SstAccidente>>>({ data: emptyPaginated<SstAccidente>(), error: null, loading: false });
  const [accidenteDashboardState, setAccidenteDashboardState] = useState<AsyncState<SstAccidenteDashboard>>(EMPTY_ASYNC);
  const [accidenteAlertasState, setAccidenteAlertasState] = useState<AsyncState<SstPaginatedResult<SstAccidenteAlerta>>>({ data: emptyPaginated<SstAccidenteAlerta>(), error: null, loading: false });
  const [selectedAccidente, setSelectedAccidente] = useState<SstAccidente | null>(null);
  const [accidenteModalMode, setAccidenteModalMode] = useState<"create" | "edit" | null>(null);
  const [accidenteForm, setAccidenteForm] = useState<AccidenteFormState>(EMPTY_ACCIDENT_FORM);
  const [creatingAccidente, setCreatingAccidente] = useState(false);
  const [updatingAccidente, setUpdatingAccidente] = useState(false);
  const [deactivatingAccidenteId, setDeactivatingAccidenteId] = useState<string | null>(null);
  const [accionesAccidenteState, setAccionesAccidenteState] = useState<AsyncState<SstPaginatedResult<SstAccionAccidente>>>({ data: emptyPaginated<SstAccionAccidente>(), error: null, loading: false });
  const [accionAccidenteModalMode, setAccionAccidenteModalMode] = useState<"create" | "edit" | null>(null);
  const [accionAccidenteForm, setAccionAccidenteForm] = useState<AccionAccidenteFormState>(EMPTY_ACCION_ACCIDENTE_FORM);
  const [selectedAccionAccidente, setSelectedAccionAccidente] = useState<SstAccionAccidente | null>(null);
  const [creatingAccionAccidente, setCreatingAccionAccidente] = useState(false);
  const [updatingAccionAccidente, setUpdatingAccionAccidente] = useState(false);
  const [deactivatingAccionAccidenteId, setDeactivatingAccionAccidenteId] = useState<string | null>(null);
  const [highlightedAccidenteId, setHighlightedAccidenteId] = useState<string | null>(null);

  const [indicadoresState, setIndicadoresState] = useState<AsyncState<SstIndicadoresOverview>>(EMPTY_ASYNC);
  const [periodosState, setPeriodosState] = useState<AsyncState<SstPaginatedResult<SstIndicadorPeriodo>>>({ data: emptyPaginated<SstIndicadorPeriodo>(), error: null, loading: false });
  const [selectedPeriodoId, setSelectedPeriodoId] = useState("");
  const [indicadoresDashboardState, setIndicadoresDashboardState] = useState<AsyncState<SstIndicadorDashboard>>(EMPTY_ASYNC);
  const [indicadoresHistoricoState, setIndicadoresHistoricoState] = useState<AsyncState<SstIndicadorHistorico>>(EMPTY_ASYNC);
  const [indicadoresAlertasState, setIndicadoresAlertasState] = useState<AsyncState<SstPaginatedResult<SstIndicadorAlerta>>>({ data: emptyPaginated<SstIndicadorAlerta>(), error: null, loading: false });

  const [personaSearch, setPersonaSearch] = useState("");
  const [personaOptions, setPersonaOptions] = useState<SstPersonaOption[]>([]);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<SstPersonaOption | null>(null);
  const [vinculacionOptions, setVinculacionOptions] = useState<SstVinculacionOption[]>([]);
  const [vinculacionLoading, setVinculacionLoading] = useState(false);
  const scopeCatalogRequestIdRef = useRef(0);
  const eventsRequestIdRef = useRef(0);
  const plansRequestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const planOriginRequestIdRef = useRef(0);
  const inspeccionesRequestIdRef = useRef(0);
  const inspeccionDashboardRequestIdRef = useRef(0);
  const inspeccionAlertasRequestIdRef = useRef(0);
  const inspeccionLookupRequestIdRef = useRef(0);
  const hallazgosRequestIdRef = useRef(0);
  const hallazgosInspectionIdRef = useRef("");
  const hallazgoSubmitLockRef = useRef(false);
  const deactivatingHallazgoIdRef = useRef<string | null>(null);
  const accionesInspeccionRequestIdRef = useRef(0);
  const accionesInspeccionHallazgoIdRef = useRef("");
  const accionInspeccionSubmitLockRef = useRef(false);
  const closingAccionInspeccionIdRef = useRef<string | null>(null);
  const deactivatingAccionInspeccionIdRef = useRef<string | null>(null);
  const accidentesRequestIdRef = useRef(0);
  const accidenteDashboardRequestIdRef = useRef(0);
  const accidenteAlertasRequestIdRef = useRef(0);
  const accionesAccidenteRequestIdRef = useRef(0);
  const accionesAccidenteAccidenteIdRef = useRef("");
  const accidentesViewRequestKeyRef = useRef("");
  const pendingAccidenteSelectionIdRef = useRef<string | null>(null);
  const accidenteSubmitLockRef = useRef(false);
  const accionAccidenteSubmitLockRef = useRef(false);
  const deactivatingAccidenteIdRef = useRef<string | null>(null);
  const deactivatingAccionAccidenteIdRef = useRef<string | null>(null);
  const indicadoresCatalogRequestIdRef = useRef(0);
  const indicadoresCatalogRequestKeyRef = useRef("");
  const indicadoresPeriodosRequestIdRef = useRef(0);
  const indicadoresPeriodosRequestKeyRef = useRef("");
  const indicadoresDashboardRequestIdRef = useRef(0);
  const indicadoresDashboardRequestKeyRef = useRef("");
  const indicadoresHistoricoRequestIdRef = useRef(0);
  const indicadoresHistoricoRequestKeyRef = useRef("");
  const indicadoresAlertasRequestIdRef = useRef(0);
  const indicadoresAlertasRequestKeyRef = useRef("");
  const indicadoresScopeKeyRef = useRef("");

  const contratos = contratosState.data ?? [];
  const empresas = empresasState.data ?? [];
  const scope = useMemo(() => ({ empresa_id: scopeEmpresaId || null, contrato_id: scopeContratoId || null }), [scopeContratoId, scopeEmpresaId]);
  const contratosFiltrados = useMemo(() => {
    return scopeEmpresaId ? contratos.filter((item) => String(item.empresa.id) === scopeEmpresaId) : contratos;
  }, [contratos, scopeEmpresaId]);
const selectedPeriodo = periodosState.data?.items.find((item) => String(item.id) === selectedPeriodoId) ?? null;
  const indicadoresScopeKey = useMemo(() => JSON.stringify({ empresa_id: scope.empresa_id ?? "", contrato_id: scope.contrato_id ?? "" }), [scope]);
  const indicadoresCatalogo = indicadoresState.data?.catalogo ?? [];
  const indicadoresMediciones = indicadoresState.data?.mediciones ?? [];
  const indicadoresHistoricoItems = indicadoresHistoricoState.data?.items ?? [];
  const indicadoresAlertaItems = indicadoresAlertasState.data?.items ?? [];

  useEffect(() => {
    const nextEmpresaId = empresaId ? String(empresaId) : "";
    setScopeEmpresaId((current) => (current === nextEmpresaId ? current : nextEmpresaId));
    setScopeContratoId("");
  }, [empresaId]);

  useEffect(() => {
    setScopeContratoId((current) =>
      current && contratosFiltrados.some((item) => String(item.id) === current) ? current : "",
    );
  }, [contratosFiltrados]);
  const clearIndicadoresDerivedData = useCallback(() => {
    indicadoresDashboardRequestIdRef.current += 1;
    indicadoresHistoricoRequestIdRef.current += 1;
    indicadoresAlertasRequestIdRef.current += 1;
    indicadoresDashboardRequestKeyRef.current = "";
    indicadoresHistoricoRequestKeyRef.current = "";
    indicadoresAlertasRequestKeyRef.current = "";
    setIndicadoresDashboardState({ data: null, error: null, loading: false });
    setIndicadoresHistoricoState({ data: null, error: null, loading: false });
    setIndicadoresAlertasState({ data: emptyPaginated<SstIndicadorAlerta>(), error: null, loading: false });
  }, []);
  const currentHallazgoIdForAcciones = useMemo(() => {
    if (selectedHallazgo && String(selectedHallazgo.inspeccion.id) === hallazgosQuery.inspeccion_id) {
      return String(selectedHallazgo.id);
    }

    return "";
  }, [hallazgosQuery.inspeccion_id, selectedHallazgo]);
  const currentAccidenteIdForAcciones = useMemo(() => {
    if (selectedAccidente) {
      return String(selectedAccidente.id);
    }

    return "";
  }, [selectedAccidente]);
  const buildAccidentesViewRequestKey = (query: AccidentesQueryState) => JSON.stringify({
    canReadAccidentes,
    empresa_id: scope.empresa_id ?? "",
    contrato_id: scope.contrato_id ?? "",
    page: query.page,
    tipo_evento: query.tipo_evento,
    severidad: query.severidad,
    estado: query.estado,
  });
  const accidenteMatchesVisibleScope = (item: SstAccidente) => {
    const matchesEmpresa = !scope.empresa_id || String(item.empresa.id) === scope.empresa_id;
    const matchesContrato = !scope.contrato_id || String(item.contrato.id ?? "") === scope.contrato_id;
    return matchesEmpresa && matchesContrato;
  };
  const buildAccidentesQueryForVisibility = (item: SstAccidente, current: AccidentesQueryState): AccidentesQueryState => ({
    page: 1,
    tipo_evento: current.tipo_evento && current.tipo_evento !== item.tipo_evento ? "" : current.tipo_evento,
    severidad: current.severidad && current.severidad !== item.severidad ? "" : current.severidad,
    estado: current.estado && current.estado !== item.estado ? "" : current.estado,
  });
  const accidentesQueryChanged = (left: AccidentesQueryState, right: AccidentesQueryState) => (
    left.page !== right.page ||
    left.tipo_evento !== right.tipo_evento ||
    left.severidad !== right.severidad ||
    left.estado !== right.estado
  );
  const isSubmittingHallazgo = creatingHallazgo || updatingHallazgo;
  const isSubmittingAccionInspeccion = creatingAccionInspeccion || updatingAccionInspeccion;
  const isSubmittingAccidente = creatingAccidente || updatingAccidente;
  const isSubmittingAccionAccidente = creatingAccionAccidente || updatingAccionAccidente;

  const setTab = (tab: SstTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  async function runAction(key: string, action: () => Promise<void>, successMessage?: string) {
    if (busyKey === key) {
      return;
    }

    setBusyKey(key);
    try {
      await action();
      if (successMessage) {
        setFeedback({ tone: "success", message: successMessage });
      }
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      setBusyKey((current) => (current === key ? null : current));
    }
  }

  async function loadScopeCatalogs() {
    const requestId = ++scopeCatalogRequestIdRef.current;
    setEmpresasState((current) => ({ data: current.data, error: null, loading: true }));
    setContratosState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const [empresasResult, contratosResult] = await Promise.all([
        configuracionApi.listarEmpresas({ activo: true, page: 1, limit: CATALOG_LIMIT }),
        configuracionApi.listarContratos({ activo: true, page: 1, limit: CATALOG_LIMIT }),
      ]);

      if (requestId !== scopeCatalogRequestIdRef.current) {
        return;
      }

      setEmpresasState({ data: empresasResult.items, error: null, loading: false });
      setContratosState({ data: contratosResult.items, error: null, loading: false });
    } catch (error) {
      if (requestId !== scopeCatalogRequestIdRef.current) {
        return;
      }

      const message = toMessage(error);
      setEmpresasState({ data: [], error: message, loading: false });
      setContratosState({ data: [], error: message, loading: false });
    }
  }

  async function loadPersonaOptions(search = personaSearch) {
    const normalizedSearch = search.trim();
    setPersonaLoading(true);

    try {
      const items = await buscarPersonasSst(normalizedSearch, LOOKUP_LIMIT);
      setPersonaOptions(items);
      if (selectedPersona && !items.some((item) => String(item.id) === String(selectedPersona.id))) {
        setSelectedPersona(null);
      }
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
      setPersonaOptions([]);
    } finally {
      setPersonaLoading(false);
    }
  }

  async function loadVinculaciones(personaId: number, preferredVinculacionId = "") {
    setVinculacionLoading(true);

    try {
      const items = await listarVinculacionesPersonaSst(personaId);
      setVinculacionOptions(items);

      const eventCurrentId = preferredVinculacionId || eventForm.vinculacion_id;
      const accidenteCurrentId = preferredVinculacionId || accidenteForm.vinculacion_id;
      const defaultId = items.length === 1 ? String(items[0].vinculacion.id) : "";
      const nextEventId = items.some((item) => String(item.vinculacion.id) === eventCurrentId)
        ? eventCurrentId
        : defaultId;
      const nextAccidenteId = items.some((item) => String(item.vinculacion.id) === accidenteCurrentId)
        ? accidenteCurrentId
        : defaultId;

      if (eventModalMode) {
        setEventForm((current) => ({ ...current, vinculacion_id: nextEventId }));
      }
      if (accidenteModalMode) {
        setAccidenteForm((current) => ({ ...current, vinculacion_id: nextAccidenteId }));
      }
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
      setVinculacionOptions([]);
    } finally {
      setVinculacionLoading(false);
    }
  }

  function clearAccidenteSelection() {
    accionesAccidenteAccidenteIdRef.current = "";
    accionesAccidenteRequestIdRef.current += 1;
    pendingAccidenteSelectionIdRef.current = null;
    setSelectedAccidente(null);
    setSelectedAccionAccidente(null);
    setHighlightedAccidenteId(null);
    setAccionesAccidenteState({ data: emptyPaginated<SstAccionAccidente>(), error: null, loading: false });
  }

  function handleSelectAccidente(item: SstAccidente) {
    const accidenteId = String(item.id);
    accionesAccidenteAccidenteIdRef.current = accidenteId;
    accionesAccidenteRequestIdRef.current += 1;
    setSelectedAccidente(item);
    setSelectedAccionAccidente(null);
    setHighlightedAccidenteId(accidenteId);
    setAccionesAccidenteState({ data: null, error: null, loading: true });
  }

  async function refreshSummary() {
    const requestId = ++summaryRequestIdRef.current;
    setSummaryState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const [eventosResult, planesItems, inspeccionDashboard, accidenteDashboard, alertasIndicadores] = await Promise.all([
        listarEventosSst({ ...scope, activo: true, page: 1, limit: 1 }),
        fetchAllPages((page) => listarPlanesSst({ ...scope, activo: true, page, limit: LOOKUP_LIMIT })),
        obtenerDashboardInspeccionesSst(scope),
        obtenerDashboardAccidentesSst(scope),
        obtenerAlertasIndicadoresResumen(scope),
      ]);

      if (requestId !== summaryRequestIdRef.current) {
        return;
      }

      const today = todayIso();
      const planesAbiertos = planesItems.filter((item) => !["CERRADO", "ANULADO"].includes(item.estado)).length;
      const planesVencidos = planesItems.filter(
        (item) =>
          item.fecha_compromiso !== null &&
          item.fecha_compromiso < today &&
          !["CERRADO", "ANULADO"].includes(item.estado),
      ).length;

      setSummaryState({
        data: {
          eventosActivos: eventosResult.pagination.total,
          planesAbiertos,
          planesVencidos,
          inspecciones: inspeccionDashboard.inspecciones_total,
          hallazgosPendientes: inspeccionDashboard.hallazgos_total,
          accionesPendientes:
            inspeccionDashboard.acciones_abiertas + accidenteDashboard.acciones_abiertas,
          accidentes:
            accidenteDashboard.accidentes_total +
            accidenteDashboard.incidentes_total +
            accidenteDashboard.casi_accidentes_total,
          alertasIndicadores: alertasIndicadores.pagination.total,
        },
        error: null,
        loading: false,
      });
    } catch (error) {
      if (requestId !== summaryRequestIdRef.current) {
        return;
      }

      setSummaryState({ data: null, error: toMessage(error), loading: false });
    }
  }

  async function refreshEvents(nextQuery = eventsQuery) {
    if (!canReadEvents) {
      setEventsState({ data: emptyPaginated<SstEvento>(), error: null, loading: false });
      return;
    }

    const requestId = ++eventsRequestIdRef.current;
    setEventsState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarEventosSst({
        ...scope,
        page: nextQuery.page,
        limit: LIST_LIMIT,
        activo: true,
        search: nextQuery.search || null,
        estado: nextQuery.estado ? (nextQuery.estado as SstEventoEstado) : null,
        tipo_evento: nextQuery.tipo_evento ? (nextQuery.tipo_evento as SstEventoTipo) : null,
        gravedad: nextQuery.gravedad ? (nextQuery.gravedad as SstEventoGravedad) : null,
      });

      if (requestId !== eventsRequestIdRef.current) {
        return;
      }

      setEventsState({ data, error: null, loading: false });
      if (selectedEvent) {
        setSelectedEvent(data.items.find((item) => item.id === selectedEvent.id) ?? null);
      }
    } catch (error) {
      if (requestId !== eventsRequestIdRef.current) {
        return;
      }

      setEventsState({ data: emptyPaginated<SstEvento>(), error: toMessage(error), loading: false });
    }
  }

  async function refreshPlans(nextQuery = plansQuery) {
    if (!canReadPlans) {
      setPlansState({ data: emptyPaginated<SstPlanAccion>(), error: null, loading: false });
      return;
    }

    const requestId = ++plansRequestIdRef.current;
    setPlansState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarPlanesSst({
        ...scope,
        page: nextQuery.page,
        limit: LIST_LIMIT,
        activo: true,
        search: nextQuery.search || null,
        origen: nextQuery.origen ? (nextQuery.origen as SstPlanOrigen) : null,
        estado: nextQuery.estado ? (nextQuery.estado as SstPlanEstado) : null,
      });

      if (requestId !== plansRequestIdRef.current) {
        return;
      }

      setPlansState({ data, error: null, loading: false });
      if (selectedPlan) {
        setSelectedPlan(data.items.find((item) => item.id === selectedPlan.id) ?? null);
      }
    } catch (error) {
      if (requestId !== plansRequestIdRef.current) {
        return;
      }

      setPlansState({ data: emptyPaginated<SstPlanAccion>(), error: toMessage(error), loading: false });
    }
  }

  async function loadPlanOrigins() {
    const requestId = ++planOriginRequestIdRef.current;
    setPlanOriginLoading(true);

    try {
      const [eventos, inspecciones, accidentes] = await Promise.all([
        fetchAllPages((page) =>
          listarEventosSst({ ...scope, activo: true, page, limit: LOOKUP_LIMIT }),
        ),
        fetchAllPages((page) =>
          listarInspeccionesSst({ ...scope, activo: true, page, limit: LOOKUP_LIMIT }),
        ),
        fetchAllPages((page) =>
          listarAccidentesSst({ ...scope, activo: true, page, limit: LOOKUP_LIMIT }),
        ),
      ]);

      if (requestId !== planOriginRequestIdRef.current) {
        return;
      }

      setPlanOriginCatalogs({
        EVENTO: eventos,
        INSPECCION: inspecciones,
        HALLAZGO: hallazgosState.data?.items ?? [],
        ACCIDENTE: accidentes,
      });
    } catch (error) {
      if (requestId !== planOriginRequestIdRef.current) {
        return;
      }

      setFeedback({ tone: "error", message: toMessage(error) });
      setPlanOriginCatalogs({ EVENTO: [], INSPECCION: [], HALLAZGO: [], ACCIDENTE: [] });
    } finally {
      if (requestId === planOriginRequestIdRef.current) {
        setPlanOriginLoading(false);
      }
    }
  }

  async function refreshInspecciones(nextQuery = inspeccionesQuery) {
    if (!canReadInspecciones) {
      setInspeccionesState({ data: emptyPaginated<SstInspeccion>(), error: null, loading: false });
      return;
    }

    const requestId = ++inspeccionesRequestIdRef.current;
    setInspeccionesState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarInspeccionesSst({
        ...scope,
        page: nextQuery.page,
        limit: LIST_LIMIT,
        activo: true,
        search: nextQuery.search || null,
        tipo_inspeccion: nextQuery.tipo_inspeccion ? (nextQuery.tipo_inspeccion as SstInspeccionTipo) : null,
        estado: nextQuery.estado ? (nextQuery.estado as SstInspeccionEstado) : null,
      });

      if (requestId !== inspeccionesRequestIdRef.current) {
        return;
      }

      setInspeccionesState({ data, error: null, loading: false });
      if (selectedInspeccion) {
        setSelectedInspeccion(data.items.find((item) => item.id === selectedInspeccion.id) ?? null);
      }
    } catch (error) {
      if (requestId !== inspeccionesRequestIdRef.current) {
        return;
      }

      setInspeccionesState({ data: emptyPaginated<SstInspeccion>(), error: toMessage(error), loading: false });
    }
  }

  async function refreshInspeccionDashboard() {
    if (!canReadInspecciones) {
      setInspeccionDashboardState({ data: null, error: null, loading: false });
      return;
    }

    const requestId = ++inspeccionDashboardRequestIdRef.current;
    setInspeccionDashboardState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerDashboardInspeccionesSst(scope);
      if (requestId !== inspeccionDashboardRequestIdRef.current) {
        return;
      }

      setInspeccionDashboardState({ data, error: null, loading: false });
    } catch (error) {
      if (requestId !== inspeccionDashboardRequestIdRef.current) {
        return;
      }

      setInspeccionDashboardState({ data: null, error: toMessage(error), loading: false });
    }
  }

  async function refreshInspeccionAlertas() {
    if (!canReadInspecciones) {
      setInspeccionAlertasState({ data: emptyPaginated<SstInspeccionAlerta>(), error: null, loading: false });
      return;
    }

    const requestId = ++inspeccionAlertasRequestIdRef.current;
    setInspeccionAlertasState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerAlertasInspeccionesSst({ ...scope, page: 1, limit: LIST_LIMIT });
      if (requestId !== inspeccionAlertasRequestIdRef.current) {
        return;
      }

      setInspeccionAlertasState({ data, error: null, loading: false });
    } catch (error) {
      if (requestId !== inspeccionAlertasRequestIdRef.current) {
        return;
      }

      setInspeccionAlertasState({
        data: emptyPaginated<SstInspeccionAlerta>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  async function refreshInspeccionLookup() {
    if (!canReadInspecciones) {
      setInspeccionLookupState({ data: [], error: null, loading: false });
      return;
    }

    const requestId = ++inspeccionLookupRequestIdRef.current;
    setInspeccionLookupState((current) => ({ data: current.data ?? [], error: null, loading: true }));

    try {
      const items = await fetchAllPages((page) =>
        listarInspeccionesSst({ ...scope, activo: true, page, limit: LOOKUP_LIMIT }),
      );
      if (requestId !== inspeccionLookupRequestIdRef.current) {
        return;
      }

      setInspeccionLookupState({ data: items, error: null, loading: false });
    } catch (error) {
      if (requestId !== inspeccionLookupRequestIdRef.current) {
        return;
      }

      setInspeccionLookupState({ data: [], error: toMessage(error), loading: false });
    }
  }

  async function refreshHallazgos(nextQuery = hallazgosQuery) {
    if (!canReadInspecciones || !nextQuery.inspeccion_id) {
      setHallazgosState({ data: emptyPaginated<SstHallazgoInspeccion>(), error: null, loading: false });
      return;
    }

    const requestId = ++hallazgosRequestIdRef.current;
    hallazgosInspectionIdRef.current = nextQuery.inspeccion_id;
    setHallazgosState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarHallazgosInspeccionSst(nextQuery.inspeccion_id, {
        page: nextQuery.page,
        limit: LIST_LIMIT,
        activo: true,
        tipo_hallazgo: nextQuery.tipo_hallazgo ? (nextQuery.tipo_hallazgo as SstHallazgoTipo) : null,
        nivel_riesgo: nextQuery.nivel_riesgo ? (nextQuery.nivel_riesgo as SstHallazgoNivel) : null,
        requiere_accion:
          nextQuery.requiere_accion === ""
            ? null
            : nextQuery.requiere_accion === "true",
      });

      if (
        requestId !== hallazgosRequestIdRef.current ||
        hallazgosInspectionIdRef.current !== nextQuery.inspeccion_id
      ) {
        return;
      }

      setHallazgosState({ data, error: null, loading: false });
      if (selectedHallazgo) {
        const refreshed = data.items.find((item) => item.id === selectedHallazgo.id) ?? null;
        setSelectedHallazgo(refreshed);
        if (!refreshed) {
          accionesInspeccionHallazgoIdRef.current = "";
          accionesInspeccionRequestIdRef.current += 1;
          setSelectedAccionInspeccion(null);
          setAccionesInsQuery((current) => ({ ...current, page: 1, hallazgo_id: "" }));
          setAccionesInspeccionState({
            data: emptyPaginated<SstAccionInspeccion>(),
            error: null,
            loading: false,
          });
        }
      }
    } catch (error) {
      if (
        requestId !== hallazgosRequestIdRef.current ||
        hallazgosInspectionIdRef.current !== nextQuery.inspeccion_id
      ) {
        return;
      }

      setHallazgosState({
        data: emptyPaginated<SstHallazgoInspeccion>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  async function refreshAccionesInspeccion(nextQuery = accionesInsQuery) {
    const hallazgoId = accionesInspeccionHallazgoIdRef.current || currentHallazgoIdForAcciones;
    if (!canReadInspecciones || !hallazgoId) {
      setAccionesInspeccionState({
        data: emptyPaginated<SstAccionInspeccion>(),
        error: null,
        loading: false,
      });
      return;
    }

    const requestId = ++accionesInspeccionRequestIdRef.current;
    accionesInspeccionHallazgoIdRef.current = hallazgoId;
    setAccionesInspeccionState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarAccionesInspeccionSst({
        ...scope,
        hallazgo_id: hallazgoId,
        activo: true,
        estado: nextQuery.estado ? (nextQuery.estado as SstAccionEstado) : null,
        page: nextQuery.page,
        limit: LIST_LIMIT,
      });

      if (
        requestId !== accionesInspeccionRequestIdRef.current ||
        accionesInspeccionHallazgoIdRef.current !== hallazgoId
      ) {
        return;
      }

      setAccionesInspeccionState({ data, error: null, loading: false });
      if (selectedAccionInspeccion) {
        setSelectedAccionInspeccion(data.items.find((item) => item.id === selectedAccionInspeccion.id) ?? null);
      }
    } catch (error) {
      if (
        requestId !== accionesInspeccionRequestIdRef.current ||
        accionesInspeccionHallazgoIdRef.current !== hallazgoId
      ) {
        return;
      }

      setAccionesInspeccionState({
        data: emptyPaginated<SstAccionInspeccion>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  async function refreshAccidentes(
    nextQuery = accidentesQuery,
    options: { force?: boolean } = {},
  ) {
    if (!canReadAccidentes) {
      setAccidentesState({ data: emptyPaginated<SstAccidente>(), error: null, loading: false });
      return;
    }

    const requestId = ++accidentesRequestIdRef.current;
    const requestKey = buildAccidentesViewRequestKey(nextQuery);
    accidentesViewRequestKeyRef.current = requestKey;
    setAccidentesState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarAccidentesSst({
        ...scope,
        page: nextQuery.page,
        limit: LIST_LIMIT,
        activo: true,
        tipo_evento: nextQuery.tipo_evento || null,
        severidad: nextQuery.severidad || null,
        estado: nextQuery.estado || null,
      });

      if (
        requestId !== accidentesRequestIdRef.current ||
        accidentesViewRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setAccidentesState({ data, error: null, loading: false });

      if (pendingAccidenteSelectionIdRef.current) {
        const pendingId = pendingAccidenteSelectionIdRef.current;
        const createdItem = data.items.find((item) => String(item.id) === pendingId) ?? null;
        pendingAccidenteSelectionIdRef.current = null;
        if (createdItem) {
          handleSelectAccidente(createdItem);
        } else {
          setHighlightedAccidenteId(null);
        }
        return;
      }

      if (selectedAccidente) {
        const refreshed = data.items.find((item) => item.id === selectedAccidente.id) ?? null;
        if (refreshed) {
          setSelectedAccidente(refreshed);
        } else if (!options.force) {
          clearAccidenteSelection();
        }
      }
    } catch (error) {
      if (
        requestId !== accidentesRequestIdRef.current ||
        accidentesViewRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setAccidentesState({ data: emptyPaginated<SstAccidente>(), error: toMessage(error), loading: false });
    }
  }

  async function refreshAccidenteDashboard() {
    if (!canReadAccidentes) {
      setAccidenteDashboardState({ data: null, error: null, loading: false });
      return;
    }

    const requestId = ++accidenteDashboardRequestIdRef.current;
    setAccidenteDashboardState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerDashboardAccidentesSst(scope);
      if (requestId !== accidenteDashboardRequestIdRef.current) {
        return;
      }

      setAccidenteDashboardState({ data, error: null, loading: false });
    } catch (error) {
      if (requestId !== accidenteDashboardRequestIdRef.current) {
        return;
      }

      setAccidenteDashboardState({ data: null, error: toMessage(error), loading: false });
    }
  }

  async function refreshAccidenteAlertas() {
    if (!canReadAccidentes) {
      setAccidenteAlertasState({ data: emptyPaginated<SstAccidenteAlerta>(), error: null, loading: false });
      return;
    }

    const requestId = ++accidenteAlertasRequestIdRef.current;
    setAccidenteAlertasState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerAlertasAccidentesSst({ ...scope, page: 1, limit: LIST_LIMIT });
      if (requestId !== accidenteAlertasRequestIdRef.current) {
        return;
      }

      setAccidenteAlertasState({ data, error: null, loading: false });
    } catch (error) {
      if (requestId !== accidenteAlertasRequestIdRef.current) {
        return;
      }

      setAccidenteAlertasState({
        data: emptyPaginated<SstAccidenteAlerta>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  async function refreshAccionesAccidente() {
    const accidenteId = accionesAccidenteAccidenteIdRef.current || currentAccidenteIdForAcciones;
    if (!canReadAccidentes || !accidenteId) {
      setAccionesAccidenteState({
        data: emptyPaginated<SstAccionAccidente>(),
        error: null,
        loading: false,
      });
      return;
    }

    const requestId = ++accionesAccidenteRequestIdRef.current;
    accionesAccidenteAccidenteIdRef.current = accidenteId;
    setAccionesAccidenteState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarAccionesAccidenteSst(accidenteId, {
        activo: true,
        page: 1,
        limit: LOOKUP_LIMIT,
      });

      if (
        requestId !== accionesAccidenteRequestIdRef.current ||
        accionesAccidenteAccidenteIdRef.current !== accidenteId
      ) {
        return;
      }

      setAccionesAccidenteState({ data, error: null, loading: false });
      if (selectedAccionAccidente) {
        setSelectedAccionAccidente(data.items.find((item) => item.id === selectedAccionAccidente.id) ?? null);
      }
    } catch (error) {
      if (
        requestId !== accionesAccidenteRequestIdRef.current ||
        accionesAccidenteAccidenteIdRef.current !== accidenteId
      ) {
        return;
      }

      setAccionesAccidenteState({
        data: emptyPaginated<SstAccionAccidente>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  async function refreshIndicadores(options: { force?: boolean } = {}) {
    if (!canReadIndicadores) {
      setIndicadoresState({ data: null, error: null, loading: false });
      return;
    }

    const requestId = ++indicadoresCatalogRequestIdRef.current;
    const requestKey = JSON.stringify({ scope, activeTab, force: options.force ?? false });
    indicadoresCatalogRequestKeyRef.current = requestKey;
    setIndicadoresState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerIndicadoresSst({
        ...scope,
        activo: true,
        page: 1,
        limit: CATALOG_LIMIT,
      });

      if (
        requestId !== indicadoresCatalogRequestIdRef.current ||
        indicadoresCatalogRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setIndicadoresState({ data, error: null, loading: false });
    } catch (error) {
      if (
        requestId !== indicadoresCatalogRequestIdRef.current ||
        indicadoresCatalogRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setIndicadoresState({ data: null, error: toMessage(error), loading: false });
    }
  }

  async function refreshIndicadoresPeriodos(options: { force?: boolean } = {}) {
    if (!canReadIndicadores) {
      setPeriodosState({ data: emptyPaginated<SstIndicadorPeriodo>(), error: null, loading: false });
      return;
    }

    const requestId = ++indicadoresPeriodosRequestIdRef.current;
    const requestKey = JSON.stringify({ scope, activeTab, force: options.force ?? false });
    indicadoresPeriodosRequestKeyRef.current = requestKey;
    setPeriodosState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await listarPeriodosIndicadoresSst({
        ...scope,
        activo: true,
        page: 1,
        limit: LIST_LIMIT,
      });

      if (
        requestId !== indicadoresPeriodosRequestIdRef.current ||
        indicadoresPeriodosRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setPeriodosState({ data, error: null, loading: false });
      setSelectedPeriodoId((current) => {
        if (data.items.some((item) => String(item.id) === current)) {
          return current;
        }
        return data.items[0] ? String(data.items[0].id) : "";
      });
    } catch (error) {
      if (
        requestId !== indicadoresPeriodosRequestIdRef.current ||
        indicadoresPeriodosRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setPeriodosState({
        data: emptyPaginated<SstIndicadorPeriodo>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  async function refreshIndicadoresDashboard(options: { force?: boolean } = {}) {
    if (!canReadIndicadores || !selectedPeriodo) {
      setIndicadoresDashboardState({ data: null, error: null, loading: false });
      return;
    }

    const requestId = ++indicadoresDashboardRequestIdRef.current;
    const requestKey = JSON.stringify({ scope, periodo_id: selectedPeriodoId, force: options.force ?? false });
    indicadoresDashboardRequestKeyRef.current = requestKey;
    setIndicadoresDashboardState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerDashboardIndicadoresSst({
        ...scope,
        periodo_id: selectedPeriodoId,
      });

      if (
        requestId !== indicadoresDashboardRequestIdRef.current ||
        indicadoresDashboardRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setIndicadoresDashboardState({ data, error: null, loading: false });
    } catch (error) {
      if (
        requestId !== indicadoresDashboardRequestIdRef.current ||
        indicadoresDashboardRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      if (isIndicadoresPeriodoNotFound(error)) {
        setIndicadoresDashboardState({ data: null, error: null, loading: false });
        return;
      }

      setIndicadoresDashboardState({ data: null, error: toMessage(error), loading: false });
    }
  }

  async function refreshIndicadoresHistorico(options: { force?: boolean } = {}) {
    if (!canReadIndicadores || !selectedPeriodo) {
      setIndicadoresHistoricoState({ data: null, error: null, loading: false });
      return;
    }

    const requestId = ++indicadoresHistoricoRequestIdRef.current;
    const requestKey = JSON.stringify({ scope, periodo_id: selectedPeriodoId, force: options.force ?? false });
    indicadoresHistoricoRequestKeyRef.current = requestKey;
    setIndicadoresHistoricoState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerHistoricoIndicadoresSst({
        ...scope,
        periodo_id: selectedPeriodoId,
      });

      if (
        requestId !== indicadoresHistoricoRequestIdRef.current ||
        indicadoresHistoricoRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setIndicadoresHistoricoState({ data, error: null, loading: false });
    } catch (error) {
      if (
        requestId !== indicadoresHistoricoRequestIdRef.current ||
        indicadoresHistoricoRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      if (isIndicadoresPeriodoNotFound(error)) {
        setIndicadoresHistoricoState({ data: { items: [] }, error: null, loading: false });
        return;
      }

      setIndicadoresHistoricoState({ data: null, error: toMessage(error), loading: false });
    }
  }

  async function refreshIndicadoresAlertas(options: { force?: boolean } = {}) {
    if (!canReadIndicadores || !selectedPeriodo) {
      setIndicadoresAlertasState({
        data: emptyPaginated<SstIndicadorAlerta>(),
        error: null,
        loading: false,
      });
      return;
    }

    const requestId = ++indicadoresAlertasRequestIdRef.current;
    const requestKey = JSON.stringify({ scope, periodo_id: selectedPeriodoId, force: options.force ?? false });
    indicadoresAlertasRequestKeyRef.current = requestKey;
    setIndicadoresAlertasState((current) => ({ data: current.data, error: null, loading: true }));

    try {
      const data = await obtenerAlertasIndicadoresSst({
        ...scope,
        periodo_id: selectedPeriodoId,
      });

      if (
        requestId !== indicadoresAlertasRequestIdRef.current ||
        indicadoresAlertasRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      setIndicadoresAlertasState({ data, error: null, loading: false });
    } catch (error) {
      if (
        requestId !== indicadoresAlertasRequestIdRef.current ||
        indicadoresAlertasRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      if (isIndicadoresPeriodoNotFound(error)) {
        setIndicadoresAlertasState({
          data: emptyPaginated<SstIndicadorAlerta>(),
          error: null,
          loading: false,
        });
        return;
      }

      setIndicadoresAlertasState({
        data: emptyPaginated<SstIndicadorAlerta>(),
        error: toMessage(error),
        loading: false,
      });
    }
  }

  useEffect(() => {
    void loadScopeCatalogs();
  }, []);

  useEffect(() => {
    setSelectedEvent(null);
    setSelectedPlan(null);
    setSelectedInspeccion(null);
    setSelectedHallazgo(null);
    setSelectedAccionInspeccion(null);
    hallazgosInspectionIdRef.current = "";
    accionesInspeccionHallazgoIdRef.current = "";
    setHallazgosQuery((current) => ({ ...current, page: 1, inspeccion_id: "" }));
    setAccionesInsQuery((current) => ({ ...current, page: 1, hallazgo_id: "" }));
    setHallazgosState({ data: emptyPaginated<SstHallazgoInspeccion>(), error: null, loading: false });
    setAccionesInspeccionState({ data: emptyPaginated<SstAccionInspeccion>(), error: null, loading: false });
    clearAccidenteSelection();
  }, [scopeEmpresaId, scopeContratoId]);

  useEffect(() => {
    if (activeTab === "resumen") {
      void refreshSummary();
    }
  }, [activeTab, scopeEmpresaId, scopeContratoId]);

  useEffect(() => {
    if (activeTab === "eventos" && canReadEvents) {
      void refreshEvents();
    }
  }, [
    activeTab,
    canReadEvents,
    scopeEmpresaId,
    scopeContratoId,
    eventsQuery.page,
    eventsQuery.search,
    eventsQuery.estado,
    eventsQuery.tipo_evento,
    eventsQuery.gravedad,
  ]);

  useEffect(() => {
    if (activeTab === "planes" && canReadPlans) {
      void refreshPlans();
    }
  }, [
    activeTab,
    canReadPlans,
    scopeEmpresaId,
    scopeContratoId,
    plansQuery.page,
    plansQuery.search,
    plansQuery.estado,
    plansQuery.origen,
  ]);

  useEffect(() => {
    if (activeTab === "inspecciones" && canReadInspecciones) {
      void refreshInspecciones();
      void refreshInspeccionDashboard();
      void refreshInspeccionAlertas();
    }
  }, [
    activeTab,
    canReadInspecciones,
    scopeEmpresaId,
    scopeContratoId,
    inspeccionesQuery.page,
    inspeccionesQuery.search,
    inspeccionesQuery.estado,
    inspeccionesQuery.tipo_inspeccion,
  ]);

  useEffect(() => {
    if (activeTab === "hallazgos" && canReadInspecciones) {
      void refreshInspeccionLookup();
    }
  }, [activeTab, canReadInspecciones, scopeEmpresaId, scopeContratoId]);

  useEffect(() => {
    if (activeTab !== "hallazgos" || !canReadInspecciones) {
      return;
    }

    if (!hallazgosQuery.inspeccion_id) {
      setHallazgosState({ data: emptyPaginated<SstHallazgoInspeccion>(), error: null, loading: false });
      return;
    }

    void refreshHallazgos();
  }, [
    activeTab,
    canReadInspecciones,
    hallazgosQuery.inspeccion_id,
    hallazgosQuery.page,
    hallazgosQuery.tipo_hallazgo,
    hallazgosQuery.nivel_riesgo,
    hallazgosQuery.requiere_accion,
  ]);

  useEffect(() => {
    if (activeTab !== "hallazgos" || !canReadInspecciones) {
      return;
    }

    if (!currentHallazgoIdForAcciones) {
      setAccionesInspeccionState({ data: emptyPaginated<SstAccionInspeccion>(), error: null, loading: false });
      return;
    }

    void refreshAccionesInspeccion();
  }, [
    activeTab,
    canReadInspecciones,
    currentHallazgoIdForAcciones,
    accionesInsQuery.page,
    accionesInsQuery.estado,
  ]);

  useEffect(() => {
    if (activeTab === "accidentes" && canReadAccidentes) {
      void refreshAccidentes();
      void refreshAccidenteDashboard();
      void refreshAccidenteAlertas();
    }
  }, [
    activeTab,
    canReadAccidentes,
    scopeEmpresaId,
    scopeContratoId,
    accidentesQuery.page,
    accidentesQuery.tipo_evento,
    accidentesQuery.severidad,
    accidentesQuery.estado,
  ]);

  useEffect(() => {
    if (activeTab !== "accidentes" || !canReadAccidentes) {
      return;
    }

    if (!currentAccidenteIdForAcciones) {
      setAccionesAccidenteState({ data: emptyPaginated<SstAccionAccidente>(), error: null, loading: false });
      return;
    }

    void refreshAccionesAccidente();
  }, [activeTab, canReadAccidentes, currentAccidenteIdForAcciones]);

  useEffect(() => {
    if (activeTab !== "indicadores") {
      indicadoresCatalogRequestIdRef.current += 1;
      indicadoresPeriodosRequestIdRef.current += 1;
      indicadoresCatalogRequestKeyRef.current = "";
      indicadoresPeriodosRequestKeyRef.current = "";
      indicadoresScopeKeyRef.current = "";
      clearIndicadoresDerivedData();
      return;
    }

    const scopeChanged = indicadoresScopeKeyRef.current !== indicadoresScopeKey;
    indicadoresScopeKeyRef.current = indicadoresScopeKey;
    if (scopeChanged) {
      setSelectedPeriodoId("");
      clearIndicadoresDerivedData();
    }

    void refreshIndicadores({ force: scopeChanged });
    void refreshIndicadoresPeriodos({ force: scopeChanged });
  }, [activeTab, clearIndicadoresDerivedData, indicadoresScopeKey, refreshIndicadores, refreshIndicadoresPeriodos]);

  useEffect(() => {
    if (activeTab !== "indicadores") {
      return;
    }

    if (!canReadIndicadores || !selectedPeriodo) {
      clearIndicadoresDerivedData();
      return;
    }

    void refreshIndicadoresDashboard();
    void refreshIndicadoresHistorico();
    void refreshIndicadoresAlertas();
  }, [activeTab, canReadIndicadores, clearIndicadoresDerivedData, refreshIndicadoresAlertas, refreshIndicadoresDashboard, refreshIndicadoresHistorico, selectedPeriodo]);
  function openCreateEventModal() {
    setSelectedEvent(null);
    setSelectedPersona(null);
    setPersonaOptions([]);
    setVinculacionOptions([]);
    setPersonaSearch("");
    setEventForm(EMPTY_EVENT_FORM);
    setEventModalMode("create");
  }

  async function openEditEventModal(item: SstEvento) {
    setSelectedEvent(item);
    setSelectedPersona(null);
    setPersonaSearch("");
    setEventForm({
      vinculacion_id: String(item.vinculacion?.id ?? ""),
      tipo_evento: item.tipo_evento,
      fecha_evento: toInputDate(item.fecha_evento),
      hora_evento: toInputTime(item.hora_evento),
      lugar: item.lugar ?? "",
      descripcion: item.descripcion ?? "",
      gravedad: item.gravedad ?? "",
      requiere_investigacion: item.requiere_investigacion,
      estado: item.estado,
    });
    setEventModalMode("edit");
    if (item.vinculacion?.persona_id) {
      await loadVinculaciones(Number(item.vinculacion.persona_id), String(item.vinculacion.id));
    } else {
      setVinculacionOptions([]);
    }
  }

  function openCreatePlanModal() {
    setSelectedPlan(null);
    setPlanForm(EMPTY_PLAN_FORM);
    setPlanModalMode("create");
    void loadPlanOrigins();
  }

  function openEditPlanModal(item: SstPlanAccion) {
    setSelectedPlan(item);
    setPlanForm({
      origen: item.origen,
      origen_id: String(item.origen_id),
      responsable: item.responsable ?? "",
      descripcion: item.descripcion,
      fecha_compromiso: toInputDate(item.fecha_compromiso),
      estado: item.estado,
    });
    setPlanModalMode("edit");
    void loadPlanOrigins();
  }

  function openCreateInspeccionModal() {
    setSelectedInspeccion(null);
    setInspeccionForm({ ...EMPTY_INSPECCION_FORM, empresa_id: scopeEmpresaId, contrato_id: scopeContratoId });
    setInspeccionModalMode("create");
  }

  function openEditInspeccionModal(item: SstInspeccion) {
    setSelectedInspeccion(item);
    setInspeccionForm({
      empresa_id: String(item.empresa.id),
      contrato_id: String(item.contrato.id ?? ""),
      nombre_inspeccion: item.nombre_inspeccion,
      tipo_inspeccion: item.tipo_inspeccion,
      fecha_programada: toInputDate(item.fecha_programada),
      fecha_realizada: toInputDate(item.fecha_realizada),
      responsable: item.responsable ?? "",
      estado: item.estado,
      observacion: item.observacion ?? "",
    });
    setInspeccionModalMode("edit");
  }

  function openCreateHallazgoModal() {
    setSelectedHallazgo(null);
    setHallazgoForm({ ...EMPTY_HALLAZGO_FORM, inspeccion_id: hallazgosQuery.inspeccion_id });
    setHallazgoModalMode("create");
  }

  function openEditHallazgoModal(item: SstHallazgoInspeccion) {
    setSelectedHallazgo(item);
    setHallazgoForm({
      inspeccion_id: String(item.inspeccion.id),
      tipo_hallazgo: item.tipo_hallazgo,
      descripcion: item.descripcion,
      nivel_riesgo: item.nivel_riesgo,
      requiere_accion: item.requiere_accion,
    });
    setHallazgoModalMode("edit");
  }

  const handleHallazgoInspectionChange = useCallback((value: string) => {
    hallazgosInspectionIdRef.current = value;
    hallazgosRequestIdRef.current += 1;
    accionesInspeccionHallazgoIdRef.current = "";
    accionesInspeccionRequestIdRef.current += 1;
    setSelectedHallazgo(null);
    setSelectedAccionInspeccion(null);
    setHallazgosQuery((current) => ({ ...current, page: 1, inspeccion_id: value }));
    setAccionesInsQuery((current) => ({ ...current, page: 1, hallazgo_id: "" }));
    setHallazgosState(
      value
        ? { data: null, error: null, loading: true }
        : { data: emptyPaginated<SstHallazgoInspeccion>(), error: null, loading: false },
    );
    setAccionesInspeccionState({ data: emptyPaginated<SstAccionInspeccion>(), error: null, loading: false });
  }, []);

  const handleSelectHallazgo = useCallback((item: SstHallazgoInspeccion) => {
    const hallazgoId = String(item.id);
    accionesInspeccionHallazgoIdRef.current = hallazgoId;
    accionesInspeccionRequestIdRef.current += 1;
    setSelectedHallazgo(item);
    setSelectedAccionInspeccion(null);
    setAccionesInsQuery((current) => ({ ...current, page: 1, hallazgo_id: hallazgoId }));
    setAccionesInspeccionState({ data: null, error: null, loading: true });
  }, []);

  function openCreateAccionInspeccionModal() {
    setSelectedAccionInspeccion(null);
    setAccionInspeccionForm({
      ...EMPTY_ACCION_INS_FORM,
      hallazgo_id: String(selectedHallazgo?.id ?? currentHallazgoIdForAcciones),
    });
    setAccionInspeccionModalMode("create");
  }

  function openEditAccionInspeccionModal(item: SstAccionInspeccion) {
    setSelectedAccionInspeccion(item);
    setAccionInspeccionForm({
      hallazgo_id: String(item.hallazgo.id),
      descripcion: item.descripcion,
      responsable: item.responsable ?? "",
      fecha_compromiso: toInputDate(item.fecha_compromiso),
      fecha_cierre: toInputDate(item.fecha_cierre),
      estado: item.estado,
    });
    setAccionInspeccionModalMode("edit");
  }

  function openCreateAccidenteModal() {
    setSelectedAccidente(null);
    setSelectedPersona(null);
    setPersonaOptions([]);
    setVinculacionOptions([]);
    setPersonaSearch("");
    setAccidenteForm({ ...EMPTY_ACCIDENT_FORM, empresa_id: scopeEmpresaId, contrato_id: scopeContratoId });
    setAccidenteModalMode("create");
  }

  async function openEditAccidenteModal(item: SstAccidente) {
    setSelectedAccidente(item);
    setAccidenteForm({
      empresa_id: String(item.empresa.id),
      contrato_id: String(item.contrato.id ?? ""),
      persona_id: String(item.persona.id),
      vinculacion_id: String(item.vinculacion?.id ?? ""),
      tipo_evento: item.tipo_evento,
      fecha_evento: toInputDate(item.fecha_evento),
      hora_evento: toInputTime(item.hora_evento),
      lugar_evento: item.lugar_evento ?? "",
      descripcion: item.descripcion,
      lesionado: item.lesionado,
      tipo_lesion: item.tipo_lesion ?? "",
      parte_cuerpo: item.parte_cuerpo ?? "",
      dias_incapacidad: String(item.dias_incapacidad ?? 0),
      requiere_investigacion: item.requiere_investigacion,
      severidad: item.severidad,
      estado: item.estado,
    });
    setSelectedPersona({
      id: item.persona.id,
      nombreCompleto: item.persona.nombre_completo,
      numeroDocumento: item.persona.numero_documento,
      correo: null,
      telefono: null,
    });
    setPersonaSearch(item.persona.nombre_completo);
    setAccidenteModalMode("edit");
    await loadVinculaciones(item.persona.id, String(item.vinculacion?.id ?? ""));
  }

  function openCreateAccionAccidenteModal() {
    setSelectedAccionAccidente(null);
    setAccionAccidenteForm(EMPTY_ACCION_ACCIDENTE_FORM);
    setAccionAccidenteModalMode("create");
  }

  const handleDeactivateAccidente = useCallback(async (item: SstAccidente) => {
    const accidenteId = String(item.id);
    if (isSubmittingAccidente || deactivatingAccidenteIdRef.current === accidenteId) {
      return;
    }

    if (!window.confirm("Se desactivara el accidente seleccionado.")) {
      return;
    }

    try {
      deactivatingAccidenteIdRef.current = accidenteId;
      flushSync(() => setDeactivatingAccidenteId(accidenteId));
      if (accionesAccidenteAccidenteIdRef.current === accidenteId) {
        clearAccidenteSelection();
      }
      await desactivarAccidenteSst(accidenteId);
      await refreshAccidentes();
      await refreshSummary();
      setFeedback({ tone: "success", message: "Accidente desactivado." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      deactivatingAccidenteIdRef.current = null;
      setDeactivatingAccidenteId(null);
    }
  }, [clearAccidenteSelection, isSubmittingAccidente, refreshAccidentes, refreshSummary]);

  const handleDeactivateAccionAccidente = useCallback(async (item: SstAccionAccidente) => {
    const accionId = String(item.id);
    if (isSubmittingAccionAccidente || deactivatingAccionAccidenteIdRef.current === accionId) {
      return;
    }

    if (!window.confirm("Se desactivara la accion relacionada seleccionada.")) {
      return;
    }

    try {
      deactivatingAccionAccidenteIdRef.current = accionId;
      flushSync(() => setDeactivatingAccionAccidenteId(accionId));
      await desactivarAccionAccidenteSst(accionId);
      await refreshAccionesAccidente();
      await refreshSummary();
      setFeedback({ tone: "success", message: "Accion relacionada desactivada." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      deactivatingAccionAccidenteIdRef.current = null;
      setDeactivatingAccionAccidenteId(null);
    }
  }, [isSubmittingAccionAccidente, refreshAccionesAccidente, refreshSummary]);

  function openEditAccionAccidenteModal(item: SstAccionAccidente) {
    setSelectedAccionAccidente(item);
    setAccionAccidenteForm({
      descripcion: item.descripcion,
      responsable: item.responsable ?? "",
      fecha_compromiso: toInputDate(item.fecha_compromiso),
      fecha_cierre: toInputDate(item.fecha_cierre),
      estado: item.estado === "VENCIDA" ? "EN_PROCESO" : item.estado,
    });
    setAccionAccidenteModalMode("edit");
  }
  async function viewEventDetail(item: SstEvento) {
    await runAction(`detail-evento-${item.id}`, async () => {
      const detail = await obtenerEventoSst(String(item.id));
      setSelectedEvent(detail);
    }, "Detalle de evento actualizado.");
  }

  async function viewPlanDetail(item: SstPlanAccion) {
    await runAction(`detail-plan-${item.id}`, async () => {
      const detail = await obtenerPlanSst(String(item.id));
      setSelectedPlan(detail);
    }, "Detalle de plan actualizado.");
  }

  async function submitEventForm() {
    if (!eventForm.vinculacion_id) {
      setFeedback({ tone: "error", message: "Seleccione una vinculacion valida." });
      return;
    }

    const payload = {
      vinculacion_id: eventForm.vinculacion_id,
      tipo_evento: eventForm.tipo_evento,
      fecha_evento: eventForm.fecha_evento,
      hora_evento: eventForm.hora_evento || null,
      lugar: normalizeTextValue(eventForm.lugar),
      descripcion: normalizeTextValue(eventForm.descripcion),
      gravedad: eventForm.gravedad || null,
      requiere_investigacion: eventForm.requiere_investigacion,
      estado: eventForm.estado,
    };

    await runAction(eventModalMode === "create" ? "crear-evento" : `editar-evento-${selectedEvent?.id ?? "x"}` , async () => {
      if (eventModalMode === "create") {
        await crearEventoSst(payload);
      } else if (selectedEvent) {
        await actualizarEventoSst(String(selectedEvent.id), payload);
      }
      setEventModalMode(null);
      await refreshEvents();
      await refreshSummary();
    }, eventModalMode === "create" ? "Evento creado." : "Evento actualizado.");
  }

  async function submitPlanForm() {
    if (!planForm.origen_id) {
      setFeedback({ tone: "error", message: "Seleccione un origen valido." });
      return;
    }

    const payload = {
      origen: planForm.origen,
      origen_id: planForm.origen_id,
      responsable: normalizeTextValue(planForm.responsable),
      descripcion: planForm.descripcion.trim(),
      fecha_compromiso: planForm.fecha_compromiso || null,
      estado: planForm.estado,
    };

    await runAction(planModalMode === "create" ? "crear-plan" : `editar-plan-${selectedPlan?.id ?? "x"}`, async () => {
      if (planModalMode === "create") {
        await crearPlanSst(payload);
      } else if (selectedPlan) {
        await actualizarPlanSst(String(selectedPlan.id), payload);
      }
      setPlanModalMode(null);
      await refreshPlans();
      await refreshSummary();
    }, planModalMode === "create" ? "Plan creado." : "Plan actualizado.");
  }

  async function submitInspeccionForm() {
    if (!inspeccionForm.empresa_id || !inspeccionForm.nombre_inspeccion.trim()) {
      setFeedback({ tone: "error", message: "Empresa y nombre de inspeccion son obligatorios." });
      return;
    }

    const payload = {
      empresa_id: inspeccionForm.empresa_id,
      contrato_id: inspeccionForm.contrato_id || null,
      nombre_inspeccion: inspeccionForm.nombre_inspeccion.trim(),
      tipo_inspeccion: inspeccionForm.tipo_inspeccion,
      fecha_programada: inspeccionForm.fecha_programada || null,
      fecha_realizada: inspeccionForm.fecha_realizada || null,
      responsable: normalizeTextValue(inspeccionForm.responsable),
      estado: inspeccionForm.estado,
      observacion: normalizeTextValue(inspeccionForm.observacion),
    };

    await runAction(inspeccionModalMode === "create" ? "crear-inspeccion" : `editar-inspeccion-${selectedInspeccion?.id ?? "x"}`, async () => {
      if (inspeccionModalMode === "create") {
        await crearInspeccionSst(payload);
      } else if (selectedInspeccion) {
        await actualizarInspeccionSst(String(selectedInspeccion.id), payload);
      }
      setInspeccionModalMode(null);
      await refreshInspecciones();
      await refreshSummary();
    }, inspeccionModalMode === "create" ? "Inspeccion creada." : "Inspeccion actualizada.");
  }

  async function submitHallazgoForm() {
    if (!hallazgoForm.inspeccion_id || !hallazgoForm.descripcion.trim()) {
      setFeedback({ tone: "error", message: "Inspeccion y descripcion son obligatorias." });
      return;
    }

    if (hallazgoModalMode === "create" && creatingHallazgo) {
      return;
    }

    if (hallazgoModalMode === "edit" && updatingHallazgo) {
      return;
    }

    const payload = {
      inspeccion_id: hallazgoForm.inspeccion_id,
      tipo_hallazgo: hallazgoForm.tipo_hallazgo,
      descripcion: hallazgoForm.descripcion.trim(),
      nivel_riesgo: hallazgoForm.nivel_riesgo,
      requiere_accion: hallazgoForm.requiere_accion,
    };

    const isCreate = hallazgoModalMode === "create";
    if (!isCreate && !selectedHallazgo) {
      return;
    }

    if (hallazgoSubmitLockRef.current) {
      return;
    }

    const shouldRefreshAcciones = !isCreate && currentHallazgoIdForAcciones === String(selectedHallazgo?.id ?? "");
    hallazgoSubmitLockRef.current = true;

    try {
      if (isCreate) {
        flushSync(() => setCreatingHallazgo(true));
        await crearHallazgoInspeccionSst(payload);
      } else if (selectedHallazgo) {
        flushSync(() => setUpdatingHallazgo(true));
        await actualizarHallazgoInspeccionSst(String(selectedHallazgo.id), payload);
      }

      setHallazgoModalMode(null);
      await refreshHallazgos();
      if (shouldRefreshAcciones) {
        await refreshAccionesInspeccion();
      }
      await refreshSummary();
      setFeedback({ tone: "success", message: isCreate ? "Hallazgo creado." : "Hallazgo actualizado." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      hallazgoSubmitLockRef.current = false;
      setCreatingHallazgo(false);
      setUpdatingHallazgo(false);
    }
  }

  const handleDeactivateHallazgo = useCallback(async (item: SstHallazgoInspeccion) => {
    const hallazgoId = String(item.id);
    if (deactivatingHallazgoIdRef.current === hallazgoId) {
      return;
    }

    if (!window.confirm("Se desactivara el hallazgo seleccionado.")) {
      return;
    }

    try {
      deactivatingHallazgoIdRef.current = hallazgoId;
      flushSync(() => setDeactivatingHallazgoId(hallazgoId));
      await desactivarHallazgoInspeccionSst(hallazgoId);
      if (currentHallazgoIdForAcciones === hallazgoId) {
        accionesInspeccionHallazgoIdRef.current = "";
        accionesInspeccionRequestIdRef.current += 1;
        setSelectedHallazgo(null);
        setSelectedAccionInspeccion(null);
        setAccionesInsQuery((current) => ({ ...current, page: 1, hallazgo_id: "" }));
        setAccionesInspeccionState({ data: emptyPaginated<SstAccionInspeccion>(), error: null, loading: false });
      }
      await refreshHallazgos();
      await refreshSummary();
      setFeedback({ tone: "success", message: "Hallazgo desactivado." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      deactivatingHallazgoIdRef.current = null;
      setDeactivatingHallazgoId(null);
    }
  }, [currentHallazgoIdForAcciones, refreshHallazgos, refreshSummary]);

  async function submitAccionInspeccionForm() {
    if (!accionInspeccionForm.hallazgo_id || !accionInspeccionForm.descripcion.trim()) {
      setFeedback({ tone: "error", message: "Hallazgo y descripcion son obligatorios." });
      return;
    }

    if (accionInspeccionModalMode === "create" && creatingAccionInspeccion) {
      return;
    }

    if (accionInspeccionModalMode === "edit" && updatingAccionInspeccion) {
      return;
    }

    const payload = {
      hallazgo_id: accionInspeccionForm.hallazgo_id,
      descripcion: accionInspeccionForm.descripcion.trim(),
      responsable: normalizeTextValue(accionInspeccionForm.responsable),
      fecha_compromiso: accionInspeccionForm.fecha_compromiso || null,
      fecha_cierre: accionInspeccionForm.fecha_cierre || null,
      estado: accionInspeccionForm.estado,
    };

    const isCreate = accionInspeccionModalMode === "create";
    if (!isCreate && !selectedAccionInspeccion) {
      return;
    }

    if (accionInspeccionSubmitLockRef.current) {
      return;
    }

    accionInspeccionSubmitLockRef.current = true;

    try {
      if (isCreate) {
        flushSync(() => setCreatingAccionInspeccion(true));
        await crearAccionInspeccionSst(payload);
      } else if (selectedAccionInspeccion) {
        flushSync(() => setUpdatingAccionInspeccion(true));
        await actualizarAccionInspeccionSst(String(selectedAccionInspeccion.id), payload);
      }

      setAccionInspeccionModalMode(null);
      await refreshAccionesInspeccion();
      await refreshSummary();
      setFeedback({ tone: "success", message: isCreate ? "Accion creada." : "Accion actualizada." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      accionInspeccionSubmitLockRef.current = false;
      setCreatingAccionInspeccion(false);
      setUpdatingAccionInspeccion(false);
    }
  }

  const handleCerrarAccionInspeccion = useCallback(async (item: SstAccionInspeccion) => {
    const accionId = String(item.id);
    if (closingAccionInspeccionIdRef.current === accionId) {
      return;
    }

    const fecha = window.prompt("Fecha de cierre (YYYY-MM-DD)", todayIso());
    if (!fecha) {
      return;
    }

    try {
      closingAccionInspeccionIdRef.current = accionId;
      flushSync(() => setClosingAccionInspeccionId(accionId));
      await cerrarAccionInspeccionSst(accionId, { fecha_cierre: fecha });
      await refreshAccionesInspeccion();
      await refreshSummary();
      setFeedback({ tone: "success", message: "Accion cerrada." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      closingAccionInspeccionIdRef.current = null;
      setClosingAccionInspeccionId(null);
    }
  }, [refreshAccionesInspeccion, refreshSummary]);

  const handleDeactivateAccionInspeccion = useCallback(async (item: SstAccionInspeccion) => {
    const accionId = String(item.id);
    if (deactivatingAccionInspeccionIdRef.current === accionId) {
      return;
    }

    if (!window.confirm("Se desactivara la accion seleccionada.")) {
      return;
    }

    try {
      deactivatingAccionInspeccionIdRef.current = accionId;
      flushSync(() => setDeactivatingAccionInspeccionId(accionId));
      await desactivarAccionInspeccionSst(accionId);
      await refreshAccionesInspeccion();
      await refreshSummary();
      setFeedback({ tone: "success", message: "Accion desactivada." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      deactivatingAccionInspeccionIdRef.current = null;
      setDeactivatingAccionInspeccionId(null);
    }
  }, [refreshAccionesInspeccion, refreshSummary]);

  async function submitAccidenteForm() {
    if (accidenteSubmitLockRef.current) {
      return;
    }

    if (!accidenteForm.empresa_id || !accidenteForm.persona_id || !accidenteForm.descripcion.trim()) {
      setFeedback({ tone: "error", message: "Empresa, persona y descripcion son obligatorias." });
      return;
    }

    const payload = {
      empresa_id: accidenteForm.empresa_id,
      contrato_id: accidenteForm.contrato_id || null,
      persona_id: accidenteForm.persona_id,
      vinculacion_id: accidenteForm.vinculacion_id || null,
      tipo_evento: accidenteForm.tipo_evento,
      fecha_evento: accidenteForm.fecha_evento,
      hora_evento: accidenteForm.hora_evento || null,
      lugar_evento: normalizeTextValue(accidenteForm.lugar_evento),
      descripcion: accidenteForm.descripcion.trim(),
      lesionado: accidenteForm.lesionado,
      tipo_lesion: normalizeTextValue(accidenteForm.tipo_lesion),
      parte_cuerpo: normalizeTextValue(accidenteForm.parte_cuerpo),
      dias_incapacidad: accidenteForm.dias_incapacidad === "" ? null : Number(accidenteForm.dias_incapacidad),
      requiere_investigacion: accidenteForm.requiere_investigacion,
      severidad: accidenteForm.severidad,
      estado: accidenteForm.estado,
    };
    const isCreate = accidenteModalMode === "create";

    accidenteSubmitLockRef.current = true;
    if (isCreate) {
      setCreatingAccidente(true);
    } else {
      setUpdatingAccidente(true);
    }

    try {
      const saved = isCreate
        ? await crearAccidenteSst(payload)
        : selectedAccidente
          ? await actualizarAccidenteSst(String(selectedAccidente.id), payload)
          : null;

      setAccidenteModalMode(null);

      if (saved) {
        const nextQuery = buildAccidentesQueryForVisibility(saved, accidentesQuery);
        const adjustedFilters = nextQuery.tipo_evento !== accidentesQuery.tipo_evento || nextQuery.severidad !== accidentesQuery.severidad || nextQuery.estado !== accidentesQuery.estado;
        const scopeMatches = accidenteMatchesVisibleScope(saved);

        if (scopeMatches) {
          pendingAccidenteSelectionIdRef.current = String(saved.id);
          if (accidentesQueryChanged(accidentesQuery, nextQuery)) {
            setAccidentesQuery(nextQuery);
          }
          accidentesViewRequestKeyRef.current = buildAccidentesViewRequestKey(nextQuery);
          await refreshAccidentes(nextQuery);
          void refreshAccidenteDashboard();
          void refreshAccidenteAlertas();
        } else if (!isCreate) {
          clearAccidenteSelection();
        }

        await refreshSummary();
        setFeedback({
          tone: "success",
          message: !scopeMatches
            ? isCreate
              ? "Accidente creado, pero no coincide con el alcance actual."
              : "Accidente actualizado, pero no coincide con el alcance actual."
            : adjustedFilters
              ? isCreate
                ? "Accidente creado. Se ajustaron los filtros para mostrarlo."
                : "Accidente actualizado. Se ajustaron los filtros para mostrarlo."
              : isCreate
                ? "Accidente creado."
                : "Accidente actualizado.",
        });
      } else {
        await refreshAccidentes();
        await refreshSummary();
        setFeedback({ tone: "success", message: isCreate ? "Accidente creado." : "Accidente actualizado." });
      }
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      accidenteSubmitLockRef.current = false;
      setCreatingAccidente(false);
      setUpdatingAccidente(false);
    }
  }

  async function submitAccionAccidenteForm() {
    if (accionAccidenteSubmitLockRef.current) {
      return;
    }

    if (!selectedAccidente || !accionAccidenteForm.descripcion.trim()) {
      setFeedback({ tone: "error", message: "Seleccione un accidente y complete la descripcion." });
      return;
    }

    const payload = {
      descripcion: accionAccidenteForm.descripcion.trim(),
      responsable: normalizeTextValue(accionAccidenteForm.responsable),
      fecha_compromiso: accionAccidenteForm.fecha_compromiso || null,
      fecha_cierre: accionAccidenteForm.fecha_cierre || null,
      estado: accionAccidenteForm.estado,
    };
    const isCreate = accionAccidenteModalMode === "create";

    accionAccidenteSubmitLockRef.current = true;
    if (isCreate) {
      setCreatingAccionAccidente(true);
    } else {
      setUpdatingAccionAccidente(true);
    }

    try {
      if (isCreate) {
        await crearAccionAccidenteSst(String(selectedAccidente.id), payload);
      } else if (selectedAccionAccidente) {
        await actualizarAccionAccidenteSst(String(selectedAccionAccidente.id), payload);
      }
      setAccionAccidenteModalMode(null);
      await refreshAccionesAccidente();
      await refreshSummary();
      setFeedback({ tone: "success", message: isCreate ? "Accion relacionada creada." : "Accion relacionada actualizada." });
    } catch (error) {
      setFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      accionAccidenteSubmitLockRef.current = false;
      setCreatingAccionAccidente(false);
      setUpdatingAccionAccidente(false);
    }
  }

  const summaryItems = summaryState.data
    ? [
        { label: "Eventos activos", value: formatNumber(summaryState.data.eventosActivos), tone: "info" as const, icon: TriangleAlert, caption: "Eventos vigentes" },
        { label: "Planes abiertos", value: formatNumber(summaryState.data.planesAbiertos), tone: "warning" as const, icon: ClipboardList, caption: `${formatNumber(summaryState.data.planesVencidos)} vencidos` },
        { label: "Inspecciones", value: formatNumber(summaryState.data.inspecciones), tone: "primary" as const, icon: HardHat, caption: `${formatNumber(summaryState.data.hallazgosPendientes)} hallazgos pendientes` },
        { label: "Acciones pendientes", value: formatNumber(summaryState.data.accionesPendientes), tone: "danger" as const, icon: ShieldAlert, caption: "Inspecciones y accidentes" },
        { label: "Accidentes", value: formatNumber(summaryState.data.accidentes), tone: "neutral" as const, icon: Siren, caption: "Casos registrados" },
        { label: "Alertas indicadores", value: formatNumber(summaryState.data.alertasIndicadores), tone: "danger" as const, icon: FileBarChart2, caption: "Alertas activas" },
      ]
    : [];

  const accidenteDashboardHasData = Boolean(
    accidenteDashboardState.data &&
      Object.values(accidenteDashboardState.data).some((value) => typeof value === "number" && value > 0),
  );

  const currentOriginOptions = useMemo(() => {
    switch (planForm.origen) {
      case "EVENTO":
        return planOriginCatalogs.EVENTO.map((item) => ({ value: String(item.id), label: buildEventoSummary(item) }));
      case "INSPECCION":
        return planOriginCatalogs.INSPECCION.map((item) => ({ value: String(item.id), label: buildInspeccionSummary(item) }));
      case "HALLAZGO":
        return planOriginCatalogs.HALLAZGO.map((item) => ({ value: String(item.id), label: buildHallazgoSummary(item) }));
      case "ACCIDENTE":
        return planOriginCatalogs.ACCIDENTE.map((item) => ({ value: String(item.id), label: buildAccidenteSummary(item) }));
      default:
        return [];
    }
  }, [planForm.origen, planOriginCatalogs]);

  const currentVinculacion = vinculacionOptions.find((item) => String(item.vinculacion.id) === eventForm.vinculacion_id || String(item.vinculacion.id) === accidenteForm.vinculacion_id) ?? null;
  const hallazgoOptions = hallazgosState.data?.items ?? [];
  const inspeccionLookup = inspeccionLookupState.data ?? [];

  const pageTitle = "Seguridad y salud en el trabajo";
  const pageSubtitle = "Conexion directa al backend real para eventos, planes, inspecciones, hallazgos, accidentes e indicadores.";

  return (
    <div className="sst-page">
      <SstPageHeader icon={HardHat} title={pageTitle} subtitle={pageSubtitle} />

      <div className="sst-scope-bar sst-card">
        <FormField label="Empresa activa">
          <div className="sst-readonly">
            {empresaActiva?.nombre_empresa ?? "Sin empresa activa"}
          </div>
        </FormField>
        <FormField label="Contrato">
          <select className="sst-select" value={scopeContratoId} onChange={(event) => setScopeContratoId(event.target.value)}>
            <option value="">Todos</option>
            {contratosFiltrados.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {buildContratoLabel(item)}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="sst-tabs" role="tablist" aria-label="Tabs SST">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" className={`sst-tab${activeTab === tab.id ? " active" : ""}`} onClick={() => setTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {feedback ? <div className={`sst-feedback ${feedback.tone}`}>{feedback.message}</div> : null}
      {activeTab === "resumen" ? (
        summaryState.loading ? (
          <StateCard title="Cargando resumen" message="Consultando KPIs reales de SST." />
        ) : summaryState.error ? (
          <StateCard title="No fue posible cargar el resumen" message={summaryState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshSummary()} />
        ) : (
          <>
            <SstKpis items={summaryItems} />
            <InlineNotice title="Alcance" tone="info">
              Este resumen usa dashboard de inspecciones, dashboard de accidentes, alertas de indicadores y listados reales. No se calculan metas ni porcentajes inventados.
            </InlineNotice>
          </>
        )
      ) : null}

      {activeTab === "eventos" ? (
        !canReadEvents ? (
          <StateCard title="Sin permiso" message="No cuenta con permisos para consultar eventos SST." />
        ) : (
          <>
            <div className="sst-toolbar">
              <div className="sst-toolbar-row">
                <div className="sst-search">
                  <RefreshCw size={16} />
                  <input value={eventsQuery.search} onChange={(event) => { setEventsQuery((current) => ({ ...current, page: 1, search: event.target.value })); setSelectedEvent(null); }} placeholder="Buscar por texto" />
                </div>
                {canWriteEvents ? <button type="button" className="sst-button primary" onClick={openCreateEventModal}><Plus size={16} />Nuevo evento</button> : null}
              </div>
              <div className="sst-filters">
                <select className="sst-select" value={eventsQuery.tipo_evento} onChange={(event) => setEventsQuery((current) => ({ ...current, page: 1, tipo_evento: event.target.value as AccidentesQueryState["tipo_evento"] }))}>
                  <option value="">Todos los tipos</option>
                  {EVENT_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                </select>
                <select className="sst-select" value={eventsQuery.gravedad} onChange={(event) => setEventsQuery((current) => ({ ...current, page: 1, gravedad: event.target.value }))}>
                  <option value="">Todas las gravedades</option>
                  {EVENT_GRAVEDADES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                </select>
                <select className="sst-select" value={eventsQuery.estado} onChange={(event) => setEventsQuery((current) => ({ ...current, page: 1, estado: event.target.value as AccidentesQueryState["estado"] }))}>
                  <option value="">Todos los estados</option>
                  {EVENT_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
                </select>
              </div>
            </div>

            {eventsState.loading ? <StateCard title="Cargando eventos" message="Obteniendo datos reales del backend." /> : null}
            {eventsState.error ? <StateCard title="No fue posible cargar eventos" message={eventsState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshEvents()} /> : null}
            {!eventsState.loading && !eventsState.error ? (
              eventsState.data?.items.length ? (
                <>
                  <SstTable columns={["Tipo", "Fecha", "Vinculacion", "Gravedad", "Estado", "Acciones"]} gridTemplateColumns="180px 130px 1.3fr 140px 140px 120px" minWidth={980}>
                    {eventsState.data.items.map((item) => (
                      <div className="sst-table-row" key={item.id}>
                        <strong>{titleCase(item.tipo_evento)}</strong>
                        <span>{formatDate(item.fecha_evento)}</span>
                        <span>{item.vinculacion ? `#${item.vinculacion.id}` : "Sin vinculacion"}</span>
                        <span>{item.gravedad ? titleCase(item.gravedad) : "No aplica"}</span>
                        <SstBadge tone={eventBadgeTone(item.estado)}>{titleCase(item.estado)}</SstBadge>
                        <div className="sst-row-actions">
                          <button type="button" onClick={() => void viewEventDetail(item)}><Eye size={16} /></button>
                          {canWriteEvents ? <button type="button" onClick={() => void openEditEventModal(item)}><Pencil size={16} /></button> : null}
                          {canWriteEvents ? <button type="button" onClick={() => { if (window.confirm("Se desactivara el evento seleccionado.")) { void runAction(`desactivar-evento-${item.id}`, async () => { await desactivarEventoSst(String(item.id)); await refreshEvents(); await refreshSummary(); }, "Evento desactivado."); } }}><Ban size={16} /></button> : null}
                        </div>
                      </div>
                    ))}
                  </SstTable>
                  <Paginator page={eventsState.data.pagination.page} totalPages={eventsState.data.pagination.total_pages} total={eventsState.data.pagination.total} onChange={(page) => setEventsQuery((current) => ({ ...current, page }))} />
                </>
              ) : (
                <StateCard title="Sin eventos" message="No hay eventos activos para los filtros seleccionados." />
              )
            ) : null}
            {selectedEvent ? <div className="sst-detail-card sst-card"><h3>Detalle del evento</h3><div className="sst-mini-row"><strong>Tipo:</strong><span>{titleCase(selectedEvent.tipo_evento)}</span></div><div className="sst-mini-row"><strong>Fecha:</strong><span>{formatDate(selectedEvent.fecha_evento)} {selectedEvent.hora_evento ?? ""}</span></div><div className="sst-mini-row"><strong>Lugar:</strong><span>{selectedEvent.lugar ?? "No disponible"}</span></div><div className="sst-mini-row"><strong>Descripcion:</strong><span>{selectedEvent.descripcion ?? "No disponible"}</span></div><div className="sst-mini-row"><strong>Requiere investigacion:</strong><span>{selectedEvent.requiere_investigacion ? "Si" : "No"}</span></div></div> : null}
          </>
        )
      ) : null}

      {activeTab === "planes" ? (
        !canReadPlans ? (
          <StateCard title="Sin permiso" message="No cuenta con permisos para consultar planes de accion." />
        ) : (
          <>
            <div className="sst-toolbar">
              <div className="sst-toolbar-row">
                <div className="sst-search">
                  <RefreshCw size={16} />
                  <input value={plansQuery.search} onChange={(event) => { setPlansQuery((current) => ({ ...current, page: 1, search: event.target.value })); setSelectedPlan(null); }} placeholder="Buscar por descripcion o responsable" />
                </div>
                {canWritePlans ? <button type="button" className="sst-button primary" onClick={openCreatePlanModal}><Plus size={16} />Nuevo plan</button> : null}
              </div>
              <div className="sst-filters">
                <select className="sst-select" value={plansQuery.origen} onChange={(event) => setPlansQuery((current) => ({ ...current, page: 1, origen: event.target.value }))}><option value="">Todos los origenes</option>{PLAN_ORIGINS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select>
                <select className="sst-select" value={plansQuery.estado} onChange={(event) => setPlansQuery((current) => ({ ...current, page: 1, estado: event.target.value as AccidentesQueryState["estado"] }))}><option value="">Todos los estados</option>{PLAN_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select>
              </div>
            </div>
            {plansState.loading ? <StateCard title="Cargando planes" message="Leyendo planes de accion reales." /> : null}
            {plansState.error ? <StateCard title="No fue posible cargar planes" message={plansState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshPlans()} /> : null}
            {!plansState.loading && !plansState.error ? (
              plansState.data?.items.length ? (
                <>
                  <SstTable columns={["Origen", "Descripcion", "Responsable", "Compromiso", "Estado", "Acciones"]} gridTemplateColumns="140px 1.5fr 180px 130px 130px 160px" minWidth={1020}>
                    {plansState.data.items.map((item) => (
                      <div className="sst-table-row" key={item.id}>
                        <strong>{titleCase(item.origen)}</strong>
                        <span>{item.descripcion}</span>
                        <span>{item.responsable ?? "No asignado"}</span>
                        <span>{formatDate(item.fecha_compromiso)}</span>
                        <SstBadge tone={eventBadgeTone(item.estado)}>{titleCase(item.estado)}</SstBadge>
                        <div className="sst-row-actions">
                          <button type="button" onClick={() => void viewPlanDetail(item)}><Eye size={16} /></button>
                          {canWritePlans ? <button type="button" onClick={() => openEditPlanModal(item)}><Pencil size={16} /></button> : null}
                          {canWritePlans && item.estado !== "CERRADO" ? <button type="button" onClick={() => { const fecha = window.prompt("Fecha de cierre (YYYY-MM-DD)", todayIso()); if (fecha) { void runAction(`cerrar-plan-${item.id}`, async () => { await cerrarPlanSst(String(item.id), { fecha_cierre: fecha }); await refreshPlans(); await refreshSummary(); }, "Plan cerrado."); } }}><ClipboardList size={16} /></button> : null}
                          {canWritePlans ? <button type="button" onClick={() => { if (window.confirm("Se desactivara el plan seleccionado.")) { void runAction(`desactivar-plan-${item.id}`, async () => { await desactivarPlanSst(String(item.id)); await refreshPlans(); await refreshSummary(); }, "Plan desactivado."); } }}><Ban size={16} /></button> : null}
                        </div>
                      </div>
                    ))}
                  </SstTable>
                  <Paginator page={plansState.data.pagination.page} totalPages={plansState.data.pagination.total_pages} total={plansState.data.pagination.total} onChange={(page) => setPlansQuery((current) => ({ ...current, page }))} />
                </>
              ) : <StateCard title="Sin planes" message="No hay planes activos para el alcance actual." />
            ) : null}
            {selectedPlan ? <div className="sst-detail-card sst-card"><h3>Detalle del plan</h3><div className="sst-mini-row"><strong>Origen:</strong><span>{titleCase(selectedPlan.origen)} #{selectedPlan.origen_id}</span></div><div className="sst-mini-row"><strong>Responsable:</strong><span>{selectedPlan.responsable ?? "No asignado"}</span></div><div className="sst-mini-row"><strong>Descripcion:</strong><span>{selectedPlan.descripcion}</span></div><div className="sst-mini-row"><strong>Fecha cierre:</strong><span>{formatDate(selectedPlan.fecha_cierre)}</span></div></div> : null}
          </>
        )
      ) : null}

      {activeTab === "inspecciones" ? (
        !canReadInspecciones ? <StateCard title="Sin permiso" message="No cuenta con permisos para consultar inspecciones SST." /> : (
          <>
            <div className="sst-toolbar">
              <div className="sst-toolbar-row"><div className="sst-search"><RefreshCw size={16} /><input value={inspeccionesQuery.search} onChange={(event) => { setInspeccionesQuery((current) => ({ ...current, page: 1, search: event.target.value })); setSelectedInspeccion(null); }} placeholder="Buscar por nombre o responsable" /></div>{canWriteInspecciones ? <button type="button" className="sst-button primary" onClick={openCreateInspeccionModal}><Plus size={16} />Nueva inspeccion</button> : null}</div>
              <div className="sst-filters"><select className="sst-select" value={inspeccionesQuery.tipo_inspeccion} onChange={(event) => setInspeccionesQuery((current) => ({ ...current, page: 1, tipo_inspeccion: event.target.value }))}><option value="">Todos los tipos</option>{INSPECCION_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><select className="sst-select" value={inspeccionesQuery.estado} onChange={(event) => setInspeccionesQuery((current) => ({ ...current, page: 1, estado: event.target.value as AccidentesQueryState["estado"] }))}><option value="">Todos los estados</option>{INSPECCION_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div>
            </div>
            {inspeccionDashboardState.data ? <SstKpis items={[{ label: "Inspecciones", value: formatNumber(inspeccionDashboardState.data.inspecciones_total), tone: "primary", icon: HardHat }, { label: "Hallazgos criticos", value: formatNumber(inspeccionDashboardState.data.hallazgos_criticos), tone: "danger", icon: AlertTriangle }, { label: "Acciones abiertas", value: formatNumber(inspeccionDashboardState.data.acciones_abiertas), tone: "warning", icon: ClipboardList }, { label: "Cumplimiento", value: formatPercent(inspeccionDashboardState.data.cumplimiento_acciones_porcentaje), tone: "success", icon: ShieldAlert }]} /> : null}
            {inspeccionesState.loading ? <StateCard title="Cargando inspecciones" message="Leyendo inspecciones reales del backend." /> : null}
            {inspeccionesState.error ? <StateCard title="No fue posible cargar inspecciones" message={inspeccionesState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshInspecciones()} /> : null}
            {!inspeccionesState.loading && !inspeccionesState.error ? (inspeccionesState.data?.items.length ? <><SstTable columns={["Nombre", "Tipo", "Programada", "Responsable", "Estado", "Acciones"]} gridTemplateColumns="1.2fr 170px 130px 170px 130px 120px" minWidth={980}>{inspeccionesState.data.items.map((item) => <div className="sst-table-row" key={item.id}><strong>{item.nombre_inspeccion}</strong><span>{titleCase(item.tipo_inspeccion)}</span><span>{formatDate(item.fecha_programada)}</span><span>{item.responsable ?? "No asignado"}</span><SstBadge tone={eventBadgeTone(item.estado)}>{titleCase(item.estado)}</SstBadge><div className="sst-row-actions"><button type="button" onClick={() => setSelectedInspeccion(item)}><Eye size={16} /></button>{canWriteInspecciones ? <button type="button" onClick={() => openEditInspeccionModal(item)}><Pencil size={16} /></button> : null}{canWriteInspecciones ? <button type="button" onClick={() => { if (window.confirm("Se desactivara la inspeccion seleccionada.")) { void runAction(`desactivar-inspeccion-${item.id}`, async () => { await desactivarInspeccionSst(String(item.id)); await refreshInspecciones(); await refreshSummary(); }, "Inspeccion desactivada."); } }}><Ban size={16} /></button> : null}</div></div>)}</SstTable><Paginator page={inspeccionesState.data.pagination.page} totalPages={inspeccionesState.data.pagination.total_pages} total={inspeccionesState.data.pagination.total} onChange={(page) => setInspeccionesQuery((current) => ({ ...current, page }))} /></> : <StateCard title="Sin inspecciones" message="No hay inspecciones activas con los filtros actuales." />) : null}
            {selectedInspeccion ? <div className="sst-detail-card sst-card"><h3>Detalle de inspeccion</h3><div className="sst-mini-row"><strong>Nombre:</strong><span>{selectedInspeccion.nombre_inspeccion}</span></div><div className="sst-mini-row"><strong>Observacion:</strong><span>{selectedInspeccion.observacion ?? "No disponible"}</span></div><div className="sst-mini-row"><strong>Realizada:</strong><span>{formatDate(selectedInspeccion.fecha_realizada)}</span></div></div> : null}
            {inspeccionAlertasState.data?.items.length ? <div className="sst-card"><h3>Alertas de inspecciones</h3>{inspeccionAlertasState.data.items.map((item) => <div key={item.id} className="sst-mini-row"><strong>{item.titulo}</strong><span>{item.descripcion}</span></div>)}</div> : null}
          </>
        )
      ) : null}

      {activeTab === "hallazgos" ? (!canReadInspecciones ? <StateCard title="Sin permiso" message="No cuenta con permisos para consultar hallazgos y acciones." /> : <>
        <div className="sst-toolbar"><div className="sst-toolbar-row"><select className="sst-select" value={hallazgosQuery.inspeccion_id} onChange={(event) => handleHallazgoInspectionChange(event.target.value)}>{<option value="">Seleccione una inspeccion</option>}{inspeccionLookup.map((item) => <option key={item.id} value={String(item.id)}>{buildInspeccionSummary(item)}</option>)}</select>{canWriteInspecciones ? <button type="button" className="sst-button primary" onClick={openCreateHallazgoModal} disabled={!hallazgosQuery.inspeccion_id || isSubmittingHallazgo}><Plus size={16} />{creatingHallazgo ? "Creando..." : "Nuevo hallazgo"}</button> : null}{canWriteInspecciones ? <button type="button" className="sst-button" onClick={openCreateAccionInspeccionModal} disabled={!currentHallazgoIdForAcciones || isSubmittingAccionInspeccion}><Plus size={16} />{creatingAccionInspeccion ? "Creando..." : "Nueva accion"}</button> : null}</div><div className="sst-filters"><select className="sst-select" value={hallazgosQuery.tipo_hallazgo} onChange={(event) => setHallazgosQuery((current) => ({ ...current, page: 1, tipo_hallazgo: event.target.value }))}><option value="">Todos los hallazgos</option>{HALLAZGO_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><select className="sst-select" value={hallazgosQuery.nivel_riesgo} onChange={(event) => setHallazgosQuery((current) => ({ ...current, page: 1, nivel_riesgo: event.target.value }))}><option value="">Todos los riesgos</option>{HALLAZGO_NIVELES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><select className="sst-select" value={accionesInsQuery.estado} onChange={(event) => setAccionesInsQuery((current) => ({ ...current, page: 1, estado: event.target.value as AccidentesQueryState["estado"] }))}><option value="">Todas las acciones</option>{ACCION_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div></div>
        {!hallazgosQuery.inspeccion_id ? <StateCard title="Seleccione una inspeccion" message="El backend lista hallazgos por inspeccion, por eso este tab requiere elegir una inspeccion real." /> : null}
        {hallazgosQuery.inspeccion_id && hallazgosState.loading ? <StateCard title="Cargando hallazgos" message="Leyendo hallazgos reales de la inspeccion seleccionada." /> : null}
        {hallazgosQuery.inspeccion_id && hallazgosState.error ? <StateCard title="No fue posible cargar hallazgos" message={hallazgosState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshHallazgos()} /> : null}
        {hallazgosQuery.inspeccion_id && !hallazgosState.loading && !hallazgosState.error ? (hallazgosState.data?.items.length ? <><SstTable columns={["Tipo", "Descripcion", "Riesgo", "Accion", "Acciones"]} gridTemplateColumns="180px 1.5fr 140px 130px 120px" minWidth={900}>{hallazgosState.data.items.map((item) => <div className="sst-table-row" key={item.id}><strong>{titleCase(item.tipo_hallazgo)}</strong><span>{item.descripcion}</span><SstBadge tone={eventBadgeTone(item.nivel_riesgo)}>{titleCase(item.nivel_riesgo)}</SstBadge><span>{item.requiere_accion ? "Requerida" : "No"}</span><div className="sst-row-actions"><button type="button" onClick={() => handleSelectHallazgo(item)}><Eye size={16} /></button>{canWriteInspecciones ? <button type="button" onClick={() => openEditHallazgoModal(item)} disabled={isSubmittingHallazgo || deactivatingHallazgoId === String(item.id)}><Pencil size={16} /></button> : null}{canWriteInspecciones ? <button type="button" onClick={() => void handleDeactivateHallazgo(item)} disabled={deactivatingHallazgoId === String(item.id) || isSubmittingHallazgo}>{deactivatingHallazgoId === String(item.id) ? "..." : <Ban size={16} />}</button> : null}</div></div>)}</SstTable><Paginator page={hallazgosState.data.pagination.page} totalPages={hallazgosState.data.pagination.total_pages} total={hallazgosState.data.pagination.total} onChange={(page) => setHallazgosQuery((current) => ({ ...current, page }))} /></> : <StateCard title="Sin hallazgos" message="No hay hallazgos activos para la inspeccion seleccionada." />) : null}
        {selectedHallazgo ? <div className="sst-detail-card sst-card"><h3>Hallazgo seleccionado</h3><div className="sst-mini-row"><strong>Descripcion:</strong><span>{selectedHallazgo.descripcion}</span></div><div className="sst-mini-row"><strong>Inspeccion:</strong><span>{selectedHallazgo.inspeccion.nombre_inspeccion}</span></div></div> : null}
        {hallazgosQuery.inspeccion_id && !currentHallazgoIdForAcciones && !hallazgosState.loading && !hallazgosState.error ? <StateCard title="Seleccione un hallazgo" message="Las acciones de inspeccion solo se cargan cuando existe un hallazgo seleccionado." /> : null}
        {currentHallazgoIdForAcciones && accionesInspeccionState.loading ? <StateCard title="Cargando acciones de inspeccion" message="Leyendo acciones reales del hallazgo seleccionado." /> : null}
        {currentHallazgoIdForAcciones && accionesInspeccionState.error ? <StateCard title="No fue posible cargar acciones de inspeccion" message={accionesInspeccionState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshAccionesInspeccion()} /> : null}
        {currentHallazgoIdForAcciones && !accionesInspeccionState.loading && !accionesInspeccionState.error ? (accionesInspeccionState.data?.items.length ? <div className="sst-card"><h3>Acciones de inspeccion</h3><SstTable columns={["Hallazgo", "Descripcion", "Responsable", "Compromiso", "Estado", "Acciones"]} gridTemplateColumns="180px 1.4fr 180px 130px 130px 140px" minWidth={980}>{accionesInspeccionState.data.items.map((item) => <div className="sst-table-row" key={item.id}><strong>{titleCase(item.hallazgo.tipo_hallazgo)}</strong><span>{item.descripcion}</span><span>{item.responsable ?? "No asignado"}</span><span>{formatDate(item.fecha_compromiso)}</span><SstBadge tone={eventBadgeTone(item.estado)}>{titleCase(item.estado)}</SstBadge><div className="sst-row-actions">{canWriteInspecciones ? <button type="button" onClick={() => openEditAccionInspeccionModal(item)} disabled={isSubmittingAccionInspeccion || closingAccionInspeccionId === String(item.id) || deactivatingAccionInspeccionId === String(item.id)}><Pencil size={16} /></button> : null}{canWriteInspecciones && item.estado !== "CERRADA" ? <button type="button" onClick={() => void handleCerrarAccionInspeccion(item)} disabled={closingAccionInspeccionId === String(item.id) || deactivatingAccionInspeccionId === String(item.id) || isSubmittingAccionInspeccion}>{closingAccionInspeccionId === String(item.id) ? "..." : <ClipboardList size={16} />}</button> : null}{canWriteInspecciones ? <button type="button" onClick={() => void handleDeactivateAccionInspeccion(item)} disabled={deactivatingAccionInspeccionId === String(item.id) || closingAccionInspeccionId === String(item.id) || isSubmittingAccionInspeccion}>{deactivatingAccionInspeccionId === String(item.id) ? "..." : <Ban size={16} />}</button> : null}</div></div>)}</SstTable><Paginator page={accionesInspeccionState.data.pagination.page} totalPages={accionesInspeccionState.data.pagination.total_pages} total={accionesInspeccionState.data.pagination.total} onChange={(page) => setAccionesInsQuery((current) => ({ ...current, page }))} /></div> : <StateCard title="Sin acciones de inspeccion" message="No hay acciones activas para el hallazgo seleccionado." />) : null}
      </>) : null}

      {activeTab === "accidentes" ? (!canReadAccidentes ? <StateCard title="Sin permiso" message="No cuenta con permisos para consultar accidentes e incidentes." /> : <>
        <div className="sst-toolbar"><div className="sst-toolbar-row">{canWriteAccidentes ? <button type="button" className="sst-button primary" onClick={openCreateAccidenteModal} disabled={isSubmittingAccidente || deactivatingAccidenteId !== null}><Plus size={16} />{creatingAccidente ? "Creando..." : "Nuevo accidente"}</button> : null}{canWriteAccidentes ? <button type="button" className="sst-button" onClick={openCreateAccionAccidenteModal} disabled={!selectedAccidente || isSubmittingAccidente || isSubmittingAccionAccidente || deactivatingAccidenteId !== null}><Plus size={16} />{creatingAccionAccidente ? "Creando..." : "Nueva accion relacionada"}</button> : null}</div><div className="sst-filters"><select className="sst-select" value={accidentesQuery.tipo_evento} onChange={(event) => { clearAccidenteSelection(); setAccidentesQuery((current) => ({ ...current, page: 1, tipo_evento: event.target.value as AccidentesQueryState["tipo_evento"] })); }}><option value="">Todos los tipos</option>{ACCIDENTE_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><select className="sst-select" value={accidentesQuery.severidad} onChange={(event) => { clearAccidenteSelection(); setAccidentesQuery((current) => ({ ...current, page: 1, severidad: event.target.value as AccidentesQueryState["severidad"] })); }}><option value="">Todas las severidades</option>{ACCIDENTE_SEVERIDADES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select><select className="sst-select" value={accidentesQuery.estado} onChange={(event) => { clearAccidenteSelection(); setAccidentesQuery((current) => ({ ...current, page: 1, estado: event.target.value as AccidentesQueryState["estado"] })); }}><option value="">Todos los estados</option>{ACCIDENTE_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div></div>
        {accidenteDashboardState.loading ? <StateCard title="Cargando dashboard de accidentes" message="Consultando resumen real de accidentes para el alcance actual." /> : null}
        {accidenteDashboardState.error ? <StateCard title="No fue posible cargar el dashboard de accidentes" message={accidenteDashboardState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshAccidenteDashboard()} /> : null}
        {!accidenteDashboardState.loading && !accidenteDashboardState.error ? (accidenteDashboardHasData ? <SstKpis items={[{ label: "Accidentes", value: formatNumber(accidenteDashboardState.data?.accidentes_total), tone: "danger", icon: Siren }, { label: "Incidentes", value: formatNumber(accidenteDashboardState.data?.incidentes_total), tone: "warning", icon: AlertTriangle }, { label: "Acciones abiertas", value: formatNumber(accidenteDashboardState.data?.acciones_abiertas), tone: "info", icon: ClipboardList }, { label: "Cumplimiento", value: formatPercent(accidenteDashboardState.data?.cumplimiento_acciones_porcentaje), tone: "success", icon: ShieldAlert }]} /> : <StateCard title="Sin datos de accidentes" message="No hay accidentes activos para el alcance actual." />) : null}
        {accidentesState.loading ? <StateCard title="Cargando accidentes" message="Leyendo accidentes reales del backend." /> : null}
        {accidentesState.error ? <StateCard title="No fue posible cargar accidentes" message={accidentesState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshAccidentes()} /> : null}
        {!accidentesState.loading && !accidentesState.error ? (accidentesState.data?.items.length ? <><SstTable columns={["Persona", "Tipo", "Fecha", "Severidad", "Estado", "Acciones"]} gridTemplateColumns="1.2fr 170px 130px 140px 140px 140px" minWidth={980}>{accidentesState.data.items.map((item) => <div className={`sst-table-row${selectedAccidente?.id === item.id ? " is-selected" : ""}${highlightedAccidenteId === String(item.id) ? " is-highlighted" : ""}`} key={item.id} data-accidente-id={item.id}><strong>{item.persona.nombre_completo}</strong><span>{titleCase(item.tipo_evento)}</span><span>{formatDate(item.fecha_evento)}</span><SstBadge tone={eventBadgeTone(item.severidad)}>{titleCase(item.severidad)}</SstBadge><SstBadge tone={eventBadgeTone(item.estado)}>{titleCase(item.estado)}</SstBadge><div className="sst-row-actions"><button type="button" onClick={() => handleSelectAccidente(item)} disabled={deactivatingAccidenteId === String(item.id) || isSubmittingAccidente || isSubmittingAccionAccidente}><Eye size={16} /></button>{canWriteAccidentes ? <button type="button" onClick={() => void openEditAccidenteModal(item)} disabled={deactivatingAccidenteId === String(item.id) || isSubmittingAccidente || isSubmittingAccionAccidente}><Pencil size={16} /></button> : null}{canWriteAccidentes ? <button type="button" onClick={() => void handleDeactivateAccidente(item)} disabled={deactivatingAccidenteId === String(item.id) || isSubmittingAccidente || isSubmittingAccionAccidente}>{deactivatingAccidenteId === String(item.id) ? "..." : <Ban size={16} />}</button> : null}</div></div>)}</SstTable><Paginator page={accidentesState.data.pagination.page} totalPages={accidentesState.data.pagination.total_pages} total={accidentesState.data.pagination.total} onChange={(page) => { clearAccidenteSelection(); setAccidentesQuery((current) => ({ ...current, page })); }} /></> : <StateCard title="Sin accidentes" message="No hay accidentes activos con los filtros actuales." />) : null}
        {selectedAccidente ? <div className="sst-detail-card sst-card"><h3>Detalle del accidente</h3><div className="sst-mini-row"><strong>Persona:</strong><span>{selectedAccidente.persona.nombre_completo}</span></div><div className="sst-mini-row"><strong>Descripcion:</strong><span>{selectedAccidente.descripcion}</span></div><div className="sst-mini-row"><strong>Lesionado:</strong><span>{selectedAccidente.lesionado ? "Si" : "No"}</span></div><div className="sst-mini-row"><strong>Dias incapacidad:</strong><span>{formatNumber(selectedAccidente.dias_incapacidad ?? 0)}</span></div></div> : null}
        {!currentAccidenteIdForAcciones && !accidentesState.loading ? <StateCard title="Seleccione un accidente" message="Las acciones relacionadas solo se cargan cuando existe un accidente seleccionado." /> : null}
        {currentAccidenteIdForAcciones && accionesAccidenteState.loading ? <StateCard title="Cargando acciones de accidente" message="Leyendo acciones reales del accidente seleccionado." /> : null}
        {currentAccidenteIdForAcciones && accionesAccidenteState.error ? <StateCard title="No fue posible cargar acciones de accidente" message={accionesAccidenteState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshAccionesAccidente()} /> : null}
        {currentAccidenteIdForAcciones && !accionesAccidenteState.loading && !accionesAccidenteState.error ? (accionesAccidenteState.data?.items.length ? <div className="sst-card"><h3>Acciones relacionadas</h3><SstTable columns={["Descripcion", "Responsable", "Compromiso", "Cierre", "Estado", "Acciones"]} gridTemplateColumns="1.6fr 180px 130px 130px 130px 120px" minWidth={980}>{accionesAccidenteState.data.items.map((item) => <div className="sst-table-row" key={item.id}><strong>{item.descripcion}</strong><span>{item.responsable ?? "No asignado"}</span><span>{formatDate(item.fecha_compromiso)}</span><span>{formatDate(item.fecha_cierre)}</span><SstBadge tone={eventBadgeTone(item.estado)}>{titleCase(item.estado)}</SstBadge><div className="sst-row-actions">{canWriteAccidentes ? <button type="button" onClick={() => openEditAccionAccidenteModal(item)} disabled={isSubmittingAccionAccidente || deactivatingAccionAccidenteId === String(item.id) || isSubmittingAccidente}><Pencil size={16} /></button> : null}{canWriteAccidentes ? <button type="button" onClick={() => void handleDeactivateAccionAccidente(item)} disabled={deactivatingAccionAccidenteId === String(item.id) || isSubmittingAccionAccidente || isSubmittingAccidente}>{deactivatingAccionAccidenteId === String(item.id) ? "..." : <Ban size={16} />}</button> : null}</div></div>)}</SstTable></div> : <StateCard title="Sin acciones de accidente" message="No hay acciones activas para el accidente seleccionado." />) : null}
        {accidenteAlertasState.loading ? <StateCard title="Cargando alertas de accidentes" message="Consultando alertas reales del alcance actual." /> : null}
        {accidenteAlertasState.error ? <StateCard title="No fue posible cargar alertas de accidentes" message={accidenteAlertasState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshAccidenteAlertas()} /> : null}
        {!accidenteAlertasState.loading && !accidenteAlertasState.error ? (accidenteAlertasState.data?.items.length ? <div className="sst-card"><h3>Alertas de accidentes</h3>{accidenteAlertasState.data.items.map((item) => <div key={item.id} className="sst-mini-row"><strong>{item.titulo}</strong><span>{item.descripcion}</span></div>)}</div> : <StateCard title="Sin alertas de accidentes" message="No hay alertas activas de accidentes para el alcance actual." />) : null}
      </>) : null}

      {activeTab === "indicadores" ? (!canReadIndicadores ? <StateCard title="Sin permiso" message="No cuenta con permisos para consultar indicadores SST." /> : <>
        <InlineNotice title="Calculo automatico no disponible" tone="warning">El backend expone `POST /api/sst/indicadores/calcular`, pero devuelve 409. Por eso no se muestra como accion funcional.</InlineNotice>
        <div className="sst-card">
          <h3>Periodos</h3>
          {periodosState.loading ? <StateCard title="Cargando periodos" message="Consultando periodos reales para el alcance actual." /> : null}
          {periodosState.error ? <StateCard title="No fue posible cargar periodos" message={periodosState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshIndicadoresPeriodos({ force: true })} /> : null}
          {!periodosState.loading && !periodosState.error ? (periodosState.data?.items.length ? <div className="sst-indicator-grid">{periodosState.data.items.map((item) => <button key={item.id} type="button" className={`sst-tab${selectedPeriodoId === String(item.id) ? " active" : ""}`} onClick={() => setSelectedPeriodoId(String(item.id))}>{item.nombre_periodo}<small>{formatDate(item.fecha_inicio)} - {formatDate(item.fecha_fin)}</small></button>)}</div> : <StateCard title="Sin periodos" message="No hay periodos activos para el alcance actual." />) : null}
        </div>
        {selectedPeriodo ? <InlineNotice title="Periodo seleccionado" tone="info">{selectedPeriodo.nombre_periodo} ({formatDate(selectedPeriodo.fecha_inicio)} - {formatDate(selectedPeriodo.fecha_fin)})</InlineNotice> : null}
        {selectedPeriodo && indicadoresDashboardState.loading ? <StateCard title="Cargando dashboard de indicadores" message="Consultando indicadores reales del periodo seleccionado." /> : null}
        {selectedPeriodo && indicadoresDashboardState.error ? <StateCard title="No fue posible cargar el dashboard de indicadores" message={indicadoresDashboardState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshIndicadoresDashboard({ force: true })} /> : null}
        {selectedPeriodo && !indicadoresDashboardState.loading && !indicadoresDashboardState.error && indicadoresDashboardState.data ? <SstKpis items={[{ label: "Clasificacion", value: titleCase(indicadoresDashboardState.data.indicadores_generales.clasificacion), tone: "primary", icon: FileBarChart2 }, { label: "Cumplimiento general", value: formatPercent(indicadoresDashboardState.data.indicadores_generales.cumplimiento_general_sst), tone: "success", icon: ShieldAlert }, { label: "Accidentalidad", value: formatNumber(indicadoresDashboardState.data.accidentalidad.accidentes_total), tone: "danger", icon: Siren }, { label: "Hallazgos criticos", value: formatNumber(indicadoresDashboardState.data.inspecciones.hallazgos_criticos), tone: "warning", icon: AlertTriangle }]} /> : null}
        {!selectedPeriodo && !periodosState.loading && !periodosState.error && periodosState.data?.items.length ? <StateCard title="Seleccione un periodo" message="El dashboard, el historico y las alertas se cargan cuando existe un periodo valido para el alcance actual." /> : null}
        <div className="sst-card">
          <h3>Catalogo y mediciones</h3>
          {indicadoresState.loading ? <StateCard title="Cargando catalogo" message="Consultando catalogo real de indicadores." /> : null}
          {indicadoresState.error ? <StateCard title="No fue posible cargar el catalogo de indicadores" message={indicadoresState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshIndicadores({ force: true })} /> : null}
          {!indicadoresState.loading && !indicadoresState.error ? (indicadoresCatalogo.length || indicadoresMediciones.length ? <>{indicadoresCatalogo.length ? <SstTable columns={["Indicador", "Formula", "Periodicidad", "Unidad"]} gridTemplateColumns="1.2fr 1.5fr 170px 140px" minWidth={900}>{indicadoresCatalogo.map((item) => <div className="sst-table-row" key={item.id}><strong>{item.nombre_indicador}</strong><span>{item.formula ?? "No disponible"}</span><span>{item.periodicidad ?? "No disponible"}</span><span>{item.unidad ?? "No disponible"}</span></div>)}</SstTable> : <StateCard title="Sin catalogo" message="El backend no devolvio indicadores activos para el alcance actual." />}<div className="sst-subsection"><h4>Mediciones</h4>{indicadoresMediciones.length ? indicadoresMediciones.map((item) => <div key={item.id} className="sst-mini-row"><strong>{item.nombre_indicador}</strong><span>{item.periodo} - {formatNumber(item.resultado ?? 0)} {item.unidad ?? ""}</span></div>) : <StateCard title="Sin mediciones" message="No hay mediciones registradas para el alcance actual." />}</div></> : <StateCard title="Sin indicadores" message="No hay catalogo ni mediciones disponibles para el alcance actual." />) : null}
        </div>
        {selectedPeriodo && indicadoresHistoricoState.loading ? <StateCard title="Cargando historico de indicadores" message="Consultando la serie historica real del periodo seleccionado." /> : null}
        {selectedPeriodo && indicadoresHistoricoState.error ? <StateCard title="No fue posible cargar el historico de indicadores" message={indicadoresHistoricoState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshIndicadoresHistorico({ force: true })} /> : null}
        {selectedPeriodo && !indicadoresHistoricoState.loading && !indicadoresHistoricoState.error ? (indicadoresHistoricoItems.length ? <div className="sst-card"><h3>Historico</h3>{indicadoresHistoricoItems.map((item, index) => <div key={`${item.periodo.id}-${index}`} className="sst-mini-row"><strong>{item.periodo.nombre_periodo}</strong><span>{formatPercent(item.indicadores_generales.cumplimiento_general_sst)}</span></div>)}</div> : <StateCard title="Sin historico" message="No hay historico disponible para el alcance y periodo seleccionados." />) : null}
        {selectedPeriodo && indicadoresAlertasState.loading ? <StateCard title="Cargando alertas de indicadores" message="Consultando alertas reales del periodo seleccionado." /> : null}
        {selectedPeriodo && indicadoresAlertasState.error ? <StateCard title="No fue posible cargar alertas de indicadores" message={indicadoresAlertasState.error} tone="error" actionLabel="Reintentar" onAction={() => void refreshIndicadoresAlertas({ force: true })} /> : null}
        {selectedPeriodo && !indicadoresAlertasState.loading && !indicadoresAlertasState.error ? (indicadoresAlertaItems.length ? <div className="sst-card"><h3>Alertas de indicadores</h3>{indicadoresAlertaItems.map((item) => <div key={item.id} className="sst-mini-row"><strong>{item.titulo}</strong><span>{item.descripcion}</span></div>)}</div> : <StateCard title="Sin alertas de indicadores" message="No hay alertas activas para el periodo y alcance seleccionados." />) : null}
      </>) : null}      {eventModalMode ? (
        <ModalShell title={eventModalMode === "create" ? "Nuevo evento" : "Editar evento"} onClose={() => setEventModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Buscar persona">
              <div className="sst-inline-row">
                <input className="sst-input" value={personaSearch} onChange={(event) => setPersonaSearch(event.target.value)} placeholder="Nombre o documento" />
                <button type="button" className="sst-button" onClick={() => void loadPersonaOptions(personaSearch)} disabled={personaLoading}>Buscar</button>
              </div>
            </FormField>
            {personaOptions.length ? <FormField label="Persona"><select className="sst-select" value={selectedPersona ? String(selectedPersona.id) : ""} onChange={(event) => { const person = personaOptions.find((item) => String(item.id) === event.target.value) ?? null; setSelectedPersona(person); setEventForm((current) => ({ ...current, vinculacion_id: "" })); if (person) { void loadVinculaciones(person.id); } }}><option value="">Seleccione</option>{personaOptions.map((item) => <option key={item.id} value={String(item.id)}>{item.nombreCompleto} - {item.numeroDocumento}</option>)}</select></FormField> : null}
            <FormField label="Vinculacion"><select className="sst-select" value={eventForm.vinculacion_id} onChange={(event) => setEventForm((current) => ({ ...current, vinculacion_id: event.target.value }))} disabled={vinculacionLoading}><option value="">Seleccione</option>{vinculacionOptions.map((item) => <option key={item.vinculacion.id} value={String(item.vinculacion.id)}>{item.label}</option>)}</select></FormField>
            <FormField label="Tipo de evento"><select className="sst-select" value={eventForm.tipo_evento} onChange={(event) => setEventForm((current) => ({ ...current, tipo_evento: event.target.value as AccidentesQueryState["tipo_evento"] as SstEventoTipo }))}>{EVENT_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Fecha"><input className="sst-input" type="date" value={eventForm.fecha_evento} onChange={(event) => setEventForm((current) => ({ ...current, fecha_evento: event.target.value }))} /></FormField>
            <FormField label="Hora"><input className="sst-input" type="time" value={eventForm.hora_evento} onChange={(event) => setEventForm((current) => ({ ...current, hora_evento: event.target.value }))} /></FormField>
            <FormField label="Lugar"><input className="sst-input" value={eventForm.lugar} onChange={(event) => setEventForm((current) => ({ ...current, lugar: event.target.value }))} /></FormField>
            <FormField label="Gravedad"><select className="sst-select" value={eventForm.gravedad} onChange={(event) => setEventForm((current) => ({ ...current, gravedad: event.target.value as EventFormState["gravedad"] }))}><option value="">No aplica</option>{EVENT_GRAVEDADES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Estado"><select className="sst-select" value={eventForm.estado} onChange={(event) => setEventForm((current) => ({ ...current, estado: event.target.value as AccidentesQueryState["estado"] as SstEventoEstado }))}>{EVENT_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Descripcion"><textarea className="sst-textarea" value={eventForm.descripcion} onChange={(event) => setEventForm((current) => ({ ...current, descripcion: event.target.value }))} /></FormField>
            <label className="sst-check"><input type="checkbox" checked={eventForm.requiere_investigacion} onChange={(event) => setEventForm((current) => ({ ...current, requiere_investigacion: event.target.checked }))} />Requiere investigacion</label>
          </div>
          <div className="sst-form-actions"><span className="sst-readonly">{buildVinculacionSummary(currentVinculacion)}</span><button type="button" className="sst-button primary" onClick={() => void submitEventForm()} disabled={busyKey === "crear-evento" || busyKey?.startsWith("editar-evento-")}>Guardar</button></div>
        </ModalShell>
      ) : null}

      {planModalMode ? (
        <ModalShell title={planModalMode === "create" ? "Nuevo plan de accion" : "Editar plan de accion"} onClose={() => setPlanModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Origen"><select className="sst-select" value={planForm.origen} onChange={(event) => setPlanForm((current) => ({ ...current, origen: event.target.value as SstPlanOrigen, origen_id: "" }))}>{PLAN_ORIGINS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Registro relacionado"><select className="sst-select" value={planForm.origen_id} onChange={(event) => setPlanForm((current) => ({ ...current, origen_id: event.target.value }))} disabled={planOriginLoading}><option value="">Seleccione</option>{currentOriginOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FormField>
            <FormField label="Responsable"><input className="sst-input" value={planForm.responsable} onChange={(event) => setPlanForm((current) => ({ ...current, responsable: event.target.value }))} /></FormField>
            <FormField label="Fecha compromiso"><input className="sst-input" type="date" value={planForm.fecha_compromiso} onChange={(event) => setPlanForm((current) => ({ ...current, fecha_compromiso: event.target.value }))} /></FormField>
            <FormField label="Estado"><select className="sst-select" value={planForm.estado} onChange={(event) => setPlanForm((current) => ({ ...current, estado: event.target.value as AccidentesQueryState["estado"] as SstPlanEstado }))}>{PLAN_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Descripcion"><textarea className="sst-textarea" value={planForm.descripcion} onChange={(event) => setPlanForm((current) => ({ ...current, descripcion: event.target.value }))} /></FormField>
          </div>
          <div className="sst-form-actions"><button type="button" className="sst-button primary" onClick={() => void submitPlanForm()} disabled={busyKey === "crear-plan" || busyKey?.startsWith("editar-plan-")}>Guardar</button></div>
        </ModalShell>
      ) : null}

      {inspeccionModalMode ? (
        <ModalShell title={inspeccionModalMode === "create" ? "Nueva inspeccion" : "Editar inspeccion"} onClose={() => setInspeccionModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Empresa"><select className="sst-select" value={inspeccionForm.empresa_id} onChange={(event) => setInspeccionForm((current) => ({ ...current, empresa_id: event.target.value, contrato_id: "" }))}><option value="">Seleccione</option>{empresas.map((item) => <option key={item.id} value={String(item.id)}>{buildEmpresaLabel(item)}</option>)}</select></FormField>
            <FormField label="Contrato"><select className="sst-select" value={inspeccionForm.contrato_id} onChange={(event) => setInspeccionForm((current) => ({ ...current, contrato_id: event.target.value }))}><option value="">Sin contrato</option>{contratos.filter((item) => !inspeccionForm.empresa_id || String(item.empresa.id) === inspeccionForm.empresa_id).map((item) => <option key={item.id} value={String(item.id)}>{buildContratoLabel(item)}</option>)}</select></FormField>
            <FormField label="Nombre"><input className="sst-input" value={inspeccionForm.nombre_inspeccion} onChange={(event) => setInspeccionForm((current) => ({ ...current, nombre_inspeccion: event.target.value }))} /></FormField>
            <FormField label="Tipo"><select className="sst-select" value={inspeccionForm.tipo_inspeccion} onChange={(event) => setInspeccionForm((current) => ({ ...current, tipo_inspeccion: event.target.value as SstInspeccionTipo }))}>{INSPECCION_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Fecha programada"><input className="sst-input" type="date" value={inspeccionForm.fecha_programada} onChange={(event) => setInspeccionForm((current) => ({ ...current, fecha_programada: event.target.value }))} /></FormField>
            <FormField label="Fecha realizada"><input className="sst-input" type="date" value={inspeccionForm.fecha_realizada} onChange={(event) => setInspeccionForm((current) => ({ ...current, fecha_realizada: event.target.value }))} /></FormField>
            <FormField label="Responsable"><input className="sst-input" value={inspeccionForm.responsable} onChange={(event) => setInspeccionForm((current) => ({ ...current, responsable: event.target.value }))} /></FormField>
            <FormField label="Estado"><select className="sst-select" value={inspeccionForm.estado} onChange={(event) => setInspeccionForm((current) => ({ ...current, estado: event.target.value as AccidentesQueryState["estado"] as SstInspeccionEstado }))}>{INSPECCION_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Observacion"><textarea className="sst-textarea" value={inspeccionForm.observacion} onChange={(event) => setInspeccionForm((current) => ({ ...current, observacion: event.target.value }))} /></FormField>
          </div>
          <div className="sst-form-actions"><button type="button" className="sst-button primary" onClick={() => void submitInspeccionForm()}>Guardar</button></div>
        </ModalShell>
      ) : null}

      {hallazgoModalMode ? (
        <ModalShell title={hallazgoModalMode === "create" ? "Nuevo hallazgo" : "Editar hallazgo"} onClose={() => setHallazgoModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Inspeccion"><select className="sst-select" value={hallazgoForm.inspeccion_id} onChange={(event) => setHallazgoForm((current) => ({ ...current, inspeccion_id: event.target.value }))}><option value="">Seleccione</option>{inspeccionLookup.map((item) => <option key={item.id} value={String(item.id)}>{buildInspeccionSummary(item)}</option>)}</select></FormField>
            <FormField label="Tipo"><select className="sst-select" value={hallazgoForm.tipo_hallazgo} onChange={(event) => setHallazgoForm((current) => ({ ...current, tipo_hallazgo: event.target.value as SstHallazgoTipo }))}>{HALLAZGO_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Nivel de riesgo"><select className="sst-select" value={hallazgoForm.nivel_riesgo} onChange={(event) => setHallazgoForm((current) => ({ ...current, nivel_riesgo: event.target.value as SstHallazgoNivel }))}>{HALLAZGO_NIVELES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Descripcion"><textarea className="sst-textarea" value={hallazgoForm.descripcion} onChange={(event) => setHallazgoForm((current) => ({ ...current, descripcion: event.target.value }))} /></FormField>
            <label className="sst-check"><input type="checkbox" checked={hallazgoForm.requiere_accion} onChange={(event) => setHallazgoForm((current) => ({ ...current, requiere_accion: event.target.checked }))} />Requiere accion</label>
          </div>
          <div className="sst-form-actions"><button type="button" className="sst-button primary" onClick={() => void submitHallazgoForm()} disabled={isSubmittingHallazgo}>{creatingHallazgo ? "Creando..." : updatingHallazgo ? "Guardando..." : "Guardar"}</button></div>
        </ModalShell>
      ) : null}

      {accionInspeccionModalMode ? (
        <ModalShell title={accionInspeccionModalMode === "create" ? "Nueva accion de inspeccion" : "Editar accion de inspeccion"} onClose={() => setAccionInspeccionModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Hallazgo"><select className="sst-select" value={accionInspeccionForm.hallazgo_id} onChange={(event) => setAccionInspeccionForm((current) => ({ ...current, hallazgo_id: event.target.value }))}><option value="">Seleccione</option>{hallazgoOptions.map((item) => <option key={item.id} value={String(item.id)}>{buildHallazgoSummary(item)}</option>)}</select></FormField>
            <FormField label="Responsable"><input className="sst-input" value={accionInspeccionForm.responsable} onChange={(event) => setAccionInspeccionForm((current) => ({ ...current, responsable: event.target.value }))} /></FormField>
            <FormField label="Fecha compromiso"><input className="sst-input" type="date" value={accionInspeccionForm.fecha_compromiso} onChange={(event) => setAccionInspeccionForm((current) => ({ ...current, fecha_compromiso: event.target.value }))} /></FormField>
            <FormField label="Fecha cierre"><input className="sst-input" type="date" value={accionInspeccionForm.fecha_cierre} onChange={(event) => setAccionInspeccionForm((current) => ({ ...current, fecha_cierre: event.target.value }))} /></FormField>
            <FormField label="Estado"><select className="sst-select" value={accionInspeccionForm.estado} onChange={(event) => setAccionInspeccionForm((current) => ({ ...current, estado: event.target.value as AccidentesQueryState["estado"] as SstAccionEstado }))}>{ACCION_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Descripcion"><textarea className="sst-textarea" value={accionInspeccionForm.descripcion} onChange={(event) => setAccionInspeccionForm((current) => ({ ...current, descripcion: event.target.value }))} /></FormField>
          </div>
          <div className="sst-form-actions"><button type="button" className="sst-button primary" onClick={() => void submitAccionInspeccionForm()} disabled={isSubmittingAccionInspeccion}>{creatingAccionInspeccion ? "Creando..." : updatingAccionInspeccion ? "Guardando..." : "Guardar"}</button></div>
        </ModalShell>
      ) : null}

      {accidenteModalMode ? (
        <ModalShell title={accidenteModalMode === "create" ? "Nuevo accidente" : "Editar accidente"} onClose={() => setAccidenteModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Empresa"><select className="sst-select" value={accidenteForm.empresa_id} onChange={(event) => setAccidenteForm((current) => ({ ...current, empresa_id: event.target.value, contrato_id: "" }))}><option value="">Seleccione</option>{empresas.map((item) => <option key={item.id} value={String(item.id)}>{buildEmpresaLabel(item)}</option>)}</select></FormField>
            <FormField label="Contrato"><select className="sst-select" value={accidenteForm.contrato_id} onChange={(event) => setAccidenteForm((current) => ({ ...current, contrato_id: event.target.value }))}><option value="">Sin contrato</option>{contratos.filter((item) => !accidenteForm.empresa_id || String(item.empresa.id) === accidenteForm.empresa_id).map((item) => <option key={item.id} value={String(item.id)}>{buildContratoLabel(item)}</option>)}</select></FormField>
            <FormField label="Buscar persona"><div className="sst-inline-row"><input className="sst-input" value={personaSearch} onChange={(event) => setPersonaSearch(event.target.value)} placeholder="Nombre o documento" /><button type="button" className="sst-button" onClick={() => void loadPersonaOptions(personaSearch)} disabled={personaLoading}>Buscar</button></div></FormField>
            {personaOptions.length ? <FormField label="Persona"><select className="sst-select" value={accidenteForm.persona_id} onChange={(event) => { const person = personaOptions.find((item) => String(item.id) === event.target.value) ?? null; setSelectedPersona(person); setAccidenteForm((current) => ({ ...current, persona_id: event.target.value, vinculacion_id: "" })); if (person) { void loadVinculaciones(person.id); } }}><option value="">Seleccione</option>{personaOptions.map((item) => <option key={item.id} value={String(item.id)}>{item.nombreCompleto} - {item.numeroDocumento}</option>)}</select></FormField> : null}
            <FormField label="Vinculacion"><select className="sst-select" value={accidenteForm.vinculacion_id} onChange={(event) => setAccidenteForm((current) => ({ ...current, vinculacion_id: event.target.value }))}><option value="">Sin vinculacion</option>{vinculacionOptions.map((item) => <option key={item.vinculacion.id} value={String(item.vinculacion.id)}>{item.label}</option>)}</select></FormField>
            <FormField label="Tipo"><select className="sst-select" value={accidenteForm.tipo_evento} onChange={(event) => setAccidenteForm((current) => ({ ...current, tipo_evento: event.target.value as AccidentesQueryState["tipo_evento"] as AccidenteFormState["tipo_evento"] }))}>{ACCIDENTE_TYPES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Fecha"><input className="sst-input" type="date" value={accidenteForm.fecha_evento} onChange={(event) => setAccidenteForm((current) => ({ ...current, fecha_evento: event.target.value }))} /></FormField>
            <FormField label="Hora"><input className="sst-input" type="time" value={accidenteForm.hora_evento} onChange={(event) => setAccidenteForm((current) => ({ ...current, hora_evento: event.target.value }))} /></FormField>
            <FormField label="Lugar"><input className="sst-input" value={accidenteForm.lugar_evento} onChange={(event) => setAccidenteForm((current) => ({ ...current, lugar_evento: event.target.value }))} /></FormField>
            <FormField label="Severidad"><select className="sst-select" value={accidenteForm.severidad} onChange={(event) => setAccidenteForm((current) => ({ ...current, severidad: event.target.value as AccidentesQueryState["severidad"] as AccidenteFormState["severidad"] }))}>{ACCIDENTE_SEVERIDADES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Estado"><select className="sst-select" value={accidenteForm.estado} onChange={(event) => setAccidenteForm((current) => ({ ...current, estado: event.target.value as AccidentesQueryState["estado"] as AccidenteFormState["estado"] }))}>{ACCIDENTE_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Tipo lesion"><input className="sst-input" value={accidenteForm.tipo_lesion} onChange={(event) => setAccidenteForm((current) => ({ ...current, tipo_lesion: event.target.value }))} /></FormField>
            <FormField label="Parte del cuerpo"><input className="sst-input" value={accidenteForm.parte_cuerpo} onChange={(event) => setAccidenteForm((current) => ({ ...current, parte_cuerpo: event.target.value }))} /></FormField>
            <FormField label="Dias incapacidad"><input className="sst-input" type="number" min="0" value={accidenteForm.dias_incapacidad} onChange={(event) => setAccidenteForm((current) => ({ ...current, dias_incapacidad: event.target.value }))} /></FormField>
            <FormField label="Descripcion"><textarea className="sst-textarea" value={accidenteForm.descripcion} onChange={(event) => setAccidenteForm((current) => ({ ...current, descripcion: event.target.value }))} /></FormField>
            <label className="sst-check"><input type="checkbox" checked={accidenteForm.lesionado} onChange={(event) => setAccidenteForm((current) => ({ ...current, lesionado: event.target.checked }))} />Lesionado</label>
            <label className="sst-check"><input type="checkbox" checked={accidenteForm.requiere_investigacion} onChange={(event) => setAccidenteForm((current) => ({ ...current, requiere_investigacion: event.target.checked }))} />Requiere investigacion</label>
          </div>
          <div className="sst-form-actions"><span className="sst-readonly">{selectedPersona ? `${selectedPersona.nombreCompleto} - ${selectedPersona.numeroDocumento}` : "Seleccione una persona"}</span><button type="button" className="sst-button primary" onClick={() => void submitAccidenteForm()} disabled={isSubmittingAccidente}>{creatingAccidente ? "Creando..." : updatingAccidente ? "Guardando..." : "Guardar"}</button></div>
        </ModalShell>
      ) : null}

      {accionAccidenteModalMode ? (
        <ModalShell title={accionAccidenteModalMode === "create" ? "Nueva accion relacionada" : "Editar accion relacionada"} onClose={() => setAccionAccidenteModalMode(null)}>
          <div className="sst-form-grid">
            <FormField label="Responsable"><input className="sst-input" value={accionAccidenteForm.responsable} onChange={(event) => setAccionAccidenteForm((current) => ({ ...current, responsable: event.target.value }))} /></FormField>
            <FormField label="Fecha compromiso"><input className="sst-input" type="date" value={accionAccidenteForm.fecha_compromiso} onChange={(event) => setAccionAccidenteForm((current) => ({ ...current, fecha_compromiso: event.target.value }))} /></FormField>
            <FormField label="Fecha cierre"><input className="sst-input" type="date" value={accionAccidenteForm.fecha_cierre} onChange={(event) => setAccionAccidenteForm((current) => ({ ...current, fecha_cierre: event.target.value }))} /></FormField>
            <FormField label="Estado"><select className="sst-select" value={accionAccidenteForm.estado} onChange={(event) => setAccionAccidenteForm((current) => ({ ...current, estado: event.target.value as AccidentesQueryState["estado"] as AccionAccidenteFormState["estado"] }))}>{ACCION_ACCIDENTE_STATES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></FormField>
            <FormField label="Descripcion"><textarea className="sst-textarea" value={accionAccidenteForm.descripcion} onChange={(event) => setAccionAccidenteForm((current) => ({ ...current, descripcion: event.target.value }))} /></FormField>
          </div>
          <div className="sst-form-actions"><button type="button" className="sst-button primary" onClick={() => void submitAccionAccidenteForm()} disabled={isSubmittingAccionAccidente}>{creatingAccionAccidente ? "Creando..." : updatingAccionAccidente ? "Guardando..." : "Guardar"}</button></div>
        </ModalShell>
      ) : null}
    </div>
  );
}
















