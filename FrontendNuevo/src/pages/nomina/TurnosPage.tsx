import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
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
  getAllNominaTurnosOperativos,
  getNominaNovedadTurnosOperativos,
  getAllNominaTurnos,
  getAllNominaPeriodoEmpleados,
  getAllNominaPeriodoEmpleadosOperativos,
  getCoberturaExternos,
  getCoberturaExternosOperativos,
  uploadCoberturaExternoDocumento,
  listarDocumentosCoberturaExterno,
  generarCoberturaCuenta,
  descargarCoberturaCuenta,
  verCoberturaCuentaFirmada,
  uploadCoberturaCuentaFirmada,
  getNominaPeriodos,
  rejectNominaTurno,
  reviewNominaTurno,
  updateNominaTurno,
} from "../../services/nominaApi";
import { useCompanyContext } from "../../context/CompanyContext";
import { useAuth } from "../../context/AuthContext";
import { pickAvailableScopedId } from "../../context/companyScope";
import { NOMINA_TURNO_MOVIMIENTO_TIPO } from "../../types/nomina.types";
import { formatDateOnly, todayDateOnly } from "./dateOnly";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import CoberturaFlowNav from "./CoberturaFlowNav";
import type {
  NominaMovimientoTipo,
  CreateNominaTurnoPayload,
  NominaPeriodoEstado,
  NominaTurno,
  NominaNovedadTurnoOperativoApi,
  NominaTurnoFilters,
  PaginatedNominaEmpleadosApi,
  PaginatedNominaPeriodosApi,
  PaginatedNominaTurnosApi,
  UpdateNominaTurnoPayload,
  CoberturaExternoResumenApi,
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

type ExternalSummaryState = AsyncState<CoberturaExternoResumenApi[]>;
type TurnoView = "todos" | "internos" | "externos";

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

  return formatDateOnly(value, { dateStyle: "medium" });
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

function getTurnCoverageLabel(tipo: "INTERNO" | "EXTERNO") {
  return tipo === "INTERNO" ? "Interno" : "Externo";
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
    fecha: todayDateOnly(),
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
  const [searchParams] = useSearchParams();
  const { empresaId } = useCompanyContext();
  const { user } = useAuth();
  const [periodsState, setPeriodsState] = useState<AsyncState<PaginatedNominaPeriodosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [movementsState, setMovementsState] = useState<AsyncState<PaginatedNominaTurnosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [internalTurnsState, setInternalTurnsState] = useState<AsyncState<{ items: NominaNovedadTurnoOperativoApi[] }>>({
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
  const [municipioFilter, setMunicipioFilter] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [form, setForm] = useState<TurnoFormState>(emptyForm());
  const [externalSummaryState, setExternalSummaryState] = useState<ExternalSummaryState>({
    ...EMPTY_ASYNC_STATE,
  });
  const [externalBusy, setExternalBusy] = useState<string | null>(null);
  const [turnoView, setTurnoView] = useState<TurnoView>("todos");
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
  const canSeeEconomic = user?.permissions.includes("nomina.economico.read") === true;
  const internalTurns = internalTurnsState.data?.items ?? [];
  const turnRelationByMovementId = useMemo(
    () =>
      new Map(
        internalTurns
          .filter((item) => Boolean(item.movimiento_id))
          .map((item) => [item.movimiento_id as string, item]),
      ),
    [internalTurns],
  );
  const selectedTurnRelation = selectedMovement
    ? turnRelationByMovementId.get(selectedMovement.id) ?? null
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

  const municipioOptions = useMemo<FilterOption[]>(
    () =>
      [...new Set(
        movimientos
          .map(
            (movimiento) =>
              turnRelationByMovementId.get(movimiento.id)?.municipio ??
              movimiento.contexto_operativo?.municipio ??
              "",
          )
          .map((item) => item.trim())
          .filter(Boolean),
      )]
        .sort((left, right) => left.localeCompare(right, "es-CO"))
        .map((item) => ({ value: item, label: item })),
    [movimientos, turnRelationByMovementId],
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
      const turnRelation = turnRelationByMovementId.get(movimiento.id) ?? null;
      const tipoTurno = movimiento.tipo_movimiento === "TURNO_INTERNO" ? "INTERNO" : "EXTERNO";

      if (turnoView === "internos" && tipoTurno !== "INTERNO") {
        return false;
      }

      if (turnoView === "externos" && tipoTurno !== "EXTERNO") {
        return false;
      }

      const movimientoMunicipio =
        turnRelation?.municipio ??
        movimiento.contexto_operativo?.municipio ??
        "";

      if (municipioFilter && movimientoMunicipio !== municipioFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        movimiento.persona.nombre_completo,
        movimiento.persona.numero_documento ?? "",
        movimiento.tipo_movimiento,
        turnRelation?.trabajador_cubre ?? "",
        turnRelation?.trabajador_reemplazado ?? movimiento.persona_reemplazada?.nombre_completo ?? "",
        turnRelation?.novedad_tipo_codigo ?? "",
        turnRelation?.novedad_tipo_nombre ?? "",
        turnRelation?.municipio ?? movimiento.contexto_operativo?.municipio ?? "",
        turnRelation?.institucion ?? movimiento.contexto_operativo?.institucion ?? "",
        turnRelation?.sede ?? movimiento.contexto_operativo?.sede ?? "",
        turnRelation?.motivo ?? movimiento.descripcion ?? "",
        empleado?.cargo?.nombre_cargo ?? "",
        empleado?.categoria_salarial?.modalidad ?? "",
        empleado?.vinculacion.metodo_pago ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es-CO");

      return haystack.includes(normalizedSearch);
    });
  }, [employeeByNominaId, movimientos, municipioFilter, searchTerm, turnoView, turnRelationByMovementId]);

  const kpis = useMemo<Kpi[]>(() => {
    const total = displayedMovimientos.length;
    const internos = displayedMovimientos.filter(
      (movimiento) => movimiento.tipo_movimiento === "TURNO_INTERNO",
    ).length;
    const externos = displayedMovimientos.filter(
      (movimiento) => movimiento.tipo_movimiento === "TURNO_EXTERNO",
    ).length;
    const valorTotal = displayedMovimientos.reduce((sum, movimiento) => sum + movimiento.valor_total, 0);
    const activos = displayedMovimientos.filter((movimiento) => movimiento.activo).length;
    const documentacionCompleta = displayedMovimientos.filter(
      (movimiento) => {
        if (movimiento.tipo_movimiento !== "TURNO_EXTERNO") return false;
        const relation = turnRelationByMovementId.get(movimiento.id);
        return relation?.tipo_turno === "EXTERNO" && relation.documentos_completos;
      },
    ).length;
    const opsCuentaCobro = displayedMovimientos.filter(
      (movimiento) =>
        employeeByNominaId.get(movimiento.nomina_empleado_id)?.vinculacion.metodo_pago === "OPS_CUENTA_COBRO",
    ).length;

    const items: Kpi[] = [
      {
        tone: "primary",
        icon: Users,
        label: "Turnos del periodo",
        value: formatNumber(total),
        caption: selectedPeriod?.nombre_periodo ?? "Sin periodo seleccionado",
      },
      {
        tone: "info",
        icon: Users,
        label: "Turnos internos",
        value: formatNumber(internos),
        caption: "Cobertura entre personal vinculado",
      },
      {
        tone: "success",
        icon: CheckCircle2,
        label: "Turnos externos",
        value: formatNumber(externos),
        caption: "Cobertura con tercero",
      },
      {
        tone: "primary",
        icon: Banknote,
        label: "Valor total",
        value: total > 0 ? formatCOP(valorTotal) : "No disponible",
        caption: "Suma de valor_total",
      },
      {
        tone: "purple",
        icon: Clock,
        label: "Documentación lista",
        value: formatNumber(documentacionCompleta),
        caption: "Externos con checklist completo",
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
    return items.filter((kpi) => canSeeEconomic || !["Valor total", "Metodo OPS cuenta cobro"].includes(kpi.label));
  }, [canSeeEconomic, displayedMovimientos, employeeByNominaId, selectedPeriod, turnRelationByMovementId]);

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
        const data = canSeeEconomic
          ? await getAllNominaTurnos(filters)
          : await getAllNominaTurnosOperativos(filters);

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
    [canSeeEconomic],
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
      const employeeLoader = canSeeEconomic
        ? getAllNominaPeriodoEmpleados
        : getAllNominaPeriodoEmpleadosOperativos;
      const data = await employeeLoader(periodoId, {
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
  }, [canSeeEconomic, empresaId]);

  const loadInternalTurns = useCallback(async (periodoId: string) => {
    setInternalTurnsState({ loading: true, data: null, error: null });
    try {
      const data = await getNominaNovedadTurnosOperativos({ periodo_id: periodoId, activo: true, limit: 500 });
      setInternalTurnsState({ loading: false, data: { items: data.items }, error: null });
    } catch (error) {
      setInternalTurnsState({ loading: false, data: null, error: toMessage(error) });
    }
  }, []);

  useEffect(() => {
    void loadPeriods(searchParams.get("period_id") ?? undefined);
  }, [loadPeriods, searchParams]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setMovementsState({ ...EMPTY_ASYNC_STATE });
      setEmployeesState({ ...EMPTY_ASYNC_STATE });
      setInternalTurnsState({ ...EMPTY_ASYNC_STATE });
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
      loadInternalTurns(selectedPeriodId),
    ]);
  }, [backendActiveFilter, loadEmployees, loadInternalTurns, loadMovimientos, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setExternalSummaryState({ ...EMPTY_ASYNC_STATE });
      return;
    }

    let active = true;
    setExternalSummaryState({ loading: true, data: null, error: null });
    const loadExternalSummary = canSeeEconomic ? getCoberturaExternos : getCoberturaExternosOperativos;
    void loadExternalSummary(selectedPeriodId, empresaId === null ? undefined : String(empresaId))
      .then((data) => {
        if (active) setExternalSummaryState({ loading: false, data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setExternalSummaryState({ loading: false, data: null, error: toMessage(error) });
      });

    return () => {
      active = false;
    };
  }, [canSeeEconomic, empresaId, selectedPeriodId]);

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
    setMunicipioFilter("");
    setFeedback(null);
    setFormError(null);
    setMovementsState({ ...EMPTY_ASYNC_STATE });
    setEmployeesState({ ...EMPTY_ASYNC_STATE });
    setInternalTurnsState({ ...EMPTY_ASYNC_STATE });
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
      loadInternalTurns(selectedPeriodId),
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

  const refreshExternalSummary = async () => {
    if (!selectedPeriodId) return;
    const loadExternalSummary = canSeeEconomic ? getCoberturaExternos : getCoberturaExternosOperativos;
    const data = await loadExternalSummary(selectedPeriodId, empresaId === null ? undefined : String(empresaId));
    setExternalSummaryState({ loading: false, data, error: null });
  };

  const handleExternalDocument = async (externoId: string, tipoDocumento: 'CEDULA_EXTERNO_COBERTURA' | 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA', file: File | undefined) => {
    if (!file) return;
    setExternalBusy(`${externoId}:${tipoDocumento}`);
    try {
      await uploadCoberturaExternoDocumento(externoId, tipoDocumento, file);
      await refreshExternalSummary();
      setFeedback({ tone: 'success', message: 'Documento externo cargado correctamente.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setExternalBusy(null);
    }
  };

  const handleViewExternalDocument = async (externoId: string, tipoDocumento: string) => {
    setExternalBusy(`view:${externoId}:${tipoDocumento}`);
    try {
      const documents = await listarDocumentosCoberturaExterno(externoId);
      const document = documents.find((item) => item.tipo_documento === tipoDocumento);
      if (!document) throw new Error('Documento no encontrado.');
      window.open(document.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setExternalBusy(null);
    }
  };

  const handleGenerateExternalAccount = async (externoId: string) => {
    if (!selectedPeriodId || empresaId === null || !selectedPeriod?.contrato_id) return;
    setExternalBusy(`account:${externoId}`);
    try {
      await generarCoberturaCuenta(String(empresaId), String(selectedPeriod.contrato_id), selectedPeriodId, externoId);
      await refreshExternalSummary();
      setFeedback({ tone: 'success', message: 'Cuenta de cobro generada.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setExternalBusy(null);
    }
  };

  const handleDownloadExternalAccount = async (cuentaId: string) => {
    setExternalBusy(`download:${cuentaId}`);
    try {
      const result = await descargarCoberturaCuenta(cuentaId);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setExternalBusy(null);
    }
  };

  const handleSignedExternalAccount = async (cuentaId: string, file: File | undefined) => {
    if (!file) return;
    setExternalBusy(`signed:${cuentaId}`);
    try {
      await uploadCoberturaCuentaFirmada(cuentaId, file);
      await refreshExternalSummary();
      setFeedback({ tone: 'success', message: 'Cuenta firmada cargada.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setExternalBusy(null);
    }
  };

  const handleViewSignedAccount = async (cuentaId: string) => {
    setExternalBusy(`signed-view:${cuentaId}`);
    try {
      const result = await verCoberturaCuentaFirmada(cuentaId);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFeedback({ tone: 'error', message: toMessage(error) });
    } finally {
      setExternalBusy(null);
    }
  };

  const validateForm = () => {
    if (!selectedPeriodId) {
      return "Selecciona un periodo antes de registrar turnos.";
    }

    if (!canMutatePeriod) {
      return "El periodo seleccionado esta en solo lectura. Solo puedes registrar cambios en periodos abiertos.";
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
    setMunicipioFilter("");
  };

  const canCreate = Boolean(selectedPeriodId) && !employeesState.loading && empleados.length > 0;
  const hasPeriods = periodos.length > 0;
  const isTableEmpty =
    !movementsState.loading &&
    !movementsState.error &&
    selectedPeriodId !== null &&
    displayedMovimientos.length === 0;
  const showSummaryRow =
    byTypeSummary.length > 0 ||
    topEmployees.length > 0 ||
    (canSeeEconomic &&
      (valueByNature.devengados !== 0 ||
        valueByNature.deducciones !== 0 ||
        valueByNature.sinNaturaleza !== 0));

  return (
    <div className="np-page">
      <CoberturaFlowNav periodId={selectedPeriodId} />
      <header className="np-header">
        <div className="np-header-text">
          <h1>Turnos</h1>
          <p>Consulta las coberturas del periodo y revisa los turnos registrados.</p>
        </div>
        <div className="np-header-actions">
          <button
            type="button"
            className="np-btn primary"
            hidden={!canSeeEconomic}
            onClick={openCreateEditor}
            disabled={!canCreate || !canMutatePeriod || isSubmitting}
            title={
              !canMutatePeriod && selectedPeriod
                ? `El periodo ${selectedPeriod.nombre_periodo} esta en estado ${selectedPeriod.estado}. Solo puedes registrar turnos en periodos abiertos.`
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
                : "Exportar movimientos del período"
            }
          >
            <Download size={16} /> {isExporting ? "Exportando..." : "Exportar movimientos"}
          </button>
        </div>
      </header>

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
          Periodo en solo lectura: el estado actual es <strong>{selectedPeriod.estado}</strong>. Solo
          puedes crear, editar o desactivar turnos cuando el periodo esta en <strong>ABIERTO</strong>.
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
            label="Municipio"
            value={municipioFilter}
            onChange={setMunicipioFilter}
            options={municipioOptions}
            disabled={!selectedPeriodId || municipioOptions.length === 0}
          />
        </div>
        <div className="np-toolbar-right">
          <div className="np-segmented" role="tablist" aria-label="Tipo de turno">
            {([['todos', 'Todos'], ['internos', 'Internos'], ['externos', 'Externos']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={turnoView === value} className={turnoView === value ? "active" : ""} onClick={() => setTurnoView(value)}>{label}</button>
            ))}
          </div>
          <span className="np-badge info">TURNO_INTERNO / TURNO_EXTERNO</span>
          <button
            type="button"
            className="np-clear-btn"
            onClick={clearFilters}
            disabled={!searchTerm && !activeFilter && !municipioFilter}
          >
            Limpiar
          </button>
        </div>
      </div>

      {turnoView !== "internos" ? <section className="np-external-summary" aria-labelledby="external-summary-title">
        <div className="np-section-heading">
          <div>
            <span className="np-eyebrow">COBERTURA</span>
            <h2 id="external-summary-title">Externos consolidados</h2>
          </div>
          <span className="np-badge info">Identidad + turnos del período</span>
        </div>
        {externalSummaryState.loading ? <div className="np-empty">Cargando externos...</div> : null}
        {externalSummaryState.error ? (
          <div className="np-inline-state error" role="alert">No fue posible cargar el resumen de externos: {externalSummaryState.error}</div>
        ) : null}
        {!externalSummaryState.loading && !externalSummaryState.error && selectedPeriodId && (externalSummaryState.data?.length ?? 0) === 0 ? (
          <div className="np-empty">No hay identidades externas asociadas al período.</div>
        ) : null}
        {(externalSummaryState.data?.length ?? 0) > 0 ? (
          <div className="np-external-summary-list">
            {externalSummaryState.data?.map((externo) => (
              <article className="np-external-summary-row" key={externo.id}>
                <div>
                  <strong>{externo.nombre_completo}</strong>
                  <span>{externo.tipo_documento} {externo.numero_documento}</span>
                </div>
                <div><span>Turnos</span><strong>{formatNumber(Number(externo.turnos))}</strong></div>
                {canSeeEconomic ? <div><span>Total registrado</span><strong>{formatCOP(Number(externo.valor_total))}</strong></div> : <div><span>Tipo</span><strong>Operativo</strong></div>}
                {canSeeEconomic ? <div className="np-external-checklist">
                  <span className={externo.cedula ? "is-ready" : "is-pending"}>Cédula: {externo.cedula ? "Cargada" : "Pendiente"}</span>
                  <span className={externo.banco_doc ? "is-ready" : "is-pending"}>Banco: {externo.banco_doc ? "Cargada" : "Pendiente"}</span>
                  <span className={externo.cuenta_estado === "FIRMADA" ? "is-ready" : "is-pending"}>Cuenta: {externo.cuenta_estado}</span>
                </div> : null}
                {canSeeEconomic ? <div className="np-external-actions">
                  <label className="np-btn">
                    {externo.cedula ? "Reemplazar cédula" : "Subir cédula"}
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden disabled={externalBusy !== null} onChange={(event) => { void handleExternalDocument(externo.id, 'CEDULA_EXTERNO_COBERTURA', event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  </label>
                  {externo.cedula ? <button type="button" className="np-btn" disabled={externalBusy !== null} onClick={() => { void handleViewExternalDocument(externo.id, 'CEDULA_EXTERNO_COBERTURA'); }}>Ver cédula</button> : null}
                  <label className="np-btn">
                    {externo.banco_doc ? "Reemplazar banco" : "Subir banco"}
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden disabled={externalBusy !== null} onChange={(event) => { void handleExternalDocument(externo.id, 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA', event.target.files?.[0]); event.currentTarget.value = ''; }} />
                  </label>
                  {externo.banco_doc ? <button type="button" className="np-btn" disabled={externalBusy !== null} onClick={() => { void handleViewExternalDocument(externo.id, 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA'); }}>Ver certificación</button> : null}
                  {externo.cuenta_estado === 'PENDIENTE' && externo.turnos > 0 ? <button type="button" className="np-btn primary" disabled={externalBusy !== null || !selectedPeriod?.contrato_id} onClick={() => { void handleGenerateExternalAccount(externo.id); }}>Generar cuenta</button> : null}
                  {externo.cuenta_id && externo.cuenta_estado !== 'PENDIENTE' ? <button type="button" className="np-btn" disabled={externalBusy !== null} onClick={() => { void handleDownloadExternalAccount(externo.cuenta_id as string); }}>Descargar cuenta</button> : null}
                  {externo.cuenta_id && externo.cuenta_estado === 'GENERADA' ? <label className="np-btn">Subir firmada<input type="file" accept="application/pdf" hidden disabled={externalBusy !== null} onChange={(event) => { void handleSignedExternalAccount(externo.cuenta_id as string, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label> : null}
                  {externo.cuenta_id && externo.cuenta_estado === 'FIRMADA' ? <button type="button" className="np-btn" disabled={externalBusy !== null} onClick={() => { void handleViewSignedAccount(externo.cuenta_id as string); }}>Ver firmada</button> : null}
                </div> : null}
              </article>
            ))}
          </div>
        ) : null}
      </section> : null}

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
                  "110px 120px minmax(220px,1.55fr) minmax(220px,1.45fr) 140px 140px minmax(180px,1.2fr) 120px 130px 150px",
              }}
            >
              <span>Fecha</span>
              <span>Tipo</span>
              <span>Trabajador que cubre</span>
              <span>Trabajador reemplazado</span>
              <span>Municipio</span>
              <span>Sede</span>
              <span>Motivo</span>
              <span>Estado</span>
              <span>Documentos</span>
              <span>Acciones</span>
            </div>

            {displayedMovimientos.map((movimiento) => {
              const turnRelation = turnRelationByMovementId.get(movimiento.id) ?? null;
              const tipoTurno = movimiento.tipo_movimiento === "TURNO_INTERNO" ? "INTERNO" : "EXTERNO";
              const cubreNombre = turnRelation?.trabajador_cubre ?? movimiento.persona.nombre_completo;
              const cubreDocumento = turnRelation?.trabajador_cubre_documento ?? movimiento.persona.numero_documento;
              const reemplazadoNombre =
                turnRelation?.trabajador_reemplazado ?? movimiento.persona_reemplazada?.nombre_completo ?? "No disponible";
              const reemplazadoDocumento =
                turnRelation?.trabajador_reemplazado_documento ?? movimiento.persona_reemplazada?.numero_documento ?? null;
              const documentosLabel =
                tipoTurno === "INTERNO"
                  ? "No aplica"
                  : turnRelation?.documentos_completos
                    ? "Completo"
                    : "Pendiente";

              return (
              <div
                key={movimiento.id}
                className={`np-table-row${selectedMovementId === movimiento.id ? " is-selected" : ""}`}
                style={{
                  gridTemplateColumns:
                    "110px 120px minmax(220px,1.55fr) minmax(220px,1.45fr) 140px 140px minmax(180px,1.2fr) 120px 130px 150px",
                }}
              >
                <span className="np-table-text">{formatDate(movimiento.fecha)}</span>
                <span className={`np-badge ${tipoTurno === "INTERNO" ? "info" : "primary"}`}>{getTurnCoverageLabel(tipoTurno)}</span>
                <span className="np-table-text np-table-text-strong">{cubreNombre}{cubreDocumento ? ` · ${cubreDocumento}` : ""}</span>
                <span className="np-table-text np-table-text-secondary">
                  {reemplazadoNombre}{reemplazadoDocumento ? ` · ${reemplazadoDocumento}` : ""}
                </span>
                <span className="np-table-text np-table-text-secondary">
                  {turnRelation?.municipio ?? movimiento.contexto_operativo?.municipio ?? "No disponible"}
                </span>
                <span className="np-table-text np-table-text-secondary">
                  {turnRelation?.sede ?? movimiento.contexto_operativo?.sede ?? "No disponible"}
                </span>
                <span className="np-table-text">
                  {turnRelation?.motivo ?? movimiento.descripcion ?? "No disponible"}
                </span>
                <span className={`np-badge ${getMovementStatusTone(movimiento)}`}>
                  {turnRelation?.estado ?? getMovementStatusLabel(movimiento)}
                </span>
                <span className={`np-badge ${documentosLabel === "Completo" || documentosLabel === "No aplica" ? "success" : "warning"}`}>
                  {documentosLabel}
                </span>
                <div className="np-row-status">
                  <button
                    type="button"
                    className="np-icon-button"
                    title="Ver detalle"
                    aria-label={`Ver detalle de ${cubreNombre}`}
                    onClick={() =>
                      setSelectedMovementId((current) => (current === movimiento.id ? null : movimiento.id))
                    }
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className="np-icon-button"
                    hidden={!canSeeEconomic}
                    title="Editar"
                    aria-label={`Editar ${cubreNombre}`}
                    onClick={() => openEditEditor(movimiento)}
                    disabled={
                      movimiento.tipo_movimiento !== "TURNO_EXTERNO" ||
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
                    hidden={!canSeeEconomic}
                    title="Desactivar"
                    aria-label={`Desactivar ${cubreNombre}`}
                    onClick={() => void handleDeactivate(movimiento)}
                    disabled={movimiento.tipo_movimiento !== "TURNO_EXTERNO" || !movimiento.activo || !canMutatePeriod || isSubmitting}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
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
              <strong>{selectedTurnRelation?.trabajador_cubre_documento ?? selectedMovement.persona.numero_documento ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Tipo de turno</span>
              <strong>{getMovementTypeLabel(selectedMovement.tipo_movimiento)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Interno / externo</span>
              <strong>{getTurnCoverageLabel(selectedMovement.tipo_movimiento === "TURNO_INTERNO" ? "INTERNO" : "EXTERNO")}</strong>
            </div>
            <div className="np-detail-field">
              <span>Fecha</span>
              <strong>{formatDate(selectedMovement.fecha)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Estado</span>
              <strong>{selectedTurnRelation?.estado ?? getMovementStatusLabel(selectedMovement)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Modalidad</span>
              <strong>
                {selectedTurnRelation?.modalidad ??
                  selectedMovement.contexto_operativo?.modalidad ??
                  selectedMovementEmployee?.categoria_salarial?.modalidad ??
                  "No disponible"}
              </strong>
            </div>
            {canSeeEconomic ? <div className="np-detail-field">
              <span>Metodo de pago</span>
              <strong>{getMetodoPagoLabel(selectedMovementEmployee?.vinculacion.metodo_pago ?? null)}</strong>
            </div> : null}
            <div className="np-detail-field">
              <span>Reemplaza</span>
              <strong>{selectedTurnRelation?.trabajador_reemplazado ?? selectedMovement.persona_reemplazada?.nombre_completo ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Institucion</span>
              <strong>{selectedTurnRelation?.institucion ?? selectedMovement.contexto_operativo?.institucion ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Sede</span>
              <strong>{selectedTurnRelation?.sede ?? selectedMovement.contexto_operativo?.sede ?? "No disponible"}</strong>
            </div>
            {canSeeEconomic ? <div className="np-detail-field">
              <span>Cuenta de cobro</span>
              <strong>{selectedMovement.tipo_movimiento === "TURNO_EXTERNO" ? getCuentaCobroLabel(selectedMovementEmployee?.vinculacion.metodo_pago ?? null) : "No aplica"}</strong>
            </div> : null}
          </div>

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Cantidad</span>
              <strong>{selectedMovement.cantidad ?? "No disponible"}</strong>
            </div>
            {canSeeEconomic ? <div className="np-detail-field">
              <span>Valor calculado</span>
              <strong>
                {selectedMovement.valor_calculado === null
                  ? "No disponible"
                  : formatCOP(selectedMovement.valor_calculado)}
              </strong>
            </div> : null}
            {canSeeEconomic ? <div className="np-detail-field">
              <span>Valor aplicado</span>
              <strong>{formatCOP(selectedMovement.valor_aplicado)}</strong>
            </div> : null}
            <div className="np-detail-field">
              <span>Descripción</span>
              <strong>{selectedTurnRelation?.motivo ?? selectedMovement.descripcion ?? "No disponible"}</strong>
            </div>
            {canSeeEconomic ? <div className="np-detail-field">
              <span>Afecta seguridad social</span>
              <strong>{selectedMovement.afecta_seguridad_social ? "Sí" : "No"}</strong>
            </div> : null}
            <div className="np-detail-field">
              <span>Cargo</span>
              <strong>{selectedMovementEmployee?.cargo?.nombre_cargo ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Creado</span>
              <strong>{formatDate(selectedMovement.created_at)}</strong>
            </div>
            {canSeeEconomic ? <div className="np-detail-field">
              <span>Motivo ajuste</span>
              <strong>{selectedMovement.motivo_ajuste_valor ?? "No disponible"}</strong>
            </div> : null}
          </div>

          {canSeeEconomic ? <div className="np-detail-total">
            <span>Valor aplicado</span>
            <strong>{formatCOP(selectedMovement.valor_aplicado)}</strong>
          </div> : null}

          {selectedMovement.alertas_validacion.length > 0 || selectedMovement.posible_duplicado ? (
            <div className="np-inline-state warning">
              {selectedMovement.posible_duplicado ? (
                <div>Este turno fue marcado como posible duplicado y requiere revisión.</div>
              ) : null}
              {selectedMovement.alertas_validacion.map((alerta, index) => (
                <div key={`${alerta.tipo}-${index}`}>
                  {alerta.tipo}: {alerta.mensaje}
                </div>
              ))}
            </div>
          ) : null}

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Municipio</span>
              <strong>{selectedTurnRelation?.municipio ?? selectedMovement.contexto_operativo?.municipio ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Origen de cobertura</span>
              <strong>{selectedTurnRelation?.origen_cobertura ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Novedad relacionada</span>
              <strong>{selectedTurnRelation?.novedad_tipo_codigo ?? selectedTurnRelation?.novedad_tipo_nombre ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Trabajador que cubre</span>
              <strong>{selectedTurnRelation?.trabajador_cubre ?? selectedMovement.persona.nombre_completo}</strong>
            </div>
          </div>

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Cédula</span>
              <strong>
                {selectedMovement.tipo_movimiento === "TURNO_INTERNO"
                  ? "No aplica"
                  : selectedTurnRelation?.cedula_cargada
                    ? "Cargada"
                    : "Pendiente"}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Certificación bancaria</span>
              <strong>
                {selectedMovement.tipo_movimiento === "TURNO_INTERNO"
                  ? "No aplica"
                  : selectedTurnRelation?.certificacion_bancaria_cargada
                    ? "Cargada"
                    : "Pendiente"}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Cuenta de cobro</span>
              <strong>
                {selectedMovement.tipo_movimiento === "TURNO_INTERNO"
                  ? "No aplica"
                  : selectedTurnRelation?.cuenta_cobro_cargada
                    ? "Cargada"
                    : "Pendiente"}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Estado documental</span>
              <strong>
                {selectedMovement.tipo_movimiento === "TURNO_INTERNO"
                  ? "No requerido"
                  : selectedTurnRelation?.documentos_completos
                    ? "Completo"
                    : "Incompleto"}
              </strong>
            </div>
          </div>
        </div>
      ) : null}

      {editorMode ? (
        <div className="np-detail-panel">
          <div className="np-detail-header">
            <div>
              <h3>{editorMode === "create" ? "Registrar turno externo" : "Editar turno externo"}</h3>
              <p>{selectedPeriod?.nombre_periodo ?? "Periodo no disponible"} · Turno externo del periodo seleccionado.</p>
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
              Contexto del colaborador: cargo {selectedFormEmployee.cargo?.nombre_cargo ?? "No disponible"},
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

      {showSummaryRow ? (
        <div className="np-summary-row">
          <div className="np-summary-card">
            <h4>Turnos por tipo</h4>
            {byTypeSummary.map((item) => (
              <div key={item.label} className="np-summary-item">
                <span>{item.label}</span>
                <strong>
                  {formatNumber(item.count)}{canSeeEconomic ? ` · ${formatCOP(item.total)}` : ""}
                </strong>
              </div>
            ))}
          </div>

          {canSeeEconomic ? <div className="np-summary-card">
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
          </div> : null}

          <div className="np-summary-card">
            <h4>Top 5 · mas turnos</h4>
            {topEmployees.map((item, index) => (
              <div key={item.name} className="np-summary-item">
                <span>
                  {index + 1}. {item.name}
                </span>
                <strong>{formatNumber(item.count)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

















