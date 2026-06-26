import type { DashboardSSTApi } from "../../../types/dashboard.types";
import { normalizeSST } from "../../../services/dashboardApi";

interface SSTResumenCardProps {
  data: DashboardSSTApi | null;
  loading: boolean;
  error: string | null;
}

export default function SSTResumenCard({ data, loading, error }: SSTResumenCardProps) {
  const sst = data ? normalizeSST(data) : null;

  return (
    <div className="dashboard-panel">
      <div className="panel-title">
        <h3>SST</h3>
        {sst && (
          <span className="panel-chip">{sst.totalEventos} eventos</span>
        )}
      </div>

      {loading ? (
        <div className="dash-card-state">Cargando...</div>
      ) : error ? (
        <div className="dash-card-state dash-card-error">{error}</div>
      ) : sst ? (
        <div className="sst-content card-scroll" style={{ overflowY: "auto" }}>
          <div className="stat-mini-grid cols-3">
            <div className="stat-mini-box">
              <span className="stat-mini-label">Accidentes</span>
              <span
                className="stat-mini-value"
                style={sst.accidentesTrabajo > 0 ? { color: "var(--color-danger)" } : undefined}
              >
                {sst.accidentesTrabajo}
              </span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Incidentes</span>
              <span
                className="stat-mini-value"
                style={sst.incidentes > 0 ? { color: "var(--color-warning)" } : undefined}
              >
                {sst.incidentes}
              </span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Enf. laborales</span>
              <span
                className="stat-mini-value"
                style={sst.enfermedadesLaborales > 0 ? { color: "var(--color-warning)" } : undefined}
              >
                {sst.enfermedadesLaborales}
              </span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Capacitaciones</span>
              <span className="stat-mini-value">{sst.capacitaciones}</span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Entregas EPP</span>
              <span className="stat-mini-value">{sst.entregasEpp}</span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Planes vencidos</span>
              <span
                className="stat-mini-value"
                style={sst.planesVencidos > 0 ? { color: "var(--color-warning)" } : undefined}
              >
                {sst.planesVencidos}
              </span>
            </div>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-header">
              <span>
                Cierre de planes ({sst.planesCerrados} cerrados / {sst.planesAbiertos} abiertos)
              </span>
              <span>{sst.porcentajeCierrePlanes}%</span>
            </div>
            <div className="hbar-track">
              <div
                className="hbar-fill"
                style={{ width: `${Math.min(sst.porcentajeCierrePlanes, 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="dash-card-state">Sin datos de SST</div>
      )}
    </div>
  );
}
