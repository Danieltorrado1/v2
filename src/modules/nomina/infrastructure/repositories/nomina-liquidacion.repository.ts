import type { QueryResult, QueryResultRow } from 'pg';

import type { TenantAccessContext } from '../../../../middlewares/tenantMiddleware';
import { dbPool } from '../../../../config/db';
import { appendNominaCoberturaScope } from '../../nomina.procesos';

export interface NominaLiquidacionRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaLiquidacionRepositoryRow extends QueryResultRow {
  activo: boolean | null;
  archivo_path: string | null;
  auxilio_transporte: number | string | null;
  cesantias: number | string | null;
  contrato_empresa_id: string | null;
  contrato_entidad_contratante: string | null;
  contrato_id: string;
  contrato_numero: string | null;
  created_at: Date | string;
  deducciones: number | string | null;
  dias_base_liquidacion: number | string | null;
  dias_trabajados: number | string | null;
  dias_vacaciones_pendientes: number | string | null;
  documento_persona_id: string | null;
  estado: string;
  fecha_fin_vinculacion: Date | string | null;
  fecha_inicio_vinculacion: Date | string | null;
  fecha_retiro: Date | string | null;
  id: string;
  intereses_cesantias: number | string | null;
  motivo_retiro: string | null;
  observacion: string | null;
  otros_devengos: number | string | null;
  periodo_estado: string;
  periodo_fecha_fin: Date | string;
  periodo_fecha_inicio: Date | string;
  periodo_id: string;
  periodo_nombre: string;
  persona_id: string;
  persona_numero_documento: string | null;
  pension_deduccion_empleado: number | string | null;
  prima_servicios: number | string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  promedio_auxilio_transporte: number | string | null;
  promedio_salario: number | string | null;
  salario_base: number | string | null;
  salud_deduccion_empleado: number | string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  total_liquidacion: number | string | null;
  vacaciones: number | string | null;
  vinculacion_estado: string | null;
  vinculacion_id: string;
}

export interface ListNominaLiquidacionInput {
  estado?: string;
  limit: number;
  page: number;
  periodoId: string;
  personaId?: string;
  tenant?: TenantAccessContext;
  vinculacionId?: string;
}

export interface NominaLiquidacionResultInput {
  auxilioTransporte: number;
  cesantias: number;
  deducciones: number;
  diasBaseLiquidacion: number;
  diasTrabajados: number;
  diasVacacionesPendientes: number;
  fechaFinVinculacion: string | null;
  fechaInicioVinculacion: string;
  fechaRetiro: string;
  interesesCesantias: number;
  motivoRetiro: string | null;
  observacion?: string | null;
  otrosDevengos: number;
  periodoId: string;
  promedioAuxilioTransporte: number;
  promedioSalario: number;
  primaServicios: number;
  salarioBase: number;
  totalLiquidacion: number;
  vacaciones: number;
  vinculacionId: string;
  archivoPath?: string | null;
  documentoPersonaId?: string | null;
}

const liquidationSelect = `
  SELECT
    nl.id::text AS id,
    nl.vinculacion_id::text AS vinculacion_id,
    nl.periodo_id::text AS periodo_id,
    nl.fecha_inicio_vinculacion,
    nl.fecha_fin_vinculacion,
    nl.fecha_retiro,
    nl.motivo_retiro,
    nl.dias_base_liquidacion,
    nl.dias_trabajados,
    nl.dias_vacaciones_pendientes,
    nl.salario_base,
    nl.auxilio_transporte,
    nl.promedio_salario,
    nl.promedio_auxilio_transporte,
    nl.cesantias,
    nl.intereses_cesantias,
    nl.prima_servicios,
    nl.vacaciones,
    nl.otros_devengos,
    nl.deducciones,
    nl.total_liquidacion,
    nl.estado,
    nl.archivo_path,
    nl.documento_persona_id::text AS documento_persona_id,
    nl.observacion,
    COALESCE(nl.activo, TRUE) AS activo,
    nl.created_at,
    p.id::text AS persona_id,
    p.numero_documento AS persona_numero_documento,
    p.primer_nombre,
    p.segundo_nombre,
    p.primer_apellido,
    p.segundo_apellido,
    v.estado_vinculacion AS vinculacion_estado,
    c.id::text AS contrato_id,
    c.empresa_id::text AS contrato_empresa_id,
    c.numero_contrato AS contrato_numero,
    c.entidad_contratante AS contrato_entidad_contratante,
    np.nombre_periodo AS periodo_nombre,
    np.fecha_inicio AS periodo_fecha_inicio,
    np.fecha_fin AS periodo_fecha_fin,
    np.estado AS periodo_estado,
    ne.salud AS salud_deduccion_empleado,
    ne.pension AS pension_deduccion_empleado
  FROM nomina_liquidaciones nl
  INNER JOIN vinculaciones v ON v.id = nl.vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
  INNER JOIN contratos c ON c.id = v.contrato_id
  INNER JOIN nomina_periodos np ON np.id = nl.periodo_id
  LEFT JOIN nomina_empleados ne
    ON ne.periodo_id = nl.periodo_id
   AND ne.vinculacion_id = nl.vinculacion_id
`;

const getExecutor = (
  executor?: NominaLiquidacionRepositoryExecutor
): NominaLiquidacionRepositoryExecutor => executor ?? (dbPool as NominaLiquidacionRepositoryExecutor);

export class NominaLiquidacionRepository {
  public async list(
    input: ListNominaLiquidacionInput,
    executor?: NominaLiquidacionRepositoryExecutor
  ): Promise<{ rows: NominaLiquidacionRepositoryRow[]; total: number }> {
    const queryExecutor = getExecutor(executor);
    const conditions = ['nl.periodo_id = $1::bigint'];
    const params: unknown[] = [input.periodoId];
    appendNominaCoberturaScope(conditions, params, input.tenant);

    if (input.vinculacionId) {
      params.push(input.vinculacionId);
      conditions.push(`nl.vinculacion_id = $${params.length}::bigint`);
    }
    if (input.personaId) {
      params.push(input.personaId);
      conditions.push(`p.id = $${params.length}::bigint`);
    }
    if (input.estado) {
      params.push(input.estado);
      conditions.push(`nl.estado = $${params.length}`);
    }

    const whereSql = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await queryExecutor.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM nomina_liquidaciones nl
        INNER JOIN vinculaciones v ON v.id = nl.vinculacion_id
        INNER JOIN personas p ON p.id = v.persona_id
        INNER JOIN nomina_periodos np ON np.id = nl.periodo_id
        ${whereSql}
      `,
      params
    );
    const total = countResult.rows[0]?.total ?? 0;
    const listParams = [...params, input.limit, (input.page - 1) * input.limit];
    const result = await queryExecutor.query<NominaLiquidacionRepositoryRow>(
      `${liquidationSelect}
       ${whereSql}
       ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, nl.id ASC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return { rows: result.rows, total };
  }

  public async getByPeriodoVinculacion(
    periodoId: string,
    vinculacionId: string,
    tenant?: TenantAccessContext,
    executor?: NominaLiquidacionRepositoryExecutor
  ): Promise<NominaLiquidacionRepositoryRow | null> {
    const conditions = ['nl.periodo_id = $1::bigint', 'nl.vinculacion_id = $2::bigint'];
    const params: unknown[] = [periodoId, vinculacionId];
    appendNominaCoberturaScope(conditions, params, tenant);
    const result = await getExecutor(executor).query<NominaLiquidacionRepositoryRow>(
      `${liquidationSelect} WHERE ${conditions.join(' AND ')} LIMIT 1`,
      params
    );
    return result.rows[0] ?? null;
  }

  public async listActiveKeys(
    periodoId: string,
    executor: NominaLiquidacionRepositoryExecutor
  ): Promise<Array<{ id: string; vinculacion_id: string }>> {
    const result = await executor.query<{ id: string; vinculacion_id: string }>(
      `
        SELECT id::text AS id, vinculacion_id::text AS vinculacion_id
        FROM nomina_liquidaciones
        WHERE periodo_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE
      `,
      [periodoId]
    );
    return result.rows;
  }

  public async create(
    input: NominaLiquidacionResultInput,
    executor: NominaLiquidacionRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        INSERT INTO nomina_liquidaciones (
          vinculacion_id, periodo_id, fecha_inicio_vinculacion, fecha_fin_vinculacion,
          fecha_retiro, motivo_retiro, dias_base_liquidacion, dias_trabajados,
          dias_vacaciones_pendientes, salario_base, auxilio_transporte,
          promedio_salario, promedio_auxilio_transporte, cesantias,
          intereses_cesantias, prima_servicios, vacaciones, otros_devengos,
          deducciones, total_liquidacion, estado, activo, archivo_path,
          documento_persona_id, observacion
        ) VALUES (
          $1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, 'GENERADA', TRUE,
          $21, $22::bigint, $23
        ) RETURNING id::text AS id
      `,
      [
        input.vinculacionId, input.periodoId, input.fechaInicioVinculacion,
        input.fechaFinVinculacion, input.fechaRetiro, input.motivoRetiro,
        input.diasBaseLiquidacion, input.diasTrabajados, input.diasVacacionesPendientes,
        input.salarioBase, input.auxilioTransporte, input.promedioSalario,
        input.promedioAuxilioTransporte, input.cesantias, input.interesesCesantias,
        input.primaServicios, input.vacaciones, input.otrosDevengos, input.deducciones,
        input.totalLiquidacion, input.archivoPath ?? null, input.documentoPersonaId ?? null,
        input.observacion ?? null
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaLiquidacionRepository.create returned no id');
    return row.id;
  }

  public async persistResult(
    liquidationId: string,
    input: NominaLiquidacionResultInput,
    executor: NominaLiquidacionRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `
        UPDATE nomina_liquidaciones SET
          fecha_inicio_vinculacion = $2, fecha_fin_vinculacion = $3,
          fecha_retiro = $4, motivo_retiro = $5, dias_base_liquidacion = $6,
          dias_trabajados = $7, dias_vacaciones_pendientes = $8,
          salario_base = $9, auxilio_transporte = $10, promedio_salario = $11,
          promedio_auxilio_transporte = $12, cesantias = $13,
          intereses_cesantias = $14, prima_servicios = $15, vacaciones = $16,
          otros_devengos = $17, deducciones = $18, total_liquidacion = $19,
          estado = 'GENERADA', activo = TRUE
        WHERE id = $1::bigint
        RETURNING id::text AS id
      `,
      [
        liquidationId, input.fechaInicioVinculacion, input.fechaFinVinculacion,
        input.fechaRetiro, input.motivoRetiro, input.diasBaseLiquidacion,
        input.diasTrabajados, input.diasVacacionesPendientes, input.salarioBase,
        input.auxilioTransporte, input.promedioSalario, input.promedioAuxilioTransporte,
        input.cesantias, input.interesesCesantias, input.primaServicios,
        input.vacaciones, input.otrosDevengos, input.deducciones, input.totalLiquidacion
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaLiquidacionRepository.persistResult returned no id');
    return row.id;
  }

  public async countActiveByPeriodo(
    periodoId: string,
    executor: NominaLiquidacionRepositoryExecutor
  ): Promise<number> {
    const result = await executor.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM nomina_liquidaciones WHERE periodo_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE`,
      [periodoId]
    );
    return result.rows[0]?.total ?? 0;
  }

  public async updateStateByPeriodo(
    periodoId: string,
    estado: string,
    executor: NominaLiquidacionRepositoryExecutor
  ): Promise<number> {
    const result = await executor.query(
      `
        UPDATE nomina_liquidaciones SET estado = $2
        WHERE periodo_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE
      `,
      [periodoId, estado]
    );
    return result.rowCount ?? 0;
  }
}

export const nominaLiquidacionRepository = new NominaLiquidacionRepository();
