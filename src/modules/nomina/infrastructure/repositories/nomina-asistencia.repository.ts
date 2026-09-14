import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';
import type { TenantAccessContext } from '../../../../middlewares/tenantMiddleware';
import { appendNominaCoberturaScope } from '../../nomina.procesos';

export interface NominaAsistenciaRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaAsistenciaRepositoryRow extends QueryResultRow {
  activo: boolean | null;
  cargo_id: string | null;
  cargo_nombre: string | null;
  created_at: Date | string;
  estado_dia: string | null;
  fecha: Date | string;
  hora_ingreso: string | null;
  hora_salida: string | null;
  horas_trabajadas: number | string | null;
  id: string;
  observacion: string | null;
  periodo_contrato_id: string;
  periodo_estado: string;
  periodo_id: string;
  periodo_nombre: string;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  vinculacion_id: string;
}

export interface ListNominaAsistenciaRepositoryInput {
  activo?: boolean;
  estadoDia?: string | null;
  fecha?: string | null;
  limit: number;
  page: number;
  periodoId: string;
  tenant?: TenantAccessContext;
  vinculacionId?: string | null;
}

export interface ListNominaAsistenciaRepositoryResult {
  rows: NominaAsistenciaRepositoryRow[];
  total: number;
}

export interface UpsertNominaAsistenciaInput {
  fecha: string;
  periodoId: string;
  presente: boolean;
  vinculacionId: string;
  observacionPresentada?: string;
  observacionPendiente?: string;
}

export interface UpsertNominaAsistenciaResult {
  created: boolean;
  id: string | null;
}

const attendanceSelect = `
  SELECT
    nad.id::text AS id,
    nad.periodo_id::text AS periodo_id,
    nad.vinculacion_id::text AS vinculacion_id,
    nad.fecha,
    nad.hora_ingreso::text AS hora_ingreso,
    nad.hora_salida::text AS hora_salida,
    nad.horas_trabajadas,
    nad.estado_dia,
    nad.observacion,
    COALESCE(nad.activo, TRUE) AS activo,
    nad.created_at,
    np.contrato_id::text AS periodo_contrato_id,
    np.estado AS periodo_estado,
    np.nombre_periodo AS periodo_nombre,
    p.id::text AS persona_id,
    p.numero_documento AS persona_numero_documento,
    p.primer_nombre,
    p.segundo_nombre,
    p.primer_apellido,
    p.segundo_apellido,
    cc.id::text AS cargo_id,
    cc.nombre_cargo AS cargo_nombre
  FROM nomina_asistencia_diaria nad
  INNER JOIN nomina_periodos np ON np.id = nad.periodo_id
  INNER JOIN vinculaciones v ON v.id = nad.vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
  LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
`;

const getExecutor = (
  executor?: NominaAsistenciaRepositoryExecutor
): NominaAsistenciaRepositoryExecutor => executor ?? (dbPool as NominaAsistenciaRepositoryExecutor);

const appendTenantScope = (
  conditions: string[],
  params: unknown[],
  tenant?: TenantAccessContext
): void => {
  if (!tenant || tenant.isGlobalAdmin) return;

  const scopeConditions: string[] = [];
  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    scopeConditions.push(`v.contrato_id = ANY($${params.length}::bigint[])`);
  }
  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    scopeConditions.push(`v.empresa_id = ANY($${params.length}::bigint[])`);
  }
  conditions.push(scopeConditions.length > 0 ? `(${scopeConditions.join(' OR ')})` : '1 = 0');
};

export class NominaAsistenciaRepository {
  public async getById(
    asistenciaId: string,
    executor?: NominaAsistenciaRepositoryExecutor
  ): Promise<NominaAsistenciaRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaAsistenciaRepositoryRow>(
      `${attendanceSelect} WHERE nad.id = $1::bigint LIMIT 1`,
      [asistenciaId]
    );
    return result.rows[0] ?? null;
  }

  public async listByPeriodo(
    input: ListNominaAsistenciaRepositoryInput,
    executor?: NominaAsistenciaRepositoryExecutor
  ): Promise<ListNominaAsistenciaRepositoryResult> {
    const queryExecutor = getExecutor(executor);
    const params: unknown[] = [input.periodoId];
    const conditions = ['nad.periodo_id = $1::bigint'];
    appendNominaCoberturaScope(conditions, params, input.tenant);
    appendTenantScope(conditions, params, input.tenant);

    if (input.vinculacionId) {
      params.push(input.vinculacionId);
      conditions.push(`nad.vinculacion_id = $${params.length}::bigint`);
    }
    if (input.fecha) {
      params.push(input.fecha);
      conditions.push(`nad.fecha = $${params.length}::date`);
    }
    if (input.estadoDia) {
      params.push(input.estadoDia);
      conditions.push(`nad.estado_dia = $${params.length}`);
    }
    if (input.activo !== undefined) {
      params.push(input.activo);
      conditions.push(`COALESCE(nad.activo, TRUE) = $${params.length}`);
    }

    const whereSql = `WHERE ${conditions.join(' AND ')}`;
    const fromSql = `
      FROM nomina_asistencia_diaria nad
      INNER JOIN nomina_periodos np ON np.id = nad.periodo_id
      INNER JOIN vinculaciones v ON v.id = nad.vinculacion_id
    `;
    const count = await queryExecutor.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total ${fromSql} ${whereSql}`,
      params
    );
    const total = count.rows[0]?.total ?? 0;
    const offset = (input.page - 1) * input.limit;
    const listParams = [...params, input.limit, offset];
    const result = await queryExecutor.query<NominaAsistenciaRepositoryRow>(
      `
        ${attendanceSelect}
        ${whereSql}
        ORDER BY nad.fecha ASC, p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, nad.id ASC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `,
      listParams
    );
    return { rows: result.rows, total };
  }

  public async listPresentByRango(
    periodoId: string,
    vinculacionId: string,
    fechaInicio: string,
    fechaFin: string,
    executor: NominaAsistenciaRepositoryExecutor
  ): Promise<Array<{ fecha: string }>> {
    const result = await executor.query<{ fecha: string }>(
      `
        SELECT fecha::text AS fecha
        FROM nomina_asistencia_diaria
        WHERE periodo_id = $1::bigint
          AND vinculacion_id = $2::bigint
          AND COALESCE(activo, TRUE) = TRUE
          AND estado_dia = 'PRESENTE'
          AND fecha >= $3::date
          AND fecha <= $4::date
        ORDER BY fecha ASC
      `,
      [periodoId, vinculacionId, fechaInicio, fechaFin]
    );
    return result.rows;
  }

  public async upsert(
    input: UpsertNominaAsistenciaInput,
    executor: NominaAsistenciaRepositoryExecutor
  ): Promise<UpsertNominaAsistenciaResult> {
    const existing = await executor.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM nomina_asistencia_diaria
        WHERE periodo_id = $1::bigint
          AND vinculacion_id = $2::bigint
          AND fecha = $3::date
        ORDER BY id DESC
        LIMIT 1
      `,
      [input.periodoId, input.vinculacionId, input.fecha]
    );
    const estado = input.presente ? 'PRESENTE' : 'PENDIENTE';
    const observacion = input.presente
      ? input.observacionPresentada ?? 'Asistencia confirmada desde planilla'
      : input.observacionPendiente ?? 'Asistencia desmarcada';

    if (existing.rows[0]) {
      await executor.query(
        `
          UPDATE nomina_asistencia_diaria
          SET estado_dia = $2, activo = TRUE, observacion = $3
          WHERE id = $1::bigint
        `,
        [existing.rows[0].id, estado, observacion]
      );
      return { created: false, id: existing.rows[0].id };
    }

    if (!input.presente) return { created: false, id: null };

    const inserted = await executor.query<{ id: string }>(
      `
        INSERT INTO nomina_asistencia_diaria
          (periodo_id, vinculacion_id, fecha, estado_dia, activo, observacion)
        VALUES ($1::bigint, $2::bigint, $3::date, 'PRESENTE', TRUE, $4)
        RETURNING id::text AS id
      `,
      [input.periodoId, input.vinculacionId, input.fecha, observacion]
    );
    return { created: true, id: inserted.rows[0]?.id ?? null };
  }

  public async bulkUpsert(
    inputs: UpsertNominaAsistenciaInput[],
    executor: NominaAsistenciaRepositoryExecutor
  ): Promise<UpsertNominaAsistenciaResult[]> {
    const results: UpsertNominaAsistenciaResult[] = [];
    for (const input of inputs) results.push(await this.upsert(input, executor));
    return results;
  }

  public async replacePresentByRango(
    periodoId: string,
    vinculacionId: string,
    fechaInicio: string,
    fechaFin: string,
    observacion: string,
    executor: NominaAsistenciaRepositoryExecutor
  ): Promise<void> {
    await executor.query(
      `
        UPDATE nomina_asistencia_diaria
        SET estado_dia = 'PENDIENTE', activo = TRUE, observacion = $5
        WHERE periodo_id = $1::bigint
          AND vinculacion_id = $2::bigint
          AND COALESCE(activo, TRUE) = TRUE
          AND estado_dia = 'PRESENTE'
          AND fecha >= $3::date
          AND fecha <= $4::date
      `,
      [periodoId, vinculacionId, fechaInicio, fechaFin, observacion]
    );
  }
}

export const nominaAsistenciaRepository = new NominaAsistenciaRepository();
