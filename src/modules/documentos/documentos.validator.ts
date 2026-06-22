import { Express } from 'express';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface VinculacionLookupRow extends QueryResultRow {
  contrato_cargo_id: string;
  contrato_id: string;
  id: string;
  persona_id: string;
}

interface TipoDocumentoRow extends QueryResultRow {
  id: string;
  nombre_documento: string | null;
}

export interface VinculacionLookup {
  contrato_cargo_id: string;
  contrato_id: string;
  id: string;
  persona_id: string;
}

export interface TipoDocumentoLookup {
  id: string;
  nombre_documento: string | null;
}

type QueryExecutor = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
};

const getExecutor = (client?: PoolClient): QueryExecutor => {
  if (client) {
    return {
      query: <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => client.query<T>(text, params)
    };
  }

  return {
    query: dbQuery
  };
};

export const ensureFileProvided = (file?: Express.Multer.File): Express.Multer.File => {
  if (!file) {
    throw new AppError('Document file is required', 400, 'DOCUMENT_FILE_REQUIRED');
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError('Uploaded file is empty', 400, 'DOCUMENT_FILE_EMPTY');
  }

  return file;
};

export const ensurePersonaExists = async (
  personaId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<ExistsRow>(
    'SELECT EXISTS (SELECT 1 FROM personas WHERE id::text = $1) AS exists',
    [personaId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }
};

export const ensureVinculacionExists = async (
  vinculacionId: string,
  client?: PoolClient
): Promise<VinculacionLookup> => {
  const executor = getExecutor(client);
  const result = await executor.query<VinculacionLookupRow>(
    `
      SELECT
        id::text AS id,
        persona_id::text AS persona_id,
        contrato_id::text AS contrato_id,
        contrato_cargo_id::text AS contrato_cargo_id
      FROM vinculaciones
      WHERE id::text = $1
      LIMIT 1
    `,
    [vinculacionId]
  );

  const vinculacion = result.rows[0];

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  return vinculacion;
};

export const ensureTipoDocumentoExists = async (
  tipoDocumentoId: string,
  client?: PoolClient
): Promise<TipoDocumentoLookup> => {
  const executor = getExecutor(client);
  const result = await executor.query<TipoDocumentoRow>(
    `
      SELECT
        id::text AS id,
        nombre_documento
      FROM tipos_documentos
      WHERE id::text = $1
      LIMIT 1
    `,
    [tipoDocumentoId]
  );

  const tipoDocumento = result.rows[0];

  if (!tipoDocumento) {
    throw new AppError('Tipo de documento not found', 400, 'TIPO_DOCUMENTO_NOT_FOUND');
  }

  return tipoDocumento;
};
