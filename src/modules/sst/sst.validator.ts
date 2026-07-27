import { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { SstPlanAccionOrigin } from './sst.schemas';

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
  estado: string | null;
  fecha_evento: Date | string;
  id: string;
  persona_id: string | null;
  tipo_evento: string;
  vinculacion_id: string | null;
}

interface SstPlanAccionLookupRow extends QueryResultRow {
  activo: boolean;
  descripcion: string;
  estado: string | null;
  fecha_cierre: Date | string | null;
  fecha_compromiso: Date | string | null;
  id: string;
  origen: string;
  origen_id: string | null;
  responsable: string | null;
}

interface SstPlanAccionOriginLookupRow extends QueryResultRow {
  contrato_id: string | null;
  empresa_id: string | null;
  id: string;
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

export interface ValidatedSstPlanAccionOrigin {
  contrato_id: string | null;
  empresa_id: string | null;
  origen: SstPlanAccionOrigin;
  origen_id: string;
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
        se.id::text AS id,
        se.vinculacion_id::text AS vinculacion_id,
        se.tipo_evento,
        se.estado,
        se.fecha_evento,
        COALESCE(se.activo, TRUE) AS activo,
        v.persona_id::text AS persona_id,
        v.contrato_id::text AS contrato_id,
        v.empresa_id::text AS empresa_id
      FROM sst_eventos se
      LEFT JOIN vinculaciones v ON v.id = se.vinculacion_id
      WHERE se.id::text = $1
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
        spa.id::text AS id,
        spa.origen,
        spa.origen_id::text AS origen_id,
        spa.descripcion,
        spa.responsable,
        spa.fecha_compromiso,
        spa.fecha_cierre,
        spa.estado,
        COALESCE(spa.activo, TRUE) AS activo
      FROM sst_planes_accion spa
      WHERE spa.id::text = $1
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
  if (!values.vinculacion_id) {
    throw new AppError('vinculacion_id is required', 400, 'SST_EVENTO_VINCULACION_REQUIRED');
  }

  const vinculacion = await ensureVinculacionExists(values.vinculacion_id, client);

  if (values.persona_id && vinculacion.persona_id && values.persona_id !== vinculacion.persona_id) {
    throw new AppError(
      'persona_id does not match vinculacion_id',
      409,
      'SST_EVENTO_PERSONA_VINCULACION_MISMATCH'
    );
  }

  if (values.contrato_id && vinculacion.contrato_id && values.contrato_id !== vinculacion.contrato_id) {
    throw new AppError(
      'contrato_id does not match vinculacion_id',
      409,
      'SST_EVENTO_CONTRATO_VINCULACION_MISMATCH'
    );
  }

  if (values.empresa_id && vinculacion.empresa_id && values.empresa_id !== vinculacion.empresa_id) {
    throw new AppError(
      'empresa_id does not match vinculacion_id',
      409,
      'SST_EVENTO_EMPRESA_VINCULACION_MISMATCH'
    );
  }

  return {
    persona_id: vinculacion.persona_id ?? values.persona_id ?? null,
    contrato_id: vinculacion.contrato_id ?? values.contrato_id ?? null,
    empresa_id: vinculacion.empresa_id ?? values.empresa_id ?? null,
    vinculacion_id: values.vinculacion_id
  };
};

export const validateSstPlanAccionOrigin = async (
  origen: SstPlanAccionOrigin,
  origenId: string,
  client?: PoolClient
): Promise<ValidatedSstPlanAccionOrigin> => {
  const executor = getExecutor(client);

  let queryText = '';

  switch (origen) {
    case 'EVENTO':
      queryText = `
        SELECT
          se.id::text AS id,
          v.contrato_id::text AS contrato_id,
          v.empresa_id::text AS empresa_id
        FROM sst_eventos se
        LEFT JOIN vinculaciones v ON v.id = se.vinculacion_id
        WHERE se.id::text = $1
        LIMIT 1
      `;
      break;
    case 'INSPECCION':
      queryText = `
        SELECT
          si.id::text AS id,
          si.contrato_id::text AS contrato_id,
          si.empresa_id::text AS empresa_id
        FROM sst_inspecciones si
        WHERE si.id::text = $1
        LIMIT 1
      `;
      break;
    case 'HALLAZGO':
      queryText = `
        SELECT
          sih.id::text AS id,
          si.contrato_id::text AS contrato_id,
          si.empresa_id::text AS empresa_id
        FROM sst_inspecciones_hallazgos sih
        INNER JOIN sst_inspecciones si ON si.id = sih.inspeccion_id
        WHERE sih.id::text = $1
        LIMIT 1
      `;
      break;
    case 'ACCIDENTE':
      queryText = `
        SELECT
          sai.id::text AS id,
          sai.contrato_id::text AS contrato_id,
          sai.empresa_id::text AS empresa_id
        FROM sst_accidentes_incidentes sai
        WHERE sai.id::text = $1
        LIMIT 1
      `;
      break;
  }

  const result = await executor.query<SstPlanAccionOriginLookupRow>(queryText, [origenId]);
  const relation = result.rows[0];

  if (!relation) {
    throw new AppError(
      `SST action plan origin ${origen} not found`,
      400,
      'SST_PLAN_ACCION_ORIGEN_NOT_FOUND',
      {
        origen,
        origen_id: origenId
      }
    );
  }

  return {
    origen,
    origen_id: relation.id,
    contrato_id: relation.contrato_id,
    empresa_id: relation.empresa_id
  };
};

