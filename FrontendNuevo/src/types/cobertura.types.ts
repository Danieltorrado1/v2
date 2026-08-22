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

export interface CoberturaDashboard {
  fecha_consulta: string;
  kpis: { focalizacion_total: number; cobertura_requerida: number; asignadas: number; deficit_distribuido: number; exceso_distribuido: number; cumplimiento_nominal: number };
  estado_sede_modalidad: { completas: number; deficitarias: number; con_exceso: number; sin_personal: number };
  modalidades: Array<{ modalidad: string; sedes: number; sede_modalidades: number; asignadas: number; requeridas: number }>;
  municipios: Array<{ municipio: string; asignadas: number; requeridas: number }>;
  detalle: Array<{ focalizacion_final_id: number; municipio: string | null; institucion: string | null; sede: string | null; modalidad: string; requeridas: number; asignadas: number; diferencia: number; estado: string }>;
}

export interface FocalizacionComparisonItem {
  municipio: string | null; institucion: string; sede: string; modalidad_anterior: string | null; modalidad_nueva: string | null; focalizacion_anterior: number | null; focalizacion_nueva: number | null; delta_focalizacion: number; requeridas_antes: number | null; requeridas_ahora: number | null; delta_requeridas: number; tipo_cambio: string; personal_asignado_actual: number; impacto_personal: string;
}
export interface FocalizacionComparisonResult {
  resumen: { sedes_nuevas: number; sedes_retiradas: number; cambios_modalidad: number; aumentos: number; disminuciones: number; manipuladoras_adicionales: number; potencialmente_excedentes: number };
  filas: FocalizacionComparisonItem[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  graficos: { municipios: Array<{ municipio: string; anterior: number; nueva: number; requeridas_antes: number; requeridas_ahora: number }>; modalidades: Array<{ modalidad: string; requeridas_antes: number; requeridas_ahora: number }> };
}
