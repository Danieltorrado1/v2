import PDFDocument from 'pdfkit';
import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { registerAuditEvent } from '../auditoria/auditoria.service';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import {
  inclusiveDaysBetween,
  maxDateString,
  minDateString
} from './nomina.calculator';
import { buildCsv, buildSectionedCsv } from './nomina.exporter';
import {
  CreateNominaRecargoInput,
  CreateNominaMovimientoInput,
  CreateNominaNovedadInput,
  CreateNominaPeriodoInput,
  EstadoLiquidacion,
  ListNominaAsistenciaQuery,
  NominaExportTipo,
  NominaRecargoTipo,
  ListNominaMovimientosQuery,
  UpdateNominaAsistenciaInput,
  ListNominaEmpleadosQuery,
  ListNominaLiquidacionesQuery,
  ListNominaNovedadesQuery,
  ListNominaPeriodosQuery,
  UpdateNominaEmpleadoInput,
  UpdateNominaMovimientoInput,
  UpdateNominaNovedadInput,
  UpdateNominaPeriodoInput
} from './nomina.schemas';
import {
  ensureContratoExists,
  ensureVinculacionExists
} from './nomina.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface NominaPeriodoEmployeesSummaryRow extends QueryResultRow {
  total_activos: number;
  total_no_revisados: number;
  total_pendientes_sin_revisar: number;
  total_revisados: number;
}

interface NominaPeriodoAsistenciaPendienteRow extends QueryResultRow {
  nombre_completo: string;
  nomina_empleado_id: string;
  numero_documento: string | null;
  pendientes: number;
  vinculacion_id: string;
}

interface NominaPeriodoRealRow extends QueryResultRow {
  activo: boolean;
  contrato_empresa_id: string | null;
  contrato_entidad_contratante: string | null;
  contrato_fecha_finalizacion: Date | string | null;
  contrato_fecha_inicio: Date | string | null;
  contrato_id: string;
  contrato_numero: string | null;
  created_at: Date | string;
  estado: string;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  nombre_periodo: string;
  requiere_asistencia: boolean;
  tipo_periodo: string;
}

interface NominaEmpleadoRealRow extends QueryResultRow {
  activo: boolean;
  auxilio_transporte: number | string | null;
  cargo_id: string | null;
  cargo_nombre: string | null;
  categoria_auxilio_transporte: number | string | null;
  categoria_codigo: string | null;
  categoria_id: string | null;
  categoria_modalidad: string | null;
  categoria_nombre: string | null;
  categoria_otros_recargos: number | string | null;
  categoria_salario_base: number | string | null;
  created_at: Date | string;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  dias_pagados: number | string | null;
  dias_periodo: number | string | null;
  estado: string | null;
  fecha_fin_pago: Date | string | null;
  fecha_fin_vinculacion: Date | string | null;
  fecha_inicio_pago: Date | string | null;
  fecha_inicio_vinculacion: Date | string | null;
  horas_extra_total: number | string | null;
  horas_trabajadas: number | string | null;
  id: string;
  metodo_liquidacion: string | null;
  motivo_caso_especial: string | null;
  neto_pagar: number | string | null;
  otros_devengos: number | string | null;
  pension: number | string | null;
  periodo_id: string;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  revisado: boolean | null;
  salario_base: number | string | null;
  salud: number | string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
  vinculacion_contrato_id: string;
  vinculacion_empresa_id: string;
  vinculacion_estado: string | null;
  vinculacion_id: string;
  vinculacion_metodo_pago: string | null;
}

interface ContratoScopeRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

interface ImportCandidateRow extends QueryResultRow {
  cargo_id: string | null;
  categoria_auxilio_transporte: number | string | null;
  categoria_id: string | null;
  categoria_salario_base: number | string | null;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  metodo_pago: string | null;
  persona_id: string;
  vinculacion_id: string;
}

interface NominaEmpleadoContextRow extends QueryResultRow {
  id: string;
  periodo_contrato_id: string;
  periodo_estado: string;
  periodo_id: string;
}

interface NominaTipoNovedadRow extends QueryResultRow {
  activo: boolean | null;
  afecta_salario: boolean | null;
  afecta_transporte: boolean | null;
  categoria: string | null;
  created_at: Date | string;
  es_adicion: boolean | null;
  es_deduccion: boolean | null;
  id: string;
  nombre: string | null;
  requiere_dias: boolean | null;
  requiere_fechas: boolean | null;
  requiere_horas: boolean | null;
  requiere_valor: boolean | null;
}

interface NominaNovedadRealRow extends QueryResultRow {
  activo: boolean | null;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  cubierta: boolean | null;
  created_at: Date | string;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string | null;
  horas: number | string | null;
  id: string;
  nomina_empleado_id: string;
  observacion: string | null;
  periodo_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  requiere_cobertura: boolean | null;
  revisado: boolean | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  tipo_novedad_activo: boolean | null;
  tipo_novedad_afecta_salario: boolean | null;
  tipo_novedad_afecta_transporte: boolean | null;
  tipo_novedad_categoria: string | null;
  tipo_novedad_es_adicion: boolean | null;
  tipo_novedad_es_deduccion: boolean | null;
  tipo_novedad_id: string;
  tipo_novedad_nombre: string | null;
  tipo_novedad_requiere_dias: boolean | null;
  tipo_novedad_requiere_fechas: boolean | null;
  tipo_novedad_requiere_horas: boolean | null;
  tipo_novedad_requiere_valor: boolean | null;
  valor_manual: number | string | null;
  vinculacion_id: string;
}

interface NominaAsistenciaRealRow extends QueryResultRow {
  activo: boolean | null;
  cargo_id: string | null;
  cargo_nombre: string | null;
  created_at: Date | string;
  estado_dia: string | null;
  fecha: Date | string;
  hora_ingreso: string | null;
  hora_salida: string | null;
  horas_trabajadas: number | string | null;
  id: string;
  observacion: string | null;
  periodo_contrato_id: string;
  periodo_estado: string;
  periodo_id: string;
  periodo_nombre: string;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  vinculacion_id: string;
}

interface NominaMovimientoRealRow extends QueryResultRow {
  activo: boolean | null;
  afecta_seguridad_social: boolean | null;
  cantidad: number | string | null;
  created_at: Date | string;
  descripcion: string | null;
  es_deduccion: boolean | null;
  es_devengado: boolean | null;
  fecha: Date | string | null;
  id: string;
  nomina_empleado_id: string;
  periodo_contrato_id: string;
  periodo_estado: string;
  periodo_id: string;
  periodo_nombre: string;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  tipo_movimiento: string;
  valor_total: number | string | null;
  valor_unitario: number | string | null;
  vinculacion_id: string;
}

interface NominaLiquidacionRealRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  auxilio_transporte: number | string | null;
  cesantias: number | string | null;
  contrato_empresa_id: string | null;
  contrato_entidad_contratante: string | null;
  contrato_id: string;
  contrato_numero: string | null;
  created_at: Date | string;
  deducciones: number | string | null;
  dias_base_liquidacion: number | string | null;
  dias_trabajados: number | string | null;
  dias_vacaciones_pendientes: number | string | null;
  documento_persona_id: string | null;
  estado: string;
  fecha_fin_vinculacion: Date | string | null;
  fecha_inicio_vinculacion: Date | string | null;
  fecha_retiro: Date | string | null;
  id: string;
  intereses_cesantias: number | string | null;
  motivo_retiro: string | null;
  observacion: string | null;
  otros_devengos: number | string | null;
  periodo_estado: string;
  periodo_fecha_fin: Date | string;
  periodo_fecha_inicio: Date | string;
  periodo_id: string;
  periodo_nombre: string;
  persona_id: string;
  persona_numero_documento: string | null;
  pension_deduccion_empleado: number | string | null;
  prima_servicios: number | string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  promedio_auxilio_transporte: number | string | null;
  promedio_salario: number | string | null;
  salario_base: number | string | null;
  salud_deduccion_empleado: number | string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  total_liquidacion: number | string | null;
  vacaciones: number | string | null;
  vinculacion_estado: string | null;
  vinculacion_id: string;
}

interface TipoDocumentoNominaRow extends QueryResultRow {
  codigo: string;
  id: string;
  nombre_documento: string | null;
}

interface NominaDesprendibleRealRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  auxilio_transporte: number | string | null;
  cargo_nombre: string | null;
  contrato_id: string;
  contrato_empresa_id: string | null;
  contrato_entidad_contratante: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  desprendible_reemplaza_id: string | null;
  dias_pagados: number | string | null;
  documento_persona_id: string | null;
  dp_mime_type: string | null;
  dp_nombre_original: string | null;
  dp_storage_bucket: string | null;
  dp_storage_path: string | null;
  dp_tamano_bytes: number | string | null;
  empresa_nit: string | null;
  empresa_nombre: string | null;
  es_vigente: boolean | null;
  estado: string;
  fecha_generacion: Date | string | null;
  id: string;
  neto_pagar: number | string | null;
  nomina_empleado_id: string;
  observacion: string | null;
  periodo_estado: string;
  periodo_fecha_fin: Date | string;
  periodo_fecha_inicio: Date | string;
  periodo_id: string;
  periodo_nombre: string;
  pension: number | string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  revisado: boolean | null;
  salario_base: number | string | null;
  salud: number | string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  tipo_desprendible: string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
  version: number | string | null;
  vinculacion_id: string;
}

interface NominaEmpleadoImportRow extends QueryResultRow {
  auxilio_transporte_snapshot: number;
  cargo_nombre_snapshot: string | null;
  contrato_cargo_id: string;
  contrato_id: string;
  contrato_nombre_snapshot: string | null;
  empresa_id: string;
  estado_vinculacion_snapshot: string;
  fecha_fin_vinculacion_snapshot: Date | string | null;
  fecha_inicio_vinculacion_snapshot: Date | string;
  persona_id: string;
  persona_nombre_snapshot: string;
  salario_base_snapshot: number;
  vinculacion_id: string;
}

interface NominaDesprendibleGenerateRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string | null;
  cargo_nombre: string | null;
  contrato_empresa_id: string;
  contrato_entidad_contratante: string | null;
  contrato_id: string;
  contrato_numero: string | null;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  dias_pagados: number | string | null;
  empresa_nit: string | null;
  empresa_nombre: string | null;
  neto_pagar: number | string | null;
  nomina_empleado_id: string;
  periodo_estado: string;
  periodo_fecha_fin: Date | string;
  periodo_fecha_inicio: Date | string;
  periodo_id: string;
  periodo_nombre: string;
  pension: number | string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  revisado: boolean | null;
  salario_base: number | string | null;
  salud: number | string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
  vinculacion_id: string;
}

interface NominaDesprendibleNovedadRow extends QueryResultRow {
  dias: number | string | null;
  horas: number | string | null;
  nomina_empleado_id: string;
  observacion: string | null;
  tipo_novedad_nombre: string | null;
  valor_manual: number | string | null;
}

interface NominaAuditRow extends QueryResultRow {
  id: string;
}

export interface NominaPeriodo {
  activo: boolean;
  contrato: {
    empresa_id: string | null;
    entidad_contratante: string | null;
    fecha_finalizacion: string | null;
    fecha_inicio: string | null;
    id: string;
    numero_contrato: string | null;
  } | null;
  contrato_id: string | null;
  created_at: string;
  estado: string;
  fecha_fin: string;
  fecha_inicio: string;
  id: string;
  nombre_periodo: string;
  requiere_asistencia: boolean;
  tipo_periodo: string;
  descripcion?: string | null;
  empresa_id?: string | null;
  fecha_cierre?: string | null;
  nombre?: string;
  updated_at?: string;
}

export interface NominaEmpleado {
  activo: boolean;
  auxilio_transporte: number;
  categoria_salarial: {
    auxilio_transporte: number;
    codigo_categoria: string | null;
    id: string;
    modalidad: string | null;
    nombre_categoria: string | null;
    otros_recargos: number;
    salario_base: number;
  } | null;
  created_at: string;
  devengado_basico: number;
  devengado_otros: number;
  devengado_transporte: number;
  dias_pagados: number;
  dias_periodo: number;
  estado: string | null;
  fecha_fin_pago: string | null;
  fecha_inicio_pago: string | null;
  horas_extra_total: number;
  horas_trabajadas: number;
  id: string;
  metodo_liquidacion: string | null;
  motivo_caso_especial: string | null;
  neto_pagar: number;
  otros_devengos: number;
  pension: number;
  periodo_id: string;
  persona: {
    id: string;
    nombre_completo: string;
    numero_documento: string | null;
    primer_apellido: string | null;
    primer_nombre: string | null;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
  };
  revisado: boolean;
  salario_base: number;
  salud: number;
  total_adiciones: number;
  total_deducciones: number;
  vinculacion: {
    contrato_id: string;
    empresa_id: string;
    estado_vinculacion: string | null;
    fecha_fin: string | null;
    fecha_inicio: string | null;
    id: string;
    metodo_pago: string | null;
  };
  vinculacion_id: string;
  auxilio_transporte_snapshot?: number;
  cargo?: {
    id: string | null;
    nombre_cargo: string | null;
  } | null;
  cargo_nombre_snapshot?: string | null;
  contrato_cargo_id?: string;
  contrato_id?: string;
  contrato_nombre_snapshot?: string | null;
  empresa_id?: string;
  estado_vinculacion_snapshot?: string;
  fecha_fin_vinculacion_snapshot?: string | null;
  fecha_inicio_vinculacion_snapshot?: string;
  persona_id?: string;
  persona_nombre_snapshot?: string;
  salario_base_snapshot?: number;
  updated_at?: string;
}

export interface NominaNovedad {
  activo: boolean;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  cubierta: boolean;
  created_at: string;
  dias: number | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  horas: number | null;
  id: string;
  nomina_empleado_id: string;
  observacion: string | null;
  periodo_id: string;
  persona: {
    nombre_completo: string;
    numero_documento: string | null;
    primer_apellido: string | null;
    primer_nombre: string | null;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
  };
  requiere_cobertura: boolean;
  revisado: boolean;
  tipo_novedad: {
    activo: boolean;
    afecta_salario: boolean;
    afecta_transporte: boolean;
    categoria: string | null;
    es_adicion: boolean;
    es_deduccion: boolean;
    id: string;
    nombre: string | null;
    requiere_dias: boolean;
    requiere_fechas: boolean;
    requiere_horas: boolean;
    requiere_valor: boolean;
  };
  valor_manual: number | null;
  vinculacion_id: string;
}

export interface NominaAsistencia {
  activo: boolean;
  cargo: {
    id: string | null;
    nombre_cargo: string | null;
  } | null;
  created_at: string;
  estado_dia: string | null;
  fecha: string;
  hora_ingreso: string | null;
  hora_salida: string | null;
  horas_trabajadas: number;
  id: string;
  observacion: string | null;
  periodo: {
    estado: string;
    id: string;
    nombre_periodo: string;
  };
  periodo_id: string;
  persona: {
    id: string;
    nombre_completo: string;
    numero_documento: string | null;
    primer_apellido: string | null;
    primer_nombre: string | null;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
  };
  vinculacion: {
    id: string;
  };
  vinculacion_id: string;
}

export interface NominaMovimiento {
  activo: boolean;
  afecta_seguridad_social: boolean;
  cantidad: number | null;
  created_at: string;
  descripcion: string | null;
  es_deduccion: boolean;
  es_devengado: boolean;
  fecha: string | null;
  id: string;
  nomina_empleado_id: string;
  periodo: {
    estado: string;
    id: string;
    nombre_periodo: string;
  };
  periodo_id: string;
  persona: {
    id: string;
    nombre_completo: string;
    numero_documento: string | null;
  };
  tipo_movimiento: string;
  valor_total: number;
  valor_unitario: number | null;
  vinculacion: {
    id: string;
  };
  vinculacion_id: string;
}

export interface NominaLiquidacion {
  activo: boolean;
  archivo_path: string | null;
  auxilio_transporte: number;
  cesantias: number;
  contrato: {
    empresa_id: string | null;
    entidad_contratante: string | null;
    id: string;
    numero_contrato: string | null;
  };
  contrato_id: string;
  created_at: string;
  deducciones: number;
  dias_base_liquidacion: number;
  dias_trabajados: number;
  dias_vacaciones_pendientes: number;
  documento_persona_id: string | null;
  estado: string;
  fecha_fin_vinculacion: string | null;
  fecha_inicio_vinculacion: string | null;
  fecha_retiro: string | null;
  id: string;
  intereses_cesantias: number;
  motivo_retiro: string | null;
  observacion: string | null;
  otros_devengos: number;
  periodo: {
    estado: string;
    fecha_fin: string;
    fecha_inicio: string;
    id: string;
    nombre_periodo: string;
  };
  periodo_id: string;
  persona: {
    id: string;
    nombre_completo: string;
    numero_documento: string | null;
    primer_apellido: string | null;
    primer_nombre: string | null;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
  };
  persona_id: string;
  prima_servicios: number;
  promedio_auxilio_transporte: number;
  promedio_salario: number;
  salario_base: number;
  total_deducciones: number;
  total_liquidacion: number;
  vacaciones: number;
  vinculacion: {
    estado_vinculacion: string | null;
    fecha_fin: string | null;
    fecha_inicio: string | null;
    id: string;
    motivo_retiro: string | null;
  };
  vinculacion_id: string;
  auxilio_transporte_snapshot: number;
  cargo_nombre_snapshot: string | null;
  contrato_nombre_snapshot: string | null;
  deduccion_pension: number;
  deduccion_salud: number;
  devengado_salario: number;
  devengado_transporte: number;
  dias_con_transporte: number;
  dias_liquidados: number;
  empresa_id: string | null;
  fecha_fin_vinculacion_snapshot?: string | null;
  fecha_inicio_vinculacion_snapshot?: string;
  neto_pagar: number;
  novedades_snapshot: Record<string, unknown> | null;
  persona_nombre_snapshot: string;
  salario_base_snapshot: number;
  total_adiciones: number;
  total_devengado: number;
  updated_at?: string;
  valor_dia_salario: number;
  valor_dia_transporte: number;
}

export interface NominaDesprendible {
  activo: boolean;
  archivo_path: string | null;
  created_at: string;
  documento: {
    documento_persona_id: string | null;
    mime_type: string | null;
    nombre_original: string | null;
    signed_url?: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    tamano_bytes: number | null;
  };
  empresa: {
    nit: string | null;
    nombre_empresa: string | null;
  };
  es_vigente: boolean;
  estado: string;
  fecha_generacion: string | null;
  id: string;
  liquidacion_id?: string | null;
  nomina_empleado_id: string;
  observacion: string | null;
  payload_snapshot: Record<string, unknown>;
  periodo: {
    estado: string;
    fecha_fin: string;
    fecha_inicio: string;
    id: string;
    nombre_periodo: string;
  };
  periodo_id: string;
  neto_pagar: number;
  pension: number;
  persona: {
    id: string;
    nombre_completo: string;
    numero_documento: string | null;
  };
  persona_id: string;
  revisado: boolean;
  salario_base: number;
  salario_base_snapshot: number;
  salud: number;
  tipo_desprendible: string | null;
  total_adiciones: number;
  total_deducciones: number;
  total_devengado: number;
  version: number;
  vinculacion: {
    id: string;
  };
  desprendible_reemplaza_id: string | null;
  vinculacion_id: string;
  dias_liquidados: number;
  devengado_salario: number;
  devengado_transporte: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface NominaImportEmployeesResult {
  imported: number;
  periodo: NominaPeriodo;
  skipped_duplicates: number;
}

export interface NominaRecalculateResult {
  liquidaciones_generadas: number;
  periodo: NominaPeriodo;
  empleados_procesados: number;
  omitidas_activas?: number;
  omitidas_fuera_periodo?: number;
}

export interface NominaExportResult {
  csv: string;
  file_name: string;
}

export interface NominaGenerateDesprendiblesResult {
  desprendibles_generados: number;
  periodo: NominaPeriodo;
}

export interface NominaFinalizeDesprendiblesResult {
  desprendibles_finalizados: number;
  periodo: NominaPeriodo;
}

export interface NominaGenerateAsistenciaResult {
  dias_generados: number;
  duplicados_omitidos: number;
  empleados_asistencia: number;
  empleados_procesados: number;
  omitidos_no_asistencia: number;
}

export interface NominaDashboard {
  asistencia: {
    ausentes: number;
    incapacidades: number;
    pendientes: number;
    permisos: number;
    presentes: number;
    suspensiones: number;
  };
  empleados_pendientes: number;
  empleados_revisados: number;
  empleados_total: number;
  estado_periodo: string;
  total_deducciones: number;
  total_desprendibles: number;
  total_devengado: number;
  total_movimientos: number;
  total_neto: number;
  total_novedades: number;
  total_otros: number;
  total_pension: number;
  total_salud: number;
  total_transporte: number;
}

export interface NominaPlanillaPdfResult {
  expires_in: number;
  mime_type: 'application/pdf';
  signed_url: string | null;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
}

const NOMINA_DESPRENDIBLES_BUCKET = 'documentos';
const NOMINA_PLANILLA_PDF_EXPIRES_IN = 300;
const NOMINA_PLANO_BANCARIO_HEADERS = [
  'tipo_documento',
  'numero_documento',
  'nombre_completo',
  'banco',
  'tipo_cuenta',
  'numero_cuenta',
  'valor_pagar',
  'periodo',
  'contrato'
];
const NOMINA_DASHBOARD_EXPORT_HEADERS = [
  'empleados_total',
  'empleados_revisados',
  'empleados_pendientes',
  'total_devengado',
  'total_deducciones',
  'total_neto',
  'total_salud',
  'total_pension',
  'total_transporte',
  'total_otros',
  'total_novedades',
  'total_movimientos',
  'total_desprendibles',
  'asistencia_presentes',
  'asistencia_ausentes',
  'asistencia_pendientes',
  'asistencia_incapacidades',
  'asistencia_permisos',
  'asistencia_suspensiones',
  'estado_periodo'
];
const NOMINA_RECARGO_FACTORS: Record<NominaRecargoTipo, number> = {
  HORA_EXTRA_DIURNA: 1.25,
  HORA_EXTRA_NOCTURNA: 1.75,
  RECARGO_NOCTURNO: 0.35,
  DOMINICAL: 1.75,
  FESTIVO: 1.75
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const toNumberValue = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toOptionalNumberValue = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return toNumberValue(value);
};

const toBooleanValue = (value: boolean | null | undefined): boolean => {
  return value === true;
};

const normalizeFullName = (...parts: Array<string | null | undefined>): string => {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ');
};

const normalizeNominaNovedadNombre = (value: string | null | undefined): string => {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const NOMINA_NOVEDADES_REDUCEN_SALARIO = new Set([
  'PERMISO NO REMUNERADO',
  'SUSPENSION'
]);

const NOMINA_NOVEDADES_REDUCEN_OTROS_RECARGOS = new Set([
  'PERMISO NO REMUNERADO',
  'SUSPENSION',
  'INCAPACIDAD MEDICA',
  'INCAPACIDAD POR ACCIDENTE LABORAL',
  'LICENCIA MATERNIDAD/PATERNIDAD'
]);

const NOMINA_ASISTENCIA_DIAS_PAGADOS = new Set([
  'PRESENTE',
  'INCAPACIDAD',
  'PERMISO',
  'DESCANSO',
  'VACACIONES',
  'LICENCIA'
]);

const listDateStringsBetween = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);

  while (current.getTime() <= endDate.getTime()) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

const NOMINA_PERIODO_ESTADOS_EDITABLES = new Set(['ABIERTO']);
const NOMINA_PERIODO_ESTADOS_DESPRENDIBLES = new Set(['ABIERTO', 'REVISADO']);
const NOMINA_PERIODO_ESTADOS_POST_CIERRE = new Set(['CERRADO', 'PAGADO']);

const normalizePeriodoEstado = (estado: string | null | undefined): string => {
  return (estado ?? '').trim().toUpperCase();
};

const assertPeriodoAllowsOpenMutations = (estado: string, action: string): void => {
  const normalizedEstado = normalizePeriodoEstado(estado);

  if (NOMINA_PERIODO_ESTADOS_EDITABLES.has(normalizedEstado)) {
    return;
  }

  throw new AppError(
    `Payroll period in state ${normalizedEstado || 'DESCONOCIDO'} does not allow ${action}`,
    409,
    'NOMINA_PERIODO_CERRADO'
  );
};

const assertPeriodoAllowsDesprendibleGeneration = (estado: string): void => {
  const normalizedEstado = normalizePeriodoEstado(estado);

  if (NOMINA_PERIODO_ESTADOS_DESPRENDIBLES.has(normalizedEstado)) {
    return;
  }

  throw new AppError(
    `Payroll period in state ${normalizedEstado || 'DESCONOCIDO'} does not allow generating payroll slips`,
    409,
    'NOMINA_PERIODO_CERRADO'
  );
};

const assertPeriodoAllowsPostCloseOutputs = (estado: string, action: string): void => {
  const normalizedEstado = normalizePeriodoEstado(estado);

  if (NOMINA_PERIODO_ESTADOS_POST_CIERRE.has(normalizedEstado)) {
    return;
  }

  throw new AppError(
    `Payroll period in state ${normalizedEstado || 'DESCONOCIDO'} does not allow ${action}`,
    409,
    'NOMINA_PERIODO_CERRADO'
  );
};

const assertPeriodoAllowsRecalculate = (
  estado: string,
  force: boolean,
  tenant?: TenantAccessContext
): { forced: boolean } => {
  const normalizedEstado = normalizePeriodoEstado(estado);

  if (normalizedEstado === 'ABIERTO') {
    return { forced: false };
  }

  if (normalizedEstado === 'REVISADO' && force && tenant?.isGlobalAdmin) {
    return { forced: true };
  }

  throw new AppError(
    `Payroll period in state ${normalizedEstado || 'DESCONOCIDO'} does not allow recalculation`,
    409,
    'NOMINA_PERIODO_CERRADO'
  );
};

const hasTenantContractAccess = (
  tenant: TenantAccessContext | undefined,
  contratoId: number,
  empresaId: number | null
): boolean => {
  if (!tenant || tenant.isGlobalAdmin) {
    return true;
  }

  if (tenant.contratoIds.includes(contratoId)) {
    return true;
  }

  return empresaId !== null && tenant.empresaIds.includes(empresaId);
};

const appendTenantScopeConditions = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  contratoColumn: string,
  empresaColumn: string
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  const scopeConditions: string[] = [];

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    scopeConditions.push(`${contratoColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    scopeConditions.push(`${empresaColumn} = ANY($${params.length}::bigint[])`);
  }

  if (scopeConditions.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  conditions.push(`(${scopeConditions.join(' OR ')})`);
};

const buildSqlWhere = (conditions: string[]): string => {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
};

const getNominaPeriodosRealSelect = (): string => {
  return `
    SELECT
      np.id::text AS id,
      np.contrato_id::text AS contrato_id,
      np.nombre_periodo,
      np.fecha_inicio,
      np.fecha_fin,
      np.tipo_periodo,
      COALESCE(np.requiere_asistencia, FALSE) AS requiere_asistencia,
      np.estado,
      COALESCE(np.activo, TRUE) AS activo,
      np.created_at,
      c.empresa_id::text AS contrato_empresa_id,
      c.numero_contrato AS contrato_numero,
      c.entidad_contratante AS contrato_entidad_contratante,
      c.fecha_inicio AS contrato_fecha_inicio,
      c.fecha_finalizacion AS contrato_fecha_finalizacion
    FROM nomina_periodos np
    INNER JOIN contratos c ON c.id = np.contrato_id
  `;
};

const getNominaEmpleadosRealSelect = (): string => {
  return `
    SELECT
      ne.id::text AS id,
      ne.periodo_id::text AS periodo_id,
      ne.vinculacion_id::text AS vinculacion_id,
      ne.metodo_liquidacion,
      ne.categoria_salarial_id::text AS categoria_id,
      ne.salario_base,
      ne.auxilio_transporte,
      ne.otros_devengos,
      ne.fecha_inicio_pago,
      ne.fecha_fin_pago,
      ne.dias_periodo,
      ne.dias_pagados,
      ne.horas_trabajadas,
      ne.horas_extra_total,
      ne.devengado_basico,
      ne.devengado_transporte,
      ne.devengado_otros,
      ne.total_adiciones,
      ne.total_deducciones,
      ne.salud,
      ne.pension,
      ne.neto_pagar,
      COALESCE(ne.revisado, FALSE) AS revisado,
      ne.estado,
      COALESCE(ne.activo, TRUE) AS activo,
      ne.created_at,
      ne.motivo_caso_especial,
      v.persona_id::text AS persona_id,
      v.empresa_id::text AS vinculacion_empresa_id,
      v.contrato_id::text AS vinculacion_contrato_id,
      v.contrato_cargo_id::text AS cargo_id,
      v.fecha_inicio AS fecha_inicio_vinculacion,
      v.fecha_fin AS fecha_fin_vinculacion,
      v.estado_vinculacion AS vinculacion_estado,
      v.metodo_pago AS vinculacion_metodo_pago,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      cc.nombre_cargo AS cargo_nombre,
      ncs.codigo_categoria AS categoria_codigo,
      ncs.nombre_categoria AS categoria_nombre,
      ncs.modalidad AS categoria_modalidad,
      ncs.salario_base AS categoria_salario_base,
      ncs.auxilio_transporte AS categoria_auxilio_transporte,
      ncs.otros_recargos AS categoria_otros_recargos
    FROM nomina_empleados ne
    INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
    LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
  `;
};

const getNominaNovedadesRealSelect = (): string => {
  return `
    SELECT
      nn.id::text AS id,
      nn.periodo_id::text AS periodo_id,
      nn.nomina_empleado_id::text AS nomina_empleado_id,
      nn.vinculacion_id::text AS vinculacion_id,
      nn.tipo_novedad_id::text AS tipo_novedad_id,
      nn.fecha_inicio,
      nn.fecha_fin,
      nn.dias,
      nn.horas,
      nn.valor_manual,
      nn.categoria_anterior_id::text AS categoria_anterior_id,
      nn.categoria_nueva_id::text AS categoria_nueva_id,
      nn.observacion,
      COALESCE(nn.revisado, FALSE) AS revisado,
      COALESCE(nn.activo, TRUE) AS activo,
      nn.created_at,
      COALESCE(nn.requiere_cobertura, FALSE) AS requiere_cobertura,
      COALESCE(nn.cubierta, FALSE) AS cubierta,
      ntn.nombre AS tipo_novedad_nombre,
      ntn.categoria AS tipo_novedad_categoria,
      COALESCE(ntn.afecta_salario, FALSE) AS tipo_novedad_afecta_salario,
      COALESCE(ntn.afecta_transporte, FALSE) AS tipo_novedad_afecta_transporte,
      COALESCE(ntn.es_adicion, FALSE) AS tipo_novedad_es_adicion,
      COALESCE(ntn.es_deduccion, FALSE) AS tipo_novedad_es_deduccion,
      COALESCE(ntn.requiere_fechas, FALSE) AS tipo_novedad_requiere_fechas,
      COALESCE(ntn.requiere_dias, FALSE) AS tipo_novedad_requiere_dias,
      COALESCE(ntn.requiere_horas, FALSE) AS tipo_novedad_requiere_horas,
      COALESCE(ntn.requiere_valor, FALSE) AS tipo_novedad_requiere_valor,
      COALESCE(ntn.activo, TRUE) AS tipo_novedad_activo,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido
    FROM nomina_novedades nn
    INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
    INNER JOIN nomina_empleados ne ON ne.id = nn.nomina_empleado_id
    INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
    INNER JOIN contratos c ON c.id = np.contrato_id
  `;
};

const getNominaAsistenciaRealSelect = (): string => {
  return `
    SELECT
      nad.id::text AS id,
      nad.periodo_id::text AS periodo_id,
      nad.vinculacion_id::text AS vinculacion_id,
      nad.fecha,
      nad.hora_ingreso::text AS hora_ingreso,
      nad.hora_salida::text AS hora_salida,
      nad.horas_trabajadas,
      nad.estado_dia,
      nad.observacion,
      COALESCE(nad.activo, TRUE) AS activo,
      nad.created_at,
      np.contrato_id::text AS periodo_contrato_id,
      np.estado AS periodo_estado,
      np.nombre_periodo AS periodo_nombre,
      p.id::text AS persona_id,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      cc.id::text AS cargo_id,
      cc.nombre_cargo AS cargo_nombre
    FROM nomina_asistencia_diaria nad
    INNER JOIN nomina_periodos np ON np.id = nad.periodo_id
    INNER JOIN vinculaciones v ON v.id = nad.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
  `;
};

const getNominaMovimientosRealSelect = (): string => {
  return `
    SELECT
      nm.id::text AS id,
      nm.periodo_id::text AS periodo_id,
      nm.nomina_empleado_id::text AS nomina_empleado_id,
      nm.vinculacion_id::text AS vinculacion_id,
      nm.fecha,
      nm.tipo_movimiento,
      nm.descripcion,
      nm.cantidad,
      nm.valor_unitario,
      nm.valor_total,
      COALESCE(nm.es_devengado, TRUE) AS es_devengado,
      COALESCE(nm.es_deduccion, FALSE) AS es_deduccion,
      COALESCE(nm.afecta_seguridad_social, TRUE) AS afecta_seguridad_social,
      COALESCE(nm.activo, TRUE) AS activo,
      nm.created_at,
      np.contrato_id::text AS periodo_contrato_id,
      np.estado AS periodo_estado,
      np.nombre_periodo AS periodo_nombre,
      p.id::text AS persona_id,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido
    FROM nomina_movimientos nm
    INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
    INNER JOIN vinculaciones v ON v.id = nm.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
  `;
};

const getNominaLiquidacionesRealSelect = (): string => {
  return `
    SELECT
      nl.id::text AS id,
      nl.vinculacion_id::text AS vinculacion_id,
      nl.periodo_id::text AS periodo_id,
      nl.fecha_inicio_vinculacion,
      nl.fecha_fin_vinculacion,
      nl.fecha_retiro,
      nl.motivo_retiro,
      nl.dias_base_liquidacion,
      nl.dias_trabajados,
      nl.dias_vacaciones_pendientes,
      nl.salario_base,
      nl.auxilio_transporte,
      nl.promedio_salario,
      nl.promedio_auxilio_transporte,
      nl.cesantias,
      nl.intereses_cesantias,
      nl.prima_servicios,
      nl.vacaciones,
      nl.otros_devengos,
      nl.deducciones,
      nl.total_liquidacion,
      nl.estado,
      nl.archivo_path,
      nl.documento_persona_id::text AS documento_persona_id,
      nl.observacion,
      COALESCE(nl.activo, TRUE) AS activo,
      nl.created_at,
      p.id::text AS persona_id,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      v.estado_vinculacion AS vinculacion_estado,
      c.id::text AS contrato_id,
      c.empresa_id::text AS contrato_empresa_id,
      c.numero_contrato AS contrato_numero,
      c.entidad_contratante AS contrato_entidad_contratante,
      np.nombre_periodo AS periodo_nombre,
      np.fecha_inicio AS periodo_fecha_inicio,
      np.fecha_fin AS periodo_fecha_fin,
      np.estado AS periodo_estado,
      ne.salud AS salud_deduccion_empleado,
      ne.pension AS pension_deduccion_empleado
    FROM nomina_liquidaciones nl
    INNER JOIN vinculaciones v ON v.id = nl.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN contratos c ON c.id = v.contrato_id
    INNER JOIN nomina_periodos np ON np.id = nl.periodo_id
    LEFT JOIN nomina_empleados ne
      ON ne.periodo_id = nl.periodo_id
     AND ne.vinculacion_id = nl.vinculacion_id
  `;
};

const getNominaDesprendiblesRealSelect = (): string => {
  return `
    SELECT
      nd.id::text AS id,
      nd.periodo_id::text AS periodo_id,
      nd.nomina_empleado_id::text AS nomina_empleado_id,
      nd.vinculacion_id::text AS vinculacion_id,
      nd.tipo_desprendible,
      nd.archivo_path,
      nd.fecha_generacion,
      nd.estado,
      nd.observacion,
      COALESCE(nd.activo, TRUE) AS activo,
      nd.created_at,
      nd.documento_persona_id::text AS documento_persona_id,
      nd.version,
      COALESCE(nd.es_vigente, TRUE) AS es_vigente,
      nd.desprendible_reemplaza_id::text AS desprendible_reemplaza_id,
      ne.salario_base,
      ne.auxilio_transporte,
      ne.devengado_basico,
      ne.devengado_transporte,
      ne.devengado_otros,
      ne.dias_pagados,
      ne.total_adiciones,
      ne.total_deducciones,
      ne.neto_pagar,
      ne.salud,
      ne.pension,
      COALESCE(ne.revisado, FALSE) AS revisado,
      np.nombre_periodo AS periodo_nombre,
      np.fecha_inicio AS periodo_fecha_inicio,
      np.fecha_fin AS periodo_fecha_fin,
      np.estado AS periodo_estado,
      p.id::text AS persona_id,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      cc.nombre_cargo AS cargo_nombre,
      c.id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      c.entidad_contratante AS contrato_entidad_contratante,
      c.empresa_id::text AS contrato_empresa_id,
      e.nombre_empresa AS empresa_nombre,
      e.nit AS empresa_nit,
      dp.storage_bucket AS dp_storage_bucket,
      dp.storage_path AS dp_storage_path,
      dp.nombre_original AS dp_nombre_original,
      dp.mime_type AS dp_mime_type,
      dp.tamano_bytes AS dp_tamano_bytes
    FROM nomina_desprendibles nd
    INNER JOIN nomina_empleados ne ON ne.id = nd.nomina_empleado_id
    INNER JOIN nomina_periodos np ON np.id = nd.periodo_id
    INNER JOIN vinculaciones v ON v.id = nd.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN contratos c ON c.id = v.contrato_id
    INNER JOIN empresas e ON e.id = c.empresa_id
    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
    LEFT JOIN documentos_persona dp ON dp.id = nd.documento_persona_id
  `;
};

const mapRealPeriodo = (row: NominaPeriodoRealRow): NominaPeriodo => {
  const contrato = row.contrato_id
    ? {
        id: row.contrato_id,
        empresa_id: row.contrato_empresa_id,
        numero_contrato: row.contrato_numero,
        entidad_contratante: row.contrato_entidad_contratante,
        fecha_inicio: toDateString(row.contrato_fecha_inicio),
        fecha_finalizacion: toDateString(row.contrato_fecha_finalizacion)
      }
    : null;

  return {
    id: row.id,
    contrato_id: row.contrato_id,
    nombre_periodo: row.nombre_periodo,
    tipo_periodo: row.tipo_periodo,
    fecha_inicio: toDateString(row.fecha_inicio) ?? '',
    fecha_fin: toDateString(row.fecha_fin) ?? '',
    requiere_asistencia: toBooleanValue(row.requiere_asistencia),
    estado: row.estado,
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? '',
    contrato
  };
};

const mapRealEmpleado = (row: NominaEmpleadoRealRow): NominaEmpleado => {
  return {
    id: row.id,
    periodo_id: row.periodo_id,
    vinculacion_id: row.vinculacion_id,
    metodo_liquidacion: row.metodo_liquidacion,
    salario_base: toNumberValue(row.salario_base),
    auxilio_transporte: toNumberValue(row.auxilio_transporte),
    otros_devengos: toNumberValue(row.otros_devengos),
    fecha_inicio_pago: toDateString(row.fecha_inicio_pago),
    fecha_fin_pago: toDateString(row.fecha_fin_pago),
    dias_periodo: toNumberValue(row.dias_periodo),
    dias_pagados: toNumberValue(row.dias_pagados),
    horas_trabajadas: toNumberValue(row.horas_trabajadas),
    horas_extra_total: toNumberValue(row.horas_extra_total),
    devengado_basico: toNumberValue(row.devengado_basico),
    devengado_transporte: toNumberValue(row.devengado_transporte),
    devengado_otros: toNumberValue(row.devengado_otros),
    total_adiciones: toNumberValue(row.total_adiciones),
    total_deducciones: toNumberValue(row.total_deducciones),
    salud: toNumberValue(row.salud),
    pension: toNumberValue(row.pension),
    neto_pagar: toNumberValue(row.neto_pagar),
    revisado: toBooleanValue(row.revisado),
    estado: row.estado,
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? '',
    motivo_caso_especial: row.motivo_caso_especial,
    persona: {
      id: row.persona_id,
      numero_documento: row.persona_numero_documento,
      primer_nombre: row.primer_nombre,
      segundo_nombre: row.segundo_nombre,
      primer_apellido: row.primer_apellido,
      segundo_apellido: row.segundo_apellido,
      nombre_completo: normalizeFullName(
        row.primer_nombre,
        row.segundo_nombre,
        row.primer_apellido,
        row.segundo_apellido
      )
    },
    vinculacion: {
      id: row.vinculacion_id,
      empresa_id: row.vinculacion_empresa_id,
      contrato_id: row.vinculacion_contrato_id,
      fecha_inicio: toDateString(row.fecha_inicio_vinculacion),
      fecha_fin: toDateString(row.fecha_fin_vinculacion),
      estado_vinculacion: row.vinculacion_estado,
      metodo_pago: row.vinculacion_metodo_pago
    },
    cargo:
      row.cargo_id || row.cargo_nombre
        ? {
            id: row.cargo_id,
            nombre_cargo: row.cargo_nombre
          }
        : null,
    categoria_salarial: row.categoria_id
      ? {
          id: row.categoria_id,
          codigo_categoria: row.categoria_codigo,
          nombre_categoria: row.categoria_nombre,
          modalidad: row.categoria_modalidad,
          salario_base: toNumberValue(row.categoria_salario_base),
          auxilio_transporte: toNumberValue(row.categoria_auxilio_transporte),
          otros_recargos: toNumberValue(row.categoria_otros_recargos)
        }
      : null
  };
};

const mapRealNovedad = (row: NominaNovedadRealRow): NominaNovedad => {
  return {
    id: row.id,
    periodo_id: row.periodo_id,
    nomina_empleado_id: row.nomina_empleado_id,
    vinculacion_id: row.vinculacion_id,
    fecha_inicio: toDateString(row.fecha_inicio),
    fecha_fin: toDateString(row.fecha_fin),
    dias: toOptionalNumberValue(row.dias),
    horas: toOptionalNumberValue(row.horas),
    valor_manual: toOptionalNumberValue(row.valor_manual),
    categoria_anterior_id: row.categoria_anterior_id,
    categoria_nueva_id: row.categoria_nueva_id,
    observacion: row.observacion,
    revisado: toBooleanValue(row.revisado),
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? '',
    requiere_cobertura: toBooleanValue(row.requiere_cobertura),
    cubierta: toBooleanValue(row.cubierta),
    tipo_novedad: {
      id: row.tipo_novedad_id,
      nombre: row.tipo_novedad_nombre,
      categoria: row.tipo_novedad_categoria,
      afecta_salario: toBooleanValue(row.tipo_novedad_afecta_salario),
      afecta_transporte: toBooleanValue(row.tipo_novedad_afecta_transporte),
      es_adicion: toBooleanValue(row.tipo_novedad_es_adicion),
      es_deduccion: toBooleanValue(row.tipo_novedad_es_deduccion),
      requiere_fechas: toBooleanValue(row.tipo_novedad_requiere_fechas),
      requiere_dias: toBooleanValue(row.tipo_novedad_requiere_dias),
      requiere_horas: toBooleanValue(row.tipo_novedad_requiere_horas),
      requiere_valor: toBooleanValue(row.tipo_novedad_requiere_valor),
      activo: toBooleanValue(row.tipo_novedad_activo)
    },
    persona: {
      numero_documento: row.persona_numero_documento,
      primer_nombre: row.primer_nombre,
      segundo_nombre: row.segundo_nombre,
      primer_apellido: row.primer_apellido,
      segundo_apellido: row.segundo_apellido,
      nombre_completo: normalizeFullName(
        row.primer_nombre,
        row.segundo_nombre,
        row.primer_apellido,
        row.segundo_apellido
      )
    }
  };
};

const mapRealAsistencia = (row: NominaAsistenciaRealRow): NominaAsistencia => {
  return {
    id: row.id,
    periodo_id: row.periodo_id,
    fecha: toDateString(row.fecha) ?? '',
    hora_ingreso: row.hora_ingreso,
    hora_salida: row.hora_salida,
    horas_trabajadas: toNumberValue(row.horas_trabajadas),
    estado_dia: row.estado_dia,
    observacion: row.observacion,
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? '',
    periodo: {
      id: row.periodo_id,
      nombre_periodo: row.periodo_nombre,
      estado: row.periodo_estado
    },
    persona: {
      id: row.persona_id,
      numero_documento: row.persona_numero_documento,
      primer_nombre: row.primer_nombre,
      segundo_nombre: row.segundo_nombre,
      primer_apellido: row.primer_apellido,
      segundo_apellido: row.segundo_apellido,
      nombre_completo: normalizeFullName(
        row.primer_nombre,
        row.segundo_nombre,
        row.primer_apellido,
        row.segundo_apellido
      )
    },
    vinculacion: {
      id: row.vinculacion_id
    },
    vinculacion_id: row.vinculacion_id,
    cargo:
      row.cargo_id || row.cargo_nombre
        ? {
            id: row.cargo_id,
            nombre_cargo: row.cargo_nombre
          }
        : null
  };
};

const mapRealMovimiento = (row: NominaMovimientoRealRow): NominaMovimiento => {
  return {
    id: row.id,
    periodo_id: row.periodo_id,
    nomina_empleado_id: row.nomina_empleado_id,
    vinculacion_id: row.vinculacion_id,
    fecha: toDateString(row.fecha),
    tipo_movimiento: row.tipo_movimiento,
    descripcion: row.descripcion,
    cantidad: toOptionalNumberValue(row.cantidad),
    valor_unitario: toOptionalNumberValue(row.valor_unitario),
    valor_total: toNumberValue(row.valor_total),
    es_devengado: toBooleanValue(row.es_devengado),
    es_deduccion: toBooleanValue(row.es_deduccion),
    afecta_seguridad_social: toBooleanValue(row.afecta_seguridad_social),
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? '',
    periodo: {
      id: row.periodo_id,
      nombre_periodo: row.periodo_nombre,
      estado: row.periodo_estado
    },
    persona: {
      id: row.persona_id,
      numero_documento: row.persona_numero_documento,
      nombre_completo: normalizeFullName(
        row.primer_nombre,
        row.segundo_nombre,
        row.primer_apellido,
        row.segundo_apellido
      )
    },
    vinculacion: {
      id: row.vinculacion_id
    }
  };
};

const mapRealLiquidacion = (row: NominaLiquidacionRealRow): NominaLiquidacion => {
  const personaNombre = normalizeFullName(
    row.primer_nombre,
    row.segundo_nombre,
    row.primer_apellido,
    row.segundo_apellido
  );
  const totalAdiciones = Number((
    toNumberValue(row.cesantias) +
    toNumberValue(row.intereses_cesantias) +
    toNumberValue(row.prima_servicios) +
    toNumberValue(row.vacaciones) +
    toNumberValue(row.otros_devengos)
  ).toFixed(2));
  const totalDeducciones = Number(toNumberValue(row.deducciones).toFixed(2));
  const totalLiquidacion = Number(toNumberValue(row.total_liquidacion).toFixed(2));

  return {
    id: row.id,
    vinculacion_id: row.vinculacion_id,
    periodo_id: row.periodo_id,
    fecha_inicio_vinculacion: toDateString(row.fecha_inicio_vinculacion),
    fecha_fin_vinculacion: toDateString(row.fecha_fin_vinculacion),
    fecha_retiro: toDateString(row.fecha_retiro),
    motivo_retiro: row.motivo_retiro,
    dias_base_liquidacion: toNumberValue(row.dias_base_liquidacion),
    dias_trabajados: toNumberValue(row.dias_trabajados),
    dias_vacaciones_pendientes: toNumberValue(row.dias_vacaciones_pendientes),
    salario_base: toNumberValue(row.salario_base),
    auxilio_transporte: toNumberValue(row.auxilio_transporte),
    promedio_salario: toNumberValue(row.promedio_salario),
    promedio_auxilio_transporte: toNumberValue(row.promedio_auxilio_transporte),
    cesantias: toNumberValue(row.cesantias),
    intereses_cesantias: toNumberValue(row.intereses_cesantias),
    prima_servicios: toNumberValue(row.prima_servicios),
    vacaciones: toNumberValue(row.vacaciones),
    otros_devengos: toNumberValue(row.otros_devengos),
    deducciones: totalDeducciones,
    total_liquidacion: totalLiquidacion,
    estado: row.estado,
    archivo_path: row.archivo_path,
    documento_persona_id: row.documento_persona_id,
    observacion: row.observacion,
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? '',
    persona: {
      id: row.persona_id,
      numero_documento: row.persona_numero_documento,
      primer_nombre: row.primer_nombre,
      segundo_nombre: row.segundo_nombre,
      primer_apellido: row.primer_apellido,
      segundo_apellido: row.segundo_apellido,
      nombre_completo: personaNombre
    },
    persona_id: row.persona_id,
    vinculacion: {
      id: row.vinculacion_id,
      fecha_inicio: toDateString(row.fecha_inicio_vinculacion),
      fecha_fin: toDateString(row.fecha_fin_vinculacion),
      estado_vinculacion: row.vinculacion_estado,
      motivo_retiro: row.motivo_retiro
    },
    contrato: {
      id: row.contrato_id,
      empresa_id: row.contrato_empresa_id,
      numero_contrato: row.contrato_numero,
      entidad_contratante: row.contrato_entidad_contratante
    },
    periodo: {
      id: row.periodo_id,
      nombre_periodo: row.periodo_nombre,
      fecha_inicio: toDateString(row.periodo_fecha_inicio) ?? '',
      fecha_fin: toDateString(row.periodo_fecha_fin) ?? '',
      estado: row.periodo_estado
    },
    empresa_id: row.contrato_empresa_id,
    contrato_id: row.contrato_id,
    persona_nombre_snapshot: personaNombre,
    cargo_nombre_snapshot: null,
    contrato_nombre_snapshot: row.contrato_numero,
    salario_base_snapshot: toNumberValue(row.salario_base),
    auxilio_transporte_snapshot: toNumberValue(row.auxilio_transporte),
    dias_liquidados: toNumberValue(row.dias_trabajados),
    dias_con_transporte: toNumberValue(row.dias_trabajados),
    valor_dia_salario: Number((toNumberValue(row.promedio_salario) / 30).toFixed(2)),
    valor_dia_transporte: Number((toNumberValue(row.promedio_auxilio_transporte) / 30).toFixed(2)),
    devengado_salario: toNumberValue(row.cesantias),
    devengado_transporte: toNumberValue(row.intereses_cesantias),
    deduccion_salud: toNumberValue(row.salud_deduccion_empleado),
    deduccion_pension: toNumberValue(row.pension_deduccion_empleado),
    total_adiciones: totalAdiciones,
    total_deducciones: totalDeducciones,
    total_devengado: totalAdiciones,
    neto_pagar: totalLiquidacion,
    novedades_snapshot: null
  };
};

const tryParseJsonObject = (value: string | null): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const getSnapshotStringValue = (
  payload: Record<string, unknown>,
  key: string,
  fallback: string | null
): string | null => {
  const value = payload[key];
  return typeof value === 'string' ? value : fallback;
};

const getSnapshotNumberValue = (
  payload: Record<string, unknown>,
  key: string,
  fallback: number
): number => {
  const value = payload[key];
  return typeof value === 'number' || typeof value === 'string' ? toNumberValue(value) : fallback;
};

const formatCurrencyCop = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const buildNominaDesprendibleFileName = (
  periodoId: string,
  nominaEmpleadoId: string,
  version: number,
  timestamp: number
): string => {
  return `desprendible-periodo-${periodoId}-empleado-${nominaEmpleadoId}-v${version}-${timestamp}.pdf`;
};

const buildNominaDesprendibleStoragePath = (
  periodoId: string,
  vinculacionId: string,
  nominaEmpleadoId: string,
  version: number,
  timestamp: number
): string => {
  return `nomina/desprendibles/periodo_${periodoId}/vinculacion_${vinculacionId}/${buildNominaDesprendibleFileName(
    periodoId,
    nominaEmpleadoId,
    version,
    timestamp
  )}`;
};

const uploadNominaPdfToStorage = async (
  storagePath: string,
  fileBuffer: Buffer
): Promise<{ bucket: string; path: string }> => {
  const supabaseAdmin = getSupabaseAdminClient();
  const uploadResult = await supabaseAdmin.storage
    .from(NOMINA_DESPRENDIBLES_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (uploadResult.error) {
    throw new AppError(
      'Failed to upload document to storage',
      502,
      'STORAGE_UPLOAD_FAILED',
      uploadResult.error.message
    );
  }

  return {
    bucket: NOMINA_DESPRENDIBLES_BUCKET,
    path: storagePath
  };
};

const buildNominaPlanillaStoragePath = (periodoId: string, timestamp: number): string => {
  return `nomina/planillas/periodo_${periodoId}/planilla-nomina-periodo-${periodoId}-${timestamp}.pdf`;
};

const buildNominaPlanillaPdfBuffer = async (input: {
  contrato_numero: string | null;
  empleados: Array<{
    cargo: string | null;
    devengado: number;
    deducciones: number;
    documento: string | null;
    nombre: string;
    neto: number;
  }>;
  empresa_nombre: string | null;
  estado_periodo: string;
  fecha_fin: string;
  fecha_inicio: string;
  nombre_periodo: string;
  periodo_id: string;
  total_deducciones: number;
  total_devengado: number;
  total_neto: number;
}): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4'
    });
    const chunks: Buffer[] = [];

    const ensureSpace = (minimumY = 750): void => {
      if (doc.y > minimumY) {
        doc.addPage();
      }
    };

    const renderEmployeeRow = (empleado: typeof input.empleados[number]): void => {
      ensureSpace(730);
      doc.font('Helvetica-Bold').fontSize(9).text(empleado.nombre);
      doc.font('Helvetica').fontSize(8).text(
        [
          `Documento: ${empleado.documento ?? ''}`,
          `Cargo: ${empleado.cargo ?? ''}`,
          `Devengado: ${formatCurrencyCop(empleado.devengado)}`,
          `Deducciones: ${formatCurrencyCop(empleado.deducciones)}`,
          `Neto: ${formatCurrencyCop(empleado.neto)}`
        ].join(' | ')
      );
      doc.moveDown(0.3);
    };

    doc.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text('EMPIRIA', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(15).text('PLANILLA CONSOLIDADA DE NOMINA', { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(10).font('Helvetica-Bold').text(`Empresa: `, { continued: true });
    doc.font('Helvetica').text(input.empresa_nombre ?? 'N/D');
    doc.font('Helvetica-Bold').text(`Contrato: `, { continued: true });
    doc.font('Helvetica').text(input.contrato_numero ?? 'N/D');
    doc.font('Helvetica-Bold').text(`Periodo: `, { continued: true });
    doc.font('Helvetica').text(`${input.nombre_periodo} (${input.fecha_inicio} - ${input.fecha_fin})`);
    doc.font('Helvetica-Bold').text(`Estado: `, { continued: true });
    doc.font('Helvetica').text(input.estado_periodo);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Totales');
    doc.font('Helvetica').fontSize(10).text(`Devengado: ${formatCurrencyCop(input.total_devengado)}`);
    doc.text(`Deducciones: ${formatCurrencyCop(input.total_deducciones)}`);
    doc.text(`Neto: ${formatCurrencyCop(input.total_neto)}`);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Empleados');
    doc.moveDown(0.4);

    for (const empleado of input.empleados) {
      renderEmployeeRow(empleado);
    }

    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(8).text(
      `Generado por Empiria | Periodo ${input.periodo_id} | ${new Date().toISOString()}`,
      { align: 'right' }
    );

    doc.end();
  });
};

const buildNominaDesprendiblePayload = (input: {
  archivo_path: string | null;
  auxilio_transporte_snapshot: number;
  cargo_nombre_snapshot: string | null;
  contrato_id: string;
  contrato_nombre_snapshot: string | null;
  devengado_otros: number;
  devengado_salario: number;
  devengado_transporte: number;
  dias_liquidados: number;
  empresa_nit: string | null;
  empresa_nombre: string | null;
  fecha_generacion: string;
  neto_pagar: number;
  novedades?: Array<{
    dias: number | null;
    horas: number | null;
    observacion: string | null;
    tipo_novedad_nombre: string | null;
    valor_manual: number | null;
  }>;
  movimientos?: Array<{
    cantidad: number | null;
    descripcion: string | null;
    es_deduccion: boolean;
    es_devengado: boolean;
    tipo_movimiento: string;
    valor_total: number;
    valor_unitario: number | null;
  }>;
  periodo_fecha_fin: string;
  periodo_fecha_inicio: string;
  periodo_id: string;
  periodo_nombre: string;
  pension: number;
  persona_id: string;
  persona_nombre_snapshot: string;
  persona_numero_documento: string | null;
  salud: number;
  salario_base_snapshot: number;
  total_adiciones: number;
  total_deducciones: number;
  total_devengado: number;
  tipo_desprendible?: string;
  version: number;
  vinculacion_id: string;
}): Record<string, unknown> => {
  return {
    archivo_path: input.archivo_path,
    auxilio_transporte_snapshot: input.auxilio_transporte_snapshot,
    cargo_nombre_snapshot: input.cargo_nombre_snapshot,
    contrato_id: input.contrato_id,
    contrato_nombre_snapshot: input.contrato_nombre_snapshot,
    devengado_otros: input.devengado_otros,
    devengado_salario: input.devengado_salario,
    devengado_transporte: input.devengado_transporte,
    dias_liquidados: input.dias_liquidados,
    empresa_nit: input.empresa_nit,
    empresa_nombre: input.empresa_nombre,
    fecha_generacion: input.fecha_generacion,
    neto_pagar: input.neto_pagar,
    movimientos: input.movimientos ?? [],
    novedades: input.novedades ?? [],
    pension: input.pension,
    periodo: {
      fecha_fin: input.periodo_fecha_fin,
      fecha_inicio: input.periodo_fecha_inicio,
      id: input.periodo_id,
      nombre_periodo: input.periodo_nombre
    },
    persona_id: input.persona_id,
    persona_nombre_snapshot: input.persona_nombre_snapshot,
    persona_numero_documento: input.persona_numero_documento,
    salud: input.salud,
    salario_base_snapshot: input.salario_base_snapshot,
    total_adiciones: input.total_adiciones,
    total_deducciones: input.total_deducciones,
    total_devengado: input.total_devengado,
    tipo_desprendible: input.tipo_desprendible ?? 'PAGO',
    version: input.version,
    vinculacion_id: input.vinculacion_id
  };
};

const buildNominaDesprendiblePdfBuffer = async (input: {
  auxilio_transporte: number;
  cargo_nombre: string | null;
  contrato_numero: string | null;
  devengado_otros: number;
  devengado_salario: number;
  devengado_transporte: number;
  empresa_nit: string | null;
  empresa_nombre: string | null;
  fecha_generacion: string;
  neto_pagar: number;
  novedades: Array<{
    dias: number | null;
    horas: number | null;
    observacion: string | null;
    tipo_novedad_nombre: string | null;
    valor_manual: number | null;
  }>;
  movimientos?: Array<{
    cantidad: number | null;
    descripcion: string | null;
    es_deduccion: boolean;
    es_devengado: boolean;
    tipo_movimiento: string;
    valor_total: number;
    valor_unitario: number | null;
  }>;
  periodo_fecha_fin: string;
  periodo_fecha_inicio: string;
  periodo_id: string;
  periodo_nombre: string;
  pension: number;
  persona_nombre: string;
  persona_numero_documento: string | null;
  salud: number;
  salario_base: number;
  total_adiciones: number;
  total_deducciones: number;
  version: number;
  vinculacion_id: string;
  nomina_empleado_id: string;
  dias_pagados: number;
}): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4'
    });
    const chunks: Buffer[] = [];

    const addLine = (label: string, value: string): void => {
      doc.font('Helvetica-Bold').text(`${label}: `, {
        continued: true
      });
      doc.font('Helvetica').text(value);
    };

    const ensureSpace = (minimumY = 720): void => {
      if (doc.y > minimumY) {
        doc.addPage();
      }
    };

    doc.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('EMPIRIA', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(15).text('DESPRENDIBLE DE PAGO', { align: 'center' });
    doc.moveDown();

    addLine('Empresa', input.empresa_nombre ?? 'N/A');
    addLine('NIT', input.empresa_nit ?? 'N/A');
    addLine('Contrato', input.contrato_numero ?? 'N/A');
    addLine('Periodo', input.periodo_nombre);
    addLine('Rango', `${input.periodo_fecha_inicio} - ${input.periodo_fecha_fin}`);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica-Bold').text('Empleado');
    doc.moveDown(0.4);
    addLine('Nombre completo', input.persona_nombre);
    addLine('Numero documento', input.persona_numero_documento ?? 'N/A');
    addLine('Cargo', input.cargo_nombre ?? 'No disponible');
    addLine('Vinculacion ID', input.vinculacion_id);
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Devengados');
    doc.moveDown(0.4);
    addLine('Salario base', formatCurrencyCop(input.salario_base));
    addLine('Dias pagados', String(input.dias_pagados));
    addLine('Devengado basico', formatCurrencyCop(input.devengado_salario));
    addLine('Auxilio transporte', formatCurrencyCop(input.auxilio_transporte));
    addLine('Devengado transporte', formatCurrencyCop(input.devengado_transporte));
    addLine('Devengado otros', formatCurrencyCop(input.devengado_otros));
    addLine('Total adiciones', formatCurrencyCop(input.total_adiciones));
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Deducciones');
    doc.moveDown(0.4);
    addLine('Salud', formatCurrencyCop(input.salud));
    addLine('Pension', formatCurrencyCop(input.pension));
    addLine('Total deducciones', formatCurrencyCop(input.total_deducciones));
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Novedades');
    doc.moveDown(0.4);

    if (input.novedades.length === 0) {
      doc.font('Helvetica').text('Sin novedades activas en el periodo.');
    } else {
      input.novedades.forEach((novedad, index) => {
        ensureSpace();
        doc.font('Helvetica-Bold').text(`${index + 1}. ${novedad.tipo_novedad_nombre ?? 'Novedad'}`);
        doc.font('Helvetica').text(`Dias: ${novedad.dias ?? 0}`);
        doc.text(`Horas: ${novedad.horas ?? 0}`);
        doc.text(`Valor manual: ${formatCurrencyCop(novedad.valor_manual ?? 0)}`);
        doc.text(`Observacion: ${novedad.observacion ?? 'N/A'}`);
        doc.moveDown(0.6);
      });
    }

    ensureSpace();
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(13).text(`Neto a pagar: ${formatCurrencyCop(input.neto_pagar)}`);
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text('Generado por Empiria');
    doc.text(`Fecha generacion: ${input.fecha_generacion}`);
    doc.text(`Codigo interno: ${input.periodo_id}-${input.nomina_empleado_id}-${input.version}`);

    doc.end();
  });
};

const mapRealDesprendible = (row: NominaDesprendibleRealRow): NominaDesprendible => {
  const personaNombre = normalizeFullName(
    row.primer_nombre,
    row.segundo_nombre,
    row.primer_apellido,
    row.segundo_apellido
  );
  const payloadSnapshot =
    tryParseJsonObject(row.observacion) ??
    buildNominaDesprendiblePayload({
      archivo_path: row.archivo_path,
      auxilio_transporte_snapshot: toNumberValue(row.auxilio_transporte),
      cargo_nombre_snapshot: row.cargo_nombre,
      contrato_id: row.contrato_id,
      contrato_nombre_snapshot: row.contrato_numero,
      devengado_otros: toNumberValue(row.devengado_otros),
      devengado_salario: toNumberValue(row.devengado_basico),
      devengado_transporte: toNumberValue(row.devengado_transporte),
      dias_liquidados: toNumberValue(row.dias_pagados),
      empresa_nit: row.empresa_nit,
      empresa_nombre: row.empresa_nombre,
      fecha_generacion: toIsoString(row.fecha_generacion) ?? toIsoString(row.created_at) ?? '',
      neto_pagar: toNumberValue(row.neto_pagar),
      pension: toNumberValue(row.pension),
      periodo_fecha_fin: toDateString(row.periodo_fecha_fin) ?? '',
      periodo_fecha_inicio: toDateString(row.periodo_fecha_inicio) ?? '',
      periodo_id: row.periodo_id,
      periodo_nombre: row.periodo_nombre,
      persona_id: row.persona_id,
      persona_nombre_snapshot: personaNombre,
      persona_numero_documento: row.persona_numero_documento,
      salud: toNumberValue(row.salud),
      salario_base_snapshot: toNumberValue(row.salario_base),
      total_adiciones: toNumberValue(row.total_adiciones),
      total_deducciones: toNumberValue(row.total_deducciones),
      total_devengado: toNumberValue(row.total_adiciones),
      version: Math.max(1, toNumberValue(row.version)),
      vinculacion_id: row.vinculacion_id
    });
  const payloadPeriodo =
    payloadSnapshot.periodo &&
    typeof payloadSnapshot.periodo === "object" &&
    !Array.isArray(payloadSnapshot.periodo)
      ? (payloadSnapshot.periodo as Record<string, unknown>)
      : null;
  const payloadPersonaNombre = getSnapshotStringValue(
    payloadSnapshot,
    'persona_nombre_snapshot',
    personaNombre
  ) ?? personaNombre;
  const payloadPersonaDocumento = getSnapshotStringValue(
    payloadSnapshot,
    'persona_numero_documento',
    row.persona_numero_documento
  );
  const payloadPeriodoId = getSnapshotStringValue(payloadPeriodo ?? {}, 'id', row.periodo_id) ?? row.periodo_id;
  const payloadPeriodoNombre =
    getSnapshotStringValue(payloadPeriodo ?? {}, 'nombre_periodo', row.periodo_nombre) ?? row.periodo_nombre;
  const payloadPeriodoFechaInicio =
    getSnapshotStringValue(payloadPeriodo ?? {}, 'fecha_inicio', toDateString(row.periodo_fecha_inicio)) ??
    toDateString(row.periodo_fecha_inicio) ??
    '';
  const payloadPeriodoFechaFin =
    getSnapshotStringValue(payloadPeriodo ?? {}, 'fecha_fin', toDateString(row.periodo_fecha_fin)) ??
    toDateString(row.periodo_fecha_fin) ??
    '';

  return {
    activo: toBooleanValue(row.activo),
    archivo_path: getSnapshotStringValue(payloadSnapshot, 'archivo_path', row.archivo_path),
    created_at: toIsoString(row.created_at) ?? '',
    documento: {
      documento_persona_id: row.documento_persona_id,
      mime_type: row.dp_mime_type,
      nombre_original: row.dp_nombre_original,
      storage_bucket: row.dp_storage_bucket,
      storage_path: row.dp_storage_path,
      tamano_bytes: toOptionalNumberValue(row.dp_tamano_bytes)
    },
    empresa: {
      nit: getSnapshotStringValue(payloadSnapshot, 'empresa_nit', row.empresa_nit),
      nombre_empresa: getSnapshotStringValue(payloadSnapshot, 'empresa_nombre', row.empresa_nombre)
    },
    es_vigente: toBooleanValue(row.es_vigente),
    estado: row.estado,
    fecha_generacion:
      getSnapshotStringValue(payloadSnapshot, 'fecha_generacion', toIsoString(row.fecha_generacion)) ??
      toIsoString(row.fecha_generacion),
    id: row.id,
    liquidacion_id: null,
    nomina_empleado_id: row.nomina_empleado_id,
    observacion: tryParseJsonObject(row.observacion) ? null : row.observacion,
    payload_snapshot: payloadSnapshot,
    periodo: {
      estado: row.periodo_estado,
      fecha_fin: payloadPeriodoFechaFin,
      fecha_inicio: payloadPeriodoFechaInicio,
      id: payloadPeriodoId,
      nombre_periodo: payloadPeriodoNombre
    },
    periodo_id: payloadPeriodoId,
    neto_pagar: getSnapshotNumberValue(payloadSnapshot, 'neto_pagar', toNumberValue(row.neto_pagar)),
    pension: getSnapshotNumberValue(payloadSnapshot, 'pension', toNumberValue(row.pension)),
    persona: {
      id: row.persona_id,
      nombre_completo: payloadPersonaNombre,
      numero_documento: payloadPersonaDocumento
    },
    persona_id: row.persona_id,
    revisado: toBooleanValue(row.revisado),
    salario_base: getSnapshotNumberValue(payloadSnapshot, 'salario_base_snapshot', toNumberValue(row.salario_base)),
    salario_base_snapshot: getSnapshotNumberValue(
      payloadSnapshot,
      'salario_base_snapshot',
      toNumberValue(row.salario_base)
    ),
    salud: getSnapshotNumberValue(payloadSnapshot, 'salud', toNumberValue(row.salud)),
    tipo_desprendible:
      getSnapshotStringValue(payloadSnapshot, 'tipo_desprendible', row.tipo_desprendible) ?? row.tipo_desprendible,
    total_adiciones: getSnapshotNumberValue(payloadSnapshot, 'total_adiciones', toNumberValue(row.total_adiciones)),
    total_deducciones: getSnapshotNumberValue(
      payloadSnapshot,
      'total_deducciones',
      toNumberValue(row.total_deducciones)
    ),
    total_devengado: getSnapshotNumberValue(payloadSnapshot, 'total_devengado', toNumberValue(row.total_adiciones)),
    version: Math.max(1, getSnapshotNumberValue(payloadSnapshot, 'version', toNumberValue(row.version))),
    vinculacion: {
      id: row.vinculacion_id
    },
    desprendible_reemplaza_id: row.desprendible_reemplaza_id,
    vinculacion_id: row.vinculacion_id,
    dias_liquidados: getSnapshotNumberValue(payloadSnapshot, 'dias_liquidados', toNumberValue(row.dias_pagados)),
    devengado_salario: getSnapshotNumberValue(
      payloadSnapshot,
      'devengado_salario',
      toNumberValue(row.devengado_basico)
    ),
    devengado_transporte: getSnapshotNumberValue(
      payloadSnapshot,
      'devengado_transporte',
      toNumberValue(row.devengado_transporte)
    )
  };
};

const loadContratoScope = async (
  contratoId: string,
  client?: PoolClient
): Promise<ContratoScopeRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<ContratoScopeRow>(
    `
      SELECT
        c.id::text AS id,
        c.empresa_id::text AS empresa_id
      FROM contratos c
      WHERE c.id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const contrato = result.rows[0];

  if (!contrato) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  return contrato;
};

const assertTenantAccessForContrato = async (
  contratoId: string,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<void> => {
  const contrato = await loadContratoScope(contratoId, client);
  const empresaId = toOptionalNumberValue(contrato.empresa_id);
  const contratoNumericId = toNumberValue(contrato.id);

  if (!hasTenantContractAccess(tenant, contratoNumericId, empresaId)) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

const loadRealPeriodoOrThrow = async (
  periodoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaPeriodoRealRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaPeriodoRealRow>(
    `
      ${getNominaPeriodosRealSelect()}
      WHERE np.id = $1::bigint
      LIMIT 1
    `,
    [periodoId]
  );

  const periodo = result.rows[0];

  if (!periodo) {
    throw new AppError('Payroll period not found', 404, 'NOMINA_PERIODO_NOT_FOUND');
  }

  await assertTenantAccessForContrato(periodo.contrato_id, tenant, client);
  return periodo;
};

const loadNominaEmpleadoByIdOrThrow = async (
  empleadoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaEmpleadoRealRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaEmpleadoRealRow>(
    `
      ${getNominaEmpleadosRealSelect()}
      WHERE ne.id = $1::bigint
      LIMIT 1
    `,
    [empleadoId]
  );

  const empleado = result.rows[0];

  if (!empleado) {
    throw new AppError('Payroll employee not found', 404, 'NOMINA_EMPLEADO_NOT_FOUND');
  }

  await assertTenantAccessForContrato(empleado.vinculacion_contrato_id, tenant, client);
  return empleado;
};

const loadNominaEmpleadoContextOrThrow = async (
  empleadoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaEmpleadoContextRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaEmpleadoContextRow>(
    `
      SELECT
        ne.id::text AS id,
        ne.periodo_id::text AS periodo_id,
        np.contrato_id::text AS periodo_contrato_id,
        np.estado AS periodo_estado
      FROM nomina_empleados ne
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      WHERE ne.id = $1::bigint
      LIMIT 1
    `,
    [empleadoId]
  );

  const context = result.rows[0];

  if (!context) {
    throw new AppError('Payroll employee not found', 404, 'NOMINA_EMPLEADO_NOT_FOUND');
  }

  await assertTenantAccessForContrato(context.periodo_contrato_id, tenant, client);
  return context;
};

const loadNominaAsistenciaByIdOrThrow = async (
  asistenciaId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaAsistenciaRealRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaAsistenciaRealRow>(
    `
      ${getNominaAsistenciaRealSelect()}
      WHERE nad.id = $1::bigint
      LIMIT 1
    `,
    [asistenciaId]
  );

  const asistencia = result.rows[0];

  if (!asistencia) {
    throw new AppError('Payroll attendance not found', 404, 'NOMINA_ASISTENCIA_NOT_FOUND');
  }

  await assertTenantAccessForContrato(asistencia.periodo_contrato_id, tenant, client);
  return asistencia;
};

const loadNominaMovimientoByIdOrThrow = async (
  movimientoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaMovimientoRealRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaMovimientoRealRow>(
    `
      ${getNominaMovimientosRealSelect()}
      WHERE nm.id = $1::bigint
      LIMIT 1
    `,
    [movimientoId]
  );

  const movimiento = result.rows[0];

  if (!movimiento) {
    throw new AppError('Payroll movement not found', 404, 'NOMINA_MOVIMIENTO_NOT_FOUND');
  }

  await assertTenantAccessForContrato(movimiento.periodo_contrato_id, tenant, client);
  return movimiento;
};

const loadNominaTipoNovedadByIdOrThrow = async (
  tipoNovedadId: string,
  client?: PoolClient
): Promise<NominaTipoNovedadRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaTipoNovedadRow>(
    `
      SELECT
        id::text AS id,
        nombre,
        categoria,
        COALESCE(afecta_salario, FALSE) AS afecta_salario,
        COALESCE(afecta_transporte, FALSE) AS afecta_transporte,
        COALESCE(es_adicion, FALSE) AS es_adicion,
        COALESCE(es_deduccion, FALSE) AS es_deduccion,
        COALESCE(requiere_fechas, FALSE) AS requiere_fechas,
        COALESCE(requiere_dias, FALSE) AS requiere_dias,
        COALESCE(requiere_horas, FALSE) AS requiere_horas,
        COALESCE(requiere_valor, FALSE) AS requiere_valor,
        COALESCE(activo, TRUE) AS activo,
        created_at
      FROM nomina_tipos_novedad
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [tipoNovedadId]
  );

  const tipo = result.rows[0];

  if (!tipo) {
    throw new AppError('Payroll novelty type not found', 404, 'NOMINA_TIPO_NOVEDAD_NOT_FOUND');
  }

  return tipo;
};

const validateNovedadInputAgainstTipo = (
  tipo: NominaTipoNovedadRow,
  input: {
    dias?: number | null;
    fecha_fin?: string | null;
    fecha_inicio?: string | null;
    horas?: number | null;
    valor_manual?: number | null;
  }
): void => {
  if (toBooleanValue(tipo.requiere_fechas) && (!input.fecha_inicio || !input.fecha_fin)) {
    throw new AppError('This novelty type requires fecha_inicio and fecha_fin', 400, 'NOMINA_NOVEDAD_FECHAS_REQUERIDAS');
  }

  if (toBooleanValue(tipo.requiere_dias) && (input.dias === null || input.dias === undefined)) {
    throw new AppError('This novelty type requires dias', 400, 'NOMINA_NOVEDAD_DIAS_REQUERIDOS');
  }

  if (toBooleanValue(tipo.requiere_horas) && (input.horas === null || input.horas === undefined)) {
    throw new AppError('This novelty type requires horas', 400, 'NOMINA_NOVEDAD_HORAS_REQUERIDAS');
  }

  if (toBooleanValue(tipo.requiere_valor) && (input.valor_manual === null || input.valor_manual === undefined)) {
    throw new AppError('This novelty type requires valor_manual', 400, 'NOMINA_NOVEDAD_VALOR_REQUERIDO');
  }
};

const loadNominaNovedadByIdOrThrow = async (
  novedadId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaNovedadRealRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaNovedadRealRow>(
    `
      ${getNominaNovedadesRealSelect()}
      WHERE nn.id = $1::bigint
      LIMIT 1
    `,
    [novedadId]
  );

  const novedad = result.rows[0];

  if (!novedad) {
    throw new AppError('Payroll novelty not found', 404, 'NOMINA_NOVEDAD_NOT_FOUND');
  }

  const periodo = await loadRealPeriodoOrThrow(novedad.periodo_id, tenant, client);

  if (!periodo) {
    throw new AppError('Payroll period not found', 404, 'NOMINA_PERIODO_NOT_FOUND');
  }

  return novedad;
};

const loadNominaTipoDocumentoByCodeOrThrow = async (
  codigo: string,
  client?: PoolClient
): Promise<TipoDocumentoNominaRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<TipoDocumentoNominaRow>(
    `
      SELECT
        id::text AS id,
        codigo,
        nombre_documento
      FROM tipos_documentos
      WHERE codigo = $1
      LIMIT 1
    `,
    [codigo]
  );

  const tipoDocumento = result.rows[0];

  if (!tipoDocumento) {
    throw new AppError(
      `Tipo de documento ${codigo} no configurado`,
      500,
      'NOMINA_DESPRENDIBLE_TIPO_DOCUMENTO_NOT_CONFIGURED'
    );
  }

  return tipoDocumento;
};

const recordNominaAudit = async (
  client: PoolClient,
  periodoId: string,
  actorUserId: string,
  action: string,
  payload?: Record<string, unknown>,
  auditMeta?: AuditRequestMeta
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: actorUserId,
    accion: action,
    tabla: 'nomina_periodos',
    registro_id: periodoId,
    descripcion: `Auditoria de nomina ${action}`,
    before: payload?.before ?? null,
    after: payload?.after ?? payload ?? null,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });
};

const loadNominaPeriodoEmployeesSummary = async (
  client: PoolClient,
  periodoId: string
): Promise<NominaPeriodoEmployeesSummaryRow> => {
  const result = await client.query<NominaPeriodoEmployeesSummaryRow>(
    `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE)::int AS total_activos,
        COUNT(*) FILTER (
          WHERE COALESCE(activo, TRUE) = TRUE
            AND COALESCE(revisado, FALSE) = TRUE
        )::int AS total_revisados,
        COUNT(*) FILTER (
          WHERE COALESCE(activo, TRUE) = TRUE
            AND COALESCE(revisado, FALSE) = FALSE
        )::int AS total_no_revisados,
        COUNT(*) FILTER (
          WHERE COALESCE(activo, TRUE) = TRUE
            AND NOT (
              COALESCE(revisado, FALSE) = TRUE
              OR COALESCE(estado, '') <> 'PENDIENTE'
            )
        )::int AS total_pendientes_sin_revisar
      FROM nomina_empleados
      WHERE periodo_id = $1::bigint
    `,
    [periodoId]
  );

  return (
    result.rows[0] ?? {
      total_activos: 0,
      total_no_revisados: 0,
      total_pendientes_sin_revisar: 0,
      total_revisados: 0
    }
  );
};

const countNominaDesprendiblesVigentes = async (
  client: PoolClient,
  periodoId: string
): Promise<number> => {
  const result = await client.query<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_desprendibles
      WHERE periodo_id = $1::bigint
        AND COALESCE(activo, TRUE) = TRUE
        AND COALESCE(es_vigente, TRUE) = TRUE
    `,
    [periodoId]
  );

  return result.rows[0]?.total ?? 0;
};

const loadNominaPeriodoAsistenciaPendiente = async (
  client: PoolClient,
  periodoId: string
): Promise<{
  empleados_afectados: Array<{
    nomina_empleado_id: string;
    vinculacion_id: string;
    numero_documento: string | null;
    nombre_completo: string;
    pendientes: number;
  }>;
  total_pendientes: number;
}> => {
  const result = await client.query<NominaPeriodoAsistenciaPendienteRow>(
    `
      SELECT
        ne.id::text AS nomina_empleado_id,
        ne.vinculacion_id::text AS vinculacion_id,
        p.numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
        COUNT(nad.id)::int AS pendientes
      FROM nomina_empleados ne
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN nomina_asistencia_diaria nad
        ON nad.periodo_id = ne.periodo_id
       AND nad.vinculacion_id = ne.vinculacion_id
       AND COALESCE(nad.activo, TRUE) = TRUE
       AND UPPER(COALESCE(nad.estado_dia, '')) = 'PENDIENTE'
      WHERE ne.periodo_id = $1::bigint
        AND COALESCE(ne.activo, TRUE) = TRUE
        AND UPPER(COALESCE(ne.metodo_liquidacion, '')) = 'ASISTENCIA'
      GROUP BY
        ne.id,
        ne.vinculacion_id,
        p.numero_documento,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido
      HAVING COUNT(nad.id) > 0
      ORDER BY p.primer_apellido ASC NULLS LAST, p.segundo_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, p.segundo_nombre ASC NULLS LAST, ne.id ASC
    `,
    [periodoId]
  );

  const empleados_afectados = result.rows.map((row) => ({
    nomina_empleado_id: row.nomina_empleado_id,
    vinculacion_id: row.vinculacion_id,
    numero_documento: row.numero_documento,
    nombre_completo: row.nombre_completo,
    pendientes: row.pendientes
  }));

  const total_pendientes = empleados_afectados.reduce(
    (accumulator, item) => accumulator + item.pendientes,
    0
  );

  console.log({
    periodoId,
    pendientesEncontrados: empleados_afectados.length,
    totalPendientes: total_pendientes
  });

  return {
    empleados_afectados,
    total_pendientes
  };
};

const updateNominaPeriodoEstado = async (
  client: PoolClient,
  periodoId: string,
  estado: string,
  tenant?: TenantAccessContext
): Promise<NominaPeriodo> => {
  const result = await client.query<{ id: string }>(
    `
      UPDATE nomina_periodos
      SET estado = $2
      WHERE id = $1::bigint
      RETURNING id::text AS id
    `,
    [periodoId, estado]
  );

  const updatedRow = result.rows[0];

  if (!updatedRow) {
    throw new AppError('Failed to update payroll period state', 500, 'NOMINA_PERIODO_STATE_UPDATE_FAILED');
  }

  return mapRealPeriodo(await loadRealPeriodoOrThrow(updatedRow.id, tenant, client));
};

const buildWhereClause = (
  filters: Record<string, string | number | null | undefined>,
  map: Record<string, string>
): { params: unknown[]; whereSql: string } => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) {
      continue;
    }

    const column = map[key];

    if (!column) {
      continue;
    }

    params.push(value);
    conditions.push(`${column} = $${params.length}`);
  }

  return {
    params,
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const ensureNoDuplicateNominaEmpleado = async (
  client: PoolClient,
  periodoId: string,
  vinculacionId: string
): Promise<boolean> => {
  const result = await client.query<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_empleados
      WHERE periodo_id::text = $1
        AND vinculacion_id::text = $2
    `,
    [periodoId, vinculacionId]
  );

  return (result.rows[0]?.total ?? 0) > 0;
};

export const listNominaPeriodos = async (
  query: ListNominaPeriodosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<NominaPeriodo>> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'np.contrato_id', 'c.empresa_id');

  if (query.contrato_id) {
    params.push(query.contrato_id);
    conditions.push(`np.contrato_id = $${params.length}::bigint`);
  }

  if (query.empresa_id) {
    params.push(query.empresa_id);
    conditions.push(`c.empresa_id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    conditions.push(`np.estado = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_periodos np
      INNER JOIN contratos c ON c.id = np.contrato_id
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaPeriodoRealRow>(
    `
      ${getNominaPeriodosRealSelect()}
      ${whereSql}
      ORDER BY np.fecha_inicio DESC, np.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapRealPeriodo),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const getNominaPeriodoById = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<NominaPeriodo | null> => {
  const result = await dbQuery<NominaPeriodoRealRow>(
    `
      ${getNominaPeriodosRealSelect()}
      WHERE np.id = $1::bigint
      LIMIT 1
    `,
    [periodoId]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await assertTenantAccessForContrato(row.contrato_id, tenant);
  return mapRealPeriodo(row);
};

export const createNominaPeriodo = async (
  input: CreateNominaPeriodoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureContratoExists(input.contrato_id, client);
    await assertTenantAccessForContrato(input.contrato_id, tenant, client);

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_periodos (
          contrato_id,
          nombre_periodo,
          fecha_inicio,
          fecha_fin,
          tipo_periodo,
          requiere_asistencia,
          estado,
          activo
        )
        VALUES (
          $1::bigint,
          $2,
          $3,
          $4,
          $5,
          $6,
          'ABIERTO',
          $7
        )
        RETURNING id::text AS id
      `,
      [
        input.contrato_id,
        input.nombre_periodo,
        input.fecha_inicio,
        input.fecha_fin,
        input.tipo_periodo,
        input.requiere_asistencia,
        input.activo
      ]
    );

    const createdRow = result.rows[0];

    if (!createdRow) {
      throw new AppError('Failed to create payroll period', 500, 'NOMINA_PERIODO_CREATE_FAILED');
    }

    const created = mapRealPeriodo(await loadRealPeriodoOrThrow(createdRow.id, tenant, client));

    await recordNominaAudit(
      client,
      created.id,
      actorUserId,
      'NOMINA_PERIODO_CREATE',
      {
        after: created
      },
      auditMeta
    );

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateNominaPeriodo = async (
  periodoId: string,
  input: UpdateNominaPeriodoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadRealPeriodoOrThrow(periodoId, tenant, client);

    assertPeriodoAllowsOpenMutations(current.estado, 'updating payroll periods');

    const nextFechaInicio = input.fecha_inicio ?? (toDateString(current.fecha_inicio) ?? '');
    const nextFechaFin = input.fecha_fin ?? (toDateString(current.fecha_fin) ?? '');

    if (nextFechaInicio > nextFechaFin) {
      throw new AppError('fecha_fin must be greater than or equal to fecha_inicio', 400, 'NOMINA_PERIODO_INVALID_RANGE');
    }

    const nextContratoId = input.contrato_id ?? current.contrato_id;
    await ensureContratoExists(nextContratoId, client);
    await assertTenantAccessForContrato(nextContratoId, tenant, client);

    const result = await client.query<{ id: string }>(
      `
        UPDATE nomina_periodos
        SET
          contrato_id = $2::bigint,
          nombre_periodo = $3,
          fecha_inicio = $4,
          fecha_fin = $5,
          tipo_periodo = $6,
          requiere_asistencia = $7,
          activo = $8
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        periodoId,
        nextContratoId,
        input.nombre_periodo ?? current.nombre_periodo,
        nextFechaInicio,
        nextFechaFin,
        input.tipo_periodo ?? current.tipo_periodo,
        input.requiere_asistencia ?? current.requiere_asistencia,
        input.activo ?? current.activo
      ]
    );

    const updatedRow = result.rows[0];

    if (!updatedRow) {
      throw new AppError('Failed to update payroll period', 500, 'NOMINA_PERIODO_UPDATE_FAILED');
    }

    const updated = mapRealPeriodo(await loadRealPeriodoOrThrow(updatedRow.id, tenant, client));

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_PERIODO_UPDATE',
      {
        before: mapRealPeriodo(current),
        after: updated
      },
      auditMeta
    );

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reviewNominaPeriodo = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const currentState = normalizePeriodoEstado(current.estado);

    if (currentState === 'REVISADO') {
      await client.query('COMMIT');
      return mapRealPeriodo(current);
    }

    if (currentState !== 'ABIERTO') {
      throw new AppError(
        'Payroll period is not ready for review',
        409,
        'PERIODO_NOT_READY_FOR_REVIEW'
      );
    }

    const employeesSummary = await loadNominaPeriodoEmployeesSummary(client, periodoId);

    if (
      employeesSummary.total_activos <= 0 ||
      employeesSummary.total_pendientes_sin_revisar > 0
    ) {
      throw new AppError(
        'Payroll period is not ready for review',
        409,
        'PERIODO_NOT_READY_FOR_REVIEW'
      );
    }

    const reviewed = await updateNominaPeriodoEstado(client, periodoId, 'REVISADO', tenant);

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_PERIODO_REVIEW',
      {
        before: mapRealPeriodo(current),
        after: reviewed
      },
      auditMeta
    );

    await client.query('COMMIT');
    return reviewed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closeNominaPeriodo = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const currentState = normalizePeriodoEstado(current.estado);
    const asistenciaPendiente = await loadNominaPeriodoAsistenciaPendiente(client, periodoId);

    if (asistenciaPendiente.total_pendientes > 0) {
      throw new AppError(
        'No se puede cerrar o pagar el periodo porque existen asistencias pendientes por revisar.',
        409,
        'PERIODO_ASISTENCIA_PENDIENTE',
        asistenciaPendiente
      );
    }

    if (currentState === 'CERRADO') {
      await client.query('COMMIT');
      return mapRealPeriodo(current);
    }

    if (currentState !== 'REVISADO') {
      throw new AppError(
        'Payroll period is not ready to close',
        409,
        'PERIODO_NOT_READY_TO_CLOSE'
      );
    }

    const employeesSummary = await loadNominaPeriodoEmployeesSummary(client, periodoId);
    const totalDesprendiblesVigentes = await countNominaDesprendiblesVigentes(client, periodoId);

    if (employeesSummary.total_activos <= 0 || employeesSummary.total_no_revisados > 0 || totalDesprendiblesVigentes <= 0) {
      throw new AppError(
        'Payroll period is not ready to close',
        409,
        'PERIODO_NOT_READY_TO_CLOSE'
      );
    }

    const closed = await updateNominaPeriodoEstado(client, periodoId, 'CERRADO', tenant);

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_PERIODO_CLOSE',
      {
        before: mapRealPeriodo(current),
        after: closed
      },
      auditMeta
    );

    await client.query('COMMIT');
    return closed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const payNominaPeriodo = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const currentState = normalizePeriodoEstado(current.estado);
    const asistenciaPendiente = await loadNominaPeriodoAsistenciaPendiente(client, periodoId);

    if (asistenciaPendiente.total_pendientes > 0) {
      await recordNominaAudit(
        client,
        periodoId,
        actorUserId,
        'NOMINA_PERIODO_PAY_BLOCKED_ASISTENCIA',
        {
          after: {
            periodo_id: periodoId,
            contrato_id: current.contrato_id,
            total_pendientes: asistenciaPendiente.total_pendientes,
            empleados_afectados: asistenciaPendiente.empleados_afectados
          }
        },
        auditMeta
      );

      throw new AppError(
        'No se puede cerrar o pagar el periodo porque existen asistencias pendientes por revisar.',
        409,
        'PERIODO_ASISTENCIA_PENDIENTE',
        asistenciaPendiente
      );
    }

    if (currentState === 'PAGADO') {
      await client.query('COMMIT');
      return mapRealPeriodo(current);
    }

    if (currentState !== 'CERRADO') {
      throw new AppError('Payroll period is not ready to pay', 409, 'PERIODO_NOT_READY_TO_PAY');
    }

    const totalDesprendiblesVigentes = await countNominaDesprendiblesVigentes(client, periodoId);

    if (totalDesprendiblesVigentes <= 0) {
      throw new AppError('Payroll period is not ready to pay', 409, 'PERIODO_NOT_READY_TO_PAY');
    }

    const paid = await updateNominaPeriodoEstado(client, periodoId, 'PAGADO', tenant);

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_PERIODO_PAY',
      {
        before: mapRealPeriodo(current),
        after: paid
      },
      auditMeta
    );

    await client.query('COMMIT');
    return paid;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const cancelNominaPeriodo = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const currentState = normalizePeriodoEstado(current.estado);

    if (currentState === 'ANULADO') {
      await client.query('COMMIT');
      return mapRealPeriodo(current);
    }

    if (!['ABIERTO', 'REVISADO'].includes(currentState)) {
      throw new AppError(
        'Payroll period cannot be canceled from its current state',
        409,
        'NOMINA_PERIODO_INVALID_TRANSITION'
      );
    }

    const canceled = await updateNominaPeriodoEstado(client, periodoId, 'ANULADO', tenant);

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_PERIODO_CANCEL',
      {
        before: mapRealPeriodo(current),
        after: canceled
      },
      auditMeta
    );

    await client.query('COMMIT');
    return canceled;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reopenNominaPeriodo = async (
  periodoId: string,
  input: { force?: boolean },
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const currentState = normalizePeriodoEstado(current.estado);
    const force = input.force === true;
    let targetState: string | null = null;

    if (currentState === 'ABIERTO') {
      await client.query('COMMIT');
      return mapRealPeriodo(current);
    }

    if (currentState === 'REVISADO') {
      targetState = 'ABIERTO';
    } else if (currentState === 'CERRADO') {
      targetState = 'REVISADO';
    } else if (currentState === 'PAGADO') {
      if (!force || !tenant?.isGlobalAdmin) {
        throw new AppError(
          'Paid payroll periods require administrator force=true to reopen',
          409,
          'NOMINA_PERIODO_INVALID_TRANSITION'
        );
      }

      targetState = 'CERRADO';
    } else if (currentState === 'ANULADO') {
      if (!force || !tenant?.isGlobalAdmin) {
        throw new AppError(
          'Canceled payroll periods require administrator force=true to reopen',
          409,
          'NOMINA_PERIODO_INVALID_TRANSITION'
        );
      }

      targetState = 'ABIERTO';
    }

    if (!targetState) {
      throw new AppError(
        'Payroll period cannot be reopened from its current state',
        409,
        'NOMINA_PERIODO_INVALID_TRANSITION'
      );
    }

    const reopened = await updateNominaPeriodoEstado(client, periodoId, targetState, tenant);

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_PERIODO_REOPEN',
      {
        before: mapRealPeriodo(current),
        after: {
          ...reopened,
          force
        }
      },
      auditMeta
    );

    await client.query('COMMIT');
    return reopened;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listNominaEmpleados = async (
  periodoId: string,
  query: ListNominaEmpleadosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<NominaEmpleado>> => {
  await loadRealPeriodoOrThrow(periodoId, tenant);

  const params: unknown[] = [periodoId];
  const conditions = ['ne.periodo_id = $1::bigint'];

  if (query.contrato_id) {
    params.push(query.contrato_id);
    conditions.push(`v.contrato_id = $${params.length}::bigint`);
  }

  if (query.empresa_id) {
    params.push(query.empresa_id);
    conditions.push(`v.empresa_id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    conditions.push(`ne.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.persona_id) {
    params.push(query.persona_id);
    conditions.push(`v.persona_id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    conditions.push(`ne.estado = $${params.length}`);
  }

  if (query.revisado !== undefined) {
    params.push(query.revisado);
    conditions.push(`COALESCE(ne.revisado, FALSE) = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_empleados ne
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaEmpleadoRealRow>(
    `
      ${getNominaEmpleadosRealSelect()}
      ${whereSql}
      ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, ne.id ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapRealEmpleado),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const updateNominaEmpleado = async (
  empleadoId: string,
  input: UpdateNominaEmpleadoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaEmpleado> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const context = await loadNominaEmpleadoContextOrThrow(empleadoId, tenant, client);

    assertPeriodoAllowsOpenMutations(context.periodo_estado, 'updating payroll employees');

    const current = mapRealEmpleado(await loadNominaEmpleadoByIdOrThrow(empleadoId, undefined, client));
    const nextFechaInicioPago =
      input.fecha_inicio_pago !== undefined ? input.fecha_inicio_pago : current.fecha_inicio_pago;
    const nextFechaFinPago =
      input.fecha_fin_pago !== undefined ? input.fecha_fin_pago : current.fecha_fin_pago;

    if (nextFechaInicioPago && nextFechaFinPago && nextFechaInicioPago > nextFechaFinPago) {
      throw new AppError(
        'fecha_fin_pago must be greater than or equal to fecha_inicio_pago',
        400,
        'NOMINA_EMPLEADO_INVALID_RANGE'
      );
    }

    await client.query(
      `
        UPDATE nomina_empleados
        SET
          metodo_liquidacion = $2,
          categoria_salarial_id = $3::bigint,
          salario_base = $4,
          auxilio_transporte = $5,
          otros_devengos = $6,
          fecha_inicio_pago = $7,
          fecha_fin_pago = $8,
          dias_pagados = $9,
          horas_trabajadas = $10,
          horas_extra_total = $11,
          revisado = $12,
          estado = $13,
          motivo_caso_especial = $14
        WHERE id = $1::bigint
      `,
      [
        empleadoId,
        input.metodo_liquidacion ?? current.metodo_liquidacion,
        input.categoria_salarial_id !== undefined
          ? input.categoria_salarial_id
          : current.categoria_salarial?.id ?? null,
        input.salario_base ?? current.salario_base,
        input.auxilio_transporte ?? current.auxilio_transporte,
        input.otros_devengos ?? current.otros_devengos,
        nextFechaInicioPago,
        nextFechaFinPago,
        input.dias_pagados ?? current.dias_pagados,
        input.horas_trabajadas ?? current.horas_trabajadas,
        input.horas_extra_total ?? current.horas_extra_total,
        input.revisado ?? current.revisado,
        input.estado ?? current.estado,
        input.motivo_caso_especial !== undefined
          ? input.motivo_caso_especial
          : current.motivo_caso_especial
      ]
    );

    const updated = mapRealEmpleado(await loadNominaEmpleadoByIdOrThrow(empleadoId, undefined, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_EMPLEADO_UPDATE',
      tabla: 'nomina_empleados',
      registro_id: empleadoId,
      descripcion: 'Actualizacion manual de empleado de nomina',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const importNominaEmpleados = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaImportEmployeesResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);

    assertPeriodoAllowsOpenMutations(periodo.estado, 'importing payroll employees');

    const candidatesResult = await client.query<ImportCandidateRow>(
      `
        SELECT
          v.id::text AS vinculacion_id,
          v.persona_id::text AS persona_id,
          v.fecha_inicio,
          v.fecha_fin,
          v.metodo_pago,
          v.contrato_cargo_id::text AS cargo_id,
          NULL::text AS categoria_id,
          NULL::numeric AS categoria_salario_base,
          NULL::numeric AS categoria_auxilio_transporte
        FROM vinculaciones v
        WHERE v.contrato_id = $1::bigint
          AND v.estado_vinculacion = 'ACTIVA'
          AND v.fecha_inicio <= $2::date
          AND COALESCE(v.fecha_fin, $2::date) >= $3::date
        ORDER BY v.id ASC
      `,
      [periodo.contrato_id, toDateString(periodo.fecha_fin), toDateString(periodo.fecha_inicio)]
    );

    const existingResult = await client.query<{ vinculacion_id: string }>(
      `
        SELECT vinculacion_id::text AS vinculacion_id
        FROM nomina_empleados
        WHERE periodo_id = $1::bigint
      `,
      [periodoId]
    );

    const existingVinculacionIds = new Set(existingResult.rows.map((row) => row.vinculacion_id));

    let imported = 0;
    let skippedDuplicates = 0;
    const periodoFechaInicio = toDateString(periodo.fecha_inicio) ?? '';
    const periodoFechaFin = toDateString(periodo.fecha_fin) ?? '';
    const diasPeriodo = inclusiveDaysBetween(periodoFechaInicio, periodoFechaFin);

    for (const candidate of candidatesResult.rows) {
      if (existingVinculacionIds.has(candidate.vinculacion_id)) {
        skippedDuplicates += 1;
        continue;
      }

      const fechaInicioPago = maxDateString(
        toDateString(candidate.fecha_inicio) ?? periodoFechaInicio,
        periodoFechaInicio
      );
      const fechaFinPago = minDateString(
        toDateString(candidate.fecha_fin) ?? periodoFechaFin,
        periodoFechaFin
      );

      if (fechaInicioPago > fechaFinPago) {
        continue;
      }

      const diasPagados = inclusiveDaysBetween(fechaInicioPago, fechaFinPago);
      const salarioBase = toNumberValue(candidate.categoria_salario_base);
      const auxilioTransporte = toNumberValue(candidate.categoria_auxilio_transporte);

      await client.query(
        `
          INSERT INTO nomina_empleados (
            periodo_id,
            vinculacion_id,
            metodo_liquidacion,
            categoria_salarial_id,
            salario_base,
            auxilio_transporte,
            otros_devengos,
            fecha_inicio_pago,
            fecha_fin_pago,
            dias_periodo,
            dias_pagados,
            horas_trabajadas,
            horas_extra_total,
            devengado_basico,
            devengado_transporte,
            devengado_otros,
            total_adiciones,
            total_deducciones,
            salud,
            pension,
            neto_pagar,
            revisado,
            estado,
            activo,
            motivo_caso_especial
          )
          VALUES (
            $1::bigint,
            $2::bigint,
            $3,
            $4::bigint,
            $5,
            $6,
            0,
            $7,
            $8,
            $9,
            $10,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            FALSE,
            'PENDIENTE',
            TRUE,
            NULL
          )
        `,
        [
          periodoId,
          candidate.vinculacion_id,
          candidate.metodo_pago?.trim() || 'SALARIO',
          candidate.categoria_id,
          salarioBase,
          auxilioTransporte,
          fechaInicioPago,
          fechaFinPago,
          diasPeriodo,
          diasPagados
        ]
      );

      existingVinculacionIds.add(candidate.vinculacion_id);
      imported += 1;
    }

    const updatedPeriodo = mapRealPeriodo(await loadRealPeriodoOrThrow(periodoId, tenant, client));

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      'NOMINA_EMPLEADOS_IMPORT',
      {
        after: {
          imported,
          skipped_duplicates: skippedDuplicates
        }
      },
      auditMeta
    );

    await client.query('COMMIT');

    return {
      imported,
      skipped_duplicates: skippedDuplicates,
      periodo: updatedPeriodo
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const recalculateNominaPeriodo = async (
  periodoId: string,
  options: { force?: boolean } | undefined,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaRecalculateResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const recalculateMode = assertPeriodoAllowsRecalculate(
      periodo.estado,
      options?.force === true,
      tenant
    );

    const empleadosResult = await client.query<{
      auxilio_transporte: number | string | null;
      dias_pagados: number | string | null;
      horas_trabajadas: number | string | null;
      id: string;
      metodo_liquidacion: string | null;
      otros_devengos: number | string | null;
      salario_base: number | string | null;
      vinculacion_id: string;
    }>(
      `
        SELECT
          id::text AS id,
          vinculacion_id::text AS vinculacion_id,
          metodo_liquidacion,
          salario_base,
          auxilio_transporte,
          otros_devengos,
          dias_pagados,
          horas_trabajadas
        FROM nomina_empleados
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
        ORDER BY id ASC
      `,
      [periodoId]
    );

    const novedadesResult = await client.query<NominaNovedadRealRow>(
      `
        ${getNominaNovedadesRealSelect()}
        WHERE nn.periodo_id = $1::bigint
          AND COALESCE(nn.activo, TRUE) = TRUE
        ORDER BY nn.id ASC
      `,
      [periodoId]
    );

    const asistenciaResult = await client.query<{
      dias_pagados_base: number;
      horas_trabajadas_base: number | string | null;
      total_asistencia_activa: number;
      vinculacion_id: string;
    }>(
      `
        SELECT
          vinculacion_id::text AS vinculacion_id,
          COUNT(*) FILTER (
            WHERE estado_dia IN ('PRESENTE', 'INCAPACIDAD', 'PERMISO', 'DESCANSO', 'VACACIONES', 'LICENCIA')
          )::int AS dias_pagados_base,
          COALESCE(SUM(horas_trabajadas), 0) AS horas_trabajadas_base,
          COUNT(*)::int AS total_asistencia_activa
        FROM nomina_asistencia_diaria
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
        GROUP BY vinculacion_id
      `,
      [periodoId]
    );

    const movimientosResult = await client.query<{
      movimientos_devengados: number | string | null;
      movimientos_deducciones: number | string | null;
      movimientos_ss_devengados: number | string | null;
      nomina_empleado_id: string;
    }>(
      `
        SELECT
          nomina_empleado_id::text AS nomina_empleado_id,
          COALESCE(SUM(valor_total) FILTER (
            WHERE COALESCE(activo, TRUE) = TRUE
              AND COALESCE(es_devengado, TRUE) = TRUE
          ), 0) AS movimientos_devengados,
          COALESCE(SUM(valor_total) FILTER (
            WHERE COALESCE(activo, TRUE) = TRUE
              AND COALESCE(es_deduccion, FALSE) = TRUE
          ), 0) AS movimientos_deducciones,
          COALESCE(SUM(valor_total) FILTER (
            WHERE COALESCE(activo, TRUE) = TRUE
              AND COALESCE(es_devengado, TRUE) = TRUE
              AND COALESCE(afecta_seguridad_social, TRUE) = TRUE
          ), 0) AS movimientos_ss_devengados
        FROM nomina_movimientos
        WHERE periodo_id = $1::bigint
        GROUP BY nomina_empleado_id
      `,
      [periodoId]
    );

    const novedadesByEmpleado = new Map<string, NominaNovedadRealRow[]>();
    const asistenciaByVinculacion = new Map(
      asistenciaResult.rows.map((row) => [row.vinculacion_id, row])
    );
    const movimientosByEmpleado = new Map(
      movimientosResult.rows.map((row) => [row.nomina_empleado_id, row])
    );

    for (const novedad of novedadesResult.rows) {
      const currentItems = novedadesByEmpleado.get(novedad.nomina_empleado_id) ?? [];
      currentItems.push(novedad);
      novedadesByEmpleado.set(novedad.nomina_empleado_id, currentItems);
    }

    for (const empleadoRow of empleadosResult.rows) {
      const salarioBase = toNumberValue(empleadoRow.salario_base);
      const auxilioTransporte = toNumberValue(empleadoRow.auxilio_transporte);
      const otrosDevengos = toNumberValue(empleadoRow.otros_devengos);
      const asistenciaEmpleado = asistenciaByVinculacion.get(empleadoRow.vinculacion_id);
      const usaAsistencia =
        (empleadoRow.metodo_liquidacion ?? '').trim().toUpperCase() === 'ASISTENCIA' &&
        !!asistenciaEmpleado &&
        asistenciaEmpleado.total_asistencia_activa > 0;
      // La asistencia aplica solo para empleados con metodo_liquidacion ASISTENCIA.
      // Categoria salarial, salario fijo y OPS no dependen de asistencia diaria.
      const diasPagadosBase =
        usaAsistencia && asistenciaEmpleado
          ? asistenciaEmpleado.dias_pagados_base
          : toNumberValue(empleadoRow.dias_pagados);
      const horasTrabajadasBase =
        usaAsistencia && asistenciaEmpleado
          ? toNumberValue(asistenciaEmpleado.horas_trabajadas_base)
          : toNumberValue(empleadoRow.horas_trabajadas);
      const novedadesEmpleado = novedadesByEmpleado.get(empleadoRow.id) ?? [];
      const movimientosEmpleado = movimientosByEmpleado.get(empleadoRow.id);
      const totalMovimientosDevengados = toNumberValue(movimientosEmpleado?.movimientos_devengados);
      const totalMovimientosDeducciones = toNumberValue(movimientosEmpleado?.movimientos_deducciones);
      const totalMovimientosSsDevengados = toNumberValue(movimientosEmpleado?.movimientos_ss_devengados);

      // Regla Empiria:
      // - Solo PERMISO NO REMUNERADO y SUSPENSION reducen salario base.
      // - Transporte se reduce por cualquier novedad deduccion que afecte transporte.
      // - Otros devengos variables se reducen por ausencias no remuneradas e incapacidades/licencias definidas.
      // - Si el empleado es ASISTENCIA y existe asistencia activa, se usa como base de dias pagados
      //   y las novedades ya no descuentan dias otra vez; solo aplican valor_manual.
      //   La deduplicacion fina por fecha entre asistencia y novedades queda para una fase posterior.
      let diasDescuentoSalario = 0;
      let diasDescuentoTransporte = 0;
      let diasDescuentoOtrosRecargos = 0;
      let adicionesNovedad = 0;
      let deduccionesNovedadManual = 0;

      for (const novedad of novedadesEmpleado) {
        const diasNovedad = Math.max(0, toNumberValue(novedad.dias));
        const valorManual = Math.max(0, toNumberValue(novedad.valor_manual));
        const afectaSalario = toBooleanValue(novedad.tipo_novedad_afecta_salario);
        const afectaTransporte = toBooleanValue(novedad.tipo_novedad_afecta_transporte);
        const esAdicion = toBooleanValue(novedad.tipo_novedad_es_adicion);
        const esDeduccion = toBooleanValue(novedad.tipo_novedad_es_deduccion);
        const nombreTipoNovedad = normalizeNominaNovedadNombre(novedad.tipo_novedad_nombre);
        const reduceSalarioPorDias =
          esDeduccion &&
          diasNovedad > 0 &&
          afectaSalario &&
          NOMINA_NOVEDADES_REDUCEN_SALARIO.has(nombreTipoNovedad);
        const reduceOtrosRecargosPorDias =
          esDeduccion &&
          diasNovedad > 0 &&
          NOMINA_NOVEDADES_REDUCEN_OTROS_RECARGOS.has(nombreTipoNovedad);

        if (!usaAsistencia && reduceSalarioPorDias) {
          diasDescuentoSalario += diasNovedad;
        }

        if (!usaAsistencia && esDeduccion && afectaTransporte && diasNovedad > 0) {
          diasDescuentoTransporte += diasNovedad;
        }

        if (!usaAsistencia && reduceOtrosRecargosPorDias) {
          diasDescuentoOtrosRecargos += diasNovedad;
        }

        if (esAdicion && valorManual > 0) {
          adicionesNovedad += valorManual;
        }

        if (esDeduccion && valorManual > 0) {
          deduccionesNovedadManual += valorManual;
        }
      }

      const diasPagadosSalario = Math.max(0, diasPagadosBase - diasDescuentoSalario);
      const diasPagadosTransporte = Math.max(0, diasPagadosBase - diasDescuentoTransporte);
      const diasPagadosOtrosRecargos = Math.max(0, diasPagadosBase - diasDescuentoOtrosRecargos);
      const devengadoBasico = Number(((salarioBase / 30) * diasPagadosSalario).toFixed(2));
      const devengadoTransporte = Number(((auxilioTransporte / 30) * diasPagadosTransporte).toFixed(2));
      const otrosDevengosProrrateado = Number(((otrosDevengos / 30) * diasPagadosOtrosRecargos).toFixed(2));
      const devengadoOtros = Number((otrosDevengosProrrateado + totalMovimientosDevengados).toFixed(2));
      const baseSeguridadSocial = Number(
        (devengadoBasico + otrosDevengosProrrateado + totalMovimientosSsDevengados).toFixed(2)
      );
      const salud = Number((baseSeguridadSocial * 0.04).toFixed(2));
      const pension = Number((baseSeguridadSocial * 0.04).toFixed(2));
      const totalAdiciones = Number(
        (devengadoBasico + devengadoTransporte + devengadoOtros + adicionesNovedad).toFixed(2)
      );
      const totalDeducciones = Number(
        (salud + pension + deduccionesNovedadManual + totalMovimientosDeducciones).toFixed(2)
      );
      const netoPagar = Number((totalAdiciones - totalDeducciones).toFixed(2));

      await client.query(
        `
          UPDATE nomina_empleados
          SET
            dias_pagados = $2,
            horas_trabajadas = $3,
            devengado_basico = $4,
            devengado_transporte = $5,
            devengado_otros = $6,
            salud = $7,
            pension = $8,
            total_adiciones = $9,
            total_deducciones = $10,
            neto_pagar = $11
          WHERE id = $1::bigint
        `,
        [
          empleadoRow.id,
          diasPagadosBase,
          horasTrabajadasBase,
          devengadoBasico,
          devengadoTransporte,
          devengadoOtros,
          salud,
          pension,
          totalAdiciones,
          totalDeducciones,
          netoPagar
        ]
      );
    }

    const recalculationPayload = {
      empleados_procesados: empleadosResult.rows.length,
      novedades_activas: novedadesResult.rows.length,
      asistencia_activa: asistenciaResult.rows.reduce(
        (accumulator, item) => accumulator + item.total_asistencia_activa,
        0
      ),
      force: recalculateMode.forced
    };

    await recordNominaAudit(
      client,
      periodoId,
      actorUserId,
      recalculateMode.forced ? 'NOMINA_RECALCULATE_FORCE' : 'NOMINA_RECALCULATE_WITH_ASISTENCIA',
      {
        after: recalculationPayload
      },
      auditMeta
    );

    const updatedPeriodo = mapRealPeriodo(await loadRealPeriodoOrThrow(periodoId, tenant, client));

    await client.query('COMMIT');

    return {
      periodo: updatedPeriodo,
      empleados_procesados: empleadosResult.rows.length,
      liquidaciones_generadas: 0
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getNominaAsistenciaByPeriodo = async (
  periodoId: string,
  query: ListNominaAsistenciaQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<NominaAsistencia>> => {
  await loadRealPeriodoOrThrow(periodoId, tenant);

  const params: unknown[] = [periodoId];
  const conditions = ['nad.periodo_id = $1::bigint'];

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    conditions.push(`nad.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.fecha) {
    params.push(query.fecha);
    conditions.push(`nad.fecha = $${params.length}::date`);
  }

  if (query.estado_dia) {
    params.push(query.estado_dia);
    conditions.push(`nad.estado_dia = $${params.length}`);
  }

  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`COALESCE(nad.activo, TRUE) = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_asistencia_diaria nad
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaAsistenciaRealRow>(
    `
      ${getNominaAsistenciaRealSelect()}
      ${whereSql}
      ORDER BY nad.fecha ASC, p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, nad.id ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapRealAsistencia),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const generateNominaAsistencia = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaGenerateAsistenciaResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'generating payroll attendance');

    const empleadosResult = await client.query<{
      metodo_liquidacion: string | null;
      vinculacion_id: string;
    }>(
      `
        SELECT
          ne.vinculacion_id::text AS vinculacion_id,
          ne.metodo_liquidacion
        FROM nomina_empleados ne
        WHERE ne.periodo_id = $1::bigint
          AND COALESCE(ne.activo, TRUE) = TRUE
        GROUP BY ne.vinculacion_id, ne.metodo_liquidacion
        ORDER BY ne.vinculacion_id ASC
      `,
      [periodoId]
    );

    const existingResult = await client.query<{ fecha: Date | string; vinculacion_id: string }>(
      `
        SELECT
          vinculacion_id::text AS vinculacion_id,
          fecha
        FROM nomina_asistencia_diaria
        WHERE periodo_id = $1::bigint
      `,
      [periodoId]
    );

    const existingKeys = new Set(
      existingResult.rows.map((row) => `${row.vinculacion_id}|${toDateString(row.fecha) ?? ''}`)
    );
    const periodoFechaInicio = toDateString(periodo.fecha_inicio) ?? '';
    const periodoFechaFin = toDateString(periodo.fecha_fin) ?? '';
    const fechas = listDateStringsBetween(periodoFechaInicio, periodoFechaFin);
    const rowsToInsert: Array<[string, string, string]> = [];
    let duplicadosOmitidos = 0;
    let empleadosAsistencia = 0;
    let omitidosNoAsistencia = 0;

    for (const empleado of empleadosResult.rows) {
      // La asistencia aplica solo para empleados con metodo_liquidacion ASISTENCIA.
      // Categoria salarial, salario fijo y OPS no dependen de asistencia diaria.
      if ((empleado.metodo_liquidacion ?? '').trim().toUpperCase() !== 'ASISTENCIA') {
        omitidosNoAsistencia += 1;
        continue;
      }

      empleadosAsistencia += 1;

      for (const fecha of fechas) {
        const key = `${empleado.vinculacion_id}|${fecha}`;

        if (existingKeys.has(key)) {
          duplicadosOmitidos += 1;
          continue;
        }

        rowsToInsert.push([periodoId, empleado.vinculacion_id, fecha]);
      }
    }

    if (rowsToInsert.length > 0) {
      const valuesSql: string[] = [];
      const insertParams: unknown[] = [];

      for (const row of rowsToInsert) {
        const baseIndex = insertParams.length;
        valuesSql.push(
          `($${baseIndex + 1}::bigint, $${baseIndex + 2}::bigint, $${baseIndex + 3}::date, NULL, NULL, 0, 'PENDIENTE', NULL, TRUE)`
        );
        insertParams.push(...row);
      }

      await client.query(
        `
          INSERT INTO nomina_asistencia_diaria (
            periodo_id,
            vinculacion_id,
            fecha,
            hora_ingreso,
            hora_salida,
            horas_trabajadas,
            estado_dia,
            observacion,
            activo
          )
          VALUES ${valuesSql.join(',\n')}
        `,
        insertParams
      );
    }

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_ASISTENCIA_GENERATE',
      tabla: 'nomina_periodos',
      registro_id: periodoId,
      descripcion: 'Generacion de asistencia diaria de nomina',
      after: {
        dias_generados: rowsToInsert.length,
        duplicados_omitidos: duplicadosOmitidos,
        empleados_procesados: empleadosResult.rows.length,
        empleados_asistencia: empleadosAsistencia,
        omitidos_no_asistencia: omitidosNoAsistencia
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');

    return {
      dias_generados: rowsToInsert.length,
      duplicados_omitidos: duplicadosOmitidos,
      empleados_procesados: empleadosResult.rows.length,
      empleados_asistencia: empleadosAsistencia,
      omitidos_no_asistencia: omitidosNoAsistencia
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateNominaAsistencia = async (
  asistenciaId: string,
  input: UpdateNominaAsistenciaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaAsistencia> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadNominaAsistenciaByIdOrThrow(asistenciaId, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'updating payroll attendance');

    await client.query(
      `
        UPDATE nomina_asistencia_diaria
        SET
          hora_ingreso = $2,
          hora_salida = $3,
          horas_trabajadas = $4,
          estado_dia = $5,
          observacion = $6,
          activo = $7
        WHERE id = $1::bigint
      `,
      [
        asistenciaId,
        input.hora_ingreso !== undefined ? input.hora_ingreso : current.hora_ingreso,
        input.hora_salida !== undefined ? input.hora_salida : current.hora_salida,
        input.horas_trabajadas !== undefined ? input.horas_trabajadas : toNumberValue(current.horas_trabajadas),
        input.estado_dia !== undefined ? input.estado_dia : current.estado_dia,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo !== undefined ? input.activo : toBooleanValue(current.activo)
      ]
    );

    const updated = mapRealAsistencia(await loadNominaAsistenciaByIdOrThrow(asistenciaId, tenant, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_ASISTENCIA_UPDATE',
      tabla: 'nomina_asistencia_diaria',
      registro_id: asistenciaId,
      descripcion: 'Actualizacion de asistencia diaria de nomina',
      before: mapRealAsistencia(current),
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateNominaAsistencia = async (
  asistenciaId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaAsistencia> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadNominaAsistenciaByIdOrThrow(asistenciaId, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'deactivating payroll attendance');

    await client.query(
      `
        UPDATE nomina_asistencia_diaria
        SET activo = FALSE
        WHERE id = $1::bigint
      `,
      [asistenciaId]
    );

    const updated = mapRealAsistencia(await loadNominaAsistenciaByIdOrThrow(asistenciaId, tenant, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_ASISTENCIA_DEACTIVATE',
      tabla: 'nomina_asistencia_diaria',
      registro_id: asistenciaId,
      descripcion: 'Desactivacion de asistencia diaria de nomina',
      before: mapRealAsistencia(current),
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getNominaMovimientos = async (
  query: ListNominaMovimientosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<NominaMovimiento>> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'np.contrato_id', 'c.empresa_id');

  if (query.periodo_id) {
    params.push(query.periodo_id);
    conditions.push(`nm.periodo_id = $${params.length}::bigint`);
  }

  if (query.nomina_empleado_id) {
    params.push(query.nomina_empleado_id);
    conditions.push(`nm.nomina_empleado_id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    conditions.push(`nm.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.tipo_movimiento) {
    params.push(query.tipo_movimiento);
    conditions.push(`nm.tipo_movimiento = $${params.length}`);
  }

  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`COALESCE(nm.activo, TRUE) = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_movimientos nm
      INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaMovimientoRealRow>(
    `
      ${getNominaMovimientosRealSelect()}
      INNER JOIN contratos c ON c.id = np.contrato_id
      ${whereSql}
      ORDER BY nm.created_at DESC, nm.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapRealMovimiento),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const createNominaMovimiento = async (
  input: CreateNominaMovimientoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(input.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'creating payroll movements');

    const empleadoContext = await loadNominaEmpleadoContextOrThrow(input.nomina_empleado_id, tenant, client);
    const empleado = await loadNominaEmpleadoByIdOrThrow(input.nomina_empleado_id, undefined, client);

    if (empleadoContext.periodo_id !== input.periodo_id) {
      throw new AppError('Payroll employee does not belong to the target period', 409, 'NOMINA_MOVIMIENTO_INVALID_PERIODO');
    }

    if (empleado.vinculacion_id !== input.vinculacion_id) {
      throw new AppError('Vinculacion does not match payroll employee', 409, 'NOMINA_MOVIMIENTO_INVALID_VINCULACION');
    }

    await ensureVinculacionExists(input.vinculacion_id, client);

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_movimientos (
          periodo_id,
          nomina_empleado_id,
          vinculacion_id,
          fecha,
          tipo_movimiento,
          descripcion,
          cantidad,
          valor_unitario,
          valor_total,
          es_devengado,
          es_deduccion,
          afecta_seguridad_social,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::date,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13
        )
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.nomina_empleado_id,
        input.vinculacion_id,
        input.fecha,
        input.tipo_movimiento,
        input.descripcion,
        input.cantidad,
        input.valor_unitario,
        input.valor_total,
        input.es_devengado,
        input.es_deduccion,
        input.afecta_seguridad_social,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError(
        'No fue posible crear el movimiento de nomina',
        500,
        'NOMINA_MOVIMIENTO_CREATE_FAILED'
      );
    }

    const created = mapRealMovimiento(
      await loadNominaMovimientoByIdOrThrow(createdId, tenant, client)
    );

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_MOVIMIENTO_CREATE',
      tabla: 'nomina_movimientos',
      registro_id: created.id,
      descripcion: 'Creacion de movimiento de nomina',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createNominaRecargo = async (
  input: CreateNominaRecargoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(input.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'creating payroll surcharges');

    const empleadoContext = await loadNominaEmpleadoContextOrThrow(input.nomina_empleado_id, tenant, client);
    const empleado = await loadNominaEmpleadoByIdOrThrow(input.nomina_empleado_id, undefined, client);

    if (empleadoContext.periodo_id !== input.periodo_id) {
      throw new AppError('Payroll employee does not belong to the target period', 409, 'NOMINA_RECARGO_INVALID_PERIODO');
    }

    if (empleado.vinculacion_id !== input.vinculacion_id) {
      throw new AppError('Vinculacion does not match payroll employee', 409, 'NOMINA_RECARGO_INVALID_VINCULACION');
    }

    await ensureVinculacionExists(input.vinculacion_id, client);

    const factor = NOMINA_RECARGO_FACTORS[input.tipo_recargo];
    const valorHora = Number((input.salario_base / 240).toFixed(2));
    const valorUnitario = Number((valorHora * factor).toFixed(2));
    const valorTotal = Number((valorUnitario * input.horas).toFixed(2));

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_movimientos (
          periodo_id,
          nomina_empleado_id,
          vinculacion_id,
          fecha,
          tipo_movimiento,
          descripcion,
          cantidad,
          valor_unitario,
          valor_total,
          es_devengado,
          es_deduccion,
          afecta_seguridad_social,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::date,
          $5,
          $6,
          $7,
          $8,
          $9,
          TRUE,
          FALSE,
          TRUE,
          TRUE
        )
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.nomina_empleado_id,
        input.vinculacion_id,
        input.fecha,
        input.tipo_recargo,
        `Recargo automatico ${input.tipo_recargo}`,
        input.horas,
        valorUnitario,
        valorTotal
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('No fue posible crear el recargo de nomina', 500, 'NOMINA_RECARGO_CREATE_FAILED');
    }

    const created = mapRealMovimiento(
      await loadNominaMovimientoByIdOrThrow(createdId, tenant, client)
    );

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_RECARGO_CREATE',
      tabla: 'nomina_movimientos',
      registro_id: created.id,
      descripcion: 'Creacion automatica de recargo de nomina',
      after: {
        ...created,
        factor,
        salario_base: input.salario_base,
        valor_hora: valorHora
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateNominaMovimiento = async (
  movimientoId: string,
  input: UpdateNominaMovimientoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadNominaMovimientoByIdOrThrow(movimientoId, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'updating payroll movements');

    await client.query(
      `
        UPDATE nomina_movimientos
        SET
          fecha = $2::date,
          tipo_movimiento = $3,
          descripcion = $4,
          cantidad = $5,
          valor_unitario = $6,
          valor_total = $7,
          es_devengado = $8,
          es_deduccion = $9,
          afecta_seguridad_social = $10,
          activo = $11
        WHERE id = $1::bigint
      `,
      [
        movimientoId,
        input.fecha !== undefined ? input.fecha : toDateString(current.fecha),
        input.tipo_movimiento ?? current.tipo_movimiento,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        input.cantidad !== undefined ? input.cantidad : toOptionalNumberValue(current.cantidad),
        input.valor_unitario !== undefined ? input.valor_unitario : toOptionalNumberValue(current.valor_unitario),
        input.valor_total !== undefined ? input.valor_total : toNumberValue(current.valor_total),
        input.es_devengado !== undefined ? input.es_devengado : toBooleanValue(current.es_devengado),
        input.es_deduccion !== undefined ? input.es_deduccion : toBooleanValue(current.es_deduccion),
        input.afecta_seguridad_social !== undefined
          ? input.afecta_seguridad_social
          : toBooleanValue(current.afecta_seguridad_social),
        input.activo !== undefined ? input.activo : toBooleanValue(current.activo)
      ]
    );

    const updated = mapRealMovimiento(await loadNominaMovimientoByIdOrThrow(movimientoId, tenant, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_MOVIMIENTO_UPDATE',
      tabla: 'nomina_movimientos',
      registro_id: movimientoId,
      descripcion: 'Actualizacion de movimiento de nomina',
      before: mapRealMovimiento(current),
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateNominaMovimiento = async (
  movimientoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadNominaMovimientoByIdOrThrow(movimientoId, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'deactivating payroll movements');

    await client.query(
      `
        UPDATE nomina_movimientos
        SET activo = FALSE
        WHERE id = $1::bigint
      `,
      [movimientoId]
    );

    const updated = mapRealMovimiento(await loadNominaMovimientoByIdOrThrow(movimientoId, tenant, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_MOVIMIENTO_DEACTIVATE',
      tabla: 'nomina_movimientos',
      registro_id: movimientoId,
      descripcion: 'Desactivacion de movimiento de nomina',
      before: mapRealMovimiento(current),
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listNominaLiquidaciones = async (
  periodoId: string,
  query: ListNominaLiquidacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<NominaLiquidacion>> => {
  await loadRealPeriodoOrThrow(periodoId, tenant);
  const params: unknown[] = [periodoId];
  const conditions = ['nl.periodo_id = $1::bigint'];

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    conditions.push(`nl.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.persona_id) {
    params.push(query.persona_id);
    conditions.push(`p.id = $${params.length}::bigint`);
  }

  if (query.estado) {
    params.push(query.estado);
    conditions.push(`nl.estado = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_liquidaciones nl
      INNER JOIN vinculaciones v ON v.id = nl.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaLiquidacionRealRow>(
    `
      ${getNominaLiquidacionesRealSelect()}
      ${whereSql}
      ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, nl.id ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapRealLiquidacion),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const getNominaLiquidacionByPeriodoAndVinculacion = async (
  periodoId: string,
  vinculacionId: string,
  tenant?: TenantAccessContext
): Promise<NominaLiquidacion | null> => {
  await loadRealPeriodoOrThrow(periodoId, tenant);

  const result = await dbQuery<NominaLiquidacionRealRow>(
    `
      ${getNominaLiquidacionesRealSelect()}
      WHERE nl.periodo_id = $1::bigint
        AND nl.vinculacion_id = $2::bigint
      LIMIT 1
    `,
    [periodoId, vinculacionId]
  );

  const row = result.rows[0];
  return row ? mapRealLiquidacion(row) : null;
};

export const generarNominaLiquidaciones = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaRecalculateResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);

    const empleadosResult = await client.query<{
      auxilio_transporte: number | string | null;
      dias_pagados: number | string | null;
      fecha_fin_vinculacion: Date | string | null;
      fecha_inicio_vinculacion: Date | string | null;
      id: string;
      motivo_retiro: string | null;
      otros_devengos: number | string | null;
      salario_base: number | string | null;
      total_deducciones: number | string | null;
      vinculacion_id: string;
    }>(
      `
        SELECT
          ne.id::text AS id,
          ne.vinculacion_id::text AS vinculacion_id,
          ne.salario_base,
          ne.auxilio_transporte,
          ne.otros_devengos,
          ne.total_deducciones,
          v.fecha_inicio AS fecha_inicio_vinculacion,
          v.fecha_fin AS fecha_fin_vinculacion,
          v.motivo_retiro
        FROM nomina_empleados ne
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        WHERE ne.periodo_id = $1::bigint
          AND COALESCE(ne.activo, TRUE) = TRUE
        ORDER BY ne.id ASC
      `,
      [periodoId]
    );

    const existingResult = await client.query<{ id: string; vinculacion_id: string }>(
      `
        SELECT
          id::text AS id,
          vinculacion_id::text AS vinculacion_id
        FROM nomina_liquidaciones
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [periodoId]
    );

    const existingByVinculacion = new Map(
      existingResult.rows.map((row) => [row.vinculacion_id, row.id])
    );

    let generatedCount = 0;
    let updatedCount = 0;
    let omittedActivas = 0;
    let omittedFueraPeriodo = 0;
    const periodoFechaInicio = toDateString(periodo.fecha_inicio) ?? '';
    const periodoFechaFin = toDateString(periodo.fecha_fin) ?? '';

    for (const empleado of empleadosResult.rows) {
      const fechaInicioVinculacion = toDateString(empleado.fecha_inicio_vinculacion) ?? (toDateString(periodo.fecha_inicio) ?? '');
      const fechaRetiro = toDateString(empleado.fecha_fin_vinculacion);

      if (!fechaRetiro) {
        omittedActivas += 1;
        continue;
      }

      if (fechaRetiro < periodoFechaInicio || fechaRetiro > periodoFechaFin) {
        omittedFueraPeriodo += 1;
        continue;
      }

      let diasTrabajados = 1;

      if (fechaInicioVinculacion && fechaInicioVinculacion <= fechaRetiro) {
        diasTrabajados = Math.max(1, inclusiveDaysBetween(fechaInicioVinculacion, fechaRetiro));
      }

      const salarioBase = toNumberValue(empleado.salario_base);
      const auxilioTransporte = toNumberValue(empleado.auxilio_transporte);
      const promedioSalario = salarioBase;
      const promedioAuxilioTransporte = auxilioTransporte;
      const cesantias = Number((((promedioSalario + promedioAuxilioTransporte) * diasTrabajados) / 360).toFixed(2));
      const interesesCesantias = Number(((cesantias * 0.12 * diasTrabajados) / 360).toFixed(2));
      const primaServicios = Number((((promedioSalario + promedioAuxilioTransporte) * diasTrabajados) / 360).toFixed(2));
      const vacaciones = Number(((promedioSalario * diasTrabajados) / 720).toFixed(2));
      const otrosDevengos = toNumberValue(empleado.otros_devengos);
      const deducciones = toNumberValue(empleado.total_deducciones);
      const totalLiquidacion = Number(
        (cesantias + interesesCesantias + primaServicios + vacaciones + otrosDevengos - deducciones).toFixed(2)
      );

      const existingId = existingByVinculacion.get(empleado.vinculacion_id);

      if (existingId) {
        await client.query(
          `
            UPDATE nomina_liquidaciones
            SET
              fecha_inicio_vinculacion = $2,
              fecha_fin_vinculacion = $3,
              fecha_retiro = $4,
              motivo_retiro = $5,
              dias_base_liquidacion = $6,
              dias_trabajados = $7,
              dias_vacaciones_pendientes = 0,
              salario_base = $8,
              auxilio_transporte = $9,
              promedio_salario = $10,
              promedio_auxilio_transporte = $11,
              cesantias = $12,
              intereses_cesantias = $13,
              prima_servicios = $14,
              vacaciones = $15,
              otros_devengos = $16,
              deducciones = $17,
              total_liquidacion = $18,
              estado = 'GENERADA',
              activo = TRUE
            WHERE id = $1::bigint
          `,
          [
            existingId,
            fechaInicioVinculacion,
            toDateString(empleado.fecha_fin_vinculacion),
            fechaRetiro,
            empleado.motivo_retiro,
            diasTrabajados,
            diasTrabajados,
            salarioBase,
            auxilioTransporte,
            promedioSalario,
            promedioAuxilioTransporte,
            cesantias,
            interesesCesantias,
            primaServicios,
            vacaciones,
            otrosDevengos,
            deducciones,
            totalLiquidacion
          ]
        );

        updatedCount += 1;
        continue;
      }

      await client.query(
        `
          INSERT INTO nomina_liquidaciones (
            vinculacion_id,
            periodo_id,
            fecha_inicio_vinculacion,
            fecha_fin_vinculacion,
            fecha_retiro,
            motivo_retiro,
            dias_base_liquidacion,
            dias_trabajados,
            dias_vacaciones_pendientes,
            salario_base,
            auxilio_transporte,
            promedio_salario,
            promedio_auxilio_transporte,
            cesantias,
            intereses_cesantias,
            prima_servicios,
            vacaciones,
            otros_devengos,
            deducciones,
            total_liquidacion,
            estado,
            activo
          )
          VALUES (
            $1::bigint,
            $2::bigint,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            0,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            'GENERADA',
            TRUE
          )
        `,
        [
          empleado.vinculacion_id,
          periodoId,
          fechaInicioVinculacion,
          toDateString(empleado.fecha_fin_vinculacion),
          fechaRetiro,
          empleado.motivo_retiro,
          diasTrabajados,
          diasTrabajados,
          salarioBase,
          auxilioTransporte,
          promedioSalario,
          promedioAuxilioTransporte,
          cesantias,
          interesesCesantias,
          primaServicios,
          vacaciones,
          otrosDevengos,
          deducciones,
          totalLiquidacion
        ]
      );

      generatedCount += 1;
    }

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_LIQUIDACION_GENERATE',
      tabla: 'nomina_periodos',
      registro_id: periodoId,
      descripcion: 'Generacion de liquidaciones de nomina',
      after: {
        periodo_id: periodoId,
        generadas: generatedCount + updatedCount,
        omitidas_activas: omittedActivas,
        omitidas_fuera_periodo: omittedFueraPeriodo
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');

    return {
      periodo: mapRealPeriodo(periodo),
      empleados_procesados: empleadosResult.rows.length,
      liquidaciones_generadas: generatedCount + updatedCount,
      omitidas_activas: omittedActivas,
      omitidas_fuera_periodo: omittedFueraPeriodo
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const finalizeNominaLiquidaciones = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPeriodo> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);

    const liquidacionesResult = await client.query<CountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM nomina_liquidaciones
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [periodoId]
    );

    const totalLiquidaciones = liquidacionesResult.rows[0]?.total ?? 0;

    if (totalLiquidaciones === 0) {
      throw new AppError(
        'Cannot finalize payroll period without liquidations',
        409,
        'NO_LIQUIDATIONS_TO_FINALIZE'
      );
    }

    await client.query(
      `
        UPDATE nomina_liquidaciones
        SET
          estado = 'FINALIZADA'
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [periodoId]
    );

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_LIQUIDACION_FINALIZE',
      tabla: 'nomina_periodos',
      registro_id: periodoId,
      descripcion: 'Finalizacion de liquidaciones de nomina',
      after: {
        periodo_id: periodoId,
        liquidaciones_finalizadas: totalLiquidaciones
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return mapRealPeriodo(periodo);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listNominaNovedades = async (
  query: ListNominaNovedadesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<NominaNovedad>> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'np.contrato_id', 'c.empresa_id');

  if (query.periodo_id) {
    params.push(query.periodo_id);
    conditions.push(`nn.periodo_id = $${params.length}::bigint`);
  }

  if (query.nomina_empleado_id) {
    params.push(query.nomina_empleado_id);
    conditions.push(`nn.nomina_empleado_id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    conditions.push(`nn.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.tipo_novedad_id) {
    params.push(query.tipo_novedad_id);
    conditions.push(`nn.tipo_novedad_id = $${params.length}::bigint`);
  }

  if (query.revisado !== undefined) {
    params.push(query.revisado);
    conditions.push(`COALESCE(nn.revisado, FALSE) = $${params.length}`);
  }

  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`COALESCE(nn.activo, TRUE) = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_novedades nn
      INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<NominaNovedadRealRow>(
    `
      ${getNominaNovedadesRealSelect()}
      ${whereSql}
      ORDER BY nn.created_at DESC, nn.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapRealNovedad),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const createNominaNovedad = async (
  input: CreateNominaNovedadInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaNovedad> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(input.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'creating payroll novelties');

    const empleadoContext = await loadNominaEmpleadoContextOrThrow(input.nomina_empleado_id, tenant, client);
    const empleado = await loadNominaEmpleadoByIdOrThrow(input.nomina_empleado_id, undefined, client);

    if (empleadoContext.periodo_id !== input.periodo_id) {
      throw new AppError(
        'Payroll employee does not belong to the provided period',
        400,
        'NOMINA_NOVEDAD_EMPLEADO_PERIODO_INVALIDO'
      );
    }

    if (empleado.vinculacion_id !== input.vinculacion_id) {
      throw new AppError(
        'Payroll employee does not match vinculacion_id',
        400,
        'NOMINA_NOVEDAD_VINCULACION_INVALIDA'
      );
    }

    const tipoNovedad = await loadNominaTipoNovedadByIdOrThrow(input.tipo_novedad_id, client);
    validateNovedadInputAgainstTipo(tipoNovedad, {
      fecha_inicio: input.fecha_inicio,
      fecha_fin: input.fecha_fin,
      dias: input.dias,
      horas: input.horas,
      valor_manual: input.valor_manual
    });

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_novedades (
          periodo_id,
          nomina_empleado_id,
          vinculacion_id,
          tipo_novedad_id,
          fecha_inicio,
          fecha_fin,
          dias,
          horas,
          valor_manual,
          categoria_anterior_id,
          categoria_nueva_id,
          observacion,
          revisado,
          activo,
          requiere_cobertura,
          cubierta
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::bigint,
          $11::bigint,
          $12,
          $13,
          $14,
          $15,
          $16
        )
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.nomina_empleado_id,
        input.vinculacion_id,
        input.tipo_novedad_id,
        input.fecha_inicio,
        input.fecha_fin,
        input.dias,
        input.horas,
        input.valor_manual,
        input.categoria_anterior_id,
        input.categoria_nueva_id,
        input.observacion,
        input.revisado,
        input.activo,
        input.requiere_cobertura,
        input.cubierta
      ]
    );

    const createdRow = result.rows[0];

    if (!createdRow) {
      throw new AppError('Failed to create payroll novelty', 500, 'NOMINA_NOVEDAD_CREATE_FAILED');
    }

    const created = mapRealNovedad(await loadNominaNovedadByIdOrThrow(createdRow.id, tenant, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_NOVEDAD_CREATE',
      tabla: 'nomina_novedades',
      registro_id: created.id,
      descripcion: 'Creacion de novedad de nomina',
      before: null,
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateNominaNovedad = async (
  novedadId: string,
  input: UpdateNominaNovedadInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaNovedad> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadNominaNovedadByIdOrThrow(novedadId, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'updating payroll novelties');

    const nextTipoNovedadId = input.tipo_novedad_id ?? current.tipo_novedad.id;
    const nextFechaInicio =
      input.fecha_inicio !== undefined ? input.fecha_inicio : toDateString(current.fecha_inicio);
    const nextFechaFin =
      input.fecha_fin !== undefined ? input.fecha_fin : toDateString(current.fecha_fin);
    const nextDias =
      input.dias !== undefined ? input.dias : toOptionalNumberValue(current.dias);
    const nextHoras =
      input.horas !== undefined ? input.horas : toOptionalNumberValue(current.horas);
    const nextValorManual =
      input.valor_manual !== undefined ? input.valor_manual : toOptionalNumberValue(current.valor_manual);

    const tipoNovedad = await loadNominaTipoNovedadByIdOrThrow(nextTipoNovedadId, client);
    validateNovedadInputAgainstTipo(tipoNovedad, {
      fecha_inicio: nextFechaInicio,
      fecha_fin: nextFechaFin,
      dias: nextDias,
      horas: nextHoras,
      valor_manual: nextValorManual
    });

    await client.query(
      `
        UPDATE nomina_novedades
        SET
          tipo_novedad_id = $2::bigint,
          fecha_inicio = $3,
          fecha_fin = $4,
          dias = $5,
          horas = $6,
          valor_manual = $7,
          categoria_anterior_id = $8::bigint,
          categoria_nueva_id = $9::bigint,
          observacion = $10,
          revisado = $11,
          requiere_cobertura = $12,
          cubierta = $13,
          activo = $14
        WHERE id = $1::bigint
      `,
      [
        novedadId,
        nextTipoNovedadId,
        nextFechaInicio,
        nextFechaFin,
        nextDias,
        nextHoras,
        nextValorManual,
        input.categoria_anterior_id !== undefined
          ? input.categoria_anterior_id
          : current.categoria_anterior_id,
        input.categoria_nueva_id !== undefined
          ? input.categoria_nueva_id
          : current.categoria_nueva_id,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.revisado ?? current.revisado,
        input.requiere_cobertura ?? current.requiere_cobertura,
        input.cubierta ?? current.cubierta,
        input.activo ?? current.activo
      ]
    );

    const updated = mapRealNovedad(await loadNominaNovedadByIdOrThrow(novedadId, tenant, client));
    const before = mapRealNovedad(current);

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_NOVEDAD_UPDATE',
      tabla: 'nomina_novedades',
      registro_id: novedadId,
      descripcion: 'Actualizacion de novedad de nomina',
      before,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateNominaNovedad = async (
  novedadId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaNovedad> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await loadNominaNovedadByIdOrThrow(novedadId, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'deactivating payroll novelties');

    await client.query(
      `
        UPDATE nomina_novedades
        SET activo = FALSE
        WHERE id = $1::bigint
      `,
      [novedadId]
    );

    const updated = mapRealNovedad(await loadNominaNovedadByIdOrThrow(novedadId, tenant, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_NOVEDAD_DEACTIVATE',
      tabla: 'nomina_novedades',
      registro_id: novedadId,
      descripcion: 'Desactivacion de novedad de nomina',
      before: mapRealNovedad(current),
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listNominaDesprendibles = async (
  periodoId: string,
  tenant?: TenantAccessContext,
  options?: { includeVersions?: boolean }
): Promise<NominaDesprendible[]> => {
  await loadRealPeriodoOrThrow(periodoId, tenant);
  const includeVersions = options?.includeVersions === true;
  const vigenteFilter = includeVersions ? '' : 'AND COALESCE(nd.es_vigente, TRUE) = TRUE';

  const result = await dbQuery<NominaDesprendibleRealRow>(
    `
      ${getNominaDesprendiblesRealSelect()}
      WHERE nd.periodo_id = $1::bigint
        AND COALESCE(nd.activo, TRUE) = TRUE
        ${vigenteFilter}
      ORDER BY nd.vinculacion_id ASC, nd.version DESC, nd.id DESC
    `,
    [periodoId]
  );

  return result.rows.map(mapRealDesprendible);
};

export const getNominaDesprendibleByPeriodoAndVinculacion = async (
  periodoId: string,
  vinculacionId: string,
  tenant?: TenantAccessContext,
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<NominaDesprendible | null> => {
  await loadRealPeriodoOrThrow(periodoId, tenant);

  const result = await dbQuery<NominaDesprendibleRealRow>(
    `
      ${getNominaDesprendiblesRealSelect()}
      WHERE nd.periodo_id = $1::bigint
        AND nd.vinculacion_id = $2::bigint
        AND COALESCE(nd.activo, TRUE) = TRUE
        AND COALESCE(nd.es_vigente, TRUE) = TRUE
      ORDER BY nd.version DESC, nd.id DESC
      LIMIT 1
    `,
    [periodoId, vinculacionId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const desprendible = mapRealDesprendible(row);

  if (
    actorUserId &&
    desprendible.documento.storage_bucket &&
    desprendible.documento.storage_path
  ) {
    desprendible.documento.signed_url = await createDocumentSignedUrlForBucket(
      desprendible.documento.storage_bucket,
      desprendible.documento.storage_path,
      300
    );

    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'NOMINA_DESPRENDIBLE_DOWNLOAD',
      tabla: 'nomina_desprendibles',
      registro_id: desprendible.id,
      descripcion: 'Generacion de URL firmada para descarga de desprendible de nomina',
      after: {
        periodo_id: periodoId,
        vinculacion_id: vinculacionId,
        documento_persona_id: desprendible.documento.documento_persona_id
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });
  }

  return desprendible;
};

export const generateNominaDesprendibles = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaGenerateDesprendiblesResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    assertPeriodoAllowsDesprendibleGeneration(periodo.estado);
    const tipoDocumento = await loadNominaTipoDocumentoByCodeOrThrow('DESPRENDIBLE_PAGO', client);

    const empleadosResult = await client.query<NominaDesprendibleGenerateRow>(
      `
        SELECT
          ne.id::text AS nomina_empleado_id,
          ne.vinculacion_id::text AS vinculacion_id,
          COALESCE(ne.activo, TRUE) AS activo,
          ne.salario_base,
          ne.auxilio_transporte,
          ne.devengado_basico,
          ne.devengado_transporte,
          ne.devengado_otros,
          ne.dias_pagados,
          ne.total_adiciones,
          ne.total_deducciones,
          ne.neto_pagar,
          ne.salud,
          ne.pension,
          COALESCE(ne.revisado, FALSE) AS revisado,
          p.id::text AS persona_id,
          p.numero_documento AS persona_numero_documento,
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
          cc.nombre_cargo AS cargo_nombre,
          c.id::text AS contrato_id,
          c.empresa_id::text AS contrato_empresa_id,
          c.numero_contrato AS contrato_numero,
          c.entidad_contratante AS contrato_entidad_contratante,
          e.nombre_empresa AS empresa_nombre,
          e.nit AS empresa_nit,
          np.id::text AS periodo_id,
          np.nombre_periodo AS periodo_nombre,
          np.fecha_inicio AS periodo_fecha_inicio,
          np.fecha_fin AS periodo_fecha_fin,
          np.estado AS periodo_estado
        FROM nomina_empleados ne
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        INNER JOIN empresas e ON e.id = c.empresa_id
        LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
        WHERE ne.periodo_id = $1::bigint
          AND COALESCE(ne.activo, TRUE) = TRUE
        ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, ne.id ASC
      `,
      [periodoId]
    );

    const novedadesResult = await client.query<NominaDesprendibleNovedadRow>(
      `
        SELECT
          nn.nomina_empleado_id::text AS nomina_empleado_id,
          ntn.nombre AS tipo_novedad_nombre,
          nn.dias,
          nn.horas,
          nn.valor_manual,
          nn.observacion
        FROM nomina_novedades nn
        INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
        WHERE nn.periodo_id = $1::bigint
          AND COALESCE(nn.activo, TRUE) = TRUE
        ORDER BY nn.nomina_empleado_id ASC, nn.created_at ASC, nn.id ASC
      `,
      [periodoId]
    );

    const novedadesByEmpleado = new Map<
      string,
      Array<{
        dias: number | null;
        horas: number | null;
        observacion: string | null;
        tipo_novedad_nombre: string | null;
        valor_manual: number | null;
      }>
    >();

    for (const novedad of novedadesResult.rows) {
      const existing = novedadesByEmpleado.get(novedad.nomina_empleado_id) ?? [];
      existing.push({
        dias: toOptionalNumberValue(novedad.dias),
        horas: toOptionalNumberValue(novedad.horas),
        observacion: novedad.observacion,
        tipo_novedad_nombre: novedad.tipo_novedad_nombre,
        valor_manual: toOptionalNumberValue(novedad.valor_manual)
      });
      novedadesByEmpleado.set(novedad.nomina_empleado_id, existing);
    }

    const movimientosResult = await client.query<{
      cantidad: number | string | null;
      descripcion: string | null;
      es_deduccion: boolean | null;
      es_devengado: boolean | null;
      nomina_empleado_id: string;
      tipo_movimiento: string;
      valor_total: number | string | null;
      valor_unitario: number | string | null;
    }>(
      `
        SELECT
          nm.nomina_empleado_id::text AS nomina_empleado_id,
          nm.tipo_movimiento,
          nm.descripcion,
          nm.cantidad,
          nm.valor_unitario,
          nm.valor_total,
          COALESCE(nm.es_devengado, TRUE) AS es_devengado,
          COALESCE(nm.es_deduccion, FALSE) AS es_deduccion
        FROM nomina_movimientos nm
        WHERE nm.periodo_id = $1::bigint
          AND COALESCE(nm.activo, TRUE) = TRUE
        ORDER BY nm.nomina_empleado_id ASC, nm.created_at ASC, nm.id ASC
      `,
      [periodoId]
    );

    const movimientosByEmpleado = new Map<
      string,
      Array<{
        cantidad: number | null;
        descripcion: string | null;
        es_deduccion: boolean;
        es_devengado: boolean;
        tipo_movimiento: string;
        valor_total: number;
        valor_unitario: number | null;
      }>
    >();

    for (const movimiento of movimientosResult.rows) {
      const existingItems = movimientosByEmpleado.get(movimiento.nomina_empleado_id) ?? [];
      existingItems.push({
        cantidad: toOptionalNumberValue(movimiento.cantidad),
        descripcion: movimiento.descripcion,
        es_deduccion: toBooleanValue(movimiento.es_deduccion),
        es_devengado: toBooleanValue(movimiento.es_devengado),
        tipo_movimiento: movimiento.tipo_movimiento,
        valor_total: toNumberValue(movimiento.valor_total),
        valor_unitario: toOptionalNumberValue(movimiento.valor_unitario)
      });
      movimientosByEmpleado.set(movimiento.nomina_empleado_id, existingItems);
    }

    let generatedCount = 0;

    for (const empleado of empleadosResult.rows) {
      const personaNombre = normalizeFullName(
        empleado.primer_nombre,
        empleado.segundo_nombre,
        empleado.primer_apellido,
        empleado.segundo_apellido
      );
      const versionResult = await client.query<{
        desprendible_id: string;
        documento_persona_id: string | null;
        version: number | string | null;
      }>(
        `
          SELECT
            id::text AS desprendible_id,
            documento_persona_id::text AS documento_persona_id,
            version,
            es_vigente
          FROM nomina_desprendibles
          WHERE periodo_id = $1::bigint
            AND nomina_empleado_id = $2::bigint
            AND COALESCE(activo, TRUE) = TRUE
            AND COALESCE(es_vigente, TRUE) = TRUE
          ORDER BY COALESCE(es_vigente, TRUE) DESC, version DESC NULLS LAST, id DESC
          LIMIT 1
        `,
        [periodoId, empleado.nomina_empleado_id]
      );

      const existing = versionResult.rows[0];
      const nextVersion = existing ? Number(existing.version ?? 1) + 1 : 1;
      const timestamp = Date.now();
      const salarioBase = toNumberValue(empleado.salario_base);
      const auxilioTransporte = toNumberValue(empleado.auxilio_transporte);
      const devengadoBasico = toNumberValue(empleado.devengado_basico);
      const devengadoTransporte = toNumberValue(empleado.devengado_transporte);
      const devengadoOtros = toNumberValue(empleado.devengado_otros);
      const totalAdiciones = toNumberValue(empleado.total_adiciones);
      const totalDeducciones = toNumberValue(empleado.total_deducciones);
      const netoPagar = toNumberValue(empleado.neto_pagar);
      const salud = toNumberValue(empleado.salud);
      const pension = toNumberValue(empleado.pension);
      const fechaGeneracion = new Date().toISOString();
      const periodoFechaInicio = toDateString(empleado.periodo_fecha_inicio) ?? '';
      const periodoFechaFin = toDateString(empleado.periodo_fecha_fin) ?? '';
      const novedades = novedadesByEmpleado.get(empleado.nomina_empleado_id) ?? [];
      const movimientos = movimientosByEmpleado.get(empleado.nomina_empleado_id) ?? [];
      const fileName = buildNominaDesprendibleFileName(
        periodoId,
        empleado.nomina_empleado_id,
        nextVersion,
        timestamp
      );
      const storagePath = buildNominaDesprendibleStoragePath(
        periodoId,
        empleado.vinculacion_id,
        empleado.nomina_empleado_id,
        nextVersion,
        timestamp
      );
      console.log({
        periodoId,
        nominaEmpleadoId: empleado.nomina_empleado_id,
        desprendibleAnteriorId: existing?.desprendible_id ?? null,
        versionAnterior: existing ? Number(existing.version ?? 1) : null,
        nuevaVersion: nextVersion,
        storagePath
      });
      const fileBuffer = await buildNominaDesprendiblePdfBuffer({
        auxilio_transporte: auxilioTransporte,
        cargo_nombre: empleado.cargo_nombre,
        contrato_numero: empleado.contrato_numero,
        devengado_otros: devengadoOtros,
        devengado_salario: devengadoBasico,
        devengado_transporte: devengadoTransporte,
        empresa_nit: empleado.empresa_nit,
        empresa_nombre: empleado.empresa_nombre,
        fecha_generacion: fechaGeneracion,
        movimientos,
        neto_pagar: netoPagar,
        novedades,
        nomina_empleado_id: empleado.nomina_empleado_id,
        dias_pagados: toNumberValue(empleado.dias_pagados),
        periodo_fecha_fin: periodoFechaFin,
        periodo_fecha_inicio: periodoFechaInicio,
        periodo_id: periodoId,
        periodo_nombre: empleado.periodo_nombre,
        pension,
        persona_nombre: personaNombre,
        persona_numero_documento: empleado.persona_numero_documento,
        salud,
        salario_base: salarioBase,
        total_adiciones: totalAdiciones,
        total_deducciones: totalDeducciones,
        version: nextVersion,
        vinculacion_id: empleado.vinculacion_id
      });
      const storage = await uploadNominaPdfToStorage(storagePath, fileBuffer);

      if (existing?.desprendible_id) {
        await client.query(
          `
            UPDATE nomina_desprendibles
            SET
              es_vigente = FALSE,
              estado = 'REEMPLAZADO'
            WHERE id = $1::bigint
          `,
          [existing.desprendible_id]
        );
      }

      if (existing?.documento_persona_id) {
        await client.query(
          `
            UPDATE documentos_persona
            SET es_vigente = FALSE
            WHERE id = $1::bigint
          `,
          [existing.documento_persona_id]
        );
      }

      const payload = buildNominaDesprendiblePayload({
        archivo_path: storage.path,
        auxilio_transporte_snapshot: auxilioTransporte,
        cargo_nombre_snapshot: empleado.cargo_nombre,
        contrato_id: empleado.contrato_id,
        contrato_nombre_snapshot: empleado.contrato_numero,
        devengado_otros: devengadoOtros,
        devengado_salario: devengadoBasico,
        devengado_transporte: devengadoTransporte,
        dias_liquidados: toNumberValue(empleado.dias_pagados),
        empresa_nit: empleado.empresa_nit,
        empresa_nombre: empleado.empresa_nombre,
        fecha_generacion: fechaGeneracion,
        movimientos,
        neto_pagar: netoPagar,
        novedades,
        pension,
        periodo_fecha_fin: periodoFechaFin,
        periodo_fecha_inicio: periodoFechaInicio,
        periodo_id: periodoId,
        periodo_nombre: empleado.periodo_nombre,
        persona_id: empleado.persona_id,
        persona_nombre_snapshot: personaNombre,
        persona_numero_documento: empleado.persona_numero_documento,
        salud,
        salario_base_snapshot: salarioBase,
        total_adiciones: totalAdiciones,
        total_deducciones: totalDeducciones,
        total_devengado: totalAdiciones,
        tipo_desprendible: 'PAGO',
        version: nextVersion,
        vinculacion_id: empleado.vinculacion_id
      });

      const documentoPersonaResult = await client.query<{ id: string }>(
        `
          INSERT INTO documentos_persona (
            persona_id,
            tipo_documento_id,
            fecha_expedicion,
            fecha_vencimiento,
            archivo_path,
            fecha_carga,
            activo,
            vinculacion_id,
            version,
            documento_reemplaza_id,
            es_vigente,
            storage_bucket,
            storage_path,
            nombre_original,
            mime_type,
            tamano_bytes
          )
          VALUES (
            $1::bigint,
            $2::bigint,
            $3::date,
            NULL,
            $4,
            NOW(),
            TRUE,
            $5::bigint,
            $6::int,
            $7::bigint,
            TRUE,
            $8,
            $9,
            $10,
            $11,
            $12::bigint
          )
          RETURNING id::text AS id
        `,
        [
          empleado.persona_id,
          tipoDocumento.id,
          periodoFechaFin,
          storage.path,
          empleado.vinculacion_id,
          nextVersion,
          existing?.documento_persona_id ?? null,
          storage.bucket,
          storage.path,
          fileName,
          'application/pdf',
          fileBuffer.byteLength
        ]
      );

      const documentoPersonaId = documentoPersonaResult.rows[0]?.id;

      if (!documentoPersonaId) {
        throw new AppError(
          'No fue posible crear el documento persona del desprendible',
          500,
          'NOMINA_DESPRENDIBLE_DOCUMENT_CREATE_FAILED'
        );
      }

      await client.query(
        `
          INSERT INTO nomina_desprendibles (
            periodo_id,
            nomina_empleado_id,
            vinculacion_id,
            tipo_desprendible,
            archivo_path,
            fecha_generacion,
            estado,
            observacion,
            activo,
            documento_persona_id,
            version,
            es_vigente,
            desprendible_reemplaza_id
          )
          VALUES (
            $1::bigint,
            $2::bigint,
            $3::bigint,
            $4,
            $5,
            NOW(),
            'GENERADO',
            $6,
            TRUE,
            $7::bigint,
            $8::int,
            TRUE,
            $9::bigint
          )
        `,
        [
          periodoId,
          empleado.nomina_empleado_id,
          empleado.vinculacion_id,
          'PAGO',
          storage.path,
          JSON.stringify(payload),
          documentoPersonaId,
          nextVersion,
          existing?.desprendible_id ?? null
        ]
      );

      generatedCount += 1;
    }

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_DESPRENDIBLE_GENERATE',
      tabla: 'nomina_periodos',
      registro_id: periodoId,
      descripcion: 'Generacion de desprendibles de pago',
      after: {
        desprendibles_generados: generatedCount,
        periodo_id: periodoId
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');

    return {
      desprendibles_generados: generatedCount,
      periodo: mapRealPeriodo(periodo)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const finalizeNominaDesprendibles = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaFinalizeDesprendiblesResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    const currentResult = await client.query<CountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM nomina_desprendibles
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
          AND COALESCE(es_vigente, TRUE) = TRUE
      `,
      [periodoId]
    );

    const totalCurrent = currentResult.rows[0]?.total ?? 0;

    if (totalCurrent === 0) {
      throw new AppError(
        'No hay desprendibles generados para finalizar',
        409,
        'NO_DESPRENDIBLES_TO_FINALIZE'
      );
    }

    await client.query(
      `
        UPDATE nomina_desprendibles
        SET estado = 'FINALIZADO'
        WHERE periodo_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
          AND COALESCE(es_vigente, TRUE) = TRUE
      `,
      [periodoId]
    );

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_DESPRENDIBLE_FINALIZE',
      tabla: 'nomina_periodos',
      registro_id: periodoId,
      descripcion: 'Finalizacion de desprendibles de pago',
      after: {
        desprendibles_finalizados: totalCurrent,
        periodo_id: periodoId
      },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');

    return {
      desprendibles_finalizados: totalCurrent,
      periodo: mapRealPeriodo(periodo)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const loadNominaDashboardData = async (
  periodoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaDashboard> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
  const executor = client ?? dbPool;

  const empleadosResult = await executor.query<{
    empleados_pendientes: number;
    empleados_revisados: number;
    empleados_total: number;
    total_deducciones: number | string | null;
    total_devengado: number | string | null;
    total_neto: number | string | null;
    total_otros: number | string | null;
    total_pension: number | string | null;
    total_salud: number | string | null;
    total_transporte: number | string | null;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE)::int AS empleados_total,
        COUNT(*) FILTER (
          WHERE COALESCE(activo, TRUE) = TRUE
            AND COALESCE(revisado, FALSE) = TRUE
        )::int AS empleados_revisados,
        COUNT(*) FILTER (
          WHERE COALESCE(activo, TRUE) = TRUE
            AND COALESCE(revisado, FALSE) = FALSE
        )::int AS empleados_pendientes,
        COALESCE(SUM(total_adiciones) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_devengado,
        COALESCE(SUM(total_deducciones) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_deducciones,
        COALESCE(SUM(neto_pagar) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_neto,
        COALESCE(SUM(salud) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_salud,
        COALESCE(SUM(pension) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_pension,
        COALESCE(SUM(devengado_transporte) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_transporte,
        COALESCE(SUM(devengado_otros) FILTER (WHERE COALESCE(activo, TRUE) = TRUE), 0) AS total_otros
      FROM nomina_empleados
      WHERE periodo_id = $1::bigint
    `,
    [periodoId]
  );

  const conteosResult = await executor.query<{
    total_desprendibles: number;
    total_movimientos: number;
    total_novedades: number;
  }>(
    `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM nomina_novedades
          WHERE periodo_id = $1::bigint
            AND COALESCE(activo, TRUE) = TRUE
        ) AS total_novedades,
        (
          SELECT COUNT(*)::int
          FROM nomina_movimientos
          WHERE periodo_id = $1::bigint
            AND COALESCE(activo, TRUE) = TRUE
        ) AS total_movimientos,
        (
          SELECT COUNT(*)::int
          FROM nomina_desprendibles
          WHERE periodo_id = $1::bigint
            AND COALESCE(activo, TRUE) = TRUE
            AND COALESCE(es_vigente, TRUE) = TRUE
        ) AS total_desprendibles
    `,
    [periodoId]
  );

  const asistenciaResult = await executor.query<{
    ausentes: number;
    incapacidades: number;
    pendientes: number;
    permisos: number;
    presentes: number;
    suspensiones: number;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE estado_dia = 'PRESENTE' AND COALESCE(activo, TRUE) = TRUE)::int AS presentes,
        COUNT(*) FILTER (WHERE estado_dia = 'AUSENTE' AND COALESCE(activo, TRUE) = TRUE)::int AS ausentes,
        COUNT(*) FILTER (WHERE estado_dia = 'PENDIENTE' AND COALESCE(activo, TRUE) = TRUE)::int AS pendientes,
        COUNT(*) FILTER (WHERE estado_dia = 'INCAPACIDAD' AND COALESCE(activo, TRUE) = TRUE)::int AS incapacidades,
        COUNT(*) FILTER (WHERE estado_dia = 'PERMISO' AND COALESCE(activo, TRUE) = TRUE)::int AS permisos,
        COUNT(*) FILTER (WHERE estado_dia = 'SUSPENSION' AND COALESCE(activo, TRUE) = TRUE)::int AS suspensiones
      FROM nomina_asistencia_diaria
      WHERE periodo_id = $1::bigint
    `,
    [periodoId]
  );

  const empleados = empleadosResult.rows[0];
  const conteos = conteosResult.rows[0];
  const asistencia = asistenciaResult.rows[0];

  return {
    empleados_total: empleados?.empleados_total ?? 0,
    empleados_revisados: empleados?.empleados_revisados ?? 0,
    empleados_pendientes: empleados?.empleados_pendientes ?? 0,
    total_devengado: toNumberValue(empleados?.total_devengado),
    total_deducciones: toNumberValue(empleados?.total_deducciones),
    total_neto: toNumberValue(empleados?.total_neto),
    total_salud: toNumberValue(empleados?.total_salud),
    total_pension: toNumberValue(empleados?.total_pension),
    total_transporte: toNumberValue(empleados?.total_transporte),
    total_otros: toNumberValue(empleados?.total_otros),
    total_novedades: conteos?.total_novedades ?? 0,
    total_movimientos: conteos?.total_movimientos ?? 0,
    total_desprendibles: conteos?.total_desprendibles ?? 0,
    asistencia: {
      presentes: asistencia?.presentes ?? 0,
      ausentes: asistencia?.ausentes ?? 0,
      pendientes: asistencia?.pendientes ?? 0,
      incapacidades: asistencia?.incapacidades ?? 0,
      permisos: asistencia?.permisos ?? 0,
      suspensiones: asistencia?.suspensiones ?? 0
    },
    estado_periodo: periodo.estado
  };
};

const dashboardToExportRows = (
  dashboard: NominaDashboard
): Array<Record<string, string | number | boolean | null>> => {
  return [
    {
      empleados_total: dashboard.empleados_total,
      empleados_revisados: dashboard.empleados_revisados,
      empleados_pendientes: dashboard.empleados_pendientes,
      total_devengado: dashboard.total_devengado,
      total_deducciones: dashboard.total_deducciones,
      total_neto: dashboard.total_neto,
      total_salud: dashboard.total_salud,
      total_pension: dashboard.total_pension,
      total_transporte: dashboard.total_transporte,
      total_otros: dashboard.total_otros,
      total_novedades: dashboard.total_novedades,
      total_movimientos: dashboard.total_movimientos,
      total_desprendibles: dashboard.total_desprendibles,
      asistencia_presentes: dashboard.asistencia.presentes,
      asistencia_ausentes: dashboard.asistencia.ausentes,
      asistencia_pendientes: dashboard.asistencia.pendientes,
      asistencia_incapacidades: dashboard.asistencia.incapacidades,
      asistencia_permisos: dashboard.asistencia.permisos,
      asistencia_suspensiones: dashboard.asistencia.suspensiones,
      estado_periodo: dashboard.estado_periodo
    }
  ];
};

const getNominaPlanoBancarioRows = async (
  periodoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
  assertPeriodoAllowsPostCloseOutputs(periodo.estado, 'exporting payroll bank file');
  const executor = client ?? dbPool;

  const result = await executor.query<{
    contrato_numero: string | null;
    nombre_completo: string;
    nombre_periodo: string;
    numero_documento: string | null;
    tipo_documento: string | null;
    valor_pagar: number | string | null;
  }>(
    `
      SELECT
        td.nombre_documento AS tipo_documento,
        p.numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
        ne.neto_pagar AS valor_pagar,
        np.nombre_periodo,
        c.numero_contrato AS contrato_numero
      FROM nomina_empleados ne
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      LEFT JOIN tipos_documentos td ON td.id = p.tipo_documento_id
      WHERE ne.periodo_id = $1::bigint
        AND COALESCE(ne.activo, TRUE) = TRUE
      ORDER BY p.primer_apellido ASC NULLS LAST, p.segundo_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, p.segundo_nombre ASC NULLS LAST, ne.id ASC
    `,
    [periodoId]
  );

  return result.rows.map((row) => ({
    tipo_documento: row.tipo_documento,
    numero_documento: row.numero_documento,
    nombre_completo: row.nombre_completo,
    banco: '',
    tipo_cuenta: '',
    numero_cuenta: '',
    valor_pagar: toNumberValue(row.valor_pagar),
    periodo: row.nombre_periodo,
    contrato: row.contrato_numero
  }));
};

export const getNominaDashboard = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaDashboard> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  const dashboard = await loadNominaDashboardData(periodoId, tenant);

  await registerAuditEvent({
    accion: 'NOMINA_DASHBOARD_VIEW',
    contrato_id: periodo.contrato_id,
    datos_nuevos: {
      periodo_id: periodoId
    },
    descripcion: 'Consulta de dashboard de nomina',
    entidad: 'nomina_periodos',
    entidad_id: periodoId,
    empresa_id: periodo.contrato?.empresa_id ?? null,
    ip_address: auditMeta?.ip ?? null,
    modulo: 'NOMINA',
    user_agent: auditMeta?.user_agent ?? null,
    usuario_id: actorUserId
  });

  return dashboard;
};

export const getNominaPlanoBancarioExport = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaExportResult> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  const rows = await getNominaPlanoBancarioRows(periodoId, tenant);

  await registerAuditEvent({
    accion: 'NOMINA_PLANO_BANCARIO_EXPORT',
    contrato_id: periodo.contrato_id,
    datos_nuevos: {
      periodo_id: periodoId
    },
    descripcion: 'Exportacion de plano bancario de nomina',
    entidad: 'nomina_periodos',
    entidad_id: periodoId,
    empresa_id: periodo.contrato?.empresa_id ?? null,
    ip_address: auditMeta?.ip ?? null,
    modulo: 'NOMINA',
    user_agent: auditMeta?.user_agent ?? null,
    usuario_id: actorUserId
  });

  return {
    csv: buildCsv(NOMINA_PLANO_BANCARIO_HEADERS, rows),
    file_name: `nomina-plano-bancario-periodo-${periodoId}.csv`
  };
};

export const generateNominaPlanillaPdf = async (
  periodoId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaPlanillaPdfResult> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  assertPeriodoAllowsPostCloseOutputs(periodo.estado, 'generating payroll consolidated PDF');
  const empresaResult = await dbQuery<{ nombre_empresa: string | null }>(
    `
      SELECT e.nombre_empresa
      FROM contratos c
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1::bigint
      LIMIT 1
    `,
    [periodo.contrato_id]
  );
  const empresaNombre = empresaResult.rows[0]?.nombre_empresa ?? null;

  const empleados = await listNominaEmpleados(periodoId, { page: 1, limit: 5000 }, tenant);

  if (empleados.items.length === 0) {
    throw new AppError('No active payroll employees found for consolidated PDF', 409, 'NOMINA_PLANILLA_EMPTY');
  }

  const dashboard = await loadNominaDashboardData(periodoId, tenant);
  const timestamp = Date.now();
  const storagePath = buildNominaPlanillaStoragePath(periodoId, timestamp);
  const fileBuffer = await buildNominaPlanillaPdfBuffer({
    periodo_id: periodoId,
    nombre_periodo: periodo.nombre_periodo,
    fecha_inicio: toDateString(periodo.fecha_inicio) ?? '',
    fecha_fin: toDateString(periodo.fecha_fin) ?? '',
    estado_periodo: periodo.estado,
    empresa_nombre: empresaNombre,
    contrato_numero: periodo.contrato?.numero_contrato ?? null,
    total_devengado: dashboard.total_devengado,
    total_deducciones: dashboard.total_deducciones,
    total_neto: dashboard.total_neto,
    empleados: empleados.items.map((item) => ({
      documento: item.persona.numero_documento,
      nombre: item.persona.nombre_completo,
      cargo: item.cargo?.nombre_cargo ?? null,
      devengado: item.total_adiciones,
      deducciones: item.total_deducciones,
      neto: item.neto_pagar
    }))
  });
  const storage = await uploadNominaPdfToStorage(storagePath, fileBuffer);
  const signedUrl = await createDocumentSignedUrlForBucket(
    storage.bucket,
    storage.path,
    NOMINA_PLANILLA_PDF_EXPIRES_IN
  );

  await registerAuditEvent({
    accion: 'NOMINA_PLANILLA_PDF_GENERATE',
    contrato_id: periodo.contrato_id,
    datos_nuevos: {
      periodo_id: periodoId,
      storage_path: storage.path
    },
    descripcion: 'Generacion de planilla PDF consolidada de nomina',
    entidad: 'nomina_periodos',
    entidad_id: periodoId,
    empresa_id: periodo.contrato?.empresa_id ?? null,
    ip_address: auditMeta?.ip ?? null,
    modulo: 'NOMINA',
    user_agent: auditMeta?.user_agent ?? null,
    usuario_id: actorUserId
  });

  return {
    storage_bucket: storage.bucket,
    storage_path: storage.path,
    signed_url: signedUrl,
    expires_in: NOMINA_PLANILLA_PDF_EXPIRES_IN,
    tamano_bytes: fileBuffer.byteLength,
    mime_type: 'application/pdf'
  };
};

const getNominaResumenExportRows = async (
  periodoId: string
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const result = await dbQuery<{
    contrato_id: string;
    empresa_id: string;
    fecha_fin: Date | string;
    fecha_inicio: Date | string;
    nombre_empresa: string | null;
    nombre_periodo: string;
    numero_contrato: string | null;
    periodo_id: string;
    total_deducciones: number | string | null;
    total_desprendibles: number;
    total_empleados: number;
    total_liquidaciones: number;
    total_neto_pagar: number | string | null;
    total_novedades: number;
    total_pension: number | string | null;
    total_salud: number | string | null;
    total_devengado: number | string | null;
  }>(
    `
      SELECT
        np.id::text AS periodo_id,
        np.nombre_periodo,
        np.fecha_inicio,
        np.fecha_fin,
        c.id::text AS contrato_id,
        c.numero_contrato,
        e.id::text AS empresa_id,
        e.nombre_empresa,
        (
          SELECT COUNT(*)::int
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS total_empleados,
        (
          SELECT COALESCE(SUM(ne.total_adiciones), 0)
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS total_devengado,
        (
          SELECT COALESCE(SUM(ne.total_deducciones), 0)
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS total_deducciones,
        (
          SELECT COALESCE(SUM(ne.neto_pagar), 0)
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS total_neto_pagar,
        (
          SELECT COALESCE(SUM(ne.salud), 0)
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS total_salud,
        (
          SELECT COALESCE(SUM(ne.pension), 0)
          FROM nomina_empleados ne
          WHERE ne.periodo_id = np.id
            AND COALESCE(ne.activo, TRUE) = TRUE
        ) AS total_pension,
        (
          SELECT COUNT(*)::int
          FROM nomina_novedades nn
          WHERE nn.periodo_id = np.id
        ) AS total_novedades,
        (
          SELECT COUNT(*)::int
          FROM nomina_desprendibles nd
          WHERE nd.periodo_id = np.id
            AND COALESCE(nd.activo, TRUE) = TRUE
            AND COALESCE(nd.es_vigente, TRUE) = TRUE
        ) AS total_desprendibles,
        (
          SELECT COUNT(*)::int
          FROM nomina_liquidaciones nl
          WHERE nl.periodo_id = np.id
            AND COALESCE(nl.activo, TRUE) = TRUE
        ) AS total_liquidaciones
      FROM nomina_periodos np
      INNER JOIN contratos c ON c.id = np.contrato_id
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE np.id = $1::bigint
      LIMIT 1
    `,
    [periodoId]
  );

  const row = result.rows[0];

  if (!row) {
    return [];
  }

  return [
    {
      periodo_id: row.periodo_id,
      nombre_periodo: row.nombre_periodo,
      fecha_inicio: toDateString(row.fecha_inicio),
      fecha_fin: toDateString(row.fecha_fin),
      contrato_id: row.contrato_id,
      numero_contrato: row.numero_contrato,
      empresa_id: row.empresa_id,
      nombre_empresa: row.nombre_empresa,
      total_empleados: row.total_empleados,
      total_devengado: toNumberValue(row.total_devengado),
      total_deducciones: toNumberValue(row.total_deducciones),
      total_neto_pagar: toNumberValue(row.total_neto_pagar),
      total_salud: toNumberValue(row.total_salud),
      total_pension: toNumberValue(row.total_pension),
      total_novedades: row.total_novedades,
      total_desprendibles: row.total_desprendibles,
      total_liquidaciones: row.total_liquidaciones
    }
  ];
};

const NOMINA_RESUMEN_EXPORT_HEADERS = [
  'periodo_id',
  'nombre_periodo',
  'fecha_inicio',
  'fecha_fin',
  'contrato_id',
  'numero_contrato',
  'empresa_id',
  'nombre_empresa',
  'total_empleados',
  'total_devengado',
  'total_deducciones',
  'total_neto_pagar',
  'total_salud',
  'total_pension',
  'total_novedades',
  'total_desprendibles',
  'total_liquidaciones'
];

const NOMINA_DASHBOARD_SECTION_EXPORT_HEADERS = [
  ...NOMINA_DASHBOARD_EXPORT_HEADERS
];

const NOMINA_EMPLEADOS_EXPORT_HEADERS = [
  'periodo_id',
  'nombre_periodo',
  'nomina_empleado_id',
  'vinculacion_id',
  'persona_id',
  'numero_documento',
  'nombre_completo',
  'cargo',
  'metodo_liquidacion',
  'salario_base',
  'auxilio_transporte',
  'otros_devengos',
  'dias_periodo',
  'dias_pagados',
  'devengado_basico',
  'devengado_transporte',
  'devengado_otros',
  'total_adiciones',
  'salud',
  'pension',
  'total_deducciones',
  'neto_pagar',
  'revisado',
  'estado'
];

const NOMINA_NOVEDADES_EXPORT_HEADERS = [
  'periodo_id',
  'nombre_periodo',
  'novedad_id',
  'nomina_empleado_id',
  'vinculacion_id',
  'numero_documento',
  'nombre_completo',
  'tipo_novedad',
  'categoria',
  'afecta_salario',
  'afecta_transporte',
  'es_adicion',
  'es_deduccion',
  'fecha_inicio',
  'fecha_fin',
  'dias',
  'horas',
  'valor_manual',
  'observacion',
  'revisado',
  'activo'
];

const NOMINA_DESPRENDIBLES_EXPORT_HEADERS = [
  'periodo_id',
  'nombre_periodo',
  'desprendible_id',
  'nomina_empleado_id',
  'vinculacion_id',
  'numero_documento',
  'nombre_completo',
  'tipo_desprendible',
  'version',
  'es_vigente',
  'estado',
  'archivo_path',
  'documento_persona_id',
  'fecha_generacion',
  'neto_pagar',
  'total_devengado',
  'total_deducciones'
];

const NOMINA_MOVIMIENTOS_EXPORT_HEADERS = [
  'periodo_id',
  'nombre_periodo',
  'movimiento_id',
  'nomina_empleado_id',
  'vinculacion_id',
  'numero_documento',
  'nombre_completo',
  'fecha',
  'tipo_movimiento',
  'descripcion',
  'cantidad',
  'valor_unitario',
  'valor_total',
  'es_devengado',
  'es_deduccion',
  'afecta_seguridad_social',
  'activo'
];

const NOMINA_LIQUIDACIONES_EXPORT_HEADERS = [
  'periodo_id',
  'nombre_periodo',
  'liquidacion_id',
  'vinculacion_id',
  'numero_documento',
  'nombre_completo',
  'fecha_inicio_vinculacion',
  'fecha_retiro',
  'motivo_retiro',
  'dias_trabajados',
  'salario_base',
  'auxilio_transporte',
  'cesantias',
  'intereses_cesantias',
  'prima_servicios',
  'vacaciones',
  'otros_devengos',
  'deducciones',
  'total_liquidacion',
  'estado'
];

const getNominaEmpleadosExportRows = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  const empleados = await listNominaEmpleados(
    periodoId,
    { page: 1, limit: 5000 },
    tenant
  );

  return empleados.items.map((item) => ({
    periodo_id: item.periodo_id,
    nombre_periodo: periodo.nombre_periodo,
    nomina_empleado_id: item.id,
    vinculacion_id: item.vinculacion_id,
    persona_id: item.persona.id,
    numero_documento: item.persona.numero_documento,
    nombre_completo: item.persona.nombre_completo,
    cargo: item.cargo?.nombre_cargo ?? null,
    metodo_liquidacion: item.metodo_liquidacion,
    salario_base: item.salario_base,
    auxilio_transporte: item.auxilio_transporte,
    otros_devengos: item.otros_devengos,
    dias_periodo: item.dias_periodo,
    dias_pagados: item.dias_pagados,
    devengado_basico: item.devengado_basico,
    devengado_transporte: item.devengado_transporte,
    devengado_otros: item.devengado_otros,
    total_adiciones: item.total_adiciones,
    salud: item.salud,
    pension: item.pension,
    total_deducciones: item.total_deducciones,
    neto_pagar: item.neto_pagar,
    revisado: item.revisado,
    estado: item.estado
  }));
};

const getNominaDashboardExportRows = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const dashboard = await loadNominaDashboardData(periodoId, tenant);
  return dashboardToExportRows(dashboard);
};

const getNominaPlanoBancarioExportRows = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  return getNominaPlanoBancarioRows(periodoId, tenant);
};

const getNominaNovedadesExportRows = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const novedades = await listNominaNovedades(
    { periodo_id: periodoId, page: 1, limit: 5000 },
    tenant
  );

  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  const nombrePeriodo = periodo.nombre_periodo;

  return novedades.items.map((item) => ({
    periodo_id: item.periodo_id,
    nombre_periodo: nombrePeriodo,
    novedad_id: item.id,
    nomina_empleado_id: item.nomina_empleado_id,
    vinculacion_id: item.vinculacion_id,
    numero_documento: item.persona.numero_documento,
    nombre_completo: item.persona.nombre_completo,
    tipo_novedad: item.tipo_novedad.nombre,
    categoria: item.tipo_novedad.categoria,
    afecta_salario: item.tipo_novedad.afecta_salario,
    afecta_transporte: item.tipo_novedad.afecta_transporte,
    es_adicion: item.tipo_novedad.es_adicion,
    es_deduccion: item.tipo_novedad.es_deduccion,
    fecha_inicio: item.fecha_inicio,
    fecha_fin: item.fecha_fin,
    dias: item.dias,
    horas: item.horas,
    valor_manual: item.valor_manual,
    observacion: item.observacion,
    revisado: item.revisado,
    activo: item.activo
  }));
};

const getNominaDesprendiblesExportRows = async (
  periodoId: string,
  includeVersions: boolean,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const desprendibles = await listNominaDesprendibles(periodoId, tenant, {
    includeVersions
  });

  return desprendibles.map((item) => ({
    periodo_id: item.periodo_id,
    nombre_periodo: item.periodo.nombre_periodo,
    desprendible_id: item.id,
    nomina_empleado_id: item.nomina_empleado_id,
    vinculacion_id: item.vinculacion_id,
    numero_documento: item.persona.numero_documento,
    nombre_completo: item.persona.nombre_completo,
    tipo_desprendible: item.tipo_desprendible,
    version: item.version,
    es_vigente: item.es_vigente,
    estado: item.estado,
    archivo_path: item.archivo_path,
    documento_persona_id: item.documento.documento_persona_id,
    fecha_generacion: item.fecha_generacion,
    neto_pagar: item.neto_pagar,
    total_devengado: item.total_devengado,
    total_deducciones: item.total_deducciones
  }));
};

const getNominaMovimientosExportRows = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  const movimientos = await getNominaMovimientos(
    {
      periodo_id: periodoId,
      page: 1,
      limit: 5000
    },
    tenant
  );

  return movimientos.items.map((item) => ({
    periodo_id: item.periodo_id,
    nombre_periodo: periodo.nombre_periodo,
    movimiento_id: item.id,
    nomina_empleado_id: item.nomina_empleado_id,
    vinculacion_id: item.vinculacion_id,
    numero_documento: item.persona.numero_documento,
    nombre_completo: item.persona.nombre_completo,
    fecha: item.fecha,
    tipo_movimiento: item.tipo_movimiento,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    valor_unitario: item.valor_unitario,
    valor_total: item.valor_total,
    es_devengado: item.es_devengado,
    es_deduccion: item.es_deduccion,
    afecta_seguridad_social: item.afecta_seguridad_social,
    activo: item.activo
  }));
};

const getNominaLiquidacionesExportRows = async (
  periodoId: string,
  tenant?: TenantAccessContext
): Promise<Array<Record<string, string | number | boolean | null>>> => {
  const liquidaciones = await listNominaLiquidaciones(
    periodoId,
    { page: 1, limit: 5000 },
    tenant
  );

  return liquidaciones.items.map((item) => ({
    periodo_id: item.periodo_id,
    nombre_periodo: item.periodo.nombre_periodo,
    liquidacion_id: item.id,
    vinculacion_id: item.vinculacion_id,
    numero_documento: item.persona.numero_documento,
    nombre_completo: item.persona.nombre_completo,
    fecha_inicio_vinculacion: item.fecha_inicio_vinculacion,
    fecha_retiro: item.fecha_retiro,
    motivo_retiro: item.motivo_retiro,
    dias_trabajados: item.dias_trabajados,
    salario_base: item.salario_base,
    auxilio_transporte: item.auxilio_transporte,
    cesantias: item.cesantias,
    intereses_cesantias: item.intereses_cesantias,
    prima_servicios: item.prima_servicios,
    vacaciones: item.vacaciones,
    otros_devengos: item.otros_devengos,
    deducciones: item.deducciones,
    total_liquidacion: item.total_liquidacion,
    estado: item.estado
  }));
};

export const exportNominaPeriodo = async (
  periodoId: string,
  tipo: NominaExportTipo,
  includeVersions: boolean,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaExportResult> => {
  const periodo = await loadRealPeriodoOrThrow(periodoId, tenant);
  const normalizedTipo = tipo ?? 'todo';

  const resumenRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaResumenExportRows(periodoId);
  const empleadosRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaEmpleadosExportRows(periodoId, tenant);
  const dashboardRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaDashboardExportRows(periodoId, tenant);
  const planoBancarioRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaPlanoBancarioExportRows(periodoId, tenant);
  const novedadesRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaNovedadesExportRows(periodoId, tenant);
  const movimientosRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaMovimientosExportRows(periodoId, tenant);
  const desprendiblesRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaDesprendiblesExportRows(periodoId, includeVersions, tenant);
  const liquidacionesRows = async (): Promise<Array<Record<string, string | number | boolean | null>>> =>
    getNominaLiquidacionesExportRows(periodoId, tenant);

  let csv = '';

  switch (normalizedTipo) {
    case 'resumen':
      csv = buildCsv(NOMINA_RESUMEN_EXPORT_HEADERS, await resumenRows());
      break;
    case 'dashboard':
      csv = buildCsv(NOMINA_DASHBOARD_SECTION_EXPORT_HEADERS, await dashboardRows());
      break;
    case 'plano_bancario':
      csv = buildCsv(NOMINA_PLANO_BANCARIO_HEADERS, await planoBancarioRows());
      break;
    case 'empleados':
      csv = buildCsv(NOMINA_EMPLEADOS_EXPORT_HEADERS, await empleadosRows());
      break;
    case 'novedades':
      csv = buildCsv(NOMINA_NOVEDADES_EXPORT_HEADERS, await novedadesRows());
      break;
    case 'movimientos':
      csv = buildCsv(NOMINA_MOVIMIENTOS_EXPORT_HEADERS, await movimientosRows());
      break;
    case 'desprendibles':
      csv = buildCsv(NOMINA_DESPRENDIBLES_EXPORT_HEADERS, await desprendiblesRows());
      break;
    case 'liquidaciones':
      csv = buildCsv(NOMINA_LIQUIDACIONES_EXPORT_HEADERS, await liquidacionesRows());
      break;
    case 'todo':
    default:
      csv = buildSectionedCsv([
        {
          title: 'RESUMEN',
          headers: NOMINA_RESUMEN_EXPORT_HEADERS,
          rows: await resumenRows()
        },
        {
          title: 'DASHBOARD',
          headers: NOMINA_DASHBOARD_SECTION_EXPORT_HEADERS,
          rows: await dashboardRows()
        },
        {
          title: 'EMPLEADOS',
          headers: NOMINA_EMPLEADOS_EXPORT_HEADERS,
          rows: await empleadosRows()
        },
        {
          title: 'NOVEDADES',
          headers: NOMINA_NOVEDADES_EXPORT_HEADERS,
          rows: await novedadesRows()
        },
        {
          title: 'MOVIMIENTOS',
          headers: NOMINA_MOVIMIENTOS_EXPORT_HEADERS,
          rows: await movimientosRows()
        },
        {
          title: 'DESPRENDIBLES',
          headers: NOMINA_DESPRENDIBLES_EXPORT_HEADERS,
          rows: await desprendiblesRows()
        },
        {
          title: 'LIQUIDACIONES',
          headers: NOMINA_LIQUIDACIONES_EXPORT_HEADERS,
          rows: await liquidacionesRows()
        }
      ]);
      break;
  }

  await registerAuditEvent({
    accion: 'NOMINA_EXPORT',
    contrato_id: periodo.contrato_id,
    datos_nuevos: {
      include_versiones: includeVersions,
      periodo_id: periodoId,
      tipo: normalizedTipo
    },
    descripcion: 'Exportacion CSV de nomina',
    entidad: 'nomina_periodos',
    entidad_id: periodoId,
    empresa_id: periodo.contrato?.empresa_id ?? null,
    ip_address: auditMeta?.ip ?? null,
    modulo: 'NOMINA',
    user_agent: auditMeta?.user_agent ?? null,
    usuario_id: actorUserId
  });

  return {
    csv,
    file_name: `nomina-${normalizedTipo}-periodo-${periodoId}.csv`
  };
};
