import type { QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';
import { effectiveRetirementSql } from '../../nomina.population';

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
  public async repairOperationalSnapshots(
    input: { periodoId: string; actorUserId: string; personaId?: string; vinculacionId?: string },
    executor: NominaPoblacionRepositoryExecutor
  ): Promise<string[]> {
    const { periodoId, actorUserId, personaId, vinculacionId } = input;
    const snapshotTableResult = await executor.query<{ exists: boolean }>(
      `SELECT to_regclass('public.nomina_contextos_operativos_base') IS NOT NULL AS exists`
    );
    if (snapshotTableResult.rows[0]?.exists) {
      const snapshotParams: unknown[] = [
        periodoId,
        actorUserId
      ];
      const snapshotScopeCondition = personaId
        ? (snapshotParams.push(personaId), `AND v.persona_id = $${snapshotParams.length}::bigint`)
        : vinculacionId
          ? (snapshotParams.push(vinculacionId), `AND v.id = $${snapshotParams.length}::bigint`)
          : '';
      const snapshotResult = await executor.query<{ vinculacion_id: string }>(
        `
          WITH source_context AS (
            SELECT
              ne.id AS nomina_empleado_id,
              ne.vinculacion_id,
              jsonb_strip_nulls(jsonb_build_object(
                'municipio_id', COALESCE(ff.municipio_id, ca.municipio_id)::text,
                'municipio', COALESCE(ff.municipio_texto, mu.nombre_municipio),
                'institucion_id', ff.institucion_id::text,
                'institucion', COALESCE(ff.institucion_final, ca.institucion),
                'sede_id', ff.sede_id::text,
                'sede', COALESCE(ff.sede_final, ca.sede),
                'modalidad_id', ff.modalidad_id::text,
                'modalidad', ff.modalidad_final,
                'cargo_operativo_id', v.cargo_operativo_id::text,
                'cobertura_asignacion_id', ca.id::text
              )) AS contexto
            FROM nomina_empleados ne
            INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
            INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
            INNER JOIN LATERAL (
              SELECT ca1.*
              FROM cobertura_asignaciones ca1
              WHERE ca1.vinculacion_id = v.id
                AND COALESCE(ca1.activo, TRUE) = TRUE
                AND (
                  (
                    ca1.fecha_inicio <= np.fecha_fin
                    AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= np.fecha_inicio)
                  )
                  OR NOT EXISTS (
                    SELECT 1
                    FROM cobertura_asignaciones ca_period
                    WHERE ca_period.vinculacion_id = v.id
                      AND COALESCE(ca_period.activo, TRUE) = TRUE
                      AND ca_period.fecha_inicio <= np.fecha_fin
                      AND (ca_period.fecha_fin IS NULL OR ca_period.fecha_fin >= np.fecha_inicio)
                  )
                )
              ORDER BY
                CASE WHEN ca1.fecha_inicio <= np.fecha_fin
                  AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= np.fecha_inicio)
                  THEN 0 ELSE 1 END,
                ca1.fecha_inicio DESC,
                ca1.id DESC
              LIMIT 1
            ) ca ON TRUE
            LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
            LEFT JOIN municipios mu ON mu.id = COALESCE(ff.municipio_id, ca.municipio_id)
            WHERE ne.periodo_id = $1::bigint
              AND v.contrato_id = np.contrato_id
              AND COALESCE(ne.activo, TRUE)
              ${snapshotScopeCondition}
          ), repaired AS (
            INSERT INTO nomina_contextos_operativos_base (
              periodo_id, nomina_empleado_id, vinculacion_id, contexto, fuente, created_by
            )
            SELECT $1::bigint, nomina_empleado_id, vinculacion_id, contexto,
              'SINCRONIZACION_PERSONAL', $2::bigint
            FROM source_context
            ON CONFLICT (periodo_id, nomina_empleado_id) DO UPDATE
              SET vinculacion_id = EXCLUDED.vinculacion_id,
                  contexto = EXCLUDED.contexto,
                  fuente = EXCLUDED.fuente,
                  created_by = EXCLUDED.created_by
              WHERE nomina_contextos_operativos_base.contexto IS DISTINCT FROM EXCLUDED.contexto
            RETURNING vinculacion_id::text
          )
          SELECT vinculacion_id FROM repaired
        `,
        snapshotParams
      );
      return snapshotResult.rows.map(row => row.vinculacion_id);
    }


    return [];
  }

  public async lockPeriodo(periodoId: string, executor: NominaPoblacionRepositoryExecutor): Promise<void> {
    await executor.query('SELECT id FROM nomina_periodos WHERE id = $1::bigint FOR UPDATE', [periodoId]);
  }

  public async listImportCandidates(
    input: { contratoId: string; fechaInicio: string; fechaFin: string; personaId?: string; vinculacionId?: string },
    executor: NominaPoblacionRepositoryExecutor
  ): Promise<QueryResultRow[]> {
    const params: unknown[] = [input.contratoId, input.fechaFin, input.fechaInicio];
    const scope = input.personaId
      ? (params.push(input.personaId), `AND v.persona_id = $${params.length}::bigint`)
      : input.vinculacionId
        ? (params.push(input.vinculacionId), `AND v.id = $${params.length}::bigint`)
        : '';
    const result = await executor.query(
      `SELECT v.id::text AS vinculacion_id, v.persona_id::text AS persona_id,
          v.fecha_inicio, ${effectiveRetirementSql} AS fecha_fin,
          v.metodo_pago, tv.codigo AS tipo_vinculacion_codigo,
          v.contrato_cargo_id::text AS cargo_id, NULL::text AS categoria_id,
          NULL::numeric AS categoria_salario_base, NULL::numeric AS categoria_auxilio_transporte
       FROM vinculaciones v LEFT JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
       WHERE v.contrato_id = $1::bigint AND v.fecha_inicio <= $2::date
         AND COALESCE(${effectiveRetirementSql}, $2::date) >= $3::date
         ${scope} ORDER BY v.id ASC`,
      params
    );
    return result.rows;
  }

  public async excludeOutOfScope(
    input: { periodoId: string; fechaInicio: string; fechaFin: string; contratoId: string; exclusionReason: string; personaId?: string; vinculacionId?: string },
    executor: NominaPoblacionRepositoryExecutor
  ): Promise<QueryResultRow[]> {
    const scope = input.personaId ? 'AND v.persona_id = $6::bigint' : input.vinculacionId ? 'AND v.id = $6::bigint' : '';
    const values = input.personaId || input.vinculacionId
      ? [input.periodoId, input.fechaInicio, input.fechaFin, input.exclusionReason, input.contratoId, input.personaId ?? input.vinculacionId]
      : [input.periodoId, input.fechaInicio, input.fechaFin, input.exclusionReason, input.contratoId];
    const retirement = effectiveRetirementSql;
    const result = await executor.query(
      `WITH excluded AS (
         UPDATE nomina_empleados ne SET activo = FALSE,
           motivo_caso_especial = concat_ws(' | ', NULLIF(ne.motivo_caso_especial, ''), $4::text)
         FROM vinculaciones v WHERE ne.periodo_id = $1::bigint AND v.id = ne.vinculacion_id ${scope}
           AND COALESCE(ne.activo, TRUE) AND (v.contrato_id <> $5::bigint OR v.fecha_inicio > $3::date
             OR ${retirement} < $2::date)
         RETURNING ne.id, ne.vinculacion_id, ne.revisado, ne.detalle_calculo
       ) SELECT e.id::text, (e.revisado OR e.detalle_calculo IS NOT NULL
         OR EXISTS (SELECT 1 FROM nomina_asistencia_diaria a WHERE a.periodo_id = $1::bigint AND a.vinculacion_id = e.vinculacion_id)
         OR EXISTS (SELECT 1 FROM nomina_novedades n WHERE n.nomina_empleado_id = e.id)
         OR EXISTS (SELECT 1 FROM nomina_novedad_turnos t WHERE t.nomina_empleado_id = e.id)
         OR EXISTS (SELECT 1 FROM nomina_movimientos m WHERE m.nomina_empleado_id = e.id)
         OR EXISTS (SELECT 1 FROM nomina_ajustes_manuales j WHERE j.nomina_empleado_id = e.id)
         OR EXISTS (SELECT 1 FROM nomina_revision_operativa r WHERE r.nomina_empleado_id = e.id)) AS has_activity
         FROM excluded e`, values);
    return result.rows;
  }

  public async hasEconomicTables(executor: NominaPoblacionRepositoryExecutor): Promise<{ categorias: boolean; cobertura: boolean }> {
    const result = await executor.query<{ categorias: boolean; cobertura: boolean }>(
      `SELECT to_regclass('public.nomina_categorias_salariales') IS NOT NULL AS categorias,
              to_regclass('public.cobertura_asignaciones') IS NOT NULL AS cobertura`);
    return result.rows[0] ?? { categorias: false, cobertura: false };
  }

  public async listMissingCategoryIds(periodoId: string, executor: NominaPoblacionRepositoryExecutor): Promise<string[]> {
    const result = await executor.query<{ id: string }>(`SELECT ne.id::text AS id FROM nomina_empleados ne
      WHERE ne.periodo_id = $1::bigint AND COALESCE(ne.activo, TRUE) = TRUE AND ne.categoria_salarial_id IS NULL`, [periodoId]);
    return result.rows.map(row => row.id);
  }

  public async listMissingCalculationIds(periodoId: string, scopeId: string | null, executor: NominaPoblacionRepositoryExecutor): Promise<string[]> {
    const result = await executor.query<{ id: string }>(`SELECT ne.id::text AS id FROM nomina_empleados ne
      WHERE ne.periodo_id = $1::bigint AND COALESCE(ne.activo, TRUE) = TRUE
        AND ne.categoria_salarial_id IS NOT NULL AND ne.detalle_calculo IS NULL
        AND ($2::bigint IS NOT NULL AND (ne.vinculacion_id = $2::bigint OR EXISTS
          (SELECT 1 FROM vinculaciones vv WHERE vv.id = ne.vinculacion_id AND vv.persona_id = $2::bigint)))`, [periodoId, scopeId]);
    return result.rows.map(row => row.id);
  }

  public async resolveEconomicCategories(employeeIds: string[], executor: NominaPoblacionRepositoryExecutor): Promise<string[]> {
    if (!employeeIds.length) return [];
    const result = await executor.query<{ id: string }>(`WITH employee_scope AS (
      SELECT ne.id AS nomina_empleado_id, ne.vinculacion_id, np.contrato_id,
        np.fecha_inicio AS periodo_inicio, np.fecha_fin AS periodo_fin
      FROM nomina_empleados ne JOIN nomina_periodos np ON np.id = ne.periodo_id
      WHERE ne.id = ANY($1::bigint[])), assignments AS (
      SELECT es.*, ca.focalizacion_final_id, ff.municipio_id, ff.institucion_id, ff.sede_id, m.codigo_base,
        ROW_NUMBER() OVER (PARTITION BY es.nomina_empleado_id ORDER BY CASE WHEN ca.fecha_inicio <= es.periodo_fin
          AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= es.periodo_inicio) THEN 0 ELSE 1 END,
          ca.fecha_inicio DESC, ca.id DESC) AS assignment_rank
      FROM employee_scope es JOIN vinculaciones v ON v.id = es.vinculacion_id
        LEFT JOIN cobertura_asignaciones ca ON ca.vinculacion_id = v.id AND COALESCE(ca.activo, TRUE) = TRUE
        LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id LEFT JOIN modalidades m ON m.id = ff.modalidad_id),
      chosen AS (SELECT * FROM assignments WHERE assignment_rank = 1), caares_grouped AS (
        SELECT ff.municipio_id, ff.institucion_id, ff.sede_id, COUNT(*)::int AS quantity
        FROM cobertura_asignaciones ca JOIN vinculaciones v ON v.id = ca.vinculacion_id
        JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id JOIN modalidades m ON m.id = ff.modalidad_id
        JOIN (SELECT DISTINCT contrato_id, periodo_inicio, periodo_fin FROM employee_scope) es ON es.contrato_id = v.contrato_id
        WHERE COALESCE(ca.activo, TRUE) = TRUE AND v.contrato_id = es.contrato_id
          AND ca.fecha_inicio <= es.periodo_fin AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= es.periodo_inicio)
          AND m.codigo_base = 'CAARES' GROUP BY ff.municipio_id, ff.institucion_id, ff.sede_id),
      resolved AS (SELECT c.nomina_empleado_id, CASE WHEN c.codigo_base = 'CAARES'
        THEN CASE WHEN COALESCE(g.quantity, 0) = 1 THEN 'CAARES1' ELSE 'CAARES3' END
        ELSE c.codigo_base END AS category_code, c.contrato_id, c.periodo_inicio, c.periodo_fin
        FROM chosen c LEFT JOIN caares_grouped g ON g.municipio_id = c.municipio_id
          AND g.institucion_id = c.institucion_id AND g.sede_id = c.sede_id)
      UPDATE nomina_empleados ne SET categoria_salarial_id = ncs.id FROM resolved r
      JOIN nomina_categorias_salariales ncs ON ncs.contrato_id = r.contrato_id
        AND UPPER(BTRIM(ncs.codigo_categoria)) = UPPER(BTRIM(r.category_code))
        AND COALESCE(ncs.activo, TRUE) = TRUE AND (ncs.vigente_desde IS NULL OR ncs.vigente_desde <= r.periodo_fin)
        AND (ncs.vigente_hasta IS NULL OR ncs.vigente_hasta >= r.periodo_inicio)
      WHERE ne.id = r.nomina_empleado_id AND ne.categoria_salarial_id IS NULL
      RETURNING ne.id::text AS id`, [employeeIds]);
    return result.rows.map(row => row.id);
  }

  public async hasOperationalSnapshotTable(executor: NominaPoblacionRepositoryExecutor): Promise<boolean> {
    const result = await executor.query<{ exists: boolean }>(`SELECT to_regclass('public.nomina_contextos_operativos_base') IS NOT NULL AS exists`);
    return result.rows[0]?.exists === true;
  }

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
