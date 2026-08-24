import * as XLSX from 'xlsx';

import { normalizeNumeroDocumento } from '../personas/personas.identificaciones.helpers';
import {
  SST_PERFIL_FIELD_DEFINITIONS,
  SST_PERFIL_FIELD_LABELS,
  normalizeComparableSstValue,
  normalizeSstPerfilBooleanValue,
  normalizeSstPerfilIntegerValue,
  normalizeSstPerfilTextValue,
  type SstPerfilEditableValues,
  type SstPerfilOrigen
} from '../sst/sst.perfil.domain';

export type MasterImportType = 'DATOS_PERSONALES' | 'INFORMACION_BANCARIA' | 'CARACTERIZACION_SST';
export type MasterImportStatus = 'PREPARADO' | 'VALIDADO' | 'APLICADO' | 'CANCELADO' | 'ERROR';
export type MasterImportFilter =
  | 'TODOS'
  | 'NUEVAS'
  | 'ACTUALIZACIONES'
  | 'SIN_CAMBIOS'
  | 'ERRORES'
  | 'DUPLICADOS'
  | 'APLICABLES';
export type MasterImportClassification =
  | 'NUEVA'
  | 'ACTUALIZACION'
  | 'SIN_CAMBIOS'
  | 'ERROR'
  | 'POSIBLE_DUPLICADO'
  | 'CUENTA_NUEVA'
  | 'CAMBIO_CUENTA'
  | 'CONFLICTO';

export interface ImportValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface MasterImportDiff {
  field: string;
  label: string;
  current_value: string | null;
  next_value: string | null;
}

export interface MasterImportFieldDefinition {
  code: string;
  label: string;
  required: boolean;
  type: MasterImportType;
  aliases: string[];
}

export interface MasterImportColumnSuggestion {
  header: string;
  suggested_field: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MasterImportAnalyzeResult {
  detected_headers: string[];
  sample_rows: number;
  total_rows: number;
  suggestions: MasterImportColumnSuggestion[];
  required_fields: string[];
}

export interface PersonalImportSnapshot {
  persona_id: number | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  primer_nombre: string | null;
  segundo_nombre: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  barrio: string | null;
  municipio_residencia: string | null;
  pais_nacimiento: string | null;
}

export interface BankingImportSnapshot {
  persona_id: number | null;
  cuenta_bancaria_id: number | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  entidad_bancaria: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  titular: string | null;
  nombre_titular: string | null;
  documento_titular: string | null;
  observacion: string | null;
}

export interface SstPerfilImportSnapshot extends SstPerfilEditableValues {
  persona_id: number | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  fecha_caracterizacion: string | null;
  origen: SstPerfilOrigen | null;
}

export interface MasterImportClassificationResult<TPayload extends object> {
  classification: MasterImportClassification;
  name: string | null;
  normalized: TPayload;
  diffs: MasterImportDiff[];
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
  requires_apply: boolean;
}

const PERSONAL_FIELDS: MasterImportFieldDefinition[] = [
  { code: 'tipo_documento', label: 'Tipo documento', required: true, type: 'DATOS_PERSONALES', aliases: ['tipo_documento', 'tipo_identificacion', 'tipo id', 'documento tipo'] },
  { code: 'numero_documento', label: 'Numero documento', required: true, type: 'DATOS_PERSONALES', aliases: ['numero_documento', 'numero_identificacion', 'documento', 'cedula', 'nro_documento', 'identificacion'] },
  { code: 'primer_nombre', label: 'Primer nombre', required: false, type: 'DATOS_PERSONALES', aliases: ['primer_nombre', 'nombre', 'nombres', 'nombre_1'] },
  { code: 'segundo_nombre', label: 'Segundo nombre', required: false, type: 'DATOS_PERSONALES', aliases: ['segundo_nombre', 'nombre_2'] },
  { code: 'primer_apellido', label: 'Primer apellido', required: false, type: 'DATOS_PERSONALES', aliases: ['primer_apellido', 'apellido', 'apellidos', 'apellido_1'] },
  { code: 'segundo_apellido', label: 'Segundo apellido', required: false, type: 'DATOS_PERSONALES', aliases: ['segundo_apellido', 'apellido_2'] },
  { code: 'fecha_nacimiento', label: 'Fecha nacimiento', required: false, type: 'DATOS_PERSONALES', aliases: ['fecha_nacimiento', 'nacimiento', 'fecha de nacimiento'] },
  { code: 'telefono', label: 'Telefono', required: false, type: 'DATOS_PERSONALES', aliases: ['telefono', 'celular', 'movil'] },
  { code: 'correo', label: 'Correo', required: false, type: 'DATOS_PERSONALES', aliases: ['correo', 'email', 'correo_electronico'] },
  { code: 'direccion', label: 'Direccion', required: false, type: 'DATOS_PERSONALES', aliases: ['direccion', 'direccion_residencia'] },
  { code: 'barrio', label: 'Barrio', required: false, type: 'DATOS_PERSONALES', aliases: ['barrio'] },
  { code: 'municipio_residencia', label: 'Municipio residencia', required: false, type: 'DATOS_PERSONALES', aliases: ['municipio_residencia', 'municipio', 'ciudad_residencia'] },
  { code: 'pais_nacimiento', label: 'Pais nacimiento', required: false, type: 'DATOS_PERSONALES', aliases: ['pais_nacimiento', 'pais'] }
];

const BANKING_FIELDS: MasterImportFieldDefinition[] = [
  { code: 'tipo_documento', label: 'Tipo documento', required: true, type: 'INFORMACION_BANCARIA', aliases: ['tipo_documento', 'tipo_identificacion', 'tipo id'] },
  { code: 'numero_documento', label: 'Numero documento', required: true, type: 'INFORMACION_BANCARIA', aliases: ['numero_documento', 'cedula', 'documento', 'numero_identificacion'] },
  { code: 'nombre', label: 'Nombre', required: false, type: 'INFORMACION_BANCARIA', aliases: ['nombre', 'nombre_completo'] },
  { code: 'entidad_bancaria', label: 'Banco', required: true, type: 'INFORMACION_BANCARIA', aliases: ['banco', 'entidad_bancaria', 'entidad financiera'] },
  { code: 'tipo_cuenta', label: 'Tipo cuenta', required: true, type: 'INFORMACION_BANCARIA', aliases: ['tipo_cuenta', 'tipo cuenta'] },
  { code: 'numero_cuenta', label: 'Numero cuenta', required: true, type: 'INFORMACION_BANCARIA', aliases: ['numero_cuenta', 'numero cuenta', 'cuenta'] },
  { code: 'titular', label: 'Titular', required: false, type: 'INFORMACION_BANCARIA', aliases: ['titular'] },
  { code: 'nombre_titular', label: 'Nombre titular', required: false, type: 'INFORMACION_BANCARIA', aliases: ['nombre_titular', 'nombre titular'] },
  { code: 'documento_titular', label: 'Documento titular', required: false, type: 'INFORMACION_BANCARIA', aliases: ['documento_titular', 'documento titular'] },
  { code: 'observacion', label: 'Observacion', required: false, type: 'INFORMACION_BANCARIA', aliases: ['observacion', 'observaciones', 'nota'] }
];

const SST_PROFILE_FIELDS: MasterImportFieldDefinition[] = [
  { code: 'tipo_documento', label: 'Tipo documento', required: true, type: 'CARACTERIZACION_SST', aliases: ['tipo_documento', 'tipo_identificacion', 'tipo id'] },
  { code: 'numero_documento', label: 'Numero documento', required: true, type: 'CARACTERIZACION_SST', aliases: ['numero_documento', 'documento', 'cedula', 'numero_identificacion'] },
  { code: 'fecha_caracterizacion', label: 'Fecha caracterizacion', required: false, type: 'CARACTERIZACION_SST', aliases: ['fecha_caracterizacion', 'fecha caracterizacion', 'fecha formulario'] },
  { code: 'origen', label: 'Origen', required: false, type: 'CARACTERIZACION_SST', aliases: ['origen', 'fuente', 'tipo_formulario'] },
  ...SST_PERFIL_FIELD_DEFINITIONS.map((field) => ({
    code: field.code,
    label: field.label,
    required: false,
    type: 'CARACTERIZACION_SST' as const,
    aliases: [field.code, field.label]
  }))
];

const FIELD_LABELS = new Map(
  [...PERSONAL_FIELDS, ...BANKING_FIELDS, ...SST_PROFILE_FIELDS].map((field) => [field.code, field.label])
);

const PERSONAL_MUTABLE_FIELDS: Array<keyof PersonalImportSnapshot> = [
  'primer_nombre',
  'segundo_nombre',
  'primer_apellido',
  'segundo_apellido',
  'fecha_nacimiento',
  'telefono',
  'correo',
  'direccion',
  'barrio',
  'municipio_residencia',
  'pais_nacimiento'
];

const BANKING_MUTABLE_FIELDS: Array<keyof BankingImportSnapshot> = [
  'entidad_bancaria',
  'tipo_cuenta',
  'numero_cuenta',
  'titular',
  'nombre_titular',
  'documento_titular',
  'observacion'
];

const SST_MUTABLE_FIELDS: Array<keyof SstPerfilImportSnapshot> = [
  'fecha_caracterizacion',
  'origen',
  ...SST_PERFIL_FIELD_DEFINITIONS.map((field) => field.code)
];

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeImportText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

export const normalizeImportDocumentNumber = (value: unknown): string | null => {
  const text = normalizeImportText(value);
  return text ? normalizeNumeroDocumento(text) : null;
};

export const normalizeComparableText = (value: unknown): string =>
  normalizeImportText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() ?? '';

export const maskBankAccountNumber = (value: string | null | undefined): string | null => {
  const normalized = normalizeImportText(value)?.replace(/\s+/g, '') ?? null;
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return normalized;
  }

  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
};

export const getMasterImportFieldCatalog = (
  type: MasterImportType
): MasterImportFieldDefinition[] =>
  type === 'DATOS_PERSONALES'
    ? PERSONAL_FIELDS
    : type === 'INFORMACION_BANCARIA'
      ? BANKING_FIELDS
      : SST_PROFILE_FIELDS;

export const getMasterImportRequiredFields = (type: MasterImportType): string[] =>
  getMasterImportFieldCatalog(type)
    .filter((field) => field.required)
    .map((field) => field.code);

export const buildMasterImportSuggestions = (
  headers: string[],
  type: MasterImportType
): MasterImportColumnSuggestion[] => {
  const catalog = getMasterImportFieldCatalog(type);

  return headers.map((header) => {
    const normalizedHeader = normalizeHeader(header);
    const exact = catalog.find((field) =>
      field.aliases.some((alias) => normalizeHeader(alias) === normalizedHeader)
    );

    if (exact) {
      return {
        header,
        suggested_field: exact.code,
        confidence: 'HIGH'
      };
    }

    const partial = catalog.find((field) =>
      field.aliases.some((alias) => normalizedHeader.includes(normalizeHeader(alias)) || normalizeHeader(alias).includes(normalizedHeader))
    );

    return {
      header,
      suggested_field: partial?.code ?? null,
      confidence: partial ? 'MEDIUM' : 'LOW'
    };
  });
};

export const analyzeMasterImportHeaders = (
  headers: string[],
  totalRows: number,
  type: MasterImportType
): MasterImportAnalyzeResult => ({
  detected_headers: headers,
  sample_rows: Math.min(totalRows, 5),
  total_rows: totalRows,
  suggestions: buildMasterImportSuggestions(headers, type),
  required_fields: getMasterImportRequiredFields(type)
});

export const validateColumnMappings = (
  type: MasterImportType,
  headers: string[],
  mappings: Record<string, string | null>
): ImportValidationIssue[] => {
  const issues: ImportValidationIssue[] = [];
  const catalog = getMasterImportFieldCatalog(type);
  const headerSet = new Set(headers);
  const assignedTargets = new Map<string, string>();

  for (const [header, target] of Object.entries(mappings)) {
    if (!headerSet.has(header)) {
      issues.push({
        field: header,
        code: 'COLUMN_NOT_FOUND',
        message: `La columna ${header} ya no existe en el archivo analizado.`,
        severity: 'ERROR'
      });
      continue;
    }

    if (!target) {
      continue;
    }

    const field = catalog.find((item) => item.code === target);
    if (!field) {
      issues.push({
        field: header,
        code: 'INVALID_TARGET_FIELD',
        message: `El campo destino ${target} no es valido para este tipo de importacion.`,
        severity: 'ERROR'
      });
      continue;
    }

    const duplicatedBy = assignedTargets.get(target);
    if (duplicatedBy) {
      issues.push({
        field: header,
        code: 'DUPLICATED_TARGET_FIELD',
        message: `Las columnas ${duplicatedBy} y ${header} apuntan al mismo campo ${target}.`,
        severity: 'ERROR'
      });
      continue;
    }

    assignedTargets.set(target, header);
  }

  for (const requiredField of getMasterImportRequiredFields(type)) {
    if (!assignedTargets.has(requiredField)) {
      issues.push({
        field: requiredField,
        code: 'REQUIRED_FIELD_MAPPING_MISSING',
        message: `El campo obligatorio ${requiredField} debe quedar mapeado antes del dry-run.`,
        severity: 'ERROR'
      });
    }
  }

  return issues;
};

export const mapRowWithColumnMappings = (
  row: Record<string, unknown>,
  mappings: Record<string, string | null>
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};

  for (const [header, target] of Object.entries(mappings)) {
    if (!target) {
      continue;
    }

    next[target] = row[header];
  }

  return next;
};

const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const text = normalizeImportText(value);
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
};

export const normalizePersonalMappedRow = (
  mappedRow: Record<string, unknown>
): PersonalImportSnapshot => ({
  persona_id: null,
  tipo_documento: normalizeImportText(mappedRow.tipo_documento)?.toUpperCase() ?? null,
  numero_documento: normalizeImportDocumentNumber(mappedRow.numero_documento),
  primer_nombre: normalizeImportText(mappedRow.primer_nombre)?.toUpperCase() ?? null,
  segundo_nombre: normalizeImportText(mappedRow.segundo_nombre)?.toUpperCase() ?? null,
  primer_apellido: normalizeImportText(mappedRow.primer_apellido)?.toUpperCase() ?? null,
  segundo_apellido: normalizeImportText(mappedRow.segundo_apellido)?.toUpperCase() ?? null,
  fecha_nacimiento: toIsoDate(mappedRow.fecha_nacimiento),
  telefono: normalizeImportText(mappedRow.telefono),
  correo: normalizeImportText(mappedRow.correo)?.toLowerCase() ?? null,
  direccion: normalizeImportText(mappedRow.direccion)?.toUpperCase() ?? null,
  barrio: normalizeImportText(mappedRow.barrio)?.toUpperCase() ?? null,
  municipio_residencia: normalizeImportText(mappedRow.municipio_residencia)?.toUpperCase() ?? null,
  pais_nacimiento: normalizeImportText(mappedRow.pais_nacimiento)?.toUpperCase() ?? null
});

export const normalizeBankingMappedRow = (
  mappedRow: Record<string, unknown>
): BankingImportSnapshot => ({
  persona_id: null,
  tipo_documento: normalizeImportText(mappedRow.tipo_documento)?.toUpperCase() ?? null,
  numero_documento: normalizeImportDocumentNumber(mappedRow.numero_documento),
  entidad_bancaria: normalizeImportText(mappedRow.entidad_bancaria)?.toUpperCase() ?? null,
  tipo_cuenta: normalizeImportText(mappedRow.tipo_cuenta)?.toUpperCase() ?? null,
  numero_cuenta: normalizeImportText(mappedRow.numero_cuenta)?.replace(/\s+/g, '') ?? null,
  titular: normalizeImportText(mappedRow.titular)?.toUpperCase() ?? 'PERSONA',
  nombre_titular: normalizeImportText(mappedRow.nombre_titular)?.toUpperCase() ?? null,
  documento_titular: normalizeImportText(mappedRow.documento_titular)?.replace(/\s+/g, '') ?? null,
  observacion: normalizeImportText(mappedRow.observacion),
  cuenta_bancaria_id: null
});

export const normalizeSstPerfilMappedRow = (
  mappedRow: Record<string, unknown>
): SstPerfilImportSnapshot => ({
  persona_id: null,
  tipo_documento: normalizeImportText(mappedRow.tipo_documento)?.toUpperCase() ?? null,
  numero_documento: normalizeImportDocumentNumber(mappedRow.numero_documento),
  fecha_caracterizacion: toIsoDate(mappedRow.fecha_caracterizacion),
  origen: normalizeImportText(mappedRow.origen)?.toUpperCase() as SstPerfilOrigen | null,
  nacionalidad: normalizeSstPerfilTextValue(mappedRow.nacionalidad),
  estrato_socioeconomico: normalizeSstPerfilTextValue(mappedRow.estrato_socioeconomico),
  tipo_vivienda: normalizeSstPerfilTextValue(mappedRow.tipo_vivienda),
  grupo_etnico: normalizeSstPerfilTextValue(mappedRow.grupo_etnico),
  nivel_escolaridad: normalizeSstPerfilTextValue(mappedRow.nivel_escolaridad),
  profesion_ocupacion: normalizeSstPerfilTextValue(mappedRow.profesion_ocupacion),
  personas_dependen_economicamente: normalizeSstPerfilIntegerValue(mappedRow.personas_dependen_economicamente),
  cabeza_familia: normalizeSstPerfilBooleanValue(mappedRow.cabeza_familia),
  total_hijos: normalizeSstPerfilIntegerValue(mappedRow.total_hijos),
  hijos_viven_con_usted: normalizeSstPerfilIntegerValue(mappedRow.hijos_viven_con_usted),
  hijos_menores_edad: normalizeSstPerfilIntegerValue(mappedRow.hijos_menores_edad),
  hijos_mayores_edad: normalizeSstPerfilIntegerValue(mappedRow.hijos_mayores_edad),
  tipo_sangre_rh: normalizeSstPerfilTextValue(mappedRow.tipo_sangre_rh),
  tiene_discapacidad: normalizeSstPerfilBooleanValue(mappedRow.tiene_discapacidad),
  tipo_discapacidad: normalizeSstPerfilTextValue(mappedRow.tipo_discapacidad),
  redes_apoyo_social: normalizeSstPerfilTextValue(mappedRow.redes_apoyo_social),
  presenta_alergias: normalizeSstPerfilTextValue(mappedRow.presenta_alergias),
  medicamentos_permanentes: normalizeSstPerfilTextValue(mappedRow.medicamentos_permanentes),
  enfermedad: normalizeSstPerfilTextValue(mappedRow.enfermedad),
  autorizacion_tratamiento_datos: normalizeSstPerfilBooleanValue(mappedRow.autorizacion_tratamiento_datos),
  observaciones: normalizeSstPerfilTextValue(mappedRow.observaciones)
});

const hasMeaningfulValue = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value) !== '';

const pushDiff = (
  diffs: MasterImportDiff[],
  field: string,
  currentValue: unknown,
  nextValue: unknown,
  maskSensitive = false
): void => {
  const leftValue = currentValue === null || currentValue === undefined ? null : String(currentValue);
  const rightValue = nextValue === null || nextValue === undefined ? null : String(nextValue);
  const left = maskSensitive ? maskBankAccountNumber(leftValue) : leftValue;
  const right = maskSensitive ? maskBankAccountNumber(rightValue) : rightValue;

  diffs.push({
    field,
    label: FIELD_LABELS.get(field) ?? field,
    current_value: left,
    next_value: right
  });
};

const sameValue = (left: unknown, right: unknown): boolean =>
  normalizeComparableText(left) === normalizeComparableText(right);

export const buildCanonicalIdentityKey = (
  tipoDocumento: string | null | undefined,
  numeroDocumento: string | null | undefined
): string | null => {
  const normalizedType = normalizeComparableText(tipoDocumento);
  const normalizedDocument = normalizeImportDocumentNumber(numeroDocumento);

  if (!normalizedType || !normalizedDocument) {
    return null;
  }

  return `${normalizedType}|${normalizedDocument}`;
};

export const classifyPersonalImportRow = (
  normalized: PersonalImportSnapshot,
  current: PersonalImportSnapshot | null,
  duplicateInFile: boolean
): MasterImportClassificationResult<PersonalImportSnapshot> => {
  const errors: ImportValidationIssue[] = [];
  const warnings: ImportValidationIssue[] = [];
  const diffs: MasterImportDiff[] = [];

  if (!normalized.tipo_documento) {
    errors.push({ field: 'tipo_documento', code: 'MISSING_DOCUMENT_TYPE', message: 'El tipo de documento es obligatorio.', severity: 'ERROR' });
  }

  if (!normalized.numero_documento) {
    errors.push({ field: 'numero_documento', code: 'MISSING_DOCUMENT_NUMBER', message: 'El numero de documento es obligatorio.', severity: 'ERROR' });
  }

  if (duplicateInFile) {
    warnings.push({
      field: 'numero_documento',
      code: 'POSSIBLE_DUPLICATE_IN_FILE',
      message: 'La identidad aparece mas de una vez en el mismo archivo.',
      severity: 'WARNING'
    });
  }

  if (!current) {
    if (!normalized.primer_nombre || !normalized.primer_apellido) {
      errors.push({
        field: 'primer_nombre',
        code: 'MISSING_REQUIRED_FIELDS_FOR_CREATE',
        message: 'Para crear una persona nueva se requieren primer nombre y primer apellido.',
        severity: 'ERROR'
      });
    }

    if (errors.length > 0) {
      return {
        classification: 'ERROR',
        name: [normalized.primer_nombre, normalized.segundo_nombre, normalized.primer_apellido, normalized.segundo_apellido].filter(Boolean).join(' ') || null,
        normalized,
        diffs,
        errors,
        warnings,
        requires_apply: false
      };
    }

    for (const field of PERSONAL_MUTABLE_FIELDS) {
      const value = normalized[field];
      if (hasMeaningfulValue(value)) {
        pushDiff(diffs, field, null, value);
      }
    }

    return {
      classification: duplicateInFile ? 'POSIBLE_DUPLICADO' : 'NUEVA',
      name: [normalized.primer_nombre, normalized.segundo_nombre, normalized.primer_apellido, normalized.segundo_apellido].filter(Boolean).join(' ') || null,
      normalized,
      diffs,
      errors,
      warnings,
      requires_apply: !duplicateInFile
    };
  }

  const currentName = [current.primer_nombre, current.segundo_nombre, current.primer_apellido, current.segundo_apellido].filter(Boolean).join(' ') || null;

  for (const field of PERSONAL_MUTABLE_FIELDS) {
    const nextValue = normalized[field];
    if (!hasMeaningfulValue(nextValue)) {
      continue;
    }

    const currentValue = current[field];
    if (!sameValue(currentValue, nextValue)) {
      pushDiff(diffs, field, currentValue, nextValue);
    }
  }

  if (errors.length > 0) {
    return {
      classification: 'ERROR',
      name: currentName,
      normalized: { ...normalized, persona_id: current.persona_id },
      diffs,
      errors,
      warnings,
      requires_apply: false
    };
  }

  if (diffs.length === 0) {
    return {
      classification: duplicateInFile ? 'POSIBLE_DUPLICADO' : 'SIN_CAMBIOS',
      name: currentName,
      normalized: { ...normalized, persona_id: current.persona_id },
      diffs,
      errors,
      warnings,
      requires_apply: false
    };
  }

  return {
    classification: duplicateInFile ? 'POSIBLE_DUPLICADO' : 'ACTUALIZACION',
    name: currentName,
    normalized: { ...normalized, persona_id: current.persona_id },
    diffs,
    errors,
    warnings,
    requires_apply: !duplicateInFile
  };
};

export const classifyBankingImportRow = (
  normalized: BankingImportSnapshot,
  current: BankingImportSnapshot | null,
  duplicateInFile: boolean,
  personExists: boolean
): MasterImportClassificationResult<BankingImportSnapshot> => {
  const errors: ImportValidationIssue[] = [];
  const warnings: ImportValidationIssue[] = [];
  const diffs: MasterImportDiff[] = [];

  if (!normalized.tipo_documento) {
    errors.push({ field: 'tipo_documento', code: 'MISSING_DOCUMENT_TYPE', message: 'El tipo de documento es obligatorio.', severity: 'ERROR' });
  }

  if (!normalized.numero_documento) {
    errors.push({ field: 'numero_documento', code: 'MISSING_DOCUMENT_NUMBER', message: 'El numero de documento es obligatorio.', severity: 'ERROR' });
  }

  if (!personExists) {
    errors.push({
      field: 'numero_documento',
      code: 'PERSON_NOT_FOUND',
      message: 'No existe una persona vigente en Empiria con esa identidad.',
      severity: 'ERROR'
    });
  }

  for (const requiredField of ['entidad_bancaria', 'tipo_cuenta', 'numero_cuenta'] as const) {
    if (!hasMeaningfulValue(normalized[requiredField])) {
      errors.push({
        field: requiredField,
        code: 'MISSING_REQUIRED_BANK_FIELD',
        message: `El campo ${requiredField} es obligatorio para importacion bancaria.`,
        severity: 'ERROR'
      });
    }
  }

  if (duplicateInFile) {
    warnings.push({
      field: 'numero_documento',
      code: 'POSSIBLE_DUPLICATE_IN_FILE',
      message: 'La identidad aparece mas de una vez en el mismo archivo.',
      severity: 'WARNING'
    });
  }

  if (errors.length > 0) {
    return {
      classification: 'ERROR',
      name: null,
      normalized,
      diffs,
      errors,
      warnings,
      requires_apply: false
    };
  }

  if (!current) {
    for (const field of BANKING_MUTABLE_FIELDS) {
      const value = normalized[field];
      if (hasMeaningfulValue(value)) {
        pushDiff(diffs, field, null, value, field === 'numero_cuenta');
      }
    }

    return {
      classification: duplicateInFile ? 'POSIBLE_DUPLICADO' : 'CUENTA_NUEVA',
      name: null,
      normalized,
      diffs,
      errors,
      warnings,
      requires_apply: !duplicateInFile
    };
  }

  for (const field of BANKING_MUTABLE_FIELDS) {
    const nextValue = normalized[field];
    if (!hasMeaningfulValue(nextValue)) {
      continue;
    }

    const currentValue = current[field];
    if (!sameValue(currentValue, nextValue)) {
      pushDiff(diffs, field, currentValue, nextValue, field === 'numero_cuenta');
    }
  }

  return {
    classification:
      duplicateInFile ? 'POSIBLE_DUPLICADO' : diffs.length === 0 ? 'SIN_CAMBIOS' : 'CAMBIO_CUENTA',
    name: null,
    normalized: { ...normalized, persona_id: current.persona_id, cuenta_bancaria_id: current.cuenta_bancaria_id },
    diffs,
    errors,
    warnings,
    requires_apply: !duplicateInFile && diffs.length > 0
  };
};

export const classifySstPerfilImportRow = (
  normalized: SstPerfilImportSnapshot,
  current: SstPerfilImportSnapshot | null,
  duplicateInFile: boolean,
  personExists: boolean
): MasterImportClassificationResult<SstPerfilImportSnapshot> => {
  const errors: ImportValidationIssue[] = [];
  const warnings: ImportValidationIssue[] = [];
  const diffs: MasterImportDiff[] = [];
  let hasConflict = false;

  if (!normalized.tipo_documento) {
    errors.push({
      field: 'tipo_documento',
      code: 'MISSING_DOCUMENT_TYPE',
      message: 'El tipo de documento es obligatorio.',
      severity: 'ERROR'
    });
  }

  if (!normalized.numero_documento) {
    errors.push({
      field: 'numero_documento',
      code: 'MISSING_DOCUMENT_NUMBER',
      message: 'El numero de documento es obligatorio.',
      severity: 'ERROR'
    });
  }

  if (!personExists) {
    errors.push({
      field: 'numero_documento',
      code: 'PERSON_NOT_FOUND',
      message: 'No existe una persona vigente en Empiria con esa identidad.',
      severity: 'ERROR'
    });
  }

  if (duplicateInFile) {
    warnings.push({
      field: 'numero_documento',
      code: 'POSSIBLE_DUPLICATE_IN_FILE',
      message: 'La identidad aparece mas de una vez en el mismo archivo.',
      severity: 'WARNING'
    });
  }

  if (errors.length > 0) {
    return {
      classification: 'ERROR',
      name: null,
      normalized,
      diffs,
      errors,
      warnings,
      requires_apply: false
    };
  }

  for (const field of SST_MUTABLE_FIELDS) {
    const nextValue = normalized[field];
    if (!hasMeaningfulValue(nextValue)) {
      continue;
    }

    const currentValue = current?.[field] ?? null;
    if (field === 'origen' || field === 'fecha_caracterizacion') {
      if (!sameValue(currentValue, nextValue)) {
        if (hasMeaningfulValue(currentValue)) {
          hasConflict = true;
          warnings.push({
            field,
            code: 'SST_CONFLICTING_VALUE',
            message: `El campo ${FIELD_LABELS.get(field) ?? field} ya tiene un valor distinto en Empiria.`,
            severity: 'WARNING'
          });
        }
        pushDiff(diffs, field, currentValue, nextValue);
      }
      continue;
    }

    const comparableCurrent = normalizeComparableSstValue(field as keyof SstPerfilEditableValues, currentValue);
    const comparableNext = normalizeComparableSstValue(field as keyof SstPerfilEditableValues, nextValue);
    if (!comparableNext) {
      continue;
    }
    if (!comparableCurrent) {
      pushDiff(diffs, field, currentValue, nextValue);
      continue;
    }
    if (comparableCurrent !== comparableNext) {
      hasConflict = true;
      warnings.push({
        field,
        code: 'SST_CONFLICTING_VALUE',
        message: `El campo ${SST_PERFIL_FIELD_LABELS.get(field as keyof SstPerfilEditableValues) ?? field} ya tiene un valor distinto en Empiria.`,
        severity: 'WARNING'
      });
      pushDiff(diffs, field, currentValue, nextValue);
    }
  }

  if (diffs.length === 0) {
    return {
      classification: duplicateInFile ? 'POSIBLE_DUPLICADO' : 'SIN_CAMBIOS',
      name: null,
      normalized: { ...normalized, persona_id: current?.persona_id ?? normalized.persona_id },
      diffs,
      errors,
      warnings,
      requires_apply: false
    };
  }

  if (hasConflict) {
    return {
      classification: 'CONFLICTO',
      name: null,
      normalized: { ...normalized, persona_id: current?.persona_id ?? normalized.persona_id },
      diffs,
      errors,
      warnings,
      requires_apply: false
    };
  }

  return {
    classification: duplicateInFile ? 'POSIBLE_DUPLICADO' : current ? 'ACTUALIZACION' : 'NUEVA',
    name: null,
    normalized: { ...normalized, persona_id: current?.persona_id ?? normalized.persona_id },
    diffs,
    errors,
    warnings,
    requires_apply: !duplicateInFile
  };
};

export const matchesMasterImportFilter = (
  classification: MasterImportClassification,
  filter: MasterImportFilter
): boolean => {
  if (filter === 'TODOS') {
    return true;
  }

  if (filter === 'NUEVAS') {
    return classification === 'NUEVA' || classification === 'CUENTA_NUEVA';
  }

  if (filter === 'ACTUALIZACIONES') {
    return classification === 'ACTUALIZACION' || classification === 'CAMBIO_CUENTA';
  }

  if (filter === 'SIN_CAMBIOS') {
    return classification === 'SIN_CAMBIOS';
  }

  if (filter === 'ERRORES') {
    return classification === 'ERROR' || classification === 'CONFLICTO';
  }

  if (filter === 'DUPLICADOS') {
    return classification === 'POSIBLE_DUPLICADO';
  }

  return (
    classification === 'NUEVA' ||
    classification === 'ACTUALIZACION' ||
    classification === 'CUENTA_NUEVA' ||
    classification === 'CAMBIO_CUENTA'
  );
};

export const buildTemplateWorkbook = (type: MasterImportType): Buffer => {
  const workbook = XLSX.utils.book_new();
  const rows =
    type === 'DATOS_PERSONALES'
      ? [[
          'TIPO_DOCUMENTO',
          'NUMERO_DOCUMENTO',
          'PRIMER_NOMBRE',
          'SEGUNDO_NOMBRE',
          'PRIMER_APELLIDO',
          'SEGUNDO_APELLIDO',
          'FECHA_NACIMIENTO',
          'CELULAR',
          'CORREO',
          'DIRECCION',
          'BARRIO',
          'MUNICIPIO_RESIDENCIA',
          'PAIS_NACIMIENTO'
        ], [
          'CC',
          '1020304050',
          'ANA',
          'MARIA',
          'PEREZ',
          'GOMEZ',
          '1998-05-16',
          '3001234567',
          'ana.perez@example.com',
          'CALLE 1 # 2-3',
          'CENTRO',
          'BOGOTA',
          'COLOMBIA'
        ]]
      : type === 'INFORMACION_BANCARIA'
      ? [[
          'TIPO_DOCUMENTO',
          'NUMERO_DOCUMENTO',
          'NOMBRE',
          'BANCO',
          'TIPO_CUENTA',
          'NUMERO_CUENTA',
          'TITULAR',
          'NOMBRE_TITULAR',
          'DOCUMENTO_TITULAR',
          'OBSERVACION'
        ], [
          'CC',
          '1121836989',
          'SANDRA MILENA DIAZ VELASQUEZ',
          'BANCOLOMBIA',
          'AHORROS',
          '1234567890',
          'PERSONA',
          'SANDRA MILENA DIAZ VELASQUEZ',
          '1121836989',
          'Cuenta principal vigente'
        ]]
      : [[
          'TIPO_DOCUMENTO',
          'NUMERO_DOCUMENTO',
          'FECHA_CARACTERIZACION',
          'ORIGEN',
          'NACIONALIDAD',
          'NIVEL_ESCOLARIDAD',
          'ESTRATO_SOCIOECONOMICO',
          'TIPO_VIVIENDA',
          'PROFESION_OCUPACION',
          'PERSONAS_DEPENDEN_ECONOMICAMENTE',
          'CABEZA_FAMILIA',
          'TOTAL_HIJOS',
          'TIENE_DISCAPACIDAD',
          'REDES_APOYO_SOCIAL',
          'AUTORIZACION_TRATAMIENTO_DATOS',
          'OBSERVACIONES'
        ], [
          'CC',
          '1020304050',
          '2026-08-23',
          'FORMULARIO_DIGITAL',
          'COLOMBIANA',
          'BACHILLER',
          '2',
          'CASA',
          'MANIPULADORA DE ALIMENTOS',
          '2',
          'SI',
          '1',
          'NO',
          'FAMILIA',
          'SI',
          'Carga inicial parcial para caracterizacion SST'
        ]];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(
    workbook,
    sheet,
    type === 'DATOS_PERSONALES'
      ? 'datos_personales'
      : type === 'INFORMACION_BANCARIA'
        ? 'informacion_bancaria'
        : 'caracterizacion_sst'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const buildReportCsv = (
  rows: Array<{
    fila: number;
    documento: string | null;
    nombre: string | null;
    resultado: MasterImportClassification;
    diffs: MasterImportDiff[];
    errors: ImportValidationIssue[];
  }>
): string => {
  const lines = [[
    'FILA',
    'DOCUMENTO',
    'NOMBRE',
    'RESULTADO',
    'CAMPO',
    'VALOR_ACTUAL',
    'VALOR_NUEVO',
    'ERROR',
    'ACCION_REQUERIDA'
  ].map(csvEscape).join(',')];

  for (const row of rows) {
    if (row.diffs.length === 0 && row.errors.length === 0) {
      lines.push([
        row.fila,
        row.documento ?? '',
        row.nombre ?? '',
        row.resultado,
        '',
        '',
        '',
        '',
        row.resultado === 'SIN_CAMBIOS' ? 'NINGUNA' : row.resultado === 'POSIBLE_DUPLICADO' ? 'REVISAR DUPLICADO' : ''
      ].map((value) => csvEscape(String(value))).join(','));
      continue;
    }

    if (row.diffs.length > 0) {
      for (const diff of row.diffs) {
        lines.push([
          row.fila,
          row.documento ?? '',
          row.nombre ?? '',
          row.resultado,
          diff.label,
          diff.current_value ?? '',
          diff.next_value ?? '',
          '',
          row.resultado === 'POSIBLE_DUPLICADO' ? 'REVISAR DUPLICADO' : 'APLICAR'
        ].map((value) => csvEscape(String(value))).join(','));
      }
    }

    if (row.errors.length > 0) {
      for (const error of row.errors) {
        lines.push([
          row.fila,
          row.documento ?? '',
          row.nombre ?? '',
          row.resultado,
          FIELD_LABELS.get(error.field) ?? error.field,
          '',
          '',
          error.message,
          'CORREGIR ARCHIVO'
        ].map((value) => csvEscape(String(value))).join(','));
      }
    }
  }

  return lines.join('\n');
};
