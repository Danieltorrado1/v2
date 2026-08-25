import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArchiveX,
  Ban,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCompanyContext } from "../../context/CompanyContext";
import { pickAvailableScopedId } from "../../context/companyScope";
import {
  actualizarCorreccionNomina,
  anularCorreccionNomina,
  aprobarCorreccionNomina,
  crearCorreccionNomina,
  desactivarCorreccionNomina,
  getAllNominaLiquidaciones,
  getAllNominaMovimientos,
  getAllNominaNovedades,
  getAllNominaPeriodoEmpleados,
  getNominaDesprendibles,
  getNominaPeriodos,
  listarCorreccionesNomina,
  obtenerCorreccionNomina,
  openNominaDesprendible,
  rechazarCorreccionNomina,
  revisarCorreccionNomina,
  solicitarCorreccionNomina,
} from "../../services/nominaApi";
import {
  NOMINA_CORRECCION_FILTER_ESTADOS,
  NOMINA_CORRECCION_FILTER_TIPOS,
  NOMINA_CORRECCION_TIPOS,
} from "../../types/nomina.types";
import type {
  CreateNominaCorreccionPayload,
  NominaCorreccion,
  NominaCorreccionDetalle,
  NominaCorreccionEstado,
  NominaCorreccionFilters,
  NominaCorreccionListItem,
  NominaCorreccionTipo,
  NominaCorreccionesResponse,
  NominaDesprendibleApi,
  NominaEmpleadoApi,
  NominaEntityId,
  NominaLiquidacion,
  NominaMovimientoApi,
  NominaNovedadApi,
  PaginatedNominaPeriodosApi,
  UpdateNominaCorreccionPayload,
} from "../../types/nomina.types";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import "./NominaPages.css";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type AsyncState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

type FeedbackState = {
  message: string;
  tone: "success" | "error" | "neutral";
} | null;

type FilterOption = {
  label: string;
  value: string;
};

type Kpi = {
  caption: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
  tone: Tone;
  value: string;
};

type SupportData = {
  desprendibles: NominaDesprendibleApi[];
  empleados: NominaEmpleadoApi[];
  liquidaciones: NominaLiquidacion[];
  movimientos: NominaMovimientoApi[];
  novedades: NominaNovedadApi[];
};

type ObservationActionType = "reject" | "cancel";

type ObservationActionState = {
  correction: NominaCorreccionListItem;
  type: ObservationActionType;
} | null;

type CorrectionFormMode = "create" | "edit" | null;

type CorrectionFormValues = {
  concepto: string;
  desprendible_origen_id: string;
  liquidacion_id: string;
  motivo: string;
  movimiento_id: string;
  nomina_empleado_id: string;
  novedad_id: string;
  tipo_correccion: NominaCorreccionTipo | "";
  valor_anterior: string;
  valor_nuevo: string;
};

const EMPTY_ASYNC_STATE = {
  loading: false,
  data: null,
  error: null,
};

const EMPTY_EMPLOYEES: NominaEmpleadoApi[] = [];
const EMPTY_CORRECTIONS: NominaCorreccionListItem[] = [];
const PERIODS_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 25;

const CORRECCION_REFERENCE_FIELD_BY_TIPO: Partial<
  Record<
    NominaCorreccionTipo,
    "desprendible_origen_id" | "liquidacion_id" | "movimiento_id" | "novedad_id"
  >
> = {
  DESPRENDIBLE: "desprendible_origen_id",
  LIQUIDACION: "liquidacion_id",
  MOVIMIENTO: "movimiento_id",
  NOVEDAD: "novedad_id",
};

const CORRECCION_PERMISSION = {
  approve: "nomina.correcciones.approve",
  cancel: "nomina.correcciones.cancel",
  create: "nomina.correcciones.create",
  read: "nomina.correcciones.read",
  review: "nomina.correcciones.review",
  update: "nomina.correcciones.update",
} as const;

function toId(value: NominaEntityId | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function formatCOP(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No disponible";
  }

  return `$${value.toLocaleString("es-CO")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No disponible";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "No disponible";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBoolean(value: boolean) {
  return value ? "Si" : "No";
}

function titleCase(value: string | null | undefined) {
  if (!value) {
    return "No disponible";
  }

  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function getActorLabel(value: NominaEntityId | null | undefined) {
  return value === null || value === undefined ? "No disponible" : `Usuario #${value}`;
}

function getInitials(value: string | null | undefined) {
  if (!value) {
    return "NA";
  }

  const parts = value
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "NA";
  }

  return parts.map((item) => item[0]?.toUpperCase() ?? "").join("");
}

function getAvatarColor(value: string) {
  const colors = ["green", "blue", "purple", "orange", "red", "cyan", "teal", "pink"] as const;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % colors.length;
  }

  return colors[Math.abs(hash) % colors.length];
}

function hasPermission(permissions: string[] | undefined, permission: string) {
  return permissions?.includes(permission) ?? false;
}

function createInitialForm(employeeId = ""): CorrectionFormValues {
  return {
    concepto: "",
    desprendible_origen_id: "",
    liquidacion_id: "",
    motivo: "",
    movimiento_id: "",
    nomina_empleado_id: employeeId,
    novedad_id: "",
    tipo_correccion: "",
    valor_anterior: "",
    valor_nuevo: "",
  };
}

function getCurrentReferenceField(
  tipo: CorrectionFormValues["tipo_correccion"],
): "desprendible_origen_id" | "liquidacion_id" | "movimiento_id" | "novedad_id" | null {
  if (!tipo) {
    return null;
  }

  return CORRECCION_REFERENCE_FIELD_BY_TIPO[tipo] ?? null;
}

function NpSelect({
  disabled = false,
  emptyOptionLabel,
  icon: Icon,
  includeEmptyOption = true,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  emptyOptionLabel?: string;
  icon?: ComponentType<{ size?: number }>;
  includeEmptyOption?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  value: string;
}) {
  return (
    <div className={`np-select-wrap${disabled ? " is-disabled" : ""}`}>
      {Icon ? <Icon size={15} /> : null}
      <select
        aria-label={label}
        className="np-select"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {includeEmptyOption ? <option value="">{emptyOptionLabel ?? label}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
    </div>
  );
}

function StateCard({
  actionLabel,
  message,
  onAction,
  title,
  tone = "neutral",
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`np-state-card ${tone}`}>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="np-btn" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ObservationModal({
  busy,
  correction,
  observation,
  onCancel,
  onChange,
  onSubmit,
  type,
}: {
  busy: boolean;
  correction: NominaCorreccionListItem;
  observation: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  type: ObservationActionType;
}) {
  const isReject = type === "reject";

  return (
    <div className="np-modal-backdrop" role="presentation">
      <div className="np-modal-card" role="dialog" aria-modal="true" aria-labelledby="np-modal-title">
        <div className="np-modal-header">
          <div>
            <h3 id="np-modal-title">{isReject ? "Rechazar correccion" : "Anular correccion"}</h3>
            <p>
              {isReject
                ? "La observacion es obligatoria para rechazar la correccion."
                : "La observacion es obligatoria para anular la correccion."}
            </p>
          </div>
          <button type="button" className="np-icon-button" onClick={onCancel} disabled={busy}>
            <X size={14} />
          </button>
        </div>

        <div className="np-detail-grid">
          <div className="np-detail-field">
            <span>Persona</span>
            <strong>{correction.empleado.nombre_completo ?? "No disponible"}</strong>
          </div>
          <div className="np-detail-field">
            <span>Concepto</span>
            <strong>{correction.concepto}</strong>
          </div>
          <div className="np-detail-field">
            <span>Estado actual</span>
            <strong>{titleCase(correction.estado)}</strong>
          </div>
        </div>

        <label className="np-form-field">
          <span>Observacion *</span>
          <textarea
            className="np-form-control np-form-textarea"
            value={observation}
            onChange={(event) => onChange(event.target.value)}
            disabled={busy}
            placeholder="Explica el motivo de la decision"
          />
        </label>

        <div className="np-form-actions">
          <button type="button" className="np-btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`np-btn ${isReject ? "danger-outline" : "primary"}`}
            onClick={onSubmit}
            disabled={busy}
          >
            {isReject ? "Confirmar rechazo" : "Confirmar anulacion"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CorreccionNominaPage() {
  const { user } = useAuth();
  const { empresaId } = useCompanyContext();
  const permissions = user?.permissions ?? [];

  const canRead = hasPermission(permissions, CORRECCION_PERMISSION.read);
  const canCreate = hasPermission(permissions, CORRECCION_PERMISSION.create);
  const canUpdate = hasPermission(permissions, CORRECCION_PERMISSION.update);
  const canReview = hasPermission(permissions, CORRECCION_PERMISSION.review);
  const canApprove = hasPermission(permissions, CORRECCION_PERMISSION.approve);
  const canCancel = hasPermission(permissions, CORRECCION_PERMISSION.cancel);

  const [periodsState, setPeriodsState] =
    useState<AsyncState<PaginatedNominaPeriodosApi>>(EMPTY_ASYNC_STATE);
  const [supportState, setSupportState] = useState<AsyncState<SupportData>>(EMPTY_ASYNC_STATE);
  const [correctionsState, setCorrectionsState] =
    useState<AsyncState<NominaCorreccionesResponse>>(EMPTY_ASYNC_STATE);
  const [detailState, setDetailState] =
    useState<AsyncState<NominaCorreccionDetalle>>(EMPTY_ASYNC_STATE);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedCorrectionId, setSelectedCorrectionId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIST_LIMIT);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [formMode, setFormMode] = useState<CorrectionFormMode>(null);
  const [formState, setFormState] = useState<CorrectionFormValues>(createInitialForm());
  const [savingForm, setSavingForm] = useState(false);
  const [processingActionKey, setProcessingActionKey] = useState<string | null>(null);
  const [observationAction, setObservationAction] = useState<ObservationActionState>(null);
  const [observationValue, setObservationValue] = useState("");
  const [reloadListTick, setReloadListTick] = useState(0);
  const [activeCorrectionsSnapshot, setActiveCorrectionsSnapshot] = useState<NominaCorreccionListItem[]>([]);

  const currentFilters = useMemo<NominaCorreccionFilters>(() => {
    return {
      activo: showInactive ? false : true,
      estado: estadoFilter || undefined,
      limit,
      nomina_empleado_id: employeeFilter || undefined,
      page,
      periodo_id: selectedPeriodId || undefined,
      search: debouncedSearch || undefined,
      tipo_correccion: tipoFilter || undefined,
    };
  }, [debouncedSearch, employeeFilter, estadoFilter, limit, page, selectedPeriodId, showInactive, tipoFilter]);

  const employees = supportState.data?.empleados ?? EMPTY_EMPLOYEES;
  const employeeById = useMemo(() => {
    return new Map(employees.map((employee) => [toId(employee.id), employee]));
  }, [employees]);

  const corrections = correctionsState.data?.items ?? EMPTY_CORRECTIONS;
  const kpiSource = showInactive ? activeCorrectionsSnapshot : corrections;

  const employeeOptions = useMemo<FilterOption[]>(() => {
    return employees.map((employee) => ({
      label: `${employee.persona.nombre_completo} - ${employee.persona.numero_documento ?? "Sin documento"}`,
      value: toId(employee.id),
    }));
  }, [employees]);

  const periodOptions = useMemo<FilterOption[]>(() => {
    return (periodsState.data?.items ?? []).map((periodo) => ({
      label: periodo.nombre_periodo,
      value: toId(periodo.id),
    }));
  }, [periodsState.data]);

  const estadoOptions = useMemo<FilterOption[]>(() => {
    return NOMINA_CORRECCION_FILTER_ESTADOS.map((estado) => ({
      label: titleCase(estado),
      value: estado,
    }));
  }, []);

  const tipoOptions = useMemo<FilterOption[]>(() => {
    return NOMINA_CORRECCION_FILTER_TIPOS.map((tipo) => ({
      label: titleCase(tipo),
      value: tipo,
    }));
  }, []);

  const detailCorrection = detailState.data;
  const selectedSupportEmployee = detailCorrection
    ? employeeById.get(toId(detailCorrection.empleado.nomina_empleado_id)) ?? null
    : null;

  const vigenteDesprendibleByVinculacion = useMemo(() => {
    const vigentes = (supportState.data?.desprendibles ?? []).filter((item) => item.es_vigente);
    return new Map(vigentes.map((item) => [toId(item.vinculacion_id), item]));
  }, [supportState.data]);

  const selectedVigenteDesprendible = detailCorrection
    ? vigenteDesprendibleByVinculacion.get(toId(detailCorrection.empleado.vinculacion_id)) ?? null
    : null;

  const formSelectedEmployee = formState.nomina_empleado_id
    ? employeeById.get(formState.nomina_empleado_id) ?? null
    : null;

  const formReferenceField = getCurrentReferenceField(formState.tipo_correccion);

  const referenceOptions = useMemo<FilterOption[]>(() => {
    if (!supportState.data || !formReferenceField || !formSelectedEmployee) {
      return [];
    }

    const targetEmpleadoId = toId(formSelectedEmployee.id);
    const targetVinculacionId = toId(formSelectedEmployee.vinculacion_id);

    if (formReferenceField === "movimiento_id") {
      return supportState.data.movimientos
        .filter(
          (item) =>
            toId(item.nomina_empleado_id) === targetEmpleadoId &&
            toId(item.vinculacion_id) === targetVinculacionId,
        )
        .map((item) => ({
          label: `${titleCase(item.tipo_movimiento)} - ${formatDate(item.fecha ?? item.created_at)} - ${formatCOP(item.valor_total)}`,
          value: toId(item.id),
        }));
    }

    if (formReferenceField === "novedad_id") {
      return supportState.data.novedades
        .filter(
          (item) =>
            toId(item.nomina_empleado_id) === targetEmpleadoId &&
            toId(item.vinculacion_id) === targetVinculacionId,
        )
        .map((item) => ({
          label: `${item.tipo_novedad.nombre ?? "Novedad"} - ${formatDate(item.fecha_inicio ?? item.created_at)} - ${formatCOP(item.valor_manual)}`,
          value: toId(item.id),
        }));
    }

    if (formReferenceField === "liquidacion_id") {
      return supportState.data.liquidaciones
        .filter((item) => toId(item.vinculacion_id) === targetVinculacionId)
        .map((item) => ({
          label: `${item.persona.nombre_completo} - ${titleCase(item.estado)} - ${formatCOP(item.total_liquidacion)}`,
          value: toId(item.id),
        }));
    }

    return supportState.data.desprendibles
      .filter(
        (item) =>
          toId(item.nomina_empleado_id) === targetEmpleadoId &&
          toId(item.vinculacion_id) === targetVinculacionId,
      )
      .map((item) => ({
        label: `V${item.version} - ${item.es_vigente ? "Vigente" : "Historico"} - ${formatDate(item.fecha_generacion ?? item.created_at)}`,
        value: toId(item.id),
      }));
  }, [formReferenceField, formSelectedEmployee, supportState.data]);

  const selectedReferenceValue = formReferenceField ? formState[formReferenceField] : "";

  const kpis = useMemo<Kpi[]>(() => {
    const total = kpiSource.length;
    const byEstado = (estado: NominaCorreccionEstado) =>
      kpiSource.filter((item) => item.estado === estado && item.activo).length;
    const diferenciaTotal = kpiSource.reduce((sum, item) => sum + item.valores.diferencia, 0);

    return [
      {
        caption: "Correcciones activas cargadas para el periodo actual",
        icon: ClipboardList,
        label: "Total",
        tone: "primary",
        value: total.toLocaleString("es-CO"),
      },
      {
        caption: "Registros en estado BORRADOR",
        icon: Pencil,
        label: "Borradores",
        tone: "neutral",
        value: byEstado("BORRADOR").toLocaleString("es-CO"),
      },
      {
        caption: "Registros solicitados y en revision",
        icon: Send,
        label: "En flujo",
        tone: "warning",
        value: (byEstado("SOLICITADA") + byEstado("EN_REVISION")).toLocaleString("es-CO"),
      },
      {
        caption: "Correcciones aprobadas",
        icon: CheckCircle2,
        label: "Aprobadas",
        tone: "success",
        value: byEstado("APROBADA").toLocaleString("es-CO"),
      },
      {
        caption: "Correcciones rechazadas o anuladas",
        icon: XCircle,
        label: "Cerradas",
        tone: "danger",
        value: (byEstado("RECHAZADA") + byEstado("ANULADA")).toLocaleString("es-CO"),
      },
      {
        caption: "Suma de valor_nuevo - valor_anterior",
        icon: Wallet,
        label: "Diferencia total",
        tone: "info",
        value: formatCOP(diferenciaTotal),
      },
    ];
  }, [kpiSource]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriods() {
      setPeriodsState({
        loading: true,
        data: null,
        error: null,
      });

      try {
        const data = await getNominaPeriodos({
          page: 1,
          limit: PERIODS_LIMIT,
          empresa_id: empresaId ? String(empresaId) : undefined,
        });

        if (cancelled) {
          return;
        }

        setPeriodsState({
          loading: false,
          data,
          error: null,
        });

        const defaultPeriod = pickDefaultNominaPeriod(data.items);
        setSelectedPeriodId((current) =>
          pickAvailableScopedId(data.items, current, current) ?? toId(defaultPeriod?.id),
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPeriodsState({
          loading: false,
          data: null,
          error: toMessage(error),
        });
      }
    }

    if (canRead) {
      void loadPeriods();
    } else {
      setPeriodsState(EMPTY_ASYNC_STATE);
    }

    return () => {
      cancelled = true;
    };
  }, [canRead, empresaId]);

  useEffect(() => {
    setSelectedCorrectionId("");
    setDetailState(EMPTY_ASYNC_STATE);
    setFormMode(null);
    setObservationAction(null);
    setFeedback(null);
    setSearch("");
    setDebouncedSearch("");
    setEmployeeFilter("");
    setEstadoFilter("");
    setTipoFilter("");
    setShowInactive(false);
    setPage(1);
    setFormState(createInitialForm());
  }, [selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId || !canRead) {
      setSupportState(EMPTY_ASYNC_STATE);
      return;
    }

    let cancelled = false;

    async function loadSupportData() {
      setSupportState({
        loading: true,
        data: null,
        error: null,
      });

      try {
        const [employeesResponse, movimientosResponse, novedadesResponse, liquidacionesResponse, desprendibles] =
          await Promise.all([
            getAllNominaPeriodoEmpleados(selectedPeriodId, {
              empresa_id: empresaId ? String(empresaId) : undefined,
            }),
            getAllNominaMovimientos({
              periodo_id: selectedPeriodId,
              activo: true,
            }),
            getAllNominaNovedades({
              periodo_id: selectedPeriodId,
              activo: true,
            }),
            getAllNominaLiquidaciones(selectedPeriodId),
            getNominaDesprendibles(selectedPeriodId),
          ]);

        if (cancelled) {
          return;
        }

        setSupportState({
          loading: false,
          data: {
            desprendibles,
            empleados: employeesResponse.items,
            liquidaciones: liquidacionesResponse.items,
            movimientos: movimientosResponse.items,
            novedades: novedadesResponse.items,
          },
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSupportState({
          loading: false,
          data: null,
          error: toMessage(error),
        });
      }
    }

    void loadSupportData();

    return () => {
      cancelled = true;
    };
  }, [canRead, empresaId, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId || !canRead) {
      setCorrectionsState(EMPTY_ASYNC_STATE);
      return;
    }

    let cancelled = false;

    async function loadCorrections() {
      setCorrectionsState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));

      try {
        const data = await listarCorreccionesNomina(currentFilters);

        if (cancelled) {
          return;
        }

        setCorrectionsState({
          loading: false,
          data,
          error: null,
        });

        if (!showInactive) {
          setActiveCorrectionsSnapshot(data.items);
        }

        setSelectedCorrectionId((current) => {
          const stillExists = data.items.some((item) => toId(item.id) === current);
          if (stillExists) {
            return current;
          }

          return toId(data.items[0]?.id);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCorrectionsState({
          loading: false,
          data: null,
          error: toMessage(error),
        });
      }
    }

    void loadCorrections();

    return () => {
      cancelled = true;
    };
  }, [canRead, currentFilters, reloadListTick, selectedPeriodId, showInactive]);

  useEffect(() => {
    if (!selectedCorrectionId || !canRead) {
      setDetailState(EMPTY_ASYNC_STATE);
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));

      try {
        const data = await obtenerCorreccionNomina(selectedCorrectionId);

        if (cancelled) {
          return;
        }

        setDetailState({
          loading: false,
          data,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setDetailState({
          loading: false,
          data: null,
          error: toMessage(error),
        });
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [canRead, selectedCorrectionId]);

  const selectedListItem = corrections.find((item) => toId(item.id) === selectedCorrectionId) ?? null;

  const selectedDetailCorrection = detailCorrection ?? selectedListItem;

  function resetForm(nextEmployeeId = employeeFilter) {
    setFormState(createInitialForm(nextEmployeeId));
  }

  function openCreateForm() {
    resetForm();
    setFormMode("create");
    setFeedback(null);
  }

  function openEditForm(correction: NominaCorreccionDetalle) {
    if (correction.estado !== "BORRADOR") {
      setFeedback({
        tone: "error",
        message: "Solo las correcciones en BORRADOR pueden editarse.",
      });
      return;
    }

    setFormState({
      concepto: correction.concepto,
      desprendible_origen_id: toId(correction.referencias?.desprendible_origen_id),
      liquidacion_id: toId(correction.referencias?.liquidacion_id),
      motivo: correction.motivo,
      movimiento_id: toId(correction.referencias?.movimiento_id),
      nomina_empleado_id: toId(correction.empleado.nomina_empleado_id),
      novedad_id: toId(correction.referencias?.novedad_id),
      tipo_correccion: correction.tipo_correccion as NominaCorreccionTipo,
      valor_anterior: String(correction.valores.valor_anterior),
      valor_nuevo: String(correction.valores.valor_nuevo),
    });
    setFormMode("edit");
    setFeedback(null);
  }

  function validateForm() {
    if (!selectedPeriodId) {
      return "Debes seleccionar un periodo.";
    }

    if (!formState.nomina_empleado_id) {
      return "Debes seleccionar un empleado.";
    }

    if (!formState.tipo_correccion) {
      return "Debes seleccionar un tipo de correccion.";
    }

    if (!formState.concepto.trim()) {
      return "El concepto es obligatorio.";
    }

    if (!formState.motivo.trim()) {
      return "El motivo es obligatorio.";
    }

    const valorAnterior = Number(formState.valor_anterior);
    const valorNuevo = Number(formState.valor_nuevo);

    if (!Number.isFinite(valorAnterior) || !Number.isFinite(valorNuevo)) {
      return "Los valores deben ser numericos.";
    }

    if (valorAnterior < 0 || valorNuevo < 0) {
      return "Los valores no pueden ser negativos.";
    }

    const referenceField = getCurrentReferenceField(formState.tipo_correccion);
    if (referenceField && !formState[referenceField]) {
      return "Debes seleccionar el recurso relacionado para este tipo de correccion.";
    }

    return null;
  }

  function buildReferencePayload() {
    const referenceField = getCurrentReferenceField(formState.tipo_correccion);

    return {
      desprendible_origen_id:
        referenceField === "desprendible_origen_id" && formState.desprendible_origen_id
          ? formState.desprendible_origen_id
          : null,
      liquidacion_id:
        referenceField === "liquidacion_id" && formState.liquidacion_id
          ? formState.liquidacion_id
          : null,
      movimiento_id:
        referenceField === "movimiento_id" && formState.movimiento_id
          ? formState.movimiento_id
          : null,
      novedad_id:
        referenceField === "novedad_id" && formState.novedad_id
          ? formState.novedad_id
          : null,
    };
  }

  async function handleSaveForm() {
    const validationMessage = validateForm();
    if (validationMessage) {
      setFeedback({
        tone: "error",
        message: validationMessage,
      });
      return;
    }

    const employee = employeeById.get(formState.nomina_empleado_id);
    if (!employee || !formState.tipo_correccion) {
      setFeedback({
        tone: "error",
        message: "No fue posible resolver el empleado seleccionado.",
      });
      return;
    }

    const references = buildReferencePayload();
    const createPayload: CreateNominaCorreccionPayload = {
      concepto: formState.concepto.trim(),
      motivo: formState.motivo.trim(),
      nomina_empleado_id: toId(employee.id),
      periodo_id: selectedPeriodId,
      tipo_correccion: formState.tipo_correccion,
      valor_anterior: Number(formState.valor_anterior),
      valor_nuevo: Number(formState.valor_nuevo),
      vinculacion_id: toId(employee.vinculacion_id),
      ...references,
    };

    const updatePayload: UpdateNominaCorreccionPayload = {
      concepto: createPayload.concepto,
      motivo: createPayload.motivo,
      tipo_correccion: createPayload.tipo_correccion,
      valor_anterior: createPayload.valor_anterior,
      valor_nuevo: createPayload.valor_nuevo,
      ...references,
    };

    setSavingForm(true);
    setFeedback(null);

    try {
      const response =
        formMode === "edit" && selectedDetailCorrection
          ? await actualizarCorreccionNomina(selectedDetailCorrection.id, updatePayload)
          : await crearCorreccionNomina(createPayload);

      setFormMode(null);
      setSelectedCorrectionId(toId(response.id));
      setDetailState({
        loading: false,
        data: response,
        error: null,
      });
      setFeedback({
        tone: "success",
        message:
          formMode === "edit"
            ? "La correccion se actualizo correctamente."
            : "La correccion se creo en estado BORRADOR.",
      });
      setReloadListTick((current) => current + 1);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setSavingForm(false);
    }
  }

  async function handleDirectAction(
    actionKey: string,
    executor: () => Promise<NominaCorreccion>,
    successMessage: string,
  ) {
    setProcessingActionKey(actionKey);
    setFeedback(null);

    try {
      const response = await executor();
      const visibleInCurrentList = showInactive ? !response.activo : response.activo;

      if (visibleInCurrentList) {
        setSelectedCorrectionId(toId(response.id));
        setDetailState({
          loading: false,
          data: response,
          error: null,
        });
      } else {
        setSelectedCorrectionId("");
        setDetailState(EMPTY_ASYNC_STATE);
      }

      setFeedback({
        tone: "success",
        message: successMessage,
      });
      setReloadListTick((current) => current + 1);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setProcessingActionKey(null);
    }
  }

  function openObservationAction(type: ObservationActionType, correction: NominaCorreccionListItem) {
    setObservationAction({
      correction,
      type,
    });
    setObservationValue("");
    setFeedback(null);
  }

  async function handleObservationSubmit() {
    if (!observationAction) {
      return;
    }

    const observation = observationValue.trim();
    if (!observation) {
      setFeedback({
        tone: "error",
        message: "La observacion es obligatoria.",
      });
      return;
    }

    const actionKey = `${observationAction.type}-${toId(observationAction.correction.id)}`;
    setProcessingActionKey(actionKey);
    setFeedback(null);

    try {
      const response =
        observationAction.type === "reject"
          ? await rechazarCorreccionNomina(observationAction.correction.id, observation)
          : await anularCorreccionNomina(observationAction.correction.id, observation);

      const visibleInCurrentList = showInactive ? !response.activo : response.activo;

      if (visibleInCurrentList) {
        setSelectedCorrectionId(toId(response.id));
        setDetailState({
          loading: false,
          data: response,
          error: null,
        });
      } else {
        setSelectedCorrectionId("");
        setDetailState(EMPTY_ASYNC_STATE);
      }

      setObservationAction(null);
      setObservationValue("");
      setFeedback({
        tone: "success",
        message:
          observationAction.type === "reject"
            ? "La correccion fue rechazada."
            : "La correccion fue anulada.",
      });
      setReloadListTick((current) => current + 1);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setProcessingActionKey(null);
    }
  }

  async function handleOpenSlip(correction: NominaCorreccion) {
    setProcessingActionKey(`slip-${toId(correction.id)}`);
    setFeedback(null);

    try {
      const metadata = await openNominaDesprendible(
        toId(correction.periodo.id),
        toId(correction.empleado.vinculacion_id),
      );

      setFeedback({
        tone: "success",
        message: `Se abrio el desprendible vigente: ${metadata.file_name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setProcessingActionKey(null);
    }
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setEmployeeFilter("");
    setEstadoFilter("");
    setTipoFilter("");
    setShowInactive(false);
    setPage(1);
  }

  const canEditSelected = Boolean(selectedDetailCorrection && selectedDetailCorrection.estado === "BORRADOR" && canUpdate);
  const canRequestSelected = Boolean(selectedDetailCorrection && selectedDetailCorrection.estado === "BORRADOR" && canUpdate);
  const canReviewSelected = Boolean(selectedDetailCorrection && selectedDetailCorrection.estado === "SOLICITADA" && canReview);
  const canApproveSelected = Boolean(selectedDetailCorrection && selectedDetailCorrection.estado === "EN_REVISION" && canApprove);
  const canRejectSelected = Boolean(selectedDetailCorrection && selectedDetailCorrection.estado === "EN_REVISION" && canReview);
  const canCancelSelected = Boolean(
    selectedDetailCorrection &&
      (selectedDetailCorrection.estado === "BORRADOR" || selectedDetailCorrection.estado === "SOLICITADA") &&
      canCancel,
  );
  const canDeactivateSelected = Boolean(selectedDetailCorrection && selectedDetailCorrection.estado === "BORRADOR" && canUpdate);

  return (
    <div className="np-page">
      <header className="np-header">
        <div className="np-header-text">
          <h1>Correccion de nomina</h1>
          <p>
            Pantalla conectada al recurso real <code>/api/nomina/correcciones</code>. Los
            desprendibles vigentes se mantienen como soporte, no como resultado automatico.
          </p>
        </div>
        <div className="np-header-actions">
          {canCreate ? (
            <button
              type="button"
              className="np-btn primary"
              onClick={openCreateForm}
              disabled={!selectedPeriodId || supportState.loading || savingForm}
            >
              <Plus size={16} /> Nueva correccion
            </button>
          ) : null}
        </div>
      </header>

      {!canRead ? (
        <StateCard
          title="Sin permiso de lectura"
          message="Tu usuario no tiene acceso a nomina.correcciones.read."
          tone="error"
        />
      ) : (
        <>
          <div className="np-kpis">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;

              return (
                <div key={kpi.label} className={`np-kpi ${kpi.tone}`}>
                  <div className="np-kpi-icon">
                    <Icon size={20} />
                  </div>
                  <div className="np-kpi-body">
                    <span>{kpi.label}</span>
                    <strong>{kpi.value}</strong>
                    <small>{kpi.caption}</small>
                  </div>
                </div>
              );
            })}
          </div>

          {feedback ? (
            <div className={`np-inline-state ${feedback.tone}`}>
              {feedback.message}
            </div>
          ) : null}

          {showInactive ? (
            <div className="np-inline-state neutral">
              Mostrando solo registros inactivos o historicos del periodo seleccionado.
            </div>
          ) : null}

          <div className="np-toolbar">
            <div className="np-toolbar-left">
              <div className="np-search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar persona, documento, concepto o motivo"
                />
              </div>

              <NpSelect
                label="Periodo"
                value={selectedPeriodId}
                onChange={(value) => {
                  setSelectedPeriodId(value);
                }}
                includeEmptyOption={false}
                options={periodOptions}
                disabled={periodsState.loading || periodOptions.length === 0}
              />

              <NpSelect
                label="Estado"
                value={estadoFilter}
                onChange={(value) => {
                  setEstadoFilter(value);
                  setPage(1);
                }}
                emptyOptionLabel="Todos los estados"
                options={estadoOptions}
                disabled={correctionsState.loading}
              />

              <NpSelect
                label="Tipo"
                value={tipoFilter}
                onChange={(value) => {
                  setTipoFilter(value);
                  setPage(1);
                }}
                emptyOptionLabel="Todos los tipos"
                options={tipoOptions}
                disabled={correctionsState.loading}
              />

              <NpSelect
                label="Empleado"
                value={employeeFilter}
                onChange={(value) => {
                  setEmployeeFilter(value);
                  setPage(1);
                }}
                options={employeeOptions}
                disabled={supportState.loading || employeeOptions.length === 0}
              />
            </div>

            <div className="np-toolbar-right">
              <label className="np-checkbox-field np-checkbox-inline">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => {
                    setShowInactive(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Mostrar inactivas</span>
              </label>

              <NpSelect
                label="Limite"
                value={String(limit)}
                onChange={(value) => {
                  setLimit(Number(value));
                  setPage(1);
                }}
                options={[
                  { label: "10 filas", value: "10" },
                  { label: "25 filas", value: "25" },
                  { label: "50 filas", value: "50" },
                ]}
                disabled={correctionsState.loading}
              />

              <button type="button" className="np-clear-btn" onClick={clearFilters}>
                Limpiar
              </button>
            </div>
          </div>

          {formMode ? (
            <div className="np-detail-panel">
              <div className="np-detail-header">
                <div>
                  <h3>{formMode === "create" ? "Nueva correccion" : "Editar correccion"}</h3>
                  <p>
                    El backend calcula la diferencia automaticamente. Solo se editan borradores.
                  </p>
                </div>
                <button
                  type="button"
                  className="np-icon-button"
                  onClick={() => setFormMode(null)}
                  disabled={savingForm}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="np-form-grid">
                <label className="np-form-field">
                  <span>Empleado *</span>
                  <select
                    className="np-form-control"
                    value={formState.nomina_empleado_id}
                    onChange={(event) => {
                      const nextEmployeeId = event.target.value;
                      setFormState((current) => ({
                        ...createInitialForm(nextEmployeeId),
                        concepto: current.concepto,
                        motivo: current.motivo,
                        tipo_correccion: current.tipo_correccion,
                        valor_anterior: current.valor_anterior,
                        valor_nuevo: current.valor_nuevo,
                      }));
                    }}
                    disabled={savingForm || supportState.loading}
                  >
                    <option value="">Selecciona un empleado</option>
                    {employeeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="np-form-field">
                  <span>Tipo *</span>
                  <select
                    className="np-form-control"
                    value={formState.tipo_correccion}
                    onChange={(event) => {
                      const nextTipo = event.target.value as NominaCorreccionTipo | "";
                      setFormState((current) => ({
                        ...current,
                        tipo_correccion: nextTipo,
                        desprendible_origen_id: "",
                        liquidacion_id: "",
                        movimiento_id: "",
                        novedad_id: "",
                      }));
                    }}
                    disabled={savingForm}
                  >
                    <option value="">Selecciona un tipo</option>
                    {NOMINA_CORRECCION_TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {titleCase(tipo)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="np-form-field">
                  <span>Concepto *</span>
                  <input
                    className="np-form-control"
                    value={formState.concepto}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        concepto: event.target.value,
                      }))
                    }
                    disabled={savingForm}
                  />
                </label>

                <label className="np-form-field">
                  <span>Valor anterior *</span>
                  <input
                    className="np-form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.valor_anterior}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        valor_anterior: event.target.value,
                      }))
                    }
                    disabled={savingForm}
                  />
                </label>

                <label className="np-form-field">
                  <span>Valor nuevo *</span>
                  <input
                    className="np-form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.valor_nuevo}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        valor_nuevo: event.target.value,
                      }))
                    }
                    disabled={savingForm}
                  />
                </label>

                {formReferenceField ? (
                  <label className="np-form-field">
                    <span>
                      {formReferenceField === "movimiento_id"
                        ? "Movimiento relacionado *"
                        : formReferenceField === "novedad_id"
                          ? "Novedad relacionada *"
                          : formReferenceField === "liquidacion_id"
                            ? "Liquidacion relacionada *"
                            : "Desprendible origen *"}
                    </span>
                    <select
                      className="np-form-control"
                      value={selectedReferenceValue}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          desprendible_origen_id:
                            formReferenceField === "desprendible_origen_id"
                              ? event.target.value
                              : current.desprendible_origen_id,
                          liquidacion_id:
                            formReferenceField === "liquidacion_id"
                              ? event.target.value
                              : current.liquidacion_id,
                          movimiento_id:
                            formReferenceField === "movimiento_id"
                              ? event.target.value
                              : current.movimiento_id,
                          novedad_id:
                            formReferenceField === "novedad_id"
                              ? event.target.value
                              : current.novedad_id,
                        }))
                      }
                      disabled={savingForm || referenceOptions.length === 0}
                    >
                      <option value="">Selecciona una referencia</option>
                      {referenceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <label className="np-form-field">
                <span>Motivo *</span>
                <textarea
                  className="np-form-control np-form-textarea"
                  value={formState.motivo}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      motivo: event.target.value,
                    }))
                  }
                  disabled={savingForm}
                />
              </label>

              <div className="np-form-actions">
                <button type="button" className="np-btn" onClick={() => setFormMode(null)} disabled={savingForm}>
                  Cancelar
                </button>
                <button type="button" className="np-btn primary" onClick={() => void handleSaveForm()} disabled={savingForm}>
                  {formMode === "create" ? "Crear borrador" : "Guardar cambios"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="np-table-card">
            {periodsState.loading && !periodsState.data ? (
              <StateCard title="Cargando periodos" message="Consultando periodos reales de nomina." />
            ) : periodsState.error ? (
              <StateCard
                title="Error cargando periodos"
                message={periodsState.error}
                tone="error"
              />
            ) : !selectedPeriodId ? (
              <StateCard
                title="Sin periodo disponible"
                message="No hay un periodo disponible para consultar correcciones."
              />
            ) : correctionsState.loading && !correctionsState.data ? (
              <StateCard
                title="Cargando correcciones"
                message="Consultando el recurso real de correcciones de nomina."
              />
            ) : correctionsState.error ? (
              <StateCard
                title="No fue posible cargar las correcciones"
                message={correctionsState.error}
                tone="error"
              />
            ) : corrections.length === 0 ? (
              <StateCard
                title="Sin correcciones"
                message={
                  showInactive
                    ? "No hay correcciones inactivas para los filtros actuales."
                    : "No hay correcciones activas para el periodo seleccionado."
                }
              />
            ) : (
              <>
                <div className="np-table-scroll">
                  <div
                    className="np-table-head"
                    style={{
                      gridTemplateColumns:
                        "minmax(220px,2fr) 120px 150px 130px 170px 170px 120px 120px 120px 130px 90px 72px",
                    }}
                  >
                    <span>Persona</span>
                    <span>Documento</span>
                    <span>Periodo</span>
                    <span>Tipo</span>
                    <span>Concepto</span>
                    <span>Motivo</span>
                    <span>Valor anterior</span>
                    <span>Valor nuevo</span>
                    <span>Diferencia</span>
                    <span>Solicitud</span>
                    <span>Activo</span>
                    <span>Ver</span>
                  </div>

                  {corrections.map((correction) => {
                    const avatarColor = getAvatarColor(correction.empleado.nombre_completo ?? "NA");

                    return (
                      <div
                        key={toId(correction.id)}
                        className={`np-table-row${toId(correction.id) === selectedCorrectionId ? " is-selected" : ""}`}
                        style={{
                          gridTemplateColumns:
                            "minmax(220px,2fr) 120px 150px 130px 170px 170px 120px 120px 120px 130px 90px 72px",
                        }}
                      >
                        <div className="np-cell-employee">
                          <div className={`np-avatar ${avatarColor}`}>
                            {getInitials(correction.empleado.nombre_completo)}
                          </div>
                          <div>
                            <strong>{correction.empleado.nombre_completo ?? "No disponible"}</strong>
                            <p>{titleCase(correction.estado)}</p>
                          </div>
                        </div>

                        <span className="np-table-text np-table-text-secondary">
                          {correction.empleado.numero_documento ?? "No disponible"}
                        </span>
                        <span className="np-table-text">{correction.periodo.nombre_periodo}</span>
                        <span className="np-table-text">{titleCase(correction.tipo_correccion)}</span>
                        <span className="np-table-text">{correction.concepto}</span>
                        <span className="np-table-text">{correction.motivo}</span>
                        <span className="np-table-text">{formatCOP(correction.valores.valor_anterior)}</span>
                        <span className="np-table-text">{formatCOP(correction.valores.valor_nuevo)}</span>
                        <span
                          className={`np-table-text ${
                            correction.valores.diferencia < 0 ? "np-text-danger" : "np-table-text-strong"
                          }`}
                        >
                          {formatCOP(correction.valores.diferencia)}
                        </span>
                        <span className="np-table-text">
                          {formatDate(correction.fechas?.fecha_solicitud)}
                        </span>
                        <span className={`np-badge ${correction.activo ? "success" : "neutral"}`}>
                          {correction.activo ? "Si" : "No"}
                        </span>

                        <div className="np-row-actions">
                          <button
                            type="button"
                            title="Ver detalle"
                            onClick={() => setSelectedCorrectionId(toId(correction.id))}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="np-pagination">
                  <span>
                    Pagina {correctionsState.data?.pagination.page ?? page} de{" "}
                    {correctionsState.data?.pagination.total_pages ?? 1}
                  </span>
                  <div className="np-pagination-actions">
                    <button
                      type="button"
                      className="np-btn"
                      disabled={page <= 1 || correctionsState.loading}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className="np-btn"
                      disabled={
                        correctionsState.loading ||
                        page >= (correctionsState.data?.pagination.total_pages ?? 1)
                      }
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="np-detail-panel">
            {!selectedCorrectionId ? (
              <div className="np-detail-header">
                <div>
                  <h3>Detalle</h3>
                  <p>Selecciona una correccion para consultar el detalle real del backend.</p>
                </div>
              </div>
            ) : detailState.loading && !detailState.data ? (
              <StateCard
                title="Cargando detalle"
                message="Consultando GET /api/nomina/correcciones/:id."
              />
            ) : detailState.error ? (
              <StateCard
                title="No fue posible cargar el detalle"
                message={detailState.error}
                tone="error"
              />
            ) : selectedDetailCorrection ? (
              <>
                <div className="np-detail-header">
                  <div>
                    <h3>{selectedDetailCorrection.empleado.nombre_completo ?? "No disponible"}</h3>
                    <p>
                      {titleCase(selectedDetailCorrection.tipo_correccion)} -{" "}
                      {titleCase(selectedDetailCorrection.estado)}
                    </p>
                  </div>

                  <div className="np-form-actions">
                    {selectedVigenteDesprendible ? (
                      <button
                        type="button"
                        className="np-btn"
                        onClick={() => void handleOpenSlip(selectedDetailCorrection)}
                        disabled={processingActionKey === `slip-${toId(selectedDetailCorrection.id)}`}
                      >
                        <Download size={16} /> Desprendible vigente
                      </button>
                    ) : null}

                    {canEditSelected && detailCorrection ? (
                      <button
                        type="button"
                        className="np-btn"
                        onClick={() => openEditForm(detailCorrection)}
                        disabled={savingForm}
                      >
                        <Pencil size={16} /> Editar
                      </button>
                    ) : null}

                    {canRequestSelected ? (
                      <button
                        type="button"
                        className="np-btn"
                        onClick={() =>
                          void handleDirectAction(
                            `request-${toId(selectedDetailCorrection.id)}`,
                            () => solicitarCorreccionNomina(selectedDetailCorrection.id),
                            "La correccion fue enviada a revision.",
                          )
                        }
                        disabled={processingActionKey === `request-${toId(selectedDetailCorrection.id)}`}
                      >
                        <Send size={16} /> Solicitar
                      </button>
                    ) : null}

                    {canReviewSelected ? (
                      <button
                        type="button"
                        className="np-btn"
                        onClick={() =>
                          void handleDirectAction(
                            `review-${toId(selectedDetailCorrection.id)}`,
                            () => revisarCorreccionNomina(selectedDetailCorrection.id),
                            "La correccion paso a EN_REVISION.",
                          )
                        }
                        disabled={processingActionKey === `review-${toId(selectedDetailCorrection.id)}`}
                      >
                        <ClipboardList size={16} /> Revisar
                      </button>
                    ) : null}

                    {canApproveSelected ? (
                      <button
                        type="button"
                        className="np-btn success-outline"
                        onClick={() =>
                          void handleDirectAction(
                            `approve-${toId(selectedDetailCorrection.id)}`,
                            () => aprobarCorreccionNomina(selectedDetailCorrection.id),
                            "La correccion fue aprobada.",
                          )
                        }
                        disabled={processingActionKey === `approve-${toId(selectedDetailCorrection.id)}`}
                      >
                        <CheckCircle2 size={16} /> Aprobar
                      </button>
                    ) : null}

                    {canRejectSelected ? (
                      <button
                        type="button"
                        className="np-btn danger-outline"
                        onClick={() => openObservationAction("reject", selectedDetailCorrection)}
                        disabled={processingActionKey === `reject-${toId(selectedDetailCorrection.id)}`}
                      >
                        <XCircle size={16} /> Rechazar
                      </button>
                    ) : null}

                    {canCancelSelected ? (
                      <button
                        type="button"
                        className="np-btn danger-outline"
                        onClick={() => openObservationAction("cancel", selectedDetailCorrection)}
                        disabled={processingActionKey === `cancel-${toId(selectedDetailCorrection.id)}`}
                      >
                        <Ban size={16} /> Anular
                      </button>
                    ) : null}

                    {canDeactivateSelected ? (
                      <button
                        type="button"
                        className="np-btn"
                        onClick={() => {
                          const confirmed = window.confirm(
                            "Se desactivara la correccion seleccionada. Deseas continuar?",
                          );
                          if (!confirmed) {
                            return;
                          }

                          void handleDirectAction(
                            `deactivate-${toId(selectedDetailCorrection.id)}`,
                            () => desactivarCorreccionNomina(selectedDetailCorrection.id),
                            "La correccion fue desactivada.",
                          );
                        }}
                        disabled={processingActionKey === `deactivate-${toId(selectedDetailCorrection.id)}`}
                      >
                        <ArchiveX size={16} /> Desactivar
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="np-detail-grid">
                  <div className="np-detail-field">
                    <span>Documento</span>
                    <strong>{selectedDetailCorrection.empleado.numero_documento ?? "No disponible"}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Vinculo</span>
                    <strong>
                      {selectedSupportEmployee
                        ? `#${selectedSupportEmployee.vinculacion.id} - ${selectedSupportEmployee.vinculacion.estado_vinculacion ?? "No disponible"}`
                        : `#${selectedDetailCorrection.empleado.vinculacion_id}`}
                    </strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Periodo</span>
                    <strong>{selectedDetailCorrection.periodo.nombre_periodo}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Tipo</span>
                    <strong>{titleCase(selectedDetailCorrection.tipo_correccion)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Concepto</span>
                    <strong>{selectedDetailCorrection.concepto}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Motivo</span>
                    <strong>{selectedDetailCorrection.motivo}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Valor anterior</span>
                    <strong>{formatCOP(selectedDetailCorrection.valores.valor_anterior)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Valor nuevo</span>
                    <strong>{formatCOP(selectedDetailCorrection.valores.valor_nuevo)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Diferencia</span>
                    <strong>{formatCOP(selectedDetailCorrection.valores.diferencia)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Estado</span>
                    <strong>{titleCase(selectedDetailCorrection.estado)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Observacion revision</span>
                    <strong>{selectedDetailCorrection.observacion_revision ?? "No disponible"}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Activo</span>
                    <strong>{formatBoolean(selectedDetailCorrection.activo)}</strong>
                  </div>
                </div>

                <div className="np-detail-divider" />

                <div className="np-detail-grid">
                  <div className="np-detail-field">
                    <span>Creado</span>
                    <strong>{formatDateTime(selectedDetailCorrection.created_at)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Actualizado</span>
                    <strong>{formatDateTime(selectedDetailCorrection.updated_at)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Fecha solicitud</span>
                    <strong>{formatDateTime(selectedDetailCorrection.fechas?.fecha_solicitud)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Fecha revision</span>
                    <strong>{formatDateTime(selectedDetailCorrection.fechas?.fecha_revision)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Fecha aprobacion</span>
                    <strong>{formatDateTime(selectedDetailCorrection.fechas?.fecha_aprobacion)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Fecha aplicacion</span>
                    <strong>{formatDateTime(selectedDetailCorrection.fechas?.fecha_aplicacion)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Solicitado por</span>
                    <strong>{getActorLabel(selectedDetailCorrection.actores?.solicitado_por)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Revisado por</span>
                    <strong>{getActorLabel(selectedDetailCorrection.actores?.revisado_por)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Aprobado por</span>
                    <strong>{getActorLabel(selectedDetailCorrection.actores?.aprobado_por)}</strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Aplicado por</span>
                    <strong>{getActorLabel(selectedDetailCorrection.actores?.aplicado_por)}</strong>
                  </div>
                </div>

                <div className="np-detail-divider" />

                <div className="np-detail-grid">
                  <div className="np-detail-field">
                    <span>Movimiento relacionado</span>
                    <strong>
                      {selectedDetailCorrection.referencias?.movimiento_id ?? "No disponible"}
                    </strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Novedad relacionada</span>
                    <strong>
                      {selectedDetailCorrection.referencias?.novedad_id ?? "No disponible"}
                    </strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Liquidacion relacionada</span>
                    <strong>
                      {selectedDetailCorrection.referencias?.liquidacion_id ?? "No disponible"}
                    </strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Desprendible origen</span>
                    <strong>
                      {selectedDetailCorrection.referencias?.desprendible_origen_id ?? "No disponible"}
                    </strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Desprendible resultado</span>
                    <strong>
                      {selectedDetailCorrection.referencias?.desprendible_resultado_id ?? "No disponible"}
                    </strong>
                  </div>
                  <div className="np-detail-field">
                    <span>Desprendible vigente</span>
                    <strong>
                      {selectedVigenteDesprendible
                        ? `V${selectedVigenteDesprendible.version} - ${titleCase(selectedVigenteDesprendible.estado)}`
                        : "No disponible"}
                    </strong>
                  </div>
                </div>

                {selectedDetailCorrection.estado === "APROBADA" ? (
                  <div className="np-detail-total">
                    <span>Aplicacion automatica</span>
                    <strong>La aplicacion automatica aun no esta disponible.</strong>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="np-info-panel">
            <h4>Referencia del modulo</h4>
            <ul className="np-info-list">
              <li>
                <ShieldAlert size={16} />
                <span>
                  Fuente principal: <code>GET /api/nomina/correcciones</code> con{" "}
                  <code>activo=true</code> por defecto.
                </span>
              </li>
              <li>
                <FileText size={16} />
                <span>
                  El detalle usa <code>GET /api/nomina/correcciones/:id</code> y muestra relaciones,
                  fechas del flujo y actores devueltos por el backend.
                </span>
              </li>
              <li>
                <Download size={16} />
                <span>
                  El desprendible vigente se mantiene como soporte usando los endpoints reales de{" "}
                  <code>nomina_desprendibles</code>. No se promete una version corregida automatica.
                </span>
              </li>
              <li>
                <AlertTriangle size={16} />
                <span>
                  El token puede incluir <code>nomina.correcciones.apply</code>, pero no se muestra una
                  accion Aplicar porque no existe endpoint backend.
                </span>
              </li>
            </ul>
          </div>
        </>
      )}

      {observationAction ? (
        <ObservationModal
          busy={processingActionKey === `${observationAction.type}-${toId(observationAction.correction.id)}`}
          correction={observationAction.correction}
          observation={observationValue}
          onCancel={() => {
            setObservationAction(null);
            setObservationValue("");
          }}
          onChange={setObservationValue}
          onSubmit={() => void handleObservationSubmit()}
          type={observationAction.type}
        />
      ) : null}
    </div>
  );
}
