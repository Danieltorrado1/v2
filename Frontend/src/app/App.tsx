import { useEffect, useState } from "react";
import type { ModuleId } from "./components/moduleTypes";
import { TopNav, type TenantSelection } from "./components/TopNav";
import { LoginScreen } from "./components/LoginScreen";
import { DashboardHome } from "./components/DashboardHome";
import { OperariosModule } from "./components/OperariosModule";
import { NominaModule } from "./components/NominaModule";
import { NovedadesModule } from "./components/NovedadesModule";
import { SSTModule } from "./components/SSTModule";
import { EvaluacionesModule } from "./components/EvaluacionesModule";
import { CoberturaModule } from "./components/CoberturaModule";
import { DocumentosModule, type PersonaFilterChip } from "./components/DocumentosModule";
import { RepositorioModule } from "./components/RepositorioModule";
import { ColaboradoresModule } from "./components/ColaboradoresModule";
import { ConfiguracionModule } from "./components/ConfiguracionModule";
import { EmpresaModule } from "./components/EmpresaModule";
import { PlaceholderModule } from "./components/PlaceholderModule";
import { fetchCurrentUser, getStoredUser, getToken, logout, type AuthUser } from "../services/authApi";
import {
  tenantApi,
  resolveInitialTenantSelection,
  setStoredEmpresaId,
  setStoredContratoId,
  type TenantEmpresa,
  type TenantContrato,
} from "../services/tenantApi";

// Usado únicamente si GET /tenant/me falla (sin red, sin permisos, etc.).
const FALLBACK_EMPRESA_ID = 1;
const FALLBACK_CONTRATO_ID = 3;

interface TenantState {
  status: "loading" | "real" | "fallback";
  empresas: TenantEmpresa[];
  contratos: TenantContrato[];
  empresaId: number | null;
  contratoId: number | null;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [documentosPersonaFilter, setDocumentosPersonaFilter] = useState<PersonaFilterChip | null>(null);

  const [tenant, setTenant] = useState<TenantState>({
    status: "loading",
    empresas: [],
    contratos: [],
    empresaId: null,
    contratoId: null,
  });

  // Identidad real: si ya hay token pero no se conserva el usuario en memoria
  // (recarga de página), se refresca contra /auth/me en vez de mostrar algo inventado.
  useEffect(() => {
    if (!isAuthenticated || user) return;
    let active = true;
    fetchCurrentUser()
      .then(profile => { if (active) setUser(profile); })
      .catch(error => console.warn("[auth] GET /auth/me falló, sin identidad real disponible:", error));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Tenant real: empresas/contratos del usuario autenticado. Si hay una empresa/
  // contrato guardados en localStorage y siguen siendo válidos para este usuario,
  // se respetan; si no, se usa la empresa/contrato por defecto que sugiere el
  // backend. Si la empresa resuelta no tiene contratos, contratoId queda en null
  // (el selector del TopNav ya muestra "Sin contratos" en ese caso).
  // Si /tenant/me falla, se usa el fallback histórico (empresa 1 / contrato 3).
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    tenantApi.getMe()
      .then(result => {
        if (!active) return;
        const { empresaId, contratoId } = resolveInitialTenantSelection(result);
        setTenant({
          status: "real",
          empresas: result.empresas,
          contratos: result.contratos,
          empresaId,
          contratoId,
        });
        setStoredEmpresaId(empresaId);
        setStoredContratoId(contratoId);
      })
      .catch(error => {
        if (!active) return;
        console.warn("[tenant] GET /tenant/me falló, usando contexto por defecto:", error);
        setTenant({
          status: "fallback",
          empresas: [],
          contratos: [],
          empresaId: FALLBACK_EMPRESA_ID,
          contratoId: FALLBACK_CONTRATO_ID,
        });
      });
    return () => { active = false; };
  }, [isAuthenticated]);

  function handleLoginSuccess(profile: AuthUser) {
    setUser(profile);
    setIsAuthenticated(true);
  }

  // Decisión documentada (Fase Final 1 — Parte B): el logout limpia token y
  // usuario, pero NO borra empiria_empresa_id/empiria_contrato_id de localStorage.
  // La selección de empresa/contrato se trata como una preferencia del navegador,
  // no como dato de sesión: en el próximo login (mismo usuario o uno distinto) se
  // vuelve a validar contra /tenant/me (ver resolveInitialTenantSelection), así
  // que un valor que ya no aplique para el siguiente usuario simplemente se
  // descarta y cae al default — conservarlo no tiene riesgo y evita reiniciar la
  // selección en cada logout/login del mismo usuario.
  function handleLogout() {
    logout();
    setIsAuthenticated(false);
    setUser(null);
    setTenant({ status: "loading", empresas: [], contratos: [], empresaId: null, contratoId: null });
  }

  function handleTenantChange(empresaId: number | null, contratoId: number | null) {
    setTenant(prev => ({ ...prev, empresaId, contratoId }));
    setStoredEmpresaId(empresaId);
    setStoredContratoId(contratoId);
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
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const empresaId = tenant.empresaId ?? undefined;
  const contratoId = tenant.contratoId ?? undefined;

  function renderModule() {
    switch (activeModule) {
      case "dashboard":     return <DashboardHome empresaId={empresaId} contratoId={contratoId} />;
      case "operarios":     return <OperariosModule empresaId={empresaId} contratoId={contratoId} onVerDocumentos={handleVerDocumentos} />;
      case "nomina":        return <NominaModule empresaId={empresaId} contratoId={contratoId} />;
      case "novedades":     return <NovedadesModule />;
      case "sst":           return <SSTModule empresaId={empresaId} contratoId={contratoId} />;
      case "documentos":    return <DocumentosModule empresaId={empresaId} contratoId={contratoId} initialPersonaFilter={documentosPersonaFilter} />;
      case "repositorio":   return <RepositorioModule empresaId={empresaId} contratoId={contratoId} />;
      case "colaboradores": return <ColaboradoresModule />;
      case "configuracion": return <ConfiguracionModule />;
      case "empresa":       return <EmpresaModule />;
      case "equipo-minimo": return <PlaceholderModule title="Equipo Mínimo"          description="Gestión del personal mínimo requerido por contrato o institución educativa" />;
      case "calculadora":   return <PlaceholderModule title="Calculadora"             description="Herramienta de cálculo para liquidaciones y costos de nómina" />;
      case "cobertura":     return <CoberturaModule contratoId={contratoId} />;
      case "dotacion":      return <PlaceholderModule title="Gestión Dotación"        description="Control de entrega de dotación y elementos de trabajo" />;
      case "evaluacion":    return <EvaluacionesModule empresaId={empresaId} contratoId={contratoId} />;
      default:              return <DashboardHome empresaId={empresaId} contratoId={contratoId} />;
    }
  }

  const tenantSelection: TenantSelection = {
    status: tenant.status,
    empresas: tenant.empresas,
    contratos: tenant.contratos,
    empresaId: tenant.empresaId,
    contratoId: tenant.contratoId,
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-background"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <TopNav
        activeModule={activeModule}
        onModuleChange={handleModuleChange}
        onLogout={handleLogout}
        user={user}
        tenant={tenantSelection}
        onTenantChange={handleTenantChange}
      />
      <main className="flex-1 overflow-y-auto">
        {renderModule()}
      </main>
    </div>
  );
}
