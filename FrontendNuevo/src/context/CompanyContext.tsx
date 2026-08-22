import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { configuracionApi } from "../services/configuracionApi";
import type { Empresa } from "../types/configuracion.types";
import { useAuth } from "./AuthContext";

type CompanyContextValue = {
  empresas: Empresa[];
  empresaId: number | null;
  empresaActiva: Empresa | null;
  isLoading: boolean;
  setEmpresaId: (empresaId: number | null) => void;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);
const STORAGE_KEY = "empiria_empresa_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaIdState] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const permissions = user?.permissions ?? [];
  const canReadCompanies = permissions.some((permission) =>
    ["configuracion.read", "empresas.read", "contratos.read", "contracts.read"].includes(permission)
  );

  useEffect(() => {
    if (!isAuthenticated || !canReadCompanies) {
      setEmpresas([]);
      setEmpresaIdState(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void configuracionApi.listarEmpresas({ page: 1, limit: 100, activo: true })
      .then((response) => {
        if (cancelled) return;
        const authorized = response.items;
        const stored = Number(window.localStorage.getItem(STORAGE_KEY));
        const validStored = Number.isInteger(stored) && authorized.some((empresa) => empresa.id === stored);
        setEmpresas(authorized);
        setEmpresaIdState((current) => {
          if (current && authorized.some((empresa) => empresa.id === current)) return current;
          if (validStored) return stored;
          return authorized[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setEmpresas([]);
          setEmpresaIdState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canReadCompanies, isAuthenticated]);

  const setEmpresaId = useCallback((nextId: number | null) => {
    const authorized = empresas.some((empresa) => empresa.id === nextId);
    const validId = nextId !== null && authorized ? nextId : nextId === null ? null : empresaId;
    setEmpresaIdState(validId);
    if (validId === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(validId));
    }
  }, [empresaId, empresas]);

  const value = useMemo(() => ({
    empresas,
    empresaId,
    empresaActiva: empresas.find((empresa) => empresa.id === empresaId) ?? null,
    isLoading,
    setEmpresaId,
  }), [empresas, empresaId, isLoading, setEmpresaId]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("useCompanyContext debe usarse dentro de CompanyProvider");
  return context;
}
