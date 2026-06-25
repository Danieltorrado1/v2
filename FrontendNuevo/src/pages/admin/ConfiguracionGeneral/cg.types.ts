export type EstadoGeneral = 'activo' | 'inactivo';

// ─── Empresa ─────────────────────────────────────────────────────────────────

export interface Empresa {
  id: number;
  nombre: string;
  nit: string;
  representante_legal: string;
  direccion: string;
  telefono: string;
  correo: string;
  estado: EstadoGeneral;
  observaciones?: string;
  creado_en: string;
}

// ─── Contrato ─────────────────────────────────────────────────────────────────

export type EstadoContrato = EstadoGeneral | 'por_vencer';

export interface Contrato {
  id: number;
  empresa_id: number;
  numero_contrato: string;
  cliente: string;
  objeto_contractual: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: EstadoContrato;
  municipios: string[];
  observaciones?: string;
}

// ─── Roles y Permisos ─────────────────────────────────────────────────────────

export type NombrePermiso = 'ver' | 'crear' | 'editar' | 'eliminar' | 'exportar' | 'aprobar' | 'gestionar';

export const PERMISOS_LIST: NombrePermiso[] = [
  'ver', 'crear', 'editar', 'eliminar', 'exportar', 'aprobar', 'gestionar',
];

export const MODULOS_SISTEMA: string[] = [
  'Dashboard', 'Personal', 'Nómina', 'Herramientas', 'SST', 'Portal', 'Repositorio', 'Administración',
];

export type PermisoModulo = {
  modulo: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
  aprobar: boolean;
  gestionar: boolean;
};

export interface Rol {
  id: number;
  nombre: string;
  descripcion: string;
  estado: EstadoGeneral;
  es_sistema: boolean;
  permisos: PermisoModulo[];
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number;
  nombre_completo: string;
  correo: string;
  rol_id: number;
  empresa_id: number;
  municipios_asignados: string[];
  estado: EstadoGeneral;
  ultimo_acceso?: string;
  creado_en: string;
}

// ─── Catálogos ───────────────────────────────────────────────────────────────

export interface CatalogoItem {
  id: number;
  nombre: string;
  codigo?: string;
  descripcion?: string;
  estado: EstadoGeneral;
}

export type TipoCatalogo =
  | 'tipos_vinculacion'
  | 'estados_vinculacion'
  | 'tipos_documento'
  | 'niveles_estudio'
  | 'eps'
  | 'arl'
  | 'fondos_pension'
  | 'cajas_compensacion'
  | 'zonas'
  | 'municipios'
  | 'departamentos';

export const CATALOGOS_CONFIG: { id: TipoCatalogo; label: string; showCodigo?: boolean }[] = [
  { id: 'tipos_vinculacion',   label: 'Tipos de Vinculación',     showCodigo: true },
  { id: 'estados_vinculacion', label: 'Estados de Vinculación' },
  { id: 'tipos_documento',     label: 'Tipos de Documento',       showCodigo: true },
  { id: 'niveles_estudio',     label: 'Niveles de Estudio' },
  { id: 'eps',                 label: 'EPS' },
  { id: 'arl',                 label: 'ARL' },
  { id: 'fondos_pension',      label: 'Fondos de Pensión' },
  { id: 'cajas_compensacion',  label: 'Cajas de Compensación' },
  { id: 'zonas',               label: 'Zonas' },
  { id: 'municipios',          label: 'Municipios' },
  { id: 'departamentos',       label: 'Departamentos',            showCodigo: true },
];

// ─── Cargos ──────────────────────────────────────────────────────────────────

export const TIPOS_CARGO = ['Operativo', 'Profesional', 'Supervisión', 'Coordinación', 'Administrativo', 'Técnico'];

export interface Cargo {
  id: number;
  empresa_id: number;
  contrato_id: number;
  nombre: string;
  tipo_cargo: string;
  cantidad_requerida: number;
  aplica_cobertura: boolean;
  aplica_nomina: boolean;
  aplica_portal: boolean;
  salario_base?: number;
  estado: EstadoGeneral;
}

// ─── Requisitos Documentales ─────────────────────────────────────────────────

export interface RequisitoDocumental {
  id: number;
  nombre_documento: string;
  aplica_empresa: boolean;
  aplica_contrato: boolean;
  aplica_cargo: boolean;
  aplica_tipo_vinculacion: boolean;
  obligatorio: boolean;
  vigencia_dias?: number;
  renovacion_automatica: boolean;
  alerta_dias_antes?: number;
  estado: EstadoGeneral;
}

// ─── Salarios ────────────────────────────────────────────────────────────────

export interface SalarioPersonal {
  id: number;
  version: number;
  empresa_id: number;
  contrato_id?: number;
  cargo_id?: number;
  tipo_vinculacion?: string;
  salario_base: number;
  auxilio_transporte: number;
  auxilios_adicionales: number;
  valor_dia: number;
  valor_turno: number;
  recargos: number;
  deducciones: number;
  vigencia_desde: string;
  vigencia_hasta?: string;
  estado: EstadoGeneral;
}

// ─── Municipios Asignados ────────────────────────────────────────────────────

export interface MunicipioAsignado {
  id: number;
  usuario_id: number;
  municipio: string;
  empresa_id: number;
  contrato_id?: number;
  estado: EstadoGeneral;
  fecha_asignacion: string;
}
