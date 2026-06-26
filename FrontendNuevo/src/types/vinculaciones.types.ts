import type { VinculacionApi, VinculacionEstado } from './personas.types';

export type MetodoPago =
  | 'ASISTENCIA'
  | 'CATEGORIA'
  | 'OPS_CUENTA_COBRO'
  | 'OPS_VALOR_FIJO'
  | 'OPS_POR_PRODUCTO';

export interface VinculacionPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface VinculacionListResponse {
  items: VinculacionApi[];
  pagination: VinculacionPagination;
}

export interface VinculacionFilters {
  persona_id?: number;
  empresa_id?: number;
  contrato_id?: number;
  tipo_vinculacion_id?: number;
  contrato_cargo_id?: number;
  estado_vinculacion?: VinculacionEstado;
  fecha_inicio_desde?: string;
  fecha_inicio_hasta?: string;
  page?: number;
  limit?: number;
}

export interface CreateVinculacionPayload {
  persona_id: number;
  empresa_id: number;
  contrato_id: number;
  tipo_vinculacion_id: number;
  contrato_cargo_id: number;
  fecha_inicio: string;
  fecha_fin?: string | null;
  estado_vinculacion?: VinculacionEstado;
  cuenta_como_experiencia?: boolean;
  metodo_pago?: MetodoPago | null;
}

export interface UpdateVinculacionPayload {
  persona_id?: number;
  empresa_id?: number;
  contrato_id?: number;
  tipo_vinculacion_id?: number;
  contrato_cargo_id?: number;
  fecha_inicio?: string;
  fecha_fin?: string | null;
  estado_vinculacion?: VinculacionEstado;
  cuenta_como_experiencia?: boolean;
  metodo_pago?: MetodoPago | null;
}

export interface RetirarVinculacionPayload {
  fecha_retiro: string;
  motivo_retiro?: string | null;
  observaciones?: string | null;
}

export interface SuspenderVinculacionPayload {
  fecha_suspension: string;
  motivo_suspension?: string | null;
  observaciones?: string | null;
}

export interface ReactivarVinculacionPayload {
  fecha_reactivacion?: string;
  observaciones?: string | null;
}
