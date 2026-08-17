import { useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { NavDropdown } from "./NavDropdown";
import {
  NotificationsPanel,
  INITIAL_UNREAD_COUNT,
} from "../components/notifications/NotificationsPanel";
import "./MainLayout.css";

const nominaLinks = [
  { to: "/nomina", label: "NÃ³mina" },
  { to: "/nomina/liquidacion", label: "LiquidaciÃ³n" },
  { to: "/nomina/turnos", label: "Turnos" },
  { to: "/nomina/personal-ops", label: "Personal OPS" },
  { to: "/nomina/correccion", label: "CorrecciÃ³n NÃ³mina" },
];

const herramientasLinks = [
  { to: "/herramientas/calculadora-salario", label: "Calculadora de salario" },
  { to: "/herramientas/calculadora-cobertura", label: "Calculadora de cobertura" },
  { to: "/herramientas/cobertura", label: "Cobertura" },
];

const sstLinks = [
  { to: "/sst?tab=resumen", label: "Resumen SST" },
  { to: "/sst?tab=eventos", label: "Eventos" },
  { to: "/sst?tab=planes", label: "Planes de acciÃ³n" },
  { to: "/sst?tab=inspecciones", label: "Inspecciones" },
  { to: "/sst?tab=hallazgos", label: "Hallazgos y acciones" },
  { to: "/sst?tab=accidentes", label: "Accidentes" },
  { to: "/sst?tab=indicadores", label: "Indicadores" },
];

const repositorioLinks = [
  { to: "/repositorio", label: "Ver documentos" },
  { to: "/repositorio/subir", label: "Subir documentos" },
];

export default function MainLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(INITIAL_UNREAD_COUNT);
  const bellRef = useRef<HTMLButtonElement>(null);
  const canAccessAdmin = user?.roles.includes("ADMINISTRADOR") === true;

  function toggleNotif() {
    setNotifOpen((v) => !v);
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="logo-area">EMPIRIA</div>

        <nav className="menu">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/personal"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Personal
          </NavLink>
          <NavLink
            to="/vinculaciones"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Vinculaciones
          </NavLink>
          <NavDropdown label="NÃ³mina" links={nominaLinks} />
          <NavDropdown label="Herramientas" links={herramientasLinks} />
          <NavDropdown label="SST" links={sstLinks} />
          <NavLink
            to="/portal"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Portal
          </NavLink>
          <NavDropdown label="Repositorio" links={repositorioLinks} />
          {canAccessAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
            >
              AdministraciÃ³n
            </NavLink>
          )}
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

          <div className="user-area">
            <span>{user?.name ?? "Usuario"}</span>
            <button
              type="button"
              className="theme-button"
              onClick={logout}
              title="Cerrar sesiÃ³n"
              aria-label="Cerrar sesiÃ³n"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Notification panel â€” fixed, so rendered outside content flow */}
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

