import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import {
  CreatePersonaInput,
  ListPersonasQuery,
  UpdatePersonaInput
} from './personas.schemas';

interface PersonaRow extends QueryResultRow {
  barrio: string | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: string | number | null;
  estatura: string | number | null;
  fecha_expedicion_documento: string | null;
  fecha_nacimiento: string | null;
  id: string | number;
  municipio_expedicion_id: string | number | null;
  municipio_nacimiento_id: string | number | null;
  municipio_residencia_id: string | number | null;
  numero_documento: string;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  nacimiento_extranjero: boolean | null;
  pais_nacimiento: string | null;
  sexo_id: string | number | null;
  telefono: string | null;
  tipo_documento_id: string | number;
  tipo_sangre_id: string | number | null;
  zona_id: string | number | null;
  ciudad_nacimiento_extranjero: string | null;
}

interface CountRow extends QueryResultRow {
  total: number;
}

export interface Persona {
  barrio: string | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: number | null;
  estatura: number | null;
  fecha_expedicion_documento: string | null;
  fecha_nacimiento: string | null;
  id: number;
  municipio_expedicion_id: number | null;
  municipio_nacimiento_id: number | null;
  municipio_residencia_id: number | null;
  numero_documento: string;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  nacimiento_extranjero: boolean;
  pais_nacimiento: string | null;
  sexo_id: number | null;
  telefono: string | null;
  tipo_documento_id: number;
  tipo_sangre_id: number | null;
  zona_id: number | null;
  ciudad_nacimiento_extranjero: string | null;
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

const formatDateValue = (value: string | null): string | null => {
  return value ?? null;
};

const mapPersona = (row: PersonaRow): Persona => {
  return {
    id: toRequiredNumber(row.id),
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
    ciudad_nacimiento_extranjero: row.ciudad_nacimiento_extranjero
  };
};

const getPersonaSelect = (): string => {
  return `
    SELECT
      p.id::text AS id,
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
      p.ciudad_nacimiento_extranjero
    FROM personas p
  `;
};

const ensureNumeroDocumentoAvailable = async (
  client: PoolClient,
  numeroDocumento: string,
  excludedPersonaId?: string
): Promise<void> => {
  const params: unknown[] = [numeroDocumento];
  let query = 'SELECT id::text AS id FROM personas WHERE numero_documento = $1';

  if (excludedPersonaId) {
    query += ' AND id::text <> $2';
    params.push(excludedPersonaId);
  }

  query += ' LIMIT 1';

  const result = await client.query<{ id: string }>(query, params);

  if ((result.rowCount ?? 0) > 0) {
    throw new AppError(
      'A person with this document number already exists',
      409,
      'PERSONA_DUPLICATE_DOCUMENT'
    );
  }
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

export const listPersonas = async (
  filters: ListPersonasQuery
): Promise<PaginatedPersonas> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

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

export const getPersonaById = async (personaId: string): Promise<Persona | null> => {
  const result = await dbQuery<PersonaRow>(
    `
      ${getPersonaSelect()}
      WHERE p.id::text = $1
      LIMIT 1
    `,
    [personaId]
  );

  const row = result.rows[0];
  return row ? mapPersona(row) : null;
};

export const getPersonaByNumeroDocumento = async (
  numeroDocumento: string
): Promise<Persona | null> => {
  const result = await dbQuery<PersonaRow>(
    `
      ${getPersonaSelect()}
      WHERE p.numero_documento = $1
      LIMIT 1
    `,
    [numeroDocumento]
  );

  const row = result.rows[0];
  return row ? mapPersona(row) : null;
};

export const createPersona = async (input: CreatePersonaInput): Promise<Persona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureNumeroDocumentoAvailable(client, input.numero_documento);

    const result = await client.query<PersonaRow>(
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING
          id,
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
      `,
      [
        input.tipo_documento_id,
        input.numero_documento,
        input.primer_nombre,
        input.segundo_nombre,
        input.primer_apellido,
        input.segundo_apellido,
        input.fecha_nacimiento,
        input.fecha_expedicion_documento,
        input.municipio_nacimiento_id,
        input.municipio_expedicion_id,
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

    await client.query('COMMIT');

    const createdPersona = result.rows[0];

    if (!createdPersona) {
      throw new AppError('Failed to create persona', 500, 'PERSONA_CREATION_FAILED');
    }

    return mapPersona(createdPersona);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updatePersona = async (
  personaId: string,
  input: UpdatePersonaInput
): Promise<Persona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const existingPersona = await getPersonaRowById(client, personaId);

    if (!existingPersona) {
      throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
    }

    if (input.numero_documento) {
      await ensureNumeroDocumentoAvailable(client, input.numero_documento, personaId);
    }

    const nextValues = {
      tipo_documento_id: hasOwn(input, 'tipo_documento_id')
        ? input.tipo_documento_id ?? existingPersona.tipo_documento_id
        : existingPersona.tipo_documento_id,
      numero_documento: hasOwn(input, 'numero_documento')
        ? input.numero_documento ?? existingPersona.numero_documento
        : existingPersona.numero_documento,
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
      fecha_expedicion_documento: hasOwn(input, 'fecha_expedicion_documento')
        ? input.fecha_expedicion_documento ?? null
        : formatDateValue(existingPersona.fecha_expedicion_documento),
      municipio_nacimiento_id: hasOwn(input, 'municipio_nacimiento_id')
        ? input.municipio_nacimiento_id ?? null
        : existingPersona.municipio_nacimiento_id,
      municipio_expedicion_id: hasOwn(input, 'municipio_expedicion_id')
        ? input.municipio_expedicion_id ?? null
        : existingPersona.municipio_expedicion_id,
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

    const result = await client.query<PersonaRow>(
      `
        UPDATE personas
        SET
          tipo_documento_id = $2,
          numero_documento = $3,
          primer_nombre = $4,
          segundo_nombre = $5,
          primer_apellido = $6,
          segundo_apellido = $7,
          fecha_nacimiento = $8,
          fecha_expedicion_documento = $9,
          municipio_nacimiento_id = $10,
          municipio_expedicion_id = $11,
          municipio_residencia_id = $12,
          sexo_id = $13,
          estado_civil_id = $14,
          tipo_sangre_id = $15,
          estatura = $16,
          telefono = $17,
          correo = $18,
          direccion = $19,
          barrio = $20,
          zona_id = $21,
          pais_nacimiento = $22,
          nacimiento_extranjero = $23,
          ciudad_nacimiento_extranjero = $24
        WHERE id::text = $1
        RETURNING
          id,
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

    await client.query('COMMIT');

    const updatedPersona = result.rows[0];

    if (!updatedPersona) {
      throw new AppError('Failed to update persona', 500, 'PERSONA_UPDATE_FAILED');
    }

    return mapPersona(updatedPersona);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
