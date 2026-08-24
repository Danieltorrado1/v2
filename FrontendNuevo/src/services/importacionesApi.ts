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
  MasterImportType,
  PaginatedSstPreparationResult,
  SstPreparationPlanItem,
  SstPreparationSummary,
  SstReviewCaseItem
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

export async function getSstPreparationSummary(): Promise<SstPreparationSummary> {
  const response = await apiClient.get<ApiResponse<SstPreparationSummary>>(
    '/importaciones/maestro/sst/preparacion/resumen'
  );
  return response.data;
}

export async function listSstReviewCases(params: {
  page?: number;
  limit?: number;
  tipo?: 'TODOS' | 'DIGITAL' | 'AFILIACION';
  campo?: string;
  municipio?: string;
  estado?: 'TODOS' | 'PENDIENTE' | 'RESUELTO' | 'DESCARTADO';
} = {}): Promise<PaginatedSstPreparationResult<SstReviewCaseItem>> {
  const response = await apiClient.get<ApiResponse<PaginatedSstPreparationResult<SstReviewCaseItem>>>(
    '/importaciones/maestro/sst/revision-casos',
    { params }
  );
  return response.data;
}

export async function resolveSstReviewCase(
  caseId: number,
  payload: {
    decision: 'USAR_FUENTE_A' | 'USAR_FUENTE_B' | 'INGRESAR_VALOR_MANUAL' | 'MANTENER_MAESTRO' | 'DESCARTAR_CAMBIO';
    valor_resuelto?: string | null;
    observacion?: string | null;
  }
): Promise<SstReviewCaseItem> {
  const response = await apiClient.patch<ApiResponse<SstReviewCaseItem>>(
    `/importaciones/maestro/sst/revision-casos/${caseId}`,
    payload
  );
  return response.data;
}

export async function listSstPendingCapture(params: {
  page?: number;
  limit?: number;
  municipio?: string;
} = {}): Promise<PaginatedSstPreparationResult<SstPreparationPlanItem>> {
  const response = await apiClient.get<ApiResponse<PaginatedSstPreparationResult<SstPreparationPlanItem>>>(
    '/importaciones/maestro/sst/pendientes',
    { params }
  );
  return response.data;
}

export async function listSstApplyPlan(params: {
  page?: number;
  limit?: number;
  estado?: 'TODOS' | 'APTO_APPLY_AUTOMATICO' | 'APTO_APPLY_PARCIAL' | 'REQUIERE_REVISION' | 'SIN_DATOS_DIGITALES';
} = {}): Promise<PaginatedSstPreparationResult<SstPreparationPlanItem>> {
  const response = await apiClient.get<ApiResponse<PaginatedSstPreparationResult<SstPreparationPlanItem>>>(
    '/importaciones/maestro/sst/apply-plan',
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
      : tipo === 'INFORMACION_BANCARIA'
        ? '/importaciones/informacion-bancaria/template'
        : '/importaciones/caracterizacion-sst/template';
  const fileName =
    tipo === 'DATOS_PERSONALES'
      ? 'plantilla-datos-personales.xlsx'
      : tipo === 'INFORMACION_BANCARIA'
        ? 'plantilla-informacion-bancaria.xlsx'
        : 'plantilla-caracterizacion-sst.xlsx';
  await downloadProtectedFile(path, fileName);
}

export async function downloadMasterImportReport(loteId: number): Promise<void> {
  await downloadProtectedFile(
    `/importaciones/maestro/lotes/${loteId}/reporte`,
    `importacion-maestra-${loteId}.csv`
  );
}
