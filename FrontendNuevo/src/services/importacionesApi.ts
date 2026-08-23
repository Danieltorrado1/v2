import { env } from '../config/env';
import { apiClient, ApiClientError } from './apiClient';
import { getAuthToken } from './tokenStorage';
import type { ApiResponse } from '../types/api.types';
import type {
  MasterImportAnalyzeResponse,
  MasterImportApplyResponse,
  MasterImportFilter,
  MasterImportListResponse,
  MasterImportPreviewResponse,
  MasterImportStatus,
  MasterImportType
} from '../types/importaciones.types';

export async function analyzeMasterImport(
  file: File,
  tipo: MasterImportType,
  contratoId: number
): Promise<MasterImportAnalyzeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tipo', tipo);
  formData.append('contrato_id', String(contratoId));
  const response = await apiClient.post<ApiResponse<MasterImportAnalyzeResponse>>(
    '/importaciones/maestro/analizar',
    formData
  );
  return response.data;
}

export async function validateMasterImport(
  loteId: number,
  columnMappings: Record<string, string | null>
): Promise<MasterImportPreviewResponse> {
  const response = await apiClient.post<ApiResponse<MasterImportPreviewResponse>>(
    `/importaciones/maestro/lotes/${loteId}/validar`,
    { column_mappings: columnMappings }
  );
  return response.data;
}

export async function getMasterImportPreview(
  loteId: number,
  params: { page?: number; limit?: number; filter?: MasterImportFilter } = {}
): Promise<MasterImportPreviewResponse> {
  const response = await apiClient.get<ApiResponse<MasterImportPreviewResponse>>(
    `/importaciones/maestro/lotes/${loteId}/preview`,
    { params }
  );
  return response.data;
}

export async function applyMasterImport(
  loteId: number
): Promise<MasterImportApplyResponse> {
  const response = await apiClient.post<ApiResponse<MasterImportApplyResponse>>(
    `/importaciones/maestro/lotes/${loteId}/aplicar`
  );
  return response.data;
}

export async function listMasterImportHistory(params: {
  page?: number;
  limit?: number;
  tipo?: MasterImportType;
  estado?: MasterImportStatus;
} = {}): Promise<MasterImportListResponse> {
  const response = await apiClient.get<ApiResponse<MasterImportListResponse>>(
    '/importaciones/maestro/lotes',
    { params }
  );
  return response.data;
}

async function downloadProtectedFile(path: string, fallbackFileName: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${env.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });

  if (!response.ok) {
    throw new ApiClientError('No fue posible descargar el archivo.', response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] ?? fallbackFileName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadMasterImportTemplate(tipo: MasterImportType): Promise<void> {
  const path =
    tipo === 'DATOS_PERSONALES'
      ? '/importaciones/datos-personales/template'
      : '/importaciones/informacion-bancaria/template';
  const fileName =
    tipo === 'DATOS_PERSONALES'
      ? 'plantilla-datos-personales.xlsx'
      : 'plantilla-informacion-bancaria.xlsx';
  await downloadProtectedFile(path, fileName);
}

export async function downloadMasterImportReport(loteId: number): Promise<void> {
  await downloadProtectedFile(
    `/importaciones/maestro/lotes/${loteId}/reporte`,
    `importacion-maestra-${loteId}.csv`
  );
}
