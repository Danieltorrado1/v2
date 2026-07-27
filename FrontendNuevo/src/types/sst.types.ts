import type { PersonaApi, PersonaListItem, VinculacionApi, VinculacionExpedienteApi } from './personas.types';

export type SstEventoTipo =
  | 'ACCIDENTE_TRABAJO'
  | 'INCIDENTE'
  | 'ENFERMEDAD_LABORAL'
  | 'CAPACITACION'
  | 'ENTREGA_EPP'
  | 'OTRO';

export type SstEventoEstado = 'ABIERTO' | 'EN_PROCESO' | 'CERRADO' | 'ANULADO';
export type SstEventoGravedad = 'LEVE' | 'MODERADA' | 'GRAVE' | 'CRITICA';
export type SstPlanEstado = 'PENDIENTE' | 'EN_PROCESO' | 'CERRADO' | 'ANULADO';
export type SstPlanOrigen = 'EVENTO' | 'INSPECCION' | 'HALLAZGO' | 'ACCIDENTE';
export type SstAccidenteTipo = 'ACCIDENTE_TRABAJO' | 'INCIDENTE' | 'CASI_ACCIDENTE';
export type SstAccidenteSeveridad = 'LEVE' | 'MODERADO' | 'GRAVE' | 'MORTAL';
export type SstAccidenteEstado = 'ABIERTO' | 'EN_INVESTIGACION' | 'CERRADO';
export type SstAccionEstado = 'ABIERTA' | 'EN_PROCESO' | 'CERRADA' | 'VENCIDA';
export type SstInspeccionTipo =
  | 'LOCATIVA'
  | 'COCINA'
  | 'EPP'
  | 'EXTINTORES'
  | 'BOTIQUINES'
  | 'VEHICULOS'
  | 'ALMACENAMIENTO'
  | 'RIESGO_BIOLOGICO'
  | 'RIESGO_QUIMICO'
  | 'OTRO';
export type SstInspeccionEstado = 'PROGRAMADA' | 'REALIZADA' | 'CANCELADA' | 'VENCIDA';
export type SstHallazgoTipo =
  | 'CONDICION_INSEGURA'
  | 'ACTO_INSEGURO'
  | 'NO_CONFORMIDAD'
  | 'OBSERVACION'
  | 'OPORTUNIDAD_MEJORA';
export type SstHallazgoNivel = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type SstIndicadorClasificacion = 'CRITICO' | 'MEDIO' | 'BUENO' | 'EXCELENTE';
export type SstIndicadorAlertaTipo = 'INDICADOR_CRITICO' | 'INDICADOR_BAJO_CUMPLIMIENTO';

export interface SstPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface SstPaginatedResult<T> {
  items: T[];
  pagination: SstPagination;
}

export interface SstEmpresaRef {
  id: number;
  nombre_empresa: string | null;
}

export interface SstContratoRef {
  id: number;
  numero_contrato: string | null;
}

export interface SstPersonaRef {
  id: number;
  numero_documento: string;
  nombre_completo: string;
}

export interface SstVinculacionRef {
  id: string;
  persona_id: string | number | null;
  contrato_id: string | number | null;
  empresa_id: string | number | null;
  estado_vinculacion: string | null;
}

export interface SstEvento {
  id: string;
  tipo_evento: SstEventoTipo;
  fecha_evento: string;
  hora_evento: string | null;
  lugar: string | null;
  descripcion: string | null;
  gravedad: SstEventoGravedad | null;
  requiere_investigacion: boolean;
  estado: SstEventoEstado;
  activo: boolean;
  created_at: string;
  vinculacion: SstVinculacionRef | null;
}

export interface SstEventoFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  vinculacion_id?: string | null;
  tipo_evento?: SstEventoTipo | null;
  gravedad?: SstEventoGravedad | null;
  estado?: SstEventoEstado | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  activo?: boolean | null;
  search?: string | null;
  page?: number;
  limit?: number;
}

export interface CreateSstEventoPayload {
  vinculacion_id: string;
  tipo_evento: SstEventoTipo;
  fecha_evento: string;
  hora_evento?: string | null;
  lugar?: string | null;
  descripcion?: string | null;
  gravedad?: SstEventoGravedad | null;
  requiere_investigacion?: boolean;
  estado?: SstEventoEstado;
  activo?: boolean;
}

export interface UpdateSstEventoPayload {
  vinculacion_id?: string;
  tipo_evento?: SstEventoTipo;
  fecha_evento?: string;
  hora_evento?: string | null;
  lugar?: string | null;
  descripcion?: string | null;
  gravedad?: SstEventoGravedad | null;
  requiere_investigacion?: boolean;
  estado?: SstEventoEstado;
  activo?: boolean;
}

export interface SstPlanOrigenRelacionado {
  empresa_id: string | null;
  contrato_id: string | null;
  vinculacion_id: string | null;
  inspeccion_id: string | null;
}

export interface SstPlanAccion {
  id: string;
  origen: SstPlanOrigen;
  origen_id: string;
  responsable: string | null;
  descripcion: string;
  fecha_compromiso: string | null;
  fecha_cierre: string | null;
  estado: SstPlanEstado;
  activo: boolean;
  created_at: string;
  origen_relacionado: SstPlanOrigenRelacionado | null;
}

export interface SstPlanFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  origen?: SstPlanOrigen | null;
  origen_id?: string | null;
  responsable?: string | null;
  estado?: SstPlanEstado | null;
  fecha_compromiso_desde?: string | null;
  fecha_compromiso_hasta?: string | null;
  activo?: boolean | null;
  search?: string | null;
  page?: number;
  limit?: number;
}

export interface CreateSstPlanPayload {
  origen: SstPlanOrigen;
  origen_id: string;
  responsable?: string | null;
  descripcion: string;
  fecha_compromiso?: string | null;
  fecha_cierre?: string | null;
  estado?: SstPlanEstado;
  activo?: boolean;
}

export interface UpdateSstPlanPayload {
  origen?: SstPlanOrigen;
  origen_id?: string;
  responsable?: string | null;
  descripcion?: string;
  fecha_compromiso?: string | null;
  fecha_cierre?: string | null;
  estado?: SstPlanEstado;
  activo?: boolean;
}

export interface CloseSstPlanPayload {
  fecha_cierre: string;
}

export interface SstIndicadorCatalogo {
  id: string;
  nombre_indicador: string;
  formula: string | null;
  periodicidad: string | null;
  unidad: string | null;
  activo: boolean;
  created_at: string;
}

export interface SstIndicadorPeriodoCatalogo {
  id: string;
  empresa_id: string;
  contrato_id: string | null;
  nombre_periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  created_at: string;
}

export interface SstIndicadorMedicion {
  id: string;
  indicador_id: string;
  nombre_indicador: string;
  formula: string | null;
  periodicidad: string | null;
  unidad: string | null;
  contrato_id: string | null;
  periodo: string;
  valor_numerador: number | null;
  valor_denominador: number | null;
  resultado: number | null;
  observaciones: string | null;
  activo: boolean;
  created_at: string;
}

export interface SstIndicadoresOverview {
  catalogo: SstIndicadorCatalogo[];
  periodos: SstIndicadorPeriodoCatalogo[];
  mediciones: SstIndicadorMedicion[];
}

export interface SstIndicadorPeriodo {
  id: number;
  empresa: SstEmpresaRef;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  nombre_periodo: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  created_at: string;
}

export interface SstIndicadoresPeriodosFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  activo?: boolean | null;
  search?: string | null;
  page?: number;
  limit?: number;
}

export interface SstIndicadorDashboard {
  periodo: SstIndicadorPeriodo;
  accidentalidad: {
    accidentes_total: number;
    incidentes_total: number;
    dias_incapacidad_total: number;
    investigaciones_pendientes: number;
    investigaciones_cerradas: number;
  };
  frecuencia: {
    indice_frecuencia: number;
  };
  severidad: {
    indice_severidad: number;
  };
  capacitaciones: {
    capacitaciones_total: number;
    capacitaciones_vigentes: number;
    capacitaciones_vencidas: number;
    cumplimiento_capacitaciones: number;
  };
  examenes: {
    examenes_total: number;
    examenes_vigentes: number;
    examenes_vencidos: number;
    cumplimiento_examenes: number;
  };
  dotacion: {
    epp_total: number;
    epp_vigentes: number;
    epp_vencidos: number;
    cumplimiento_epp: number;
  };
  inspecciones: {
    inspecciones_total: number;
    hallazgos_criticos: number;
    acciones_abiertas: number;
    acciones_cerradas: number;
    cumplimiento_inspecciones: number;
  };
  riesgos: {
    riesgos_altos: number;
    riesgos_criticos: number;
    cumplimiento_riesgos: number;
  };
  plan_anual: {
    actividades_ejecutadas: number;
    actividades_programadas: number;
    actividades_vencidas: number;
    cumplimiento_plan_anual: number;
  };
  indicadores_generales: {
    clasificacion: SstIndicadorClasificacion;
    cumplimiento_general_sst: number;
  };
}

export interface SstIndicadorHistorico {
  items: SstIndicadorDashboard[];
}

export interface SstIndicadorAlerta {
  id: string;
  tipo_alerta: SstIndicadorAlertaTipo;
  severidad: 'CRITICA' | 'ALTA';
  estado: 'ACTIVA';
  fecha_alerta: string;
  clasificacion: SstIndicadorClasificacion;
  cumplimiento_general_sst: number;
  periodo: SstIndicadorPeriodo;
  descripcion: string;
  titulo: string;
}

export interface SstIndicadoresScopeFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  periodo_id?: string | null;
}

export interface SstInspeccion {
  id: number;
  empresa: SstEmpresaRef;
  contrato: SstContratoRef;
  nombre_inspeccion: string;
  tipo_inspeccion: SstInspeccionTipo;
  fecha_programada: string | null;
  fecha_realizada: string | null;
  responsable: string | null;
  estado: SstInspeccionEstado;
  estado_alerta: string | null;
  observacion: string | null;
  activo: boolean;
  created_at: string;
}

export interface SstInspeccionFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  tipo_inspeccion?: SstInspeccionTipo | null;
  estado?: SstInspeccionEstado | null;
  activo?: boolean | null;
  search?: string | null;
  fecha_programada_desde?: string | null;
  fecha_programada_hasta?: string | null;
  fecha_realizada_desde?: string | null;
  fecha_realizada_hasta?: string | null;
  page?: number;
  limit?: number;
}

export interface CreateSstInspeccionPayload {
  empresa_id: string;
  contrato_id?: string | null;
  nombre_inspeccion: string;
  tipo_inspeccion: SstInspeccionTipo;
  fecha_programada?: string | null;
  fecha_realizada?: string | null;
  responsable?: string | null;
  estado?: SstInspeccionEstado;
  observacion?: string | null;
  activo?: boolean;
}

export interface UpdateSstInspeccionPayload extends Partial<CreateSstInspeccionPayload> {}

export interface SstHallazgoInspeccion {
  id: number;
  inspeccion: SstInspeccion;
  tipo_hallazgo: SstHallazgoTipo;
  descripcion: string;
  nivel_riesgo: SstHallazgoNivel;
  requiere_accion: boolean;
  genera_alerta_critica: boolean;
  activo: boolean;
  created_at: string;
}

export interface SstHallazgoFilters {
  tipo_hallazgo?: SstHallazgoTipo | null;
  nivel_riesgo?: SstHallazgoNivel | null;
  requiere_accion?: boolean | null;
  activo?: boolean | null;
  page?: number;
  limit?: number;
}

export interface CreateSstHallazgoPayload {
  inspeccion_id: string;
  tipo_hallazgo?: SstHallazgoTipo;
  descripcion: string;
  nivel_riesgo?: SstHallazgoNivel;
  requiere_accion?: boolean;
  activo?: boolean;
}

export interface UpdateSstHallazgoPayload extends Partial<CreateSstHallazgoPayload> {}

export interface SstAccionInspeccion {
  id: number;
  hallazgo: SstHallazgoInspeccion;
  descripcion: string;
  responsable: string | null;
  fecha_compromiso: string | null;
  fecha_cierre: string | null;
  estado: SstAccionEstado;
  estado_alerta: string | null;
  activo: boolean;
  created_at: string;
}

export interface SstAccionInspeccionFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  hallazgo_id?: string | null;
  estado?: SstAccionEstado | null;
  activo?: boolean | null;
  page?: number;
  limit?: number;
}

export interface CreateSstAccionInspeccionPayload {
  hallazgo_id: string;
  descripcion: string;
  responsable?: string | null;
  fecha_compromiso?: string | null;
  fecha_cierre?: string | null;
  estado?: SstAccionEstado;
  activo?: boolean;
}

export interface UpdateSstAccionInspeccionPayload extends Partial<CreateSstAccionInspeccionPayload> {}

export interface CloseSstAccionInspeccionPayload {
  fecha_cierre?: string | null;
}

export interface SstInspeccionDashboard {
  inspecciones_total: number;
  inspecciones_programadas: number;
  inspecciones_realizadas: number;
  inspecciones_canceladas: number;
  inspecciones_vencidas: number;
  hallazgos_total: number;
  hallazgos_bajos: number;
  hallazgos_medios: number;
  hallazgos_altos: number;
  hallazgos_criticos: number;
  acciones_total: number;
  acciones_abiertas: number;
  acciones_en_proceso: number;
  acciones_cerradas: number;
  acciones_vencidas: number;
  cumplimiento_acciones_porcentaje: number;
}

export interface SstInspeccionAlerta {
  id: string;
  tipo_alerta: string;
  severidad: string;
  estado: string;
  fecha_alerta: string;
  fecha_compromiso: string | null;
  dias_restantes: number | null;
  titulo: string;
  descripcion: string;
  inspeccion: {
    id: number;
    nombre_inspeccion: string;
    tipo_inspeccion: SstInspeccionTipo;
  };
  hallazgo: {
    id: number;
    nivel_riesgo: SstHallazgoNivel;
    tipo_hallazgo: SstHallazgoTipo;
  } | null;
  accion: {
    id: number;
  } | null;
}

export interface SstAccidente {
  id: number;
  empresa: SstEmpresaRef;
  contrato: SstContratoRef;
  persona: SstPersonaRef;
  vinculacion: {
    id: number;
    contrato_id: number | null;
    empresa_id: number | null;
    estado_vinculacion: string | null;
  } | null;
  tipo_evento: SstAccidenteTipo;
  fecha_evento: string;
  hora_evento: string | null;
  lugar_evento: string | null;
  descripcion: string;
  lesionado: boolean;
  tipo_lesion: string | null;
  parte_cuerpo: string | null;
  dias_incapacidad: number | null;
  requiere_investigacion: boolean;
  severidad: SstAccidenteSeveridad;
  estado: SstAccidenteEstado;
  activo: boolean;
  created_at: string;
}

export interface SstAccidenteFilters {
  empresa_id?: string | null;
  contrato_id?: string | null;
  persona_id?: string | null;
  vinculacion_id?: string | null;
  tipo_evento?: SstAccidenteTipo | null;
  severidad?: SstAccidenteSeveridad | null;
  estado?: SstAccidenteEstado | null;
  lesionado?: boolean | null;
  activo?: boolean | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  page?: number;
  limit?: number;
}

export interface CreateSstAccidentePayload {
  empresa_id: string;
  contrato_id?: string | null;
  persona_id: string;
  vinculacion_id?: string | null;
  tipo_evento: SstAccidenteTipo;
  fecha_evento: string;
  hora_evento?: string | null;
  lugar_evento?: string | null;
  descripcion: string;
  lesionado?: boolean;
  tipo_lesion?: string | null;
  parte_cuerpo?: string | null;
  dias_incapacidad?: number | null;
  requiere_investigacion?: boolean;
  severidad?: SstAccidenteSeveridad;
  estado?: SstAccidenteEstado;
  activo?: boolean;
}

export interface UpdateSstAccidentePayload extends Partial<CreateSstAccidentePayload> {}

export interface SstAccionAccidente {
  id: number;
  accidente: SstAccidente;
  descripcion: string;
  responsable: string | null;
  fecha_compromiso: string | null;
  fecha_cierre: string | null;
  estado: SstAccionEstado;
  estado_alerta: string | null;
  activo: boolean;
  created_at: string;
}

export interface CreateSstAccionAccidentePayload {
  descripcion: string;
  responsable?: string | null;
  fecha_compromiso?: string | null;
  fecha_cierre?: string | null;
  estado?: SstAccionEstado;
  activo?: boolean;
}

export interface UpdateSstAccionAccidentePayload extends Partial<CreateSstAccionAccidentePayload> {}

export interface SstAccidenteDashboard {
  accidentes_total: number;
  incidentes_total: number;
  casi_accidentes_total: number;
  abiertos: number;
  investigacion: number;
  cerrados: number;
  leves: number;
  moderados: number;
  graves: number;
  mortales: number;
  lesionados: number;
  incapacidades_total: number;
  acciones_abiertas: number;
  acciones_vencidas: number;
  cumplimiento_acciones_porcentaje: number;
}

export interface SstAccidenteAlerta {
  id: string;
  tipo_alerta: string;
  severidad: string;
  estado: string;
  fecha_alerta: string;
  fecha_compromiso: string | null;
  dias_restantes: number | null;
  titulo: string;
  descripcion: string;
  persona: {
    id: number;
    numero_documento: string;
  };
  vinculacion: {
    id: number;
  };
  accidente: {
    id: number;
    tipo_evento: SstAccidenteTipo;
    severidad: SstAccidenteSeveridad;
  };
  accion_correctiva: {
    id: number;
  } | null;
}

export interface SstPersonaOption extends PersonaListItem {}

export interface SstVinculacionOption {
  vinculacion: VinculacionApi;
  expediente: VinculacionExpedienteApi;
  persona: PersonaApi;
  label: string;
}

