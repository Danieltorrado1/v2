import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ModuleEntry } from '../../architecture/moduleCatalog';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { hasPermission, isGlobalAdministrator, visibleTenantModules } from '../../architecture/moduleAccess';
import { configuracionApi } from '../../services/configuracionApi';
import type { Rol } from '../../types/configuracion.types';
import { StructuralPage, ToolsPage, WorkspaceHeading } from './StructuralPage';
import { ContractOverview } from './ContractOverview';
import { EmpresaConfiguracionTab } from '../admin/ConfiguracionGeneral/tabs/EmpresaConfiguracionTab';
import { ContratosTab } from '../admin/ConfiguracionGeneral/tabs/ContratosTab';
import { CargosTab } from '../admin/ConfiguracionGeneral/tabs/CargosTab';
import { CatalogosTab } from '../admin/ConfiguracionGeneral/tabs/CatalogosTab';
import { UsuariosTab } from '../admin/ConfiguracionGeneral/tabs/UsuariosTab';
import { NominaProcesosTab } from '../admin/ConfiguracionGeneral/tabs/NominaProcesosTab';
import PortalPage from '../portal/PortalPage';
import { visiblePayrollLinks } from '../../architecture/payrollNavigation';

export function TenantHome({ moduleCode }: { moduleCode?: string } = {}) {
  const { user } = useAuth();
  const { capabilities, empresaId, isLoading, capabilitiesLoading, error, retryBootstrap } = useCompanyContext();
  if (error) return <section className="workspace-empty"><p>{error}</p><button onClick={retryBootstrap}>Reintentar</button></section>;
  if (isLoading || capabilitiesLoading || (empresaId && !capabilities)) return <section className="workspace-empty">Cargando empresa…</section>;
  const modules = visibleTenantModules(user, capabilities, empresaId).filter(module => !moduleCode || module.code === moduleCode);
  return modules.length ? <Navigate to={modules[0].route} replace /> : <section className="workspace-empty"><h1>Empresa</h1><p>No hay módulos disponibles para tu acceso actual.</p></section>;
}

export function WorkspacePage({ entry }: { entry: ModuleEntry }) {
  const { empresaId } = useCompanyContext();
  const { user } = useAuth();
  const location = useLocation();
  if (entry.target) {
    const target = entry.code === 'PERSONAL_NOMINA' ? visiblePayrollLinks(user)[0]?.to ?? '/empresa' : entry.target;
    const [pathname, query] = target.split('?');
    const params = new URLSearchParams(location.search);
    new URLSearchParams(query).forEach((value, key) => params.set(key, value));
    return <Navigate to={{ pathname, search: params.toString(), hash: location.hash }} replace />;
  }
  if (entry.view === 'personal-statistics') return <ContractOverview key={empresaId} />;
  if (entry.view === 'institutions') return <ContractOverview key={empresaId} institutions />;
  if (entry.view === 'tools') return <ToolsPage />;
  if (entry.view === 'portal') return <PortalPage />;
  if (entry.view === 'roles') return <RolesOverview />;
  const reused = entry.view === 'company-settings' ? <fieldset className="workspace-readonly-group" disabled={!isGlobalAdministrator(user) && !hasPermission(user, ['empresas.update', 'configuracion.update'])}><legend>Datos de empresa</legend><EmpresaConfiguracionTab /></fieldset>
    : entry.view === 'contracts' ? <ContratosTab companyScopeId={empresaId ?? undefined} />
    : entry.view === 'positions' ? <CargosTab />
    : entry.view === 'catalogs' ? <CatalogosTab />
    : entry.view === 'users' ? <UsuariosTab companyScopeId={empresaId ?? undefined} />
    : entry.view === 'payroll-settings' ? <NominaProcesosTab />
    : entry.view === 'areas' ? <NominaProcesosTab initialTab="areas" /> : null;
  if (reused) return <section className="workspace-page" key={empresaId}><WorkspaceHeading title={entry.label} description="Configuración de la empresa activa." />{reused}</section>;
  if (entry.view === 'requirements') return <section className="workspace-page"><WorkspaceHeading title="Requisitos documentales" description="Requisitos por cargo, tipo de contrato, proceso y modalidad." /><div className="workspace-card"><h2>Requisitos del contrato</h2><p>Consulta y administra los requisitos existentes en el expediente del contrato.</p><Link to="/configuracion/contratos">Abrir contratos y requisitos</Link></div><div className="workspace-grid">{entry.sections.map(label => <section className="workspace-card" key={label}><h3>{label}</h3><p>Configuración transversal en preparación.</p></section>)}</div></section>;
  return <StructuralPage entry={entry} />;
}

function RolesOverview() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; void configuracionApi.listarRoles().then(value => { if (live) setRoles(value); }).catch(() => { if (live) setError('No fue posible consultar los roles.'); }); return () => { live = false; }; }, []);
  return <section className="workspace-page"><WorkspaceHeading title="Roles y permisos" description="Consulta del catálogo real de roles. La edición centralizada está en configuración." />{error && <p role="alert">{error}</p>}<div className="workspace-grid">{roles.map(role => <section className="workspace-card" key={role.id}><h2>{role.nombre_rol}</h2><p>{role.descripcion ?? 'Sin descripción'}</p><span className="workspace-badge">{role.activo ? 'Activo' : 'Inactivo'}</span><details><summary>Permisos ({role.permissions.length})</summary><ul>{role.permissions.map(permission => <li key={permission}>{permission}</li>)}</ul></details></section>)}</div>{!roles.length && !error && <p className="workspace-empty">Sin roles disponibles.</p>}</section>;
}
