import type { QueryResult, QueryResultRow } from 'pg';

import { dbPool } from '../../../../config/db';
import type { TenantAccessContext } from '../../../../middlewares/tenantMiddleware';
import { appendNominaCoberturaScope } from '../../nomina.procesos';

export interface NominaNovedadRepositoryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface NominaNovedadRepositoryRow extends QueryResultRow {
  [key: string]: any;
}

export interface NominaTipoNovedadRepositoryRow extends QueryResultRow {
  [key: string]: any;
}

export interface ListNominaNovedadRepositoryInput {
  activo?: boolean;
  nominaEmpleadoId?: string | null;
  periodoId?: string | null;
  personaId?: string | null;
  revisado?: boolean;
  tenant?: TenantAccessContext;
  tipoNovedadId?: string | null;
  vinculacionId?: string | null;
}

export interface ListNominaTipoNovedadRepositoryInput {
  activo?: boolean;
  busqueda?: string | null;
  categoria?: string | null;
  limit: number;
  page: number;
}

export interface CreateNominaNovedadRepositoryInput {
  activo: boolean;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  cubierta: boolean;
  dias: number | null;
  documento_persona_id: string | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  horas: number | null;
  nomina_empleado_id: string;
  observacion: string | null;
  periodo_id: string;
  requiere_cobertura: boolean;
  revisado: boolean;
  tipo_novedad_codigo_operativo: string | null;
  tipo_novedad_id: string;
  valor_manual: number | null;
  vinculacion_id: string;
}

export interface UpdateNominaNovedadRepositoryInput {
  activo: boolean;
  categoria_anterior_id: string | null;
  categoria_nueva_id: string | null;
  cubierta: boolean;
  dias: number | null;
  documento_persona_id: string | null;
  fecha_fin: string | null;
  fecha_inicio: string | null;
  horas: number | null;
  id: string;
  observacion: string | null;
  requiere_cobertura: boolean;
  revisado: boolean;
  tipo_novedad_codigo_operativo: string | null;
  tipo_novedad_id: string;
  valor_manual: number | null;
}

const noveltySelect = `
  SELECT
    nn.id::text AS id,
    nn.periodo_id::text AS periodo_id,
    nn.nomina_empleado_id::text AS nomina_empleado_id,
    nn.vinculacion_id::text AS vinculacion_id,
    nn.tipo_novedad_id::text AS tipo_novedad_id,
    nn.fecha_inicio,
    nn.fecha_fin,
    nn.dias,
    nn.horas,
    nn.valor_manual,
    nn.categoria_anterior_id::text AS categoria_anterior_id,
    nn.categoria_nueva_id::text AS categoria_nueva_id,
    nn.documento_persona_id::text AS documento_persona_id,
    COALESCE(soporte_doc.documento_persona_id::text, nn.documento_persona_id::text) AS soporte_documento_persona_id,
    permiso_doc.documento_persona_id::text AS solicitud_permiso_documento_persona_id,
    nn.observacion,
    COALESCE(nn.revisado, FALSE) AS revisado,
    COALESCE(nn.activo, TRUE) AS activo,
    nn.created_at,
    COALESCE(nn.requiere_cobertura, FALSE) AS requiere_cobertura,
    COALESCE(nn.cubierta, FALSE) AS cubierta,
    nnc.id::text AS cobertura_id,
    nnc.tipo_cobertura AS cobertura_tipo_cobertura,
    nnc.persona_cubre_id::text AS cobertura_persona_cubre_id,
    nnc.vinculacion_cubre_id::text AS cobertura_vinculacion_cubre_id,
    nnc.nombre_externo AS cobertura_nombre_externo,
    nnc.documento_externo AS cobertura_documento_externo,
    nnc.observacion_externa AS cobertura_observacion_externa,
    nnc.observacion_interna AS cobertura_observacion_interna,
    nnc.snapshot_cobertura AS cobertura_snapshot,
    nn.tipo_novedad_codigo_operativo AS tipo_novedad_codigo_snapshot,
    ntn.codigo_operativo AS tipo_novedad_codigo_operativo,
    ntn.nombre AS tipo_novedad_nombre,
    ntn.categoria AS tipo_novedad_categoria,
    ntn.descripcion_operativa AS tipo_novedad_descripcion_operativa,
    COALESCE(ntn.afecta_salario, FALSE) AS tipo_novedad_afecta_salario,
    COALESCE(ntn.afecta_transporte, FALSE) AS tipo_novedad_afecta_transporte,
    ntn.afecta_dias_laborados AS tipo_novedad_afecta_dias_laborados,
    ntn.afecta_recargos AS tipo_novedad_afecta_recargos,
    ntn.afecta_cobertura AS tipo_novedad_afecta_cobertura,
    ntn.efecto_salario AS tipo_novedad_efecto_salario,
    ntn.efecto_auxilio_transporte AS tipo_novedad_efecto_auxilio_transporte,
    ntn.efecto_recargos_detallado AS tipo_novedad_efecto_recargos_detallado,
    ntn.efecto_liquidacion AS tipo_novedad_efecto_liquidacion,
    ntn.efecto_cobertura_config AS tipo_novedad_efecto_cobertura_config,
    ntn.efecto_operativo AS tipo_novedad_efecto_operativo,
    ntn.efecto_pago AS tipo_novedad_efecto_pago,
    ntn.modelo_registro AS tipo_novedad_modelo_registro,
    COALESCE(ntn.proyecta_periodos, FALSE) AS tipo_novedad_proyecta_periodos,
    COALESCE(ntn.bloquea_otras_novedades, FALSE) AS tipo_novedad_bloquea_otras_novedades,
    ntn.grupo_exclusividad AS tipo_novedad_grupo_exclusividad,
    ntn.observacion_plantilla AS tipo_novedad_observacion_plantilla,
    COALESCE(ntn.es_adicion, FALSE) AS tipo_novedad_es_adicion,
    COALESCE(ntn.es_deduccion, FALSE) AS tipo_novedad_es_deduccion,
    COALESCE(ntn.requiere_soporte, FALSE) AS tipo_novedad_requiere_soporte,
    COALESCE(ntn.permite_rango, FALSE) AS tipo_novedad_permite_rango,
    COALESCE(ntn.requiere_revision, FALSE) AS tipo_novedad_requiere_revision,
    COALESCE(ntn.requiere_solicitud_permiso, FALSE) AS tipo_novedad_requiere_solicitud_permiso,
    COALESCE(ntn.es_incapacidad, FALSE) AS tipo_novedad_es_incapacidad,
    COALESCE(ntn.es_accidente_laboral, FALSE) AS tipo_novedad_es_accidente_laboral,
    COALESCE(ntn.es_permiso, FALSE) AS tipo_novedad_es_permiso,
    COALESCE(ntn.es_suspension, FALSE) AS tipo_novedad_es_suspension,
    COALESCE(ntn.es_evento_operativo, FALSE) AS tipo_novedad_es_evento_operativo,
    ntn.soporte_documento_tipo AS tipo_novedad_soporte_documento_tipo,
    COALESCE(ntn.requiere_fechas, FALSE) AS tipo_novedad_requiere_fechas,
    COALESCE(ntn.requiere_dias, FALSE) AS tipo_novedad_requiere_dias,
    COALESCE(ntn.requiere_horas, FALSE) AS tipo_novedad_requiere_horas,
    COALESCE(ntn.requiere_valor, FALSE) AS tipo_novedad_requiere_valor,
    COALESCE(ntn.activo, TRUE) AS tipo_novedad_activo,
    p.numero_documento AS persona_numero_documento,
    p.primer_nombre,
    p.segundo_nombre,
    p.primer_apellido,
    p.segundo_apellido,
    pc.numero_documento AS cobertura_persona_numero_documento,
    pc.primer_nombre AS cobertura_primer_nombre,
    pc.segundo_nombre AS cobertura_segundo_nombre,
    pc.primer_apellido AS cobertura_primer_apellido,
    pc.segundo_apellido AS cobertura_segundo_apellido
  FROM nomina_novedades nn
  INNER JOIN nomina_tipos_novedad ntn ON ntn.id = nn.tipo_novedad_id
  INNER JOIN nomina_empleados ne ON ne.id = nn.nomina_empleado_id
  INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
  INNER JOIN personas p ON p.id = v.persona_id
  INNER JOIN nomina_periodos np ON np.id = nn.periodo_id
  INNER JOIN contratos c ON c.id = np.contrato_id
  LEFT JOIN LATERAL (
    SELECT nd.documento_persona_id
    FROM nomina_novedad_documentos nd
    WHERE nd.nomina_novedad_id = nn.id AND nd.tipo_relacion = 'SOPORTE_NOVEDAD'
      AND COALESCE(nd.activo, TRUE) = TRUE
    ORDER BY nd.id DESC LIMIT 1
  ) soporte_doc ON TRUE
  LEFT JOIN LATERAL (
    SELECT nd.documento_persona_id
    FROM nomina_novedad_documentos nd
    WHERE nd.nomina_novedad_id = nn.id AND nd.tipo_relacion = 'SOLICITUD_PERMISO'
      AND COALESCE(nd.activo, TRUE) = TRUE
    ORDER BY nd.id DESC LIMIT 1
  ) permiso_doc ON TRUE
  LEFT JOIN nomina_novedad_coberturas nnc
    ON nnc.nomina_novedad_id = nn.id AND COALESCE(nnc.activo, TRUE) = TRUE
  LEFT JOIN personas pc ON pc.id = nnc.persona_cubre_id
`;

const typeSelect = `
  SELECT
    id::text AS id, codigo_operativo, nombre, categoria, descripcion_operativa,
    COALESCE(afecta_salario, FALSE) AS afecta_salario,
    COALESCE(afecta_transporte, FALSE) AS afecta_transporte,
    afecta_dias_laborados, afecta_recargos, afecta_cobertura,
    efecto_salario, efecto_auxilio_transporte, efecto_recargos_detallado,
    efecto_liquidacion, efecto_cobertura_config, efecto_operativo, efecto_pago,
    modelo_registro, COALESCE(proyecta_periodos, FALSE) AS proyecta_periodos,
    COALESCE(bloquea_otras_novedades, FALSE) AS bloquea_otras_novedades,
    grupo_exclusividad, observacion_plantilla,
    COALESCE(es_adicion, FALSE) AS es_adicion,
    COALESCE(es_deduccion, FALSE) AS es_deduccion,
    COALESCE(requiere_soporte, FALSE) AS requiere_soporte,
    COALESCE(permite_rango, FALSE) AS permite_rango,
    COALESCE(requiere_revision, FALSE) AS requiere_revision,
    COALESCE(requiere_solicitud_permiso, FALSE) AS requiere_solicitud_permiso,
    COALESCE(es_incapacidad, FALSE) AS es_incapacidad,
    COALESCE(es_accidente_laboral, FALSE) AS es_accidente_laboral,
    COALESCE(es_permiso, FALSE) AS es_permiso,
    COALESCE(es_suspension, FALSE) AS es_suspension,
    COALESCE(es_evento_operativo, FALSE) AS es_evento_operativo,
    soporte_documento_tipo,
    COALESCE(requiere_fechas, FALSE) AS requiere_fechas,
    COALESCE(requiere_dias, FALSE) AS requiere_dias,
    COALESCE(requiere_horas, FALSE) AS requiere_horas,
    COALESCE(requiere_valor, FALSE) AS requiere_valor,
    COALESCE(activo, TRUE) AS activo, created_at
  FROM nomina_tipos_novedad
`;

const getExecutor = (executor?: NominaNovedadRepositoryExecutor): NominaNovedadRepositoryExecutor =>
  executor ?? (dbPool as NominaNovedadRepositoryExecutor);

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

const buildNoveltyWhere = (
  input: ListNominaNovedadRepositoryInput,
  includeCoverageScope = true
): { conditions: string[]; params: unknown[] } => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  appendTenantScope(conditions, params, input.tenant);
  if (includeCoverageScope) {
    appendNominaCoberturaScope(conditions, params, input.tenant);
  }
  if (input.periodoId) { params.push(input.periodoId); conditions.push(`nn.periodo_id = $${params.length}::bigint`); }
  if (input.nominaEmpleadoId) { params.push(input.nominaEmpleadoId); conditions.push(`nn.nomina_empleado_id = $${params.length}::bigint`); }
  if (input.vinculacionId) { params.push(input.vinculacionId); conditions.push(`nn.vinculacion_id = $${params.length}::bigint`); }
  if (input.personaId) { params.push(input.personaId); conditions.push(`v.persona_id = $${params.length}::bigint`); }
  if (input.tipoNovedadId) { params.push(input.tipoNovedadId); conditions.push(`nn.tipo_novedad_id = $${params.length}::bigint`); }
  if (input.revisado !== undefined) { params.push(input.revisado); conditions.push(`COALESCE(nn.revisado, FALSE) = $${params.length}`); }
  if (input.activo !== undefined) { params.push(input.activo); conditions.push(`COALESCE(nn.activo, TRUE) = $${params.length}`); }
  return { conditions, params };
};

export class NominaNovedadRepository {
  public async getById(
    id: string,
    tenant?: TenantAccessContext,
    executor?: NominaNovedadRepositoryExecutor
  ): Promise<NominaNovedadRepositoryRow | null> {
    const input = { nominaEmpleadoId: null, periodoId: null, personaId: null, revisado: undefined, activo: undefined, tipoNovedadId: null, vinculacionId: null, tenant };
    const { conditions, params } = buildNoveltyWhere(input, false);
    params.push(id);
    conditions.push(`nn.id = $${params.length}::bigint`);
    const result = await getExecutor(executor).query<NominaNovedadRepositoryRow>(
      `${noveltySelect} WHERE ${conditions.join(' AND ')} LIMIT 1`, params
    );
    return result.rows[0] ?? null;
  }

  public async list(
    input: ListNominaNovedadRepositoryInput,
    executor?: NominaNovedadRepositoryExecutor
  ): Promise<NominaNovedadRepositoryRow[]> {
    const { conditions, params } = buildNoveltyWhere(input);
    const result = await getExecutor(executor).query<NominaNovedadRepositoryRow>(
      `${noveltySelect} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY nn.created_at DESC, nn.id DESC`, params
    );
    return result.rows;
  }

  public async listTypes(
    input: ListNominaTipoNovedadRepositoryInput,
    executor?: NominaNovedadRepositoryExecutor
  ): Promise<{ rows: NominaTipoNovedadRepositoryRow[]; total: number }> {
    const queryExecutor = getExecutor(executor);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (input.categoria) { params.push(input.categoria); conditions.push(`LOWER(categoria) = LOWER($${params.length})`); }
    if (input.busqueda) {
      params.push(`%${input.busqueda}%`);
      conditions.push(`(nombre ILIKE $${params.length} OR categoria ILIKE $${params.length} OR COALESCE(codigo_operativo, '') ILIKE $${params.length} OR COALESCE(descripcion_operativa, '') ILIKE $${params.length})`);
    }
    if (input.activo !== undefined) { params.push(input.activo); conditions.push(`COALESCE(activo, TRUE) = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await queryExecutor.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM nomina_tipos_novedad ${where}`, params);
    const listParams = [...params, input.limit, (input.page - 1) * input.limit];
    const result = await queryExecutor.query<NominaTipoNovedadRepositoryRow>(
      `${typeSelect} ${where} ORDER BY categoria ASC NULLS LAST, nombre ASC NULLS LAST, id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return { rows: result.rows, total: count.rows[0]?.total ?? 0 };
  }

  public async hasInactiveTypes(executor?: NominaNovedadRepositoryExecutor): Promise<boolean> {
    const result = await getExecutor(executor).query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM nomina_tipos_novedad WHERE COALESCE(activo, TRUE) = FALSE) AS exists`
    );
    return result.rows[0]?.exists === true;
  }

  public async getTypeById(id: string, executor?: NominaNovedadRepositoryExecutor): Promise<NominaTipoNovedadRepositoryRow | null> {
    const result = await getExecutor(executor).query<NominaTipoNovedadRepositoryRow>(
      `${typeSelect} WHERE id = $1::bigint LIMIT 1`, [id]
    );
    return result.rows[0] ?? null;
  }

  public async listTypesCatalog(executor?: NominaNovedadRepositoryExecutor): Promise<NominaTipoNovedadRepositoryRow[]> {
    const result = await getExecutor(executor).query<NominaTipoNovedadRepositoryRow>(`${typeSelect} ORDER BY id ASC`);
    return result.rows;
  }

  public async create(
    input: CreateNominaNovedadRepositoryInput,
    executor: NominaNovedadRepositoryExecutor
  ): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `INSERT INTO nomina_novedades (
        periodo_id, nomina_empleado_id, vinculacion_id, tipo_novedad_id,
        tipo_novedad_codigo_operativo, documento_persona_id, fecha_inicio, fecha_fin,
        dias, horas, valor_manual, categoria_anterior_id, categoria_nueva_id,
        observacion, revisado, activo, requiere_cobertura, cubierta
      ) VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5, $6::bigint, $7, $8, $9, $10, $11, $12::bigint, $13::bigint, $14, $15, $16, $17, $18)
      RETURNING id::text AS id`,
      [input.periodo_id, input.nomina_empleado_id, input.vinculacion_id, input.tipo_novedad_id, input.tipo_novedad_codigo_operativo, input.documento_persona_id, input.fecha_inicio, input.fecha_fin, input.dias, input.horas, input.valor_manual, input.categoria_anterior_id, input.categoria_nueva_id, input.observacion, input.revisado, input.activo, input.requiere_cobertura, input.cubierta]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaNovedadRepository.create returned no id');
    return row.id;
  }

  public async update(input: UpdateNominaNovedadRepositoryInput, executor: NominaNovedadRepositoryExecutor): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `UPDATE nomina_novedades SET
        tipo_novedad_id = $2::bigint, tipo_novedad_codigo_operativo = $3,
        documento_persona_id = $4::bigint, fecha_inicio = $5, fecha_fin = $6,
        dias = $7, horas = $8, valor_manual = $9, categoria_anterior_id = $10::bigint,
        categoria_nueva_id = $11::bigint, observacion = $12, revisado = $13,
        requiere_cobertura = $14, cubierta = $15, activo = $16
       WHERE id = $1::bigint RETURNING id::text AS id`,
      [input.id, input.tipo_novedad_id, input.tipo_novedad_codigo_operativo, input.documento_persona_id, input.fecha_inicio, input.fecha_fin, input.dias, input.horas, input.valor_manual, input.categoria_anterior_id, input.categoria_nueva_id, input.observacion, input.revisado, input.requiere_cobertura, input.cubierta, input.activo]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaNovedadRepository.update found no row');
    return row.id;
  }

  public async deactivate(id: string, executor: NominaNovedadRepositoryExecutor): Promise<string> {
    const result = await executor.query<{ id: string }>(
      `UPDATE nomina_novedades SET activo = FALSE WHERE id = $1::bigint RETURNING id::text AS id`, [id]
    );
    const row = result.rows[0];
    if (!row) throw new Error('NominaNovedadRepository.deactivate found no row');
    return row.id;
  }
}

export const nominaNovedadRepository = new NominaNovedadRepository();
