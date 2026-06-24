import { apiDelete, apiGet, apiPatch, apiPost, getToken } from "../lib/api";

const BASE_PATH = "/documentos";

// ── Tipos — reflejan exactamente lo que devuelve documentos.service.ts ──────
export interface DocumentoPersona {
  id: string;
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  mime_type: string;
  nombre_original: string;
  persona_id: string;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  vinculacion_id: string | null;
  version: number;
  documento_reemplaza_id: string | null;
  es_vigente: boolean;
}

export interface DocumentoVinculacion {
  id: string;
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  mime_type: string;
  nombre_original: string;
  persona_id: string | null;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  vinculacion_id: string;
  contrato_id: string | null;
  contrato_cargo_id: string | null;
}

// GET /documentos/persona/:personaId — listado resumido (sin id de documento;
// el backend no expone aquí un id usable para descargar/desactivar por fila).
export interface PersonaDocumentoSummary {
  es_vigente: boolean;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  nombre_original: string;
  storage_bucket: string;
  storage_path: string;
  tipo_documento: string | null;
  version: number;
}

export interface DocumentoDownloadInfo {
  document_scope: "PERSONA" | "VINCULACION";
  download_url: string;
  expires_in_seconds: number;
  id: string;
  mime_type: string;
  nombre_original: string;
}

export interface ChecklistItem {
  codigo: string | null;
  documento_id: number | null;
  estado: "CARGADO" | "FALTANTE" | "VENCIDO";
  fecha_vencimiento: string | null;
  fuente_documento: "PERSONA" | "VINCULACION" | null;
  nombre_requisito: string;
  observacion: string | null;
  obligatorio: boolean;
  origen: "GENERAL" | "CARGO";
  requisito_id: number;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  tipo_requisito: string | null;
}

export interface VinculacionChecklist {
  cargados: number;
  contrato_cargo_id: number;
  contrato_id: number;
  cumplimiento_porcentaje: number;
  faltantes: number;
  persona_id: number;
  requisitos: ChecklistItem[];
  total_requisitos: number;
  vinculacion_id: number;
  vencidos: number;
}

export interface UploadDocumentoInput {
  tipo_documento_id: string | number;
  fecha_expedicion?: string | null;
  fecha_vencimiento?: string | null;
}

function buildUploadFormData(file: File, input: UploadDocumentoInput): FormData {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("tipo_documento_id", String(input.tipo_documento_id));
  if (input.fecha_expedicion) formData.append("fecha_expedicion", input.fecha_expedicion);
  if (input.fecha_vencimiento) formData.append("fecha_vencimiento", input.fecha_vencimiento);
  return formData;
}

// apiPost siempre serializa JSON (ver lib/api.ts); la carga de archivos necesita
// multipart/form-data, así que aquí se hace fetch directo en vez de pasar por apiPost.
async function uploadMultipart<T>(path: string, formData: FormData): Promise<T> {
  const API_URL = import.meta.env.VITE_API_URL as string;
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!json || json.success === false) {
    throw new Error(json?.error?.message ?? `Error en la solicitud (${response.status})`);
  }

  return json.data as T;
}

export const documentosApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /documentos/persona/:personaId
  getPersonaDocuments: (personaId: number | string): Promise<PersonaDocumentoSummary[]> =>
    apiGet<PersonaDocumentoSummary[]>(`${BASE_PATH}/persona/${personaId}`),

  // GET /documentos/vinculacion/:vinculacion_id
  getVinculacionDocuments: (vinculacionId: number | string): Promise<DocumentoVinculacion[]> =>
    apiGet<DocumentoVinculacion[]>(`${BASE_PATH}/vinculacion/${vinculacionId}`),

  // POST /documentos/persona/:persona_id/upload (multipart/form-data, campo "file")
  uploadPersonaDocument: (personaId: number | string, file: File, input: UploadDocumentoInput): Promise<DocumentoPersona> =>
    uploadMultipart<DocumentoPersona>(`${BASE_PATH}/persona/${personaId}/upload`, buildUploadFormData(file, input)),

  // POST /documentos/vinculacion/:vinculacion_id/upload (multipart/form-data, campo "file")
  uploadVinculacionDocument: (vinculacionId: number | string, file: File, input: UploadDocumentoInput): Promise<DocumentoVinculacion> =>
    uploadMultipart<DocumentoVinculacion>(`${BASE_PATH}/vinculacion/${vinculacionId}/upload`, buildUploadFormData(file, input)),

  // GET /documentos/:id/download-url — URL firmada temporal (no hay ruta interna que exponer).
  // documentos_persona.id y documentos_vinculacion.id son secuencias independientes y
  // pueden coincidir numéricamente; se pasa `scope` siempre que se conozca para evitar
  // que el backend devuelva el archivo equivocado (ver documentos.service.ts).
  getDownloadUrl: (documentId: number | string, scope?: "persona" | "vinculacion"): Promise<DocumentoDownloadInfo> =>
    apiGet<DocumentoDownloadInfo>(`${BASE_PATH}/${documentId}/download-url${scope ? `?scope=${scope}` : ""}`),

  // PATCH /documentos/persona/:id/deactivate o /documentos/vinculacion/:id/deactivate —
  // no hay un endpoint único de desactivación, depende del origen real del documento.
  deactivateDocument: (documentId: number | string, scope: "persona" | "vinculacion"): Promise<DocumentoPersona | DocumentoVinculacion> =>
    apiPatch<DocumentoPersona | DocumentoVinculacion>(`${BASE_PATH}/${scope}/${documentId}/deactivate`),

  // GET /documentos/vinculacion/:vinculacion_id/checklist
  getChecklist: (vinculacionId: number | string): Promise<VinculacionChecklist> =>
    apiGet<VinculacionChecklist>(`${BASE_PATH}/vinculacion/${vinculacionId}/checklist`),

  // No existe getVersions(): no hay un endpoint de historial de versiones en el
  // backend (documentos.routes.ts no expone nada como /documentos/:id/versions).
  // El campo `version` sí existe por documento individual (ver DocumentoPersona),
  // pero no hay una lista de "versiones de un documento" que consultar.
};
