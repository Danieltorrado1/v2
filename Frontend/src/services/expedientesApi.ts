import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

const BASE_PATH = "/expedientes";

// El backend devuelve un expediente 360 grande y con sub-objetos anidados
// (persona, vinculaciones, documentos, nomina, sst, evaluaciones, auditoria,
// indicadores). No se tipa de forma estricta a propósito: la UI accede a sus
// campos con helpers defensivos (ver getNested/getNumber/getArray en
// OperariosModule.tsx) para no romperse si el backend agrega/renombra campos.
export type ExpedienteLaboralPayload = Record<string, unknown>;

export const expedientesApi = {
  get: <T = unknown>(path: string = ""): Promise<T> => apiGet<T>(`${BASE_PATH}${path}`),
  post: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPost<T>(`${BASE_PATH}${path}`, body),
  patch: <T = unknown>(path: string, body?: unknown): Promise<T> => apiPatch<T>(`${BASE_PATH}${path}`, body),
  delete: <T = unknown>(path: string): Promise<T> => apiDelete<T>(`${BASE_PATH}${path}`),

  // GET /expedientes/personas/:persona_id — expediente laboral consolidado completo.
  getPersonaConsolidado: (personaId: number | string): Promise<ExpedienteLaboralPayload> =>
    apiGet<ExpedienteLaboralPayload>(`${BASE_PATH}/personas/${personaId}`),
};
