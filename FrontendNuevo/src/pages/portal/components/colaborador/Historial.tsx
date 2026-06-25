import { useState } from "react";
import { Search } from "lucide-react";
import {
  colabSolicitudes,
  estadoBadgeTone,
  estadoLabel,
  tipoBadgeTone,
  type EstadoSolicitud,
  type TipoSolicitud,
} from "../../mockData";

const TIPO_LABEL: Record<TipoSolicitud, string> = {
  documento: "Documento",
  "novedad-nomina": "Novedad Nómina",
  "actualizacion-datos": "Actualización",
  general: "General",
};

export default function Historial() {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  const filtradas = colabSolicitudes.filter((s) => {
    const matchBusqueda = busqueda === "" ||
      s.asunto.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.numero.toLowerCase().includes(busqueda.toLowerCase());
    const matchEstado = filtroEstado === "" || s.estado === filtroEstado;
    const matchTipo = filtroTipo === "" || s.tipo === filtroTipo;
    return matchBusqueda && matchEstado && matchTipo;
  });

  return (
    <div className="pp-section">
      <div className="pp-section-header">
        <div>
          <h2 className="pp-section-title">Historial de Solicitudes</h2>
          <p className="pp-section-subtitle">Todas tus solicitudes registradas en el sistema</p>
        </div>
      </div>

      <div className="pp-filters">
        <div className="pp-filter-input-wrap">
          <Search size={14} />
          <input
            className="pp-filter-input"
            placeholder="Buscar por asunto o número..."
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
          onChange={(e) => setFiltroEstado(e.target.value as EstadoSolicitud | "")}
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

      <div className="pp-table-card">
        <div
          className="pp-table-head"
          style={{ gridTemplateColumns: "100px 110px 1fr 100px 110px" }}
        >
          <span>Número</span>
          <span>Tipo</span>
          <span>Asunto</span>
          <span>Fecha</span>
          <span>Estado</span>
        </div>

        {filtradas.length === 0 ? (
          <div className="pp-empty">
            <p>No se encontraron solicitudes con los filtros aplicados.</p>
          </div>
        ) : (
          filtradas.map((s) => (
            <div
              key={s.id}
              className="pp-table-row"
              style={{ gridTemplateColumns: "100px 110px 1fr 100px 110px" }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                {s.numero}
              </span>
              <span>
                <span className={`pp-badge ${tipoBadgeTone[s.tipo]}`}>
                  {TIPO_LABEL[s.tipo]}
                </span>
              </span>
              <span className="pp-cell-truncate" title={s.asunto}>{s.asunto}</span>
              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{s.fecha}</span>
              <span>
                <span className={`pp-badge ${estadoBadgeTone[s.estado]}`}>
                  {estadoLabel[s.estado]}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
