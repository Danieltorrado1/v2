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
  fecha_finalizacion: string;
  objeto_contractual: string | null;
  aplica_cobertura: boolean;
  activo: boolean;
}

export interface ContratoFilters {
  activo?: boolean;
  empresa_id?: number;
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
  fecha_finalizacion: string;
  objeto_contractual?: string | null;
  aplica_cobertura?: boolean;
}

export interface UpdateContratoPayload {
  empresa_id?: number;
  numero_contrato?: string;
  numero_licitacion?: string | null;
  entidad_contratante?: string;
  fecha_inicio?: string;
  fecha_finalizacion?: string;
  objeto_contractual?: string | null;
  aplica_cobertura?: boolean;
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
  requiere_fecha_expedicion?: boolean;
  requiere_fecha_vencimiento?: boolean;
  categoria_documento?: string | null;
}

export interface CatalogoFilters {
  activo?: boolean;
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

export interface UpdateUsuarioPayload {
  email?: string;
  name?: string;
  active?: boolean;
  password?: string;
  roleIds?: string[];
}

export interface AccesoEmpresaUsuario {
  empresa_id: number;
  nombre_empresa: string;
  activo: boolean;
}

export interface AccesoContratoUsuario {
  contrato_id: number;
  numero_contrato: string | null;
  entidad_contratante: string | null;
  activo: boolean;
}

export interface AccesoUsuario {
  usuario: UsuarioAdministracion;
  empresas: AccesoEmpresaUsuario[];
  contratos: AccesoContratoUsuario[];
}
