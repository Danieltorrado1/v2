import { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { compareDateStrings } from './nomina.calculator';
import { EstadoPeriodo } from './nomina.schemas';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface NominaPeriodoRow extends QueryResultRow {
  contrato_id: string | null;
  empresa_id: string | null;
  estado: EstadoPeriodo;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  nombre_periodo: string;
  tipo_periodo: string;
}

interface VinculacionNominaLookupRow extends QueryResultRow {
  contrato_cargo_id: string;
  contrato_id: string;
  empresa_id: string;
  estado_vinculacion: string;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  id: string;
  persona_id: string;
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

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

export interface NominaPeriodoLookup {
  contrato_id: string | null;
  empresa_id: string | null;
  estado: EstadoPeriodo;
  fecha_fin: string;
  fecha_inicio: string;
  id: string;
  nombre: string;
  tipo_periodo: string;
}

export interface VinculacionNominaLookup {
  contrato_cargo_id: string;
  contrato_id: string;
  empresa_id: string;
  estado: string;
  fecha_fin: string | null;
  fecha_inicio: string;
  id: string;
  persona_id: string;
}

export const ensurePeriodoExists = async (
  periodoId: string,
  client?: PoolClient
): Promise<NominaPeriodoLookup> => {
  const executor = getExecutor(client);
  const result = await executor.query<NominaPeriodoRow>(
    `
      SELECT
        np.id::text AS id,
        np.nombre_periodo,
        np.tipo_periodo,
        np.fecha_inicio,
        np.fecha_fin,
        np.estado,
        np.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id
      FROM nomina_periodos np
      INNER JOIN contratos c ON c.id = np.contrato_id
      WHERE np.id::text = $1
      LIMIT 1
    `,
    [periodoId]
  );

  const periodo = result.rows[0];

  if (!periodo) {
    throw new AppError('Nomina period not found', 404, 'NOMINA_PERIODO_NOT_FOUND');
  }

  return {
    id: periodo.id,
    nombre: periodo.nombre_periodo,
    tipo_periodo: periodo.tipo_periodo,
    fecha_inicio: toDateString(periodo.fecha_inicio) ?? '',
    fecha_fin: toDateString(periodo.fecha_fin) ?? '',
    estado: periodo.estado,
    contrato_id: periodo.contrato_id,
    empresa_id: periodo.empresa_id
  };
};

export const ensurePeriodoAbierto = async (
  periodoId: string,
  client?: PoolClient
): Promise<NominaPeriodoLookup> => {
  const periodo = await ensurePeriodoExists(periodoId, client);

  if (periodo.estado !== 'ABIERTO') {
    throw new AppError(
      'Only open payroll periods can be recalculated or modified',
      409,
      'NOMINA_PERIODO_CERRADO'
    );
  }

  return periodo;
};

export const ensureContratoExists = async (
  contratoId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<ExistsRow>(
    'SELECT EXISTS (SELECT 1 FROM contratos WHERE id::text = $1) AS exists',
    [contratoId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }
};

export const ensureEmpresaExists = async (
  empresaId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<ExistsRow>(
    'SELECT EXISTS (SELECT 1 FROM empresas WHERE id::text = $1) AS exists',
    [empresaId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND');
  }
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
): Promise<VinculacionNominaLookup> => {
  const executor = getExecutor(client);
  const result = await executor.query<VinculacionNominaLookupRow>(
    `
      SELECT
        id::text AS id,
        persona_id::text AS persona_id,
        empresa_id::text AS empresa_id,
        contrato_id::text AS contrato_id,
        contrato_cargo_id::text AS contrato_cargo_id,
        estado_vinculacion,
        fecha_inicio,
        fecha_fin
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

  return {
    id: vinculacion.id,
    persona_id: vinculacion.persona_id,
    empresa_id: vinculacion.empresa_id,
    contrato_id: vinculacion.contrato_id,
    contrato_cargo_id: vinculacion.contrato_cargo_id,
    estado: vinculacion.estado_vinculacion,
    fecha_inicio: toDateString(vinculacion.fecha_inicio) ?? '',
    fecha_fin: toDateString(vinculacion.fecha_fin)
  };
};

export const ensurePeriodoRelacionadoConFecha = (
  periodo: NominaPeriodoLookup,
  fechaInicio?: string | null,
  fechaFin?: string | null,
  fechaNovedad?: string | null
): void => {
  if (fechaNovedad) {
    if (
      compareDateStrings(fechaNovedad, periodo.fecha_inicio) < 0 &&
      !fechaInicio &&
      !fechaFin
    ) {
      throw new AppError(
        'Novedad date must be inside the period or provide a related range',
        400,
        'NOVEDAD_FECHA_NO_RELACIONADA'
      );
    }

    if (compareDateStrings(fechaNovedad, periodo.fecha_fin) > 0 && !fechaInicio && !fechaFin) {
      throw new AppError(
        'Novedad date must be inside the period or provide a related range',
        400,
        'NOVEDAD_FECHA_NO_RELACIONADA'
      );
    }
  }

  if (fechaInicio && fechaFin && compareDateStrings(fechaInicio, fechaFin) > 0) {
    throw new AppError(
      'Novedad date range is invalid',
      400,
      'NOVEDAD_RANGO_INVALIDO'
    );
  }

  if (fechaInicio || fechaFin) {
    const relatedStart = fechaInicio ?? fechaFin ?? periodo.fecha_inicio;
    const relatedEnd = fechaFin ?? fechaInicio ?? periodo.fecha_fin;

    if (
      compareDateStrings(relatedEnd, periodo.fecha_inicio) < 0 ||
      compareDateStrings(relatedStart, periodo.fecha_fin) > 0
    ) {
      throw new AppError(
        'Novedad range must intersect the payroll period',
        400,
        'NOVEDAD_PERIODO_SIN_INTERSECCION'
      );
    }
  }
};
