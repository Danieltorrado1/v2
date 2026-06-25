import {
  Activity,
  Banknote,
  ClipboardList,
  FileText,
  LogIn,
  UserCog,
} from "lucide-react";
import type { ComponentType } from "react";
import type { TimelineTone } from "../../mockData";
import { colabTimeline, colabSolicitudes } from "../../mockData";

const TONE_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  sesion: LogIn,
  documento: FileText,
  solicitud: ClipboardList,
  novedad: Banknote,
  datos: UserCog,
  general: Activity,
};

const kpis = [
  { label: "Solicitudes activas", value: colabSolicitudes.filter(s => !['cerrado','resuelto','rechazado'].includes(s.estado)).length, tone: "primary" },
  { label: "En revisión", value: colabSolicitudes.filter(s => s.estado === 'en-revision').length, tone: "warning" },
  { label: "Resueltas (mes)", value: colabSolicitudes.filter(s => ['resuelto','enviado','cerrado'].includes(s.estado)).length, tone: "success" },
  { label: "Días laborados", value: 125, tone: "info" },
];

const TONE_CSS: Record<TimelineTone, string> = {
  primary: "tl-primary",
  success: "tl-success",
  warning: "tl-warning",
  info: "tl-info",
  neutral: "tl-neutral",
  danger: "tl-danger",
};

export default function MiActividad() {
  return (
    <div className="pp-section">
      <div className="pp-section-header">
        <div>
          <h2 className="pp-section-title">Mi Actividad</h2>
          <p className="pp-section-subtitle">Resumen de tu actividad en el portal</p>
        </div>
      </div>

      <div className="pp-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`pp-kpi ${k.tone}`}>
            <div className="pp-kpi-icon">
              <Activity size={16} />
            </div>
            <div className="pp-kpi-body">
              <span className="pp-kpi-value">{k.value}</span>
              <span className="pp-kpi-label">{k.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pp-card">
        <p className="pp-card-title">Actividad reciente</p>
        <div className="pp-timeline">
          {colabTimeline.map((item) => {
            const Icon = TONE_ICONS[item.tipo] ?? Activity;
            return (
              <div key={item.id} className="pp-tl-item">
                <div className={`pp-tl-dot ${TONE_CSS[item.tono]}`}>
                  <Icon size={11} />
                </div>
                <div className="pp-tl-body">
                  <div className="pp-tl-time">{item.fecha}</div>
                  <div className="pp-tl-text">{item.texto}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
