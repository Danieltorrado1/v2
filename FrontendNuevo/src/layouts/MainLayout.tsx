import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, Building2, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useCompanyContext } from "../context/CompanyContext";
import { NavDropdown } from "./NavDropdown";
import {
  NotificationsPanel,
  INITIAL_UNREAD_COUNT,
} from "../components/notifications/NotificationsPanel";
import "./MainLayout.css";

const nominaLinks = [
  { to: "/nomina", label: "N\u00f3mina" },
  { to: "/nomina/liquidacion", label: "Liquidaci\u00f3n" },
  { to: "/nomina/turnos", label: "Turnos" },
  { to: "/nomina/personal-ops", label: "Personal OPS" },
  { to: "/nomina/correccion", label: "Correcci\u00f3n N\u00f3mina" },
];

const herramientasLinks = [
  { to: "/herramientas/calculadora-salario", label: "Calculadora de salario" },
  { to: "/herramientas/calculadora-cobertura", label: "Calculadora de cobertura" },
  { to: "/herramientas/cobertura", label: "Cobertura" },
];

const sstLinks = [
  { to: "/sst?tab=resumen", label: "Resumen SST" },
  { to: "/sst?tab=eventos", label: "Eventos" },
  { to: "/sst?tab=planes", label: "Planes de acci\u00f3n" },
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
  const { empresas, empresaId, empresaActiva, isLoading, setEmpresaId } = useCompanyContext();
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(INITIAL_UNREAD_COUNT);
  const [logoFallback, setLogoFallback] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const canAccessAdmin = user?.roles.includes("ADMINISTRADOR") === true;
  const logoSrc =
    theme === "dark"
      ? "/branding/empiria-logo-horizontal-dark-web.png"
      : "/branding/empiria-logo-horizontal-light-web.png";

  useEffect(() => {
    setLogoFallback(false);
  }, [logoSrc]);

  function toggleNotif() {
    setNotifOpen((value) => !value);
  }

  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/dashboard" className="logo-area logo-link" aria-label="Empiria">
          {logoFallback ? (
            <span className="logo-fallback">EMPIRIA</span>
          ) : (
            <img
              src={logoSrc}
              alt="Empiria"
              className={`logo-image logo-image--${theme}`}
              onError={() => setLogoFallback(true)}
            />
          )}
        </Link>

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
          <NavDropdown label={"N\u00f3mina"} links={nominaLinks} />
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
              {"Administraci\u00f3n"}
            </NavLink>
          )}
        </nav>

        <div className="right-side">
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

          <button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {empresas.length > 0 && (
            <label className="company-context-control" title={empresaActiva?.nombre_empresa ?? "Empresa activa"}>
              <Building2 size={16} aria-hidden="true" />
              <select
                value={empresaId ?? ""}
                onChange={(event) => setEmpresaId(event.target.value ? Number(event.target.value) : null)}
                disabled={isLoading || empresas.length === 1}
                aria-label="Empresa activa"
              >
                {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          )}

          <div className="user-area">
            <span>{user?.name ?? "Usuario"}</span>
            <button
              type="button"
              className="theme-button"
              onClick={logout}
              title={"Cerrar sesi\u00f3n"}
              aria-label={"Cerrar sesi\u00f3n"}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

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
