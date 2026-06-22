import { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface VinculacionLookupRow extends QueryResultRow {
  contrato_id: string | null;
  empresa_id: string | null;
  estado_vinculacion: string;
  id: string;
  persona_id: string | null;
}

interface SstEventoLookupRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string | null;
  empresa_id: string | null;
  estado: string;
  fecha_evento: Date | string;
  id: string;
  persona_id: string | null;
  tipo_evento: string;
  vinculacion_id: string | null;
}

interface SstPlanAccionLookupRow extends QueryResultRow {
  activo: boolean;
  estado: string;
  evento_id: string;
  fecha_cierre: Date | string | null;
  fecha_compromiso: Date | string;
  id: string;
  responsable: string;
  responsable_id: string | null;
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

export interface ValidatedSstEventoRelations {
  contrato_id: string | null;
  empresa_id: string | null;
  persona_id: string | null;
  vinculacion_id: string | null;
}

const ensureEntityExists = async (
  tableName: 'personas' | 'contratos' | 'empresas',
  entityId: string,
  errorCode: string,
  label: string,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<ExistsRow>(
    `SELECT EXISTS (SELECT 1 FROM ${tableName} WHERE id::text = $1) AS exists`,
    [entityId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(`${label} not found`, 400, errorCode, { id: entityId });
  }
};

export const ensurePersonaExists = async (
  personaId: string,
  client?: PoolClient
): Promise<void> => {
  await ensureEntityExists('personas', personaId, 'PERSONA_NOT_FOUND', 'Persona', client);
};

export const ensureContratoExists = async (
  contratoId: string,
  client?: PoolClient
): Promise<void> => {
  await ensureEntityExists('contratos', contratoId, 'CONTRATO_NOT_FOUND', 'Contrato', client);
};

export const ensureEmpresaExists = async (
  empresaId: string,
  client?: PoolClient
): Promise<void> => {
  await ensureEntityExists('empresas', empresaId, 'EMPRESA_NOT_FOUND', 'Empresa', client);
};

export const ensureVinculacionExists = async (
  vinculacionId: string,
  client?: PoolClient
): Promise<VinculacionLookupRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<VinculacionLookupRow>(
    `
      SELECT
        id::text AS id,
        persona_id::text AS persona_id,
        contrato_id::text AS contrato_id,
        empresa_id::text AS empresa_id,
        estado_vinculacion
      FROM vinculaciones
      WHERE id::text = $1
      LIMIT 1
    `,
    [vinculacionId]
  );

  const vinculacion = result.rows[0];

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 400, 'VINCULACION_NOT_FOUND', {
      id: vinculacionId
    });
  }

  return vinculacion;
};

export const ensureSstEventoExists = async (
  eventoId: string,
  client?: PoolClient
): Promise<SstEventoLookupRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<SstEventoLookupRow>(
    `
      SELECT
        id::text AS id,
        persona_id::text AS persona_id,
        vinculacion_id::text AS vinculacion_id,
        contrato_id::text AS contrato_id,
        empresa_id::text AS empresa_id,
        tipo_evento,
        estado,
        fecha_evento,
        activo
      FROM sst_eventos
      WHERE id::text = $1
      LIMIT 1
    `,
    [eventoId]
  );

  const evento = result.rows[0];

  if (!evento) {
    throw new AppError('SST event not found', 404, 'SST_EVENTO_NOT_FOUND');
  }

  return evento;
};

export const ensureSstPlanAccionExists = async (
  planId: string,
  client?: PoolClient
): Promise<SstPlanAccionLookupRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<SstPlanAccionLookupRow>(
    `
      SELECT
        id::text AS id,
        evento_id::text AS evento_id,
        responsable,
        responsable_id::text AS responsable_id,
        fecha_compromiso,
        fecha_cierre,
        estado,
        activo
      FROM sst_planes_accion
      WHERE id::text = $1
      LIMIT 1
    `,
    [planId]
  );

  const plan = result.rows[0];

  if (!plan) {
    throw new AppError('SST action plan not found', 404, 'SST_PLAN_ACCION_NOT_FOUND');
  }

  return plan;
};

export const validateSstEventoRelations = async (
  values: ValidatedSstEventoRelations,
  client?: PoolClient
): Promise<ValidatedSstEventoRelations> => {
  let nextValues = { ...values };

  if (nextValues.vinculacion_id) {
    const vinculacion = await ensureVinculacionExists(nextValues.vinculacion_id, client);

    if (nextValues.persona_id && vinculacion.persona_id && nextValues.persona_id !== vinculacion.persona_id) {
      throw new AppError(
        'persona_id does not match vinculacion_id',
        409,
        'SST_EVENTO_PERSONA_VINCULACION_MISMATCH'
      );
    }

    if (nextValues.contrato_id && vinculacion.contrato_id && nextValues.contrato_id !== vinculacion.contrato_id) {
      throw new AppError(
        'contrato_id does not match vinculacion_id',
        409,
        'SST_EVENTO_CONTRATO_VINCULACION_MISMATCH'
      );
    }

    if (nextValues.empresa_id && vinculacion.empresa_id && nextValues.empresa_id !== vinculacion.empresa_id) {
      throw new AppError(
        'empresa_id does not match vinculacion_id',
        409,
        'SST_EVENTO_EMPRESA_VINCULACION_MISMATCH'
      );
    }

    nextValues = {
      persona_id: nextValues.persona_id ?? vinculacion.persona_id ?? null,
      contrato_id: nextValues.contrato_id ?? vinculacion.contrato_id ?? null,
      empresa_id: nextValues.empresa_id ?? vinculacion.empresa_id ?? null,
      vinculacion_id: nextValues.vinculacion_id
    };
  }

  if (nextValues.persona_id) {
    await ensurePersonaExists(nextValues.persona_id, client);
  }

  if (nextValues.contrato_id) {
    await ensureContratoExists(nextValues.contrato_id, client);
  }

  if (nextValues.empresa_id) {
    await ensureEmpresaExists(nextValues.empresa_id, client);
  }

  return nextValues;
};
