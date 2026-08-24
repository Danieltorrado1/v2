import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import {
  assertTenantAccessForPersonaId,
  assertTenantAccessForVinculacionId,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  EMPTY_SST_PERFIL_VALUES,
  SST_PERFIL_FIELD_DEFINITIONS,
  computeSstPerfilCompleteness,
  calculateAgeFromBirthDate,
  hasSstPerfilValue,
  mergeSstPerfilValues,
  normalizeComparableSstValue,
  sanitizeSstPerfilValuesForView,
  type SstPerfilCompletitudEstado,
  type SstPerfilEditableValues,
  type SstPerfilOrigen,
  type SstPerfilOrigenResuelto
} from './sst.perfil.domain';
import type { PersonaSstPerfilUpdateInput } from './sst.perfil.schemas';

interface PersonaCoreRow extends QueryResultRow {
  estado_civil_id: number | string | null;
  fecha_nacimiento: string | Date | null;
  id: number | string;
  sexo_id: number | string | null;
}

interface VinculacionPersonaRow extends QueryResultRow {
  id: number | string;
  persona_id: number | string;
}

interface SstPerfilCurrentRow extends QueryResultRow {
  id: number | string;
  persona_id: number | string;
  vinculacion_id: number | string | null;
  fecha_caracterizacion: string | Date | null;
  origen: SstPerfilOrigen | null;
  motivo_ultima_actualizacion: string | null;
  created_by_user_id: number | string | null;
  updated_by_user_id: number | string | null;
  requiere_revision: boolean | null;
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
  tiene_discapacidad: boolean | null;
  tipo_discapacidad: string | null;
  redes_apoyo_social: string | null;
  presenta_alergias: string | null;
  medicamentos_permanentes: string | null;
  enfermedad: string | null;
  autorizacion_tratamiento_datos: boolean | null;
  observaciones: string | null;
  activo: boolean | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

interface SstPerfilVersionRow extends QueryResultRow {
  id: number | string;
  perfil_id: number | string;
  persona_id: number | string;
  vinculacion_id: number | string | null;
  version_numero: number | string;
  vigente_desde: string | Date;
  vigencia_hasta: string | Date | null;
  es_vigente: boolean;
  fecha_caracterizacion: string | Date | null;
  origen: SstPerfilOrigen | null;
  motivo_cambio: string | null;
  created_by_user_id: number | string | null;
  importacion_lote_id: number | string | null;
  requiere_revision: boolean | null;
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
  tiene_discapacidad: boolean | null;
  tipo_discapacidad: string | null;
  redes_apoyo_social: string | null;
  presenta_alergias: string | null;
  medicamentos_permanentes: string | null;
  enfermedad: string | null;
  autorizacion_tratamiento_datos: boolean | null;
  observaciones: string | null;
  created_at: string | Date | null;
}

interface SstPerfilRestrictedRow extends QueryResultRow {
  id: number | string;
  persona_id: number | string;
  vinculacion_id: number | string | null;
  tipo_sangre_rh: string | null;
  tiene_discapacidad: boolean | null;
  tipo_discapacidad: string | null;
  presenta_alergias: string | null;
  medicamentos_permanentes: string | null;
  enfermedad: string | null;
  origen: SstPerfilOrigen | null;
  motivo_ultima_actualizacion: string | null;
  activo: boolean | null;
  created_by_user_id: number | string | null;
  updated_by_user_id: number | string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

export interface SstPerfilSociodemograficoVersion {
  id: number;
  perfil_id: number;
  persona_id: number;
  vinculacion_id: number | null;
  version_numero: number;
  vigente_desde: string;
  vigencia_hasta: string | null;
  es_vigente: boolean;
  fecha_caracterizacion: string | null;
  origen: SstPerfilOrigen | null;
  motivo_cambio: string | null;
  importacion_lote_id: number | null;
  created_by_user_id: number | null;
  requiere_revision: boolean;
  values: SstPerfilEditableValues;
  created_at: string | null;
}

export interface SstPerfilSociodemograficoDetail {
  id: number | null;
  persona_id: number;
  vinculacion_id: number | null;
  fecha_caracterizacion: string | null;
  origen: SstPerfilOrigen | null;
  origen_resuelto: SstPerfilOrigenResuelto;
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
    estado: SstPerfilCompletitudEstado;
    campos_requeridos: string[];
    campos_completos: string[];
    campos_faltantes: string[];
  };
  values: SstPerfilEditableValues;
  history_count: number;
  sensitive_fields_hidden: boolean;
}

export interface SstPerfilMutationContext {
  actorUserId: string;
  auditMeta?: AuditRequestMeta;
  importacionLoteId?: number | null;
  origin?: SstPerfilOrigen | null;
  reason?: string | null;
}

const RESTRICTED_SST_FIELDS: Array<keyof SstPerfilEditableValues> = [
  'tipo_sangre_rh',
  'tiene_discapacidad',
  'tipo_discapacidad',
  'presenta_alergias',
  'medicamentos_permanentes',
  'enfermedad'
];

const toRequiredNumber = (value: string | number | null | undefined, code = 'INVALID_NUMERIC_VALUE'): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : value === null || value === undefined || value === ''
        ? Number.NaN
        : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, code);
  }

  return parsed;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDateValue = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

const formatTimestampValue = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
};

const mapGeneralRowValues = (
  row: Pick<
    SstPerfilCurrentRow | SstPerfilVersionRow,
    | 'nacionalidad'
    | 'estrato_socioeconomico'
    | 'tipo_vivienda'
    | 'grupo_etnico'
    | 'nivel_escolaridad'
    | 'profesion_ocupacion'
    | 'personas_dependen_economicamente'
    | 'cabeza_familia'
    | 'total_hijos'
    | 'hijos_viven_con_usted'
    | 'hijos_menores_edad'
    | 'hijos_mayores_edad'
    | 'redes_apoyo_social'
    | 'autorizacion_tratamiento_datos'
    | 'observaciones'
  >
): SstPerfilEditableValues => ({
  nacionalidad: row.nacionalidad,
  estrato_socioeconomico: row.estrato_socioeconomico,
  tipo_vivienda: row.tipo_vivienda,
  grupo_etnico: row.grupo_etnico,
  nivel_escolaridad: row.nivel_escolaridad,
  profesion_ocupacion: row.profesion_ocupacion,
  personas_dependen_economicamente: toNullableNumber(row.personas_dependen_economicamente),
  cabeza_familia: row.cabeza_familia ?? null,
  total_hijos: toNullableNumber(row.total_hijos),
  hijos_viven_con_usted: toNullableNumber(row.hijos_viven_con_usted),
  hijos_menores_edad: toNullableNumber(row.hijos_menores_edad),
  hijos_mayores_edad: toNullableNumber(row.hijos_mayores_edad),
  tipo_sangre_rh: null,
  tiene_discapacidad: null,
  tipo_discapacidad: null,
  redes_apoyo_social: row.redes_apoyo_social,
  presenta_alergias: null,
  medicamentos_permanentes: null,
  enfermedad: null,
  autorizacion_tratamiento_datos: row.autorizacion_tratamiento_datos ?? null,
  observaciones: row.observaciones
});

const mapRestrictedRowValues = (
  row: Pick<
    SstPerfilRestrictedRow,
    | 'tipo_sangre_rh'
    | 'tiene_discapacidad'
    | 'tipo_discapacidad'
    | 'presenta_alergias'
    | 'medicamentos_permanentes'
    | 'enfermedad'
  > | null
): Partial<SstPerfilEditableValues> =>
  row
    ? {
        tipo_sangre_rh: row.tipo_sangre_rh,
        tiene_discapacidad: row.tiene_discapacidad ?? null,
        tipo_discapacidad: row.tipo_discapacidad,
        presenta_alergias: row.presenta_alergias,
        medicamentos_permanentes: row.medicamentos_permanentes,
        enfermedad: row.enfermedad
      }
    : {};

const mergeCurrentSstValues = (
  currentRow: SstPerfilCurrentRow | SstPerfilVersionRow | null,
  restrictedRow?: Pick<
    SstPerfilRestrictedRow,
    | 'tipo_sangre_rh'
    | 'tiene_discapacidad'
    | 'tipo_discapacidad'
    | 'presenta_alergias'
    | 'medicamentos_permanentes'
    | 'enfermedad'
  > | null
): SstPerfilEditableValues =>
  mergeSstPerfilValues(
    currentRow ? mapGeneralRowValues(currentRow) : { ...EMPTY_SST_PERFIL_VALUES },
    mapRestrictedRowValues(restrictedRow ?? null)
  );

const pickRestrictedSstValues = (
  values: SstPerfilEditableValues
): Pick<
  SstPerfilEditableValues,
  | 'tipo_sangre_rh'
  | 'tiene_discapacidad'
  | 'tipo_discapacidad'
  | 'presenta_alergias'
  | 'medicamentos_permanentes'
  | 'enfermedad'
> => ({
  tipo_sangre_rh: values.tipo_sangre_rh,
  tiene_discapacidad: values.tiene_discapacidad,
  tipo_discapacidad: values.tipo_discapacidad,
  presenta_alergias: values.presenta_alergias,
  medicamentos_permanentes: values.medicamentos_permanentes,
  enfermedad: values.enfermedad
});

const hasRestrictedValues = (values: SstPerfilEditableValues): boolean =>
  RESTRICTED_SST_FIELDS.some((field) => hasSstPerfilValue(values[field]));

const summarizeRestrictedAuditValues = (
  values: Pick<
    SstPerfilEditableValues,
    | 'tipo_sangre_rh'
    | 'tiene_discapacidad'
    | 'tipo_discapacidad'
    | 'presenta_alergias'
    | 'medicamentos_permanentes'
    | 'enfermedad'
  >
): Record<string, string | null> =>
  Object.fromEntries(
    RESTRICTED_SST_FIELDS.map((field) => [
      field,
      hasSstPerfilValue(values[field as keyof typeof values]) ? '[RESTRINGIDO]' : null
    ])
  );

const buildSanitizedAuditSnapshot = (
  detail: SstPerfilSociodemograficoDetail | null,
  restrictedValues?: Pick<
    SstPerfilEditableValues,
    | 'tipo_sangre_rh'
    | 'tiene_discapacidad'
    | 'tipo_discapacidad'
    | 'presenta_alergias'
    | 'medicamentos_permanentes'
    | 'enfermedad'
  >
): SstPerfilSociodemograficoDetail | null => {
  if (!detail) {
    return null;
  }

  return {
    ...detail,
    values: sanitizeSstPerfilValuesForView(detail.values, false),
    sensitive_fields_hidden: true,
    ...(restrictedValues
      ? {
          completitud: { ...detail.completitud },
          history_count: detail.history_count,
          values_restringidos: summarizeRestrictedAuditValues(restrictedValues)
        }
      : {})
  } as SstPerfilSociodemograficoDetail;
};

const loadPersonaCore = async (client: PoolClient, personaId: number): Promise<PersonaCoreRow> => {
  const result = await client.query<PersonaCoreRow>(
    `
      SELECT id, fecha_nacimiento, sexo_id, estado_civil_id
      FROM personas
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [personaId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  return row;
};

const ensureLinkedVinculacion = async (
  client: PoolClient,
  personaId: number,
  vinculacionId: number | null,
  tenant?: TenantAccessContext
): Promise<void> => {
  if (!vinculacionId) {
    return;
  }

  await assertTenantAccessForVinculacionId(tenant, vinculacionId);

  const result = await client.query<VinculacionPersonaRow>(
    `
      SELECT id, persona_id
      FROM vinculaciones
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  if (toRequiredNumber(row.persona_id) !== personaId) {
    throw new AppError(
      'La vinculacion indicada no pertenece a la persona seleccionada',
      400,
      'SST_PERFIL_VINCULACION_PERSONA_MISMATCH'
    );
  }
};

const getCurrentRowByPersonaId = async (
  client: PoolClient,
  personaId: number
): Promise<SstPerfilCurrentRow | null> => {
  const result = await client.query<SstPerfilCurrentRow>(
    `
      SELECT
        id,
        persona_id,
        vinculacion_id,
        fecha_caracterizacion,
        origen,
        motivo_ultima_actualizacion,
        created_by_user_id,
        updated_by_user_id,
        requiere_revision,
        nacionalidad,
        estrato_socioeconomico,
        tipo_vivienda,
        grupo_etnico,
        nivel_escolaridad,
        profesion_ocupacion,
        personas_dependen_economicamente,
        cabeza_familia,
        total_hijos,
        hijos_viven_con_usted,
        hijos_menores_edad,
        hijos_mayores_edad,
        tiene_discapacidad,
        tipo_discapacidad,
        redes_apoyo_social,
        presenta_alergias,
        medicamentos_permanentes,
        enfermedad,
        autorizacion_tratamiento_datos,
        observaciones,
        activo,
        created_at,
        updated_at
      FROM sst_perfil_demografico
      WHERE persona_id = $1::bigint
        AND COALESCE(activo, TRUE) = TRUE
      LIMIT 1
    `,
    [personaId]
  );

  return result.rows[0] ?? null;
};

const getCurrentRestrictedRowByPersonaId = async (
  client: PoolClient,
  personaId: number
): Promise<SstPerfilRestrictedRow | null> => {
  const result = await client.query<SstPerfilRestrictedRow>(
    `
      SELECT
        id,
        persona_id,
        vinculacion_id,
        tipo_sangre_rh,
        tiene_discapacidad,
        tipo_discapacidad,
        presenta_alergias,
        medicamentos_permanentes,
        enfermedad,
        origen,
        motivo_ultima_actualizacion,
        activo,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      FROM sst_perfil_restringido
      WHERE persona_id = $1::bigint
        AND COALESCE(activo, TRUE) = TRUE
      LIMIT 1
    `,
    [personaId]
  );

  return result.rows[0] ?? null;
};

const listVersionRowsByPersonaId = async (
  client: PoolClient,
  personaId: number
): Promise<SstPerfilVersionRow[]> => {
  const result = await client.query<SstPerfilVersionRow>(
    `
      SELECT
        id,
        perfil_id,
        persona_id,
        vinculacion_id,
        version_numero,
        vigente_desde,
        vigencia_hasta,
        es_vigente,
        fecha_caracterizacion,
        origen,
        motivo_cambio,
        created_by_user_id,
        importacion_lote_id,
        requiere_revision,
        nacionalidad,
        estrato_socioeconomico,
        tipo_vivienda,
        grupo_etnico,
        nivel_escolaridad,
        profesion_ocupacion,
        personas_dependen_economicamente,
        cabeza_familia,
        total_hijos,
        hijos_viven_con_usted,
        hijos_menores_edad,
        hijos_mayores_edad,
        tiene_discapacidad,
        tipo_discapacidad,
        redes_apoyo_social,
        presenta_alergias,
        medicamentos_permanentes,
        enfermedad,
        autorizacion_tratamiento_datos,
        observaciones,
        created_at
      FROM sst_perfil_demografico_versiones
      WHERE persona_id = $1::bigint
      ORDER BY version_numero DESC, id DESC
    `,
    [personaId]
  );

  return result.rows;
};

const mapVersion = (
  row: SstPerfilVersionRow,
  canViewSensitiveFields: boolean,
  restrictedRow?: SstPerfilRestrictedRow | null
): SstPerfilSociodemograficoVersion => ({
  id: toRequiredNumber(row.id),
  perfil_id: toRequiredNumber(row.perfil_id),
  persona_id: toRequiredNumber(row.persona_id),
  vinculacion_id: toNullableNumber(row.vinculacion_id),
  version_numero: toRequiredNumber(row.version_numero),
  vigente_desde: formatTimestampValue(row.vigente_desde) ?? new Date().toISOString(),
  vigencia_hasta: formatTimestampValue(row.vigencia_hasta),
  es_vigente: row.es_vigente,
  fecha_caracterizacion: formatDateValue(row.fecha_caracterizacion),
  origen: row.origen,
  motivo_cambio: row.motivo_cambio,
  importacion_lote_id: toNullableNumber(row.importacion_lote_id),
  created_by_user_id: toNullableNumber(row.created_by_user_id),
  requiere_revision: row.requiere_revision ?? false,
  values: sanitizeSstPerfilValuesForView(
    mergeCurrentSstValues(row, row.es_vigente ? restrictedRow : null),
    canViewSensitiveFields
  ),
  created_at: formatTimestampValue(row.created_at)
});

const resolveOrigin = (
  currentOrigin: SstPerfilOrigen | null,
  versions: SstPerfilVersionRow[]
): SstPerfilOrigenResuelto => {
  const values = new Set<SstPerfilOrigen>();
  if (currentOrigin) {
    values.add(currentOrigin);
  }
  for (const row of versions) {
    if (row.origen) {
      values.add(row.origen);
    }
  }

  if (values.size === 0) {
    return 'SIN_REGISTRO';
  }

  if (values.size > 1) {
    return 'MIXTO';
  }

  return Array.from(values)[0] ?? 'SIN_REGISTRO';
};

const buildDetailFromRows = (
  personaId: number,
  persona: PersonaCoreRow,
  currentRow: SstPerfilCurrentRow | null,
  restrictedRow: SstPerfilRestrictedRow | null,
  versions: SstPerfilVersionRow[],
  canViewSensitiveFields: boolean
): SstPerfilSociodemograficoDetail => {
  const currentValues = mergeCurrentSstValues(currentRow, restrictedRow);
  const visibleValues = sanitizeSstPerfilValuesForView(currentValues, canViewSensitiveFields);
  const completitud = computeSstPerfilCompleteness({
    fecha_nacimiento: formatDateValue(persona.fecha_nacimiento),
    sexo_id: toNullableNumber(persona.sexo_id),
    estado_civil_id: toNullableNumber(persona.estado_civil_id),
    requiere_revision: currentRow?.requiere_revision ?? false,
    values: currentValues
  });

  return {
    id: currentRow ? toRequiredNumber(currentRow.id) : null,
    persona_id: personaId,
    vinculacion_id: toNullableNumber(currentRow?.vinculacion_id),
    fecha_caracterizacion: formatDateValue(currentRow?.fecha_caracterizacion),
    origen: currentRow?.origen ?? null,
    origen_resuelto: resolveOrigin(currentRow?.origen ?? null, versions),
    motivo_ultima_actualizacion: currentRow?.motivo_ultima_actualizacion ?? null,
    created_by_user_id: toNullableNumber(currentRow?.created_by_user_id),
    updated_by_user_id: toNullableNumber(currentRow?.updated_by_user_id),
    version_actual:
      versions.length > 0 ? toRequiredNumber(versions[0]?.version_numero ?? 1) : currentRow ? 1 : 0,
    requiere_revision: currentRow?.requiere_revision ?? false,
    activo: currentRow?.activo ?? true,
    created_at: formatTimestampValue(currentRow?.created_at),
    updated_at: formatTimestampValue(currentRow?.updated_at),
    edad: calculateAgeFromBirthDate(formatDateValue(persona.fecha_nacimiento)),
    completitud: {
      porcentaje: completitud.porcentaje,
      estado: completitud.estado,
      campos_requeridos: [...completitud.campos_requeridos],
      campos_completos: [...completitud.campos_completos],
      campos_faltantes: [...completitud.campos_faltantes]
    },
    values: visibleValues,
    history_count: versions.length,
    sensitive_fields_hidden: !canViewSensitiveFields
  };
};

const extractComparableMeta = (
  values: Partial<SstPerfilEditableValues>,
  field: keyof SstPerfilEditableValues
): string => normalizeComparableSstValue(field, values[field] ?? null);

const hasMeaningfulChanges = (
  currentValues: SstPerfilEditableValues | null,
  currentRow: SstPerfilCurrentRow | null,
  nextValues: SstPerfilEditableValues,
  nextMeta: {
    vinculacion_id: number | null;
    fecha_caracterizacion: string | null;
    origen: SstPerfilOrigen | null;
    requiere_revision: boolean;
  }
): boolean => {
  if (!currentRow || !currentValues) {
    return true;
  }

  for (const field of SST_PERFIL_FIELD_DEFINITIONS) {
    const currentComparable = extractComparableMeta(currentValues, field.code);
    const nextComparable = extractComparableMeta(nextValues, field.code);
    if (currentComparable !== nextComparable) {
      return true;
    }
  }

  return (
    toNullableNumber(currentRow.vinculacion_id) !== nextMeta.vinculacion_id ||
    formatDateValue(currentRow.fecha_caracterizacion) !== nextMeta.fecha_caracterizacion ||
    (currentRow.origen ?? null) !== nextMeta.origen ||
    (currentRow.requiere_revision ?? false) !== nextMeta.requiere_revision
  );
};

const closeCurrentVersion = async (client: PoolClient, perfilId: number): Promise<void> => {
  await client.query(
    `
      UPDATE sst_perfil_demografico_versiones
      SET
        es_vigente = FALSE,
        vigencia_hasta = NOW()
      WHERE perfil_id = $1::bigint
        AND es_vigente = TRUE
    `,
    [perfilId]
  );
};

const loadNextVersionNumber = async (client: PoolClient, perfilId: number): Promise<number> => {
  const result = await client.query<{ next_version: number }>(
    `
      SELECT COALESCE(MAX(version_numero), 0)::int + 1 AS next_version
      FROM sst_perfil_demografico_versiones
      WHERE perfil_id = $1::bigint
    `,
    [perfilId]
  );

  return result.rows[0]?.next_version ?? 1;
};

const insertVersionRow = async (
  client: PoolClient,
  input: {
    perfilId: number;
    personaId: number;
    vinculacionId: number | null;
    versionNumero: number;
    fechaCaracterizacion: string | null;
    origen: SstPerfilOrigen | null;
    motivoCambio: string | null;
    actorUserId: string;
    importacionLoteId?: number | null;
    requiereRevision: boolean;
    values: SstPerfilEditableValues;
  }
): Promise<void> => {
  await client.query(
    `
      INSERT INTO sst_perfil_demografico_versiones (
        perfil_id,
        persona_id,
        vinculacion_id,
        version_numero,
        vigente_desde,
        vigencia_hasta,
        es_vigente,
        fecha_caracterizacion,
        origen,
        motivo_cambio,
        created_by_user_id,
        importacion_lote_id,
        requiere_revision,
        nacionalidad,
        estrato_socioeconomico,
        tipo_vivienda,
        grupo_etnico,
        nivel_escolaridad,
        profesion_ocupacion,
        personas_dependen_economicamente,
        cabeza_familia,
        total_hijos,
        hijos_viven_con_usted,
        hijos_menores_edad,
        hijos_mayores_edad,
        tiene_discapacidad,
        tipo_discapacidad,
        redes_apoyo_social,
        presenta_alergias,
        medicamentos_permanentes,
        enfermedad,
        autorizacion_tratamiento_datos,
        observaciones
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        $3::bigint,
        $4::int,
        NOW(),
        NULL,
        TRUE,
        $5::date,
        $6,
        $7,
        $8::bigint,
        $9::bigint,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17::int,
        $18,
        $19::int,
        $20::int,
        $21::int,
        $22::int,
        $23,
        $24,
        $25,
        $26,
        $27,
        $28,
        $29,
        $30
      )
    `,
    [
      input.perfilId,
      input.personaId,
      input.vinculacionId,
      input.versionNumero,
      input.fechaCaracterizacion,
      input.origen,
      input.motivoCambio,
      Number(input.actorUserId),
      input.importacionLoteId ?? null,
      input.requiereRevision,
      input.values.nacionalidad,
      input.values.estrato_socioeconomico,
      input.values.tipo_vivienda,
      input.values.grupo_etnico,
      input.values.nivel_escolaridad,
      input.values.profesion_ocupacion,
      input.values.personas_dependen_economicamente,
      input.values.cabeza_familia,
      input.values.total_hijos,
      input.values.hijos_viven_con_usted,
      input.values.hijos_menores_edad,
      input.values.hijos_mayores_edad,
      null,
      null,
      input.values.redes_apoyo_social,
      null,
      null,
      null,
      input.values.autorizacion_tratamiento_datos,
      input.values.observaciones
    ]
  );
};

const upsertRestrictedRowWithClient = async (
  client: PoolClient,
  input: {
    personaId: number;
    vinculacionId: number | null;
    origen: SstPerfilOrigen | null;
    motivoCambio: string | null;
    actorUserId: string;
    values: SstPerfilEditableValues;
  }
): Promise<SstPerfilRestrictedRow | null> => {
  const currentRow = await getCurrentRestrictedRowByPersonaId(client, input.personaId);
  const nextValues = pickRestrictedSstValues(input.values);
  const hasData = hasRestrictedValues(input.values);

  if (!currentRow && !hasData) {
    return null;
  }

  if (!currentRow) {
    const insertResult = await client.query<SstPerfilRestrictedRow>(
      `
        INSERT INTO sst_perfil_restringido (
          persona_id,
          vinculacion_id,
          tipo_sangre_rh,
          tiene_discapacidad,
          tipo_discapacidad,
          presenta_alergias,
          medicamentos_permanentes,
          enfermedad,
          origen,
          motivo_ultima_actualizacion,
          activo,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
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
          $9,
          $10,
          TRUE,
          $11::bigint,
          $11::bigint,
          NOW(),
          NOW()
        )
        RETURNING
          id,
          persona_id,
          vinculacion_id,
          tipo_sangre_rh,
          tiene_discapacidad,
          tipo_discapacidad,
          presenta_alergias,
          medicamentos_permanentes,
          enfermedad,
          origen,
          motivo_ultima_actualizacion,
          activo,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
      `,
      [
        input.personaId,
        input.vinculacionId,
        nextValues.tipo_sangre_rh,
        nextValues.tiene_discapacidad,
        nextValues.tipo_discapacidad,
        nextValues.presenta_alergias,
        nextValues.medicamentos_permanentes,
        nextValues.enfermedad,
        input.origen,
        input.motivoCambio,
        Number(input.actorUserId)
      ]
    );

    return insertResult.rows[0] ?? null;
  }

  await client.query(
    `
      UPDATE sst_perfil_restringido
      SET
        vinculacion_id = $2::bigint,
        tipo_sangre_rh = $3,
        tiene_discapacidad = $4,
        tipo_discapacidad = $5,
        presenta_alergias = $6,
        medicamentos_permanentes = $7,
        enfermedad = $8,
        origen = $9,
        motivo_ultima_actualizacion = $10,
        activo = TRUE,
        updated_by_user_id = $11::bigint,
        updated_at = NOW()
      WHERE id = $1::bigint
    `,
    [
      toRequiredNumber(currentRow.id),
      input.vinculacionId,
      nextValues.tipo_sangre_rh,
      nextValues.tiene_discapacidad,
      nextValues.tipo_discapacidad,
      nextValues.presenta_alergias,
      nextValues.medicamentos_permanentes,
      nextValues.enfermedad,
      input.origen,
      input.motivoCambio,
      Number(input.actorUserId)
    ]
  );

  return getCurrentRestrictedRowByPersonaId(client, input.personaId);
};

const mapUpdateInputToPatch = (
  input: PersonaSstPerfilUpdateInput
): Partial<SstPerfilEditableValues> => ({
  nacionalidad: input.nacionalidad,
  estrato_socioeconomico: input.estrato_socioeconomico,
  tipo_vivienda: input.tipo_vivienda,
  grupo_etnico: input.grupo_etnico,
  nivel_escolaridad: input.nivel_escolaridad,
  profesion_ocupacion: input.profesion_ocupacion,
  personas_dependen_economicamente: input.personas_dependen_economicamente,
  cabeza_familia: input.cabeza_familia,
  total_hijos: input.total_hijos,
  hijos_viven_con_usted: input.hijos_viven_con_usted,
  hijos_menores_edad: input.hijos_menores_edad,
  hijos_mayores_edad: input.hijos_mayores_edad,
  tipo_sangre_rh: input.tipo_sangre_rh,
  tiene_discapacidad: input.tiene_discapacidad,
  tipo_discapacidad: input.tipo_discapacidad,
  redes_apoyo_social: input.redes_apoyo_social,
  presenta_alergias: input.presenta_alergias,
  medicamentos_permanentes: input.medicamentos_permanentes,
  enfermedad: input.enfermedad,
  autorizacion_tratamiento_datos: input.autorizacion_tratamiento_datos,
  observaciones: input.observaciones
});

export const getSstPerfilSociodemograficoByPersonaId = async (
  personaId: number,
  options: {
    canViewSensitiveFields: boolean;
  },
  tenant?: TenantAccessContext
): Promise<SstPerfilSociodemograficoDetail> => {
  const client = await dbPool.connect();

  try {
    await assertTenantAccessForPersonaId(tenant, personaId);
    const persona = await loadPersonaCore(client, personaId);
    const currentRow = await getCurrentRowByPersonaId(client, personaId);
    const restrictedRow = await getCurrentRestrictedRowByPersonaId(client, personaId);
    const versions = await listVersionRowsByPersonaId(client, personaId);
    return buildDetailFromRows(
      personaId,
      persona,
      currentRow,
      restrictedRow,
      versions,
      options.canViewSensitiveFields
    );
  } finally {
    client.release();
  }
};

export const listSstPerfilSociodemograficoHistorialByPersonaId = async (
  personaId: number,
  options: {
    canViewSensitiveFields: boolean;
  },
  tenant?: TenantAccessContext
): Promise<SstPerfilSociodemograficoVersion[]> => {
  const client = await dbPool.connect();

  try {
    await assertTenantAccessForPersonaId(tenant, personaId);
    const restrictedRow = await getCurrentRestrictedRowByPersonaId(client, personaId);
    return (await listVersionRowsByPersonaId(client, personaId)).map((row) =>
      mapVersion(row, options.canViewSensitiveFields, restrictedRow)
    );
  } finally {
    client.release();
  }
};

export const upsertSstPerfilSociodemograficoWithClient = async (
  client: PoolClient,
  personaId: number,
  input: PersonaSstPerfilUpdateInput,
  context: SstPerfilMutationContext,
  tenant?: TenantAccessContext
): Promise<SstPerfilSociodemograficoDetail> => {
  await assertTenantAccessForPersonaId(tenant, personaId);
  const persona = await loadPersonaCore(client, personaId);
  const currentRow = await getCurrentRowByPersonaId(client, personaId);
  const currentRestrictedRow = await getCurrentRestrictedRowByPersonaId(client, personaId);
  const currentValues = mergeCurrentSstValues(currentRow, currentRestrictedRow);
  const nextValues = mergeSstPerfilValues(currentValues, mapUpdateInputToPatch(input));
  const nextVinculacionId =
    input.vinculacion_id !== undefined
      ? input.vinculacion_id
      : toNullableNumber(currentRow?.vinculacion_id);
  const nextFechaCaracterizacion =
    input.fecha_caracterizacion !== undefined
      ? input.fecha_caracterizacion
      : formatDateValue(currentRow?.fecha_caracterizacion);
  const nextOrigen =
    input.origen !== undefined ? input.origen : context.origin ?? currentRow?.origen ?? null;
  const nextRequiereRevision = false;

  await ensureLinkedVinculacion(client, personaId, nextVinculacionId, tenant);

  if (
    !hasMeaningfulChanges(currentValues, currentRow, nextValues, {
      vinculacion_id: nextVinculacionId,
      fecha_caracterizacion: nextFechaCaracterizacion,
      origen: nextOrigen,
      requiere_revision: nextRequiereRevision
    })
  ) {
    const versions = await listVersionRowsByPersonaId(client, personaId);
    return buildDetailFromRows(
      personaId,
      persona,
      currentRow,
      currentRestrictedRow,
      versions,
      true
    );
  }

  const beforeSnapshot = currentRow
    ? buildDetailFromRows(
        personaId,
        persona,
        currentRow,
        currentRestrictedRow,
        await listVersionRowsByPersonaId(client, personaId),
        true
      )
    : null;

  let perfilId = currentRow ? toRequiredNumber(currentRow.id) : null;

  if (!currentRow) {
    const insertResult = await client.query<{ id: number | string }>(
      `
        INSERT INTO sst_perfil_demografico (
          persona_id,
          vinculacion_id,
          fecha_caracterizacion,
          origen,
          motivo_ultima_actualizacion,
          created_by_user_id,
          updated_by_user_id,
          requiere_revision,
          nacionalidad,
          estrato_socioeconomico,
          tipo_vivienda,
          grupo_etnico,
          nivel_escolaridad,
          profesion_ocupacion,
          personas_dependen_economicamente,
          cabeza_familia,
          total_hijos,
          hijos_viven_con_usted,
          hijos_menores_edad,
          hijos_mayores_edad,
          tiene_discapacidad,
          tipo_discapacidad,
          redes_apoyo_social,
          presenta_alergias,
          medicamentos_permanentes,
          enfermedad,
          autorizacion_tratamiento_datos,
          observaciones,
          activo,
          marca_temporal,
          created_at,
          updated_at
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::date,
          $4,
          $5,
          $6::bigint,
          $7::bigint,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15::int,
          $16,
          $17::int,
          $18::int,
          $19::int,
          $20::int,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27,
          $28,
          TRUE,
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING id
      `,
      [
        personaId,
        nextVinculacionId,
        nextFechaCaracterizacion,
        nextOrigen,
        input.motivo_cambio,
        Number(context.actorUserId),
        Number(context.actorUserId),
        nextRequiereRevision,
        nextValues.nacionalidad,
        nextValues.estrato_socioeconomico,
        nextValues.tipo_vivienda,
        nextValues.grupo_etnico,
        nextValues.nivel_escolaridad,
        nextValues.profesion_ocupacion,
        nextValues.personas_dependen_economicamente,
        nextValues.cabeza_familia,
        nextValues.total_hijos,
        nextValues.hijos_viven_con_usted,
        nextValues.hijos_menores_edad,
        nextValues.hijos_mayores_edad,
        null,
        null,
        nextValues.redes_apoyo_social,
        null,
        null,
        null,
        nextValues.autorizacion_tratamiento_datos,
        nextValues.observaciones
      ]
    );

    perfilId = toRequiredNumber(insertResult.rows[0]?.id, 'SST_PERFIL_CREATE_FAILED');
  } else {
    await client.query(
      `
        UPDATE sst_perfil_demografico
        SET
          vinculacion_id = $2::bigint,
          fecha_caracterizacion = $3::date,
          origen = $4,
          motivo_ultima_actualizacion = $5,
          updated_by_user_id = $6::bigint,
          requiere_revision = $7,
          nacionalidad = $8,
          estrato_socioeconomico = $9,
          tipo_vivienda = $10,
          grupo_etnico = $11,
          nivel_escolaridad = $12,
          profesion_ocupacion = $13,
          personas_dependen_economicamente = $14::int,
          cabeza_familia = $15,
          total_hijos = $16::int,
          hijos_viven_con_usted = $17::int,
          hijos_menores_edad = $18::int,
          hijos_mayores_edad = $19::int,
          tiene_discapacidad = $20,
          tipo_discapacidad = $21,
          redes_apoyo_social = $22,
          presenta_alergias = $23,
          medicamentos_permanentes = $24,
          enfermedad = $25,
          autorizacion_tratamiento_datos = $26,
          observaciones = $27,
          activo = TRUE,
          marca_temporal = NOW(),
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [
        perfilId,
        nextVinculacionId,
        nextFechaCaracterizacion,
        nextOrigen,
        input.motivo_cambio,
        Number(context.actorUserId),
        nextRequiereRevision,
        nextValues.nacionalidad,
        nextValues.estrato_socioeconomico,
        nextValues.tipo_vivienda,
        nextValues.grupo_etnico,
        nextValues.nivel_escolaridad,
        nextValues.profesion_ocupacion,
        nextValues.personas_dependen_economicamente,
        nextValues.cabeza_familia,
        nextValues.total_hijos,
        nextValues.hijos_viven_con_usted,
        nextValues.hijos_menores_edad,
        nextValues.hijos_mayores_edad,
        null,
        null,
        nextValues.redes_apoyo_social,
        null,
        null,
        null,
        nextValues.autorizacion_tratamiento_datos,
        nextValues.observaciones
      ]
    );
  }

  if (perfilId === null) {
    throw new AppError('No fue posible resolver el perfil SST vigente', 500, 'SST_PERFIL_ID_MISSING');
  }

  const refreshedRestrictedRow = await upsertRestrictedRowWithClient(client, {
    personaId,
    vinculacionId: nextVinculacionId,
    origen: nextOrigen,
    motivoCambio: input.motivo_cambio,
    actorUserId: context.actorUserId,
    values: nextValues
  });

  await closeCurrentVersion(client, perfilId);
  await insertVersionRow(client, {
    perfilId,
    personaId,
    vinculacionId: nextVinculacionId,
    versionNumero: await loadNextVersionNumber(client, perfilId),
    fechaCaracterizacion: nextFechaCaracterizacion,
    origen: nextOrigen,
    motivoCambio: input.motivo_cambio,
    actorUserId: context.actorUserId,
    importacionLoteId: context.importacionLoteId ?? null,
    requiereRevision: nextRequiereRevision,
    values: nextValues
  });

  const refreshedRow = await getCurrentRowByPersonaId(client, personaId);
  if (!refreshedRow) {
    throw new AppError('Failed to reload SST profile', 500, 'SST_PERFIL_RELOAD_FAILED');
  }

  const versions = await listVersionRowsByPersonaId(client, personaId);
  const afterSnapshot = buildDetailFromRows(
    personaId,
    persona,
    refreshedRow,
    refreshedRestrictedRow,
    versions,
    true
  );

  await registerAuditEntry({
    client,
    accion: currentRow ? 'SST_PERFIL_SOCIODEMOGRAFICO_UPDATE' : 'SST_PERFIL_SOCIODEMOGRAFICO_CREATE',
    tabla: 'sst_perfil_demografico',
    registro_id: String(perfilId),
    descripcion: input.motivo_cambio,
    usuario_id: context.actorUserId,
    before: buildSanitizedAuditSnapshot(
      beforeSnapshot,
      currentRestrictedRow ? pickRestrictedSstValues(currentValues) : undefined
    ),
    after: buildSanitizedAuditSnapshot(afterSnapshot, pickRestrictedSstValues(nextValues)),
    ...context.auditMeta
  });

  return afterSnapshot;
};

export const upsertSstPerfilSociodemografico = async (
  personaId: number,
  input: PersonaSstPerfilUpdateInput,
  context: SstPerfilMutationContext,
  tenant?: TenantAccessContext
): Promise<SstPerfilSociodemograficoDetail> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const detail = await upsertSstPerfilSociodemograficoWithClient(
      client,
      personaId,
      input,
      context,
      tenant
    );
    await client.query('COMMIT');
    return detail;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
