import { useState } from "react";
import "./DashboardPage.css";
import PersonalTab from "./components/PersonalTab";
import type { DashboardFilters } from "../../types/dashboard.types";

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>({});

  const hasFilters =
    !!filters.empresa_id || !!filters.contrato_id || !!filters.fecha_desde || !!filters.fecha_hasta;

  return (
    <section className="dashboard-page">
      <div className="dash-filter-bar">
        <span className="dash-filter-label">Período:</span>
        <input
          type="date"
          className="dash-filter-input"
          title="Fecha desde"
          value={filters.fecha_desde ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, fecha_desde: e.target.value || undefined }))
          }
        />
        <span className="dash-filter-sep">—</span>
        <input
          type="date"
          className="dash-filter-input"
          title="Fecha hasta"
          value={filters.fecha_hasta ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, fecha_hasta: e.target.value || undefined }))
          }
        />
        <span className="dash-filter-divider" />
        <span className="dash-filter-label">Empresa:</span>
        <input
          type="text"
          className="dash-filter-input dash-filter-sm"
          placeholder="ID"
          value={filters.empresa_id ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, empresa_id: e.target.value || undefined }))
          }
        />
        <span className="dash-filter-label">Contrato:</span>
        <input
          type="text"
          className="dash-filter-input dash-filter-sm"
          placeholder="ID"
          value={filters.contrato_id ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, contrato_id: e.target.value || undefined }))
          }
        />
        {hasFilters && (
          <button
            type="button"
            className="dash-filter-clear"
            onClick={() => setFilters({})}
            title="Limpiar filtros"
          >
            ×
          </button>
        )}
      </div>

      <PersonalTab filters={filters} />
    </section>
  );
}
