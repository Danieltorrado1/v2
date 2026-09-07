import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompanyContext } from '../context/CompanyContext';
import { canAccessEntry, isGlobalAdministrator, resolveCatalogLocation } from './moduleAccess';

export function WorkspaceAccess({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const { empresaId, capabilities, capabilitiesLoading, isLoading, error, retryBootstrap } = useCompanyContext();
  if (pathname.startsWith('/admin-global')) {
    return isGlobalAdministrator(user) ? children : <AccessDenied />;
  }
  if (pathname === '/admin' && !isGlobalAdministrator(user)) return <AccessDenied />;
  const current = resolveCatalogLocation(pathname, search);
  if (!current) return children;
  if (error) return <section className="workspace-empty" role="alert"><p>{error}</p><button onClick={retryBootstrap}>Reintentar</button></section>;
  if (isLoading || capabilitiesLoading) return <section className="workspace-empty">Cargando acceso de empresa…</section>;
  if (!empresaId) return <section className="workspace-empty">Selecciona una empresa autorizada para continuar.</section>;
  if (!capabilities || Number(capabilities.empresa.id) !== empresaId) return <section className="workspace-empty">Cargando módulos de la empresa…</section>;
  return canAccessEntry(current.entry, user, capabilities.modulos, current.entry === current.module ? undefined : current.module)
    ? children : <AccessDenied />;
}

export function AccessDenied() {
  return <section className="workspace-empty" role="alert"><h1>Acceso no disponible</h1><p>Esta sección no está habilitada para tu empresa o no tienes el permiso necesario.</p></section>;
}
