import { apiDelete, apiGet, apiPatch, apiPost, getToken } from "../lib/api";

const BASE_PATH = "/repositorio";

export type RepositorioOrigen = "persona" | "vinculacion" | "generado";
export type EstadoDocumental = "vigente" | "vencido" | "reemplazado" | "sin_vencimiento";

export interface RepositorioPersonaResumen {
  id: number;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface RepositorioDocumento {
  origen: RepositorioOrigen;
  documento_id: number;
  persona_id: number | null;
  vinculacion_id: number | null;
  empresa_id: number | null;
  contrato_id: number | null;
  tipo_documento_id: number | null;
  nombre_tipo_documento: string | null;
  nombre_archivo: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  fecha_carga: string | null;
  version: number | null;
  es_vigente: boolean | null;
  estado_documental: EstadoDocumental;
  persona: RepositorioPersonaResumen | null;
}

export interface RepositorioDocumentosListResult {
  items: RepositorioDocumento[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface RepositorioDocumentosIndicadoresResult {
  total_documentos: number;
  total_persona: number;
  total_vinculacion: number;
  total_generados: number;
  vigentes: number;
  vencidos: number;
  reemplazados: number;
  sin_vencimiento: number;
  por_vencer_30_dias: number;
  total_alertas_activas: number;
  alertas_criticas: number;
  documentos_por_tipo: Array<{ tipo_documento_id: number | null; nombre_tipo_documento: string | null; total: number }>;
  documentos_por_empresa: Array<{ empresa_id: number | null; nombre_empresa: string | null; total: number }>;
  documentos_por_contrato: Array<{ contrato_id: number | null; numero_contrato: string | null; total: number }>;
}

export interface RepositorioFiltros {
  empresa_id?: number | string;
  contrato_id?: number | string;
  persona_id?: number | string;
  vinculacion_id?: number | string;
  tipo_documento_id?: number | string;
  origen?: RepositorioOrigen;
  estado_documental?: EstadoDocumental;
  search?: string;
  page?: number;
  limit?: number;
}

function toQuery(params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export const repositorioApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /repositorio/documentos
  listDocumentos: (params: RepositorioFiltros = {}): Promise<RepositorioDocumentosListResult> =>
    apiGet<RepositorioDocumentosListResult>(`${BASE_PATH}/documentos${toQuery(params)}`),

  // GET /repositorio/documentos/indicadores
  getIndicadores: (params: RepositorioFiltros = {}): Promise<RepositorioDocumentosIndicadoresResult> =>
    apiGet<RepositorioDocumentosIndicadoresResult>(`${BASE_PATH}/documentos/indicadores${toQuery(params)}`),

  // GET /repositorio/documentos/export — responde CSV crudo con
  // Content-Disposition: attachment, no el sobre JSON {success,data} habitual,
  // así que no puede pasar por apiGet (que asume JSON {success,data}).
  exportCsv: async (params: RepositorioFiltros = {}): Promise<Blob> => {
    const API_URL = import.meta.env.VITE_API_URL as string;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_URL}${BASE_PATH}/documentos/export${toQuery(params)}`, { headers });
    if (!response.ok) {
      throw new Error(`No se pudo exportar el repositorio (status ${response.status})`);
    }
    return response.blob();
  },
};
