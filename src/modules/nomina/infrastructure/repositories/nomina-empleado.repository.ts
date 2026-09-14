import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';

export interface NominaEmpleadoRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaEmpleadoTenantScope {
  contratoIds: number[];
  empresaIds: number[];
  isGlobalAdmin: boolean;
}

export interface NominaEmpleadoRepositoryRow extends QueryResultRow {
  activo: boolean;
  estado: string | null;
  id: string;
  periodo_contrato_id: string;
  periodo_estado: string;
  periodo_id: string;
  revisado: boolean;
  vinculacion_id: string;
}

export interface ListNominaEmpleadoRepositoryInput {
  contratoId?: string | null;
  empresaId?: string | null;
  limit: number;
  page: number;
  periodoId: string;
  tenant?: NominaEmpleadoTenantScope;
  vinculacionId?: string | null;
}

export interface ListNominaEmpleadoRepositoryResult {
  rows: NominaEmpleadoRepositoryRow[];
  total: number;
}

export interface UpdateNominaEmpleadoReviewInput {
  empleadoId: string;
  estado: string;
  revisado: boolean;
}

const employeeSelect = `
  SELECT
    ne.id::text AS id,
    ne.periodo_id::text AS periodo_id,
    ne.vinculacion_id::text AS vinculacion_id,
    COALESCE(ne.revisado, FALSE) AS revisado,
    ne.estado,
    COALESCE(ne.activo, TRUE) AS activo,
    np.contrato_id::text AS periodo_contrato_id,
    np.estado AS periodo_estado
  FROM nomina_empleados ne
  INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
`;

const getExecutor = (
  executor?: NominaEmpleadoRepositoryExecutor
): NominaEmpleadoRepositoryExecutor => executor ?? (dbPool as NominaEmpleadoRepositoryExecutor);

const appendTenantScope = (
  conditions: string[],
  params: unknown[],
  tenant?: NominaEmpleadoTenantScope
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  const scopeConditions: string[] = [];

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    scopeConditions.push(`np.contrato_id = ANY($${params.length}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    scopeConditions.push(`v.empresa_id = ANY($${params.length}::bigint[])`);
  }

  conditions.push(scopeConditions.length > 0 ? `(${scopeConditions.join(' OR ')})` : '1 = 0');
};

export class NominaEmpleadoRepository {
  public async getById(
    empleadoId: string,
    executor?: NominaEmpleadoRepositoryExecutor
  ): Promise<NominaEmpleadoRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaEmpleadoRepositoryRow>(
      `
        ${employeeSelect}
        WHERE ne.id = $1::bigint
        LIMIT 1
      `,
      [empleadoId]
    );

    return result.rows[0] ?? null;
  }

  public async getByPeriodoVinculacion(
    periodoId: string,
    vinculacionId: string,
    executor?: NominaEmpleadoRepositoryExecutor
  ): Promise<NominaEmpleadoRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaEmpleadoRepositoryRow>(
      `
        ${employeeSelect}
        WHERE ne.periodo_id = $1::bigint
          AND ne.vinculacion_id = $2::bigint
        ORDER BY ne.id ASC
        LIMIT 1
      `,
      [periodoId, vinculacionId]
    );

    return result.rows[0] ?? null;
  }

  public async listByPeriodo(
    input: ListNominaEmpleadoRepositoryInput,
    executor?: NominaEmpleadoRepositoryExecutor
  ): Promise<ListNominaEmpleadoRepositoryResult> {
    const queryExecutor = getExecutor(executor);
    const conditions = ['ne.periodo_id = $1::bigint'];
    const params: unknown[] = [input.periodoId];

    appendTenantScope(conditions, params, input.tenant);

    if (input.contratoId) {
      params.push(input.contratoId);
      conditions.push(`np.contrato_id = $${params.length}::bigint`);
    }

    if (input.empresaId) {
      params.push(input.empresaId);
      conditions.push(`v.empresa_id = $${params.length}::bigint`);
    }

    if (input.vinculacionId) {
      params.push(input.vinculacionId);
      conditions.push(`ne.vinculacion_id = $${params.length}::bigint`);
    }

    const whereSql = `WHERE ${conditions.join(' AND ')}`;
    const fromSql = `
      FROM nomina_empleados ne
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
    `;
    const countResult = await queryExecutor.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total ${fromSql} ${whereSql}`,
      params
    );

    const total = countResult.rows[0]?.total ?? 0;
    const offset = (input.page - 1) * input.limit;
    const listParams = [...params, input.limit, offset];
    const result = await queryExecutor.query<NominaEmpleadoRepositoryRow>(
      `
        ${employeeSelect}
        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
        ${whereSql}
        ORDER BY ne.id ASC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `,
      listParams
    );

    return { rows: result.rows, total };
  }

  public async updateReviewState(
    input: UpdateNominaEmpleadoReviewInput,
    executor: NominaEmpleadoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        UPDATE nomina_empleados
        SET revisado = $2,
            estado = $3
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [input.empleadoId, input.revisado, input.estado]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('NominaEmpleadoRepository.updateReviewState returned no id');
    }

    return row.id;
  }
}

export const nominaEmpleadoRepository = new NominaEmpleadoRepository();
