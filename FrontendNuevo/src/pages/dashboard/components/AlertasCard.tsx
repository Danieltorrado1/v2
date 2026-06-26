import { AlertTriangle, FileWarning, FileX, ShieldAlert } from "lucide-react";
import type { DashboardAlertasApi, DashboardResumenApi } from "../../../types/dashboard.types";
import { normalizeAlertasTipo } from "../../../services/dashboardApi";

interface AlertasCardProps {
  alertasData: DashboardAlertasApi | null;
  resumenData: DashboardResumenApi | null;
  alertasLoading: boolean;
  alertasError: string | null;
}

export default function AlertasCard({
  alertasData,
  resumenData,
  alertasLoading,
  alertasError,
}: AlertasCardProps) {
  const tipoItems = alertasData ? normalizeAlertasTipo(alertasData) : [];

  return (
    <div className="dashboard-panel">
      <div className="panel-title">
        <h3>Alertas y Riesgos</h3>
        {alertasData && !alertasLoading && (
          <span className="panel-chip">{alertasData.alertas_activas} activas</span>
        )}
      </div>

      {alertasLoading ? (
        <div className="dash-card-state">Cargando...</div>
      ) : alertasError ? (
        <div className="dash-card-state dash-card-error">{alertasError}</div>
      ) : alertasData ? (
        <div className="alertas-content">
          <div className="sev-row">
            <span className="sev-badge sev-critica">
              <AlertTriangle size={10} />
              Críticas {alertasData.alertas_criticas}
            </span>
            <span className="sev-badge sev-alta">
              <ShieldAlert size={10} />
              Altas {alertasData.alertas_altas}
            </span>
            {resumenData && resumenData.documentos_vencidos > 0 && (
              <span className="sev-badge sev-critica">
                <FileX size={10} />
                Docs vencidos {resumenData.documentos_vencidos}
              </span>
            )}
            {resumenData && resumenData.documentos_por_vencer > 0 && (
              <span className="sev-badge sev-alta">
                <FileWarning size={10} />
                Por vencer {resumenData.documentos_por_vencer}
              </span>
            )}
          </div>

          {tipoItems.length > 0 ? (
            <div className="card-scroll alert-type-list">
              {tipoItems.map((item) => (
                <div key={item.tipo} className="alert-type-item">
                  <span className="alert-type-label">{item.tipo}</span>
                  <span className="alert-type-count">{item.total}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-card-state">Sin alertas por tipo</div>
          )}
        </div>
      ) : (
        <div className="dash-card-state">Sin datos</div>
      )}
    </div>
  );
}
