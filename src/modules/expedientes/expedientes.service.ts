import PDFDocument from 'pdfkit';
import { QueryResultRow } from 'pg';

import { env } from '../../config/env';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import { dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { registerAuditEvent } from '../auditoria/auditoria.service';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import { getVinculacionChecklist } from '../documentos/documentos.service';
import { getPersonaById, type Persona } from '../personas/personas.service';
import {
  listSstAccidentesByPersonaId,
  listSstAccionesAccidenteByPersonaId,
  listSstCapacitacionesPersonaByPersonaId,
  listSstDotacionEppEntregasByPersonaId,
  listSstExamenesPersonaByPersonaId
} from '../sst/sst.service';
import {
  listSstAccionesInspeccionForExpediente,
  listSstInspeccionHallazgosForExpediente,
  listSstInspeccionesForExpediente
} from '../sst/sst.inspecciones.service';
import { listSstMatrizRiesgosForExpediente } from '../sst/sst.riesgos.service';
import type { ExpedienteAlertasQuery, ExpedienteTimelineQuery } from './expedientes.schemas';
import {
  getVinculacionesByPersonaId,
  type Vinculacion
} from '../vinculaciones/vinculaciones.service';
import {
  loadEvaluacionesExpediente,
  type DesempenoClasificacion,
  type EvaluacionesExpedienteResumen
} from '../evaluaciones/evaluaciones.service';
import type { PlanesMejoraExpediente } from '../evaluaciones/planesMejora.service';
import {
  loadVacacionesExpediente,
  type VacacionesExpediente,
  type VacacionesExpedienteIndicadores
} from '../nomina/vacaciones.service';
import {
  loadPrimaExpediente,
  type PrimaExpediente,
  type PrimaExpedienteIndicadores
} from '../nomina/prima.service';
import {
  loadCesantiasExpediente,
  type CesantiasExpediente,
  type CesantiasExpedienteIndicadores
} from '../nomina/cesantias.service';

interface DocumentoPersonaRow extends QueryResultRow {
  archivo_path: string | null;
  documento_reemplaza_id: number | string | null;
  es_vigente: boolean | null;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  mime_type: string | null;
  nombre_original: string | null;
  persona_id: number | string;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | string | null;
  tipo_documento_codigo: string;
  tipo_documento_id: number | string;
  tipo_documento_nombre: string;
  version: number | string | null;
  vinculacion_id: number | string | null;
}

interface DocumentoVinculacionRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  mime_type: string | null;
  nombre_original: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | string | null;
  tipo_documento_codigo: string;
  tipo_documento_id: number | string;
  tipo_documento_nombre: string;
  vinculacion_id: number | string;
}

interface NominaEmpleadoExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  auxilio_transporte: number | string | null;
  categoria_salarial_id: number | string | null;
  created_at: Date | string;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  dias_pagados: number | string | null;
  dias_periodo: number | string | null;
  estado: string | null;
  fecha_fin_pago: Date | string | null;
  fecha_inicio_pago: Date | string | null;
  horas_extra_total: number | string | null;
  horas_trabajadas: number | string | null;
  id: number | string;
  metodo_liquidacion: string | null;
  motivo_caso_especial: string | null;
  neto_pagar: number | string | null;
  otros_devengos: number | string | null;
  pension: number | string | null;
  periodo_estado: string | null;
  periodo_fecha_fin: Date | string | null;
  periodo_fecha_inicio: Date | string | null;
  periodo_id: number | string;
  periodo_nombre: string | null;
  revisado: boolean | null;
  salario_base: number | string | null;
  salud: number | string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
  vinculacion_id: number | string;
}

interface NominaNovedadExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  categoria_anterior_id: number | string | null;
  categoria_nueva_id: number | string | null;
  cubierta: boolean | null;
  created_at: Date | string;
  dias: number | string | null;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string | null;
  horas: number | string | null;
  id: number | string;
  nomina_empleado_id: number | string;
  observacion: string | null;
  periodo_estado: string | null;
  periodo_fecha_fin: Date | string | null;
  periodo_fecha_inicio: Date | string | null;
  periodo_id: number | string;
  periodo_nombre: string | null;
  requiere_cobertura: boolean | null;
  revisado: boolean | null;
  tipo_novedad_activo: boolean | null;
  tipo_novedad_afecta_salario: boolean | null;
  tipo_novedad_afecta_transporte: boolean | null;
  tipo_novedad_categoria: string | null;
  tipo_novedad_codigo: string | null;
  tipo_novedad_es_adicion: boolean | null;
  tipo_novedad_es_deduccion: boolean | null;
  tipo_novedad_id: number | string;
  tipo_novedad_nombre: string | null;
  valor_manual: number | string | null;
  vinculacion_id: number | string;
}

interface NominaMovimientoExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  afecta_seguridad_social: boolean | null;
  cantidad: number | string | null;
  created_at: Date | string;
  descripcion: string | null;
  es_deduccion: boolean | null;
  es_devengado: boolean | null;
  fecha: Date | string | null;
  id: number | string;
  nomina_empleado_id: number | string;
  periodo_estado: string | null;
  periodo_fecha_fin: Date | string | null;
  periodo_fecha_inicio: Date | string | null;
  periodo_id: number | string;
  periodo_nombre: string | null;
  tipo_movimiento: string;
  valor_total: number | string | null;
  valor_unitario: number | string | null;
  vinculacion_id: number | string;
}

interface NominaDesprendibleExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  auxilio_transporte: number | string | null;
  created_at: Date | string;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  desprendible_reemplaza_id: number | string | null;
  dias_pagados: number | string | null;
  documento_persona_id: number | string | null;
  dp_mime_type: string | null;
  dp_nombre_original: string | null;
  dp_storage_bucket: string | null;
  dp_storage_path: string | null;
  dp_tamano_bytes: number | string | null;
  es_vigente: boolean | null;
  estado: string | null;
  fecha_generacion: Date | string | null;
  horas_trabajadas: number | string | null;
  id: number | string;
  neto_pagar: number | string | null;
  nomina_empleado_id: number | string;
  observacion: string | null;
  otros_devengos: number | string | null;
  pension: number | string | null;
  periodo_estado: string | null;
  periodo_fecha_fin: Date | string | null;
  periodo_fecha_inicio: Date | string | null;
  periodo_id: number | string;
  periodo_nombre: string | null;
  salario_base: number | string | null;
  salud: number | string | null;
  tipo_desprendible: string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
  version: number | string | null;
  vinculacion_id: number | string;
}

interface NominaLiquidacionExpedienteRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  auxilio_transporte: number | string | null;
  cesantias: number | string | null;
  created_at: Date | string;
  deducciones: number | string | null;
  dias_base_liquidacion: number | string | null;
  dias_trabajados: number | string | null;
  dias_vacaciones_pendientes: number | string | null;
  documento_persona_id: number | string | null;
  estado: string | null;
  fecha_fin_vinculacion: Date | string | null;
  fecha_inicio_vinculacion: Date | string | null;
  fecha_retiro: Date | string | null;
  id: number | string;
  intereses_cesantias: number | string | null;
  motivo_retiro: string | null;
  observacion: string | null;
  otros_devengos: number | string | null;
  periodo_estado: string | null;
  periodo_fecha_fin: Date | string | null;
  periodo_fecha_inicio: Date | string | null;
  periodo_id: number | string;
  periodo_nombre: string | null;
  prima_servicios: number | string | null;
  promedio_auxilio_transporte: number | string | null;
  promedio_salario: number | string | null;
  salario_base: number | string | null;
  total_liquidacion: number | string | null;
  vacaciones: number | string | null;
  vinculacion_id: number | string;
}

interface AuditoriaExpedienteRow extends QueryResultRow {
  accion: string;
  contrato_id: number | string | null;
  created_at: Date | string | null;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  descripcion: string;
  entidad: string;
  entidad_id: string;
  empresa_id: number | string | null;
  fecha_evento: Date | string | null;
  id: number | string;
  ip_address: string | null;
  modulo: string;
  user_agent: string | null;
  usuario_email: string | null;
  usuario_id: number | string | null;
  usuario_nombre: string | null;
}

interface ExpedienteDocumentoPersona {
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
  tipo_documento: {
    codigo: string;
    id: number;
    nombre_documento: string;
  };
  tipo_documento_id: number;
  version: number;
  vinculacion_id: number | null;
}

interface ExpedienteDocumentoVinculacion {
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
  tipo_documento: {
    codigo: string;
    id: number;
    nombre_documento: string;
  };
  tipo_documento_id: number;
  vinculacion_id: number;
}

interface ExpedienteAuditoriaItem {
  accion: string;
  after: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  contrato_id: number | null;
  created_at: string | null;
  descripcion: string;
  entidad: string;
  entidad_id: string;
  empresa_id: number | null;
  fecha_evento: string | null;
  id: number;
  ip_address: string | null;
  modulo: string;
  user_agent: string | null;
  usuario: {
    email: string | null;
    id: number | null;
    nombre: string | null;
  };
}

interface ExpedienteAlertaRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: number | string | null;
  contrato_numero: string | null;
  created_at: Date | string | null;
  descripcion: string | null;
  dias_restantes: number | string | null;
  empresa_id: number | string | null;
  empresa_nombre: string | null;
  estado: string;
  fecha_alerta: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  persona_id: number | string | null;
  persona_nombre: string | null;
  severidad: string;
  tipo_alerta: string;
  tipo_documento_codigo: string | null;
  tipo_documento_id: number | string | null;
  tipo_documento_nombre: string | null;
  titulo: string;
  updated_at: Date | string | null;
  vinculacion_id: number | string | null;
}

export interface ExpedienteAlertaItem {
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

export interface ExpedienteRiesgoDocumental {
  causas: string[];
  nivel: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  puntaje: number;
}

export interface ExpedienteTimelineItem {
  descripcion: string | null;
  fecha: string;
  metadata: Record<string, unknown>;
  referencia: {
    entidad: string;
    id: string;
  };
  tipo: string;
  titulo: string;
}

interface ExpedienteChecklistPorVinculacion {
  checklist: Awaited<ReturnType<typeof getVinculacionChecklist>>;
  vinculacion_id: number;
}

interface ExpedienteEvaluaciones {
  indicadores: EvaluacionesExpedienteResumen['indicadores'];
  items: EvaluacionesExpedienteResumen['items'];
  planes_mejora: PlanesMejoraExpediente;
}

interface ExpedienteIndicadores {
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
  desprendibles_vigentes: number;
  documentos_persona: number;
  documentos_por_vencer_30_dias: number;
  documentos_reemplazados: number;
  documentos_sin_vencimiento: number;
  documentos_total: number;
  documentos_vencidos: number;
  documentos_vigentes: number;
  documentos_vinculacion: number;
  evaluaciones_total: number;
  clasificacion_desempeno: DesempenoClasificacion | null;
  planes_mejora_abiertos: number;
  planes_mejora_vencidos: number;
  promedio_desempeno: number;
  cesantias_consignadas: number;
  cesantias_total: number;
  ultima_cesantia: string | null;
  prima_pagada: number;
  prima_total: number;
  ultima_prima: string | null;
  ultima_evaluacion: string | null;
  vacaciones_dias_pendientes: number;
  vacaciones_solicitudes_total: number;
  vacaciones_ultima_solicitud: string | null;
  liquidaciones_activas: number;
  nomina_desprendibles: number;
  nomina_empleados: number;
  nomina_liquidaciones: number;
  nomina_movimientos: number;
  nomina_novedades: number;
  nomina_periodos: number;
  riesgo_documental: ExpedienteRiesgoDocumental;
  sst_capacitaciones_total: number;
  sst_capacitaciones_vencidas: number;
  sst_capacitaciones_vigentes: number;
  sst_dotacion_cumplimiento_porcentaje: number;
  sst_dotacion_entregas_total: number;
  sst_dotacion_vencidas: number;
  sst_dotacion_vigentes: number;
  sst_accidentes_abiertos: number;
  sst_accidentes_graves: number;
  sst_accidentes_incapacidad: number;
  sst_accidentes_total: number;
  sst_acciones_inspeccion_abiertas: number;
  sst_acciones_inspeccion_vencidas: number;
  sst_examenes_con_restricciones: number;
  sst_examenes_cumplimiento_porcentaje: number;
  sst_examenes_no_aptos: number;
  sst_examenes_total: number;
  sst_examenes_vencidos: number;
  sst_examenes_vigentes: number;
  sst_hallazgos_criticos: number;
  sst_hallazgos_total: number;
  sst_inspecciones_total: number;
  sst_riesgos_altos: number;
  sst_riesgos_criticos: number;
  sst_riesgos_total: number;
  sst_cumplimiento_porcentaje: number;
  vinculaciones_activas: number;
  vinculaciones_retiradas: number;
  vinculaciones_suspendidas: number;
  vinculaciones_total: number;
}

interface ExpedienteSnapshot {
  alertas: ExpedienteAlertaItem[];
  auditoria: ExpedienteAuditoriaItem[];
  checklistPorVinculacion: ExpedienteChecklistPorVinculacion[];
  documentosPersona: ExpedienteDocumentoPersona[];
  documentosVinculacion: ExpedienteDocumentoVinculacion[];
  evaluaciones: ExpedienteEvaluaciones;
  indicadores: ExpedienteIndicadores;
  nominaDesprendibles: Array<Record<string, unknown>>;
  nominaEmpleados: Array<Record<string, unknown>>;
  nominaLiquidaciones: Array<Record<string, unknown>>;
  nominaMovimientos: Array<Record<string, unknown>>;
  nominaNovedades: Array<Record<string, unknown>>;
  cesantias: CesantiasExpediente;
  prima: PrimaExpediente;
  vacaciones: VacacionesExpediente;
  persona: Persona;
  sstAccidentes: Array<Record<string, unknown>>;
  sstAccionesInspeccion: Array<Record<string, unknown>>;
  sstAccionesCorrectivas: Array<Record<string, unknown>>;
  sstCapacitaciones: Array<Record<string, unknown>>;
  sstDotacionEpp: Array<Record<string, unknown>>;
  sstExamenesOcupacionales: Array<Record<string, unknown>>;
  sstHallazgosInspeccion: Array<Record<string, unknown>>;
  sstInspecciones: Array<Record<string, unknown>>;
  sstMatrizRiesgos: Array<Record<string, unknown>>;
  vinculaciones: Vinculacion[];
}

export interface ExpedientePersonaAlertasResult {
  items: ExpedienteAlertaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
  persona_id: number;
  resumen: {
    activas: number;
    altas: number;
    bajas: number;
    criticas: number;
    medias: number;
    resueltas: number;
    total: number;
  };
  riesgo_documental: ExpedienteRiesgoDocumental;
}

export interface ExpedientePersonaTimelineResult {
  items: ExpedienteTimelineItem[];
  persona_id: number;
  total: number;
}

export interface ExpedientePersonaPdfResult {
  expires_in: number;
  mime_type: 'application/pdf';
  signed_url: string;
  storage_bucket: string;
  storage_path: string;
  tamano_bytes: number;
}

export interface ExpedienteLaboralConsolidado {
  auditoria: ExpedienteAuditoriaItem[];
  checklist_por_vinculacion: ExpedienteChecklistPorVinculacion[];
  documentos_persona: ExpedienteDocumentoPersona[];
  documentos_vinculacion: ExpedienteDocumentoVinculacion[];
  expediente: {
    evaluaciones: ExpedienteEvaluaciones;
  };
  evaluaciones: ExpedienteEvaluaciones;
  indicadores: ExpedienteIndicadores;
  nomina: {
    cesantias: CesantiasExpediente;
    desprendibles: Array<Record<string, unknown>>;
    empleados: Array<Record<string, unknown>>;
    liquidaciones: Array<Record<string, unknown>>;
    movimientos: Array<Record<string, unknown>>;
    novedades: Array<Record<string, unknown>>;
    prima: PrimaExpediente;
    vacaciones: VacacionesExpediente;
  };
  persona: Persona;
  sst: {
    accidentes: Array<Record<string, unknown>>;
    capacitaciones: Array<Record<string, unknown>>;
    dotacion_epp: Array<Record<string, unknown>>;
    examenes_ocupacionales: Array<Record<string, unknown>>;
    inspecciones: Array<Record<string, unknown>>;
    matriz_riesgos: Array<Record<string, unknown>>;
  };
  vinculaciones: Vinculacion[];
}

const toNumber = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: boolean | null | undefined): boolean => value ?? false;

const toDateString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const mapDocumentoPersona = (row: DocumentoPersonaRow): ExpedienteDocumentoPersona => {
  return {
    id: toNumber(row.id),
    persona_id: toNumber(row.persona_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_documento: {
      id: toNumber(row.tipo_documento_id),
      codigo: row.tipo_documento_codigo,
      nombre_documento: row.tipo_documento_nombre
    },
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    vinculacion_id: toNullableNumber(row.vinculacion_id),
    version: row.version === null ? 1 : toNumber(row.version),
    documento_reemplaza_id: toNullableNumber(row.documento_reemplaza_id),
    es_vigente: toBoolean(row.es_vigente),
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: toNullableNumber(row.tamano_bytes)
  };
};

const mapDocumentoVinculacion = (row: DocumentoVinculacionRow): ExpedienteDocumentoVinculacion => {
  return {
    id: toNumber(row.id),
    vinculacion_id: toNumber(row.vinculacion_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_documento: {
      id: toNumber(row.tipo_documento_id),
      codigo: row.tipo_documento_codigo,
      nombre_documento: row.tipo_documento_nombre
    },
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    activo: toBoolean(row.activo),
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: toNullableNumber(row.tamano_bytes)
  };
};

const mapNominaEmpleado = (row: NominaEmpleadoExpedienteRow): Record<string, unknown> => {
  return {
    id: toNumber(row.id),
    periodo_id: toNumber(row.periodo_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    metodo_liquidacion: row.metodo_liquidacion,
    categoria_salarial_id: toNullableNumber(row.categoria_salarial_id),
    salario_base: toNullableNumber(row.salario_base) ?? 0,
    auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
    otros_devengos: toNullableNumber(row.otros_devengos) ?? 0,
    fecha_inicio_pago: toDateString(row.fecha_inicio_pago),
    fecha_fin_pago: toDateString(row.fecha_fin_pago),
    dias_periodo: toNullableNumber(row.dias_periodo) ?? 0,
    dias_pagados: toNullableNumber(row.dias_pagados) ?? 0,
    horas_trabajadas: toNullableNumber(row.horas_trabajadas) ?? 0,
    horas_extra_total: toNullableNumber(row.horas_extra_total) ?? 0,
    devengado_basico: toNullableNumber(row.devengado_basico) ?? 0,
    devengado_transporte: toNullableNumber(row.devengado_transporte) ?? 0,
    devengado_otros: toNullableNumber(row.devengado_otros) ?? 0,
    total_adiciones: toNullableNumber(row.total_adiciones) ?? 0,
    total_deducciones: toNullableNumber(row.total_deducciones) ?? 0,
    salud: toNullableNumber(row.salud) ?? 0,
    pension: toNullableNumber(row.pension) ?? 0,
    neto_pagar: toNullableNumber(row.neto_pagar) ?? 0,
    revisado: toBoolean(row.revisado),
    estado: row.estado,
    activo: toBoolean(row.activo),
    motivo_caso_especial: row.motivo_caso_especial,
    created_at: toDateString(row.created_at),
    periodo: {
      id: toNumber(row.periodo_id),
      nombre_periodo: row.periodo_nombre,
      fecha_inicio: toDateString(row.periodo_fecha_inicio),
      fecha_fin: toDateString(row.periodo_fecha_fin),
      estado: row.periodo_estado
    }
  };
};

const mapNominaNovedad = (row: NominaNovedadExpedienteRow): Record<string, unknown> => {
  return {
    id: toNumber(row.id),
    periodo_id: toNumber(row.periodo_id),
    nomina_empleado_id: toNumber(row.nomina_empleado_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    tipo_novedad_id: toNumber(row.tipo_novedad_id),
    fecha_inicio: toDateString(row.fecha_inicio),
    fecha_fin: toDateString(row.fecha_fin),
    dias: toNullableNumber(row.dias),
    horas: toNullableNumber(row.horas),
    valor_manual: toNullableNumber(row.valor_manual),
    categoria_anterior_id: toNullableNumber(row.categoria_anterior_id),
    categoria_nueva_id: toNullableNumber(row.categoria_nueva_id),
    observacion: row.observacion,
    revisado: toBoolean(row.revisado),
    activo: toBoolean(row.activo),
    requiere_cobertura: toBoolean(row.requiere_cobertura),
    cubierta: toBoolean(row.cubierta),
    created_at: toDateString(row.created_at),
    tipo_novedad: {
      id: toNumber(row.tipo_novedad_id),
      codigo: row.tipo_novedad_codigo,
      nombre: row.tipo_novedad_nombre,
      categoria: row.tipo_novedad_categoria,
      afecta_salario: toBoolean(row.tipo_novedad_afecta_salario),
      afecta_transporte: toBoolean(row.tipo_novedad_afecta_transporte),
      es_adicion: toBoolean(row.tipo_novedad_es_adicion),
      es_deduccion: toBoolean(row.tipo_novedad_es_deduccion),
      activo: toBoolean(row.tipo_novedad_activo)
    },
    periodo: {
      id: toNumber(row.periodo_id),
      nombre_periodo: row.periodo_nombre,
      fecha_inicio: toDateString(row.periodo_fecha_inicio),
      fecha_fin: toDateString(row.periodo_fecha_fin),
      estado: row.periodo_estado
    }
  };
};

const mapNominaMovimiento = (row: NominaMovimientoExpedienteRow): Record<string, unknown> => {
  return {
    id: toNumber(row.id),
    periodo_id: toNumber(row.periodo_id),
    nomina_empleado_id: toNumber(row.nomina_empleado_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    fecha: toDateString(row.fecha),
    tipo_movimiento: row.tipo_movimiento,
    descripcion: row.descripcion,
    cantidad: toNullableNumber(row.cantidad),
    valor_unitario: toNullableNumber(row.valor_unitario),
    valor_total: toNullableNumber(row.valor_total) ?? 0,
    es_devengado: toBoolean(row.es_devengado),
    es_deduccion: toBoolean(row.es_deduccion),
    afecta_seguridad_social: toBoolean(row.afecta_seguridad_social),
    activo: toBoolean(row.activo),
    created_at: toDateString(row.created_at),
    periodo: {
      id: toNumber(row.periodo_id),
      nombre_periodo: row.periodo_nombre,
      fecha_inicio: toDateString(row.periodo_fecha_inicio),
      fecha_fin: toDateString(row.periodo_fecha_fin),
      estado: row.periodo_estado
    }
  };
};

const mapNominaDesprendible = (row: NominaDesprendibleExpedienteRow): Record<string, unknown> => {
  // nomina_desprendibles no tiene payload_snapshot en la BD actual;
  // para trazabilidad historica perfecta se recomienda migracion futura agregando payload_snapshot jsonb.
  return {
    id: toNumber(row.id),
    periodo_id: toNumber(row.periodo_id),
    nomina_empleado_id: toNumber(row.nomina_empleado_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    tipo_desprendible: row.tipo_desprendible,
    version: toNullableNumber(row.version) ?? 1,
    es_vigente: toBoolean(row.es_vigente),
    estado: row.estado,
    archivo_path: row.archivo_path,
    documento_persona_id: toNullableNumber(row.documento_persona_id),
    fecha_generacion: toDateString(row.fecha_generacion),
    salario_base: toNullableNumber(row.salario_base),
    auxilio_transporte: toNullableNumber(row.auxilio_transporte),
    otros_devengos: toNullableNumber(row.otros_devengos),
    devengado_basico: toNullableNumber(row.devengado_basico),
    devengado_transporte: toNullableNumber(row.devengado_transporte),
    devengado_otros: toNullableNumber(row.devengado_otros),
    dias_pagados: toNullableNumber(row.dias_pagados),
    horas_trabajadas: toNullableNumber(row.horas_trabajadas),
    neto_pagar: toNullableNumber(row.neto_pagar),
    total_devengado: toNullableNumber(row.total_adiciones),
    total_deducciones: toNullableNumber(row.total_deducciones),
    salud: toNullableNumber(row.salud),
    pension: toNullableNumber(row.pension),
    activo: toBoolean(row.activo),
    created_at: toDateString(row.created_at),
    desprendible_reemplaza_id: toNullableNumber(row.desprendible_reemplaza_id),
    observacion: row.observacion,
    payload_snapshot: null,
    documento: {
      documento_persona_id: toNullableNumber(row.documento_persona_id),
      nombre_original: row.dp_nombre_original,
      mime_type: row.dp_mime_type,
      storage_bucket: row.dp_storage_bucket,
      storage_path: row.dp_storage_path,
      tamano_bytes: toNullableNumber(row.dp_tamano_bytes)
    },
    periodo: {
      id: toNumber(row.periodo_id),
      nombre_periodo: row.periodo_nombre,
      fecha_inicio: toDateString(row.periodo_fecha_inicio),
      fecha_fin: toDateString(row.periodo_fecha_fin),
      estado: row.periodo_estado
    }
  };
};

const mapNominaLiquidacion = (row: NominaLiquidacionExpedienteRow): Record<string, unknown> => {
  return {
    id: toNumber(row.id),
    periodo_id: toNumber(row.periodo_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    fecha_inicio_vinculacion: toDateString(row.fecha_inicio_vinculacion),
    fecha_fin_vinculacion: toDateString(row.fecha_fin_vinculacion),
    fecha_retiro: toDateString(row.fecha_retiro),
    motivo_retiro: row.motivo_retiro,
    dias_base_liquidacion: toNullableNumber(row.dias_base_liquidacion) ?? 0,
    dias_trabajados: toNullableNumber(row.dias_trabajados) ?? 0,
    dias_vacaciones_pendientes: toNullableNumber(row.dias_vacaciones_pendientes) ?? 0,
    salario_base: toNullableNumber(row.salario_base) ?? 0,
    auxilio_transporte: toNullableNumber(row.auxilio_transporte) ?? 0,
    promedio_salario: toNullableNumber(row.promedio_salario) ?? 0,
    promedio_auxilio_transporte: toNullableNumber(row.promedio_auxilio_transporte) ?? 0,
    cesantias: toNullableNumber(row.cesantias) ?? 0,
    intereses_cesantias: toNullableNumber(row.intereses_cesantias) ?? 0,
    prima_servicios: toNullableNumber(row.prima_servicios) ?? 0,
    vacaciones: toNullableNumber(row.vacaciones) ?? 0,
    otros_devengos: toNullableNumber(row.otros_devengos) ?? 0,
    deducciones: toNullableNumber(row.deducciones) ?? 0,
    total_liquidacion: toNullableNumber(row.total_liquidacion) ?? 0,
    estado: row.estado,
    archivo_path: row.archivo_path,
    documento_persona_id: toNullableNumber(row.documento_persona_id),
    observacion: row.observacion,
    activo: toBoolean(row.activo),
    created_at: toDateString(row.created_at),
    periodo: {
      id: toNumber(row.periodo_id),
      nombre_periodo: row.periodo_nombre,
      fecha_inicio: toDateString(row.periodo_fecha_inicio),
      fecha_fin: toDateString(row.periodo_fecha_fin),
      estado: row.periodo_estado
    }
  };
};

const mapAuditoria = (row: AuditoriaExpedienteRow): ExpedienteAuditoriaItem => {
  return {
    id: toNumber(row.id),
    accion: row.accion,
    descripcion: row.descripcion,
    entidad: row.entidad,
    entidad_id: row.entidad_id,
    modulo: row.modulo,
    empresa_id: toNullableNumber(row.empresa_id),
    contrato_id: toNullableNumber(row.contrato_id),
    before: row.datos_anteriores,
    after: row.datos_nuevos,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    fecha_evento: toDateString(row.fecha_evento),
    created_at: toDateString(row.created_at),
    usuario: {
      id: toNullableNumber(row.usuario_id),
      email: row.usuario_email,
      nombre: row.usuario_nombre
    }
  };
};

const buildTenantScopeClause = (
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  contratoColumn: string,
  empresaColumn: string
): string => {
  if (!tenant || tenant.isGlobalAdmin) {
    return '';
  }

  if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
    return 'FALSE';
  }

  const clauses: string[] = [];

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    clauses.push(`${contratoColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    clauses.push(`${empresaColumn} = ANY($${params.length}::bigint[])`);
  }

  return clauses.length > 0 ? `(${clauses.join(' OR ')})` : '';
};

const loadDocumentosPersona = async (personaId: number): Promise<ExpedienteDocumentoPersona[]> => {
  const result = await dbQuery<DocumentoPersonaRow>(
    `
      SELECT
        dp.id,
        dp.persona_id,
        dp.tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        dp.fecha_expedicion,
        dp.fecha_vencimiento,
        dp.archivo_path,
        dp.fecha_carga,
        dp.vinculacion_id,
        dp.version,
        dp.documento_reemplaza_id,
        dp.es_vigente,
        dp.storage_bucket,
        dp.storage_path,
        dp.nombre_original,
        dp.mime_type,
        dp.tamano_bytes
      FROM documentos_persona dp
      INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
      WHERE dp.persona_id = $1::bigint
        AND dp.activo = TRUE
      ORDER BY dp.es_vigente DESC, dp.tipo_documento_id ASC, dp.version DESC, dp.fecha_carga DESC, dp.id DESC
    `,
    [personaId]
  );

  return result.rows.map(mapDocumentoPersona);
};

const loadDocumentosVinculacion = async (
  vinculacionIds: number[]
): Promise<ExpedienteDocumentoVinculacion[]> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const result = await dbQuery<DocumentoVinculacionRow>(
    `
      SELECT
        dv.id,
        dv.vinculacion_id,
        dv.tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        dv.fecha_expedicion,
        dv.fecha_vencimiento,
        dv.archivo_path,
        dv.fecha_carga,
        dv.activo,
        dv.storage_bucket,
        dv.storage_path,
        dv.nombre_original,
        dv.mime_type,
        dv.tamano_bytes
      FROM documentos_vinculacion dv
      INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
      WHERE dv.vinculacion_id = ANY($1::bigint[])
        AND dv.activo = TRUE
      ORDER BY dv.vinculacion_id ASC, dv.fecha_carga DESC, dv.id DESC
    `,
    [vinculacionIds]
  );

  return result.rows.map(mapDocumentoVinculacion);
};

const loadNominaEmpleados = async (
  personaId: number,
  vinculacionIds: number[],
  tenant?: TenantAccessContext
): Promise<Array<Record<string, unknown>>> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const params: unknown[] = [personaId, vinculacionIds];
  const tenantClause = buildTenantScopeClause(params, tenant, 'np.contrato_id', 'c.empresa_id');
  const tenantSql = tenantClause ? `AND ${tenantClause}` : '';
  const result = await dbQuery<NominaEmpleadoExpedienteRow>(
    `
      SELECT
        ne.id,
        ne.periodo_id,
        ne.vinculacion_id,
        ne.metodo_liquidacion,
        ne.categoria_salarial_id,
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
        ne.revisado,
        ne.estado,
        ne.activo,
        ne.created_at,
        ne.motivo_caso_especial,
        np.nombre_periodo AS periodo_nombre,
        np.fecha_inicio AS periodo_fecha_inicio,
        np.fecha_fin AS periodo_fecha_fin,
        np.estado AS periodo_estado
      FROM nomina_empleados ne
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE v.persona_id = $1::bigint
        AND ne.vinculacion_id = ANY($2::bigint[])
        ${tenantSql}
      ORDER BY np.fecha_inicio DESC, ne.created_at DESC, ne.id DESC
    `,
    params
  );

  return result.rows.map(mapNominaEmpleado);
};

const loadNominaNovedades = async (
  personaId: number,
  vinculacionIds: number[],
  tenant?: TenantAccessContext
): Promise<Array<Record<string, unknown>>> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const params: unknown[] = [personaId, vinculacionIds];
  const tenantClause = buildTenantScopeClause(params, tenant, 'np.contrato_id', 'c.empresa_id');
  const tenantSql = tenantClause ? `AND ${tenantClause}` : '';
  const result = await dbQuery<NominaNovedadExpedienteRow>(
    `
      SELECT
        nn.id,
        nn.periodo_id,
        nn.nomina_empleado_id,
        nn.vinculacion_id,
        nn.tipo_novedad_id,
        nn.fecha_inicio,
        nn.fecha_fin,
        nn.dias,
        nn.horas,
        nn.valor_manual,
        nn.categoria_anterior_id,
        nn.categoria_nueva_id,
        nn.observacion,
        nn.revisado,
        nn.activo,
        nn.created_at,
        nn.requiere_cobertura,
        nn.cubierta,
        NULL::text AS tipo_novedad_codigo,
        ntn.nombre AS tipo_novedad_nombre,
        ntn.categoria AS tipo_novedad_categoria,
        ntn.afecta_salario AS tipo_novedad_afecta_salario,
        ntn.afecta_transporte AS tipo_novedad_afecta_transporte,
        ntn.es_adicion AS tipo_novedad_es_adicion,
        ntn.es_deduccion AS tipo_novedad_es_deduccion,
        ntn.activo AS tipo_novedad_activo,
        np.nombre_periodo AS periodo_nombre,
        np.fecha_inicio AS periodo_fecha_inicio,
        np.fecha_fin AS periodo_fecha_fin,
        np.estado AS periodo_estado
      FROM nomina_novedades nn
      INNER JOIN vinculaciones v ON v.id = nn.vinculacion_id
      INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
      WHERE v.persona_id = $1::bigint
        AND nn.vinculacion_id = ANY($2::bigint[])
        ${tenantSql}
      ORDER BY nn.created_at DESC, nn.id DESC
    `,
    params
  );

  return result.rows.map(mapNominaNovedad);
};

const loadNominaMovimientos = async (
  personaId: number,
  vinculacionIds: number[],
  tenant?: TenantAccessContext
): Promise<Array<Record<string, unknown>>> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const params: unknown[] = [personaId, vinculacionIds];
  const tenantClause = buildTenantScopeClause(params, tenant, 'np.contrato_id', 'c.empresa_id');
  const tenantSql = tenantClause ? `AND ${tenantClause}` : '';
  const result = await dbQuery<NominaMovimientoExpedienteRow>(
    `
      SELECT
        nm.id,
        nm.periodo_id,
        nm.nomina_empleado_id,
        nm.vinculacion_id,
        nm.fecha,
        nm.tipo_movimiento,
        nm.descripcion,
        nm.cantidad,
        nm.valor_unitario,
        nm.valor_total,
        nm.es_devengado,
        nm.es_deduccion,
        nm.afecta_seguridad_social,
        nm.activo,
        nm.created_at,
        np.nombre_periodo AS periodo_nombre,
        np.fecha_inicio AS periodo_fecha_inicio,
        np.fecha_fin AS periodo_fecha_fin,
        np.estado AS periodo_estado
      FROM nomina_movimientos nm
      INNER JOIN vinculaciones v ON v.id = nm.vinculacion_id
      INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE v.persona_id = $1::bigint
        AND nm.vinculacion_id = ANY($2::bigint[])
        ${tenantSql}
      ORDER BY nm.created_at DESC, nm.id DESC
    `,
    params
  );

  return result.rows.map(mapNominaMovimiento);
};

const loadNominaDesprendibles = async (
  personaId: number,
  vinculacionIds: number[],
  tenant?: TenantAccessContext
): Promise<Array<Record<string, unknown>>> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const params: unknown[] = [personaId, vinculacionIds];
  const tenantClause = buildTenantScopeClause(params, tenant, 'np.contrato_id', 'c.empresa_id');
  const tenantSql = tenantClause ? `AND ${tenantClause}` : '';
  const result = await dbQuery<NominaDesprendibleExpedienteRow>(
    `
      SELECT
        nd.id,
        nd.periodo_id,
        nd.nomina_empleado_id,
        nd.vinculacion_id,
        nd.tipo_desprendible,
        nd.version,
        nd.es_vigente,
        nd.estado,
        nd.archivo_path,
        nd.documento_persona_id,
        nd.fecha_generacion,
        nd.observacion,
        nd.activo,
        nd.created_at,
        nd.desprendible_reemplaza_id,
        ne.salario_base,
        ne.auxilio_transporte,
        ne.otros_devengos,
        ne.devengado_basico,
        ne.devengado_transporte,
        ne.devengado_otros,
        ne.total_adiciones,
        ne.total_deducciones,
        ne.salud,
        ne.pension,
        ne.neto_pagar,
        ne.dias_pagados,
        ne.horas_trabajadas,
        np.nombre_periodo AS periodo_nombre,
        np.fecha_inicio AS periodo_fecha_inicio,
        np.fecha_fin AS periodo_fecha_fin,
        np.estado AS periodo_estado,
        dp.nombre_original AS dp_nombre_original,
        dp.mime_type AS dp_mime_type,
        dp.storage_bucket AS dp_storage_bucket,
        dp.storage_path AS dp_storage_path,
        dp.tamano_bytes AS dp_tamano_bytes
      FROM nomina_desprendibles nd
      INNER JOIN vinculaciones v ON v.id = nd.vinculacion_id
      INNER JOIN nomina_empleados ne ON ne.id = nd.nomina_empleado_id
      INNER JOIN nomina_periodos np ON np.id = nd.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      LEFT JOIN documentos_persona dp ON dp.id = nd.documento_persona_id
      WHERE v.persona_id = $1::bigint
        AND nd.vinculacion_id = ANY($2::bigint[])
        AND COALESCE(nd.activo, TRUE) = TRUE
        ${tenantSql}
      ORDER BY nd.fecha_generacion DESC NULLS LAST, nd.id DESC
    `,
    params
  );

  return result.rows.map(mapNominaDesprendible);
};

const loadNominaLiquidaciones = async (
  personaId: number,
  vinculacionIds: number[],
  tenant?: TenantAccessContext
): Promise<Array<Record<string, unknown>>> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const params: unknown[] = [personaId, vinculacionIds];
  const tenantClause = buildTenantScopeClause(params, tenant, 'np.contrato_id', 'c.empresa_id');
  const tenantSql = tenantClause ? `AND ${tenantClause}` : '';
  const result = await dbQuery<NominaLiquidacionExpedienteRow>(
    `
      SELECT
        nl.id,
        nl.vinculacion_id,
        nl.periodo_id,
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
        nl.documento_persona_id,
        nl.observacion,
        nl.activo,
        nl.created_at,
        np.nombre_periodo AS periodo_nombre,
        np.fecha_inicio AS periodo_fecha_inicio,
        np.fecha_fin AS periodo_fecha_fin,
        np.estado AS periodo_estado
      FROM nomina_liquidaciones nl
      INNER JOIN vinculaciones v ON v.id = nl.vinculacion_id
      INNER JOIN nomina_periodos np ON np.id = nl.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE v.persona_id = $1::bigint
        AND nl.vinculacion_id = ANY($2::bigint[])
        AND COALESCE(nl.activo, TRUE) = TRUE
        ${tenantSql}
      ORDER BY nl.created_at DESC, nl.id DESC
    `,
    params
  );

  return result.rows.map(mapNominaLiquidacion);
};

const loadAuditoria = async (input: {
  alertaIds: number[];
  documentoPersonaIds: number[];
  documentoRepositoryEntityIds: string[];
  documentoVinculacionIds: number[];
  nominaCesantiasIds: number[];
  nominaDesprendibleIds: number[];
  nominaEmpleadoIds: number[];
  nominaLiquidacionIds: number[];
  nominaMovimientoIds: number[];
  nominaNovedadIds: number[];
  personaId: number;
  sstAccidenteAccionIds: number[];
  sstAccidenteIds: number[];
  sstInspeccionAccionIds: number[];
  sstInspeccionHallazgoIds: number[];
  sstInspeccionIds: number[];
  sstRiesgoIds: number[];
  sstDotacionEntregaIds: number[];
  sstExamenPersonaIds: number[];
  tenant?: TenantAccessContext;
  vinculacionIds: number[];
}): Promise<ExpedienteAuditoriaItem[]> => {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const tenantClause = buildTenantScopeClause(params, input.tenant, 'ae.contrato_id', 'ae.empresa_id');

  params.push(String(input.personaId));
  clauses.push(`(ae.entidad = 'personas' AND ae.entidad_id = $${params.length})`);

  if (input.alertaIds.length > 0) {
    params.push(input.alertaIds.map(String));
    clauses.push(`(ae.entidad = 'alertas_documentales' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.vinculacionIds.length > 0) {
    params.push(input.vinculacionIds.map(String));
    clauses.push(`(ae.entidad = 'vinculaciones' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.documentoPersonaIds.length > 0) {
    params.push(input.documentoPersonaIds.map(String));
    clauses.push(`(ae.entidad = 'documentos_persona' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.documentoVinculacionIds.length > 0) {
    params.push(input.documentoVinculacionIds.map(String));
    clauses.push(
      `(ae.entidad = 'documentos_vinculacion' AND ae.entidad_id = ANY($${params.length}::text[]))`
    );
  }

  if (input.documentoRepositoryEntityIds.length > 0) {
    params.push(input.documentoRepositoryEntityIds);
    clauses.push(`(ae.entidad = 'documento' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.nominaEmpleadoIds.length > 0) {
    params.push(input.nominaEmpleadoIds.map(String));
    clauses.push(`(ae.entidad = 'nomina_empleados' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.nominaNovedadIds.length > 0) {
    params.push(input.nominaNovedadIds.map(String));
    clauses.push(`(ae.entidad = 'nomina_novedades' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.nominaMovimientoIds.length > 0) {
    params.push(input.nominaMovimientoIds.map(String));
    clauses.push(`(ae.entidad = 'nomina_movimientos' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.nominaDesprendibleIds.length > 0) {
    params.push(input.nominaDesprendibleIds.map(String));
    clauses.push(
      `(ae.entidad = 'nomina_desprendibles' AND ae.entidad_id = ANY($${params.length}::text[]))`
    );
  }

  if (input.nominaLiquidacionIds.length > 0) {
    params.push(input.nominaLiquidacionIds.map(String));
    clauses.push(
      `(ae.entidad = 'nomina_liquidaciones' AND ae.entidad_id = ANY($${params.length}::text[]))`
    );
  }

  if (input.nominaCesantiasIds.length > 0) {
    params.push(input.nominaCesantiasIds.map(String));
    clauses.push(`(ae.entidad = 'nomina_cesantias' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstDotacionEntregaIds.length > 0) {
    params.push(input.sstDotacionEntregaIds.map(String));
    clauses.push(
      `(ae.entidad = 'sst_dotacion_epp_entregas' AND ae.entidad_id = ANY($${params.length}::text[]))`
    );
  }

  if (input.sstAccidenteIds.length > 0) {
    params.push(input.sstAccidenteIds.map(String));
    clauses.push(`(ae.entidad = 'sst_accidentes_incidentes' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstAccidenteAccionIds.length > 0) {
    params.push(input.sstAccidenteAccionIds.map(String));
    clauses.push(`(ae.entidad = 'sst_accidentes_acciones' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstInspeccionIds.length > 0) {
    params.push(input.sstInspeccionIds.map(String));
    clauses.push(`(ae.entidad = 'sst_inspecciones' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstInspeccionHallazgoIds.length > 0) {
    params.push(input.sstInspeccionHallazgoIds.map(String));
    clauses.push(`(ae.entidad = 'sst_inspecciones_hallazgos' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstInspeccionAccionIds.length > 0) {
    params.push(input.sstInspeccionAccionIds.map(String));
    clauses.push(`(ae.entidad = 'sst_inspecciones_acciones' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstRiesgoIds.length > 0) {
    params.push(input.sstRiesgoIds.map(String));
    clauses.push(`(ae.entidad = 'sst_matriz_riesgos' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (input.sstExamenPersonaIds.length > 0) {
    params.push(input.sstExamenPersonaIds.map(String));
    clauses.push(`(ae.entidad = 'sst_examenes_persona' AND ae.entidad_id = ANY($${params.length}::text[]))`);
  }

  if (clauses.length === 0) {
    return [];
  }

  const whereClauses = [`(${clauses.join(' OR ')})`];

  if (tenantClause) {
    whereClauses.push(tenantClause);
  }

  const result = await dbQuery<AuditoriaExpedienteRow>(
    `
      SELECT
        ae.id,
        ae.usuario_id,
        ae.empresa_id,
        ae.contrato_id,
        ae.modulo,
        ae.entidad,
        ae.entidad_id,
        ae.accion,
        ae.descripcion,
        ae.datos_anteriores,
        ae.datos_nuevos,
        ae.ip_address,
        ae.user_agent,
        ae.fecha_evento,
        ae.created_at,
        u.correo AS usuario_email,
        u.nombre_completo AS usuario_nombre
      FROM auditoria_eventos ae
      LEFT JOIN usuarios u ON u.id = ae.usuario_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ae.fecha_evento DESC, ae.id DESC
    `,
    params
  );

  return result.rows.map(mapAuditoria);
};

const mapAlerta = (row: ExpedienteAlertaRow): ExpedienteAlertaItem => {
  return {
    id: toNumber(row.id),
    empresa_id: toNullableNumber(row.empresa_id),
    empresa_nombre: row.empresa_nombre,
    contrato_id: toNullableNumber(row.contrato_id),
    contrato_numero: row.contrato_numero,
    vinculacion_id: toNullableNumber(row.vinculacion_id),
    persona_id: toNullableNumber(row.persona_id),
    persona_nombre: row.persona_nombre,
    tipo_documento_id: toNullableNumber(row.tipo_documento_id),
    tipo_documento_codigo: row.tipo_documento_codigo,
    tipo_documento_nombre: row.tipo_documento_nombre,
    tipo_alerta: row.tipo_alerta,
    severidad: row.severidad,
    estado: row.estado,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha_alerta: toDateString(row.fecha_alerta),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    dias_restantes: toNullableNumber(row.dias_restantes),
    activo: toBoolean(row.activo),
    created_at: toDateString(row.created_at),
    updated_at: toDateString(row.updated_at)
  };
};

const normalizeDateOnly = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
};

const addDaysToDateOnly = (dateOnly: string, days: number): string => {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const getRecordNumber = (record: Record<string, unknown>, key: string): number | null => {
  return toNullableNumber(record[key] as number | string | null | undefined);
};

const getRecordString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  if (typeof value === 'string') {
    return value;
  }

  return null;
};

const getRecordBoolean = (record: Record<string, unknown>, key: string): boolean | null => {
  const value = record[key];

  if (typeof value === 'boolean') {
    return value;
  }

  return null;
};

const getRecordObject = (record: Record<string, unknown>, key: string): Record<string, unknown> | null => {
  const value = record[key];

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const paginateItems = <T>(items: T[], page: number, limit: number): {
  items: T[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
} => {
  const offset = (page - 1) * limit;
  const sliced = items.slice(offset, offset + limit);

  return {
    items: sliced,
    pagination: {
      page,
      limit,
      total: items.length,
      total_pages: items.length === 0 ? 0 : Math.ceil(items.length / limit)
    }
  };
};

const getDocumentoPersonaEstado = (
  document: ExpedienteDocumentoPersona
): 'vigente' | 'vencido' | 'reemplazado' | 'sin_vencimiento' => {
  if (document.es_vigente === false) {
    return 'reemplazado';
  }

  const fechaVencimiento = normalizeDateOnly(document.fecha_vencimiento);
  const today = getTodayDateOnly();

  if (!fechaVencimiento) {
    return 'sin_vencimiento';
  }

  if (fechaVencimiento < today) {
    return 'vencido';
  }

  return 'vigente';
};

const getDocumentoVinculacionEstado = (
  document: ExpedienteDocumentoVinculacion
): 'vigente' | 'vencido' | 'sin_vencimiento' => {
  const fechaVencimiento = normalizeDateOnly(document.fecha_vencimiento);
  const today = getTodayDateOnly();

  if (!fechaVencimiento) {
    return 'sin_vencimiento';
  }

  if (fechaVencimiento < today) {
    return 'vencido';
  }

  return 'vigente';
};

const loadExpedienteBase = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<{ persona: Persona; vinculacionIds: number[]; vinculaciones: Vinculacion[] }> => {
  const persona = await getPersonaById(String(personaId));

  if (!persona) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  const vinculaciones = await getVinculacionesByPersonaId(personaId, tenant);

  if (!tenant?.isGlobalAdmin && vinculaciones.length === 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  return {
    persona,
    vinculaciones,
    vinculacionIds: vinculaciones.map((item) => item.id)
  };
};

const loadExpedienteAlertasRaw = async (
  personaId: number,
  tenant?: TenantAccessContext,
  filters?: Pick<ExpedienteAlertasQuery, 'estado' | 'severidad' | 'tipo_alerta'>
): Promise<ExpedienteAlertaItem[]> => {
  const params: unknown[] = [personaId];
  const conditions = ['ad.persona_id = $1::bigint'];
  const tenantClause = buildTenantScopeClause(params, tenant, 'ad.contrato_id', 'ad.empresa_id');

  if (tenantClause) {
    conditions.push(tenantClause);
  }

  if (filters?.estado) {
    params.push(filters.estado);
    conditions.push(`ad.estado = $${params.length}`);
  }

  if (filters?.severidad) {
    params.push(filters.severidad);
    conditions.push(`ad.severidad = $${params.length}`);
  }

  if (filters?.tipo_alerta) {
    params.push(filters.tipo_alerta);
    conditions.push(`ad.tipo_alerta = $${params.length}`);
  }

  const result = await dbQuery<ExpedienteAlertaRow>(
    `
      SELECT
        ad.id,
        ad.empresa_id,
        e.nombre_empresa AS empresa_nombre,
        ad.contrato_id,
        c.numero_contrato AS contrato_numero,
        ad.vinculacion_id,
        ad.persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        ad.tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        ad.tipo_alerta,
        ad.severidad,
        ad.estado,
        ad.titulo,
        ad.descripcion,
        ad.fecha_alerta,
        ad.fecha_vencimiento,
        ad.dias_restantes,
        ad.activo,
        ad.created_at,
        ad.updated_at
      FROM alertas_documentales ad
      LEFT JOIN empresas e ON e.id = ad.empresa_id
      LEFT JOIN contratos c ON c.id = ad.contrato_id
      LEFT JOIN personas p ON p.id = ad.persona_id
      LEFT JOIN tipos_documentos td ON td.id = ad.tipo_documento_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ad.fecha_alerta DESC, ad.created_at DESC, ad.id DESC
    `,
    params
  );

  return result.rows.map(mapAlerta);
};

const buildRiesgoDocumental = (input: {
  alertasActivas: number;
  alertasAltas: number;
  alertasCriticas: number;
  checklistCumplimientoPromedio: number;
  checklistFaltantes: number;
  checklistVencidos: number;
  documentosPorVencer30Dias: number;
  documentosVencidos: number;
}): ExpedienteRiesgoDocumental => {
  const causas: string[] = [];
  let puntaje = 0;

  if (input.alertasCriticas > 0) {
    puntaje += input.alertasCriticas * 25;
    causas.push(`${input.alertasCriticas} alerta(s) critica(s) activa(s)`);
  }

  if (input.alertasAltas > 0) {
    puntaje += input.alertasAltas * 15;
    causas.push(`${input.alertasAltas} alerta(s) alta(s) activa(s)`);
  }

  if (input.documentosVencidos > 0) {
    puntaje += input.documentosVencidos * 12;
    causas.push(`${input.documentosVencidos} documento(s) vencido(s)`);
  }

  if (input.documentosPorVencer30Dias > 0) {
    puntaje += input.documentosPorVencer30Dias * 4;
    causas.push(`${input.documentosPorVencer30Dias} documento(s) por vencer en 30 dias`);
  }

  if (input.checklistVencidos > 0) {
    puntaje += input.checklistVencidos * 8;
    causas.push(`${input.checklistVencidos} requisito(s) documentales vencido(s)`);
  }

  if (input.checklistFaltantes > 0) {
    puntaje += input.checklistFaltantes * 5;
    causas.push(`${input.checklistFaltantes} requisito(s) documentales faltante(s)`);
  }

  if (input.checklistCumplimientoPromedio < 80) {
    puntaje += Math.ceil((80 - input.checklistCumplimientoPromedio) / 2);
    causas.push(`cumplimiento documental promedio de ${input.checklistCumplimientoPromedio}%`);
  }

  if (input.alertasActivas > 0) {
    puntaje += Math.min(10, input.alertasActivas);
  }

  const boundedScore = Math.max(0, Math.min(100, puntaje));
  let nivel: ExpedienteRiesgoDocumental['nivel'] = 'BAJO';

  if (input.alertasCriticas > 0 || boundedScore >= 75) {
    nivel = 'CRITICO';
  } else if (boundedScore >= 50) {
    nivel = 'ALTO';
  } else if (boundedScore >= 25) {
    nivel = 'MEDIO';
  }

  return {
    nivel,
    puntaje: boundedScore,
    causas
  };
};

const buildIndicadores = (input: {
  alertas: ExpedienteAlertaItem[];
  auditoria: ExpedienteAuditoriaItem[];
  checklistPorVinculacion: ExpedienteChecklistPorVinculacion[];
  documentosPersona: ExpedienteDocumentoPersona[];
  documentosVinculacion: ExpedienteDocumentoVinculacion[];
  evaluaciones: EvaluacionesExpedienteResumen['items'];
  planesMejora: EvaluacionesExpedienteResumen['planes_mejora'];
  nominaDesprendibles: Array<Record<string, unknown>>;
  nominaEmpleados: Array<Record<string, unknown>>;
  nominaLiquidaciones: Array<Record<string, unknown>>;
  nominaMovimientos: Array<Record<string, unknown>>;
  nominaNovedades: Array<Record<string, unknown>>;
  cesantias: CesantiasExpedienteIndicadores;
  prima: PrimaExpedienteIndicadores;
  vacaciones: VacacionesExpedienteIndicadores;
  sstAccidentes: Array<Record<string, unknown>>;
  sstAccionesInspeccion: Array<Record<string, unknown>>;
  sstCapacitaciones: Array<Record<string, unknown>>;
  sstDotacionEpp: Array<Record<string, unknown>>;
  sstExamenesOcupacionales: Array<Record<string, unknown>>;
  sstHallazgosInspeccion: Array<Record<string, unknown>>;
  sstInspecciones: Array<Record<string, unknown>>;
  sstMatrizRiesgos: Array<Record<string, unknown>>;
  vinculaciones: Vinculacion[];
}): ExpedienteIndicadores => {
  const checklistTotalRequisitos = input.checklistPorVinculacion.reduce(
    (accumulator, item) => accumulator + item.checklist.total_requisitos,
    0
  );
  const checklistCargados = input.checklistPorVinculacion.reduce(
    (accumulator, item) => accumulator + item.checklist.cargados,
    0
  );
  const checklistFaltantes = input.checklistPorVinculacion.reduce(
    (accumulator, item) => accumulator + item.checklist.faltantes,
    0
  );
  const checklistVencidos = input.checklistPorVinculacion.reduce(
    (accumulator, item) => accumulator + item.checklist.vencidos,
    0
  );
  const checklistCumplimientoPromedio =
    input.checklistPorVinculacion.length === 0
      ? 0
      : Number(
          (
            input.checklistPorVinculacion.reduce(
              (accumulator, item) => accumulator + item.checklist.cumplimiento_porcentaje,
              0
            ) / input.checklistPorVinculacion.length
          ).toFixed(2)
        );

  const today = getTodayDateOnly();
  const maxPorVencer = addDaysToDateOnly(today, 30);
  let documentosVigentes = 0;
  let documentosVencidos = 0;
  let documentosSinVencimiento = 0;
  let documentosReemplazados = 0;
  let documentosPorVencer30Dias = 0;

  for (const document of input.documentosPersona) {
    const estado = getDocumentoPersonaEstado(document);
    const fechaVencimiento = normalizeDateOnly(document.fecha_vencimiento);

    if (estado === 'vigente') {
      documentosVigentes += 1;
    } else if (estado === 'vencido') {
      documentosVencidos += 1;
    } else if (estado === 'sin_vencimiento') {
      documentosSinVencimiento += 1;
    } else if (estado === 'reemplazado') {
      documentosReemplazados += 1;
    }

    if (fechaVencimiento && fechaVencimiento >= today && fechaVencimiento <= maxPorVencer && estado !== 'reemplazado') {
      documentosPorVencer30Dias += 1;
    }
  }

  for (const document of input.documentosVinculacion) {
    const estado = getDocumentoVinculacionEstado(document);
    const fechaVencimiento = normalizeDateOnly(document.fecha_vencimiento);

    if (estado === 'vigente') {
      documentosVigentes += 1;
    } else if (estado === 'vencido') {
      documentosVencidos += 1;
    } else if (estado === 'sin_vencimiento') {
      documentosSinVencimiento += 1;
    }

    if (fechaVencimiento && fechaVencimiento >= today && fechaVencimiento <= maxPorVencer) {
      documentosPorVencer30Dias += 1;
    }
  }

  const alertasActivas = input.alertas.filter((item) => item.estado === 'ACTIVA').length;
  const alertasResueltas = input.alertas.filter((item) => item.estado === 'RESUELTA').length;
  const alertasCriticas = input.alertas.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'CRITICA').length;
  const alertasAltas = input.alertas.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'ALTA').length;
  const alertasMedias = input.alertas.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'MEDIA').length;
  const alertasBajas = input.alertas.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'BAJA').length;
  const riesgoDocumental = buildRiesgoDocumental({
    alertasActivas,
    alertasAltas,
    alertasCriticas,
    checklistCumplimientoPromedio,
    checklistFaltantes,
    checklistVencidos,
    documentosPorVencer30Dias,
    documentosVencidos
  });
  const periodosIds = new Set<number>();

  for (const empleado of input.nominaEmpleados) {
    const periodoId = getRecordNumber(empleado, 'periodo_id');

    if (periodoId !== null) {
      periodosIds.add(periodoId);
    }
  }

  const sstCapacitacionesTotal = input.sstCapacitaciones.length;
  const sstCapacitacionesVigentes = input.sstCapacitaciones.filter(
    (item) => getRecordString(item, 'estado_capacitacion') === 'vigente'
  ).length;
  const sstCapacitacionesVencidas = input.sstCapacitaciones.filter(
    (item) => getRecordString(item, 'estado_capacitacion') === 'vencida'
  ).length;
  const sstCumplimientoPorcentaje =
    sstCapacitacionesTotal === 0 ? 0 : Number(((sstCapacitacionesVigentes / sstCapacitacionesTotal) * 100).toFixed(2));
  const sstDotacionEntregasTotal = input.sstDotacionEpp.length;
  const sstDotacionVigentes = input.sstDotacionEpp.filter(
    (item) => getRecordString(item, 'estado_reposicion') !== 'vencida'
  ).length;
  const sstDotacionVencidas = input.sstDotacionEpp.filter(
    (item) => getRecordString(item, 'estado_reposicion') === 'vencida'
  ).length;
  const sstDotacionCumplimientoPorcentaje =
    sstDotacionEntregasTotal === 0 ? 0 : Number(((sstDotacionVigentes / sstDotacionEntregasTotal) * 100).toFixed(2));
  const sstExamenesTotal = input.sstExamenesOcupacionales.length;
  const sstExamenesVigentes = input.sstExamenesOcupacionales.filter((item) => {
    const estado = getRecordString(item, 'estado_examen');
    return estado === 'vigente' || estado === 'proximo_a_vencer';
  }).length;
  const sstExamenesVencidos = input.sstExamenesOcupacionales.filter(
    (item) => getRecordString(item, 'estado_examen') === 'vencido'
  ).length;
  const sstExamenesNoAptos = input.sstExamenesOcupacionales.filter(
    (item) => getRecordString(item, 'concepto_medico') === 'NO_APTO'
  ).length;
  const sstExamenesConRestricciones = input.sstExamenesOcupacionales.filter((item) => {
    const concepto = getRecordString(item, 'concepto_medico');
    const restricciones = getRecordString(item, 'restricciones');
    return concepto === 'APTO_CON_RESTRICCIONES' || Boolean(restricciones);
  }).length;
  const sstExamenesCumplimientoPorcentaje =
    sstExamenesTotal === 0 ? 0 : Number(((sstExamenesVigentes / sstExamenesTotal) * 100).toFixed(2));
  const sstAccidentesTotal = input.sstAccidentes.length;
  const sstAccidentesAbiertos = input.sstAccidentes.filter((item) => {
    const estado = getRecordString(item, 'estado');
    return estado === 'ABIERTO' || estado === 'EN_INVESTIGACION';
  }).length;
  const sstAccidentesGraves = input.sstAccidentes.filter((item) => {
    const severidad = getRecordString(item, 'severidad');
    return severidad === 'GRAVE' || severidad === 'MORTAL';
  }).length;
  const sstAccidentesIncapacidad = input.sstAccidentes.reduce(
    (accumulator, item) => accumulator + (getRecordNumber(item, 'dias_incapacidad') ?? 0),
    0
  );
  const sstInspeccionesTotal = input.sstInspecciones.length;
  const sstHallazgosTotal = input.sstHallazgosInspeccion.length;
  const sstHallazgosCriticos = input.sstHallazgosInspeccion.filter(
    (item) => getRecordString(item, 'nivel_riesgo') === 'CRITICO'
  ).length;
  const sstAccionesInspeccionAbiertas = input.sstAccionesInspeccion.filter((item) => {
    const estado = getRecordString(item, 'estado');
    return estado === 'ABIERTA' || estado === 'EN_PROCESO' || estado === 'VENCIDA';
  }).length;
  const sstAccionesInspeccionVencidas = input.sstAccionesInspeccion.filter((item) => {
    const estado = getRecordString(item, 'estado');
    const estadoAlerta = getRecordString(item, 'estado_alerta');
    return estado === 'VENCIDA' || estadoAlerta === 'vencida';
  }).length;
  const sstRiesgosTotal = input.sstMatrizRiesgos.length;
  const sstRiesgosAltos = input.sstMatrizRiesgos.filter(
    (item) => getRecordString(item, 'clasificacion_riesgo') === 'ALTO'
  ).length;
  const sstRiesgosCriticos = input.sstMatrizRiesgos.filter(
    (item) => getRecordString(item, 'clasificacion_riesgo') === 'CRITICO'
  ).length;
  const evaluacionesVigentes = input.evaluaciones.filter((item) => item.calificacion_total !== null);
  const evaluacionesPromedio =
    evaluacionesVigentes.length === 0
      ? 0
      : Number(
          (
            evaluacionesVigentes.reduce((accumulator, item) => accumulator + (item.calificacion_total ?? 0), 0) /
            evaluacionesVigentes.length
          ).toFixed(2)
        );
  const evaluacionesCumplimiento = Number((evaluacionesPromedio * 20).toFixed(2));
  const planesMejoraIndicadores = input.planesMejora.indicadores;
  const cesantiasIndicadores = input.cesantias;
  const primaIndicadores = input.prima;
  const vacacionesIndicadores = input.vacaciones;
  const ultimaEvaluacion = input.evaluaciones[0]
    ? input.evaluaciones[0].evaluacion.fecha_fin || input.evaluaciones[0].created_at
    : null;

  return {
    vinculaciones_total: input.vinculaciones.length,
    vinculaciones_activas: input.vinculaciones.filter((item) => item.estado_vinculacion === 'ACTIVA').length,
    vinculaciones_retiradas: input.vinculaciones.filter((item) => item.estado_vinculacion === 'RETIRADA').length,
    vinculaciones_suspendidas: input.vinculaciones.filter((item) => item.estado_vinculacion === 'SUSPENDIDA').length,
    documentos_persona: input.documentosPersona.length,
    documentos_vinculacion: input.documentosVinculacion.length,
    documentos_total: input.documentosPersona.length + input.documentosVinculacion.length,
    documentos_vigentes: documentosVigentes,
    documentos_vencidos: documentosVencidos,
    documentos_sin_vencimiento: documentosSinVencimiento,
    documentos_reemplazados: documentosReemplazados,
    documentos_por_vencer_30_dias: documentosPorVencer30Dias,
    evaluaciones_total: input.evaluaciones.length,
    clasificacion_desempeno:
      input.evaluaciones.length === 0
        ? null
        : evaluacionesCumplimiento <= 59
          ? 'CRITICO'
          : evaluacionesCumplimiento <= 79
            ? 'MEDIO'
            : evaluacionesCumplimiento <= 89
              ? 'BUENO'
              : 'EXCELENTE',
    planes_mejora_abiertos: planesMejoraIndicadores.planes_mejora_abiertos,
    planes_mejora_vencidos: planesMejoraIndicadores.planes_mejora_vencidos,
    promedio_desempeno: evaluacionesPromedio,
    cesantias_consignadas: cesantiasIndicadores.cesantias_consignadas,
    cesantias_total: cesantiasIndicadores.cesantias_total,
    ultima_cesantia: cesantiasIndicadores.ultima_cesantia,
    prima_pagada: primaIndicadores.prima_pagada,
    prima_total: primaIndicadores.prima_total,
    ultima_prima: primaIndicadores.ultima_prima,
    ultima_evaluacion: ultimaEvaluacion,
    vacaciones_dias_pendientes: vacacionesIndicadores.vacaciones_dias_pendientes,
    vacaciones_solicitudes_total: vacacionesIndicadores.vacaciones_solicitudes_total,
    vacaciones_ultima_solicitud: vacacionesIndicadores.vacaciones_ultima_solicitud,
    checklist_total_requisitos: checklistTotalRequisitos,
    checklist_cargados: checklistCargados,
    checklist_faltantes: checklistFaltantes,
    checklist_vencidos: checklistVencidos,
    checklist_cumplimiento_promedio: checklistCumplimientoPromedio,
    alertas_total: input.alertas.length,
    alertas_activas: alertasActivas,
    alertas_resueltas: alertasResueltas,
    alertas_criticas: alertasCriticas,
    alertas_altas: alertasAltas,
    alertas_medias: alertasMedias,
    alertas_bajas: alertasBajas,
    riesgo_documental: riesgoDocumental,
    nomina_periodos: periodosIds.size,
    nomina_empleados: input.nominaEmpleados.length,
    nomina_novedades: input.nominaNovedades.length,
    nomina_movimientos: input.nominaMovimientos.length,
    nomina_desprendibles: input.nominaDesprendibles.length,
    nomina_liquidaciones: input.nominaLiquidaciones.length,
    sst_capacitaciones_total: sstCapacitacionesTotal,
    sst_capacitaciones_vigentes: sstCapacitacionesVigentes,
    sst_capacitaciones_vencidas: sstCapacitacionesVencidas,
    sst_dotacion_entregas_total: sstDotacionEntregasTotal,
    sst_dotacion_vigentes: sstDotacionVigentes,
    sst_dotacion_vencidas: sstDotacionVencidas,
    sst_dotacion_cumplimiento_porcentaje: sstDotacionCumplimientoPorcentaje,
    sst_accidentes_total: sstAccidentesTotal,
    sst_accidentes_abiertos: sstAccidentesAbiertos,
    sst_accidentes_graves: sstAccidentesGraves,
    sst_accidentes_incapacidad: sstAccidentesIncapacidad,
    sst_inspecciones_total: sstInspeccionesTotal,
    sst_hallazgos_total: sstHallazgosTotal,
    sst_hallazgos_criticos: sstHallazgosCriticos,
    sst_acciones_inspeccion_abiertas: sstAccionesInspeccionAbiertas,
    sst_acciones_inspeccion_vencidas: sstAccionesInspeccionVencidas,
    sst_riesgos_total: sstRiesgosTotal,
    sst_riesgos_altos: sstRiesgosAltos,
    sst_riesgos_criticos: sstRiesgosCriticos,
    sst_examenes_total: sstExamenesTotal,
    sst_examenes_vigentes: sstExamenesVigentes,
    sst_examenes_vencidos: sstExamenesVencidos,
    sst_examenes_no_aptos: sstExamenesNoAptos,
    sst_examenes_con_restricciones: sstExamenesConRestricciones,
    sst_examenes_cumplimiento_porcentaje: sstExamenesCumplimientoPorcentaje,
    sst_cumplimiento_porcentaje: sstCumplimientoPorcentaje,
    desprendibles_vigentes: input.nominaDesprendibles.filter(
      (item) => item.es_vigente === true || item.es_vigente === undefined
    ).length,
    liquidaciones_activas: input.nominaLiquidaciones.filter(
      (item) => item.activo === true || item.activo === undefined
    ).length,
    auditoria_eventos: input.auditoria.length
  };
};

const buildTimelineItems = (snapshot: ExpedienteSnapshot): ExpedienteTimelineItem[] => {
  const items: ExpedienteTimelineItem[] = [];

  const pushItem = (item: Omit<ExpedienteTimelineItem, 'fecha'> & { fecha: string | null }): void => {
    if (!item.fecha) {
      return;
    }

    items.push({
      ...item,
      fecha: item.fecha
    });
  };

  for (const vinculacion of snapshot.vinculaciones) {
    pushItem({
      fecha: normalizeDateOnly(vinculacion.fecha_inicio),
      tipo: 'VINCULACION_INICIO',
      titulo: 'Inicio de vinculacion',
      descripcion: `Vinculacion ${vinculacion.id} en contrato ${vinculacion.contrato_id}`,
      referencia: {
        entidad: 'vinculaciones',
        id: String(vinculacion.id)
      },
      metadata: {
        vinculacion_id: vinculacion.id,
        contrato_id: vinculacion.contrato_id,
        empresa_id: vinculacion.empresa_id,
        estado_vinculacion: vinculacion.estado_vinculacion
      }
    });

    if (vinculacion.fecha_fin) {
      pushItem({
        fecha: normalizeDateOnly(vinculacion.fecha_fin),
        tipo: 'VINCULACION_FIN',
        titulo: 'Fin de vinculacion',
        descripcion: vinculacion.motivo_retiro ?? 'Vinculacion finalizada',
        referencia: {
          entidad: 'vinculaciones',
          id: String(vinculacion.id)
        },
        metadata: {
          vinculacion_id: vinculacion.id,
          estado_vinculacion: vinculacion.estado_vinculacion
        }
      });
    }
  }

  for (const document of snapshot.documentosPersona) {
    pushItem({
      fecha: normalizeDateOnly(document.fecha_carga),
      tipo: 'DOCUMENTO_PERSONA',
      titulo: `Documento personal: ${document.tipo_documento.nombre_documento}`,
      descripcion: document.nombre_original,
      referencia: {
        entidad: 'documentos_persona',
        id: String(document.id)
      },
      metadata: {
        documento_id: document.id,
        tipo_documento_id: document.tipo_documento_id,
        estado_documental: getDocumentoPersonaEstado(document)
      }
    });
  }

  for (const document of snapshot.documentosVinculacion) {
    pushItem({
      fecha: normalizeDateOnly(document.fecha_carga),
      tipo: 'DOCUMENTO_VINCULACION',
      titulo: `Documento de vinculacion: ${document.tipo_documento.nombre_documento}`,
      descripcion: document.nombre_original,
      referencia: {
        entidad: 'documentos_vinculacion',
        id: String(document.id)
      },
      metadata: {
        documento_id: document.id,
        vinculacion_id: document.vinculacion_id,
        estado_documental: getDocumentoVinculacionEstado(document)
      }
    });
  }

  for (const alerta of snapshot.alertas) {
    pushItem({
      fecha: normalizeDateOnly(alerta.fecha_alerta),
      tipo: 'ALERTA_DOCUMENTAL',
      titulo: alerta.titulo,
      descripcion: alerta.descripcion,
      referencia: {
        entidad: 'alertas_documentales',
        id: String(alerta.id)
      },
      metadata: {
        severidad: alerta.severidad,
        estado: alerta.estado,
        tipo_alerta: alerta.tipo_alerta,
        vinculacion_id: alerta.vinculacion_id
      }
    });
  }

  for (const evaluacion of snapshot.evaluaciones.items) {
    pushItem({
      fecha: normalizeDateOnly(evaluacion.created_at),
      tipo: 'EVALUACION_CREATE',
      titulo: `Evaluacion de desempeno: ${evaluacion.evaluacion.nombre_evaluacion}`,
      descripcion: evaluacion.calificacion_total === null ? 'Evaluacion creada' : `Calificacion actual ${evaluacion.calificacion_total}`,
      referencia: {
        entidad: 'evaluaciones_persona',
        id: String(evaluacion.id)
      },
      metadata: {
        evaluacion_id: evaluacion.evaluacion.id,
        persona_id: evaluacion.persona_id,
        estado: evaluacion.estado,
        calificacion_total: evaluacion.calificacion_total,
        clasificacion: evaluacion.clasificacion
      }
    });

    if (evaluacion.estado === 'FINALIZADA') {
      pushItem({
        fecha: normalizeDateOnly(evaluacion.evaluacion.fecha_fin ?? evaluacion.created_at),
        tipo: 'EVALUACION_FINALIZADA',
        titulo: `Evaluacion finalizada: ${evaluacion.evaluacion.nombre_evaluacion}`,
        descripcion: evaluacion.calificacion_total === null ? 'Evaluacion finalizada sin calificacion' : `Calificacion final ${evaluacion.calificacion_total}`,
        referencia: {
          entidad: 'evaluaciones_persona',
          id: String(evaluacion.id)
        },
        metadata: {
          evaluacion_id: evaluacion.evaluacion.id,
          persona_id: evaluacion.persona_id,
          estado: evaluacion.estado,
          calificacion_total: evaluacion.calificacion_total,
          clasificacion: evaluacion.clasificacion
        }
      });
    }

    if (evaluacion.clasificacion) {
      pushItem({
        fecha: normalizeDateOnly(evaluacion.evaluacion.fecha_fin ?? evaluacion.created_at),
        tipo: 'DESEMPENO_CLASIFICACION',
        titulo: `Clasificacion de desempeno: ${evaluacion.evaluacion.nombre_evaluacion}`,
        descripcion: `Clasificacion ${evaluacion.clasificacion}`,
        referencia: {
          entidad: 'evaluaciones_persona',
          id: String(evaluacion.id)
        },
        metadata: {
          evaluacion_id: evaluacion.evaluacion.id,
          persona_id: evaluacion.persona_id,
          clasificacion: evaluacion.clasificacion,
          calificacion_total: evaluacion.calificacion_total
        }
      });
    }
  }

  for (const plan of snapshot.evaluaciones.planes_mejora.items) {
    pushItem({
      fecha: normalizeDateOnly(plan.created_at),
      tipo: 'PLAN_MEJORA_CREATE',
      titulo: `Plan de mejora: ${plan.objetivo}`,
      descripcion: plan.descripcion,
      referencia: {
        entidad: 'evaluaciones_planes_mejora',
        id: String(plan.id)
      },
      metadata: {
        evaluacion_persona_id: plan.evaluacion_persona_id,
        persona_id: plan.persona_id,
        estado: plan.estado,
        estado_alerta: plan.estado_alerta,
        progreso_actual: plan.progreso_actual,
        fecha_compromiso: plan.fecha_compromiso
      }
    });

    for (const seguimiento of plan.seguimientos) {
      pushItem({
        fecha: normalizeDateOnly(seguimiento.fecha_seguimiento),
        tipo: 'PLAN_MEJORA_SEGUIMIENTO_CREATE',
        titulo: `Seguimiento de plan: ${plan.objetivo}`,
        descripcion: seguimiento.comentario,
        referencia: {
          entidad: 'evaluaciones_planes_mejora_seguimientos',
          id: String(seguimiento.id)
        },
        metadata: {
          plan_mejora_id: plan.id,
          porcentaje_avance: seguimiento.porcentaje_avance,
          responsable: seguimiento.responsable
        }
      });
    }

    if (plan.estado === 'CERRADO' && plan.fecha_cierre) {
      pushItem({
        fecha: normalizeDateOnly(plan.fecha_cierre),
        tipo: 'PLAN_MEJORA_CERRADO',
        titulo: `Plan de mejora cerrado: ${plan.objetivo}`,
        descripcion: plan.comentario_ultimo,
        referencia: {
          entidad: 'evaluaciones_planes_mejora',
          id: String(plan.id)
        },
        metadata: {
          plan_mejora_id: plan.id,
          progreso_actual: plan.progreso_actual
        }
      });
    }
  }

  for (const prima of snapshot.prima.items) {
    if (prima.estado === 'LIQUIDADA' || prima.estado === 'PAGADA') {
      pushItem({
        fecha: normalizeDateOnly(prima.created_at),
        tipo: 'PRIMA_LIQUIDADA',
        titulo: `Prima de servicios liquidada: ${prima.periodo}`,
        descripcion: `Valor prima ${prima.valor_prima}`,
        referencia: {
          entidad: 'nomina_prima',
          id: String(prima.id)
        },
        metadata: {
          prima_id: prima.id,
          estado: prima.estado,
          valor_prima: prima.valor_prima,
          vinculacion_id: prima.vinculacion_id
        }
      });
    }

    if (prima.estado === 'PAGADA') {
      pushItem({
        fecha: normalizeDateOnly(prima.fecha_pago ?? prima.created_at),
        tipo: 'PRIMA_PAGADA',
        titulo: `Prima de servicios pagada: ${prima.periodo}`,
        descripcion: `Pago de prima por ${prima.valor_prima}`,
        referencia: {
          entidad: 'nomina_prima',
          id: String(prima.id)
        },
        metadata: {
          prima_id: prima.id,
          fecha_pago: prima.fecha_pago,
          valor_prima: prima.valor_prima,
          vinculacion_id: prima.vinculacion_id
        }
      });
    }
  }

  for (const cesantia of snapshot.cesantias.items) {
    if (
      cesantia.estado === 'LIQUIDADA' ||
      cesantia.estado === 'CONSIGNADA' ||
      cesantia.estado === 'PAGADA'
    ) {
      pushItem({
        fecha: normalizeDateOnly(cesantia.created_at),
        tipo: 'CESANTIAS_LIQUIDADAS',
        titulo: `Cesantias liquidadas: ${cesantia.periodo}`,
        descripcion: `Valor cesantias ${cesantia.valor_cesantias}`,
        referencia: {
          entidad: 'nomina_cesantias',
          id: String(cesantia.id)
        },
        metadata: {
          cesantia_id: cesantia.id,
          estado: cesantia.estado,
          valor_cesantias: cesantia.valor_cesantias,
          vinculacion_id: cesantia.vinculacion_id
        }
      });
    }

    if (cesantia.estado === 'CONSIGNADA') {
      pushItem({
        fecha: normalizeDateOnly(cesantia.fecha_consignacion ?? cesantia.created_at),
        tipo: 'CESANTIAS_CONSIGNADAS',
        titulo: `Cesantias consignadas: ${cesantia.periodo}`,
        descripcion: cesantia.fondo_cesantias
          ? `Consignacion en ${cesantia.fondo_cesantias} por ${cesantia.valor_cesantias}`
          : `Consignacion de cesantias por ${cesantia.valor_cesantias}`,
        referencia: {
          entidad: 'nomina_cesantias',
          id: String(cesantia.id)
        },
        metadata: {
          cesantia_id: cesantia.id,
          fecha_consignacion: cesantia.fecha_consignacion,
          fondo_cesantias: cesantia.fondo_cesantias,
          valor_cesantias: cesantia.valor_cesantias,
          vinculacion_id: cesantia.vinculacion_id
        }
      });
    }

    if (cesantia.estado === 'PAGADA') {
      pushItem({
        fecha: normalizeDateOnly(cesantia.created_at),
        tipo: 'CESANTIAS_PAGADAS',
        titulo: `Cesantias pagadas: ${cesantia.periodo}`,
        descripcion: `Pago de cesantias por ${cesantia.valor_cesantias}`,
        referencia: {
          entidad: 'nomina_cesantias',
          id: String(cesantia.id)
        },
        metadata: {
          cesantia_id: cesantia.id,
          valor_cesantias: cesantia.valor_cesantias,
          vinculacion_id: cesantia.vinculacion_id
        }
      });
    }
  }

  for (const vacacion of snapshot.vacaciones.items) {
    for (const solicitud of vacacion.solicitudes) {
      const tipoTimeline =
        solicitud.estado === 'SOLICITADA'
          ? 'VACACIONES_SOLICITUD_CREATE'
          : solicitud.estado === 'APROBADA'
            ? 'VACACIONES_APROBADA'
            : solicitud.estado === 'DISFRUTADA'
              ? 'VACACIONES_DISFRUTADA'
              : solicitud.estado === 'PAGADA'
                ? 'VACACIONES_PAGADA'
                : null;

      if (!tipoTimeline) {
        continue;
      }

      const fechaReferencia =
        solicitud.estado === 'APROBADA'
          ? solicitud.fecha_aprobacion ?? solicitud.fecha_solicitud
          : solicitud.estado === 'DISFRUTADA'
            ? solicitud.fecha_inicio
            : solicitud.estado === 'PAGADA'
              ? solicitud.fecha_fin
              : solicitud.fecha_solicitud;

      pushItem({
        fecha: normalizeDateOnly(fechaReferencia),
        tipo: tipoTimeline,
        titulo: `Vacacion ${solicitud.estado.toLowerCase()}`,
        descripcion: `Solicitud de ${solicitud.dias_solicitados} dias para la vacacion ${vacacion.id}`,
        referencia: {
          entidad: 'nomina_vacaciones_solicitudes',
          id: String(solicitud.id)
        },
        metadata: {
          vacacion_id: vacacion.id,
          solicitud_id: solicitud.id,
          estado: solicitud.estado,
          tipo_vacacion: solicitud.tipo_vacacion,
          dias_solicitados: solicitud.dias_solicitados,
          vinculacion_id: vacacion.vinculacion_id
        }
      });
    }
  }

  for (const empleado of snapshot.nominaEmpleados) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(empleado, 'created_at')),
      tipo: 'NOMINA_EMPLEADO',
      titulo: 'Registro de empleado en nomina',
      descripcion: getRecordString(getRecordObject(empleado, 'periodo') ?? {}, 'nombre_periodo'),
      referencia: {
        entidad: 'nomina_empleados',
        id: String(getRecordNumber(empleado, 'id') ?? '')
      },
      metadata: {
        periodo_id: getRecordNumber(empleado, 'periodo_id'),
        vinculacion_id: getRecordNumber(empleado, 'vinculacion_id'),
        estado: getRecordString(empleado, 'estado')
      }
    });
  }

  for (const novedad of snapshot.nominaNovedades) {
    const tipoNovedad = getRecordObject(novedad, 'tipo_novedad');
    pushItem({
      fecha: normalizeDateOnly(getRecordString(novedad, 'created_at')),
      tipo: 'NOMINA_NOVEDAD',
      titulo: `Novedad de nomina: ${getRecordString(tipoNovedad ?? {}, 'nombre') ?? 'N/D'}`,
      descripcion: getRecordString(novedad, 'observacion'),
      referencia: {
        entidad: 'nomina_novedades',
        id: String(getRecordNumber(novedad, 'id') ?? '')
      },
      metadata: {
        periodo_id: getRecordNumber(novedad, 'periodo_id'),
        vinculacion_id: getRecordNumber(novedad, 'vinculacion_id')
      }
    });
  }

  for (const movimiento of snapshot.nominaMovimientos) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(movimiento, 'fecha') ?? getRecordString(movimiento, 'created_at')),
      tipo: 'NOMINA_MOVIMIENTO',
      titulo: `Movimiento de nomina: ${getRecordString(movimiento, 'tipo_movimiento') ?? 'N/D'}`,
      descripcion: getRecordString(movimiento, 'descripcion'),
      referencia: {
        entidad: 'nomina_movimientos',
        id: String(getRecordNumber(movimiento, 'id') ?? '')
      },
      metadata: {
        periodo_id: getRecordNumber(movimiento, 'periodo_id'),
        vinculacion_id: getRecordNumber(movimiento, 'vinculacion_id'),
        valor_total: getRecordNumber(movimiento, 'valor_total')
      }
    });
  }

  for (const desprendible of snapshot.nominaDesprendibles) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(desprendible, 'fecha_generacion') ?? getRecordString(desprendible, 'created_at')),
      tipo: 'NOMINA_DESPRENDIBLE',
      titulo: 'Desprendible de pago generado',
      descripcion: getRecordString(desprendible, 'archivo_path'),
      referencia: {
        entidad: 'nomina_desprendibles',
        id: String(getRecordNumber(desprendible, 'id') ?? '')
      },
      metadata: {
        periodo_id: getRecordNumber(desprendible, 'periodo_id'),
        vinculacion_id: getRecordNumber(desprendible, 'vinculacion_id'),
        version: getRecordNumber(desprendible, 'version')
      }
    });
  }

  for (const liquidacion of snapshot.nominaLiquidaciones) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(liquidacion, 'created_at') ?? getRecordString(liquidacion, 'fecha_retiro')),
      tipo: 'NOMINA_LIQUIDACION',
      titulo: 'Liquidacion laboral registrada',
      descripcion: getRecordString(liquidacion, 'motivo_retiro'),
      referencia: {
        entidad: 'nomina_liquidaciones',
        id: String(getRecordNumber(liquidacion, 'id') ?? '')
      },
      metadata: {
        periodo_id: getRecordNumber(liquidacion, 'periodo_id'),
        vinculacion_id: getRecordNumber(liquidacion, 'vinculacion_id'),
        total_liquidacion: getRecordNumber(liquidacion, 'total_liquidacion')
      }
    });
  }

  for (const capacitacion of snapshot.sstCapacitaciones) {
    const capacitacionDef = getRecordObject(capacitacion, 'capacitacion');
    pushItem({
      fecha: normalizeDateOnly(getRecordString(capacitacion, 'fecha_capacitacion')),
      tipo: 'SST_CAPACITACION',
      titulo: `Capacitacion SST: ${getRecordString(capacitacionDef ?? {}, 'nombre_capacitacion') ?? 'N/D'}`,
      descripcion: getRecordString(capacitacion, 'observacion'),
      referencia: {
        entidad: 'sst_capacitaciones_persona',
        id: String(getRecordNumber(capacitacion, 'id') ?? '')
      },
      metadata: {
        capacitacion_id: getRecordNumber(capacitacionDef ?? {}, 'id'),
        vinculacion_id: getRecordObject(capacitacion, 'vinculacion')
          ? getRecordNumber(getRecordObject(capacitacion, 'vinculacion') ?? {}, 'id')
          : null,
        estado_capacitacion: getRecordString(capacitacion, 'estado_capacitacion'),
        fecha_vencimiento: getRecordString(capacitacion, 'fecha_vencimiento')
      }
    });
  }

  for (const entrega of snapshot.sstDotacionEpp) {
    const item = getRecordObject(entrega, 'item');
    pushItem({
      fecha: normalizeDateOnly(getRecordString(entrega, 'fecha_entrega')),
      tipo: 'SST_DOTACION_EPP_ENTREGA',
      titulo: `Entrega SST: ${getRecordString(item ?? {}, 'nombre_item') ?? 'N/D'}`,
      descripcion: getRecordString(entrega, 'observacion'),
      referencia: {
        entidad: 'sst_dotacion_epp_entregas',
        id: String(getRecordNumber(entrega, 'id') ?? '')
      },
      metadata: {
        item_id: getRecordNumber(item ?? {}, 'id'),
        tipo_item: getRecordString(item ?? {}, 'tipo_item'),
        vinculacion_id: getRecordObject(entrega, 'vinculacion')
          ? getRecordNumber(getRecordObject(entrega, 'vinculacion') ?? {}, 'id')
          : null,
        estado_entrega: getRecordString(entrega, 'estado_entrega'),
        estado_reposicion: getRecordString(entrega, 'estado_reposicion'),
        fecha_proxima_reposicion: getRecordString(entrega, 'fecha_proxima_reposicion')
      }
    });
  }

  for (const examen of snapshot.sstExamenesOcupacionales) {
    const examenDef = getRecordObject(examen, 'examen');
    pushItem({
      fecha: normalizeDateOnly(getRecordString(examen, 'fecha_examen')),
      tipo: 'SST_EXAMEN_OCUPACIONAL',
      titulo: `Examen SST: ${getRecordString(examenDef ?? {}, 'nombre_examen') ?? 'N/D'}`,
      descripcion: getRecordString(examen, 'observacion'),
      referencia: {
        entidad: 'sst_examenes_persona',
        id: String(getRecordNumber(examen, 'id') ?? '')
      },
      metadata: {
        examen_id: getRecordNumber(examenDef ?? {}, 'id'),
        tipo_examen: getRecordString(examenDef ?? {}, 'tipo_examen'),
        vinculacion_id: getRecordObject(examen, 'vinculacion')
          ? getRecordNumber(getRecordObject(examen, 'vinculacion') ?? {}, 'id')
          : null,
        estado_examen: getRecordString(examen, 'estado_examen'),
        concepto_medico: getRecordString(examen, 'concepto_medico'),
        fecha_vencimiento: getRecordString(examen, 'fecha_vencimiento')
      }
    });
  }

  for (const accidente of snapshot.sstAccidentes) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(accidente, 'fecha_evento')),
      tipo: 'SST_ACCIDENTE',
      titulo: `Evento SST: ${getRecordString(accidente, 'tipo_evento') ?? 'N/D'}`,
      descripcion: getRecordString(accidente, 'descripcion'),
      referencia: {
        entidad: 'sst_accidentes_incidentes',
        id: String(getRecordNumber(accidente, 'id') ?? '')
      },
      metadata: {
        vinculacion_id: getRecordObject(accidente, 'vinculacion')
          ? getRecordNumber(getRecordObject(accidente, 'vinculacion') ?? {}, 'id')
          : null,
        estado: getRecordString(accidente, 'estado'),
        severidad: getRecordString(accidente, 'severidad'),
        lesionado: getRecordBoolean(accidente, 'lesionado'),
        dias_incapacidad: getRecordNumber(accidente, 'dias_incapacidad')
      }
    });
  }

  for (const accion of snapshot.sstAccionesCorrectivas) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(accion, 'fecha_compromiso') ?? getRecordString(accion, 'created_at')),
      tipo: 'SST_ACCION_CORRECTIVA',
      titulo: 'Accion correctiva SST',
      descripcion: getRecordString(accion, 'descripcion'),
      referencia: {
        entidad: 'sst_accidentes_acciones',
        id: String(getRecordNumber(accion, 'id') ?? '')
      },
      metadata: {
        accidente_id: getRecordNumber(accion, 'accidente_id'),
        estado: getRecordString(accion, 'estado'),
        responsable: getRecordString(accion, 'responsable'),
        fecha_cierre: getRecordString(accion, 'fecha_cierre')
      }
    });
  }

  for (const inspeccion of snapshot.sstInspecciones) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(inspeccion, 'fecha_realizada') ?? getRecordString(inspeccion, 'fecha_programada')),
      tipo: 'SST_INSPECCION',
      titulo: `Inspeccion SST: ${getRecordString(inspeccion, 'nombre_inspeccion') ?? 'N/D'}`,
      descripcion: getRecordString(inspeccion, 'observacion'),
      referencia: {
        entidad: 'sst_inspecciones',
        id: String(getRecordNumber(inspeccion, 'id') ?? '')
      },
      metadata: {
        empresa_id: getRecordObject(inspeccion, 'empresa')
          ? getRecordNumber(getRecordObject(inspeccion, 'empresa') ?? {}, 'id')
          : null,
        contrato_id: getRecordObject(inspeccion, 'contrato')
          ? getRecordNumber(getRecordObject(inspeccion, 'contrato') ?? {}, 'id')
          : null,
        tipo_inspeccion: getRecordString(inspeccion, 'tipo_inspeccion'),
        estado: getRecordString(inspeccion, 'estado'),
        fecha_programada: getRecordString(inspeccion, 'fecha_programada')
      }
    });
  }

  for (const hallazgo of snapshot.sstHallazgosInspeccion) {
    const inspeccion = getRecordObject(hallazgo, 'inspeccion');
    pushItem({
      fecha: normalizeDateOnly(getRecordString(hallazgo, 'created_at')),
      tipo: 'SST_INSPECCION_HALLAZGO',
      titulo: `Hallazgo SST: ${getRecordString(hallazgo, 'tipo_hallazgo') ?? 'N/D'}`,
      descripcion: getRecordString(hallazgo, 'descripcion'),
      referencia: {
        entidad: 'sst_inspecciones_hallazgos',
        id: String(getRecordNumber(hallazgo, 'id') ?? '')
      },
      metadata: {
        inspeccion_id: getRecordNumber(inspeccion ?? {}, 'id'),
        nivel_riesgo: getRecordString(hallazgo, 'nivel_riesgo'),
        requiere_accion: getRecordBoolean(hallazgo, 'requiere_accion'),
        tipo_inspeccion: getRecordString(inspeccion ?? {}, 'tipo_inspeccion')
      }
    });
  }

  for (const accion of snapshot.sstAccionesInspeccion) {
    const hallazgo = getRecordObject(accion, 'hallazgo');
    const inspeccion = hallazgo ? getRecordObject(hallazgo, 'inspeccion') : null;
    pushItem({
      fecha: normalizeDateOnly(getRecordString(accion, 'fecha_compromiso') ?? getRecordString(accion, 'created_at')),
      tipo: 'SST_INSPECCION_ACCION',
      titulo: 'Accion de inspeccion SST',
      descripcion: getRecordString(accion, 'descripcion'),
      referencia: {
        entidad: 'sst_inspecciones_acciones',
        id: String(getRecordNumber(accion, 'id') ?? '')
      },
      metadata: {
        hallazgo_id: getRecordNumber(hallazgo ?? {}, 'id'),
        inspeccion_id: getRecordNumber(inspeccion ?? {}, 'id'),
        estado: getRecordString(accion, 'estado'),
        responsable: getRecordString(accion, 'responsable'),
        fecha_cierre: getRecordString(accion, 'fecha_cierre')
      }
    });
  }

  for (const riesgo of snapshot.sstMatrizRiesgos) {
    pushItem({
      fecha: normalizeDateOnly(getRecordString(riesgo, 'created_at')),
      tipo: 'SST_RIESGO_CREATE',
      titulo: `Riesgo SST: ${getRecordString(riesgo, 'proceso') ?? 'N/D'}`,
      descripcion: getRecordString(riesgo, 'descripcion_peligro'),
      referencia: {
        entidad: 'sst_matriz_riesgos',
        id: String(getRecordNumber(riesgo, 'id') ?? '')
      },
      metadata: {
        actividad: getRecordString(riesgo, 'actividad'),
        clasificacion_riesgo: getRecordString(riesgo, 'clasificacion_riesgo'),
        nivel_riesgo: getRecordNumber(riesgo, 'nivel_riesgo'),
        tipo_peligro: getRecordString(riesgo, 'tipo_peligro')
      }
    });
  }

  for (const audit of snapshot.auditoria) {
    if (audit.accion !== 'SST_RIESGO_UPDATE' || audit.entidad !== 'sst_matriz_riesgos') {
      continue;
    }

    const after = audit.after ?? {};
    pushItem({
      fecha: normalizeDateOnly(audit.fecha_evento ?? audit.created_at),
      tipo: 'SST_RIESGO_UPDATE',
      titulo: `Riesgo SST actualizado: ${getRecordString(after, 'proceso') ?? audit.accion}`,
      descripcion: getRecordString(after, 'descripcion_peligro') ?? audit.descripcion,
      referencia: {
        entidad: audit.entidad,
        id: audit.entidad_id
      },
      metadata: {
        actividad: getRecordString(after, 'actividad'),
        clasificacion_riesgo: getRecordString(after, 'clasificacion_riesgo'),
        nivel_riesgo: getRecordNumber(after, 'nivel_riesgo'),
        tipo_peligro: getRecordString(after, 'tipo_peligro')
      }
    });
  }

  for (const audit of snapshot.auditoria) {
    pushItem({
      fecha: normalizeDateOnly(audit.fecha_evento ?? audit.created_at),
      tipo: 'AUDITORIA',
      titulo: audit.accion,
      descripcion: audit.descripcion,
      referencia: {
        entidad: audit.entidad,
        id: audit.entidad_id
      },
      metadata: {
        modulo: audit.modulo,
        usuario: audit.usuario.nombre,
        empresa_id: audit.empresa_id,
        contrato_id: audit.contrato_id
      }
    });
  }

  items.sort((left, right) => {
    const leftTime = Date.parse(left.fecha);
    const rightTime = Date.parse(right.fecha);

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.titulo.localeCompare(right.titulo);
  });

  return items;
};

const formatCurrencyCop = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const buildExpedientePdfStoragePath = (personaId: number, timestamp: number): string => {
  return `expedientes/personas/persona_${personaId}/expediente-laboral-persona-${personaId}-${timestamp}.pdf`;
};

const uploadExpedientePdfToStorage = async (
  storagePath: string,
  fileBuffer: Buffer
): Promise<{ bucket: string; path: string }> => {
  const supabaseAdmin = getSupabaseAdminClient();
  const uploadResult = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
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
    bucket: env.SUPABASE_STORAGE_BUCKET,
    path: storagePath
  };
};

const buildExpedienteLaboralPdfBuffer = async (snapshot: ExpedienteSnapshot): Promise<Buffer> => {
  const timeline = buildTimelineItems(snapshot).slice(0, 12);
  const activeAlertas = snapshot.alertas.filter((item) => item.estado === 'ACTIVA').slice(0, 10);
  const totalNetoNomina = snapshot.nominaEmpleados.reduce(
    (accumulator, item) => accumulator + (getRecordNumber(item, 'neto_pagar') ?? 0),
    0
  );

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4'
    });
    const chunks: Buffer[] = [];

    const ensureSpace = (minimumY = 740): void => {
      if (doc.y > minimumY) {
        doc.addPage();
      }
    };

    doc.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text('EMPIRIA', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).text('EXPEDIENTE LABORAL 360', { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(10).font('Helvetica-Bold').text('Persona: ', { continued: true });
    doc.font('Helvetica').text(
      [
        snapshot.persona.primer_nombre,
        snapshot.persona.segundo_nombre,
        snapshot.persona.primer_apellido,
        snapshot.persona.segundo_apellido
      ]
        .filter(Boolean)
        .join(' ')
    );
    doc.font('Helvetica-Bold').text('Documento: ', { continued: true });
    doc.font('Helvetica').text(snapshot.persona.numero_documento);
    doc.font('Helvetica-Bold').text('Riesgo documental: ', { continued: true });
    doc.font('Helvetica').text(
      `${snapshot.indicadores.riesgo_documental.nivel} (${snapshot.indicadores.riesgo_documental.puntaje}/100)`
    );
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(11).text('Indicadores principales');
    doc.font('Helvetica').fontSize(9).text(
      [
        `Vinculaciones: ${snapshot.indicadores.vinculaciones_total}`,
        `Documentos: ${snapshot.indicadores.documentos_total}`,
        `Alertas activas: ${snapshot.indicadores.alertas_activas}`,
        `Checklist promedio: ${snapshot.indicadores.checklist_cumplimiento_promedio}%`,
        `Nomina empleados: ${snapshot.indicadores.nomina_empleados}`,
        `Neto nomina: ${formatCurrencyCop(totalNetoNomina)}`
      ].join(' | ')
    );
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Resumen documental');
    doc.font('Helvetica').fontSize(9).text(
      [
        `Vigentes: ${snapshot.indicadores.documentos_vigentes}`,
        `Vencidos: ${snapshot.indicadores.documentos_vencidos}`,
        `Por vencer 30 dias: ${snapshot.indicadores.documentos_por_vencer_30_dias}`,
        `Sin vencimiento: ${snapshot.indicadores.documentos_sin_vencimiento}`,
        `Reemplazados: ${snapshot.indicadores.documentos_reemplazados}`
      ].join(' | ')
    );
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(11).text('Alertas documentales');
    if (activeAlertas.length === 0) {
      doc.font('Helvetica').fontSize(9).text('No hay alertas documentales activas.');
    } else {
      for (const alerta of activeAlertas) {
        ensureSpace();
        doc.font('Helvetica-Bold').fontSize(9).text(
          `[${alerta.severidad}] ${alerta.titulo}`
        );
        doc.font('Helvetica').fontSize(8).text(
          `${alerta.tipo_alerta} | Fecha: ${normalizeDateOnly(alerta.fecha_alerta) ?? 'N/D'} | ${alerta.descripcion ?? ''}`
        );
        doc.moveDown(0.2);
      }
    }

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('Ultimos eventos del timeline');
    if (timeline.length === 0) {
      doc.font('Helvetica').fontSize(9).text('No hay eventos para mostrar.');
    } else {
      for (const item of timeline) {
        ensureSpace();
        doc.font('Helvetica-Bold').fontSize(9).text(`${item.fecha} | ${item.titulo}`);
        doc.font('Helvetica').fontSize(8).text(item.descripcion ?? '');
        doc.moveDown(0.2);
      }
    }

    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(8).text(
      `Generado por Empiria el ${new Date().toISOString()} para persona ${snapshot.persona.id}.`
    );

    doc.end();
  });
};

const recordExpedienteAudit = async (input: {
  accion: string;
  actorUserId: string;
  auditMeta?: AuditRequestMeta;
  datos_nuevos?: Record<string, unknown>;
  descripcion: string;
  personaId: number;
  vinculaciones: Vinculacion[];
}): Promise<void> => {
  try {
    await registerAuditEvent({
      accion: input.accion,
      usuario_id: input.actorUserId,
      empresa_id: input.vinculaciones[0]?.empresa_id ?? null,
      contrato_id: input.vinculaciones[0]?.contrato_id ?? null,
      modulo: 'EXPEDIENTES',
      entidad: 'personas',
      entidad_id: input.personaId,
      descripcion: input.descripcion,
      datos_nuevos: input.datos_nuevos ?? null,
      ip_address: input.auditMeta?.ip ?? null,
      user_agent: input.auditMeta?.user_agent ?? null
    });
  } catch (error) {
    console.error('Failed to register expediente audit event', {
      accion: input.accion,
      error,
      personaId: input.personaId
    });
  }
};

const loadExpedienteSnapshot = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<ExpedienteSnapshot> => {
  const base = await loadExpedienteBase(personaId, tenant);
  const sstInspeccionesScope = {
    contratoIds: Array.from(new Set(base.vinculaciones.map((item) => item.contrato_id).filter(Number.isFinite))),
    empresaIds: Array.from(new Set(base.vinculaciones.map((item) => item.empresa_id).filter(Number.isFinite)))
  };
  const [
    documentosPersona,
    documentosVinculacion,
    checklistPorVinculacion,
    nominaEmpleados,
    nominaNovedades,
    nominaMovimientos,
    nominaDesprendibles,
    nominaLiquidaciones,
    cesantias,
    prima,
    vacaciones,
    evaluaciones,
    alertas,
    sstAccidentes,
    sstAccionesCorrectivas,
    sstCapacitaciones,
    sstDotacionEpp,
    sstExamenesOcupacionales,
    sstInspecciones,
    sstHallazgosInspeccion,
    sstAccionesInspeccion,
    sstMatrizRiesgos
  ] = await Promise.all([
    loadDocumentosPersona(personaId),
    loadDocumentosVinculacion(base.vinculacionIds),
    Promise.all(
      base.vinculaciones.map(async (vinculacion) => ({
        vinculacion_id: vinculacion.id,
        checklist: await getVinculacionChecklist(String(vinculacion.id), tenant, { audit: false })
      }))
    ),
    loadNominaEmpleados(personaId, base.vinculacionIds, tenant),
    loadNominaNovedades(personaId, base.vinculacionIds, tenant),
    loadNominaMovimientos(personaId, base.vinculacionIds, tenant),
    loadNominaDesprendibles(personaId, base.vinculacionIds, tenant),
    loadNominaLiquidaciones(personaId, base.vinculacionIds, tenant),
    loadCesantiasExpediente(personaId, tenant),
    loadPrimaExpediente(personaId, tenant),
    loadVacacionesExpediente(personaId, tenant),
    loadEvaluacionesExpediente(personaId, tenant),
    loadExpedienteAlertasRaw(personaId, tenant),
    listSstAccidentesByPersonaId(String(personaId), tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstAccionesAccidenteByPersonaId(String(personaId), tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstCapacitacionesPersonaByPersonaId(String(personaId), tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstDotacionEppEntregasByPersonaId(String(personaId), tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstExamenesPersonaByPersonaId(String(personaId), tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstInspeccionesForExpediente(sstInspeccionesScope, tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstInspeccionHallazgosForExpediente(sstInspeccionesScope, tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstAccionesInspeccionForExpediente(sstInspeccionesScope, tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    ),
    listSstMatrizRiesgosForExpediente(sstInspeccionesScope, tenant).then((result) =>
      result.map((item): Record<string, unknown> => item as unknown as Record<string, unknown>)
    )
  ]);

  const documentoRepositoryEntityIds = [
    ...documentosPersona.map((item) => `persona:${item.id}`),
    ...documentosVinculacion.map((item) => `vinculacion:${item.id}`)
  ];

  const auditoria = await loadAuditoria({
    alertaIds: alertas.map((item) => item.id),
    personaId,
    vinculacionIds: base.vinculacionIds,
    documentoPersonaIds: documentosPersona.map((item) => item.id),
    documentoVinculacionIds: documentosVinculacion.map((item) => item.id),
    documentoRepositoryEntityIds,
    nominaCesantiasIds: cesantias.items.map((item) => item.id).filter(Number.isFinite),
    nominaEmpleadoIds: nominaEmpleados.map((item) => Number(item.id)).filter(Number.isFinite),
    nominaNovedadIds: nominaNovedades.map((item) => Number(item.id)).filter(Number.isFinite),
    nominaMovimientoIds: nominaMovimientos.map((item) => Number(item.id)).filter(Number.isFinite),
    nominaDesprendibleIds: nominaDesprendibles.map((item) => Number(item.id)).filter(Number.isFinite),
    nominaLiquidacionIds: nominaLiquidaciones.map((item) => Number(item.id)).filter(Number.isFinite),
    sstAccidenteIds: sstAccidentes.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstAccidenteAccionIds: sstAccionesCorrectivas.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstInspeccionIds: sstInspecciones.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstInspeccionHallazgoIds: sstHallazgosInspeccion.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstInspeccionAccionIds: sstAccionesInspeccion.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstRiesgoIds: sstMatrizRiesgos.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstDotacionEntregaIds: sstDotacionEpp.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    sstExamenPersonaIds: sstExamenesOcupacionales.map((item) => getRecordNumber(item, 'id')).filter(
      (value): value is number => value !== null
    ),
    tenant
  });

  const indicadores = buildIndicadores({
    vinculaciones: base.vinculaciones,
    alertas,
    documentosPersona,
    documentosVinculacion,
    evaluaciones: evaluaciones.items,
    planesMejora: evaluaciones.planes_mejora,
    checklistPorVinculacion,
    nominaEmpleados,
    nominaNovedades,
    nominaMovimientos,
    nominaDesprendibles,
    nominaLiquidaciones,
    cesantias: cesantias.indicadores,
    prima: prima.indicadores,
    vacaciones: vacaciones.indicadores,
    sstAccidentes,
    sstAccionesInspeccion,
    sstCapacitaciones,
    sstDotacionEpp,
    sstExamenesOcupacionales,
    sstHallazgosInspeccion,
    sstInspecciones,
    sstMatrizRiesgos,
    auditoria
  });

  return {
    persona: base.persona,
    vinculaciones: base.vinculaciones,
    documentosPersona,
    documentosVinculacion,
    evaluaciones,
    checklistPorVinculacion,
    nominaEmpleados,
    nominaNovedades,
    nominaMovimientos,
    nominaDesprendibles,
    nominaLiquidaciones,
    cesantias,
    prima,
    vacaciones,
    sstInspecciones,
    sstHallazgosInspeccion,
    sstAccionesInspeccion,
    sstMatrizRiesgos,
    sstAccidentes,
    sstAccionesCorrectivas,
    sstCapacitaciones,
    sstDotacionEpp,
    sstExamenesOcupacionales,
    alertas,
    auditoria,
    indicadores
  };
};

export const getExpedienteLaboralConsolidado = async (
  personaId: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<ExpedienteLaboralConsolidado> => {
  const snapshot = await loadExpedienteSnapshot(personaId, tenant);

  await recordExpedienteAudit({
    accion: 'CONSULTA_EXPEDIENTE_LABORAL_CONSOLIDADO',
    actorUserId,
    personaId,
    vinculaciones: snapshot.vinculaciones,
    descripcion: 'Consulta de expediente laboral consolidado',
    datos_nuevos: {
      persona_id: personaId,
      vinculaciones_total: snapshot.indicadores.vinculaciones_total,
      documentos_total: snapshot.indicadores.documentos_total,
      alertas_activas: snapshot.indicadores.alertas_activas,
      evaluaciones_total: snapshot.indicadores.evaluaciones_total,
      promedio_desempeno: snapshot.indicadores.promedio_desempeno,
      planes_mejora_total: snapshot.evaluaciones.planes_mejora.indicadores.planes_mejora_total,
      riesgo_documental: snapshot.indicadores.riesgo_documental.nivel
    },
    auditMeta
  });

  return {
    persona: snapshot.persona,
    vinculaciones: snapshot.vinculaciones,
    documentos_persona: snapshot.documentosPersona,
    documentos_vinculacion: snapshot.documentosVinculacion,
    expediente: {
      evaluaciones: snapshot.evaluaciones
    },
    evaluaciones: snapshot.evaluaciones,
    checklist_por_vinculacion: snapshot.checklistPorVinculacion,
    nomina: {
      empleados: snapshot.nominaEmpleados,
      novedades: snapshot.nominaNovedades,
      movimientos: snapshot.nominaMovimientos,
      desprendibles: snapshot.nominaDesprendibles,
      cesantias: snapshot.cesantias,
      prima: snapshot.prima,
      liquidaciones: snapshot.nominaLiquidaciones,
      vacaciones: snapshot.vacaciones
    },
    sst: {
      accidentes: snapshot.sstAccidentes,
      capacitaciones: snapshot.sstCapacitaciones,
      dotacion_epp: snapshot.sstDotacionEpp,
      examenes_ocupacionales: snapshot.sstExamenesOcupacionales,
      inspecciones: snapshot.sstInspecciones,
      matriz_riesgos: snapshot.sstMatrizRiesgos
    },
    auditoria: snapshot.auditoria,
    indicadores: snapshot.indicadores
  };
};

export const getExpedientePersonaAlertas = async (
  personaId: number,
  query: ExpedienteAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<ExpedientePersonaAlertasResult> => {
  const snapshot = await loadExpedienteSnapshot(personaId, tenant);
  const allItems = snapshot.alertas.filter((item) => {
    if (query.estado && item.estado !== query.estado) {
      return false;
    }

    if (query.severidad && item.severidad !== query.severidad) {
      return false;
    }

    if (query.tipo_alerta && item.tipo_alerta !== query.tipo_alerta) {
      return false;
    }

    return true;
  });
  const paginated = paginateItems(allItems, query.page, query.limit);
  const resumen = {
    total: allItems.length,
    activas: allItems.filter((item) => item.estado === 'ACTIVA').length,
    resueltas: allItems.filter((item) => item.estado === 'RESUELTA').length,
    criticas: allItems.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'CRITICA').length,
    altas: allItems.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'ALTA').length,
    medias: allItems.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'MEDIA').length,
    bajas: allItems.filter((item) => item.estado === 'ACTIVA' && item.severidad === 'BAJA').length
  };
  await recordExpedienteAudit({
    accion: 'CONSULTA_EXPEDIENTE_PERSONA_ALERTAS',
    actorUserId,
    personaId,
    vinculaciones: snapshot.vinculaciones,
    descripcion: 'Consulta de alertas documentales del expediente',
    datos_nuevos: {
      persona_id: personaId,
      total_alertas: resumen.total,
      alertas_activas: resumen.activas
    },
    auditMeta
  });

  return {
    persona_id: personaId,
    items: paginated.items,
    pagination: paginated.pagination,
    resumen,
    riesgo_documental: snapshot.indicadores.riesgo_documental
  };
};

export const getExpedientePersonaTimeline = async (
  personaId: number,
  query: ExpedienteTimelineQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<ExpedientePersonaTimelineResult> => {
  const snapshot = await loadExpedienteSnapshot(personaId, tenant);
  const timeline = buildTimelineItems(snapshot);

  await recordExpedienteAudit({
    accion: 'CONSULTA_EXPEDIENTE_PERSONA_TIMELINE',
    actorUserId,
    personaId,
    vinculaciones: snapshot.vinculaciones,
    descripcion: 'Consulta de timeline del expediente laboral',
    datos_nuevos: {
      persona_id: personaId,
      total_eventos: timeline.length,
      limit: query.limit
    },
    auditMeta
  });

  return {
    persona_id: personaId,
    total: timeline.length,
    items: timeline.slice(0, query.limit)
  };
};

export const generateExpedienteLaboralPdf = async (
  personaId: number,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<ExpedientePersonaPdfResult> => {
  const snapshot = await loadExpedienteSnapshot(personaId, tenant);
  const pdfBuffer = await buildExpedienteLaboralPdfBuffer(snapshot);
  const timestamp = Date.now();
  const storagePath = buildExpedientePdfStoragePath(personaId, timestamp);
  const uploadResult = await uploadExpedientePdfToStorage(storagePath, pdfBuffer);
  const expiresIn = 300;
  const signedUrl = await createDocumentSignedUrlForBucket(uploadResult.bucket, uploadResult.path, expiresIn);

  await recordExpedienteAudit({
    accion: 'GENERACION_EXPEDIENTE_LABORAL_PDF',
    actorUserId,
    personaId,
    vinculaciones: snapshot.vinculaciones,
    descripcion: 'Generacion de PDF del expediente laboral 360',
    datos_nuevos: {
      persona_id: personaId,
      storage_bucket: uploadResult.bucket,
      storage_path: uploadResult.path,
      tamano_bytes: pdfBuffer.length
    },
    auditMeta
  });

  return {
    signed_url: signedUrl,
    storage_bucket: uploadResult.bucket,
    storage_path: uploadResult.path,
    expires_in: expiresIn,
    mime_type: 'application/pdf',
    tamano_bytes: pdfBuffer.length
  };
};
