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
  gestor_usuario_id?: number;
  sin_gestor?: boolean;
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
  gestor_actual: {
    nombre: string | null;
    usuario_id: number | null;
  } | null;
  cargo: {
    nombre_cargo: string | null;
  };
  asignacion_actual: {
    nombre: string | null;
    institucion: string | null;
    municipio_id: number | null;
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

export interface PersonalResumen {
  fecha_consulta: string;
  trabajadores_activos: number;
  ingresos_mes: number;
  retiros_mes: number;
  vacantes: number;
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
  motivo_cambio?: string | null;
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
  gestores: Array<{ id: number; nombre: string; roles: string[] }>;
  municipios: Array<{ id: number; nombre: string; departamento_id: number | null; departamento_nombre: string | null }>;
  instituciones: Array<{ id: number; nombre: string; municipio_id: number | null }>;
  sedes: Array<{ id: number; nombre: string; institucion_id: number | null }>;
  modalidades: Array<{ id: number; codigo: string | null; nombre: string }>;
  ubicaciones_laborales: Array<{ id: number; nombre: string }>;
}

export interface GestorAssignmentUser {
  activo: boolean;
  id: number;
  nombre: string;
  roles: string[];
}

export interface GestorMunicipioAssignment {
  activo: boolean;
  alcance_personal: "PERSONAL_SELECCIONADO" | "TODO_MUNICIPIO";
  contrato_id: number;
  created_at: string;
  created_by_user_id: number | null;
  gestor: {
    id: number;
    nombre: string | null;
  };
  id: number;
  municipio: {
    id: number;
    nombre: string | null;
    departamento_id: number | null;
    departamento_nombre: string | null;
  };
  observacion: string | null;
  updated_at: string;
  updated_by_user_id: number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface GestorPersonalAssignment {
  activo: boolean;
  contrato_id: number;
  created_at: string;
  created_by_user_id: number | null;
  gestor: {
    id: number;
    nombre: string | null;
  };
  id: number;
  municipio: {
    id: number | null;
    nombre: string | null;
  } | null;
  observacion: string | null;
  trabajador: {
    documento: string | null;
    nombre_completo: string | null;
    vinculacion_id: number;
  };
  updated_at: string;
  updated_by_user_id: number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface GestorAssignmentWorkspace {
  fecha_consulta: string;
  gestor_seleccionado_id: number | null;
  gestores: GestorAssignmentUser[];
  items: ContractPersonalListItem[];
  municipio_seleccionado_id: number | null;
  municipios: Array<{ id: number; nombre: string }>;
  resumen: {
    asignados_a_gestor: number;
    sin_gestor: number;
    total_trabajadores: number;
  };
}

export interface SaveGestorAssignmentsPayload {
  contrato_id: number;
  gestor_usuario_id: number;
  municipio_id: number;
  departamento_id?: number | null;
  fecha?: string;
  modo?: "SELECCION" | "REEMPLAZAR_MUNICIPIO";
  vinculacion_ids: number[];
  observacion?: string | null;
}

export interface SaveGestorAssignmentsResult {
  asignados: number;
  desasignados: number;
  fecha_efectiva: string;
  gestor_usuario_id: number;
  municipio_id: number;
}
