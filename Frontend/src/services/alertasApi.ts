import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/alertas";

export type TipoAlertaDocumental = "DOCUMENTO_FALTANTE" | "DOCUMENTO_VENCIDO" | "DOCUMENTO_POR_VENCER" | "EXPEDIENTE_INCOMPLETO";
export type SeveridadAlertaDocumental = "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
export type EstadoAlertaDocumental = "ACTIVA" | "RESUELTA" | "IGNORADA";

export interface AlertaDocumentalItem {
  id: number;
  persona_id: number | null;
  persona_nombre: string | null;
  contrato_id: number | null;
  contrato_numero: string | null;
  tipo_alerta: TipoAlertaDocumental;
  severidad: SeveridadAlertaDocumental;
  estado: EstadoAlertaDocumental;
  titulo: string;
  descripcion: string | null;
  tipo_documento_nombre: string | null;
  fecha_alerta: string;
  fecha_vencimiento: string | null;
  dias_restantes: number | null;
}

export interface PaginatedAlertasDocumentales {
  items: AlertaDocumentalItem[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface AlertasDocumentalesFiltros {
  empresa_id?: number | string;
  contrato_id?: number | string;
  persona_id?: number | string;
  vinculacion_id?: number | string;
  tipo_alerta?: TipoAlertaDocumental;
  severidad?: SeveridadAlertaDocumental;
  estado?: EstadoAlertaDocumental;
  page?: number;
  limit?: number;
}

function toQuery(params: Record<string, unknown> = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export const alertasApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /alertas/documentales
  listDocumentales: (params: AlertasDocumentalesFiltros = {}): Promise<PaginatedAlertasDocumentales> =>
    apiGet<PaginatedAlertasDocumentales>(`${BASE_PATH}/documentales${toQuery(params)}`),
};
