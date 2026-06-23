import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/cobertura";

export interface CoberturaResumenParams {
  contrato_id?: number | string;
  municipio_id?: number | string;
  institucion_id?: number | string;
  sede_id?: number | string;
  categoria_cobertura?: string;
  modalidad_base?: "CAA" | "CAARES" | "RI";
  estado_cobertura?: "NO_REQUIERE" | "FALTANTE" | "COMPLETA" | "SOBRECOBERTURA";
  page?: number;
  limit?: number;
}

function toQuery(params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

// Los payloads de /cobertura/* se tipan como `unknown` a nivel de respuesta y se
// leen con helpers defensivos en CoberturaModule.tsx (getArray/getNumber/getString).
export type CoberturaListResponse = unknown;

export const coberturaApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /cobertura/resumen — listado paginado de combos sede×modalidad (focalizacion_final)
  // con institución, sede, municipio, modalidad, cupos, requeridos, asignados y estado_cobertura.
  // No existe un endpoint separado de "instituciones", "sedes" o "modalidades": se derivan
  // agrupando este mismo listado en el frontend.
  getResumen: (params: CoberturaResumenParams = {}): Promise<CoberturaListResponse> =>
    apiGet<CoberturaListResponse>(`${BASE_PATH}/resumen${toQuery(params)}`),

  // GET /cobertura/sede-modalidad/:id — detalle de un combo puntual, incluye sus
  // asignaciones (manipulador vía vinculacion_id). No existe un GET plano de asignaciones.
  getSedeModalidadDetalle: (id: number | string): Promise<CoberturaListResponse> =>
    apiGet<CoberturaListResponse>(`${BASE_PATH}/sede-modalidad/${id}`),
};
