export type NominaPeriodoTipo = 'PRIMERA_QUINCENA' | 'SEGUNDA_QUINCENA' | 'MENSUAL';

export type NominaPeriodoEstado = 'ABIERTO' | 'REVISADO' | 'CERRADO' | 'PAGADO' | 'ANULADO';

export type NominaExportTipo =
  | 'resumen'
  | 'dashboard'
  | 'plano_bancario'
  | 'empleados'
  | 'novedades'
  | 'movimientos'
  | 'desprendibles'
  | 'liquidaciones'
  | 'todo';

export interface NominaPaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export type NominaEntityId = string | number;

export const NOMINA_CORRECCION_ESTADOS = [
  'BORRADOR',
  'SOLICITADA',
  'EN_REVISION',
  'APROBADA',
  'RECHAZADA',
  'APLICADA',
  'ANULADA',
] as const;

export type NominaCorreccionEstado = (typeof NOMINA_CORRECCION_ESTADOS)[number];

export const NOMINA_CORRECCION_FILTER_ESTADOS = [
  'BORRADOR',
  'SOLICITADA',
  'EN_REVISION',
  'APROBADA',
  'RECHAZADA',
  'ANULADA',
] as const;

export const NOMINA_CORRECCION_TIPOS = [
  'DEVENGADO',
  'DEDUCCION',
  'NOVEDAD',
  'MOVIMIENTO',
  'LIQUIDACION',
  'DESPRENDIBLE',
  'OTRO',
] as const;

export type NominaCorreccionTipo = (typeof NOMINA_CORRECCION_TIPOS)[number];

export const NOMINA_CORRECCION_FILTER_TIPOS = [
  'DEVENGADO',
  'DEDUCCION',
  'NOVEDAD',
  'MOVIMIENTO',
  'LIQUIDACION',
  'DESPRENDIBLE',
  'OTRO',
] as const;

export interface NominaCorreccionPeriodoApi {
  id: NominaEntityId;
  nombre_periodo: string;
  estado: string;
  contrato_id?: NominaEntityId | null;
  empresa_id?: NominaEntityId | null;
}

export interface NominaCorreccionEmpleadoApi {
  nomina_empleado_id: NominaEntityId;
  vinculacion_id: NominaEntityId;
  persona_id?: NominaEntityId | null;
  nombre_completo?: string | null;
  numero_documento?: string | null;
}

export interface NominaCorreccionValoresApi {
  valor_anterior: number;
  valor_nuevo: number;
  diferencia: number;
}

export interface NominaCorreccionFechasApi {
  fecha_solicitud?: string | null;
  fecha_revision?: string | null;
  fecha_aprobacion?: string | null;
  fecha_aplicacion?: string | null;
}

export interface NominaCorreccionActoresApi {
  solicitado_por?: NominaEntityId | null;
  revisado_por?: NominaEntityId | null;
  aprobado_por?: NominaEntityId | null;
  aplicado_por?: NominaEntityId | null;
}

export interface NominaCorreccionReferenciasApi {
  movimiento_id?: NominaEntityId | null;
  novedad_id?: NominaEntityId | null;
  liquidacion_id?: NominaEntityId | null;
  desprendible_origen_id?: NominaEntityId | null;
  desprendible_resultado_id?: NominaEntityId | null;
}

export interface NominaCorreccionAplicacionApi {
  soportada: boolean;
  motivo?: string | null;
}

export interface NominaCorreccion {
  id: NominaEntityId;
  periodo: NominaCorreccionPeriodoApi;
  empleado: NominaCorreccionEmpleadoApi;
  tipo_correccion: NominaCorreccionTipo | string;
  concepto: string;
  motivo: string;
  valores: NominaCorreccionValoresApi;
  estado: NominaCorreccionEstado | string;
  observacion_revision?: string | null;
  actores?: NominaCorreccionActoresApi;
  fechas?: NominaCorreccionFechasApi;
  referencias?: NominaCorreccionReferenciasApi;
  activo: boolean;
  created_at: string;
  updated_at: string;
  aplicacion?: NominaCorreccionAplicacionApi;
}

export type NominaCorreccionListItem = NominaCorreccion;

export type NominaCorreccionDetalle = NominaCorreccion;

export interface NominaCorreccionFilters {
  periodo_id?: NominaEntityId;
  nomina_empleado_id?: NominaEntityId;
  vinculacion_id?: NominaEntityId;
  estado?: NominaCorreccionEstado | string;
  tipo_correccion?: NominaCorreccionTipo | string;
  activo?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateNominaCorreccionPayload {
  periodo_id: NominaEntityId;
  nomina_empleado_id: NominaEntityId;
  vinculacion_id: NominaEntityId;
  tipo_correccion: NominaCorreccionTipo;
  concepto: string;
  motivo: string;
  valor_anterior: number;
  valor_nuevo: number;
  observacion_revision?: string | null;
  movimiento_id?: NominaEntityId | null;
  novedad_id?: NominaEntityId | null;
  liquidacion_id?: NominaEntityId | null;
  desprendible_origen_id?: NominaEntityId | null;
}

export interface UpdateNominaCorreccionPayload {
  tipo_correccion?: NominaCorreccionTipo;
  concepto?: string;
  motivo?: string;
  valor_anterior?: number;
  valor_nuevo?: number;
  observacion_revision?: string | null;
  movimiento_id?: NominaEntityId | null;
  novedad_id?: NominaEntityId | null;
  liquidacion_id?: NominaEntityId | null;
  desprendible_origen_id?: NominaEntityId | null;
}

export interface NominaCorreccionTransitionPayload {
  observacion_revision?: string | null;
}

export interface NominaCorreccionesResponse {
  items: NominaCorreccionListItem[];
  pagination: NominaPaginationMeta;
}

export interface NominaPeriodosQuery {
  contrato_id?: string;
  empresa_id?: string;
  estado?: NominaPeriodoEstado;
  page?: number;
  limit?: number;
}

export interface NominaPeriodoContratoApi {
  id: string;
  empresa_id: string | null;
  entidad_contratante: string | null;
  fecha_finalizacion: string | null;
  fecha_inicio: string | null;
  numero_contrato: string | null;
}

export interface NominaPeriodoApi {
  id: string;
  contrato_id: string | null;
  nombre_periodo: string;
  tipo_periodo: NominaPeriodoTipo | string;
  fecha_inicio: string;
  fecha_fin: string;
  requiere_asistencia: boolean;
  estado: NominaPeriodoEstado | string;
  activo: boolean;
  created_at: string;
  contrato: NominaPeriodoContratoApi | null;
}

export interface PaginatedNominaPeriodosApi {
  items: NominaPeriodoApi[];
  pagination: NominaPaginationMeta;
}

export interface NominaPeriodoDashboardApi {
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
  total_dias_novedades: number;
  total_otros: number;
  total_pension: number;
  total_salud: number;
  total_transporte: number;
}

export interface NominaPeriodoActionApi {
  force?: boolean;
  nomina_empleado_id?: string;
}

export interface NominaPeriodoActionResultApi {
  forced?: boolean;
}

export type NominaMovimientoTipo =
  | 'HORA_EXTRA_DIURNA'
  | 'HORA_EXTRA_NOCTURNA'
  | 'RECARGO_NOCTURNO'
  | 'DOMINICAL'
  | 'FESTIVO'
  | 'TURNO_INTERNO'
  | 'TURNO_EXTERNO'
  | 'BONIFICACION'
  | 'AUXILIO'
  | 'ADICION_MANUAL'
  | 'DESCUENTO_MANUAL'
  | 'EMBARGO'
  | 'LIBRANZA'
  | 'AJUSTE';

export interface NominaMovimientosQuery {
  periodo_id?: string;
  nomina_empleado_id?: string;
  vinculacion_id?: string;
  tipo_movimiento?: NominaMovimientoTipo;
  estado?: 'PENDIENTE' | 'REVISADO' | 'APROBADO' | 'RECHAZADO';
  familia_movimiento?: 'GENERAL' | 'ADICION_DEVENGO' | 'CAMBIO_OPERATIVO';
  activo?: boolean;
  page?: number;
  limit?: number;
}

export interface NominaMovimientoApi {
  externo_id: string | null;
  activo: boolean;
  afecta_seguridad_social: boolean;
  alertas_validacion: Array<{
    tipo: string;
    severidad: 'INFO' | 'WARNING' | 'ERROR';
    mensaje: string;
    codigo?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  aprobado_at: string | null;
  aprobado_por: string | null;
  cantidad: number | null;
  contexto_operativo: {
    municipio_id: string | null;
    municipio: string | null;
    institucion_id: string | null;
    institucion: string | null;
    sede_id: string | null;
    sede: string | null;
    modalidad_id: string | null;
    modalidad: string | null;
  } | null;
  created_at: string;
  descripcion: string | null;
  documento_persona_id: string | null;
  es_deduccion: boolean;
  es_devengado: boolean;
  estado: 'PENDIENTE' | 'REVISADO' | 'APROBADO' | 'RECHAZADO';
  fecha: string | null;
  familia_movimiento: 'GENERAL' | 'ADICION_DEVENGO' | 'CAMBIO_OPERATIVO' | string;
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
  tipo_movimiento: NominaMovimientoTipo | string;
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

export interface PaginatedNominaMovimientosApi {
  items: NominaMovimientoApi[];
  pagination: NominaPaginationMeta;
}

export interface CreateNominaMovimientoApi {
  periodo_id: string;
  nomina_empleado_id: string;
  vinculacion_id: string;
  fecha?: string | null;
  tipo_movimiento: NominaMovimientoTipo;
  familia_movimiento?: 'GENERAL' | 'ADICION_DEVENGO' | 'CAMBIO_OPERATIVO';
  estado?: 'PENDIENTE' | 'REVISADO' | 'APROBADO' | 'RECHAZADO';
  descripcion?: string | null;
  cantidad?: number | null;
  valor_calculado?: number | null;
  valor_aplicado?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  motivo_ajuste_valor?: string | null;
  motivo_estado?: string | null;
  documento_persona_id?: string | null;
  persona_reemplazada_id?: string | null;
  vinculacion_reemplazada_id?: string | null;
  municipio_id?: string | null;
  institucion_id?: string | null;
  sede_id?: string | null;
  modalidad_id?: string | null;
  contexto_municipio?: string | null;
  contexto_institucion?: string | null;
  contexto_sede?: string | null;
  contexto_modalidad?: string | null;
  tarifa_config_id?: string | null;
  es_devengado?: boolean;
  es_deduccion?: boolean;
  afecta_seguridad_social?: boolean;
  activo?: boolean;
}

export interface UpdateNominaMovimientoApi {
  fecha?: string | null;
  tipo_movimiento?: NominaMovimientoTipo;
  familia_movimiento?: 'GENERAL' | 'ADICION_DEVENGO' | 'CAMBIO_OPERATIVO';
  estado?: 'PENDIENTE' | 'REVISADO' | 'APROBADO' | 'RECHAZADO';
  descripcion?: string | null;
  cantidad?: number | null;
  valor_calculado?: number | null;
  valor_aplicado?: number | null;
  valor_unitario?: number | null;
  valor_total?: number;
  motivo_ajuste_valor?: string | null;
  motivo_estado?: string | null;
  documento_persona_id?: string | null;
  persona_reemplazada_id?: string | null;
  vinculacion_reemplazada_id?: string | null;
  municipio_id?: string | null;
  institucion_id?: string | null;
  sede_id?: string | null;
  modalidad_id?: string | null;
  contexto_municipio?: string | null;
  contexto_institucion?: string | null;
  contexto_sede?: string | null;
  contexto_modalidad?: string | null;
  tarifa_config_id?: string | null;
  es_devengado?: boolean;
  es_deduccion?: boolean;
  afecta_seguridad_social?: boolean;
  activo?: boolean;
}

export interface NominaNovedadTurnoOperativoApi {
  activo: boolean;
  cedula_cargada: boolean;
  certificacion_bancaria_cargada: boolean;
  cuenta_cobro_cargada: boolean;
  contexto_operativo: Record<string, unknown> | null;
  documentos_completos: boolean;
  externo_documento: string | null;
  externo_id: string | null;
  externo_nombre: string | null;
  fecha: string | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  id: string;
  institucion: string | null;
  modalidad: string | null;
  movimiento_id: string | null;
  movimiento_activo: boolean;
  movimiento_afecta_seguridad_social: boolean;
  movimiento_alertas_validacion: Array<{
    codigo?: string | null;
    mensaje: string;
    metadata?: Record<string, unknown> | null;
    severidad: 'INFO' | 'WARNING' | 'ERROR';
    tipo: string;
  }>;
  movimiento_cantidad: number | null;
  movimiento_descripcion: string | null;
  movimiento_estado: string | null;
  movimiento_tipo: string;
  movimiento_valor_aplicado: number | null;
  movimiento_valor_calculado: number | null;
  municipio: string | null;
  motivo: string | null;
  novedad_id: string;
  novedad_tipo_codigo: string | null;
  novedad_tipo_nombre: string | null;
  nomina_empleado_id: string;
  origen_cobertura: string | null;
  periodo_id: string;
  sede: string | null;
  tipo_turno: "INTERNO" | "EXTERNO";
  trabajador_cubre: string;
  trabajador_cubre_documento: string | null;
  trabajador_reemplazado: string;
  trabajador_reemplazado_documento: string | null;
  vinculacion_id: string;
  estado: string;
}

export interface CoberturaExternoResumenApi {
  id: string;
  empresa_id: string;
  tipo_documento: string;
  numero_documento: string;
  nombre_completo: string;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  turnos: number;
  turnos_con_tarifa: number;
  turnos_sin_tarifa: number;
  dias_turnos: number;
  dias_listos: number;
  valor_listo: number;
  valor_total: number;
  cedula: boolean;
  banco_doc: boolean;
  cuenta_id: string | null;
  cuenta_estado: 'PENDIENTE' | 'GENERADA' | 'FIRMADA' | string;
}

export type AjusteManualTipo = 'ADICION' | 'DEDUCCION';
export interface AjusteManualApi {
  id: string; empresa_id: string; contrato_id: string; periodo_id: string; nomina_empleado_id: string;
  tipo: AjusteManualTipo; concepto: string; observacion: string | null; valor: number;
  documento_soporte_id: string | null; activo: boolean; created_by: string; created_at: string;
  updated_at: string; anulado_by: string | null; anulado_at: string | null; motivo_anulacion: string | null;
  empleado: string; numero_documento: string | null;
}

export const NOMINA_TURNO_OPERATIVO_TIPOS = ['TURNO_INTERNO', 'TURNO_EXTERNO'] as const;
export const NOMINA_TURNO_MOVIMIENTO_TIPO = 'TURNO_EXTERNO' as const;

export type NominaTurnoMovimientoTipo = (typeof NOMINA_TURNO_OPERATIVO_TIPOS)[number];

export interface NominaTurno extends Omit<NominaMovimientoApi, 'tipo_movimiento'> {
  tipo_movimiento: NominaTurnoMovimientoTipo;
}

export type NominaTurnoFilters = Omit<NominaMovimientosQuery, 'tipo_movimiento'>;

export interface PaginatedNominaTurnosApi {
  items: NominaTurno[];
  pagination: NominaPaginationMeta;
}

export type CreateNominaTurnoPayload = Omit<CreateNominaMovimientoApi, 'tipo_movimiento'>;

export type UpdateNominaTurnoPayload = Omit<UpdateNominaMovimientoApi, 'tipo_movimiento'>;

export interface CreateNominaPeriodoApi {
  nombre_periodo: string;
  tipo_periodo: NominaPeriodoTipo;
  fecha_inicio: string;
  fecha_fin: string;
  contrato_id: string;
  requiere_asistencia?: boolean;
  activo?: boolean;
}

export interface NominaPeriodoEmpleadosQuery {
  contrato_id?: string;
  empresa_id?: string;
  gestor_usuario_id?: string;
  sin_gestor?: boolean;
  vinculacion_id?: string;
  persona_id?: string;
  estado?: string;
  revisado?: boolean;
  page?: number;
  limit?: number;
}

export interface NominaPersonaResumenApi {
  id: string;
  nombre_completo: string;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface NominaVinculacionResumenApi {
  id: string;
  empresa_id: string;
  contrato_id: string;
  estado_vinculacion: string | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  metodo_pago: string | null;
  cotiza_pension: boolean;
}

export interface NominaCargoApi {
  id: string | null;
  nombre_cargo: string | null;
}

export interface NominaCategoriaSalarialApi {
  id: string;
  auxilio_transporte: number;
  codigo_categoria: string | null;
  modalidad: string | null;
  nombre_categoria: string | null;
  otros_recargos: number;
  salario_base: number;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
}

export interface NominaEmpleadoEstadoDocumentalApi {
  porcentaje_cumplimiento: number | null;
  total_cargados: number;
  total_faltantes: number;
  total_requeridos: number;
}

export interface NominaEmpleadoApi {
  id: string;
  periodo_id: string;
  vinculacion_id: string;
  gestor?: {
    id: string;
    nombre_completo: string;
    origen: 'PERSONAL' | 'MUNICIPIO' | 'MUNICIPIO_AMBIGUO';
  } | null;
  contexto_operativo?: {
    municipio: string | null;
    institucion: string | null;
    sede: string | null;
    modalidad_id: string | null;
    modalidad_codigo: string | null;
    modalidad_descripcion: string | null;
  } | null;
  metodo_liquidacion: string | null;
  salario_base: number;
  auxilio_transporte: number;
  otros_devengos: number;
  fecha_inicio_pago: string | null;
  fecha_fin_pago: string | null;
  dias_periodo: number;
  dias_pagados: number;
  horas_trabajadas: number;
  horas_extra_total: number;
  devengado_basico: number;
  devengado_transporte: number;
  devengado_otros: number;
  total_adiciones: number;
  total_deducciones: number;
  salud: number;
  pension: number;
  neto_pagar: number;
  revisado: boolean;
  estado: string | null;
  activo: boolean;
  created_at: string;
  detalle_calculo?: Record<string, unknown> | null;
  motivo_caso_especial: string | null;
  municipio?: string | null;
  institucion?: string | null;
  contrato_id?: string | number | null;
  numero_contrato?: string | null;
  sede?: {
    id: string | null;
    municipio: string | null;
    nombre_sede: string | null;
  } | null;
  modalidad?: string | null;
  total_novedades?: number;
  total_dias_novedades?: number;
  clasificacion?: string | null;
  estado_documental?: NominaEmpleadoEstadoDocumentalApi | null;
  persona: NominaPersonaResumenApi;
  vinculacion: NominaVinculacionResumenApi;
  cargo: NominaCargoApi | null;
  categoria_salarial: NominaCategoriaSalarialApi | null;
}

export interface PaginatedNominaEmpleadosApi {
  items: NominaEmpleadoApi[];
  pagination: NominaPaginationMeta;
}

export interface NominaNovedadesQuery {
  periodo_id?: string;
  nomina_empleado_id?: string;
  vinculacion_id?: string;
  persona_id?: string;
  tipo_novedad_id?: string;
  revisado?: boolean;
  activo?: boolean;
  page?: number;
  limit?: number;
}

export interface NominaTipoNovedad {
  id: string;
  codigo_operativo: string | null;
  nombre: string | null;
  categoria: string | null;
  descripcion_operativa: string | null;
  afecta_salario: boolean;
  afecta_transporte: boolean;
  afecta_dias_laborados: boolean | null;
  afecta_recargos: boolean | null;
  afecta_cobertura: boolean | null;
  efecto_salario: string;
  efecto_auxilio_transporte: string;
  efecto_recargos: string;
  efecto_liquidacion: string;
  efecto_cobertura: string;
  efecto_operativo: string;
  efecto_pago: string | null;
  modelo_registro: string;
  proyecta_periodos: boolean;
  bloquea_otras_novedades: boolean;
  grupo_exclusividad: string;
  observacion_plantilla: string | null;
  es_adicion: boolean;
  es_incapacidad: boolean;
  es_accidente_laboral: boolean;
  es_permiso: boolean;
  es_suspension: boolean;
  es_evento_operativo: boolean;
  es_deduccion: boolean;
  requiere_soporte: boolean;
  permite_rango: boolean;
  requiere_revision: boolean;
  requiere_solicitud_permiso: boolean;
  soporte_documento_tipo: string | null;
  requiere_fechas: boolean;
  requiere_dias: boolean;
  requiere_horas: boolean;
  requiere_valor: boolean;
  activo: boolean;
  created_at: string;
}

export interface NominaTipoNovedadFilters {
  empresa_id?: string;
  activo?: boolean;
  busqueda?: string;
  categoria?: string;
  page?: number;
  limit?: number;
}

export interface NominaTipoNovedadResponse {
  items: NominaTipoNovedad[];
  pagination: NominaPaginationMeta;
}

export type NominaNovedadTipoApi = Omit<NominaTipoNovedad, "created_at">;

export interface NominaNovedadPersonaApi {
  nombre_completo: string;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface NominaNovedadApi {
  id: string;
  periodo_id: string;
  nomina_empleado_id: string;
  vinculacion_id: string;
  documento_persona_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_inicio_evento_canonico: string | null;
  fecha_fin_evento_canonico: string | null;
  dias: number | null;
  horas: number | null;
  valor_manual: number | null;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  observacion: string | null;
  revisado: boolean;
  activo: boolean;
  created_at: string;
  requiere_cobertura: boolean;
  cubierta: boolean;
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
    tipo_cobertura: 'SIN_REEMPLAZO' | 'PERSONAL_VINCULADO' | 'PERSONA_EXTERNA';
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
  registro_tipo: 'ORDINARIA' | 'CANONICA_PROYECTADA';
  evento_canonico_id: string | null;
  tipo_novedad: NominaNovedadTipoApi;
  persona: NominaNovedadPersonaApi;
}

export interface NominaNovedadDocumentoDetalleApi {
  documento_persona_id: string;
  id: string;
  mime_type: string;
  nombre_original: string;
  tipo: 'SOPORTE' | 'SOLICITUD_PERMISO';
  url: string;
  version: number;
}

export interface NominaNovedadDocumentoEstadoApi {
  cargado: boolean;
  documento: NominaNovedadDocumentoDetalleApi | null;
  requerido: boolean;
  tipo: 'SOPORTE' | 'SOLICITUD_PERMISO';
}

export interface NominaNovedadDocumentosApi {
  novedad_id: string;
  slots: {
    SOPORTE: NominaNovedadDocumentoEstadoApi;
    SOLICITUD_PERMISO: NominaNovedadDocumentoEstadoApi;
  };
}

export interface PaginatedNominaNovedadesApi {
  items: NominaNovedadApi[];
  pagination: NominaPaginationMeta;
}

export interface CreateNominaNovedadApi {
  periodo_id: string;
  nomina_empleado_id: string;
  vinculacion_id: string;
  tipo_novedad_id?: string;
  tipo_novedad_codigo?: string | null;
  tipo_novedad_nombre?: string | null;
  documento_persona_id?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  dias?: number | null;
  horas?: number | null;
  valor_manual?: number | null;
  categoria_anterior_id?: string | null;
  categoria_nueva_id?: string | null;
  observacion?: string | null;
  reemplazar_asistencia_confirmado?: boolean;
  revisado?: boolean;
  requiere_cobertura?: boolean;
  cubierta?: boolean;
  cobertura?: {
    tipo_cobertura: 'SIN_REEMPLAZO' | 'PERSONAL_VINCULADO' | 'PERSONA_EXTERNA';
    persona_cubre_id?: string | null;
    vinculacion_cubre_id?: string | null;
    nombre_externo?: string | null;
    documento_externo?: string | null;
    observacion_externa?: string | null;
    observacion_interna?: string | null;
  } | null;
  activo?: boolean;
}
export interface CreateNominaNovedadConTurnoApi extends CreateNominaNovedadApi { turno: { tipo: 'INTERNO'|'EXTERNO'; contexto_operativo?: Record<string, unknown>; persona_reemplazada_id?: string|null; observacion?: string|null } }
export interface RevisionOperativaApi { nomina_empleado_id:string; periodo_id:string; persona_id:string; vinculacion_id:string; estado_revision:'PENDIENTE'|'REVISADO'|'REQUIERE_REVISION'; revisado_por?:string|null; revisado_at?:string|null; invalidado_at?:string|null; motivo_invalidacion?:string|null; nomina_estado?: string | null; nomina_revisado?: boolean | null }
export interface NominaEmpleadoOperativoStateApi { nomina_empleado_id:string; periodo_id:string; persona_id:string; vinculacion_id:string; estado:'PENDIENTE'|'REVISADO'|'CERRADO'; revision_estado:'PENDIENTE'|'REVISADO'|'REQUIERE_REVISION'; revisado:boolean; revisado_at?:string|null; invalidado_at?:string|null; motivo_invalidacion?:string|null }

export interface UpdateNominaNovedadApi {
  tipo_novedad_id?: string;
  tipo_novedad_codigo?: string | null;
  tipo_novedad_nombre?: string | null;
  documento_persona_id?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  dias?: number | null;
  horas?: number | null;
  valor_manual?: number | null;
  categoria_anterior_id?: string | null;
  categoria_nueva_id?: string | null;
  observacion?: string | null;
  reemplazar_asistencia_confirmado?: boolean;
  revisado?: boolean;
  requiere_cobertura?: boolean;
  cubierta?: boolean;
  cobertura?: {
    tipo_cobertura: 'SIN_REEMPLAZO' | 'PERSONAL_VINCULADO' | 'PERSONA_EXTERNA';
    persona_cubre_id?: string | null;
    vinculacion_cubre_id?: string | null;
    nombre_externo?: string | null;
    documento_externo?: string | null;
    observacion_externa?: string | null;
    observacion_interna?: string | null;
  } | null;
  activo?: boolean;
}

export type NominaLiquidacionEstado = 'GENERADA' | 'PRELIMINAR' | 'FINAL';

export type NominaLiquidacionEstadoFilter = 'PRELIMINAR' | 'FINAL';

export interface NominaLiquidacionFilters {
  contrato_id?: string;
  empresa_id?: string;
  vinculacion_id?: string;
  persona_id?: string;
  estado?: NominaLiquidacionEstadoFilter;
  page?: number;
  limit?: number;
}

export interface NominaLiquidacionPersonaApi {
  id: string;
  nombre_completo: string;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface NominaLiquidacionVinculacionApi {
  id: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado_vinculacion: string | null;
  motivo_retiro: string | null;
}

export interface NominaLiquidacionContratoApi {
  empresa_id: string | null;
  entidad_contratante: string | null;
  id: string;
  numero_contrato: string | null;
}

export interface NominaLiquidacionPeriodoApi {
  estado: string;
  fecha_fin: string;
  fecha_inicio: string;
  id: string;
  nombre_periodo: string;
}

export interface NominaLiquidacion {
  activo: boolean;
  archivo_path: string | null;
  auxilio_transporte: number;
  auxilio_transporte_snapshot: number;
  cargo_nombre_snapshot: string | null;
  cesantias: number;
  contrato: NominaLiquidacionContratoApi;
  contrato_id: string;
  contrato_nombre_snapshot: string | null;
  created_at: string;
  deduccion_pension: number;
  deduccion_salud: number;
  deducciones: number;
  devengado_salario: number;
  devengado_transporte: number;
  dias_base_liquidacion: number;
  dias_con_transporte: number;
  dias_liquidados: number;
  dias_trabajados: number;
  dias_vacaciones_pendientes: number;
  documento_persona_id: string | null;
  empresa_id: string | null;
  estado: NominaLiquidacionEstado | string;
  fecha_fin_vinculacion: string | null;
  fecha_fin_vinculacion_snapshot?: string | null;
  fecha_inicio_vinculacion: string | null;
  fecha_inicio_vinculacion_snapshot?: string;
  fecha_retiro: string | null;
  id: string;
  intereses_cesantias: number;
  motivo_retiro: string | null;
  neto_pagar: number;
  novedades_snapshot: Record<string, unknown> | null;
  observacion: string | null;
  otros_devengos: number;
  periodo: NominaLiquidacionPeriodoApi;
  periodo_id: string;
  persona: NominaLiquidacionPersonaApi;
  persona_id: string;
  persona_nombre_snapshot: string;
  prima_servicios: number;
  promedio_auxilio_transporte: number;
  promedio_salario: number;
  salario_base: number;
  salario_base_snapshot: number;
  total_adiciones: number;
  total_deducciones: number;
  total_devengado: number;
  total_liquidacion: number;
  updated_at?: string;
  vacaciones: number;
  valor_dia_salario: number;
  valor_dia_transporte: number;
  vinculacion: NominaLiquidacionVinculacionApi;
  vinculacion_id: string;
}

export interface PaginatedNominaLiquidacionesApi {
  items: NominaLiquidacion[];
  pagination: NominaPaginationMeta;
}

export interface NominaExportRequest {
  include_versiones?: boolean;
  tipo?: NominaExportTipo;
}

export interface NominaExportMetadata {
  content_type: string | null;
  file_name: string;
}

export interface NominaDesprendiblesQuery {
  include_versiones?: boolean;
}

export type NominaDesprendibleFilters = NominaDesprendiblesQuery;

export interface NominaDesprendibleDocumentoApi {
  documento_persona_id: string | null;
  mime_type: string | null;
  nombre_original: string | null;
  signed_url?: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
}

export interface NominaDesprendibleEmpresaApi {
  nit: string | null;
  nombre_empresa: string | null;
}

export interface NominaDesprendiblePeriodoApi {
  estado: string;
  fecha_fin: string;
  fecha_inicio: string;
  id: string;
  nombre_periodo: string;
}

export interface NominaDesprendibleApi {
  activo: boolean;
  archivo_path: string | null;
  created_at: string;
  desprendible_reemplaza_id: string | null;
  dias_liquidados: number;
  devengado_salario: number;
  devengado_transporte: number;
  documento: NominaDesprendibleDocumentoApi;
  empresa: NominaDesprendibleEmpresaApi;
  es_vigente: boolean;
  estado: string;
  fecha_generacion: string | null;
  id: string;
  liquidacion_id?: string | null;
  neto_pagar: number;
  nomina_empleado_id: string;
  observacion: string | null;
  payload_snapshot: Record<string, unknown>;
  pension: number;
  periodo: NominaDesprendiblePeriodoApi;
  periodo_id: string;
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
  vinculacion_id: string;
}

export interface GenerateNominaDesprendiblesResponse {
  desprendibles_generados: number;
  periodo: NominaPeriodoApi;
}

export interface GenerateNominaLiquidacionesResponse {
  liquidaciones_generadas: number;
  periodo: NominaPeriodoApi;
  empleados_procesados: number;
  omitidas_activas?: number;
  omitidas_fuera_periodo?: number;
}





