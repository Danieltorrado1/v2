import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';

export interface NominaPeriodoRepositoryRow extends QueryResultRow {
  activo: boolean;
  contrato_empresa_id: string | null;
  contrato_entidad_contratante: string | null;
  contrato_fecha_finalizacion: Date | string | null;
  contrato_fecha_inicio: Date | string | null;
  contrato_id: string;
  contrato_numero: string | null;
  created_at: Date | string;
  estado: string;
  fecha_fin: Date | string;
  fecha_inicio: Date | string;
  id: string;
  nombre_periodo: string;
  requiere_asistencia: boolean;
  tipo_periodo: string;
}

export interface NominaPeriodoRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaPeriodoTenantScope {
  contratoIds: number[];
  empresaIds: number[];
  isGlobalAdmin: boolean;
}

export interface ListNominaPeriodosRepositoryInput {
  contratoId?: string | null;
  empresaId?: string | null;
  estado?: string | null;
  limit: number;
  page: number;
  tenant?: NominaPeriodoTenantScope;
}

export interface ListNominaPeriodosRepositoryResult {
  rows: NominaPeriodoRepositoryRow[];
  total: number;
}

export interface NominaPeriodoIdentity {
  contrato_id: string;
  fecha_fin: string;
  fecha_inicio: string;
  tipo_periodo: string;
}

export interface NominaContratoScopeRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

export interface CreateNominaPeriodoRepositoryInput extends NominaPeriodoIdentity {
  activo: boolean;
  nombre_periodo: string;
  requiere_asistencia: boolean;
}

export interface UpdateNominaPeriodoRepositoryInput {
  activo: boolean;
  contrato_id: string;
  fecha_fin: string;
  fecha_inicio: string;
  nombre_periodo: string;
  periodo_id: string;
  requiere_asistencia: boolean;
  tipo_periodo: string;
}

const periodSelect = `
  SELECT
    np.id::text AS id,
    np.contrato_id::text AS contrato_id,
    np.nombre_periodo,
    np.fecha_inicio,
    np.fecha_fin,
    np.tipo_periodo,
    COALESCE(np.requiere_asistencia, FALSE) AS requiere_asistencia,
    np.estado,
    COALESCE(np.activo, TRUE) AS activo,
    np.created_at,
    c.empresa_id::text AS contrato_empresa_id,
    c.numero_contrato AS contrato_numero,
    c.entidad_contratante AS contrato_entidad_contratante,
    c.fecha_inicio AS contrato_fecha_inicio,
    c.fecha_finalizacion AS contrato_fecha_finalizacion
  FROM nomina_periodos np
  INNER JOIN contratos c ON c.id = np.contrato_id
`;

const getExecutor = (
  executor?: NominaPeriodoRepositoryExecutor
): NominaPeriodoRepositoryExecutor => executor ?? (dbPool as NominaPeriodoRepositoryExecutor);

const appendScope = (
  conditions: string[],
  params: unknown[],
  tenant?: NominaPeriodoTenantScope
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
    scopeConditions.push(`c.empresa_id = ANY($${params.length}::bigint[])`);
  }

  conditions.push(scopeConditions.length > 0 ? `(${scopeConditions.join(' OR ')})` : '1 = 0');
};

export class NominaPeriodoRepository {
  public async findContratoScope(
    contratoId: string,
    executor?: NominaPeriodoRepositoryExecutor
  ): Promise<NominaContratoScopeRow | null> {
    const result = await getExecutor(executor).query<NominaContratoScopeRow>(
      `SELECT c.id::text AS id, c.empresa_id::text AS empresa_id
       FROM contratos c WHERE c.id = $1::bigint LIMIT 1`,
      [contratoId]
    );
    return result.rows[0] ?? null;
  }

  public async list(
    input: ListNominaPeriodosRepositoryInput,
    executor?: NominaPeriodoRepositoryExecutor
  ): Promise<ListNominaPeriodosRepositoryResult> {
    const queryExecutor = getExecutor(executor);
    const conditions: string[] = [];
    const params: unknown[] = [];

    appendScope(conditions, params, input.tenant);

    if (input.contratoId) {
      params.push(input.contratoId);
      conditions.push(`np.contrato_id = $${params.length}::bigint`);
    }

    if (input.empresaId) {
      params.push(input.empresaId);
      conditions.push(`c.empresa_id = $${params.length}::bigint`);
    }

    if (input.estado) {
      params.push(input.estado);
      conditions.push(`np.estado = $${params.length}`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await queryExecutor.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM nomina_periodos np
        INNER JOIN contratos c ON c.id = np.contrato_id
        ${whereSql}
      `,
      params
    );

    const total = countResult.rows[0]?.total ?? 0;
    const offset = (input.page - 1) * input.limit;
    const listParams = [...params, input.limit, offset];
    const result = await queryExecutor.query<NominaPeriodoRepositoryRow>(
      `
        ${periodSelect}
        ${whereSql}
        ORDER BY np.fecha_inicio DESC, np.id DESC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `,
      listParams
    );

    return { rows: result.rows, total };
  }

  public async findById(
    periodoId: string,
    executor?: NominaPeriodoRepositoryExecutor
  ): Promise<NominaPeriodoRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaPeriodoRepositoryRow>(
      `
        ${periodSelect}
        WHERE np.id = $1::bigint
        LIMIT 1
      `,
      [periodoId]
    );

    return result.rows[0] ?? null;
  }

  public async findByIdentity(
    input: NominaPeriodoIdentity,
    executor?: NominaPeriodoRepositoryExecutor
  ): Promise<NominaPeriodoRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaPeriodoRepositoryRow>(
      `
        ${periodSelect}
        WHERE np.contrato_id = $1::bigint
          AND np.fecha_inicio = $2::date
          AND np.fecha_fin = $3::date
          AND np.tipo_periodo = $4
        ORDER BY np.id ASC
        LIMIT 1
      `,
      [input.contrato_id, input.fecha_inicio, input.fecha_fin, input.tipo_periodo]
    );

    return result.rows[0] ?? null;
  }

  public async lockIdentity(
    input: NominaPeriodoIdentity,
    executor: NominaPeriodoRepositoryExecutor
  ): Promise<void> {
    const identity = [input.contrato_id, input.fecha_inicio, input.fecha_fin, input.tipo_periodo].join('|');
    await executor.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);
  }

  public async create(
    input: CreateNominaPeriodoRepositoryInput,
    executor: NominaPeriodoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO nomina_periodos (
          contrato_id,
          nombre_periodo,
          fecha_inicio,
          fecha_fin,
          tipo_periodo,
          requiere_asistencia,
          estado,
          activo
        )
        VALUES ($1::bigint, $2, $3, $4, $5, $6, 'ABIERTO', $7)
        RETURNING id::text AS id
      `,
      [
        input.contrato_id,
        input.nombre_periodo,
        input.fecha_inicio,
        input.fecha_fin,
        input.tipo_periodo,
        input.requiere_asistencia,
        input.activo
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('NominaPeriodoRepository.create returned no id');
    }

    return row.id;
  }

  public async update(
    input: UpdateNominaPeriodoRepositoryInput,
    executor: NominaPeriodoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        UPDATE nomina_periodos
        SET
          contrato_id = $2::bigint,
          nombre_periodo = $3,
          fecha_inicio = $4,
          fecha_fin = $5,
          tipo_periodo = $6,
          requiere_asistencia = $7,
          activo = $8
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        input.periodo_id,
        input.contrato_id,
        input.nombre_periodo,
        input.fecha_inicio,
        input.fecha_fin,
        input.tipo_periodo,
        input.requiere_asistencia,
        input.activo
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('NominaPeriodoRepository.update returned no id');
    }

    return row.id;
  }

  public async updateState(
    periodoId: string,
    estado: string,
    executor: NominaPeriodoRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        UPDATE nomina_periodos
        SET estado = $2
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [periodoId, estado]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('NominaPeriodoRepository.updateState returned no id');
    }

    return row.id;
  }
}

export const nominaPeriodoRepository = new NominaPeriodoRepository();
