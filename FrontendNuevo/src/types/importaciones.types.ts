export type OperationalImportFilter = 'TODOS' | 'LISTOS' | 'REUTILIZADOS' | 'YA_VINCULADOS' | 'ERRORES';

export interface OperationalImportLote {
  id: number;
  estado: string;
  archivo_nombre: string;
  total_filas: number;
  filas_validas: number;
  filas_con_error: number;
  pendientes_confirmacion: number;
  puede_confirmar: boolean;
  contrato: {
    id: number;
    empresa_id: number;
    empresa_nombre: string | null;
    numero_contrato: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  } | null;
}

export interface OperationalImportPreviewRow {
  fila: number;
  tipo_documento: string | null;
  numero_documento: string | null;
  nombre: string | null;
  cargo_original: string | null;
  tipo_vinculacion_original: string | null;
  estado_persona: string;
  estado_vinculacion: string;
  resultado: string;
  mensaje: string;
  persona_id: number | null;
  vinculacion_id: number | null;
  ready_to_confirm: boolean;
  warnings: Array<{ field: string; code: string; message: string; severity: 'ERROR' | 'WARNING' }>;
  errors: Array<{ field: string; code: string; message: string; severity: 'ERROR' | 'WARNING' }>;
}

export interface OperationalImportSummary {
  total_filas: number;
  listas: number;
  personas_nuevas: number;
  personas_reutilizadas: number;
  ya_vinculadas: number;
  con_errores: number;
  duplicadas: number;
}

export interface OperationalImportPreviewResult {
  lote: OperationalImportLote;
  rows: OperationalImportPreviewRow[];
  summary: OperationalImportSummary;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    filter: OperationalImportFilter;
  };
}

export interface OperationalImportUploadResult {
  lote: OperationalImportLote;
  summary: OperationalImportSummary;
}

export interface OperationalImportConfirmResult {
  lote: OperationalImportLote;
  created_personas: number;
  reused_personas: number;
  created_vinculaciones: number;
  skipped_already_linked: number;
}

