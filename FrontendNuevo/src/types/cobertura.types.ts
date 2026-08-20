export interface FocalizacionImportSummary {
  total_filas: number;
  procesadas: number;
  aumentos: number;
  disminuciones: number;
  sin_cambio: number;
  nuevas: number;
  alertas: number;
  errores: number;
}

export interface FocalizacionImportLote {
  id: number;
  contrato_id: number;
  contrato_nombre: string | null;
  empresa_id: number;
  empresa_nombre: string | null;
  nombre_archivo: string;
  estado: string;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  fecha_recepcion: string | null;
  fecha_importacion: string;
  total_filas: number;
  filas_procesadas: number;
  filas_alerta: number;
  filas_error: number;
  resumen: FocalizacionImportSummary;
}

export interface FocalizacionImportRowDetail {
  id: number;
  fila: number;
  municipio: string | null;
  institucion: string;
  sede: string;
  consecutivo: string | null;
  modalidad: string;
  focalizacion_total: number;
  focalizacion_primaria: number | null;
  focalizacion_secundaria: number | null;
  techo_total: number | null;
  estado: string;
  comparacion: string | null;
  mensaje: string;
  cobertura_requerida: number | null;
  focalizacion_vigencia_id: number | null;
}

export interface FocalizacionImportDetailResult {
  lote: FocalizacionImportLote;
  rows: FocalizacionImportRowDetail[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    filter: string;
  };
}

export interface FocalizacionImportListResult {
  items: FocalizacionImportLote[];
}

export interface FocalizacionUploadResult {
  lote: FocalizacionImportLote;
  rows: FocalizacionImportRowDetail[];
}
