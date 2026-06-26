import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { VinculacionApi, VinculacionExpedienteApi } from '../types/personas.types';
import type {
  VinculacionFilters,
  VinculacionListResponse,
  CreateVinculacionPayload,
  UpdateVinculacionPayload,
  RetirarVinculacionPayload,
  SuspenderVinculacionPayload,
  ReactivarVinculacionPayload,
} from '../types/vinculaciones.types';

function toParams(f: VinculacionFilters): Record<string, string | number | boolean | undefined> {
  const p: Record<string, string | number | boolean | undefined> = {};
  if (f.persona_id          != null) p['persona_id']          = f.persona_id;
  if (f.empresa_id          != null) p['empresa_id']          = f.empresa_id;
  if (f.contrato_id         != null) p['contrato_id']         = f.contrato_id;
  if (f.tipo_vinculacion_id != null) p['tipo_vinculacion_id'] = f.tipo_vinculacion_id;
  if (f.contrato_cargo_id   != null) p['contrato_cargo_id']   = f.contrato_cargo_id;
  if (f.estado_vinculacion)          p['estado_vinculacion']  = f.estado_vinculacion;
  if (f.fecha_inicio_desde)          p['fecha_inicio_desde']  = f.fecha_inicio_desde;
  if (f.fecha_inicio_hasta)          p['fecha_inicio_hasta']  = f.fecha_inicio_hasta;
  if (f.page  != null)               p['page']                = f.page;
  if (f.limit != null)               p['limit']               = f.limit;
  return p;
}

export async function getVinculaciones(filters: VinculacionFilters = {}): Promise<VinculacionListResponse> {
  const res = await apiClient.get<ApiResponse<VinculacionListResponse>>('/vinculaciones', {
    params: toParams(filters),
  });
  return res.data;
}

export async function getVinculacionById(id: number): Promise<VinculacionApi> {
  const res = await apiClient.get<ApiResponse<VinculacionApi>>(`/vinculaciones/${id}`);
  return res.data;
}

export async function getVinculacionExpediente(id: number): Promise<VinculacionExpedienteApi> {
  const res = await apiClient.get<ApiResponse<VinculacionExpedienteApi>>(
    `/vinculaciones/${id}/expediente`
  );
  return res.data;
}

export async function createVinculacion(payload: CreateVinculacionPayload): Promise<VinculacionApi> {
  const res = await apiClient.post<ApiResponse<VinculacionApi>>('/vinculaciones', payload);
  return res.data;
}

export async function updateVinculacion(
  id: number,
  payload: UpdateVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(`/vinculaciones/${id}`, payload);
  return res.data;
}

export async function retirarVinculacion(
  id: number,
  payload: RetirarVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(
    `/vinculaciones/${id}/retirar`,
    payload
  );
  return res.data;
}

export async function suspenderVinculacion(
  id: number,
  payload: SuspenderVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(
    `/vinculaciones/${id}/suspender`,
    payload
  );
  return res.data;
}

export async function reactivarVinculacion(
  id: number,
  payload: ReactivarVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(
    `/vinculaciones/${id}/reactivar`,
    payload
  );
  return res.data;
}
