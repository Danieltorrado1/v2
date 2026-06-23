import { useState } from "react";
import type { ModuleId } from "./components/moduleTypes";
import { TopNav } from "./components/TopNav";
import { LoginScreen } from "./components/LoginScreen";
import { DashboardHome } from "./components/DashboardHome";
import { OperariosModule } from "./components/OperariosModule";
import { NominaModule } from "./components/NominaModule";
import { NovedadesModule } from "./components/NovedadesModule";
import { SSTModule } from "./components/SSTModule";
import { DocumentosModule, type PersonaFilterChip } from "./components/DocumentosModule";
import { RepositorioModule } from "./components/RepositorioModule";
import { ColaboradoresModule } from "./components/ColaboradoresModule";
import { ConfiguracionModule } from "./components/ConfiguracionModule";
import { EmpresaModule } from "./components/EmpresaModule";
import { PlaceholderModule } from "./components/PlaceholderModule";
import { getToken, logout } from "../services/authApi";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [documentosPersonaFilter, setDocumentosPersonaFilter] = useState<PersonaFilterChip | null>(null);

  function handleLogout() {
    logout();
    setIsAuthenticated(false);
  }

  // Navegación normal por el nav: nunca arrastra un filtro de persona obsoleto.
  function handleModuleChange(id: ModuleId) {
    setDocumentosPersonaFilter(null);
    setActiveModule(id);
  }

  // "Ver documentos" desde el Expediente 360 de Operarios: abre Documentos
  // pre-filtrado para esa persona.
  function handleVerDocumentos(personaId: number, personaNombre: string) {
    setDocumentosPersonaFilter({ id: personaId, nombre: personaNombre });
    setActiveModule("documentos");
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  function renderModule() {
    switch (activeModule) {
      case "dashboard":     return <DashboardHome />;
      case "operarios":     return <OperariosModule onVerDocumentos={handleVerDocumentos} />;
      case "nomina":        return <NominaModule />;
      case "novedades":     return <NovedadesModule />;
      case "sst":           return <SSTModule />;
      case "documentos":    return <DocumentosModule initialPersonaFilter={documentosPersonaFilter} />;
      case "repositorio":   return <RepositorioModule />;
      case "colaboradores": return <ColaboradoresModule />;
      case "configuracion": return <ConfiguracionModule />;
      case "empresa":       return <EmpresaModule />;
      case "equipo-minimo": return <PlaceholderModule title="Equipo Mínimo"          description="Gestión del personal mínimo requerido por contrato o institución educativa" />;
      case "calculadora":   return <PlaceholderModule title="Calculadora"             description="Herramienta de cálculo para liquidaciones y costos de nómina" />;
      case "cobertura":     return <PlaceholderModule title="Cobertura PAE"           description="Seguimiento de cobertura del programa de alimentación por municipio" />;
      case "dotacion":      return <PlaceholderModule title="Gestión Dotación"        description="Control de entrega de dotación y elementos de trabajo" />;
      case "evaluacion":    return <PlaceholderModule title="Evaluación TH"           description="Módulo de evaluación de desempeño por municipios asignados" />;
      default:              return <DashboardHome />;
    }
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <TopNav activeModule={activeModule} onModuleChange={handleModuleChange} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        {renderModule()}
      </main>
    </div>
  );
}
