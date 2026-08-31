import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { NotificacionesResponse } from '../types/notificaciones.types';

export type ListMineNotificationsInput = {
  fecha_desde?: string;
  fecha_hasta?: string;
  leida?: boolean;
  limit?: number;
  page?: number;
  tipo?: string;
};

export const notificacionesApi = {
  async listMine(input: ListMineNotificationsInput = {}): Promise<NotificacionesResponse> {
    const response = await apiClient.get<ApiResponse<NotificacionesResponse>>('/notificaciones/mis', {
      params: {
        page: input.page ?? 1,
        limit: input.limit ?? 25,
        leida: input.leida,
        tipo: input.tipo,
        fecha_desde: input.fecha_desde,
        fecha_hasta: input.fecha_hasta,
      },
    });

    return response.data;
  },

  async countUnreadMine(): Promise<number> {
    const response = await apiClient.get<ApiResponse<NotificacionesResponse>>('/notificaciones/mis', {
      params: {
        page: 1,
        limit: 1,
        leida: false,
      },
    });

    return response.data.pagination.total;
  },

  async markRead(id: string): Promise<void> {
    await apiClient.patch(`/notificaciones/${id}/leer`);
  },

  async markAllRead(): Promise<void> {
    await apiClient.patch('/notificaciones/leer-todas');
  },
};
