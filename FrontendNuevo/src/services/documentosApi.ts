import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  DocumentoPersonaApi,
  DocumentoVinculacionApi,
  DocumentoDownloadInfoApi,
  DocumentoUploadFields,
  DocumentoScope,
} from '../types/documentos.types';
import type { VinculacionChecklistApi } from '../types/expediente.types';

export async function getDocumentosPersona(personaId: number): Promise<DocumentoPersonaApi[]> {
  const res = await apiClient.get<ApiResponse<DocumentoPersonaApi[]>>(
    `/documentos/persona/${personaId}`
  );
  return res.data;
}

export async function getDocumentosVinculacion(vinculacionId: number): Promise<DocumentoVinculacionApi[]> {
  const res = await apiClient.get<ApiResponse<DocumentoVinculacionApi[]>>(
    `/documentos/vinculacion/${vinculacionId}`
  );
  return res.data;
}

export async function uploadDocumentoPersona(
  personaId: number,
  file: File,
  fields: DocumentoUploadFields
): Promise<DocumentoPersonaApi> {
  const form = new FormData();
  form.append('file', file);
  form.append('tipo_documento_id', fields.tipo_documento_id);
  if (fields.fecha_expedicion) form.append('fecha_expedicion', fields.fecha_expedicion);
  if (fields.fecha_vencimiento) form.append('fecha_vencimiento', fields.fecha_vencimiento);

  const res = await apiClient.post<ApiResponse<DocumentoPersonaApi>>(
    `/documentos/persona/${personaId}/upload`,
    form
  );
  return res.data;
}

export async function uploadDocumentoVinculacion(
  vinculacionId: number,
  file: File,
  fields: DocumentoUploadFields
): Promise<DocumentoVinculacionApi> {
  const form = new FormData();
  form.append('file', file);
  form.append('tipo_documento_id', fields.tipo_documento_id);
  if (fields.fecha_expedicion) form.append('fecha_expedicion', fields.fecha_expedicion);
  if (fields.fecha_vencimiento) form.append('fecha_vencimiento', fields.fecha_vencimiento);

  const res = await apiClient.post<ApiResponse<DocumentoVinculacionApi>>(
    `/documentos/vinculacion/${vinculacionId}/upload`,
    form
  );
  return res.data;
}

export async function getDocumentoDownloadUrl(
  documentoId: string,
  scope: DocumentoScope
): Promise<DocumentoDownloadInfoApi> {
  const res = await apiClient.get<ApiResponse<DocumentoDownloadInfoApi>>(
    `/documentos/${documentoId}/download-url`,
    { params: { scope } }
  );
  return res.data;
}

export async function deactivateDocumentoPersona(documentoId: string): Promise<DocumentoPersonaApi> {
  const res = await apiClient.patch<ApiResponse<DocumentoPersonaApi>>(
    `/documentos/persona/${documentoId}/deactivate`
  );
  return res.data;
}

export async function deactivateDocumentoVinculacion(documentoId: string): Promise<DocumentoVinculacionApi> {
  const res = await apiClient.patch<ApiResponse<DocumentoVinculacionApi>>(
    `/documentos/vinculacion/${documentoId}/deactivate`
  );
  return res.data;
}

export async function getChecklistVinculacion(vinculacionId: number): Promise<VinculacionChecklistApi> {
  const res = await apiClient.get<ApiResponse<VinculacionChecklistApi>>(
    `/documentos/vinculacion/${vinculacionId}/checklist`
  );
  return res.data;
}
