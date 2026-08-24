import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { Pool, type QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import {
  classifySstPerfilImportRow,
  normalizeHeader,
  normalizeImportDocumentNumber,
  normalizeSstPerfilMappedRow,
  type ImportValidationIssue,
  type MasterImportClassification,
  type SstPerfilImportSnapshot
} from '../modules/importaciones/importaciones.master.domain';
import {
  EMPTY_SST_PERFIL_VALUES,
  computeSstPerfilCompleteness,
  normalizeSstPerfilBooleanValue,
  normalizeSstPerfilIntegerValue,
  normalizeSstPerfilTextValue,
  type SstPerfilEditableValues
} from '../modules/sst/sst.perfil.domain';

dotenv.config();

const REPORTS_DIR = path.resolve('reports');
const FILE_1_PATH = path.resolve('data/SST/Perfil sociodemografico Complementos (respuestas).xlsx');
const FILE_2_PATH = path.resolve('data/SST/Caracterización adicional (respuestas).xlsx');
const META26_PLAN_PATH = path.resolve('reports/personal-meta26-import-plan-final.json');
const META26_CONTRACT_ID = 24;

const OUTPUT_MATRIX = path.resolve('reports/sst-caracterizacion-matriz-campos.csv');
const OUTPUT_DUPLICATES = path.resolve('reports/sst-caracterizacion-duplicados.csv');
const OUTPUT_CROSS = path.resolve('reports/sst-caracterizacion-cruce-formularios.csv');
const OUTPUT_COVERAGE = path.resolve('reports/sst-caracterizacion-cobertura-meta26.csv');
const OUTPUT_VALUES = path.resolve('reports/sst-caracterizacion-valores.csv');
const OUTPUT_SUMMARY = path.resolve('reports/sst-caracterizacion-resumen.json');

type FieldClassification =
  | 'PERSONA_MAESTRA'
  | 'SST_SOCIODEMOGRAFICO'
  | 'CONTACTO_EMERGENCIA'
  | 'AFILIACION'
  | 'DATO_SENSIBLE'
  | 'CALCULABLE'
  | 'REDUNDANTE'
  | 'NO_DEFINIDO'
  | 'NO_IMPORTAR';

type ProposedAction =
  | 'REUTILIZAR_MAESTRO'
  | 'IMPORTAR_SST'
  | 'IMPORTAR_CONTACTO'
  | 'IMPORTAR_AFILIACION'
  | 'CALCULAR'
  | 'REVISAR'
  | 'IGNORAR';

type DuplicateClassification =
  | 'SIN_DUPLICADO'
  | 'DUPLICADO_IDENTICO'
  | 'DUPLICADO_COMPLEMENTARIO'
  | 'DUPLICADO_CONFLICTO';

type CrossStatus = 'COINCIDE' | 'COMPLEMENTA' | 'CONFLICTO' | 'VACIO_EN_1' | 'VACIO_EN_2';

type PreliminaryCoverageStatus =
  | 'COMPLETA_DIGITAL'
  | 'PARCIAL_DIGITAL'
  | 'NO_ENCONTRADA_DIGITAL'
  | 'CONFLICTO'
  | 'REQUIERE_REVISION';

interface FileFieldDefinition {
  normalizedHeader: string;
  classification: FieldClassification;
  destinoPropuesto: string | null;
  tablaDestino: string | null;
  campoDestino: string | null;
  yaExisteEnEmpiria: boolean;
  requiereCatalogo: boolean;
  requiereNormalizacion: boolean;
  esSensible: boolean;
  accionPropuesta: ProposedAction;
  observaciones: string;
}

interface WorkbookSheetAudit {
  name: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  totalRowsIncludingHeader: number;
  totalDataRows: number;
  usefulRows: number;
  emptyRowNumbers: number[];
  emptyColumns: string[];
}

interface WorkbookAudit {
  path: string;
  name: string;
  sha256: string;
  sizeBytes: number;
  sheets: WorkbookSheetAudit[];
}

export interface ParsedResponseRow {
  fileKey: 'F1' | 'F2';
  fileName: string;
  sheetName: string;
  rowNumber: number;
  timestampRaw: string | null;
  timestampIso: string | null;
  fullNameRaw: string | null;
  fullNameNormalized: string | null;
  documentRaw: string | null;
  documentNormalized: string | null;
  municipalityLaborRaw: string | null;
  mappedSst: Partial<SstPerfilEditableValues>;
  mappedPersona: Record<string, string | null>;
  mappedContact: Record<string, string | null>;
  mappedAffiliation: Record<string, string | null>;
  unsupportedFields: Record<string, string | null>;
  sensitiveFields: Record<string, string | null>;
  row: Record<string, unknown>;
}

export interface CanonicalResponse {
  fileKey: 'F1' | 'F2';
  fileName: string;
  sheetName: string;
  documentNormalized: string;
  fullNameNormalized: string | null;
  municipalityLaborRaw: string | null;
  responseCount: number;
  timestampIsoLatest: string | null;
  duplicateClassification: DuplicateClassification;
  duplicateConflictFields: string[];
  rowNumbers: number[];
  rawRows: ParsedResponseRow[];
  mergedSst: Partial<SstPerfilEditableValues>;
  mergedPersona: Record<string, string | null>;
  mergedContact: Record<string, string | null>;
  mergedAffiliation: Record<string, string | null>;
  unsupportedFields: Record<string, string | null>;
  sensitiveFields: Record<string, string | null>;
}

export interface Meta26PlanRow {
  cedula: string;
  nombre_resuelto: string | null;
  cargo_nombre: string | null;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
}

export interface MasterPersonRow extends QueryResultRow {
  persona_id: number | string;
  vinculacion_id: number | string | null;
  numero_documento: string;
  tipo_documento_codigo: string | null;
  tipo_documento_nombre: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  fecha_nacimiento: Date | string | null;
  sexo_nombre: string | null;
  estado_civil_nombre: string | null;
  tipo_sangre_codigo: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  zona_nombre: string | null;
  pais_nacimiento: string | null;
  contacto_nombre: string | null;
  contacto_parentesco: string | null;
  contacto_telefono: string | null;
  eps: string | null;
  arl: string | null;
}

export interface Meta26PersonRow extends QueryResultRow {
  persona_id: number | string;
  vinculacion_id: number | string;
  numero_documento: string;
  tipo_documento_codigo: string | null;
  tipo_documento_nombre: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}

export interface SstCurrentRow extends QueryResultRow {
  persona_id: number | string;
  fecha_caracterizacion: Date | string | null;
  origen: string | null;
  nacionalidad: string | null;
  estrato_socioeconomico: string | null;
  tipo_vivienda: string | null;
  grupo_etnico: string | null;
  nivel_escolaridad: string | null;
  profesion_ocupacion: string | null;
  personas_dependen_economicamente: number | string | null;
  cabeza_familia: boolean | null;
  total_hijos: number | string | null;
  hijos_viven_con_usted: number | string | null;
  hijos_menores_edad: number | string | null;
  hijos_mayores_edad: number | string | null;
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

export interface CrossUniverseRow {
  documentNormalized: string;
  f1: CanonicalResponse | null;
  f2: CanonicalResponse | null;
  sharedFieldStatuses: Array<{
    field: string;
    status: CrossStatus;
    valueF1: string | null;
    valueF2: string | null;
  }>;
  crossConflictFields: string[];
}

interface CoverageRow {
  persona_id: number;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  cargo: string | null;
  formulario_1: boolean;
  formulario_2: boolean;
  numero_respuestas_f1: number;
  numero_respuestas_f2: number;
  estado_cruce: string;
  campos_disponibles: string[];
  campos_faltantes: string[];
  conflictos: string[];
  porcentaje_preliminar: number;
  estado_preliminar: PreliminaryCoverageStatus;
  requiere_revision: boolean;
  requiere_digitacion_fisica: boolean;
}

interface DryRunSummary {
  scope: string;
  total_canonicos: number;
  dentro_meta26: number;
  fuera_meta26: number;
  no_identificables: number;
  nuevas: number;
  actualizaciones: number;
  sin_cambios: number;
  conflictos: number;
  errores: number;
  sensibles_presentes: number;
  campos_ignorados: number;
}

const FILE_DEFINITIONS: Record<'F1' | 'F2', Record<string, FileFieldDefinition>> = {
  F1: {
    marca_temporal: {
      normalizedHeader: 'marca_temporal',
      classification: 'NO_IMPORTAR',
      destinoPropuesto: null,
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: false,
      requiereNormalizacion: false,
      esSensible: false,
      accionPropuesta: 'IGNORAR',
      observaciones: 'Solo sirve para trazabilidad y resolucion de duplicados.'
    },
    nombres_y_apellidos_mayusculas_sin_tildes: {
      normalizedHeader: 'nombres_y_apellidos_mayusculas_sin_tildes',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'nombre_diagnostico',
      tablaDestino: 'personas',
      campoDestino: 'primer_nombre/primer_apellido',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Se usa para diagnostico y conciliacion; no es la identidad primaria.'
    },
    cedula_sin_puntos: {
      normalizedHeader: 'cedula_sin_puntos',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'numero_documento',
      tablaDestino: 'persona_identificaciones',
      campoDestino: 'numero_documento',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Identidad canonica principal del formulario.'
    },
    edad: {
      normalizedHeader: 'edad',
      classification: 'CALCULABLE',
      destinoPropuesto: 'edad',
      tablaDestino: 'personas',
      campoDestino: 'fecha_nacimiento',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: false,
      esSensible: false,
      accionPropuesta: 'CALCULAR',
      observaciones: 'Se recalcula desde fecha de nacimiento; no debe persistirse.'
    },
    fecha_de_nacimiento: {
      normalizedHeader: 'fecha_de_nacimiento',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'fecha_nacimiento',
      tablaDestino: 'personas',
      campoDestino: 'fecha_nacimiento',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Dato maestro de Persona; solo se reconcilia.'
    },
    nacionalidad: {
      normalizedHeader: 'nacionalidad',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'nacionalidad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    departamento_de_nacimiento: {
      normalizedHeader: 'departamento_de_nacimiento',
      classification: 'NO_DEFINIDO',
      destinoPropuesto: null,
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REVISAR',
      observaciones: 'No existe destino oficial actual; no debe crear columna nueva sin decision.'
    },
    genero: {
      normalizedHeader: 'genero',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'sexo_id',
      tablaDestino: 'personas',
      campoDestino: 'sexo_id',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Se compara contra catalogo maestro de sexo.'
    },
    departamento_de_residencia: {
      normalizedHeader: 'departamento_de_residencia',
      classification: 'NO_DEFINIDO',
      destinoPropuesto: null,
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REVISAR',
      observaciones: 'No existe destino oficial directo en el modelo actual.'
    },
    municipio_donde_labora: {
      normalizedHeader: 'municipio_donde_labora',
      classification: 'REDUNDANTE',
      destinoPropuesto: 'contexto_laboral',
      tablaDestino: 'vinculaciones/cobertura',
      campoDestino: 'municipio operativo',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Dato laboral ya resuelto desde vinculacion/cobertura.'
    },
    estrato_socioeconomico: {
      normalizedHeader: 'estrato_socioeconomico',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'estrato_socioeconomico',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    zona_de_vivienda: {
      normalizedHeader: 'zona_de_vivienda',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'zona_id',
      tablaDestino: 'personas',
      campoDestino: 'zona_id',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REVISAR',
      observaciones: 'Existe en Persona como catalogo; no se persiste via SST sin reconciliacion.'
    },
    tipo_de_vivienda: {
      normalizedHeader: 'tipo_de_vivienda',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'tipo_vivienda',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    numero_de_celular_sin_espacios: {
      normalizedHeader: 'numero_de_celular_sin_espacios',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'telefono',
      tablaDestino: 'personas',
      campoDestino: 'telefono',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Dato maestro de contacto.'
    },
    grupo_etnico: {
      normalizedHeader: 'grupo_etnico',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'grupo_etnico',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    nivel_de_escolaridad: {
      normalizedHeader: 'nivel_de_escolaridad',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'nivel_escolaridad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Se cruza tambien contra el segundo formulario.'
    },
    profesion_u_ocupacion: {
      normalizedHeader: 'profesion_u_ocupacion',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'profesion_ocupacion',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    si_aplica_cuantas_personas_dependen_economicamente_de_usted: {
      normalizedHeader: 'si_aplica_cuantas_personas_dependen_economicamente_de_usted',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'personas_dependen_economicamente',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    es_usted_cabeza_de_familia: {
      normalizedHeader: 'es_usted_cabeza_de_familia',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'cabeza_familia',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    total_de_numero_de_hijos: {
      normalizedHeader: 'total_de_numero_de_hijos',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'total_hijos',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    total_de_hijos_que_viven_con_usted: {
      normalizedHeader: 'total_de_hijos_que_viven_con_usted',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'hijos_viven_con_usted',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    numero_de_hijos_menores_de_edad: {
      normalizedHeader: 'numero_de_hijos_menores_de_edad',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'hijos_menores_edad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    numero_de_hijos_mayores_de_edad: {
      normalizedHeader: 'numero_de_hijos_mayores_de_edad',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'hijos_mayores_edad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    tiene_usted_algun_tipo_de_discapacidad: {
      normalizedHeader: 'tiene_usted_algun_tipo_de_discapacidad',
      classification: 'DATO_SENSIBLE',
      destinoPropuesto: 'perfil_sst_restringido',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'tiene_discapacidad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: true,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Debe mantenerse restringido para roles SST/administrador.'
    },
    seleccione_el_tipo_de_discapacidad: {
      normalizedHeader: 'seleccione_el_tipo_de_discapacidad',
      classification: 'DATO_SENSIBLE',
      destinoPropuesto: 'perfil_sst_restringido',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'tipo_discapacidad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: true,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Debe mantenerse restringido para roles SST/administrador.'
    },
    seleccione_los_grupos_o_redes_de_apoyo_social_a_los_que_pertenece: {
      normalizedHeader: 'seleccione_los_grupos_o_redes_de_apoyo_social_a_los_que_pertenece',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'redes_apoyo_social',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    },
    nombre_del_contacto_de_emergencia: {
      normalizedHeader: 'nombre_del_contacto_de_emergencia',
      classification: 'CONTACTO_EMERGENCIA',
      destinoPropuesto: 'contacto_emergencia',
      tablaDestino: 'persona_contactos_emergencia',
      campoDestino: 'nombre_contacto',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_CONTACTO',
      observaciones: 'Debe reconciliarse antes de cualquier apply.'
    },
    parentesco_del_contacto_de_emergencia: {
      normalizedHeader: 'parentesco_del_contacto_de_emergencia',
      classification: 'CONTACTO_EMERGENCIA',
      destinoPropuesto: 'contacto_emergencia',
      tablaDestino: 'persona_contactos_emergencia',
      campoDestino: 'parentesco',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_CONTACTO',
      observaciones: 'Debe reconciliarse antes de cualquier apply.'
    },
    numero_de_celular_del_contacto_de_emergencia_sin_espacios: {
      normalizedHeader: 'numero_de_celular_del_contacto_de_emergencia_sin_espacios',
      classification: 'CONTACTO_EMERGENCIA',
      destinoPropuesto: 'contacto_emergencia',
      tablaDestino: 'persona_contactos_emergencia',
      campoDestino: 'telefono',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_CONTACTO',
      observaciones: 'Debe reconciliarse antes de cualquier apply.'
    },
    tipo_de_sangre_y_rh: {
      normalizedHeader: 'tipo_de_sangre_y_rh',
      classification: 'DATO_SENSIBLE',
      destinoPropuesto: 'tipo_sangre_id',
      tablaDestino: 'personas',
      campoDestino: 'tipo_sangre_id',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: true,
      accionPropuesta: 'REVISAR',
      observaciones: 'No debe quedar expuesto como campo SST general sin decision funcional.'
    },
    presenta_alergias: {
      normalizedHeader: 'presenta_alergias',
      classification: 'DATO_SENSIBLE',
      destinoPropuesto: 'perfil_sst_restringido',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'presenta_alergias',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: true,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Debe mantenerse restringido para roles SST/administrador.'
    },
    medicamentos_permanentes: {
      normalizedHeader: 'medicamentos_permanentes',
      classification: 'DATO_SENSIBLE',
      destinoPropuesto: 'perfil_sst_restringido',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'medicamentos_permanentes',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: true,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Debe mantenerse restringido para roles SST/administrador.'
    },
    sufre_de_alguna_enfermedad: {
      normalizedHeader: 'sufre_de_alguna_enfermedad',
      classification: 'DATO_SENSIBLE',
      destinoPropuesto: 'perfil_sst_restringido',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'enfermedad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: true,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Debe mantenerse restringido para roles SST/administrador.'
    },
    a_que_entidad_promotora_de_salud_eps_pertenece: {
      normalizedHeader: 'a_que_entidad_promotora_de_salud_eps_pertenece',
      classification: 'AFILIACION',
      destinoPropuesto: 'afiliacion_eps',
      tablaDestino: 'vinculacion_afiliaciones',
      campoDestino: 'eps_id',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_AFILIACION',
      observaciones: 'Solo se reconcilia; no debe sobrescribir afiliacion maestra automaticamente.'
    },
    a_que_aseguradora_de_riesgos_laborales_arl_pertenece: {
      normalizedHeader: 'a_que_aseguradora_de_riesgos_laborales_arl_pertenece',
      classification: 'AFILIACION',
      destinoPropuesto: 'afiliacion_arl',
      tablaDestino: 'vinculacion_afiliaciones',
      campoDestino: 'arl_id',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_AFILIACION',
      observaciones: 'Solo se reconcilia; no debe sobrescribir afiliacion maestra automaticamente.'
    },
    autorizo_que_los_datos_suministrados_sean_tratados_de_manera_confidencial_y_utilizados_exclusivamente_para_fines_relacionados_con_el_sg_sst: {
      normalizedHeader:
        'autorizo_que_los_datos_suministrados_sean_tratados_de_manera_confidencial_y_utilizados_exclusivamente_para_fines_relacionados_con_el_sg_sst',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'autorizacion_tratamiento_datos',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Campo soportado por el modelo SST actual.'
    }
  },
  F2: {
    marca_temporal: {
      normalizedHeader: 'marca_temporal',
      classification: 'NO_IMPORTAR',
      destinoPropuesto: null,
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: false,
      requiereNormalizacion: false,
      esSensible: false,
      accionPropuesta: 'IGNORAR',
      observaciones: 'Solo sirve para trazabilidad y resolucion de duplicados.'
    },
    nombres_y_apellidos_mayusculas_sin_tildes: {
      normalizedHeader: 'nombres_y_apellidos_mayusculas_sin_tildes',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'nombre_diagnostico',
      tablaDestino: 'personas',
      campoDestino: 'primer_nombre/primer_apellido',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Se usa para diagnostico y conciliacion; no es la identidad primaria.'
    },
    cedula: {
      normalizedHeader: 'cedula',
      classification: 'PERSONA_MAESTRA',
      destinoPropuesto: 'numero_documento',
      tablaDestino: 'persona_identificaciones',
      campoDestino: 'numero_documento',
      yaExisteEnEmpiria: true,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Identidad canonica principal del formulario.'
    },
    municipio_donde_labora: {
      normalizedHeader: 'municipio_donde_labora',
      classification: 'REDUNDANTE',
      destinoPropuesto: 'contexto_laboral',
      tablaDestino: 'vinculaciones/cobertura',
      campoDestino: 'municipio operativo',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REUTILIZAR_MAESTRO',
      observaciones: 'Dato laboral ya resuelto desde vinculacion/cobertura.'
    },
    nivel_de_escolaridad: {
      normalizedHeader: 'nivel_de_escolaridad',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'perfil_sst',
      tablaDestino: 'sst_perfil_demografico',
      campoDestino: 'nivel_escolaridad',
      yaExisteEnEmpiria: true,
      requiereCatalogo: true,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'IMPORTAR_SST',
      observaciones: 'Se cruza contra el formulario principal.'
    },
    titulo_obtenido_de_los_estudios_realizados: {
      normalizedHeader: 'titulo_obtenido_de_los_estudios_realizados',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'detalle_educativo',
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REVISAR',
      observaciones: 'No existe destino oficial actual; requiere decision antes de SST-3.'
    },
    actualmente_se_encuentra_estudiando: {
      normalizedHeader: 'actualmente_se_encuentra_estudiando',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'estudia_actualmente',
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REVISAR',
      observaciones: 'No existe destino oficial actual; requiere decision antes de SST-3.'
    },
    si_aplica_que_esta_estudiando: {
      normalizedHeader: 'si_aplica_que_esta_estudiando',
      classification: 'SST_SOCIODEMOGRAFICO',
      destinoPropuesto: 'programa_actual',
      tablaDestino: null,
      campoDestino: null,
      yaExisteEnEmpiria: false,
      requiereCatalogo: false,
      requiereNormalizacion: true,
      esSensible: false,
      accionPropuesta: 'REVISAR',
      observaciones: 'No existe destino oficial actual; requiere decision antes de SST-3.'
    }
  }
};

const SENSITIVE_FIELD_PROTECTIONS: Record<string, string> = {
  tiene_discapacidad:
    'Mantener visible solo para ADMINISTRADOR y rol SST; excluir de exportacion general TH.',
  tipo_discapacidad:
    'Mantener visible solo para ADMINISTRADOR y rol SST; excluir de exportacion general TH.',
  tipo_sangre_rh:
    'No importar automaticamente al perfil SST general; revisar destino maestro y permisos clinicos.',
  presenta_alergias:
    'Mantener visible solo para ADMINISTRADOR y rol SST; excluir de exportacion general TH.',
  medicamentos_permanentes:
    'Mantener visible solo para ADMINISTRADOR y rol SST; excluir de exportacion general TH.',
  enfermedad:
    'Mantener visible solo para ADMINISTRADOR y rol SST; excluir de exportacion general TH.'
};

const REVIEW_WORTHY_UNSUPPORTED_FIELDS = new Set([
  'titulo_obtenido_de_los_estudios_realizados',
  'actualmente_se_encuentra_estudiando',
  'si_aplica_que_esta_estudiando',
  'tipo_sangre_rh'
]);

const csvEscape = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const normalizeComparableText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const normalizeName = (value: unknown): string | null => normalizeComparableText(value);

export const normalizePhone = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const digits = String(value).replace(/[^\d]/g, '');
  return digits.length > 0 ? digits : null;
};

export const normalizeDateValue = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const normalizeTimestampValue = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

export const normalizeGender = (value: unknown): string | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  if (['FEMENINO', 'MUJER'].includes(normalized)) {
    return 'FEMENINO';
  }
  if (['MASCULINO', 'HOMBRE'].includes(normalized)) {
    return 'MASCULINO';
  }

  return normalized;
};

export const normalizeEstadoCivil = (value: unknown): string | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  const directMap: Record<string, string> = {
    SOLTERO: 'SOLTERO',
    SOLTERA: 'SOLTERO',
    CASADO: 'CASADO',
    CASADA: 'CASADO',
    'UNION LIBRE': 'UNION LIBRE',
    UNION_LIBRE: 'UNION LIBRE',
    SEPARADO: 'SEPARADO',
    SEPARADA: 'SEPARADO',
    DIVORCIADO: 'DIVORCIADO',
    DIVORCIADA: 'DIVORCIADO',
    VIUDO: 'VIUDO',
    VIUDA: 'VIUDO'
  };

  return directMap[normalized] ?? normalized;
};

export const normalizeZona = (value: unknown): string | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  if (normalized === 'URBANA') {
    return 'URBANA';
  }
  if (normalized === 'RURAL') {
    return 'RURAL';
  }

  return normalized;
};

export const normalizeBloodType = (value: unknown): string | null => {
  const normalized = normalizeComparableText(value);
  return normalized ? normalized.replace(/\s+/g, '') : null;
};

const getObjectValue = (row: Record<string, unknown>, normalizedHeader: string): unknown => {
  const entry = Object.entries(row).find(([header]) => normalizeHeader(header) === normalizedHeader);
  return entry?.[1] ?? null;
};

const sortByLatestTimestamp = (rows: ParsedResponseRow[]): ParsedResponseRow[] =>
  [...rows].sort((left, right) => {
    const leftValue = left.timestampIso ? new Date(left.timestampIso).getTime() : 0;
    const rightValue = right.timestampIso ? new Date(right.timestampIso).getTime() : 0;
    return rightValue - leftValue || right.rowNumber - left.rowNumber;
  });

export const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
};

const mergeStringMaps = (
  rows: ParsedResponseRow[],
  pick: (row: ParsedResponseRow) => Record<string, string | null>
): { merged: Record<string, string | null>; conflictFields: string[] } => {
  const merged: Record<string, string | null> = {};
  const conflictFields = new Set<string>();

  for (const row of sortByLatestTimestamp(rows)) {
    const values = pick(row);
    for (const [field, value] of Object.entries(values)) {
      if (!hasMeaningfulValue(value)) {
        continue;
      }

      if (!(field in merged) || !hasMeaningfulValue(merged[field])) {
        merged[field] = value;
        continue;
      }

      const current = normalizeComparableText(merged[field]);
      const next = normalizeComparableText(value);
      if (current && next && current !== next) {
        conflictFields.add(field);
      }
    }
  }

  return { merged, conflictFields: [...conflictFields].sort() };
};

const mergeSstMaps = (
  rows: ParsedResponseRow[]
): { merged: Partial<SstPerfilEditableValues>; conflictFields: string[] } => {
  const merged: Partial<SstPerfilEditableValues> = {};
  const conflictFields = new Set<string>();

  for (const row of sortByLatestTimestamp(rows)) {
    for (const [field, value] of Object.entries(row.mappedSst)) {
      if (!hasMeaningfulValue(value)) {
        continue;
      }

      if (!(field in merged) || !hasMeaningfulValue(merged[field as keyof SstPerfilEditableValues])) {
        (
          merged as Record<
            keyof SstPerfilEditableValues,
            SstPerfilEditableValues[keyof SstPerfilEditableValues]
          >
        )[field as keyof SstPerfilEditableValues] =
          value as SstPerfilEditableValues[keyof SstPerfilEditableValues];
        continue;
      }

      const current = normalizeComparableText(merged[field as keyof SstPerfilEditableValues]);
      const next = normalizeComparableText(value);
      if (
        typeof merged[field as keyof SstPerfilEditableValues] === 'boolean' ||
        typeof merged[field as keyof SstPerfilEditableValues] === 'number'
      ) {
        if (String(merged[field as keyof SstPerfilEditableValues]) !== String(value)) {
          conflictFields.add(field);
        }
        continue;
      }

      if (current && next && current !== next) {
        conflictFields.add(field);
      }
    }
  }

  return { merged, conflictFields: [...conflictFields].sort() };
};

const classifyDuplicateSet = (rows: ParsedResponseRow[]): DuplicateClassification => {
  if (rows.length <= 1) {
    return 'SIN_DUPLICADO';
  }

  const mergedSst = mergeSstMaps(rows);
  const mergedPersona = mergeStringMaps(rows, (row) => row.mappedPersona);
  const mergedContact = mergeStringMaps(rows, (row) => row.mappedContact);
  const mergedAffiliation = mergeStringMaps(rows, (row) => row.mappedAffiliation);
  const mergedUnsupported = mergeStringMaps(rows, (row) => row.unsupportedFields);
  const mergedSensitive = mergeStringMaps(rows, (row) => row.sensitiveFields);

  const conflictCount =
    mergedSst.conflictFields.length +
    mergedPersona.conflictFields.length +
    mergedContact.conflictFields.length +
    mergedAffiliation.conflictFields.length +
    mergedUnsupported.conflictFields.length +
    mergedSensitive.conflictFields.length;

  if (conflictCount > 0) {
    return 'DUPLICADO_CONFLICTO';
  }

  const latest = sortByLatestTimestamp(rows)[0];
  if (!latest) {
    return 'SIN_DUPLICADO';
  }
  const allComparable = rows.every((row) => {
    const sameSst =
      JSON.stringify(row.mappedSst, Object.keys(row.mappedSst).sort()) ===
      JSON.stringify(latest.mappedSst, Object.keys(latest.mappedSst).sort());
    const samePersona =
      JSON.stringify(row.mappedPersona, Object.keys(row.mappedPersona).sort()) ===
      JSON.stringify(latest.mappedPersona, Object.keys(latest.mappedPersona).sort());
    const sameContact =
      JSON.stringify(row.mappedContact, Object.keys(row.mappedContact).sort()) ===
      JSON.stringify(latest.mappedContact, Object.keys(latest.mappedContact).sort());
    const sameAffiliation =
      JSON.stringify(row.mappedAffiliation, Object.keys(row.mappedAffiliation).sort()) ===
      JSON.stringify(latest.mappedAffiliation, Object.keys(latest.mappedAffiliation).sort());
    const sameUnsupported =
      JSON.stringify(row.unsupportedFields, Object.keys(row.unsupportedFields).sort()) ===
      JSON.stringify(latest.unsupportedFields, Object.keys(latest.unsupportedFields).sort());

    return sameSst && samePersona && sameContact && sameAffiliation && sameUnsupported;
  });

  return allComparable ? 'DUPLICADO_IDENTICO' : 'DUPLICADO_COMPLEMENTARIO';
};

const duplicateConflictFields = (rows: ParsedResponseRow[]): string[] => {
  const mergedSst = mergeSstMaps(rows);
  const mergedPersona = mergeStringMaps(rows, (row) => row.mappedPersona);
  const mergedContact = mergeStringMaps(rows, (row) => row.mappedContact);
  const mergedAffiliation = mergeStringMaps(rows, (row) => row.mappedAffiliation);
  const mergedUnsupported = mergeStringMaps(rows, (row) => row.unsupportedFields);
  const mergedSensitive = mergeStringMaps(rows, (row) => row.sensitiveFields);

  return [
    ...mergedSst.conflictFields,
    ...mergedPersona.conflictFields,
    ...mergedContact.conflictFields,
    ...mergedAffiliation.conflictFields,
    ...mergedUnsupported.conflictFields,
    ...mergedSensitive.conflictFields
  ].sort();
};

export const formatDateIso = (value: string | null): string | null => (value ? value.slice(0, 10) : null);

export const readWorkbookAudit = async (filePath: string): Promise<WorkbookAudit> => {
  const buffer = await readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const fileName = path.basename(filePath);

  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Worksheet ${sheetName} not found in ${fileName}`);
    }
    const matrix = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true
    });

    const headerRow = (matrix[0] ?? []).map((value) => String(value ?? '').trim());
    const dataRows = matrix.slice(1);
    const rows = dataRows.map((row) => {
      const record: Record<string, unknown> = {};
      headerRow.forEach((header, index) => {
        if (header) {
          record[header] = row[index] ?? null;
        }
      });
      return record;
    });

    const usefulRows = rows.filter((row) =>
      Object.values(row).some((value) => hasMeaningfulValue(value))
    );
    const emptyRowNumbers = rows
      .map((row, index) => ({ index: index + 2, isEmpty: !Object.values(row).some(hasMeaningfulValue) }))
      .filter((row) => row.isEmpty)
      .map((row) => row.index);

    const emptyColumns = headerRow.filter((header) => {
      if (!header) {
        return false;
      }
      return rows.every((row) => !hasMeaningfulValue(row[header]));
    });

    return {
      name: sheetName,
      headers: headerRow.filter(Boolean),
      rows,
      totalRowsIncludingHeader: matrix.length,
      totalDataRows: rows.length,
      usefulRows: usefulRows.length,
      emptyRowNumbers,
      emptyColumns
    };
  });

  return {
    path: filePath,
    name: fileName,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    sheets
  };
};

export const parseResponseRows = (
  audit: WorkbookAudit,
  fileKey: 'F1' | 'F2'
): ParsedResponseRow[] => {
  const definitions = FILE_DEFINITIONS[fileKey];
  const sheet = audit.sheets[0];
  if (!sheet) {
    return [];
  }

  return sheet.rows
    .map((row, index) => {
      const timestampRaw = getObjectValue(row, 'marca_temporal');
      const fullNameRaw = getObjectValue(row, 'nombres_y_apellidos_mayusculas_sin_tildes');
      const documentRaw =
        fileKey === 'F1' ? getObjectValue(row, 'cedula_sin_puntos') : getObjectValue(row, 'cedula');
      const municipalityLaborRaw = getObjectValue(row, 'municipio_donde_labora');

      const mappedSst: Partial<SstPerfilEditableValues> = {};
      const mappedPersona: Record<string, string | null> = {};
      const mappedContact: Record<string, string | null> = {};
      const mappedAffiliation: Record<string, string | null> = {};
      const unsupportedFields: Record<string, string | null> = {};
      const sensitiveFields: Record<string, string | null> = {};

      for (const [header, value] of Object.entries(row)) {
        const normalized = normalizeHeader(header);
        const definition = definitions[normalized];
        if (!definition) {
          continue;
        }

        switch (definition.campoDestino) {
          case 'nacionalidad':
          case 'estrato_socioeconomico':
          case 'tipo_vivienda':
          case 'grupo_etnico':
          case 'nivel_escolaridad':
          case 'profesion_ocupacion':
          case 'redes_apoyo_social':
          case 'presenta_alergias':
          case 'medicamentos_permanentes':
          case 'enfermedad':
          case 'tipo_discapacidad':
            mappedSst[definition.campoDestino] = normalizeSstPerfilTextValue(value);
            break;
          case 'personas_dependen_economicamente':
          case 'total_hijos':
          case 'hijos_viven_con_usted':
          case 'hijos_menores_edad':
          case 'hijos_mayores_edad':
            mappedSst[definition.campoDestino] = normalizeSstPerfilIntegerValue(value);
            break;
          case 'cabeza_familia':
          case 'tiene_discapacidad':
          case 'autorizacion_tratamiento_datos':
            mappedSst[definition.campoDestino] = normalizeSstPerfilBooleanValue(value);
            break;
          case 'fecha_nacimiento':
            mappedPersona.fecha_nacimiento = normalizeDateValue(value);
            break;
          case 'sexo_id':
            mappedPersona.sexo = normalizeGender(value);
            break;
          case 'estado_civil_id':
            mappedPersona.estado_civil = normalizeEstadoCivil(value);
            break;
          case 'telefono':
            mappedPersona.telefono = normalizePhone(value);
            break;
          case 'zona_id':
            mappedPersona.zona = normalizeZona(value);
            break;
          case 'tipo_sangre_id':
            mappedPersona.tipo_sangre = normalizeBloodType(value);
            sensitiveFields.tipo_sangre_rh = normalizeBloodType(value);
            break;
          case 'nombre_contacto':
            mappedContact.nombre_contacto = normalizeComparableText(value);
            break;
          case 'parentesco':
            mappedContact.parentesco = normalizeComparableText(value);
            break;
          case 'telefono':
            mappedContact.telefono = normalizePhone(value);
            break;
          case 'eps_id':
            mappedAffiliation.eps = normalizeComparableText(value);
            break;
          case 'arl_id':
            mappedAffiliation.arl = normalizeComparableText(value);
            break;
          default:
            if (definition.classification === 'DATO_SENSIBLE' && definition.campoDestino) {
              sensitiveFields[definition.campoDestino] = normalizeComparableText(value);
            } else if (definition.classification === 'NO_DEFINIDO') {
              unsupportedFields[normalized] = normalizeComparableText(value);
            }
            break;
        }

        if (definition.classification === 'DATO_SENSIBLE' && definition.campoDestino) {
          sensitiveFields[definition.campoDestino] = normalizeComparableText(value);
        }
        if (definition.classification === 'NO_DEFINIDO') {
          unsupportedFields[normalized] = normalizeComparableText(value);
        }
      }

      return {
        fileKey,
        fileName: audit.name,
        sheetName: sheet.name,
        rowNumber: index + 2,
        timestampRaw: hasMeaningfulValue(timestampRaw) ? String(timestampRaw) : null,
        timestampIso: normalizeTimestampValue(timestampRaw),
        fullNameRaw: hasMeaningfulValue(fullNameRaw) ? String(fullNameRaw) : null,
        fullNameNormalized: normalizeName(fullNameRaw),
        documentRaw: hasMeaningfulValue(documentRaw) ? String(documentRaw) : null,
        documentNormalized: normalizeImportDocumentNumber(documentRaw),
        municipalityLaborRaw: normalizeComparableText(municipalityLaborRaw),
        mappedSst,
        mappedPersona,
        mappedContact,
        mappedAffiliation,
        unsupportedFields,
        sensitiveFields,
        row
      };
    })
    .filter((row) => {
      return Object.values(row.row).some((value) => hasMeaningfulValue(value));
    });
};

export const canonicalizeRows = (rows: ParsedResponseRow[]): CanonicalResponse[] => {
  const byDocument = new Map<string, ParsedResponseRow[]>();

  for (const row of rows) {
    if (!row.documentNormalized) {
      continue;
    }

    const bucket = byDocument.get(row.documentNormalized) ?? [];
    bucket.push(row);
    byDocument.set(row.documentNormalized, bucket);
  }

  return [...byDocument.entries()]
    .map(([documentNormalized, group]) => {
      const sorted = sortByLatestTimestamp(group);
      const latest = sorted[0];
      if (!latest) {
        throw new Error(`Canonical group without rows for ${documentNormalized}`);
      }
      const duplicateClassification = classifyDuplicateSet(group);
      const mergedSst = mergeSstMaps(group);
      const mergedPersona = mergeStringMaps(group, (row) => row.mappedPersona);
      const mergedContact = mergeStringMaps(group, (row) => row.mappedContact);
      const mergedAffiliation = mergeStringMaps(group, (row) => row.mappedAffiliation);
      const mergedUnsupported = mergeStringMaps(group, (row) => row.unsupportedFields);
      const mergedSensitive = mergeStringMaps(group, (row) => row.sensitiveFields);

      return {
        fileKey: latest.fileKey,
        fileName: latest.fileName,
        sheetName: latest.sheetName,
        documentNormalized,
        fullNameNormalized: latest.fullNameNormalized,
        municipalityLaborRaw: latest.municipalityLaborRaw,
        responseCount: group.length,
        timestampIsoLatest: latest.timestampIso,
        duplicateClassification,
        duplicateConflictFields: duplicateConflictFields(group),
        rowNumbers: group.map((row) => row.rowNumber).sort((left, right) => left - right),
        rawRows: group,
        mergedSst: mergedSst.merged,
        mergedPersona: mergedPersona.merged,
        mergedContact: mergedContact.merged,
        mergedAffiliation: mergedAffiliation.merged,
        unsupportedFields: mergedUnsupported.merged,
        sensitiveFields: mergedSensitive.merged
      };
    })
    .sort((left, right) => left.documentNormalized.localeCompare(right.documentNormalized));
};

export const loadMeta26PlanRows = async (): Promise<Map<string, Meta26PlanRow>> => {
  const content = await readFile(META26_PLAN_PATH, 'utf8');
  const parsed = JSON.parse(content) as { records: Meta26PlanRow[] };

  return new Map(
    parsed.records.map((record) => [
      normalizeImportDocumentNumber(record.cedula) ?? record.cedula,
      record
    ])
  );
};

export const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });
};

export const loadMeta26CurrentUniverse = async (pool: Pool): Promise<Map<string, Meta26PersonRow>> => {
  const result = await pool.query<Meta26PersonRow>(
    `
      SELECT
        p.id AS persona_id,
        v.id AS vinculacion_id,
        pi.numero_documento,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido
      FROM vinculaciones v
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN persona_identificaciones pi
        ON pi.persona_id = p.id
       AND pi.es_vigente = TRUE
      INNER JOIN tipos_documentos td ON td.id = pi.tipo_documento_id
      WHERE v.contrato_id = $1::bigint
      ORDER BY p.id ASC, v.id ASC
    `,
    [META26_CONTRACT_ID]
  );

  return new Map(
    result.rows.map((row) => [normalizeImportDocumentNumber(row.numero_documento) ?? row.numero_documento, row])
  );
};

export const loadMasterPeopleByDocuments = async (
  pool: Pool,
  documents: string[]
): Promise<Map<string, MasterPersonRow>> => {
  if (documents.length === 0) {
    return new Map();
  }

  const result = await pool.query<MasterPersonRow>(
    `
      WITH latest_vinculacion AS (
        SELECT DISTINCT ON (v.persona_id)
          v.persona_id,
          v.id AS vinculacion_id
        FROM vinculaciones v
        ORDER BY v.persona_id, (v.estado_vinculacion = 'ACTIVA') DESC, v.fecha_inicio DESC NULLS LAST, v.id DESC
      ),
      latest_contacto AS (
        SELECT DISTINCT ON (pce.persona_id)
          pce.persona_id,
          pce.nombre_contacto,
          pce.parentesco,
          pce.telefono
        FROM persona_contactos_emergencia pce
        WHERE COALESCE(pce.activo, TRUE) = TRUE
        ORDER BY pce.persona_id, pce.id DESC
      )
      SELECT
        p.id AS persona_id,
        lv.vinculacion_id,
        pi.numero_documento,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.fecha_nacimiento,
        s.nombre_sexo AS sexo_nombre,
        ec.nombre_estado_civil AS estado_civil_nombre,
        ts.codigo AS tipo_sangre_codigo,
        p.telefono,
        p.correo,
        p.direccion,
        z.nombre_zona AS zona_nombre,
        p.pais_nacimiento,
        lc.nombre_contacto AS contacto_nombre,
        lc.parentesco AS contacto_parentesco,
        lc.telefono AS contacto_telefono,
        e.nombre AS eps,
        a.nombre AS arl
      FROM persona_identificaciones pi
      INNER JOIN personas p ON p.id = pi.persona_id
      INNER JOIN tipos_documentos td ON td.id = pi.tipo_documento_id
      LEFT JOIN sexo s ON s.id = p.sexo_id
      LEFT JOIN estados_civiles ec ON ec.id = p.estado_civil_id
      LEFT JOIN tipos_sangre ts ON ts.id = p.tipo_sangre_id
      LEFT JOIN zonas z ON z.id = p.zona_id
      LEFT JOIN latest_contacto lc ON lc.persona_id = p.id
      LEFT JOIN latest_vinculacion lv ON lv.persona_id = p.id
      LEFT JOIN vinculacion_afiliaciones va ON va.vinculacion_id = lv.vinculacion_id
      LEFT JOIN eps e ON e.id = va.eps_id
      LEFT JOIN arl a ON a.id = va.arl_id
      WHERE pi.es_vigente = TRUE
        AND pi.numero_documento = ANY($1::text[])
    `,
    [documents]
  );

  const map = new Map<string, MasterPersonRow>();
  for (const row of result.rows) {
    const normalizedDocument = normalizeImportDocumentNumber(row.numero_documento);
    if (normalizedDocument && !map.has(normalizedDocument)) {
      map.set(normalizedDocument, row);
    }
  }

  return map;
};

export const loadCurrentSstByPersonaIds = async (
  pool: Pool,
  personaIds: number[]
): Promise<Map<number, SstPerfilImportSnapshot>> => {
  if (personaIds.length === 0) {
    return new Map();
  }

  const result = await pool.query<SstCurrentRow>(
    `
      SELECT
        spd.persona_id,
        spd.fecha_caracterizacion,
        spd.origen,
        spd.nacionalidad,
        spd.estrato_socioeconomico,
        spd.tipo_vivienda,
        spd.grupo_etnico,
        spd.nivel_escolaridad,
        spd.profesion_ocupacion,
        spd.personas_dependen_economicamente,
        spd.cabeza_familia,
        spd.total_hijos,
        spd.hijos_viven_con_usted,
        spd.hijos_menores_edad,
        spd.hijos_mayores_edad,
        spr.tipo_sangre_rh,
        spr.tiene_discapacidad,
        spr.tipo_discapacidad,
        spd.redes_apoyo_social,
        spr.presenta_alergias,
        spr.medicamentos_permanentes,
        spr.enfermedad,
        spd.autorizacion_tratamiento_datos,
        spd.observaciones
      FROM sst_perfil_demografico spd
      LEFT JOIN sst_perfil_restringido spr
        ON spr.persona_id = spd.persona_id
       AND COALESCE(spr.activo, TRUE) = TRUE
      WHERE COALESCE(spd.activo, TRUE) = TRUE
        AND spd.persona_id = ANY($1::bigint[])
    `,
    [personaIds]
  );

  return new Map(
    result.rows.map((row) => {
      const personaId = Number(row.persona_id);
      return [
        personaId,
        {
          persona_id: personaId,
          tipo_documento: null,
          numero_documento: null,
          fecha_caracterizacion: normalizeDateValue(row.fecha_caracterizacion),
          origen: (row.origen as SstPerfilImportSnapshot['origen']) ?? null,
          nacionalidad: row.nacionalidad,
          estrato_socioeconomico: row.estrato_socioeconomico,
          tipo_vivienda: row.tipo_vivienda,
          grupo_etnico: row.grupo_etnico,
          nivel_escolaridad: row.nivel_escolaridad,
          profesion_ocupacion: row.profesion_ocupacion,
          personas_dependen_economicamente:
            normalizeSstPerfilIntegerValue(row.personas_dependen_economicamente),
          cabeza_familia: row.cabeza_familia ?? null,
          total_hijos: normalizeSstPerfilIntegerValue(row.total_hijos),
          hijos_viven_con_usted: normalizeSstPerfilIntegerValue(row.hijos_viven_con_usted),
          hijos_menores_edad: normalizeSstPerfilIntegerValue(row.hijos_menores_edad),
          hijos_mayores_edad: normalizeSstPerfilIntegerValue(row.hijos_mayores_edad),
          tipo_sangre_rh: row.tipo_sangre_rh,
          tiene_discapacidad: row.tiene_discapacidad ?? null,
          tipo_discapacidad: row.tipo_discapacidad,
          redes_apoyo_social: row.redes_apoyo_social,
          presenta_alergias: row.presenta_alergias,
          medicamentos_permanentes: row.medicamentos_permanentes,
          enfermedad: row.enfermedad,
          autorizacion_tratamiento_datos: row.autorizacion_tratamiento_datos ?? null,
          observaciones: row.observaciones
        }
      ];
    })
  );
};

export const countQuery = async (pool: Pool, sql: string): Promise<number> => {
  const result = await pool.query<{ total: string }>(sql);
  return Number(result.rows[0]?.total ?? 0);
};

export const buildFullName = (person: {
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
}): string =>
  [person.primer_nombre, person.segundo_nombre, person.primer_apellido, person.segundo_apellido]
    .filter((value) => Boolean(value))
    .join(' ')
    .trim();

const sameComparable = (left: unknown, right: unknown): boolean => {
  const leftNormalized = normalizeComparableText(left);
  const rightNormalized = normalizeComparableText(right);
  return leftNormalized === rightNormalized;
};

const compareSharedField = (left: unknown, right: unknown): CrossStatus => {
  const hasLeft = hasMeaningfulValue(left);
  const hasRight = hasMeaningfulValue(right);

  if (!hasLeft && !hasRight) {
    return 'COINCIDE';
  }
  if (!hasLeft && hasRight) {
    return 'VACIO_EN_1';
  }
  if (hasLeft && !hasRight) {
    return 'VACIO_EN_2';
  }
  if (sameComparable(left, right)) {
    return 'COINCIDE';
  }

  return 'CONFLICTO';
};

export const buildCrossUniverse = (
  f1Canonical: CanonicalResponse[],
  f2Canonical: CanonicalResponse[]
): CrossUniverseRow[] => {
  const f1Map = new Map(f1Canonical.map((row) => [row.documentNormalized, row]));
  const f2Map = new Map(f2Canonical.map((row) => [row.documentNormalized, row]));
  const documents = [...new Set([...f1Map.keys(), ...f2Map.keys()])].sort();

  return documents.map((documentNormalized) => {
    const f1 = f1Map.get(documentNormalized) ?? null;
    const f2 = f2Map.get(documentNormalized) ?? null;
    const sharedFieldStatuses: CrossUniverseRow['sharedFieldStatuses'] = [];

    const compare = (field: keyof SstPerfilEditableValues) => {
      const status = compareSharedField(f1?.mergedSst[field] ?? null, f2?.mergedSst[field] ?? null);
      sharedFieldStatuses.push({
        field,
        status,
        valueF1: hasMeaningfulValue(f1?.mergedSst[field]) ? String(f1?.mergedSst[field]) : null,
        valueF2: hasMeaningfulValue(f2?.mergedSst[field]) ? String(f2?.mergedSst[field]) : null
      });
    };

    compare('nivel_escolaridad');

    const crossConflictFields = sharedFieldStatuses
      .filter((item) => item.status === 'CONFLICTO')
      .map((item) => item.field);

    return {
      documentNormalized,
      f1,
      f2,
      sharedFieldStatuses,
      crossConflictFields
    };
  });
};

const mapCanonicalToImportPayload = (canonical: CanonicalResponse): SstPerfilImportSnapshot => {
  return normalizeSstPerfilMappedRow({
    tipo_documento: 'CEDULA',
    numero_documento: canonical.documentNormalized,
    fecha_caracterizacion: formatDateIso(canonical.timestampIsoLatest),
    origen: 'FORMULARIO_DIGITAL',
    ...canonical.mergedSst
  });
};

export const computePersonaConflictFields = (
  master: MasterPersonRow,
  canonical: CanonicalResponse
): string[] => {
  const conflicts: string[] = [];
  const persona = canonical.mergedPersona;

  if (
    hasMeaningfulValue(persona.fecha_nacimiento) &&
    hasMeaningfulValue(master.fecha_nacimiento) &&
    normalizeDateValue(persona.fecha_nacimiento) !== normalizeDateValue(master.fecha_nacimiento)
  ) {
    conflicts.push('fecha_nacimiento');
  }
  if (
    hasMeaningfulValue(persona.sexo) &&
    hasMeaningfulValue(master.sexo_nombre) &&
    !sameComparable(persona.sexo, master.sexo_nombre)
  ) {
    conflicts.push('sexo');
  }
  if (
    hasMeaningfulValue(persona.estado_civil) &&
    hasMeaningfulValue(master.estado_civil_nombre) &&
    !sameComparable(persona.estado_civil, master.estado_civil_nombre)
  ) {
    conflicts.push('estado_civil');
  }
  if (
    hasMeaningfulValue(persona.telefono) &&
    hasMeaningfulValue(master.telefono) &&
    normalizePhone(persona.telefono) !== normalizePhone(master.telefono)
  ) {
    conflicts.push('telefono');
  }
  if (
    hasMeaningfulValue(persona.zona) &&
    hasMeaningfulValue(master.zona_nombre) &&
    !sameComparable(persona.zona, master.zona_nombre)
  ) {
    conflicts.push('zona');
  }
  if (
    hasMeaningfulValue(persona.tipo_sangre) &&
    hasMeaningfulValue(master.tipo_sangre_codigo) &&
    !sameComparable(persona.tipo_sangre, master.tipo_sangre_codigo)
  ) {
    conflicts.push('tipo_sangre');
  }

  return conflicts;
};

export const computeContactoConflictFields = (
  master: MasterPersonRow,
  canonical: CanonicalResponse
): string[] => {
  const conflicts: string[] = [];
  const contact = canonical.mergedContact;

  if (
    hasMeaningfulValue(contact.nombre_contacto) &&
    hasMeaningfulValue(master.contacto_nombre) &&
    !sameComparable(contact.nombre_contacto, master.contacto_nombre)
  ) {
    conflicts.push('contacto_nombre');
  }
  if (
    hasMeaningfulValue(contact.parentesco) &&
    hasMeaningfulValue(master.contacto_parentesco) &&
    !sameComparable(contact.parentesco, master.contacto_parentesco)
  ) {
    conflicts.push('contacto_parentesco');
  }
  if (
    hasMeaningfulValue(contact.telefono) &&
    hasMeaningfulValue(master.contacto_telefono) &&
    normalizePhone(contact.telefono) !== normalizePhone(master.contacto_telefono)
  ) {
    conflicts.push('contacto_telefono');
  }

  return conflicts;
};

export const computeAffiliationConflictFields = (
  master: MasterPersonRow,
  canonical: CanonicalResponse
): string[] => {
  const conflicts: string[] = [];
  const affiliation = canonical.mergedAffiliation;

  if (
    hasMeaningfulValue(affiliation.eps) &&
    hasMeaningfulValue(master.eps) &&
    !sameComparable(affiliation.eps, master.eps)
  ) {
    conflicts.push('eps');
  }
  if (
    hasMeaningfulValue(affiliation.arl) &&
    hasMeaningfulValue(master.arl) &&
    !sameComparable(affiliation.arl, master.arl)
  ) {
    conflicts.push('arl');
  }

  return conflicts;
};

const buildCoverageRows = (
  meta26Universe: Map<string, Meta26PersonRow>,
  meta26Plan: Map<string, Meta26PlanRow>,
  f1CanonicalMap: Map<string, CanonicalResponse>,
  f2CanonicalMap: Map<string, CanonicalResponse>,
  crossMap: Map<string, CrossUniverseRow>,
  masters: Map<string, MasterPersonRow>
): CoverageRow[] => {
  const rows: CoverageRow[] = [];

  for (const [documentNormalized, meta26Person] of meta26Universe.entries()) {
    const f1 = f1CanonicalMap.get(documentNormalized) ?? null;
    const f2 = f2CanonicalMap.get(documentNormalized) ?? null;
    const cross = crossMap.get(documentNormalized) ?? null;
    const master = masters.get(documentNormalized);
    const plan = meta26Plan.get(documentNormalized);

    const combinedSst: Partial<SstPerfilEditableValues> = {
      ...(f1?.mergedSst ?? {}),
      ...(f2?.mergedSst ?? {})
    };

    const unsupportedFields = [...Object.keys(f1?.unsupportedFields ?? {}), ...Object.keys(f2?.unsupportedFields ?? {})];
    const reviewUnsupportedFields = unsupportedFields.filter((field) =>
      REVIEW_WORTHY_UNSUPPORTED_FIELDS.has(field)
    );
    const personaConflictFields = master
      ? [
          ...(f1 ? computePersonaConflictFields(master, f1) : []),
          ...(f2 ? computePersonaConflictFields(master, f2) : [])
        ]
      : [];
    const contactConflictFields = master
      ? [
          ...(f1 ? computeContactoConflictFields(master, f1) : []),
          ...(f2 ? computeContactoConflictFields(master, f2) : [])
        ]
      : [];
    const affiliationConflictFields = master
      ? [
          ...(f1 ? computeAffiliationConflictFields(master, f1) : []),
          ...(f2 ? computeAffiliationConflictFields(master, f2) : [])
        ]
      : [];

    const allConflicts = [
      ...(f1?.duplicateConflictFields ?? []),
      ...(f2?.duplicateConflictFields ?? []),
      ...(cross?.crossConflictFields ?? []),
      ...personaConflictFields.map((field) => `persona:${field}`),
      ...contactConflictFields.map((field) => `contacto:${field}`),
      ...affiliationConflictFields.map((field) => `afiliacion:${field}`)
    ];

    const completitud = computeSstPerfilCompleteness({
      fecha_nacimiento: normalizeDateValue(master?.fecha_nacimiento),
      sexo_id: hasMeaningfulValue(master?.sexo_nombre) ? 1 : null,
      estado_civil_id: hasMeaningfulValue(master?.estado_civil_nombre) ? 1 : null,
      requiere_revision: allConflicts.length > 0 || reviewUnsupportedFields.length > 0,
      values: {
        ...EMPTY_SST_PERFIL_VALUES,
        ...combinedSst
      }
    });

    let estadoPreliminar: PreliminaryCoverageStatus;
    if (!f1 && !f2) {
      estadoPreliminar = 'NO_ENCONTRADA_DIGITAL';
    } else if (allConflicts.length > 0) {
      estadoPreliminar = 'CONFLICTO';
    } else if (reviewUnsupportedFields.length > 0) {
      estadoPreliminar = 'REQUIERE_REVISION';
    } else if (completitud.estado === 'COMPLETA') {
      estadoPreliminar = 'COMPLETA_DIGITAL';
    } else {
      estadoPreliminar = 'PARCIAL_DIGITAL';
    }

    rows.push({
      persona_id: Number(meta26Person.persona_id),
      documento: documentNormalized,
      nombre:
        buildFullName(meta26Person) || plan?.nombre_resuelto || f1?.fullNameNormalized || f2?.fullNameNormalized || '',
      municipio: plan?.municipio ?? null,
      institucion: plan?.institucion ?? null,
      sede: plan?.sede ?? null,
      cargo: plan?.cargo_nombre ?? null,
      formulario_1: Boolean(f1),
      formulario_2: Boolean(f2),
      numero_respuestas_f1: f1?.responseCount ?? 0,
      numero_respuestas_f2: f2?.responseCount ?? 0,
      estado_cruce:
        f1 && f2 ? (cross?.crossConflictFields.length ? 'CONFLICTO' : 'FORMULARIOS_2_DE_2') : f1 ? 'SOLO_FORMULARIO_1' : f2 ? 'SOLO_FORMULARIO_2' : 'SIN_FORMULARIO_DIGITAL',
      campos_disponibles: [...completitud.campos_completos],
      campos_faltantes: [...completitud.campos_faltantes],
      conflictos: [...new Set(allConflicts)].sort(),
      porcentaje_preliminar: completitud.porcentaje,
      estado_preliminar: estadoPreliminar,
      requiere_revision: estadoPreliminar === 'CONFLICTO' || estadoPreliminar === 'REQUIERE_REVISION',
      requiere_digitacion_fisica:
        estadoPreliminar === 'NO_ENCONTRADA_DIGITAL' ||
        (estadoPreliminar === 'PARCIAL_DIGITAL' && completitud.campos_faltantes.length > 0)
    });
  }

  return rows.sort((left, right) => left.documento.localeCompare(right.documento));
};

const summarizeDryRun = (
  scope: string,
  rows: CanonicalResponse[],
  meta26Universe: Map<string, Meta26PersonRow>,
  currentSstMap: Map<number, SstPerfilImportSnapshot>
): DryRunSummary => {
  let dentroMeta26 = 0;
  let fueraMeta26 = 0;
  let noIdentificables = 0;
  let nuevas = 0;
  let actualizaciones = 0;
  let sinCambios = 0;
  let conflictos = 0;
  let errores = 0;
  let sensiblesPresentes = 0;
  let camposIgnorados = 0;

  for (const row of rows) {
    if (!row.documentNormalized) {
      noIdentificables += 1;
      continue;
    }

    const meta26 = meta26Universe.get(row.documentNormalized);
    if (!meta26) {
      fueraMeta26 += 1;
      continue;
    }

    dentroMeta26 += 1;
    const personaId = Number(meta26.persona_id);
    const current = currentSstMap.get(personaId) ?? null;
    const payload = mapCanonicalToImportPayload(row);
    const result = classifySstPerfilImportRow(payload, current, false, true);

    const hasStructuralConflict =
      row.duplicateClassification === 'DUPLICADO_CONFLICTO' || row.duplicateConflictFields.length > 0;
    const finalClassification: MasterImportClassification =
      hasStructuralConflict ? 'CONFLICTO' : result.classification;

    if (finalClassification === 'NUEVA') {
      nuevas += 1;
    } else if (finalClassification === 'ACTUALIZACION') {
      actualizaciones += 1;
    } else if (finalClassification === 'SIN_CAMBIOS') {
      sinCambios += 1;
    } else if (finalClassification === 'CONFLICTO') {
      conflictos += 1;
    } else {
      errores += 1;
    }

    if (Object.values(row.sensitiveFields).some(hasMeaningfulValue)) {
      sensiblesPresentes += 1;
    }
    if (Object.values(row.unsupportedFields).some(hasMeaningfulValue)) {
      camposIgnorados += 1;
    }
  }

  return {
    scope,
    total_canonicos: rows.length,
    dentro_meta26: dentroMeta26,
    fuera_meta26: fueraMeta26,
    no_identificables: noIdentificables,
    nuevas,
    actualizaciones,
    sin_cambios: sinCambios,
    conflictos,
    errores,
    sensibles_presentes: sensiblesPresentes,
    campos_ignorados: camposIgnorados
  };
};

const writeCsv = async (filePath: string, headers: string[], rows: Array<Record<string, unknown>>) => {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '')).join(','));
  }

  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
};

const main = async () => {
  await mkdir(REPORTS_DIR, { recursive: true });

  const [file1Audit, file2Audit] = await Promise.all([
    readWorkbookAudit(FILE_1_PATH),
    readWorkbookAudit(FILE_2_PATH)
  ]);

  const f1Rows = parseResponseRows(file1Audit, 'F1');
  const f2Rows = parseResponseRows(file2Audit, 'F2');
  const f1Canonical = canonicalizeRows(f1Rows);
  const f2Canonical = canonicalizeRows(f2Rows);
  const crossUniverse = buildCrossUniverse(f1Canonical, f2Canonical);

  const allNormalizedDocuments = [...new Set([...f1Canonical, ...f2Canonical].map((row) => row.documentNormalized))].sort();

  const pool = createPool();

  try {
    const [
      meta26Universe,
      meta26Plan,
      baselinePersonas,
      baselineVinculaciones,
      baselineCobertura,
      baselineFocalizacionFinal,
      baselineFocalizacionVigencias,
      baselineSstCurrent,
      baselineSstVersions
    ] = await Promise.all([
      loadMeta26CurrentUniverse(pool),
      loadMeta26PlanRows(),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
      countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones')
    ]);

    const masters = await loadMasterPeopleByDocuments(pool, allNormalizedDocuments);
    const currentSstMap = await loadCurrentSstByPersonaIds(
      pool,
      [...meta26Universe.values()].map((row) => Number(row.persona_id))
    );

    const f1CanonicalMap = new Map(f1Canonical.map((row) => [row.documentNormalized, row]));
    const f2CanonicalMap = new Map(f2Canonical.map((row) => [row.documentNormalized, row]));
    const crossMap = new Map(crossUniverse.map((row) => [row.documentNormalized, row]));

    const coverageRows = buildCoverageRows(
      meta26Universe,
      meta26Plan,
      f1CanonicalMap,
      f2CanonicalMap,
      crossMap,
      masters
    );

    const duplicateRows = [...f1Canonical, ...f2Canonical]
      .filter((row) => row.responseCount > 1)
      .map((row) => ({
        archivo: row.fileName,
        hoja: row.sheetName,
        documento: row.documentNormalized,
        numero_respuestas: row.responseCount,
        timestamps: row.rawRows
          .map((raw) => raw.timestampIso ?? raw.timestampRaw ?? '')
          .filter(Boolean)
          .join(' | '),
        clasificacion_duplicado: row.duplicateClassification,
        fila_mas_reciente: row.rowNumbers[row.rowNumbers.length - 1] ?? '',
        filas: row.rowNumbers.join(' | '),
        conflicto_campos: row.duplicateConflictFields.join(' | ')
      }));

    const crossRows = crossUniverse.map((row) => ({
      documento: row.documentNormalized,
      estado_cruce:
        row.f1 && row.f2 ? 'FORMULARIOS_2_DE_2' : row.f1 ? 'SOLO_FORMULARIO_1' : 'SOLO_FORMULARIO_2',
      conflictos: row.crossConflictFields.join(' | '),
      nivel_escolaridad_estado:
        row.sharedFieldStatuses.find((item) => item.field === 'nivel_escolaridad')?.status ?? '',
      valor_f1:
        row.sharedFieldStatuses.find((item) => item.field === 'nivel_escolaridad')?.valueF1 ?? '',
      valor_f2:
        row.sharedFieldStatuses.find((item) => item.field === 'nivel_escolaridad')?.valueF2 ?? ''
    }));

    const matrixRows: Array<Record<string, unknown>> = [];
    for (const [fileKey, definitions] of Object.entries(FILE_DEFINITIONS) as Array<
      ['F1' | 'F2', Record<string, FileFieldDefinition>]
    >) {
      const audit = fileKey === 'F1' ? file1Audit : file2Audit;
      const sheet = audit.sheets[0];
      if (!sheet) {
        continue;
      }
      for (const header of sheet.headers) {
        const normalized = normalizeHeader(header);
        const definition = definitions[normalized];
        const sampleRow = sheet.rows.find((row) => hasMeaningfulValue(row[header]));
        matrixRows.push({
          archivo: audit.name,
          hoja: sheet.name,
          columna_origen: header,
          ejemplo_valor: sampleRow?.[header] ?? '',
          clasificacion: definition?.classification ?? 'NO_DEFINIDO',
          destino_propuesto: definition?.destinoPropuesto ?? '',
          tabla_destino: definition?.tablaDestino ?? '',
          campo_destino: definition?.campoDestino ?? '',
          ya_existe_en_empiria: definition?.yaExisteEnEmpiria ?? false,
          requiere_catalogo: definition?.requiereCatalogo ?? false,
          requiere_normalizacion: definition?.requiereNormalizacion ?? false,
          es_sensible: definition?.esSensible ?? false,
          accion_propuesta: definition?.accionPropuesta ?? 'REVISAR',
          observaciones: definition?.observaciones ?? 'Columna sin clasificacion previa; requiere revision.'
        });
      }
    }

    const valueFrequency = new Map<string, { field: string; raw: string; normalized: string; count: number; action: string; observation: string }>();
    const pushValueFrequency = (
      field: string,
      raw: unknown,
      normalized: unknown,
      action: string,
      observation: string
    ) => {
      if (!hasMeaningfulValue(raw)) {
        return;
      }

      const key = [field, String(raw), String(normalized ?? '')].join('||');
      const current = valueFrequency.get(key);
      if (current) {
        current.count += 1;
        return;
      }

      valueFrequency.set(key, {
        field,
        raw: String(raw),
        normalized: normalized === null || normalized === undefined ? '' : String(normalized),
        count: 1,
        action,
        observation
      });
    };

    for (const row of [...f1Rows, ...f2Rows]) {
      for (const [header, value] of Object.entries(row.row)) {
        const normalizedHeader = normalizeHeader(header);
        const definition =
          (FILE_DEFINITIONS[row.fileKey] as Record<string, FileFieldDefinition | undefined>)[
            normalizedHeader
          ];
        if (!definition || !hasMeaningfulValue(value)) {
          continue;
        }

        let normalizedValue: unknown = value;
        if (definition.requiereNormalizacion) {
          switch (definition.campoDestino) {
            case 'personas_dependen_economicamente':
            case 'total_hijos':
            case 'hijos_viven_con_usted':
            case 'hijos_menores_edad':
            case 'hijos_mayores_edad':
              normalizedValue = normalizeSstPerfilIntegerValue(value);
              break;
            case 'cabeza_familia':
            case 'tiene_discapacidad':
            case 'autorizacion_tratamiento_datos':
              normalizedValue = normalizeSstPerfilBooleanValue(value);
              break;
            case 'fecha_nacimiento':
              normalizedValue = normalizeDateValue(value);
              break;
            case 'telefono':
              normalizedValue = normalizePhone(value);
              break;
            case 'sexo_id':
              normalizedValue = normalizeGender(value);
              break;
            case 'estado_civil_id':
              normalizedValue = normalizeEstadoCivil(value);
              break;
            case 'tipo_sangre_id':
              normalizedValue = normalizeBloodType(value);
              break;
            default:
              normalizedValue = normalizeSstPerfilTextValue(value) ?? normalizeComparableText(value);
              break;
          }
        }

        pushValueFrequency(
          normalizedHeader,
          value,
          normalizedValue,
          definition.accionPropuesta,
          definition.observaciones
        );
      }
    }

    const dryRunF1 = summarizeDryRun('F1', f1Canonical, meta26Universe, currentSstMap);
    const dryRunF2 = summarizeDryRun('F2', f2Canonical, meta26Universe, currentSstMap);

    const combinedCanonical: CanonicalResponse[] = [...crossUniverse].map((row) => {
      const base = row.f1 ?? row.f2;
      if (!base) {
        throw new Error(`Cross universe row without source for document ${row.documentNormalized}`);
      }

      const duplicateClassification: DuplicateClassification =
        row.f1?.duplicateClassification === 'DUPLICADO_CONFLICTO' ||
        row.f2?.duplicateClassification === 'DUPLICADO_CONFLICTO' ||
        row.crossConflictFields.length > 0
          ? 'DUPLICADO_CONFLICTO'
          : row.f1?.duplicateClassification === 'DUPLICADO_COMPLEMENTARIO' ||
              row.f2?.duplicateClassification === 'DUPLICADO_COMPLEMENTARIO'
            ? 'DUPLICADO_COMPLEMENTARIO'
            : 'DUPLICADO_IDENTICO';

      return {
        ...base,
        responseCount: (row.f1?.responseCount ?? 0) + (row.f2?.responseCount ?? 0),
        duplicateClassification,
        duplicateConflictFields: [
          ...(row.f1?.duplicateConflictFields ?? []),
          ...(row.f2?.duplicateConflictFields ?? []),
          ...row.crossConflictFields
        ],
        rowNumbers: [...(row.f1?.rowNumbers ?? []), ...(row.f2?.rowNumbers ?? [])].sort((a, b) => a - b),
        rawRows: [...(row.f1?.rawRows ?? []), ...(row.f2?.rawRows ?? [])],
        mergedSst: {
          ...(row.f1?.mergedSst ?? {}),
          ...(row.f2?.mergedSst ?? {})
        },
        mergedPersona: {
          ...(row.f1?.mergedPersona ?? {}),
          ...(row.f2?.mergedPersona ?? {})
        },
        mergedContact: {
          ...(row.f1?.mergedContact ?? {}),
          ...(row.f2?.mergedContact ?? {})
        },
        mergedAffiliation: {
          ...(row.f1?.mergedAffiliation ?? {}),
          ...(row.f2?.mergedAffiliation ?? {})
        },
        unsupportedFields: {
          ...(row.f1?.unsupportedFields ?? {}),
          ...(row.f2?.unsupportedFields ?? {})
        },
        sensitiveFields: {
          ...(row.f1?.sensitiveFields ?? {}),
          ...(row.f2?.sensitiveFields ?? {})
        }
      };
    });

    const dryRunCombined = summarizeDryRun(
      'COMBINADO',
      combinedCanonical,
      meta26Universe,
      currentSstMap
    );

    const combinedDocumentSet = new Set(allNormalizedDocuments);
    const bothCount = crossUniverse.filter((row) => row.f1 && row.f2).length;
    const onlyF1Count = crossUniverse.filter((row) => row.f1 && !row.f2).length;
    const onlyF2Count = crossUniverse.filter((row) => !row.f1 && row.f2).length;

    const duplicateStats = duplicateRows.reduce(
      (accumulator, row) => {
        if (row.clasificacion_duplicado === 'DUPLICADO_IDENTICO') {
          accumulator.identicos += 1;
        } else if (row.clasificacion_duplicado === 'DUPLICADO_COMPLEMENTARIO') {
          accumulator.complementarios += 1;
        } else if (row.clasificacion_duplicado === 'DUPLICADO_CONFLICTO') {
          accumulator.conflicto += 1;
        }
        return accumulator;
      },
      { identicos: 0, complementarios: 0, conflicto: 0 }
    );

    const outsideMeta26 = allNormalizedDocuments.filter((document) => !meta26Universe.has(document)).length;
    const meta26Coverage = {
      completaDigital: coverageRows.filter((row) => row.estado_preliminar === 'COMPLETA_DIGITAL').length,
      parcialDigital: coverageRows.filter((row) => row.estado_preliminar === 'PARCIAL_DIGITAL').length,
      noEncontradaDigital: coverageRows.filter((row) => row.estado_preliminar === 'NO_ENCONTRADA_DIGITAL').length,
      conflicto: coverageRows.filter((row) => row.estado_preliminar === 'CONFLICTO').length,
      requiereRevision: coverageRows.filter((row) => row.estado_preliminar === 'REQUIERE_REVISION').length,
      requiereDigitacionFisica: coverageRows.filter((row) => row.requiere_digitacion_fisica).length
    };

    const conflictsAgainstPersona = combinedCanonical.flatMap((row) => {
      const master = masters.get(row.documentNormalized);
      return master ? computePersonaConflictFields(master, row) : [];
    }).length;
    const conflictsAgainstContact = combinedCanonical.flatMap((row) => {
      const master = masters.get(row.documentNormalized);
      return master ? computeContactoConflictFields(master, row) : [];
    }).length;
    const conflictsAgainstAffiliations = combinedCanonical.flatMap((row) => {
      const master = masters.get(row.documentNormalized);
      return master ? computeAffiliationConflictFields(master, row) : [];
    }).length;

    await writeCsv(
      OUTPUT_MATRIX,
      [
        'archivo',
        'hoja',
        'columna_origen',
        'ejemplo_valor',
        'clasificacion',
        'destino_propuesto',
        'tabla_destino',
        'campo_destino',
        'ya_existe_en_empiria',
        'requiere_catalogo',
        'requiere_normalizacion',
        'es_sensible',
        'accion_propuesta',
        'observaciones'
      ],
      matrixRows
    );

    await writeCsv(
      OUTPUT_DUPLICATES,
      [
        'archivo',
        'hoja',
        'documento',
        'numero_respuestas',
        'timestamps',
        'clasificacion_duplicado',
        'fila_mas_reciente',
        'filas',
        'conflicto_campos'
      ],
      duplicateRows
    );

    await writeCsv(
      OUTPUT_CROSS,
      ['documento', 'estado_cruce', 'conflictos', 'nivel_escolaridad_estado', 'valor_f1', 'valor_f2'],
      crossRows
    );

    await writeCsv(
      OUTPUT_COVERAGE,
      [
        'persona_id',
        'documento',
        'nombre',
        'municipio',
        'institucion',
        'sede',
        'cargo',
        'formulario_1',
        'formulario_2',
        'numero_respuestas_f1',
        'numero_respuestas_f2',
        'estado_cruce',
        'campos_disponibles',
        'campos_faltantes',
        'conflictos',
        'porcentaje_preliminar',
        'estado_preliminar',
        'requiere_revision',
        'requiere_digitacion_fisica'
      ],
      coverageRows.map((row) => ({
        persona_id: row.persona_id,
        documento: row.documento,
        nombre: row.nombre,
        municipio: row.municipio,
        institucion: row.institucion,
        sede: row.sede,
        cargo: row.cargo,
        formulario_1: row.formulario_1,
        formulario_2: row.formulario_2,
        numero_respuestas_f1: row.numero_respuestas_f1,
        numero_respuestas_f2: row.numero_respuestas_f2,
        estado_cruce: row.estado_cruce,
        campos_disponibles: row.campos_disponibles.join(' | '),
        campos_faltantes: row.campos_faltantes.join(' | '),
        conflictos: row.conflictos.join(' | '),
        porcentaje_preliminar: row.porcentaje_preliminar,
        estado_preliminar: row.estado_preliminar,
        requiere_revision: row.requiere_revision,
        requiere_digitacion_fisica: row.requiere_digitacion_fisica
      }))
    );

    await writeCsv(
      OUTPUT_VALUES,
      ['campo', 'valor_original', 'valor_normalizado_propuesto', 'frecuencia', 'accion', 'observacion'],
      [...valueFrequency.values()]
        .sort((left, right) => left.field.localeCompare(right.field) || right.count - left.count)
        .map((row) => ({
          campo: row.field,
          valor_original: row.raw,
          valor_normalizado_propuesto: row.normalized,
          frecuencia: row.count,
          accion: row.action,
          observacion: row.observation
        }))
    );

    const summary = {
      generated_at: new Date().toISOString(),
      baseline: {
        personas: baselinePersonas,
        vinculaciones: baselineVinculaciones,
        cobertura_asignaciones: baselineCobertura,
        focalizacion_final: baselineFocalizacionFinal,
        focalizacion_vigencias: baselineFocalizacionVigencias,
        sst_perfiles_actuales: baselineSstCurrent,
        sst_perfiles_versiones: baselineSstVersions
      },
      files: {
        f1: {
          path: file1Audit.path,
          name: file1Audit.name,
          sha256: file1Audit.sha256,
          size_bytes: file1Audit.sizeBytes,
          sheets: file1Audit.sheets.map((sheet) => ({
            name: sheet.name,
            headers: sheet.headers,
            total_rows_including_header: sheet.totalRowsIncludingHeader,
            total_data_rows: sheet.totalDataRows,
            useful_rows: sheet.usefulRows,
            empty_columns: sheet.emptyColumns,
            empty_rows: sheet.emptyRowNumbers.length
          })),
          documents: {
            normalized: f1Rows.filter((row) => row.documentNormalized).length,
            invalid: f1Rows.filter((row) => row.documentRaw && !row.documentNormalized).length,
            empty: f1Rows.filter((row) => !row.documentRaw).length,
            unique: f1Canonical.length,
            duplicate_groups: f1Canonical.filter((row) => row.responseCount > 1).length
          }
        },
        f2: {
          path: file2Audit.path,
          name: file2Audit.name,
          sha256: file2Audit.sha256,
          size_bytes: file2Audit.sizeBytes,
          sheets: file2Audit.sheets.map((sheet) => ({
            name: sheet.name,
            headers: sheet.headers,
            total_rows_including_header: sheet.totalRowsIncludingHeader,
            total_data_rows: sheet.totalDataRows,
            useful_rows: sheet.usefulRows,
            empty_columns: sheet.emptyColumns,
            empty_rows: sheet.emptyRowNumbers.length
          })),
          documents: {
            normalized: f2Rows.filter((row) => row.documentNormalized).length,
            invalid: f2Rows.filter((row) => row.documentRaw && !row.documentNormalized).length,
            empty: f2Rows.filter((row) => !row.documentRaw).length,
            unique: f2Canonical.length,
            duplicate_groups: f2Canonical.filter((row) => row.responseCount > 1).length
          }
        }
      },
      universe: {
        contrato_meta26_id: META26_CONTRACT_ID,
        universo_meta26_esperado: 772,
        universo_meta26_real: meta26Universe.size,
        documentos_unicos_combinados: combinedDocumentSet.size,
        respondieron_ambos: bothCount,
        solo_f1: onlyF1Count,
        solo_f2: onlyF2Count,
        duplicados_identicos: duplicateStats.identicos,
        duplicados_complementarios: duplicateStats.complementarios,
        duplicados_conflicto: duplicateStats.conflicto,
        fuera_meta26: outsideMeta26,
        no_identificables:
          f1Rows.filter((row) => !row.documentNormalized).length +
          f2Rows.filter((row) => !row.documentNormalized).length
      },
      meta26_coverage: meta26Coverage,
      conflicts: {
        persona: conflictsAgainstPersona,
        contacto_emergencia: conflictsAgainstContact,
        afiliaciones: conflictsAgainstAffiliations
      },
      dry_run: {
        f1: dryRunF1,
        f2: dryRunF2,
        combinado: dryRunCombined
      },
      sensitive_fields: SENSITIVE_FIELD_PROTECTIONS,
      reports: {
        matriz_campos: OUTPUT_MATRIX,
        duplicados: OUTPUT_DUPLICATES,
        cruce_formularios: OUTPUT_CROSS,
        cobertura_meta26: OUTPUT_COVERAGE,
        valores: OUTPUT_VALUES,
        resumen: OUTPUT_SUMMARY
      }
    };

    await writeFile(OUTPUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    const postcheck = {
      personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
      vinculaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
      cobertura_asignaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
      focalizacion_final: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
      focalizacion_vigencias: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
      sst_perfiles_actuales: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
      sst_perfiles_versiones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones')
    };

    console.log(
      JSON.stringify(
        {
          ok: true,
          files: {
            f1: {
              path: file1Audit.path,
              sha256: file1Audit.sha256,
              rows: file1Audit.sheets[0]?.usefulRows ?? 0
            },
            f2: {
              path: file2Audit.path,
              sha256: file2Audit.sha256,
              rows: file2Audit.sheets[0]?.usefulRows ?? 0
            }
          },
          summary,
          postcheck
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
};

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
