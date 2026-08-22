import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
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
            <Route path="personal" element={<OperationalPersonalPage />} />
            <Route path="nomina" element={<NominaPage />} />
            <Route path="nomina/liquidacion" element={<LiquidacionPage />} />
            <Route path="nomina/turnos" element={<TurnosPage />} />
            <Route path="nomina/personal-ops" element={<PersonalOpsPage />} />
            <Route path="nomina/correccion" element={<CorreccionNominaPage />} />
            <Route path="herramientas/calculadora-salario" element={<CalculadoraSalarioPage />} />
            <Route path="herramientas/calculadora-cobertura" element={<CalculadoraCoberturaPage />} />
            <Route path="herramientas/cobertura" element={<CoberturaDashboardPage />} />
            <Route path="herramientas/cobertura/importaciones" element={<CoberturaHerramientasPage />} />
            <Route path="sst" element={<SstPage />} />
            <Route path="sst/incidentes" element={<Navigate to="/sst?tab=eventos" replace />} />
            <Route path="sst/riesgos" element={<Navigate to="/sst?tab=inspecciones" replace />} />
            <Route path="sst/capacitaciones" element={<Navigate to="/sst?tab=planes" replace />} />
            <Route path="sst/examenes-medicos" element={<Navigate to="/sst?tab=accidentes" replace />} />
            <Route path="sst/epp" element={<Navigate to="/sst?tab=hallazgos" replace />} />
            <Route path="sst/indicadores" element={<Navigate to="/sst?tab=indicadores" replace />} />
            <Route path="portal" element={<PortalPage />} />
            <Route path="administracion/vinculaciones" element={<ContractPersonalPage />} />
            <Route path="vinculaciones" element={<Navigate to="/administracion/vinculaciones" replace />} />
            <Route path="repositorio" element={<VerDocumentosPage />} />
            <Route path="repositorio/subir" element={<SubirDocumentosPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
