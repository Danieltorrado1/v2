import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileCheck,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import ExpedienteDocumentosPanel from "../personal/ExpedienteDocumentosPanel";
import { getPersonalOPS } from "../../services/personasApi";
import type {
  VinculacionOPS,
} from "../../types/personas.types";
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

type FeedbackState = {
  message: string;
  tone: "success" | "error" | "neutral";
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

function formatDate(value: string | null) {
  if (!value) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatNumber(value: number) {
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

function getMetodoPagoLabel(value: string | null) {
  return value ? titleCase(value) : "No disponible";
}

function getEstadoTone(estado: string): Tone {
  switch (estado) {
    case "ACTIVA":
      return "success";
    case "SUSPENDIDA":
      return "warning";
    case "RETIRADA":
      return "neutral";
    default:
      return "info";
  }
}

function getChecklistTone(item: VinculacionOPS): Tone {
  if (!item.checklist) {
    return "neutral";
  }

  if (item.checklist.vencidos > 0) {
    return "danger";
  }

  if (item.checklist.faltantes > 0) {
    return "warning";
  }

  return "success";
}

function getChecklistLabel(item: VinculacionOPS) {
  if (!item.checklist) {
    return "No disponible";
  }

  if (item.checklist.vencidos > 0) {
    return "Vencidos";
  }

  if (item.checklist.faltantes > 0) {
    return "Pendientes";
  }

  return "Completo";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");
}

function getAvatarColor(item: VinculacionOPS) {
  const colors = ["orange", "blue", "cyan", "purple", "teal", "pink", "green", "red"];
  return colors[item.vinculacion_id % colors.length] ?? "blue";
}

function isExpiringSoon(item: VinculacionOPS) {
  if (item.estado_vinculacion !== "ACTIVA" || !item.fecha_fin) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const fechaFin = new Date(item.fecha_fin);
  fechaFin.setHours(0, 0, 0, 0);

  if (Number.isNaN(fechaFin.getTime()) || fechaFin < today) {
    return false;
  }

  const next30Days = new Date(today);
  next30Days.setDate(next30Days.getDate() + 30);

  return fechaFin <= next30Days;
}

function NpSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  disabled?: boolean;
}) {
  return (
    <div className={`np-select-wrap${disabled ? " is-disabled" : ""}`}>
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

export default function PersonalOpsPage() {
  const [opsState, setOpsState] = useState<AsyncState<VinculacionOPS[]>>({
    ...EMPTY_ASYNC_STATE,
  });
  const [selectedOpsId, setSelectedOpsId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const requestRef = useRef(0);

  const opsItems = opsState.data ?? [];
  const selectedOps = opsItems.find((item) => item.vinculacion_id === selectedOpsId) ?? null;

  const loadOps = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setOpsState((current) => ({
      loading: true,
      data: current.data,
      error: null,
    }));

    try {
      const data = await getPersonalOPS();

      if (requestId !== requestRef.current) {
        return;
      }

      setOpsState({
        loading: false,
        data,
        error: null,
      });

      setSelectedOpsId((current) => {
        if (current && data.some((item) => item.vinculacion_id === current)) {
          return current;
        }

        return data[0]?.vinculacion_id ?? null;
      });
    } catch (error) {
      if (requestId !== requestRef.current) {
        return;
      }

      setOpsState((current) => ({
        loading: false,
        data: current.data,
        error: toMessage(error),
      }));
    }
  }, []);

  useEffect(() => {
    void loadOps();
  }, [loadOps]);

  const contractOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Map(
          opsItems.map((item) => [
            String(item.contrato_id),
            {
              value: String(item.contrato_id),
              label: item.contrato_numero ?? `Contrato ${item.contrato_id}`,
            },
          ])
        ).values()
      ).sort((left, right) => left.label.localeCompare(right.label, "es-CO")),
    [opsItems],
  );

  const typeOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Map(
          opsItems.map((item) => [
            String(item.tipo_vinculacion_id),
            {
              value: String(item.tipo_vinculacion_id),
              label: item.tipo_vinculacion_nombre ?? item.tipo_vinculacion_codigo ?? `Tipo ${item.tipo_vinculacion_id}`,
            },
          ])
        ).values()
      ).sort((left, right) => left.label.localeCompare(right.label, "es-CO")),
    [opsItems],
  );

  const paymentOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(
        new Set(opsItems.map((item) => item.metodo_pago).filter((value): value is string => Boolean(value)))
      )
        .sort((left, right) => left.localeCompare(right, "es-CO"))
        .map((value) => ({
          value,
          label: getMetodoPagoLabel(value),
        })),
    [opsItems],
  );

  const statusOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(opsItems.map((item) => item.estado_vinculacion)))
        .sort((left, right) => left.localeCompare(right, "es-CO"))
        .map((value) => ({
          value,
          label: titleCase(value),
        })),
    [opsItems],
  );

  const displayedOps = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es-CO");

    return opsItems.filter((item) => {
      if (statusFilter && item.estado_vinculacion !== statusFilter) {
        return false;
      }

      if (contractFilter && String(item.contrato_id) !== contractFilter) {
        return false;
      }

      if (typeFilter && String(item.tipo_vinculacion_id) !== typeFilter) {
        return false;
      }

      if (paymentFilter && item.metodo_pago !== paymentFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.nombre_completo,
        item.numero_documento,
        item.contrato_numero ?? "",
        item.entidad_contratante ?? "",
        item.objeto_contractual ?? "",
        item.cargo_nombre ?? "",
        item.tipo_vinculacion_nombre ?? "",
        item.metodo_pago ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es-CO");

      return haystack.includes(normalizedSearch);
    });
  }, [contractFilter, opsItems, paymentFilter, searchTerm, statusFilter, typeFilter]);

  const checklistMetricsAvailable = useMemo(
    () => opsItems.some((item) => item.checklist !== null),
    [opsItems],
  );

  const kpis = useMemo<Kpi[]>(() => {
    const total = opsItems.length;
    const activos = opsItems.filter((item) => item.estado_vinculacion === "ACTIVA").length;
    const expiringSoon = opsItems.filter(isExpiringSoon).length;
    const withPendingDocs = checklistMetricsAvailable
      ? opsItems.filter((item) => (item.checklist?.faltantes ?? 0) > 0 || (item.checklist?.vencidos ?? 0) > 0).length
      : null;
    const cuentaCobroClassified = opsItems.filter((item) => item.metodo_pago === "OPS_CUENTA_COBRO").length;

    return [
      {
        tone: "primary",
        icon: Users,
        label: "Total OPS",
        value: formatNumber(total),
        caption: "Vinculaciones clasificadas por metodo de pago OPS",
      },
      {
        tone: "success",
        icon: CheckCircle2,
        label: "Activos",
        value: formatNumber(activos),
        caption: "Estado vinculacion ACTIVA",
      },
      {
        tone: "warning",
        icon: AlertTriangle,
        label: "Proximos a vencer",
        value: formatNumber(expiringSoon),
        caption: "Fecha fin dentro de 30 dias",
      },
      {
        tone: "info",
        icon: FileCheck,
        label: "Docs pendientes",
        value: withPendingDocs === null ? "No disponible" : formatNumber(withPendingDocs),
        caption: checklistMetricsAvailable ? "Checklist con faltantes o vencidos" : "Checklist no consolidado en lista",
      },
      {
        tone: "purple",
        icon: ClipboardList,
        label: "OPS cuenta cobro",
        value: formatNumber(cuentaCobroClassified),
        caption: "Clasificacion por metodo_pago",
      },
      {
        tone: "neutral",
        icon: Banknote,
        label: "Cuenta de cobro real",
        value: "No disponible",
        caption: "No existe endpoint dedicado",
      },
    ];
  }, [checklistMetricsAvailable, opsItems]);

  const byPaymentSummary = useMemo(
    () =>
      Array.from(
        displayedOps.reduce((map, item) => {
          const key = item.metodo_pago ?? "SIN_METODO";
          const current = map.get(key) ?? 0;
          map.set(key, current + 1);
          return map;
        }, new Map<string, number>())
      )
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es-CO"))
        .map(([metodo, total]) => ({
          label: metodo === "SIN_METODO" ? "Sin metodo" : getMetodoPagoLabel(metodo),
          total,
        })),
    [displayedOps],
  );

  const byStatusSummary = useMemo(
    () =>
      Array.from(
        displayedOps.reduce((map, item) => {
          const current = map.get(item.estado_vinculacion) ?? 0;
          map.set(item.estado_vinculacion, current + 1);
          return map;
        }, new Map<string, number>())
      )
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es-CO"))
        .map(([estado, total]) => ({
          label: titleCase(estado),
          total,
        })),
    [displayedOps],
  );

  const topContracts = useMemo(
    () =>
      Array.from(
        displayedOps.reduce((map, item) => {
          const key = item.contrato_numero ?? `Contrato ${item.contrato_id}`;
          const current = map.get(key) ?? 0;
          map.set(key, current + 1);
          return map;
        }, new Map<string, number>())
      )
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es-CO"))
        .slice(0, 5)
        .map(([label, total]) => ({
          label,
          total,
        })),
    [displayedOps],
  );

  const handleRetry = () => {
    void loadOps();
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("");
    setContractFilter("");
    setTypeFilter("");
    setPaymentFilter("");
  };

  const handleSelectOps = (opsId: number) => {
    setSelectedOpsId((current) => (current === opsId ? null : opsId));
  };

  const isTableEmpty = !opsState.loading && !opsState.error && displayedOps.length === 0;

  return (
    <div className="np-page">
      <header className="np-header">
        <div className="np-header-text">
          <h1>Personal OPS</h1>
          <p>Consulta vinculaciones OPS reales usando `vinculaciones` y `expediente` del backend.</p>
        </div>
        <div className="np-header-actions">
          <button
            type="button"
            className="np-btn primary"
            disabled
            title="Existe endpoint para crear vinculacion, pero esta pantalla no tiene catalogos seguros de empresa, contrato, cargo y tipo de vinculacion."
          >
            <Plus size={16} /> Nuevo OPS
          </button>
          <button
            type="button"
            className="np-btn"
            disabled
            title="No existe endpoint real para generar cuentas de cobro desde este modulo."
          >
            <ClipboardList size={16} /> Generar cuenta
          </button>
          <button
            type="button"
            className="np-btn"
            disabled
            title="No existe endpoint real para exportar personal OPS desde esta pantalla."
          >
            <Download size={16} /> Exportar
          </button>
        </div>
      </header>

      <div className="np-inline-state neutral">
        Auditoria backend: no existe recurso dedicado de Personal OPS ni de cuentas de cobro OPS. La fuente real se
        compone desde `GET /vinculaciones`, filtrando localmente por `metodo_pago` OPS, y enriqueciendo cada registro
        con `GET /vinculaciones/:id/expediente`.
      </div>

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
              placeholder="Buscar por nombre, documento, contrato o cargo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={opsState.loading}
            />
          </div>
          <NpSelect
            label="Estado"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            disabled={opsState.loading || statusOptions.length === 0}
          />
          <NpSelect
            label="Contrato"
            value={contractFilter}
            onChange={setContractFilter}
            options={contractOptions}
            disabled={opsState.loading || contractOptions.length === 0}
          />
          <NpSelect
            label="Tipo vinculacion"
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
            disabled={opsState.loading || typeOptions.length === 0}
          />
          <NpSelect
            label="Metodo de pago"
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={paymentOptions}
            disabled={opsState.loading || paymentOptions.length === 0}
          />
        </div>
        <div className="np-toolbar-right">
          <button
            type="button"
            className="np-clear-btn"
            onClick={clearFilters}
            disabled={!searchTerm && !statusFilter && !contractFilter && !typeFilter && !paymentFilter}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="np-table-card">
        {opsState.loading && !opsState.data ? (
          <div className="np-empty">Cargando personal OPS...</div>
        ) : opsState.error && !opsItems.length ? (
          <StateCard
            title="No fue posible cargar el personal OPS"
            message={opsState.error}
            tone="error"
            actionLabel="Reintentar"
            onAction={handleRetry}
          />
        ) : isTableEmpty ? (
          <StateCard
            title="Sin personal OPS"
            message={
              opsItems.length === 0
                ? "No hay vinculaciones clasificadas como OPS con los datos reales disponibles."
                : "No hay registros OPS que coincidan con los filtros actuales."
            }
          />
        ) : (
          <div className="np-table-scroll">
            <div
              className="np-table-head"
              style={{
                gridTemplateColumns:
                  "minmax(220px,1.9fr) 140px 150px 160px 150px 110px 110px 140px 150px",
              }}
            >
              <span>Contratista</span>
              <span>Contrato</span>
              <span>Cargo</span>
              <span>Tipo vinculacion</span>
              <span>Metodo de pago</span>
              <span>F. inicio</span>
              <span>F. fin</span>
              <span>Estado / docs</span>
              <span>Acciones</span>
            </div>

            {displayedOps.map((item) => (
              <div
                key={item.vinculacion_id}
                className={`np-table-row${selectedOpsId === item.vinculacion_id ? " is-selected" : ""}`}
                style={{
                  gridTemplateColumns:
                    "minmax(220px,1.9fr) 140px 150px 160px 150px 110px 110px 140px 150px",
                }}
              >
                <div className="np-cell-employee">
                  <div className={`np-avatar ${getAvatarColor(item)}`}>{getInitials(item.nombre_completo)}</div>
                  <div>
                    <strong>{item.nombre_completo}</strong>
                    <p>{item.numero_documento}</p>
                  </div>
                </div>
                <span className="np-table-text">{item.contrato_numero ?? "No disponible"}</span>
                <span className="np-table-text">{item.cargo_nombre ?? "No disponible"}</span>
                <span className="np-table-text">
                  {item.tipo_vinculacion_nombre ?? item.tipo_vinculacion_codigo ?? "No disponible"}
                </span>
                <span className="np-table-text">{getMetodoPagoLabel(item.metodo_pago)}</span>
                <span className="np-table-text">{formatDate(item.fecha_inicio)}</span>
                <span className="np-table-text">{formatDate(item.fecha_fin)}</span>
                <div className="np-row-status">
                  <span className={`np-badge ${getEstadoTone(item.estado_vinculacion)}`}>
                    {titleCase(item.estado_vinculacion)}
                  </span>
                  <span className={`np-badge ${getChecklistTone(item)}`}>
                    {getChecklistLabel(item)}
                  </span>
                </div>
                <div className="np-row-status">
                  <button
                    type="button"
                    className="np-icon-button"
                    title="Ver detalle"
                    aria-label={`Ver detalle de ${item.nombre_completo}`}
                    onClick={() => handleSelectOps(item.vinculacion_id)}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className="np-icon-button"
                    disabled
                    title="Existe endpoint para actualizar vinculacion, pero faltan catalogos seguros para una edicion completa desde esta pantalla."
                    aria-label={`Editar ${item.nombre_completo}`}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    className="np-icon-button"
                    onClick={() =>
                      setFeedback({
                        tone: "neutral",
                        message:
                          "El detalle OPS reutiliza los endpoints reales de documentos y checklist. Abre la ficha para revisarlos.",
                      })
                    }
                    title="Ver documentos"
                    aria-label={`Ver documentos de ${item.nombre_completo}`}
                  >
                    <FileCheck size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedOps ? (
        <div className="np-detail-panel">
          <div className="np-detail-header">
            <div>
              <h3>Detalle OPS</h3>
              <p>
                {selectedOps.nombre_completo} · Vinculacion #{selectedOps.vinculacion_id}
              </p>
            </div>
            <button
              type="button"
              className="np-icon-button"
              onClick={() => setSelectedOpsId(null)}
              title="Cerrar detalle"
              aria-label="Cerrar detalle"
            >
              <X size={14} />
            </button>
          </div>

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Documento</span>
              <strong>{selectedOps.numero_documento}</strong>
            </div>
            <div className="np-detail-field">
              <span>Contrato</span>
              <strong>{selectedOps.contrato_numero ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Entidad contratante</span>
              <strong>{selectedOps.entidad_contratante ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Objeto contractual</span>
              <strong>{selectedOps.objeto_contractual ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Cargo</span>
              <strong>{selectedOps.cargo_nombre ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Tipo vinculacion</span>
              <strong>
                {selectedOps.tipo_vinculacion_nombre ?? selectedOps.tipo_vinculacion_codigo ?? "No disponible"}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Metodo de pago</span>
              <strong>{getMetodoPagoLabel(selectedOps.metodo_pago)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Fecha inicio</span>
              <strong>{formatDate(selectedOps.fecha_inicio)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Fecha fin</span>
              <strong>{formatDate(selectedOps.fecha_fin)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Estado</span>
              <strong>{titleCase(selectedOps.estado_vinculacion)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Municipio</span>
              <strong>
                {selectedOps.municipio_residencia_id === null
                  ? "No disponible"
                  : `ID ${selectedOps.municipio_residencia_id}`}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Cuenta de cobro</span>
              <strong>No disponible</strong>
            </div>
          </div>

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field">
              <span>Documentos persona</span>
              <strong>{formatNumber(selectedOps.documentos_persona_total)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Documentos vinculacion</span>
              <strong>{formatNumber(selectedOps.documentos_vinculacion_total)}</strong>
            </div>
            <div className="np-detail-field">
              <span>Cumplimiento documental</span>
              <strong>
                {selectedOps.checklist
                  ? `${Math.round(selectedOps.checklist.cumplimiento_porcentaje)}%`
                  : "No disponible"}
              </strong>
            </div>
            <div className="np-detail-field">
              <span>Faltantes checklist</span>
              <strong>{selectedOps.checklist?.faltantes ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Vencidos checklist</span>
              <strong>{selectedOps.checklist?.vencidos ?? "No disponible"}</strong>
            </div>
            <div className="np-detail-field">
              <span>Proximo vencimiento</span>
              <strong>{isExpiringSoon(selectedOps) ? "Si" : "No disponible"}</strong>
            </div>
          </div>

          <div className="np-inline-state neutral">
            Brecha real del backend: no existe recurso de cuenta de cobro OPS ni endpoint para aprobar pago o generar
            cuenta. `OPS_CUENTA_COBRO` hoy solo clasifica el metodo de pago de la vinculacion.
          </div>

          <ExpedienteDocumentosPanel
            personaId={selectedOps.persona_id}
            vinculacionId={selectedOps.vinculacion_id}
          />
        </div>
      ) : null}

      <div className="np-summary-row">
        <div className="np-summary-card">
          <h4>OPS por metodo de pago</h4>
          {byPaymentSummary.length === 0 ? (
            <div className="np-summary-item">
              <span>Sin datos</span>
              <strong>—</strong>
            </div>
          ) : (
            byPaymentSummary.map((item) => (
              <div key={item.label} className="np-summary-item">
                <span>{item.label}</span>
                <strong>{formatNumber(item.total)}</strong>
              </div>
            ))
          )}
        </div>

        <div className="np-summary-card">
          <h4>OPS por estado</h4>
          {byStatusSummary.length === 0 ? (
            <div className="np-summary-item">
              <span>Sin datos</span>
              <strong>—</strong>
            </div>
          ) : (
            byStatusSummary.map((item) => (
              <div key={item.label} className="np-summary-item">
                <span>{item.label}</span>
                <strong>{formatNumber(item.total)}</strong>
              </div>
            ))
          )}
        </div>

        <div className="np-summary-card">
          <h4>Top contratos OPS</h4>
          {topContracts.length === 0 ? (
            <div className="np-summary-item">
              <span>Sin datos</span>
              <strong>—</strong>
            </div>
          ) : (
            topContracts.map((item) => (
              <div key={item.label} className="np-summary-item">
                <span>{item.label}</span>
                <strong>{formatNumber(item.total)}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="np-info-panel">
        <h4>Brechas reales detectadas</h4>
        <ul className="np-info-list">
          <li>
            <AlertTriangle size={14} />
            No existe endpoint de listado OPS enriquecido; la vista compone datos desde vinculaciones y expediente.
          </li>
          <li>
            <AlertTriangle size={14} />
            No existe filtro backend por `metodo_pago` en `/vinculaciones`; la clasificacion OPS se hace localmente.
          </li>
          <li>
            <AlertTriangle size={14} />
            No existe recurso real de cuenta de cobro OPS ni documento dedicado de cuenta de cobro.
          </li>
          <li>
            <AlertTriangle size={14} />
            No existen catalogos expuestos en esta fase para crear o editar OPS de forma segura desde la pantalla.
          </li>
        </ul>
      </div>
    </div>
  );
}
