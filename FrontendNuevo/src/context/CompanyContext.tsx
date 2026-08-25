import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getTenantContext } from "../services/tenantApi";
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
};

const CompanyContext = createContext<CompanyContextValue | null>(null);
const STORAGE_KEY = "empiria_empresa_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [empresasDisponibles, setEmpresasDisponibles] = useState<TenantContextEmpresa[]>([]);
  const [empresaId, setEmpresaIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<EmpresaCapabilities | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);

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

    void getTenantContext()
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
          setError(loadError instanceof Error ? loadError.message : "No fue posible cargar el contexto empresarial.");
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
  }, [isAuthenticated]);

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
    void saasApi.capabilities(empresaId)
      .then((value) => { if (!cancelled) setCapabilities(value); })
      .catch((value: unknown) => { if (!cancelled) setError(value instanceof Error ? value.message : "No fue posible cargar módulos."); })
      .finally(() => { if (!cancelled) setCapabilitiesLoading(false); });
    return () => { cancelled = true; };
  }, [empresaId]);

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
  }), [empresasDisponibles, empresaActual, organizacionActual, loading, error, empresaId, capabilities, capabilitiesLoading]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext(): CompanyContextValue {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error("useCompanyContext debe usarse dentro de CompanyProvider");
  }

  return context;
}
