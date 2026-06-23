import { apiGet } from "../lib/api";

const BASE_PATH = "/tenant";

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
