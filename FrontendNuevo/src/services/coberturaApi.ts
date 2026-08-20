import { env } from '../config/env';
import { apiClient, ApiClientError } from './apiClient';
import { getAuthToken } from './tokenStorage';
import type { ApiResponse } from '../types/api.types';
import type {
  FocalizacionImportDetailResult,
  FocalizacionImportListResult,
  FocalizacionUploadResult,
} from '../types/cobertura.types';

export async function uploadHistoricalFocalizacion(file: File, contratoId: number): Promise<FocalizacionUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('contrato_id', String(contratoId));

  const response = await apiClient.post<ApiResponse<FocalizacionUploadResult>>('/cobertura/focalizacion/importaciones', formData);
  return response.data;
}

export async function listFocalizacionImportaciones(contratoId: number): Promise<FocalizacionImportListResult> {
  const response = await apiClient.get<ApiResponse<FocalizacionImportListResult>>('/cobertura/focalizacion/importaciones', {
    params: { contrato_id: contratoId },
  });
  return response.data;
}

export async function getFocalizacionImportDetail(
  loteId: number,
  params: { page?: number; limit?: number; filter?: string } = {},
): Promise<FocalizacionImportDetailResult> {
  const response = await apiClient.get<ApiResponse<FocalizacionImportDetailResult>>(`/cobertura/focalizacion/importaciones/${loteId}`, {
    params,
  });
  return response.data;
}


export async function reprocessFocalizacionImport(
  loteId: number,
  payload: {
    fecha_inicio_vigencia?: string | null;
    fecha_fin_vigencia?: string | null;
    preliminar_ids?: number[];
  } = {},
): Promise<FocalizacionImportDetailResult> {
  const response = await apiClient.post<ApiResponse<FocalizacionImportDetailResult>>(
    `/cobertura/focalizacion/importaciones/${loteId}/reprocesar`,
    payload,
  );
  return response.data;
}

async function downloadProtectedFile(path: string, fallbackFileName: string): Promise<void> {
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

export async function downloadFocalizacionTemplate(): Promise<void> {
  await downloadProtectedFile('/cobertura/focalizacion/template', 'plantilla-focalizacion-empiria.xlsx');
}

export async function downloadFocalizacionReport(loteId: number): Promise<void> {
  await downloadProtectedFile(`/cobertura/focalizacion/importaciones/${loteId}/reporte`, `resultado-focalizacion-${loteId}.xlsx`);
}
