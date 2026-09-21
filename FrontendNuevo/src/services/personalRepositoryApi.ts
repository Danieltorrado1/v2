import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { ContractPersonalFilters, ContractPersonalListResponse } from '../types/vinculaciones.types';
import type { VinculacionChecklistApi } from '../types/expediente.types';
import type { Delivery, RepositoryRow } from '../pages/personal/personalRepositoryModel';

export async function getPersonalRepositoryPage(filters: ContractPersonalFilters, signal: AbortSignal) {
  const result = await apiClient.get<ApiResponse<ContractPersonalListResponse>>('/vinculaciones/personal', {
    params: { ...filters }, signal,
  });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const workers = result.data.items;
  const summary = workers.length ? await apiClient.get<ApiResponse<{
    checklist: VinculacionChecklistApi; entregas: Delivery[] | null;
  }[]>>('/documentos/repositorio/resumen', {
    params: { vinculacion_ids: workers.map(w => w.vinculacion_id).join(',') }, signal,
  }) : { data: [] };
  const rows: RepositoryRow[] = workers.map(worker => ({ worker,
    ...summary.data.find(s => s.checklist.vinculacion_id === worker.vinculacion_id),
  }));
  return { rows, total: result.data.pagination.total };
}
