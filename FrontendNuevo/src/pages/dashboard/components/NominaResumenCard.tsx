import type { DashboardNominaApi } from "../../../types/dashboard.types";
import { normalizeNomina } from "../../../services/dashboardApi";

const formatCOP = (value: number): string =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

interface NominaResumenCardProps {
  data: DashboardNominaApi | null;
  loading: boolean;
  error: string | null;
}

export default function NominaResumenCard({ data, loading, error }: NominaResumenCardProps) {
  const nomina = data ? normalizeNomina(data) : null;

  return (
    <div className="dashboard-panel">
      <div className="panel-title">
        <h3>Nómina</h3>
        {nomina?.ultimoPeriodoNombre && (
          <span className="panel-chip">{nomina.ultimoPeriodoNombre}</span>
        )}
      </div>

      {loading ? (
        <div className="dash-card-state">Cargando...</div>
      ) : error ? (
        <div className="dash-card-state dash-card-error">{error}</div>
      ) : nomina ? (
        <div className="nomina-content">
          <div className="stat-mini-grid cols-2">
            <div className="stat-mini-box">
              <span className="stat-mini-label">Períodos abiertos</span>
              <span className="stat-mini-value">{nomina.periodosAbiertos}</span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Novedades</span>
              <span className="stat-mini-value">{nomina.novedadesPendientes}</span>
            </div>
          </div>
          <div className="nomina-financiero">
            <span className="nomina-financiero-label">Total devengado</span>
            <span className="nomina-financiero-value">{formatCOP(nomina.totalDevengado)}</span>
          </div>
        </div>
      ) : (
        <div className="dash-card-state">Sin datos de nómina</div>
      )}
    </div>
  );
}
