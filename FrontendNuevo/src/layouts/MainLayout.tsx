import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Bell, Building2, ChevronDown, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useCompanyContext } from "../context/CompanyContext";
import { NotificationsPanel } from "../components/notifications/NotificationsPanel";
import { notificacionesApi } from "../services/notificacionesApi";
import "./MainLayout.css";
import { adminModules } from "../architecture/moduleCatalog";
import { isGlobalAdministrator, resolveCatalogLocation, visibleTenantModules } from "../architecture/moduleAccess";
import { WorkspaceAccess } from "../architecture/WorkspaceAccess";
import { visiblePayrollLinks } from "../architecture/payrollNavigation";
import { NavDropdown } from './NavDropdown';
import "../architecture/Workspace.css";

export default function MainLayout() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { empresasDisponibles, empresaId, empresaActual, organizacionActual, isLoading, setEmpresaActual, capabilities, hasModule } = useCompanyContext();
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [logoFallback, setLogoFallback] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const globalAdmin = isGlobalAdministrator(user);
  // Keep the legacy capability adapter available while all navigation is catalog-driven.
  const legacyNavigation = {
    PERSONAL: hasModule("PERSONAL"),
    NOMINA: hasModule("NOMINA"),
    COBERTURA: hasModule("COBERTURA"),
    SST: hasModule("SST"),
    REPOSITORIO: hasModule("REPOSITORIO"),
  };
  const adminScope = location.pathname.startsWith('/admin-global');
  const modules = adminScope ? (globalAdmin ? adminModules : []) : visibleTenantModules(user, capabilities, empresaId);
  const current = resolveCatalogLocation(location.pathname, location.search);
  const activeModule = adminScope ? [...adminModules].reverse().find(item => location.pathname === item.route || location.pathname.startsWith(`${item.route}/`)) : modules.find(item => item.code === current?.module.code);
  const homePath = adminScope ? '/admin-global' : modules[0]?.route ?? (legacyNavigation.PERSONAL ? '/personal' : '/');
  const displayName = user?.name ?? "Usuario";
  const roleLabel = user?.roles?.[0] ?? "Usuario";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
  const permissions = user?.permissions ?? [];
  const canSeeNotifications = !adminScope && permissions.includes("notificaciones.read");
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

        <nav className="menu workspace-primary-nav" aria-label={adminScope ? 'Empiria Admin' : 'Empiria Empresa'}>
          {modules.map(item => <Link key={item.code} to={item.route} aria-current={activeModule?.code === item.code ? 'page' : undefined}
            className={`menu-navlink${activeModule?.code === item.code ? ' active' : ''}`}>{item.label}</Link>)}
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

          {!adminScope && empresasDisponibles.length > 1 && (
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

          {!adminScope && empresasDisponibles.length === 1 && empresaActual && (
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
                {globalAdmin && <Link className="account-menu-item" role="menuitem" to={adminScope ? '/empresa' : '/admin-global'} onClick={() => setAccountOpen(false)}>
                  <Building2 size={16} />{adminScope ? 'Entrar a empresa' : 'Empiria Admin'}
                </Link>}
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

      <main className="content content--workspace">
        {!adminScope && activeModule && <nav className="workspace-secondary-nav" aria-label={`Submódulos de ${activeModule.label}`}>
          <span className="workspace-scope">{activeModule.label}</span>
          {activeModule.children.map(item => <Link key={item.code} to={item.route} aria-current={current?.entry.code === item.code ? 'page' : undefined}
            className={current?.entry.code === item.code ? 'active' : ''}>{item.label}</Link>)}
          {current?.entry.code === 'PERSONAL_NOMINA' && activeModule.children.some(item => item.code === 'PERSONAL_NOMINA') &&
            <NavDropdown label="Opciones de nómina" links={visiblePayrollLinks(user)} />}
        </nav>}
        <div className={`page-scroll${["/nomina/asistencia", "/nomina/pago", "/nomina/documentos", "/nomina/gestion"].includes(location.pathname) ? " page-scroll--nomina-gestion" : ""}`}>
          <div className={`page-content${["/nomina/asistencia", "/nomina/pago", "/nomina/documentos", "/nomina/gestion"].includes(location.pathname) ? " page-content--nomina-gestion" : ""}`}>
            <WorkspaceAccess><Outlet /></WorkspaceAccess>
          </div>
        </div>
      </main>
    </div>
  );
}
