import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getTenantContext } from "../services/tenantApi";
import type { TenantContext } from "../types/configuracion.types";
import type { Organizacion, TenantContextEmpresa } from "../types/configuracion.types";
import { useAuth } from "./AuthContext";
import { pickAuthorizedCompanyId } from "./companyScope";
import { saasApi, type EmpresaCapabilities } from "../services/saasApi";

type CompanyContextValue = {
  empresasDisponibles: TenantContextEmpresa[];
  empresaActual: TenantContextEmpresa | null;
  organizacionActual: Organizacion | null;
  loading: boolean;
  error: string | null;
  setEmpresaActual: (empresaId: number | null) => void;
  empresas: TenantContextEmpresa[];
  empresaId: number | null;
  empresaActiva: TenantContextEmpresa | null;
  isLoading: boolean;
  setEmpresaId: (empresaId: number | null) => void;
  capabilities: EmpresaCapabilities | null;
  capabilitiesLoading: boolean;
  hasModule: (code: string) => boolean;
  retryBootstrap: () => void;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);
const STORAGE_KEY = "empiria_empresa_id";
let tenantContextInFlight: Promise<TenantContext> | null = null;
const capabilitiesInFlight = new Map<number, Promise<EmpresaCapabilities>>();

function loadTenantContextOnce(): Promise<TenantContext> {
  if (!tenantContextInFlight) {
    tenantContextInFlight = getTenantContext().finally(() => { tenantContextInFlight = null; });
  }
  return tenantContextInFlight;
}

function loadCapabilitiesOnce(empresaId: number): Promise<EmpresaCapabilities> {
  const existing = capabilitiesInFlight.get(empresaId);
  if (existing) return existing;
  const request = saasApi.capabilities(empresaId).finally(() => capabilitiesInFlight.delete(empresaId));
  capabilitiesInFlight.set(empresaId, request);
  return request;
}

function companyBootstrapError(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null && 'status' in value && Number((value as { status?: unknown }).status) === 429) {
    return 'RATE_LIMITED: Se alcanzó temporalmente el límite de solicitudes. Puedes reintentar.';
  }
  return value instanceof Error ? value.message : fallback;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [empresasDisponibles, setEmpresasDisponibles] = useState<TenantContextEmpresa[]>([]);
  const [empresaId, setEmpresaIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<EmpresaCapabilities | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [retryAfterUntil, setRetryAfterUntil] = useState(0);
  const retryTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setEmpresasDisponibles([]);
      setEmpresaIdState(null);
      setCapabilities(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadTenantContextOnce()
      .then((context) => {
        if (cancelled) {
          return;
        }

        const nextCompanies = context.empresas ?? [];
        const stored = Number(window.localStorage.getItem(STORAGE_KEY));
        const defaultEmpresaId = pickAuthorizedCompanyId(
          nextCompanies,
          Number.isInteger(stored) ? stored : null,
          context.empresa_default_id,
        );

        setEmpresasDisponibles(nextCompanies);
        setEmpresaIdState(defaultEmpresaId);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setEmpresasDisponibles([]);
          setEmpresaIdState(null);
          setError(companyBootstrapError(loadError, "No fue posible cargar el contexto empresarial."));
          const retryAfterMs = typeof loadError === 'object' && loadError !== null && 'retryAfterMs' in loadError ? Number((loadError as { retryAfterMs?: unknown }).retryAfterMs) : 0;
          if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) setRetryAfterUntil(Date.now() + retryAfterMs);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, bootstrapAttempt]);

  useEffect(() => {
    if (empresaId === null) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, String(empresaId));
  }, [empresaId]);

  useEffect(() => {
    setCapabilities(null);
    if (empresaId === null) return;
    let cancelled = false;
    setCapabilitiesLoading(true);
    void loadCapabilitiesOnce(empresaId)
      .then((value) => { if (!cancelled) setCapabilities(value); })
      .catch((value: unknown) => { if (!cancelled) { setError(companyBootstrapError(value, "No fue posible cargar módulos.")); const retryAfterMs = typeof value === 'object' && value !== null && 'retryAfterMs' in value ? Number((value as { retryAfterMs?: unknown }).retryAfterMs) : 0; if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) setRetryAfterUntil(Date.now() + retryAfterMs); } })
      .finally(() => { if (!cancelled) setCapabilitiesLoading(false); });
    return () => { cancelled = true; };
  }, [empresaId, bootstrapAttempt]);

  const empresaActual = useMemo(
    () => empresasDisponibles.find((empresa) => empresa.id === empresaId) ?? null,
    [empresaId, empresasDisponibles]
  );

  const organizacionActual = empresaActual?.organizacion ?? null;

  const value = useMemo<CompanyContextValue>(() => ({
    empresasDisponibles,
    empresaActual,
    organizacionActual,
    loading,
    error,
    setEmpresaActual: (nextEmpresaId: number | null) => {
      if (nextEmpresaId === null) {
        setCapabilities(null);
        setEmpresaIdState(null);
        return;
      }

      if (empresasDisponibles.some((empresa) => empresa.id === nextEmpresaId)) {
        setCapabilities(null);
        setEmpresaIdState(nextEmpresaId);
      }
    },
    empresas: empresasDisponibles,
    empresaId,
    empresaActiva: empresaActual,
    isLoading: loading,
    setEmpresaId: (nextEmpresaId: number | null) => {
      if (nextEmpresaId === null) {
        setCapabilities(null);
        setEmpresaIdState(null);
        return;
      }

      if (empresasDisponibles.some((empresa) => empresa.id === nextEmpresaId)) {
        setCapabilities(null);
        setEmpresaIdState(nextEmpresaId);
      }
    },
    capabilities,
    capabilitiesLoading,
    hasModule: (code: string) => capabilities?.modulos[code] === true,
    retryBootstrap: () => {
      if (retryTimer.current !== null) return;
      const delay = Math.max(0, retryAfterUntil - Date.now());
      retryTimer.current = window.setTimeout(() => { retryTimer.current = null; setError(null); setBootstrapAttempt((current) => current + 1); }, delay);
    },
  }), [empresasDisponibles, empresaActual, organizacionActual, loading, error, empresaId, capabilities, capabilitiesLoading, retryAfterUntil]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext(): CompanyContextValue {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error("useCompanyContext debe usarse dentro de CompanyProvider");
  }

  return context;
}
