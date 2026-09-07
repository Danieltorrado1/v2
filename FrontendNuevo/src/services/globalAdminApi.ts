import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';

export type GlobalAdminDashboard = {
  kpis: Record<'empresas_total'|'empresas_activas'|'empresas_inactivas'|'usuarios_activos'|'personal_total'|'contratos_activos'|'modulos_activos', number>;
  clientes: Array<{ empresa_id:number; empresa:string; nit:string|null; plan:string; estado:string; usuarios:number; personal:number; contratos:number; ultima_actividad:string|null }>;
  alertas: Array<{ codigo:string; cantidad:number; descripcion:string }>;
};
export async function getGlobalAdminDashboard(): Promise<GlobalAdminDashboard> {
  const response = await apiClient.get<ApiResponse<GlobalAdminDashboard>>('/dashboard/admin-global');
  return response.data;
}
