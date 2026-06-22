import { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  ImportPersonaPayload,
  ImportacionLoteEstado,
  ImportVinculacionPayload,
  ListImportacionLotesQuery
} from './importaciones.schemas';
import { mapExcelRows } from './importaciones.mapper';
import { validateMappedImportRow } from './importaciones.validator';

interface ImportacionLoteRow extends QueryResultRow {
  archivo_nombre: string;
  cancelado_at: Date | null;
  cancelado_por: string | null;
  confirmed_at: Date | null;
  confirmed_by: string | null;
  created_at: Date;
  created_by: string;
  estado: ImportacionLoteEstado;
  filas_con_error: number;
  filas_validas: number;
  id: string;
  metadata: Record<string, unknown> | null;
  resumen: Record<string, unknown> | null;
  tipo: string;
  total_filas: number;
  updated_at: Date;
}

interface ImportacionErrorRow extends QueryResultRow {
  campo: string;
  codigo: string;
  created_at: Date;
  fila_numero: number;
  id: string;
  mensaje: string;
  staging_id: string | null;
  staging_tipo: string;
}

interface StagingPersonaRow extends QueryResultRow {
  activo: boolean | null;
  barrio: string | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: string | null;
  estatura: number | null;
  fecha_expedicion_documento: Date | string | null;
  fecha_nacimiento: Date | string | null;
  fila_numero: number;
  id: string;
  lote_id: string;
  municipio_expedicion_id: string | null;
  municipio_nacimiento_id: string | null;
  municipio_residencia_id: string | null;
  numero_documento: string;
  persona_id: string | null;
  primer_apellido: string;
  primer_nombre: string;
  procesado: boolean;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo_id: string | null;
  telefono: string | null;
  tipo_documento_id: string;
  tipo_sangre_id: string | null;
  zona_id: string | null;
}

interface StagingVinculacionRow extends QueryResultRow {
  contrato_cargo_id: string;
  contrato_id: string;
  empresa_id: string;
  estado: string;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  fila_numero: number;
  id: string;
  lote_id: string;
  numero_documento: string;
  observaciones: string | null;
  persona_id: string | null;
  procesado: boolean;
  vinculacion_id: string | null;
}

interface PersonaLookupRow extends QueryResultRow {
  activo: boolean;
  barrio: string | null;
  correo: string | null;
  created_at: Date;
  direccion: string | null;
  estado_civil_id: string | null;
  estatura: number | null;
  fecha_expedicion_documento: Date | string | null;
  fecha_nacimiento: Date | string | null;
  id: string;
  municipio_expedicion_id: string | null;
  municipio_nacimiento_id: string | null;
  municipio_residencia_id: string | null;
  numero_documento: string;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo_id: string | null;
  telefono: string | null;
  tipo_documento_id: string;
  tipo_sangre_id: string | null;
  updated_at: Date;
  zona_id: string | null;
}

interface ActiveVinculacionRow extends QueryResultRow {
  id: string;
}

interface VinculacionInsertRow extends QueryResultRow {
  id: string;
}

interface CountRow extends QueryResultRow {
  total: number;
}

export interface ImportacionLote {
  archivo_nombre: string;
  cancelado_at: string | null;
  cancelado_por: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  created_by: string;
  estado: ImportacionLoteEstado;
  filas_con_error: number;
  filas_validas: number;
  id: string;
  metadata: Record<string, unknown> | null;
  resumen: Record<string, unknown> | null;
  tipo: string;
  total_filas: number;
  updated_at: string;
}

export interface ImportacionLoteDetalle extends ImportacionLote {
  pendientes_confirmacion: number;
}

export interface ImportacionError {
  campo: string;
  codigo: string;
  created_at: string;
  fila_numero: number;
  id: string;
  mensaje: string;
  staging_id: string | null;
  staging_tipo: string;
}

export interface PaginatedImportacionLotes {
  items: ImportacionLote[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface UploadImportacionResult {
  lote: ImportacionLote;
  resumen: {
    filas_con_error: number;
    filas_validas: number;
    total_filas: number;
  };
}

export interface ConfirmImportacionResult {
  createdPersonas: number;
  createdVinculaciones: number;
  lote: ImportacionLote;
  skippedActiveVinculaciones: number;
  updatedPersonas: number;
}

const formatDateTime = (value: Date | null): string | null => {
  return value ? value.toISOString() : null;
};

const formatDateOnly = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const mapImportacionLote = (row: ImportacionLoteRow): ImportacionLote => {
  return {
    id: row.id,
    tipo: row.tipo,
    archivo_nombre: row.archivo_nombre,
    estado: row.estado,
    total_filas: row.total_filas,
    filas_validas: row.filas_validas,
    filas_con_error: row.filas_con_error,
    resumen: row.resumen,
    metadata: row.metadata,
    created_by: row.created_by,
    confirmed_by: row.confirmed_by,
    cancelado_por: row.cancelado_por,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    confirmed_at: formatDateTime(row.confirmed_at),
    cancelado_at: formatDateTime(row.cancelado_at)
  };
};

const mapImportacionError = (row: ImportacionErrorRow): ImportacionError => {
  return {
    id: row.id,
    fila_numero: row.fila_numero,
    staging_tipo: row.staging_tipo,
    staging_id: row.staging_id,
    campo: row.campo,
    codigo: row.codigo,
    mensaje: row.mensaje,
    created_at: row.created_at.toISOString()
  };
};

const getActorAuditTrail = (
  currentMetadata: Record<string, unknown> | null,
  entry: Record<string, unknown>
): Record<string, unknown> => {
  const currentAuditTrail = Array.isArray(currentMetadata?.audit_trail)
    ? currentMetadata.audit_trail
    : [];

  return {
    ...(currentMetadata ?? {}),
    audit_trail: [...currentAuditTrail, entry]
  };
};

const getImportacionLoteForUpdate = async (
  client: PoolClient,
  loteId: string
): Promise<ImportacionLoteRow | null> => {
  const result = await client.query<ImportacionLoteRow>(
    `
      SELECT
        id::text AS id,
        tipo,
        archivo_nombre,
        estado,
        total_filas,
        filas_validas,
        filas_con_error,
        resumen,
        metadata,
        created_by::text AS created_by,
        confirmed_by::text AS confirmed_by,
        cancelado_por::text AS cancelado_por,
        created_at,
        updated_at,
        confirmed_at,
        cancelado_at
      FROM importacion_lotes
      WHERE id::text = $1
      FOR UPDATE
    `,
    [loteId]
  );

  return result.rows[0] ?? null;
};

const findPersonaByNumeroDocumento = async (
  client: PoolClient,
  numeroDocumento: string
): Promise<PersonaLookupRow | null> => {
  const result = await client.query<PersonaLookupRow>(
    `
      SELECT
        p.id::text AS id,
        p.tipo_documento_id::text AS tipo_documento_id,
        p.numero_documento,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.fecha_nacimiento,
        p.fecha_expedicion_documento,
        p.municipio_nacimiento_id::text AS municipio_nacimiento_id,
        p.municipio_expedicion_id::text AS municipio_expedicion_id,
        p.municipio_residencia_id::text AS municipio_residencia_id,
        p.sexo_id::text AS sexo_id,
        p.estado_civil_id::text AS estado_civil_id,
        p.tipo_sangre_id::text AS tipo_sangre_id,
        p.estatura,
        p.telefono,
        p.correo,
        p.direccion,
        p.barrio,
        p.zona_id::text AS zona_id,
        p.activo,
        p.created_at,
        p.updated_at
      FROM personas p
      WHERE p.numero_documento = $1
      LIMIT 1
    `,
    [numeroDocumento]
  );

  return result.rows[0] ?? null;
};

const createPersonaFromImport = async (
  client: PoolClient,
  payload: ImportPersonaPayload
): Promise<string> => {
  const result = await client.query<{ id: string }>(
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
        activo
      )
      VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::uuid,
        $10::uuid,
        $11::uuid,
        $12::uuid,
        $13::uuid,
        $14::uuid,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20::uuid,
        $21
      )
      RETURNING id::text AS id
    `,
    [
      payload.tipo_documento_id,
      payload.numero_documento,
      payload.primer_nombre,
      payload.segundo_nombre,
      payload.primer_apellido,
      payload.segundo_apellido,
      payload.fecha_nacimiento,
      payload.fecha_expedicion_documento,
      payload.municipio_nacimiento_id,
      payload.municipio_expedicion_id,
      payload.municipio_residencia_id,
      payload.sexo_id,
      payload.estado_civil_id,
      payload.tipo_sangre_id,
      payload.estatura,
      payload.telefono,
      payload.correo,
      payload.direccion,
      payload.barrio,
      payload.zona_id,
      payload.activo ?? true
    ]
  );

  const personaId = result.rows[0]?.id;

  if (!personaId) {
    throw new AppError('Failed to create persona during import', 500, 'IMPORT_PERSONA_CREATE_FAILED');
  }

  return personaId;
};

const updatePersonaFromImport = async (
  client: PoolClient,
  personaId: string,
  payload: ImportPersonaPayload
): Promise<void> => {
  await client.query(
    `
      UPDATE personas
      SET
        tipo_documento_id = $2::uuid,
        primer_nombre = $3,
        segundo_nombre = $4,
        primer_apellido = $5,
        segundo_apellido = $6,
        fecha_nacimiento = $7,
        fecha_expedicion_documento = $8,
        municipio_nacimiento_id = $9::uuid,
        municipio_expedicion_id = $10::uuid,
        municipio_residencia_id = $11::uuid,
        sexo_id = $12::uuid,
        estado_civil_id = $13::uuid,
        tipo_sangre_id = $14::uuid,
        estatura = $15,
        telefono = $16,
        correo = $17,
        direccion = $18,
        barrio = $19,
        zona_id = $20::uuid,
        activo = COALESCE($21, activo),
        updated_at = NOW()
      WHERE id::text = $1
    `,
    [
      personaId,
      payload.tipo_documento_id,
      payload.primer_nombre,
      payload.segundo_nombre,
      payload.primer_apellido,
      payload.segundo_apellido,
      payload.fecha_nacimiento,
      payload.fecha_expedicion_documento,
      payload.municipio_nacimiento_id,
      payload.municipio_expedicion_id,
      payload.municipio_residencia_id,
      payload.sexo_id,
      payload.estado_civil_id,
      payload.tipo_sangre_id,
      payload.estatura,
      payload.telefono,
      payload.correo,
      payload.direccion,
      payload.barrio,
      payload.zona_id,
      payload.activo
    ]
  );
};

const findActiveVinculacion = async (
  client: PoolClient,
  personaId: string,
  contratoId: string
): Promise<string | null> => {
  const result = await client.query<ActiveVinculacionRow>(
    `
      SELECT id::text AS id
      FROM vinculaciones
      WHERE persona_id::text = $1
        AND contrato_id::text = $2
        AND estado = 'ACTIVA'
      LIMIT 1
    `,
    [personaId, contratoId]
  );

  return result.rows[0]?.id ?? null;
};

const createVinculacionFromImport = async (
  client: PoolClient,
  payload: {
    actorUserId: string;
    contrato_cargo_id: string;
    contrato_id: string;
    empresa_id: string;
    estado: 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA';
    fecha_fin: string | null;
    fecha_inicio: string;
    observaciones: string | null;
    persona_id: string;
  }
): Promise<string> => {
  const result = await client.query<VinculacionInsertRow>(
    `
      INSERT INTO vinculaciones (
        persona_id,
        empresa_id,
        contrato_id,
        contrato_cargo_id,
        fecha_inicio,
        fecha_fin,
        fecha_retiro,
        fecha_suspension,
        fecha_reactivacion,
        estado,
        observaciones,
        motivo_retiro,
        motivo_suspension
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5,
        $6,
        NULL,
        NULL,
        NULL,
        $7,
        $8,
        NULL,
        NULL
      )
      RETURNING id::text AS id
    `,
    [
      payload.persona_id,
      payload.empresa_id,
      payload.contrato_id,
      payload.contrato_cargo_id,
      payload.fecha_inicio,
      payload.fecha_fin,
      payload.estado,
      payload.observaciones
    ]
  );

  const vinculacionId = result.rows[0]?.id;

  if (!vinculacionId) {
    throw new AppError(
      'Failed to create vinculacion during import',
      500,
      'IMPORT_VINCULACION_CREATE_FAILED'
    );
  }

  await registerAuditEntry({
    usuario_id: payload.actorUserId,
    accion: 'CREATE',
    tabla: 'vinculaciones',
    registro_id: vinculacionId,
    descripcion: 'Creacion de vinculacion por importacion',
    after: {
      id: vinculacionId,
      persona_id: payload.persona_id,
      empresa_id: payload.empresa_id,
      contrato_id: payload.contrato_id,
      contrato_cargo_id: payload.contrato_cargo_id,
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin,
      estado: payload.estado,
      observaciones: payload.observaciones
    }
  });

  return vinculacionId;
};

const loadStagingRowsForConfirmation = async (
  client: PoolClient,
  loteId: string
): Promise<Array<{ persona: StagingPersonaRow; vinculacion: StagingVinculacionRow }>> => {
  const personasResult = await client.query<StagingPersonaRow>(
    `
      SELECT
        id::text AS id,
        lote_id::text AS lote_id,
        fila_numero,
        numero_documento,
        tipo_documento_id::text AS tipo_documento_id,
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido,
        fecha_nacimiento,
        fecha_expedicion_documento,
        municipio_nacimiento_id::text AS municipio_nacimiento_id,
        municipio_expedicion_id::text AS municipio_expedicion_id,
        municipio_residencia_id::text AS municipio_residencia_id,
        sexo_id::text AS sexo_id,
        estado_civil_id::text AS estado_civil_id,
        tipo_sangre_id::text AS tipo_sangre_id,
        estatura,
        telefono,
        correo,
        direccion,
        barrio,
        zona_id::text AS zona_id,
        activo,
        procesado,
        persona_id::text AS persona_id
      FROM importacion_staging_personas
      WHERE lote_id::text = $1
        AND estado_validacion = 'VALIDA'
      ORDER BY fila_numero ASC
    `,
    [loteId]
  );

  const vinculacionesResult = await client.query<StagingVinculacionRow>(
    `
      SELECT
        id::text AS id,
        lote_id::text AS lote_id,
        fila_numero,
        numero_documento,
        empresa_id::text AS empresa_id,
        contrato_id::text AS contrato_id,
        contrato_cargo_id::text AS contrato_cargo_id,
        fecha_inicio,
        fecha_fin,
        estado,
        observaciones,
        procesado,
        persona_id::text AS persona_id,
        vinculacion_id::text AS vinculacion_id
      FROM importacion_staging_vinculaciones
      WHERE lote_id::text = $1
        AND estado_validacion = 'VALIDA'
      ORDER BY fila_numero ASC
    `,
    [loteId]
  );

  const vinculacionesByRow = new Map<number, StagingVinculacionRow>();

  for (const row of vinculacionesResult.rows) {
    vinculacionesByRow.set(row.fila_numero, row);
  }

  return personasResult.rows
    .map((persona) => {
      const vinculacion = vinculacionesByRow.get(persona.fila_numero);
      return vinculacion ? { persona, vinculacion } : null;
    })
    .filter((item): item is { persona: StagingPersonaRow; vinculacion: StagingVinculacionRow } => item !== null);
};

const appendLoteAudit = async (
  client: PoolClient,
  lote: ImportacionLoteRow,
  entry: Record<string, unknown>
): Promise<void> => {
  const nextMetadata = getActorAuditTrail(lote.metadata, entry);

  await client.query(
    `
      UPDATE importacion_lotes
      SET
        metadata = $2::jsonb,
        updated_at = NOW()
      WHERE id::text = $1
    `,
    [lote.id, JSON.stringify(nextMetadata)]
  );
};

export const uploadPersonasVinculacionesExcel = async (
  fileBuffer: Buffer,
  originalFileName: string,
  actorUserId: string
): Promise<UploadImportacionResult> => {
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    cellDates: false
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new AppError('The uploaded Excel file does not contain sheets', 400, 'EMPTY_WORKBOOK');
  }

  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new AppError('The uploaded sheet could not be read', 400, 'INVALID_WORKSHEET');
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: true
  });

  if (rawRows.length === 0) {
    throw new AppError('The uploaded Excel file does not contain rows', 400, 'EMPTY_SHEET');
  }

  const mappedRows = mapExcelRows(rawRows);
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const loteInsertResult = await client.query<{ id: string }>(
      `
        INSERT INTO importacion_lotes (
          tipo,
          archivo_nombre,
          estado,
          total_filas,
          filas_validas,
          filas_con_error,
          resumen,
          metadata,
          created_by
        )
        VALUES (
          'PERSONAS_VINCULACIONES',
          $1,
          'PENDIENTE_CONFIRMACION',
          $2,
          0,
          0,
          $3::jsonb,
          $4::jsonb,
          $5::uuid
        )
        RETURNING id::text AS id
      `,
      [
        originalFileName,
        mappedRows.length,
        JSON.stringify({ total_filas: mappedRows.length }),
        JSON.stringify({
          source_sheet: sheetName,
          audit_trail: [
            {
              action: 'UPLOAD',
              actor_user_id: actorUserId,
              at: new Date().toISOString(),
              file_name: originalFileName
            }
          ]
        }),
        actorUserId
      ]
    );

    const loteId = loteInsertResult.rows[0]?.id;

    if (!loteId) {
      throw new AppError('Failed to create import lote', 500, 'IMPORT_LOTE_CREATE_FAILED');
    }

    let filasValidas = 0;
    let filasConError = 0;

    for (const row of mappedRows) {
      const validation = await validateMappedImportRow(client, row);
      const isValid = validation.errors.length === 0 && validation.persona && validation.vinculacion;

      const personaPayload = validation.persona ?? {
        tipo_documento_id: row.persona.tipo_documento_id ?? '',
        numero_documento: row.persona.numero_documento ?? '',
        primer_nombre: row.persona.primer_nombre ?? '',
        segundo_nombre: row.persona.segundo_nombre ?? null,
        primer_apellido: row.persona.primer_apellido ?? '',
        segundo_apellido: row.persona.segundo_apellido ?? null,
        fecha_nacimiento: row.persona.fecha_nacimiento ?? null,
        fecha_expedicion_documento: row.persona.fecha_expedicion_documento ?? null,
        municipio_nacimiento_id: row.persona.municipio_nacimiento_id ?? null,
        municipio_expedicion_id: row.persona.municipio_expedicion_id ?? null,
        municipio_residencia_id: row.persona.municipio_residencia_id ?? null,
        sexo_id: row.persona.sexo_id ?? null,
        estado_civil_id: row.persona.estado_civil_id ?? null,
        tipo_sangre_id: row.persona.tipo_sangre_id ?? null,
        estatura: row.persona.estatura ? Number(row.persona.estatura) : null,
        telefono: row.persona.telefono ?? null,
        correo: row.persona.correo ?? null,
        direccion: row.persona.direccion ?? null,
        barrio: row.persona.barrio ?? null,
        zona_id: row.persona.zona_id ?? null,
        activo: row.persona.activo === false ? false : true
      };

      const vinculacionPayload = validation.vinculacion ?? {
        empresa_id: row.vinculacion.empresa_id ?? '',
        contrato_id: row.vinculacion.contrato_id ?? '',
        contrato_cargo_id: row.vinculacion.contrato_cargo_id ?? '',
        fecha_inicio: row.vinculacion.fecha_inicio ?? '',
        fecha_fin: row.vinculacion.fecha_fin ?? null,
        estado: row.vinculacion.estado === 'RETIRADA' || row.vinculacion.estado === 'SUSPENDIDA'
          ? row.vinculacion.estado
          : 'ACTIVA',
        observaciones: row.vinculacion.observaciones ?? null
      };

      const personaStageResult = await client.query<{ id: string }>(
        `
          INSERT INTO importacion_staging_personas (
            lote_id,
            fila_numero,
            numero_documento,
            tipo_documento_id,
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
            activo,
            data_cruda,
            estado_validacion,
            procesado
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            NULLIF($4, '')::uuid,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            NULLIF($11, '')::uuid,
            NULLIF($12, '')::uuid,
            NULLIF($13, '')::uuid,
            NULLIF($14, '')::uuid,
            NULLIF($15, '')::uuid,
            NULLIF($16, '')::uuid,
            $17,
            $18,
            $19,
            $20,
            $21,
            NULLIF($22, '')::uuid,
            $23,
            $24::jsonb,
            $25,
            FALSE
          )
          RETURNING id::text AS id
        `,
        [
          loteId,
          row.rowNumber,
          personaPayload.numero_documento,
          personaPayload.tipo_documento_id,
          personaPayload.primer_nombre,
          personaPayload.segundo_nombre,
          personaPayload.primer_apellido,
          personaPayload.segundo_apellido,
          personaPayload.fecha_nacimiento,
          personaPayload.fecha_expedicion_documento,
          personaPayload.municipio_nacimiento_id,
          personaPayload.municipio_expedicion_id,
          personaPayload.municipio_residencia_id,
          personaPayload.sexo_id,
          personaPayload.estado_civil_id,
          personaPayload.tipo_sangre_id,
          personaPayload.estatura,
          personaPayload.telefono,
          personaPayload.correo,
          personaPayload.direccion,
          personaPayload.barrio,
          personaPayload.zona_id,
          personaPayload.activo,
          JSON.stringify(row.rawData),
          isValid ? 'VALIDA' : 'INVALIDA'
        ]
      );

      const personaStageId = personaStageResult.rows[0]?.id ?? null;

      const vinculacionStageResult = await client.query<{ id: string }>(
        `
          INSERT INTO importacion_staging_vinculaciones (
            lote_id,
            fila_numero,
            numero_documento,
            empresa_id,
            contrato_id,
            contrato_cargo_id,
            fecha_inicio,
            fecha_fin,
            estado,
            observaciones,
            data_cruda,
            estado_validacion,
            procesado
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            NULLIF($4, '')::uuid,
            NULLIF($5, '')::uuid,
            NULLIF($6, '')::uuid,
            $7,
            $8,
            $9,
            $10,
            $11::jsonb,
            $12,
            FALSE
          )
          RETURNING id::text AS id
        `,
        [
          loteId,
          row.rowNumber,
          personaPayload.numero_documento,
          vinculacionPayload.empresa_id,
          vinculacionPayload.contrato_id,
          vinculacionPayload.contrato_cargo_id,
          vinculacionPayload.fecha_inicio,
          vinculacionPayload.fecha_fin,
          vinculacionPayload.estado,
          vinculacionPayload.observaciones,
          JSON.stringify(row.rawData),
          isValid ? 'VALIDA' : 'INVALIDA'
        ]
      );

      const vinculacionStageId = vinculacionStageResult.rows[0]?.id ?? null;

      if (isValid) {
        filasValidas += 1;
      } else {
        filasConError += 1;

        for (const error of validation.errors) {
          const stagingTipo = error.field.startsWith('persona.') ? 'PERSONA' : 'VINCULACION';

          await client.query(
            `
              INSERT INTO importacion_errores (
                lote_id,
                fila_numero,
                staging_tipo,
                staging_id,
                campo,
                codigo,
                mensaje,
                data_cruda
              )
              VALUES (
                $1::uuid,
                $2,
                $3,
                $4::uuid,
                $5,
                $6,
                $7,
                $8::jsonb
              )
            `,
            [
              loteId,
              row.rowNumber,
              stagingTipo,
              stagingTipo === 'PERSONA' ? personaStageId : vinculacionStageId,
              error.field,
              error.code,
              error.message,
              JSON.stringify(row.rawData)
            ]
          );
        }
      }
    }

    const estado: ImportacionLoteEstado = filasConError > 0 ? 'CON_ERRORES' : 'PENDIENTE_CONFIRMACION';

    await client.query(
      `
        UPDATE importacion_lotes
        SET
          estado = $2,
          filas_validas = $3,
          filas_con_error = $4,
          resumen = $5::jsonb,
          updated_at = NOW()
        WHERE id::text = $1
      `,
      [
        loteId,
        estado,
        filasValidas,
        filasConError,
        JSON.stringify({
          total_filas: mappedRows.length,
          filas_validas: filasValidas,
          filas_con_error: filasConError
        })
      ]
    );

    const lote = await getImportacionLoteForUpdate(client, loteId);

    if (!lote) {
      throw new AppError('Failed to load import lote', 500, 'IMPORT_LOTE_LOAD_FAILED');
    }

    await client.query('COMMIT');

    return {
      lote: mapImportacionLote(lote),
      resumen: {
        total_filas: mappedRows.length,
        filas_validas: filasValidas,
        filas_con_error: filasConError
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listImportacionLotes = async (
  query: ListImportacionLotesQuery
): Promise<PaginatedImportacionLotes> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.estado) {
    params.push(query.estado);
    conditions.push(`estado = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.limit;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM importacion_lotes
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const listParams = [...params, query.limit, offset];

  const result = await dbQuery<ImportacionLoteRow>(
    `
      SELECT
        id::text AS id,
        tipo,
        archivo_nombre,
        estado,
        total_filas,
        filas_validas,
        filas_con_error,
        resumen,
        metadata,
        created_by::text AS created_by,
        confirmed_by::text AS confirmed_by,
        cancelado_por::text AS cancelado_por,
        created_at,
        updated_at,
        confirmed_at,
        cancelado_at
      FROM importacion_lotes
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapImportacionLote),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
};

export const getImportacionLoteById = async (
  loteId: string
): Promise<ImportacionLoteDetalle | null> => {
  const loteResult = await dbQuery<ImportacionLoteRow>(
    `
      SELECT
        id::text AS id,
        tipo,
        archivo_nombre,
        estado,
        total_filas,
        filas_validas,
        filas_con_error,
        resumen,
        metadata,
        created_by::text AS created_by,
        confirmed_by::text AS confirmed_by,
        cancelado_por::text AS cancelado_por,
        created_at,
        updated_at,
        confirmed_at,
        cancelado_at
      FROM importacion_lotes
      WHERE id::text = $1
      LIMIT 1
    `,
    [loteId]
  );

  const lote = loteResult.rows[0];

  if (!lote) {
    return null;
  }

  const pendientesResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM importacion_staging_personas
      WHERE lote_id::text = $1
        AND estado_validacion = 'VALIDA'
        AND procesado = FALSE
    `,
    [loteId]
  );

  return {
    ...mapImportacionLote(lote),
    pendientes_confirmacion: pendientesResult.rows[0]?.total ?? 0
  };
};

export const getImportacionLoteErrores = async (
  loteId: string
): Promise<ImportacionError[]> => {
  const result = await dbQuery<ImportacionErrorRow>(
    `
      SELECT
        id::text AS id,
        fila_numero,
        staging_tipo,
        staging_id::text AS staging_id,
        campo,
        codigo,
        mensaje,
        created_at
      FROM importacion_errores
      WHERE lote_id::text = $1
      ORDER BY fila_numero ASC, created_at ASC
    `,
    [loteId]
  );

  return result.rows.map(mapImportacionError);
};

export const confirmImportacionLote = async (
  loteId: string,
  actorUserId: string
): Promise<ConfirmImportacionResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const lote = await getImportacionLoteForUpdate(client, loteId);

    if (!lote) {
      throw new AppError('Import lote not found', 404, 'IMPORT_LOTE_NOT_FOUND');
    }

    if (lote.estado === 'CONFIRMADO') {
      throw new AppError('Import lote already confirmed', 409, 'IMPORT_LOTE_ALREADY_CONFIRMED');
    }

    if (lote.estado === 'CANCELADO') {
      throw new AppError('Cancelled lote cannot be confirmed', 409, 'IMPORT_LOTE_CANCELLED');
    }

    if (lote.estado !== 'PENDIENTE_CONFIRMACION') {
      throw new AppError(
        'Import lote has validation errors and cannot be confirmed',
        409,
        'IMPORT_LOTE_HAS_ERRORS'
      );
    }

    const stagedRows = await loadStagingRowsForConfirmation(client, loteId);

    let createdPersonas = 0;
    let updatedPersonas = 0;
    let createdVinculaciones = 0;
    let skippedActiveVinculaciones = 0;

    for (const row of stagedRows) {
      const personaPayload: ImportPersonaPayload = {
        tipo_documento_id: row.persona.tipo_documento_id,
        numero_documento: row.persona.numero_documento,
        primer_nombre: row.persona.primer_nombre,
        segundo_nombre: row.persona.segundo_nombre,
        primer_apellido: row.persona.primer_apellido,
        segundo_apellido: row.persona.segundo_apellido,
        fecha_nacimiento: formatDateOnly(row.persona.fecha_nacimiento),
        fecha_expedicion_documento: formatDateOnly(row.persona.fecha_expedicion_documento),
        municipio_nacimiento_id: row.persona.municipio_nacimiento_id,
        municipio_expedicion_id: row.persona.municipio_expedicion_id,
        municipio_residencia_id: row.persona.municipio_residencia_id,
        sexo_id: row.persona.sexo_id,
        estado_civil_id: row.persona.estado_civil_id,
        tipo_sangre_id: row.persona.tipo_sangre_id,
        estatura: row.persona.estatura,
        telefono: row.persona.telefono,
        correo: row.persona.correo,
        direccion: row.persona.direccion,
        barrio: row.persona.barrio,
        zona_id: row.persona.zona_id,
        activo: row.persona.activo ?? true
      };

      const existingPersona = await findPersonaByNumeroDocumento(
        client,
        personaPayload.numero_documento
      );

      let personaId: string;

      if (existingPersona) {
        await updatePersonaFromImport(client, existingPersona.id, personaPayload);
        personaId = existingPersona.id;
        updatedPersonas += 1;
      } else {
        personaId = await createPersonaFromImport(client, personaPayload);
        createdPersonas += 1;
      }

      await client.query(
        `
          UPDATE importacion_staging_personas
          SET
            procesado = TRUE,
            persona_id = $2::uuid,
            updated_at = NOW()
          WHERE id::text = $1
        `,
        [row.persona.id, personaId]
      );

      if (row.vinculacion.estado === 'ACTIVA') {
        const existingActiveVinculacion = await findActiveVinculacion(
          client,
          personaId,
          row.vinculacion.contrato_id
        );

        if (existingActiveVinculacion) {
          skippedActiveVinculaciones += 1;

          await client.query(
            `
              UPDATE importacion_staging_vinculaciones
              SET
                procesado = TRUE,
                persona_id = $2::uuid,
                vinculacion_id = $3::uuid,
                updated_at = NOW()
              WHERE id::text = $1
            `,
            [row.vinculacion.id, personaId, existingActiveVinculacion]
          );

          continue;
        }
      }

      const vinculacionPayload: ImportVinculacionPayload = {
        empresa_id: row.vinculacion.empresa_id,
        contrato_id: row.vinculacion.contrato_id,
        contrato_cargo_id: row.vinculacion.contrato_cargo_id,
        fecha_inicio: formatDateOnly(row.vinculacion.fecha_inicio) ?? '',
        fecha_fin: formatDateOnly(row.vinculacion.fecha_fin),
        estado: row.vinculacion.estado as 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA',
        observaciones: row.vinculacion.observaciones
      };

      const createdVinculacionId = await createVinculacionFromImport(client, {
        actorUserId,
        persona_id: personaId,
        empresa_id: vinculacionPayload.empresa_id,
        contrato_id: vinculacionPayload.contrato_id,
        contrato_cargo_id: vinculacionPayload.contrato_cargo_id,
        fecha_inicio: vinculacionPayload.fecha_inicio,
        fecha_fin: vinculacionPayload.fecha_fin,
        estado: vinculacionPayload.estado,
        observaciones: vinculacionPayload.observaciones
      });

      await client.query(
        `
          UPDATE importacion_staging_vinculaciones
          SET
            procesado = TRUE,
            persona_id = $2::uuid,
            vinculacion_id = $3::uuid,
            updated_at = NOW()
          WHERE id::text = $1
        `,
        [row.vinculacion.id, personaId, createdVinculacionId]
      );

      createdVinculaciones += 1;
    }

    const nextMetadata = getActorAuditTrail(lote.metadata, {
      action: 'CONFIRM',
      actor_user_id: actorUserId,
      at: new Date().toISOString(),
      summary: {
        createdPersonas,
        updatedPersonas,
        createdVinculaciones,
        skippedActiveVinculaciones
      }
    });

    await client.query(
      `
        UPDATE importacion_lotes
        SET
          estado = 'CONFIRMADO',
          confirmed_by = $2::uuid,
          confirmed_at = NOW(),
          metadata = $3::jsonb,
          resumen = $4::jsonb,
          updated_at = NOW()
        WHERE id::text = $1
      `,
      [
        loteId,
        actorUserId,
        JSON.stringify(nextMetadata),
        JSON.stringify({
          ...(lote.resumen ?? {}),
          confirmacion: {
            createdPersonas,
            updatedPersonas,
            createdVinculaciones,
            skippedActiveVinculaciones
          }
        })
      ]
    );

    const updatedLote = await getImportacionLoteForUpdate(client, loteId);

    if (!updatedLote) {
      throw new AppError('Failed to reload import lote', 500, 'IMPORT_LOTE_RELOAD_FAILED');
    }

    await client.query('COMMIT');

    return {
      lote: mapImportacionLote(updatedLote),
      createdPersonas,
      updatedPersonas,
      createdVinculaciones,
      skippedActiveVinculaciones
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const cancelImportacionLote = async (
  loteId: string,
  actorUserId: string
): Promise<ImportacionLote> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const lote = await getImportacionLoteForUpdate(client, loteId);

    if (!lote) {
      throw new AppError('Import lote not found', 404, 'IMPORT_LOTE_NOT_FOUND');
    }

    if (lote.estado === 'CONFIRMADO') {
      throw new AppError('Confirmed lote cannot be cancelled', 409, 'IMPORT_LOTE_CONFIRMED');
    }

    if (lote.estado === 'CANCELADO') {
      throw new AppError('Import lote already cancelled', 409, 'IMPORT_LOTE_ALREADY_CANCELLED');
    }

    const nextMetadata = getActorAuditTrail(lote.metadata, {
      action: 'CANCEL',
      actor_user_id: actorUserId,
      at: new Date().toISOString()
    });

    await client.query(
      `
        UPDATE importacion_lotes
        SET
          estado = 'CANCELADO',
          cancelado_por = $2::uuid,
          cancelado_at = NOW(),
          metadata = $3::jsonb,
          updated_at = NOW()
        WHERE id::text = $1
      `,
      [loteId, actorUserId, JSON.stringify(nextMetadata)]
    );

    const updatedLote = await getImportacionLoteForUpdate(client, loteId);

    if (!updatedLote) {
      throw new AppError('Failed to reload import lote', 500, 'IMPORT_LOTE_RELOAD_FAILED');
    }

    await client.query('COMMIT');
    return mapImportacionLote(updatedLote);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
