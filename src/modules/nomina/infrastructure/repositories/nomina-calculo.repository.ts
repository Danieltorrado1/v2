import type { QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';

export interface NominaCalculoRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaCalculoResultInput {
  detalleCalculo: Record<string, unknown>;
  devengadoBasico: number;
  devengadoOtros: number;
  devengadoTransporte: number;
  diasPagados: number;
  empleadoId: string;
  horasTrabajadas: number;
  netoPagar: number;
  pension: number;
  salud: number;
  totalAdiciones: number;
  totalDeducciones: number;
}

export interface NominaCalculoResultRow extends QueryResultRow {
  detalle_calculo: Record<string, unknown> | null;
  devengado_basico: number | string | null;
  devengado_otros: number | string | null;
  devengado_transporte: number | string | null;
  dias_pagados: number | string | null;
  horas_trabajadas: number | string | null;
  id: string;
  neto_pagar: number | string | null;
  pension: number | string | null;
  salud: number | string | null;
  total_adiciones: number | string | null;
  total_deducciones: number | string | null;
}

const getExecutor = (
  executor?: NominaCalculoRepositoryExecutor
): NominaCalculoRepositoryExecutor => executor ?? (dbPool as NominaCalculoRepositoryExecutor);

/** Persists an already calculated result; it contains no payroll formulas. */
export class NominaCalculoRepository {
  public async persistResult(
    input: NominaCalculoResultInput,
    executor: NominaCalculoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        UPDATE nomina_empleados
        SET
          dias_pagados = $2,
          horas_trabajadas = $3,
          devengado_basico = $4,
          devengado_transporte = $5,
          devengado_otros = $6,
          salud = $7,
          pension = $8,
          total_adiciones = $9,
          total_deducciones = $10,
          neto_pagar = $11,
          detalle_calculo = $12::jsonb
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        input.empleadoId,
        input.diasPagados,
        input.horasTrabajadas,
        input.devengadoBasico,
        input.devengadoTransporte,
        input.devengadoOtros,
        input.salud,
        input.pension,
        input.totalAdiciones,
        input.totalDeducciones,
        input.netoPagar,
        JSON.stringify(input.detalleCalculo)
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('NominaCalculoRepository.persistResult returned no id');
    }
    return row.id;
  }

  public async getCurrentResult(
    empleadoId: string,
    executor?: NominaCalculoRepositoryExecutor
  ): Promise<NominaCalculoResultRow | null> {
    const result = await getExecutor(executor).query<NominaCalculoResultRow>(
      `
        SELECT
          id::text AS id,
          dias_pagados,
          horas_trabajadas,
          devengado_basico,
          devengado_transporte,
          devengado_otros,
          salud,
          pension,
          total_adiciones,
          total_deducciones,
          neto_pagar,
          detalle_calculo
        FROM nomina_empleados
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [empleadoId]
    );
    return result.rows[0] ?? null;
  }
}

export const nominaCalculoRepository = new NominaCalculoRepository();
