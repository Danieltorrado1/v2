import type { QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';

export interface NominaPoblacionRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaPoblacionExistingRow extends QueryResultRow {
  activo: boolean;
  motivo_caso_especial: string | null;
  vinculacion_id: string;
}

export interface ListNominaPoblacionExistingInput {
  contratoId?: string;
  empresaId?: string;
  periodoId: string;
  personaId?: string;
  vinculacionId?: string;
}

export interface InsertNominaPoblacionInput {
  activo?: boolean;
  auxilioTransporte: number | string | null;
  categoriaSalarialId: string | null;
  diasPagados: number | string;
  diasPeriodo: number | string;
  estado?: string;
  fechaFinPago: string;
  fechaInicioPago: string;
  metodoLiquidacion: string;
  otrosDevengos?: number | string;
  periodoId: string;
  salarioBase: number | string | null;
  vinculacionId: string;
}

const getExecutor = (
  executor?: NominaPoblacionRepositoryExecutor
): NominaPoblacionRepositoryExecutor => executor ?? (dbPool as NominaPoblacionRepositoryExecutor);

/** Persistence-only operations for the period population projection. */
export class NominaPoblacionRepository {
  public async listExistingByPeriodo(
    input: ListNominaPoblacionExistingInput,
    executor?: NominaPoblacionRepositoryExecutor
  ): Promise<NominaPoblacionExistingRow[]> {
    const conditions = ['ne.periodo_id = $1::bigint'];
    const params: unknown[] = [input.periodoId];

    if (input.contratoId) {
      params.push(input.contratoId);
      conditions.push(`np.contrato_id = $${params.length}::bigint`);
    }
    if (input.empresaId) {
      params.push(input.empresaId);
      conditions.push(`v.empresa_id = $${params.length}::bigint`);
    }

    if (input.personaId) {
      params.push(input.personaId);
      conditions.push(`v.persona_id = $${params.length}::bigint`);
    }
    if (input.vinculacionId) {
      params.push(input.vinculacionId);
      conditions.push(`ne.vinculacion_id = $${params.length}::bigint`);
    }

    const result = await getExecutor(executor).query<NominaPoblacionExistingRow>(
      `
        SELECT
          ne.vinculacion_id::text AS vinculacion_id,
          COALESCE(ne.activo, TRUE) AS activo,
          ne.motivo_caso_especial
        FROM nomina_empleados ne
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        WHERE ${conditions.join(' AND ')}
      `,
      params
    );

    return result.rows;
  }

  public async reactivate(
    periodoId: string,
    vinculacionId: string,
    motivoCasoEspecial: string | null,
    executor: NominaPoblacionRepositoryExecutor
  ): Promise<boolean> {
    const result = await executor.query(
      `
        UPDATE nomina_empleados
        SET activo = TRUE,
            motivo_caso_especial = NULLIF($3::text, '')
        WHERE periodo_id = $1::bigint
          AND vinculacion_id = $2::bigint
        RETURNING id
      `,
      [periodoId, vinculacionId, motivoCasoEspecial]
    );

    return result.rows.length > 0;
  }

  public async insert(
    input: InsertNominaPoblacionInput,
    executor: NominaPoblacionRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO nomina_empleados (
          periodo_id, vinculacion_id, metodo_liquidacion,
          categoria_salarial_id, salario_base, auxilio_transporte,
          otros_devengos, fecha_inicio_pago, fecha_fin_pago,
          dias_periodo, dias_pagados, horas_trabajadas, horas_extra_total,
          devengado_basico, devengado_transporte, devengado_otros,
          total_adiciones, total_deducciones, salud, pension, neto_pagar,
          revisado, estado, activo, motivo_caso_especial
        )
        VALUES (
          $1::bigint, $2::bigint, $3, $4::bigint, $5, $6, $7,
          $8, $9, $10, $11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          FALSE, $12, $13, NULL
        )
        RETURNING id::text AS id
      `,
      [
        input.periodoId,
        input.vinculacionId,
        input.metodoLiquidacion,
        input.categoriaSalarialId,
        input.salarioBase,
        input.auxilioTransporte,
        input.otrosDevengos ?? 0,
        input.fechaInicioPago,
        input.fechaFinPago,
        input.diasPeriodo,
        input.diasPagados,
        input.estado ?? 'PENDIENTE',
        input.activo ?? true
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('NominaPoblacionRepository.insert returned no id');
    }
    return row.id;
  }

  public async bulkInsert(
    inputs: InsertNominaPoblacionInput[],
    executor: NominaPoblacionRepositoryExecutor
  ): Promise<string[]> {
    if (inputs.length === 0) return [];

    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO nomina_empleados (
          periodo_id, vinculacion_id, metodo_liquidacion,
          categoria_salarial_id, salario_base, auxilio_transporte,
          otros_devengos, fecha_inicio_pago, fecha_fin_pago,
          dias_periodo, dias_pagados, horas_trabajadas, horas_extra_total,
          devengado_basico, devengado_transporte, devengado_otros,
          total_adiciones, total_deducciones, salud, pension, neto_pagar,
          revisado, estado, activo, motivo_caso_especial
        )
        SELECT periodo_id, vinculacion_id, metodo_liquidacion,
          categoria_salarial_id, salario_base, auxilio_transporte,
          otros_devengos, fecha_inicio_pago, fecha_fin_pago,
          dias_periodo, dias_pagados, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          FALSE, estado, activo, NULL
        FROM UNNEST(
          $1::bigint[], $2::bigint[], $3::text[], $4::bigint[],
          $5::numeric[], $6::numeric[], $7::numeric[], $8::date[],
          $9::date[], $10::numeric[], $11::numeric[], $12::text[], $13::boolean[]
        ) AS rows(
          periodo_id, vinculacion_id, metodo_liquidacion,
          categoria_salarial_id, salario_base, auxilio_transporte,
          otros_devengos, fecha_inicio_pago, fecha_fin_pago,
          dias_periodo, dias_pagados, estado, activo
        )
        RETURNING id::text AS id
      `,
      [
        inputs.map((input) => input.periodoId),
        inputs.map((input) => input.vinculacionId),
        inputs.map((input) => input.metodoLiquidacion),
        inputs.map((input) => input.categoriaSalarialId),
        inputs.map((input) => input.salarioBase),
        inputs.map((input) => input.auxilioTransporte),
        inputs.map((input) => input.otrosDevengos ?? 0),
        inputs.map((input) => input.fechaInicioPago),
        inputs.map((input) => input.fechaFinPago),
        inputs.map((input) => input.diasPeriodo),
        inputs.map((input) => input.diasPagados),
        inputs.map((input) => input.estado ?? 'PENDIENTE'),
        inputs.map((input) => input.activo ?? true)
      ]
    );
    return result.rows.map((row) => row.id);
  }
}

export const nominaPoblacionRepository = new NominaPoblacionRepository();
