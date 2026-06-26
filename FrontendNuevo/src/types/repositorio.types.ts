// ── API shapes — /api/repositorio ────────────────────────────────────────────

export type RepositorioOrigen = 'persona' | 'vinculacion' | 'generado';
export type RepositorioEstadoDocumental = 'vigente' | 'vencido' | 'reemplazado' | 'sin_vencimiento';

export interface RepositorioPersonaResumenApi {
  id: number;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface RepositorioEmpresaResumenApi {
  id: number;
  tipo_empresa: string | null;
  nombre_empresa: string | null;
  nit: string | null;
  representante_legal: string | null;
  correo: string | null;
  telefono: string | null;
  ciudad: string | null;
}

export interface RepositorioContratoResumenApi {
  id: number;
  numero_contrato: string | null;
  numero_licitacion: string | null;
  entidad_contratante: string | null;
  fecha_inicio: string | null;
  fecha_finalizacion: string | null;
  objeto_contractual: string | null;
}

export interface RepositorioDocumentoApi {
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
  estado_documental: RepositorioEstadoDocumental;
  persona: RepositorioPersonaResumenApi | null;
  empresa: RepositorioEmpresaResumenApi | null;
  contrato: RepositorioContratoResumenApi | null;
}

export interface RepositorioDocumentoDetalleApi {
  documento: RepositorioDocumentoApi;
  metadata: {
    activo: boolean;
    contenido_generado: string | null;
    fecha_generacion: string | null;
    generado_por: number | null;
    plantilla_id: number | null;
  };
  relaciones: {
    documento_reemplaza: RepositorioDocumentoApi | null;
    documento_reemplazado_por: RepositorioDocumentoApi | null;
    documento_vigente: RepositorioDocumentoApi | null;
  };
}

export interface RepositorioDocumentosVersionesApi {
  documento: RepositorioDocumentoApi;
  note: string | null;
  versiones: RepositorioDocumentoApi[];
}

export interface RepositorioDocumentosPaginationApi {
  limit: number;
  page: number;
  total: number;
  total_pages: number;
}

export interface RepositorioDocumentosListApi {
  items: RepositorioDocumentoApi[];
  pagination: RepositorioDocumentosPaginationApi;
}

export interface RepositorioIndicadoresApi {
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

export interface RepositorioDownloadUrlApi {
  signed_url: string;
  expires_in: number;
  documento: {
    documento_id: number;
    origen: RepositorioOrigen;
  };
}

// ── Query params sent to backend ──────────────────────────────────────────────

export interface RepositorioFilters {
  search?: string;
  origen?: RepositorioOrigen;
  estado_documental?: RepositorioEstadoDocumental;
  es_vigente?: boolean;
  incluir_generados?: boolean;
  fecha_desde?: string;
  fecha_hasta?: string;
  empresa_id?: number;
  contrato_id?: number;
  persona_id?: number;
  vinculacion_id?: number;
  tipo_documento_id?: number;
  page?: number;
  limit?: number;
}

// ── Frontend helpers ──────────────────────────────────────────────────────────

export function buildNombrePersonaRepo(p: RepositorioPersonaResumenApi | null): string {
  if (!p) return '—';
  const parts = [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(' ');
  return parts || '—';
}

export function buildInicialesRepo(p: RepositorioPersonaResumenApi | null): string {
  if (!p) return '?';
  const a = p.primer_nombre?.[0] ?? '';
  const b = p.primer_apellido?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}
