import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  approveNominaTurno,
  createNominaTurno,
  deactivateNominaTurno,
  exportNominaMovimientosCsv,
  getAllNominaTurnos,
  getAllNominaPeriodoEmpleados,
  getNominaPeriodos,
  rejectNominaTurno,
  reviewNominaTurno,
  updateNominaTurno,
} from "../../services/nominaApi";
import { useCompanyContext } from "../../context/CompanyContext";
import { pickAvailableScopedId } from "../../context/companyScope";
import { NOMINA_TURNO_MOVIMIENTO_TIPO } from "../../types/nomina.types";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import type {
  NominaMovimientoTipo,
  CreateNominaTurnoPayload,
  NominaPeriodoEstado,
  NominaTurno,
  NominaTurnoFilters,
  PaginatedNominaEmpleadosApi,
  PaginatedNominaPeriodosApi,
  PaginatedNominaTurnosApi,
  UpdateNominaTurnoPayload,
} from "../../types/nomina.types";
import "./NominaPages.css";

type AsyncState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type FilterOption = {
  label: string;
  value: string;
};

type EditorMode = "create" | "edit" | null;

type FeedbackState = {
  message: string;
  tone: "success" | "error";
} | null;

type TurnoFormState = {
  activo: boolean;
  afecta_seguridad_social: boolean;
  cantidad: string;
  descripcion: string;
  fecha: string;
  motivo_ajuste_valor: string;
  motivo_estado: string;
  nomina_empleado_id: string;
  nomina_empleado_reemplazado_id: string;
  estado: "PENDIENTE" | "REVISADO" | "APROBADO" | "RECHAZADO";
  valor_aplicado: string;
  valor_calculado: string;
  valor_unitario: string;
};

type Kpi = {
  tone: Tone;
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  caption: string;
};

const EMPTY_ASYNC_STATE = {
  loading: false,
  data: null,
  error: null,
};

const PERIODS_LIMIT = 100;
const EDITABLE_PERIOD_STATES = new Set<NominaPeriodoEstado>(["ABIERTO"]);
const RECARGO_TYPES = new Set<NominaMovimientoTipo>([
  "HORA_EXTRA_DIURNA",
  "HORA_EXTRA_NOCTURNA",
  "RECARGO_NOCTURNO",
  "DOMINICAL",
  "FESTIVO",
]);

function formatCOP(value: number) {
  return `$${value.toLocaleString("es-CO")}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("es-CO");
}

function formatDate(value: string | null) {
  if (!value) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
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

function getMovementTypeLabel(tipo: string) {
  return titleCase(tipo);
}

function getMetodoPagoLabel(value: string | null) {
  return value ? titleCase(value) : "No disponible";
}

function getCuentaCobroLabel(metodoPago: string | null) {
  return metodoPago === "OPS_CUENTA_COBRO"
    ? "Metodo OPS_CUENTA_COBRO, sin cuenta consolidada"
    : "No disponible";
}

function isEditablePeriodState(estado: string | null | undefined) {
  return Boolean(estado && EDITABLE_PERIOD_STATES.has(estado as NominaPeriodoEstado));
}

function getMovementStatusTone(movimiento: NominaTurno): Tone {
  if (!movimiento.activo) {
    return "neutral";
  }

  if (movimiento.estado === "RECHAZADO") {
    return "danger";
  }

  if (movimiento.estado === "PENDIENTE") {
    return "warning";
  }

  if (movimiento.estado === "REVISADO") {
    return "info";
  }

  if (movimiento.tipo_movimiento === "TURNO_EXTERNO") {
    return "primary";
  }

  if (RECARGO_TYPES.has(movimiento.tipo_movimiento as NominaMovimientoTipo)) {
    return "warning";
  }

  return "success";
}

function getMovementStatusLabel(movimiento: NominaTurno) {
  return movimiento.activo ? movimiento.estado : "Inactivo";
}

function emptyForm(employeeId = ""): TurnoFormState {
  return {
    activo: true,
    afecta_seguridad_social: true,
    cantidad: "",
    descripcion: "",
    fecha: new Date().toISOString().slice(0, 10),
    motivo_ajuste_valor: "",
    motivo_estado: "",
    nomina_empleado_id: employeeId,
    nomina_empleado_reemplazado_id: "",
    estado: "PENDIENTE",
    valor_aplicado: "",
    valor_calculado: "",
    valor_unitario: "",
  };
}

function mapMovementToForm(movimiento: NominaTurno): TurnoFormState {
  return {
    activo: movimiento.activo,
    afecta_seguridad_social: movimiento.afecta_seguridad_social,
    cantidad: movimiento.cantidad === null ? "" : String(movimiento.cantidad),
    descripcion: movimiento.descripcion ?? "",
    fecha: movimiento.fecha ?? "",
    motivo_ajuste_valor: movimiento.motivo_ajuste_valor ?? "",
    motivo_estado: movimiento.motivo_estado ?? "",
    nomina_empleado_id: movimiento.nomina_empleado_id,
    nomina_empleado_reemplazado_id: "",
    estado: movimiento.estado,
    valor_aplicado: String(movimiento.valor_aplicado),
    valor_calculado: String(movimiento.valor_calculado),
    valor_unitario: movimiento.valor_unitario === null ? "" : String(movimiento.valor_unitario),
  };
}

function resolveNominaEmpleadoOptionByMovement(
  movimiento: NominaTurno,
  empleados: PaginatedNominaEmpleadosApi["items"],
) {
  if (movimiento.vinculacion_reemplazada_id) {
    const byVinculacion = empleados.find(
      (empleado) => empleado.vinculacion_id === movimiento.vinculacion_reemplazada_id,
    );

    if (byVinculacion) {
      return byVinculacion.id;
    }
  }

  if (movimiento.persona_reemplazada?.id) {
    const byPersona = empleados.find(
      (empleado) => empleado.persona.id === movimiento.persona_reemplazada?.id,
    );

    if (byPersona) {
      return byPersona.id;
    }
  }

  return "";
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function NpSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  disabled?: boolean;
  icon?: ComponentType<{ size?: number }>;
}) {
  return (
    <div className={`np-select-wrap${disabled ? " is-disabled" : ""}`}>
      {Icon ? <Icon size={15} /> : null}
      <select
        className="np-select"
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
      <ChevronDown size={13} />
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

export default function TurnosPage() {
  const { empresaId } = useCompanyContext();
  const [periodsState, setPeriodsState] = useState<AsyncState<PaginatedNominaPeriodosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [movementsState, setMovementsState] = useState<AsyncState<PaginatedNominaTurnosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [employeesState, setEmployeesState] = useState<AsyncState<PaginatedNominaEmpleadosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [form, setForm] = useState<TurnoFormState>(emptyForm());
  const periodsRequestRef = useRef(0);
  const movementsRequestRef = useRef(0);
  const employeesRequestRef = useRef(0);

  const periodos = periodsState.data?.items ?? [];
  const movimientos = movementsState.data?.items ?? [];
  const empleados = employeesState.data?.items ?? [];
  const employeeByNominaId = useMemo(
    () => new Map(empleados.map((empleado) => [empleado.id, empleado])),
    [empleados],
  );


  const selectedPeriod = periodos.find((periodo) => periodo.id === selectedPeriodId) ?? null;
  const selectedMovement = movimientos.find((movimiento) => movimiento.id === selectedMovementId) ?? null;
  const editingMovement = movimientos.find((movimiento) => movimiento.id === editingMovementId) ?? null;
  const selectedMovementEmployee = selectedMovement
    ? employeeByNominaId.get(selectedMovement.nomina_empleado_id) ?? null
    : null;
  const selectedFormEmployee = form.nomina_empleado_id
    ? employeeByNominaId.get(form.nomina_empleado_id) ?? null
    : null;

  const backendActiveFilter =
    activeFilter === "" ? undefined : activeFilter === "true" ? true : false;
  const canMutatePeriod = isEditablePeriodState(selectedPeriod?.estado);

  const periodOptions = useMemo<FilterOption[]>(
    () =>
      periodos.map((periodo) => ({
        value: periodo.id,
        label: `${periodo.nombre_periodo} · ${formatDate(periodo.fecha_inicio)} - ${formatDate(periodo.fecha_fin)}`,
      })),
    [periodos],
  );

  const activeOptions = useMemo<FilterOption[]>(
    () => [
      { value: "true", label: "Activos" },
      { value: "false", label: "Inactivos" },
    ],
    [],
  );

  const natureOptions = useMemo<FilterOption[]>(
    () => [
      { value: "devengado", label: "Devengados" },
      { value: "deduccion", label: "Deducciones" },
      { value: "ninguna", label: "Sin naturaleza" },
    ],
    [],
  );

  const employeeOptions = useMemo<FilterOption[]>(
    () =>
      empleados.map((empleado) => ({
        value: empleado.id,
        label: `${empleado.persona.nombre_completo} · ${empleado.persona.numero_documento ?? empleado.id}`,
      })),
    [empleados],
  );




  const displayedMovimientos = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es-CO");

    return movimientos.filter((movimiento) => {
      const empleado = employeeByNominaId.get(movimiento.nomina_empleado_id) ?? null;

      if (natureFilter === "devengado" && !movimiento.es_devengado) {
        return false;
      }

      if (natureFilter === "deduccion" && !movimiento.es_deduccion) {
        return false;
      }

      if (natureFilter === "ninguna" && (movimiento.es_devengado || movimiento.es_deduccion)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        movimiento.persona.nombre_completo,
        movimiento.persona.numero_documento ?? "",
        movimiento.tipo_movimiento,
        movimiento.descripcion ?? "",
        empleado?.cargo?.nombre_cargo ?? "",
        empleado?.categoria_salarial?.modalidad ?? "",
        empleado?.vinculacion.metodo_pago ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es-CO");

      return haystack.includes(normalizedSearch);
    });
  }, [employeeByNominaId, movimientos, natureFilter, searchTerm]);

  const kpis = useMemo<Kpi[]>(() => {
    const total = displayedMovimientos.length;
    const externos = displayedMovimientos.filter(
      (movimiento) => movimiento.tipo_movimiento === "TURNO_EXTERNO",
    ).length;
    const valorTotal = displayedMovimientos.reduce((sum, movimiento) => sum + movimiento.valor_total, 0);
    const activos = displayedMovimientos.filter((movimiento) => movimiento.activo).length;
    const conModalidad = displayedMovimientos.filter(
      (movimiento) => employeeByNominaId.get(movimiento.nomina_empleado_id)?.categoria_salarial?.modalidad,
    ).length;
    const opsCuentaCobro = displayedMovimientos.filter(
      (movimiento) =>
        employeeByNominaId.get(movimiento.nomina_empleado_id)?.vinculacion.metodo_pago === "OPS_CUENTA_COBRO",
    ).length;

    return [
      {
        tone: "primary",
        icon: Users,
        label: "Turnos del periodo",
        value: formatNumber(total),
        caption: selectedPeriod?.nombre_periodo ?? "Sin periodo seleccionado",
      },
      {
        tone: "info",
        icon: CheckCircle2,
        label: "Turnos externos",
        value: formatNumber(externos),
        caption: "Tipo TURNO_EXTERNO",
      },
      {
        tone: "success",
        icon: Banknote,
        label: "Valor total",
        value: total > 0 ? formatCOP(valorTotal) : "No disponible",
        caption: "Suma de valor_total",
      },
      {
        tone: "purple",
        icon: Clock,
        label: "Con modalidad",
        value: formatNumber(conModalidad),
        caption: "Dato real desde nomina_empleados",
      },
      {
        tone: "warning",
        icon: AlertTriangle,
        label: "Activos",
        value: formatNumber(activos),
        caption: "Registros vigentes",
      },
      {
        tone: "danger",
        icon: Trash2,
        label: "Metodo OPS cuenta cobro",
        value: formatNumber(opsCuentaCobro),
        caption: "Solo metodo_pago de vinculacion",
      },
    ];
  }, [displayedMovimientos, employeeByNominaId, selectedPeriod]);

  const byTypeSummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();

    for (const movimiento of displayedMovimientos) {
      const current = map.get(movimiento.tipo_movimiento) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += movimiento.valor_total;
      map.set(movimiento.tipo_movimiento, current);
    }

    return Array.from(map.entries())
      .sort((left, right) => right[1].count - left[1].count || right[1].total - left[1].total)
      .slice(0, 5)
      .map(([tipo, summary]) => ({
        label: getMovementTypeLabel(tipo),
        count: summary.count,
        total: summary.total,
      }));
  }, [displayedMovimientos]);

  const valueByNature = useMemo(() => {
    const devengados = displayedMovimientos
      .filter((movimiento) => movimiento.es_devengado)
      .reduce((sum, movimiento) => sum + movimiento.valor_total, 0);
    const deducciones = displayedMovimientos
      .filter((movimiento) => movimiento.es_deduccion)
      .reduce((sum, movimiento) => sum + movimiento.valor_total, 0);
    const sinNaturaleza = displayedMovimientos
      .filter((movimiento) => !movimiento.es_devengado && !movimiento.es_deduccion)
      .reduce((sum, movimiento) => sum + movimiento.valor_total, 0);

    return {
      devengados,
      deducciones,
      sinNaturaleza,
    };
  }, [displayedMovimientos]);

  const topEmployees = useMemo(() => {
    const map = new Map<string, { count: number; name: string }>();

    for (const movimiento of displayedMovimientos) {
      const current = map.get(movimiento.persona.id) ?? {
        count: 0,
        name: movimiento.persona.nombre_completo,
      };
      current.count += 1;
      map.set(movimiento.persona.id, current);
    }

    return Array.from(map.values())
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "es-CO"))
      .slice(0, 5);
  }, [displayedMovimientos]);

  const loadPeriods = useCallback(async (preferredPeriodId?: string) => {
    const requestId = periodsRequestRef.current + 1;
    periodsRequestRef.current = requestId;

    setPeriodsState((current) => ({
      loading: true,
      data: current.data,
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
        loading: false,
        data,
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
        loading: false,
        data: current.data,
        error: toMessage(error),
      }));
    }
  }, [empresaId]);

  const loadMovimientos = useCallback(
    async (filters: Omit<NominaTurnoFilters, "page" | "limit">) => {
      const requestId = movementsRequestRef.current + 1;
      movementsRequestRef.current = requestId;

      setMovementsState({
        loading: true,
        data: null,
        error: null,
      });
      setSelectedMovementId(null);

      try {
        const data = await getAllNominaTurnos(filters);

        if (requestId !== movementsRequestRef.current) {
          return;
        }

        setMovementsState({
          loading: false,
          data,
          error: null,
        });
      } catch (error) {
        if (requestId !== movementsRequestRef.current) {
          return;
        }

        setMovementsState({
          loading: false,
          data: null,
          error: toMessage(error),
        });
      }
    },
    [],
  );

  const loadEmployees = useCallback(async (periodoId: string) => {
    const requestId = employeesRequestRef.current + 1;
    employeesRequestRef.current = requestId;

    setEmployeesState((current) => ({
      loading: true,
      data: current.data,
      error: null,
    }));

    try {
      const data = await getAllNominaPeriodoEmpleados(periodoId, {
        empresa_id: empresaId ? String(empresaId) : undefined,
      });

      if (requestId !== employeesRequestRef.current) {
        return;
      }

      setEmployeesState({
        loading: false,
        data,
        error: null,
      });
    } catch (error) {
      if (requestId !== employeesRequestRef.current) {
        return;
      }

      setEmployeesState({
        loading: false,
        data: null,
        error: toMessage(error),
      });
    }
  }, [empresaId]);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setMovementsState({ ...EMPTY_ASYNC_STATE });
      setEmployeesState({ ...EMPTY_ASYNC_STATE });
      setSelectedMovementId(null);
      setEditorMode(null);
      setEditingMovementId(null);
      return;
    }

    void Promise.all([
      loadMovimientos({
        periodo_id: selectedPeriodId,
        activo: backendActiveFilter,
      }),
      loadEmployees(selectedPeriodId),
    ]);
  }, [backendActiveFilter, loadEmployees, loadMovimientos, selectedPeriodId]);

  useEffect(() => {
    if (editorMode === "create" && empleados.length > 0 && !form.nomina_empleado_id) {
      setForm((current) => ({
        ...current,
        nomina_empleado_id: empleados[0]?.id ?? "",
      }));
    }
  }, [editorMode, empleados, form.nomina_empleado_id]);

  const handleSelectPeriod = (periodId: string) => {
    setSelectedPeriodId(periodId || null);
    setSelectedMovementId(null);
    setEditorMode(null);
    setEditingMovementId(null);
    setSearchTerm("");
    setActiveFilter("");
    setNatureFilter("");
    setFeedback(null);
    setFormError(null);
    setMovementsState({ ...EMPTY_ASYNC_STATE });
    setEmployeesState({ ...EMPTY_ASYNC_STATE });
  };

  const handleRetry = () => {
    if (!selectedPeriodId) {
      void loadPeriods();
      return;
    }

    void Promise.all([
      loadPeriods(selectedPeriodId),
      loadMovimientos({
        periodo_id: selectedPeriodId,
        activo: backendActiveFilter,
      }),
      loadEmployees(selectedPeriodId),
    ]);
  };

  const openCreateEditor = () => {
    if (!canMutatePeriod) {
      setFeedback({
        tone: "error",
        message: "Solo puedes registrar turnos en periodos con estado ABIERTO.",
      });
      return;
    }

    const defaultEmployeeId = empleados[0]?.id ?? "";
    setEditorMode("create");
    setEditingMovementId(null);
    setSelectedMovementId(null);
    setForm(emptyForm(defaultEmployeeId));
    setFormError(null);
    setFeedback(null);
  };

  const openEditEditor = (movimiento: NominaTurno) => {
    if (!canMutatePeriod) {
      setFeedback({
        tone: "error",
        message: "Solo puedes editar turnos en periodos con estado ABIERTO.",
      });
      return;
    }

    const nextForm = mapMovementToForm(movimiento);
    nextForm.nomina_empleado_reemplazado_id = resolveNominaEmpleadoOptionByMovement(
      movimiento,
      empleados,
    );

    setEditorMode("edit");
    setEditingMovementId(movimiento.id);
    setSelectedMovementId(null);
    setForm(nextForm);
    setFormError(null);
    setFeedback(null);
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingMovementId(null);
    setFormError(null);
  };

  const handleFormChange = <K extends keyof TurnoFormState>(key: K, value: TurnoFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const validateForm = () => {
    if (!selectedPeriodId) {
      return "Selecciona un periodo antes de registrar turnos.";
    }

    if (!canMutatePeriod) {
      return "El periodo seleccionado esta en solo lectura. El backend solo permite cambios en estado ABIERTO.";
    }

    if (editorMode === "create" && !form.nomina_empleado_id) {
      return "Selecciona un colaborador del periodo.";
    }

    if (form.fecha.trim() === "") {
      return "La fecha es obligatoria.";
    }

    const applied = Number(form.valor_aplicado);
    if (!Number.isFinite(applied) || applied <= 0) {
      return "El valor aplicado debe ser un numero positivo.";
    }

    if (form.valor_calculado.trim() !== "") {
      const calculated = Number(form.valor_calculado);
      if (!Number.isFinite(calculated) || calculated < 0) {
        return "El valor calculado debe ser un numero valido cuando se informa.";
      }
      if (Math.abs(calculated - applied) >= 0.01 && form.motivo_ajuste_valor.trim() === "") {
        return "El motivo de ajuste es obligatorio cuando el valor aplicado difiere del calculado.";
      }
    }

    if (form.valor_unitario.trim() !== "") {
      const unit = Number(form.valor_unitario);
      if (!Number.isFinite(unit) || unit <= 0) {
        return "El valor unitario debe ser un numero positivo cuando se informa.";
      }
    }

    if (form.cantidad.trim() !== "") {
      const quantity = Number(form.cantidad);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return "La cantidad debe ser un numero positivo cuando se informa.";
      }
    }

    if (
      form.nomina_empleado_reemplazado_id &&
      form.nomina_empleado_reemplazado_id === form.nomina_empleado_id
    ) {
      return "La persona reemplazada no puede ser la misma que realiza el turno.";
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!selectedPeriodId) {
      return;
    }

    const selectedEmployee =
      empleados.find((empleado) => empleado.id === form.nomina_empleado_id) ??
      (editingMovement
        ? empleados.find((empleado) => empleado.id === editingMovement.nomina_empleado_id) ?? null
        : null);
    const selectedReplacementEmployee = form.nomina_empleado_reemplazado_id
      ? empleados.find((empleado) => empleado.id === form.nomina_empleado_reemplazado_id) ?? null
      : null;

    if (!selectedEmployee) {
      setFormError("No fue posible resolver el colaborador seleccionado en el período.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFeedback(null);

    try {
      const targetEstado = form.estado;

      const applyStateTransition = async (movimientoId: string, previousEstado: NominaTurno["estado"]) => {
        if (targetEstado === previousEstado || targetEstado === "PENDIENTE") {
          return;
        }

        const payload = {
          motivo_estado: form.motivo_estado.trim() || null,
        };

        if (targetEstado === "REVISADO") {
          await reviewNominaTurno(movimientoId, payload);
          return;
        }

        if (targetEstado === "APROBADO") {
          await approveNominaTurno(movimientoId, payload);
          return;
        }

        if (targetEstado === "RECHAZADO") {
          await rejectNominaTurno(movimientoId, payload);
        }
      };

      if (editorMode === "create") {
        const payload: CreateNominaTurnoPayload = {
          periodo_id: selectedPeriodId,
          nomina_empleado_id: selectedEmployee.id,
          vinculacion_id: selectedEmployee.vinculacion_id,
          fecha: form.fecha,
          familia_movimiento: "ADICION_DEVENGO",
          descripcion: form.descripcion.trim() || null,
          cantidad: parseOptionalNumber(form.cantidad),
          valor_unitario: parseOptionalNumber(form.valor_unitario),
          valor_calculado: parseOptionalNumber(form.valor_calculado),
          valor_aplicado: Number(form.valor_aplicado),
          valor_total: Number(form.valor_aplicado),
          motivo_ajuste_valor: form.motivo_ajuste_valor.trim() || null,
          persona_reemplazada_id: selectedReplacementEmployee?.persona.id ?? null,
          vinculacion_reemplazada_id: selectedReplacementEmployee?.vinculacion_id ?? null,
          afecta_seguridad_social: form.afecta_seguridad_social,
          activo: form.activo,
        };

        const created = await createNominaTurno(payload);
        await applyStateTransition(created.id, created.estado);
        setFeedback({
          tone: "success",
          message: "Turno registrado correctamente.",
        });
      } else if (editorMode === "edit" && editingMovementId) {
        const payload: UpdateNominaTurnoPayload = {
          fecha: form.fecha,
          descripcion: form.descripcion.trim() || null,
          cantidad: parseOptionalNumber(form.cantidad),
          valor_unitario: parseOptionalNumber(form.valor_unitario),
          valor_calculado: parseOptionalNumber(form.valor_calculado),
          valor_aplicado: Number(form.valor_aplicado),
          valor_total: Number(form.valor_aplicado),
          motivo_ajuste_valor: form.motivo_ajuste_valor.trim() || null,
          persona_reemplazada_id: selectedReplacementEmployee?.persona.id ?? null,
          vinculacion_reemplazada_id: selectedReplacementEmployee?.vinculacion_id ?? null,
          afecta_seguridad_social: form.afecta_seguridad_social,
          activo: form.activo,
        };

        const updated = await updateNominaTurno(editingMovementId, payload);
        await applyStateTransition(updated.id, updated.estado);
        setFeedback({
          tone: "success",
          message: "Turno actualizado correctamente.",
        });
      }

      await loadMovimientos({
        periodo_id: selectedPeriodId,
        activo: backendActiveFilter,
      });
      closeEditor();
    } catch (error) {
      setFormError(toMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (movimiento: NominaTurno) => {
    if (!movimiento.activo || isSubmitting || !canMutatePeriod) {
      return;
    }

    const confirmed = window.confirm("Se desactivara este turno. ¿Deseas continuar?");
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await deactivateNominaTurno(movimiento.id);
      if (selectedPeriodId) {
        await loadMovimientos({
          periodo_id: selectedPeriodId,
          activo: backendActiveFilter,
        });
      }
      setFeedback({
        tone: "success",
        message: "Turno desactivado correctamente.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    if (!selectedPeriodId || isExporting) {
      return;
    }

    setIsExporting(true);
    setFeedback(null);

    try {
      const metadata = await exportNominaMovimientosCsv(selectedPeriodId);
      setFeedback({
        tone: "success",
        message: `Se exportó el consolidado real de movimientos del período: ${metadata.file_name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setActiveFilter("");
    setNatureFilter("");
  };

  const canCreate = Boolean(selectedPeriodId) && !employeesState.loading && empleados.length > 0;
  const hasPeriods = periodos.length > 0;
  const isTableEmpty =
    !movementsState.loading &&
    !movementsState.error &&
    selectedPeriodId !== null &&
    displayedMovimientos.length === 0;

  return (
    <div className="np-page">
      <header className="np-header">
        <div className="np-header-text">
          <h1>Turnos</h1>
          <p>Consulta y registra movimientos reales de nomina clasificados como {NOMINA_TURNO_MOVIMIENTO_TIPO}.</p>
        </div>
        <div className="np-header-actions">
          <button
            type="button"
            className="np-btn primary"
            onClick={openCreateEditor}
            disabled={!canCreate || !canMutatePeriod || isSubmitting}
            title={
              !canMutatePeriod && selectedPeriod
                ? `El periodo ${selectedPeriod.nombre_periodo} esta en estado ${selectedPeriod.estado}. El backend solo permite crear turnos en ABIERTO.`
                : canCreate
                  ? "Registrar turno externo"
                  : employeesState.error
                    ? employeesState.error
                    : "No hay colaboradores cargados en el periodo seleccionado."
            }
          >
            <Plus size={16} /> Nuevo turno
          </button>
          <button
            type="button"
            className="np-btn"
            onClick={handleExport}
            disabled={!selectedPeriodId || isExporting || displayedMovimientos.length === 0}
            title={
              displayedMovimientos.length === 0
                ? "No hay movimientos cargados para exportar en el período seleccionado."
                : "Exportar movimientos reales del backend"
            }
          >
            <Download size={16} /> {isExporting ? "Exportando..." : "Exportar movimientos"}
          </button>
        </div>
      </header>

      <div className="np-inline-state neutral">
        Esta pantalla usa el flujo real de <code>nomina_movimientos</code> filtrado a{" "}
        <code>{NOMINA_TURNO_MOVIMIENTO_TIPO}</code>. El backend ya separa creacion/edicion de datos
        y transiciones de estado (<code>revisar/aprobar/rechazar</code>), conserva valor calculado vs.
        valor aplicado y resuelve contexto operativo desde cobertura o desde la persona reemplazada cuando aplica.
      </div>

      {feedback ? (
        <div className={`np-inline-state ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.message}
        </div>
      ) : null}

      {employeesState.error && selectedPeriodId ? (
        <div className="np-inline-state error" role="alert">
          No fue posible cargar los colaboradores del periodo. El registro y edicion quedan deshabilitados.
          Detalle: {employeesState.error}
        </div>
      ) : null}

      {selectedPeriod && !canMutatePeriod ? (
        <div className="np-inline-state neutral">
          Periodo en solo lectura: el estado real es <strong>{selectedPeriod.estado}</strong>. El backend solo
          permite crear, editar o desactivar turnos cuando el periodo esta en <strong>ABIERTO</strong>.
        </div>
      ) : null}

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

      <div className="np-toolbar">
        <div className="np-toolbar-left">
          <div className="np-search">
            <Search size={16} />
            <input
              placeholder="Buscar colaborador, documento, cargo, modalidad o descripcion"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!selectedPeriodId || movementsState.loading}
            />
          </div>
          <NpSelect
            label={periodsState.loading ? "Cargando períodos..." : "Período"}
            value={selectedPeriodId ?? ""}
            onChange={handleSelectPeriod}
            options={periodOptions}
            disabled={periodsState.loading || periodOptions.length === 0}
          />
          <NpSelect
            label="Estado"
            value={activeFilter}
            onChange={setActiveFilter}
            options={activeOptions}
            disabled={!selectedPeriodId}
          />
          <NpSelect
            label="Naturaleza"
            value={natureFilter}
            onChange={setNatureFilter}
            options={natureOptions}
            disabled={!selectedPeriodId}
          />
        </div>
        <div className="np-toolbar-right">
          <span className="np-badge info">{NOMINA_TURNO_MOVIMIENTO_TIPO}</span>
          <button
            type="button"
            className="np-clear-btn"
            onClick={clearFilters}
            disabled={!searchTerm && !activeFilter && !natureFilter}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="np-table-card">
        {!hasPeriods && !periodsState.loading ? (
          <StateCard
            title="Sin períodos disponibles"
            message="No hay periodos de nomina disponibles para consultar turnos."
          />
        ) : periodsState.error && !hasPeriods ? (
          <StateCard
            title="No fue posible cargar los períodos"
            message={periodsState.error}
            tone="error"
            actionLabel="Reintentar"
            onAction={handleRetry}
          />
        ) : !selectedPeriodId ? (
          <StateCard
            title="Selecciona un periodo"
            message="La consulta real de turnos depende del periodo activo o seleccionado."
          />
        ) : movementsState.loading ? (
          <div className="np-empty">Cargando turnos...</div>
        ) : movementsState.error ? (
          <StateCard
            title="No fue posible cargar los turnos"
            message={movementsState.error}
            tone="error"
            actionLabel="Reintentar"
            onAction={handleRetry}
          />
        ) : isTableEmpty ? (
          <StateCard
            title="Sin turnos"
            message={
              movimientos.length === 0
                ? "No existen turnos externos registrados para el periodo seleccionado."
                : "No hay turnos que coincidan con los filtros actuales."
            }
          />
        ) : (
          <div className="np-table-scroll">
            <div
              className="np-table-head"
              style={{
                gridTemplateColumns:
                  "110px minmax(220px,1.8fr) 140px 150px 130px minmax(160px,1.2fr) 140px 140px 150px 120px 170px",
              }}
            >
              <span>Fecha</span>
              <span>Persona que cubre</span>
              <span>Documento</span>
              <span>Tipo de turno</span>
              <span>Interno / externo</span>
              <span>Persona reemplazada</span>
              <span>Institucion</span>
              <span>Sede</span>
              <span>Modalidad</span>
              <span>Valor</span>
              <span>Estado / Acc.</span>
            </div>

            {displayedMovimientos.map((movimiento) => (
              <div
                key={movimiento.id}
                className={`np-table-row${selectedMovementId === movimiento.id ? " is-selected" : ""}`}
                style={{
                  gridTemplateColumns:
                    "110px minmax(220px,1.8fr) 140px 150px 130px minmax(160px,1.2fr) 140px 140px 150px 120px 170px",
                }}
              >
                <span className="np-table-text">{formatDate(movimiento.fecha)}</span>
                <span className="np-table-text np-table-text-strong">{movimiento.persona.nombre_completo}</span>
                <span className="np-table-text np-table-text-secondary">
                  {movimiento.persona.numero_documento ?? "No disponible"}
                </span>
                <span className="np-table-text">{getMovementTypeLabel(movimiento.tipo_movimiento)}</span>
                <span className="np-badge primary">Externo</span>
                <span className="np-table-text np-table-text-secondary">
                  {movimiento.persona_reemplazada?.nombre_completo ?? "No disponible"}
                </span>
                <span className="np-table-text np-table-text-secondary">
                  {movimiento.contexto_operativo?.institucion ?? "No disponible"}
                </span>
                <span className="np-table-text np-table-text-secondary">
                  {movimiento.contexto_operativo?.sede ?? "No disponible"}
                </span>
                <span className="np-table-text">
                  {movimiento.contexto_operativo?.modalidad ??
                    employeeByNominaId.get(movimiento.nomina_empleado_id)?.categoria_salarial?.modalidad ??
                    "No disponible"}
                </span>
                <span className="np-table-text np-table-text-net">{formatCOP(movimiento.valor_aplicado)}</span>
                <div className="np-row-status">
                  <span className={`np-badge ${getMovementStatusTone(movimiento)}`}>
                    {getMovementStatusLabel(movimiento)}
                  </span>
                  <button
                    type="button"
                    className="np-icon-button"
                    title="Ver detalle"
                    aria-label={`Ver detalle de ${movimiento.persona.nombre_completo}`}
                    onClick={() =>
                      setSelectedMovementId((current) => (current === movimiento.id ? null : movimiento.id))
                    }
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className="np-icon-button"
                    title="Editar"
                    aria-label={`Editar ${movimiento.persona.nombre_completo}`}
                    onClick={() => openEditEditor(movimiento)}
                    disabled={
                      !movimiento.activo ||
                      !canMutatePeriod ||
                      isSubmitting ||
                      employeesState.loading ||
                      empleados.length === 0
                    }
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    className="np-icon-button"
                    title="Desactivar"
                    aria-label={`Desactivar ${movimiento.persona.nombre_completo}`}
                    onClick={() => void handleDeactivate(movimiento)}
                    disabled={!movimiento.activo || !canMutatePeriod || isSubmitting}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedMovement ? (
        <div className="np-detail-panel">
          <div className="np-detail-header">
            <div>
              <h3>Detalle del turno</h3>
              <p>
                {selectedMovement.persona.nombre_completo} · {selectedMovement.periodo.nombre_periodo}
              </p>
            </div>
            <button
              type="button"
              className="np-icon-button"
              onClick={() => setSelectedMovementId(null)}
              title="Cerrar detalle"
              aria-label="Cerrar detalle"
            >
              <X size={14} />
            </button>
          </div>

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Documento</span>
              <strong>{selectedMovement.persona.numero_documento ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Tipo de turno</span>
              <strong>{getMovementTypeLabel(selectedMovement.tipo_movimiento)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Interno / externo</span>
              <strong>Externo</strong>
            </div>
            <div className="np-detail-field">
              <span>Fecha</span>
              <strong>{formatDate(selectedMovement.fecha)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Estado</span>
              <strong>{getMovementStatusLabel(selectedMovement)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Modalidad</span>
              <strong>
                {selectedMovement.contexto_operativo?.modalidad ??
                  selectedMovementEmployee?.categoria_salarial?.modalidad ??
                  "No disponible"}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Metodo de pago</span>
              <strong>{getMetodoPagoLabel(selectedMovementEmployee?.vinculacion.metodo_pago ?? null)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Reemplaza</span>
              <strong>{selectedMovement.persona_reemplazada?.nombre_completo ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Institucion</span>
              <strong>{selectedMovement.contexto_operativo?.institucion ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Sede</span>
              <strong>{selectedMovement.contexto_operativo?.sede ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Cuenta de cobro</span>
              <strong>{getCuentaCobroLabel(selectedMovementEmployee?.vinculacion.metodo_pago ?? null)}</strong>
            </div>
          </div>

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Cantidad</span>
              <strong>{selectedMovement.cantidad ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Valor calculado</span>
              <strong>
                {selectedMovement.valor_calculado === null
                  ? "No disponible"
                  : formatCOP(selectedMovement.valor_calculado)}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Valor aplicado</span>
              <strong>{formatCOP(selectedMovement.valor_aplicado)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Descripción</span>
              <strong>{selectedMovement.descripcion ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Afecta seguridad social</span>
              <strong>{selectedMovement.afecta_seguridad_social ? "Sí" : "No"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Cargo</span>
              <strong>{selectedMovementEmployee?.cargo?.nombre_cargo ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Creado</span>
              <strong>{formatDate(selectedMovement.created_at)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Motivo ajuste</span>
              <strong>{selectedMovement.motivo_ajuste_valor ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Periodo ID</span>
              <strong>{selectedMovement.periodo_id}</strong>
            </div>
            <div className="np-detail-field">
              <span>Nomina empleado ID</span>
              <strong>{selectedMovement.nomina_empleado_id}</strong>
            </div>
            <div className="np-detail-field">
              <span>Vinculacion ID</span>
              <strong>{selectedMovement.vinculacion_id}</strong>
            </div>
            <div className="np-detail-field">
              <span>Persona ID</span>
              <strong>{selectedMovement.persona.id}</strong>
            </div>
          </div>

          <div className="np-detail-total">
            <span>Valor aplicado</span>
            <strong>{formatCOP(selectedMovement.valor_aplicado)}</strong>
          </div>

          {selectedMovement.alertas_validacion.length > 0 || selectedMovement.posible_duplicado ? (
            <div className="np-inline-state warning">
              {selectedMovement.posible_duplicado ? (
                <div>El backend marcó este turno como posible duplicado y requiere revisión.</div>
              ) : null}
              {selectedMovement.alertas_validacion.map((alerta, index) => (
                <div key={`${alerta.tipo}-${index}`}>
                  {alerta.tipo}: {alerta.mensaje}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {editorMode ? (
        <div className="np-detail-panel">
          <div className="np-detail-header">
            <div>
              <h3>{editorMode === "create" ? "Registrar turno externo" : "Editar turno externo"}</h3>
              <p>
                {selectedPeriod?.nombre_periodo ?? "Periodo no disponible"} ·
                {" "}
                El backend guarda estos registros en <code>nomina_movimientos</code> con{" "}
                <code>{NOMINA_TURNO_MOVIMIENTO_TIPO}</code>.
              </p>
            </div>
            <button
              type="button"
              className="np-icon-button"
              onClick={closeEditor}
              title="Cerrar formulario"
              aria-label="Cerrar formulario"
            >
              <X size={14} />
            </button>
          </div>

          <div className="np-form-grid">
            <label className="np-form-field">
              <span>Colaborador</span>
              <select
                className="np-form-control"
                value={form.nomina_empleado_id}
                onChange={(event) => handleFormChange("nomina_empleado_id", event.target.value)}
                disabled={editorMode === "edit" || employeesState.loading || isSubmitting}
              >
                <option value="">Selecciona un colaborador</option>
                {employeeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="np-form-field">
              <span>Tipo de turno</span>
              <input className="np-form-control" value={getMovementTypeLabel(NOMINA_TURNO_MOVIMIENTO_TIPO)} disabled />
            </label>

            <label className="np-form-field">
              <span>Estado</span>
              <select
                className="np-form-control"
                value={form.estado}
                onChange={(event) => handleFormChange("estado", event.target.value as TurnoFormState["estado"])}
                disabled={isSubmitting}
              >
                <option value="PENDIENTE">Pendiente</option>
                <option value="REVISADO">Revisado</option>
                <option value="APROBADO">Aprobado</option>
                <option value="RECHAZADO">Rechazado</option>
              </select>
            </label>

            <label className="np-form-field">
              <span>Fecha</span>
              <input
                className="np-form-control"
                type="date"
                value={form.fecha}
                onChange={(event) => handleFormChange("fecha", event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label className="np-form-field">
              <span>Cantidad</span>
              <input
                className="np-form-control"
                inputMode="decimal"
                value={form.cantidad}
                onChange={(event) => handleFormChange("cantidad", event.target.value)}
                placeholder="Opcional"
                disabled={isSubmitting}
              />
            </label>

            <label className="np-form-field">
              <span>Persona reemplazada</span>
              <select
                className="np-form-control"
                value={form.nomina_empleado_reemplazado_id}
                onChange={(event) => handleFormChange("nomina_empleado_reemplazado_id", event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">No aplica</option>
                {employeeOptions
                  .filter((option) => option.value !== form.nomina_empleado_id)
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>

            <label className="np-form-field">
              <span>Valor unitario</span>
              <input
                className="np-form-control"
                inputMode="decimal"
                value={form.valor_unitario}
                onChange={(event) => handleFormChange("valor_unitario", event.target.value)}
                placeholder="Opcional"
                disabled={isSubmitting}
              />
            </label>

            <label className="np-form-field">
              <span>Valor calculado</span>
              <input
                className="np-form-control"
                inputMode="decimal"
                value={form.valor_calculado}
                onChange={(event) => handleFormChange("valor_calculado", event.target.value)}
                placeholder="Opcional"
                disabled={isSubmitting}
              />
            </label>

            <label className="np-form-field">
              <span>Valor aplicado</span>
              <input
                className="np-form-control"
                inputMode="decimal"
                value={form.valor_aplicado}
                onChange={(event) => handleFormChange("valor_aplicado", event.target.value)}
                placeholder="Obligatorio"
                disabled={isSubmitting}
              />
            </label>
          </div>

          <label className="np-form-field">
            <span>Descripcion</span>
            <textarea
              className="np-form-control np-form-textarea"
              value={form.descripcion}
              onChange={(event) => handleFormChange("descripcion", event.target.value)}
              rows={4}
              placeholder="Observacion opcional para el turno"
              disabled={isSubmitting}
            />
          </label>

          <div className="np-form-grid">
            <label className="np-form-field">
              <span>Motivo ajuste valor</span>
              <input
                className="np-form-control"
                value={form.motivo_ajuste_valor}
                onChange={(event) => handleFormChange("motivo_ajuste_valor", event.target.value)}
                placeholder="Obligatorio si valor aplicado difiere"
                disabled={isSubmitting}
              />
            </label>

            <label className="np-form-field">
              <span>Motivo estado</span>
              <input
                className="np-form-control"
                value={form.motivo_estado}
                onChange={(event) => handleFormChange("motivo_estado", event.target.value)}
                placeholder="Opcional"
                disabled={isSubmitting}
              />
            </label>
          </div>

          {selectedFormEmployee ? (
            <div className="np-inline-state neutral">
              Contexto real del colaborador: cargo {selectedFormEmployee.cargo?.nombre_cargo ?? "No disponible"},
              modalidad {selectedFormEmployee.categoria_salarial?.modalidad ?? "No disponible"} y metodo de pago{" "}
              {getMetodoPagoLabel(selectedFormEmployee.vinculacion.metodo_pago)}.
            </div>
          ) : null}

          <div className="np-checkbox-grid">
            <label className="np-checkbox-field">
              <input
                type="checkbox"
                checked
                readOnly
                disabled={isSubmitting}
              />
              <span>Es devengado fijo</span>
            </label>
            <label className="np-checkbox-field">
              <input
                type="checkbox"
                checked={false}
                readOnly
                disabled={isSubmitting}
              />
              <span>No es deduccion</span>
            </label>
            <label className="np-checkbox-field">
              <input
                type="checkbox"
                checked={form.afecta_seguridad_social}
                onChange={(event) => handleFormChange("afecta_seguridad_social", event.target.checked)}
                disabled={isSubmitting}
              />
              <span>Afecta seguridad social</span>
            </label>
            <label className="np-checkbox-field">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(event) => handleFormChange("activo", event.target.checked)}
                disabled={isSubmitting}
              />
              <span>Activo</span>
            </label>
          </div>

          <div className="np-inline-state neutral">
            El backend ya persiste reemplazo, alertas, estado y separacion entre valor calculado y aplicado.
            El contexto operativo se resuelve prioritariamente desde la persona reemplazada y, si no existe,
            se conserva el valor manual ingresado para revision.
          </div>

          {formError ? (
            <div className="np-inline-state error" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="np-form-actions">
            <button type="button" className="np-btn" onClick={closeEditor} disabled={isSubmitting}>
              Cancelar
            </button>
            <button
              type="button"
              className="np-btn primary"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || !canMutatePeriod}
            >
              {isSubmitting
                ? editorMode === "create"
                  ? "Guardando..."
                  : "Actualizando..."
                : editorMode === "create"
                  ? "Registrar turno"
                  : "Guardar cambios"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="np-summary-row">
        <div className="np-summary-card">
          <h4>Turnos por tipo</h4>
          {byTypeSummary.length === 0 ? (
            <div className="np-summary-item">
              <span>Sin datos</span>
              <strong>—</strong>
            </div>
          ) : (
            byTypeSummary.map((item) => (
              <div key={item.label} className="np-summary-item">
                <span>{item.label}</span>
                <strong>
                  {formatNumber(item.count)} · {formatCOP(item.total)}
                </strong>
              </div>
            ))
          )}
        </div>

        <div className="np-summary-card">
          <h4>Valor por naturaleza</h4>
          <div className="np-summary-item">
            <span>Devengados</span>
            <strong>{formatCOP(valueByNature.devengados)}</strong>
          </div>
          <div className="np-summary-item">
            <span>Deducciones</span>
            <strong>{formatCOP(valueByNature.deducciones)}</strong>
          </div>
          <div className="np-summary-item">
            <span>Sin naturaleza</span>
            <strong>{formatCOP(valueByNature.sinNaturaleza)}</strong>
          </div>
        </div>

        <div className="np-summary-card">
          <h4>Top 5 · mas turnos</h4>
          {topEmployees.length === 0 ? (
            <div className="np-summary-item">
              <span>Sin datos</span>
              <strong>—</strong>
            </div>
          ) : (
            topEmployees.map((item, index) => (
              <div key={item.name} className="np-summary-item">
                <span>
                  {index + 1}. {item.name}
                </span>
                <strong>{formatNumber(item.count)}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

















