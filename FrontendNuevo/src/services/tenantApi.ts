import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { TenantContext } from '../types/configuracion.types';

export async function getTenantContext(): Promise<TenantContext> {
  const response = await apiClient.get<ApiResponse<TenantContext>>('/tenant/me');
  return response.data;
}
