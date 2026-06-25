import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  ALL_SOLICITUDES,
  estadoBadgeTone,
  estadoLabel,
  tipoBadgeTone,
  mockTHUser,
  type EstadoSolicitud,
  type Solicitud,
  type TipoSolicitud,
} from "../../mockData";

const TIPO_LABEL: Record<TipoSolicitud, string> = {
  documento: "Documento",
  "novedad-nomina": "Novedad Nómina",
  "actualizacion-datos": "Actualización",
  general: "General",
};

const STATUS_ACTIONS: { value: EstadoSolicitud; label: string }[] = [
  { value: "en-revision", label: "En revisión" },
  { value: "en-proceso", label: "En proceso" },
  { value: "enviado", label: "Enviado" },
  { value: "resuelto", label: "Resuelto" },
  { value: "rechazado", label: "Rechazar" },
  { value: "cerrado", label: "Cerrar" },
];

const municipioSolicitudes = ALL_SOLICITUDES.filter(
  (s) => s.municipio === mockTHUser.municipioAsignado,
);

export default function GestionarNovedades() {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [selected, setSelected] = useState<Solicitud | null>(null);
  const [estados, setEstados] = useState<Record<string, EstadoSolicitud>>(
    Object.fromEntries(municipioSolicitudes.map((s) => [s.id, s.estado])),
  );
  const [obsMap, setObsMap] = useState<Record<string, string[]>>(
    Object.fromEntries(
      municipioSolicitudes.map((s) => [s.id, s.observaciones ? [s.observaciones] : []]),
    ),
  );
  const [newObs, setNewObs] = useState("");

  const filtradas = municipioSolicitudes.filter((s) => {
    const q = busqueda.toLowerCase();
    const matchQ =
      q === "" ||
      s.colaborador.toLowerCase().includes(q) ||
      s.numero.toLowerCase().includes(q) ||
      s.asunto.toLowerCase().includes(q);
    const matchTipo = filtroTipo === "" || s.tipo === filtroTipo;
    const matchEstado = filtroEstado === "" || estados[s.id] === filtroEstado;
    return matchQ && matchTipo && matchEstado;
  });

  function handleEstado(id: string, estado: EstadoSolicitud) {
    setEstados((prev) => ({ ...prev, [id]: estado }));
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, estado } : null);
    }
  }

  function handleAddObs(id: string) {
    if (!newObs.trim()) return;
    setObsMap((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), newObs.trim()] }));
    setNewObs("");
  }

  return (
    <div className="pp-section">
      <div className="pp-section-header">
        <div>
          <h2 className="pp-section-title">Gestionar Novedades</h2>
          <p className="pp-section-subtitle">
            Bandeja de solicitudes — Municipio: {mockTHUser.municipioAsignado}
          </p>
        </div>
        <span className="pp-badge primary" style={{ fontSize: 12, padding: "0 12px", height: 26 }}>
          {filtradas.length} solicitudes
        </span>
      </div>

      {/* Filters */}
      <div className="pp-filters">
        <div className="pp-filter-input-wrap">
          <Search size={14} />
          <input
            className="pp-filter-input"
            placeholder="Buscar por nombre, número o asunto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <select
          className="pp-filter-select"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          <option value="documento">Documento</option>
          <option value="novedad-nomina">Novedad Nómina</option>
          <option value="actualizacion-datos">Actualización</option>
          <option value="general">General</option>
        </select>

        <select
          className="pp-filter-select"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en-revision">En revisión</option>
          <option value="en-proceso">En proceso</option>
          <option value="enviado">Enviado</option>
          <option value="resuelto">Resuelto</option>
          <option value="rechazado">Rechazado</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </div>

      {/* Table */}
      <div className="pp-bandeja-wrap">
        <div className="pp-table-card">
          <div
            className="pp-table-head"
            style={{ gridTemplateColumns: "90px 120px 1fr 120px 90px 110px" }}
          >
            <span>Número</span>
            <span>Tipo</span>
            <span>Colaborador / Asunto</span>
            <span>Documento</span>
            <span>Fecha</span>
            <span>Estado</span>
          </div>

          {filtradas.length === 0 ? (
            <div className="pp-empty">
              <p>No hay solicitudes que coincidan con los filtros.</p>
            </div>
          ) : (
            filtradas.map((s) => (
              <div
                key={s.id}
                className={`pp-table-row ${selected?.id === s.id ? "selected" : ""}`}
                style={{ gridTemplateColumns: "90px 120px 1fr 120px 90px 110px" }}
                onClick={() => setSelected((prev) => prev?.id === s.id ? null : s)}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                  }}
                >
                  {s.numero}
                </span>
                <span>
                  <span className={`pp-badge ${tipoBadgeTone[s.tipo]}`}>
                    {TIPO_LABEL[s.tipo]}
                  </span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.colaborador}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.asunto}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {s.documento}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {s.fecha}
                </span>
                <span>
                  <span className={`pp-badge ${estadoBadgeTone[estados[s.id]]}`}>
                    {estadoLabel[estados[s.id]]}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="pp-detail-panel">
            <div className="pp-detail-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h4>{selected.numero}</h4>
                <span className={`pp-badge ${estadoBadgeTone[estados[selected.id]]}`}>
                  {estadoLabel[estados[selected.id]]}
                </span>
              </div>
              <button
                className="pp-modal-close"
                onClick={() => setSelected(null)}
                title="Cerrar detalle"
              >
                <X size={14} />
              </button>
            </div>

            <div className="pp-detail-body">
              {/* Info grid */}
              <div className="pp-detail-grid">
                <div className="pp-detail-field">
                  <label>Colaborador</label>
                  <span>{selected.colaborador}</span>
                </div>
                <div className="pp-detail-field">
                  <label>Documento</label>
                  <span>{selected.documento}</span>
                </div>
                <div className="pp-detail-field">
                  <label>Tipo</label>
                  <span>
                    <span className={`pp-badge ${tipoBadgeTone[selected.tipo]}`}>
                      {TIPO_LABEL[selected.tipo]}
                    </span>
                    {selected.subTipo && (
                      <span style={{ fontSize: 11, marginLeft: 6, color: "var(--text-secondary)" }}>
                        — {selected.subTipo}
                      </span>
                    )}
                  </span>
                </div>
                <div className="pp-detail-field">
                  <label>Municipio</label>
                  <span>{selected.municipio}</span>
                </div>
                <div className="pp-detail-field">
                  <label>Fecha de radicación</label>
                  <span>{selected.fecha}</span>
                </div>
                <div className="pp-detail-field">
                  <label>Última actualización</label>
                  <span>{selected.ultimaActualizacion}</span>
                </div>
                {selected.prioridad && (
                  <div className="pp-detail-field">
                    <label>Prioridad</label>
                    <span>
                      <span
                        className={`pp-badge ${
                          selected.prioridad === "alta"
                            ? "danger"
                            : selected.prioridad === "media"
                            ? "warning"
                            : "neutral"
                        }`}
                      >
                        {selected.prioridad.charAt(0).toUpperCase() + selected.prioridad.slice(1)}
                      </span>
                    </span>
                  </div>
                )}
                {selected.responsable && (
                  <div className="pp-detail-field">
                    <label>Responsable</label>
                    <span>{selected.responsable}</span>
                  </div>
                )}
              </div>

              {/* Asunto + descripción */}
              <div className="pp-detail-field">
                <label>Asunto</label>
                <span style={{ fontWeight: 600 }}>{selected.asunto}</span>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    color: "var(--text-muted)",
                    marginBottom: 6,
                  }}
                >
                  Descripción
                </label>
                <div className="pp-detail-desc">{selected.descripcion}</div>
              </div>

              {/* Status actions */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Cambiar estado
                </label>
                <div className="pp-status-actions">
                  {STATUS_ACTIONS.map((a) => (
                    <button
                      key={a.value}
                      className={`pp-status-btn ${estados[selected.id] === a.value ? "active-status" : ""}`}
                      onClick={() => handleEstado(selected.id, a.value)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observations */}
              <div className="pp-obs-area">
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Observaciones
                </label>
                {(obsMap[selected.id] ?? []).length > 0 && (
                  <div className="pp-obs-list">
                    {(obsMap[selected.id] ?? []).map((obs, i) => (
                      <div key={i} className="pp-obs-item">{obs}</div>
                    ))}
                  </div>
                )}
                <div className="pp-obs-row">
                  <input
                    className="pp-obs-input"
                    placeholder="Agregar observación..."
                    value={newObs}
                    onChange={(e) => setNewObs(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddObs(selected.id)}
                  />
                  <button
                    className="pp-btn primary sm"
                    onClick={() => handleAddObs(selected.id)}
                    disabled={!newObs.trim()}
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
