import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/nomina";

export interface TenantParams {
  empresa_id?: number | string;
  contrato_id?: number | string;
}

export interface ListParams extends TenantParams {
  page?: number;
  limit?: number;
}

function toQuery(params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

// Los payloads de /nomina/* son filas planas bien definidas en el backend,
// pero igual se tipan como `unknown` a nivel de respuesta paginada y se leen
// con helpers defensivos en NominaModule.tsx (getArray/getNumber/getString),
// por si el backend agrega/renombra un campo más adelante.
export type NominaListResponse = unknown;
export type NominaDashboardResponse = unknown;

export const nominaApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /nomina/vacaciones
  getVacaciones: (params: ListParams = {}): Promise<NominaListResponse> =>
    apiGet<NominaListResponse>(`${BASE_PATH}/vacaciones${toQuery(params)}`),
  // GET /nomina/vacaciones/dashboard
  getVacacionesDashboard: (params: TenantParams = {}): Promise<NominaDashboardResponse> =>
    apiGet<NominaDashboardResponse>(`${BASE_PATH}/vacaciones/dashboard${toQuery(params)}`),

  // GET /nomina/prima
  getPrima: (params: ListParams = {}): Promise<NominaListResponse> =>
    apiGet<NominaListResponse>(`${BASE_PATH}/prima${toQuery(params)}`),
  // GET /nomina/prima/dashboard
  getPrimaDashboard: (params: TenantParams = {}): Promise<NominaDashboardResponse> =>
    apiGet<NominaDashboardResponse>(`${BASE_PATH}/prima/dashboard${toQuery(params)}`),

  // GET /nomina/cesantias
  getCesantias: (params: ListParams = {}): Promise<NominaListResponse> =>
    apiGet<NominaListResponse>(`${BASE_PATH}/cesantias${toQuery(params)}`),
  // GET /nomina/cesantias/dashboard
  getCesantiasDashboard: (params: TenantParams = {}): Promise<NominaDashboardResponse> =>
    apiGet<NominaDashboardResponse>(`${BASE_PATH}/cesantias/dashboard${toQuery(params)}`),

  // GET /nomina/intereses-cesantias
  getInteresesCesantias: (params: ListParams = {}): Promise<NominaListResponse> =>
    apiGet<NominaListResponse>(`${BASE_PATH}/intereses-cesantias${toQuery(params)}`),
  // GET /nomina/intereses-cesantias/dashboard
  getInteresesCesantiasDashboard: (params: TenantParams = {}): Promise<NominaDashboardResponse> =>
    apiGet<NominaDashboardResponse>(`${BASE_PATH}/intereses-cesantias/dashboard${toQuery(params)}`),

  // GET /nomina/liquidaciones-finales
  getLiquidacionesFinales: (params: ListParams = {}): Promise<NominaListResponse> =>
    apiGet<NominaListResponse>(`${BASE_PATH}/liquidaciones-finales${toQuery(params)}`),
  // GET /nomina/liquidaciones-finales/dashboard
  getLiquidacionesFinalesDashboard: (params: TenantParams = {}): Promise<NominaDashboardResponse> =>
    apiGet<NominaDashboardResponse>(`${BASE_PATH}/liquidaciones-finales/dashboard${toQuery(params)}`),
};
