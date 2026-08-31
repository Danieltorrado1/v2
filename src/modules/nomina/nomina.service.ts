import PDFDocument from 'pdfkit';
import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { registerAuditEvent } from '../auditoria/auditoria.service';
import {
  assertNominaEmpleadoEditable,
  assertNominaFechaDentroDeVigencia,
  assertNominaRangoDentroDePeriodo,
  assertNominaRangoDentroDeVinculacion,
  invalidateNominaEmpleadoRevisionState,
  loadNominaEmpleadoOperativoContextByPeriodoVinculacionOrThrow
} from './nomina.operativa';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import {
  compareDateStrings,
  inclusiveDaysBetween,
  maxDateString,
  minDateString
} from './nomina.calculator';
import {
  buildNominaEffectMatrixFromConfig,
  countInclusiveDays,
  generateNominaNovedadObservation,
  nominaDateRangesOverlap,
  projectNominaDateRangeToPeriodo,
  projectNominaCanonicalEventsToPeriodo,
  resolveNominaEfectosPorDia,
  type NominaEfectoCobertura,
  type NominaEfectoLiquidacion,
  type NominaEfectoOperativo,
  type NominaEfectoRecargos,
  type NominaEfectoSalario,
  type NominaEfectoTransporte,
  type NominaEmploymentDateRange,
  type NominaGrupoExclusividad,
  type NominaModeloRegistro,
  type NominaNovedadEffectMatrix,
  type NominaPeriodoDateRange
} from './nomina.effects';
import {
  appendNominaMovimientoAlert,
  normalizeNominaMovimientoEstado,
  resolveNominaMovimientoFamilia,
  resolveNominaMovimientoValue,
  type NominaMovimientoAlerta,
  type NominaMovimientoEstado
} from './nomina.movimientos';
import { appendNominaCoberturaScope, assertNominaEmpleadoCoberturaScope, assertNominaPeriodoCoberturaScope } from './nomina.procesos';
import {
  buildNominaCanonicalProjectedRecordId,
  parseNominaNovedadRecordId,
  type NominaNovedadRegistroTipo
} from './nomina.novedad-records';
import {
  classifyNominaMultipleLinks,
  intersectsNominaPeriodo,
  resolveNominaMetodoLiquidacion,
  type NominaPopulationLink
} from './nomina.population';
import {
  normalizeNominaNovedadLabel,
  resolveNominaNovedadTypeSelection
} from './nomina.novedades';
import { buildCsv, buildSectionedCsv } from './nomina.exporter';
import {
  COBERTURA_PORCENTAJE_PENSION,
  COBERTURA_PORCENTAJE_SALUD,
  calculateCoberturaPayroll
} from './nomina.cobertura';
import {
  resolverTramosOperativos,
  type CambioOperativoDerivable,
  type ContextoOperativo
} from './nomina.tramos';
import {
  CreateNominaRecargoInput,
  CreateNominaMovimientoInput,
  CreateNominaNovedadInput,
  CreateNominaNovedadConTurnoInput,
  CreateNominaPeriodoInput,
  EstadoPeriodo,
  EstadoLiquidacion,
  ListNominaTiposNovedadQuery,
  ListNominaAsistenciaQuery,
  NominaExportTipo,
  NominaRecargoTipo,
  ListNominaMovimientosQuery,
  NominaNovedadCoberturaInput,
  NominaNovedadCoberturaTipo,
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
  ensurePersonaExists,
  ensureContratoExists,
  ensurePeriodoRelacionadoConFecha,
  ensureVinculacionExists
} from './nomina.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface PersonaIdentityRow extends QueryResultRow {
  id: string;
  numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
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
  cargo_operativo_id: string | null;
  cargo_operativo_nombre: string | null;
  categoria_auxilio_transporte: number | string | null;
  categoria_codigo: string | null;
  categoria_id: string | null;
  categoria_modalidad: string | null;
  categoria_nombre: string | null;
  categoria_otros_recargos: number | string | null;
  categoria_salario_base: number | string | null;
  categoria_vigente_desde: Date | string | null;
  categoria_vigente_hasta: Date | string | null;
  created_at: Date | string;
  detalle_calculo: Record<string, unknown> | null;
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
  municipio_nombre: string | null;
  contexto_institucion_nombre: string | null;
  contexto_modalidad_nombre: string | null;
  contexto_municipio_nombre: string | null;
  contexto_sede_id: string | null;
  contexto_sede_nombre: string | null;
  municipio_operativo_nombre: string | null;
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
  total_documental_cargados: number | string | null;
  total_documental_faltantes: number | string | null;
  total_documental_requeridos: number | string | null;
  total_novedades: number;
  gestor_usuario_id: string | null;
  gestor_nombre_completo: string | null;
  institucion_nombre: string | null;
  modalidad_codigo: string | null;
  modalidad_id: string | null;
  modalidad_nombre: string | null;
  sede_nombre: string | null;
  tipo_jornada_id: string | null;
  tipo_jornada_nombre: string | null;
  tipo_vinculacion_codigo: string | null;
  tipo_vinculacion_id: string | null;
  tipo_vinculacion_nombre: string | null;
  porcentaje_cumplimiento_documental: number | string | null;
  contrato_numero: string | null;
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
  tipo_vinculacion_codigo: string | null;
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
  afecta_cobertura: boolean | null;
  afecta_dias_laborados: boolean | null;
  afecta_recargos: boolean | null;
  categoria: string | null;
  bloquea_otras_novedades: boolean | null;
  codigo_operativo: string | null;
  created_at: Date | string;
  descripcion_operativa: string | null;
  efecto_auxilio_transporte: string | null;
  efecto_cobertura_config: string | null;
  efecto_liquidacion: string | null;
  efecto_operativo: string | null;
  efecto_pago: string | null;
  efecto_recargos_detallado: string | null;
  efecto_salario: string | null;
  es_adicion: boolean | null;
  es_accidente_laboral: boolean | null;
  es_deduccion: boolean | null;
  es_evento_operativo: boolean | null;
  es_incapacidad: boolean | null;
  es_permiso: boolean | null;
  es_suspension: boolean | null;
  grupo_exclusividad: string | null;
  id: string;
  modelo_registro: string | null;
  nombre: string | null;
  observacion_plantilla: string | null;
  permite_rango: boolean | null;
  proyecta_periodos: boolean | null;
  requiere_revision: boolean | null;
  requiere_solicitud_permiso: boolean | null;
  requiere_soporte: boolean | null;
  requiere_dias: boolean | null;
  requiere_fechas: boolean | null;
  requiere_horas: boolean | null;
  requiere_valor: boolean | null;
  soporte_documento_tipo: string | null;
}

interface NominaNovedadRealRow extends QueryResultRow {
  activo: boolean | null;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  cobertura_documento_externo: string | null;
  cobertura_id: string | null;
  cobertura_nombre_externo: string | null;
  cobertura_observacion_externa: string | null;
  cobertura_observacion_interna: string | null;
  cobertura_persona_cubre_id: string | null;
  cobertura_persona_numero_documento: string | null;
  cobertura_primer_apellido: string | null;
  cobertura_primer_nombre: string | null;
  cobertura_segundo_apellido: string | null;
  cobertura_segundo_nombre: string | null;
  cobertura_snapshot: unknown;
  cobertura_tipo_cobertura: string | null;
  cobertura_vinculacion_cubre_id: string | null;
  cubierta: boolean | null;
  created_at: Date | string;
  documento_persona_id: string | null;
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
  solicitud_permiso_documento_persona_id: string | null;
  soporte_documento_persona_id: string | null;
  tipo_novedad_activo: boolean | null;
  tipo_novedad_afecta_salario: boolean | null;
  tipo_novedad_afecta_transporte: boolean | null;
  tipo_novedad_afecta_cobertura: boolean | null;
  tipo_novedad_afecta_dias_laborados: boolean | null;
  tipo_novedad_afecta_recargos: boolean | null;
  tipo_novedad_bloquea_otras_novedades: boolean | null;
  tipo_novedad_categoria: string | null;
  tipo_novedad_codigo_operativo: string | null;
  tipo_novedad_codigo_snapshot: string | null;
  tipo_novedad_descripcion_operativa: string | null;
  tipo_novedad_efecto_auxilio_transporte: string | null;
  tipo_novedad_efecto_cobertura_config: string | null;
  tipo_novedad_efecto_liquidacion: string | null;
  tipo_novedad_efecto_operativo: string | null;
  tipo_novedad_efecto_pago: string | null;
  tipo_novedad_efecto_recargos_detallado: string | null;
  tipo_novedad_efecto_salario: string | null;
  tipo_novedad_es_adicion: boolean | null;
  tipo_novedad_es_accidente_laboral: boolean | null;
  tipo_novedad_es_deduccion: boolean | null;
  tipo_novedad_es_evento_operativo: boolean | null;
  tipo_novedad_es_incapacidad: boolean | null;
  tipo_novedad_es_permiso: boolean | null;
  tipo_novedad_es_suspension: boolean | null;
  tipo_novedad_grupo_exclusividad: string | null;
  tipo_novedad_id: string;
  tipo_novedad_modelo_registro: string | null;
  tipo_novedad_nombre: string | null;
  tipo_novedad_observacion_plantilla: string | null;
  tipo_novedad_permite_rango: boolean | null;
  tipo_novedad_proyecta_periodos: boolean | null;
  tipo_novedad_requiere_revision: boolean | null;
  tipo_novedad_requiere_solicitud_permiso: boolean | null;
  tipo_novedad_requiere_soporte: boolean | null;
  tipo_novedad_requiere_dias: boolean | null;
  tipo_novedad_requiere_fechas: boolean | null;
  tipo_novedad_requiere_horas: boolean | null;
  tipo_novedad_requiere_valor: boolean | null;
  tipo_novedad_soporte_documento_tipo: string | null;
  valor_manual: number | string | null;
  vinculacion_id: string;
}

interface NominaNovedadCanonicaRow extends QueryResultRow {
  activo: boolean | null;
  created_at: Date | string;
  documento_persona_id: string | null;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  observacion: string | null;
  origen: string | null;
  tipo_novedad_codigo_snapshot: string | null;
  tipo_novedad_id: string;
  updated_at: Date | string;
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
  alertas_validacion: unknown;
  aprobado_at: Date | string | null;
  aprobado_por: string | null;
  cantidad: number | string | null;
  contexto_institucion: string | null;
  contexto_modalidad: string | null;
  contexto_municipio: string | null;
  contexto_sede: string | null;
  created_at: Date | string;
  descripcion: string | null;
  documento_persona_id: string | null;
  es_deduccion: boolean | null;
  es_devengado: boolean | null;
  estado: string | null;
  fecha: Date | string | null;
  familia_movimiento: string | null;
  id: string;
  institucion_id: string | null;
  modalidad_id: string | null;
  motivo_ajuste_valor: string | null;
  motivo_estado: string | null;
  municipio_id: string | null;
  nomina_empleado_id: string;
  periodo_contrato_id: string;
  periodo_estado: string;
  periodo_id: string;
  periodo_nombre: string;
  persona_reemplazada_id: string | null;
  persona_reemplazada_numero_documento: string | null;
  persona_reemplazada_primer_apellido: string | null;
  persona_reemplazada_primer_nombre: string | null;
  persona_reemplazada_segundo_apellido: string | null;
  persona_reemplazada_segundo_nombre: string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  posible_duplicado: boolean | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  rechazado_at: Date | string | null;
  rechazado_por: string | null;
  revisado_at: Date | string | null;
  revisado_por: string | null;
  sede_id: string | null;
  tarifa_config_id: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  tipo_movimiento: string;
  updated_at: Date | string | null;
  updated_by: string | null;
  valor_calculado: number | string | null;
  valor_total: number | string | null;
  valor_unitario: number | string | null;
  vinculacion_reemplazada_id: string | null;
  vinculacion_id: string;
}

interface NominaMovimientoTarifaRow extends QueryResultRow {
  contrato_id: string;
  id: string;
  institucion_id: string | null;
  modalidad_id: string | null;
  municipio_id: string | null;
  sede_id: string | null;
  tipo_movimiento: string;
  valor_unitario: number | string;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

interface NominaMovimientoContextRow extends QueryResultRow {
  contexto_institucion: string | null;
  contexto_modalidad: string | null;
  contexto_municipio: string | null;
  contexto_sede: string | null;
  institucion_id: string | null;
  modalidad_id: string | null;
  municipio_id: string | null;
  sede_id: string | null;
}

interface NominaMovimientoEstadoActionInput {
  motivo_estado?: string | null;
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
    vigente_desde: string | null;
    vigente_hasta: string | null;
  } | null;
  created_at: string;
  detalle_calculo?: Record<string, unknown> | null;
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
  gestor: {
    id: string;
    nombre_completo: string;
  } | null;
  contexto_operativo: {
    institucion: string | null;
    modalidad_codigo: string | null;
    modalidad_descripcion: string | null;
    modalidad_id: string | null;
    municipio: string | null;
    sede: string | null;
  } | null;
  metodo_liquidacion: string | null;
  motivo_caso_especial: string | null;
  municipio: string | null;
  institucion: string | null;
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
  sede: {
    id: string | null;
    municipio: string | null;
    nombre_sede: string | null;
  } | null;
  modalidad: string | null;
  clasificacion: string | null;
  contrato_id: string;
  numero_contrato: string | null;
  total_novedades: number;
  total_adiciones: number;
  total_deducciones: number;
  estado_documental: {
    porcentaje_cumplimiento: number | null;
    total_cargados: number;
    total_faltantes: number;
    total_requeridos: number;
  } | null;
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

export interface NominaTipoNovedadCatalogItem {
  activo: boolean;
  afecta_salario: boolean;
  afecta_transporte: boolean;
  afecta_cobertura: boolean | null;
  afecta_dias_laborados: boolean | null;
  afecta_recargos: boolean | null;
  bloquea_otras_novedades: boolean;
  categoria: string | null;
  codigo_operativo: string | null;
  created_at: string;
  descripcion_operativa: string | null;
  efecto_auxilio_transporte: NominaEfectoTransporte;
  efecto_cobertura: NominaEfectoCobertura;
  efecto_liquidacion: NominaEfectoLiquidacion;
  efecto_operativo: NominaEfectoOperativo;
  efecto_pago: string | null;
  efecto_recargos: NominaEfectoRecargos;
  efecto_salario: NominaEfectoSalario;
  es_adicion: boolean;
  es_accidente_laboral: boolean;
  es_deduccion: boolean;
  es_evento_operativo: boolean;
  es_incapacidad: boolean;
  es_permiso: boolean;
  es_suspension: boolean;
  grupo_exclusividad: NominaGrupoExclusividad;
  id: string;
  modelo_registro: NominaModeloRegistro;
  nombre: string | null;
  observacion_plantilla: string | null;
  permite_rango: boolean;
  proyecta_periodos: boolean;
  requiere_revision: boolean;
  requiere_solicitud_permiso: boolean;
  requiere_soporte: boolean;
  requiere_dias: boolean;
  requiere_fechas: boolean;
  requiere_horas: boolean;
  requiere_valor: boolean;
  soporte_documento_tipo: string | null;
}

export interface NominaNovedad {
  activo: boolean;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  cubierta: boolean;
  created_at: string;
  documento_persona_id: string | null;
  dias: number | null;
  evento_canonico_id: string | null;
  fecha_fin: string | null;
  fecha_fin_evento_canonico: string | null;
  fecha_inicio: string | null;
  fecha_inicio_evento_canonico: string | null;
  horas: number | null;
  id: string;
  nomina_empleado_id: string;
  observacion: string | null;
  periodo_id: string;
  cobertura: {
    documento_externo: string | null;
    id: string;
    nombre_externo: string | null;
    observacion_externa: string | null;
    observacion_interna: string | null;
    persona_cubre: {
      id: string | null;
      nombre_completo: string | null;
      numero_documento: string | null;
      vinculacion_id: string | null;
    } | null;
    persona_cubre_id: string | null;
    snapshot_cobertura: unknown;
    tipo_cobertura: NominaNovedadCoberturaTipo;
    vinculacion_cubre_id: string | null;
  } | null;
  documentos: {
    SOLICITUD_PERMISO: {
      cargado: boolean;
      documento_persona_id: string | null;
      requerido: boolean;
      tipo: 'SOLICITUD_PERMISO';
    };
    SOPORTE: {
      cargado: boolean;
      documento_persona_id: string | null;
      requerido: boolean;
      tipo: 'SOPORTE';
    };
  };
  persona: {
    nombre_completo: string;
    numero_documento: string | null;
    primer_apellido: string | null;
    primer_nombre: string | null;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
  };
  requiere_cobertura: boolean;
  registro_tipo: NominaNovedadRegistroTipo;
  revisado: boolean;
  tipo_novedad: {
    activo: boolean;
    afecta_salario: boolean;
    afecta_transporte: boolean;
    afecta_cobertura: boolean | null;
    afecta_dias_laborados: boolean | null;
    afecta_recargos: boolean | null;
    bloquea_otras_novedades: boolean;
    categoria: string | null;
    codigo_operativo: string | null;
    codigo_operativo_registrado: string | null;
    descripcion_operativa: string | null;
    efecto_auxilio_transporte: NominaEfectoTransporte;
    efecto_cobertura: NominaEfectoCobertura;
    efecto_liquidacion: NominaEfectoLiquidacion;
    efecto_operativo: NominaEfectoOperativo;
    efecto_pago: string | null;
    efecto_recargos: NominaEfectoRecargos;
    efecto_salario: NominaEfectoSalario;
    es_adicion: boolean;
    es_accidente_laboral: boolean;
    es_deduccion: boolean;
    es_evento_operativo: boolean;
    es_incapacidad: boolean;
    es_permiso: boolean;
    es_suspension: boolean;
    grupo_exclusividad: NominaGrupoExclusividad;
    id: string;
    modelo_registro: NominaModeloRegistro;
    nombre: string | null;
    observacion_plantilla: string | null;
    permite_rango: boolean;
    proyecta_periodos: boolean;
    requiere_revision: boolean;
    requiere_solicitud_permiso: boolean;
    requiere_soporte: boolean;
    requiere_dias: boolean;
    requiere_fechas: boolean;
    requiere_horas: boolean;
    requiere_valor: boolean;
    soporte_documento_tipo: string | null;
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
  alertas_validacion: NominaMovimientoAlerta[];
  aprobado_at: string | null;
  aprobado_por: string | null;
  cantidad: number | null;
  contexto_operativo: {
    institucion: string | null;
    institucion_id: string | null;
    modalidad: string | null;
    modalidad_id: string | null;
    municipio: string | null;
    municipio_id: string | null;
    sede: string | null;
    sede_id: string | null;
  } | null;
  created_at: string;
  descripcion: string | null;
  documento_persona_id: string | null;
  es_deduccion: boolean;
  es_devengado: boolean;
  estado: NominaMovimientoEstado;
  fecha: string | null;
  familia_movimiento: string;
  id: string;
  motivo_ajuste_valor: string | null;
  motivo_estado: string | null;
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
  persona_reemplazada: {
    id: string;
    nombre_completo: string;
    numero_documento: string | null;
  } | null;
  posible_duplicado: boolean;
  rechazado_at: string | null;
  rechazado_por: string | null;
  revisado_at: string | null;
  revisado_por: string | null;
  tarifa_config_id: string | null;
  tipo_movimiento: string;
  updated_at: string | null;
  updated_by: string | null;
  valor_aplicado: number;
  valor_calculado: number;
  valor_total: number;
  valor_unitario: number | null;
  vinculacion: {
    id: string;
  };
  vinculacion_reemplazada_id: string | null;
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
  skipped_requires_review?: number;
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

const resolvePayrollPercentage = (
  value: string | number | null | undefined,
  fallback: number
): number => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const percentage = toNumberValue(value);
  return percentage > 1 ? percentage / 100 : percentage;
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

const parseNominaMovimientoAlerts = (value: unknown): NominaMovimientoAlerta[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const tipo = typeof record.tipo === 'string' ? record.tipo : null;
    const severidad = typeof record.severidad === 'string' ? record.severidad : null;
    const mensaje = typeof record.mensaje === 'string' ? record.mensaje : null;

    if (!tipo || !severidad || !mensaje) {
      return [];
    }

    return [
      {
        tipo: tipo as NominaMovimientoAlerta['tipo'],
        severidad: severidad as NominaMovimientoAlerta['severidad'],
        mensaje,
        codigo: typeof record.codigo === 'string' ? record.codigo : null,
        metadata:
          record.metadata && typeof record.metadata === 'object'
            ? (record.metadata as Record<string, unknown>)
            : null
      }
    ];
  });
};

const assertNominaMovimientoFechaVigente = (
  fecha: string,
  vinculacion: {
    fecha_fin: string | null;
    fecha_inicio: string;
  }
): void => {
  if (compareDateStrings(fecha, vinculacion.fecha_inicio) < 0) {
    throw new AppError(
      'Movement date is before vinculacion start date',
      409,
      'NOMINA_MOVIMIENTO_FECHA_FUERA_VIGENCIA'
    );
  }

  if (vinculacion.fecha_fin && compareDateStrings(fecha, vinculacion.fecha_fin) > 0) {
    throw new AppError(
      'Movement date is after vinculacion end date',
      409,
      'NOMINA_MOVIMIENTO_FECHA_FUERA_VIGENCIA'
    );
  }
};

const normalizeFullName = (...parts: Array<string | null | undefined>): string => {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ');
};

const normalizeUpperToken = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const resolveNominaEmpleadoClasificacion = (row: NominaEmpleadoRealRow): string | null => {
  const metodoLiquidacion = normalizeUpperToken(row.metodo_liquidacion);

  if (metodoLiquidacion) {
    return metodoLiquidacion;
  }

  const metodoPago = normalizeUpperToken(row.vinculacion_metodo_pago);

  if (metodoPago?.startsWith('OPS')) {
    return 'OPS';
  }

  const tipoVinculacionCodigo = normalizeUpperToken(row.tipo_vinculacion_codigo);

  if (tipoVinculacionCodigo === 'OPS') {
    return 'OPS';
  }

  const jornada = normalizeUpperToken(row.tipo_jornada_nombre);

  if (jornada === 'TIEMPO_COMPLETO') {
    return 'TC';
  }

  if (jornada === 'MEDIO_TIEMPO') {
    return 'MT';
  }

  return tipoVinculacionCodigo;
};

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

const toNominaEfectoSalario = (value: string | null | undefined): NominaEfectoSalario => {
  switch (value) {
    case 'DESCUENTA_PROPORCIONAL':
    case 'LIQUIDACION_ESPECIAL':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoTransporte = (
  value: string | null | undefined
): NominaEfectoTransporte => {
  switch (value) {
    case 'DESCUENTA_DIA':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoRecargos = (value: string | null | undefined): NominaEfectoRecargos => {
  switch (value) {
    case 'EXCLUIR_DIA':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoLiquidacion = (
  value: string | null | undefined
): NominaEfectoLiquidacion => {
  switch (value) {
    case 'PREPARAR_LIQUIDACION':
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoCobertura = (
  value: string | null | undefined
): NominaEfectoCobertura => {
  switch (value) {
    case 'PENDIENTE_CONFIGURACION':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaEfectoOperativo = (
  value: string | null | undefined
): NominaEfectoOperativo => {
  switch (value) {
    case 'PENDIENTE_NOMINA_3':
      return value;
    default:
      return 'SIN_EFECTO';
  }
};

const toNominaModeloRegistro = (
  value: string | null | undefined
): NominaModeloRegistro => {
  return value === 'EVENTO_CANONICO_RANGO' ? value : 'POR_PERIODO';
};

const toNominaGrupoExclusividad = (
  value: string | null | undefined
): NominaGrupoExclusividad => {
  return value === 'LICENCIA_MATERNIDAD_PATERNIDAD' ? value : 'NINGUNA';
};

const buildNominaEffectMatrixFromRow = buildNominaEffectMatrixFromConfig;

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

interface NominaOperativaRango {
  fecha_inicio: string;
  fecha_fin: string;
}

interface NominaNovedadDiariaConflictRow extends QueryResultRow {
  fecha: string;
  codigo: string | null;
  nombre: string | null;
}

interface NominaAsistenciaPresenteRow extends QueryResultRow {
  fecha: string;
}

const resolveNominaOperativaRango = (
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined
): NominaOperativaRango | null => {
  if (!fechaInicio) {
    return null;
  }

  return {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin ?? fechaInicio
  };
};

const listNominaNovedadesActivasPorRango = async (
  client: PoolClient,
  vinculacionId: string,
  rango: NominaOperativaRango
): Promise<NominaNovedadDiariaConflictRow[]> => {
  return (
    await client.query<NominaNovedadDiariaConflictRow>(
      `
        WITH novedades AS (
          SELECT
            n.fecha_inicio::date AS fecha_inicio,
            COALESCE(n.fecha_fin, n.fecha_inicio)::date AS fecha_fin,
            t.codigo_operativo AS codigo,
            t.nombre AS nombre
          FROM nomina_novedades n
          INNER JOIN nomina_tipos_novedad t ON t.id = n.tipo_novedad_id
          WHERE n.vinculacion_id = $1::bigint
            AND COALESCE(n.activo, TRUE) = TRUE
            AND n.fecha_inicio <= $3::date
            AND COALESCE(n.fecha_fin, n.fecha_inicio) >= $2::date

          UNION ALL

          SELECT
            c.fecha_inicio::date AS fecha_inicio,
            c.fecha_fin::date AS fecha_fin,
            c.tipo_novedad_codigo_operativo AS codigo,
            t.nombre AS nombre
          FROM nomina_novedades_canonicas c
          INNER JOIN nomina_tipos_novedad t ON t.id = c.tipo_novedad_id
          WHERE c.vinculacion_id = $1::bigint
            AND COALESCE(c.activo, TRUE) = TRUE
            AND c.fecha_inicio <= $3::date
            AND c.fecha_fin >= $2::date
        )
        SELECT DISTINCT
          gs::date::text AS fecha,
          novedades.codigo,
          novedades.nombre
        FROM novedades
        CROSS JOIN LATERAL generate_series(
          GREATEST(novedades.fecha_inicio, $2::date),
          LEAST(novedades.fecha_fin, $3::date),
          interval '1 day'
        ) AS gs
        ORDER BY fecha ASC
      `,
      [vinculacionId, rango.fecha_inicio, rango.fecha_fin]
    )
  ).rows;
};

const listNominaAsistenciaPresentePorRango = async (
  client: PoolClient,
  periodoId: string,
  vinculacionId: string,
  rango: NominaOperativaRango
): Promise<NominaAsistenciaPresenteRow[]> => {
  return (
    await client.query<NominaAsistenciaPresenteRow>(
      `
        SELECT fecha::text AS fecha
        FROM nomina_asistencia_diaria
        WHERE periodo_id = $1::bigint
          AND vinculacion_id = $2::bigint
          AND COALESCE(activo, TRUE) = TRUE
          AND estado_dia = 'PRESENTE'
          AND fecha >= $3::date
          AND fecha <= $4::date
        ORDER BY fecha ASC
      `,
      [periodoId, vinculacionId, rango.fecha_inicio, rango.fecha_fin]
    )
  ).rows;
};

const assertNominaAsistenciaSinNovedadActiva = async (
  client: PoolClient,
  vinculacionId: string,
  rango: NominaOperativaRango
): Promise<void> => {
  const conflicts = await listNominaNovedadesActivasPorRango(client, vinculacionId, rango);
  if (!conflicts.length) {
    return;
  }

  const first = conflicts[0]!;
  throw new AppError(
    `El dia ${first.fecha} tiene una novedad activa: ${first.codigo ?? first.nombre ?? 'NOVEDAD'}. Para marcar asistencia primero debes editar o anular la novedad.`,
    409,
    'NOMINA_ASISTENCIA_INCOMPATIBLE',
    { conflictos: conflicts }
  );
};

const replaceNominaAsistenciaPresentePorNovedad = async (
  client: PoolClient,
  periodoId: string,
  vinculacionId: string,
  rango: NominaOperativaRango,
  novedadLabel: string,
  confirmada: boolean
): Promise<string[]> => {
  const conflicts = await listNominaAsistenciaPresentePorRango(client, periodoId, vinculacionId, rango);
  if (!conflicts.length) {
    return [];
  }

  if (!confirmada) {
    throw new AppError(
      `Las fechas ${conflicts.map((item) => item.fecha).join(', ')} ya estan marcadas como asistencia. Confirma el reemplazo para registrar la novedad ${novedadLabel}.`,
      409,
      'NOMINA_NOVEDAD_REEMPLAZO_ASISTENCIA_REQUERIDO',
      { fechas: conflicts.map((item) => item.fecha), novedad: novedadLabel }
    );
  }

  await client.query(
    `
      UPDATE nomina_asistencia_diaria
      SET
        estado_dia = 'PENDIENTE',
        activo = TRUE,
        observacion = $5
      WHERE periodo_id = $1::bigint
        AND vinculacion_id = $2::bigint
        AND COALESCE(activo, TRUE) = TRUE
        AND estado_dia = 'PRESENTE'
        AND fecha >= $3::date
        AND fecha <= $4::date
    `,
    [
      periodoId,
      vinculacionId,
      rango.fecha_inicio,
      rango.fecha_fin,
      `Asistencia reemplazada por novedad ${novedadLabel}`
    ]
  );

  return conflicts.map((item) => item.fecha);
};
export const assertPeriodoAllowsRecalculate = (
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
      ne.detalle_calculo,
      COALESCE(ne.revisado, FALSE) AS revisado,
      ne.estado,
      COALESCE(ne.activo, TRUE) AS activo,
      ne.created_at,
      ne.motivo_caso_especial,
      v.persona_id::text AS persona_id,
      v.empresa_id::text AS vinculacion_empresa_id,
      v.contrato_id::text AS vinculacion_contrato_id,
      v.contrato_cargo_id::text AS cargo_id,
      v.cargo_operativo_id::text AS cargo_operativo_id,
      v.tipo_vinculacion_id::text AS tipo_vinculacion_id,
      v.tipo_jornada_id::text AS tipo_jornada_id,
      v.fecha_inicio AS fecha_inicio_vinculacion,
      v.fecha_fin AS fecha_fin_vinculacion,
      v.estado_vinculacion AS vinculacion_estado,
      v.metodo_pago AS vinculacion_metodo_pago,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      COALESCE(mu_op.nombre_municipio, mu.nombre_municipio) AS municipio_nombre,
      mu_op.nombre_municipio AS contexto_municipio_nombre,
      ins_op.nombre_institucion AS contexto_institucion_nombre,
      se_op.id::text AS contexto_sede_id,
      se_op.nombre_sede AS contexto_sede_nombre,
      mo_op.nombre_modalidad AS contexto_modalidad_nombre,
      contexto_operativo.municipio_operativo_nombre,
      contexto_operativo.institucion_nombre,
      contexto_operativo.sede_nombre,
      contexto_operativo.modalidad_id,
      contexto_operativo.modalidad_codigo,
      contexto_operativo.modalidad_nombre,
      gestor_actual.gestor_usuario_id,
      gestor_actual.gestor_nombre_completo,
      c.numero_contrato AS contrato_numero,
      cc.nombre_cargo AS cargo_nombre,
      co.nombre_cargo AS cargo_operativo_nombre,
      tv.codigo AS tipo_vinculacion_codigo,
      tv.nombre_vinculacion AS tipo_vinculacion_nombre,
      tj.nombre AS tipo_jornada_nombre,
      ncs.codigo_categoria AS categoria_codigo,
      ncs.nombre_categoria AS categoria_nombre,
      ncs.modalidad AS categoria_modalidad,
      ncs.salario_base AS categoria_salario_base,
      ncs.auxilio_transporte AS categoria_auxilio_transporte,
      ncs.otros_recargos AS categoria_otros_recargos,
      ncs.vigente_desde AS categoria_vigente_desde,
      ncs.vigente_hasta AS categoria_vigente_hasta,
      COALESCE(novedades_summary.total_novedades, 0)::int AS total_novedades,
      red.total_requeridos AS total_documental_requeridos,
      red.total_faltantes AS total_documental_faltantes,
      red.total_cargados AS total_documental_cargados,
      red.porcentaje_cumplimiento AS porcentaje_cumplimiento_documental
    FROM nomina_empleados ne
    INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
    INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN nomina_periodos np_context ON np_context.id = ne.periodo_id
    LEFT JOIN municipios mu ON mu.id = p.municipio_residencia_id
    LEFT JOIN LATERAL (
      SELECT ca1.focalizacion_final_id
      FROM cobertura_asignaciones ca1
      WHERE ca1.vinculacion_id = v.id AND ca1.activo = TRUE
        AND ca1.fecha_inicio <= np_context.fecha_fin
        AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= np_context.fecha_inicio)
      ORDER BY ca1.fecha_inicio DESC, ca1.id DESC LIMIT 1
    ) ca_op ON TRUE
    LEFT JOIN focalizacion_final ff_op ON ff_op.id = ca_op.focalizacion_final_id
    LEFT JOIN municipios mu_op ON mu_op.id = ff_op.municipio_id
    LEFT JOIN instituciones ins_op ON ins_op.id = ff_op.institucion_id
    LEFT JOIN sedes se_op ON se_op.id = ff_op.sede_id
    LEFT JOIN modalidades mo_op ON mo_op.id = ff_op.modalidad_id
    LEFT JOIN contratos c ON c.id = v.contrato_id
    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
    LEFT JOIN cargos_operativos co ON co.id = v.cargo_operativo_id
    LEFT JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
    LEFT JOIN tipos_jornada tj ON tj.id = v.tipo_jornada_id
    LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
    LEFT JOIN vw_resumen_expediente_documental red ON red.vinculacion_id = v.id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(ff.municipio_texto, muo.nombre_municipio) AS municipio_operativo_nombre,
        ca.institucion AS institucion_nombre,
        ca.sede AS sede_nombre,
        ff.modalidad_id::text AS modalidad_id,
        COALESCE(mo.codigo_base, mo.codigo_original) AS modalidad_codigo,
        mo.nombre_modalidad AS modalidad_nombre
      FROM cobertura_asignaciones ca
      INNER JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
      LEFT JOIN municipios muo ON muo.id = ff.municipio_id
      LEFT JOIN modalidades mo ON mo.id = ff.modalidad_id
      WHERE ca.vinculacion_id = v.id
        AND COALESCE(ca.activo, TRUE) = TRUE
        AND ca.fecha_inicio <= np.fecha_fin
        AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= np.fecha_inicio)
      ORDER BY ca.fecha_inicio DESC, ca.id DESC
      LIMIT 1
    ) contexto_operativo ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        scope.gestor_usuario_id,
        scope.gestor_nombre_completo
      FROM (
        SELECT
          gpa.usuario_id::text AS gestor_usuario_id,
          u.nombre_completo AS gestor_nombre_completo,
          gpa.vigencia_desde,
          gpa.id,
          0 AS prioridad
        FROM gestor_personal_asignaciones gpa
        INNER JOIN usuarios u ON u.id = gpa.usuario_id
        WHERE gpa.vinculacion_id = v.id
          AND gpa.contrato_id = v.contrato_id
          AND COALESCE(gpa.activo, TRUE) = TRUE
          AND gpa.vigencia_desde <= np.fecha_fin
          AND (gpa.vigencia_hasta IS NULL OR gpa.vigencia_hasta >= np.fecha_inicio)
        UNION ALL
        SELECT
          gma.usuario_id::text AS gestor_usuario_id,
          u.nombre_completo AS gestor_nombre_completo,
          gma.vigencia_desde,
          gma.id,
          1 AS prioridad
        FROM gestor_municipio_asignaciones gma
        INNER JOIN usuarios u ON u.id = gma.usuario_id
        WHERE gma.contrato_id = v.contrato_id
          AND COALESCE(gma.activo, TRUE) = TRUE
          AND COALESCE(gma.alcance_personal, 'PERSONAL_SELECCIONADO') = 'TODO_MUNICIPIO'
          AND gma.vigencia_desde <= np.fecha_fin
          AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= np.fecha_inicio)
          AND EXISTS (
            SELECT 1
            FROM cobertura_asignaciones cas_scope
            INNER JOIN focalizacion_final cff_scope ON cff_scope.id = cas_scope.focalizacion_final_id
            WHERE cas_scope.vinculacion_id = v.id
              AND COALESCE(cas_scope.activo, TRUE) = TRUE
              AND cas_scope.fecha_inicio <= np.fecha_fin
              AND (cas_scope.fecha_fin IS NULL OR cas_scope.fecha_fin >= np.fecha_inicio)
              AND cff_scope.municipio_id = gma.municipio_id
          )
      ) scope
      ORDER BY scope.prioridad ASC, scope.vigencia_desde DESC, scope.id DESC
      LIMIT 1
    ) gestor_actual ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total_novedades
      FROM nomina_novedades nn
      WHERE nn.nomina_empleado_id = ne.id
        AND nn.periodo_id = ne.periodo_id
    ) novedades_summary ON TRUE
  `;
};

const getNominaTiposNovedadSelect = (): string => {
  return `
    SELECT
      id::text AS id,
      codigo_operativo,
      nombre,
      categoria,
      descripcion_operativa,
      COALESCE(afecta_salario, FALSE) AS afecta_salario,
      COALESCE(afecta_transporte, FALSE) AS afecta_transporte,
      afecta_dias_laborados,
      afecta_recargos,
      afecta_cobertura,
      efecto_salario,
      efecto_auxilio_transporte,
      efecto_recargos_detallado,
      efecto_liquidacion,
      efecto_cobertura_config,
      efecto_operativo,
      efecto_pago,
      modelo_registro,
      COALESCE(proyecta_periodos, FALSE) AS proyecta_periodos,
      COALESCE(bloquea_otras_novedades, FALSE) AS bloquea_otras_novedades,
      grupo_exclusividad,
      observacion_plantilla,
      COALESCE(es_adicion, FALSE) AS es_adicion,
      COALESCE(es_deduccion, FALSE) AS es_deduccion,
      COALESCE(requiere_soporte, FALSE) AS requiere_soporte,
      COALESCE(permite_rango, FALSE) AS permite_rango,
      COALESCE(requiere_revision, FALSE) AS requiere_revision,
      COALESCE(requiere_solicitud_permiso, FALSE) AS requiere_solicitud_permiso,
      COALESCE(es_incapacidad, FALSE) AS es_incapacidad,
      COALESCE(es_accidente_laboral, FALSE) AS es_accidente_laboral,
      COALESCE(es_permiso, FALSE) AS es_permiso,
      COALESCE(es_suspension, FALSE) AS es_suspension,
      COALESCE(es_evento_operativo, FALSE) AS es_evento_operativo,
      soporte_documento_tipo,
      COALESCE(requiere_fechas, FALSE) AS requiere_fechas,
      COALESCE(requiere_dias, FALSE) AS requiere_dias,
      COALESCE(requiere_horas, FALSE) AS requiere_horas,
      COALESCE(requiere_valor, FALSE) AS requiere_valor,
      COALESCE(activo, TRUE) AS activo,
      created_at
    FROM nomina_tipos_novedad
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
      nn.documento_persona_id::text AS documento_persona_id,
      COALESCE(
        soporte_doc.documento_persona_id::text,
        nn.documento_persona_id::text
      ) AS soporte_documento_persona_id,
      permiso_doc.documento_persona_id::text AS solicitud_permiso_documento_persona_id,
      nn.observacion,
      COALESCE(nn.revisado, FALSE) AS revisado,
      COALESCE(nn.activo, TRUE) AS activo,
      nn.created_at,
      COALESCE(nn.requiere_cobertura, FALSE) AS requiere_cobertura,
      COALESCE(nn.cubierta, FALSE) AS cubierta,
      nnc.id::text AS cobertura_id,
      nnc.tipo_cobertura AS cobertura_tipo_cobertura,
      nnc.persona_cubre_id::text AS cobertura_persona_cubre_id,
      nnc.vinculacion_cubre_id::text AS cobertura_vinculacion_cubre_id,
      nnc.nombre_externo AS cobertura_nombre_externo,
      nnc.documento_externo AS cobertura_documento_externo,
      nnc.observacion_externa AS cobertura_observacion_externa,
      nnc.observacion_interna AS cobertura_observacion_interna,
      nnc.snapshot_cobertura AS cobertura_snapshot,
      nn.tipo_novedad_codigo_operativo AS tipo_novedad_codigo_snapshot,
      ntn.codigo_operativo AS tipo_novedad_codigo_operativo,
      ntn.nombre AS tipo_novedad_nombre,
      ntn.categoria AS tipo_novedad_categoria,
      ntn.descripcion_operativa AS tipo_novedad_descripcion_operativa,
      COALESCE(ntn.afecta_salario, FALSE) AS tipo_novedad_afecta_salario,
      COALESCE(ntn.afecta_transporte, FALSE) AS tipo_novedad_afecta_transporte,
      ntn.afecta_dias_laborados AS tipo_novedad_afecta_dias_laborados,
      ntn.afecta_recargos AS tipo_novedad_afecta_recargos,
      ntn.afecta_cobertura AS tipo_novedad_afecta_cobertura,
      ntn.efecto_salario AS tipo_novedad_efecto_salario,
      ntn.efecto_auxilio_transporte AS tipo_novedad_efecto_auxilio_transporte,
      ntn.efecto_recargos_detallado AS tipo_novedad_efecto_recargos_detallado,
      ntn.efecto_liquidacion AS tipo_novedad_efecto_liquidacion,
      ntn.efecto_cobertura_config AS tipo_novedad_efecto_cobertura_config,
      ntn.efecto_operativo AS tipo_novedad_efecto_operativo,
      ntn.efecto_pago AS tipo_novedad_efecto_pago,
      ntn.modelo_registro AS tipo_novedad_modelo_registro,
      COALESCE(ntn.proyecta_periodos, FALSE) AS tipo_novedad_proyecta_periodos,
      COALESCE(ntn.bloquea_otras_novedades, FALSE) AS tipo_novedad_bloquea_otras_novedades,
      ntn.grupo_exclusividad AS tipo_novedad_grupo_exclusividad,
      ntn.observacion_plantilla AS tipo_novedad_observacion_plantilla,
      COALESCE(ntn.es_adicion, FALSE) AS tipo_novedad_es_adicion,
      COALESCE(ntn.es_deduccion, FALSE) AS tipo_novedad_es_deduccion,
      COALESCE(ntn.requiere_soporte, FALSE) AS tipo_novedad_requiere_soporte,
      COALESCE(ntn.permite_rango, FALSE) AS tipo_novedad_permite_rango,
      COALESCE(ntn.requiere_revision, FALSE) AS tipo_novedad_requiere_revision,
      COALESCE(ntn.requiere_solicitud_permiso, FALSE) AS tipo_novedad_requiere_solicitud_permiso,
      COALESCE(ntn.es_incapacidad, FALSE) AS tipo_novedad_es_incapacidad,
      COALESCE(ntn.es_accidente_laboral, FALSE) AS tipo_novedad_es_accidente_laboral,
      COALESCE(ntn.es_permiso, FALSE) AS tipo_novedad_es_permiso,
      COALESCE(ntn.es_suspension, FALSE) AS tipo_novedad_es_suspension,
      COALESCE(ntn.es_evento_operativo, FALSE) AS tipo_novedad_es_evento_operativo,
      ntn.soporte_documento_tipo AS tipo_novedad_soporte_documento_tipo,
      COALESCE(ntn.requiere_fechas, FALSE) AS tipo_novedad_requiere_fechas,
      COALESCE(ntn.requiere_dias, FALSE) AS tipo_novedad_requiere_dias,
      COALESCE(ntn.requiere_horas, FALSE) AS tipo_novedad_requiere_horas,
      COALESCE(ntn.requiere_valor, FALSE) AS tipo_novedad_requiere_valor,
      COALESCE(ntn.activo, TRUE) AS tipo_novedad_activo,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      pc.numero_documento AS cobertura_persona_numero_documento,
      pc.primer_nombre AS cobertura_primer_nombre,
      pc.segundo_nombre AS cobertura_segundo_nombre,
      pc.primer_apellido AS cobertura_primer_apellido,
      pc.segundo_apellido AS cobertura_segundo_apellido
    FROM nomina_novedades nn
    INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
    INNER JOIN nomina_empleados ne ON ne.id = nn.nomina_empleado_id
    INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
    INNER JOIN contratos c ON c.id = np.contrato_id
    LEFT JOIN LATERAL (
      SELECT nd.documento_persona_id
      FROM nomina_novedad_documentos nd
      WHERE nd.nomina_novedad_id = nn.id
        AND nd.tipo_relacion = 'SOPORTE_NOVEDAD'
        AND COALESCE(nd.activo, TRUE) = TRUE
      ORDER BY nd.id DESC
      LIMIT 1
    ) soporte_doc ON TRUE
    LEFT JOIN LATERAL (
      SELECT nd.documento_persona_id
      FROM nomina_novedad_documentos nd
      WHERE nd.nomina_novedad_id = nn.id
        AND nd.tipo_relacion = 'SOLICITUD_PERMISO'
        AND COALESCE(nd.activo, TRUE) = TRUE
      ORDER BY nd.id DESC
      LIMIT 1
    ) permiso_doc ON TRUE
    LEFT JOIN nomina_novedad_coberturas nnc
      ON nnc.nomina_novedad_id = nn.id
     AND COALESCE(nnc.activo, TRUE) = TRUE
    LEFT JOIN personas pc ON pc.id = nnc.persona_cubre_id
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
      nm.familia_movimiento,
      nm.estado,
      nm.descripcion,
      nm.cantidad,
      nm.valor_unitario,
      nm.valor_calculado,
      nm.valor_total,
      COALESCE(nm.es_devengado, TRUE) AS es_devengado,
      COALESCE(nm.es_deduccion, FALSE) AS es_deduccion,
      COALESCE(nm.afecta_seguridad_social, TRUE) AS afecta_seguridad_social,
      COALESCE(nm.activo, TRUE) AS activo,
      nm.documento_persona_id::text AS documento_persona_id,
      nm.persona_reemplazada_id::text AS persona_reemplazada_id,
      nm.vinculacion_reemplazada_id::text AS vinculacion_reemplazada_id,
      nm.municipio_id::text AS municipio_id,
      nm.institucion_id::text AS institucion_id,
      nm.sede_id::text AS sede_id,
      nm.modalidad_id::text AS modalidad_id,
      nm.contexto_municipio,
      nm.contexto_institucion,
      nm.contexto_sede,
      nm.contexto_modalidad,
      nm.tarifa_config_id::text AS tarifa_config_id,
      nm.motivo_ajuste_valor,
      nm.motivo_estado,
      nm.alertas_validacion,
      COALESCE(nm.posible_duplicado, FALSE) AS posible_duplicado,
      nm.revisado_por::text AS revisado_por,
      nm.revisado_at,
      nm.aprobado_por::text AS aprobado_por,
      nm.aprobado_at,
      nm.rechazado_por::text AS rechazado_por,
      nm.rechazado_at,
      nm.updated_at,
      nm.updated_by::text AS updated_by,
      nm.created_at,
      np.contrato_id::text AS periodo_contrato_id,
      np.estado AS periodo_estado,
      np.nombre_periodo AS periodo_nombre,
      p.id::text AS persona_id,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      pr.numero_documento AS persona_reemplazada_numero_documento,
      pr.primer_nombre AS persona_reemplazada_primer_nombre,
      pr.segundo_nombre AS persona_reemplazada_segundo_nombre,
      pr.primer_apellido AS persona_reemplazada_primer_apellido,
      pr.segundo_apellido AS persona_reemplazada_segundo_apellido
    FROM nomina_movimientos nm
    INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
    INNER JOIN vinculaciones v ON v.id = nm.vinculacion_id
    INNER JOIN personas p ON p.id = v.persona_id
    LEFT JOIN personas pr ON pr.id = nm.persona_reemplazada_id
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
  const totalDocumentalRequeridos = toOptionalNumberValue(row.total_documental_requeridos);
  const totalDocumentalFaltantes = toOptionalNumberValue(row.total_documental_faltantes);
  const totalDocumentalCargados = toOptionalNumberValue(row.total_documental_cargados);
  const porcentajeCumplimientoDocumental = toOptionalNumberValue(row.porcentaje_cumplimiento_documental);
  const municipioOperativo =
    row.municipio_operativo_nombre ?? row.contexto_municipio_nombre ?? row.municipio_nombre;
  const institucionOperativa = row.institucion_nombre ?? row.contexto_institucion_nombre;
  const sedeOperativa = row.sede_nombre ?? row.contexto_sede_nombre;
  const modalidadDescripcion = row.modalidad_nombre ?? row.contexto_modalidad_nombre;
  const modalidadEtiqueta = row.modalidad_codigo ?? modalidadDescripcion;
  const contextoOperativo =
    municipioOperativo ||
    institucionOperativa ||
    sedeOperativa ||
    row.modalidad_id ||
    row.modalidad_codigo ||
    modalidadDescripcion
      ? {
          municipio: municipioOperativo,
          institucion: institucionOperativa,
          sede: sedeOperativa,
          modalidad_id: row.modalidad_id,
          modalidad_codigo: row.modalidad_codigo,
          modalidad_descripcion: modalidadDescripcion
        }
      : null;

  return {
    id: row.id,
    periodo_id: row.periodo_id,
    vinculacion_id: row.vinculacion_id,
    metodo_liquidacion: row.metodo_liquidacion,
    contrato_id: row.vinculacion_contrato_id,
    numero_contrato: row.contrato_numero,
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
    detalle_calculo: row.detalle_calculo ?? null,
    institucion: institucionOperativa,
    gestor: row.gestor_usuario_id
      ? {
          id: row.gestor_usuario_id,
          nombre_completo: row.gestor_nombre_completo ?? ''
        }
      : null,
    contexto_operativo: contextoOperativo,
    motivo_caso_especial: row.motivo_caso_especial,
    municipio: municipioOperativo,
    modalidad: modalidadEtiqueta,
    clasificacion: resolveNominaEmpleadoClasificacion(row),
    total_novedades: row.total_novedades,
    estado_documental:
      totalDocumentalRequeridos === null &&
      totalDocumentalFaltantes === null &&
      totalDocumentalCargados === null &&
      porcentajeCumplimientoDocumental === null
        ? null
        : {
            total_requeridos: totalDocumentalRequeridos ?? 0,
            total_faltantes: totalDocumentalFaltantes ?? 0,
            total_cargados: totalDocumentalCargados ?? 0,
            porcentaje_cumplimiento: porcentajeCumplimientoDocumental
          },
    sede:
      row.contexto_sede_id || sedeOperativa || municipioOperativo
        ? {
            id: row.contexto_sede_id,
            municipio: municipioOperativo,
            nombre_sede: sedeOperativa
          }
        : null,
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
      row.cargo_id || row.cargo_nombre || row.cargo_operativo_id || row.cargo_operativo_nombre
        ? {
            id: row.cargo_id ?? row.cargo_operativo_id,
            nombre_cargo: row.cargo_nombre ?? row.cargo_operativo_nombre
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
          otros_recargos: toNumberValue(row.categoria_otros_recargos),
          vigente_desde: toDateString(row.categoria_vigente_desde),
          vigente_hasta: toDateString(row.categoria_vigente_hasta)
        }
      : null
  };
};

const mapRealNovedad = (row: NominaNovedadRealRow): NominaNovedad => {
  const personaCubreNombre = normalizeFullName(
    row.cobertura_primer_nombre,
    row.cobertura_segundo_nombre,
    row.cobertura_primer_apellido,
    row.cobertura_segundo_apellido
  );

  return {
    id: row.id,
    periodo_id: row.periodo_id,
    nomina_empleado_id: row.nomina_empleado_id,
    vinculacion_id: row.vinculacion_id,
    documento_persona_id: row.soporte_documento_persona_id ?? row.documento_persona_id,
    fecha_inicio: toDateString(row.fecha_inicio),
    fecha_fin: toDateString(row.fecha_fin),
    fecha_inicio_evento_canonico: null,
    fecha_fin_evento_canonico: null,
    dias: toOptionalNumberValue(row.dias),
    horas: toOptionalNumberValue(row.horas),
    valor_manual: toOptionalNumberValue(row.valor_manual),
    categoria_anterior_id: row.categoria_anterior_id,
    categoria_nueva_id: row.categoria_nueva_id,
    observacion: row.observacion,
    evento_canonico_id: null,
    revisado: toBooleanValue(row.revisado),
    activo: toBooleanValue(row.activo),
    registro_tipo: 'ORDINARIA',
    created_at: toIsoString(row.created_at) ?? '',
    requiere_cobertura: toBooleanValue(row.requiere_cobertura),
    cubierta: toBooleanValue(row.cubierta),
    documentos: {
      SOPORTE: {
        cargado: Boolean(row.soporte_documento_persona_id ?? row.documento_persona_id),
        documento_persona_id: row.soporte_documento_persona_id ?? row.documento_persona_id,
        requerido: toBooleanValue(row.tipo_novedad_requiere_soporte),
        tipo: 'SOPORTE',
      },
      SOLICITUD_PERMISO: {
        cargado: Boolean(row.solicitud_permiso_documento_persona_id),
        documento_persona_id: row.solicitud_permiso_documento_persona_id,
        requerido: toBooleanValue(row.tipo_novedad_requiere_solicitud_permiso),
        tipo: 'SOLICITUD_PERMISO',
      },
    },
    cobertura: row.cobertura_id && row.cobertura_tipo_cobertura
      ? {
          id: row.cobertura_id,
          tipo_cobertura: row.cobertura_tipo_cobertura as NominaNovedadCoberturaTipo,
          persona_cubre_id: row.cobertura_persona_cubre_id,
          vinculacion_cubre_id: row.cobertura_vinculacion_cubre_id,
          nombre_externo: row.cobertura_nombre_externo,
          documento_externo: row.cobertura_documento_externo,
          observacion_externa: row.cobertura_observacion_externa,
          observacion_interna: row.cobertura_observacion_interna,
          snapshot_cobertura: row.cobertura_snapshot ?? null,
          persona_cubre:
            row.cobertura_persona_cubre_id ||
            row.cobertura_vinculacion_cubre_id ||
            personaCubreNombre ||
            row.cobertura_persona_numero_documento
              ? {
                  id: row.cobertura_persona_cubre_id,
                  vinculacion_id: row.cobertura_vinculacion_cubre_id,
                  numero_documento: row.cobertura_persona_numero_documento,
                  nombre_completo: personaCubreNombre || null
                }
              : null
        }
      : null,
    tipo_novedad: {
      id: row.tipo_novedad_id,
      codigo_operativo: row.tipo_novedad_codigo_operativo,
      codigo_operativo_registrado:
        row.tipo_novedad_codigo_snapshot ?? row.tipo_novedad_codigo_operativo,
      nombre: row.tipo_novedad_nombre,
      categoria: row.tipo_novedad_categoria,
      descripcion_operativa: row.tipo_novedad_descripcion_operativa,
      afecta_salario: toBooleanValue(row.tipo_novedad_afecta_salario),
      afecta_transporte: toBooleanValue(row.tipo_novedad_afecta_transporte),
      afecta_dias_laborados:
        row.tipo_novedad_afecta_dias_laborados === null ||
        row.tipo_novedad_afecta_dias_laborados === undefined
          ? null
          : toBooleanValue(row.tipo_novedad_afecta_dias_laborados),
      afecta_recargos:
        row.tipo_novedad_afecta_recargos === null ||
        row.tipo_novedad_afecta_recargos === undefined
          ? null
          : toBooleanValue(row.tipo_novedad_afecta_recargos),
      afecta_cobertura:
        row.tipo_novedad_afecta_cobertura === null ||
        row.tipo_novedad_afecta_cobertura === undefined
          ? null
          : toBooleanValue(row.tipo_novedad_afecta_cobertura),
      efecto_salario: toNominaEfectoSalario(row.tipo_novedad_efecto_salario),
      efecto_auxilio_transporte: toNominaEfectoTransporte(
        row.tipo_novedad_efecto_auxilio_transporte
      ),
      efecto_recargos: toNominaEfectoRecargos(row.tipo_novedad_efecto_recargos_detallado),
      efecto_liquidacion: toNominaEfectoLiquidacion(row.tipo_novedad_efecto_liquidacion),
      efecto_cobertura: toNominaEfectoCobertura(row.tipo_novedad_efecto_cobertura_config),
      efecto_operativo: toNominaEfectoOperativo(row.tipo_novedad_efecto_operativo),
      efecto_pago: row.tipo_novedad_efecto_pago,
      modelo_registro: toNominaModeloRegistro(row.tipo_novedad_modelo_registro),
      proyecta_periodos: toBooleanValue(row.tipo_novedad_proyecta_periodos),
      bloquea_otras_novedades: toBooleanValue(row.tipo_novedad_bloquea_otras_novedades),
      grupo_exclusividad: toNominaGrupoExclusividad(row.tipo_novedad_grupo_exclusividad),
      observacion_plantilla: row.tipo_novedad_observacion_plantilla,
      es_adicion: toBooleanValue(row.tipo_novedad_es_adicion),
      es_incapacidad: toBooleanValue(row.tipo_novedad_es_incapacidad),
      es_accidente_laboral: toBooleanValue(row.tipo_novedad_es_accidente_laboral),
      es_permiso: toBooleanValue(row.tipo_novedad_es_permiso),
      es_suspension: toBooleanValue(row.tipo_novedad_es_suspension),
      es_evento_operativo: toBooleanValue(row.tipo_novedad_es_evento_operativo),
      es_deduccion: toBooleanValue(row.tipo_novedad_es_deduccion),
      requiere_soporte: toBooleanValue(row.tipo_novedad_requiere_soporte),
      permite_rango: toBooleanValue(row.tipo_novedad_permite_rango),
      requiere_revision: toBooleanValue(row.tipo_novedad_requiere_revision),
      requiere_solicitud_permiso: toBooleanValue(row.tipo_novedad_requiere_solicitud_permiso),
      soporte_documento_tipo: row.tipo_novedad_soporte_documento_tipo,
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

const mapNominaTipoNovedad = (
  row: NominaTipoNovedadRow
): NominaTipoNovedadCatalogItem => {
  return {
    id: row.id,
    codigo_operativo: row.codigo_operativo,
    nombre: row.nombre,
    categoria: row.categoria,
    descripcion_operativa: row.descripcion_operativa,
    afecta_salario: toBooleanValue(row.afecta_salario),
    afecta_transporte: toBooleanValue(row.afecta_transporte),
    afecta_dias_laborados:
      row.afecta_dias_laborados === null || row.afecta_dias_laborados === undefined
        ? null
        : toBooleanValue(row.afecta_dias_laborados),
    afecta_recargos:
      row.afecta_recargos === null || row.afecta_recargos === undefined
        ? null
        : toBooleanValue(row.afecta_recargos),
    afecta_cobertura:
      row.afecta_cobertura === null || row.afecta_cobertura === undefined
        ? null
        : toBooleanValue(row.afecta_cobertura),
    efecto_salario: toNominaEfectoSalario(row.efecto_salario),
    efecto_auxilio_transporte: toNominaEfectoTransporte(row.efecto_auxilio_transporte),
    efecto_recargos: toNominaEfectoRecargos(row.efecto_recargos_detallado),
    efecto_liquidacion: toNominaEfectoLiquidacion(row.efecto_liquidacion),
    efecto_cobertura: toNominaEfectoCobertura(row.efecto_cobertura_config),
    efecto_operativo: toNominaEfectoOperativo(row.efecto_operativo),
    efecto_pago: row.efecto_pago,
    modelo_registro: toNominaModeloRegistro(row.modelo_registro),
    proyecta_periodos: toBooleanValue(row.proyecta_periodos),
    bloquea_otras_novedades: toBooleanValue(row.bloquea_otras_novedades),
    grupo_exclusividad: toNominaGrupoExclusividad(row.grupo_exclusividad),
    observacion_plantilla: row.observacion_plantilla,
    es_adicion: toBooleanValue(row.es_adicion),
    es_incapacidad: toBooleanValue(row.es_incapacidad),
    es_accidente_laboral: toBooleanValue(row.es_accidente_laboral),
    es_permiso: toBooleanValue(row.es_permiso),
    es_suspension: toBooleanValue(row.es_suspension),
    es_evento_operativo: toBooleanValue(row.es_evento_operativo),
    es_deduccion: toBooleanValue(row.es_deduccion),
    requiere_soporte: toBooleanValue(row.requiere_soporte),
    permite_rango: toBooleanValue(row.permite_rango),
    requiere_revision: toBooleanValue(row.requiere_revision),
    requiere_solicitud_permiso: toBooleanValue(row.requiere_solicitud_permiso),
    soporte_documento_tipo: row.soporte_documento_tipo,
    requiere_fechas: toBooleanValue(row.requiere_fechas),
    requiere_dias: toBooleanValue(row.requiere_dias),
    requiere_horas: toBooleanValue(row.requiere_horas),
    requiere_valor: toBooleanValue(row.requiere_valor),
    activo: toBooleanValue(row.activo),
    created_at: toIsoString(row.created_at) ?? ''
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
  const contextoOperativo =
    row.municipio_id ||
    row.institucion_id ||
    row.sede_id ||
    row.modalidad_id ||
    row.contexto_municipio ||
    row.contexto_institucion ||
    row.contexto_sede ||
    row.contexto_modalidad
      ? {
          municipio_id: row.municipio_id,
          municipio: row.contexto_municipio,
          institucion_id: row.institucion_id,
          institucion: row.contexto_institucion,
          sede_id: row.sede_id,
          sede: row.contexto_sede,
          modalidad_id: row.modalidad_id,
          modalidad: row.contexto_modalidad
        }
      : null;

  return {
    id: row.id,
    periodo_id: row.periodo_id,
    nomina_empleado_id: row.nomina_empleado_id,
    vinculacion_id: row.vinculacion_id,
    fecha: toDateString(row.fecha),
    familia_movimiento: row.familia_movimiento ?? resolveNominaMovimientoFamilia(row.tipo_movimiento),
    estado: normalizeNominaMovimientoEstado(row.estado),
    tipo_movimiento: row.tipo_movimiento,
    descripcion: row.descripcion,
    cantidad: toOptionalNumberValue(row.cantidad),
    valor_unitario: toOptionalNumberValue(row.valor_unitario),
    valor_calculado: toOptionalNumberValue(row.valor_calculado) ?? toNumberValue(row.valor_total),
    valor_aplicado: toNumberValue(row.valor_total),
    valor_total: toNumberValue(row.valor_total),
    es_devengado: toBooleanValue(row.es_devengado),
    es_deduccion: toBooleanValue(row.es_deduccion),
    afecta_seguridad_social: toBooleanValue(row.afecta_seguridad_social),
    activo: toBooleanValue(row.activo),
    documento_persona_id: row.documento_persona_id,
    motivo_ajuste_valor: row.motivo_ajuste_valor,
    motivo_estado: row.motivo_estado,
    posible_duplicado: toBooleanValue(row.posible_duplicado),
    alertas_validacion: parseNominaMovimientoAlerts(row.alertas_validacion),
    created_at: toIsoString(row.created_at) ?? '',
    updated_at: toIsoString(row.updated_at),
    updated_by: row.updated_by,
    revisado_por: row.revisado_por,
    revisado_at: toIsoString(row.revisado_at),
    aprobado_por: row.aprobado_por,
    aprobado_at: toIsoString(row.aprobado_at),
    rechazado_por: row.rechazado_por,
    rechazado_at: toIsoString(row.rechazado_at),
    tarifa_config_id: row.tarifa_config_id,
    contexto_operativo: contextoOperativo,
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
    persona_reemplazada:
      row.persona_reemplazada_id
        ? {
            id: row.persona_reemplazada_id,
            numero_documento: row.persona_reemplazada_numero_documento,
            nombre_completo: normalizeFullName(
              row.persona_reemplazada_primer_nombre,
              row.persona_reemplazada_segundo_nombre,
              row.persona_reemplazada_primer_apellido,
              row.persona_reemplazada_segundo_apellido
            )
          }
        : null,
    vinculacion: {
      id: row.vinculacion_id
    },
    vinculacion_reemplazada_id: row.vinculacion_reemplazada_id
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
  await assertNominaEmpleadoCoberturaScope(empleadoId, tenant, executor);
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
      ${getNominaTiposNovedadSelect()}
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

const loadNominaTiposNovedadCatalog = async (client?: PoolClient): Promise<NominaTipoNovedadRow[]> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaTipoNovedadRow>(
    `
      ${getNominaTiposNovedadSelect()}
      ORDER BY id ASC
    `
  );

  return result.rows;
};

const loadNominaNovedadesCanonicasForPeriodo = async (
  client: Pick<PoolClient, 'query'>,
  periodo: NominaPeriodoDateRange,
  vinculacionIds: string[],
  options?: { activeOnly?: boolean }
): Promise<NominaNovedadCanonicaRow[]> => {
  if (vinculacionIds.length === 0) {
    return [];
  }

  const activeOnly = options?.activeOnly ?? true;
  const activeCondition = activeOnly ? 'AND COALESCE(nnc.activo, TRUE) = TRUE' : '';

  const result = await client.query<NominaNovedadCanonicaRow>(
    `
      SELECT
        nnc.id::text AS id,
        nnc.vinculacion_id::text AS vinculacion_id,
        nnc.tipo_novedad_id::text AS tipo_novedad_id,
        nnc.tipo_novedad_codigo_operativo AS tipo_novedad_codigo_snapshot,
        nnc.documento_persona_id::text AS documento_persona_id,
        nnc.fecha_inicio,
        nnc.fecha_fin,
        nnc.observacion,
        nnc.origen,
        COALESCE(nnc.activo, TRUE) AS activo,
        nnc.created_at,
        nnc.updated_at
      FROM nomina_novedades_canonicas nnc
      WHERE nnc.vinculacion_id = ANY($1::bigint[])
        ${activeCondition}
        AND nnc.fecha_inicio <= $2::date
        AND nnc.fecha_fin >= $3::date
      ORDER BY nnc.fecha_inicio ASC, nnc.id ASC
    `,
    [vinculacionIds, periodo.end, periodo.start]
  );

  return result.rows;
};

const resolveNominaTipoNovedadOrThrow = async (
  input: {
    tipo_novedad_codigo?: string | null;
    tipo_novedad_id?: string | null;
    tipo_novedad_nombre?: string | null;
  },
  client?: PoolClient
): Promise<NominaTipoNovedadRow> => {
  const catalog = await loadNominaTiposNovedadCatalog(client);

  return resolveNominaNovedadTypeSelection(catalog, {
    id: input.tipo_novedad_id,
    codigo_operativo: input.tipo_novedad_codigo,
    nombre: input.tipo_novedad_nombre
  });
};

const hasInactiveNominaTiposNovedad = async (): Promise<boolean> => {
  const result = await dbQuery<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM nomina_tipos_novedad
        WHERE COALESCE(activo, TRUE) = FALSE
      ) AS exists
    `
  );

  return result.rows[0]?.exists === true;
};

const ensureDocumentoPersonaScope = async (
  documentoId: string,
  personaId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = client ?? dbPool;
  const result = await executor.query<{ id: string; persona_id: string }>(
    `
      SELECT
        id::text AS id,
        persona_id::text AS persona_id
      FROM documentos_persona
      WHERE id::text = $1
      LIMIT 1
    `,
    [documentoId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Documento persona not found', 400, 'DOCUMENTO_PERSONA_NOT_FOUND');
  }

  if (row.persona_id !== personaId) {
    throw new AppError(
      'documento_persona_id does not belong to persona_id',
      409,
      'NOMINA_NOVEDAD_PERSONA_DOCUMENTO_MISMATCH'
    );
  }
};

const loadNominaMovimientoContextFromCobertura = async (
  vinculacionId: string,
  fecha: string,
  client: PoolClient
): Promise<NominaMovimientoContextRow | null> => {
  const result = await client.query<NominaMovimientoContextRow>(
    `
      SELECT
        ff.municipio_id::text AS municipio_id,
        ff.institucion_id::text AS institucion_id,
        ff.sede_id::text AS sede_id,
        ff.modalidad_id::text AS modalidad_id,
        mu.nombre_municipio AS contexto_municipio,
        i.nombre_institucion AS contexto_institucion,
        s.nombre_sede AS contexto_sede,
        m.nombre_modalidad AS contexto_modalidad
      FROM cobertura_asignaciones ca
      INNER JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
      LEFT JOIN municipios mu ON mu.id = ff.municipio_id
      LEFT JOIN instituciones i ON i.id = ff.institucion_id
      LEFT JOIN sedes s ON s.id = ff.sede_id
      LEFT JOIN modalidades m ON m.id = ff.modalidad_id
      WHERE ca.vinculacion_id = $1::bigint
        AND COALESCE(ca.activo, TRUE) = TRUE
        AND ca.fecha_inicio <= $2::date
        AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= $2::date)
      ORDER BY ca.fecha_inicio DESC, ca.id DESC
      LIMIT 1
    `,
    [vinculacionId, fecha]
  );

  return result.rows[0] ?? null;
};

const resolveNominaMovimientoContext = async (
  input: {
    contexto_institucion?: string | null;
    contexto_modalidad?: string | null;
    contexto_municipio?: string | null;
    contexto_sede?: string | null;
    fecha: string;
    institucion_id?: string | null;
    modalidad_id?: string | null;
    municipio_id?: string | null;
    sede_id?: string | null;
    vinculacion_reemplazada_id?: string | null;
  },
  client: PoolClient
): Promise<NominaMovimientoContextRow> => {
  const replacementContext = input.vinculacion_reemplazada_id
    ? await loadNominaMovimientoContextFromCobertura(
        input.vinculacion_reemplazada_id,
        input.fecha,
        client
      )
    : null;

  return {
    municipio_id: input.municipio_id ?? replacementContext?.municipio_id ?? null,
    institucion_id: input.institucion_id ?? replacementContext?.institucion_id ?? null,
    sede_id: input.sede_id ?? replacementContext?.sede_id ?? null,
    modalidad_id: input.modalidad_id ?? replacementContext?.modalidad_id ?? null,
    contexto_municipio:
      input.contexto_municipio ?? replacementContext?.contexto_municipio ?? null,
    contexto_institucion:
      input.contexto_institucion ?? replacementContext?.contexto_institucion ?? null,
    contexto_sede: input.contexto_sede ?? replacementContext?.contexto_sede ?? null,
    contexto_modalidad:
      input.contexto_modalidad ?? replacementContext?.contexto_modalidad ?? null
  };
};

const resolveNominaMovimientoTarifa = async (
  input: {
    contrato_id: string;
    fecha: string;
    institucion_id?: string | null;
    modalidad_id?: string | null;
    municipio_id?: string | null;
    sede_id?: string | null;
    tipo_movimiento: string;
  },
  client: PoolClient
): Promise<NominaMovimientoTarifaRow | null> => {
  const result = await client.query<NominaMovimientoTarifaRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        tipo_movimiento,
        municipio_id::text AS municipio_id,
        institucion_id::text AS institucion_id,
        sede_id::text AS sede_id,
        modalidad_id::text AS modalidad_id,
        vigencia_desde,
        vigencia_hasta,
        valor_unitario
      FROM nomina_movimiento_tarifas
      WHERE contrato_id = $1::bigint
        AND tipo_movimiento = $2
        AND COALESCE(activo, TRUE) = TRUE
        AND vigencia_desde <= $3::date
        AND (vigencia_hasta IS NULL OR vigencia_hasta >= $3::date)
        AND (municipio_id IS NULL OR municipio_id = $4::bigint)
        AND (institucion_id IS NULL OR institucion_id = $5::bigint)
        AND (sede_id IS NULL OR sede_id = $6::bigint)
        AND (modalidad_id IS NULL OR modalidad_id = $7::bigint)
      ORDER BY
        (CASE WHEN sede_id IS NULL THEN 0 ELSE 8 END
          + CASE WHEN institucion_id IS NULL THEN 0 ELSE 4 END
          + CASE WHEN municipio_id IS NULL THEN 0 ELSE 2 END
          + CASE WHEN modalidad_id IS NULL THEN 0 ELSE 1 END) DESC,
        vigencia_desde DESC,
        id DESC
      LIMIT 1
    `,
    [
      input.contrato_id,
      input.tipo_movimiento,
      input.fecha,
      input.municipio_id,
      input.institucion_id,
      input.sede_id,
      input.modalidad_id
    ]
  );

  return result.rows[0] ?? null;
};

const buildNominaMovimientoAlerts = async (
  input: {
    fecha: string;
    movimientoId?: string | null;
    periodo_id: string;
    tipo_movimiento: string;
    vinculacion_id: string;
  },
  client: PoolClient
): Promise<{ alerts: NominaMovimientoAlerta[]; posible_duplicado: boolean }> => {
  let alerts: NominaMovimientoAlerta[] = [];
  const params: unknown[] = [
    input.vinculacion_id,
    input.fecha,
    input.periodo_id,
    input.tipo_movimiento
  ];
  let excludeSql = '';

  if (input.movimientoId) {
    params.push(input.movimientoId);
    excludeSql = `AND nm.id <> $${params.length}::bigint`;
  }

  const duplicateResult = await client.query<{ id: string }>(
    `
      SELECT nm.id::text AS id
      FROM nomina_movimientos nm
      WHERE nm.vinculacion_id = $1::bigint
        AND nm.fecha = $2::date
        AND nm.periodo_id = $3::bigint
        AND nm.tipo_movimiento = $4
        AND COALESCE(nm.activo, TRUE) = TRUE
        ${excludeSql}
      LIMIT 1
    `,
    params
  );

  const posibleDuplicado = Boolean(duplicateResult.rows[0]);

  if (posibleDuplicado) {
    alerts = appendNominaMovimientoAlert(alerts, {
      tipo: 'POSIBLE_DUPLICADO',
      severidad: 'WARNING',
      mensaje: 'Existe al menos un movimiento activo del mismo tipo para la misma vinculacion y fecha.',
      metadata: {
        fecha: input.fecha,
        periodo_id: input.periodo_id,
        tipo_movimiento: input.tipo_movimiento
      }
    });
  }

  const overlapRows = await client.query<{
    codigo_operativo: string | null;
    es_incapacidad: boolean | null;
    es_permiso: boolean | null;
    es_suspension: boolean | null;
    grupo_exclusividad: string | null;
    nombre: string | null;
    origen: string;
  }>(
    `
      SELECT
        ntn.codigo_operativo,
        ntn.nombre,
        ntn.es_incapacidad,
        ntn.es_permiso,
        ntn.es_suspension,
        ntn.grupo_exclusividad,
        'ORDINARIA' AS origen
      FROM nomina_novedades nn
      INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
      INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
      WHERE nn.vinculacion_id = $1::bigint
        AND COALESCE(nn.activo, TRUE) = TRUE
        AND COALESCE(nn.fecha_inicio, nn.fecha_fin, np.fecha_inicio) <= $2::date
        AND COALESCE(nn.fecha_fin, nn.fecha_inicio, np.fecha_fin) >= $2::date
      UNION ALL
      SELECT
        ntn.codigo_operativo,
        ntn.nombre,
        ntn.es_incapacidad,
        ntn.es_permiso,
        ntn.es_suspension,
        ntn.grupo_exclusividad,
        'CANONICA' AS origen
      FROM nomina_novedades_canonicas nnc
      INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nnc.tipo_novedad_id
      WHERE nnc.vinculacion_id = $1::bigint
        AND COALESCE(nnc.activo, TRUE) = TRUE
        AND nnc.fecha_inicio <= $2::date
        AND nnc.fecha_fin >= $2::date
    `,
    [input.vinculacion_id, input.fecha]
  );

  for (const row of overlapRows.rows) {
    const blocked =
      toBooleanValue(row.es_permiso) ||
      toBooleanValue(row.es_suspension) ||
      toBooleanValue(row.es_incapacidad) ||
      (row.grupo_exclusividad ?? 'NINGUNA') !== 'NINGUNA';

    if (!blocked) {
      continue;
    }

    alerts = appendNominaMovimientoAlert(alerts, {
      tipo: 'CONFLICTO_NOVEDAD',
      severidad: 'WARNING',
      codigo: row.codigo_operativo,
      mensaje: `La fecha ${input.fecha} ya tiene una novedad que requiere revision antes de aprobar la adicion.`,
      metadata: {
        nombre: row.nombre,
        origen: row.origen,
        codigo_operativo: row.codigo_operativo
      }
    });
  }

  return {
    alerts,
    posible_duplicado: posibleDuplicado
  };
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

  if (toBooleanValue(tipo.activo) === false) {
    throw new AppError('Payroll novelty type is inactive', 409, 'NOMINA_TIPO_NOVEDAD_INACTIVO');
  }
};

const resolveNominaNovedadDateRange = (input: {
  fecha_fin?: string | null;
  fecha_inicio?: string | null;
}): { fecha_fin: string; fecha_inicio: string } | null => {
  const fechaInicio = input.fecha_inicio ?? input.fecha_fin ?? null;
  const fechaFin = input.fecha_fin ?? input.fecha_inicio ?? null;

  if (!fechaInicio || !fechaFin) {
    return null;
  }

  if (fechaInicio > fechaFin) {
    throw new AppError('Payroll novelty range is invalid', 400, 'NOMINA_NOVEDAD_INVALID_RANGE');
  }

  return {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin
  };
};

const assertNominaNovedadRangeIntersectsPeriodo = (
  range: { fecha_fin: string; fecha_inicio: string } | null,
  periodo: Pick<NominaPeriodo, 'fecha_fin' | 'fecha_inicio'> | Pick<NominaPeriodoRealRow, 'fecha_fin' | 'fecha_inicio'>
): void => {
  if (!range) {
    return;
  }

  assertNominaRangoDentroDePeriodo(range.fecha_inicio, range.fecha_fin, periodo);
};

const assertNominaNovedadRangeIntersectsVinculacion = (
  range: { fecha_fin: string; fecha_inicio: string } | null,
  empleado:
    | Pick<NominaEmpleado, 'vinculacion'>
    | Pick<NominaEmpleadoRealRow, 'fecha_fin_vinculacion' | 'fecha_inicio_vinculacion'>
): void => {
  if (!range) {
    return;
  }

  const vinculacionInicio =
    'vinculacion' in empleado
      ? empleado.vinculacion.fecha_inicio
      : toDateString(empleado.fecha_inicio_vinculacion);
  const vinculacionFin =
    'vinculacion' in empleado
      ? empleado.vinculacion.fecha_fin ?? '9999-12-31'
      : toDateString(empleado.fecha_fin_vinculacion) ?? '9999-12-31';

  if (!vinculacionInicio) {
    throw new AppError(
      'Payroll employee has no vinculacion start date',
      500,
      'NOMINA_VINCULACION_FECHA_INICIO_INVALIDA'
    );
  }

  if (range.fecha_inicio < vinculacionInicio || range.fecha_fin > vinculacionFin) {
    throw new AppError(
      'Payroll novelty range does not fit within the labor validity of the vinculacion',
      409,
      'NOMINA_NOVEDAD_FUERA_VIGENCIA'
    );
  }
};

const loadPersonaIdentityByIdOrThrow = async (
  personaId: string,
  client: PoolClient
): Promise<PersonaIdentityRow> => {
  const result = await client.query<PersonaIdentityRow>(
    `
      SELECT
        id::text AS id,
        numero_documento,
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido
      FROM personas
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [personaId]
  );

  const persona = result.rows[0];

  if (!persona) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  return persona;
};

const resolveNominaNovedadCoberturaFlags = (
  cobertura: NominaNovedadCoberturaInput | null | undefined,
  fallback: {
    cubierta: boolean;
    requiere_cobertura: boolean;
  }
): {
  cubierta: boolean;
  requiere_cobertura: boolean;
} => {
  if (!cobertura) {
    return fallback;
  }

  if (cobertura.tipo_cobertura === 'SIN_REEMPLAZO') {
    return {
      requiere_cobertura: true,
      cubierta: false
    };
  }

  return {
    requiere_cobertura: true,
    cubierta: true
  };
};

const assertNominaLinkedCoverageScope = async (
  client: PoolClient,
  periodoId: string,
  cobertura: NominaNovedadCoberturaInput | null | undefined,
  tenant?: TenantAccessContext
): Promise<void> => {
  if (cobertura?.tipo_cobertura !== 'PERSONAL_VINCULADO') {
    return;
  }

  if (!cobertura.vinculacion_cubre_id) {
    throw new AppError(
      'Linked coverage requires vinculacion_cubre_id',
      400,
      'NOMINA_NOVEDAD_COBERTURA_INVALID'
    );
  }

  const empleado = await loadNominaEmpleadoOperativoContextByPeriodoVinculacionOrThrow(
    client,
    periodoId,
    cobertura.vinculacion_cubre_id
  );
  await assertNominaEmpleadoCoberturaScope(empleado.nomina_empleado_id, tenant, client);
};

const syncNominaNovedadCobertura = async (
  client: PoolClient,
  input: {
    cobertura: NominaNovedadCoberturaInput | null | undefined;
    empleado: NominaEmpleado;
    novedadId: string;
  }
): Promise<void> => {
  if (input.cobertura === undefined) {
    return;
  }

  await client.query(
    `
      UPDATE nomina_novedad_coberturas
      SET
        activo = FALSE,
        updated_at = NOW()
      WHERE nomina_novedad_id = $1::bigint
        AND COALESCE(activo, TRUE) = TRUE
    `,
    [input.novedadId]
  );

  if (input.cobertura === null) {
    return;
  }

  let personaCubreId: string | null = null;
  let vinculacionCubreId: string | null = null;
  let nombreExterno: string | null = null;
  let documentoExterno: string | null = null;
  let observacionExterna: string | null = null;
  let snapshotCobertura: Record<string, unknown> | null = null;

  if (input.cobertura.tipo_cobertura === 'PERSONAL_VINCULADO') {
    personaCubreId = input.cobertura.persona_cubre_id ?? null;
    vinculacionCubreId = input.cobertura.vinculacion_cubre_id ?? null;

    if (!personaCubreId || !vinculacionCubreId) {
      throw new AppError(
        'Linked coverage requires persona_cubre_id and vinculacion_cubre_id',
        400,
        'NOMINA_NOVEDAD_COBERTURA_VINCULADA_INVALIDA'
      );
    }

    const [personaCubre, vinculacionCubre] = await Promise.all([
      loadPersonaIdentityByIdOrThrow(personaCubreId, client),
      ensureVinculacionExists(vinculacionCubreId, client)
    ]);

    if (vinculacionCubre.persona_id !== personaCubreId) {
      throw new AppError(
        'Linked coverage persona does not match vinculacion_cubre_id',
        400,
        'NOMINA_NOVEDAD_COBERTURA_PERSONA_VINCULACION_MISMATCH'
      );
    }

    if (vinculacionCubre.contrato_id !== input.empleado.contrato_id) {
      throw new AppError(
        'Linked coverage must belong to the same contract as the payroll employee',
        409,
        'NOMINA_NOVEDAD_COBERTURA_CONTRATO_INVALIDO'
      );
    }

    if (
      personaCubreId === input.empleado.persona.id ||
      vinculacionCubreId === input.empleado.vinculacion_id
    ) {
      throw new AppError(
        'Coverage employee must be different from the employee with novelty',
        409,
        'NOMINA_NOVEDAD_COBERTURA_PERSONA_DUPLICADA'
      );
    }

    snapshotCobertura = {
      tipo_cobertura: input.cobertura.tipo_cobertura,
      persona_cubre: {
        id: personaCubre.id,
        numero_documento: personaCubre.numero_documento,
        nombre_completo: normalizeFullName(
          personaCubre.primer_nombre,
          personaCubre.segundo_nombre,
          personaCubre.primer_apellido,
          personaCubre.segundo_apellido
        )
      },
      vinculacion_cubre_id: vinculacionCubre.id
    };
  }

  if (input.cobertura.tipo_cobertura === 'PERSONA_EXTERNA') {
    nombreExterno = input.cobertura.nombre_externo ?? null;
    documentoExterno = input.cobertura.documento_externo ?? null;
    observacionExterna = input.cobertura.observacion_externa ?? null;
    snapshotCobertura = {
      tipo_cobertura: input.cobertura.tipo_cobertura,
      nombre_externo: nombreExterno,
      documento_externo: documentoExterno,
      observacion_externa: observacionExterna
    };
  }

  if (input.cobertura.tipo_cobertura === 'SIN_REEMPLAZO') {
    snapshotCobertura = {
      tipo_cobertura: input.cobertura.tipo_cobertura
    };
  }

  await client.query(
    `
      INSERT INTO nomina_novedad_coberturas (
        nomina_novedad_id,
        tipo_cobertura,
        persona_cubre_id,
        vinculacion_cubre_id,
        nombre_externo,
        documento_externo,
        observacion_externa,
        observacion_interna,
        snapshot_cobertura,
        activo
      )
      VALUES (
        $1::bigint,
        $2,
        $3::bigint,
        $4::bigint,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        TRUE
      )
    `,
    [
      input.novedadId,
      input.cobertura.tipo_cobertura,
      personaCubreId,
      vinculacionCubreId,
      nombreExterno,
      documentoExterno,
      observacionExterna,
      input.cobertura.observacion_interna ?? null,
      snapshotCobertura ? JSON.stringify(snapshotCobertura) : null
    ]
  );
};

const loadNominaNovedadCanonicaByIdOrThrow = async (
  novedadCanonicaId: string,
  client?: PoolClient
): Promise<NominaNovedadCanonicaRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaNovedadCanonicaRow>(
    `
      SELECT
        nnc.id::text AS id,
        nnc.vinculacion_id::text AS vinculacion_id,
        nnc.tipo_novedad_id::text AS tipo_novedad_id,
        nnc.tipo_novedad_codigo_operativo AS tipo_novedad_codigo_snapshot,
        nnc.documento_persona_id::text AS documento_persona_id,
        nnc.fecha_inicio,
        nnc.fecha_fin,
        nnc.observacion,
        nnc.origen,
        COALESCE(nnc.activo, TRUE) AS activo,
        nnc.created_at,
        nnc.updated_at
      FROM nomina_novedades_canonicas nnc
      WHERE nnc.id = $1::bigint
      LIMIT 1
    `,
    [novedadCanonicaId]
  );

  const novedad = result.rows[0];

  if (!novedad) {
    throw new AppError(
      'Canonical payroll novelty not found',
      404,
      'NOMINA_NOVEDAD_CANONICA_NOT_FOUND'
    );
  }

  return novedad;
};

const loadNominaEmpleadoRowsForPeriodo = async (
  periodoId: string,
  query: Pick<ListNominaNovedadesQuery, 'nomina_empleado_id' | 'persona_id' | 'vinculacion_id'>,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaEmpleadoRealRow[]> => {
  const executor = client ?? dbPool;
  const params: unknown[] = [periodoId];
  const conditions = ['ne.periodo_id = $1::bigint'];
  appendNominaCoberturaScope(conditions, params, tenant);

  if (query.nomina_empleado_id) {
    params.push(query.nomina_empleado_id);
    conditions.push(`ne.id = $${params.length}::bigint`);
  }

  if (query.vinculacion_id) {
    params.push(query.vinculacion_id);
    conditions.push(`ne.vinculacion_id = $${params.length}::bigint`);
  }

  if (query.persona_id) {
    params.push(query.persona_id);
    conditions.push(`v.persona_id = $${params.length}::bigint`);
  }

  appendTenantScopeConditions(conditions, params, tenant, 'v.contrato_id', 'v.empresa_id');

  const result = await executor.query<NominaEmpleadoRealRow>(
    `
      ${getNominaEmpleadosRealSelect()}
      ${buildSqlWhere(conditions)}
      ORDER BY ne.id ASC
    `,
    params
  );

  return result.rows;
};

const buildProjectedNominaNovedadFromCanonica = (input: {
  canonical: NominaNovedadCanonicaRow;
  empleado: NominaEmpleadoRealRow;
  periodo: NominaPeriodoDateRange;
  tipo: NominaTipoNovedadRow;
}): NominaNovedad | null => {
  const employment: NominaEmploymentDateRange = {
    start: toDateString(input.empleado.fecha_inicio_pago) ?? input.periodo.start,
    end: toDateString(input.empleado.fecha_fin_pago) ?? input.periodo.end
  };
  const canonicalStart = toDateString(input.canonical.fecha_inicio) ?? '';
  const canonicalEnd = toDateString(input.canonical.fecha_fin) ?? '';
  const projection = projectNominaDateRangeToPeriodo({
    employment,
    fecha_inicio: canonicalStart,
    fecha_fin: canonicalEnd,
    periodo: input.periodo
  });

  if (!projection) {
    return null;
  }

  const tipo = mapNominaTipoNovedad(input.tipo);
  const observacion =
    input.canonical.observacion ??
    generateNominaNovedadObservation({
      dias: projection.dias,
      fecha_inicio: canonicalStart,
      fecha_fin: canonicalEnd,
      matrix: buildNominaEffectMatrixFromRow(input.tipo)
    });

  return {
    id: buildNominaCanonicalProjectedRecordId(input.canonical.id, input.empleado.periodo_id),
    periodo_id: input.empleado.periodo_id,
    nomina_empleado_id: input.empleado.id,
    vinculacion_id: input.empleado.vinculacion_id,
    documento_persona_id: input.canonical.documento_persona_id,
    fecha_inicio: projection.fecha_inicio,
    fecha_fin: projection.fecha_fin,
    fecha_inicio_evento_canonico: canonicalStart,
    fecha_fin_evento_canonico: canonicalEnd,
    dias: projection.dias,
    horas: null,
    valor_manual: null,
    categoria_anterior_id: null,
    categoria_nueva_id: null,
    observacion,
    revisado: false,
    activo: toBooleanValue(input.canonical.activo),
    created_at: toIsoString(input.canonical.created_at) ?? '',
    requiere_cobertura: false,
    cubierta: false,
    cobertura: null,
    documentos: {
      SOPORTE: {
        cargado: Boolean(input.canonical.documento_persona_id),
        documento_persona_id: input.canonical.documento_persona_id,
        requerido: toBooleanValue(input.tipo.requiere_soporte),
        tipo: 'SOPORTE',
      },
      SOLICITUD_PERMISO: {
        cargado: false,
        documento_persona_id: null,
        requerido: toBooleanValue(input.tipo.requiere_solicitud_permiso),
        tipo: 'SOLICITUD_PERMISO',
      },
    },
    registro_tipo: 'CANONICA_PROYECTADA',
    evento_canonico_id: input.canonical.id,
    tipo_novedad: {
      ...tipo,
      codigo_operativo_registrado:
        input.canonical.tipo_novedad_codigo_snapshot ?? tipo.codigo_operativo
    },
    persona: {
      numero_documento: input.empleado.persona_numero_documento,
      primer_nombre: input.empleado.primer_nombre,
      segundo_nombre: input.empleado.segundo_nombre,
      primer_apellido: input.empleado.primer_apellido,
      segundo_apellido: input.empleado.segundo_apellido,
      nombre_completo: normalizeFullName(
        input.empleado.primer_nombre,
        input.empleado.segundo_nombre,
        input.empleado.primer_apellido,
        input.empleado.segundo_apellido
      )
    }
  };
};

const ensureNoBlockingCanonicalOverlap = async (
  client: PoolClient,
  input: {
    excludeCanonicalId?: string | null;
    excludeNovedadId?: string | null;
    fecha_fin: string;
    fecha_inicio: string;
    vinculacion_id: string;
  }
): Promise<void> => {
  const params: unknown[] = [input.vinculacion_id, input.fecha_inicio, input.fecha_fin];
  let excludeCanonicalSql = '';
  let excludeOrdinarySql = '';

  if (input.excludeCanonicalId) {
    params.push(input.excludeCanonicalId);
    excludeCanonicalSql = `AND nnc.id <> $${params.length}::bigint`;
  }

  if (input.excludeNovedadId) {
    params.push(input.excludeNovedadId);
    excludeOrdinarySql = `AND nn.id <> $${params.length}::bigint`;
  }

  const result = await client.query<{
    codigo_operativo: string | null;
    fecha_conflicto: string;
    id: string;
    nombre: string | null;
    origen: 'CANONICA' | 'ORDINARIA';
  }>(
    `
      SELECT *
      FROM (
        SELECT
          nn.id::text AS id,
          COALESCE(nn.tipo_novedad_codigo_operativo, ntn.codigo_operativo) AS codigo_operativo,
          ntn.nombre,
          GREATEST(COALESCE(nn.fecha_inicio, nn.fecha_fin, np.fecha_inicio), $2::date)::text AS fecha_conflicto,
          'ORDINARIA'::text AS origen
        FROM nomina_novedades nn
        INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
        INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
        WHERE nn.vinculacion_id = $1::bigint
          AND COALESCE(nn.activo, TRUE) = TRUE
          AND (nn.fecha_inicio IS NOT NULL OR nn.fecha_fin IS NOT NULL)
          AND COALESCE(nn.fecha_inicio, nn.fecha_fin, np.fecha_inicio) <= $3::date
          AND COALESCE(nn.fecha_fin, nn.fecha_inicio, np.fecha_fin) >= $2::date
          ${excludeOrdinarySql}

        UNION ALL

        SELECT
          nnc.id::text AS id,
          COALESCE(nnc.tipo_novedad_codigo_operativo, ntn.codigo_operativo) AS codigo_operativo,
          ntn.nombre,
          GREATEST(nnc.fecha_inicio, $2::date)::text AS fecha_conflicto,
          'CANONICA'::text AS origen
        FROM nomina_novedades_canonicas nnc
        INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nnc.tipo_novedad_id
        WHERE nnc.vinculacion_id = $1::bigint
          AND COALESCE(nnc.activo, TRUE) = TRUE
          AND nnc.fecha_inicio <= $3::date
          AND nnc.fecha_fin >= $2::date
          ${excludeCanonicalSql}
      ) conflicts
      ORDER BY fecha_conflicto ASC, origen ASC, id ASC
      LIMIT 1
    `,
    params
  );

  const overlap = result.rows[0];

  if (overlap) {
    throw new AppError(
      'Only one payroll novelty is allowed per person and date',
      409,
      'NOMINA_NOVEDAD_FECHA_OCUPADA',
      overlap
    );
  }
};

const ensureNoOrdinaryNovedadOverlapWithCanonical = async (
  client: PoolClient,
  input: {
    excludeNovedadId?: string | null;
    fecha_fin: string;
    fecha_inicio: string;
    vinculacion_id: string;
  }
): Promise<void> => {
  const params: unknown[] = [input.vinculacion_id, input.fecha_inicio, input.fecha_fin];
  let excludeSql = '';

  if (input.excludeNovedadId) {
    params.push(input.excludeNovedadId);
    excludeSql = `AND nn.id <> $${params.length}::bigint`;
  }

  const result = await client.query<{ id: string; nombre: string | null }>(
    `
      SELECT
        nn.id::text AS id,
        ntn.nombre
      FROM nomina_novedades nn
      INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
      INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
      WHERE nn.vinculacion_id = $1::bigint
        AND COALESCE(nn.activo, TRUE) = TRUE
        AND (nn.fecha_inicio IS NOT NULL OR nn.fecha_fin IS NOT NULL)
        AND COALESCE(nn.fecha_inicio, nn.fecha_fin, np.fecha_inicio) <= $3::date
        AND COALESCE(nn.fecha_fin, nn.fecha_inicio, np.fecha_fin) >= $2::date
        ${excludeSql}
      LIMIT 1
    `,
    params
  );

  const overlap = result.rows[0];

  if (overlap) {
    throw new AppError(
      'The selected canonical range overlaps an existing ordinary novelty',
      409,
      'NOMINA_NOVEDAD_CONFLICTO_CANONICA_ORDINARIA',
      overlap
    );
  }
};

const ensureNoExactCanonicalDuplicate = async (
  client: PoolClient,
  input: {
    excludeCanonicalId?: string | null;
    fecha_fin: string;
    fecha_inicio: string;
    tipo_novedad_id: string;
    vinculacion_id: string;
  }
): Promise<void> => {
  const params: unknown[] = [
    input.vinculacion_id,
    input.tipo_novedad_id,
    input.fecha_inicio,
    input.fecha_fin
  ];
  let excludeSql = '';

  if (input.excludeCanonicalId) {
    params.push(input.excludeCanonicalId);
    excludeSql = `AND nnc.id <> $${params.length}::bigint`;
  }

  const result = await client.query<{ id: string }>(
    `
      SELECT nnc.id::text AS id
      FROM nomina_novedades_canonicas nnc
      WHERE nnc.vinculacion_id = $1::bigint
        AND nnc.tipo_novedad_id = $2::bigint
        AND nnc.fecha_inicio = $3::date
        AND nnc.fecha_fin = $4::date
        AND COALESCE(nnc.activo, TRUE) = TRUE
        ${excludeSql}
      LIMIT 1
    `,
    params
  );

  if (result.rows[0]) {
    throw new AppError(
      'An identical canonical payroll novelty already exists',
      409,
      'NOMINA_NOVEDAD_CANONICA_DUPLICADA'
    );
  }
};

const ensureCanonicalRangeDoesNotAffectClosedPeriods = async (
  client: PoolClient,
  input: {
    excludePeriodoId?: string | null;
    fecha_fin: string;
    fecha_inicio: string;
    vinculacion_id: string;
  }
): Promise<void> => {
  const params: unknown[] = [input.vinculacion_id, input.fecha_inicio, input.fecha_fin];
  let excludeSql = '';

  if (input.excludePeriodoId) {
    params.push(input.excludePeriodoId);
    excludeSql = `AND np.id <> $${params.length}::bigint`;
  }

  const result = await client.query<{ estado: string; id: string; nombre_periodo: string }>(
    `
      SELECT
        np.id::text AS id,
        np.nombre_periodo,
        np.estado
      FROM nomina_periodos np
      INNER JOIN vinculaciones v ON v.id = $1::bigint
      WHERE np.contrato_id = v.contrato_id
        AND np.fecha_inicio <= $3::date
        AND np.fecha_fin >= $2::date
        AND UPPER(COALESCE(np.estado, '')) IN ('CERRADO', 'PAGADO')
        ${excludeSql}
      ORDER BY np.fecha_inicio ASC, np.id ASC
      LIMIT 1
    `,
    params
  );

  if (result.rows[0]) {
    throw new AppError(
      'The canonical novelty affects a closed payroll period and requires a correction workflow',
      409,
      'NOMINA_NOVEDAD_CANONICA_REQUIERE_CORRECCION',
      result.rows[0]
    );
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
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
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

const findExistingNominaPeriodoByContractAndRange = async (
  input: {
    contrato_id: string;
    fecha_fin: string;
    fecha_inicio: string;
    tipo_periodo: string;
  },
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaPeriodo | null> => {
  const executor = client ?? dbPool;
  const result = await executor.query<NominaPeriodoRealRow>(
    `
      ${getNominaPeriodosRealSelect()}
      WHERE np.contrato_id = $1::bigint
        AND np.fecha_inicio = $2::date
        AND np.fecha_fin = $3::date
        AND np.tipo_periodo = $4
      ORDER BY np.id ASC
      LIMIT 1
    `,
    [input.contrato_id, input.fecha_inicio, input.fecha_fin, input.tipo_periodo]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await assertTenantAccessForContrato(row.contrato_id, tenant, client);
  return mapRealPeriodo(row);
};

const buildImportCandidateReviewSet = (
  candidates: ImportCandidateRow[],
  periodoFechaInicio: string,
  periodoFechaFin: string
): Set<string> => {
  const byPersona = new Map<string, NominaPopulationLink[]>();

  for (const candidate of candidates) {
    const current = byPersona.get(candidate.persona_id) ?? [];
    current.push({
      vinculacion_id: candidate.vinculacion_id,
      persona_id: candidate.persona_id,
      fecha_inicio: toDateString(candidate.fecha_inicio) ?? periodoFechaInicio,
      fecha_fin: toDateString(candidate.fecha_fin),
      metodo_pago: candidate.metodo_pago,
      tipo_vinculacion_codigo: candidate.tipo_vinculacion_codigo
    });
    byPersona.set(candidate.persona_id, current);
  }

  const reviewSet = new Set<string>();

  for (const links of byPersona.values()) {
    const classification = classifyNominaMultipleLinks(
      links,
      periodoFechaInicio,
      periodoFechaFin
    );

    if (classification === 'SOLAPADA' || classification === 'REQUIERE_REVISION') {
      for (const link of links) {
        if (intersectsNominaPeriodo(link.fecha_inicio, link.fecha_fin, periodoFechaInicio, periodoFechaFin)) {
          reviewSet.add(link.vinculacion_id);
        }
      }
    }
  }

  return reviewSet;
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

    const existing = await findExistingNominaPeriodoByContractAndRange(
      {
        contrato_id: input.contrato_id,
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
        tipo_periodo: input.tipo_periodo
      },
      tenant,
      client
    );

    if (existing) {
      await client.query('COMMIT');
      return existing;
    }

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

  if (query.gestor_usuario_id) {
    params.push(query.gestor_usuario_id);
    conditions.push(`(
      EXISTS (
        SELECT 1
        FROM gestor_personal_asignaciones gpa_f
        INNER JOIN nomina_periodos np_f ON np_f.id = ne.periodo_id
        WHERE gpa_f.vinculacion_id = ne.vinculacion_id
          AND gpa_f.contrato_id = v.contrato_id
          AND gpa_f.usuario_id = $${params.length}::bigint
          AND COALESCE(gpa_f.activo, TRUE) = TRUE
          AND gpa_f.vigencia_desde <= np_f.fecha_fin
          AND (gpa_f.vigencia_hasta IS NULL OR gpa_f.vigencia_hasta >= np_f.fecha_inicio)
      )
      OR EXISTS (
        SELECT 1
        FROM gestor_municipio_asignaciones gma_f
        INNER JOIN nomina_periodos np_f ON np_f.id = ne.periodo_id
        INNER JOIN cobertura_asignaciones cas_f ON cas_f.vinculacion_id = ne.vinculacion_id
        INNER JOIN focalizacion_final cff_f ON cff_f.id = cas_f.focalizacion_final_id
        WHERE gma_f.contrato_id = v.contrato_id
          AND gma_f.usuario_id = $${params.length}::bigint
          AND COALESCE(gma_f.activo, TRUE) = TRUE
          AND COALESCE(gma_f.alcance_personal, 'PERSONAL_SELECCIONADO') = 'TODO_MUNICIPIO'
          AND gma_f.vigencia_desde <= np_f.fecha_fin
          AND (gma_f.vigencia_hasta IS NULL OR gma_f.vigencia_hasta >= np_f.fecha_inicio)
          AND cas_f.fecha_inicio <= np_f.fecha_fin
          AND (cas_f.fecha_fin IS NULL OR cas_f.fecha_fin >= np_f.fecha_inicio)
          AND cff_f.municipio_id = gma_f.municipio_id
      )
    )`);
  }

  if (query.sin_gestor === true) {
    conditions.push(`NOT (
      EXISTS (
        SELECT 1
        FROM gestor_personal_asignaciones gpa_f
        INNER JOIN nomina_periodos np_f ON np_f.id = ne.periodo_id
        WHERE gpa_f.vinculacion_id = ne.vinculacion_id
          AND gpa_f.contrato_id = v.contrato_id
          AND COALESCE(gpa_f.activo, TRUE) = TRUE
          AND gpa_f.vigencia_desde <= np_f.fecha_fin
          AND (gpa_f.vigencia_hasta IS NULL OR gpa_f.vigencia_hasta >= np_f.fecha_inicio)
      )
      OR EXISTS (
        SELECT 1
        FROM gestor_municipio_asignaciones gma_f
        INNER JOIN nomina_periodos np_f ON np_f.id = ne.periodo_id
        INNER JOIN cobertura_asignaciones cas_f ON cas_f.vinculacion_id = ne.vinculacion_id
        INNER JOIN focalizacion_final cff_f ON cff_f.id = cas_f.focalizacion_final_id
        WHERE gma_f.contrato_id = v.contrato_id
          AND COALESCE(gma_f.activo, TRUE) = TRUE
          AND COALESCE(gma_f.alcance_personal, 'PERSONAL_SELECCIONADO') = 'TODO_MUNICIPIO'
          AND gma_f.vigencia_desde <= np_f.fecha_fin
          AND (gma_f.vigencia_hasta IS NULL OR gma_f.vigencia_hasta >= np_f.fecha_inicio)
          AND cas_f.fecha_inicio <= np_f.fecha_fin
          AND (cas_f.fecha_fin IS NULL OR cas_f.fecha_fin >= np_f.fecha_inicio)
          AND cff_f.municipio_id = gma_f.municipio_id
      )
    )`);
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

export const listNominaEmpleadosOperativos = async (
  periodoId: string,
  query: ListNominaEmpleadosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<Record<string, unknown>>> => {
  const result = await listNominaEmpleados(periodoId, query, tenant);
  const items = result.items.map((employee) => {
    const {
      salario_base: _salarioBase, auxilio_transporte: _auxilioTransporte,
      otros_devengos: _otrosDevengos, devengado_basico: _devengadoBasico,
      devengado_transporte: _devengadoTransporte, devengado_otros: _devengadoOtros,
      total_adiciones: _totalAdiciones, total_deducciones: _totalDeducciones,
      salud: _salud, pension: _pension, neto_pagar: _netoPagar,
      detalle_calculo: _detalleCalculo, metodo_liquidacion: _metodoLiquidacion,
      categoria_salarial: category, ...operational
    } = employee;
    const { salario_base: _categorySalary, auxilio_transporte: _categoryTransport,
      otros_recargos: _categorySurcharges, ...operationalCategory } = category ?? {};
    return { ...operational, categoria_salarial: category ? operationalCategory : null };
  });
  return { ...result, items };
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

    const current = mapRealEmpleado(await loadNominaEmpleadoByIdOrThrow(empleadoId, tenant, client));
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

    const updated = mapRealEmpleado(await loadNominaEmpleadoByIdOrThrow(empleadoId, tenant, client));

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
    await assertNominaPeriodoCoberturaScope(periodoId, tenant, client);

    assertPeriodoAllowsOpenMutations(periodo.estado, 'importing payroll employees');

    const candidatesResult = await client.query<ImportCandidateRow>(
      `
        SELECT
          v.id::text AS vinculacion_id,
          v.persona_id::text AS persona_id,
          v.fecha_inicio,
          v.fecha_fin,
          v.metodo_pago,
          tv.codigo AS tipo_vinculacion_codigo,
          v.contrato_cargo_id::text AS cargo_id,
          NULL::text AS categoria_id,
          NULL::numeric AS categoria_salario_base,
          NULL::numeric AS categoria_auxilio_transporte
        FROM vinculaciones v
        LEFT JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
        WHERE v.contrato_id = $1::bigint
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
    let skippedRequiresReview = 0;
    const periodoFechaInicio = toDateString(periodo.fecha_inicio) ?? '';
    const periodoFechaFin = toDateString(periodo.fecha_fin) ?? '';
    const diasPeriodo = inclusiveDaysBetween(periodoFechaInicio, periodoFechaFin);
    const reviewVinculacionIds = buildImportCandidateReviewSet(
      candidatesResult.rows,
      periodoFechaInicio,
      periodoFechaFin
    );

    for (const candidate of candidatesResult.rows) {
      if (existingVinculacionIds.has(candidate.vinculacion_id)) {
        skippedDuplicates += 1;
        continue;
      }

      if (reviewVinculacionIds.has(candidate.vinculacion_id)) {
        skippedRequiresReview += 1;
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

      const metodoLiquidacion = resolveNominaMetodoLiquidacion({
        metodo_pago: candidate.metodo_pago
      });

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
          metodoLiquidacion,
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
          skipped_duplicates: skippedDuplicates,
          skipped_requires_review: skippedRequiresReview
        }
      },
      auditMeta
    );

    await client.query('COMMIT');

    return {
      imported,
      skipped_duplicates: skippedDuplicates,
      skipped_requires_review: skippedRequiresReview,
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
    await assertNominaPeriodoCoberturaScope(periodoId, tenant, client);
    const recalculateMode = assertPeriodoAllowsRecalculate(
      periodo.estado,
      options?.force === true,
      tenant
    );

    const empleadosResult = {
      rows: await loadNominaEmpleadoRowsForPeriodo(periodoId, {}, tenant, client)
    };

    const novedadesResult = await client.query<NominaNovedadRealRow>(
      `
        ${getNominaNovedadesRealSelect()}
        WHERE nn.periodo_id = $1::bigint
          AND COALESCE(nn.activo, TRUE) = TRUE
        ORDER BY nn.id ASC
      `,
      [periodoId]
    );

    const periodoRange: NominaPeriodoDateRange = {
      start: toDateString(periodo.fecha_inicio) ?? '',
      end: toDateString(periodo.fecha_fin) ?? ''
    };

    const tiposNovedadCatalog = await loadNominaTiposNovedadCatalog(client);
    const tiposNovedadById = new Map(
      tiposNovedadCatalog.map((item) => [item.id, item] as const)
    );
    const canonicalRows = await loadNominaNovedadesCanonicasForPeriodo(
      client,
      periodoRange,
      empleadosResult.rows.map((item) => item.vinculacion_id)
    );
    const canonicalByVinculacion = new Map<string, NominaNovedadCanonicaRow[]>();

    for (const canonicalRow of canonicalRows) {
      const currentItems = canonicalByVinculacion.get(canonicalRow.vinculacion_id) ?? [];
      currentItems.push(canonicalRow);
      canonicalByVinculacion.set(canonicalRow.vinculacion_id, currentItems);
    }

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
              AND COALESCE(estado, 'APROBADO') = 'APROBADO'
              AND COALESCE(es_devengado, TRUE) = TRUE
              AND tipo_movimiento <> 'TURNO_INTERNO'
          ), 0) AS movimientos_devengados,
          COALESCE(SUM(valor_total) FILTER (
            WHERE COALESCE(activo, TRUE) = TRUE
              AND COALESCE(estado, 'APROBADO') = 'APROBADO'
              AND COALESCE(es_deduccion, FALSE) = TRUE
          ), 0) AS movimientos_deducciones,
          COALESCE(SUM(valor_total) FILTER (
            WHERE COALESCE(activo, TRUE) = TRUE
              AND COALESCE(estado, 'APROBADO') = 'APROBADO'
              AND COALESCE(es_devengado, TRUE) = TRUE
              AND COALESCE(afecta_seguridad_social, TRUE) = TRUE
              AND tipo_movimiento <> 'TURNO_INTERNO'
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
    const contextosBaseResult = await client.query<{
      contexto: Record<string, unknown> | null;
      nomina_empleado_id: string;
    }>(
      `
        SELECT
          nomina_empleado_id::text AS nomina_empleado_id,
          contexto
        FROM nomina_contextos_operativos_base
        WHERE periodo_id = $1::bigint
      `,
      [periodoId]
    );
    const cambiosCoberturaResult = await client.query<{
      activo: boolean | null;
      contexto_anterior: Record<string, unknown> | null;
      contexto_nuevo: Record<string, unknown> | null;
      estado: string | null;
      fecha_fin_efectiva: string | null;
      fecha_inicio_efectiva: string;
      id: string;
      nomina_empleado_id: string;
    }>(
      `
        SELECT
          id::text AS id,
          nomina_empleado_id::text AS nomina_empleado_id,
          fecha::text AS fecha_inicio_efectiva,
          fecha_fin_efectiva::text AS fecha_fin_efectiva,
          contexto_anterior,
          contexto_nuevo,
          estado,
          activo
        FROM nomina_movimientos
        WHERE periodo_id = $1::bigint
          AND familia_movimiento = 'CAMBIO_OPERATIVO'
          AND COALESCE(activo, TRUE) = TRUE
          AND COALESCE(estado, 'PENDIENTE') <> 'RECHAZADO'
        ORDER BY nomina_empleado_id ASC, fecha ASC, id ASC
      `,
      [periodoId]
    );
    const turnosInternosCoberturaResult = await client.query<{
      contexto_operativo: Record<string, unknown> | null;
      fecha_fin: string;
      fecha_inicio: string;
      id: string;
      movimiento_id: string | null;
      nomina_novedad_id: string;
      nomina_empleado_id: string;
      titular_nombre: string | null;
      titular_documento: string | null;
      titular_categoria_id: string | null;
      titular_categoria_codigo: string | null;
      titular_categoria_nombre: string | null;
      titular_categoria_salario_base: number | string | null;
      titular_categoria_auxilio_transporte: number | string | null;
      titular_categoria_otros_recargos: number | string | null;
      titular_categoria_vigente_desde: string | null;
      titular_categoria_vigente_hasta: string | null;
      novedad_tipo: string | null;
      novedad_estado: string | null;
      observacion: string | null;
    }>(
      `
        SELECT
          nnt.id::text AS id,
          nnt.movimiento_id::text AS movimiento_id,
          nnt.nomina_empleado_id::text AS nomina_empleado_id,
          nnt.nomina_novedad_id::text AS nomina_novedad_id,
          CONCAT_WS(' ', titular_p.primer_nombre, titular_p.segundo_nombre, titular_p.primer_apellido, titular_p.segundo_apellido) AS titular_nombre,
          titular_p.numero_documento AS titular_documento,
          titular_ne.categoria_salarial_id::text AS titular_categoria_id,
          ncs.codigo_categoria AS titular_categoria_codigo,
          ncs.nombre_categoria AS titular_categoria_nombre,
          ncs.salario_base AS titular_categoria_salario_base,
          ncs.auxilio_transporte AS titular_categoria_auxilio_transporte,
          ncs.otros_recargos AS titular_categoria_otros_recargos,
          ncs.vigente_desde::text AS titular_categoria_vigente_desde,
          ncs.vigente_hasta::text AS titular_categoria_vigente_hasta,
          COALESCE(nt.codigo_operativo, nt.nombre, nt.descripcion_operativa) AS novedad_tipo,
          CASE WHEN nn.activo THEN 'ACTIVA' ELSE 'ANULADA' END AS novedad_estado,
          COALESCE(nn.fecha_inicio, np.fecha_inicio)::text AS fecha_inicio,
          COALESCE(nn.fecha_fin, nn.fecha_inicio, np.fecha_fin)::text AS fecha_fin,
          nnt.contexto_operativo,
          nnt.observacion
        FROM nomina_novedad_turnos nnt
        INNER JOIN nomina_novedades nn ON nn.id = nnt.nomina_novedad_id
        INNER JOIN nomina_periodos np ON np.id = nnt.periodo_id
        LEFT JOIN nomina_empleados titular_ne ON titular_ne.id = nn.nomina_empleado_id
        LEFT JOIN vinculaciones titular_v ON titular_v.id = titular_ne.vinculacion_id
        LEFT JOIN personas titular_p ON titular_p.id = titular_v.persona_id
        LEFT JOIN nomina_tipos_novedad nt ON nt.id = nn.tipo_novedad_id
        LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = titular_ne.categoria_salarial_id
        WHERE nnt.periodo_id = $1::bigint
          AND nnt.tipo_turno = 'INTERNO'
          AND COALESCE(nnt.activo, TRUE) = TRUE
          AND COALESCE(nn.activo, TRUE) = TRUE
      `,
      [periodoId]
    );
    const categoriasCoberturaResult = await client.query<{
      auxilio_transporte: number | string | null;
      codigo_categoria: string | null;
      id: string;
      nombre_categoria: string | null;
      otros_recargos: number | string | null;
      salario_base: number | string | null;
      vigente_desde: string | null;
      vigente_hasta: string | null;
    }>(
      `
        SELECT
          ncs.id::text AS id,
          ncs.codigo_categoria,
          ncs.nombre_categoria,
          ncs.salario_base,
          ncs.otros_recargos,
          ncs.auxilio_transporte,
          ncs.vigente_desde::text AS vigente_desde,
          ncs.vigente_hasta::text AS vigente_hasta
        FROM nomina_categorias_salariales ncs
        WHERE ncs.contrato_id = $1::bigint
          AND COALESCE(ncs.activo, TRUE) = TRUE
          AND (ncs.vigente_desde IS NULL OR ncs.vigente_desde <= $3::date)
          AND (ncs.vigente_hasta IS NULL OR ncs.vigente_hasta >= $2::date)
      `,
      [periodo.contrato_id, periodoRange.start, periodoRange.end]
    );
    const parametrosCoberturaResult = periodo.contrato_empresa_id
      ? await client.query<{
          porcentaje_pension_empleado: number | string | null;
          porcentaje_salud_empleado: number | string | null;
          regla_redondeo: string | null;
        }>(
          `
            SELECT
              porcentaje_salud_empleado,
              porcentaje_pension_empleado,
              regla_redondeo
            FROM nomina_parametros_economicos
            WHERE empresa_id = $1::bigint
              AND vigente_desde <= $3::date
              AND COALESCE(vigente_hasta, '9999-12-31'::date) >= $2::date
            ORDER BY vigente_desde DESC, id DESC
            LIMIT 1
          `,
          [periodo.contrato_empresa_id, periodoRange.start, periodoRange.end]
        )
      : { rows: [] as Array<{ porcentaje_pension_empleado: number | string | null; porcentaje_salud_empleado: number | string | null; regla_redondeo: string | null }> };
    const condicionesPensionResult = empleadosResult.rows.length > 0
      ? await client.query<{
          valor: number | string | null;
          vigente_desde: string;
          vigente_hasta: string | null;
          vinculacion_id: string;
        }>(
          `
            SELECT
              vinculacion_id::text AS vinculacion_id,
              valor,
              vigencia_desde::text AS vigente_desde,
              vigencia_hasta::text AS vigente_hasta
            FROM vinculacion_condiciones_economicas
            WHERE vinculacion_id = ANY($1::bigint[])
              AND COALESCE(activo, TRUE) = TRUE
              AND LOWER(BTRIM(tipo_condicion)) = 'aporta_pension'
            ORDER BY vinculacion_id ASC, vigencia_desde DESC, id DESC
          `,
          [empleadosResult.rows.map((item) => item.vinculacion_id)]
        )
      : { rows: [] as Array<{ valor: number | string | null; vigente_desde: string; vigente_hasta: string | null; vinculacion_id: string }> };

    const toRecord = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const toTextToken = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const normalized = value.trim().toUpperCase();
      return normalized.length > 0 ? normalized : null;
    };
    const toNullableId = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
      }
      return null;
    };
    const stripCategoriaContext = (value: unknown): ContextoOperativo => {
      const record = toRecord(value);
      return {
        categoria_id: toNullableId(record.categoria_id),
        categoria:
          toTextToken(record.categoria) ??
          toTextToken(record.codigo_categoria) ??
          toTextToken(record.nombre_categoria)
      };
    };
    const categoriasCoberturaById = new Map(categoriasCoberturaResult.rows.map((row) => [row.id, row] as const));
    const findCategoriaByLabel = (label: string | null | undefined) => {
      const normalized = toTextToken(label);
      if (!normalized) {
        return null;
      }
      return (
        categoriasCoberturaResult.rows.find((row) =>
          [row.codigo_categoria, row.nombre_categoria].some((candidate) => toTextToken(candidate) === normalized)
        ) ?? null
      );
    };
    const buildCategoriaSnapshot = (
      categoriaId: string | null | undefined,
      empleadoRow: NominaEmpleadoRealRow,
      fallbackLabel?: string | null,
      required = false
    ) => {
      const normalizedId = categoriaId ? String(categoriaId) : null;
      const categoriaRow =
        (normalizedId ? categoriasCoberturaById.get(normalizedId) ?? null : null) ??
        findCategoriaByLabel(fallbackLabel);

      if (required && !categoriaRow) {
        throw new AppError(
          'Coverage salary category not found for tramo or internal addition',
          409,
          'NOMINA_COBERTURA_CATEGORIA_NO_ENCONTRADA',
          { categoria_id: normalizedId, categoria_label: fallbackLabel ?? null }
        );
      }

      return {
        categoria_id: categoriaRow?.id ?? normalizedId ?? empleadoRow.categoria_id ?? null,
        codigo_categoria: categoriaRow?.codigo_categoria ?? empleadoRow.categoria_codigo,
        nombre_categoria: categoriaRow?.nombre_categoria ?? empleadoRow.categoria_nombre,
        salario_base: toNumberValue(categoriaRow?.salario_base ?? empleadoRow.categoria_salario_base ?? empleadoRow.salario_base),
        recargo_mensual: toNumberValue(categoriaRow?.otros_recargos ?? empleadoRow.categoria_otros_recargos),
        auxilio_transporte: toNumberValue(categoriaRow?.auxilio_transporte ?? empleadoRow.categoria_auxilio_transporte ?? empleadoRow.auxilio_transporte),
        configuracion_id: categoriaRow?.id ?? normalizedId ?? empleadoRow.categoria_id ?? null,
        vigente_desde: categoriaRow?.vigente_desde ?? toDateString(empleadoRow.categoria_vigente_desde),
        vigente_hasta: categoriaRow?.vigente_hasta ?? toDateString(empleadoRow.categoria_vigente_hasta)
      };
    };
    const contextoBaseByEmpleado = new Map(
      contextosBaseResult.rows.map((row) => [row.nomina_empleado_id, row.contexto ?? {}] as const)
    );
    const cambiosCoberturaByEmpleado = new Map<string, CambioOperativoDerivable[]>();
    for (const row of cambiosCoberturaResult.rows) {
      const current = cambiosCoberturaByEmpleado.get(row.nomina_empleado_id) ?? [];
      current.push({
        id: row.id,
        fecha_inicio_efectiva: row.fecha_inicio_efectiva,
        fecha_fin_efectiva: row.fecha_fin_efectiva,
        contexto_anterior: row.contexto_anterior ?? {},
        contexto_nuevo: row.contexto_nuevo ?? {},
        activo: row.activo ?? true
      });
      cambiosCoberturaByEmpleado.set(row.nomina_empleado_id, current);
    }
    const turnosInternosCoberturaByEmpleado = new Map<string, Array<typeof turnosInternosCoberturaResult.rows[number]>>();
    for (const row of turnosInternosCoberturaResult.rows) {
      const current = turnosInternosCoberturaByEmpleado.get(row.nomina_empleado_id) ?? [];
      current.push(row);
      turnosInternosCoberturaByEmpleado.set(row.nomina_empleado_id, current);
    }
    const condicionesPensionByVinculacion = new Map<string, Array<typeof condicionesPensionResult.rows[number]>>();
    for (const row of condicionesPensionResult.rows) {
      const current = condicionesPensionByVinculacion.get(row.vinculacion_id) ?? [];
      current.push(row);
      condicionesPensionByVinculacion.set(row.vinculacion_id, current);
    }
    const parametrosCobertura = {
      porcentaje_salud_empleado: resolvePayrollPercentage(
        parametrosCoberturaResult.rows[0]?.porcentaje_salud_empleado,
        COBERTURA_PORCENTAJE_SALUD
      ),
      porcentaje_pension_empleado: resolvePayrollPercentage(
        parametrosCoberturaResult.rows[0]?.porcentaje_pension_empleado,
        COBERTURA_PORCENTAJE_PENSION
      ),
      regla_redondeo: parametrosCoberturaResult.rows[0]?.regla_redondeo ?? 'ROUNDUP_CENTENA_FALLBACK'
    };
    const resolveAportaPension = (vinculacionId: string, fecha: string): boolean => {
      const rows = condicionesPensionByVinculacion.get(vinculacionId) ?? [];
      const match = rows.find((item) => item.vigente_desde <= fecha && (item.vigente_hasta === null || item.vigente_hasta >= fecha));
      if (!match) {
        return true;
      }
      return toNumberValue(match.valor) !== 0;
    };

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

      const employmentRange: NominaEmploymentDateRange = {
        start: toDateString(empleadoRow.fecha_inicio_pago) ?? periodoRange.start,
        end: toDateString(empleadoRow.fecha_fin_pago) ?? periodoRange.end
      };
      const projectedCanonicals = projectNominaCanonicalEventsToPeriodo({
        canonicalEvents: (canonicalByVinculacion.get(empleadoRow.vinculacion_id) ?? []).map(
          (item) => ({
            fuente_id: `CANONICO:${item.id}`,
            vinculacion_id: item.vinculacion_id,
            tipo_novedad_id: item.tipo_novedad_id,
            tipo_novedad_codigo_operativo: item.tipo_novedad_codigo_snapshot,
            fecha_inicio: toDateString(item.fecha_inicio) ?? periodoRange.start,
            fecha_fin: toDateString(item.fecha_fin) ?? periodoRange.end
          })
        ),
        employment: employmentRange,
        periodo: periodoRange
      });
      const effectEvents = [
        ...novedadesEmpleado.map((novedad) => ({
          origen: 'PERIODO' as const,
          fuente_id: `PERIODO:${novedad.id}`,
          fecha_inicio: toDateString(novedad.fecha_inicio),
          fecha_fin: toDateString(novedad.fecha_fin),
          dias: toOptionalNumberValue(novedad.dias),
          matrix: buildNominaEffectMatrixFromRow({
            codigo_operativo: novedad.tipo_novedad_codigo_operativo,
            nombre: novedad.tipo_novedad_nombre,
            afecta_salario: novedad.tipo_novedad_afecta_salario,
            afecta_transporte: novedad.tipo_novedad_afecta_transporte,
            efecto_salario: novedad.tipo_novedad_efecto_salario,
            efecto_auxilio_transporte: novedad.tipo_novedad_efecto_auxilio_transporte,
            efecto_recargos_detallado: novedad.tipo_novedad_efecto_recargos_detallado,
            efecto_liquidacion: novedad.tipo_novedad_efecto_liquidacion,
            efecto_cobertura_config: novedad.tipo_novedad_efecto_cobertura_config,
            efecto_operativo: novedad.tipo_novedad_efecto_operativo,
            modelo_registro: novedad.tipo_novedad_modelo_registro,
            proyecta_periodos: novedad.tipo_novedad_proyecta_periodos,
            bloquea_otras_novedades: novedad.tipo_novedad_bloquea_otras_novedades,
            grupo_exclusividad: novedad.tipo_novedad_grupo_exclusividad,
            observacion_plantilla: novedad.tipo_novedad_observacion_plantilla
          })
        })),
        ...projectedCanonicals.map((item) => {
          const tipo = tiposNovedadById.get(item.tipo_novedad_id ?? '');

          if (!tipo) {
            throw new AppError(
              'Canonical payroll novelty type not found',
              500,
              'NOMINA_NOVEDAD_CANONICA_TIPO_NOT_FOUND',
              { tipo_novedad_id: item.tipo_novedad_id }
            );
          }

          return {
            origen: 'CANONICO' as const,
            fuente_id: item.fuente_id,
            fecha_inicio: item.fecha_inicio,
            fecha_fin: item.fecha_fin,
            dias: null,
            matrix: buildNominaEffectMatrixFromRow(tipo)
          };
        })
      ];
      const effectResolution = resolveNominaEfectosPorDia({
        employment: employmentRange,
        events: effectEvents,
        periodo: periodoRange
      });

      if (effectResolution.conflictos.length > 0) {
        throw new AppError(
          'Payroll novelty conflicts detected for employee',
          409,
          'NOMINA_NOVEDAD_CONFLICTO',
          {
            nomina_empleado_id: empleadoRow.id,
            periodo_id: periodoId,
            vinculacion_id: empleadoRow.vinculacion_id,
            conflictos: effectResolution.conflictos
          }
        );
      }

      let diasDescuentoSalario = 0;
      let diasDescuentoTransporte = 0;
      let diasDescuentoOtrosRecargos = 0;
      let adicionesNovedad = 0;
      let deduccionesNovedadManual = 0;

      for (const novedad of novedadesEmpleado) {
        const diasNovedad = Math.max(0, toNumberValue(novedad.dias));
        const valorManual = Math.max(0, toNumberValue(novedad.valor_manual));
        const esAdicion = toBooleanValue(novedad.tipo_novedad_es_adicion);
        const esDeduccion = toBooleanValue(novedad.tipo_novedad_es_deduccion);

        if (esAdicion && valorManual > 0) {
          adicionesNovedad += valorManual;
        }

        if (esDeduccion && valorManual > 0) {
          deduccionesNovedadManual += valorManual;
        }
      }

      const usaCobertura =
        (empleadoRow.vinculacion_metodo_pago ?? '').trim().toUpperCase() === 'COBERTURA';

      if (usaCobertura) {
        const contextoBaseCategoria = stripCategoriaContext(
          contextoBaseByEmpleado.get(empleadoRow.id) ?? {
            categoria_id: empleadoRow.categoria_id,
            categoria: empleadoRow.categoria_codigo ?? empleadoRow.categoria_nombre
          }
        );
        const tramosCobertura = resolverTramosOperativos({
          periodo_inicio: periodoRange.start,
          periodo_fin: periodoRange.end,
          vinculacion_inicio: employmentRange.start,
          vinculacion_fin: employmentRange.end,
          contexto_base:
            contextoBaseCategoria.categoria_id || contextoBaseCategoria.categoria
              ? contextoBaseCategoria
              : {
                  categoria_id: empleadoRow.categoria_id,
                  categoria: empleadoRow.categoria_codigo ?? empleadoRow.categoria_nombre
                },
          cambios: (cambiosCoberturaByEmpleado.get(empleadoRow.id) ?? []).map((item) => ({
            ...item,
            contexto_anterior: stripCategoriaContext(item.contexto_anterior),
            contexto_nuevo: stripCategoriaContext(item.contexto_nuevo)
          }))
        }).map((tramo) => {
          const categoriaContexto = stripCategoriaContext(tramo.contexto);
          return {
            fecha_inicio: tramo.fecha_inicio,
            fecha_fin: tramo.fecha_fin,
            movimiento_origen_id: tramo.movimiento_origen_id,
            contexto: toRecord(tramo.contexto),
            categoria: buildCategoriaSnapshot(
              categoriaContexto.categoria_id,
              empleadoRow,
              categoriaContexto.categoria ?? null,
              Boolean(categoriaContexto.categoria_id || categoriaContexto.categoria)
            )
          };
        });
        const adicionesInternasCobertura = (turnosInternosCoberturaByEmpleado.get(empleadoRow.id) ?? []).map((turnoRow) => {
          const turnoContexto = toRecord(turnoRow.contexto_operativo);
          const categoriaTurno = stripCategoriaContext(turnoContexto);
          const categoriaTurnoFaltante = !categoriaTurno.categoria_id && !categoriaTurno.categoria;
          if (
            categoriaTurnoFaltante &&
            !turnoRow.titular_categoria_id &&
            !turnoRow.titular_categoria_codigo &&
            !turnoRow.titular_categoria_nombre
          ) {
            throw new AppError(
              'Internal addition requires the covered salary category in contexto_operativo',
              409,
              'NOMINA_COBERTURA_ADICION_CATEGORIA_REQUERIDA',
              { nomina_empleado_id: empleadoRow.id, turno_id: turnoRow.id }
            );
          }

          const categoriaTurnoSnapshot = categoriaTurnoFaltante
            ? {
                categoria_id: turnoRow.titular_categoria_id ?? null,
                codigo_categoria: turnoRow.titular_categoria_codigo ?? null,
                nombre_categoria: turnoRow.titular_categoria_nombre ?? null,
                salario_base: toNumberValue(
                  turnoRow.titular_categoria_salario_base ??
                    empleadoRow.categoria_salario_base ??
                    empleadoRow.salario_base
                ),
                recargo_mensual: toNumberValue(
                  turnoRow.titular_categoria_otros_recargos ?? empleadoRow.categoria_otros_recargos
                ),
                auxilio_transporte: toNumberValue(
                  turnoRow.titular_categoria_auxilio_transporte ??
                    empleadoRow.categoria_auxilio_transporte ??
                    empleadoRow.auxilio_transporte
                ),
                configuracion_id: turnoRow.titular_categoria_id ?? null,
                vigente_desde: turnoRow.titular_categoria_vigente_desde,
                vigente_hasta: turnoRow.titular_categoria_vigente_hasta
              }
            : buildCategoriaSnapshot(
                categoriaTurno.categoria_id,
                empleadoRow,
                categoriaTurno.categoria ?? null,
                true
              );
          return {
            id: turnoRow.id,
            novedad_id: turnoRow.nomina_novedad_id,
            titular_nombre: turnoRow.titular_nombre,
            titular_documento: turnoRow.titular_documento,
            novedad_tipo: turnoRow.novedad_tipo,
            novedad_estado: turnoRow.novedad_estado,
            fecha_inicio: turnoRow.fecha_inicio,
            fecha_fin: turnoRow.fecha_fin,
            observacion: turnoRow.observacion,
            contexto: turnoContexto,
            aporta_pension: resolveAportaPension(empleadoRow.vinculacion_id, turnoRow.fecha_inicio),
            categoria: categoriaTurnoSnapshot
          };
        });
        const coberturaResult = calculateCoberturaPayroll({
          empleo: {
            fecha_inicio: employmentRange.start,
            fecha_fin: employmentRange.end
          },
          tramos: tramosCobertura,
          dias_efectos: effectResolution.days,
          aporta_pension: resolveAportaPension(empleadoRow.vinculacion_id, employmentRange.start),
          porcentaje_salud: parametrosCobertura.porcentaje_salud_empleado,
          porcentaje_pension: parametrosCobertura.porcentaje_pension_empleado,
          descuentos_autorizados: deduccionesNovedadManual,
          otras_deducciones_reales: totalMovimientosDeducciones,
          otros_devengos_reales: Math.max(0, otrosDevengos) + totalMovimientosDevengados,
          adiciones_internas: adicionesInternasCobertura
        });
        const totalAdicionesInternasDevengado = coberturaResult.adiciones_internas.reduce(
          (accumulator, item) => accumulator + item.devengado_turno,
          0
        );
        const detalleCalculoCobertura = {
          motor: 'COBERTURA_V1_0',
          periodo: periodoRange,
          empleo: {
            fecha_inicio: employmentRange.start,
            fecha_fin: employmentRange.end,
            aporta_pension: coberturaResult.aporta_pension
          },
          parametros: {
            dias_base_nomina: coberturaResult.dias_base_nomina,
            porcentaje_salud: coberturaResult.porcentaje_salud,
            porcentaje_pension: coberturaResult.porcentaje_pension,
            regla_redondeo: parametrosCobertura.regla_redondeo
          },
          contadores: {
            dias_vinculacion: coberturaResult.dias_vinculacion,
            dias_salario: coberturaResult.dias_salario,
            dias_recargo: coberturaResult.dias_recargo,
            dias_transporte: coberturaResult.dias_transporte,
            dias_cotizacion_ss: coberturaResult.dias_cotizacion_ss
          },
          componentes: {
            salario_ordinario: coberturaResult.salario_ordinario,
            recargos_ordinarios: coberturaResult.recargos_ordinarios,
            transporte_ordinario: coberturaResult.transporte_ordinario,
            salud_ordinaria: coberturaResult.salud_ordinaria,
            pension_ordinaria: coberturaResult.pension_ordinaria,
            salud_adiciones_internas: coberturaResult.salud_adiciones_internas,
            pension_adiciones_internas: coberturaResult.pension_adiciones_internas,
            descuentos_autorizados: coberturaResult.descuentos_autorizados,
            otros_devengos_reales: coberturaResult.otros_devengos_reales,
            otras_deducciones_reales: coberturaResult.otras_deducciones_reales,
            total_devengado: coberturaResult.total_devengado,
            total_deducciones: coberturaResult.total_deducciones,
            neto_nomina: coberturaResult.neto_nomina
          },
          auditoria: coberturaResult.auditoria,
          adiciones_internas: coberturaResult.adiciones_internas
        };
        const saludTotal = coberturaResult.salud_ordinaria + coberturaResult.salud_adiciones_internas;
        const pensionTotal =
          coberturaResult.pension_ordinaria + coberturaResult.pension_adiciones_internas;
        const devengadoOtros =
          coberturaResult.recargos_ordinarios +
          coberturaResult.otros_devengos_reales +
          totalAdicionesInternasDevengado;

        for (const adicion of coberturaResult.adiciones_internas) {
          const turno = (turnosInternosCoberturaByEmpleado.get(empleadoRow.id) ?? [])
            .find((item) => item.id === adicion.id);
          if (!turno?.movimiento_id) continue;
          const diasTurno = Math.max(1, adicion.dias_turno);
          await client.query(
            `UPDATE nomina_movimientos
             SET cantidad = $2,
                 valor_unitario = $3,
                 valor_calculado = $4,
                 valor_total = $4,
                 es_devengado = TRUE,
                 es_deduccion = FALSE,
                 afecta_seguridad_social = TRUE
             WHERE id = $1::bigint AND tipo_movimiento = 'TURNO_INTERNO'`,
            [turno.movimiento_id, diasTurno, adicion.devengado_turno / diasTurno, adicion.devengado_turno]
          );
        }

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
              neto_pagar = $11,
              detalle_calculo = $12::jsonb
            WHERE id = $1::bigint
          `,
          [
            empleadoRow.id,
            coberturaResult.dias_salario,
            horasTrabajadasBase,
            coberturaResult.salario_ordinario,
            coberturaResult.transporte_ordinario,
            devengadoOtros,
            saludTotal,
            pensionTotal,
            coberturaResult.total_devengado,
            coberturaResult.total_deducciones,
            coberturaResult.neto_nomina,
            JSON.stringify(detalleCalculoCobertura)
          ]
        );

        continue;
      }

      if (!usaAsistencia) {
        diasDescuentoSalario = effectResolution.dias_salario_descuento;
        diasDescuentoTransporte = effectResolution.dias_transporte_descuento;
        diasDescuentoOtrosRecargos = effectResolution.dias_recargo_excluido;
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
      const detalleCalculo = {
        motor: 'NOMINA_V1_0',
        periodo: periodoRange,
        dias: {
          base: diasPagadosBase,
          salario: diasPagadosSalario,
          transporte: diasPagadosTransporte,
          recargos: diasPagadosOtrosRecargos
        },
        componentes: {
          salario_base: salarioBase,
          devengado_basico: devengadoBasico,
          devengado_transporte: devengadoTransporte,
          devengado_otros: devengadoOtros,
          salud,
          pension,
          total_adiciones: totalAdiciones,
          total_deducciones: totalDeducciones,
          neto_pagar: netoPagar
        },
        novedades: {
          descuentos_salario: diasDescuentoSalario,
          descuentos_transporte: diasDescuentoTransporte,
          descuentos_recargos: diasDescuentoOtrosRecargos,
          adiciones_manuales: adicionesNovedad,
          deducciones_manuales: deduccionesNovedadManual
        }
      };

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
            neto_pagar = $11,
            detalle_calculo = $12::jsonb
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
          netoPagar,
          JSON.stringify(detalleCalculo)
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

  if (query.estado) {
    params.push(query.estado);
    conditions.push(`nm.estado = $${params.length}`);
  }

  if (query.familia_movimiento) {
    params.push(query.familia_movimiento);
    conditions.push(`nm.familia_movimiento = $${params.length}`);
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

export const getNominaMovimientoById = async (
  movimientoId: string,
  tenant?: TenantAccessContext
): Promise<NominaMovimiento> => {
  return mapRealMovimiento(await loadNominaMovimientoByIdOrThrow(movimientoId, tenant));
};

export const getNominaMovimientosOperativos = async (
  query: ListNominaMovimientosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<Record<string, unknown>>> => {
  const result = await getNominaMovimientos(query, tenant);
  return {
    ...result,
    items: result.items.map(({ valor_aplicado: _valorAplicado, valor_calculado: _valorCalculado,
      valor_total: _valorTotal, valor_unitario: _valorUnitario,
      es_devengado: _esDevengado, es_deduccion: _esDeduccion,
      afecta_seguridad_social: _AfectaSeguridadSocial,
      motivo_ajuste_valor: _motivoAjusteValor, ...operational }) => operational)
  };
};

export const listNominaNovedadTurnosOperativos = async (
  query: ListNominaMovimientosQuery & { tipo_turno?: 'INTERNO' | 'EXTERNO' },
  tenant?: TenantAccessContext
): Promise<PaginatedResponse<Record<string, unknown>>> => {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (query.periodo_id) {
    params.push(query.periodo_id);
    conditions.push(`nnt.periodo_id = $${params.length}::bigint`);
  }
  if (query.nomina_empleado_id) {
    params.push(query.nomina_empleado_id);
    conditions.push(`nnt.nomina_empleado_id = $${params.length}::bigint`);
  }
  if (query.tipo_turno) {
    params.push(query.tipo_turno);
    conditions.push(`nnt.tipo_turno = $${params.length}`);
  }
  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`COALESCE(nnt.activo, TRUE) = $${params.length}`);
  }
  appendNominaCoberturaScope(conditions, params, tenant);
  appendTenantScopeConditions(conditions, params, tenant, 'v.contrato_id', 'v.empresa_id');
  const whereSql = buildSqlWhere(conditions);
  const count = await dbQuery<{ total: number }>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_novedad_turnos nnt
      INNER JOIN nomina_empleados ne ON ne.id = nnt.nomina_empleado_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN nomina_periodos np ON np.id = nnt.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      ${whereSql}
    `,
    params
  );
  const total = count.rows[0]?.total ?? 0;
  const page = query.page ?? 1;
  const limit = query.limit ?? 100;
  const listParams = [...params, limit, (page - 1) * limit];
  const result = await dbQuery<Record<string, unknown>>(
    `
      SELECT
        nnt.id::text AS id,
        nnt.periodo_id::text AS periodo_id,
        nnt.nomina_novedad_id::text AS novedad_id,
        nnt.nomina_empleado_id::text AS nomina_empleado_id,
        nnt.vinculacion_id::text AS vinculacion_id,
        nnt.tipo_turno,
        COALESCE(nn.fecha_inicio::text, nn.fecha_fin::text) AS fecha,
        nn.fecha_inicio::text AS fecha_inicio,
        nn.fecha_fin::text AS fecha_fin,
        nn.dias,
        COALESCE(nm.descripcion, nnt.observacion, nn.observacion) AS motivo,
        COALESCE(nnt.activo, TRUE) AS activo,
        CASE
          WHEN COALESCE(nnt.activo, TRUE) = FALSE OR (nm.id IS NOT NULL AND COALESCE(nm.activo, TRUE) = FALSE)
            THEN 'ANULADO'
          WHEN nm.estado IS NOT NULL
            THEN nm.estado
          ELSE 'ACTIVO'
        END AS estado,
        nnt.movimiento_id::text AS movimiento_id,
        nnt.contexto_operativo,
        COALESCE(NULLIF(BTRIM(ce.nombre_completo), ''), CONCAT_WS(' ', cubre_p.primer_nombre, cubre_p.segundo_nombre, cubre_p.primer_apellido, cubre_p.segundo_apellido)) AS trabajador_cubre,
        COALESCE(NULLIF(BTRIM(ce.numero_documento), ''), cubre_p.numero_documento) AS trabajador_cubre_documento,
        CONCAT_WS(' ', titular_p.primer_nombre, titular_p.segundo_nombre, titular_p.primer_apellido, titular_p.segundo_apellido) AS trabajador_reemplazado,
        titular_p.numero_documento AS trabajador_reemplazado_documento,
        COALESCE(nm.contexto_municipio, mu.nombre_municipio) AS municipio,
        COALESCE(nm.contexto_institucion, ins.nombre_institucion) AS institucion,
        COALESCE(nm.contexto_sede, s.nombre_sede) AS sede,
        COALESCE(nm.contexto_modalidad, mo.nombre_modalidad) AS modalidad,
        COALESCE(nnt.contexto_operativo ->> 'origen_cobertura', 'NOVEDAD') AS origen_cobertura,
        ntn.codigo_operativo AS novedad_tipo_codigo,
        ntn.nombre AS novedad_tipo_nombre,
        nnt.externo_id::text AS externo_id,
        ce.nombre_completo AS externo_nombre,
        ce.numero_documento AS externo_documento,
        COALESCE(nm.tipo_movimiento, CASE WHEN nnt.tipo_turno = 'INTERNO' THEN 'TURNO_INTERNO' ELSE 'TURNO_EXTERNO' END) AS movimiento_tipo,
        nm.estado AS movimiento_estado,
        COALESCE(nm.activo, TRUE) AS movimiento_activo,
        nm.cantidad AS movimiento_cantidad,
        nm.valor_calculado AS movimiento_valor_calculado,
        nm.valor_total AS movimiento_valor_aplicado,
        COALESCE(nm.descripcion, nnt.observacion, nn.observacion) AS movimiento_descripcion,
        COALESCE(nm.afecta_seguridad_social, TRUE) AS movimiento_afecta_seguridad_social,
        COALESCE(nm.alertas_validacion, '[]'::jsonb) AS movimiento_alertas_validacion,
        CASE WHEN nnt.tipo_turno = 'EXTERNO' THEN EXISTS (
          SELECT 1 FROM cobertura_externo_documentos d
          WHERE d.externo_id = nnt.externo_id AND d.tipo_documento = 'CEDULA_EXTERNO_COBERTURA'
            AND d.activo AND d.es_vigente
        ) ELSE TRUE END AS cedula_cargada,
        CASE WHEN nnt.tipo_turno = 'EXTERNO' THEN EXISTS (
          SELECT 1 FROM cobertura_externo_documentos d
          WHERE d.externo_id = nnt.externo_id AND d.tipo_documento = 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA'
            AND d.activo AND d.es_vigente
        ) ELSE TRUE END AS certificacion_bancaria_cargada,
        CASE WHEN nnt.tipo_turno = 'EXTERNO' THEN EXISTS (
          SELECT 1 FROM cobertura_cuentas_cobro_externas cx
          WHERE cx.externo_id = nnt.externo_id AND cx.periodo_id = nnt.periodo_id AND cx.activo
            AND cx.estado IN ('GENERADA', 'FIRMADA')
        ) ELSE TRUE END AS cuenta_cobro_cargada,
        CASE
          WHEN nnt.tipo_turno = 'INTERNO' THEN TRUE
          ELSE (
            EXISTS (
              SELECT 1 FROM cobertura_externo_documentos d
              WHERE d.externo_id = nnt.externo_id AND d.tipo_documento = 'CEDULA_EXTERNO_COBERTURA'
                AND d.activo AND d.es_vigente
            )
            AND EXISTS (
              SELECT 1 FROM cobertura_externo_documentos d
              WHERE d.externo_id = nnt.externo_id AND d.tipo_documento = 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA'
                AND d.activo AND d.es_vigente
            )
            AND EXISTS (
              SELECT 1 FROM cobertura_cuentas_cobro_externas cx
              WHERE cx.externo_id = nnt.externo_id AND cx.periodo_id = nnt.periodo_id AND cx.activo
                AND cx.estado IN ('GENERADA', 'FIRMADA')
            )
          )
        END AS documentos_completos
      FROM nomina_novedad_turnos nnt
      INNER JOIN nomina_novedades nn ON nn.id = nnt.nomina_novedad_id
      INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
      INNER JOIN nomina_empleados ne ON ne.id = nnt.nomina_empleado_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN nomina_periodos np ON np.id = nnt.periodo_id
      INNER JOIN contratos c ON c.id = np.contrato_id
      INNER JOIN vinculaciones titular_v ON titular_v.id = nn.vinculacion_id
      INNER JOIN personas titular_p ON titular_p.id = titular_v.persona_id
      INNER JOIN personas cubre_p ON cubre_p.id = v.persona_id
      LEFT JOIN nomina_movimientos nm ON nm.id = nnt.movimiento_id
      LEFT JOIN cobertura_externos ce ON ce.id = nnt.externo_id
      LEFT JOIN LATERAL (
        SELECT ff.municipio_id, ff.institucion_id, ff.sede_id, ff.modalidad_id
        FROM cobertura_asignaciones ca
        INNER JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
        WHERE ca.vinculacion_id = nnt.vinculacion_id AND ca.activo
          AND ca.fecha_inicio <= COALESCE(nn.fecha_fin, np.fecha_fin)
          AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= COALESCE(nn.fecha_inicio, np.fecha_inicio))
        ORDER BY ca.fecha_inicio DESC, ca.id DESC LIMIT 1
      ) ctx ON TRUE
      LEFT JOIN municipios mu ON mu.id = ctx.municipio_id
      LEFT JOIN instituciones ins ON ins.id = COALESCE(nm.institucion_id, ctx.institucion_id)
      LEFT JOIN sedes s ON s.id = ctx.sede_id
      LEFT JOIN modalidades mo ON mo.id = COALESCE(nm.modalidad_id, ctx.modalidad_id)
      ${whereSql}
      ORDER BY COALESCE(nn.fecha_inicio, np.fecha_inicio) DESC, nnt.id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `,
    listParams
  );
  return {
    items: result.rows,
    pagination: { page, limit, total, total_pages: total === 0 ? 0 : Math.ceil(total / limit) }
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
    const empleado = await loadNominaEmpleadoByIdOrThrow(input.nomina_empleado_id, tenant, client);
    assertNominaEmpleadoEditable(empleado, 'registrar movimientos de nomina');

    if (empleadoContext.periodo_id !== input.periodo_id) {
      throw new AppError('Payroll employee does not belong to the target period', 409, 'NOMINA_MOVIMIENTO_INVALID_PERIODO');
    }

    if (empleado.vinculacion_id !== input.vinculacion_id) {
      throw new AppError('Vinculacion does not match payroll employee', 409, 'NOMINA_MOVIMIENTO_INVALID_VINCULACION');
    }

    const vinculacion = await ensureVinculacionExists(input.vinculacion_id, client);
    const fechaMovimiento = input.fecha ?? null;
    const familiaMovimiento =
      input.familia_movimiento ?? resolveNominaMovimientoFamilia(input.tipo_movimiento);
    const estadoMovimiento = normalizeNominaMovimientoEstado(input.estado);

    if ((input.tipo_movimiento === 'TURNO_EXTERNO' || input.tipo_movimiento === 'TURNO_INTERNO') && !fechaMovimiento) {
      throw new AppError(
        'fecha is required for payroll turn movements',
        400,
        'NOMINA_MOVIMIENTO_FECHA_REQUERIDA'
      );
    }

    if (fechaMovimiento) {
      ensurePeriodoRelacionadoConFecha(
        {
          id: periodo.id,
          nombre: periodo.nombre_periodo,
          tipo_periodo: periodo.tipo_periodo,
          fecha_inicio: toDateString(periodo.fecha_inicio) ?? '',
          fecha_fin: toDateString(periodo.fecha_fin) ?? '',
          estado: periodo.estado as EstadoPeriodo,
          contrato_id: periodo.contrato_id,
          empresa_id: periodo.contrato_empresa_id
        },
        undefined,
        undefined,
        fechaMovimiento
      );
      assertNominaMovimientoFechaVigente(fechaMovimiento, vinculacion);
    }

    if (input.documento_persona_id) {
      await ensureDocumentoPersonaScope(input.documento_persona_id, vinculacion.persona_id, client);
    }

    if (input.persona_reemplazada_id) {
      await ensurePersonaExists(input.persona_reemplazada_id, client);
    }

    if (input.vinculacion_reemplazada_id) {
      const vinculacionReemplazada = await ensureVinculacionExists(
        input.vinculacion_reemplazada_id,
        client
      );

      if (vinculacionReemplazada.id === input.vinculacion_id) {
        throw new AppError(
          'A movement cannot replace the same vinculacion',
          409,
          'NOMINA_MOVIMIENTO_REEMPLAZO_INVALIDO'
        );
      }

      if (
        input.persona_reemplazada_id &&
        vinculacionReemplazada.persona_id !== input.persona_reemplazada_id
      ) {
        throw new AppError(
          'persona_reemplazada_id does not match vinculacion_reemplazada_id',
          409,
          'NOMINA_MOVIMIENTO_REEMPLAZO_PERSONA_INVALIDA'
        );
      }
    }

    const contexto = fechaMovimiento
      ? await resolveNominaMovimientoContext(
          {
            fecha: fechaMovimiento,
            municipio_id: input.municipio_id,
            institucion_id: input.institucion_id,
            sede_id: input.sede_id,
            modalidad_id: input.modalidad_id,
            contexto_municipio: input.contexto_municipio,
            contexto_institucion: input.contexto_institucion,
            contexto_sede: input.contexto_sede,
            contexto_modalidad: input.contexto_modalidad,
            vinculacion_reemplazada_id: input.vinculacion_reemplazada_id
          },
          client
        )
      : {
          municipio_id: input.municipio_id ?? null,
          institucion_id: input.institucion_id ?? null,
          sede_id: input.sede_id ?? null,
          modalidad_id: input.modalidad_id ?? null,
          contexto_municipio: input.contexto_municipio ?? null,
          contexto_institucion: input.contexto_institucion ?? null,
          contexto_sede: input.contexto_sede ?? null,
          contexto_modalidad: input.contexto_modalidad ?? null
        };

    const tarifa =
      fechaMovimiento === null
        ? null
        : await resolveNominaMovimientoTarifa(
            {
              contrato_id: periodo.contrato_id,
              fecha: fechaMovimiento,
              tipo_movimiento: input.tipo_movimiento,
              municipio_id: contexto.municipio_id,
              institucion_id: contexto.institucion_id,
              sede_id: contexto.sede_id,
              modalidad_id: contexto.modalidad_id
            },
            client
          );

    const resolvedValues = resolveNominaMovimientoValue({
      cantidad: input.cantidad,
      valor_aplicado: input.valor_aplicado ?? input.valor_total,
      valor_calculado: input.valor_calculado,
      valor_unitario:
        input.valor_unitario ?? (tarifa ? toNumberValue(tarifa.valor_unitario) : null),
      motivo_ajuste_valor: input.motivo_ajuste_valor
    });

    let movimientoAlerts: NominaMovimientoAlerta[] = [];
    let posibleDuplicado = false;

    if (fechaMovimiento) {
      const alertResolution = await buildNominaMovimientoAlerts(
        {
          fecha: fechaMovimiento,
          periodo_id: input.periodo_id,
          tipo_movimiento: input.tipo_movimiento,
          vinculacion_id: input.vinculacion_id
        },
        client
      );
      movimientoAlerts = alertResolution.alerts;
      posibleDuplicado = alertResolution.posible_duplicado;
    }

    if (familiaMovimiento === 'ADICION_DEVENGO' && !tarifa) {
      movimientoAlerts = appendNominaMovimientoAlert(movimientoAlerts, {
        tipo: 'CONFIGURACION_TARIFA_FALTANTE',
        severidad: 'WARNING',
        mensaje:
          'No se encontro una tarifa vigente para el contexto del movimiento; se conserva el valor aplicado ingresado.',
        metadata: {
          tipo_movimiento: input.tipo_movimiento,
          contrato_id: periodo.contrato_id
        }
      });
    }

    if (movimientoAlerts.length > 0 && estadoMovimiento === 'APROBADO') {
      throw new AppError(
        'The movement has validation alerts and must be reviewed before approval',
        409,
        'NOMINA_MOVIMIENTO_REQUIERE_REVISION',
        { alertas: movimientoAlerts }
      );
    }

    const revisadoAt = estadoMovimiento === 'REVISADO' ? new Date().toISOString() : null;
    const aprobadoAt = estadoMovimiento === 'APROBADO' ? new Date().toISOString() : null;
    const rechazadoAt = estadoMovimiento === 'RECHAZADO' ? new Date().toISOString() : null;

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_movimientos (
          periodo_id,
          nomina_empleado_id,
          vinculacion_id,
          fecha,
          tipo_movimiento,
          familia_movimiento,
          estado,
          descripcion,
          cantidad,
          valor_unitario,
          valor_calculado,
          valor_total,
          documento_persona_id,
          persona_reemplazada_id,
          vinculacion_reemplazada_id,
          municipio_id,
          institucion_id,
          sede_id,
          modalidad_id,
          contexto_municipio,
          contexto_institucion,
          contexto_sede,
          contexto_modalidad,
          tarifa_config_id,
          motivo_ajuste_valor,
          motivo_estado,
          alertas_validacion,
          posible_duplicado,
          revisado_por,
          revisado_at,
          aprobado_por,
          aprobado_at,
          rechazado_por,
          rechazado_at,
          es_devengado,
          es_deduccion,
          afecta_seguridad_social,
          activo,
          updated_by
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
          $13::bigint,
          $14::bigint,
          $15::bigint,
          $16::bigint,
          $17::bigint,
          $18::bigint,
          $19::bigint,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27::jsonb,
          $28,
          $29::bigint,
          $30::timestamptz,
          $31::bigint,
          $32::timestamptz,
          $33::bigint,
          $34::timestamptz,
          $35,
          $36,
          $37,
          $38,
          $39::bigint
        )
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.nomina_empleado_id,
        input.vinculacion_id,
        fechaMovimiento,
        input.tipo_movimiento,
        familiaMovimiento,
        estadoMovimiento,
        input.descripcion,
        resolvedValues.cantidad,
        resolvedValues.valor_unitario,
        resolvedValues.valor_calculado,
        resolvedValues.valor_aplicado,
        input.documento_persona_id,
        input.persona_reemplazada_id,
        input.vinculacion_reemplazada_id,
        contexto.municipio_id,
        contexto.institucion_id,
        contexto.sede_id,
        contexto.modalidad_id,
        contexto.contexto_municipio,
        contexto.contexto_institucion,
        contexto.contexto_sede,
        contexto.contexto_modalidad,
        tarifa?.id ?? input.tarifa_config_id ?? null,
        resolvedValues.motivo_ajuste_valor,
        input.motivo_estado,
        JSON.stringify(movimientoAlerts),
        posibleDuplicado,
        estadoMovimiento === 'REVISADO' ? actorUserId : null,
        revisadoAt,
        estadoMovimiento === 'APROBADO' ? actorUserId : null,
        aprobadoAt,
        estadoMovimiento === 'RECHAZADO' ? actorUserId : null,
        rechazadoAt,
        input.es_devengado,
        input.es_deduccion,
        input.afecta_seguridad_social,
        input.activo,
        actorUserId
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
    const empleado = await loadNominaEmpleadoByIdOrThrow(input.nomina_empleado_id, tenant, client);
    assertNominaEmpleadoEditable(empleado, 'registrar recargos de nomina');

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
          familia_movimiento,
          estado,
          descripcion,
          cantidad,
          valor_unitario,
          valor_calculado,
          valor_total,
          alertas_validacion,
          posible_duplicado,
          es_devengado,
          es_deduccion,
          afecta_seguridad_social,
          activo,
          updated_by,
          aprobado_por,
          aprobado_at
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
          FALSE,
          TRUE,
          FALSE,
          TRUE,
          TRUE,
          $13::bigint,
          $13::bigint,
          NOW()
        )
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.nomina_empleado_id,
        input.vinculacion_id,
        input.fecha,
        input.tipo_recargo,
        resolveNominaMovimientoFamilia(input.tipo_recargo),
        'APROBADO',
        `Recargo automatico ${input.tipo_recargo}`,
        input.horas,
        valorUnitario,
        valorTotal,
        valorTotal,
        '[]',
        actorUserId
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
    const empleado = await loadNominaEmpleadoByIdOrThrow(current.nomina_empleado_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'updating payroll movements');
    assertNominaEmpleadoEditable(empleado, 'editar movimientos de nomina');

    const nextFecha = input.fecha !== undefined ? input.fecha : toDateString(current.fecha);
    const nextTipoMovimiento = input.tipo_movimiento ?? current.tipo_movimiento;
    const nextFamilia =
      input.familia_movimiento ??
      current.familia_movimiento ??
      resolveNominaMovimientoFamilia(nextTipoMovimiento);
    const nextEstado = normalizeNominaMovimientoEstado(input.estado ?? current.estado);

    if ((nextTipoMovimiento === 'TURNO_EXTERNO' || nextTipoMovimiento === 'TURNO_INTERNO') && !nextFecha) {
      throw new AppError(
        'fecha is required for payroll turn movements',
        400,
        'NOMINA_MOVIMIENTO_FECHA_REQUERIDA'
      );
    }

    if (nextFecha) {
      const vinculacion = await ensureVinculacionExists(current.vinculacion_id, client);
      ensurePeriodoRelacionadoConFecha(
        {
          id: periodo.id,
          nombre: periodo.nombre_periodo,
          tipo_periodo: periodo.tipo_periodo,
          fecha_inicio: toDateString(periodo.fecha_inicio) ?? '',
          fecha_fin: toDateString(periodo.fecha_fin) ?? '',
          estado: periodo.estado as EstadoPeriodo,
          contrato_id: periodo.contrato_id,
          empresa_id: periodo.contrato_empresa_id
        },
        undefined,
        undefined,
        nextFecha
      );
      assertNominaMovimientoFechaVigente(nextFecha, vinculacion);
    }

    if (input.documento_persona_id) {
      await ensureDocumentoPersonaScope(input.documento_persona_id, current.persona.id, client);
    }

    if (input.persona_reemplazada_id) {
      await ensurePersonaExists(input.persona_reemplazada_id, client);
    }

    if (input.vinculacion_reemplazada_id) {
      const vinculacionReemplazada = await ensureVinculacionExists(
        input.vinculacion_reemplazada_id,
        client
      );

      if (vinculacionReemplazada.id === current.vinculacion_id) {
        throw new AppError(
          'A movement cannot replace the same vinculacion',
          409,
          'NOMINA_MOVIMIENTO_REEMPLAZO_INVALIDO'
        );
      }

      if (
        input.persona_reemplazada_id &&
        vinculacionReemplazada.persona_id !== input.persona_reemplazada_id
      ) {
        throw new AppError(
          'persona_reemplazada_id does not match vinculacion_reemplazada_id',
          409,
          'NOMINA_MOVIMIENTO_REEMPLAZO_PERSONA_INVALIDA'
        );
      }
    }

    const contexto = nextFecha
      ? await resolveNominaMovimientoContext(
          {
            fecha: nextFecha,
            municipio_id:
              input.municipio_id !== undefined
                ? input.municipio_id
                : current.contexto_operativo?.municipio_id ?? null,
            institucion_id:
              input.institucion_id !== undefined
                ? input.institucion_id
                : current.contexto_operativo?.institucion_id ?? null,
            sede_id:
              input.sede_id !== undefined
                ? input.sede_id
                : current.contexto_operativo?.sede_id ?? null,
            modalidad_id:
              input.modalidad_id !== undefined
                ? input.modalidad_id
                : current.contexto_operativo?.modalidad_id ?? null,
            contexto_municipio:
              input.contexto_municipio !== undefined
                ? input.contexto_municipio
                : current.contexto_operativo?.municipio ?? null,
            contexto_institucion:
              input.contexto_institucion !== undefined
                ? input.contexto_institucion
                : current.contexto_operativo?.institucion ?? null,
            contexto_sede:
              input.contexto_sede !== undefined
                ? input.contexto_sede
                : current.contexto_operativo?.sede ?? null,
            contexto_modalidad:
              input.contexto_modalidad !== undefined
                ? input.contexto_modalidad
                : current.contexto_operativo?.modalidad ?? null,
            vinculacion_reemplazada_id:
              input.vinculacion_reemplazada_id !== undefined
                ? input.vinculacion_reemplazada_id
                : current.vinculacion_reemplazada_id
          },
          client
        )
      : {
          municipio_id:
            input.municipio_id !== undefined
              ? input.municipio_id
              : current.contexto_operativo?.municipio_id ?? null,
          institucion_id:
            input.institucion_id !== undefined
              ? input.institucion_id
              : current.contexto_operativo?.institucion_id ?? null,
          sede_id:
            input.sede_id !== undefined
              ? input.sede_id
              : current.contexto_operativo?.sede_id ?? null,
          modalidad_id:
            input.modalidad_id !== undefined
              ? input.modalidad_id
              : current.contexto_operativo?.modalidad_id ?? null,
          contexto_municipio:
            input.contexto_municipio !== undefined
              ? input.contexto_municipio
              : current.contexto_operativo?.municipio ?? null,
          contexto_institucion:
            input.contexto_institucion !== undefined
              ? input.contexto_institucion
              : current.contexto_operativo?.institucion ?? null,
          contexto_sede:
            input.contexto_sede !== undefined
              ? input.contexto_sede
              : current.contexto_operativo?.sede ?? null,
          contexto_modalidad:
            input.contexto_modalidad !== undefined
              ? input.contexto_modalidad
              : current.contexto_operativo?.modalidad ?? null
        };

    const tarifa =
      nextFecha === null
        ? null
        : await resolveNominaMovimientoTarifa(
            {
              contrato_id: periodo.contrato_id,
              fecha: nextFecha,
              tipo_movimiento: nextTipoMovimiento,
              municipio_id: contexto.municipio_id,
              institucion_id: contexto.institucion_id,
              sede_id: contexto.sede_id,
              modalidad_id: contexto.modalidad_id
            },
            client
          );

    const resolvedValues = resolveNominaMovimientoValue({
      cantidad:
        input.cantidad !== undefined ? input.cantidad : toOptionalNumberValue(current.cantidad),
      valor_aplicado:
        input.valor_aplicado !== undefined
          ? input.valor_aplicado
          : input.valor_total !== undefined
            ? input.valor_total
            : current.valor_aplicado,
      valor_calculado:
        input.valor_calculado !== undefined
          ? input.valor_calculado
          : toOptionalNumberValue(current.valor_calculado),
      valor_unitario:
        input.valor_unitario !== undefined
          ? input.valor_unitario
          : toOptionalNumberValue(current.valor_unitario) ??
            (tarifa ? toNumberValue(tarifa.valor_unitario) : null),
      motivo_ajuste_valor:
        input.motivo_ajuste_valor !== undefined
          ? input.motivo_ajuste_valor
          : current.motivo_ajuste_valor
    });

    let movimientoAlerts: NominaMovimientoAlerta[] = [];
    let posibleDuplicado = false;

    if (nextFecha) {
      const alertResolution = await buildNominaMovimientoAlerts(
        {
          fecha: nextFecha,
          movimientoId,
          periodo_id: current.periodo_id,
          tipo_movimiento: nextTipoMovimiento,
          vinculacion_id: current.vinculacion_id
        },
        client
      );
      movimientoAlerts = alertResolution.alerts;
      posibleDuplicado = alertResolution.posible_duplicado;
    }

    if (nextFamilia === 'ADICION_DEVENGO' && !tarifa) {
      movimientoAlerts = appendNominaMovimientoAlert(movimientoAlerts, {
        tipo: 'CONFIGURACION_TARIFA_FALTANTE',
        severidad: 'WARNING',
        mensaje:
          'No se encontro una tarifa vigente para el contexto del movimiento; se conserva el valor aplicado ingresado.',
        metadata: {
          tipo_movimiento: nextTipoMovimiento,
          contrato_id: periodo.contrato_id
        }
      });
    }

    if (movimientoAlerts.length > 0 && nextEstado === 'APROBADO') {
      throw new AppError(
        'The movement has validation alerts and must be reviewed before approval',
        409,
        'NOMINA_MOVIMIENTO_REQUIERE_REVISION',
        { alertas: movimientoAlerts }
      );
    }

    await client.query(
      `
        UPDATE nomina_movimientos
        SET
          fecha = $2::date,
          tipo_movimiento = $3,
          familia_movimiento = $4,
          estado = $5,
          descripcion = $6,
          cantidad = $7,
          valor_unitario = $8,
          valor_calculado = $9,
          valor_total = $10,
          documento_persona_id = $11::bigint,
          persona_reemplazada_id = $12::bigint,
          vinculacion_reemplazada_id = $13::bigint,
          municipio_id = $14::bigint,
          institucion_id = $15::bigint,
          sede_id = $16::bigint,
          modalidad_id = $17::bigint,
          contexto_municipio = $18,
          contexto_institucion = $19,
          contexto_sede = $20,
          contexto_modalidad = $21,
          tarifa_config_id = $22::bigint,
          motivo_ajuste_valor = $23,
          motivo_estado = $24,
          alertas_validacion = $25::jsonb,
          posible_duplicado = $26,
          revisado_por = CASE WHEN $5 = 'REVISADO' THEN $27::bigint ELSE revisado_por END,
          revisado_at = CASE WHEN $5 = 'REVISADO' THEN NOW() ELSE revisado_at END,
          aprobado_por = CASE WHEN $5 = 'APROBADO' THEN $27::bigint ELSE aprobado_por END,
          aprobado_at = CASE WHEN $5 = 'APROBADO' THEN NOW() ELSE aprobado_at END,
          rechazado_por = CASE WHEN $5 = 'RECHAZADO' THEN $27::bigint ELSE rechazado_por END,
          rechazado_at = CASE WHEN $5 = 'RECHAZADO' THEN NOW() ELSE rechazado_at END,
          es_devengado = $28,
          es_deduccion = $29,
          afecta_seguridad_social = $30,
          activo = $31,
          updated_at = NOW(),
          updated_by = $27::bigint
        WHERE id = $1::bigint
      `,
      [
        movimientoId,
        nextFecha,
        nextTipoMovimiento,
        nextFamilia,
        nextEstado,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        resolvedValues.cantidad,
        resolvedValues.valor_unitario,
        resolvedValues.valor_calculado,
        resolvedValues.valor_aplicado,
        input.documento_persona_id !== undefined
          ? input.documento_persona_id
          : current.documento_persona_id,
        input.persona_reemplazada_id !== undefined
          ? input.persona_reemplazada_id
          : current.persona_reemplazada?.id ?? null,
        input.vinculacion_reemplazada_id !== undefined
          ? input.vinculacion_reemplazada_id
          : current.vinculacion_reemplazada_id,
        contexto.municipio_id,
        contexto.institucion_id,
        contexto.sede_id,
        contexto.modalidad_id,
        contexto.contexto_municipio,
        contexto.contexto_institucion,
        contexto.contexto_sede,
        contexto.contexto_modalidad,
        tarifa?.id ?? input.tarifa_config_id ?? current.tarifa_config_id,
        resolvedValues.motivo_ajuste_valor,
        input.motivo_estado !== undefined ? input.motivo_estado : current.motivo_estado,
        JSON.stringify(movimientoAlerts),
        posibleDuplicado,
        actorUserId,
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

export const reviewNominaMovimiento = async (
  movimientoId: string,
  input: NominaMovimientoEstadoActionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  return updateNominaMovimiento(
    movimientoId,
    {
      estado: 'REVISADO',
      motivo_estado: input.motivo_estado ?? null
    },
    actorUserId,
    tenant,
    auditMeta
  );
};

export const approveNominaMovimiento = async (
  movimientoId: string,
  input: NominaMovimientoEstadoActionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  return updateNominaMovimiento(
    movimientoId,
    {
      estado: 'APROBADO',
      motivo_estado: input.motivo_estado ?? null
    },
    actorUserId,
    tenant,
    auditMeta
  );
};

export const rejectNominaMovimiento = async (
  movimientoId: string,
  input: NominaMovimientoEstadoActionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<NominaMovimiento> => {
  return updateNominaMovimiento(
    movimientoId,
    {
      estado: 'RECHAZADO',
      motivo_estado: input.motivo_estado ?? null
    },
    actorUserId,
    tenant,
    auditMeta
  );
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
    const empleado = await loadNominaEmpleadoByIdOrThrow(current.nomina_empleado_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'deactivating payroll movements');
    assertNominaEmpleadoEditable(empleado, 'anular movimientos de nomina');

    await client.query(
      `
        UPDATE nomina_movimientos
        SET
          activo = FALSE,
          updated_at = NOW(),
          updated_by = $2::bigint
        WHERE id = $1::bigint
      `,
      [movimientoId, actorUserId]
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
  appendNominaCoberturaScope(conditions, params, tenant);

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
      INNER JOIN nomina_periodos np ON np.id = nl.periodo_id
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
    await assertNominaPeriodoCoberturaScope(periodoId, tenant, client);

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
  appendNominaCoberturaScope(conditions, params, tenant);

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

  if (query.persona_id) {
    params.push(query.persona_id);
    conditions.push(`v.persona_id = $${params.length}::bigint`);
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

  const ordinaryRows = (
    await dbQuery<NominaNovedadRealRow>(
      `
        ${getNominaNovedadesRealSelect()}
        ${buildSqlWhere(conditions)}
        ORDER BY nn.created_at DESC, nn.id DESC
      `,
      params
    )
  ).rows.map(mapRealNovedad);

  const mergedItems = [...ordinaryRows];

  if (query.periodo_id) {
    const periodo = await loadRealPeriodoOrThrow(query.periodo_id, tenant);
    const periodoRange: NominaPeriodoDateRange = {
      start: toDateString(periodo.fecha_inicio) ?? '',
      end: toDateString(periodo.fecha_fin) ?? ''
    };
    const employeeRows = await loadNominaEmpleadoRowsForPeriodo(query.periodo_id, query, tenant);

    if (employeeRows.length > 0) {
      const catalog = await loadNominaTiposNovedadCatalog();
      const tiposById = new Map(catalog.map((item) => [item.id, item]));
      const canonicalRows = await loadNominaNovedadesCanonicasForPeriodo(
        dbPool,
        periodoRange,
        employeeRows.map((row) => row.vinculacion_id),
        { activeOnly: false }
      );
      const employeeByVinculacion = new Map(
        employeeRows.map((row) => [row.vinculacion_id, row])
      );

      for (const canonicalRow of canonicalRows) {
        const empleadoRow = employeeByVinculacion.get(canonicalRow.vinculacion_id);
        const tipo = tiposById.get(canonicalRow.tipo_novedad_id);

        if (!empleadoRow || !tipo) {
          continue;
        }

        if (query.tipo_novedad_id && canonicalRow.tipo_novedad_id !== query.tipo_novedad_id) {
          continue;
        }

        if (query.revisado === true) {
          continue;
        }

        if (query.activo !== undefined && query.activo !== toBooleanValue(canonicalRow.activo)) {
          continue;
        }

        const projected = buildProjectedNominaNovedadFromCanonica({
          canonical: canonicalRow,
          empleado: empleadoRow,
          periodo: periodoRange,
          tipo
        });

        if (projected) {
          mergedItems.push(projected);
        }
      }
    }
  }

  mergedItems.sort((left, right) => {
    const createdCompare = right.created_at.localeCompare(left.created_at);
    if (createdCompare !== 0) {
      return createdCompare;
    }

    return right.id.localeCompare(left.id);
  });

  const total = mergedItems.length;
  const offset = (query.page - 1) * query.limit;

  return {
    items: mergedItems.slice(offset, offset + query.limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const listNominaTiposNovedad = async (
  query: ListNominaTiposNovedadQuery
): Promise<PaginatedResponse<NominaTipoNovedadCatalogItem>> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (query.categoria) {
    params.push(query.categoria);
    conditions.push(`LOWER(categoria) = LOWER($${params.length})`);
  }

  if (query.busqueda) {
    params.push(`%${query.busqueda}%`);
    conditions.push(
      `(
        nombre ILIKE $${params.length}
        OR categoria ILIKE $${params.length}
        OR COALESCE(codigo_operativo, '') ILIKE $${params.length}
        OR COALESCE(descripcion_operativa, '') ILIKE $${params.length}
      )`
    );
  }

  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`COALESCE(activo, TRUE) = $${params.length}`);
  } else if (await hasInactiveNominaTiposNovedad()) {
    params.push(true);
    conditions.push(`COALESCE(activo, TRUE) = $${params.length}`);
  }

  const whereSql = buildSqlWhere(conditions);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM nomina_tipos_novedad
      ${whereSql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const result = await dbQuery<NominaTipoNovedadRow>(
    `
      ${getNominaTiposNovedadSelect()}
      ${whereSql}
      ORDER BY categoria ASC NULLS LAST, nombre ASC NULLS LAST, id ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapNominaTipoNovedad),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const getNominaTipoNovedadById = async (
  tipoNovedadId: string
): Promise<NominaTipoNovedadCatalogItem> => {
  const tipo = await loadNominaTipoNovedadByIdOrThrow(tipoNovedadId);
  return mapNominaTipoNovedad(tipo);
};

export const createNominaNovedad = async (
  input: CreateNominaNovedadInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta,
  clientOverride?: PoolClient
): Promise<NominaNovedad> => {
  const ownsClient = !clientOverride;
  const client = clientOverride ?? await dbPool.connect();

  try {
    if (ownsClient) await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(input.periodo_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'creating payroll novelties');

    const empleadoContext = await loadNominaEmpleadoContextOrThrow(input.nomina_empleado_id, tenant, client);
    const empleado = await loadNominaEmpleadoByIdOrThrow(input.nomina_empleado_id, tenant, client);
    const empleadoMapped = mapRealEmpleado(empleado);
    await assertNominaEmpleadoCoberturaScope(input.nomina_empleado_id, tenant, client);
    assertNominaEmpleadoEditable(empleado, 'registrar novedades de nomina');
    await invalidateNominaEmpleadoRevisionState(client, input.nomina_empleado_id);

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

    const tipoNovedad = await resolveNominaTipoNovedadOrThrow(
      {
        tipo_novedad_id: input.tipo_novedad_id,
        tipo_novedad_codigo: input.tipo_novedad_codigo,
        tipo_novedad_nombre: input.tipo_novedad_nombre
      },
      client
    );
    validateNovedadInputAgainstTipo(tipoNovedad, {
      fecha_inicio: input.fecha_inicio,
      fecha_fin: input.fecha_fin,
      dias: input.dias,
      horas: input.horas,
      valor_manual: input.valor_manual
    });

    const nextRange = resolveNominaNovedadDateRange({
      fecha_inicio: input.fecha_inicio,
      fecha_fin: input.fecha_fin
    });
    assertNominaNovedadRangeIntersectsPeriodo(nextRange, periodo);
    assertNominaNovedadRangeIntersectsVinculacion(nextRange, empleado);

    if (input.documento_persona_id) {
      await ensureDocumentoPersonaScope(input.documento_persona_id, empleado.persona_id, client);
    }

    const operativeRange = resolveNominaOperativaRango(
      nextRange?.fecha_inicio ?? input.fecha_inicio,
      nextRange?.fecha_fin ?? input.fecha_fin ?? input.fecha_inicio
    );

    if (operativeRange) {
      await replaceNominaAsistenciaPresentePorNovedad(
        client,
        input.periodo_id,
        input.vinculacion_id,
        operativeRange,
        tipoNovedad.codigo_operativo ?? tipoNovedad.nombre ?? 'NOVEDAD',
        input.reemplazar_asistencia_confirmado === true
      );
    }

    if (toNominaModeloRegistro(tipoNovedad.modelo_registro) === 'EVENTO_CANONICO_RANGO') {
      if (input.cobertura !== null && input.cobertura !== undefined) {
        throw new AppError(
          'Canonical payroll novelties do not support coverage capture',
          409,
          'NOMINA_NOVEDAD_CANONICA_COBERTURA_NO_PERMITIDA'
        );
      }

      if (!nextRange) {
        throw new AppError(
          'Canonical payroll novelties require fecha_inicio and fecha_fin',
          400,
          'NOMINA_NOVEDAD_CANONICA_FECHAS_REQUERIDAS'
        );
      }

      await ensureNoBlockingCanonicalOverlap(client, {
        vinculacion_id: input.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin
      });
      await ensureNoExactCanonicalDuplicate(client, {
        vinculacion_id: input.vinculacion_id,
        tipo_novedad_id: tipoNovedad.id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin
      });
      await ensureNoOrdinaryNovedadOverlapWithCanonical(client, {
        vinculacion_id: input.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin
      });
      await ensureCanonicalRangeDoesNotAffectClosedPeriods(client, {
        vinculacion_id: input.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin,
        excludePeriodoId: input.periodo_id
      });

      const result = await client.query<{ id: string }>(
        `
          INSERT INTO nomina_novedades_canonicas (
            vinculacion_id,
            tipo_novedad_id,
            tipo_novedad_codigo_operativo,
            documento_persona_id,
            fecha_inicio,
            fecha_fin,
            observacion,
            origen,
            activo
          )
          VALUES (
            $1::bigint,
            $2::bigint,
            $3,
            $4::bigint,
            $5::date,
            $6::date,
            $7,
            'NOMINA',
            $8
          )
          RETURNING id::text AS id
        `,
        [
          input.vinculacion_id,
          tipoNovedad.id,
          tipoNovedad.codigo_operativo,
          input.documento_persona_id,
          nextRange.fecha_inicio,
          nextRange.fecha_fin,
          input.observacion,
          input.activo
        ]
      );
      const createdRow = result.rows[0];

      if (!createdRow) {
        throw new AppError(
          'Failed to create canonical payroll novelty',
          500,
          'NOMINA_NOVEDAD_CANONICA_CREATE_FAILED'
        );
      }

      const canonical = await loadNominaNovedadCanonicaByIdOrThrow(createdRow.id, client);
      const empleadoRows = await loadNominaEmpleadoRowsForPeriodo(
        input.periodo_id,
        { nomina_empleado_id: input.nomina_empleado_id },
        tenant,
        client
      );
      const empleadoRow = empleadoRows[0];

      if (!empleadoRow) {
        throw new AppError(
          'Payroll employee not found for canonical novelty projection',
          404,
          'NOMINA_NOVEDAD_CANONICA_EMPLEADO_NOT_FOUND'
        );
      }

      const created = buildProjectedNominaNovedadFromCanonica({
        canonical,
        empleado: empleadoRow,
        periodo: {
          start: toDateString(periodo.fecha_inicio) ?? '',
          end: toDateString(periodo.fecha_fin) ?? ''
        },
        tipo: tipoNovedad
      });

      if (!created) {
        throw new AppError(
          'Canonical payroll novelty does not project into the selected period',
          409,
          'NOMINA_NOVEDAD_CANONICA_FUERA_PERIODO'
        );
      }

      await registerAuditEntry({
        client,
        usuario_id: actorUserId,
        accion: 'NOMINA_NOVEDAD_CANONICA_CREATE',
        tabla: 'nomina_novedades_canonicas',
        registro_id: canonical.id,
        descripcion: 'Creacion de evento canonico de nomina',
        before: null,
        after: created,
        ip: auditMeta?.ip ?? null,
        user_agent: auditMeta?.user_agent ?? null
      });

      if (ownsClient) {
        await client.query('COMMIT');
        await recalculateNominaPeriodo(input.periodo_id, { force: true }, actorUserId, tenant, auditMeta);
      }
      return created;
    }

    if (nextRange) {
      await ensureNoBlockingCanonicalOverlap(client, {
        vinculacion_id: input.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin
      });
    }

    const coverageFlags = resolveNominaNovedadCoberturaFlags(input.cobertura, {
      requiere_cobertura: input.requiere_cobertura,
      cubierta: input.cubierta
    });
    await assertNominaLinkedCoverageScope(client, input.periodo_id, input.cobertura, tenant);

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_novedades (
          periodo_id,
          nomina_empleado_id,
          vinculacion_id,
          tipo_novedad_id,
          tipo_novedad_codigo_operativo,
          documento_persona_id,
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
          $6::bigint,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::bigint,
          $13::bigint,
          $14,
          $15,
          $16,
          $17,
          $18
        )
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.nomina_empleado_id,
        input.vinculacion_id,
        tipoNovedad.id,
        tipoNovedad.codigo_operativo,
        input.documento_persona_id,
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
        coverageFlags.requiere_cobertura,
        coverageFlags.cubierta
      ]
    );

    const createdRow = result.rows[0];

    if (!createdRow) {
      throw new AppError('Failed to create payroll novelty', 500, 'NOMINA_NOVEDAD_CREATE_FAILED');
    }

    if (input.documento_persona_id) {
      await client.query(
        `INSERT INTO nomina_novedad_documentos (nomina_novedad_id, documento_persona_id, tipo_relacion, created_by)
         VALUES ($1::bigint, $2::bigint, 'SOPORTE_NOVEDAD', $3::bigint)
         ON CONFLICT (nomina_novedad_id, documento_persona_id) WHERE activo = TRUE DO NOTHING`,
        [createdRow.id, input.documento_persona_id, actorUserId]
      );
    }

    await syncNominaNovedadCobertura(client, {
      novedadId: createdRow.id,
      empleado: empleadoMapped,
      cobertura: input.cobertura
    });

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

    if (ownsClient) await client.query('COMMIT');
    return created;
  } catch (error) {
    if (ownsClient) await client.query('ROLLBACK');
    throw error;
  } finally { if (ownsClient) client.release(); }
};

export const markNominaAsistencia = async (periodoId: string, vinculacionId: string, fecha: string, presente: boolean, actorUserId: string, tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'marking payroll attendance');
    const empleado = await loadNominaEmpleadoOperativoContextByPeriodoVinculacionOrThrow(client, periodoId, vinculacionId);
    await assertNominaEmpleadoCoberturaScope(empleado.nomina_empleado_id, tenant, client);
    assertNominaEmpleadoEditable(empleado, 'modificar la asistencia');
    const vinc = await client.query<{ fecha_inicio: string; fecha_fin: string | null }>('SELECT fecha_inicio::text, fecha_fin::text FROM vinculaciones WHERE id=$1::bigint', [vinculacionId]);
    if (!vinc.rows[0]) throw new AppError('Vinculacion no encontrada', 404, 'NOMINA_ASISTENCIA_VINCULACION_INVALIDA');
    const v = vinc.rows[0];
    assertNominaFechaDentroDeVigencia(fecha, periodo, v);
    if (presente) {
      await assertNominaAsistenciaSinNovedadActiva(client, vinculacionId, { fecha_inicio: fecha, fecha_fin: fecha });
    }
    const existing = await client.query<{ id: string }>(`SELECT id::text FROM nomina_asistencia_diaria WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint AND fecha=$3::date ORDER BY id DESC LIMIT 1`, [periodoId, vinculacionId, fecha]);
    if (existing.rows[0]) await client.query(`UPDATE nomina_asistencia_diaria SET estado_dia=$2, activo=TRUE, observacion=$3 WHERE id=$1::bigint`, [existing.rows[0].id, presente ? 'PRESENTE' : 'PENDIENTE', presente ? 'Asistencia confirmada desde planilla' : 'Asistencia desmarcada']);
    else if (presente) await client.query(`INSERT INTO nomina_asistencia_diaria(periodo_id,vinculacion_id,fecha,estado_dia,activo,observacion) VALUES($1::bigint,$2::bigint,$3::date,'PRESENTE',TRUE,'Asistencia confirmada desde planilla')`, [periodoId, vinculacionId, fecha]);
    await invalidateNominaEmpleadoRevisionState(client, empleado.nomina_empleado_id);
    await registerAuditEntry({ client, usuario_id: actorUserId, accion: presente ? 'NOMINA_ASISTENCIA_CREATE' : 'NOMINA_ASISTENCIA_UPDATE', tabla: 'nomina_asistencia_diaria', registro_id: existing.rows[0]?.id ?? `${periodoId}:${vinculacionId}:${fecha}`, descripcion: 'Marcacion rapida de asistencia desde planilla', after: { periodo_id: periodoId, vinculacion_id: vinculacionId, fecha, presente }, ip: auditMeta?.ip ?? null, user_agent: auditMeta?.user_agent ?? null });
    await client.query('COMMIT');
    return { periodo_id: periodoId, vinculacion_id: vinculacionId, fecha, estado_dia: presente ? 'PRESENTE' : 'PENDIENTE', activo: presente };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const markNominaAsistenciaRango = async (periodoId: string, vinculacionId: string, fechaInicio: string, fechaFin: string, actorUserId: string, tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta) => {
  const start = new Date(`${fechaInicio}T12:00:00Z`);
  const end = new Date(`${fechaFin}T12:00:00Z`);
  if (start > end) throw new AppError('Rango de asistencia invalido', 400, 'NOMINA_ASISTENCIA_RANGO_INVALIDO');
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'marking payroll attendance range');
    const empleado = await loadNominaEmpleadoOperativoContextByPeriodoVinculacionOrThrow(client, periodoId, vinculacionId);
    await assertNominaEmpleadoCoberturaScope(empleado.nomina_empleado_id, tenant, client);
    assertNominaEmpleadoEditable(empleado, 'modificar la asistencia');
    const vinc = await client.query<{ fecha_inicio: string; fecha_fin: string | null }>('SELECT fecha_inicio::text, fecha_fin::text FROM vinculaciones WHERE id=$1::bigint', [vinculacionId]);
    if (!vinc.rows[0]) throw new AppError('Vinculacion no encontrada', 404, 'NOMINA_ASISTENCIA_VINCULACION_INVALIDA');
    const v = vinc.rows[0];
    assertNominaRangoDentroDePeriodo(fechaInicio, fechaFin, periodo, 'NOMINA_ASISTENCIA_FUERA_VIGENCIA');
    assertNominaRangoDentroDeVinculacion(fechaInicio, fechaFin, v, 'NOMINA_ASISTENCIA_FUERA_VIGENCIA');
    await assertNominaAsistenciaSinNovedadActiva(client, vinculacionId, { fecha_inicio: fechaInicio, fecha_fin: fechaFin });
    const marcados: string[] = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const fecha = cursor.toISOString().slice(0, 10);
      const existing = await client.query<{ id: string }>(`SELECT id::text FROM nomina_asistencia_diaria WHERE periodo_id=$1::bigint AND vinculacion_id=$2::bigint AND fecha=$3::date ORDER BY id DESC LIMIT 1`, [periodoId, vinculacionId, fecha]);
      if (existing.rows[0]) await client.query(`UPDATE nomina_asistencia_diaria SET estado_dia='PRESENTE', activo=TRUE, observacion='Asistencia confirmada desde planilla' WHERE id=$1::bigint`, [existing.rows[0].id]);
      else await client.query(`INSERT INTO nomina_asistencia_diaria(periodo_id,vinculacion_id,fecha,estado_dia,activo,observacion) VALUES($1::bigint,$2::bigint,$3::date,'PRESENTE',TRUE,'Asistencia confirmada desde planilla')`, [periodoId, vinculacionId, fecha]);
      marcados.push(fecha);
    }
    await invalidateNominaEmpleadoRevisionState(client, empleado.nomina_empleado_id);
    await registerAuditEntry({ client, usuario_id: actorUserId, accion: 'NOMINA_ASISTENCIA_RANGE_UPDATE', tabla: 'nomina_asistencia_diaria', registro_id: `${periodoId}:${vinculacionId}:${fechaInicio}:${fechaFin}`, descripcion: 'Marcacion atomica de asistencia por rango desde planilla', after: { periodo_id: periodoId, vinculacion_id: vinculacionId, fecha_inicio: fechaInicio, fecha_fin: fechaFin, marcados }, ip: auditMeta?.ip ?? null, user_agent: auditMeta?.user_agent ?? null });
    await client.query('COMMIT');
    return { marcados, omitidos: [], total_marcados: marcados.length, total_omitidos: 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const markNominaAsistenciaMasiva = async (periodoId: string, vinculaciones: string[], fechaInicio: string, fechaFin: string, actorUserId: string, tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta) => {
  if (!vinculaciones.length) throw new AppError('Debe seleccionar al menos un trabajador', 400, 'NOMINA_ASISTENCIA_SELECCION_REQUERIDA');
  const resultados = [] as Array<{ vinculacion_id: string; marcados: string[]; omitidos: Array<{ fecha: string; motivo: string }>; total_marcados: number; total_omitidos: number }>;
  for (const vinculacion_id of vinculaciones) {
    try {
      const result = await markNominaAsistenciaRango(periodoId, vinculacion_id, fechaInicio, fechaFin, actorUserId, tenant, auditMeta);
      resultados.push({ vinculacion_id, ...result });
    } catch (error) {
      resultados.push({ vinculacion_id, marcados: [], omitidos: [{ fecha: fechaInicio, motivo: error instanceof Error ? error.message : 'No se pudo marcar' }], total_marcados: 0, total_omitidos: 1 });
    }
  }
  return { trabajadores_procesados: resultados.length, resultados, dias_marcados: resultados.reduce((n, r) => n + r.total_marcados, 0), dias_omitidos: resultados.reduce((n, r) => n + r.total_omitidos, 0) };
};
export const createNominaNovedadConTurno = async (
  input: CreateNominaNovedadConTurnoInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
) => {
  const turno = input.turno ?? { tipo: 'INTERNO' as const, contexto_operativo: {}, persona_reemplazada_id: null, observacion: null };
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const novedad = await createNominaNovedad(input, actorUserId, tenant, auditMeta, client);
    const titularResult = await client.query<{
      persona_id: string;
      vinculacion_id: string;
      categoria_id: string | null;
      categoria_codigo: string | null;
      categoria_nombre: string | null;
    }>(
      `
        SELECT
          v.persona_id::text AS persona_id,
          v.id::text AS vinculacion_id,
          ne.categoria_salarial_id::text AS categoria_id,
          ncs.codigo_categoria,
          ncs.nombre_categoria
        FROM nomina_empleados ne
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id
        WHERE ne.id = $1::bigint AND ne.periodo_id = $2::bigint
        LIMIT 1
      `,
      [input.nomina_empleado_id, input.periodo_id]
    );
    const titular = titularResult.rows[0];
    if (!titular) {
      throw new AppError('La novedad no pertenece al periodo indicado', 409, 'NOMINA_TURNO_TITULAR_INVALIDO');
    }

    const turnoContextoRaw =
      turno.contexto_operativo && typeof turno.contexto_operativo === 'object'
        ? (turno.contexto_operativo as Record<string, unknown>)
        : {};
    const persistedTurnoContexto: Record<string, unknown> = {
      ...turnoContextoRaw
    };
    let turnoEmpleadoId = input.nomina_empleado_id;
    let turnoVinculacionId = input.vinculacion_id;
    let personaReemplazadaId = turno.persona_reemplazada_id;

    if (turno.tipo === 'INTERNO') {
      const coveredEmployeeId = typeof turno.contexto_operativo?.cobertura_interna_nomina_empleado_id === 'string'
        ? turno.contexto_operativo.cobertura_interna_nomina_empleado_id.trim()
        : '';
      if (!coveredEmployeeId) {
        throw new AppError('El turno interno requiere el trabajador que cubre', 400, 'NOMINA_TURNO_INTERNO_TRABAJADOR_REQUERIDO');
      }
      const coveredEmployee = await loadNominaEmpleadoByIdOrThrow(coveredEmployeeId, tenant, client);
      if (coveredEmployee.periodo_id !== input.periodo_id) {
        throw new AppError('El trabajador que cubre no pertenece al periodo', 409, 'NOMINA_TURNO_INTERNO_PERIODO_INVALIDO');
      }
      if (coveredEmployee.id === input.nomina_empleado_id) {
        throw new AppError('El trabajador que cubre debe ser distinto al titular', 409, 'NOMINA_TURNO_INTERNO_REEMPLAZO_INVALIDO');
      }
      turnoEmpleadoId = coveredEmployee.id;
      turnoVinculacionId = coveredEmployee.vinculacion_id;
      personaReemplazadaId = titular.persona_id;
      if (
        !persistedTurnoContexto.categoria_id &&
        !persistedTurnoContexto.categoria &&
        !persistedTurnoContexto.codigo_categoria
      ) {
        persistedTurnoContexto.categoria_id = titular.categoria_id ?? null;
        persistedTurnoContexto.categoria = titular.categoria_codigo ?? titular.categoria_nombre ?? null;
        persistedTurnoContexto.codigo_categoria = titular.categoria_codigo ?? null;
        persistedTurnoContexto.nombre_categoria = titular.categoria_nombre ?? null;
      }
    }
    let externoId: string | null = null;
    if (turno.tipo === 'EXTERNO') {
      const externalName = typeof turno.contexto_operativo?.persona_externa_nombre === 'string'
        ? turno.contexto_operativo.persona_externa_nombre.trim()
        : '';
      const externalDocument = typeof turno.contexto_operativo?.cobertura_documento_externo === 'string'
        ? turno.contexto_operativo.cobertura_documento_externo.trim()
        : '';
      if (!externalName || !externalDocument) {
        throw new AppError('La cobertura externa requiere nombre y documento', 400, 'COBERTURA_EXTERNO_IDENTIDAD_REQUERIDA');
      }
      const company = await client.query<{ empresa_id: string }>(
        `SELECT c.empresa_id::text FROM nomina_periodos np INNER JOIN contratos c ON c.id=np.contrato_id WHERE np.id=$1::bigint`,
        [input.periodo_id]
      );
      const empresaId = company.rows[0]?.empresa_id;
      if (!empresaId) throw new AppError('El periodo no tiene empresa asociada', 409, 'COBERTURA_EXTERNO_EMPRESA_INVALIDA');
      const external = await client.query<{ id: string }>(
        `INSERT INTO cobertura_externos (empresa_id,tipo_documento,numero_documento,nombre_completo)
         VALUES ($1,'CC',$2,$3)
         ON CONFLICT (empresa_id,tipo_documento,numero_documento) WHERE activo=TRUE
         DO UPDATE SET nombre_completo=EXCLUDED.nombre_completo,updated_at=NOW()
         RETURNING id::text AS id`,
        [empresaId, externalDocument, externalName]
      );
      externoId = external.rows[0]?.id ?? null;
    }
    const row = await client.query<{ id: string }>(
      `INSERT INTO nomina_novedad_turnos
       (periodo_id, nomina_novedad_id, nomina_empleado_id, vinculacion_id, tipo_turno,
        externo_id, persona_reemplazada_id, contexto_operativo, observacion, created_by, updated_by)
       VALUES ($1::bigint,$2::bigint,$3::bigint,$4::bigint,$5,$6::bigint,$7::bigint,$8::jsonb,$9,$10::bigint,$10::bigint)
       RETURNING id::text AS id`,
       [input.periodo_id, novedad.id, turnoEmpleadoId, turnoVinculacionId,
        turno.tipo, externoId, personaReemplazadaId,
        JSON.stringify(persistedTurnoContexto), turno.observacion, actorUserId]
    );
    const turnoRow = row.rows[0]; if (!turnoRow) throw new AppError('No fue posible crear relación de turno',500,'NOMINA_TURNO_CREATE_FAILED');
    const fechaTurno = input.fecha_inicio ?? input.fecha_fin ?? null;
    if (turno.tipo === 'INTERNO' && fechaTurno) {
      const duplicateMovement = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM nomina_movimientos
          WHERE periodo_id = $1::bigint
            AND nomina_empleado_id = $2::bigint
            AND vinculacion_reemplazada_id = $3::bigint
            AND fecha = $4::date
            AND tipo_movimiento = $5
            AND COALESCE(activo, TRUE) = TRUE
          LIMIT 1
        `,
        [input.periodo_id, turnoEmpleadoId, input.vinculacion_id, fechaTurno, 'TURNO_INTERNO']
      );
      const movementId = duplicateMovement.rows[0]?.id ?? (
        await client.query<{ id: string }>(
          `
            INSERT INTO nomina_movimientos (
              periodo_id, nomina_empleado_id, vinculacion_id, fecha, tipo_movimiento,
              familia_movimiento, estado, descripcion, valor_total, valor_calculado,
              persona_reemplazada_id, vinculacion_reemplazada_id, es_devengado,
              es_deduccion, afecta_seguridad_social, activo, updated_by
            )
            VALUES ($1::bigint, $2::bigint, $3::bigint, $4::date, 'TURNO_INTERNO',
              'ADICION_DEVENGO', 'APROBADO', $5, 0, 0, $6::bigint, $7::bigint,
              TRUE, FALSE, TRUE, TRUE, $8::bigint)
            RETURNING id::text AS id
          `,
          [
            input.periodo_id,
            turnoEmpleadoId,
            turnoVinculacionId,
            fechaTurno,
            turno.observacion ?? 'Turno interno de cobertura',
            personaReemplazadaId,
            input.vinculacion_id,
            actorUserId
          ]
        )
      ).rows[0]?.id ?? null;
      if (movementId) {
        await client.query(
          `UPDATE nomina_novedad_turnos SET movimiento_id = $2::bigint WHERE id = $1::bigint`,
          [turnoRow.id, movementId]
        );
      }
    }
    if (turno.tipo === 'EXTERNO' && externoId && fechaTurno) {
      const duplicateExternal = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM nomina_movimientos
          WHERE periodo_id = $1::bigint
            AND externo_id = $2::bigint
            AND fecha = $3::date
            AND tipo_movimiento = 'TURNO_EXTERNO'
            AND COALESCE(activo, TRUE) = TRUE
          LIMIT 1
        `,
        [input.periodo_id, externoId, fechaTurno]
      );
      const movementId = duplicateExternal.rows[0]?.id ?? (
        await client.query<{ id: string }>(
          `
            INSERT INTO nomina_movimientos (
              periodo_id, nomina_empleado_id, vinculacion_id, fecha, tipo_movimiento,
              familia_movimiento, estado, descripcion, valor_total, valor_calculado,
              externo_id, es_devengado, es_deduccion, afecta_seguridad_social,
              activo, updated_by
            )
            VALUES ($1::bigint, $2::bigint, $3::bigint, $4::date, 'TURNO_EXTERNO',
              'ADICION_DEVENGO', 'PENDIENTE', $5, 0, 0, $6::bigint,
              TRUE, FALSE, TRUE, TRUE, $7::bigint)
            RETURNING id::text AS id
          `,
          [input.periodo_id, turnoEmpleadoId, turnoVinculacionId, fechaTurno, turno.observacion ?? 'Turno externo de cobertura', externoId, actorUserId]
        )
      ).rows[0]?.id ?? null;
      if (movementId) {
        await client.query(
          `UPDATE nomina_novedad_turnos SET movimiento_id = $2::bigint WHERE id = $1::bigint`,
          [turnoRow.id, movementId]
        );
      }
    }
    await registerAuditEntry({ client, usuario_id: actorUserId, accion: 'NOMINA_NOVEDAD_TURNO_CREATE', tabla: 'nomina_novedad_turnos', registro_id: turnoRow.id, descripcion: 'Relacion de novedad con turno operativo', before: null, after: { novedad_id: novedad.id, tipo: turno.tipo }, ip: auditMeta?.ip ?? null, user_agent: auditMeta?.user_agent ?? null });
    await client.query('COMMIT');
    await recalculateNominaPeriodo(input.periodo_id, { force: true }, actorUserId, tenant, auditMeta);
    return { novedad, turno_id: turnoRow.id, turno };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
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
    const parsedId = parseNominaNovedadRecordId(novedadId);

    if (parsedId.registro_tipo === 'CANONICA_PROYECTADA') {
      const periodoId = parsedId.periodo_id;

      if (!periodoId) {
        throw new AppError(
          'Canonical payroll novelty id requires periodo_id context',
          400,
          'NOMINA_NOVEDAD_CANONICA_ID_INVALIDO'
        );
      }

      const current = await loadNominaNovedadCanonicaByIdOrThrow(parsedId.entidad_id, client);
      const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
      assertPeriodoAllowsOpenMutations(periodo.estado, 'updating canonical payroll novelties');

      const empleadoRows = await loadNominaEmpleadoRowsForPeriodo(
        periodoId,
        { vinculacion_id: current.vinculacion_id },
        tenant,
        client
      );
      const empleadoRow = empleadoRows[0];

      if (!empleadoRow) {
        throw new AppError(
          'Payroll employee not found for canonical novelty projection',
          404,
          'NOMINA_NOVEDAD_CANONICA_EMPLEADO_NOT_FOUND'
        );
      }

      const empleado = await loadNominaEmpleadoByIdOrThrow(empleadoRow.id, tenant, client);
      assertNominaEmpleadoEditable(empleado, 'editar novedades de nomina');
      await invalidateNominaEmpleadoRevisionState(client, empleadoRow.id);
      const currentTipo = await loadNominaTipoNovedadByIdOrThrow(current.tipo_novedad_id, client);
      const tipoNovedad = await resolveNominaTipoNovedadOrThrow(
        {
          tipo_novedad_id: input.tipo_novedad_id ?? current.tipo_novedad_id,
          tipo_novedad_codigo: input.tipo_novedad_codigo,
          tipo_novedad_nombre: input.tipo_novedad_nombre
        },
        client
      );

      if (toNominaModeloRegistro(tipoNovedad.modelo_registro) !== 'EVENTO_CANONICO_RANGO') {
        throw new AppError(
          'The selected novelty type must use canonical range storage',
          409,
          'NOMINA_NOVEDAD_CANONICA_TIPO_INVALIDO'
        );
      }

      const nextFechaInicio =
        input.fecha_inicio !== undefined ? input.fecha_inicio : toDateString(current.fecha_inicio);
      const nextFechaFin =
        input.fecha_fin !== undefined ? input.fecha_fin : toDateString(current.fecha_fin);
      const nextRange = resolveNominaNovedadDateRange({
        fecha_inicio: nextFechaInicio,
        fecha_fin: nextFechaFin
      });
      const nextDias =
        input.dias !== undefined
          ? input.dias
          : nextRange
            ? countInclusiveDays(nextRange.fecha_inicio, nextRange.fecha_fin)
            : null;
      const nextHoras = input.horas !== undefined ? input.horas : null;
      const nextValorManual = input.valor_manual !== undefined ? input.valor_manual : null;
      validateNovedadInputAgainstTipo(tipoNovedad, {
        fecha_inicio: nextFechaInicio,
        fecha_fin: nextFechaFin,
        dias: nextDias,
        horas: nextHoras,
        valor_manual: nextValorManual
      });

      if (!nextRange) {
        throw new AppError(
          'Canonical payroll novelties require fecha_inicio and fecha_fin',
          400,
          'NOMINA_NOVEDAD_CANONICA_FECHAS_REQUERIDAS'
        );
      }

      assertNominaNovedadRangeIntersectsPeriodo(nextRange, periodo);
      assertNominaNovedadRangeIntersectsVinculacion(nextRange, empleado);

      const operativeRange = resolveNominaOperativaRango(nextRange.fecha_inicio, nextRange.fecha_fin);
      if (!operativeRange) {
        throw new AppError('La novedad no tiene un rango operativo valido.', 400, 'NOMINA_NOVEDAD_RANGO_INVALIDO');
      }
      await replaceNominaAsistenciaPresentePorNovedad(
        client,
        periodoId,
        current.vinculacion_id,
        operativeRange,
        tipoNovedad.codigo_operativo ?? tipoNovedad.nombre ?? 'NOVEDAD',
        input.reemplazar_asistencia_confirmado === true
      );

      const nextDocumentoPersonaId =
        input.documento_persona_id !== undefined ? input.documento_persona_id : current.documento_persona_id;

      if (nextDocumentoPersonaId) {
        await ensureDocumentoPersonaScope(nextDocumentoPersonaId, empleado.persona_id, client);
      }

      await ensureNoBlockingCanonicalOverlap(client, {
        vinculacion_id: current.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin,
        excludeCanonicalId: current.id
      });
      await ensureNoExactCanonicalDuplicate(client, {
        vinculacion_id: current.vinculacion_id,
        tipo_novedad_id: tipoNovedad.id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin,
        excludeCanonicalId: current.id
      });
      await ensureNoOrdinaryNovedadOverlapWithCanonical(client, {
        vinculacion_id: current.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin
      });
      await ensureCanonicalRangeDoesNotAffectClosedPeriods(client, {
        vinculacion_id: current.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin,
        excludePeriodoId: periodoId
      });

      await client.query(
        `
          UPDATE nomina_novedades_canonicas
          SET
            tipo_novedad_id = $2::bigint,
            tipo_novedad_codigo_operativo = $3,
            documento_persona_id = $4::bigint,
            fecha_inicio = $5::date,
            fecha_fin = $6::date,
            observacion = $7,
            activo = $8,
            updated_at = NOW()
          WHERE id = $1::bigint
        `,
        [
          current.id,
          tipoNovedad.id,
          tipoNovedad.codigo_operativo,
          nextDocumentoPersonaId,
          nextRange.fecha_inicio,
          nextRange.fecha_fin,
          input.observacion !== undefined ? input.observacion : current.observacion,
          input.activo ?? toBooleanValue(current.activo)
        ]
      );

      const updatedCanonical = await loadNominaNovedadCanonicaByIdOrThrow(current.id, client);
      const updated = buildProjectedNominaNovedadFromCanonica({
        canonical: updatedCanonical,
        empleado: empleadoRow,
        periodo: {
          start: toDateString(periodo.fecha_inicio) ?? '',
          end: toDateString(periodo.fecha_fin) ?? ''
        },
        tipo: tipoNovedad
      });

      const before = buildProjectedNominaNovedadFromCanonica({
        canonical: current,
        empleado: empleadoRow,
        periodo: {
          start: toDateString(periodo.fecha_inicio) ?? '',
          end: toDateString(periodo.fecha_fin) ?? ''
        },
        tipo: currentTipo
      });

      await registerAuditEntry({
        client,
        usuario_id: actorUserId,
        accion: 'NOMINA_NOVEDAD_CANONICA_UPDATE',
        tabla: 'nomina_novedades_canonicas',
        registro_id: current.id,
        descripcion: 'Actualizacion de evento canonico de nomina',
        before,
        after: updated,
        ip: auditMeta?.ip ?? null,
        user_agent: auditMeta?.user_agent ?? null
      });

      await client.query('COMMIT');
      await recalculateNominaPeriodo(periodoId, { force: true }, actorUserId, tenant, auditMeta);
      if (updated) {
        return updated;
      }

      return {
        id: buildNominaCanonicalProjectedRecordId(current.id, periodoId),
        periodo_id: periodoId,
        nomina_empleado_id: empleadoRow.id,
        vinculacion_id: current.vinculacion_id,
        documento_persona_id: updatedCanonical.documento_persona_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin,
        fecha_inicio_evento_canonico: nextRange.fecha_inicio,
        fecha_fin_evento_canonico: nextRange.fecha_fin,
        dias: null,
        horas: null,
        valor_manual: null,
        categoria_anterior_id: null,
        categoria_nueva_id: null,
        observacion:
          (input.observacion !== undefined ? input.observacion : current.observacion) ?? null,
        revisado: false,
        activo: input.activo ?? toBooleanValue(updatedCanonical.activo),
        created_at: toIsoString(updatedCanonical.created_at) ?? '',
        requiere_cobertura: false,
        cubierta: false,
        cobertura: null,
        documentos: {
          SOPORTE: {
            cargado: Boolean(updatedCanonical.documento_persona_id),
            documento_persona_id: updatedCanonical.documento_persona_id,
            requerido: toBooleanValue(tipoNovedad.requiere_soporte),
            tipo: 'SOPORTE',
          },
          SOLICITUD_PERMISO: {
            cargado: false,
            documento_persona_id: null,
            requerido: toBooleanValue(tipoNovedad.requiere_solicitud_permiso),
            tipo: 'SOLICITUD_PERMISO',
          },
        },
        registro_tipo: 'CANONICA_PROYECTADA',
        evento_canonico_id: updatedCanonical.id,
        tipo_novedad: {
          ...mapNominaTipoNovedad(tipoNovedad),
          codigo_operativo_registrado:
            updatedCanonical.tipo_novedad_codigo_snapshot ?? tipoNovedad.codigo_operativo
        },
        persona: {
          nombre_completo: empleado.persona.nombre_completo,
          numero_documento: empleado.persona.numero_documento,
          primer_apellido: empleado.persona.primer_apellido,
          primer_nombre: empleado.persona.primer_nombre,
          segundo_apellido: empleado.persona.segundo_apellido,
          segundo_nombre: empleado.persona.segundo_nombre
        }
      };
    }

    const current = await loadNominaNovedadByIdOrThrow(parsedId.entidad_id, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    const empleado = await loadNominaEmpleadoByIdOrThrow(current.nomina_empleado_id, tenant, client);
    const empleadoMapped = mapRealEmpleado(empleado);
    await assertNominaEmpleadoCoberturaScope(current.nomina_empleado_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'updating payroll novelties');
    assertNominaEmpleadoEditable(empleado, 'editar novedades de nomina');
    await invalidateNominaEmpleadoRevisionState(client, current.nomina_empleado_id);

    const tipoNovedad = await resolveNominaTipoNovedadOrThrow(
      {
        tipo_novedad_id: input.tipo_novedad_id ?? current.tipo_novedad_id,
        tipo_novedad_codigo: input.tipo_novedad_codigo,
        tipo_novedad_nombre: input.tipo_novedad_nombre
      },
      client
    );

    if (toNominaModeloRegistro(tipoNovedad.modelo_registro) === 'EVENTO_CANONICO_RANGO') {
      throw new AppError(
        'Ordinary payroll novelties cannot be converted into canonical range events',
        409,
        'NOMINA_NOVEDAD_CAMBIO_MODELO_INVALIDO'
      );
    }

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
    validateNovedadInputAgainstTipo(tipoNovedad, {
      fecha_inicio: nextFechaInicio,
      fecha_fin: nextFechaFin,
      dias: nextDias,
      horas: nextHoras,
      valor_manual: nextValorManual
    });

    const nextRange = resolveNominaNovedadDateRange({
      fecha_inicio: nextFechaInicio,
      fecha_fin: nextFechaFin
    });
    assertNominaNovedadRangeIntersectsPeriodo(nextRange, periodo);
    assertNominaNovedadRangeIntersectsVinculacion(nextRange, empleado);

    const operativeRange = resolveNominaOperativaRango(
      nextRange?.fecha_inicio ?? nextFechaInicio,
      nextRange?.fecha_fin ?? nextFechaFin ?? nextFechaInicio
    );
    if (operativeRange) {
      await replaceNominaAsistenciaPresentePorNovedad(
        client,
        current.periodo_id,
        current.vinculacion_id,
        operativeRange,
        tipoNovedad.codigo_operativo ?? tipoNovedad.nombre ?? 'NOVEDAD',
        input.reemplazar_asistencia_confirmado === true
      );
    }

    const nextDocumentoPersonaId =
      input.documento_persona_id !== undefined ? input.documento_persona_id : current.documento_persona_id;

    if (nextDocumentoPersonaId) {
      await ensureDocumentoPersonaScope(nextDocumentoPersonaId, empleado.persona_id, client);
    }

    if (nextRange) {
      await ensureNoBlockingCanonicalOverlap(client, {
        vinculacion_id: current.vinculacion_id,
        fecha_inicio: nextRange.fecha_inicio,
        fecha_fin: nextRange.fecha_fin,
        excludeNovedadId: parsedId.entidad_id
      });
    }

    const coverageInput =
      input.cobertura !== undefined ? input.cobertura : current.cobertura;
    const coverageFlags = resolveNominaNovedadCoberturaFlags(coverageInput, {
      requiere_cobertura:
        input.requiere_cobertura !== undefined
          ? input.requiere_cobertura
          : toBooleanValue(current.requiere_cobertura),
      cubierta:
        input.cubierta !== undefined ? input.cubierta : toBooleanValue(current.cubierta)
    });
    await assertNominaLinkedCoverageScope(client, current.periodo_id, coverageInput, tenant);

    await client.query(
      `
        UPDATE nomina_novedades
        SET
          tipo_novedad_id = $2::bigint,
          tipo_novedad_codigo_operativo = $3,
          documento_persona_id = $4::bigint,
          fecha_inicio = $5,
          fecha_fin = $6,
          dias = $7,
          horas = $8,
          valor_manual = $9,
          categoria_anterior_id = $10::bigint,
          categoria_nueva_id = $11::bigint,
          observacion = $12,
          revisado = $13,
          requiere_cobertura = $14,
          cubierta = $15,
          activo = $16
        WHERE id = $1::bigint
      `,
      [
        parsedId.entidad_id,
        tipoNovedad.id,
        tipoNovedad.codigo_operativo,
        nextDocumentoPersonaId,
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
        coverageFlags.requiere_cobertura,
        coverageFlags.cubierta,
        input.activo ?? current.activo
      ]
    );

    await syncNominaNovedadCobertura(client, {
      novedadId: parsedId.entidad_id,
      empleado: empleadoMapped,
      cobertura: input.cobertura
    });

    const updated = mapRealNovedad(await loadNominaNovedadByIdOrThrow(parsedId.entidad_id, tenant, client));
    const before = mapRealNovedad(current);

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_NOVEDAD_UPDATE',
      tabla: 'nomina_novedades',
      registro_id: parsedId.entidad_id,
      descripcion: 'Actualizacion de novedad de nomina',
      before,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    await recalculateNominaPeriodo(current.periodo_id, { force: true }, actorUserId, tenant, auditMeta);
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
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
    const parsedId = parseNominaNovedadRecordId(novedadId);

    if (parsedId.registro_tipo === 'CANONICA_PROYECTADA') {
      const periodoId = parsedId.periodo_id;

      if (!periodoId) {
        throw new AppError(
          'Canonical payroll novelty id requires periodo_id context',
          400,
          'NOMINA_NOVEDAD_CANONICA_ID_INVALIDO'
        );
      }

      const current = await loadNominaNovedadCanonicaByIdOrThrow(parsedId.entidad_id, client);
      const periodo = await loadRealPeriodoOrThrow(periodoId, tenant, client);
      assertPeriodoAllowsOpenMutations(periodo.estado, 'deactivating canonical payroll novelties');

      await ensureCanonicalRangeDoesNotAffectClosedPeriods(client, {
        vinculacion_id: current.vinculacion_id,
        fecha_inicio: toDateString(current.fecha_inicio) ?? '',
        fecha_fin: toDateString(current.fecha_fin) ?? '',
        excludePeriodoId: periodoId
      });

      const empleadoRows = await loadNominaEmpleadoRowsForPeriodo(
        periodoId,
        { vinculacion_id: current.vinculacion_id },
        tenant,
        client
      );
      const empleadoRow = empleadoRows[0];
      if (!empleadoRow) throw new AppError('Payroll employee not found for canonical novelty projection',404,'NOMINA_NOVEDAD_CANONICA_EMPLEADO_NOT_FOUND');
      const empleado = await loadNominaEmpleadoByIdOrThrow(empleadoRow.id, tenant, client);
      assertNominaEmpleadoEditable(empleado, 'anular novedades de nomina');
      await invalidateNominaEmpleadoRevisionState(client, empleadoRow.id);
      const tipo = await loadNominaTipoNovedadByIdOrThrow(current.tipo_novedad_id, client);
      const before = empleadoRow
        ? buildProjectedNominaNovedadFromCanonica({
            canonical: current,
            empleado: empleadoRow,
            periodo: {
              start: toDateString(periodo.fecha_inicio) ?? '',
              end: toDateString(periodo.fecha_fin) ?? ''
            },
            tipo
          })
        : null;

      await client.query(
        `
          UPDATE nomina_novedades_canonicas
          SET
            activo = FALSE,
            updated_at = NOW()
          WHERE id = $1::bigint
        `,
        [current.id]
      );

      const updatedCanonical = await loadNominaNovedadCanonicaByIdOrThrow(current.id, client);
      const after = empleadoRow
        ? buildProjectedNominaNovedadFromCanonica({
            canonical: updatedCanonical,
            empleado: empleadoRow,
            periodo: {
              start: toDateString(periodo.fecha_inicio) ?? '',
              end: toDateString(periodo.fecha_fin) ?? ''
            },
            tipo
          })
        : null;

      await registerAuditEntry({
        client,
        usuario_id: actorUserId,
        accion: 'NOMINA_NOVEDAD_CANONICA_DEACTIVATE',
        tabla: 'nomina_novedades_canonicas',
        registro_id: current.id,
        descripcion: 'Desactivacion de evento canonico de nomina',
        before,
        after,
        ip: auditMeta?.ip ?? null,
        user_agent: auditMeta?.user_agent ?? null
      });

      await client.query('COMMIT');
      await recalculateNominaPeriodo(periodoId, { force: true }, actorUserId, tenant, auditMeta);

      if (after) {
        return after;
      }

      return {
        id: buildNominaCanonicalProjectedRecordId(current.id, periodoId),
        periodo_id: periodoId,
        nomina_empleado_id: empleadoRow?.id ?? '',
        vinculacion_id: current.vinculacion_id,
        documento_persona_id: current.documento_persona_id,
        fecha_inicio: toDateString(current.fecha_inicio),
        fecha_fin: toDateString(current.fecha_fin),
        fecha_inicio_evento_canonico: toDateString(current.fecha_inicio),
        fecha_fin_evento_canonico: toDateString(current.fecha_fin),
        dias: null,
        horas: null,
        valor_manual: null,
        categoria_anterior_id: null,
        categoria_nueva_id: null,
        observacion: current.observacion,
        revisado: false,
        activo: false,
        created_at: toIsoString(current.created_at) ?? '',
        requiere_cobertura: false,
        cubierta: false,
        cobertura: null,
        documentos: {
          SOPORTE: {
            cargado: Boolean(current.documento_persona_id),
            documento_persona_id: current.documento_persona_id,
            requerido: toBooleanValue(tipo.requiere_soporte),
            tipo: 'SOPORTE',
          },
          SOLICITUD_PERMISO: {
            cargado: false,
            documento_persona_id: null,
            requerido: toBooleanValue(tipo.requiere_solicitud_permiso),
            tipo: 'SOLICITUD_PERMISO',
          },
        },
        registro_tipo: 'CANONICA_PROYECTADA',
        evento_canonico_id: current.id,
        tipo_novedad: {
          ...mapNominaTipoNovedad(tipo),
          codigo_operativo_registrado:
            current.tipo_novedad_codigo_snapshot ?? tipo.codigo_operativo
        },
        persona: {
          nombre_completo: '',
          numero_documento: null,
          primer_apellido: null,
          primer_nombre: null,
          segundo_apellido: null,
          segundo_nombre: null
        }
      };
    }

    const current = await loadNominaNovedadByIdOrThrow(parsedId.entidad_id, tenant, client);
    const periodo = await loadRealPeriodoOrThrow(current.periodo_id, tenant, client);
    const empleado = await loadNominaEmpleadoByIdOrThrow(current.nomina_empleado_id, tenant, client);
    assertPeriodoAllowsOpenMutations(periodo.estado, 'deactivating payroll novelties');
    assertNominaEmpleadoEditable(empleado, 'anular novedades de nomina');
    await invalidateNominaEmpleadoRevisionState(client, current.nomina_empleado_id);

    await client.query(
      `
        UPDATE nomina_novedades
        SET activo = FALSE
        WHERE id = $1::bigint
      `,
      [parsedId.entidad_id]
    );

    // A replacement cannot remain economically active after its source novelty is cancelled.
    await client.query(
      `
        UPDATE nomina_novedad_turnos
        SET activo = FALSE, updated_by = $2::bigint, updated_at = NOW()
        WHERE nomina_novedad_id = $1::bigint
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [parsedId.entidad_id, actorUserId]
    );

    await client.query(
      `
        UPDATE nomina_movimientos
        SET
          activo = FALSE,
          motivo_estado = COALESCE(motivo_estado, 'NOVEDAD_ANULADA'),
          updated_by = $2::bigint,
          updated_at = NOW()
        WHERE id IN (
          SELECT movimiento_id
          FROM nomina_novedad_turnos
          WHERE nomina_novedad_id = $1::bigint
            AND movimiento_id IS NOT NULL
        )
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [parsedId.entidad_id, actorUserId]
    );

    const updated = mapRealNovedad(
      await loadNominaNovedadByIdOrThrow(parsedId.entidad_id, tenant, client)
    );

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'NOMINA_NOVEDAD_DEACTIVATE',
      tabla: 'nomina_novedades',
      registro_id: parsedId.entidad_id,
      descripcion: 'Desactivacion de novedad de nomina',
      before: mapRealNovedad(current),
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    await recalculateNominaPeriodo(current.periodo_id, { force: true }, actorUserId, tenant, auditMeta);
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
          AND COALESCE(nm.estado, 'APROBADO') = 'APROBADO'
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
  'codigo_operativo',
  'codigo_operativo_registrado',
  'tipo_novedad',
  'categoria',
  'descripcion_operativa',
  'afecta_salario',
  'afecta_transporte',
  'afecta_dias_laborados',
  'afecta_recargos',
  'afecta_cobertura',
  'efecto_pago',
  'es_adicion',
  'es_deduccion',
  'es_incapacidad',
  'es_accidente_laboral',
  'es_permiso',
  'es_suspension',
  'es_evento_operativo',
  'requiere_soporte',
  'permite_rango',
  'requiere_revision',
  'documento_persona_id',
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
    codigo_operativo: item.tipo_novedad.codigo_operativo,
    codigo_operativo_registrado: item.tipo_novedad.codigo_operativo_registrado,
    tipo_novedad: item.tipo_novedad.nombre,
    categoria: item.tipo_novedad.categoria,
    descripcion_operativa: item.tipo_novedad.descripcion_operativa,
    afecta_salario: item.tipo_novedad.afecta_salario,
    afecta_transporte: item.tipo_novedad.afecta_transporte,
    afecta_dias_laborados: item.tipo_novedad.afecta_dias_laborados,
    afecta_recargos: item.tipo_novedad.afecta_recargos,
    afecta_cobertura: item.tipo_novedad.afecta_cobertura,
    efecto_pago: item.tipo_novedad.efecto_pago,
    es_adicion: item.tipo_novedad.es_adicion,
    es_deduccion: item.tipo_novedad.es_deduccion,
    es_incapacidad: item.tipo_novedad.es_incapacidad,
    es_accidente_laboral: item.tipo_novedad.es_accidente_laboral,
    es_permiso: item.tipo_novedad.es_permiso,
    es_suspension: item.tipo_novedad.es_suspension,
    es_evento_operativo: item.tipo_novedad.es_evento_operativo,
    requiere_soporte: item.tipo_novedad.requiere_soporte,
    permite_rango: item.tipo_novedad.permite_rango,
    requiere_revision: item.tipo_novedad.requiere_revision,
    documento_persona_id: item.documento_persona_id,
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

