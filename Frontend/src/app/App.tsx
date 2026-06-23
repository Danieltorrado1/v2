import { useState } from "react";
import type { ModuleId } from "./components/moduleTypes";
import { TopNav } from "./components/TopNav";
import { LoginScreen } from "./components/LoginScreen";
import { DashboardHome } from "./components/DashboardHome";
import { OperariosModule } from "./components/OperariosModule";
import { NominaModule } from "./components/NominaModule";
import { NovedadesModule } from "./components/NovedadesModule";
import { SSTModule } from "./components/SSTModule";
import { DocumentosModule } from "./components/DocumentosModule";
import { ColaboradoresModule } from "./components/ColaboradoresModule";
import { ConfiguracionModule } from "./components/ConfiguracionModule";
import { EmpresaModule } from "./components/EmpresaModule";
import { PlaceholderModule } from "./components/PlaceholderModule";
import { getToken, logout } from "../services/authApi";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  function renderModule() {
    switch (activeModule) {
      case "dashboard":     return <DashboardHome />;
      case "operarios":     return <OperariosModule />;
      case "nomina":        return <NominaModule />;
      case "novedades":     return <NovedadesModule />;
      case "sst":           return <SSTModule />;
      case "documentos":    return <DocumentosModule />;
      case "colaboradores": return <ColaboradoresModule />;
      case "configuracion": return <ConfiguracionModule />;
      case "empresa":       return <EmpresaModule />;
      case "equipo-minimo": return <PlaceholderModule title="Equipo Mínimo"          description="Gestión del personal mínimo requerido por contrato o institución educativa" />;
      case "calculadora":   return <PlaceholderModule title="Calculadora"             description="Herramienta de cálculo para liquidaciones y costos de nómina" />;
      case "cobertura":     return <PlaceholderModule title="Cobertura PAE"           description="Seguimiento de cobertura del programa de alimentación por municipio" />;
      case "dotacion":      return <PlaceholderModule title="Gestión Dotación"        description="Control de entrega de dotación y elementos de trabajo" />;
      case "repositorio":   return <PlaceholderModule title="Repositorio HV"          description="Repositorio de hojas de vida y documentación de empleados" />;
      case "evaluacion":    return <PlaceholderModule title="Evaluación TH"           description="Módulo de evaluación de desempeño por municipios asignados" />;
      default:              return <DashboardHome />;
    }
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <TopNav activeModule={activeModule} onModuleChange={setActiveModule} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        {renderModule()}
      </main>
    </div>
  );
}
