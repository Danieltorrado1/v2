import { useEffect, useRef, useState } from "react";
import type { ComponentType, RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  Bell,
  CheckCheck,
  FolderOpen,
  MapPin,
  Settings,
  ShieldAlert,
  User,
  Users,
  X,
} from "lucide-react";
import "./NotificationsPanel.css";

type Severity = "danger" | "warning" | "info" | "success" | "neutral";

type Alert = {
  id: string;
  module: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  severity: Severity;
  route: string;
  time: string;
  read: boolean;
};

const INITIAL_ALERTS: Alert[] = [
  {
    id: "1",
    module: "Personal",
    icon: Users,
    title: "Documento próximo a vencer",
    description: "María López tiene examen médico próximo a vencer.",
    severity: "warning",
    route: "/personal",
    time: "hace 10 min",
    read: false,
  },
  {
    id: "2",
    module: "Nómina",
    icon: Banknote,
    title: "Novedades pendientes",
    description: "Hay 14 novedades sin revisar para el período actual.",
    severity: "warning",
    route: "/nomina",
    time: "hace 32 min",
    read: false,
  },
  {
    id: "3",
    module: "SST",
    icon: ShieldAlert,
    title: "Hallazgo crítico abierto",
    description: "Inspección SST con acción correctiva pendiente.",
    severity: "danger",
    route: "/sst/incidentes",
    time: "hace 1 h",
    read: false,
  },
  {
    id: "4",
    module: "Repositorio",
    icon: FolderOpen,
    title: "Documento vencido",
    description: "Antecedentes judiciales vencidos en 3 colaboradores.",
    severity: "danger",
    route: "/repositorio",
    time: "hace 2 h",
    read: false,
  },
  {
    id: "5",
    module: "Cobertura",
    icon: MapPin,
    title: "Municipio con déficit",
    description: "Granada presenta faltante de personal requerido.",
    severity: "warning",
    route: "/herramientas/cobertura",
    time: "hace 3 h",
    read: false,
  },
  {
    id: "6",
    module: "Portal",
    icon: User,
    title: "Solicitud pendiente",
    description: "2 colaboradores solicitaron certificaciones laborales.",
    severity: "info",
    route: "/portal",
    time: "hace 4 h",
    read: false,
  },
  {
    id: "7",
    module: "Administración",
    icon: Settings,
    title: "Usuario pendiente de activación",
    description: "Nuevo usuario creado sin rol asignado.",
    severity: "info",
    route: "/administracion",
    time: "hace 5 h",
    read: false,
  },
];

export const INITIAL_UNREAD_COUNT = INITIAL_ALERTS.filter((a) => !a.read).length;

type Filter = "todos" | "criticas" | "pendientes" | "informativas";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "criticas", label: "Críticas" },
  { id: "pendientes", label: "Pendientes" },
  { id: "informativas", label: "Informativas" },
];

function matchesFilter(alert: Alert, filter: Filter): boolean {
  if (filter === "todos") return true;
  if (filter === "criticas") return alert.severity === "danger";
  if (filter === "pendientes") return alert.severity === "warning";
  if (filter === "informativas") return alert.severity === "info";
  return true;
}

function sevLabel(sev: Severity): string {
  if (sev === "danger") return "Crítica";
  if (sev === "warning") return "Aviso";
  if (sev === "info") return "Info";
  if (sev === "success") return "OK";
  return "Neutral";
}

type Props = {
  onClose: () => void;
  onAllRead: () => void;
  bellRef: RefObject<HTMLButtonElement | null>;
};

export function NotificationsPanel({ onClose, onAllRead, bellRef }: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [alerts, setAlerts] = useState<Alert[]>(INITIAL_ALERTS);
  const [activeFilter, setActiveFilter] = useState<Filter>("todos");

  // Escape + click-outside
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inBell = bellRef.current?.contains(target);
      if (!inPanel && !inBell) onClose();
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onClose, bellRef]);

  function handleAlertClick(alert: Alert) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a)),
    );
    onClose();
    navigate(alert.route);
  }

  function markAllRead() {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    onAllRead();
  }

  const unreadCount = alerts.filter((a) => !a.read).length;

  const dangerUnread = alerts.filter((a) => !a.read && a.severity === "danger").length;
  const warningUnread = alerts.filter((a) => !a.read && a.severity === "warning").length;

  const filtered = alerts.filter((a) => matchesFilter(a, activeFilter));

  return (
    <div
      ref={panelRef}
      className="notif-panel"
      role="dialog"
      aria-label="Panel de notificaciones"
    >
      {/* Header */}
      <div className="notif-header">
        <div className="notif-header-left">
          <h3>Alertas</h3>
          <span>
            {unreadCount > 0
              ? `${unreadCount} pendiente${unreadCount !== 1 ? "s" : ""}`
              : "Todo al día"}
          </span>
        </div>
        <div className="notif-header-right">
          {unreadCount > 0 && (
            <button
              type="button"
              className="notif-mark-all-btn"
              onClick={markAllRead}
              title="Marcar todas como leídas"
            >
              <CheckCheck size={13} />
              Marcar leídas
            </button>
          )}
          <button
            type="button"
            className="notif-close-btn"
            onClick={onClose}
            aria-label="Cerrar panel de notificaciones"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="notif-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`notif-filter-pill ${activeFilter === f.id ? "active" : ""}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
            {f.id === "criticas" && dangerUnread > 0 && (
              <span className="notif-pill-count danger">{dangerUnread}</span>
            )}
            {f.id === "pendientes" && warningUnread > 0 && (
              <span className="notif-pill-count warning">{warningUnread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="notif-list">
        {filtered.length === 0 ? (
          <div className="notif-empty">
            <Bell size={34} />
            <strong>Sin alertas pendientes</strong>
            <span>Todo está al día.</span>
          </div>
        ) : (
          filtered.map((alert) => {
            const Icon = alert.icon;
            return (
              <button
                key={alert.id}
                type="button"
                className={`notif-item sev-${alert.severity} ${alert.read ? "read" : ""}`}
                onClick={() => handleAlertClick(alert)}
              >
                <div className={`notif-item-icon sev-${alert.severity}`}>
                  <Icon size={15} />
                </div>

                <div className="notif-item-body">
                  <span className="notif-item-title">{alert.title}</span>
                  <span className="notif-item-desc">{alert.description}</span>
                  <span className="notif-item-meta">
                    {alert.module} · {alert.time}
                  </span>
                </div>

                <div className="notif-item-right">
                  <span className={`notif-sev-badge sev-${alert.severity}`}>
                    {sevLabel(alert.severity)}
                  </span>
                  {!alert.read && <span className="notif-unread-dot" />}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="notif-footer">
        <button type="button" className="notif-footer-btn">
          Ver centro de alertas
        </button>
      </div>
    </div>
  );
}
