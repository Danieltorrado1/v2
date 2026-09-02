import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, Building2, ChevronDown, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useCompanyContext } from "../context/CompanyContext";
import { NavDropdown } from "./NavDropdown";
import { NotificationsPanel } from "../components/notifications/NotificationsPanel";
import { notificacionesApi } from "../services/notificacionesApi";
import "./MainLayout.css";
import { canAccessDashboard, isGestorOnly } from "../router/roleNavigation";

const nominaLinks = [
  { to: "/nomina", label: "Centro de nómina", requiredPermissions: ["nomina.read"] },
  { to: "/nomina/cobertura", label: "Planilla operativa", requiredPermissions: ["nomina.operativa.read", "nomina.read"] },
  { to: "/nomina/liquidacion", label: "Liquidación", requiredPermissions: ["nomina.liquidaciones.generate", "nomina.liquidaciones.finalize"] },
  { to: "/nomina/turnos", label: "Turnos", requiredPermissions: ["nomina.operativa.read"] },
  { to: "/nomina/novedades", label: "Novedades", requiredPermissions: ["nomina.operativa.read", "nomina.read"] },
  { to: "/nomina/cambios-operativos", label: "Cambios operativos", requiredPermissions: ["nomina.movimientos.read"] },
  { to: "/nomina/personal-ops", label: "Personal OPS", requiredPermissions: ["nomina.cuentas_cobro_ops.read"] },
  { to: "/nomina/correccion", label: "Corrección Nómina", requiredPermissions: ["nomina.correcciones.read"] },
] as const;

const herramientasLinks = [
  { to: "/herramientas/calculadora-salario", label: "Calculadora de salario" },
  { to: "/herramientas/calculadora-cobertura", label: "Calculadora de cobertura" },
  { to: "/herramientas/cobertura", label: "Cobertura" },
];

const sstLinks = [
  { to: "/sst?tab=resumen", label: "Resumen SST" },
  { to: "/sst?tab=eventos", label: "Eventos" },
  { to: "/sst?tab=planes", label: "Planes de acción" },
  { to: "/sst?tab=inspecciones", label: "Inspecciones" },
  { to: "/sst?tab=hallazgos", label: "Hallazgos y acciones" },
  { to: "/sst?tab=accidentes", label: "Accidentes" },
  { to: "/sst?tab=indicadores", label: "Indicadores" },
];

const repositorioLinks = [
  { to: "/repositorio", label: "Ver documentos" },
  { to: "/repositorio/subir", label: "Subir documentos" },
];

function hasAnyPermission(permissions: string[] | undefined, required: readonly string[]) {
  return required.some((permission) => permissions?.includes(permission) === true);
}

export default function MainLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { empresasDisponibles, empresaId, empresaActual, organizacionActual, isLoading, setEmpresaActual, hasModule } = useCompanyContext();
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [logoFallback, setLogoFallback] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const canAccessAdmin = user?.roles.includes("ADMINISTRADOR") === true;
  const displayName = user?.name ?? "Usuario";
  const roleLabel = user?.roles?.[0] ?? "Usuario";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
  const permissions = user?.permissions ?? [];
  const gestorOperationalOnly = isGestorOnly(user);
  const canSeeDashboard = hasModule("DASHBOARD") && canAccessDashboard(user);
  const canSeePersonal = hasModule("PERSONAL") && permissions.includes("vinculaciones.read");
  const visibleNominaLinks = nominaLinks.filter((link) => {
    if (gestorOperationalOnly && !["/nomina/cobertura", "/nomina/turnos", "/nomina/novedades"].includes(link.to)) return false;
    return hasAnyPermission(permissions, link.requiredPermissions);
  });
  const canSeeNomina = hasModule("NOMINA") && visibleNominaLinks.length > 0;
  const canSeeCobertura = hasModule("COBERTURA") && (permissions.includes("cobertura.read") || permissions.includes("cobertura.update"));
  const canSeeNotifications = permissions.includes("notificaciones.read");
  const canSeeSst = hasModule("SST") && permissions.some((permission) => permission.startsWith("sst."));
  const canSeePortal = hasModule("PORTAL_COLABORADOR");
  const canSeeRepositorio = hasModule("REPOSITORIO") && permissions.some((permission) => permission.startsWith("documentos."));
  const homePath = canSeeDashboard
    ? "/dashboard"
    : canSeeNomina
      ? (user?.roles.includes("GESTOR") && permissions.includes("nomina.operativa.read") ? "/nomina/cobertura" : "/nomina")
      : canSeePersonal
        ? "/personal"
        : canSeePortal
          ? "/portal"
          : "/dashboard";
  const logoSrc =
    theme === "dark"
      ? "/branding/empiria-logo-horizontal-dark-web.png"
      : "/branding/empiria-logo-horizontal-light-web.png";

  useEffect(() => {
    setLogoFallback(false);
  }, [logoSrc]);

  useEffect(() => {
    let cancelled = false;

    async function loadUnreadCount() {
      if (!canSeeNotifications) {
        setUnreadCount(0);
        return;
      }

      try {
        const total = await notificacionesApi.countUnreadMine();
        if (!cancelled) {
          setUnreadCount(total);
        }
      } catch {
        if (!cancelled) {
          setUnreadCount(0);
        }
      }
    }

    void loadUnreadCount();
    return () => {
      cancelled = true;
    };
  }, [canSeeNotifications, user?.id]);

  useEffect(() => {
    if (!canSeeNotifications && notifOpen) {
      setNotifOpen(false);
    }
  }, [canSeeNotifications, notifOpen]);

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
        <Link to={homePath} className="logo-area logo-link" aria-label="Empiria">
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
          {canSeeDashboard && <NavLink
            to="/dashboard"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Dashboard
          </NavLink>}
          {canSeePersonal && <NavLink
            to="/personal"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Personal
          </NavLink>}
          {canSeeNomina && <NavDropdown label={"Nómina"} links={visibleNominaLinks} />}
          {canSeeCobertura && <NavDropdown label="Herramientas" links={herramientasLinks} />}
          {canSeeSst && <NavDropdown label="SST" links={sstLinks} />}
          {canSeePortal && <NavLink
            to="/portal"
            className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
          >
            Portal
          </NavLink>}
          {canSeeRepositorio && <NavDropdown label="Repositorio" links={repositorioLinks} />}
          {canAccessAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `menu-navlink${isActive ? " active" : ""}`}
            >
              Administración
            </NavLink>
          )}
        </nav>

        <div className="right-side">
          {canSeeNotifications && (
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
          )}

          <button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {empresasDisponibles.length > 1 && (
            <label className="company-context-control" title={empresaActual?.nombre_empresa ?? "Empresa activa"}>
              <Building2 size={16} aria-hidden="true" />
              <select
                value={empresaId ?? ""}
                onChange={(event) => setEmpresaActual(event.target.value ? Number(event.target.value) : null)}
                disabled={isLoading}
                aria-label="Empresa activa"
              >
                {empresasDisponibles.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          )}

          {empresasDisponibles.length === 1 && empresaActual && (
            <div
              className="company-context-control"
              title={organizacionActual?.nombre ?? empresaActual.nombre_empresa}
              aria-label="Empresa activa"
            >
              <Building2 size={16} aria-hidden="true" />
              <span>{empresaActual.nombre_empresa}</span>
            </div>
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
                )}
                <button type="button" className="account-menu-item" role="menuitem" aria-expanded={accountDetailsOpen} onClick={() => setAccountDetailsOpen((open) => !open)}>
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

      {canSeeNotifications && notifOpen && (
        <NotificationsPanel
          onClose={() => setNotifOpen(false)}
          onUnreadCountChange={setUnreadCount}
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
