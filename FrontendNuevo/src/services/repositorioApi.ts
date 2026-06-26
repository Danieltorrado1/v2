import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  RepositorioDocumentoDetalleApi,
  RepositorioDocumentosListApi,
  RepositorioDocumentosVersionesApi,
  RepositorioDownloadUrlApi,
  RepositorioFilters,
  RepositorioIndicadoresApi,
  RepositorioOrigen,
} from '../types/repositorio.types';

function filtersToParams(
  filters: Omit<RepositorioFilters, 'page' | 'limit'> & { page?: number; limit?: number }
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = String(v);
    }
  }
  return out;
}

export async function getRepositorioDocumentos(
  filters: RepositorioFilters = {}
): Promise<RepositorioDocumentosListApi> {
  const res = await apiClient.get<ApiResponse<RepositorioDocumentosListApi>>(
    '/repositorio/documentos',
    { params: filtersToParams(filters) }
  );
  return res.data;
}

export async function getRepositorioIndicadores(
  filters: Omit<RepositorioFilters, 'page' | 'limit'> = {}
): Promise<RepositorioIndicadoresApi> {
  const res = await apiClient.get<ApiResponse<RepositorioIndicadoresApi>>(
    '/repositorio/documentos/indicadores',
    { params: filtersToParams(filters) }
  );
  return res.data;
}

export async function exportRepositorioDocumentos(
  filters: Omit<RepositorioFilters, 'page' | 'limit'> = {}
): Promise<string> {
  return apiClient.get<string>(
    '/repositorio/documentos/export',
    { params: filtersToParams(filters) }
  );
}

export async function getRepositorioDocumentoDetalle(
  origen: RepositorioOrigen,
  id: number
): Promise<RepositorioDocumentoDetalleApi> {
  const res = await apiClient.get<ApiResponse<RepositorioDocumentoDetalleApi>>(
    `/repositorio/documentos/${origen}/${id}`
  );
  return res.data;
}

export async function getRepositorioVersiones(
  origen: RepositorioOrigen,
  id: number
): Promise<RepositorioDocumentosVersionesApi> {
  const res = await apiClient.get<ApiResponse<RepositorioDocumentosVersionesApi>>(
    `/repositorio/documentos/${origen}/${id}/versiones`
  );
  return res.data;
}

export async function getRepositorioDownloadUrl(
  origen: RepositorioOrigen,
  id: number
): Promise<RepositorioDownloadUrlApi> {
  const res = await apiClient.post<ApiResponse<RepositorioDownloadUrlApi>>(
    `/repositorio/documentos/${origen}/${id}/download-url`
  );
  return res.data;
}
