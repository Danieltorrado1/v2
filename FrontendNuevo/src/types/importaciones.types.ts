export type MasterImportType = 'DATOS_PERSONALES' | 'INFORMACION_BANCARIA';
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
  | 'CAMBIO_CUENTA';

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
