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
  createAjusteManual,
  deactivateNominaNovedad,
  exportNomina,
  generateNominaDesprendibles,
  getAllNominaNovedades,
  getAllNominaPeriodoEmpleados,
  getAllNominaPeriodoEmpleadosOperativos,
  getNovedadDocumentos,
  getNominaDesprendibles,
  getNominaPeriodo,
  getNominaPeriodoDashboard,
  getAjustesManuales,
  getNovedadSupport,
  getNominaPeriodos,
  listarTiposNovedad,
  openNominaDesprendible,
  recalculateNominaPeriodo,
  updateNominaNovedad,
  updateAjusteManual,
  annulAjusteManual,
  uploadNovedadDocumento,
  uploadNovedadSupport,
} from "../../services/nominaApi";
import { ApiClientError } from "../../services/apiClient";
import { useCompanyContext } from "../../context/CompanyContext";
import { useAuth } from "../../context/AuthContext";
import {
  pickAvailableScopedId,
  readCompanyScopedStorage,
  writeCompanyScopedStorage,
} from "../../context/companyScope";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import CoberturaFlowNav from "./CoberturaFlowNav";
import type {
  GenerateNominaDesprendiblesResponse,
  NominaDesprendibleApi,
  NominaNovedadDocumentosApi,
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
  AjusteManualApi,
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

function InternalTurnsDetail({ empleado }: { empleado: NominaEmpleadoApi }) {
  const detail = empleado.detalle_calculo as { adiciones_internas?: Array<Record<string, unknown>> } | null | undefined;
  const turns = detail?.adiciones_internas ?? [];
  if (turns.length === 0) return null;
  const total = turns.reduce((sum, turn) => sum + Number(turn.devengado_turno ?? turn.valor_aplicado ?? 0), 0);
  return (
    <section className="payroll-internal-turns-detail">
      <h4>Turnos internos</h4>
      <dl><div><dt>Total</dt><dd>{formatCOP(total)}</dd></div></dl>
      <div className="payroll-internal-turn-list">
        {turns.map((turn, index) => (
          <div key={String(turn.id ?? index)}>
            <strong>{String(turn.fecha_inicio ?? "Fecha no disponible")} → {String(turn.fecha_fin ?? turn.fecha_inicio ?? "")}</strong>
            <span>{String(turn.titular_nombre ?? "Persona cubierta no disponible")} · {String(turn.contexto && typeof turn.contexto === "object" ? (turn.contexto as Record<string, unknown>).institucion ?? "Institución no disponible" : "Institución no disponible")}</span>
            <small>{String(turn.contexto && typeof turn.contexto === "object" ? (turn.contexto as Record<string, unknown>).sede ?? "Sede no disponible" : "Sede no disponible")} · {String(turn.contexto && typeof turn.contexto === "object" ? (turn.contexto as Record<string, unknown>).modalidad ?? "Modalidad no disponible" : "Modalidad no disponible")} · {String(turn.dias_turno ?? 1)} día(s) · {formatCOP(Number(turn.valor_unitario ?? 0))}/día · subtotal {formatCOP(Number(turn.devengado_turno ?? turn.valor_aplicado ?? 0))}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

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
  cobertura_tipo: "SIN_REEMPLAZO" | "PERSONAL_VINCULADO" | "PERSONA_EXTERNA";
  cobertura_search: string;
  cobertura_persona_cubre_id: string;
  cobertura_vinculacion_cubre_id: string;
  cobertura_nombre_externo: string;
  cobertura_documento_externo: string;
  cobertura_observacion_externa: string;
  cobertura_observacion_interna: string;
};

type FeedbackState = {
  message: string;
  tone: "success" | "error";
} | null;

type ManualFinalDraft = {
  cotizaPension: boolean;
  tieneDeduccion: boolean;
  valorDeduccion: string;
};

const FINAL_DEDUCTION_CONCEPT = "DEDUCCION_ADICIONAL_FINAL";
const PENSION_EXCLUSION_CONCEPT = "EXCLUIR_PENSION_FINAL";

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
    cobertura_tipo: "SIN_REEMPLAZO",
    cobertura_search: "",
    cobertura_persona_cubre_id: "",
    cobertura_vinculacion_cubre_id: "",
    cobertura_nombre_externo: "",
    cobertura_documento_externo: "",
    cobertura_observacion_externa: "",
    cobertura_observacion_interna: "",
  };
}

function formatCOP(value: number | null | undefined) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `$${normalized.toLocaleString("es-CO")}`;
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

function parseDateOnlyForDisplay(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function formatPeriodRange(fechaInicio: string, fechaFin: string) {
  if (!fechaInicio || !fechaFin) {
    return "Rango no disponible";
  }

  const formatter = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

  return `${formatter.format(parseDateOnlyForDisplay(fechaInicio))} - ${formatter.format(parseDateOnlyForDisplay(fechaFin))}`;
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
      timeZone: "UTC",
    }).format(parseDateOnlyForDisplay(novedad.fecha_inicio));
  }

  if (novedad.fecha_fin) {
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(parseDateOnlyForDisplay(novedad.fecha_fin));
  }

  return "Sin fechas";
}

function isCanonicalProjectedNovedad(novedad: NominaNovedadApi) {
  return novedad.registro_tipo === "CANONICA_PROYECTADA";
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
  const metodo = normalizeOptionalLabel(empleado.metodo_liquidacion);
  if (metodo === "CATEGORIA_SALARIAL") {
    return (
      normalizeOptionalLabel(empleado.categoria_salarial?.codigo_categoria) ??
      normalizeOptionalLabel(empleado.categoria_salarial?.nombre_categoria) ??
      metodo
    );
  }
  return metodo ?? "No disponible";
}

function getEmployeeCargoLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.cargo?.nombre_cargo) ?? "No disponible";
}

function getEmployeeSedeLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.sede?.nombre_sede) ?? "No disponible";
}

function getEmployeeInstitucionLabel(empleado: NominaEmpleadoApi) {
  return (
    normalizeOptionalLabel(empleado.contexto_operativo?.institucion) ??
    normalizeOptionalLabel(empleado.institucion) ??
    "No disponible"
  );
}

function getEmployeeGestorLabel(empleado: NominaEmpleadoApi) {
  return normalizeOptionalLabel(empleado.gestor?.nombre_completo) ?? "Sin gestor";
}

function getEmployeeModalidadCode(empleado: NominaEmpleadoApi) {
  return (
    normalizeOptionalLabel(empleado.contexto_operativo?.modalidad_codigo) ??
    normalizeOptionalLabel(empleado.modalidad) ??
    normalizeOptionalLabel(empleado.categoria_salarial?.codigo_categoria) ??
    "No disponible"
  );
}

function getEmployeeModalidadDescription(empleado: NominaEmpleadoApi) {
  return (
    normalizeOptionalLabel(empleado.contexto_operativo?.modalidad_descripcion) ??
    normalizeOptionalLabel(empleado.categoria_salarial?.modalidad) ??
    normalizeOptionalLabel(empleado.modalidad) ??
    "No disponible"
  );
}

function normalizeEmployeeSearchValue(...values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getNovedadCoverageLabel(novedad: NominaNovedadApi) {
  switch (novedad.cobertura?.tipo_cobertura) {
    case "PERSONAL_VINCULADO":
      return "Cubierto por personal vinculado";
    case "PERSONA_EXTERNA":
      return "Cubierto por persona externa";
    case "SIN_REEMPLAZO":
      return "Sin reemplazo / No aplica";
    default:
      return novedad.requiere_cobertura ? (novedad.cubierta ? "Cubierta" : "Pendiente") : "No registrada";
  }
}

function getNovedadCoverageDetail(novedad: NominaNovedadApi) {
  if (novedad.cobertura?.tipo_cobertura === "PERSONAL_VINCULADO") {
    const nombre = normalizeOptionalLabel(novedad.cobertura.persona_cubre?.nombre_completo);
    const documento = normalizeOptionalLabel(novedad.cobertura.persona_cubre?.numero_documento);
    return [nombre, documento].filter(Boolean).join(" · ") || "Personal vinculado";
  }

  if (novedad.cobertura?.tipo_cobertura === "PERSONA_EXTERNA") {
    return [
      normalizeOptionalLabel(novedad.cobertura.nombre_externo),
      normalizeOptionalLabel(novedad.cobertura.documento_externo),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return normalizeOptionalLabel(novedad.cobertura?.observacion_interna);
}

function getEmployeeTotalNovedades(empleado: NominaEmpleadoApi) {
  return typeof empleado.total_novedades === "number" && Number.isFinite(empleado.total_novedades)
    ? empleado.total_novedades
    : 0;
}

function getEmployeeConceptDays(empleado: NominaEmpleadoApi, concept: "salario" | "transporte" | "recargos") {
  const detail = empleado.detalle_calculo;
  const days = detail?.dias;
  const counters = detail?.contadores;
  const parameters = detail?.parametros;
  const daysRecord = days && typeof days === "object" ? days as Record<string, unknown> : {};
  const countersRecord = counters && typeof counters === "object" ? counters as Record<string, unknown> : {};
  const parametersRecord = parameters && typeof parameters === "object" ? parameters as Record<string, unknown> : {};
  const counterKey = concept === "salario" ? "dias_salario" : concept === "transporte" ? "dias_transporte" : "dias_recargo";
  const value = daysRecord[concept] ?? countersRecord[counterKey];
  const base = daysRecord.nomina_base ?? daysRecord.base ?? parametersRecord.dias_base_nomina;
  return {
    paid: typeof value === "number" ? value : empleado.dias_pagados,
    base: typeof base === "number" ? base : 30,
  };
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
    if (loading) return "—";
    if (unavailable && value === undefined) return "No disponible";
    return formatNumber(value ?? 0);
  };
  const moneyValue = (value?: number) => {
    if (loading) return "—";
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
      label: "Novedades registradas",
      value: countValue(totalNovedadesOverride ?? dashboard?.total_novedades),
      caption: "Cantidad de registros administrativos",
    },
    {
      tone: "info",
      icon: CalendarRange,
      label: "Días de novedades",
      value: countValue(dashboard?.total_dias_novedades),
      caption: "Días efectivos aplicables al periodo",
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
  const { empresaId } = useCompanyContext();
  const { user } = useAuth();
  const gestorOperationalOnly = user?.roles.includes("GESTOR") === true && user?.roles.includes("TALENTO_HUMANO") !== true;
  const isCoverageNovedadesRoute = location.pathname.endsWith("/novedades");
  const canReadOperationalCoverage = user?.permissions.includes("nomina.operativa.read") === true;
  const isOperationalCoverageView = isCoverageNovedadesRoute && canReadOperationalCoverage;
  const canCreateNovedad = user?.permissions.includes("nomina.novedades.create") === true;
  const canUpdateNovedad = user?.permissions.includes("nomina.novedades.update") === true;
  const canDeactivateNovedad = user?.permissions.includes("nomina.novedades.deactivate") === true;
  const canGenerateDesprendibles = user?.permissions.includes("nomina.desprendibles.generate") === true;
  const [activeTab, setActiveTab] = useState("nomina");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [clasificacionFilter, setClasificacionFilter] = useState("");
  const [municipioFilter, setMunicipioFilter] = useState("");
  const [gestorFilter, setGestorFilter] = useState("");
  const [modalidadFilter, setModalidadFilter] = useState("");
  const [revisionFilter, setRevisionFilter] = useState("");
  const [novedadesFilter, setNovedadesFilter] = useState("");
  const [tipoNovedadFilter, setTipoNovedadFilter] = useState("");
  const [sortBy, setSortBy] = useState("nombre_asc");
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
  const [supportBusyId, setSupportBusyId] = useState<string | null>(null);
  const [expandedNovedadId, setExpandedNovedadId] = useState<string | null>(null);
  const [novedadDocumentosById, setNovedadDocumentosById] = useState<Record<string, NominaNovedadDocumentosApi>>({});
  const [ajustesManuales, setAjustesManuales] = useState<AjusteManualApi[]>([]);
  const [manualFinalDrafts, setManualFinalDrafts] = useState<Record<string, ManualFinalDraft>>({});
  const [savingManualFinalId, setSavingManualFinalId] = useState<string | null>(null);

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
      const data = await getNominaPeriodos({
        page: 1,
        limit: PERIODS_LIMIT,
        empresa_id: empresaId ? String(empresaId) : undefined,
      });

      if (requestId !== periodsRequestRef.current) {
        return;
      }

      setPeriodsState({
        data,
        loading: false,
        error: null,
      });

      setSelectedPeriodId((current) =>
        pickAvailableScopedId(data.items, preferredPeriodId, current) ??
        pickDefaultNominaPeriod(data.items)?.id ??
        null,
      );
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
  }, [empresaId]);

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
      const employeeLoader = isOperationalCoverageView
        ? getAllNominaPeriodoEmpleadosOperativos
        : getAllNominaPeriodoEmpleados;
      const data = await employeeLoader(periodId, {
        empresa_id: empresaId ? String(empresaId) : undefined,
      });

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
  }, [empresaId, isOperationalCoverageView]);

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
    if (!empresaId) {
      return;
    }
    const requestId = ++tiposNovedadRequestRef.current;

    setTiposNovedadState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));
    setTiposNovedadStatusCode(null);

    try {
      const data = await listarTiposNovedad({ empresa_id: empresaId ? String(empresaId) : undefined });

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
  }, [empresaId]);

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

  const loadAjustesManuales = useCallback(async (periodId: string) => {
    try {
      setAjustesManuales(await getAjustesManuales(periodId));
    } catch (error) {
      setActionFeedback({ tone: "error", message: toMessage(error) });
    }
  }, []);

  const refreshSelectedPeriodData = useCallback(async (periodId: string) => {
    if (isOperationalCoverageView) {
      await Promise.all([
        loadEmployees(periodId),
        loadNovedades(periodId),
        loadAjustesManuales(periodId),
      ]);
      return;
    }

    await Promise.all([
      loadPeriod(periodId),
      loadDashboard(periodId),
      loadEmployees(periodId),
      loadNovedades(periodId),
      loadAjustesManuales(periodId),
    ]);
  }, [isOperationalCoverageView, loadAjustesManuales, loadDashboard, loadEmployees, loadNovedades, loadPeriod]);

  const syncLocalNovedadState = useCallback((nextNovedad: NominaNovedadApi) => {
    setNovedadesState((current) => {
      if (!current.data || novedadesDataId !== selectedPeriodId) {
        return current;
      }

      const existingIndex = current.data.items.findIndex((item) => item.id === nextNovedad.id);
      const nextItems = [...current.data.items];

      if (existingIndex >= 0) {
        nextItems[existingIndex] = nextNovedad;
      } else {
        nextItems.unshift(nextNovedad);
      }

      return {
        ...current,
        data: {
          ...current.data,
          items: nextItems,
          pagination: {
            ...current.data.pagination,
            total: existingIndex >= 0 ? current.data.pagination.total : current.data.pagination.total + 1,
          },
        },
      };
    });

    setEmployeesState((current) => {
      if (!current.data || employeesDataId !== selectedPeriodId) {
        return current;
      }

      const nextItems = current.data.items.map((employee) => {
        if (employee.id !== nextNovedad.nomina_empleado_id) {
          return employee;
        }

        const currentCount = getEmployeeTotalNovedades(employee);
        const previous =
          novedadesState.data?.items.find((item) => item.id === nextNovedad.id) ?? null;
        const delta = previous ? 0 : 1;

        return {
          ...employee,
          revisado: nextNovedad.revisado ? employee.revisado : employee.revisado,
          total_novedades: currentCount + delta,
        };
      });

      return {
        ...current,
        data: {
          ...current.data,
          items: nextItems,
        },
      };
    });
  }, [employeesDataId, novedadesDataId, novedadesState.data?.items, selectedPeriodId]);

  useEffect(() => {
    if (!empresaId) {
      setSelectedPeriodId(null);
      return;
    }

    const preferredPeriodId =
      searchParams.get("period_id") ??
      (typeof window !== "undefined"
        ? readCompanyScopedStorage(window.sessionStorage, "nomina.periodo_id", empresaId) ?? undefined
        : undefined);

    void loadPeriods(preferredPeriodId);
  }, [empresaId, loadPeriods, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    writeCompanyScopedStorage(window.sessionStorage, "nomina.periodo_id", empresaId, selectedPeriodId);
  }, [empresaId, selectedPeriodId]);

  useEffect(() => {
    if (empresaId) {
      void loadTiposNovedad();
    }
  }, [empresaId, loadTiposNovedad]);

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
      setAjustesManuales([]);
      setManualFinalDrafts({});
      setDesprendiblesState({ ...EMPTY_ASYNC_STATE });
      setDesprendiblesDataId(null);
      setIsNovedadModalOpen(false);
      return;
    }

    setTablePage(1);
    setExpandedEmployeeId(null);
    setNovedadActionError(null);
    if (isOperationalCoverageView) {
      setPeriodState({ ...EMPTY_ASYNC_STATE });
      setPeriodDataId(null);
      setDashboardState({ ...EMPTY_ASYNC_STATE });
      setDashboardDataId(null);
      setDesprendiblesState({ ...EMPTY_ASYNC_STATE });
      setDesprendiblesDataId(null);
    }
    void refreshSelectedPeriodData(selectedPeriodId);
  }, [isOperationalCoverageView, refreshSelectedPeriodData, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId || isOperationalCoverageView || !isSupportsTab) {
      return;
    }

    void loadDesprendibles(selectedPeriodId, includeDesprendibleVersions);
  }, [includeDesprendibleVersions, isOperationalCoverageView, isSupportsTab, loadDesprendibles, selectedPeriodId]);

  useEffect(() => {
    setTablePage(1);
  }, [
    activeTab,
    clasificacionFilter,
    estadoFilter,
    gestorFilter,
    modalidadFilter,
    municipioFilter,
    novedadesFilter,
    pageSize,
    revisionFilter,
    searchTerm,
    selectedPeriodId,
    sortBy,
  ]);

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

  const selectedCoverageEmployee =
    allEmployees.find(
      (employee) =>
        employee.persona.id === novedadForm.cobertura_persona_cubre_id ||
        employee.vinculacion_id === novedadForm.cobertura_vinculacion_cubre_id,
    ) ?? null;

  const coverageCandidates = useMemo(() => {
    const needle = normalizeEmployeeSearchValue(novedadForm.cobertura_search);

    return allEmployees
      .filter((employee) => employee.id !== selectedFormEmployee?.id)
      .map((employee) => {
        let score = 0;

        if (selectedFormEmployee?.gestor?.id && employee.gestor?.id === selectedFormEmployee.gestor.id) {
          score += 5;
        }

        if (getEmployeeMunicipioLabel(employee) === getEmployeeMunicipioLabel(selectedFormEmployee ?? employee)) {
          score += 4;
        }

        if (getEmployeeInstitucionLabel(employee) === getEmployeeInstitucionLabel(selectedFormEmployee ?? employee)) {
          score += 3;
        }

        if (getEmployeeSedeLabel(employee) === getEmployeeSedeLabel(selectedFormEmployee ?? employee)) {
          score += 2;
        }

        return {
          employee,
          score,
          haystack: normalizeEmployeeSearchValue(
            employee.persona.nombre_completo,
            employee.persona.numero_documento,
            getEmployeeMunicipioLabel(employee),
            getEmployeeInstitucionLabel(employee),
            getEmployeeSedeLabel(employee),
            getEmployeeModalidadCode(employee),
            getEmployeeGestorLabel(employee),
          ),
        };
      })
      .filter((item) => !needle || item.haystack.includes(needle))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.employee.persona.nombre_completo.localeCompare(right.employee.persona.nombre_completo, "es-CO"),
      )
      .slice(0, needle ? 10 : 6);
  }, [allEmployees, novedadForm.cobertura_search, selectedFormEmployee]);

  const novedadesCountByEmpleadoId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const novedad of allNovedades) {
      counts.set(novedad.nomina_empleado_id, (counts.get(novedad.nomina_empleado_id) ?? 0) + 1);
    }

    return counts;
  }, [allNovedades]);

  const employeeMunicipioOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Set(
          allEmployees
            .map((employee) => getEmployeeMunicipioLabel(employee))
            .filter((value) => value && value !== "No disponible"),
        ),
      )
        .sort((left, right) => left.localeCompare(right, "es-CO"))
        .map((value) => ({
          value,
          label: value,
        })),
    [allEmployees],
  );
  const novedadTypeOptions = useMemo<FilterOption[]>(
    () =>
      catalogoTiposNovedad
        .map((tipo) => ({
          value: (tipo.codigo_operativo ?? tipo.nombre ?? "").trim(),
          label: getVisibleNovedadTipoLabel(tipo),
        }))
        .filter((item) => item.value.length > 0)
        .sort((left, right) => left.label.localeCompare(right.label, "es-CO")),
    [catalogoTiposNovedad],
  );

  const employeeGestorOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Map(
          allEmployees.map((employee) => [
            employee.gestor?.id ?? "sin_gestor",
            {
              value: employee.gestor?.id ?? "sin_gestor",
              label: getEmployeeGestorLabel(employee),
            },
          ]),
        ).values(),
      ).sort((left, right) => left.label.localeCompare(right.label, "es-CO")),
    [allEmployees],
  );

  const employeeModalidadOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Set(
          allEmployees
            .map((employee) => getEmployeeModalidadCode(employee))
            .filter((value) => value && value !== "No disponible"),
        ),
      )
        .sort((left, right) => left.localeCompare(right, "es-CO"))
        .map((value) => ({
          value,
          label: value,
        })),
    [allEmployees],
  );

  const filteredEmployees = useMemo(() => {
    const searchNeedle = normalizeEmployeeSearchValue(searchTerm);
    const selectedClassification = clasificacionFilter.trim().toLowerCase();

    const filtered = allEmployees.filter((empleado) => {
      const clasificacion = (getEmployeeClassificationValue(empleado) ?? "").toLowerCase();
      const municipio = getEmployeeMunicipioLabel(empleado);
      const gestor = empleado.gestor?.id ?? "sin_gestor";
      const modalidad = getEmployeeModalidadCode(empleado);
      const reviewed = empleado.revisado ? "revisado" : "pendiente";
      const novedadesTotal =
        novedadesCountByEmpleadoId.get(empleado.id) ?? getEmployeeTotalNovedades(empleado);

      if (
        searchNeedle &&
        !normalizeEmployeeSearchValue(
          empleado.persona.nombre_completo,
          empleado.persona.numero_documento,
          municipio,
          getEmployeeInstitucionLabel(empleado),
          getEmployeeSedeLabel(empleado),
          modalidad,
          getEmployeeGestorLabel(empleado),
        ).includes(searchNeedle)
      ) {
        return false;
      }

      if (estadoFilter && getEmployeeStatusLabel(empleado).toLowerCase() !== estadoFilter.toLowerCase()) {
        return false;
      }

      if (selectedClassification && clasificacion !== selectedClassification) {
        return false;
      }

      if (municipioFilter && municipio !== municipioFilter) {
        return false;
      }

      if (gestorFilter && gestor !== gestorFilter) {
        return false;
      }

      if (modalidadFilter && modalidad !== modalidadFilter) {
        return false;
      }

      if (revisionFilter && reviewed !== revisionFilter) {
        return false;
      }

      if (novedadesFilter === "con_novedades" && novedadesTotal <= 0) {
        return false;
      }

      if (novedadesFilter === "sin_novedades" && novedadesTotal > 0) {
        return false;
      }

      return true;
    });

    filtered.sort((left, right) => {
      switch (sortBy) {
        case "nombre_desc":
          return right.persona.nombre_completo.localeCompare(left.persona.nombre_completo, "es-CO");
        case "documento_asc":
          return (left.persona.numero_documento ?? "").localeCompare(right.persona.numero_documento ?? "", "es-CO");
        case "documento_desc":
          return (right.persona.numero_documento ?? "").localeCompare(left.persona.numero_documento ?? "", "es-CO");
        case "municipio":
          return getEmployeeMunicipioLabel(left).localeCompare(getEmployeeMunicipioLabel(right), "es-CO");
        case "institucion":
          return getEmployeeInstitucionLabel(left).localeCompare(getEmployeeInstitucionLabel(right), "es-CO");
        case "sede":
          return getEmployeeSedeLabel(left).localeCompare(getEmployeeSedeLabel(right), "es-CO");
        case "gestor":
          return getEmployeeGestorLabel(left).localeCompare(getEmployeeGestorLabel(right), "es-CO");
        default:
          return left.persona.nombre_completo.localeCompare(right.persona.nombre_completo, "es-CO");
      }
    });

    return filtered;
  }, [
    allEmployees,
    clasificacionFilter,
    estadoFilter,
    gestorFilter,
    modalidadFilter,
    municipioFilter,
    novedadesCountByEmpleadoId,
    novedadesFilter,
    revisionFilter,
    searchTerm,
    sortBy,
  ]);

  const filteredNovedades = useMemo(() => {
    const searchNeedle = searchTerm.trim().toLowerCase();

    return allNovedades.filter((novedad) => {
      const nombre = novedad.persona.nombre_completo.toLowerCase();
      const documento = (novedad.persona.numero_documento ?? "").toLowerCase();
      const estado = getNovedadStatusLabel(novedad).toLowerCase();
      const municipio = (
        allEmployees.find((employee) => employee.id === novedad.nomina_empleado_id)?.municipio ?? ""
      ).toLowerCase();
      const novedadCodigo = (novedad.tipo_novedad.codigo_operativo ?? "").toLowerCase();
      const novedadNombre = (novedad.tipo_novedad.nombre ?? "").toLowerCase();

      if (searchNeedle && !`${nombre} ${documento}`.includes(searchNeedle)) {
        return false;
      }

      if (estadoFilter && estado !== estadoFilter.toLowerCase()) {
        return false;
      }

      if (municipioFilter && municipio !== municipioFilter.toLowerCase()) {
        return false;
      }

      if (tipoNovedadFilter) {
        const needle = tipoNovedadFilter.toLowerCase();
        if (novedadCodigo !== needle && novedadNombre !== needle) {
          return false;
        }
      }

      return true;
    });
  }, [allEmployees, allNovedades, estadoFilter, municipioFilter, searchTerm, tipoNovedadFilter]);

  const filteredDesprendibles = useMemo(() => {
    const searchNeedle = searchTerm.trim().toLowerCase();

    return allDesprendibles.filter((desprendible) => {
      const nombre = desprendible.persona.nombre_completo.toLowerCase();
      const documento = (desprendible.persona.numero_documento ?? "").toLowerCase();
      const estado = getDesprendibleStatusLabel(desprendible).toLowerCase();

      if (searchNeedle && !`${nombre} ${documento}`.includes(searchNeedle)) {
        return false;
      }

      if (estadoFilter && estado !== estadoFilter.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [allDesprendibles, estadoFilter, searchTerm]);
  const filteredSupports = isOperationalCoverageView ? filteredNovedades : filteredDesprendibles;

  const totalFilteredRecords = isNominaTab
    ? filteredEmployees.length
    : isNovedadesTab
      ? filteredNovedades.length
      : isSupportsTab
        ? filteredSupports.length
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
      ? isOperationalCoverageView
        ? novedadesState.loading
        : desprendiblesState.loading
      : employeesState.loading;
  const catalogPermissionDenied = tiposNovedadStatusCode === 403;
  const catalogIsEmpty = !tiposNovedadState.loading && !tiposNovedadState.error && catalogoTiposNovedad.length === 0;
  const catalogInlineError = catalogPermissionDenied
    ? "No tienes permisos para consultar el catalogo de tipos de novedad. La creacion de novedades esta deshabilitada."
    : tiposNovedadState.error;
  const globalInlineError = isOperationalCoverageView ? null : dashboardState.error;
  const canOpenNovedadModal =
    Boolean(selectedPeriodId) &&
    !employeesState.loading &&
    allEmployees.length > 0 &&
    !catalogPermissionDenied &&
    canCreateNovedad;

  const handleSelectPeriod = (periodId: string) => {
    setSelectedPeriodId(periodId);
    setExpandedEmployeeId(null);
    setRecalculateError(null);
    setNovedadActionError(null);
    setActionFeedback(null);
  };
  const handleClearFilters = () => {
    setSearchTerm("");
    setEstadoFilter("");
    setClasificacionFilter("");
    setMunicipioFilter("");
    setGestorFilter("");
    setModalidadFilter("");
    setRevisionFilter("");
    setNovedadesFilter("");
    setTipoNovedadFilter("");
    setSortBy("nombre_asc");
    setExpandedEmployeeId(null);
    setTablePage(1);
  };
  const handleToggleEmployeeDetail = (employeeId: string) => {
    setExpandedEmployeeId((current) => (current === employeeId ? null : employeeId));
  };
  const finalAdjustmentsByEmployee = useMemo(
    () => new Map(
      ajustesManuales
        .filter((item) => item.activo && item.concepto === FINAL_DEDUCTION_CONCEPT)
        .map((item) => [item.nomina_empleado_id, item] as const),
    ),
    [ajustesManuales],
  );
  const pensionExclusionsByEmployee = useMemo(
    () => new Map(
      ajustesManuales
        .filter((item) => item.activo && item.concepto === PENSION_EXCLUSION_CONCEPT)
        .map((item) => [item.nomina_empleado_id, item] as const),
    ),
    [ajustesManuales],
  );
  const canSaveManualFinal = Boolean(
    user?.permissions.some((permission) => ["nomina.movimientos.create", "nomina.movimientos.update"].includes(permission)) &&
    user?.permissions.some((permission) => ["vinculaciones.update", "vinculacion.editar"].includes(permission)),
  );
  const getManualFinalDraft = (empleado: NominaEmpleadoApi): ManualFinalDraft => {
    const existing = finalAdjustmentsByEmployee.get(empleado.id);
    const pensionExclusion = pensionExclusionsByEmployee.get(empleado.id);
    return manualFinalDrafts[empleado.id] ?? {
      cotizaPension: empleado.vinculacion.cotiza_pension && !pensionExclusion,
      tieneDeduccion: Boolean(existing),
      valorDeduccion: existing ? String(existing.valor) : "",
    };
  };
  const updateManualFinalDraft = (employeeId: string, patch: Partial<ManualFinalDraft>) => {
    setManualFinalDrafts((current) => ({
      ...current,
      [employeeId]: { ...getManualFinalDraft(allEmployees.find((item) => item.id === employeeId)!), ...patch },
    }));
  };
  const handleSaveManualFinal = async (empleado: NominaEmpleadoApi) => {
    if (!selectedPeriodId || savingManualFinalId || !canSaveManualFinal) return;
    const draft = getManualFinalDraft(empleado);
    const valor = draft.tieneDeduccion && draft.valorDeduccion.trim() !== "" ? Number(draft.valorDeduccion) : 0;
    if (!Number.isFinite(valor) || valor < 0) {
      setActionFeedback({ tone: "error", message: "El valor de deducción adicional debe ser numérico y no negativo." });
      return;
    }
    if (draft.cotizaPension && !empleado.vinculacion.cotiza_pension) {
      setActionFeedback({ tone: "error", message: "La vinculación base no cotiza pensión; este ajuste no puede activarla." });
      return;
    }
    const pensionExclusion = pensionExclusionsByEmployee.get(empleado.id);
    const currentEffectivePension = empleado.vinculacion.cotiza_pension && !pensionExclusion;
    if (draft.cotizaPension !== currentEffectivePension) {
      const message = draft.cotizaPension
        ? "Este cambio volverá a activar el cálculo de pensión para esta vinculación. ¿Deseas continuar?"
        : "Este cambio hará que la vinculación no genere deducción por pensión en los recálculos de nómina. ¿Deseas continuar?";
      if (!window.confirm(message)) return;
    }
    setSavingManualFinalId(empleado.id);
    setActionFeedback(null);
    try {
      if (draft.cotizaPension && pensionExclusion) {
        await annulAjusteManual(pensionExclusion.id, "Reactivar pensión para este periodo");
      } else if (!draft.cotizaPension && !pensionExclusion) {
        await createAjusteManual(selectedPeriodId, {
          nomina_empleado_id: empleado.id,
          tipo: "DEDUCCION",
          concepto: PENSION_EXCLUSION_CONCEPT,
          valor: 1,
          observacion: "Exclusión manual de pensión para este periodo",
        });
      }
      const existing = finalAdjustmentsByEmployee.get(empleado.id);
      if (draft.tieneDeduccion && valor > 0) {
        if (existing) {
          await updateAjusteManual(existing.id, { valor, concepto: FINAL_DEDUCTION_CONCEPT, tipo: "DEDUCCION" });
        } else {
          await createAjusteManual(selectedPeriodId, {
            nomina_empleado_id: empleado.id,
            tipo: "DEDUCCION",
            concepto: FINAL_DEDUCTION_CONCEPT,
            valor,
            observacion: "Deducción adicional final de nómina",
          });
        }
      } else if (existing) {
        await annulAjusteManual(existing.id, "Deducción adicional final retirada");
      }
      await recalculateNominaPeriodo(selectedPeriodId, { force: true, nomina_empleado_id: empleado.id });
      await Promise.all([loadEmployees(selectedPeriodId), loadAjustesManuales(selectedPeriodId)]);
      setActionFeedback({ tone: "success", message: "Ajustes manuales guardados y aplicados al empleado." });
    } catch (error) {
      setActionFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      setSavingManualFinalId(null);
    }
  };
  const handleRetry = () => {
    if (!selectedPeriodId) {
      void loadTiposNovedad();
      void loadPeriods();
      return;
    }

    const requests: Array<Promise<unknown>> = [
      loadTiposNovedad(),
      loadPeriods(selectedPeriodId),
      refreshSelectedPeriodData(selectedPeriodId),
    ];

    if (!isOperationalCoverageView) {
      requests.push(loadDesprendibles(selectedPeriodId, includeDesprendibleVersions));
    }

    void Promise.all(requests);
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
        message: "El período fue recalculado y los datos se refrescaron desde el backend.",
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
        message: `Se generó la exportación real del backend: ${metadata.file_name}.`,
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
        message: `Se abrió el desprendible vigente: ${metadata.file_name}.`,
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
      nextForm.cobertura_tipo = novedad.cobertura?.tipo_cobertura ?? "SIN_REEMPLAZO";
      nextForm.cobertura_search =
        novedad.cobertura?.persona_cubre?.nombre_completo ??
        novedad.cobertura?.nombre_externo ??
        "";
      nextForm.cobertura_persona_cubre_id = novedad.cobertura?.persona_cubre_id ?? "";
      nextForm.cobertura_vinculacion_cubre_id = novedad.cobertura?.vinculacion_cubre_id ?? "";
      nextForm.cobertura_nombre_externo = novedad.cobertura?.nombre_externo ?? "";
      nextForm.cobertura_documento_externo = novedad.cobertura?.documento_externo ?? "";
      nextForm.cobertura_observacion_externa = novedad.cobertura?.observacion_externa ?? "";
      nextForm.cobertura_observacion_interna = novedad.cobertura?.observacion_interna ?? "";
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

  const handleCoverageTypeChange = (coverageType: NovedadFormState["cobertura_tipo"]) => {
    setNovedadFormError(null);
    setNovedadForm((current) => ({
      ...current,
      cobertura_tipo: coverageType,
      cobertura_search: coverageType === "PERSONAL_VINCULADO" ? current.cobertura_search : "",
      cobertura_persona_cubre_id:
        coverageType === "PERSONAL_VINCULADO" ? current.cobertura_persona_cubre_id : "",
      cobertura_vinculacion_cubre_id:
        coverageType === "PERSONAL_VINCULADO" ? current.cobertura_vinculacion_cubre_id : "",
      cobertura_nombre_externo:
        coverageType === "PERSONA_EXTERNA" ? current.cobertura_nombre_externo : "",
      cobertura_documento_externo:
        coverageType === "PERSONA_EXTERNA" ? current.cobertura_documento_externo : "",
      cobertura_observacion_externa:
        coverageType === "PERSONA_EXTERNA" ? current.cobertura_observacion_externa : "",
    }));
  };

  const handleSelectCoverageEmployee = (employee: NominaEmpleadoApi) => {
    setNovedadFormError(null);
    setNovedadForm((current) => ({
      ...current,
      cobertura_search: employee.persona.nombre_completo,
      cobertura_persona_cubre_id: employee.persona.id,
      cobertura_vinculacion_cubre_id: employee.vinculacion_id,
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

    if (novedadForm.cobertura_tipo === "PERSONAL_VINCULADO") {
      if (!novedadForm.cobertura_persona_cubre_id || !novedadForm.cobertura_vinculacion_cubre_id) {
        return "Debes seleccionar quien cubrio el turno.";
      }

      if (novedadForm.cobertura_vinculacion_cubre_id === selectedFormEmployee.vinculacion_id) {
        return "La persona con novedad y la persona que cubre deben ser distintas.";
      }
    }

    if (novedadForm.cobertura_tipo === "PERSONA_EXTERNA") {
      if (!normalizeTextValue(novedadForm.cobertura_nombre_externo)) {
        return "Debes registrar el nombre completo de la persona externa.";
      }

      if (!normalizeTextValue(novedadForm.cobertura_documento_externo)) {
        return "Debes registrar el documento de la persona externa.";
      }
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
      const coveragePayload =
        novedadForm.cobertura_tipo === "PERSONAL_VINCULADO"
          ? {
              tipo_cobertura: "PERSONAL_VINCULADO" as const,
              persona_cubre_id: novedadForm.cobertura_persona_cubre_id,
              vinculacion_cubre_id: novedadForm.cobertura_vinculacion_cubre_id,
              observacion_interna: normalizeTextValue(novedadForm.cobertura_observacion_interna),
            }
          : novedadForm.cobertura_tipo === "PERSONA_EXTERNA"
            ? {
                tipo_cobertura: "PERSONA_EXTERNA" as const,
                nombre_externo: normalizeTextValue(novedadForm.cobertura_nombre_externo),
                documento_externo: normalizeTextValue(novedadForm.cobertura_documento_externo),
                observacion_externa: normalizeTextValue(novedadForm.cobertura_observacion_externa),
                observacion_interna: normalizeTextValue(novedadForm.cobertura_observacion_interna),
              }
            : {
                tipo_cobertura: "SIN_REEMPLAZO" as const,
                observacion_interna: normalizeTextValue(novedadForm.cobertura_observacion_interna),
              };

      const createPayload = {
        periodo_id: selectedPeriodId,
        nomina_empleado_id: selectedFormEmployee.id,
        vinculacion_id: selectedFormEmployee.vinculacion_id,
        tipo_novedad_id: selectedNovedadType.id,
        tipo_novedad_codigo: selectedNovedadType.codigo_operativo ?? null,
        revisado: novedadForm.revisado,
        requiere_cobertura: true,
        cubierta: novedadForm.cobertura_tipo !== "SIN_REEMPLAZO",
        cobertura: coveragePayload,
        activo: true,
      } as const;

      const sharedPayload = {
        tipo_novedad_id: selectedNovedadType.id,
        tipo_novedad_codigo: selectedNovedadType.codigo_operativo ?? null,
        revisado: novedadForm.revisado,
        requiere_cobertura: true,
        cubierta: novedadForm.cobertura_tipo !== "SIN_REEMPLAZO",
        cobertura: coveragePayload,
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

      const savedNovedad = editingNovedad
        ? await updateNominaNovedad(editingNovedad.id, sharedPayload)
        : await createNominaNovedad({
            ...createPayload,
            ...sharedPayload,
          });

      syncLocalNovedadState(savedNovedad);

      closeNovedadModal();
    } catch (error) {
      setNovedadFormError(toMessage(error));
    } finally {
      setIsSubmittingNovedad(false);
    }
  };

  const handleMarkNovedadReviewed = async (novedad: NominaNovedadApi) => {
    if (
      !selectedPeriodId ||
      !canUpdateNovedad ||
      novedad.revisado ||
      !novedad.activo ||
      isCanonicalProjectedNovedad(novedad)
    ) {
      return;
    }

    setMutatingNovedadId(novedad.id);
    setMutatingNovedadAction("review");
    setNovedadActionError(null);

    try {
      const updated = await updateNominaNovedad(novedad.id, { revisado: true });
      syncLocalNovedadState(updated);
    } catch (error) {
      setNovedadActionError(toMessage(error));
    } finally {
      setMutatingNovedadId(null);
      setMutatingNovedadAction(null);
    }
  };

  const handleDeactivateNovedad = async (novedad: NominaNovedadApi) => {
    if (!selectedPeriodId || !canDeactivateNovedad || !novedad.activo) {
      return;
    }

    setMutatingNovedadId(novedad.id);
    setMutatingNovedadAction("deactivate");
    setNovedadActionError(null);

    try {
      const updated = await deactivateNominaNovedad(novedad.id);
      syncLocalNovedadState(updated);
    } catch (error) {
      setNovedadActionError(toMessage(error));
    } finally {
      setMutatingNovedadId(null);
      setMutatingNovedadAction(null);
    }
  };

  const handleEditNovedad = (novedad: NominaNovedadApi) => {
    if (!canUpdateNovedad) {
      return;
    }

    openNovedadModal(novedad.nomina_empleado_id, novedad);
  };

  const ensureNovedadDocuments = async (novedadId: string) => {
    const cached = novedadDocumentosById[novedadId];
    if (cached) {
      return cached;
    }

    const documents = await getNovedadDocumentos(novedadId);
    setNovedadDocumentosById((current) => ({ ...current, [novedadId]: documents }));
    return documents;
  };

  const toggleNovedadDetail = async (novedadId: string) => {
    if (expandedNovedadId === novedadId) {
      setExpandedNovedadId(null);
      return;
    }

    setExpandedNovedadId(novedadId);

    try {
      await ensureNovedadDocuments(novedadId);
    } catch (error) {
      setActionFeedback({ tone: "error", message: toMessage(error) });
    }
  };

  const handleViewNovedadDocument = async (
    novedadId: string,
    tipo: "SOPORTE" | "SOLICITUD_PERMISO",
  ) => {
    setSupportBusyId(novedadId);

    try {
      const documents = await ensureNovedadDocuments(novedadId);
      const document = documents.slots[tipo].documento;
      if (!document?.url) {
        throw new Error(
          tipo === "SOPORTE"
            ? "Documento soporte no encontrado."
            : "Solicitud de permiso no encontrada.",
        );
      }
      window.open(document.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setActionFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      setSupportBusyId(null);
    }
  };

  const handleUploadNovedadDocument = async (
    novedadId: string,
    tipo: "SOPORTE" | "SOLICITUD_PERMISO",
    file: File | undefined,
  ) => {
    if (!file || !canUpdateNovedad) {
      return;
    }

    setSupportBusyId(novedadId);

    try {
      const documents = await uploadNovedadDocumento(novedadId, tipo, file);
      setNovedadDocumentosById((current) => ({ ...current, [novedadId]: documents }));
      await loadNovedades(selectedPeriodId ?? "");
      setActionFeedback({
        tone: "success",
        message:
          tipo === "SOPORTE"
            ? "Documento soporte cargado correctamente."
            : "Solicitud de permiso cargada correctamente.",
      });
    } catch (error) {
      setActionFeedback({ tone: "error", message: toMessage(error) });
    } finally {
      setSupportBusyId(null);
    }
  };

  const handleViewSupport = async (novedadId: string) => {
    setSupportBusyId(novedadId);
    try {
      const support = await getNovedadSupport(novedadId);
      if (!support) throw new Error('Soporte no encontrado.');
      window.open(support.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setActionFeedback({ tone: 'error', message: toMessage(error) });
    } finally { setSupportBusyId(null); }
  };

  const handleUploadSupport = async (novedadId: string, file: File | undefined) => {
    if (!file || !canUpdateNovedad) return;
    setSupportBusyId(novedadId);
    try {
      await uploadNovedadSupport(novedadId, file);
      await loadNovedades(selectedPeriodId ?? '');
      setActionFeedback({ tone: 'success', message: 'Soporte de novedad cargado correctamente.' });
    } catch (error) {
      setActionFeedback({ tone: 'error', message: toMessage(error) });
    } finally { setSupportBusyId(null); }
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
    <div className={`nomina-page ${isOperationalCoverageView ? "nomina-page--novedades" : "nomina-page--gestion"}`}>
      <CoberturaFlowNav periodId={selectedPeriodId} />
      {!isOperationalCoverageView ? (
        <div className="payroll-kpis">
          {kpis.filter((kpi) => !gestorOperationalOnly || kpi.label === "Novedades").map((kpi) => {
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
      ) : null}

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
              placeholder="Buscar trabajador, documento o contexto"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!selectedPeriodId || currentTabLoading}
            />
          </div>

          {isNominaTab ? (
            <>
              <FilterSelect
                label="Municipio"
                value={municipioFilter}
                onChange={setMunicipioFilter}
                options={employeeMunicipioOptions}
                disabled={!selectedPeriodId || employeeMunicipioOptions.length === 0}
              />

              <FilterSelect
                label="Gestor"
                value={gestorFilter}
                onChange={setGestorFilter}
                options={employeeGestorOptions}
                disabled={!selectedPeriodId || employeeGestorOptions.length === 0}
              />

              <FilterSelect
                label="Modalidad"
                value={modalidadFilter}
                onChange={setModalidadFilter}
                options={employeeModalidadOptions}
                disabled={!selectedPeriodId || employeeModalidadOptions.length === 0}
              />

              <FilterSelect
                label="Revision"
                value={revisionFilter}
                onChange={setRevisionFilter}
                options={[
                  { value: "revisado", label: "Revisadas" },
                  { value: "pendiente", label: "Pendientes" },
                ]}
                disabled={!selectedPeriodId}
              />

              <FilterSelect
                label="Novedades"
                value={novedadesFilter}
                onChange={setNovedadesFilter}
                options={[
                  { value: "con_novedades", label: "Con novedades" },
                  { value: "sin_novedades", label: "Sin novedades" },
                ]}
                disabled={!selectedPeriodId}
              />

              <FilterSelect
                label="Ordenar por"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "nombre_asc", label: "Nombre A-Z" },
                  { value: "nombre_desc", label: "Nombre Z-A" },
                  { value: "documento_asc", label: "Documento ascendente" },
                  { value: "documento_desc", label: "Documento descendente" },
                  { value: "municipio", label: "Municipio" },
                  { value: "institucion", label: "Institucion" },
                  { value: "sede", label: "Sede" },
                  { value: "gestor", label: "Gestor" },
                ]}
                disabled={!selectedPeriodId}
              />
            </>
          ) : (
            <>
              <FilterSelect
                label="Estado"
                value={estadoFilter}
                onChange={setEstadoFilter}
                options={currentStatusOptions}
                disabled={!selectedPeriodId || currentStatusOptions.length === 0}
              />

              {isNovedadesTab ? (
                <>
                  <FilterSelect
                    label="Municipio"
                    value={municipioFilter}
                    onChange={setMunicipioFilter}
                    options={employeeMunicipioOptions}
                    disabled={!selectedPeriodId || employeeMunicipioOptions.length === 0}
                  />

                  <FilterSelect
                    label="Tipo de novedad"
                    value={tipoNovedadFilter}
                    onChange={setTipoNovedadFilter}
                    options={novedadTypeOptions}
                    disabled={!selectedPeriodId || novedadTypeOptions.length === 0}
                  />
                </>
              ) : (
                <FilterSelect
                  label="Clasificacion"
                  value={clasificacionFilter}
                  onChange={setClasificacionFilter}
                  options={employeeClassificationOptions}
                  disabled={!isNominaTab || !selectedPeriodId || employeeClassificationOptions.length === 0}
                />
              )}
            </>
          )}
        </div>

        <button type="button" className="payroll-clear-button" onClick={handleClearFilters}>
          Limpiar filtros
        </button>
      </div>

      <div className="payroll-actionbar">
        {isOperationalCoverageView ? (
          <button
            type="button"
            className="payroll-action primary"
            onClick={() => openNovedadModal(null)}
            disabled={!canOpenNovedadModal}
          >
            <FilePlus2 size={18} />
            Registrar novedad
          </button>
        ) : (
          <>
            <button
              type="button"
              className="payroll-action primary"
              disabled
              title="No existe un endpoint real para crear períodos desde esta pantalla."
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
              disabled={!selectedPeriodId || isGeneratingDesprendibles || !canGenerateDesprendibles}
              title={canGenerateDesprendibles ? "Generar desprendibles reales del periodo" : "No tienes permiso para generar desprendibles"}
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
              title="No existe un endpoint real para cerrar períodos en esta pantalla."
            >
              <Lock size={18} />
              Cerrar periodo
            </button>
          </>
        )}
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
                            <span>Trabajador y contexto</span>
                            <span>Cargo / clasificacion</span>
                            <span>Liquidacion</span>
                            <span>Devengado</span>
                            <span>Dias pagados</span>
                            <span>Deducciones</span>
                            <span>Neto</span>
                            <span>Novedades</span>
                            <span>Revision</span>
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
                              const salarioDias = getEmployeeConceptDays(empleado, "salario");
                              const transporteDias = getEmployeeConceptDays(empleado, "transporte");
                              const recargoDias = getEmployeeConceptDays(empleado, "recargos");

                              return (
                                <Fragment key={empleado.id}>
                                  <div className={`payroll-table-row ${isExpanded ? "expanded" : ""}`}>
                                    <div className="cell-employee cell-employee-context">
                                      <div className={`avatar ${getAvatarTone(empleado.id)}`}>
                                        {getInitials(empleado.persona.nombre_completo)}
                                      </div>
                                      <div className="cell-employee-meta">
                                        <strong title={empleado.persona.nombre_completo}>{empleado.persona.nombre_completo}</strong>
                                        <p title={getEmployeeDocumentSummary(empleado)}>{getEmployeeDocumentSummary(empleado)}</p>
                                        <small title={getEmployeeMunicipioLabel(empleado)}>{getEmployeeMunicipioLabel(empleado)}</small>
                                        <small title={getEmployeeInstitucionLabel(empleado)}>{getEmployeeInstitucionLabel(empleado)}</small>
                                        <small title={getEmployeeSedeLabel(empleado)}>{getEmployeeSedeLabel(empleado)}</small>
                                        <small
                                          className="cell-context-accent"
                                          title={`${getEmployeeModalidadDescription(empleado)} · ${getEmployeeGestorLabel(empleado)}`}
                                        >
                                          {getEmployeeModalidadCode(empleado)} · Gestor: {getEmployeeGestorLabel(empleado)}
                                        </small>
                                      </div>
                                    </div>

                                    <div className="cell-stack">
                                      <strong title={getEmployeeCargoLabel(empleado)}>{getEmployeeCargoLabel(empleado)}</strong>
                                      <span
                                        className={`payroll-type-pill ${getEmployeeClassificationTone(empleado)}`}
                                        title={getEmployeeClassificationLabel(empleado)}
                                      >
                                        {getEmployeeClassificationLabel(empleado)}
                                      </span>
                                    </div>

                                    <div className="cell-stack">
                                      <strong title={getEmployeeMetodoLiquidacionLabel(empleado)}>{getEmployeeMetodoLiquidacionLabel(empleado)}</strong>
                                      <small title={getEmployeeContractLabel(empleado)}>
                                        Contrato {getEmployeeContractLabel(empleado)}
                                      </small>
                                    </div>

                                    <span className="cell-devengado" title={`Total adiciones: ${formatCOP(empleado.total_adiciones)} ï¿½ Devengado transporte: ${formatCOP(empleado.devengado_transporte)}`}><strong>{formatCOP(empleado.total_adiciones)}</strong><small>Transporte {formatCOP(empleado.devengado_transporte)}</small></span>

                                    <span className="cell-pay-days"><small><span>Salario</span><strong>{salarioDias.paid}/{salarioDias.base}</strong></small><small><span>Transporte</span><strong>{transporteDias.paid}/{transporteDias.base}</strong></small><small><span>Recargo</span><strong>{recargoDias.paid}/{recargoDias.base}</strong></small></span>

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
                                      <div className="payroll-person-summary">
                                        <header>
                                          <div><strong>{empleado.persona.nombre_completo}</strong><span>{getEmployeeDocumentLabel(empleado)}</span></div>
                                          <div><span>{getEmployeeCargoLabel(empleado)}</span><small>{getEmployeeMunicipioLabel(empleado)} · {getEmployeeSedeLabel(empleado)}</small></div>
                                        </header>
                                        <div className="payroll-person-groups">
                                          <section><h4>Dias pagados</h4><dl><div><dt>Salario</dt><dd>{salarioDias.paid}/{salarioDias.base}</dd></div><div><dt>Transporte</dt><dd>{transporteDias.paid}/{transporteDias.base}</dd></div><div><dt>Recargo</dt><dd>{recargoDias.paid}/{recargoDias.base}</dd></div></dl></section>
                                          <section><h4>Devengados</h4><dl><div><dt>Salario</dt><dd>{formatCOP(empleado.devengado_basico)}</dd></div><div><dt>Transporte</dt><dd>{formatCOP(empleado.devengado_transporte)}</dd></div><div><dt>Recargo / otros</dt><dd>{formatCOP(empleado.devengado_otros)}</dd></div></dl></section><InternalTurnsDetail empleado={empleado} />
                                          {(() => {
                                            const draft = getManualFinalDraft(empleado);
                                            const existing = finalAdjustmentsByEmployee.get(empleado.id);
                                            const pensionExclusion = pensionExclusionsByEmployee.get(empleado.id);
                                            const detalleSeguridad = empleado.detalle_calculo?.seguridad_social as Record<string, unknown> | undefined;
                                            return (
                                              <section className="payroll-manual-final-panel">
                                                <h4>Ajustes manuales {existing || pensionExclusion ? <span className="manual-final-badge">AJUSTE MANUAL</span> : null}</h4>
                                                <dl>
                                                  <div><dt>Total devengado</dt><dd>{formatCOP(empleado.total_adiciones)}</dd></div>
                                                  <div><dt>Salud</dt><dd>{formatCOP(empleado.salud)}</dd></div>
                                                  <div><dt>Pensión actual</dt><dd>{formatCOP(empleado.pension)}</dd></div>
                                                  <div><dt>Total deducciones</dt><dd>{formatCOP(empleado.total_deducciones)}</dd></div>
                                                  <div><dt>Neto a pagar</dt><dd>{formatCOP(empleado.neto_pagar)}</dd></div>
                                                </dl>
                                                <label>¿Cotiza pensión?
                                                  <select value={draft.cotizaPension ? "true" : "false"} onChange={(event) => updateManualFinalDraft(empleado.id, { cotizaPension: event.target.value === "true" })} disabled={!canSaveManualFinal || savingManualFinalId === empleado.id}>
                                                    <option value="true">SÍ</option><option value="false">NO</option>
                                                  </select>
                                                </label>
                                                <label>¿Tiene deducción adicional?
                                                  <select value={draft.tieneDeduccion ? "true" : "false"} onChange={(event) => updateManualFinalDraft(empleado.id, { tieneDeduccion: event.target.value === "true" })} disabled={!canSaveManualFinal || savingManualFinalId === empleado.id}>
                                                    <option value="false">NO</option><option value="true">SÍ</option>
                                                  </select>
                                                </label>
                                                {draft.tieneDeduccion ? <label>Valor deducción adicional
                                                  <input type="number" min="0" step="100" value={draft.valorDeduccion} onChange={(event) => updateManualFinalDraft(empleado.id, { valorDeduccion: event.target.value })} disabled={!canSaveManualFinal || savingManualFinalId === empleado.id} placeholder="$ 0" />
                                                </label> : null}
                                                <small>Pensión calculada original: {formatCOP(Number(detalleSeguridad?.pension_calculada ?? empleado.pension))} · Pensión aplicada: {formatCOP(empleado.pension)}</small>
                                                <button type="button" className="manual-final-save" onClick={() => void handleSaveManualFinal(empleado)} disabled={!canSaveManualFinal || savingManualFinalId === empleado.id}>
                                                  {savingManualFinalId === empleado.id ? "Guardando..." : "GUARDAR AJUSTES"}
                                                </button>
                                              </section>
                                            );
                                          })()}
                                          <section><h4>Deducciones</h4><dl><div><dt>Salud</dt><dd>{formatCOP(empleado.salud)}</dd></div><div><dt>Pension</dt><dd>{formatCOP(empleado.pension)}</dd></div><div><dt>Total</dt><dd>{formatCOP(empleado.total_deducciones)}</dd></div></dl></section>
                                          <section><h4>Novedades y turnos</h4><dl><div><dt>Novedades</dt><dd>{formatNumber(novedadesCountByEmpleadoId.get(empleado.id) ?? getEmployeeTotalNovedades(empleado))}</dd></div><div><dt>Modalidad</dt><dd title={getEmployeeModalidadDescription(empleado)}>{getEmployeeModalidadCode(empleado)}</dd></div><div><dt>Documentos</dt><dd>{getEmployeeDocumentStatusLabel(empleado)}{documentStatusPercentage ? ` · ${documentStatusPercentage}` : ""}</dd></div></dl></section>
                                        </div>
                                        <footer><span>{getEmployeeContractLabel(empleado)} · {getEmployeeMetodoLiquidacionLabel(empleado)}</span><strong>Neto {formatCOP(empleado.neto_pagar)}</strong></footer>
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
            <div className="payroll-period-card">
              <div className="payroll-table-scroll">
                <div
                  className="payroll-table-head"
                  style={{
                    gridTemplateColumns: "minmax(130px,1fr) minmax(200px,1.6fr) minmax(150px,1.1fr) minmax(210px,1.7fr) minmax(150px,1fr) 140px",
                  }}
                >
                  <span>Fecha</span>
                  <span>Trabajador</span>
                  <span>Ubicación</span>
                  <span>Novedad</span>
                  <span>Estado / soporte</span>
                  <span>Acciones</span>
                </div>

                <div>
                  {visibleNovedades.map((novedad) => {
                    const isReviewing = mutatingNovedadId === novedad.id && mutatingNovedadAction === "review";
                    const isDeactivating = mutatingNovedadId === novedad.id && mutatingNovedadAction === "deactivate";
                    const novedadType =
                      novedadTypesById.get(novedad.tipo_novedad.id) ?? buildHistoricalNovedadType(novedad.tipo_novedad);
                    const empleado =
                      allEmployees.find((item) => item.id === novedad.nomina_empleado_id) ?? null;
                    const isExpanded = expandedNovedadId === novedad.id;
                    const documents = novedadDocumentosById[novedad.id];
                    const supportStatus = documents?.slots.SOPORTE ?? {
                      cargado: novedad.documentos.SOPORTE.cargado,
                      documento: null,
                      requerido: novedad.documentos.SOPORTE.requerido,
                      tipo: "SOPORTE" as const,
                    };
                    const permissionStatus = documents?.slots.SOLICITUD_PERMISO ?? {
                      cargado: novedad.documentos.SOLICITUD_PERMISO.cargado,
                      documento: null,
                      requerido: novedad.documentos.SOLICITUD_PERMISO.requerido,
                      tipo: "SOLICITUD_PERMISO" as const,
                    };
                    const requiredDocuments = [supportStatus, permissionStatus].filter((item) => item.requerido);
                    const missingDocuments = requiredDocuments.filter((item) => !item.cargado).length;
                    const supportLabel =
                      requiredDocuments.length === 0
                        ? "No requerido"
                        : missingDocuments === 0
                          ? "Completo"
                          : `${missingDocuments} pendiente(s)`;

                    return (
                      <Fragment key={novedad.id}>
                        <div
                          className={`payroll-table-row${isExpanded ? " expanded" : ""}`}
                          style={{
                            gridTemplateColumns: "minmax(130px,1fr) minmax(200px,1.6fr) minmax(150px,1.1fr) minmax(210px,1.7fr) minmax(150px,1fr) 140px",
                          }}
                        >
                          <span className="cell-stack">
                            <strong>{formatNovedadRange(novedad)}</strong>
                            <small>{formatNumber(novedad.dias ?? 0)} días · {formatDateTime(novedad.created_at)}</small>
                          </span>
                          <span className="cell-employee">
                            <div className={`avatar ${getAvatarTone(novedad.nomina_empleado_id)}`}>
                              {getInitials(novedad.persona.nombre_completo)}
                            </div>
                            <span className="cell-employee-meta">
                              <strong>{novedad.persona.nombre_completo}</strong>
                              <small>{novedad.persona.numero_documento ?? "Documento no disponible"}</small>
                            </span>
                          </span>
                          <span className="cell-stack">
                            <strong>{empleado ? getEmployeeMunicipioLabel(empleado) : "No disponible"}</strong>
                            <small>{empleado ? getEmployeeSedeLabel(empleado) : "Sin sede"}</small>
                          </span>
                          <span className="cell-stack">
                            <strong>{getVisibleNovedadTipoLabel(novedadType)}</strong>
                            <small>{novedadType.categoria ?? "Sin categoria"}</small>
                          </span>
                          <span className="cell-stack">
                            <span className={`payroll-status-badge ${getNovedadStatusTone(novedad)}`}>{getNovedadStatusLabel(novedad)}</span>
                            <small className={`payroll-status-badge ${supportLabel === "Completo" || supportLabel === "No requerido" ? "success" : "warning"}`}>{supportLabel}</small>
                          </span>
                          <div className="payroll-row-actions">
                            <button
                              type="button"
                              title={isExpanded ? "Ocultar detalle" : "Ver detalle"}
                              aria-label={`${isExpanded ? "Ocultar detalle" : "Ver detalle"} de ${novedad.persona.nombre_completo}`}
                              onClick={() => { void toggleNovedadDetail(novedad.id); }}
                            >
                              <Eye size={16} />
                            </button>
                            {canUpdateNovedad ? (
                              <button
                                type="button"
                                title="Editar novedad"
                                aria-label={`Editar novedad de ${novedad.persona.nombre_completo}`}
                                onClick={() => handleEditNovedad(novedad)}
                                disabled={isReviewing || isDeactivating}
                              >
                                <Edit3 size={16} />
                              </button>
                            ) : null}
                            {canUpdateNovedad ? (
                              <button
                                type="button"
                                title={novedad.revisado ? "Novedad revisada" : "Marcar revisada"}
                                aria-label={`Marcar revisada ${novedad.persona.nombre_completo}`}
                                onClick={() => handleMarkNovedadReviewed(novedad)}
                                disabled={!novedad.activo || novedad.revisado || isReviewing || isDeactivating || isCanonicalProjectedNovedad(novedad)}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            ) : null}
                            {canDeactivateNovedad ? (
                              <button
                                type="button"
                                title="Desactivar novedad"
                                aria-label={`Desactivar novedad de ${novedad.persona.nombre_completo}`}
                                onClick={() => handleDeactivateNovedad(novedad)}
                                disabled={!novedad.activo || isReviewing || isDeactivating}
                              >
                                <X size={16} />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="payroll-table-row-detail">
                            <div className="payroll-detail-grid">
                              <div className="payroll-detail-item">
                                <span>Estado</span>
                                <strong>{getNovedadStatusLabel(novedad)}</strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Cobertura</span>
                                <strong>{getNovedadCoverageLabel(novedad)}</strong>
                                {getNovedadCoverageDetail(novedad) ? <small>{getNovedadCoverageDetail(novedad)}</small> : null}
                              </div>
                              <div className="payroll-detail-item">
                                <span>Modelo</span>
                                <strong>{isCanonicalProjectedNovedad(novedad) ? "Evento canonico proyectado" : "Novedad por periodo"}</strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Horas</span>
                                <strong>{formatNumber(novedad.horas ?? 0)}</strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Valor manual</span>
                                <strong>{novedad.valor_manual !== null ? formatCOP(novedad.valor_manual) : "No aplica"}</strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Salario</span>
                                <strong>{novedadType.efecto_salario}</strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Transporte</span>
                                <strong>{novedadType.efecto_auxilio_transporte}</strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Recargos</span>
                                <strong>{novedadType.efecto_recargos}</strong>
                              </div>
                              <div className="payroll-detail-item wide">
                                <span>Observación</span>
                                <strong>{novedad.observacion ?? "Sin observación registrada."}</strong>
                              </div>
                            </div>

                            <div className="payroll-inline-note compact">
                              <strong>Documentos</strong>
                              <p>Los documentos obligatorios se leen desde la parametrización real del tipo de novedad y se gestionan al final del detalle.</p>
                            </div>

                            <div className="payroll-detail-grid">
                              <div className="payroll-detail-item">
                                <span>Documento soporte</span>
                                <strong>
                                  {supportStatus.requerido
                                    ? supportStatus.cargado
                                      ? "Cargado"
                                      : "Pendiente"
                                    : "No requerido"}
                                </strong>
                              </div>
                              <div className="payroll-detail-item">
                                <span>Solicitud de permiso</span>
                                <strong>
                                  {permissionStatus.requerido
                                    ? permissionStatus.cargado
                                      ? "Cargada"
                                      : "Pendiente"
                                    : "No requerida"}
                                </strong>
                              </div>
                            </div>

                            <div className="payroll-novedad-actions">
                              {canUpdateNovedad ? (
                                <label className="payroll-inline-button">
                                  {supportStatus.cargado ? "Reemplazar soporte" : "Subir soporte"}
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    hidden
                                    disabled={supportBusyId !== null}
                                    onChange={(event) => {
                                      void handleUploadNovedadDocument(novedad.id, "SOPORTE", event.target.files?.[0]);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              ) : null}
                              {supportStatus.cargado ? (
                                <button
                                  type="button"
                                  className="payroll-inline-button"
                                  disabled={supportBusyId !== null}
                                  onClick={() => { void handleViewNovedadDocument(novedad.id, "SOPORTE"); }}
                                >
                                  Ver soporte
                                </button>
                              ) : null}
                              {permissionStatus.requerido && canUpdateNovedad ? (
                                <label className="payroll-inline-button">
                                  {permissionStatus.cargado ? "Reemplazar solicitud" : "Subir solicitud"}
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    hidden
                                    disabled={supportBusyId !== null}
                                    onChange={(event) => {
                                      void handleUploadNovedadDocument(novedad.id, "SOLICITUD_PERMISO", event.target.files?.[0]);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              ) : null}
                              {permissionStatus.cargado ? (
                                <button
                                  type="button"
                                  className="payroll-inline-button"
                                  disabled={supportBusyId !== null}
                                  onClick={() => { void handleViewNovedadDocument(novedad.id, "SOLICITUD_PERMISO"); }}
                                >
                                  Ver solicitud
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      ) : activeTab === "soportes" ? (
        isOperationalCoverageView ? (
          <>
            {!selectedPeriodId ? (
              <StateCard
                title="Selecciona un periodo"
                message="Los soportes se consultan por periodo."
              />
            ) : novedadesState.loading && allNovedades.length === 0 ? (
              <StateCard
                title="Cargando soportes"
                message="Consultando soportes asociados a las novedades del periodo..."
              />
            ) : novedadesState.error ? (
              <StateCard
                title="No fue posible cargar soportes"
                message={novedadesState.error}
                tone="error"
                actionLabel="Reintentar"
                onAction={handleRetry}
              />
            ) : allNovedades.length === 0 ? (
              <StateCard
                title="Sin novedades"
                message="No hay novedades registradas para este periodo."
              />
            ) : visibleNovedades.length === 0 ? (
              <StateCard
                title="Sin resultados"
                message="No hay soportes que coincidan con los filtros actuales."
              />
            ) : (
              <div className="payroll-novedades-list">
                {visibleNovedades.map((novedad) => {
                  const novedadType =
                    novedadTypesById.get(novedad.tipo_novedad.id) ?? buildHistoricalNovedadType(novedad.tipo_novedad);

                  return (
                    <article className="payroll-novedad-card" key={`support-${novedad.id}`}>
                      <div className="payroll-novedad-top">
                        <div className="payroll-novedad-persona">
                          <div className={`avatar ${getAvatarTone(novedad.nomina_empleado_id)}`}>
                            {getInitials(novedad.persona.nombre_completo)}
                          </div>
                          <div>
                            <strong>{novedad.persona.nombre_completo}</strong>
                            <p>
                              {novedad.persona.numero_documento ?? "Documento no disponible"} ·{" "}
                              {getVisibleNovedadTipoLabel(novedadType)}
                            </p>
                          </div>
                        </div>
                        <span className={`payroll-status-badge ${novedad.documento_persona_id ? "success" : "warning"}`}>
                          {novedad.documento_persona_id ? "Soporte cargado" : "Soporte pendiente"}
                        </span>
                      </div>

                      <div className="payroll-novedad-grid">
                        <div>
                          <span>Periodo</span>
                          <strong>{selectedPeriodLabel}</strong>
                        </div>
                        <div>
                          <span>Rango</span>
                          <strong>{formatNovedadRange(novedad)}</strong>
                        </div>
                        <div>
                          <span>Cobertura</span>
                          <strong>{getNovedadCoverageLabel(novedad)}</strong>
                        </div>
                      </div>

                      <div className="payroll-novedad-footer">
                        <p>{novedad.observacion ?? "Sin observacion registrada."}</p>

                        <div className="payroll-novedad-actions">
                          {canUpdateNovedad ? (
                            <label className="payroll-inline-button">
                              {novedad.documento_persona_id ? "Reemplazar soporte" : "Subir soporte"}
                              <input type="file" accept="application/pdf" hidden disabled={supportBusyId !== null} onChange={(event) => { void handleUploadSupport(novedad.id, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                            </label>
                          ) : null}
                          {novedad.documento_persona_id ? (
                            <button type="button" className="payroll-inline-button" disabled={supportBusyId !== null} onClick={() => { void handleViewSupport(novedad.id); }}>
                              Ver soporte
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
          {!selectedPeriodId ? (
            <StateCard
              title="Selecciona un periodo"
              message="La consulta real de desprendibles depende del período de nómina."
            />
          ) : desprendiblesState.loading && allDesprendibles.length === 0 ? (
            <StateCard
              title="Cargando desprendibles"
              message="Consultando desprendibles reales del período seleccionado..."
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
              message="El backend no reporta desprendibles para este período."
            />
          ) : (
            <>
              <div className="payroll-inline-note compact">
                <strong>Desprendibles reales</strong>
                <p>
                  Esta pestaña usa `GET /nomina/desprendibles/:periodo_id` y permite alternar entre
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
                      <span>Período</span>
                      <span>Versión</span>
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
                          <span>{desprendible.es_vigente ? "Sí" : "No"}</span>
                          <span>{getDesprendibleFileLabel(desprendible)}</span>
                          <span>{desprendible.tipo_desprendible ?? "No disponible"}</span>

                          <div className="cell-row-actions">
                            <button
                              type="button"
                              title={
                                desprendible.es_vigente
                                  ? "Abrir desprendible vigente"
                                  : "El backend no expone descarga directa para versiones históricas."
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
        )
      ) : (
        <div className="payroll-placeholder">
          <p>Esta pestana se conectara despues de finalizar Nomina base.</p>
        </div>
      )}

      {isRecordsTab ? (
        <div className="payroll-pagination">
          <span>
            Mostrando {showingFrom}-{showingTo} de {formatNumber(totalFilteredRecords)}{" "}
            {isNominaTab ? "empleados" : isNovedadesTab ? "novedades" : isOperationalCoverageView ? "soportes" : "desprendibles"}
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
                        {employee.persona.nombre_completo} · {employee.persona.numero_documento ?? "Documento no disponible"}
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

              <div className="payroll-coverage-section">
                <div className="payroll-coverage-header">
                  <strong>Cobertura del turno</strong>
                  <span>Define si hubo reemplazo y quien cubrio.</span>
                </div>

                <div className="payroll-coverage-options">
                  {[
                    ["SIN_REEMPLAZO", "Sin reemplazo / No aplica"],
                    ["PERSONAL_VINCULADO", "Cubierto por personal vinculado"],
                    ["PERSONA_EXTERNA", "Cubierto por persona externa"],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className={`payroll-coverage-option ${
                        novedadForm.cobertura_tipo === value ? "active" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="cobertura_tipo"
                        value={value}
                        checked={novedadForm.cobertura_tipo === value}
                        onChange={() =>
                          handleCoverageTypeChange(value as NovedadFormState["cobertura_tipo"])
                        }
                        disabled={isSubmittingNovedad}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {novedadForm.cobertura_tipo === "PERSONAL_VINCULADO" ? (
                  <div className="payroll-coverage-panel">
                    <label className="payroll-form-field">
                      <span>Quien cubrio el turno</span>
                      <input
                        value={novedadForm.cobertura_search}
                        onChange={(event) =>
                          handleFormValueChange("cobertura_search", event.target.value)
                        }
                        placeholder="Buscar por nombre o documento"
                        disabled={isSubmittingNovedad}
                      />
                    </label>

                    {selectedCoverageEmployee ? (
                      <div className="payroll-inline-note compact">
                        <p>
                          Seleccionado: {selectedCoverageEmployee.persona.nombre_completo} ·{" "}
                          {selectedCoverageEmployee.persona.numero_documento ?? "Documento no disponible"} ·{" "}
                          {getEmployeeMunicipioLabel(selectedCoverageEmployee)} ·{" "}
                          {getEmployeeGestorLabel(selectedCoverageEmployee)}
                        </p>
                      </div>
                    ) : null}

                    <div className="payroll-coverage-results">
                      {coverageCandidates.map(({ employee }) => (
                        <button
                          key={employee.id}
                          type="button"
                          className={`payroll-coverage-result ${
                            selectedCoverageEmployee?.id === employee.id ? "active" : ""
                          }`}
                          onClick={() => handleSelectCoverageEmployee(employee)}
                          disabled={isSubmittingNovedad}
                        >
                          <strong>{employee.persona.nombre_completo}</strong>
                          <span>{employee.persona.numero_documento ?? "Documento no disponible"}</span>
                          <small>
                            {getEmployeeMunicipioLabel(employee)} · {getEmployeeInstitucionLabel(employee)}
                          </small>
                          <small>
                            {getEmployeeSedeLabel(employee)} · {getEmployeeModalidadCode(employee)} ·{" "}
                            {getEmployeeGestorLabel(employee)}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {novedadForm.cobertura_tipo === "PERSONA_EXTERNA" ? (
                  <div className="payroll-form-grid">
                    <label className="payroll-form-field">
                      <span>Nombre completo</span>
                      <input
                        value={novedadForm.cobertura_nombre_externo}
                        onChange={(event) =>
                          handleFormValueChange("cobertura_nombre_externo", event.target.value)
                        }
                        placeholder="Nombre de quien cubrio"
                        disabled={isSubmittingNovedad}
                      />
                    </label>

                    <label className="payroll-form-field">
                      <span>Documento</span>
                      <input
                        value={novedadForm.cobertura_documento_externo}
                        onChange={(event) =>
                          handleFormValueChange("cobertura_documento_externo", event.target.value)
                        }
                        placeholder="Documento de la persona externa"
                        disabled={isSubmittingNovedad}
                      />
                    </label>

                    <label className="payroll-form-field">
                      <span>Observacion externa</span>
                      <textarea
                        value={novedadForm.cobertura_observacion_externa}
                        onChange={(event) =>
                          handleFormValueChange("cobertura_observacion_externa", event.target.value)
                        }
                        placeholder="Observacion opcional"
                        rows={3}
                        disabled={isSubmittingNovedad}
                      />
                    </label>
                  </div>
                ) : null}

                <label className="payroll-form-field">
                  <span>Observacion interna de cobertura</span>
                  <textarea
                    value={novedadForm.cobertura_observacion_interna}
                    onChange={(event) =>
                      handleFormValueChange("cobertura_observacion_interna", event.target.value)
                    }
                    placeholder="Contexto adicional de la cobertura"
                    rows={3}
                    disabled={isSubmittingNovedad}
                  />
                </label>
              </div>

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
              </div>

              {selectedFormEmployee ? (
                <div className="payroll-inline-note compact">
                  <p>
                    {selectedFormEmployee.persona.nombre_completo} · {selectedFormEmployee.persona.numero_documento ?? "Documento no disponible"} · {getEmployeeMunicipioLabel(selectedFormEmployee)} · {getEmployeeInstitucionLabel(selectedFormEmployee)} · {getEmployeeSedeLabel(selectedFormEmployee)}
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










