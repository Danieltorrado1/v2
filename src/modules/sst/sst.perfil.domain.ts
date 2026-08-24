export type SstPerfilOrigen =
  | 'FORMULARIO_DIGITAL'
  | 'FORMULARIO_FISICO'
  | 'IMPORTACION'
  | 'EDICION_MANUAL'
  | 'PORTAL_COLABORADOR';

export type SstPerfilOrigenResuelto = SstPerfilOrigen | 'MIXTO' | 'SIN_REGISTRO';

export type SstPerfilCompletitudEstado =
  | 'COMPLETA'
  | 'INCOMPLETA'
  | 'NO_REALIZADA'
  | 'REQUIERE_REVISION';

export interface SstPerfilEditableValues {
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

export interface SstPerfilFieldDefinition {
  code: keyof SstPerfilEditableValues;
  label: string;
  sensitive?: boolean;
  exportable?: boolean;
  required_for_completeness?: boolean;
}

export const SST_PERFIL_FIELD_DEFINITIONS: SstPerfilFieldDefinition[] = [
  { code: 'nacionalidad', label: 'Nacionalidad', exportable: true },
  {
    code: 'estrato_socioeconomico',
    label: 'Estrato socioeconomico',
    exportable: true,
    required_for_completeness: true
  },
  {
    code: 'tipo_vivienda',
    label: 'Tipo de vivienda',
    exportable: true,
    required_for_completeness: true
  },
  { code: 'grupo_etnico', label: 'Grupo etnico', exportable: true },
  {
    code: 'nivel_escolaridad',
    label: 'Nivel educativo',
    exportable: true,
    required_for_completeness: true
  },
  {
    code: 'profesion_ocupacion',
    label: 'Profesion u ocupacion',
    exportable: true,
    required_for_completeness: true
  },
  {
    code: 'personas_dependen_economicamente',
    label: 'Personas a cargo',
    exportable: true,
    required_for_completeness: true
  },
  {
    code: 'cabeza_familia',
    label: 'Cabeza de familia',
    exportable: true,
    required_for_completeness: true
  },
  {
    code: 'total_hijos',
    label: 'Total hijos',
    exportable: true,
    required_for_completeness: true
  },
  { code: 'hijos_viven_con_usted', label: 'Hijos viven con usted', exportable: true },
  { code: 'hijos_menores_edad', label: 'Hijos menores de edad', exportable: true },
  { code: 'hijos_mayores_edad', label: 'Hijos mayores de edad', exportable: true },
  {
    code: 'tipo_sangre_rh',
    label: 'Tipo sangre RH',
    sensitive: true,
    exportable: false
  },
  {
    code: 'tiene_discapacidad',
    label: 'Tiene discapacidad',
    sensitive: true,
    exportable: false,
    required_for_completeness: true
  },
  {
    code: 'tipo_discapacidad',
    label: 'Tipo de discapacidad',
    sensitive: true,
    exportable: false
  },
  { code: 'redes_apoyo_social', label: 'Redes de apoyo social', exportable: true },
  {
    code: 'presenta_alergias',
    label: 'Presenta alergias',
    sensitive: true,
    exportable: false
  },
  {
    code: 'medicamentos_permanentes',
    label: 'Medicamentos permanentes',
    sensitive: true,
    exportable: false
  },
  { code: 'enfermedad', label: 'Enfermedad relevante', sensitive: true, exportable: false },
  {
    code: 'autorizacion_tratamiento_datos',
    label: 'Autorizacion tratamiento datos',
    exportable: true,
    required_for_completeness: true
  },
  { code: 'observaciones', label: 'Observaciones', exportable: false }
];

export const SST_PERFIL_FIELD_LABELS = new Map(
  SST_PERFIL_FIELD_DEFINITIONS.map((field) => [field.code, field.label])
);

export const SST_PERFIL_SENSITIVE_FIELDS = new Set(
  SST_PERFIL_FIELD_DEFINITIONS.filter((field) => field.sensitive).map((field) => field.code)
);

export const SST_PERFIL_EXPORTABLE_FIELDS = SST_PERFIL_FIELD_DEFINITIONS.filter(
  (field) => field.exportable
).map((field) => field.code);

export const SST_PERFIL_COMPLETENESS_FIELDS = [
  'fecha_nacimiento',
  'sexo_id',
  'estado_civil_id',
  ...SST_PERFIL_FIELD_DEFINITIONS.filter((field) => field.required_for_completeness).map(
    (field) => field.code
  )
] as const;

const SST_PERFIL_CONDITIONAL_COMPLETENESS_FIELDS = [
  'hijos_viven_con_usted',
  'hijos_menores_edad',
  'hijos_mayores_edad',
  'tipo_discapacidad'
] as const;

export type SstPerfilCompletenessFieldCode =
  | (typeof SST_PERFIL_COMPLETENESS_FIELDS)[number]
  | (typeof SST_PERFIL_CONDITIONAL_COMPLETENESS_FIELDS)[number];

export interface SstPerfilCompletenessInput {
  fecha_nacimiento?: string | null;
  sexo_id?: number | null;
  estado_civil_id?: number | null;
  requiere_revision?: boolean | null;
  values: Partial<SstPerfilEditableValues> | null | undefined;
}

export interface SstPerfilCompletenessResult {
  porcentaje: number;
  estado: SstPerfilCompletitudEstado;
  campos_requeridos: SstPerfilCompletenessFieldCode[];
  campos_completos: SstPerfilCompletenessFieldCode[];
  campos_faltantes: SstPerfilCompletenessFieldCode[];
}

export const EMPTY_SST_PERFIL_VALUES: SstPerfilEditableValues = {
  nacionalidad: null,
  estrato_socioeconomico: null,
  tipo_vivienda: null,
  grupo_etnico: null,
  nivel_escolaridad: null,
  profesion_ocupacion: null,
  personas_dependen_economicamente: null,
  cabeza_familia: null,
  total_hijos: null,
  hijos_viven_con_usted: null,
  hijos_menores_edad: null,
  hijos_mayores_edad: null,
  tipo_sangre_rh: null,
  tiene_discapacidad: null,
  tipo_discapacidad: null,
  redes_apoyo_social: null,
  presenta_alergias: null,
  medicamentos_permanentes: null,
  enfermedad: null,
  autorizacion_tratamiento_datos: null,
  observaciones: null
};

const normalizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (text.length === 0) {
    return null;
  }

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const normalizeSstPerfilTextValue = (value: unknown): string | null => normalizeText(value);

export const normalizeSstPerfilIntegerValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value).trim().replace(/[^\d-]/g, ''));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
};

export const normalizeSstPerfilBooleanValue = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (['SI', 'S', 'TRUE', '1', 'YES'].includes(normalized)) {
    return true;
  }
  if (['NO', 'N', 'FALSE', '0'].includes(normalized)) {
    return false;
  }

  return null;
};

export const hasSstPerfilValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return true;
};

export const normalizeComparableSstValue = (
  field: keyof SstPerfilEditableValues,
  value: unknown
): string => {
  if (
    field === 'personas_dependen_economicamente' ||
    field === 'total_hijos' ||
    field === 'hijos_viven_con_usted' ||
    field === 'hijos_menores_edad' ||
    field === 'hijos_mayores_edad'
  ) {
    const parsed = normalizeSstPerfilIntegerValue(value);
    return parsed === null ? '' : String(parsed);
  }

  if (
    field === 'cabeza_familia' ||
    field === 'tiene_discapacidad' ||
    field === 'autorizacion_tratamiento_datos'
  ) {
    const parsed = normalizeSstPerfilBooleanValue(value);
    return parsed === null ? '' : String(parsed);
  }

  return normalizeText(value) ?? '';
};

const hasAnyTrackedValue = (
  input: SstPerfilCompletenessInput
): boolean => {
  if (input.fecha_nacimiento || input.sexo_id || input.estado_civil_id) {
    return true;
  }

  return SST_PERFIL_FIELD_DEFINITIONS.some((field) =>
    hasSstPerfilValue(input.values?.[field.code] ?? null)
  );
};

export const computeSstPerfilCompleteness = (
  input: SstPerfilCompletenessInput
): SstPerfilCompletenessResult => {
  const requiredFields = [...SST_PERFIL_COMPLETENESS_FIELDS];
  const completed: SstPerfilCompletenessFieldCode[] = [];
  const missing: SstPerfilCompletenessFieldCode[] = [];

  const values = input.values ?? EMPTY_SST_PERFIL_VALUES;
  const totalHijos = normalizeSstPerfilIntegerValue(values.total_hijos);
  const tieneDiscapacidad = normalizeSstPerfilBooleanValue(values.tiene_discapacidad);

  if (totalHijos !== null && totalHijos > 0) {
    requiredFields.push('hijos_viven_con_usted', 'hijos_menores_edad', 'hijos_mayores_edad');
  }
  if (tieneDiscapacidad === true) {
    requiredFields.push('tipo_discapacidad');
  }

  for (const field of requiredFields) {
    const hasValue =
      field === 'fecha_nacimiento'
        ? hasSstPerfilValue(input.fecha_nacimiento)
        : field === 'sexo_id'
          ? input.sexo_id !== null && input.sexo_id !== undefined
          : field === 'estado_civil_id'
            ? input.estado_civil_id !== null && input.estado_civil_id !== undefined
            : hasSstPerfilValue(values[field]);

    if (hasValue) {
      completed.push(field);
    } else {
      missing.push(field);
    }
  }

  const hasTrackedData = hasAnyTrackedValue(input);
  const porcentaje =
    requiredFields.length === 0 ? 100 : Math.round((completed.length / requiredFields.length) * 100);

  let estado: SstPerfilCompletitudEstado;
  if (!hasTrackedData) {
    estado = 'NO_REALIZADA';
  } else if (input.requiere_revision) {
    estado = 'REQUIERE_REVISION';
  } else if (missing.length === 0) {
    estado = 'COMPLETA';
  } else {
    estado = 'INCOMPLETA';
  }

  return {
    porcentaje: hasTrackedData ? porcentaje : 0,
    estado,
    campos_requeridos: requiredFields,
    campos_completos: completed,
    campos_faltantes: missing
  };
};

export const sanitizeSstPerfilValuesForView = (
  values: SstPerfilEditableValues,
  canViewSensitiveFields: boolean
): SstPerfilEditableValues => {
  if (canViewSensitiveFields) {
    return { ...values };
  }

  const sanitized = { ...values };
  for (const field of SST_PERFIL_SENSITIVE_FIELDS) {
    sanitized[field] = null;
  }
  return sanitized;
};

export const calculateAgeFromBirthDate = (birthDate: string | null | undefined): number | null => {
  if (!birthDate) {
    return null;
  }

  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const dayDiff = now.getDate() - date.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

export const calculateAntiguedadFromStartDate = (
  startDate: string | null | undefined
): number | null => {
  if (!startDate) {
    return null;
  }

  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  const dayDiff = now.getDate() - date.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years -= 1;
  }

  return years >= 0 ? years : 0;
};

const mergeSstPerfilField = <K extends keyof SstPerfilEditableValues>(
  current: SstPerfilEditableValues,
  patch: Partial<SstPerfilEditableValues>,
  key: K
): SstPerfilEditableValues[K] =>
  Object.prototype.hasOwnProperty.call(patch, key)
    ? ((patch[key] ?? null) as SstPerfilEditableValues[K])
    : current[key];

export const mergeSstPerfilValues = (
  current: SstPerfilEditableValues,
  patch: Partial<SstPerfilEditableValues>
): SstPerfilEditableValues => ({
  nacionalidad: mergeSstPerfilField(current, patch, 'nacionalidad'),
  estrato_socioeconomico: mergeSstPerfilField(current, patch, 'estrato_socioeconomico'),
  tipo_vivienda: mergeSstPerfilField(current, patch, 'tipo_vivienda'),
  grupo_etnico: mergeSstPerfilField(current, patch, 'grupo_etnico'),
  nivel_escolaridad: mergeSstPerfilField(current, patch, 'nivel_escolaridad'),
  profesion_ocupacion: mergeSstPerfilField(current, patch, 'profesion_ocupacion'),
  personas_dependen_economicamente: mergeSstPerfilField(
    current,
    patch,
    'personas_dependen_economicamente'
  ),
  cabeza_familia: mergeSstPerfilField(current, patch, 'cabeza_familia'),
  total_hijos: mergeSstPerfilField(current, patch, 'total_hijos'),
  hijos_viven_con_usted: mergeSstPerfilField(current, patch, 'hijos_viven_con_usted'),
  hijos_menores_edad: mergeSstPerfilField(current, patch, 'hijos_menores_edad'),
  hijos_mayores_edad: mergeSstPerfilField(current, patch, 'hijos_mayores_edad'),
  tipo_sangre_rh: mergeSstPerfilField(current, patch, 'tipo_sangre_rh'),
  tiene_discapacidad: mergeSstPerfilField(current, patch, 'tiene_discapacidad'),
  tipo_discapacidad: mergeSstPerfilField(current, patch, 'tipo_discapacidad'),
  redes_apoyo_social: mergeSstPerfilField(current, patch, 'redes_apoyo_social'),
  presenta_alergias: mergeSstPerfilField(current, patch, 'presenta_alergias'),
  medicamentos_permanentes: mergeSstPerfilField(current, patch, 'medicamentos_permanentes'),
  enfermedad: mergeSstPerfilField(current, patch, 'enfermedad'),
  autorizacion_tratamiento_datos: mergeSstPerfilField(
    current,
    patch,
    'autorizacion_tratamiento_datos'
  ),
  observaciones: mergeSstPerfilField(current, patch, 'observaciones')
});
