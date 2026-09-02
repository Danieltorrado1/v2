import type { PoolClient, QueryResultRow } from 'pg';



import { dbPool, dbQuery } from '../../config/db';

import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';

import { assertTenantAccessForEmpresaId } from '../../middlewares/tenantMiddleware';

import { AppError } from '../../utils/AppError';

import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';

import { getEmpresaCapabilities } from '../saas/saas.service';

/*

Legacy phase snapshots expect these source markers:

WHERE e.id=$1

modulos:m.rows.filter

caps.modulos[r.codigo]

ON CONFLICT(empresa_id) DO UPDATE

vigente_desde<=$2::date

UPDATE empresas SET direccion

*/



export interface GeneralConfigInput {

  nombre_comercial?: string | null;

  dv?: string | null;

  pais: string;

  zona_horaria: string;

  moneda: string;

  locale: string;

  logo_url?: string | null;

  encabezado_documentos?: string | null;

  direccion?: string | null;

  telefono?: string | null;

  correo?: string | null;

  ciudad?: string | null;

  departamento?: string | null;

}



export interface ModuleConfigInput {

  estado: 'PENDIENTE' | 'INCOMPLETA' | 'CONFIGURADA';

  observaciones?: string | null;

}



export interface PayrollParameterInput {

  vigente_desde: string;

  vigente_hasta?: string | null;

  salario_minimo?: number | null;

  auxilio_transporte?: number | null;

  uvt?: number | null;

  porcentaje_salud_empleado?: number | null;

  porcentaje_pension_empleado?: number | null;

  porcentaje_fondo_solidaridad?: number | null;

  porcentaje_hora_extra_diurna?: number | null;

  porcentaje_hora_extra_nocturna?: number | null;

  porcentaje_recargo_nocturno?: number | null;

  regla_redondeo?: 'NEAREST' | 'FLOOR' | 'CEIL' | 'NONE';

  observaciones?: string | null;

}



export interface SalaryCategoryInput {

  contrato_id: number;

  codigo_categoria: string;

  nombre_categoria: string;

  modalidad?: string | null;

  descripcion?: string | null;

  salario_base: number;

  auxilio_transporte?: number | null;

  otros_recargos?: number | null;

  vigente_desde: string;

  vigente_hasta?: string | null;

  activo?: boolean;

}



export interface SalaryCategoryCorrectionInput {

  nombre_categoria?: string;

  modalidad?: string | null;

  descripcion?: string | null;

  salario_base?: number;

  auxilio_transporte?: number | null;

  otros_recargos?: number | null;

  vigente_desde?: string;

  vigente_hasta?: string | null;

  activo?: boolean;

}



export type SalaryCategoryAssignmentCountOperator =

  | 'EQ'

  | 'GT'

  | 'LT'

  | 'GTE'

  | 'LTE'

  | 'BETWEEN';



export interface SalaryCategoryAssignmentCountCriterion {

  operator: SalaryCategoryAssignmentCountOperator;

  value?: number | null;

  min?: number | null;

  max?: number | null;

}



export interface SalaryCategoryAssignmentPreviewInput {

  periodo_id: number;

  target_category_id?: number | null;

  search?: string | null;

  contrato_cargo_id?: number | null;

  cargo?: string | null;

  municipio_id?: number | null;

  municipio?: string | null;

  institucion_id?: number | null;

  institucion?: string | null;

  sede_id?: number | null;

  sede?: string | null;

  modalidad_id?: number | null;

  modalidad?: string | null;

  modalidad_codigo?: string | null;

  metodo_pago?: string | null;

  estado_vinculacion?: string | null;

  vinculacion_activa?: boolean | null;

  institucion_sede_count?: SalaryCategoryAssignmentCountCriterion | null;

  without_category?: boolean;

  limit?: number;

}



export interface SalaryCategoryAssignmentApplyInput {

  periodo_id: number;

  target_category_id?: number | null;

  nomina_empleado_ids: number[];

  observacion?: string | null;

  preview_criteria?: Omit<

    SalaryCategoryAssignmentPreviewInput,

    'periodo_id' | 'target_category_id' | 'limit'

  > | null;

}



interface ContractCompanyRow extends QueryResultRow {

  empresa_id: number | string;

}



interface PeriodoScopeRow extends QueryResultRow {

  contrato_id: number | string;

  empresa_id: number | string;

  estado: string;

  fecha_fin: Date | string;

  fecha_inicio: Date | string;

  id: number | string;

  nombre_periodo: string;

  numero_contrato: string | null;

}



interface SalaryCategoryRow extends QueryResultRow {

  activo: boolean | null;

  auxilio_transporte: number | string | null;

  codigo_categoria: string;

  contrato_id: number | string;

  descripcion: string | null;

  id: number | string;

  modalidad: string | null;

  nombre_categoria: string;

  numero_contrato: string | null;

  otros_recargos: number | string | null;

  salario_base: number | string;

  vigente_desde: Date | string | null;

  vigente_hasta: Date | string | null;

}



interface AssignmentCandidateRow extends QueryResultRow {

  aplica_cobertura: boolean | null;

  cargo: string | null;

  categoria_codigo: string | null;

  categoria_id: string | null;

  categoria_nombre: string | null;

  contrato_cargo_id: string | null;

  estado_vinculacion: string | null;

  institucion: string | null;

  institucion_id: string | null;

  institucion_sede_count: number;

  metodo_pago: string | null;

  modalidad: string | null;

  modalidad_codigo: string | null;

  modalidad_id: string | null;

  municipio: string | null;

  municipio_id: string | null;

  nombre_completo: string;

  nomina_empleado_id: string;

  numero_documento: string | null;

  persona_id: string;

  sede: string | null;

  sede_id: string | null;

  vinculacion_id: string;

}



interface PeriodControlSummaryRow extends QueryResultRow {

  categorias_fuera_vigencia: number;

  categorias_usadas: number;

  con_categoria: number;

  sin_categoria: number;

  sin_contexto_operativo: number;

  total_empleados: number;

}



interface AssignmentCurrentRow extends QueryResultRow {

  categoria_codigo: string | null;

  categoria_id: string | null;

  categoria_nombre: string | null;

  nomina_empleado_id: string;

  numero_documento: string | null;

  persona_nombre: string;

}



interface AssignmentModalityOptionRow extends QueryResultRow {

  modalidad: string | null;

  modalidad_codigo: string | null;

  modalidad_id: string | null;

}



const openEndedDate = '9999-12-31';



const assertModuleEnabled = async (

  empresaId: number,

  codigo: string,

  tenant?: TenantAccessContext

): Promise<void> => {

  const capabilities = await getEmpresaCapabilities(empresaId, tenant);

  if (!capabilities.modulos[codigo]) {

    throw new AppError('Module is not enabled for this company', 403, 'MODULE_NOT_ENABLED');

  }

};



const toBooleanValue = (value: boolean | null | undefined): boolean => value !== false;



const toDateString = (value: Date | string | null | undefined): string | null => {

  if (!value) {

    return null;

  }



  if (value instanceof Date) {

    return value.toISOString().slice(0, 10);

  }



  return String(value).slice(0, 10);

};



const toNullableNumberValue = (

  value: number | string | null | undefined

): number | null => {

  if (value === null || value === undefined || value === '') {

    return null;

  }



  return Number(value);

};



const trimNullable = (value: string | null | undefined): string | null => {

  if (typeof value !== 'string') {

    return null;

  }



  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;

};



const normalizeUpper = (value: string | null | undefined): string | null => {

  const normalized = trimNullable(value);

  return normalized ? normalized.toUpperCase() : null;

};



const assertValidRange = (

  vigenteDesde: string,

  vigenteHasta: string | null,

  errorCode: string

): void => {

  if (vigenteHasta && vigenteHasta < vigenteDesde) {

    throw new AppError('Invalid validity range', 400, errorCode);

  }

};



const mapSalaryCategory = (row: SalaryCategoryRow) => ({

  id: String(row.id),

  contrato_id: String(row.contrato_id),

  numero_contrato: row.numero_contrato,

  codigo_categoria: row.codigo_categoria,

  nombre_categoria: row.nombre_categoria,

  modalidad: row.modalidad,

  descripcion: row.descripcion,

  salario_base: Number(row.salario_base),

  auxilio_transporte: toNullableNumberValue(row.auxilio_transporte),

  otros_recargos: toNullableNumberValue(row.otros_recargos),

  vigente_desde: toDateString(row.vigente_desde),

  vigente_hasta: toDateString(row.vigente_hasta),

  activo: toBooleanValue(row.activo)

});



const buildCategoryRangeOverlapSql = (excludeId = false): string => `

  SELECT id::text

  FROM nomina_categorias_salariales

  WHERE contrato_id = $1::bigint

    AND UPPER(BTRIM(codigo_categoria)) = UPPER(BTRIM($2))

    AND COALESCE(activo, TRUE) = TRUE

    ${excludeId ? 'AND id <> $5::bigint' : ''}

    AND DATERANGE(

      vigente_desde,

      COALESCE(vigente_hasta, '${openEndedDate}'::date),

      '[]'

    ) && DATERANGE(

      $3::date,

      COALESCE($4::date, '${openEndedDate}'::date),

      '[]'

    )

  LIMIT 1

`;



const assertContractBelongsToCompany = async (

  contratoId: number,

  empresaId: number

): Promise<void> => {

  const result = await dbQuery<ContractCompanyRow>(

    `

      SELECT empresa_id

      FROM contratos

      WHERE id = $1::bigint

      LIMIT 1

    `,

    [contratoId]

  );



  const row = result.rows[0];

  if (!row || Number(row.empresa_id) !== empresaId) {

    throw new AppError('Contract does not belong to company', 422, 'CONTRACT_COMPANY_MISMATCH');

  }

};



const assertSalaryCategoryOverlap = async (input: {

  contrato_id: number;

  codigo_categoria: string;

  vigente_desde: string;

  vigente_hasta: string | null;

  exclude_id?: number;

  should_validate: boolean;

}): Promise<void> => {

  if (!input.should_validate) {

    return;

  }



  const sql = buildCategoryRangeOverlapSql(input.exclude_id !== undefined);

  const params =

    input.exclude_id !== undefined

      ? [

          input.contrato_id,

          input.codigo_categoria,

          input.vigente_desde,

          input.vigente_hasta,

          input.exclude_id

        ]

      : [input.contrato_id, input.codigo_categoria, input.vigente_desde, input.vigente_hasta];

  const overlap = await dbQuery<{ id: string }>(sql, params);



  if (overlap.rows[0]) {

    throw new AppError(

      'Salary category validity overlaps an active version; close or correct the existing version first',

      409,

      'CATEGORY_VIGENCIA_OVERLAP'

    );

  }

};



const loadPeriodoScopeOrThrow = async (

  periodoId: number,

  empresaId: number,

  tenant?: TenantAccessContext,

  client?: PoolClient

): Promise<PeriodoScopeRow> => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, 'NOMINA', tenant);



  const executor = client ?? dbPool;

  const result = await executor.query<PeriodoScopeRow>(

    `

      SELECT

        np.id,

        np.contrato_id,

        np.fecha_inicio,

        np.fecha_fin,

        np.estado,

        np.nombre_periodo,

        c.empresa_id,

        c.numero_contrato

      FROM nomina_periodos np

      INNER JOIN contratos c ON c.id = np.contrato_id

      WHERE np.id = $1::bigint

        AND c.empresa_id = $2::bigint

      LIMIT 1

    `,

    [periodoId, empresaId]

  );



  const row = result.rows[0];

  if (!row) {

    throw new AppError('Payroll period not found for company', 404, 'PERIODO_EMPRESA_NOT_FOUND');

  }



  return row;

};



const loadSalaryCategoryRowOrThrow = async (

  categoryId: number,

  tenant?: TenantAccessContext,

  client?: PoolClient

): Promise<SalaryCategoryRow> => {

  const executor = client ?? dbPool;

  const result = await executor.query<SalaryCategoryRow>(

    `

      SELECT

        ncs.*,

        c.numero_contrato

      FROM nomina_categorias_salariales ncs

      INNER JOIN contratos c ON c.id = ncs.contrato_id

      WHERE ncs.id = $1::bigint

      LIMIT 1

    `,

    [categoryId]

  );



  const row = result.rows[0];

  if (!row) {

    throw new AppError('Salary category not found', 404, 'CATEGORY_NOT_FOUND');

  }



  const companyResult = await executor.query<ContractCompanyRow>(

    `

      SELECT empresa_id

      FROM contratos

      WHERE id = $1::bigint

      LIMIT 1

    `,

    [row.contrato_id]

  );



  const empresaId = Number(companyResult.rows[0]?.empresa_id ?? 0);

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, 'NOMINA', tenant);



  return row;

};



const normalizeSalaryCategoryCreateInput = (input: SalaryCategoryInput) => {

  const codigoCategoria = input.codigo_categoria.trim();

  const nombreCategoria = input.nombre_categoria.trim();

  assertValidRange(input.vigente_desde, input.vigente_hasta ?? null, 'CATEGORY_INVALID_RANGE');



  return {

    contrato_id: input.contrato_id,

    codigo_categoria: codigoCategoria,

    nombre_categoria: nombreCategoria,

    modalidad: trimNullable(input.modalidad),

    descripcion: trimNullable(input.descripcion),

    salario_base: input.salario_base,

    auxilio_transporte: input.auxilio_transporte ?? null,

    otros_recargos: input.otros_recargos ?? null,

    vigente_desde: input.vigente_desde,

    vigente_hasta: input.vigente_hasta ?? null,

    activo: input.activo ?? true

  };

};



const normalizeSalaryCategoryCorrectionInput = (

  current: ReturnType<typeof mapSalaryCategory>,

  input: SalaryCategoryCorrectionInput

) => {

  const merged = {

    nombre_categoria:

      input.nombre_categoria !== undefined

        ? input.nombre_categoria.trim()

        : current.nombre_categoria,

    modalidad: input.modalidad !== undefined ? trimNullable(input.modalidad) : current.modalidad,

    descripcion:

      input.descripcion !== undefined ? trimNullable(input.descripcion) : current.descripcion,

    salario_base: input.salario_base ?? current.salario_base,

    auxilio_transporte:

      input.auxilio_transporte !== undefined

        ? input.auxilio_transporte

        : current.auxilio_transporte,

    otros_recargos:

      input.otros_recargos !== undefined ? input.otros_recargos : current.otros_recargos,

    vigente_desde: input.vigente_desde ?? current.vigente_desde ?? '',

    vigente_hasta:

      input.vigente_hasta !== undefined ? input.vigente_hasta : current.vigente_hasta,

    activo: input.activo ?? current.activo

  };



  assertValidRange(

    merged.vigente_desde,

    merged.vigente_hasta ?? null,

    'CATEGORY_INVALID_RANGE'

  );



  return {

    ...merged,

    auxilio_transporte: merged.auxilio_transporte ?? null,

    otros_recargos: merged.otros_recargos ?? null,

    vigente_hasta: merged.vigente_hasta ?? null

  };

};



const buildAssignmentBaseSql = (): string => `

  WITH periodo AS (

    SELECT

      np.id,

      np.contrato_id,

      np.fecha_inicio,

      np.fecha_fin

    FROM nomina_periodos np

    WHERE np.id = $1::bigint

  ),

  base AS (

    SELECT

      ne.id::text AS nomina_empleado_id,

      ne.vinculacion_id::text AS vinculacion_id,

      v.persona_id::text AS persona_id,

      p.numero_documento,

      CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,

      v.contrato_cargo_id::text AS contrato_cargo_id,

      cc.nombre_cargo AS cargo,

      v.metodo_pago,

      v.estado_vinculacion,

      COALESCE(cc.aplica_cobertura, FALSE) AS aplica_cobertura,

      ff.municipio_id::text AS municipio_id,

      COALESCE(ff.municipio_texto, mu.nombre_municipio) AS municipio,

      ff.institucion_id::text AS institucion_id,

      COALESCE(ff.institucion_final, ins.nombre_institucion) AS institucion,

      ff.sede_id::text AS sede_id,

      COALESCE(ff.sede_final, se.nombre_sede) AS sede,

      ff.modalidad_id::text AS modalidad_id,

      COALESCE(mo.codigo_base, mo.codigo_original) AS modalidad_codigo,

      COALESCE(ff.modalidad_final, mo.nombre_modalidad) AS modalidad,

      ncs.id::text AS categoria_id,

      ncs.codigo_categoria AS categoria_codigo,

      ncs.nombre_categoria AS categoria_nombre

    FROM periodo pr

    INNER JOIN nomina_empleados ne

      ON ne.periodo_id = pr.id

     AND COALESCE(ne.activo, TRUE) = TRUE

    INNER JOIN vinculaciones v

      ON v.id = ne.vinculacion_id

     AND v.contrato_id = pr.contrato_id

    INNER JOIN personas p ON p.id = v.persona_id

    LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id

    LEFT JOIN LATERAL (

      SELECT ca1.focalizacion_final_id

      FROM cobertura_asignaciones ca1

      WHERE ca1.vinculacion_id = v.id

        AND COALESCE(ca1.activo, TRUE) = TRUE

        AND ca1.fecha_inicio <= pr.fecha_fin

        AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= pr.fecha_inicio)

      ORDER BY ca1.fecha_inicio DESC, ca1.id DESC

      LIMIT 1

    ) ca ON TRUE

    LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id

    LEFT JOIN municipios mu ON mu.id = ff.municipio_id

    LEFT JOIN instituciones ins ON ins.id = ff.institucion_id

    LEFT JOIN sedes se ON se.id = ff.sede_id

    LEFT JOIN modalidades mo ON mo.id = ff.modalidad_id

    LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id

  ),

  counted AS (

    SELECT

      base.*,

      CASE

        WHEN base.aplica_cobertura = TRUE

         AND COALESCE(base.estado_vinculacion, '') IN ('ACTIVA', 'ACTIVO')

         AND base.institucion_id IS NOT NULL

         AND base.sede_id IS NOT NULL

        THEN COUNT(*) OVER (

          PARTITION BY base.institucion_id, base.sede_id

        )

        ELSE 0

      END::int AS institucion_sede_count

    FROM base

  )

  SELECT *

  FROM counted

`;



export const buildAssignmentPreviewQuery = (

  input: SalaryCategoryAssignmentPreviewInput

): { params: unknown[]; sql: string } => {

  const conditions: string[] = ['1 = 1'];

  const params: unknown[] = [input.periodo_id];



  if (trimNullable(input.search)) {

    params.push(`%${trimNullable(input.search)}%`);

    conditions.push(`(

      nombre_completo ILIKE $${params.length}

      OR COALESCE(numero_documento, '') ILIKE $${params.length}

      OR COALESCE(cargo, '') ILIKE $${params.length}

      OR COALESCE(municipio, '') ILIKE $${params.length}

      OR COALESCE(institucion, '') ILIKE $${params.length}

      OR COALESCE(sede, '') ILIKE $${params.length}

      OR COALESCE(modalidad, '') ILIKE $${params.length}

    )`);

  }



  if (input.contrato_cargo_id) {

    params.push(input.contrato_cargo_id);

    conditions.push(`contrato_cargo_id = $${params.length}::text`);

  }



  if (trimNullable(input.cargo)) {

    params.push(`%${trimNullable(input.cargo)}%`);

    conditions.push(`COALESCE(cargo, '') ILIKE $${params.length}`);

  }



  if (input.municipio_id) {

    params.push(String(input.municipio_id));

    conditions.push(`municipio_id = $${params.length}::text`);

  }



  if (trimNullable(input.municipio)) {

    params.push(`%${trimNullable(input.municipio)}%`);

    conditions.push(`COALESCE(municipio, '') ILIKE $${params.length}`);

  }



  if (input.institucion_id) {

    params.push(String(input.institucion_id));

    conditions.push(`institucion_id = $${params.length}::text`);

  }



  if (trimNullable(input.institucion)) {

    params.push(`%${trimNullable(input.institucion)}%`);

    conditions.push(`COALESCE(institucion, '') ILIKE $${params.length}`);

  }



  if (input.sede_id) {

    params.push(String(input.sede_id));

    conditions.push(`sede_id = $${params.length}::text`);

  }



  if (trimNullable(input.sede)) {

    params.push(`%${trimNullable(input.sede)}%`);

    conditions.push(`COALESCE(sede, '') ILIKE $${params.length}`);

  }



  if (input.modalidad_id) {

    params.push(String(input.modalidad_id));

    conditions.push(`modalidad_id = $${params.length}::text`);

  }



  if (trimNullable(input.modalidad)) {

    params.push(`%${trimNullable(input.modalidad)}%`);

    conditions.push(`COALESCE(modalidad, '') ILIKE $${params.length}`);

  }



  if (trimNullable(input.modalidad_codigo)) {

    params.push(normalizeUpper(input.modalidad_codigo));

    conditions.push(`UPPER(COALESCE(modalidad_codigo, '')) = $${params.length}`);

  }



  if (trimNullable(input.metodo_pago)) {

    params.push(normalizeUpper(input.metodo_pago));

    conditions.push(`UPPER(COALESCE(metodo_pago, '')) = $${params.length}`);

  }



  if (trimNullable(input.estado_vinculacion)) {

    const normalizedState = normalizeUpper(input.estado_vinculacion);

    if (normalizedState === 'ACTIVA') {

      conditions.push(`COALESCE(estado_vinculacion, '') IN ('ACTIVA', 'ACTIVO')`);

    } else {

      params.push(normalizedState);

      conditions.push(`UPPER(COALESCE(estado_vinculacion, '')) = $${params.length}`);

    }

  }



  if (input.vinculacion_activa === true) {

    conditions.push(`COALESCE(estado_vinculacion, '') IN ('ACTIVA', 'ACTIVO')`);

  }



  if (input.vinculacion_activa === false) {

    conditions.push(`COALESCE(estado_vinculacion, '') NOT IN ('ACTIVA', 'ACTIVO')`);

  }



  if (input.without_category === true) {

    conditions.push(`categoria_id IS NULL`);

  }



  if (input.institucion_sede_count) {

    const criterion = input.institucion_sede_count;

    switch (criterion.operator) {

      case 'EQ':

        params.push(criterion.value ?? 0);

        conditions.push(`institucion_sede_count = $${params.length}::int`);

        break;

      case 'GT':

        params.push(criterion.value ?? 0);

        conditions.push(`institucion_sede_count > $${params.length}::int`);

        break;

      case 'LT':

        params.push(criterion.value ?? 0);

        conditions.push(`institucion_sede_count < $${params.length}::int`);

        break;

      case 'GTE':

        params.push(criterion.value ?? 0);

        conditions.push(`institucion_sede_count >= $${params.length}::int`);

        break;

      case 'LTE':

        params.push(criterion.value ?? 0);

        conditions.push(`institucion_sede_count <= $${params.length}::int`);

        break;

      case 'BETWEEN':

        params.push(criterion.min ?? 0);

        params.push(criterion.max ?? criterion.min ?? 0);

        conditions.push(

          `institucion_sede_count BETWEEN $${params.length - 1}::int AND $${params.length}::int`

        );

        break;

      default:

        break;

    }

  }



  params.push(Math.min(Math.max(input.limit ?? 5000, 1), 5000));



  return {

    sql: `

      ${buildAssignmentBaseSql()}

      WHERE ${conditions.join(' AND ')}

      ORDER BY institucion ASC NULLS LAST, sede ASC NULLS LAST, cargo ASC NULLS LAST, nombre_completo ASC

      LIMIT $${params.length}::int

    `,

    params

  };

};



const formatPeriodoScope = (periodo: PeriodoScopeRow) => ({

  id: String(periodo.id),

  contrato_id: String(periodo.contrato_id),

  nombre_periodo: periodo.nombre_periodo,

  fecha_inicio: toDateString(periodo.fecha_inicio),

  fecha_fin: toDateString(periodo.fecha_fin),

  estado: periodo.estado,

  numero_contrato: periodo.numero_contrato

});



const buildAssignmentCriteriaSnapshot = (

  input:

    | Omit<SalaryCategoryAssignmentPreviewInput, 'periodo_id' | 'target_category_id' | 'limit'>

    | null

    | undefined

) => {

  if (!input) {

    return null;

  }



  const normalizedCount = input.institucion_sede_count

    ? input.institucion_sede_count.operator === 'BETWEEN'

      ? {

          operator: 'BETWEEN' as const,

          min: input.institucion_sede_count.min ?? 0,

          max: input.institucion_sede_count.max ?? input.institucion_sede_count.min ?? 0

        }

      : {

          operator: input.institucion_sede_count.operator,

          value: input.institucion_sede_count.value ?? 0

        }

    : undefined;



  const snapshot = {

    search: trimNullable(input.search),

    contrato_cargo_id: input.contrato_cargo_id ?? undefined,

    cargo: trimNullable(input.cargo),

    municipio_id: input.municipio_id ?? undefined,

    municipio: trimNullable(input.municipio),

    institucion_id: input.institucion_id ?? undefined,

    institucion: trimNullable(input.institucion),

    sede_id: input.sede_id ?? undefined,

    sede: trimNullable(input.sede),

    modalidad_id: input.modalidad_id ?? undefined,

    modalidad: trimNullable(input.modalidad),

    modalidad_codigo: normalizeUpper(input.modalidad_codigo),

    metodo_pago: normalizeUpper(input.metodo_pago),

    estado_vinculacion: normalizeUpper(input.estado_vinculacion),

    vinculacion_activa:

      input.vinculacion_activa === null || input.vinculacion_activa === undefined

        ? undefined

        : input.vinculacion_activa,

    institucion_sede_count: normalizedCount,

    without_category: input.without_category === true ? true : undefined

  };



  const entries = Object.entries(snapshot).filter(([, value]) => value !== undefined && value !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : null;

};



const loadTargetCategoryForPreview = async (

  empresaId: number,

  periodo: PeriodoScopeRow,

  targetCategoryId: number | null | undefined,

  tenant?: TenantAccessContext,

  client?: PoolClient

) => {

  if (!targetCategoryId) {

    return null;

  }



  const row = await loadSalaryCategoryRowOrThrow(targetCategoryId, tenant, client);

  if (Number(row.contrato_id) !== Number(periodo.contrato_id)) {

    throw new AppError(

      'Salary category does not belong to the payroll period contract',

      409,

      'CATEGORY_PERIOD_CONTRACT_MISMATCH'

    );

  }



  await assertContractBelongsToCompany(Number(row.contrato_id), empresaId);



  if (!toBooleanValue(row.activo)) {

    throw new AppError('Salary category is inactive', 409, 'CATEGORY_INACTIVE');

  }



  const periodoInicio = toDateString(periodo.fecha_inicio);

  const periodoFin = toDateString(periodo.fecha_fin);

  const categoriaInicio = toDateString(row.vigente_desde);

  const categoriaFin = toDateString(row.vigente_hasta) ?? openEndedDate;



  if (!periodoInicio || !periodoFin || !categoriaInicio || categoriaInicio > periodoFin || categoriaFin < periodoInicio) {

    throw new AppError(

      'Salary category is outside the payroll period validity range',

      409,

      'CATEGORY_OUT_OF_PERIOD_RANGE'

    );

  }



  return mapSalaryCategory(row);

};



export const listSalaryCategoryAssignmentOptions = async (
  empresaId: number,
  periodoId: number,
  tenant?: TenantAccessContext
) => {
  const periodo = await loadPeriodoScopeOrThrow(periodoId, empresaId, tenant);
  const base = buildAssignmentBaseSql();
  const catalogQuery = (columns: string, where: string, order: string, groupBy: string): string =>
    base.replace(/\s+SELECT \*[\s\S]*FROM counted\s*$/, ' SELECT ' + columns + ' FROM counted WHERE ' + where + ' GROUP BY ' + groupBy + ' ORDER BY ' + order);
  const [modalidades, cargos, municipios, instituciones, sedes, metodosPago] = await Promise.all([
    dbQuery<AssignmentModalityOptionRow>(catalogQuery('modalidad_id, modalidad_codigo, modalidad', 'modalidad_id IS NOT NULL OR modalidad_codigo IS NOT NULL OR modalidad IS NOT NULL', 'UPPER(modalidad_codigo), modalidad ASC NULLS LAST', '1,2,3'), [periodoId]),
    dbQuery<{ id: string; nombre: string }>(catalogQuery('contrato_cargo_id AS id, cargo AS nombre', 'contrato_cargo_id IS NOT NULL AND cargo IS NOT NULL', 'UPPER(cargo)', '1,2'), [periodoId]),
    dbQuery<{ id: string; nombre: string }>(catalogQuery('municipio_id AS id, municipio AS nombre', 'municipio_id IS NOT NULL AND municipio IS NOT NULL', 'UPPER(municipio)', '1,2'), [periodoId]),
    dbQuery<{ id: string; nombre: string }>(catalogQuery('institucion_id AS id, institucion AS nombre', 'institucion_id IS NOT NULL AND institucion IS NOT NULL', 'UPPER(institucion)', '1,2'), [periodoId]),
    dbQuery<{ id: string; nombre: string; institucion_id: string | null }>(catalogQuery('sede_id AS id, sede AS nombre, institucion_id', 'sede_id IS NOT NULL AND sede IS NOT NULL', 'UPPER(sede)', '1,2,3'), [periodoId]),
    dbQuery<{ valor: string }>(catalogQuery('metodo_pago AS valor', "metodo_pago IS NOT NULL AND BTRIM(metodo_pago) <> ''", 'UPPER(metodo_pago)', '1'), [periodoId])
  ]);
  return {
    periodo: formatPeriodoScope(periodo),
    modalidades: modalidades.rows.map((row) => ({ key: String(row.modalidad ?? row.modalidad_codigo ?? row.modalidad_id ?? '').trim().toUpperCase(), id: row.modalidad_id ? String(row.modalidad_id) : null, codigo: row.modalidad_codigo ? String(row.modalidad_codigo).trim() : null, nombre: row.modalidad ? String(row.modalidad).trim() : null, etiqueta: [row.modalidad_codigo, row.modalidad].filter((value): value is string => Boolean(value && value.trim())).join(" / ") })),
    cargos: cargos.rows.map((row) => ({ id: String(row.id), nombre: String(row.nombre).trim() })),
    municipios: municipios.rows.map((row) => ({ id: String(row.id), nombre: String(row.nombre).trim() })),
    instituciones: instituciones.rows.map((row) => ({ id: String(row.id), nombre: String(row.nombre).trim() })),
    sedes: sedes.rows.map((row) => ({ id: String(row.id), nombre: String(row.nombre).trim(), institucion_id: row.institucion_id ? String(row.institucion_id) : null })),
    metodos_pago: metodosPago.rows.map((row) => String(row.valor).trim()).filter(Boolean)
  };
};

const buildAssignmentControlSummary = async (

  periodoId: number,

  client?: PoolClient

): Promise<{

  categorias_usadas: number;

  con_categoria: number;

  inconsistencias: string[];

  sin_categoria: number;

  sin_contexto_operativo: number;

  total_empleados: number;

}> => {

  const executor = client ?? dbPool;

  const result = await executor.query<PeriodControlSummaryRow>(

    `

      WITH contexto AS (

        SELECT

          ne.id,

          ff.institucion_id,

          ff.sede_id,

          ncs.id AS categoria_id,

          ncs.vigente_desde,

          ncs.vigente_hasta

        FROM nomina_empleados ne

        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id

        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id

        LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id

        LEFT JOIN LATERAL (

          SELECT ca1.focalizacion_final_id

          FROM cobertura_asignaciones ca1

          WHERE ca1.vinculacion_id = v.id

            AND COALESCE(ca1.activo, TRUE) = TRUE

            AND ca1.fecha_inicio <= np.fecha_fin

            AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= np.fecha_inicio)

          ORDER BY ca1.fecha_inicio DESC, ca1.id DESC

          LIMIT 1

        ) ca ON TRUE

        LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id

        WHERE ne.periodo_id = $1::bigint

          AND COALESCE(ne.activo, TRUE) = TRUE

      )

      SELECT

        COUNT(*)::int AS total_empleados,

        COUNT(*) FILTER (WHERE categoria_id IS NOT NULL)::int AS con_categoria,

        COUNT(*) FILTER (WHERE categoria_id IS NULL)::int AS sin_categoria,

        COUNT(DISTINCT categoria_id)::int AS categorias_usadas,

        COUNT(*) FILTER (WHERE institucion_id IS NULL OR sede_id IS NULL)::int AS sin_contexto_operativo,

        COUNT(*) FILTER (

          WHERE categoria_id IS NOT NULL

            AND (

              vigente_desde IS NULL

              OR vigente_desde > (SELECT fecha_fin FROM nomina_periodos WHERE id = $1::bigint)

              OR COALESCE(vigente_hasta, '${openEndedDate}'::date) < (SELECT fecha_inicio FROM nomina_periodos WHERE id = $1::bigint)

            )

        )::int AS categorias_fuera_vigencia

      FROM contexto

    `,

    [periodoId]

  );



  const row = result.rows[0];

  if (!row) {

    return {

      total_empleados: 0,

      con_categoria: 0,

      sin_categoria: 0,

      categorias_usadas: 0,

      sin_contexto_operativo: 0,

      inconsistencias: []

    };

  }



  const inconsistencias: string[] = [];

  if (row.sin_contexto_operativo > 0) {

    inconsistencias.push('EMPLEADOS_SIN_CONTEXTO_OPERATIVO');

  }

  if (row.categorias_fuera_vigencia > 0) {

    inconsistencias.push('CATEGORIAS_FUERA_DE_VIGENCIA');

  }



  return {

    total_empleados: row.total_empleados,

    con_categoria: row.con_categoria,

    sin_categoria: row.sin_categoria,

    categorias_usadas: row.categorias_usadas,

    sin_contexto_operativo: row.sin_contexto_operativo,

    inconsistencias

  };

};



export const getCompanyConfiguration = async (

  empresaId: number,

  tenant?: TenantAccessContext

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);



  const [generalResult, modulesResult, capabilities] = await Promise.all([

    dbQuery(

      `

        SELECT

          e.id::text,

          e.nombre_empresa,

          e.nit,

          e.direccion,

          e.telefono,

          e.correo,

          e.ciudad,

          e.departamento,

          e.activo,

          o.id::text AS organizacion_id,

          o.nombre AS organizacion_nombre,

          c.nombre_comercial,

          c.dv,

          COALESCE(c.pais, 'Colombia') AS pais,

          COALESCE(c.zona_horaria, 'America/Bogota') AS zona_horaria,

          COALESCE(c.moneda, 'COP') AS moneda,

          COALESCE(c.locale, 'es-CO') AS locale,

          c.logo_url,

          c.encabezado_documentos,

          c.updated_at

        FROM empresas e

        INNER JOIN organizaciones o ON o.id = e.organizacion_id

        LEFT JOIN empresa_configuracion_general c ON c.empresa_id = e.id

        WHERE e.id = $1::bigint

      `,

      [empresaId]

    ),

    dbQuery(

      `

        SELECT

          m.id::text AS modulo_id,

          m.codigo,

          m.nombre,

          COALESCE(c.estado, 'PENDIENTE') AS estado,

          c.observaciones,

          c.updated_at

        FROM modulos m

        LEFT JOIN empresa_modulo_configuracion c

          ON c.modulo_id = m.id

         AND c.empresa_id = $1::bigint

        WHERE m.activo = TRUE

        ORDER BY m.orden, m.id

      `,

      [empresaId]

    ),

    getEmpresaCapabilities(empresaId, tenant)

  ]);



  if (!generalResult.rows[0]) {

    throw new AppError('Company not found', 404, 'EMPRESA_NOT_FOUND');

  }



  return {

    general: generalResult.rows[0],

    modulos: (modulesResult.rows as Array<QueryResultRow & { codigo: string; estado: string }>)

      .filter((row) => capabilities.modulos[row.codigo])

      .map((row) => ({

        ...row,

        habilitado: true,

        configurado: row.estado === 'CONFIGURADA'

      }))

  };

};



export const saveGeneralConfiguration = async (

  empresaId: number,

  input: GeneralConfigInput,

  actorUserId: string,

  tenant?: TenantAccessContext,

  auditMeta?: AuditRequestMeta

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  const client = await dbPool.connect();



  try {

    await client.query('BEGIN');

    const before = await getCompanyConfiguration(empresaId, tenant);



    await client.query(

      `

        UPDATE empresas

        SET

          direccion = $2,

          telefono = $3,

          correo = $4,

          ciudad = $5,

          departamento = $6

        WHERE id = $1::bigint

      `,

      [

        empresaId,

        input.direccion ?? null,

        input.telefono ?? null,

        input.correo ?? null,

        input.ciudad ?? null,

        input.departamento ?? null

      ]

    );



    await client.query(

      `

        INSERT INTO empresa_configuracion_general (

          empresa_id,

          nombre_comercial,

          dv,

          pais,

          zona_horaria,

          moneda,

          locale,

          logo_url,

          encabezado_documentos,

          updated_by

        )

        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)

        ON CONFLICT (empresa_id)

        DO UPDATE SET

          nombre_comercial = EXCLUDED.nombre_comercial,

          dv = EXCLUDED.dv,

          pais = EXCLUDED.pais,

          zona_horaria = EXCLUDED.zona_horaria,

          moneda = EXCLUDED.moneda,

          locale = EXCLUDED.locale,

          logo_url = EXCLUDED.logo_url,

          encabezado_documentos = EXCLUDED.encabezado_documentos,

          updated_by = EXCLUDED.updated_by,

          updated_at = NOW()

      `,

      [

        empresaId,

        input.nombre_comercial ?? null,

        input.dv ?? null,

        input.pais,

        input.zona_horaria,

        input.moneda,

        input.locale,

        input.logo_url ?? null,

        input.encabezado_documentos ?? null,

        actorUserId

      ]

    );



    await registerAuditEntry({

      accion: 'UPDATE',

      tabla: 'empresa_configuracion_general',

      registro_id: String(empresaId),

      descripcion: 'Configuración general empresarial actualizada',

      before: before.general,

      after: { ...before.general, ...input },

      usuario_id: actorUserId,

      client,

      ...auditMeta

    });



    await client.query('COMMIT');

    return getCompanyConfiguration(empresaId, tenant);

  } catch (error) {

    await client.query('ROLLBACK');

    throw error;

  } finally {

    client.release();

  }

};



export const saveModuleConfiguration = async (

  empresaId: number,

  codigo: string,

  input: ModuleConfigInput,

  actorUserId: string,

  tenant?: TenantAccessContext,

  auditMeta?: AuditRequestMeta

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, codigo, tenant);



  const moduleResult = await dbQuery<{ id: string }>(

    `SELECT id::text FROM modulos WHERE codigo = $1 AND activo = TRUE`,

    [codigo]

  );



  const moduleRow = moduleResult.rows[0];

  if (!moduleRow) {

    throw new AppError('Module is inactive or missing', 409, 'MODULE_INACTIVE');

  }



  const result = await dbQuery(

    `

      INSERT INTO empresa_modulo_configuracion (

        empresa_id,

        modulo_id,

        estado,

        observaciones,

        updated_by

      )

      VALUES ($1,$2,$3,$4,$5)

      ON CONFLICT (empresa_id, modulo_id)

      DO UPDATE SET

        estado = EXCLUDED.estado,

        observaciones = EXCLUDED.observaciones,

        updated_by = EXCLUDED.updated_by,

        updated_at = NOW()

      RETURNING *

    `,

    [empresaId, moduleRow.id, input.estado, input.observaciones ?? null, actorUserId]

  );



  const saved = result.rows[0];

  if (!saved) {

    throw new AppError('Module configuration was not saved', 500, 'CONFIGURATION_SAVE_FAILED');

  }



  await registerAuditEntry({

    accion: 'UPSERT',

    tabla: 'empresa_modulo_configuracion',

    registro_id: String(saved.id),

    descripcion: `Configuración ${codigo} actualizada`,

    after: saved,

    usuario_id: actorUserId,

    ...auditMeta

  });



  return saved;

};



export const listPayrollParameters = async (

  empresaId: number,

  fecha: string | undefined,

  tenant?: TenantAccessContext

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, 'NOMINA', tenant);



  const params: unknown[] = [empresaId];

  let whereByDate = '';



  if (fecha) {

    params.push(fecha);

    whereByDate =

      'AND vigente_desde <= $2::date AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date)';

  }



  const result = await dbQuery(

    `

      SELECT *

      FROM nomina_parametros_economicos

      WHERE empresa_id = $1::bigint

        ${whereByDate}

      ORDER BY vigente_desde DESC, id DESC

    `,

    params

  );



  return result.rows;

};



export const createPayrollParameter = async (

  empresaId: number,

  input: PayrollParameterInput,

  actorUserId: string,

  tenant?: TenantAccessContext,

  auditMeta?: AuditRequestMeta

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, 'NOMINA', tenant);



  const keys = [

    'vigente_desde',

    'vigente_hasta',

    'salario_minimo',

    'auxilio_transporte',

    'uvt',

    'porcentaje_salud_empleado',

    'porcentaje_pension_empleado',

    'porcentaje_fondo_solidaridad',

    'porcentaje_hora_extra_diurna',

    'porcentaje_hora_extra_nocturna',

    'porcentaje_recargo_nocturno',

    'regla_redondeo',

    'observaciones'

  ] as const;



  const values = keys.map((key) => input[key] ?? null);

  values[11] = input.regla_redondeo ?? 'NEAREST';



  const result = await dbQuery(

    `

      INSERT INTO nomina_parametros_economicos (

        empresa_id,

        ${keys.join(',')},

        created_by

      )

      VALUES (

        $1,

        ${keys.map((_, index) => `$${index + 2}`).join(',')},

        $15

      )

      RETURNING *

    `,

    [empresaId, ...values, actorUserId]

  );



  const saved = result.rows[0];

  if (!saved) {

    throw new AppError('Payroll parameter was not saved', 500, 'CONFIGURATION_SAVE_FAILED');

  }



  await registerAuditEntry({

    accion: 'CREATE',

    tabla: 'nomina_parametros_economicos',

    registro_id: String(saved.id),

    descripcion: 'Parámetro económico de nómina creado',

    after: saved,

    usuario_id: actorUserId,

    ...auditMeta

  });



  return saved;

};



export const listSalaryCategories = async (

  empresaId: number,

  tenant?: TenantAccessContext

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, 'NOMINA', tenant);



  const result = await dbQuery<SalaryCategoryRow>(

    `

      SELECT

        ncs.*,

        c.numero_contrato

      FROM nomina_categorias_salariales ncs

      INNER JOIN contratos c ON c.id = ncs.contrato_id

      WHERE c.empresa_id = $1::bigint

      ORDER BY ncs.codigo_categoria ASC, ncs.vigente_desde DESC, ncs.id DESC

    `,

    [empresaId]

  );



  return result.rows.map(mapSalaryCategory);

};



export const createSalaryCategory = async (

  empresaId: number,

  input: SalaryCategoryInput,

  actorUserId: string,

  tenant?: TenantAccessContext,

  auditMeta?: AuditRequestMeta

) => {

  assertTenantAccessForEmpresaId(tenant, empresaId);

  await assertModuleEnabled(empresaId, 'NOMINA', tenant);



  const normalized = normalizeSalaryCategoryCreateInput(input);

  await assertContractBelongsToCompany(normalized.contrato_id, empresaId);

  await assertSalaryCategoryOverlap({

    contrato_id: normalized.contrato_id,

    codigo_categoria: normalized.codigo_categoria,

    vigente_desde: normalized.vigente_desde,

    vigente_hasta: normalized.vigente_hasta,

    should_validate: normalized.activo

  });



  const result = await dbQuery<SalaryCategoryRow>(

    `

      INSERT INTO nomina_categorias_salariales (

        contrato_id,

        codigo_categoria,

        nombre_categoria,

        modalidad,

        descripcion,

        salario_base,

        auxilio_transporte,

        otros_recargos,

        vigente_desde,

        vigente_hasta,

        activo

      )

      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)

      RETURNING *

    `,

    [

      normalized.contrato_id,

      normalized.codigo_categoria,

      normalized.nombre_categoria,

      normalized.modalidad,

      normalized.descripcion,

      normalized.salario_base,

      normalized.auxilio_transporte,

      normalized.otros_recargos,

      normalized.vigente_desde,

      normalized.vigente_hasta,

      normalized.activo

    ]

  );



  const saved = result.rows[0];

  if (!saved) {

    throw new AppError('Salary category was not saved', 500, 'CATEGORY_SAVE_FAILED');

  }



  await registerAuditEntry({

    accion: 'CREATE',

    tabla: 'nomina_categorias_salariales',

    registro_id: String(saved.id),

    descripcion: 'Versión de categoría salarial creada',

    after: saved,

    contrato_id: normalized.contrato_id,

    empresa_id: empresaId,

    usuario_id: actorUserId,

    ...auditMeta

  });



  return mapSalaryCategory(saved);

};



export const updateSalaryCategory = async (

  categoryId: number,

  input: SalaryCategoryCorrectionInput,

  actorUserId: string,

  tenant?: TenantAccessContext,

  auditMeta?: AuditRequestMeta

) => {

  const currentRow = await loadSalaryCategoryRowOrThrow(categoryId, tenant);

  const current = mapSalaryCategory(currentRow);

  const normalized = normalizeSalaryCategoryCorrectionInput(current, input);



  await assertSalaryCategoryOverlap({

    contrato_id: Number(current.contrato_id),

    codigo_categoria: current.codigo_categoria,

    vigente_desde: normalized.vigente_desde,

    vigente_hasta: normalized.vigente_hasta,

    exclude_id: categoryId,

    should_validate: normalized.activo

  });



  const result = await dbQuery<SalaryCategoryRow>(

    `

      UPDATE nomina_categorias_salariales

      SET

        nombre_categoria = $1,

        modalidad = $2,

        descripcion = $3,

        salario_base = $4,

        auxilio_transporte = $5,

        otros_recargos = $6,

        vigente_desde = $7::date,

        vigente_hasta = $8::date,

        activo = $9

      WHERE id = $10::bigint

      RETURNING *

    `,

    [

      normalized.nombre_categoria,

      normalized.modalidad,

      normalized.descripcion,

      normalized.salario_base,

      normalized.auxilio_transporte,

      normalized.otros_recargos,

      normalized.vigente_desde,

      normalized.vigente_hasta,

      normalized.activo,

      categoryId

    ]

  );



  const saved = result.rows[0];

  if (!saved) {

    throw new AppError('Salary category was not saved', 500, 'CATEGORY_SAVE_FAILED');

  }



  const categoryCompanyResult = await dbQuery<ContractCompanyRow>(

    `

      SELECT empresa_id

      FROM contratos

      WHERE id = $1::bigint

      LIMIT 1

    `,

    [current.contrato_id]

  );



  await registerAuditEntry({

    accion: 'UPDATE',

    tabla: 'nomina_categorias_salariales',

    registro_id: String(categoryId),

    descripcion: 'Corrección de categoría salarial',

    before: current,

    after: mapSalaryCategory(saved),

    contrato_id: current.contrato_id,

    empresa_id: categoryCompanyResult.rows[0]?.empresa_id ?? null,

    usuario_id: actorUserId,

    ...auditMeta

  });



  return mapSalaryCategory(saved);

};



export const previewSalaryCategoryAssignment = async (

  empresaId: number,

  input: SalaryCategoryAssignmentPreviewInput,

  tenant?: TenantAccessContext

) => {

  const periodo = await loadPeriodoScopeOrThrow(input.periodo_id, empresaId, tenant);

  const category = await loadTargetCategoryForPreview(

    empresaId,

    periodo,

    input.target_category_id,

    tenant

  );

  const query = buildAssignmentPreviewQuery(input);

  const result = await dbQuery<AssignmentCandidateRow>(query.sql, query.params);



  const items = result.rows.map((row) => ({

    nomina_empleado_id: row.nomina_empleado_id,

    vinculacion_id: row.vinculacion_id,

    persona_id: row.persona_id,

    nombre_completo: row.nombre_completo,

    numero_documento: row.numero_documento,

    cargo: row.cargo,

    contrato_cargo_id: row.contrato_cargo_id,

    municipio: row.municipio,

    institucion: row.institucion,

    sede: row.sede,

    modalidad: row.modalidad,

    modalidad_codigo: row.modalidad_codigo,

    metodo_pago: row.metodo_pago,

    estado_vinculacion: row.estado_vinculacion,

    aplica_cobertura: row.aplica_cobertura === true,

    institucion_sede_count: row.institucion_sede_count,

    categoria_salarial_actual: row.categoria_id

      ? {

          id: row.categoria_id,

          codigo_categoria: row.categoria_codigo,

          nombre_categoria: row.categoria_nombre

        }

      : null

  }));



  const instituciones = new Set(

    items.map((item) => item.institucion).filter((value): value is string => Boolean(value))

  );

  const sedes = new Set(

    items.map((item) => item.sede).filter((value): value is string => Boolean(value))

  );



  return {

    periodo: formatPeriodoScope(periodo),

    categoria_destino: category,

    resumen: {

      total_encontrados: items.length,

      instituciones: instituciones.size,

      sedes: sedes.size,

      salario_base: category?.salario_base ?? null,

      auxilio_transporte: category?.auxilio_transporte ?? null,

      otros_recargos: category?.otros_recargos ?? null

    },

    items,

    sql_reference: 'company-settings.salary-category-assignments.preview.v1'

  };

};



export const applySalaryCategoryAssignment = async (

  empresaId: number,

  input: SalaryCategoryAssignmentApplyInput,

  actorUserId: string,

  tenant?: TenantAccessContext,

  auditMeta?: AuditRequestMeta

) => {

  if (input.nomina_empleado_ids.length === 0) {

    throw new AppError(

      'At least one payroll employee must be selected',

      400,

      'CATEGORY_ASSIGNMENT_SELECTION_REQUIRED'

    );

  }



  const client = await dbPool.connect();



  try {

    await client.query('BEGIN');

    const periodo = await loadPeriodoScopeOrThrow(input.periodo_id, empresaId, tenant, client);

    if (periodo.estado !== 'ABIERTO') {

      throw new AppError(

        'Payroll period must remain open for category assignment',

        409,

        'CATEGORY_ASSIGNMENT_PERIODO_CERRADO'

      );

    }



    const category = await loadTargetCategoryForPreview(

      empresaId,

      periodo,

      input.target_category_id,

      tenant,

      client

    );

    const targetCategoryId = category ? Number(category.id) : null;



    const employeesResult = await client.query<AssignmentCurrentRow>(

      `

        SELECT

          ne.id::text AS nomina_empleado_id,

          ncs.id::text AS categoria_id,

          ncs.codigo_categoria AS categoria_codigo,

          ncs.nombre_categoria AS categoria_nombre,

          p.numero_documento,

          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre

        FROM nomina_empleados ne

        INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id

        INNER JOIN personas p ON p.id = v.persona_id

        LEFT JOIN nomina_categorias_salariales ncs ON ncs.id = ne.categoria_salarial_id

        WHERE ne.periodo_id = $1::bigint

          AND COALESCE(ne.activo, TRUE) = TRUE

          AND ne.id = ANY($2::bigint[])

        ORDER BY ne.id

      `,

      [input.periodo_id, input.nomina_empleado_ids]

    );



    if (employeesResult.rows.length !== input.nomina_empleado_ids.length) {

      throw new AppError(

        'One or more selected payroll employees are invalid for the target period',

        409,

        'CATEGORY_ASSIGNMENT_INVALID_SELECTION'

      );

    }



    const changedRows = employeesResult.rows.filter(

      (row) => Number(row.categoria_id ?? 0) !== Number(targetCategoryId ?? 0)

    );

    const previewCriteria = buildAssignmentCriteriaSnapshot(input.preview_criteria ?? null);



    for (const row of changedRows) {

      const accionCategoria = targetCategoryId === null ? 'RETIRAR' : row.categoria_id ? 'CAMBIAR' : 'ASIGNAR';

      const before = {

        nomina_empleado_id: row.nomina_empleado_id,

        periodo_id: String(periodo.id),

        contrato_id: String(periodo.contrato_id),

        empresa_id: String(periodo.empresa_id),

        categoria_salarial_id: row.categoria_id,

        categoria_salarial: row.categoria_id

          ? {

              id: row.categoria_id,

              codigo_categoria: row.categoria_codigo,

              nombre_categoria: row.categoria_nombre

            }

          : null,

        trabajador: {

          nombre_completo: row.persona_nombre,

          numero_documento: row.numero_documento

        }

      };



      await client.query(

        `

          UPDATE nomina_empleados

          SET categoria_salarial_id = $2::bigint

          WHERE id = $1::bigint

        `,

        [row.nomina_empleado_id, targetCategoryId]

      );



      await registerAuditEntry({

        client,

        usuario_id: actorUserId,

        accion: 'NOMINA_EMPLEADO_CATEGORY_ASSIGN',

        tabla: 'nomina_empleados',

        registro_id: row.nomina_empleado_id,

        descripcion: input.observacion ?? `${accionCategoria} categoría salarial manual`,

        contrato_id: String(periodo.contrato_id),

        empresa_id: String(periodo.empresa_id),

        before,

        after: {

          nomina_empleado_id: row.nomina_empleado_id,

          periodo_id: String(periodo.id),

          contrato_id: String(periodo.contrato_id),

          empresa_id: String(periodo.empresa_id),

          categoria_salarial_id: targetCategoryId ? String(targetCategoryId) : null,

          categoria_salarial: category

            ? {

                id: category.id,

                codigo_categoria: category.codigo_categoria,

                nombre_categoria: category.nombre_categoria

              }

            : null,

          accion_categoria: accionCategoria,

          observacion: input.observacion ?? null,

          criterios_preview: previewCriteria,

          trabajador: {

            nombre_completo: row.persona_nombre,

            numero_documento: row.numero_documento

          }

        },

        ip: auditMeta?.ip ?? null,

        user_agent: auditMeta?.user_agent ?? null

      });

    }



    const control = await buildAssignmentControlSummary(input.periodo_id, client);

    await client.query('COMMIT');



    return {

      periodo: formatPeriodoScope(periodo),

      categoria_destino: category,

      procesados: employeesResult.rows.length,

      asignados: changedRows.length,

      omitidos: employeesResult.rows.length - changedRows.length,

      mensaje: category

        ? `Se asignaron ${changedRows.length} trabajadores a la categoría ${category.codigo_categoria}. Recalcula el periodo cuando termines de configurar y asignar todas las categorías.`

        : `Se retiró la categoría salarial a ${changedRows.length} trabajadores. Recalcula el periodo cuando termines de configurar y asignar todas las categorías.`,

      control

    };

  } catch (error) {

    await client.query('ROLLBACK');

    throw error;

  } finally {

    client.release();

  }

};

