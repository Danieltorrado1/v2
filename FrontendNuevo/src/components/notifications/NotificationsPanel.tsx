import { useEffect, useRef, useState } from "react";
import type { ComponentType, RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  Bell,
  CheckCheck,
  FolderOpen,
  MapPin,
  ShieldAlert,
  User,
  Users,
  X,
} from "lucide-react";
import { notificacionesApi } from "../../services/notificacionesApi";
import type { NotificacionApiItem } from "../../types/notificaciones.types";
import "./NotificationsPanel.css";

type Severity = "danger" | "warning" | "info" | "success" | "neutral";

type Alert = {
  description: string;
  icon: ComponentType<{ size?: number }>;
  id: string;
  module: string;
  read: boolean;
  route: string;
  severity: Severity;
  time: string;
  title: string;
};

export const INITIAL_UNREAD_COUNT = 0;

type Filter = "todos" | "criticas" | "pendientes" | "informativas";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "criticas", label: "Críticas" },
  { id: "pendientes", label: "Pendientes" },
  { id: "informativas", label: "Informativas" },
];

const routeByType = (tipo: string): string => {
  if (tipo.startsWith("DOCUMENTO_")) return "/repositorio";
  if (tipo.startsWith("CONTRATO_") || tipo.startsWith("VINCULACION_")) return "/personal";
  if (tipo.startsWith("COBERTURA") || tipo === "SOBRECOBERTURA") return "/nomina/cobertura";
  if (tipo.startsWith("NOMINA_")) return "/nomina/novedades";
  if (tipo.startsWith("PLAN_SST_")) return "/sst?tab=planes";
  return "/dashboard";
};

const moduleByType = (tipo: string): string => {
  if (tipo.startsWith("DOCUMENTO_")) return "Repositorio";
  if (tipo.startsWith("CONTRATO_") || tipo.startsWith("VINCULACION_")) return "Personal";
  if (tipo.startsWith("COBERTURA") || tipo === "SOBRECOBERTURA") return "Cobertura";
  if (tipo.startsWith("NOMINA_")) return "Nómina";
  if (tipo.startsWith("PLAN_SST_")) return "SST";
  return "Sistema";
};

const iconByType = (tipo: string): ComponentType<{ size?: number }> => {
  if (tipo.startsWith("DOCUMENTO_")) return FolderOpen;
  if (tipo.startsWith("CONTRATO_") || tipo.startsWith("VINCULACION_")) return Users;
  if (tipo.startsWith("COBERTURA") || tipo === "SOBRECOBERTURA") return MapPin;
  if (tipo.startsWith("NOMINA_")) return Banknote;
  if (tipo.startsWith("PLAN_SST_")) return ShieldAlert;
  return User;
};

const severityByNotification = (item: NotificacionApiItem): Severity => {
  if (item.prioridad === "CRITICA") return "danger";
  if (item.prioridad === "ALTA" || item.prioridad === "MEDIA") return "warning";
  if (item.prioridad === "BAJA") return "info";
  return "neutral";
};

const relativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "reciente";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return "hace unos segundos";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} d`;
};

const toAlert = (item: NotificacionApiItem): Alert => ({
  id: item.id,
  module: moduleByType(item.tipo),
  icon: iconByType(item.tipo),
  title: item.titulo,
  description: item.mensaje,
  severity: severityByNotification(item),
  route: item.url_accion ?? routeByType(item.tipo),
  time: relativeTime(item.created_at),
  read: item.leida,
});

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
  bellRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
};

export function NotificationsPanel({ onClose, onUnreadCountChange, bellRef }: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        setLoading(true);
        setError("");
        const response = await notificacionesApi.listMine({ page: 1, limit: 50 });
        if (!cancelled) {
          setAlerts(response.items.map(toAlert));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "No fue posible cargar notificaciones.");
          setAlerts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const unreadCount = alerts.filter((a) => !a.read).length;

  useEffect(() => {
    onUnreadCountChange(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  async function handleAlertClick(alert: Alert) {
    setAlerts((prev) => prev.map((item) => (item.id === alert.id ? { ...item, read: true } : item)));
    try {
      if (!alert.read) {
        await notificacionesApi.markRead(alert.id);
      }
    } catch {
      // Mantener navegación aunque el backend rechace marcar lectura.
    }
    onClose();
    navigate(alert.route);
  }

  async function markAllRead() {
    setAlerts((prev) => prev.map((alert) => ({ ...alert, read: true })));
    try {
      await notificacionesApi.markAllRead();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "No fue posible marcar las notificaciones.");
    }
  }

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
              onClick={() => void markAllRead()}
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

      <div className="notif-list">
        {loading ? (
          <div className="notif-empty">
            <Bell size={34} />
            <strong>Cargando notificaciones</strong>
            <span>Consultando el backend filtrado.</span>
          </div>
        ) : error ? (
          <div className="notif-empty">
            <Bell size={34} />
            <strong>No fue posible cargar</strong>
            <span>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
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
                onClick={() => void handleAlertClick(alert)}
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

      <div className="notif-footer">
        <button type="button" className="notif-footer-btn" onClick={() => navigate("/dashboard") }>
          Ver dashboard
        </button>
      </div>
    </div>
  );
}
