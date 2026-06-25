// ─── Core enums ──────────────────────────────────────────────────────────────

export type EstadoDocumento  = 'vigente' | 'vencido' | 'por_vencer' | 'pendiente';
export type OrigenDocumento  = 'personal' | 'expediente' | 'vinculacion' | 'sst' | 'nomina' | 'portal' | 'contrato';
export type VistaRepositorio = 'tabla' | 'cards' | 'expediente' | 'requisitos';
export type TipoPaquete      = 'interventoria' | 'licitacion' | 'auditoria' | 'contratacion' | 'sst' | 'nomina' | 'personalizado';

// ─── Documents ───────────────────────────────────────────────────────────────

export interface DocumentoRepositorio {
  id: number;
  persona_id: number;
  tipo_documento: string;
  categoria: 'identificacion' | 'laboral' | 'sst' | 'nomina' | 'formacion' | 'otro';
  nombre_archivo: string;
  estado: EstadoDocumento;
  fecha_expedicion?: string;
  fecha_vencimiento?: string;
  dias_para_vencer?: number;   // computed from fecha_vencimiento
  fecha_carga: string;
  ultima_actualizacion: string;
  origen: OrigenDocumento;
  version: number;
  aplica_interventoria: boolean;
  aplica_licitacion: boolean;
  aplica_auditoria: boolean;
  aplica_sst: boolean;
  aplica_nomina: boolean;
  observaciones?: string;
}

// ─── Persons ─────────────────────────────────────────────────────────────────

export interface PersonaRepositorio {
  id: number;
  nombre_completo: string;
  iniciales: string;
  numero_documento: string;
  tipo_doc_identidad: string;
  cargo: string;
  empresa: string;
  empresa_id: number;
  contrato: string;
  contrato_id: number;
  municipio: string;
  tipo_vinculacion: string;
  estado_vinculacion: string;
  total_requeridos: number;
  documentos: DocumentoRepositorio[];
}

// Computed helpers (derived from documentos array)
export interface PersonaStats {
  vigentes: number;
  vencidos: number;
  por_vencer: number;
  pendientes: number;
  cumplimiento: number;
}

export function getPersonaStats(p: PersonaRepositorio): PersonaStats {
  const vigentes   = p.documentos.filter(d => d.estado === 'vigente').length;
  const vencidos   = p.documentos.filter(d => d.estado === 'vencido').length;
  const por_vencer = p.documentos.filter(d => d.estado === 'por_vencer').length;
  const cargados   = vigentes + vencidos + por_vencer;
  const pendientes = Math.max(0, p.total_requeridos - cargados);
  const cumplimiento = p.total_requeridos > 0
    ? Math.round(((vigentes + por_vencer) / p.total_requeridos) * 100)
    : 0;
  return { vigentes, vencidos, por_vencer, pendientes, cumplimiento };
}

// ─── Packages ────────────────────────────────────────────────────────────────

export interface PaqueteDocumental {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: TipoPaquete;
  empresa?: string;
  contrato?: string;
  municipio?: string;
  requisitos: string[];
  personas_ids: number[];
  cantidad_documentos: number;
  fecha_creacion: string;
  usuario_creador: string;
  estado: 'activo' | 'exportado' | 'archivado';
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface FiltrosRepositorio {
  empresa: string;
  contrato: string;
  municipio: string;
  cargo: string;
  tipo_vinculacion: string;
  estado_vinculacion: string;
  persona: string;
  numero_documento: string;
  tipo_documental: string;
  estado_documento: string;
  vigencia: 'todos' | 'vigentes' | 'vencidos' | 'por_vencer' | 'pendientes';
  aplica_interventoria: boolean;
  aplica_licitacion: boolean;
  aplica_auditoria: boolean;
  aplica_sst: boolean;
  aplica_nomina: boolean;
}

export const DEFAULT_FILTROS: FiltrosRepositorio = {
  empresa: '', contrato: '', municipio: '', cargo: '',
  tipo_vinculacion: '', estado_vinculacion: '',
  persona: '', numero_documento: '',
  tipo_documental: '', estado_documento: '',
  vigencia: 'todos',
  aplica_interventoria: false, aplica_licitacion: false,
  aplica_auditoria: false, aplica_sst: false, aplica_nomina: false,
};

// ─── Catalogs ────────────────────────────────────────────────────────────────

export const TIPOS_DOCUMENTALES = [
  'Cédula de Ciudadanía',
  'Hoja de Vida',
  'Certificación Bancaria',
  'Afiliación ARL',
  'Afiliación EPS',
  'Certificado Antecedentes',
  'Curso Manipulación Alimentos',
  'Examen Médico de Ingreso',
  'Contrato de Trabajo',
  'Inducción Empresarial',
  'Título Profesional',
  'Tarjeta Profesional',
  'Dotación y EPP',
  'Evaluación de Desempeño',
];

export const TIPO_PAQUETE_LABEL: Record<TipoPaquete, string> = {
  interventoria: 'Interventoría',
  licitacion:    'Licitación',
  auditoria:     'Auditoría',
  contratacion:  'Contratación',
  sst:           'SST',
  nomina:        'Nómina',
  personalizado: 'Personalizado',
};

export const ORIGEN_LABEL: Record<OrigenDocumento, string> = {
  personal:    'Personal',
  expediente:  'Expediente',
  vinculacion: 'Vinculación',
  sst:         'SST',
  nomina:      'Nómina',
  portal:      'Portal',
  contrato:    'Contrato',
};
