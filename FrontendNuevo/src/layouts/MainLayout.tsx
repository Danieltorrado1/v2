import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Bell, Building2, ChevronDown, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useCompanyContext } from "../context/CompanyContext";
import { NotificationsPanel } from "../components/notifications/NotificationsPanel";
import { notificacionesApi } from "../services/notificacionesApi";
import "./MainLayout.css";
import { promotedPersonalCodes, topbarNavigation } from "../architecture/topbarNavigation";
import { adminModules } from "../architecture/moduleCatalog";
import { isGlobalAdministrator, resolveCatalogLocation, visibleTenantModules } from "../architecture/moduleAccess";
import { WorkspaceAccess } from "../architecture/WorkspaceAccess";
import { TopbarContractContext } from "./TopbarContractSlot";
import { NavDropdown } from './NavDropdown';
import "../architecture/Workspace.css";
import { subscribeModuleVisibility } from '../services/moduleVisibilityStore';

export default function MainLayout() {
  const location = useLocation();
  const [contractSlot, setContractSlot] = useState<HTMLDivElement | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { empresasDisponibles, empresaId, empresaActual, organizacionActual, isLoading, setEmpresaActual, capabilities, hasModule } = useCompanyContext();
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const [, setVisibilityVersion] = useState(0);
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
  useEffect(() => subscribeModuleVisibility(() => setVisibilityVersion((version) => version + 1)), [empresaId]);
  const current = resolveCatalogLocation(location.pathname, location.search);
  const activeModule = adminScope ? [...adminModules].reverse().find(item => location.pathname === item.route || location.pathname.startsWith(`${item.route}/`)) : modules.find(item => item.code === current?.module.code);
  const personalModule = modules.find(item => item.code === 'PERSONAL');
  const navigation = adminScope ? modules : topbarNavigation(modules);
  const activeNavigationCode = promotedPersonalCodes.includes(current?.entry.code ?? '') ? current?.entry.code : activeModule?.code;
  const personalExtraLinks = personalModule?.children.filter(child => ![...promotedPersonalCodes, 'PERSONAL_BASE_DATOS', 'PERSONAL_REPOSITORIO'].includes(child.code)) ?? [];
  const homePath = adminScope ? '/admin-global' : modules[0]?.route ?? (legacyNavigation.PERSONAL ? '/personal' : '/');
  const displayName = user?.name ?? "Usuario";
  const roleLabel = user?.roles?.[0] ?? "Usuario";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "US";
  const permissions = user?.permissions ?? [];
  const canSeeNotifications = !adminScope && permissions.includes("notificaciones.read");
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
    <TopbarContractContext.Provider value={contractSlot}>
    <div className="layout">
      <header className="topbar">
        <Link to={homePath} className="logo-area logo-link" aria-label="Empiria">
          <span className="topbar-brand-mark"><img src="/branding/empiria-make-mark.svg" alt="" /></span>
          <span className="topbar-brand-name">Empiria</span>
        </Link>

        <nav className="menu workspace-primary-nav" aria-label={adminScope ? 'Empiria Admin' : 'Empiria Empresa'}>
          {navigation.map(item => item.children.length > 0 ? (
            <NavDropdown
              key={item.code}
              label={item.label}
              active={activeNavigationCode === item.code}
              links={item.children.map(child => ({
                to: child.route,
                label: child.label,
                active: current?.entry.code === child.code,
              }))}
            />
          ) : (
            <Link key={item.code} to={item.route} aria-current={activeNavigationCode === item.code ? 'page' : undefined}
              className={`menu-navlink${activeNavigationCode === item.code ? ' active' : ''}`}>{item.code === 'AGENDA_OPERATIVA' ? 'Agenda' : item.label}</Link>
          ))}
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

          {!adminScope && <div className="topbar-business-context">
            {empresasDisponibles.length > 1 ? (
              <select className="topbar-company" value={empresaId ?? ''} disabled={isLoading}
                aria-label="Empresa activa" title={empresaActual?.nombre_empresa}
                onChange={event => setEmpresaActual(event.target.value ? Number(event.target.value) : null)}>
                {empresasDisponibles.map(empresa => <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>)}
              </select>
            ) : empresasDisponibles.length === 1 && empresaActual && <strong className="topbar-company" title={organizacionActual?.nombre ?? empresaActual?.nombre_empresa}>{empresaActual?.nombre_empresa}</strong>}
            <div className="topbar-contract" ref={setContractSlot} />
          </div>}

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
                <div className="account-menu-heading" title={globalAdmin ? "Modo administrador global" : undefined}>
                  <span className="account-avatar account-avatar-large" aria-hidden="true">{initials}</span>
                  <div><strong>{displayName}</strong><small>{roleLabel}</small></div>
                </div>
                {globalAdmin && <Link className="account-menu-item" role="menuitem" to={adminScope ? '/empresa' : '/admin-global'} onClick={() => setAccountOpen(false)}>
                  <Building2 size={16} />{adminScope ? 'Entrar a empresa' : 'Empiria Admin'}
                </Link>}
                {personalExtraLinks.map(item => <Link key={item.code} className="account-menu-item" role="menuitem" to={item.route} onClick={() => setAccountOpen(false)}>{item.label}</Link>)}
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
        {globalAdmin && !adminScope && empresaActual && <div className="global-tenant-banner"><strong>MODO ADMINISTRADOR GLOBAL</strong><span>EMPRESA: {empresaActual.nombre_empresa}</span><Link to="/admin-global/empresas">VOLVER A EMPIRIA ADMIN</Link></div>}
        <div className={`page-scroll${["/nomina/asistencia", "/nomina/pago", "/nomina/documentos", "/nomina/gestion"].includes(location.pathname) ? " page-scroll--nomina-gestion" : ""}${location.pathname.startsWith("/nomina") ? " page-scroll--nomina-module" : ""}${location.pathname === "/nomina/planilla-operativa" ? " page-scroll--planilla-operativa" : ""}`}>
          <div className={`page-content${["/nomina/asistencia", "/nomina/pago", "/nomina/documentos", "/nomina/gestion"].includes(location.pathname) ? " page-content--nomina-gestion" : ""}${location.pathname.startsWith("/nomina") ? " page-content--nomina-module" : ""}${location.pathname === "/nomina/planilla-operativa" ? " page-content--planilla-operativa" : ""}`}>
            <WorkspaceAccess><Outlet /></WorkspaceAccess>
          </div>
        </div>
      </main>
    </div>
    </TopbarContractContext.Provider>
  );
}
