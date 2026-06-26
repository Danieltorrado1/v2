import type { PersonaApi, VinculacionApi } from './personas.types';

// ── Risk ──────────────────────────────────────────────────────────────────────

export type RiesgoNivel = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';

export interface ExpedienteRiesgoDocumentalApi {
  causas: string[];
  nivel: RiesgoNivel;
  puntaje: number;
}

// ── Indicators ────────────────────────────────────────────────────────────────

export interface ExpedienteIndicadoresApi {
  alertas_activas: number;
  alertas_altas: number;
  alertas_bajas: number;
  alertas_criticas: number;
  alertas_medias: number;
  alertas_resueltas: number;
  alertas_total: number;
  auditoria_eventos: number;
  checklist_cargados: number;
  checklist_cumplimiento_promedio: number;
  checklist_faltantes: number;
  checklist_total_requisitos: number;
  checklist_vencidos: number;
  documentos_persona: number;
  documentos_por_vencer_30_dias: number;
  documentos_reemplazados: number;
  documentos_sin_vencimiento: number;
  documentos_total: number;
  documentos_vencidos: number;
  documentos_vigentes: number;
  documentos_vinculacion: number;
  riesgo_documental: ExpedienteRiesgoDocumentalApi;
  vinculaciones_activas: number;
  vinculaciones_retiradas: number;
  vinculaciones_suspendidas: number;
  vinculaciones_total: number;
}

// ── Checklist ─────────────────────────────────────────────────────────────────

export type ChecklistEstado = 'CARGADO' | 'FALTANTE' | 'VENCIDO';
export type ChecklistOrigen = 'GENERAL' | 'CARGO';
export type DocFuente = 'PERSONA' | 'VINCULACION';

export interface ChecklistItemApi {
  codigo: string | null;
  documento_id: number | null;
  estado: ChecklistEstado;
  fecha_vencimiento: string | null;
  fuente_documento: DocFuente | null;
  nombre_requisito: string;
  observacion: string | null;
  obligatorio: boolean;
  origen: ChecklistOrigen;
  requisito_id: number;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  tipo_requisito: string | null;
}

export interface VinculacionChecklistApi {
  cargados: number;
  contrato_cargo_id: number;
  contrato_id: number;
  cumplimiento_porcentaje: number;
  faltantes: number;
  persona_id: number;
  requisitos: ChecklistItemApi[];
  total_requisitos: number;
  vinculacion_id: number;
  vencidos: number;
}

export interface ChecklistPorVinculacionApi {
  checklist: VinculacionChecklistApi;
  vinculacion_id: number;
}

// ── Alertas ───────────────────────────────────────────────────────────────────

export interface ExpedienteAlertaItemApi {
  activo: boolean;
  contrato_id: number | null;
  contrato_numero: string | null;
  created_at: string | null;
  descripcion: string | null;
  dias_restantes: number | null;
  empresa_id: number | null;
  empresa_nombre: string | null;
  estado: string;
  fecha_alerta: string | null;
  fecha_vencimiento: string | null;
  id: number;
  persona_id: number | null;
  persona_nombre: string | null;
  severidad: string;
  tipo_alerta: string;
  tipo_documento_codigo: string | null;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  titulo: string;
  updated_at: string | null;
  vinculacion_id: number | null;
}

// ── Auditoría ─────────────────────────────────────────────────────────────────

export interface ExpedienteAuditoriaItemApi {
  accion: string;
  after: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  contrato_id: number | null;
  created_at: string | null;
  descripcion: string;
  empresa_id: number | null;
  entidad: string;
  entidad_id: string;
  fecha_evento: string | null;
  id: number;
  ip_address: string | null;
  modulo: string;
  user_agent: string | null;
  usuario: { email: string | null; id: number | null; nombre: string | null };
}

// ── Documentos ────────────────────────────────────────────────────────────────

export interface ExpedienteDocumentoPersonaApi {
  archivo_path: string | null;
  documento_reemplaza_id: number | null;
  es_vigente: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string | null;
  persona_id: number;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento: { codigo: string; id: number; nombre_documento: string };
  tipo_documento_id: number;
  version: number;
  vinculacion_id: number | null;
}

export interface ExpedienteDocumentoVinculacionApi {
  activo: boolean;
  archivo_path: string | null;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento: { codigo: string; id: number; nombre_documento: string };
  tipo_documento_id: number;
  vinculacion_id: number;
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface ExpedienteTimelineItemApi {
  descripcion: string | null;
  fecha: string;
  metadata: Record<string, unknown>;
  referencia: { entidad: string; id: string };
  tipo: string;
  titulo: string;
}

export interface ExpedientePersonaTimelineApi {
  items: ExpedienteTimelineItemApi[];
  persona_id: number;
  total: number;
}

// ── Download ──────────────────────────────────────────────────────────────────

export interface DocumentoDownloadInfoApi {
  document_scope: 'PERSONA' | 'VINCULACION';
  download_url: string;
  expires_in_seconds: number;
  id: string;
  mime_type: string;
  nombre_original: string;
}

// ── Consolidado ───────────────────────────────────────────────────────────────

export interface ExpedienteLaboralConsolidadoApi {
  auditoria: ExpedienteAuditoriaItemApi[];
  checklist_por_vinculacion: ChecklistPorVinculacionApi[];
  documentos_persona: ExpedienteDocumentoPersonaApi[];
  documentos_vinculacion: ExpedienteDocumentoVinculacionApi[];
  evaluaciones: Record<string, unknown>;
  expediente: Record<string, unknown>;
  indicadores: ExpedienteIndicadoresApi;
  nomina: Record<string, unknown>;
  persona: PersonaApi;
  sst: Record<string, unknown>;
  vinculaciones: VinculacionApi[];
}
