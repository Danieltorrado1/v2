// Raw API shapes - /api/personas

export interface PersonaIdentificacionApi {
  es_vigente: boolean;
  fecha_expedicion_documento: string | null;
  id: number;
  motivo_cambio: string;
  municipio_expedicion_id: number | null;
  municipio_expedicion_nombre: string | null;
  numero_documento: string;
  persona_id: number;
  registrado_en: string;
  registrado_por_usuario_correo: string | null;
  registrado_por_usuario_id: number | null;
  registrado_por_usuario_nombre: string | null;
  reemplaza_identificacion_id: number | null;
  tipo_documento_id: number;
  tipo_documento_nombre: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export interface PersonaApi {
  id: number;
  identificador_interno?: string;
  identificacion_vigente?: PersonaIdentificacionApi | null;
  contacto_emergencia?: PersonaContactoEmergenciaApi | null;
  perfil_demografico?: PersonaPerfilDemograficoApi | null;
  tipo_documento_id: number;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  fecha_expedicion_documento: string | null;
  municipio_nacimiento_id: number | null;
  municipio_expedicion_id: number | null;
  municipio_residencia_id: number | null;
  sexo_id: number | null;
  estado_civil_id: number | null;
  tipo_sangre_id: number | null;
  estatura: number | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  barrio: string | null;
  zona_id: number | null;
  pais_nacimiento: string | null;
  nacimiento_extranjero: boolean;
  ciudad_nacimiento_extranjero: string | null;
}

export interface PersonaContactoEmergenciaApi {
  id: number;
  persona_id: number;
  nombre_contacto: string;
  parentesco: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  created_at: string | null;
}

export interface PersonaPerfilDemograficoApi {
  id: number;
  persona_id: number;
  nacionalidad: string | null;
  nivel_escolaridad: string | null;
  activo: boolean;
  updated_at: string | null;
}

export type SstPerfilOrigenApi =
  | 'FORMULARIO_DIGITAL'
  | 'FORMULARIO_FISICO'
  | 'IMPORTACION'
  | 'EDICION_MANUAL'
  | 'PORTAL_COLABORADOR';

export type SstPerfilCompletitudEstadoApi =
  | 'COMPLETA'
  | 'INCOMPLETA'
  | 'NO_REALIZADA'
  | 'REQUIERE_REVISION';

export interface SstPerfilSociodemograficoValuesApi {
  nacionalidad: string | null;
  estrato_socioeconomico: string | null;
  tipo_vivienda: string | null;
  grupo_etnico: string | null;
  nivel_escolaridad: string | null;
  profesion_ocupacion: string | null;
  personas_dependen_economicamente: number | null;
  cabeza_familia: boolean | null;
  total_hijos: number | null;
  hijos_viven_con_usted: number | null;
  hijos_menores_edad: number | null;
  hijos_mayores_edad: number | null;
  tipo_sangre_rh: string | null;
  tiene_discapacidad: boolean | null;
  tipo_discapacidad: string | null;
  redes_apoyo_social: string | null;
  presenta_alergias: string | null;
  medicamentos_permanentes: string | null;
  enfermedad: string | null;
  autorizacion_tratamiento_datos: boolean | null;
  observaciones: string | null;
}

export interface SstPerfilSociodemograficoApi {
  id: number | null;
  persona_id: number;
  vinculacion_id: number | null;
  fecha_caracterizacion: string | null;
  origen: SstPerfilOrigenApi | null;
  origen_resuelto: SstPerfilOrigenApi | 'MIXTO' | 'SIN_REGISTRO';
  motivo_ultima_actualizacion: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  version_actual: number;
  requiere_revision: boolean;
  activo: boolean;
  created_at: string | null;
  updated_at: string | null;
  edad: number | null;
  completitud: {
    porcentaje: number;
    estado: SstPerfilCompletitudEstadoApi;
    campos_requeridos: string[];
    campos_completos: string[];
    campos_faltantes: string[];
  };
  values: SstPerfilSociodemograficoValuesApi;
  history_count: number;
  sensitive_fields_hidden: boolean;
}

export interface SstPerfilSociodemograficoVersionApi {
  id: number;
  perfil_id: number;
  persona_id: number;
  vinculacion_id: number | null;
  version_numero: number;
  vigente_desde: string;
  vigencia_hasta: string | null;
  es_vigente: boolean;
  fecha_caracterizacion: string | null;
  origen: SstPerfilOrigenApi | null;
  motivo_cambio: string | null;
  importacion_lote_id: number | null;
  created_by_user_id: number | null;
  requiere_revision: boolean;
  values: SstPerfilSociodemograficoValuesApi;
  created_at: string | null;
}

export interface PersonaCuentaBancariaApi {
  id: number;
  persona_id: number;
  entidad_bancaria: string;
  tipo_cuenta: 'AHORROS' | 'CORRIENTE' | 'OTRA';
  numero_cuenta: string;
  numero_cuenta_mascara: string;
  titular: string;
  nombre_titular: string | null;
  documento_titular: string | null;
  estado: 'PENDIENTE' | 'VERIFICADA' | 'RECHAZADA' | 'INACTIVA';
  fecha_verificacion: string | null;
  observaciones: string | null;
  soporte_documento_persona_id: number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  es_vigente: boolean;
  verified_by_user_id: number | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonaHistorialCambioApi {
  id: number;
  tabla_afectada: string;
  registro_id: number;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  motivo: string | null;
  fecha_hora: string | null;
  usuario_id: number | null;
  usuario_nombre: string | null;
  usuario_correo: string | null;
}

export interface PersonalExportFieldDefinitionApi {
  code: string;
  group:
    | 'IDENTIDAD'
    | 'CONTACTO'
    | 'LABORAL'
    | 'TERRITORIAL'
    | 'SEGURIDAD_SOCIAL'
    | 'BANCARIO'
    | 'SST';
  label: string;
}

export interface PersonalExportTemplateApi {
  id: number;
  nombre: string;
  campos: string[];
  orden: string[];
  formato: 'csv';
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonaNombreInput {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}

export interface PersonasPaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedPersonasApi {
  items: PersonaApi[];
  pagination: PersonasPaginationMeta;
}

// Raw API shapes - /api/vinculaciones

export type VinculacionEstado = 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA';

export interface VinculacionApi {
  id: number;
  persona_id: number;
  empresa_id: number;
  contrato_id: number;
  contrato_empresa_id: number | null;
  tipo_vinculacion_id: number;
  contrato_cargo_id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado_vinculacion: VinculacionEstado;
  motivo_retiro: string | null;
  cuenta_como_experiencia: boolean;
  metodo_pago: string | null;
  empresa_nombre?: string | null;
  contrato_numero?: string | null;
  cargo_nombre?: string | null;
  tipo_vinculacion_nombre?: string | null;
}

// /api/vinculaciones/:id/expediente

export interface VinculacionExpedientePersona {
  id: number;
  tipo_documento_id: number | null;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  fecha_expedicion_documento: string | null;
  municipio_nacimiento_id: number | null;
  municipio_expedicion_id: number | null;
  municipio_residencia_id: number | null;
  sexo_id: number | null;
  sexo: string | null;
  estado_civil_id: number | null;
  estado_civil: string | null;
  tipo_sangre_id: number | null;
  tipo_sangre: string | null;
  estatura: number | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  barrio: string | null;
  zona_id: number | null;
  zona: string | null;
  pais_nacimiento: string | null;
  nacimiento_extranjero: boolean | null;
  ciudad_nacimiento_extranjero: string | null;
  identificacion_vigente?: PersonaIdentificacionApi | null;
}

export interface DocumentoExpedientePersonaApi {
  id: number;
  tipo_documento_id: number;
  es_vigente: boolean;
  fecha_vencimiento: string | null;
}

export interface DocumentoExpedienteVinculacionApi {
  id: number;
  tipo_documento_id: number;
  activo: boolean;
  fecha_vencimiento: string | null;
}

export interface VinculacionAfiliacionesApi {
  eps_id: number | null;
  eps: string | null;
  pension_id: number | null;
  pension: string | null;
  arl_id: number | null;
  arl: string | null;
  caja_compensacion_id: number | null;
  caja_compensacion: string | null;
}

export interface VinculacionExpedienteApi {
  vinculacion: VinculacionApi;
  persona: VinculacionExpedientePersona;
  empresa: { id: number; nombre_empresa: string | null };
  contrato: {
    id: number;
    numero_contrato: string | null;
    entidad_contratante: string | null;
    objeto_contractual: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  };
  cargo: { id: number; nombre_cargo: string | null };
  tipo_vinculacion: { id: number; codigo: string | null; nombre_vinculacion: string | null };
  documentos_persona: DocumentoExpedientePersonaApi[];
  documentos_vinculacion: DocumentoExpedienteVinculacionApi[];
  checklist: unknown;
  afiliaciones: VinculacionAfiliacionesApi | null;
  personal_contexto: VinculacionPersonalContextApi;
}

export interface AsignacionOperativaApi {
  id: number;
  focalizacion_final_id: number;
  institucion: string;
  sede: string;
  modalidad: string;
  categoria_cobertura: string | null;
  municipio_id: number | null;
  porcentaje_cobertura: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  observacion: string | null;
  activo: boolean;
  created_at: string;
  tipo_asignacion: string;
}

export interface AsignacionLaboralApi {
  id: number;
  ubicacion_laboral_id: number;
  nombre_ubicacion: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  estado: 'ACTIVA' | 'FINALIZADA' | 'ANULADA';
  origen: 'MANUAL' | 'IMPORTACION' | 'AJUSTE';
  observacion: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PresentacionLicitacionApi {
  id: number;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  estado: 'PRESENTADA' | 'RETIRADA' | 'REEMPLAZADA' | 'ANULADA';
  cumple_requisitos: boolean | null;
  cumple_requisitos_estado: 'CUMPLE' | 'NO_CUMPLE' | 'PENDIENTE';
  observacion: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  perfil: {
    id: number;
    nombre_perfil: string;
    cantidad_requerida: number;
    contrato_cargo_equivalente: {
      id: number | null;
      nombre_cargo: string | null;
    };
  };
}

export interface VinculacionPersonalContextApi {
  es_manipuladora: boolean;
  asignacion_operativa_actual: AsignacionOperativaApi | null;
  historial_asignacion_operativa: AsignacionOperativaApi[];
  asignacion_laboral_actual: AsignacionLaboralApi | null;
  historial_asignacion_laboral: AsignacionLaboralApi[];
  presentada_licitacion_actual: PresentacionLicitacionApi | null;
  historial_presentacion_licitacion: PresentacionLicitacionApi[];
}

// Frontend normalized types

export interface PersonaListItem {
  id: number;
  nombreCompleto: string;
  numeroDocumento: string;
  correo: string | null;
  telefono: string | null;
}

export interface PersonaLookupOption {
  id: number;
  nombreCompleto: string;
  numeroDocumento: string;
}

export interface PersonaFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface VinculacionOPSChecklistResumen {
  cargados: number;
  cumplimiento_porcentaje: number;
  faltantes: number;
  total_requisitos: number;
  vencidos: number;
}

export interface VinculacionOPS {
  vinculacion_id: number;
  persona_id: number;
  empresa_id: number;
  contrato_id: number;
  contrato_empresa_id: number | null;
  contrato_cargo_id: number;
  nombre_completo: string;
  numero_documento: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado_vinculacion: VinculacionEstado;
  metodo_pago: string | null;
  tipo_vinculacion_id: number;
  tipo_vinculacion_codigo: string | null;
  tipo_vinculacion_nombre: string | null;
  contrato_numero: string | null;
  entidad_contratante: string | null;
  objeto_contractual: string | null;
  cargo_nombre: string | null;
  empresa_nombre: string | null;
  municipio_residencia_id: number | null;
  documentos_persona_total: number;
  documentos_vinculacion_total: number;
  checklist: VinculacionOPSChecklistResumen | null;
}

export interface PersonalOPSFilters {
  search?: string;
  estado_vinculacion?: VinculacionEstado | '';
  contrato_id?: number | null;
  tipo_vinculacion_id?: number | null;
  metodo_pago?: string | null;
}

