import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/sst";

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

// Los payloads de /sst/* tienen forma anidada (persona, capacitacion, item, etc.)
// definida en el backend, pero se tipan como `unknown` a nivel de respuesta y se
// leen con helpers defensivos en SSTModule.tsx (getArray/getNumber/getString/getNested).
export type SstListResponse = unknown;
export type SstDashboardResponse = unknown;

export const sstApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /sst/dashboard-general — dashboard consolidado (Resumen)
  getDashboardGeneral: (params: TenantParams = {}): Promise<SstDashboardResponse> =>
    apiGet<SstDashboardResponse>(`${BASE_PATH}/dashboard-general${toQuery(params)}`),
  // GET /sst/dashboard-general/alertas — alertas consolidadas de todos los submódulos
  getDashboardGeneralAlertas: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/dashboard-general/alertas${toQuery(params)}`),

  // GET /sst/capacitaciones-persona — registros de capacitación por persona
  getCapacitacionesPersona: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/capacitaciones-persona${toQuery(params)}`),

  // GET /sst/dotacion-epp-entregas — entregas de dotación/EPP por persona
  getDotacionEppEntregas: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/dotacion-epp-entregas${toQuery(params)}`),

  // GET /sst/examenes-persona — exámenes ocupacionales por persona
  getExamenesPersona: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/examenes-persona${toQuery(params)}`),

  // GET /sst/accidentes — accidentes e incidentes
  getAccidentes: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/accidentes${toQuery(params)}`),

  // GET /sst/inspecciones
  getInspecciones: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/inspecciones${toQuery(params)}`),

  // GET /sst/matriz-riesgos
  getMatrizRiesgos: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/matriz-riesgos${toQuery(params)}`),

  // GET /sst/plan-anual — catálogo de planes (sin actividades)
  getPlanAnual: (params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/plan-anual${toQuery(params)}`),
  // GET /sst/plan-anual/:id/actividades — actividades de un plan puntual
  getPlanAnualActividades: (planId: number | string, params: ListParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/plan-anual/${planId}/actividades${toQuery(params)}`),

  // GET /sst/indicadores/historico — serie histórica de indicadores SST por periodo
  getIndicadoresHistorico: (params: TenantParams = {}): Promise<SstListResponse> =>
    apiGet<SstListResponse>(`${BASE_PATH}/indicadores/historico${toQuery(params)}`),
};
