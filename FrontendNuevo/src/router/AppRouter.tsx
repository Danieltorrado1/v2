import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import ModuleRoute from "./ModuleRoute";
import LoginPage from "../pages/auth/LoginPage";
import MainLayout from "../layouts/MainLayout";
import DashboardPage from "../pages/dashboard/DashboardPage";
import OperationalPersonalPage from "../pages/personal/OperationalPersonalPage";
import ContractPersonalPage from "../pages/personal/ContractPersonalPage";
import NominaEmpleadoDetallePage from "../pages/nomina/NominaEmpleadoDetallePage";
import NominaPage from "../pages/nomina/NominaPage";
import CalculadoraSalarioPage from "../pages/herramientas/CalculadoraSalarioPage";
import CalculadoraCoberturaPage from "../pages/herramientas/CalculadoraCoberturaPage";
import CoberturaHerramientasPage from "../pages/herramientas/CoberturaHerramientasPage";
import CoberturaDashboardPage from "../pages/herramientas/CoberturaDashboardPage";
import LiquidacionPage from "../pages/nomina/LiquidacionPage";
import TurnosPage from "../pages/nomina/TurnosPage";
import PersonalOpsPage from "../pages/nomina/PersonalOpsPage";
import CorreccionNominaPage from "../pages/nomina/CorreccionNominaPage";
import CambiosOperativosPage from "../pages/nomina/CambiosOperativosPage";
import PlanillaOperativaPage from "../pages/nomina/PlanillaOperativaPage";
import NominaHubPage from "../pages/nomina/NominaHubPage";
import AjustesManualesPage from "../pages/nomina/AjustesManualesPage";
import CuentasCobroPage from "../pages/nomina/CuentasCobroPage";
import SstPage from "../pages/sst/SstPage";
import PortalPage from "../pages/portal/PortalPage";
import VerDocumentosPage from "../pages/repositorio/VerDocumentosPage";
import SubirDocumentosPage from "../pages/repositorio/SubirDocumentosPage";
import { useAuth } from "../context/AuthContext";
import { isGlobalAdministrator } from '../architecture/moduleAccess';
import { tenantEntries } from '../architecture/moduleCatalog';
import { WorkspacePage, TenantHome } from '../pages/workspace/WorkspacePage';
import { AdminDashboardPage } from '../pages/workspace/AdminDashboardPage';
import { CompaniesPage } from '../pages/workspace/CompaniesPage';
import { ModuleCatalogPage } from '../pages/workspace/ModuleCatalogPage';
import { ProductConfigurationPage } from '../pages/workspace/ProductConfigurationPage';
import { PlanesModulosTab } from '../pages/admin/ConfiguracionGeneral/tabs/PlanesModulosTab';
import { LogisticaShellPage } from '../pages/operacion/OperacionPages';
import OperacionInstitucionesFinalPage from '../pages/operacion/OperacionInstitucionesFinalPage';
import LogisticaManagementPage from '../pages/logistica/LogisticaManagementPage';
import OperacionStatsPage from '../pages/operacion/OperacionStatsPage';
import OperacionSimatFinalPage from '../pages/operacion/OperacionSimatFinalPage';
import LogisticaRemisionesFinalPage from '../pages/logistica/LogisticaRemisionesFinalPage';

function HomeRedirect() {
  const { user } = useAuth();
  return isGlobalAdministrator(user) ? <Navigate to="/admin-global" replace /> : <TenantHome />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="empresa" element={<TenantHome />} />
            <Route path="admin-global" element={<AdminDashboardPage />} />
            <Route path="admin-global/empresas" element={<CompaniesPage />} />
            <Route path="admin-global/planes" element={<section className="workspace-page"><PlanesModulosTab initialCompanyId={null} catalogOnly /></section>} />
            <Route path="admin-global/modulos" element={<ModuleCatalogPage />} />
            <Route path="admin-global/configuracion" element={<ProductConfigurationPage />} />
            {tenantEntries.filter(entry => !entry.children.length).map(entry => <Route key={entry.code} path={entry.route.slice(1)} element={<WorkspacePage entry={entry} />} />)}
            <Route path="configuracion/nomina" element={<Navigate to="/configuracion/nomina/asignaciones" replace />} />
            <Route path="operacion" element={<TenantHome moduleCode="OPERACION" />} />
            <Route path="logistica" element={<TenantHome moduleCode="LOGISTICA" />} />
            <Route path="operacion/instituciones" element={<ModuleRoute code="OPERACION" requiredPermissions={["operacion.read", "vinculaciones.read"]}><OperacionInstitucionesFinalPage /></ModuleRoute>} />
            <Route path="operacion/simat" element={<ModuleRoute code="OPERACION" requiredPermissions={["operacion.read"]}><OperacionSimatFinalPage /></ModuleRoute>} />
            <Route path="operacion/estadisticas" element={<ModuleRoute code="OPERACION" requiredPermissions={["operacion.read"]}><OperacionStatsPage /></ModuleRoute>} />
            {['reporte-diario','descuentos-semanales','planilla-final','evaluacion'].map(path => <Route key={path} path={`operacion/${path}`} element={<ModuleRoute code="OPERACION" requiredPermissions={["operacion.read"]}><LogisticaShellPage /></ModuleRoute>} />)}
            <Route path="logistica/remisiones" element={<ModuleRoute code="LOGISTICA" requiredPermissions={["logistica.read"]}><LogisticaRemisionesFinalPage /></ModuleRoute>} />
            <Route path="logistica/estadisticas" element={<ModuleRoute code="LOGISTICA" requiredPermissions={["logistica.read"]}><LogisticaManagementPage /></ModuleRoute>} />
            <Route path="logistica/historial" element={<ModuleRoute code="LOGISTICA" requiredPermissions={["logistica.read"]}><LogisticaRemisionesFinalPage /></ModuleRoute>} />
            {['historial-remisiones','inventario','bodegas','rutas','conductores','conductores-vehiculos'].map(path => <Route key={`log-${path}`} path={`logistica/${path}`} element={<ModuleRoute code="LOGISTICA" requiredPermissions={["logistica.read"]}><LogisticaManagementPage /></ModuleRoute>} />)}
            <Route path="configuracion" element={<TenantHome moduleCode="CONFIGURACION_EMPRESA" />} />
            <Route path="dashboard" element={<ModuleRoute code="DASHBOARD" requiredPermissions={["dashboard.read"]}><DashboardPage /></ModuleRoute>} />
            <Route path="personal" element={<ModuleRoute code="PERSONAL" requiredPermissions={["vinculaciones.read"]}><OperationalPersonalPage /></ModuleRoute>} />
            <Route path="nomina" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaHubPage /></ModuleRoute>} />
            <Route path="nomina/cobertura" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.operativa.read", "nomina.read"]}><PlanillaOperativaPage /></ModuleRoute>} />
            <Route path="nomina/asistencia" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/ops" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.cuentas_cobro_ops.read"]} denyRoles={["GESTOR"]}><PersonalOpsPage /></ModuleRoute>} />
            <Route path="nomina/novedades" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.operativa.read", "nomina.read"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/validacion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><PersonalOpsPage /></ModuleRoute>} />
            <Route path="nomina/pago" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/documentos" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/liquidacion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><LiquidacionPage /></ModuleRoute>} />
            <Route path="nomina/turnos" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.operativa.read"]}><TurnosPage /></ModuleRoute>} />
            <Route path="nomina/personal-ops" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.cuentas_cobro_ops.read"]} denyRoles={["GESTOR"]}><PersonalOpsPage /></ModuleRoute>} />
            <Route path="nomina/correccion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.correcciones.read"]} denyRoles={["GESTOR"]}><CorreccionNominaPage /></ModuleRoute>} />
            <Route path="nomina/cambios-operativos" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.movimientos.read"]} denyRoles={["GESTOR"]}><CambiosOperativosPage /></ModuleRoute>} />
            <Route path="nomina/planilla-operativa" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.operativa.read", "nomina.read"]}><PlanillaOperativaPage /></ModuleRoute>} />
            <Route path="nomina/gestion/:periodoId/empleado/:nominaEmpleadoId" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaEmpleadoDetallePage /></ModuleRoute>} />
            <Route path="nomina/gestion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/ajustes-manuales" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.economico.read"]} denyRoles={["GESTOR"]}><AjustesManualesPage /></ModuleRoute>} />
            <Route path="nomina/cuentas-cobro" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.movimientos.read"]}><CuentasCobroPage /></ModuleRoute>} />
            <Route path="herramientas/calculadora-salario" element={<CalculadoraSalarioPage />} />
            <Route path="herramientas/calculadora-cobertura" element={<CalculadoraCoberturaPage />} />
            <Route path="herramientas/cobertura" element={<ModuleRoute code="COBERTURA"><CoberturaDashboardPage /></ModuleRoute>} />
            <Route path="herramientas/cobertura/importaciones" element={<ModuleRoute code="COBERTURA"><CoberturaHerramientasPage /></ModuleRoute>} />
            <Route path="sst" element={<ModuleRoute code="SST"><SstPage /></ModuleRoute>} />
            <Route path="sst/incidentes" element={<Navigate to="/sst?tab=eventos" replace />} />
            <Route path="sst/riesgos" element={<Navigate to="/sst?tab=inspecciones" replace />} />
            <Route path="sst/capacitaciones" element={<Navigate to="/sst?tab=planes" replace />} />
            <Route path="sst/examenes-medicos" element={<Navigate to="/sst?tab=accidentes" replace />} />
            <Route path="sst/epp" element={<Navigate to="/sst?tab=hallazgos" replace />} />
            <Route path="sst/indicadores" element={<Navigate to="/sst?tab=indicadores" replace />} />
            <Route path="portal" element={<ModuleRoute code="PORTAL_COLABORADOR"><PortalPage /></ModuleRoute>} />
            <Route path="administracion/vinculaciones" element={<ContractPersonalPage />} />
            <Route path="vinculaciones" element={<Navigate to="/administracion/vinculaciones" replace />} />
            <Route path="repositorio" element={<ModuleRoute code="REPOSITORIO"><VerDocumentosPage /></ModuleRoute>} />
            <Route path="repositorio/subir" element={<ModuleRoute code="REPOSITORIO"><SubirDocumentosPage /></ModuleRoute>} />
            <Route path="admin" element={<Navigate to="/admin-global/empresas" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
