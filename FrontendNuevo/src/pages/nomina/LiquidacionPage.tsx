import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  Eye,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  exportNominaLiquidacionesCsv,
  generateNominaLiquidaciones,
  getAllNominaLiquidaciones,
  getNominaPeriodos,
} from "../../services/nominaApi";
import { useCompanyContext } from "../../context/CompanyContext";
import { useSearchParams } from "react-router-dom";
import { pickAvailableScopedId } from "../../context/companyScope";
import { pickDefaultNominaPeriod } from "./nominaPeriods";
import CoberturaFlowNav from "./CoberturaFlowNav";
import type {
  GenerateNominaLiquidacionesResponse,
  NominaLiquidacion,
  NominaLiquidacionEstadoFilter,
  NominaPeriodoApi,
  PaginatedNominaLiquidacionesApi,
  PaginatedNominaPeriodosApi,
} from "../../types/nomina.types";
import "./NominaPages.css";

type AsyncState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

type FilterOption = {
  label: string;
  value: string;
};

type FeedbackState = {
  message: string;
  tone: "success" | "error";
} | null;

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
const BACKEND_STATUS_FILTERS = new Set<NominaLiquidacionEstadoFilter>(["PRELIMINAR", "FINAL"]);
const AVATAR_TONES = ["green", "blue", "purple", "orange", "red", "cyan", "teal", "pink"];

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

function getStatusTone(status: string): Tone {
  const normalizedStatus = status.trim().toUpperCase();

  if (normalizedStatus === "FINAL") {
    return "success";
  }

  if (normalizedStatus === "PRELIMINAR") {
    return "warning";
  }

  if (normalizedStatus === "GENERADA") {
    return "primary";
  }

  return "neutral";
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "NA";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getAvatarTone(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function buildContractLabel(liquidacion: NominaLiquidacion) {
  return (
    liquidacion.contrato.numero_contrato ??
    liquidacion.contrato.entidad_contratante ??
    `Contrato ${liquidacion.contrato.id}`
  );
}

function buildPeriodOptionLabel(periodo: NominaPeriodoApi) {
  return `${periodo.nombre_periodo} · ${formatDate(periodo.fecha_inicio)} - ${formatDate(periodo.fecha_fin)}`;
}

function buildGenerateSuccessMessage(result: GenerateNominaLiquidacionesResponse) {
  const generated = formatNumber(result.liquidaciones_generadas);
  const processed = formatNumber(result.empleados_procesados);
  const omittedActive = formatNumber(result.omitidas_activas ?? 0);
  const omittedOutOfPeriod = formatNumber(result.omitidas_fuera_periodo ?? 0);

  return `Liquidaciones generadas o actualizadas: ${generated}. Empleados procesados: ${processed}. Omitidas activas: ${omittedActive}. Omitidas fuera del periodo: ${omittedOutOfPeriod}.`;
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

export default function LiquidacionPage() {
  const [searchParams] = useSearchParams();
  const { empresaId } = useCompanyContext();
  const [periodsState, setPeriodsState] = useState<AsyncState<PaginatedNominaPeriodosApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [liquidationsState, setLiquidationsState] = useState<AsyncState<PaginatedNominaLiquidacionesApi>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [selectedLiquidationId, setSelectedLiquidationId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [knownStatuses, setKnownStatuses] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const periodsRequestRef = useRef(0);
  const liquidationsRequestRef = useRef(0);

  const periodos = periodsState.data?.items ?? [];
  const liquidaciones = liquidationsState.data?.items ?? [];
  const selectedPeriod = periodos.find((periodo) => periodo.id === selectedPeriodId) ?? null;
  const selectedLiquidation =
    liquidaciones.find((liquidacion) => liquidacion.id === selectedLiquidationId) ?? null;

  const backendStatusFilter =
    statusFilter && BACKEND_STATUS_FILTERS.has(statusFilter as NominaLiquidacionEstadoFilter)
      ? (statusFilter as NominaLiquidacionEstadoFilter)
      : undefined;

  const periodOptions = useMemo<FilterOption[]>(
    () =>
      periodos.map((periodo) => ({
        value: periodo.id,
        label: buildPeriodOptionLabel(periodo),
      })),
    [periodos],
  );

  const statusOptions = useMemo<FilterOption[]>(
    () =>
      knownStatuses.map((status) => ({
        value: status,
        label: status,
      })),
    [knownStatuses],
  );

  const contractOptions = useMemo<FilterOption[]>(() => {
    const map = new Map<string, string>();

    for (const liquidacion of liquidaciones) {
      map.set(liquidacion.contrato_id, buildContractLabel(liquidacion));
    }

    return Array.from(map.entries())
      .sort((left, right) => left[1].localeCompare(right[1], "es-CO"))
      .map(([value, label]) => ({ value, label }));
  }, [liquidaciones]);

  const displayedLiquidaciones = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es-CO");
    const shouldFilterStatusLocally = statusFilter !== "" && !backendStatusFilter;

    return liquidaciones.filter((liquidacion) => {
      if (contractFilter && liquidacion.contrato_id !== contractFilter) {
        return false;
      }

      if (shouldFilterStatusLocally && liquidacion.estado !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        liquidacion.persona.nombre_completo,
        liquidacion.persona.numero_documento ?? "",
        liquidacion.contrato.numero_contrato ?? "",
        liquidacion.contrato.entidad_contratante ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es-CO");

      return haystack.includes(normalizedSearch);
    });
  }, [backendStatusFilter, contractFilter, liquidaciones, searchTerm, statusFilter]);

  const kpis = useMemo<Kpi[]>(() => {
    const totalLiquidaciones = displayedLiquidaciones.length;
    const finalizadas = displayedLiquidaciones.filter((liquidacion) => liquidacion.estado === "FINAL").length;
    const preliminares = displayedLiquidaciones.filter(
      (liquidacion) => liquidacion.estado === "PRELIMINAR",
    ).length;
    const generadas = displayedLiquidaciones.filter((liquidacion) => liquidacion.estado === "GENERADA").length;
    const totalLiquidado = displayedLiquidaciones.reduce(
      (acumulado, liquidacion) => acumulado + liquidacion.total_liquidacion,
      0,
    );

    return [
      {
        tone: "primary",
        icon: ClipboardList,
        label: "Liquidaciones del período",
        value: formatNumber(totalLiquidaciones),
        caption: selectedPeriod?.nombre_periodo ?? "Sin período seleccionado",
      },
      {
        tone: "warning",
        icon: Clock,
        label: "Preliminares",
        value: formatNumber(preliminares),
        caption: "Estado PRELIMINAR",
      },
      {
        tone: "success",
        icon: CheckCircle2,
        label: "Finalizadas",
        value: formatNumber(finalizadas),
        caption: "Estado FINAL",
      },
      {
        tone: "info",
        icon: Banknote,
        label: "Valor total",
        value: totalLiquidaciones > 0 ? formatCOP(totalLiquidado) : "No disponible",
        caption: "Suma de netos cargados",
      },
      {
        tone: "neutral",
        icon: Users,
        label: "Generadas",
        value: formatNumber(generadas),
        caption: "Estado GENERADA",
      },
    ];
  }, [displayedLiquidaciones, selectedPeriod]);

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

  const loadLiquidaciones = useCallback(
    async (periodoId: string, estado?: NominaLiquidacionEstadoFilter) => {
      const requestId = liquidationsRequestRef.current + 1;
      liquidationsRequestRef.current = requestId;

      setLiquidationsState({
        loading: true,
        data: null,
        error: null,
      });
      setSelectedLiquidationId(null);

      try {
        const data = await getAllNominaLiquidaciones(periodoId, estado ? { estado } : {});

        if (requestId !== liquidationsRequestRef.current) {
          return;
        }

        setLiquidationsState({
          loading: false,
          data,
          error: null,
        });
        setKnownStatuses((current) =>
          Array.from(new Set([...current, ...data.items.map((liquidacion) => liquidacion.estado)])).sort(
            (left, right) => left.localeCompare(right, "es-CO"),
          ),
        );
      } catch (error) {
        if (requestId !== liquidationsRequestRef.current) {
          return;
        }

        setLiquidationsState({
          loading: false,
          data: null,
          error: toMessage(error),
        });
      }
    },
    [],
  );

  useEffect(() => {
    void loadPeriods(searchParams.get("period_id") ?? undefined);
  }, [loadPeriods, searchParams]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setLiquidationsState({ ...EMPTY_ASYNC_STATE });
      setSelectedLiquidationId(null);
      return;
    }

    void loadLiquidaciones(selectedPeriodId, backendStatusFilter);
  }, [backendStatusFilter, loadLiquidaciones, selectedPeriodId]);

  useEffect(() => {
    setContractFilter((current) =>
      current && liquidaciones.some((liquidacion) => liquidacion.contrato_id === current) ? current : "",
    );
  }, [liquidaciones]);

  const handleSelectPeriod = (periodId: string) => {
    setSelectedPeriodId(periodId || null);
    setSelectedLiquidationId(null);
    setSearchTerm("");
    setStatusFilter("");
    setContractFilter("");
    setFeedback(null);
    setKnownStatuses([]);
    setLiquidationsState({ ...EMPTY_ASYNC_STATE });
  };

  const handleRetry = () => {
    if (!selectedPeriodId) {
      void loadPeriods();
      return;
    }

    void Promise.all([
      loadPeriods(selectedPeriodId),
      loadLiquidaciones(selectedPeriodId, backendStatusFilter),
    ]);
  };

  const handleGenerateLiquidaciones = async () => {
    if (!selectedPeriodId || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setFeedback(null);
    setStatusFilter("");
    setContractFilter("");

    try {
      const result = await generateNominaLiquidaciones(selectedPeriodId);
      await Promise.all([
        loadPeriods(selectedPeriodId),
        loadLiquidaciones(selectedPeriodId),
      ]);
      setFeedback({
        tone: "success",
        message: buildGenerateSuccessMessage(result),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: toMessage(error),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportLiquidaciones = async () => {
    if (!selectedPeriodId || isExporting || displayedLiquidaciones.length === 0) {
      return;
    }

    setIsExporting(true);
    setFeedback(null);

    try {
      const metadata = await exportNominaLiquidacionesCsv(selectedPeriodId);
      setFeedback({
        tone: "success",
        message: `Se exportaron las liquidaciones reales del período: ${metadata.file_name}.`,
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
    setStatusFilter("");
    setContractFilter("");
  };

  const hasPeriods = periodos.length > 0;
  const isTableEmpty =
    !liquidationsState.loading &&
    !liquidationsState.error &&
    selectedPeriodId !== null &&
    displayedLiquidaciones.length === 0;

  return (
    <div className="np-page">
      <CoberturaFlowNav periodId={selectedPeriodId} />
      <header className="np-header">
        <div className="np-header-text">
          <h1>Liquidación laboral</h1>
          <p>Calcula, revisa y genera liquidaciones de retiro del personal.</p>
        </div>
        <div className="np-header-actions">
          <button
            type="button"
            className="np-btn primary"
            onClick={handleGenerateLiquidaciones}
            disabled={!selectedPeriodId || isGenerating || periodsState.loading}
          >
            <ClipboardList size={16} />
            {isGenerating ? "Generando..." : "Generar liquidaciones"}
          </button>
          <button
            type="button"
            className="np-btn"
            onClick={handleExportLiquidaciones}
            disabled={!selectedPeriodId || isExporting || displayedLiquidaciones.length === 0}
            title={
              !selectedPeriodId
                ? "Selecciona un período para exportar."
                : displayedLiquidaciones.length === 0
                  ? "No hay liquidaciones para exportar en el período seleccionado."
                  : "Descarga el CSV real entregado por el backend."
            }
          >
            <Download size={16} /> {isExporting ? "Exportando..." : "Exportar"}
          </button>
        </div>
      </header>

      {feedback ? (
        <div className={`np-inline-state ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.message}
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
              placeholder="Buscar colaborador o contrato"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!selectedPeriodId || liquidationsState.loading}
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
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            disabled={!selectedPeriodId || statusOptions.length === 0}
          />
          <NpSelect
            label="Contrato"
            value={contractFilter}
            onChange={setContractFilter}
            options={contractOptions}
            disabled={!selectedPeriodId || contractOptions.length === 0}
          />
        </div>
        <div className="np-toolbar-right">
          <button
            type="button"
            className="np-clear-btn"
            onClick={clearFilters}
            disabled={!searchTerm && !statusFilter && !contractFilter}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="np-table-card">
        {!hasPeriods && !periodsState.loading ? (
          <StateCard
            title="Sin períodos disponibles"
            message="No hay períodos de nómina disponibles para cargar liquidaciones."
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
            title="Selecciona un período"
            message="La liquidación real depende del período de nómina activo o seleccionado."
          />
        ) : liquidationsState.loading ? (
          <div className="np-empty">Cargando liquidaciones...</div>
        ) : liquidationsState.error ? (
          <StateCard
            title="No fue posible cargar las liquidaciones"
            message={liquidationsState.error}
            tone="error"
            actionLabel="Reintentar"
            onAction={handleRetry}
          />
        ) : isTableEmpty ? (
          <StateCard
            title="Sin liquidaciones"
            message={
              liquidaciones.length === 0
                ? "No existen liquidaciones registradas para el período seleccionado."
                : "No hay liquidaciones que coincidan con los filtros actuales."
            }
          />
        ) : (
          <div className="np-table-scroll">
            <div
              className="np-table-head"
              style={{
                gridTemplateColumns:
                  "minmax(220px,2fr) minmax(150px,1.2fr) 120px 120px 90px 120px 120px 120px 120px 96px",
              }}
            >
              <span>Empleado</span>
              <span>Contrato</span>
              <span>F. ingreso</span>
              <span>F. retiro</span>
              <span>Días</span>
              <span>Cesantías</span>
              <span>Prima</span>
              <span>Deduc.</span>
              <span>Neto</span>
              <span>Estado</span>
            </div>

            {displayedLiquidaciones.map((liquidacion) => {
              const isSelected = selectedLiquidationId === liquidacion.id;

              return (
                <div
                  key={liquidacion.id}
                  className={`np-table-row${isSelected ? " is-selected" : ""}`}
                  style={{
                    gridTemplateColumns:
                      "minmax(220px,2fr) minmax(150px,1.2fr) 120px 120px 90px 120px 120px 120px 120px 96px",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    setSelectedLiquidationId((current) => (current === liquidacion.id ? null : liquidacion.id))
                  }
                >
                  <div className="np-cell-employee">
                    <div className={`np-avatar ${getAvatarTone(liquidacion.id)}`}>
                      {getInitials(liquidacion.persona.nombre_completo)}
                    </div>
                    <div>
                      <strong>{liquidacion.persona.nombre_completo}</strong>
                      <p>{liquidacion.persona.numero_documento ?? "Documento no disponible"}</p>
                    </div>
                  </div>
                  <span className="np-table-text np-table-text-secondary">{buildContractLabel(liquidacion)}</span>
                  <span className="np-table-text">{formatDate(liquidacion.fecha_inicio_vinculacion)}</span>
                  <span className="np-table-text">{formatDate(liquidacion.fecha_retiro)}</span>
                  <span className="np-table-text np-table-text-strong">
                    {formatNumber(liquidacion.dias_trabajados)}
                  </span>
                  <span className="np-table-text np-table-text-strong">{formatCOP(liquidacion.cesantias)}</span>
                  <span className="np-table-text np-table-text-strong">
                    {formatCOP(liquidacion.prima_servicios)}
                  </span>
                  <span className="np-table-text np-table-text-danger">
                    {formatCOP(liquidacion.deducciones)}
                  </span>
                  <span className="np-table-text np-table-text-net">{formatCOP(liquidacion.neto_pagar)}</span>
                  <div className="np-row-status">
                    <span className={`np-badge ${getStatusTone(liquidacion.estado)}`}>{liquidacion.estado}</span>
                    <button
                      type="button"
                      className="np-icon-button"
                      title="Ver detalle"
                      aria-label={`Ver detalle de ${liquidacion.persona.nombre_completo}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedLiquidationId((current) =>
                          current === liquidacion.id ? null : liquidacion.id,
                        );
                      }}
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

      {selectedLiquidation ? (
        <div className="np-detail-panel">
          <div className="np-detail-header">
            <div>
              <h3>Detalle de liquidación</h3>
              <p>
                {selectedLiquidation.persona.nombre_completo} · {selectedLiquidation.periodo.nombre_periodo}
              </p>
            </div>
            <button
              type="button"
              className="np-icon-button"
              onClick={() => setSelectedLiquidationId(null)}
              title="Cerrar detalle"
              aria-label="Cerrar detalle"
            >
              <X size={14} />
            </button>
          </div>

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Documento</span>
              <strong>{selectedLiquidation.persona.numero_documento ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Período</span>
              <strong>{selectedLiquidation.periodo.nombre_periodo}</strong>
            </div>
            <div className="np-detail-field">
              <span>Fecha ingreso</span>
              <strong>{formatDate(selectedLiquidation.fecha_inicio_vinculacion)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Fecha retiro</span>
              <strong>{formatDate(selectedLiquidation.fecha_retiro)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Días liquidados</span>
              <strong>{formatNumber(selectedLiquidation.dias_trabajados)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Estado</span>
              <strong>
                <span className={`np-badge ${getStatusTone(selectedLiquidation.estado)}`}>
                  {selectedLiquidation.estado}
                </span>
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Contrato</span>
              <strong>{buildContractLabel(selectedLiquidation)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Motivo retiro</span>
              <strong>{selectedLiquidation.motivo_retiro ?? "No disponible"}</strong>
            </div>
          </div>

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Cesantías</span>
              <strong>{formatCOP(selectedLiquidation.cesantias)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Intereses cesantías</span>
              <strong>{formatCOP(selectedLiquidation.intereses_cesantias)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Prima</span>
              <strong>{formatCOP(selectedLiquidation.prima_servicios)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Vacaciones</span>
              <strong>{formatCOP(selectedLiquidation.vacaciones)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Otros devengos</span>
              <strong>{formatCOP(selectedLiquidation.otros_devengos)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Deducciones</span>
              <strong className="np-text-danger">{formatCOP(selectedLiquidation.deducciones)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Observación</span>
              <strong>{selectedLiquidation.observacion ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Creada</span>
              <strong>{formatDate(selectedLiquidation.created_at)}</strong>
            </div>
          </div>

          <div className="np-detail-total">
            <span>Total neto a liquidar</span>
            <strong>{formatCOP(selectedLiquidation.neto_pagar)}</strong>
          </div>

          <div className="np-inline-state neutral">
            Las acciones individuales de PDF, documento, edición, aprobación y anulación no están conectadas
            en esta fase porque no existe un endpoint frontend habilitado para esta pantalla.
          </div>
        </div>
      ) : null}
    </div>
  );
}
