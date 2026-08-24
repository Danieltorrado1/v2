export type MasterImportType =
  | 'DATOS_PERSONALES'
  | 'INFORMACION_BANCARIA'
  | 'CARACTERIZACION_SST';
export type MasterImportStatus = 'PREPARADO' | 'VALIDADO' | 'APLICADO' | 'CANCELADO' | 'ERROR';
export type MasterImportFilter =
  | 'TODOS'
  | 'NUEVAS'
  | 'ACTUALIZACIONES'
  | 'SIN_CAMBIOS'
  | 'ERRORES'
  | 'DUPLICADOS'
  | 'APLICABLES';
export type MasterImportClassification =
  | 'NUEVA'
  | 'ACTUALIZACION'
  | 'SIN_CAMBIOS'
  | 'ERROR'
  | 'POSIBLE_DUPLICADO'
  | 'CUENTA_NUEVA'
  | 'CAMBIO_CUENTA'
  | 'CONFLICTO';

export interface MasterImportColumnSuggestion {
  header: string;
  suggested_field: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MasterImportAnalyzeResult {
  detected_headers: string[];
  sample_rows: number;
  total_rows: number;
  suggestions: MasterImportColumnSuggestion[];
  required_fields: string[];
}

export interface MasterImportDiff {
  field: string;
  label: string;
  current_value: string | null;
  next_value: string | null;
}

export interface MasterImportIssue {
  field: string;
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface MasterImportLote {
  id: number;
  tipo: MasterImportType;
  estado: MasterImportStatus;
  archivo_nombre: string;
  archivo_sha256: string | null;
  total_filas: number;
  filas_validas: number;
  filas_con_error: number;
  resumen: Record<string, unknown> | null;
  contrato: {
    id: number;
    empresa_id: number;
    empresa_nombre: string | null;
    numero_contrato: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface MasterImportAnalyzeResponse {
  lote: MasterImportLote;
  analysis: MasterImportAnalyzeResult;
}

export interface MasterImportPreviewRow {
  fila: number;
  tipo_documento: string | null;
  numero_documento: string | null;
  nombre: string | null;
  clasificacion: MasterImportClassification;
  requiere_accion: boolean;
  diffs: MasterImportDiff[];
  errores: MasterImportIssue[];
  advertencias: MasterImportIssue[];
  entidad_id: number | null;
  referencia_secundaria_id: number | null;
  resultado_aplicacion: string | null;
  mensaje_aplicacion: string | null;
}

export interface MasterImportPreviewSummary {
  total_filas: number;
  nuevas: number;
  actualizaciones: number;
  sin_cambios: number;
  errores: number;
  posibles_duplicados: number;
}

export interface MasterImportPreviewResponse {
  lote: MasterImportLote;
  rows: MasterImportPreviewRow[];
  summary: MasterImportPreviewSummary;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    filter: MasterImportFilter;
  };
}

export interface MasterImportApplyResponse {
  lote: MasterImportLote;
  applied_rows: number;
  created_personas: number;
  updated_personas: number;
  created_bank_accounts: number;
  updated_bank_accounts: number;
  created_sst_profiles: number;
  updated_sst_profiles: number;
  skipped_rows: number;
}

export interface MasterImportListResponse {
  items: MasterImportLote[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface SstPreparationSummary {
  automaticos: number;
  parciales: number;
  revision: number;
  sin_datos: number;
  pendientes_captura: number;
  contactos_propuestos: number;
  formacion_propuesta: number;
  afiliaciones_propuestas: number;
}

export interface SstReviewCaseItem {
  id: number;
  preparacion_id: number | null;
  persona_id: number | null;
  contrato_id: number | null;
  empresa_id: number | null;
  documento: string;
  persona_nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  cargo: string | null;
  tipo_conflicto: 'FORMULARIOS' | 'DUPLICADO_F2' | 'AFILIACION';
  campo: string;
  fuente_a: string;
  valor_a: string | null;
  fuente_b: string;
  valor_b: string | null;
  recomendacion: string | null;
  decision: string | null;
  valor_resuelto: string | null;
  estado: 'PENDIENTE' | 'RESUELTO' | 'DESCARTADO';
  observacion: string | null;
  fecha_resolucion: string | null;
  resuelto_por_user_id: number | null;
  updated_at: string;
}

export interface SstPreparationPlanItem {
  id: number;
  persona_id: number;
  vinculacion_id: number | null;
  contrato_id: number;
  empresa_id: number;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  cargo: string | null;
  fuente_formulario_1: boolean;
  fuente_formulario_2: boolean;
  estado_digital: string;
  estado_preparacion: string;
  porcentaje_completitud: number;
  completitud_estado: string;
  requiere_captura: boolean;
  apto_apply: boolean;
  conflictos_reales: number;
  propuesta_sst: Record<string, unknown>;
  propuesta_contacto_emergencia: Record<string, unknown>;
  propuesta_formacion_academica: Array<Record<string, unknown>>;
  propuesta_afiliaciones: Array<Record<string, unknown>>;
  campos_restringidos: Array<string> | Record<string, unknown>;
  fuentes: Array<string>;
}

export interface PaginatedSstPreparationResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
