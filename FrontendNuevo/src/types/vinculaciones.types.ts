import type { VinculacionApi, VinculacionEstado } from './personas.types';

export type MetodoPago =
  | 'COBERTURA'
  | 'ASISTENCIA'
  | 'CASO_ESPECIAL'
  | 'CATEGORIA'
  | 'OPS_CUENTA_COBRO'
  | 'OPS_VALOR_FIJO'
  | 'OPS_POR_PRODUCTO';

export interface VinculacionPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  personas_total?: number;
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

export interface ContractPersonalFilters {
  contrato_id: number;
  contrato_cargo_id?: number;
  estado_vinculacion?: VinculacionEstado;
  search?: string;
  page?: number;
  limit?: number;
  fecha?: string;
  municipio_id?: number;
  institucion_id?: number;
  sede_id?: number;
  modalidad_id?: number;
  modalidad_codigo?: string;
  ubicacion_laboral_id?: number;
  cobertura?: "SI" | "NO" | "RETIRADA";
  licitacion?: "PRESENTADA" | "NO_PRESENTADA";
}

export interface ContractPersonalListItem {
  vinculacion_id: number;
  persona_id: number;
  numero_documento: string;
  nombre_completo: string;
  es_manipuladora: boolean;
  cargo: {
    nombre_cargo: string | null;
  };
  asignacion_actual: {
    nombre: string | null;
    institucion: string | null;
    municipio: string | null;
    sede: string | null;
    modalidad: string | null;
  };
  presentada_licitacion_actual: boolean;
  perfil_licitacion_actual: string | null;
  estado_vinculacion: VinculacionEstado;
  fecha_ingreso: string;
  fecha_fin: string | null;
}

export interface ContractPersonalListResponse {
  items: ContractPersonalListItem[];
  pagination: VinculacionPagination;
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

export interface ContractPersonalFilterOptions {
  municipios: Array<{ id: number; nombre: string }>;
  instituciones: Array<{ id: number; nombre: string; municipio_id: number | null }>;
  sedes: Array<{ id: number; nombre: string; institucion_id: number | null }>;
  modalidades: Array<{ id: number; codigo: string | null; nombre: string }>;
  ubicaciones_laborales: Array<{ id: number; nombre: string }>;
}
