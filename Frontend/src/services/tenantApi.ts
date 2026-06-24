import { apiGet } from "../lib/api";

const BASE_PATH = "/tenant";
const EMPRESA_STORAGE_KEY = "empiria_empresa_id";
const CONTRATO_STORAGE_KEY = "empiria_contrato_id";

export interface TenantEmpresa {
  id: number;
  nombre_empresa: string;
}

export interface TenantContrato {
  id: number;
  numero_contrato: string | null;
  entidad_contratante: string | null;
  empresa_id: number | null;
}

export interface TenantMeResult {
  isGlobalAdmin: boolean;
  empresaIds: number[];
  contratoIds: number[];
  empresas: TenantEmpresa[];
  contratos: TenantContrato[];
  empresa_default_id: number | null;
  contrato_default_id: number | null;
}

export const tenantApi = {
  // GET /tenant/me — empresas y contratos disponibles para el usuario autenticado,
  // ya resueltos con nombre, más la empresa/contrato por defecto sugeridos por el backend.
  getMe: (): Promise<TenantMeResult> => apiGet<TenantMeResult>(`${BASE_PATH}/me`),
};

function readStoredId(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeStoredId(key: string, id: number | null): void {
  if (id === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, String(id));
  }
}

export const getStoredEmpresaId = (): number | null => readStoredId(EMPRESA_STORAGE_KEY);
export const getStoredContratoId = (): number | null => readStoredId(CONTRATO_STORAGE_KEY);
export const setStoredEmpresaId = (id: number | null): void => writeStoredId(EMPRESA_STORAGE_KEY, id);
export const setStoredContratoId = (id: number | null): void => writeStoredId(CONTRATO_STORAGE_KEY, id);

// Resuelve la empresa/contrato a usar al cargar la app: prioriza lo guardado en
// localStorage si sigue siendo válido para el usuario actual; si no, cae a los
// valores por defecto que sugiere el backend. Si la empresa resuelta no tiene
// contratos, contratoId queda en null (la UI debe mostrar "Sin contratos").
export function resolveInitialTenantSelection(
  result: TenantMeResult
): { empresaId: number | null; contratoId: number | null } {
  const storedEmpresaId = getStoredEmpresaId();
  const storedContratoId = getStoredContratoId();

  const empresaValida = storedEmpresaId !== null && result.empresas.some((e) => e.id === storedEmpresaId);
  const empresaId = empresaValida ? storedEmpresaId : result.empresa_default_id;

  const contratosDeEmpresa = empresaId === null ? [] : result.contratos.filter((c) => c.empresa_id === empresaId);
  const contratoValido = storedContratoId !== null && contratosDeEmpresa.some((c) => c.id === storedContratoId);
  const contratoId = contratoValido ? storedContratoId : contratosDeEmpresa[0]?.id ?? null;

  return { empresaId, contratoId };
}
