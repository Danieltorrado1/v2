import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, Building2, ChevronDown, LogOut, Moon, Sun, UserRound } from "lucide-react";
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
  { to: "/nomina/planilla-operativa", label: "Planilla 1–31" },
  { to: "/nomina", label: "N\u00f3mina" },
  { to: "/nomina/liquidacion", label: "Liquidaci\u00f3n" },
  { to: "/nomina/turnos", label: "Turnos" },
  { to: "/nomina/cambios-operativos", label: "Cambios operativos" },
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
  const accountRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const canAccessAdmin = user?.roles.includes("ADMINISTRADOR") === true;
  const displayName = user?.name ?? "Usuario";
  const roleLabel = user?.roles?.[0] ?? "Usuario";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
  const logoSrc =
    theme === "dark"
      ? "/branding/empiria-logo-horizontal-dark-web.png"
      : "/branding/empiria-logo-horizontal-light-web.png";

  useEffect(() => {
    setLogoFallback(false);
  }, [logoSrc]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);
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

          <div className="account-area" ref={accountRef}>
            <button
              type="button"
              className="account-trigger"
              onClick={() => { setAccountOpen((open) => !open); setAccountDetailsOpen(false); }}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label="Abrir menu de cuenta"
            >
              <span className="account-avatar" aria-hidden="true">{initials}</span>
              <span className="account-copy">
                <strong>{displayName}</strong>
                <small>{roleLabel}</small>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {accountOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-heading">
                  <span className="account-avatar account-avatar-large" aria-hidden="true">{initials}</span>
                  <div><strong>{displayName}</strong><small>{roleLabel}</small></div>
                </div>
                {accountDetailsOpen && (
                  <div className="account-details">
                    <span>Correo</span><strong>{user?.email ?? "No disponible"}</strong>
                    <span>Rol</span><strong>{roleLabel}</strong>
                  </div>
                )}                <button type="button" className="account-menu-item" role="menuitem" aria-expanded={accountDetailsOpen} onClick={() => setAccountDetailsOpen((open) => !open)}>
                  <UserRound size={16} /> Mi cuenta
                </button>
                <button type="button" className="account-menu-item account-menu-item-danger" role="menuitem" onClick={logout}>
                  <LogOut size={16} /> Cerrar sesion
                </button>
              </div>
            )}
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
