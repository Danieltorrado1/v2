import type { QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';
import type { TenantAccessContext } from '../../../../middlewares/tenantMiddleware';
import { appendNominaCoberturaScope } from '../../nomina.procesos';

export interface NominaMovimientoRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaMovimientoRepositoryRow extends QueryResultRow {
  [key: string]: any;
}

export interface ListNominaMovimientoRepositoryInput {
  activo?: boolean;
  estado?: string | null;
  familiaMovimiento?: string | null;
  limit: number;
  nominaEmpleadoId?: string | null;
  page: number;
  periodoId?: string | null;
  tenant?: TenantAccessContext;
  tipoMovimiento?: string | null;
  vinculacionId?: string | null;
}

export interface CreateNominaMovimientoRepositoryInput {
  activo: boolean;
  afecta_seguridad_social: boolean;
  alertas_validacion: string;
  aprobado_at: string | null;
  aprobado_por: string | null;
  cantidad: number | null;
  contexto_institucion: string | null;
  contexto_modalidad: string | null;
  contexto_municipio: string | null;
  contexto_sede: string | null;
  descripcion: string | null;
  documento_persona_id: string | null;
  es_deduccion: boolean;
  es_devengado: boolean;
  estado: string;
  familia_movimiento: string;
  fecha: string | null;
  institucion_id: string | null;
  modalidad_id: string | null;
  motivo_ajuste_valor: string | null;
  motivo_estado: string | null;
  municipio_id: string | null;
  nomina_empleado_id: string;
  periodo_id: string;
  persona_reemplazada_id: string | null;
  posible_duplicado: boolean;
  rechazado_at: string | null;
  rechazado_por: string | null;
  revisado_at: string | null;
  revisado_por: string | null;
  sede_id: string | null;
  tarifa_config_id: string | null;
  tipo_movimiento: string;
  valor_calculado: number | null;
  valor_total: number | null;
  valor_unitario: number | null;
  vinculacion_id: string;
  vinculacion_reemplazada_id: string | null;
  updated_by: string | null;
}

export interface UpdateNominaMovimientoRepositoryInput extends CreateNominaMovimientoRepositoryInput {
  id: string;
}

const movementSelect = `
  SELECT
    nm.id::text AS id,
    nm.periodo_id::text AS periodo_id,
    nm.nomina_empleado_id::text AS nomina_empleado_id,
    nm.vinculacion_id::text AS vinculacion_id,
    nm.fecha,
    nm.tipo_movimiento,
    nm.familia_movimiento,
    nm.estado,
    nm.descripcion,
    nm.cantidad,
    nm.valor_unitario,
    nm.valor_calculado,
    nm.valor_total,
    COALESCE(nm.es_devengado, TRUE) AS es_devengado,
    COALESCE(nm.es_deduccion, FALSE) AS es_deduccion,
    COALESCE(nm.afecta_seguridad_social, TRUE) AS afecta_seguridad_social,
    COALESCE(nm.activo, TRUE) AS activo,
    nm.documento_persona_id::text AS documento_persona_id,
    nm.externo_id::text AS externo_id,
    nm.persona_reemplazada_id::text AS persona_reemplazada_id,
    nm.vinculacion_reemplazada_id::text AS vinculacion_reemplazada_id,
    nm.municipio_id::text AS municipio_id,
    nm.institucion_id::text AS institucion_id,
    nm.sede_id::text AS sede_id,
    nm.modalidad_id::text AS modalidad_id,
    nm.contexto_municipio,
    nm.contexto_institucion,
    nm.contexto_sede,
    nm.contexto_modalidad,
    nm.tarifa_config_id::text AS tarifa_config_id,
    nm.motivo_ajuste_valor,
    nm.motivo_estado,
    nm.alertas_validacion,
    COALESCE(nm.posible_duplicado, FALSE) AS posible_duplicado,
    nm.revisado_por::text AS revisado_por,
    nm.revisado_at,
    nm.aprobado_por::text AS aprobado_por,
    nm.aprobado_at,
    nm.rechazado_por::text AS rechazado_por,
    nm.rechazado_at,
    nm.updated_at,
    nm.updated_by::text AS updated_by,
    nm.created_at,
    np.contrato_id::text AS periodo_contrato_id,
    np.estado AS periodo_estado,
    np.nombre_periodo AS periodo_nombre,
    p.id::text AS persona_id,
    p.numero_documento AS persona_numero_documento,
    p.primer_nombre,
    p.segundo_nombre,
    p.primer_apellido,
    p.segundo_apellido,
    pr.numero_documento AS persona_reemplazada_numero_documento,
    pr.primer_nombre AS persona_reemplazada_primer_nombre,
    pr.segundo_nombre AS persona_reemplazada_segundo_nombre,
    pr.primer_apellido AS persona_reemplazada_primer_apellido,
    pr.segundo_apellido AS persona_reemplazada_segundo_apellido,
    ce.nombre_completo AS externo_nombre,
    ce.numero_documento AS externo_numero_documento
  FROM nomina_movimientos nm
  INNER JOIN nomina_periodos np ON np.id = nm.periodo_id
  INNER JOIN vinculaciones v ON v.id = nm.vinculacion_id
  INNER JOIN contratos c ON c.id = np.contrato_id
  INNER JOIN personas p ON p.id = v.persona_id
  LEFT JOIN personas pr ON pr.id = nm.persona_reemplazada_id
  LEFT JOIN cobertura_externos ce ON ce.id = nm.externo_id
`;

const getExecutor = (executor?: NominaMovimientoRepositoryExecutor): NominaMovimientoRepositoryExecutor =>
  executor ?? (dbPool as NominaMovimientoRepositoryExecutor);

const appendTenantScope = (
  conditions: string[],
  params: unknown[],
  tenant?: TenantAccessContext
): void => {
  if (!tenant || tenant.isGlobalAdmin) return;
  const scope: string[] = [];
  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    scope.push(`np.contrato_id = ANY($${params.length}::bigint[])`);
  }
  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    scope.push(`c.empresa_id = ANY($${params.length}::bigint[])`);
  }
  conditions.push(scope.length > 0 ? `(${scope.join(' OR ')})` : '1 = 0');
};

const buildWhere = (input: ListNominaMovimientoRepositoryInput) => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  appendTenantScope(conditions, params, input.tenant);
  appendNominaCoberturaScope(conditions, params, input.tenant);
  if (input.periodoId) { params.push(input.periodoId); conditions.push(`nm.periodo_id = $${params.length}::bigint`); }
  if (input.nominaEmpleadoId) { params.push(input.nominaEmpleadoId); conditions.push(`nm.nomina_empleado_id = $${params.length}::bigint`); }
  if (input.vinculacionId) { params.push(input.vinculacionId); conditions.push(`nm.vinculacion_id = $${params.length}::bigint`); }
  if (input.tipoMovimiento) { params.push(input.tipoMovimiento); conditions.push(`nm.tipo_movimiento = $${params.length}`); }
  if (input.estado) { params.push(input.estado); conditions.push(`nm.estado = $${params.length}`); }
  if (input.familiaMovimiento) { params.push(input.familiaMovimiento); conditions.push(`nm.familia_movimiento = $${params.length}`); }
  if (input.activo !== undefined) { params.push(input.activo); conditions.push(`COALESCE(nm.activo, TRUE) = $${params.length}`); }
  return { conditions, params };
};

const valuesForCreate = (input: CreateNominaMovimientoRepositoryInput): unknown[] => [
  input.periodo_id, input.nomina_empleado_id, input.vinculacion_id, input.fecha,
  input.tipo_movimiento, input.familia_movimiento, input.estado, input.descripcion,
  input.cantidad, input.valor_unitario, input.valor_calculado, input.valor_total,
  input.documento_persona_id, input.persona_reemplazada_id, input.vinculacion_reemplazada_id,
  input.municipio_id, input.institucion_id, input.sede_id, input.modalidad_id,
  input.contexto_municipio, input.contexto_institucion, input.contexto_sede, input.contexto_modalidad,
  input.tarifa_config_id, input.motivo_ajuste_valor, input.motivo_estado, input.alertas_validacion,
  input.posible_duplicado, input.revisado_por, input.revisado_at, input.aprobado_por, input.aprobado_at,
  input.rechazado_por, input.rechazado_at, input.es_devengado, input.es_deduccion,
  input.afecta_seguridad_social, input.activo, input.updated_by
];

const movementWriteColumns = `
  periodo_id, nomina_empleado_id, vinculacion_id, fecha, tipo_movimiento, familia_movimiento,
  estado, descripcion, cantidad, valor_unitario, valor_calculado, valor_total,
  documento_persona_id, persona_reemplazada_id, vinculacion_reemplazada_id, municipio_id,
  institucion_id, sede_id, modalidad_id, contexto_municipio, contexto_institucion,
  contexto_sede, contexto_modalidad, tarifa_config_id, motivo_ajuste_valor, motivo_estado,
  alertas_validacion, posible_duplicado, revisado_por, revisado_at, aprobado_por, aprobado_at,
  rechazado_por, rechazado_at, es_devengado, es_deduccion, afecta_seguridad_social, activo, updated_by
`;

const movementWriteValues = `
  $1::bigint, $2::bigint, $3::bigint, $4::date, $5, $6, $7, $8, $9, $10, $11, $12,
  $13::bigint, $14::bigint, $15::bigint, $16::bigint, $17::bigint, $18::bigint,
  $19::bigint, $20, $21, $22, $23, $24::bigint, $25, $26, $27::jsonb, $28,
  $29::bigint, $30::timestamptz, $31::bigint, $32::timestamptz, $33::bigint,
  $34::timestamptz, $35, $36, $37, $38, $39::bigint
`;

export class NominaMovimientoRepository {
  public async getById(
    id: string,
    tenant?: TenantAccessContext,
    executor?: NominaMovimientoRepositoryExecutor
  ): Promise<NominaMovimientoRepositoryRow | null> {
    const { conditions, params } = buildWhere({ limit: 1, page: 1, tenant });
    params.push(id);
    conditions.push(`nm.id = $${params.length}::bigint`);
    const result = await getExecutor(executor).query<NominaMovimientoRepositoryRow>(
      `${movementSelect} WHERE ${conditions.join(' AND ')} LIMIT 1`, params
    );
    return result.rows[0] ?? null;
  }

  public async list(
    input: ListNominaMovimientoRepositoryInput,
    executor?: NominaMovimientoRepositoryExecutor
  ): Promise<{ rows: NominaMovimientoRepositoryRow[]; total: number }> {
    const queryExecutor = getExecutor(executor);
    const { conditions, params } = buildWhere(input);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await queryExecutor.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM nomina_movimientos nm INNER JOIN nomina_periodos np ON np.id = nm.periodo_id INNER JOIN vinculaciones v ON v.id = nm.vinculacion_id INNER JOIN contratos c ON c.id = np.contrato_id ${where}`,
      params
    );
    const total = count.rows[0]?.total ?? 0;
    const listParams = [...params, input.limit, (input.page - 1) * input.limit];
    const result = await queryExecutor.query<NominaMovimientoRepositoryRow>(
      `${movementSelect} ${where} ORDER BY nm.created_at DESC, nm.id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return { rows: result.rows, total };
  }

  public async create(input: CreateNominaMovimientoRepositoryInput, executor: NominaMovimientoRepositoryExecutor): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `INSERT INTO nomina_movimientos (${movementWriteColumns}) VALUES (${movementWriteValues}) RETURNING id::text AS id`,
      valuesForCreate(input)
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaMovimientoRepository.create returned no id');
    return row.id;
  }

  public async update(input: UpdateNominaMovimientoRepositoryInput, executor: NominaMovimientoRepositoryExecutor): Promise<string> {
    const values = valuesForCreate(input);
    const result = await executor.query<{ id: string }>(
      `
        UPDATE nomina_movimientos SET
          periodo_id = $2::bigint, nomina_empleado_id = $3::bigint, vinculacion_id = $4::bigint,
          fecha = $5::date, tipo_movimiento = $6, familia_movimiento = $7, estado = $8,
          descripcion = $9, cantidad = $10, valor_unitario = $11, valor_calculado = $12,
          valor_total = $13, documento_persona_id = $14::bigint, persona_reemplazada_id = $15::bigint,
          vinculacion_reemplazada_id = $16::bigint, municipio_id = $17::bigint, institucion_id = $18::bigint,
          sede_id = $19::bigint, modalidad_id = $20::bigint, contexto_municipio = $21,
          contexto_institucion = $22, contexto_sede = $23, contexto_modalidad = $24,
          tarifa_config_id = $25::bigint, motivo_ajuste_valor = $26, motivo_estado = $27,
          alertas_validacion = $28::jsonb, posible_duplicado = $29, revisado_por = $30::bigint,
          revisado_at = $31::timestamptz, aprobado_por = $32::bigint, aprobado_at = $33::timestamptz,
          rechazado_por = $34::bigint, rechazado_at = $35::timestamptz, es_devengado = $36,
          es_deduccion = $37, afecta_seguridad_social = $38, activo = $39,
          updated_at = NOW(), updated_by = $40::bigint
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [input.id, ...values]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaMovimientoRepository.update found no row');
    return row.id;
  }

  public async deactivate(id: string, updatedBy: string, executor: NominaMovimientoRepositoryExecutor): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `UPDATE nomina_movimientos SET activo = FALSE, updated_at = NOW(), updated_by = $2::bigint WHERE id = $1::bigint RETURNING id::text AS id`,
      [id, updatedBy]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaMovimientoRepository.deactivate found no row');
    return row.id;
  }
}

export const nominaMovimientoRepository = new NominaMovimientoRepository();
