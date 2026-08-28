import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import ModuleRoute from "./ModuleRoute";
import LoginPage from "../pages/auth/LoginPage";
import MainLayout from "../layouts/MainLayout";
import DashboardPage from "../pages/dashboard/DashboardPage";
import OperationalPersonalPage from "../pages/personal/OperationalPersonalPage";
import ContractPersonalPage from "../pages/personal/ContractPersonalPage";
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
import SstPage from "../pages/sst/SstPage";
import PortalPage from "../pages/portal/PortalPage";
import AdminPage from "../pages/admin/AdminPage";
import VerDocumentosPage from "../pages/repositorio/VerDocumentosPage";
import SubirDocumentosPage from "../pages/repositorio/SubirDocumentosPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="personal" element={<ModuleRoute code="PERSONAL" requiredPermissions={["vinculaciones.read"]}><OperationalPersonalPage /></ModuleRoute>} />
            <Route path="nomina" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaHubPage /></ModuleRoute>} />
            <Route path="nomina/cobertura" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]}><PlanillaOperativaPage /></ModuleRoute>} />
            <Route path="nomina/asistencia" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/ops" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.cuentas_cobro_ops.read"]}><PersonalOpsPage /></ModuleRoute>} />
            <Route path="nomina/novedades" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/validacion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]}><PersonalOpsPage /></ModuleRoute>} />
            <Route path="nomina/pago" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/documentos" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
            <Route path="nomina/liquidacion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><LiquidacionPage /></ModuleRoute>} />
            <Route path="nomina/turnos" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.operativa.read"]}><TurnosPage /></ModuleRoute>} />
            <Route path="nomina/personal-ops" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.cuentas_cobro_ops.read"]}><PersonalOpsPage /></ModuleRoute>} />
            <Route path="nomina/correccion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.correcciones.read"]} denyRoles={["GESTOR"]}><CorreccionNominaPage /></ModuleRoute>} />
            <Route path="nomina/cambios-operativos" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.movimientos.read"]} denyRoles={["GESTOR"]}><CambiosOperativosPage /></ModuleRoute>} />
            <Route path="nomina/planilla-operativa" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]}><PlanillaOperativaPage /></ModuleRoute>} />
            <Route path="nomina/gestion" element={<ModuleRoute code="NOMINA" requiredPermissions={["nomina.read"]} denyRoles={["GESTOR"]}><NominaPage /></ModuleRoute>} />
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
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
