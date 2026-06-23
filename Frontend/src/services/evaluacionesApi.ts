import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/evaluaciones";

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

// Los payloads de /evaluaciones/* tienen forma anidada (persona, evaluacion, etc.)
// definida en el backend, pero se tipan como `unknown` a nivel de respuesta y se
// leen con helpers defensivos en EvaluacionesModule.tsx (getArray/getNumber/getString/getNested).
export type EvaluacionesListResponse = unknown;
export type EvaluacionesDashboardResponse = unknown;

export const evaluacionesApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /evaluaciones — catálogo de evaluaciones (sin persona/estado/calificación)
  getEvaluaciones: (params: ListParams = {}): Promise<EvaluacionesListResponse> =>
    apiGet<EvaluacionesListResponse>(`${BASE_PATH}${toQuery(params)}`),

  // GET /evaluaciones/persona — asignaciones de evaluación por persona (estado, calificación)
  getEvaluacionesPersona: (params: ListParams = {}): Promise<EvaluacionesListResponse> =>
    apiGet<EvaluacionesListResponse>(`${BASE_PATH}/persona${toQuery(params)}`),

  // GET /evaluaciones/dashboard-general — dashboard consolidado (Resumen)
  getDashboardGeneral: (params: TenantParams = {}): Promise<EvaluacionesDashboardResponse> =>
    apiGet<EvaluacionesDashboardResponse>(`${BASE_PATH}/dashboard-general${toQuery(params)}`),

  // GET /evaluaciones/dashboard-general/alertas
  getDashboardGeneralAlertas: (params: ListParams = {}): Promise<EvaluacionesListResponse> =>
    apiGet<EvaluacionesListResponse>(`${BASE_PATH}/dashboard-general/alertas${toQuery(params)}`),

  // GET /evaluaciones/dashboard-general/ranking
  getDashboardGeneralRanking: (params: TenantParams & { limit?: number } = {}): Promise<EvaluacionesListResponse> =>
    apiGet<EvaluacionesListResponse>(`${BASE_PATH}/dashboard-general/ranking${toQuery(params)}`),

  // GET /evaluaciones/planes-mejora
  getPlanesMejora: (params: ListParams = {}): Promise<EvaluacionesListResponse> =>
    apiGet<EvaluacionesListResponse>(`${BASE_PATH}/planes-mejora${toQuery(params)}`),
};
