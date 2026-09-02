import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from '../context/AuthContext';
import { useCompanyContext } from '../context/CompanyContext';
import { canAccessDashboard, isGestorOnly } from './roleNavigation';

function canAny(permissions: string[], required: readonly string[]): boolean {
  return required.length === 0 || required.some((permission) => permissions.includes(permission));
}

function resolveFallbackPath(input: {
  hasModule: (code: string) => boolean;
  permissions: string[];
  roles: string[];
}): string {
  if (input.hasModule('NOMINA') && (input.permissions.includes('nomina.read') || input.permissions.includes('nomina.operativa.read'))) {
    return input.roles.includes('GESTOR') ? '/nomina/cobertura' : '/nomina';
  }

  if (input.hasModule('PERSONAL') && input.permissions.includes('vinculaciones.read')) {
    return '/personal';
  }

  const gestorOnly = input.roles.includes('GESTOR') && !input.roles.includes('TALENTO_HUMANO');
  if (!gestorOnly && input.hasModule('DASHBOARD') && input.permissions.includes('dashboard.read')) {
    return '/dashboard';
  }

  if (input.hasModule('PORTAL_COLABORADOR')) {
    return '/portal';
  }

  return '/dashboard';
}

export default function ModuleRoute({
  code,
  children,
  requiredPermissions = [],
  denyRoles = []
}: {
  code: string;
  children: ReactNode;
  requiredPermissions?: readonly string[];
  denyRoles?: readonly string[];
}) {
  const { user } = useAuth();
  const { empresaId, capabilities, capabilitiesLoading, hasModule } = useCompanyContext();
  const permissions = user?.permissions ?? [];
  const roles = user?.roles ?? [];
  const dashboardDenied = code === 'DASHBOARD' && (!canAccessDashboard(user) || isGestorOnly(user));

  if (!empresaId || capabilitiesLoading || !capabilities) {
    return <div className="adm-empty">Cargando configuracion empresarial...</div>;
  }

  if (dashboardDenied || !hasModule(code) || !canAny(permissions, requiredPermissions) || denyRoles.some((role) => roles.includes(role))) {
    return <Navigate to={resolveFallbackPath({ hasModule, permissions, roles })} replace />;
  }

  return children;
}
