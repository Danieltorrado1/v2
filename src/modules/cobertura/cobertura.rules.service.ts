import type { PoolClient, QueryResultRow } from 'pg';

import { AppError } from '../../utils/AppError';
import type { CoverageRuleDefinition } from './cobertura.focalizacion.domain';

interface CoverageRuleConfigRow extends QueryResultRow {
  id: string;
  contrato_id: string | null;
  modalidad_id: string | null;
  modalidad: string | null;
  metodo: string;
  nombre: string;
  formula: string | null;
  factor_previo: string | number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  estado: string;
}

interface CoverageRuleRangeRow extends QueryResultRow {
  id: string;
  config_id: string;
  desde: number | string;
  hasta: number | string | null;
  orden: number | string;
  personal_requerido: number | string;
}

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === '') {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return toNumber(value);
};

export const ensureCoverageRulesSchemaReady = async (client: PoolClient): Promise<void> => {
  const result = await client.query<QueryResultRow>(
    `
      SELECT
        to_regclass('public.calculadora_personal_config') IS NOT NULL AS has_personal_config,
        to_regclass('public.calculadora_personal_rangos') IS NOT NULL AS has_personal_rangos
    `,
  );

  const row = result.rows[0];
  if (!row?.has_personal_config || !row.has_personal_rangos) {
    throw new AppError(
      'La base de datos no tiene aplicada la configuracion de reglas de cobertura.',
      409,
      'FOCALIZACION_RULES_MIGRATION_REQUIRED',
    );
  }
};

export const loadCoverageRuleForContext = async (
  client: PoolClient,
  input: {
    contratoId: number;
    modalidadId: number;
    fechaVigencia: string;
  },
): Promise<CoverageRuleDefinition | null> => {
  const configResult = await client.query<CoverageRuleConfigRow>(
    `
      SELECT
        c.id::text AS id,
        c.contrato_id::text AS contrato_id,
        c.modalidad_id::text AS modalidad_id,
        c.modalidad,
        upper(c.metodo) AS metodo,
        c.nombre,
        c.formula,
        c.factor_previo,
        c.vigencia_desde::text AS vigencia_desde,
        c.vigencia_hasta::text AS vigencia_hasta,
        c.estado
      FROM calculadora_personal_config c
      WHERE c.estado = 'activo'
        AND COALESCE(c.dominio_calculo, 'GENERAL') = 'COBERTURA_PAE'
        AND (c.contrato_id = $1::bigint OR c.contrato_id IS NULL)
        AND (c.modalidad_id = $2::bigint OR c.modalidad_id IS NULL)
        AND c.vigencia_desde <= $3::date
        AND (c.vigencia_hasta IS NULL OR c.vigencia_hasta >= $3::date)
      ORDER BY
        CASE WHEN c.contrato_id = $1::bigint THEN 0 ELSE 1 END,
        CASE WHEN c.modalidad_id = $2::bigint THEN 0 ELSE 1 END,
        c.vigencia_desde DESC,
        c.id DESC
      LIMIT 1
    `,
    [input.contratoId, input.modalidadId, input.fechaVigencia],
  );

  const config = configResult.rows[0];
  if (!config) {
    return null;
  }

  const rangesResult = await client.query<CoverageRuleRangeRow>(
    `
      SELECT
        id::text AS id,
        config_id::text AS config_id,
        desde,
        hasta,
        orden,
        personal_requerido
      FROM calculadora_personal_rangos
      WHERE config_id = $1::bigint
        AND estado = 'activo'
      ORDER BY orden ASC, desde ASC, id ASC
    `,
    [toNumber(config.id)],
  );

  return {
    activo: config.estado === 'activo',
    contrato_id: toNullableNumber(config.contrato_id),
    cupos_formula: null,
    factor_previo: toNullableNumber(config.factor_previo),
    id: toNumber(config.id),
    metodo: config.metodo === 'FORMULA' ? 'FORMULA' : 'RANGOS',
    modalidad_codigo: config.modalidad,
    modalidad_id: toNullableNumber(config.modalidad_id),
    nombre: config.nombre,
    rangos: rangesResult.rows.map((range) => ({
      desde: toNumber(range.desde),
      hasta: toNullableNumber(range.hasta),
      manipuladores_requeridos: toNumber(range.personal_requerido),
    })),
    resultado_formula: config.formula,
  };
};
