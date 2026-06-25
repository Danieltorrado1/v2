import { AlertTriangle, CheckCircle, Clock, Inbox, Users } from "lucide-react";
import type { ComponentType } from "react";
import type { TimelineTone } from "../../mockData";
import { thTimeline } from "../../mockData";

const kpis: { label: string; value: number; tone: string; Icon: ComponentType<{ size?: number }> }[] = [
  { label: "Solicitudes pendientes", value: 3, tone: "warning", Icon: Clock },
  { label: "En proceso", value: 1, tone: "primary", Icon: Inbox },
  { label: "Resueltas (mes)", value: 12, tone: "success", Icon: CheckCircle },
  { label: "Colaboradores activos", value: 38, tone: "info", Icon: Users },
  { label: "Sin respuesta > 48h", value: 2, tone: "danger", Icon: AlertTriangle },
];

const TONE_CSS: Record<TimelineTone, string> = {
  primary: "tl-primary",
  success: "tl-success",
  warning: "tl-warning",
  info: "tl-info",
  neutral: "tl-neutral",
  danger: "tl-danger",
};

const TIPO_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  sesion: Clock,
  gestion: Inbox,
  recepcion: AlertTriangle,
  envio: CheckCircle,
  aprobacion: CheckCircle,
};

export default function MiActividadTH() {
  return (
    <div className="pp-section">
      <div className="pp-section-header">
        <div>
          <h2 className="pp-section-title">Mi Actividad</h2>
          <p className="pp-section-subtitle">Resumen de gestión — Municipio: Acacías</p>
        </div>
      </div>

      <div className="pp-kpis">
        {kpis.map((k) => {
          const { Icon } = k;
          return (
            <div key={k.label} className={`pp-kpi ${k.tone}`}>
              <div className="pp-kpi-icon"><Icon size={16} /></div>
              <div className="pp-kpi-body">
                <span className="pp-kpi-value">{k.value}</span>
                <span className="pp-kpi-label">{k.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pp-card">
        <p className="pp-card-title">Actividad reciente</p>
        <div className="pp-timeline">
          {thTimeline.map((item) => {
            const Icon = TIPO_ICONS[item.tipo] ?? Inbox;
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
