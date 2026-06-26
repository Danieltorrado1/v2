import type { DashboardNominaApi } from "../../../types/dashboard.types";
import { normalizeNomina } from "../../../services/dashboardApi";

const formatCOP = (value: number): string =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

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
        <div className="nomina-content card-scroll" style={{ overflowY: "auto" }}>
          <div className="stat-mini-grid cols-2">
            <div className="stat-mini-box">
              <span className="stat-mini-label">Períodos abiertos</span>
              <span className="stat-mini-value">{nomina.periodosAbiertos}</span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Períodos cerrados</span>
              <span className="stat-mini-value">{nomina.periodosCerrados}</span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Nov. pendientes</span>
              <span className="stat-mini-value">{nomina.novedadesPendientes}</span>
            </div>
            <div className="stat-mini-box">
              <span className="stat-mini-label">Estado período</span>
              <span className="stat-mini-value" style={{ fontSize: "0.7rem" }}>
                {nomina.ultimoPeriodoEstadoLiquidacion ?? "—"}
              </span>
            </div>
          </div>

          <div className="nomina-financiero">
            <span className="nomina-financiero-label">Total devengado</span>
            <span className="nomina-financiero-value">{formatCOP(nomina.totalDevengado)}</span>
          </div>
          <div className="nomina-financiero">
            <span className="nomina-financiero-label">Deducciones</span>
            <span className="nomina-financiero-value" style={{ color: "var(--color-danger)" }}>
              {formatCOP(nomina.totalDeducciones)}
            </span>
          </div>
          <div className="nomina-financiero">
            <span className="nomina-financiero-label">Neto pagado (final)</span>
            <span className="nomina-financiero-value" style={{ color: "var(--color-success)" }}>
              {formatCOP(nomina.netoPagado)}
            </span>
          </div>

          {nomina.ultimoPeriodoFechaInicio && (
            <div className="nomina-financiero" style={{ marginTop: 4 }}>
              <span className="nomina-financiero-label" style={{ fontSize: "0.68rem" }}>
                Período: {formatDate(nomina.ultimoPeriodoFechaInicio)} – {formatDate(nomina.ultimoPeriodoFechaFin)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="dash-card-state">Sin datos de nómina</div>
      )}
    </div>
  );
}
