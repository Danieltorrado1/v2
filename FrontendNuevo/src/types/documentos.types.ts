// ── Raw API shapes — /api/documentos ──────────────────────────────────────────

export type DocumentoOrigen = 'PERSONA' | 'VINCULACION';
export type DocumentoScope  = 'PERSONA' | 'VINCULACION';

export interface DocumentoPersonaApi {
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: string;
  mime_type: string;
  nombre_original: string;
  persona_id: string;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  vinculacion_id: string | null;
  version: number;
  documento_reemplaza_id: string | null;
  es_vigente: boolean;
}

export interface DocumentoVinculacionApi {
  activo: boolean;
  archivo_path: string | null;
  contrato_cargo_id: string | null;
  contrato_id: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: string;
  mime_type: string;
  nombre_original: string;
  persona_id: string | null;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  vinculacion_id: string;
  version: number;
  es_vigente?: boolean;
  documento_reemplaza_id?: string | null;
}

export interface DocumentoDownloadInfoApi {
  document_scope: DocumentoScope;
  download_url: string;
  expires_in_seconds: number;
  id: string;
  mime_type: string;
  nombre_original: string;
}

// ── Upload payload (FormData fields sent to backend) ──────────────────────────

export interface DocumentoUploadFields {
  tipo_documento_id: string;
  fecha_expedicion?: string;
  fecha_vencimiento?: string;
}

// ── Normalized frontend types ─────────────────────────────────────────────────

export type DocumentoEstado = 'vigente' | 'vencido' | 'por_vencer' | 'inactivo';

export interface DocumentoListItem {
  id: string;
  origen: DocumentoOrigen;
  tipoNombre: string;
  nombreOriginal: string;
  version: number;
  esVigente: boolean;
  activo: boolean;
  fechaCarga: string | null;
  fechaExpedicion: string | null;
  fechaVencimiento: string | null;
  estado: DocumentoEstado;
  mimeType: string;
}

export function computeEstado(
  esVigente: boolean,
  activo: boolean,
  fechaVencimiento: string | null
): DocumentoEstado {
  if (!activo) return 'inactivo';
  if (!esVigente) return 'inactivo';
  if (!fechaVencimiento) return 'vigente';
  const today = new Date().toISOString().slice(0, 10);
  if (fechaVencimiento < today) return 'vencido';
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  if (fechaVencimiento <= soon.toISOString().slice(0, 10)) return 'por_vencer';
  return 'vigente';
}

export function normalizeDocumentoPersona(d: DocumentoPersonaApi): DocumentoListItem {
  return {
    id: d.id,
    origen: 'PERSONA',
    tipoNombre: d.tipo_documento_nombre ?? `Tipo ${d.tipo_documento_id}`,
    nombreOriginal: d.nombre_original,
    version: d.version,
    esVigente: d.es_vigente,
    activo: d.activo,
    fechaCarga: d.fecha_carga,
    fechaExpedicion: d.fecha_expedicion,
    fechaVencimiento: d.fecha_vencimiento,
    estado: computeEstado(d.es_vigente, d.activo, d.fecha_vencimiento),
    mimeType: d.mime_type,
  };
}

export function normalizeDocumentoVinculacion(d: DocumentoVinculacionApi): DocumentoListItem {
  return {
    id: d.id,
    origen: 'VINCULACION',
    tipoNombre: d.tipo_documento_nombre ?? `Tipo ${d.tipo_documento_id}`,
    nombreOriginal: d.nombre_original,
    version: d.version,
    esVigente: d.es_vigente ?? true,
    activo: d.activo,
    fechaCarga: d.fecha_carga,
    fechaExpedicion: d.fecha_expedicion,
    fechaVencimiento: d.fecha_vencimiento,
    estado: computeEstado(d.es_vigente ?? true, d.activo, d.fecha_vencimiento),
    mimeType: d.mime_type,
  };
}
