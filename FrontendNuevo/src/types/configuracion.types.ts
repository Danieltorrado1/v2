export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedItems<T> {
  items: T[];
  pagination: PaginationState;
}

export interface Empresa {
  id: number;
  tipo_empresa: string;
  nombre_empresa: string;
  nit: string;
  representante_legal: string | null;
  documento_representante: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
  activo: boolean;
}

export interface EmpresaFilters {
  activo?: boolean;
  alcance?: string | null;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateEmpresaPayload {
  tipo_empresa: string;
  nombre_empresa: string;
  nit: string;
  representante_legal?: string | null;
  documento_representante?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  departamento?: string | null;
}

export interface UpdateEmpresaPayload {
  tipo_empresa?: string;
  nombre_empresa?: string;
  nit?: string;
  representante_legal?: string | null;
  documento_representante?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  departamento?: string | null;
}

export interface Contrato {
  id: number;
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  numero_contrato: string;
  numero_licitacion: string | null;
  entidad_contratante: string;
  fecha_inicio: string;
  fecha_finalizacion: string | null;
  fecha_final_estimada: string | null;
  fecha_final_real: string | null;
  estado_contractual: string;
  contrato_padre_id: number | null;
  objeto_contractual: string | null;
  observaciones: string | null;
  aplica_cobertura: boolean;
  activo: boolean;
}

export interface ContratoFilters {
  activo?: boolean;
  empresa_id?: number;
  estado_contractual?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateContratoPayload {
  empresa_id: number;
  numero_contrato: string;
  numero_licitacion?: string | null;
  entidad_contratante: string;
  fecha_inicio: string;
  fecha_finalizacion?: string | null;
  fecha_final_estimada?: string | null;
  fecha_final_real?: string | null;
  estado_contractual?: string;
  contrato_padre_id?: number | null;
  objeto_contractual?: string | null;
  observaciones?: string | null;
  aplica_cobertura?: boolean;
}

export interface UpdateContratoPayload {
  empresa_id?: number;
  numero_contrato?: string;
  numero_licitacion?: string | null;
  entidad_contratante?: string;
  fecha_inicio?: string;
  fecha_finalizacion?: string | null;
  fecha_final_estimada?: string | null;
  fecha_final_real?: string | null;
  estado_contractual?: string;
  contrato_padre_id?: number | null;
  objeto_contractual?: string | null;
  observaciones?: string | null;
  aplica_cobertura?: boolean;
}

export interface CreateContratoEventoPayload {
  tipo_evento: string;
  fecha_evento: string;
  fecha_efecto_desde?: string | null;
  fecha_efecto_hasta?: string | null;
  descripcion?: string | null;
  motivo?: string | null;
  documento_soporte_id?: number;
  cambios_contrato?: {
    fecha_final_estimada?: string | null;
    fecha_final_real?: string | null;
    observaciones?: string | null;
    estado_contractual?: string;
  };
}

export interface AnularContratoEventoPayload {
  motivo: string;
}

export interface UploadContratoDocumentoPayload {
  requisito_id?: number;
  tipo_documento_id: string | number;
  categoria?: 'CREACION_EMPRESA_JURIDICA' | 'INICIO_CONTRATO' | 'EJECUCION' | 'CIERRE';
  fecha_expedicion?: string | null;
  fecha_vencimiento?: string | null;
  vigencia_dias_configurada?: number | null;
  observaciones?: string | null;
}

export interface ReviewContratoDocumentoPayload {
  estado?: 'EN_REVISION' | 'APROBADO';
  observacion?: string | null;
}

export interface DevolverContratoDocumentoPayload {
  motivo: string;
  observacion?: string | null;
}

export interface AnularContratoDocumentoPayload {
  motivo: string;
}

export interface CreateContratoExcepcionPayload {
  requisito_id?: number;
  documento_id?: number;
  soporte_documento_id?: number;
  motivo: string;
  fecha_limite_regularizacion: string;
  observaciones?: string | null;
}

export interface RegularizarContratoExcepcionPayload {
  observaciones?: string | null;
}

export interface RevocarContratoExcepcionPayload {
  motivo: string;
  observaciones?: string | null;
}

export interface ContratoDocumentoDownloadUrl {
  url: string;
}

export interface ContratoEventoMutationResult {
  contrato: Contrato;
  evento: ContratoEventoRecord | null;
}

export interface ContratoEventoRecord {
  id: number;
  tipo_evento: string;
  fecha_evento: string | null;
  fecha_efecto_desde: string | null;
  fecha_efecto_hasta: string | null;
  descripcion: string | null;
  motivo: string | null;
  documento_soporte_id: number | null;
  estado_evento: string;
  motivo_anulacion: string | null;
  activo: boolean;
  anulado_at: string | null;
  created_at: string | null;
  usuario_creador: {
    id: number | null;
    nombre: string | null;
  };
}

export interface ContratoDocumentoRecord {
  id: number;
  contrato_id: number;
  requisito_id: number | null;
  categoria: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  fecha_carga: string | null;
  version: number;
  documento_reemplaza_id: number | null;
  es_vigente: boolean;
  estado_revision: string;
  estado_documental: string;
  motivo_devolucion: string | null;
  revisado_at?: string | null;
  revisado_por?: {
    id: number | null;
    nombre: string | null;
  };
  observaciones: string | null;
  activo: boolean;
  tipo_documento: {
    id: number;
    codigo: string | null;
    nombre: string | null;
  };
}

export interface ContratoExcepcionRecord {
  id: number;
  contrato_id: number;
  requisito: {
    id: number | null;
    nombre: string | null;
  };
  documento: {
    id: number | null;
    nombre_original: string | null;
  };
  motivo: string;
  usuario_autorizador: {
    id: number;
    nombre: string | null;
  };
  fecha_autorizacion: string | null;
  fecha_limite_regularizacion: string | null;
  soporte_documento_id: number | null;
  estado: string;
  observaciones: string | null;
  regularizacion?: {
    at: string | null;
    by: {
      id: number | null;
      nombre: string | null;
    };
  };
  revocacion?: {
    at: string | null;
    by: {
      id: number | null;
      nombre: string | null;
    };
  };
  motivo_revocacion: string | null;
}

export interface ContratoChecklistItem {
  requisito_id: number;
  categoria: string;
  nombre_requisito: string;
  obligatorio: boolean;
  criticidad: string;
  responsable: string | null;
  bloquea_creacion: boolean;
  bloquea_inicio: boolean;
  bloquea_ejecucion: boolean;
  bloquea_cierre: boolean;
  estado: string;
  fecha_vencimiento: string | null;
  observacion: string | null;
  documento_actual: ContratoDocumentoRecord | null;
  excepcion_actual: ContratoExcepcionRecord | null;
  tipo_documento?: {
    id: number | null;
    codigo: string | null;
    nombre: string | null;
    alcance?: string | null;
  };
}

export interface ContratoChecklistData {
  items: ContratoChecklistItem[];
  completitud_porcentaje: number;
  resumen: {
    cumplidos: number;
    pendientes: number;
    vencidos: number;
    en_revision: number;
    devueltos: number;
    aprobado_provisional: number;
    no_aplica: number;
  };
}

export interface ContratoAlertaRecord {
  id: number;
  tipo_alerta: string;
  severidad: string;
  estado: string;
  titulo: string;
  descripcion: string;
  fecha_alerta: string | null;
  fecha_vencimiento: string | null;
  dias_restantes: number | null;
  ruta_accion: string;
}

export interface ContratoDetail {
  contrato: Contrato;
  resumen: {
    completitud_porcentaje: number;
    proximos_vencimientos: ContratoDocumentoRecord[];
    requisitos_criticos: ContratoChecklistItem[];
    ultimas_actuaciones: ContratoEventoRecord[];
  };
  expediente: {
    categorias: Array<{
      categoria: string;
      documentos: ContratoDocumentoRecord[];
    }>;
  };
  checklist: ContratoChecklistData;
  eventos: PaginatedItems<ContratoEventoRecord>;
  excepciones: ContratoExcepcionRecord[];
  alertas: ContratoAlertaRecord[];
}

export interface ContratoCargo {
  id: number;
  nombre_cargo: string;
  cantidad_requerida: number | null;
  aplica_cobertura: boolean;
  activo: boolean;
  contrato: {
    id: number;
    numero_contrato: string | null;
  };
  empresa: {
    id: number | null;
    nombre_empresa: string | null;
  };
}

export interface ContratoUbicacionLaboral {
  id: number;
  contrato_id: number;
  nombre_ubicacion: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContratoPerfilLicitacion {
  id: number;
  contrato_id: number;
  codigo_perfil: string;
  nombre_perfil: string;
  cantidad_requerida: number;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  contrato_cargo_equivalente: {
    id: number | null;
    nombre_cargo: string | null;
  };
}

export interface CreateContratoUbicacionLaboralPayload {
  nombre_ubicacion: string;
  descripcion?: string | null;
  activo?: boolean;
}

export interface UpdateContratoUbicacionLaboralPayload {
  nombre_ubicacion?: string;
  descripcion?: string | null;
  activo?: boolean;
}

export interface CreateContratoPerfilLicitacionPayload {
  codigo_perfil: string;
  nombre_perfil: string;
  cantidad_requerida: number;
  vigencia_desde: string;
  vigencia_hasta?: string | null;
  contrato_cargo_equivalente_id?: number | null;
  activo?: boolean;
}

export interface UpdateContratoPerfilLicitacionPayload {
  codigo_perfil?: string;
  nombre_perfil?: string;
  cantidad_requerida?: number;
  vigencia_desde?: string;
  vigencia_hasta?: string | null;
  contrato_cargo_equivalente_id?: number | null;
  activo?: boolean;
}

export interface CargoFilters {
  activo?: boolean;
  contrato_id?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCargoPayload {
  contrato_id: number;
  nombre_cargo: string;
  cantidad_requerida?: number | null;
  aplica_cobertura?: boolean;
}

export interface UpdateCargoPayload {
  contrato_id?: number;
  nombre_cargo?: string;
  cantidad_requerida?: number | null;
  aplica_cobertura?: boolean;
}

export interface CatalogoItem {
  id: number;
  label: string;
  codigo?: string;
  codigo_dane?: string;
  departamento_id?: number;
  activo?: boolean;
  alcance?: string | null;
  es_identificacion_personal?: boolean;
  requiere_fecha_expedicion?: boolean;
  requiere_fecha_vencimiento?: boolean;
  categoria_documento?: string | null;
}

export type AmbitoDocumental = 'PERSONA' | 'VINCULACION';

export interface ContratoRequisitoDocumental {
  id: number;
  contrato_id: number;
  nombre_requisito: string;
  ambito_documental: AmbitoDocumental;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  vigencia_meses: number | null;
  dias_proximo_vencimiento: number;
  activo: boolean;
  updated_at: string;
  tipo_documento: {
    id: number;
    codigo: string | null;
    nombre: string | null;
    alcance: string | null;
  };
  cargo: {
    id: number | null;
    nombre: string | null;
  };
  tipo_vinculacion: {
    id: number | null;
    codigo: string | null;
    nombre: string | null;
  };
}

export interface ContratoRequisitoDocumentalFilters {
  activo?: boolean;
  contrato_cargo_id?: number;
  tipo_vinculacion_id?: number;
}

export interface CreateContratoRequisitoDocumentalPayload {
  tipo_documento_id: number;
  ambito_documental: AmbitoDocumental;
  obligatorio?: boolean;
  contrato_cargo_id?: number | null;
  tipo_vinculacion_id?: number | null;
  requiere_fecha_expedicion?: boolean;
  requiere_fecha_vencimiento?: boolean;
  vigencia_meses?: number | null;
  dias_proximo_vencimiento?: number;
  activo?: boolean;
}

export interface UpdateContratoRequisitoDocumentalPayload {
  tipo_documento_id?: number;
  ambito_documental?: AmbitoDocumental;
  obligatorio?: boolean;
  contrato_cargo_id?: number | null;
  tipo_vinculacion_id?: number | null;
  requiere_fecha_expedicion?: boolean;
  requiere_fecha_vencimiento?: boolean;
  vigencia_meses?: number | null;
  dias_proximo_vencimiento?: number;
  activo?: boolean;
}

export interface CatalogoFilters {
  activo?: boolean;
  es_identificacion_personal?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface MunicipioFilters extends CatalogoFilters {
  departamento_id?: number;
}

export interface Departamento extends CatalogoItem {
  codigo_dane?: string;
}

export interface Municipio extends CatalogoItem {
  codigo_dane?: string;
  departamento_id?: number;
}

export interface MetodoPagoPermitido {
  valor: string;
  etiqueta: string;
}

export interface Rol {
  id: number;
  nombre_rol: string;
  descripcion: string | null;
  activo: boolean;
  permissions: string[];
}

export interface Permiso {
  id: number;
  modulo: string;
  accion: string;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
}

export interface UsuarioAdministracion {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AccesoEmpresaUsuario {
  empresa_id: number;
  nombre_empresa: string;
  activo: boolean;
}

export interface AccesoContratoUsuario {
  contrato_id: number;
  empresa_id: number;
  numero_contrato: string | null;
  entidad_contratante: string | null;
  activo: boolean;
}

export interface UsuarioAdminRecord extends UsuarioAdministracion {
  primaryRole: string | null;
  roleIds: string[];
  isGlobalAdmin: boolean;
  empresaIds: number[];
  empresas: AccesoEmpresaUsuario[];
  contratoIds: number[];
  contratos: AccesoContratoUsuario[];
}

export interface CreateUsuarioAdminPayload {
  email: string;
  name: string;
  password: string;
  active?: boolean;
  roleIds: string[];
  empresaIds: number[];
  contratoIds: number[];
}

export interface UpdateUsuarioAdminPayload {
  email?: string;
  name?: string;
  active?: boolean;
  roleIds?: string[];
  empresaIds?: number[];
  contratoIds?: number[];
}

export interface UpdateUsuarioPasswordPayload {
  password: string;
}

export interface UpdateUsuarioEstadoPayload {
  active: boolean;
}

export interface AccesoUsuario {
  usuario: UsuarioAdministracion;
  empresas: AccesoEmpresaUsuario[];
  contratos: AccesoContratoUsuario[];
}
