import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { ExpedienteLaboralConsolidadoApi } from '../types/expediente.types';

export async function getExpedienteConsolidado(personaId: number): Promise<ExpedienteLaboralConsolidadoApi> {
  const res = await apiClient.get<ApiResponse<ExpedienteLaboralConsolidadoApi>>(
    `/expedientes/personas/${personaId}`
  );
  return res.data;
}
