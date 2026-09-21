import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { ExpedienteLaboralConsolidadoApi } from '../types/expediente.types';

export async function getExpedienteConsolidado(personaId: number): Promise<ExpedienteLaboralConsolidadoApi> {
  const res = await apiClient.get<ApiResponse<ExpedienteLaboralConsolidadoApi>>(
    `/expedientes/personas/${personaId}`
  );
  return res.data;
}

export async function generateExpedientePdf(personaId: number): Promise<{ signed_url: string; mime_type: string; expires_in: number; file_name: string }> {
  const res = await apiClient.post<ApiResponse<{ signed_url: string; mime_type: string; expires_in: number; file_name: string }>>(
    `/expedientes/personas/${personaId}/pdf`,
  );
  return res.data;
}
