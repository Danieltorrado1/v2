import { env } from '../config/env';
import { apiClient, ApiClientError } from './apiClient';
import { getAuthToken } from './tokenStorage';
import type { ApiResponse } from '../types/api.types';
import type {
  OperationalImportConfirmResult,
  OperationalImportFilter,
  OperationalImportPreviewResult,
  OperationalImportUploadResult,
} from '../types/importaciones.types';

export async function uploadOperationalImport(file: File, contratoId: number): Promise<OperationalImportUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('contrato_id', String(contratoId));
  const response = await apiClient.post<ApiResponse<OperationalImportUploadResult>>('/importaciones/personas-vinculaciones/upload', formData);
  return response.data;
}

export async function getOperationalImportPreview(
  loteId: number,
  params: { page?: number; limit?: number; filter?: OperationalImportFilter } = {}
): Promise<OperationalImportPreviewResult> {
  const response = await apiClient.get<ApiResponse<OperationalImportPreviewResult>>(`/importaciones/lotes/${loteId}/preview`, { params });
  return response.data;
}

export async function confirmOperationalImport(loteId: number): Promise<OperationalImportConfirmResult> {
  const response = await apiClient.post<ApiResponse<OperationalImportConfirmResult>>(`/importaciones/lotes/${loteId}/confirmar`);
  return response.data;
}

async function downloadProtectedCsv(path: string, fallbackFileName: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${env.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

export async function downloadOperationalImportTemplate(): Promise<void> {
  await downloadProtectedCsv('/importaciones/personas-vinculaciones/template', 'plantilla-importacion-personal.csv');
}

export async function downloadOperationalImportReport(loteId: number): Promise<void> {
  await downloadProtectedCsv(`/importaciones/lotes/${loteId}/reporte`, `importacion-personal-lote-${loteId}.csv`);
}

