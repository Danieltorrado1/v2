import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/vinculaciones";

export type VinculacionEstado = "ACTIVA" | "RETIRADA" | "SUSPENDIDA";

export interface Vinculacion {
  id: number;
  persona_id: number;
  empresa_id: number;
  contrato_id: number;
  contrato_cargo_id: number;
  tipo_vinculacion_id: number;
  estado_vinculacion: VinculacionEstado;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface PaginatedVinculaciones {
  items: Vinculacion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ListVinculacionesParams {
  persona_id?: number;
  page?: number;
  limit?: number;
}

function toQuery(params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export const vinculacionesApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /vinculaciones — colección completa (alcance ya filtrado por tenant en el backend).
  list: (params: ListVinculacionesParams = {}): Promise<PaginatedVinculaciones> =>
    apiGet<PaginatedVinculaciones>(`${BASE_PATH}${toQuery(params)}`),

  // GET /vinculaciones/:id — usado para resolver el persona_id de una vinculación
  // puntual (p.ej. el manipulador de una asignación de cobertura).
  getById: (id: number | string): Promise<Vinculacion> => apiGet<Vinculacion>(`${BASE_PATH}/${id}`),
};
