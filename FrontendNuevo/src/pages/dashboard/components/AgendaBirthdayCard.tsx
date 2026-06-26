import { Cake, CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DashboardCumpleanosItem } from "../../../types/dashboard.types";

type Tab = "agenda" | "cumpleanos";

const AVATAR_COLORS = [
  "color-teal",
  "color-blue",
  "color-purple",
  "color-orange",
  "color-red",
  "color-green",
] as const;

const getAvatarColor = (id: string): string => {
  const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? "color-teal";
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
};

const MONTH_ABBR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"] as const;

const formatBirthday = (iso: string): string => {
  const parts = iso.split("-");
  const m = parseInt(parts[1] ?? "1", 10);
  const d = parseInt(parts[2] ?? "1", 10);
  return `${d} ${MONTH_ABBR[m - 1] ?? ""}`;
};

const getDaysPillClass = (dias: number): string => {
  if (dias === 0) return "date-pill success";
  if (dias <= 7) return "date-pill brand";
  return "date-pill neutral";
};

const getDaysLabel = (dias: number): string => {
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `${dias} días`;
};

interface AgendaBirthdayCardProps {
  cumpleanos: DashboardCumpleanosItem[];
  loading: boolean;
}

export default function AgendaBirthdayCard({ cumpleanos, loading }: AgendaBirthdayCardProps) {
  const [tab, setTab] = useState<Tab>("agenda");

  return (
    <div className="dashboard-panel agenda-card">
      <div className="card-tab-bar">
        <button
          type="button"
          className={`card-tab ${tab === "agenda" ? "active" : ""}`}
          onClick={() => setTab("agenda")}
        >
          <CalendarDays size={13} />
          Agenda
        </button>
        <button
          type="button"
          className={`card-tab ${tab === "cumpleanos" ? "active" : ""}`}
          onClick={() => setTab("cumpleanos")}
        >
          <Cake size={13} />
          Cumpleaños
          {cumpleanos.length > 0 && (
            <span
              style={{
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 900,
                borderRadius: 999,
                padding: "1px 5px",
                marginLeft: 2,
              }}
            >
              {cumpleanos.length}
            </span>
          )}
        </button>
      </div>

      {tab === "agenda" ? (
        <div key="agenda" className="card-scroll dash-unavailable-state">
          <CalendarDays size={28} className="dash-unavailable-icon" />
          <p className="dash-unavailable-title">No hay agenda disponible</p>
          <p className="dash-unavailable-desc">
            El módulo de agenda estará disponible en una próxima versión.
          </p>
        </div>
      ) : (
        <div key="cumpleanos" className="card-scroll">
          {loading ? (
            <div className="dash-unavailable-state" style={{ flex: 1 }}>
              <p className="dash-unavailable-title" style={{ fontWeight: 600 }}>Cargando...</p>
            </div>
          ) : cumpleanos.length === 0 ? (
            <div className="dash-unavailable-state" style={{ flex: 1 }}>
              <Cake size={28} className="dash-unavailable-icon" />
              <p className="dash-unavailable-title">No hay cumpleaños próximos</p>
              <p className="dash-unavailable-desc">
                Ningún colaborador activo cumple años en los próximos 30 días.
              </p>
            </div>
          ) : (
            cumpleanos.map((item) => (
              <div key={item.persona_id} className="bday-item">
                <div className={`bday-avatar ${getAvatarColor(item.persona_id)}`}>
                  {getInitials(item.nombre_completo)}
                </div>
                <div className="bday-body">
                  <strong title={item.nombre_completo}>{item.nombre_completo}</strong>
                  {item.cargo && (
                    <span title={item.cargo}>{item.cargo}</span>
                  )}
                  {(item.empresa ?? item.contrato) && (
                    <small title={item.empresa ?? item.contrato ?? ""}>
                      {item.empresa ?? item.contrato}
                    </small>
                  )}
                </div>
                <div
                  className={getDaysPillClass(item.dias_restantes)}
                  title={formatBirthday(item.fecha_cumpleanos)}
                >
                  {getDaysLabel(item.dias_restantes)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
