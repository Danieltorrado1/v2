import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import LoginPage from "../pages/auth/LoginPage";
import MainLayout from "../layouts/MainLayout";
import DashboardPage from "../pages/dashboard/DashboardPage";
import PersonalPage from "../pages/personal/PersonalPage";
import NominaPage from "../pages/nomina/NominaPage";
import CalculadoraSalarioPage from "../pages/herramientas/CalculadoraSalarioPage";
import CalculadoraCoberturaPage from "../pages/herramientas/CalculadoraCoberturaPage";
import CoberturaHerramientasPage from "../pages/herramientas/CoberturaHerramientasPage";
import LiquidacionPage from "../pages/nomina/LiquidacionPage";
import TurnosPage from "../pages/nomina/TurnosPage";
import PersonalOpsPage from "../pages/nomina/PersonalOpsPage";
import CorreccionNominaPage from "../pages/nomina/CorreccionNominaPage";
import SstPage from "../pages/sst/SstPage";
import IncidentesPage from "../pages/sst/IncidentesPage";
import RiesgosPage from "../pages/sst/RiesgosPage";
import CapacitacionesPage from "../pages/sst/CapacitacionesPage";
import ExamenesMedicosPage from "../pages/sst/ExamenesMedicosPage";
import EppPage from "../pages/sst/EppPage";
import IndicadoresPage from "../pages/sst/IndicadoresPage";
import PortalPage from "../pages/portal/PortalPage";
import AdminPage from "../pages/admin/AdminPage";
import VerDocumentosPage from "../pages/repositorio/VerDocumentosPage";
import SubirDocumentosPage from "../pages/repositorio/SubirDocumentosPage";
import VinculacionesPage from "../pages/vinculaciones/VinculacionesPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="personal" element={<PersonalPage />} />
            <Route path="nomina" element={<NominaPage />} />
            <Route path="nomina/liquidacion" element={<LiquidacionPage />} />
            <Route path="nomina/turnos" element={<TurnosPage />} />
            <Route path="nomina/personal-ops" element={<PersonalOpsPage />} />
            <Route path="nomina/correccion" element={<CorreccionNominaPage />} />
            <Route path="herramientas/calculadora-salario" element={<CalculadoraSalarioPage />} />
            <Route path="herramientas/calculadora-cobertura" element={<CalculadoraCoberturaPage />} />
            <Route path="herramientas/cobertura" element={<CoberturaHerramientasPage />} />
            <Route path="sst" element={<SstPage />} />
            <Route path="sst/incidentes" element={<IncidentesPage />} />
            <Route path="sst/riesgos" element={<RiesgosPage />} />
            <Route path="sst/capacitaciones" element={<CapacitacionesPage />} />
            <Route path="sst/examenes-medicos" element={<ExamenesMedicosPage />} />
            <Route path="sst/epp" element={<EppPage />} />
            <Route path="sst/indicadores" element={<IndicadoresPage />} />
            <Route path="portal" element={<PortalPage />} />
            <Route path="vinculaciones" element={<VinculacionesPage />} />
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
