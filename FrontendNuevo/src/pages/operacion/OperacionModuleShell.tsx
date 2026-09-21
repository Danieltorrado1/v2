import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { visibleTenantModules } from '../../architecture/moduleAccess';
import './OperacionModuleShell.css';
import { operationTabs } from './operacionNavigation';

export function getOperationTabAccess(user: { roles: string[]; permissions: string[] } | null | undefined, capabilities: Parameters<typeof visibleTenantModules>[1], empresaId: number | null) {
  const operation = visibleTenantModules(user, capabilities, empresaId).find((module) => module.code === 'OPERACION');
  const allowed = operation?.children.map((entry) => entry.code) ?? [];
  return operationTabs.filter((tab) => allowed.includes(tab.code));
}

export default function OperacionModuleShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { empresaId, capabilities } = useCompanyContext();
  const tabs = getOperationTabAccess(user, capabilities, empresaId);
  const active = tabs.find((tab) => location.pathname === tab.route);

  if (!tabs.length) {
    return <section className="operacion-access-denied" role="status"><h1>Acceso denegado</h1><p>No tienes permisos para acceder a Operación.</p></section>;
  }
  if (location.pathname === '/operacion') return <Navigate to={tabs[0].route} replace />;

  return <section className="operacion-module-shell" aria-label="Módulo Operación">
    <nav className="operacion-tabs" aria-label="Secciones de Operación">
      {tabs.map((tab) => <Link key={tab.code} to={tab.route} className={active?.code === tab.code ? 'active' : undefined} aria-current={active?.code === tab.code ? 'page' : undefined}>{tab.label}</Link>)}
    </nav>
    <div className="operacion-module-content">{children ?? <Outlet />}</div>
  </section>;
}
