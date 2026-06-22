export type RepositorioOrigen = 'persona' | 'vinculacion' | 'generado';

export type EstadoDocumental = 'vigente' | 'vencido' | 'reemplazado' | 'sin_vencimiento';

export interface RepositorioPersonaResumen {
  id: number;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface RepositorioEmpresaResumen {
  id: number;
  tipo_empresa: string | null;
  nombre_empresa: string | null;
  nit: string | null;
  representante_legal: string | null;
  correo: string | null;
  telefono: string | null;
  ciudad: string | null;
}

export interface RepositorioContratoResumen {
  id: number;
  numero_contrato: string | null;
  numero_licitacion: string | null;
  entidad_contratante: string | null;
  fecha_inicio: string | null;
  fecha_finalizacion: string | null;
  objeto_contractual: string | null;
}

export interface RepositorioDocumento {
  origen: RepositorioOrigen;
  documento_id: number;
  persona_id: number | null;
  vinculacion_id: number | null;
  empresa_id: number | null;
  contrato_id: number | null;
  tipo_documento_id: number | null;
  nombre_tipo_documento: string | null;
  nombre_archivo: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  archivo_path: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  fecha_carga: string | null;
  version: number | null;
  documento_reemplaza_id: number | null;
  es_vigente: boolean | null;
  estado_documental: EstadoDocumental;
  persona: RepositorioPersonaResumen | null;
  empresa: RepositorioEmpresaResumen | null;
  contrato: RepositorioContratoResumen | null;
}

export interface RepositorioDocumentoDetalle {
  documento: RepositorioDocumento;
  metadata: {
    activo: boolean;
    contenido_generado: string | null;
    fecha_generacion: string | null;
    generado_por: number | null;
    plantilla_id: number | null;
  };
  relaciones: {
    documento_reemplaza: RepositorioDocumento | null;
    documento_reemplazado_por: RepositorioDocumento | null;
    documento_vigente: RepositorioDocumento | null;
  };
}

export interface RepositorioDocumentosPagination {
  limit: number;
  page: number;
  total: number;
  total_pages: number;
}

export interface RepositorioDocumentosListResult {
  items: RepositorioDocumento[];
  pagination: RepositorioDocumentosPagination;
}

export interface RepositorioDocumentosVersionesResult {
  documento: RepositorioDocumento;
  note: string | null;
  versiones: RepositorioDocumento[];
}

export interface RepositorioDocumentosIndicadoresResult {
  total_documentos: number;
  total_persona: number;
  total_vinculacion: number;
  total_generados: number;
  vigentes: number;
  vencidos: number;
  reemplazados: number;
  sin_vencimiento: number;
  por_vencer_30_dias: number;
  total_alertas_activas: number;
  alertas_criticas: number;
  documentos_por_tipo: Array<{
    nombre_tipo_documento: string | null;
    tipo_documento_id: number | null;
    total: number;
  }>;
  documentos_por_empresa: Array<{
    empresa_id: number | null;
    nombre_empresa: string | null;
    total: number;
  }>;
  documentos_por_contrato: Array<{
    contrato_id: number | null;
    numero_contrato: string | null;
    total: number;
  }>;
}

export interface RepositorioDocumentosExportResult {
  csv: string;
  total: number;
}

export interface RepositorioDownloadUrlResult {
  signed_url: string;
  expires_in: number;
  documento: {
    documento_id: number;
    origen: RepositorioOrigen;
  };
}

export interface RepositorioAuditMeta {
  ip_address?: string | null;
  user_agent?: string | null;
}
