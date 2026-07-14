import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  exportNominaMovimientosCsv,
  getAllNominaMovimientos,
  getAllNominaNovedades,
  getNominaDesprendibles,
  getNominaPeriodos,
  openNominaDesprendible,
  recalculateNominaPeriodo,
} from "../../services/nominaApi";
import type {
  NominaDesprendibleApi,
  NominaMovimientoApi,
  NominaNovedadApi,
  NominaPeriodoApi,
  PaginatedNominaPeriodosApi,
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
  tone: "success" | "error";
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

type CorrectionData = {
  desprendibles: NominaDesprendibleApi[];
  movimientos: NominaMovimientoApi[];
  novedades: NominaNovedadApi[];
};

type CorrectionRecordSource = "movimiento" | "novedad";

type CorrectionRecord = {
  created_at: string;
  documento: string | null;
  estadoLabel: string;
  estadoTone: Tone;
  fechaPrincipal: string | null;
  id: string;
  key: string;
  motivo: string | null;
  nomina_empleado_id: string;
  periodoLabel: string;
  personaNombre: string;
  source: CorrectionRecordSource;
  sourceLabel: string;
  statusKey: string;
  soporteDisponible: boolean;
  summaryLabel: string;
  valor: number | null;
  vinculacion_id: string;
  movimiento?: NominaMovimientoApi;
  novedad?: NominaNovedadApi;
};

const EMPTY_ASYNC_STATE = {
  loading: false,
  data: null,
  error: null,
};

const PERIODS_LIMIT = 100;
const MANUAL_CORRECTION_MOVEMENT_TYPES = new Set([
  "AJUSTE",
  "ADICION_MANUAL",
  "DESCUENTO_MANUAL",
]);
const AVATAR_COLORS = ["green", "blue", "purple", "orange", "red", "cyan", "teal", "pink"] as const;

function formatCOP(value: number) {
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

function formatBoolean(value: boolean) {
  return value ? "Sí" : "No";
}

function formatOptionalNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "No disponible";
  }

  return value.toLocaleString("es-CO");
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function hasEconomicImpact(novedad: NominaNovedadApi) {
  return Boolean(
    novedad.valor_manual !== null ||
      novedad.tipo_novedad.afecta_salario ||
      novedad.tipo_novedad.afecta_transporte ||
      novedad.tipo_novedad.requiere_valor ||
      novedad.categoria_anterior_id ||
      novedad.categoria_nueva_id,
  );
}

function isManualCorrectionMovement(movimiento: NominaMovimientoApi) {
  return MANUAL_CORRECTION_MOVEMENT_TYPES.has(movimiento.tipo_movimiento);
}

function getMovementStatusTone(movimiento: NominaMovimientoApi): Tone {
  return movimiento.activo ? "primary" : "neutral";
}

function getMovementStatusLabel(movimiento: NominaMovimientoApi) {
  return movimiento.activo ? "Activo" : "Inactivo";
}

function getNoveltyStatusTone(novedad: NominaNovedadApi): Tone {
  if (!novedad.activo) {
    return "neutral";
  }

  if (!novedad.revisado) {
    return "warning";
  }

  if (novedad.requiere_cobertura && !novedad.cubierta) {
    return "info";
  }

  if (novedad.requiere_cobertura && novedad.cubierta) {
    return "primary";
  }

  return "success";
}

function getNoveltyStatusLabel(novedad: NominaNovedadApi) {
  if (!novedad.activo) {
    return "Inactiva";
  }

  if (!novedad.revisado) {
    return "Pendiente revisión";
  }

  if (novedad.requiere_cobertura && !novedad.cubierta) {
    return "Requiere cobertura";
  }

  if (novedad.requiere_cobertura && novedad.cubierta) {
    return "Cubierta";
  }

  return "Revisada";
}

function getAvatarColor(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % AVATAR_COLORS.length;
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(value: string) {
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

function NpSelect({
  disabled = false,
  icon: Icon,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  icon?: ComponentType<{ size?: number }>;
  label: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  value: string;
}) {
  return (
    <div className={`np-select-wrap${disabled ? " is-disabled" : ""}`}>
      {Icon ? <Icon size={15} /> : null}
      <select
        className="np-select"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
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

export default function CorreccionNominaPage() {
  const [periodsState, setPeriodsState] =
    useState<AsyncState<PaginatedNominaPeriodosApi>>(EMPTY_ASYNC_STATE);
  const [dataState, setDataState] = useState<AsyncState<CorrectionData>>(EMPTY_ASYNC_STATE);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedRecordKey, setSelectedRecordKey] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [submittingAction, setSubmittingAction] = useState<"export" | "recalculate" | "slip" | null>(null);

  const loadPeriodData = useCallback(async (periodId: string) => {
    setDataState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const [movimientos, novedades, desprendibles] = await Promise.all([
        getAllNominaMovimientos({ periodo_id: periodId }),
        getAllNominaNovedades({ periodo_id: periodId }),
        getNominaDesprendibles(periodId),
      ]);

      setDataState({
        loading: false,
        error: null,
        data: {
          movimientos: movimientos.items,
          novedades: novedades.items,
          desprendibles,
        },
      });
    } catch (error) {
      setDataState({
        loading: false,
        error: toMessage(error),
        data: null,
      });
    }
  }, []);

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
        setSelectedPeriodId((current) => current || defaultPeriod?.id || "");
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

    void loadPeriods();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) {
      setDataState(EMPTY_ASYNC_STATE);
      return;
    }

    void loadPeriodData(selectedPeriodId);
  }, [loadPeriodData, selectedPeriodId]);

  useEffect(() => {
    setSelectedRecordKey("");
  }, [selectedPeriodId]);

  const periodOptions = useMemo<FilterOption[]>(() => {
    return (periodsState.data?.items ?? []).map((periodo) => ({
      label: periodo.nombre_periodo,
      value: periodo.id,
    }));
  }, [periodsState.data]);

  const selectedPeriod = useMemo<NominaPeriodoApi | null>(() => {
    return periodsState.data?.items.find((periodo) => periodo.id === selectedPeriodId) ?? null;
  }, [periodsState.data, selectedPeriodId]);

  const desprendiblesVigentes = useMemo(() => {
    return (dataState.data?.desprendibles ?? []).filter((item) => item.es_vigente);
  }, [dataState.data]);

  const desprendibleByVinculacion = useMemo(() => {
    return new Map(desprendiblesVigentes.map((item) => [item.vinculacion_id, item]));
  }, [desprendiblesVigentes]);

  const allRecords = useMemo<CorrectionRecord[]>(() => {
    const periodoLabel = selectedPeriod?.nombre_periodo ?? "No disponible";
    const movimientos = (dataState.data?.movimientos ?? [])
      .filter(isManualCorrectionMovement)
      .map((movimiento) => ({
        created_at: movimiento.created_at,
        documento: movimiento.persona.numero_documento,
        estadoLabel: getMovementStatusLabel(movimiento),
        estadoTone: getMovementStatusTone(movimiento),
        fechaPrincipal: movimiento.fecha ?? movimiento.created_at,
        id: movimiento.id,
        key: `movimiento-${movimiento.id}`,
        motivo: movimiento.descripcion,
        movimiento,
        nomina_empleado_id: movimiento.nomina_empleado_id,
        periodoLabel: movimiento.periodo.nombre_periodo ?? periodoLabel,
        personaNombre: movimiento.persona.nombre_completo,
        source: "movimiento" as const,
        sourceLabel: "Movimiento manual",
        statusKey: movimiento.activo ? "ACTIVO" : "INACTIVO",
        soporteDisponible: desprendibleByVinculacion.has(movimiento.vinculacion_id),
        summaryLabel: titleCase(movimiento.tipo_movimiento),
        valor: movimiento.valor_total,
        vinculacion_id: movimiento.vinculacion_id,
      }));

    const novedades = (dataState.data?.novedades ?? [])
      .filter(hasEconomicImpact)
      .map((novedad) => ({
        created_at: novedad.created_at,
        documento: novedad.persona.numero_documento,
        estadoLabel: getNoveltyStatusLabel(novedad),
        estadoTone: getNoveltyStatusTone(novedad),
        fechaPrincipal: novedad.fecha_inicio ?? novedad.created_at,
        id: novedad.id,
        key: `novedad-${novedad.id}`,
        motivo: novedad.observacion,
        nomina_empleado_id: novedad.nomina_empleado_id,
        novedad,
        periodoLabel,
        personaNombre: novedad.persona.nombre_completo,
        source: "novedad" as const,
        sourceLabel: "Novedad con impacto",
        statusKey: !novedad.activo
          ? "INACTIVO"
          : !novedad.revisado
            ? "PENDIENTE_REVISION"
            : novedad.requiere_cobertura && !novedad.cubierta
              ? "REQUIERE_COBERTURA"
              : novedad.requiere_cobertura && novedad.cubierta
                ? "CUBIERTA"
                : "REVISADA",
        soporteDisponible: desprendibleByVinculacion.has(novedad.vinculacion_id),
        summaryLabel: novedad.tipo_novedad.nombre ?? "Novedad",
        valor: novedad.valor_manual,
        vinculacion_id: novedad.vinculacion_id,
      }));

    return [...movimientos, ...novedades].sort((left, right) => {
      return toTimestamp(right.fechaPrincipal) - toTimestamp(left.fechaPrincipal);
    });
  }, [dataState.data, desprendibleByVinculacion, selectedPeriod]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return allRecords.filter((record) => {
      if (sourceFilter && record.source !== sourceFilter) {
        return false;
      }

      if (statusFilter && record.statusKey !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        record.personaNombre,
        record.documento ?? "",
        record.summaryLabel,
        record.motivo ?? "",
        record.sourceLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [allRecords, search, sourceFilter, statusFilter]);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedRecordKey("");
      return;
    }

    if (!filteredRecords.some((record) => record.key === selectedRecordKey)) {
      setSelectedRecordKey(filteredRecords[0].key);
    }
  }, [filteredRecords, selectedRecordKey]);

  const selectedRecord = useMemo(() => {
    return filteredRecords.find((record) => record.key === selectedRecordKey) ?? null;
  }, [filteredRecords, selectedRecordKey]);

  const selectedDesprendible = useMemo(() => {
    if (!selectedRecord) {
      return null;
    }

    return desprendibleByVinculacion.get(selectedRecord.vinculacion_id) ?? null;
  }, [desprendibleByVinculacion, selectedRecord]);

  const kpis = useMemo<Kpi[]>(() => {
    const movimientos = allRecords.filter((record) => record.source === "movimiento").length;
    const novedades = allRecords.filter((record) => record.source === "novedad").length;
    const pendientesRevision = allRecords.filter(
      (record) => record.source === "novedad" && record.statusKey === "PENDIENTE_REVISION",
    ).length;
    const valores = allRecords
      .map((record) => record.valor)
      .filter((value): value is number => typeof value === "number");
    const totalManual = valores.length > 0 ? valores.reduce((sum, value) => sum + value, 0) : null;

    return [
      {
        caption: "Movimientos manuales y novedades con impacto",
        icon: ClipboardList,
        label: "Registros detectados",
        tone: "primary",
        value: allRecords.length.toLocaleString("es-CO"),
      },
      {
        caption: "Novedades no revisadas del período",
        icon: AlertTriangle,
        label: "Pendientes revisión",
        tone: "warning",
        value: pendientesRevision.toLocaleString("es-CO"),
      },
      {
        caption: "Tipos AJUSTE, ADICION_MANUAL y DESCUENTO_MANUAL",
        icon: RefreshCw,
        label: "Movimientos manuales",
        tone: "info",
        value: movimientos.toLocaleString("es-CO"),
      },
      {
        caption: "Novedades con valor o impacto salarial",
        icon: FileText,
        label: "Novedades con impacto",
        tone: "success",
        value: novedades.toLocaleString("es-CO"),
      },
      {
        caption: "Solo valores presentes en movimientos o valor_manual",
        icon: Wallet,
        label: "Valor detectado",
        tone: "danger",
        value: totalManual === null ? "No disponible" : formatCOP(totalManual),
      },
      {
        caption: "Recurso real `nomina_desprendibles`",
        icon: Download,
        label: "Desprendibles vigentes",
        tone: "neutral",
        value: desprendiblesVigentes.length.toLocaleString("es-CO"),
      },
    ];
  }, [allRecords, desprendiblesVigentes]);

  const sourceOptions: FilterOption[] = [
    { label: "Todos", value: "" },
    { label: "Movimiento manual", value: "movimiento" },
    { label: "Novedad con impacto", value: "novedad" },
  ];

  const statusOptions: FilterOption[] = [
    { label: "Todos", value: "" },
    { label: "Activo", value: "ACTIVO" },
    { label: "Inactivo", value: "INACTIVO" },
    { label: "Pendiente revisión", value: "PENDIENTE_REVISION" },
    { label: "Revisada", value: "REVISADA" },
    { label: "Requiere cobertura", value: "REQUIERE_COBERTURA" },
    { label: "Cubierta", value: "CUBIERTA" },
  ];

  const clearFilters = () => {
    setSearch("");
    setSourceFilter("");
    setStatusFilter("");
  };

  const handleRecalculate = async () => {
    if (!selectedPeriodId) {
      return;
    }

    setSubmittingAction("recalculate");
    setFeedback(null);

    try {
      await recalculateNominaPeriodo(selectedPeriodId);
      await loadPeriodData(selectedPeriodId);
      setFeedback({
        tone: "success",
        message: "El período fue reprocesado con el endpoint real de nómina.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleExport = async () => {
    if (!selectedPeriodId) {
      return;
    }

    setSubmittingAction("export");
    setFeedback(null);

    try {
      const metadata = await exportNominaMovimientosCsv(selectedPeriodId);
      setFeedback({
        tone: "success",
        message: `Se exportaron los movimientos reales del período seleccionado: ${metadata.file_name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleOpenSlip = async (record: CorrectionRecord) => {
    if (!selectedPeriodId) {
      return;
    }

    setSubmittingAction("slip");
    setFeedback(null);

    try {
      const metadata = await openNominaDesprendible(selectedPeriodId, record.vinculacion_id);
      setFeedback({
        tone: "success",
        message: `Se abrió el desprendible vigente asociado a la vinculación seleccionada: ${metadata.file_name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setSubmittingAction(null);
    }
  };

  const backendBrechas = [
    "No existe tabla ni endpoint `nomina_correcciones` en `src/modules/nomina` ni en `sql`.",
    "No existe flujo backend de crear, revisar, aprobar, rechazar, aplicar o desactivar correcciones.",
    "No existe recurso específico de pagos pendientes asociado a correcciones de nómina.",
    "No existe desprendible corregido dedicado; el backend solo expone `nomina_desprendibles` versionados.",
  ];

  return (
    <div className="np-page">
      <header className="np-header">
        <div className="np-header-text">
          <h1>Corrección de nómina</h1>
          <p>
            Vista conectada a movimientos manuales, novedades con impacto y desprendibles vigentes.
            El backend no expone un recurso dedicado de correcciones.
          </p>
        </div>
        <div className="np-header-actions">
          <button
            type="button"
            className="np-btn primary"
            disabled
            title="No existe endpoint real para crear correcciones de nómina."
          >
            Nueva corrección
          </button>
          <button
            type="button"
            className="np-btn"
            disabled={!selectedPeriodId || submittingAction !== null}
            onClick={() => void handleRecalculate()}
          >
            <RefreshCw size={16} /> Reprocesar período
          </button>
          <button
            type="button"
            className="np-btn"
            disabled={!selectedPeriodId || submittingAction !== null || allRecords.length === 0}
            onClick={() => void handleExport()}
            title={
              allRecords.length === 0
                ? "No hay registros relacionados para exportar movimientos del período."
                : "Exportar movimientos reales del backend"
            }
          >
            <Download size={16} /> Exportar movimientos
          </button>
        </div>
      </header>

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
        <div className={`np-inline-state ${feedback.tone === "success" ? "success" : "error"}`}>
          {feedback.message}
        </div>
      ) : null}

      <div className="np-toolbar">
        <div className="np-toolbar-left">
          <div className="np-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar persona, documento o concepto"
            />
          </div>
          <NpSelect
            label="Período"
            value={selectedPeriodId}
            onChange={setSelectedPeriodId}
            options={periodOptions}
            disabled={periodsState.loading || periodOptions.length === 0}
          />
          <NpSelect
            label="Fuente"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={sourceOptions}
            disabled={dataState.loading || allRecords.length === 0}
          />
          <NpSelect
            label="Estado"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            disabled={dataState.loading || allRecords.length === 0}
          />
        </div>
        <div className="np-toolbar-right">
          <button type="button" className="np-clear-btn" onClick={clearFilters}>
            Limpiar
          </button>
        </div>
      </div>

      <div className="np-table-card">
        {periodsState.loading && !periodsState.data ? (
          <StateCard title="Cargando períodos" message="Consultando períodos reales de nómina." />
        ) : periodsState.error ? (
          <StateCard
            title="Error cargando períodos"
            message={periodsState.error}
            tone="error"
            actionLabel="Reintentar"
            onAction={() => window.location.reload()}
          />
        ) : !selectedPeriodId ? (
          <StateCard
            title="Sin período disponible"
            message="No hay un período activo o reciente para consultar ajustes relacionados."
          />
        ) : dataState.loading ? (
          <StateCard
            title="Cargando datos del período"
            message="Consultando movimientos, novedades y desprendibles reales."
          />
        ) : dataState.error ? (
          <StateCard
            title="Error cargando corrección nómina"
            message={dataState.error}
            tone="error"
            actionLabel="Reintentar"
            onAction={() => void loadPeriodData(selectedPeriodId)}
          />
        ) : filteredRecords.length === 0 ? (
          <StateCard
            title="Sin registros relacionados"
            message="El período no tiene movimientos manuales ni novedades con impacto económico según los contratos reales del backend."
          />
        ) : (
          <div className="np-table-scroll">
            <div
              className="np-table-head"
              style={{
                gridTemplateColumns:
                  "120px minmax(220px,2fr) 120px 140px 170px 170px 130px 130px 90px 70px",
              }}
            >
              <span>Fecha</span>
              <span>Persona</span>
              <span>Documento</span>
              <span>Período</span>
              <span>Fuente</span>
              <span>Concepto</span>
              <span>Valor</span>
              <span>Estado</span>
              <span>Despr.</span>
              <span>Acción</span>
            </div>

            {filteredRecords.map((record) => {
              const avatarColor = getAvatarColor(record.personaNombre);

              return (
                <div
                  key={record.key}
                  className={`np-table-row${record.key === selectedRecordKey ? " is-selected" : ""}`}
                  style={{
                    gridTemplateColumns:
                      "120px minmax(220px,2fr) 120px 140px 170px 170px 130px 130px 90px 70px",
                  }}
                >
                  <span className="np-table-text np-table-text-strong">
                    {formatDate(record.fechaPrincipal)}
                  </span>

                  <div className="np-cell-employee">
                    <div className={`np-avatar ${avatarColor}`}>{getInitials(record.personaNombre)}</div>
                    <div>
                      <strong>{record.personaNombre}</strong>
                      <p>{record.motivo || "No disponible"}</p>
                    </div>
                  </div>

                  <span className="np-table-text np-table-text-secondary">
                    {record.documento || "No disponible"}
                  </span>
                  <span className="np-table-text">{record.periodoLabel}</span>
                  <span className="np-table-text">{record.sourceLabel}</span>
                  <span className="np-table-text">{record.summaryLabel}</span>
                  <span className="np-table-text np-table-text-strong">
                    {record.valor === null ? "No disponible" : formatCOP(record.valor)}
                  </span>
                  <span className={`np-badge ${record.estadoTone}`}>{record.estadoLabel}</span>
                  <span className="np-table-text">{record.soporteDisponible ? "Sí" : "No"}</span>

                  <div className="np-row-actions">
                    <button
                      type="button"
                      title="Ver detalle"
                      onClick={() => setSelectedRecordKey(record.key)}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="np-detail-panel">
        {!selectedRecord ? (
          <>
            <div className="np-detail-header">
              <div>
                <h3>Detalle</h3>
                <p>Selecciona un registro para consultar la información real disponible.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="np-detail-header">
              <div>
                <h3>{selectedRecord.personaNombre}</h3>
                <p>
                  {selectedRecord.sourceLabel} · {selectedRecord.summaryLabel}
                </p>
              </div>
              <div className="np-row-actions">
                <button
                  type="button"
                  title="Ver desprendible vigente"
                  disabled={!selectedRecord.soporteDisponible || submittingAction !== null}
                  onClick={() => void handleOpenSlip(selectedRecord)}
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            <div className="np-detail-grid">
              <div className="np-detail-field">
                <span>Documento</span>
                <strong>{selectedRecord.documento || "No disponible"}</strong>
              </div>
              <div className="np-detail-field">
                <span>Período</span>
                <strong>{selectedRecord.periodoLabel}</strong>
              </div>
              <div className="np-detail-field">
                <span>Fuente</span>
                <strong>{selectedRecord.sourceLabel}</strong>
              </div>
              <div className="np-detail-field">
                <span>Estado</span>
                <strong>{selectedRecord.estadoLabel}</strong>
              </div>
              <div className="np-detail-field">
                <span>Fecha principal</span>
                <strong>{formatDate(selectedRecord.fechaPrincipal)}</strong>
              </div>
              <div className="np-detail-field">
                <span>Valor</span>
                <strong>
                  {selectedRecord.valor === null ? "No disponible" : formatCOP(selectedRecord.valor)}
                </strong>
              </div>
              <div className="np-detail-field">
                <span>Motivo / observación</span>
                <strong>{selectedRecord.motivo || "No disponible"}</strong>
              </div>
              <div className="np-detail-field">
                <span>Desprendible vigente</span>
                <strong>{selectedRecord.soporteDisponible ? "Disponible" : "No disponible"}</strong>
              </div>
            </div>

            <div className="np-detail-divider" />

            {selectedRecord.movimiento ? (
              <div className="np-detail-grid">
                <div className="np-detail-field">
                  <span>Tipo movimiento</span>
                  <strong>{titleCase(selectedRecord.movimiento.tipo_movimiento)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Es devengado</span>
                  <strong>{formatBoolean(selectedRecord.movimiento.es_devengado)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Es deducción</span>
                  <strong>{formatBoolean(selectedRecord.movimiento.es_deduccion)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Afecta seguridad social</span>
                  <strong>{formatBoolean(selectedRecord.movimiento.afecta_seguridad_social)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Cantidad</span>
                  <strong>{formatOptionalNumber(selectedRecord.movimiento.cantidad)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Valor unitario</span>
                  <strong>
                    {selectedRecord.movimiento.valor_unitario === null
                      ? "No disponible"
                      : formatCOP(selectedRecord.movimiento.valor_unitario)}
                  </strong>
                </div>
                <div className="np-detail-field">
                  <span>Creado</span>
                  <strong>{formatDate(selectedRecord.movimiento.created_at)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Desprendible real</span>
                  <strong>
                    {selectedDesprendible
                      ? `Versión ${selectedDesprendible.version} · ${selectedDesprendible.estado}`
                      : "No disponible"}
                  </strong>
                </div>
              </div>
            ) : selectedRecord.novedad ? (
              <div className="np-detail-grid">
                <div className="np-detail-field">
                  <span>Tipo novedad</span>
                  <strong>{selectedRecord.novedad.tipo_novedad.nombre || "No disponible"}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Categoría</span>
                  <strong>{selectedRecord.novedad.tipo_novedad.categoria || "No disponible"}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Afecta salario</span>
                  <strong>{formatBoolean(selectedRecord.novedad.tipo_novedad.afecta_salario)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Afecta transporte</span>
                  <strong>{formatBoolean(selectedRecord.novedad.tipo_novedad.afecta_transporte)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Revisado</span>
                  <strong>{formatBoolean(selectedRecord.novedad.revisado)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Requiere cobertura</span>
                  <strong>{formatBoolean(selectedRecord.novedad.requiere_cobertura)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Cubierta</span>
                  <strong>{formatBoolean(selectedRecord.novedad.cubierta)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Fecha inicio</span>
                  <strong>{formatDate(selectedRecord.novedad.fecha_inicio)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Fecha fin</span>
                  <strong>{formatDate(selectedRecord.novedad.fecha_fin)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Días</span>
                  <strong>{formatOptionalNumber(selectedRecord.novedad.dias)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Horas</span>
                  <strong>{formatOptionalNumber(selectedRecord.novedad.horas)}</strong>
                </div>
                <div className="np-detail-field">
                  <span>Valor manual</span>
                  <strong>
                    {selectedRecord.novedad.valor_manual === null
                      ? "No disponible"
                      : formatCOP(selectedRecord.novedad.valor_manual)}
                  </strong>
                </div>
              </div>
            ) : null}

            <div className="np-detail-total">
              <span>Recurso de corrección dedicado</span>
              <strong>No disponible</strong>
            </div>
          </>
        )}
      </div>

      <div className="np-info-panel">
        <h4>Brechas reales del backend</h4>
        <ul className="np-info-list">
          {backendBrechas.map((item) => (
            <li key={item}>
              <ShieldAlert size={16} />
              <span>{item}</span>
            </li>
          ))}
          <li>
            <FileText size={16} />
            <span>
              Endpoints conectados en esta pantalla: `GET /nomina/periodos`, `GET /nomina/movimientos`,
              `GET /nomina/novedades`, `GET /nomina/desprendibles/:periodo_id`,
              `GET /nomina/desprendibles/:periodo_id/:vinculacion_id`,
              `POST /nomina/periodos/:id/recalcular` y `GET /nomina/export/:periodo_id?tipo=movimientos`.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
