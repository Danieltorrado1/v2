import { useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Bell, Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { NavDropdown } from "./NavDropdown";
import {
  NotificationsPanel,
  INITIAL_UNREAD_COUNT,
} from "../components/notifications/NotificationsPanel";
import "./MainLayout.css";

const nominaLinks = [
  { to: "/nomina", label: "Nómina" },
  { to: "/nomina/liquidacion", label: "Liquidación" },
  { to: "/nomina/turnos", label: "Turnos" },
  { to: "/nomina/personal-ops", label: "Personal OPS" },
  { to: "/nomina/correccion", label: "Corrección Nómina" },
];

const herramientasLinks = [
  { to: "/herramientas/calculadora-salario", label: "Calculadora de salario" },
  { to: "/herramientas/calculadora-cobertura", label: "Calculadora de cobertura" },
  { to: "/herramientas/cobertura", label: "Cobertura" },
];

const sstLinks = [
  { to: "/sst", label: "Panel SST" },
  { to: "/sst/incidentes", label: "Incidentes y Accidentes" },
  { to: "/sst/riesgos", label: "Identificación de Riesgos" },
  { to: "/sst/capacitaciones", label: "Capacitaciones SST" },
  { to: "/sst/examenes-medicos", label: "Exámenes Médicos" },
  { to: "/sst/epp", label: "Elementos de Protección Personal (EPP)" },
  { to: "/sst/indicadores", label: "Indicadores SST" },
];

const repositorioLinks = [
  { to: "/repositorio", label: "Ver documentos" },
  { to: "/repositorio/subir", label: "Subir documentos" },
];

export default function MainLayout() {
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(INITIAL_UNREAD_COUNT);
  const bellRef = useRef<HTMLButtonElement>(null);

  function toggleNotif() {
    setNotifOpen((v) => !v);
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="logo-area">EMPIRIA</div>

        <nav className="menu">
          <button type="button">Dashboard</button>
          <button type="button">Personal</button>
          <NavDropdown label="Nómina" links={nominaLinks} />
          <NavDropdown label="Herramientas" links={herramientasLinks} />
          <NavDropdown label="SST" links={sstLinks} />
          <NavLink
            to="/portal"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Portal
          </NavLink>
          <NavDropdown label="Repositorio" links={repositorioLinks} />
          <NavLink
            to="/admin"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Administración
          </NavLink>
        </nav>

        <div className="right-side">
          {/* Bell */}
          <button
            ref={bellRef}
            type="button"
            className={`notif-bell-button ${notifOpen ? "active" : ""}`}
            onClick={toggleNotif}
            aria-label="Abrir notificaciones"
            aria-expanded={notifOpen}
            aria-haspopup="dialog"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notif-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>

          {/* Theme toggle */}
          <button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            title={
              theme === "light"
                ? "Cambiar a modo oscuro"
                : "Cambiar a modo claro"
            }
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <div className="user-area">Admin</div>
        </div>
      </header>

      {/* Notification panel — fixed, so rendered outside content flow */}
      {notifOpen && (
        <NotificationsPanel
          onClose={() => setNotifOpen(false)}
          onAllRead={() => setUnreadCount(0)}
          bellRef={bellRef}
        />
      )}

      <main className="content">
        <div className="page-scroll">
          <div className="page-content">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
