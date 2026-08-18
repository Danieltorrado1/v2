import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { assertTenantAccessForPersonaId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  buildPersonaIdentificationCore,
  hasPersonaIdentificationChanged,
  type PersonaIdentificationCore
} from './personas.identificaciones.helpers';
import {
  type CreatePersonaIdentificacionInput,
  type CreatePersonaInput,
  type ListPersonasQuery,
  type UpdatePersonaInput
} from './personas.schemas';

interface PersonaRow extends QueryResultRow {
  barrio: string | null;
  ciudad_nacimiento_extranjero: string | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: string | number | null;
  estatura: string | number | null;
  fecha_expedicion_documento: string | null;
  fecha_nacimiento: string | null;
  id: string | number;
  identificacion_vigente_es_vigente: boolean | null;
  identificacion_vigente_fecha_expedicion_documento: string | null;
  identificacion_vigente_id: string | number | null;
  identificacion_vigente_motivo_cambio: string | null;
  identificacion_vigente_municipio_expedicion_id: string | number | null;
  identificacion_vigente_municipio_expedicion_nombre: string | null;
  identificacion_vigente_numero_documento: string | null;
  identificacion_vigente_registrado_en: Date | string | null;
  identificacion_vigente_registrado_por_usuario_correo: string | null;
  identificacion_vigente_registrado_por_usuario_id: string | number | null;
  identificacion_vigente_registrado_por_usuario_nombre: string | null;
  identificacion_vigente_reemplaza_identificacion_id: string | number | null;
  identificacion_vigente_tipo_documento_id: string | number | null;
  identificacion_vigente_tipo_documento_nombre: string | null;
  identificacion_vigente_vigente_desde: Date | string | null;
  identificacion_vigente_vigente_hasta: Date | string | null;
  identificador_interno: string;
  municipio_expedicion_id: string | number | null;
  municipio_nacimiento_id: string | number | null;
  municipio_residencia_id: string | number | null;
  nacimiento_extranjero: boolean | null;
  numero_documento: string;
  pais_nacimiento: string | null;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo_id: string | number | null;
  telefono: string | null;
  tipo_documento_id: string | number;
  tipo_sangre_id: string | number | null;
  zona_id: string | number | null;
}

interface PersonaIdentificacionRow extends QueryResultRow {
  es_vigente: boolean;
  fecha_expedicion_documento: string | null;
  id: string | number;
  motivo_cambio: string;
  municipio_expedicion_id: string | number | null;
  municipio_expedicion_nombre: string | null;
  numero_documento: string;
  persona_id: string | number;
  registrado_en: Date | string;
  registrado_por_usuario_correo: string | null;
  registrado_por_usuario_id: string | number | null;
  registrado_por_usuario_nombre: string | null;
  reemplaza_identificacion_id: string | number | null;
  tipo_documento_id: string | number;
  tipo_documento_nombre: string | null;
  vigente_desde: Date | string;
  vigente_hasta: Date | string | null;
}

interface PersonaContactoEmergenciaRow extends QueryResultRow {
  activo: boolean | null;
  created_at: Date | string | null;
  direccion: string | null;
  id: string | number;
  nombre_contacto: string;
  parentesco: string | null;
  persona_id: string | number;
  telefono: string | null;
}

interface PersonaPerfilDemograficoRow extends QueryResultRow {
  activo: boolean | null;
  id: string | number;
  nacionalidad: string | null;
  nivel_escolaridad: string | null;
  persona_id: string | number;
  updated_at: Date | string | null;
}

interface CountRow extends QueryResultRow {
  total: number;
}

export interface PersonaIdentificacion {
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

export interface Persona {
  barrio: string | null;
  ciudad_nacimiento_extranjero: string | null;
  contacto_emergencia?: PersonaContactoEmergencia | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: number | null;
  estatura: number | null;
  fecha_expedicion_documento: string | null;
  fecha_nacimiento: string | null;
  id: number;
  identificacion_vigente: PersonaIdentificacion | null;
  identificador_interno: string;
  municipio_expedicion_id: number | null;
  municipio_nacimiento_id: number | null;
  municipio_residencia_id: number | null;
  nacimiento_extranjero: boolean;
  numero_documento: string;
  pais_nacimiento: string | null;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo_id: number | null;
  telefono: string | null;
  tipo_documento_id: number;
  tipo_sangre_id: number | null;
  zona_id: number | null;
  perfil_demografico?: PersonaPerfilDemografico | null;
}

export interface PersonaContactoEmergencia {
  activo: boolean;
  created_at: string | null;
  direccion: string | null;
  id: number;
  nombre_contacto: string;
  parentesco: string | null;
  persona_id: number;
  telefono: string | null;
}

export interface PersonaPerfilDemografico {
  activo: boolean;
  id: number;
  nacionalidad: string | null;
  nivel_escolaridad: string | null;
  persona_id: number;
  updated_at: string | null;
}

export interface PaginatedPersonas {
  items: Persona[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

interface PersonaMutationContext {
  actorUserId?: string | null;
  auditMeta?: AuditRequestMeta;
}

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRequiredNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const formatDateValue = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const formatTimestampValue = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const mapPersonaIdentificacion = (row: PersonaIdentificacionRow): PersonaIdentificacion => {
  return {
    id: toRequiredNumber(row.id),
    persona_id: toRequiredNumber(row.persona_id),
    tipo_documento_id: toRequiredNumber(row.tipo_documento_id),
    tipo_documento_nombre: row.tipo_documento_nombre,
    numero_documento: row.numero_documento,
    fecha_expedicion_documento: formatDateValue(row.fecha_expedicion_documento),
    municipio_expedicion_id: toNullableNumber(row.municipio_expedicion_id),
    municipio_expedicion_nombre: row.municipio_expedicion_nombre,
    es_vigente: row.es_vigente,
    motivo_cambio: row.motivo_cambio,
    registrado_por_usuario_id: toNullableNumber(row.registrado_por_usuario_id),
    registrado_por_usuario_nombre: row.registrado_por_usuario_nombre,
    registrado_por_usuario_correo: row.registrado_por_usuario_correo,
    registrado_en: formatTimestampValue(row.registrado_en) ?? '',
    vigente_desde: formatTimestampValue(row.vigente_desde) ?? '',
    vigente_hasta: formatTimestampValue(row.vigente_hasta),
    reemplaza_identificacion_id: toNullableNumber(row.reemplaza_identificacion_id)
  };
};

const mapPersonaContactoEmergencia = (
  row: PersonaContactoEmergenciaRow | null | undefined
): PersonaContactoEmergencia | null => {
  if (!row) {
    return null;
  }

  return {
    id: toRequiredNumber(row.id),
    persona_id: toRequiredNumber(row.persona_id),
    nombre_contacto: row.nombre_contacto,
    parentesco: row.parentesco,
    telefono: row.telefono,
    direccion: row.direccion,
    activo: row.activo ?? true,
    created_at: formatTimestampValue(row.created_at)
  };
};

const mapPersonaPerfilDemografico = (
  row: PersonaPerfilDemograficoRow | null | undefined
): PersonaPerfilDemografico | null => {
  if (!row) {
    return null;
  }

  return {
    id: toRequiredNumber(row.id),
    persona_id: toRequiredNumber(row.persona_id),
    nacionalidad: row.nacionalidad,
    nivel_escolaridad: row.nivel_escolaridad,
    activo: row.activo ?? true,
    updated_at: formatTimestampValue(row.updated_at)
  };
};

const mapPersona = (row: PersonaRow): Persona => {
  const identificacionVigente = row.identificacion_vigente_id === null
    ? null
    : {
        id: toRequiredNumber(row.identificacion_vigente_id),
        persona_id: toRequiredNumber(row.id),
        tipo_documento_id: toRequiredNumber(row.identificacion_vigente_tipo_documento_id ?? row.tipo_documento_id),
        tipo_documento_nombre: row.identificacion_vigente_tipo_documento_nombre,
        numero_documento: row.identificacion_vigente_numero_documento ?? row.numero_documento,
        fecha_expedicion_documento: formatDateValue(
          row.identificacion_vigente_fecha_expedicion_documento ?? row.fecha_expedicion_documento
        ),
        municipio_expedicion_id: toNullableNumber(
          row.identificacion_vigente_municipio_expedicion_id ?? row.municipio_expedicion_id
        ),
        municipio_expedicion_nombre: row.identificacion_vigente_municipio_expedicion_nombre,
        es_vigente: row.identificacion_vigente_es_vigente ?? true,
        motivo_cambio: row.identificacion_vigente_motivo_cambio ?? 'IDENTIFICACION_VIGENTE',
        registrado_por_usuario_id: toNullableNumber(row.identificacion_vigente_registrado_por_usuario_id),
        registrado_por_usuario_nombre: row.identificacion_vigente_registrado_por_usuario_nombre,
        registrado_por_usuario_correo: row.identificacion_vigente_registrado_por_usuario_correo,
        registrado_en: formatTimestampValue(row.identificacion_vigente_registrado_en) ?? '',
        vigente_desde: formatTimestampValue(row.identificacion_vigente_vigente_desde) ?? '',
        vigente_hasta: formatTimestampValue(row.identificacion_vigente_vigente_hasta),
        reemplaza_identificacion_id: toNullableNumber(row.identificacion_vigente_reemplaza_identificacion_id)
      };

  return {
    id: toRequiredNumber(row.id),
    identificador_interno: row.identificador_interno,
    tipo_documento_id: toRequiredNumber(row.tipo_documento_id),
    numero_documento: row.numero_documento,
    primer_nombre: row.primer_nombre,
    segundo_nombre: row.segundo_nombre,
    primer_apellido: row.primer_apellido,
    segundo_apellido: row.segundo_apellido,
    fecha_nacimiento: formatDateValue(row.fecha_nacimiento),
    fecha_expedicion_documento: formatDateValue(row.fecha_expedicion_documento),
    municipio_nacimiento_id: toNullableNumber(row.municipio_nacimiento_id),
    municipio_expedicion_id: toNullableNumber(row.municipio_expedicion_id),
    municipio_residencia_id: toNullableNumber(row.municipio_residencia_id),
    sexo_id: toNullableNumber(row.sexo_id),
    estado_civil_id: toNullableNumber(row.estado_civil_id),
    tipo_sangre_id: toNullableNumber(row.tipo_sangre_id),
    estatura: toNullableNumber(row.estatura),
    telefono: row.telefono,
    correo: row.correo,
    direccion: row.direccion,
    barrio: row.barrio,
    zona_id: toNullableNumber(row.zona_id),
    pais_nacimiento: row.pais_nacimiento,
    nacimiento_extranjero: row.nacimiento_extranjero ?? false,
    ciudad_nacimiento_extranjero: row.ciudad_nacimiento_extranjero,
    identificacion_vigente: identificacionVigente
  };
};

const getPersonaSelect = (): string => {
  return `
    SELECT
      p.id::text AS id,
      p.identificador_interno,
      p.tipo_documento_id,
      p.numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      p.fecha_nacimiento,
      p.fecha_expedicion_documento,
      p.municipio_nacimiento_id,
      p.municipio_expedicion_id,
      p.municipio_residencia_id,
      p.sexo_id,
      p.estado_civil_id,
      p.tipo_sangre_id,
      p.estatura,
      p.telefono,
      p.correo,
      p.direccion,
      p.barrio,
      p.zona_id,
      p.pais_nacimiento,
      p.nacimiento_extranjero,
      p.ciudad_nacimiento_extranjero,
      current_pi.id AS identificacion_vigente_id,
      current_pi.tipo_documento_id AS identificacion_vigente_tipo_documento_id,
      current_pi.numero_documento AS identificacion_vigente_numero_documento,
      current_pi.fecha_expedicion_documento AS identificacion_vigente_fecha_expedicion_documento,
      current_pi.municipio_expedicion_id AS identificacion_vigente_municipio_expedicion_id,
      current_pi.es_vigente AS identificacion_vigente_es_vigente,
      current_pi.motivo_cambio AS identificacion_vigente_motivo_cambio,
      current_pi.registrado_por_usuario_id AS identificacion_vigente_registrado_por_usuario_id,
      current_pi.registrado_en AS identificacion_vigente_registrado_en,
      current_pi.vigente_desde AS identificacion_vigente_vigente_desde,
      current_pi.vigente_hasta AS identificacion_vigente_vigente_hasta,
      current_pi.reemplaza_identificacion_id AS identificacion_vigente_reemplaza_identificacion_id,
      current_td.nombre_documento AS identificacion_vigente_tipo_documento_nombre,
      current_mu.nombre_municipio AS identificacion_vigente_municipio_expedicion_nombre,
      current_u.nombre_completo AS identificacion_vigente_registrado_por_usuario_nombre,
      current_u.correo AS identificacion_vigente_registrado_por_usuario_correo
    FROM personas p
    LEFT JOIN persona_identificaciones current_pi
      ON current_pi.persona_id = p.id
     AND current_pi.es_vigente = TRUE
    LEFT JOIN tipos_documentos current_td ON current_td.id = current_pi.tipo_documento_id
    LEFT JOIN municipios current_mu ON current_mu.id = current_pi.municipio_expedicion_id
    LEFT JOIN usuarios current_u ON current_u.id = current_pi.registrado_por_usuario_id
  `;
};

const getPersonaIdentificationSelect = (): string => {
  return `
    SELECT
      pi.id,
      pi.persona_id,
      pi.tipo_documento_id,
      pi.numero_documento,
      pi.fecha_expedicion_documento,
      pi.municipio_expedicion_id,
      pi.es_vigente,
      pi.motivo_cambio,
      pi.registrado_por_usuario_id,
      pi.registrado_en,
      pi.vigente_desde,
      pi.vigente_hasta,
      pi.reemplaza_identificacion_id,
      td.nombre_documento AS tipo_documento_nombre,
      mu.nombre_municipio AS municipio_expedicion_nombre,
      u.nombre_completo AS registrado_por_usuario_nombre,
      u.correo AS registrado_por_usuario_correo
    FROM persona_identificaciones pi
    LEFT JOIN tipos_documentos td ON td.id = pi.tipo_documento_id
    LEFT JOIN municipios mu ON mu.id = pi.municipio_expedicion_id
    LEFT JOIN usuarios u ON u.id = pi.registrado_por_usuario_id
  `;
};

const getPersonaContactoEmergenciaByPersonaId = async (
  client: PoolClient,
  personaId: string
): Promise<PersonaContactoEmergenciaRow | null> => {
  const result = await client.query<PersonaContactoEmergenciaRow>(
    `
      SELECT
        id,
        persona_id,
        nombre_contacto,
        parentesco,
        telefono,
        direccion,
        activo,
        created_at
      FROM persona_contactos_emergencia
      WHERE persona_id::text = $1
        AND COALESCE(activo, TRUE) = TRUE
      ORDER BY id DESC
      LIMIT 1
    `,
    [personaId]
  );

  return result.rows[0] ?? null;
};

const getPersonaPerfilDemograficoByPersonaId = async (
  client: PoolClient,
  personaId: string
): Promise<PersonaPerfilDemograficoRow | null> => {
  const result = await client.query<PersonaPerfilDemograficoRow>(
    `
      SELECT
        id,
        persona_id,
        nacionalidad,
        nivel_escolaridad,
        activo,
        updated_at
      FROM sst_perfil_demografico
      WHERE persona_id::text = $1
        AND COALESCE(activo, TRUE) = TRUE
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [personaId]
  );

  return result.rows[0] ?? null;
};

const enrichPersonaWithProfile = async (
  client: PoolClient,
  persona: Persona
): Promise<Persona> => {
  const [contactoEmergencia, perfilDemografico] = await Promise.all([
    getPersonaContactoEmergenciaByPersonaId(client, String(persona.id)),
    getPersonaPerfilDemograficoByPersonaId(client, String(persona.id))
  ]);

  return {
    ...persona,
    contacto_emergencia: mapPersonaContactoEmergencia(contactoEmergencia),
    perfil_demografico: mapPersonaPerfilDemografico(perfilDemografico)
  };
};

const buildPersonaIdentificationCoreFromPersonaRow = (row: PersonaRow): PersonaIdentificationCore => {
  return buildPersonaIdentificationCore({
    tipo_documento_id: toRequiredNumber(row.tipo_documento_id),
    numero_documento: row.numero_documento,
    fecha_expedicion_documento: formatDateValue(row.fecha_expedicion_documento),
    municipio_expedicion_id: toNullableNumber(row.municipio_expedicion_id)
  });
};

const buildPersonaIdentificationCoreFromHistoryRow = (
  row: PersonaIdentificacionRow
): PersonaIdentificationCore => {
  return buildPersonaIdentificationCore({
    tipo_documento_id: toRequiredNumber(row.tipo_documento_id),
    numero_documento: row.numero_documento,
    fecha_expedicion_documento: formatDateValue(row.fecha_expedicion_documento),
    municipio_expedicion_id: toNullableNumber(row.municipio_expedicion_id)
  });
};

const getPersonaRowById = async (
  client: PoolClient,
  personaId: string
): Promise<PersonaRow | null> => {
  const result = await client.query<PersonaRow>(
    `
      ${getPersonaSelect()}
      WHERE p.id::text = $1
      LIMIT 1
    `,
    [personaId]
  );

  return result.rows[0] ?? null;
};

const getPersonaIdentificationById = async (
  client: PoolClient,
  identificationId: number
): Promise<PersonaIdentificacionRow | null> => {
  const result = await client.query<PersonaIdentificacionRow>(
    `
      ${getPersonaIdentificationSelect()}
      WHERE pi.id = $1::bigint
      LIMIT 1
    `,
    [identificationId]
  );

  return result.rows[0] ?? null;
};

const getCurrentPersonaIdentificationRow = async (
  client: PoolClient,
  personaId: string
): Promise<PersonaIdentificacionRow | null> => {
  const result = await client.query<PersonaIdentificacionRow>(
    `
      ${getPersonaIdentificationSelect()}
      WHERE pi.persona_id::text = $1
        AND pi.es_vigente = TRUE
      LIMIT 1
    `,
    [personaId]
  );

  return result.rows[0] ?? null;
};

const ensureNumeroDocumentoAvailable = async (
  client: PoolClient,
  numeroDocumento: string,
  excludedPersonaId?: string
): Promise<void> => {
  const params: unknown[] = [numeroDocumento.trim()];
  let query = `
    SELECT pi.persona_id::text AS persona_id
    FROM persona_identificaciones pi
    WHERE pi.numero_documento = $1
      AND pi.es_vigente = TRUE
  `;

  if (excludedPersonaId) {
    params.push(excludedPersonaId);
    query += ` AND pi.persona_id::text <> $${params.length}`;
  }

  query += ' LIMIT 1';

  const result = await client.query<{ persona_id: string }>(query, params);

  if ((result.rowCount ?? 0) > 0) {
    throw new AppError(
      'A person with this document number already exists',
      409,
      'PERSONA_DUPLICATE_DOCUMENT'
    );
  }
};

const syncPersonaCurrentIdentification = async (
  client: PoolClient,
  personaId: string,
  identification: PersonaIdentificationCore
): Promise<void> => {
  await client.query(
    `
      UPDATE personas
      SET
        tipo_documento_id = $2::bigint,
        numero_documento = $3,
        fecha_expedicion_documento = $4,
        municipio_expedicion_id = $5::bigint
      WHERE id::text = $1
    `,
    [
      personaId,
      identification.tipo_documento_id,
      identification.numero_documento,
      identification.fecha_expedicion_documento,
      identification.municipio_expedicion_id
    ]
  );
};

const deactivateCurrentPersonaIdentification = async (
  client: PoolClient,
  identificationId: number
): Promise<void> => {
  await client.query(
    `
      UPDATE persona_identificaciones
      SET
        es_vigente = FALSE,
        vigente_hasta = NOW()
      WHERE id = $1::bigint
    `,
    [identificationId]
  );
};

const insertPersonaIdentificationVersion = async (
  client: PoolClient,
  input: {
    actorUserId?: string | null;
    identification: PersonaIdentificationCore;
    motivoCambio: string;
    personaId: string;
    replacesIdentificationId?: number | null;
  }
): Promise<PersonaIdentificacionRow> => {
  const insertResult = await client.query<{ id: string | number }>(
    `
      INSERT INTO persona_identificaciones (
        persona_id,
        tipo_documento_id,
        numero_documento,
        fecha_expedicion_documento,
        municipio_expedicion_id,
        es_vigente,
        motivo_cambio,
        registrado_por_usuario_id,
        registrado_en,
        vigente_desde,
        vigente_hasta,
        reemplaza_identificacion_id
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        $3,
        $4,
        $5::bigint,
        TRUE,
        $6,
        $7::bigint,
        NOW(),
        NOW(),
        NULL,
        $8::bigint
      )
      RETURNING id
    `,
    [
      input.personaId,
      input.identification.tipo_documento_id,
      input.identification.numero_documento,
      input.identification.fecha_expedicion_documento,
      input.identification.municipio_expedicion_id,
      input.motivoCambio,
      input.actorUserId ?? null,
      input.replacesIdentificationId ?? null
    ]
  );

  const identificationId = toRequiredNumber(insertResult.rows[0]?.id ?? 0);
  const createdRow = await getPersonaIdentificationById(client, identificationId);

  if (!createdRow) {
    throw new AppError(
      'Failed to create person identification version',
      500,
      'PERSONA_IDENTIFICATION_CREATION_FAILED'
    );
  }

  return createdRow;
};

const buildNextIdentificationCore = (
  current: PersonaIdentificationCore,
  input: UpdatePersonaInput | CreatePersonaIdentificacionInput
): PersonaIdentificationCore => {
  return buildPersonaIdentificationCore({
    tipo_documento_id: hasOwn(input, 'tipo_documento_id')
      ? input.tipo_documento_id ?? current.tipo_documento_id
      : current.tipo_documento_id,
    numero_documento: hasOwn(input, 'numero_documento')
      ? input.numero_documento ?? current.numero_documento
      : current.numero_documento,
    fecha_expedicion_documento: hasOwn(input, 'fecha_expedicion_documento')
      ? input.fecha_expedicion_documento ?? null
      : current.fecha_expedicion_documento,
    municipio_expedicion_id: hasOwn(input, 'municipio_expedicion_id')
      ? input.municipio_expedicion_id ?? null
      : current.municipio_expedicion_id
  });
};

const updatePersonaBaseFields = async (
  client: PoolClient,
  personaId: string,
  input: UpdatePersonaInput,
  existingPersona: PersonaRow,
  nextIdentification: PersonaIdentificationCore
): Promise<void> => {
  const nextValues = {
    tipo_documento_id: nextIdentification.tipo_documento_id,
    numero_documento: nextIdentification.numero_documento,
    primer_nombre: hasOwn(input, 'primer_nombre')
      ? input.primer_nombre ?? existingPersona.primer_nombre
      : existingPersona.primer_nombre,
    segundo_nombre: hasOwn(input, 'segundo_nombre')
      ? input.segundo_nombre ?? null
      : existingPersona.segundo_nombre,
    primer_apellido: hasOwn(input, 'primer_apellido')
      ? input.primer_apellido ?? existingPersona.primer_apellido
      : existingPersona.primer_apellido,
    segundo_apellido: hasOwn(input, 'segundo_apellido')
      ? input.segundo_apellido ?? null
      : existingPersona.segundo_apellido,
    fecha_nacimiento: hasOwn(input, 'fecha_nacimiento')
      ? input.fecha_nacimiento ?? null
      : formatDateValue(existingPersona.fecha_nacimiento),
    fecha_expedicion_documento: nextIdentification.fecha_expedicion_documento,
    municipio_nacimiento_id: hasOwn(input, 'municipio_nacimiento_id')
      ? input.municipio_nacimiento_id ?? null
      : existingPersona.municipio_nacimiento_id,
    municipio_expedicion_id: nextIdentification.municipio_expedicion_id,
    municipio_residencia_id: hasOwn(input, 'municipio_residencia_id')
      ? input.municipio_residencia_id ?? null
      : existingPersona.municipio_residencia_id,
    sexo_id: hasOwn(input, 'sexo_id') ? input.sexo_id ?? null : existingPersona.sexo_id,
    estado_civil_id: hasOwn(input, 'estado_civil_id')
      ? input.estado_civil_id ?? null
      : existingPersona.estado_civil_id,
    tipo_sangre_id: hasOwn(input, 'tipo_sangre_id')
      ? input.tipo_sangre_id ?? null
      : existingPersona.tipo_sangre_id,
    estatura: hasOwn(input, 'estatura') ? input.estatura ?? null : existingPersona.estatura,
    telefono: hasOwn(input, 'telefono') ? input.telefono ?? null : existingPersona.telefono,
    correo: hasOwn(input, 'correo') ? input.correo ?? null : existingPersona.correo,
    direccion: hasOwn(input, 'direccion') ? input.direccion ?? null : existingPersona.direccion,
    barrio: hasOwn(input, 'barrio') ? input.barrio ?? null : existingPersona.barrio,
    zona_id: hasOwn(input, 'zona_id') ? input.zona_id ?? null : existingPersona.zona_id,
    pais_nacimiento: hasOwn(input, 'pais_nacimiento')
      ? input.pais_nacimiento ?? null
      : existingPersona.pais_nacimiento,
    nacimiento_extranjero: hasOwn(input, 'nacimiento_extranjero')
      ? input.nacimiento_extranjero ?? false
      : existingPersona.nacimiento_extranjero,
    ciudad_nacimiento_extranjero: hasOwn(input, 'ciudad_nacimiento_extranjero')
      ? input.ciudad_nacimiento_extranjero ?? null
      : existingPersona.ciudad_nacimiento_extranjero
  };

  await client.query(
    `
      UPDATE personas
      SET
        tipo_documento_id = $2::bigint,
        numero_documento = $3,
        primer_nombre = $4,
        segundo_nombre = $5,
        primer_apellido = $6,
        segundo_apellido = $7,
        fecha_nacimiento = $8,
        fecha_expedicion_documento = $9,
        municipio_nacimiento_id = $10::bigint,
        municipio_expedicion_id = $11::bigint,
        municipio_residencia_id = $12::bigint,
        sexo_id = $13::bigint,
        estado_civil_id = $14::bigint,
        tipo_sangre_id = $15::bigint,
        estatura = $16,
        telefono = $17,
        correo = $18,
        direccion = $19,
        barrio = $20,
        zona_id = $21::bigint,
        pais_nacimiento = $22,
        nacimiento_extranjero = $23,
        ciudad_nacimiento_extranjero = $24
      WHERE id::text = $1
    `,
    [
      personaId,
      nextValues.tipo_documento_id,
      nextValues.numero_documento,
      nextValues.primer_nombre,
      nextValues.segundo_nombre,
      nextValues.primer_apellido,
      nextValues.segundo_apellido,
      nextValues.fecha_nacimiento,
      nextValues.fecha_expedicion_documento,
      nextValues.municipio_nacimiento_id,
      nextValues.municipio_expedicion_id,
      nextValues.municipio_residencia_id,
      nextValues.sexo_id,
      nextValues.estado_civil_id,
      nextValues.tipo_sangre_id,
      nextValues.estatura,
      nextValues.telefono,
      nextValues.correo,
      nextValues.direccion,
      nextValues.barrio,
      nextValues.zona_id,
      nextValues.pais_nacimiento,
      nextValues.nacimiento_extranjero,
      nextValues.ciudad_nacimiento_extranjero
    ]
  );
};

const buildMutationAuditMeta = (context?: PersonaMutationContext): AuditRequestMeta => {
  return {
    ip: context?.auditMeta?.ip ?? null,
    user_agent: context?.auditMeta?.user_agent ?? null
  };
};

const appendPersonaTenantScope = (
  conditions: string[],
  params: unknown[],
  tenant?: TenantAccessContext
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM vinculaciones v
        WHERE v.persona_id = p.id
          AND v.contrato_id = ANY($${params.length}::bigint[])
      )
    `);
    return;
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM vinculaciones v
        INNER JOIN contratos c ON c.id = v.contrato_id
        WHERE v.persona_id = p.id
          AND c.empresa_id = ANY($${params.length}::bigint[])
      )
    `);
    return;
  }

  conditions.push('1 = 0');
};

const upsertPersonaContactoEmergencia = async (
  client: PoolClient,
  personaId: string,
  input: Exclude<UpdatePersonaInput['contacto_emergencia'], undefined>
): Promise<{ after: PersonaContactoEmergencia | null; before: PersonaContactoEmergencia | null }> => {
  const currentRow = await getPersonaContactoEmergenciaByPersonaId(client, personaId);
  const before = mapPersonaContactoEmergencia(currentRow);
  if (input === null) {
    if (currentRow) {
      await client.query(
        `
          UPDATE persona_contactos_emergencia
          SET activo = FALSE
          WHERE id = $1::bigint
        `,
        [currentRow.id]
      );
    }

    return { before, after: null };
  }

  const hasMeaningfulData = Boolean(
    input.nombre_contacto || input.parentesco || input.telefono || input.direccion
  );

  if (!hasMeaningfulData || input.activo === false) {
    if (currentRow) {
      await client.query(
        `
          UPDATE persona_contactos_emergencia
          SET activo = FALSE
          WHERE id = $1::bigint
        `,
        [currentRow.id]
      );
    }

    return { before, after: null };
  }

  if (currentRow) {
    await client.query(
      `
        UPDATE persona_contactos_emergencia
        SET
          nombre_contacto = $2,
          parentesco = $3,
          telefono = $4,
          direccion = $5,
          activo = TRUE
        WHERE id = $1::bigint
      `,
      [
        currentRow.id,
        input.nombre_contacto ?? '',
        input.parentesco ?? null,
        input.telefono ?? null,
        input.direccion ?? null
      ]
    );
  } else {
    await client.query(
      `
        INSERT INTO persona_contactos_emergencia (
          persona_id,
          nombre_contacto,
          parentesco,
          telefono,
          direccion,
          activo
        )
        VALUES ($1::bigint, $2, $3, $4, $5, TRUE)
      `,
      [
        personaId,
        input.nombre_contacto ?? '',
        input.parentesco ?? null,
        input.telefono ?? null,
        input.direccion ?? null
      ]
    );
  }

  const after = mapPersonaContactoEmergencia(await getPersonaContactoEmergenciaByPersonaId(client, personaId));
  return { before, after };
};

const upsertPersonaPerfilDemografico = async (
  client: PoolClient,
  personaId: string,
  input: Exclude<UpdatePersonaInput['perfil_demografico'], undefined>
): Promise<{ after: PersonaPerfilDemografico | null; before: PersonaPerfilDemografico | null }> => {
  const currentRow = await getPersonaPerfilDemograficoByPersonaId(client, personaId);
  const before = mapPersonaPerfilDemografico(currentRow);
  if (input === null) {
    return { before, after: before };
  }

  const hasMeaningfulData = Boolean(input.nacionalidad || input.nivel_escolaridad);

  if (!hasMeaningfulData) {
    return { before, after: before };
  }

  if (currentRow) {
    await client.query(
      `
        UPDATE sst_perfil_demografico
        SET
          nacionalidad = $2,
          nivel_escolaridad = $3,
          activo = TRUE,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [currentRow.id, input.nacionalidad ?? null, input.nivel_escolaridad ?? null]
    );
  } else {
    await client.query(
      `
        INSERT INTO sst_perfil_demografico (
          persona_id,
          nacionalidad,
          nivel_escolaridad,
          activo,
          updated_at
        )
        VALUES ($1::bigint, $2, $3, TRUE, NOW())
      `,
      [personaId, input.nacionalidad ?? null, input.nivel_escolaridad ?? null]
    );
  }

  const after = mapPersonaPerfilDemografico(await getPersonaPerfilDemograficoByPersonaId(client, personaId));
  return { before, after };
};

export const listPersonas = async (
  filters: ListPersonasQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedPersonas> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendPersonaTenantScope(conditions, params, tenant);

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const searchParam = `$${params.length}`;
    conditions.push(`
      (
        p.numero_documento ILIKE ${searchParam}
        OR p.primer_nombre ILIKE ${searchParam}
        OR COALESCE(p.segundo_nombre, '') ILIKE ${searchParam}
        OR p.primer_apellido ILIKE ${searchParam}
        OR COALESCE(p.segundo_apellido, '') ILIKE ${searchParam}
        OR COALESCE(p.correo, '') ILIKE ${searchParam}
        OR COALESCE(p.telefono, '') ILIKE ${searchParam}
      )
    `);
  }

  if (filters.numero_documento) {
    params.push(filters.numero_documento);
    conditions.push(`p.numero_documento = $${params.length}`);
  }

  if (filters.municipio_residencia_id) {
    params.push(filters.municipio_residencia_id);
    conditions.push(`p.municipio_residencia_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM personas p
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<PersonaRow>(
    `
      ${getPersonaSelect()}
      ${whereClause}
      ORDER BY p.primer_apellido ASC, p.primer_nombre ASC, p.numero_documento ASC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapPersona),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getPersonaById = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<Persona | null> => {
  const client = await dbPool.connect();

  try {
    await assertTenantAccessForPersonaId(tenant, personaId);

    const result = await client.query<PersonaRow>(
      `
        ${getPersonaSelect()}
        WHERE p.id::text = $1
        LIMIT 1
      `,
      [personaId]
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return enrichPersonaWithProfile(client, mapPersona(row));
  } finally {
    client.release();
  }
};

export const getPersonaByNumeroDocumento = async (
  numeroDocumento: string,
  tenant?: TenantAccessContext
): Promise<Persona | null> => {
  const result = await dbQuery<PersonaRow>(
    `
      ${getPersonaSelect()}
      WHERE p.numero_documento = $1
      LIMIT 1
    `,
    [numeroDocumento.trim()]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await assertTenantAccessForPersonaId(tenant, row.id);

  return mapPersona(row);
};

export const listPersonaIdentificaciones = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<PersonaIdentificacion[]> => {
  const client = await dbPool.connect();

  try {
    await assertTenantAccessForPersonaId(tenant, personaId);

    const existingPersona = await getPersonaRowById(client, personaId);

    if (!existingPersona) {
      throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
    }

    const result = await client.query<PersonaIdentificacionRow>(
      `
        ${getPersonaIdentificationSelect()}
        WHERE pi.persona_id::text = $1
        ORDER BY pi.es_vigente DESC, pi.vigente_desde DESC, pi.id DESC
      `,
      [personaId]
    );

    return result.rows.map(mapPersonaIdentificacion);
  } finally {
    client.release();
  }
};

export const createPersona = async (
  input: CreatePersonaInput,
  context?: PersonaMutationContext
): Promise<Persona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const identificationCore = buildPersonaIdentificationCore({
      tipo_documento_id: input.tipo_documento_id,
      numero_documento: input.numero_documento,
      fecha_expedicion_documento: input.fecha_expedicion_documento,
      municipio_expedicion_id: input.municipio_expedicion_id
    });

    await ensureNumeroDocumentoAvailable(client, identificationCore.numero_documento);

    const result = await client.query<{ id: string | number }>(
      `
        INSERT INTO personas (
          tipo_documento_id,
          numero_documento,
          primer_nombre,
          segundo_nombre,
          primer_apellido,
          segundo_apellido,
          fecha_nacimiento,
          fecha_expedicion_documento,
          municipio_nacimiento_id,
          municipio_expedicion_id,
          municipio_residencia_id,
          sexo_id,
          estado_civil_id,
          tipo_sangre_id,
          estatura,
          telefono,
          correo,
          direccion,
          barrio,
          zona_id,
          pais_nacimiento,
          nacimiento_extranjero,
          ciudad_nacimiento_extranjero
        )
        VALUES (
          $1::bigint, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10::bigint,
          $11::bigint, $12::bigint, $13::bigint, $14::bigint, $15, $16, $17, $18, $19, $20::bigint, $21, $22, $23
        )
        RETURNING id
      `,
      [
        identificationCore.tipo_documento_id,
        identificationCore.numero_documento,
        input.primer_nombre,
        input.segundo_nombre,
        input.primer_apellido,
        input.segundo_apellido,
        input.fecha_nacimiento,
        identificationCore.fecha_expedicion_documento,
        input.municipio_nacimiento_id,
        identificationCore.municipio_expedicion_id,
        input.municipio_residencia_id,
        input.sexo_id,
        input.estado_civil_id,
        input.tipo_sangre_id,
        input.estatura,
        input.telefono,
        input.correo,
        input.direccion,
        input.barrio,
        input.zona_id,
        input.pais_nacimiento,
        input.nacimiento_extranjero,
        input.ciudad_nacimiento_extranjero
      ]
    );

    const personaId = String(result.rows[0]?.id ?? '');

    if (!personaId) {
      throw new AppError('Failed to create persona', 500, 'PERSONA_CREATION_FAILED');
    }

    const createdIdentification = await insertPersonaIdentificationVersion(client, {
      personaId,
      identification: identificationCore,
      motivoCambio: input.motivo_cambio_identificacion ?? 'REGISTRO_INICIAL_IDENTIFICACION',
      actorUserId: context?.actorUserId ?? null,
      replacesIdentificationId: null
    });

    const createdPersonaRow = await getPersonaRowById(client, personaId);

    if (!createdPersonaRow) {
      throw new AppError('Failed to create persona', 500, 'PERSONA_CREATION_FAILED');
    }

    const createdPersona = mapPersona(createdPersonaRow);
    const auditMeta = buildMutationAuditMeta(context);

    await registerAuditEntry({
      accion: 'CREAR_PERSONA',
      after: createdPersona,
      client,
      descripcion: 'Creacion de persona',
      registro_id: String(createdPersona.id),
      tabla: 'personas',
      usuario_id: context?.actorUserId ?? null,
      ...auditMeta
    });

    await registerAuditEntry({
      accion: 'CREAR_PERSONA_IDENTIFICACION',
      after: mapPersonaIdentificacion(createdIdentification),
      client,
      descripcion: 'Creacion de identificacion vigente de persona',
      registro_id: String(createdIdentification.id),
      tabla: 'persona_identificaciones',
      usuario_id: context?.actorUserId ?? null,
      ...auditMeta
    });

    await client.query('COMMIT');
    return createdPersona;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updatePersona = async (
  personaId: string,
  input: UpdatePersonaInput,
  context?: PersonaMutationContext,
  tenant?: TenantAccessContext
): Promise<Persona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const existingPersona = await getPersonaRowById(client, personaId);

    if (!existingPersona) {
      throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
    }

    await assertTenantAccessForPersonaId(tenant, personaId);

    const currentIdentificationRow = await getCurrentPersonaIdentificationRow(client, personaId);
    const currentIdentificationCore = currentIdentificationRow
      ? buildPersonaIdentificationCoreFromHistoryRow(currentIdentificationRow)
      : buildPersonaIdentificationCoreFromPersonaRow(existingPersona);

    const identificationFieldsWereProvided = [
      hasOwn(input, 'tipo_documento_id'),
      hasOwn(input, 'numero_documento'),
      hasOwn(input, 'fecha_expedicion_documento'),
      hasOwn(input, 'municipio_expedicion_id')
    ].some(Boolean);

    const nextIdentificationCore = buildNextIdentificationCore(currentIdentificationCore, input);
    const shouldRotateIdentification = currentIdentificationRow === null
      ? true
      : identificationFieldsWereProvided && hasPersonaIdentificationChanged(currentIdentificationCore, nextIdentificationCore);

    if (shouldRotateIdentification) {
      await ensureNumeroDocumentoAvailable(client, nextIdentificationCore.numero_documento, personaId);
    }

    await updatePersonaBaseFields(client, personaId, input, existingPersona, nextIdentificationCore);

    let createdIdentification: PersonaIdentificacion | null = null;

    if (shouldRotateIdentification) {
      if (currentIdentificationRow) {
        await deactivateCurrentPersonaIdentification(client, toRequiredNumber(currentIdentificationRow.id));
      }

      const insertedIdentification = await insertPersonaIdentificationVersion(client, {
        personaId,
        identification: nextIdentificationCore,
        motivoCambio: input.motivo_cambio_identificacion
          ?? (currentIdentificationRow ? 'ACTUALIZACION_IDENTIFICACION_VIGENTE' : 'RECONSTRUCCION_IDENTIFICACION_VIGENTE'),
        actorUserId: context?.actorUserId ?? null,
        replacesIdentificationId: currentIdentificationRow ? toRequiredNumber(currentIdentificationRow.id) : null
      });

      createdIdentification = mapPersonaIdentificacion(insertedIdentification);
      await syncPersonaCurrentIdentification(client, personaId, nextIdentificationCore);
    }

    const contactoEmergenciaAudit =
      input.contacto_emergencia !== undefined
        ? await upsertPersonaContactoEmergencia(client, personaId, input.contacto_emergencia)
        : null;
    const perfilDemograficoAudit =
      input.perfil_demografico !== undefined
        ? await upsertPersonaPerfilDemografico(client, personaId, input.perfil_demografico)
        : null;

    const updatedPersonaRow = await getPersonaRowById(client, personaId);

    if (!updatedPersonaRow) {
      throw new AppError('Failed to update persona', 500, 'PERSONA_UPDATE_FAILED');
    }

    const updatedPersona = await enrichPersonaWithProfile(client, mapPersona(updatedPersonaRow));
    const auditMeta = buildMutationAuditMeta(context);

    await registerAuditEntry({
      accion: 'ACTUALIZAR_PERSONA',
      after: updatedPersona,
      before: mapPersona(existingPersona),
      client,
      descripcion: 'Actualizacion de persona',
      registro_id: String(updatedPersona.id),
      tabla: 'personas',
      usuario_id: context?.actorUserId ?? null,
      ...auditMeta
    });

    if (createdIdentification) {
      await registerAuditEntry({
        accion: 'ACTUALIZAR_PERSONA_IDENTIFICACION_VIGENTE',
        after: createdIdentification,
        before: currentIdentificationRow ? mapPersonaIdentificacion(currentIdentificationRow) : null,
        client,
        descripcion: 'Cambio de identificacion vigente de persona',
        registro_id: String(createdIdentification.id),
        tabla: 'persona_identificaciones',
        usuario_id: context?.actorUserId ?? null,
        ...auditMeta
      });
    }

    if (contactoEmergenciaAudit) {
      await registerAuditEntry({
        accion: 'ACTUALIZAR_CONTACTO_EMERGENCIA_PERSONA',
        after: contactoEmergenciaAudit.after,
        before: contactoEmergenciaAudit.before,
        client,
        descripcion: 'Actualizacion de contacto de emergencia de persona',
        registro_id: contactoEmergenciaAudit.after
          ? String(contactoEmergenciaAudit.after.id)
          : `${personaId}:contacto_emergencia`,
        tabla: 'persona_contactos_emergencia',
        usuario_id: context?.actorUserId ?? null,
        ...auditMeta
      });
    }

    if (perfilDemograficoAudit) {
      await registerAuditEntry({
        accion: 'ACTUALIZAR_PERFIL_DEMOGRAFICO_PERSONA',
        after: perfilDemograficoAudit.after,
        before: perfilDemograficoAudit.before,
        client,
        descripcion: 'Actualizacion de perfil demografico de persona',
        registro_id: perfilDemograficoAudit.after
          ? String(perfilDemograficoAudit.after.id)
          : `${personaId}:perfil_demografico`,
        tabla: 'sst_perfil_demografico',
        usuario_id: context?.actorUserId ?? null,
        ...auditMeta
      });
    }

    await client.query('COMMIT');
    return updatedPersona;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createPersonaIdentificacion = async (
  personaId: string,
  input: CreatePersonaIdentificacionInput,
  context?: PersonaMutationContext,
  tenant?: TenantAccessContext
): Promise<PersonaIdentificacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const existingPersona = await getPersonaRowById(client, personaId);

    if (!existingPersona) {
      throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
    }

    await assertTenantAccessForPersonaId(tenant, personaId);

    const currentIdentificationRow = await getCurrentPersonaIdentificationRow(client, personaId);
    const currentIdentificationCore = currentIdentificationRow
      ? buildPersonaIdentificationCoreFromHistoryRow(currentIdentificationRow)
      : buildPersonaIdentificationCoreFromPersonaRow(existingPersona);
    const nextIdentificationCore = buildNextIdentificationCore(currentIdentificationCore, input);

    if (currentIdentificationRow && !hasPersonaIdentificationChanged(currentIdentificationCore, nextIdentificationCore)) {
      throw new AppError(
        'The provided identification already matches the current one',
        409,
        'PERSONA_IDENTIFICATION_ALREADY_CURRENT'
      );
    }

    await ensureNumeroDocumentoAvailable(client, nextIdentificationCore.numero_documento, personaId);

    if (currentIdentificationRow) {
      await deactivateCurrentPersonaIdentification(client, toRequiredNumber(currentIdentificationRow.id));
    }

    const createdIdentificationRow = await insertPersonaIdentificationVersion(client, {
      personaId,
      identification: nextIdentificationCore,
      motivoCambio: input.motivo_cambio,
      actorUserId: context?.actorUserId ?? null,
      replacesIdentificationId: currentIdentificationRow ? toRequiredNumber(currentIdentificationRow.id) : null
    });

    await syncPersonaCurrentIdentification(client, personaId, nextIdentificationCore);

    const refreshedPersonaRow = await getPersonaRowById(client, personaId);

    if (!refreshedPersonaRow) {
      throw new AppError('Failed to refresh persona after identification update', 500, 'PERSONA_UPDATE_FAILED');
    }

    const createdIdentification = mapPersonaIdentificacion(createdIdentificationRow);
    const auditMeta = buildMutationAuditMeta(context);

    await registerAuditEntry({
      accion: 'ACTUALIZAR_PERSONA_IDENTIFICACION_VIGENTE',
      after: createdIdentification,
      before: currentIdentificationRow ? mapPersonaIdentificacion(currentIdentificationRow) : null,
      client,
      descripcion: 'Cambio de identificacion vigente de persona',
      registro_id: String(createdIdentification.id),
      tabla: 'persona_identificaciones',
      usuario_id: context?.actorUserId ?? null,
      ...auditMeta
    });

    await registerAuditEntry({
      accion: 'ACTUALIZAR_PERSONA',
      after: mapPersona(refreshedPersonaRow),
      before: mapPersona(existingPersona),
      client,
      descripcion: 'Sincronizacion de persona con identificacion vigente',
      registro_id: personaId,
      tabla: 'personas',
      usuario_id: context?.actorUserId ?? null,
      ...auditMeta
    });

    await client.query('COMMIT');
    return createdIdentification;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

