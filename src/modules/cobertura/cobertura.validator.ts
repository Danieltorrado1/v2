import { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface ContratoCoberturaRow extends QueryResultRow {
  aplica_cobertura: boolean;
  id: string;
}

interface VinculacionCoberturaRow extends QueryResultRow {
  contrato_cargo_id: string;
  estado: string;
  id: string;
}

interface FocalizacionFinalLookupRow extends QueryResultRow {
  clave_sede_modalidad: string;
  contrato_id: string;
  id: string;
  categoria_cobertura: string | null;
  consecutivo_final: string | null;
  institucion_final: string;
  municipio_id: string | null;
  modalidad_final: string;
  sede_final: string;
}

interface CoberturaAsignacionDuplicateRow extends QueryResultRow {
  id: string;
}

interface CargoManipuladorRow extends QueryResultRow {
  es_manipulador: boolean;
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

export interface ContratoCobertura {
  aplica_cobertura: boolean;
  id: string;
}

export interface FocalizacionFinalLookup {
  clave_sede_modalidad: string;
  categoria_cobertura: string | null;
  contrato_id: string;
  consecutivo_final: string | null;
  institucion_final: string;
  id: string;
  municipio_id: string | null;
  modalidad_final: string;
  sede_final: string;
}

export const ensureContratoAplicaCobertura = async (
  contratoId: string,
  client?: PoolClient
): Promise<ContratoCobertura> => {
  const executor = getExecutor(client);
  const result = await executor.query<ContratoCoberturaRow>(
    `
      SELECT
        id::text AS id,
        aplica_cobertura
      FROM contratos
      WHERE id::text = $1
      LIMIT 1
    `,
    [contratoId]
  );

  const contrato = result.rows[0];

  if (!contrato) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  if (!contrato.aplica_cobertura) {
    throw new AppError(
      'Contrato does not apply coverage',
      409,
      'CONTRATO_NO_APLICA_COBERTURA'
    );
  }

  return contrato;
};

export const ensureFocalizacionFinalExists = async (
  focalizacionFinalId: string,
  client?: PoolClient
): Promise<FocalizacionFinalLookup> => {
  const executor = getExecutor(client);
  const result = await executor.query<FocalizacionFinalLookupRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        institucion_final,
        sede_final,
        consecutivo_final,
        modalidad_final,
        categoria_cobertura,
        clave_sede_modalidad
      FROM focalizacion_final
      WHERE id::text = $1
        AND activo = TRUE
      LIMIT 1
    `,
    [focalizacionFinalId]
  );

  const focalizacion = result.rows[0];

  if (!focalizacion) {
    throw new AppError(
      'Focalizacion final not found',
      404,
      'FOCALIZACION_FINAL_NOT_FOUND'
    );
  }

  return focalizacion;
};

export const ensureVinculacionActivaManipulador = async (
  vinculacionId: string,
  client?: PoolClient
): Promise<VinculacionCoberturaRow> => {
  const executor = getExecutor(client);
  const vinculacionResult = await executor.query<VinculacionCoberturaRow>(
    `
      SELECT
        id::text AS id,
        estado,
        contrato_cargo_id::text AS contrato_cargo_id
      FROM vinculaciones
      WHERE id::text = $1
      LIMIT 1
    `,
    [vinculacionId]
  );

  const vinculacion = vinculacionResult.rows[0];

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  if (vinculacion.estado !== 'ACTIVA') {
    throw new AppError(
      'Vinculacion must be active for coverage assignment',
      409,
      'VINCULACION_NO_ACTIVA'
    );
  }

  const cargoResult = await executor.query<CargoManipuladorRow>(
    `
      SELECT
        (
          COALESCE(cc.es_manipulador_alimentos, FALSE)
          OR LOWER(COALESCE(cc.nombre, '')) LIKE '%manipulador%'
          OR LOWER(COALESCE(cc.codigo, '')) LIKE '%manip%'
        ) AS es_manipulador
      FROM contrato_cargos cc
      WHERE cc.id::text = $1
      LIMIT 1
    `,
    [vinculacion.contrato_cargo_id]
  );

  if (!cargoResult.rows[0]?.es_manipulador) {
    throw new AppError(
      'Vinculacion cargo is not a manipulador de alimentos',
      409,
      'CARGO_NO_MANIPULADOR'
    );
  }

  return vinculacion;
};

export const ensureUniqueActiveCoverageAssignment = async (
  vinculacionId: string,
  focalizacionFinalId: string,
  client?: PoolClient,
  excludedAsignacionId?: string
): Promise<void> => {
  const executor = getExecutor(client);
  const params: unknown[] = [vinculacionId, focalizacionFinalId];
  let query = `
    SELECT id::text AS id
    FROM cobertura_asignaciones
    WHERE vinculacion_id::text = $1
      AND focalizacion_final_id::text = $2
      AND activo = TRUE
  `;

  if (excludedAsignacionId) {
    params.push(excludedAsignacionId);
    query += ` AND id::text <> $${params.length}`;
  }

  query += ' LIMIT 1';

  const result = await executor.query<CoberturaAsignacionDuplicateRow>(query, params);

  if (result.rows[0]) {
    throw new AppError(
      'This vinculacion already has an active assignment for the same sede-modalidad',
      409,
      'COBERTURA_ASIGNACION_DUPLICADA'
    );
  }
};

export const ensureEntityExists = async (
  tableName: 'focalizacion_final' | 'cobertura_asignaciones',
  entityId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<ExistsRow>(
    `SELECT EXISTS (SELECT 1 FROM ${tableName} WHERE id::text = $1) AS exists`,
    [entityId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(`${tableName} not found`, 404, 'ENTITY_NOT_FOUND', {
      tableName,
      entityId
    });
  }
};
