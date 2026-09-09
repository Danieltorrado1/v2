import { dbPool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';

export const NOMINA_PROCESOS = ['COBERTURA', 'ASISTENCIA', 'OPS'] as const;
export type NominaProceso = (typeof NOMINA_PROCESOS)[number];

const GESTOR_ROLE = 'GESTOR';
const TALENTO_HUMANO_ROLE = 'TALENTO_HUMANO';

export interface NominaProcessAccess {
  proceso: NominaProceso;
  responsable: boolean;
  municipios: number[];
  areas: number[];
  administrative?: boolean;
}

export type NominaResponsibility = {
  contrato_id?: number | string | null;
  proceso: NominaProceso;
  municipios?: number[];
  areas?: number[];
};

export type NominaMunicipalScope = {
  municipios_visibles_ids: number[];
  municipios_nomina_ids: number[];
};

const isTalentoHumanoUser = async (userId: string | number): Promise<boolean> => {
  const result = await dbPool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM usuario_roles ur
        JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = $1::bigint
          AND r.nombre_rol = 'TALENTO_HUMANO'
          AND COALESCE(ur.activo, TRUE) = TRUE
          AND COALESCE(r.activo, TRUE) = TRUE
      ) AS is_th
    `,
    [userId],
  );
  return result.rows[0]?.is_th === true;
};

/**
 * Resolución canónica del alcance efectivo de Nómina.
 * TH hereda sus municipios territoriales; los demás usuarios usan
 * responsabilidades explícitas de Nómina. GESTOR no hereda TH.
 */
export async function getEffectivePayrollMunicipalityIds(
  userId: string | number,
  empresaId: string | number,
  contratoId: string | number,
): Promise<number[]> {
  if (await isTalentoHumanoUser(userId)) {
    const result = await dbPool.query<{ municipio_id: string | number }>(
      `
        SELECT DISTINCT gma.municipio_id
        FROM gestor_municipio_asignaciones gma
        WHERE gma.usuario_id = $1::bigint
          AND gma.contrato_id = $2::bigint
          AND COALESCE(gma.activo, TRUE) = TRUE
          AND gma.vigencia_desde <= CURRENT_DATE
          AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= CURRENT_DATE)
        ORDER BY gma.municipio_id
      `,
      [userId, contratoId],
    );
    return result.rows.map((row) => Number(row.municipio_id));
  }

  const result = await dbPool.query<{ municipio_id: string | number }>(
    `
      SELECT DISTINCT nrm.municipio_id
      FROM nomina_responsabilidades_usuario nru
      JOIN nomina_responsabilidad_municipios nrm
        ON nrm.responsabilidad_id = nru.id
      WHERE nru.usuario_id = $1::bigint
        AND nru.empresa_id = $2::bigint
        AND nru.contrato_id = $3::bigint
        AND nru.proceso = 'COBERTURA'
        AND nru.activo = TRUE
      ORDER BY nrm.municipio_id
    `,
    [userId, empresaId, contratoId],
  );
  return result.rows.map((row) => Number(row.municipio_id));
}

export function evaluateNominaProcessAccess(
  assignments: NominaResponsibility[]
): NominaProcessAccess[] {
  return NOMINA_PROCESOS.map((proceso) => {
    const matches = assignments.filter((item) => item.proceso === proceso);

    return {
      proceso,
      responsable: matches.length > 0,
      municipios: [
        ...new Set(
          matches.flatMap((item) => item.municipios ?? [])
        )
      ],
      areas: [
        ...new Set(
          matches.flatMap((item) => item.areas ?? [])
        )
      ]
    };
  });
}

const normalize = (value: string): NominaProceso => {
  const candidate = value.trim().toUpperCase() as NominaProceso;

  if (!NOMINA_PROCESOS.includes(candidate)) {
    throw new AppError(
      'Proceso de nomina invalido',
      400,
      'NOMINA_PROCESO_INVALIDO'
    );
  }

  return candidate;
};

const tenantHasRole = (
  tenant: TenantAccessContext | undefined,
  roleName: string
): boolean => tenant?.roleNames.includes(roleName) === true;

const isScopedGestorTenant = (
  tenant?: TenantAccessContext
): boolean =>
  Boolean(
    tenant &&
      !tenant.isGlobalAdmin &&
      tenant.userId &&
      tenantHasRole(tenant, GESTOR_ROLE) &&
      !tenantHasRole(tenant, TALENTO_HUMANO_ROLE)
  );

const isScopedTalentoHumanoTenant = (
  tenant?: TenantAccessContext
): boolean =>
  Boolean(
    tenant &&
      !tenant.isGlobalAdmin &&
      tenant.userId &&
      tenantHasRole(tenant, TALENTO_HUMANO_ROLE) &&
      !tenantHasRole(tenant, GESTOR_ROLE)
  );

const buildGestorPersonalScopeSql = (
  userParamSql: string,
  vinculacionSql: string,
  contratoSql: string,
  periodoInicioSql: string,
  periodoFinSql: string
): string => `
  (
    EXISTS (
      SELECT 1
      FROM gestor_personal_asignaciones gpa_scope
      WHERE gpa_scope.vinculacion_id = ${vinculacionSql}
        AND gpa_scope.contrato_id = ${contratoSql}
        AND gpa_scope.usuario_id = ${userParamSql}::bigint
        AND COALESCE(gpa_scope.activo, TRUE) = TRUE
        AND gpa_scope.vigencia_desde <= CURRENT_DATE
        AND (
          gpa_scope.vigencia_hasta IS NULL
          OR gpa_scope.vigencia_hasta >= CURRENT_DATE
        )
    )
    OR EXISTS (
      SELECT 1
      FROM gestor_municipio_asignaciones gma_scope
      JOIN cobertura_asignaciones cas_scope
        ON cas_scope.vinculacion_id = ${vinculacionSql}
      JOIN focalizacion_final cff_scope
        ON cff_scope.id = cas_scope.focalizacion_final_id
      WHERE gma_scope.usuario_id = ${userParamSql}::bigint
        AND gma_scope.contrato_id = ${contratoSql}
        AND COALESCE(gma_scope.activo, TRUE) = TRUE
        AND gma_scope.vigencia_desde <= CURRENT_DATE
        AND (
          gma_scope.vigencia_hasta IS NULL
          OR gma_scope.vigencia_hasta >= CURRENT_DATE
        )
        AND cas_scope.fecha_inicio <= ${periodoFinSql}
        AND (
          cas_scope.fecha_fin IS NULL
          OR cas_scope.fecha_fin >= ${periodoInicioSql}
        )
        AND cff_scope.municipio_id = gma_scope.municipio_id
    )
  )
`;

const buildNominaCoberturaScopeSql = (
  userParamSql: string,
  vinculacionSql: string,
  empresaSql: string,
  contratoSql: string,
  periodoInicioSql: string,
  periodoFinSql: string,
  tenant?: TenantAccessContext
): string => {
  const responsibilitySql = `
    EXISTS (
      SELECT 1
      FROM nomina_responsabilidades_usuario nru
      JOIN nomina_responsabilidad_municipios nrm
        ON nrm.responsabilidad_id = nru.id
      JOIN cobertura_asignaciones cas
        ON cas.vinculacion_id = ${vinculacionSql}
      JOIN focalizacion_final cff
        ON cff.id = cas.focalizacion_final_id
      WHERE nru.usuario_id = ${userParamSql}::bigint
        AND nru.empresa_id = ${empresaSql}
        AND nru.proceso = 'COBERTURA'
        AND nru.contrato_id = ${contratoSql}
        AND nru.activo = TRUE
        AND cff.municipio_id = nrm.municipio_id
        AND cas.fecha_inicio <= ${periodoFinSql}
        AND (
          cas.fecha_fin IS NULL
          OR cas.fecha_fin >= ${periodoInicioSql}
        )
    )
  `;

  /*
   * Usuarios que no son Gestor ni TH continúan utilizando
   * las responsabilidades operativas de Nómina.
   */
  if (!isScopedGestorTenant(tenant)) {
    /*
     * Para Talento Humano el alcance territorial se resuelve
     * directamente desde las asignaciones territoriales vigentes.
     */
    if (isScopedTalentoHumanoTenant(tenant)) {
      return `
        EXISTS (
          SELECT 1
          FROM gestor_municipio_asignaciones gma_scope
          JOIN cobertura_asignaciones cas_scope
            ON cas_scope.vinculacion_id = ${vinculacionSql}
          JOIN focalizacion_final cff_scope
            ON cff_scope.id = cas_scope.focalizacion_final_id
          WHERE gma_scope.usuario_id = ${userParamSql}::bigint
            AND gma_scope.contrato_id = ${contratoSql}
            AND COALESCE(gma_scope.activo, TRUE) = TRUE
            AND gma_scope.vigencia_desde <= CURRENT_DATE
            AND (
              gma_scope.vigencia_hasta IS NULL
              OR gma_scope.vigencia_hasta >= CURRENT_DATE
            )
            AND cas_scope.fecha_inicio <= ${periodoFinSql}
            AND (
              cas_scope.fecha_fin IS NULL
              OR cas_scope.fecha_fin >= ${periodoInicioSql}
            )
            AND cff_scope.municipio_id = gma_scope.municipio_id
        )
      `;
    }

    return responsibilitySql;
  }

  /*
   * GESTOR:
   *
   * No se exige nomina_responsabilidades_usuario.
   *
   * Su autorización operativa proviene del alcance real:
   * 1. asignación personal directa vigente, o
   * 2. asignación territorial vigente por municipio + contrato.
   *
   * Esto permite que un Gestor territorial válido pueda operar
   * aunque todavía no exista una responsabilidad adicional
   * registrada en nomina_responsabilidades_usuario.
   */
  return buildGestorPersonalScopeSql(
    userParamSql,
    vinculacionSql,
    contratoSql,
    periodoInicioSql,
    periodoFinSql
  );
};

export async function getNominaProcessAccess(
  userId: string | number,
  empresaId: string | number,
  tenant?: TenantAccessContext,
  contratoId?: string | number
): Promise<NominaProcessAccess[]> {
  const empresa = Number(empresaId);

  const effectiveContratoId = contratoId ?? (
    tenant && !tenant.isGlobalAdmin && tenant.contratoIds.length === 1
      ? tenant.contratoIds[0]
      : undefined
  );

  if (tenant && !tenant.isGlobalAdmin && effectiveContratoId === undefined) {
    throw new AppError('contrato_id es requerido para consultar alcance de Nómina', 400, 'NOMINA_CONTRATO_REQUIRED');
  }

  if (!tenant?.isGlobalAdmin && tenant) {
    const allowedByContract =
      tenant.contratoIds.length > 0 &&
      (
        await dbPool.query(
          `
            SELECT EXISTS (
              SELECT 1
              FROM contratos
              WHERE empresa_id = $1::bigint
                AND id = ANY($2::bigint[])
            ) allowed
          `,
          [empresa, tenant.contratoIds]
        )
      ).rows[0]?.allowed;

    if (
      !tenant.empresaIds.includes(empresa) &&
      !allowedByContract
    ) {
      throw new AppError(
        'Tenant access denied',
        403,
        'TENANT_FORBIDDEN'
      );
    }
  }

  const result = await dbPool.query<{
    proceso: NominaProceso;
    municipios: number[];
    areas: number[];
  }>(
    `
      SELECT
        r.proceso,
        COALESCE(
          (
            SELECT array_agg(
              rm.municipio_id
              ORDER BY rm.municipio_id
            )
            FROM nomina_responsabilidad_municipios rm
            WHERE rm.responsabilidad_id = r.id
          ),
          '{}'
        ) municipios,
        COALESCE(
          (
            SELECT array_agg(
              ra.area_id
              ORDER BY ra.area_id
            )
            FROM nomina_responsabilidad_areas ra
            WHERE ra.responsabilidad_id = r.id
          ),
          '{}'
        ) areas
      FROM nomina_responsabilidades_usuario r
      WHERE r.usuario_id = $1::bigint
        AND r.empresa_id = $2::bigint
        AND ($3::bigint IS NULL OR r.contrato_id = $3::bigint)
        AND r.activo = TRUE
      ORDER BY r.proceso
    `,
    [userId, empresa, effectiveContratoId === undefined ? null : Number(effectiveContratoId)]
  );

  const effectiveMunicipalities = effectiveContratoId === undefined
    ? []
    : await getEffectivePayrollMunicipalityIds(userId, empresa, effectiveContratoId);
  const targetIsTalentoHumano = await isTalentoHumanoUser(userId);
  const accessRows = targetIsTalentoHumano
    ? [
        ...result.rows.map((row) => row.proceso === 'COBERTURA'
          ? { ...row, municipios: effectiveMunicipalities }
          : row),
        ...(effectiveMunicipalities.length > 0 && !result.rows.some((row) => row.proceso === 'COBERTURA')
          ? [{ proceso: 'COBERTURA' as const, municipios: effectiveMunicipalities, areas: [] }]
          : []),
      ]
    : result.rows;

  return evaluateNominaProcessAccess(
    accessRows
  ).map((item) => ({
    ...item,
    administrative: Boolean(tenant?.isGlobalAdmin)
  }));
}

export async function listNominaResponsibilities(
  userId: string | number,
  empresaId: string | number,
  tenant?: TenantAccessContext,
  contratoId?: string | number
) {
  const effectiveContratoId = contratoId ?? (
    tenant && !tenant.isGlobalAdmin && tenant.contratoIds.length === 1
      ? tenant.contratoIds[0]
      : undefined
  );
  if (tenant && !tenant.isGlobalAdmin && effectiveContratoId === undefined) {
    throw new AppError('contrato_id es requerido para consultar responsabilidades de Nómina', 400, 'NOMINA_CONTRATO_REQUIRED');
  }
  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    !tenant.empresaIds.includes(Number(empresaId))
  ) {
    throw new AppError(
      'Tenant access denied',
      403,
      'TENANT_FORBIDDEN'
    );
  }

  const responsibilities = (
    await dbPool.query(
      `
        SELECT
          r.id::text,
          r.contrato_id::text AS contrato_id,
          r.proceso,
          r.activo,
          COALESCE(
            (
              SELECT array_agg(
                municipio_id
                ORDER BY municipio_id
              )
              FROM nomina_responsabilidad_municipios
              WHERE responsabilidad_id = r.id
            ),
            '{}'
          ) municipio_ids,
          COALESCE(
            (
              SELECT array_agg(
                area_id
                ORDER BY area_id
              )
              FROM nomina_responsabilidad_areas
              WHERE responsabilidad_id = r.id
            ),
            '{}'
          ) area_ids
        FROM nomina_responsabilidades_usuario r
        WHERE r.usuario_id = $1::bigint
          AND r.empresa_id = $2::bigint
          AND ($3::bigint IS NULL OR r.contrato_id = $3::bigint)
        ORDER BY r.proceso
      `,
      [userId, empresaId, effectiveContratoId === undefined ? null : Number(effectiveContratoId)]
    )
  ).rows;

  const visible = await dbPool.query<{ municipio_id: number | string }>(
    `
      SELECT municipio_id
      FROM usuario_municipio_visibilidad
      WHERE usuario_id = $1::bigint
        AND empresa_id = $2::bigint
        AND COALESCE(activo, TRUE) = TRUE
        AND vigencia_desde <= CURRENT_DATE
        AND (vigencia_hasta IS NULL OR vigencia_hasta >= CURRENT_DATE)
      ORDER BY municipio_id
    `,
    [userId, empresaId]
  );

  const effectiveMunicipalities = effectiveContratoId === undefined
    ? []
    : await getEffectivePayrollMunicipalityIds(userId, empresaId, effectiveContratoId);
  const talentoHumano = await isTalentoHumanoUser(userId);

  const mappedResponsibilities = responsibilities.map((row) => ({
    ...row,
    activo: talentoHumano && row.proceso === 'COBERTURA'
      ? effectiveMunicipalities.length > 0
      : row.activo,
    municipio_ids: talentoHumano && row.proceso === 'COBERTURA'
      ? effectiveMunicipalities
      : (row.municipio_ids ?? []).map(Number),
    area_ids: (row.area_ids ?? []).map(Number),
    municipios_visibles_ids: visible.rows.map((item) => Number(item.municipio_id))
  }));
  if (talentoHumano && effectiveMunicipalities.length > 0 && !mappedResponsibilities.some((row) => row.proceso === 'COBERTURA')) {
    mappedResponsibilities.push({
      id: `th-${userId}-${empresaId}-${effectiveContratoId}`,
      contrato_id: effectiveContratoId,
      proceso: 'COBERTURA',
      activo: true,
      municipio_ids: effectiveMunicipalities,
      area_ids: [],
      municipios_visibles_ids: visible.rows.map((item) => Number(item.municipio_id)),
    });
  }
  return mappedResponsibilities;
}

export async function setNominaMunicipalVisibility(
  input: {
    usuarioId: string | number;
    empresaId: string | number;
    municipioIds?: Array<string | number>;
  },
  tenant?: TenantAccessContext
): Promise<NominaMunicipalScope> {
  const empresaId = Number(input.empresaId);
  let municipioIds = [...new Set((input.municipioIds ?? []).map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0);

  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(empresaId)) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const required = await client.query<{ municipio_id: string | number }>(
      `
        SELECT nrm.municipio_id
        FROM nomina_responsabilidades_usuario nru
        JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id = nru.id
        WHERE nru.usuario_id = $1::bigint AND nru.empresa_id = $2::bigint
          AND nru.proceso = 'COBERTURA' AND nru.activo = TRUE
        UNION
        SELECT gma.municipio_id
        FROM gestor_municipio_asignaciones gma
        JOIN usuario_roles ur ON ur.usuario_id = gma.usuario_id AND COALESCE(ur.activo, TRUE) = TRUE
        JOIN roles r ON r.id = ur.rol_id AND r.nombre_rol = 'TALENTO_HUMANO' AND COALESCE(r.activo, TRUE) = TRUE
        WHERE gma.usuario_id = $1::bigint
          AND COALESCE(gma.activo, TRUE) = TRUE
          AND gma.vigencia_desde <= CURRENT_DATE
          AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= CURRENT_DATE)
      `,
      [input.usuarioId, empresaId]
    );
    municipioIds = [...new Set([...municipioIds, ...required.rows.map((row) => Number(row.municipio_id))])];
    const valid = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM municipios WHERE id = ANY($1::bigint[])`,
      [municipioIds]
    );
    const validIds = valid.rows.map((row) => Number(row.id));
    const invalidIds = municipioIds.filter((id) => !validIds.includes(id));
    if (invalidIds.length > 0) {
      throw new AppError('Uno o más municipios no existen en el catálogo.', 400, 'INVALID_MUNICIPALITY_ID', { invalidIds });
    }

    await client.query(
      `
        UPDATE usuario_municipio_visibilidad
        SET activo = FALSE, vigencia_hasta = CURRENT_DATE - 1,
            updated_by_user_id = $3::bigint, updated_at = NOW()
        WHERE usuario_id = $1::bigint AND empresa_id = $2::bigint
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [input.usuarioId, empresaId, tenant?.userId ?? null]
    );

    if (validIds.length > 0) {
      await client.query(
        `
          INSERT INTO usuario_municipio_visibilidad
            (usuario_id, empresa_id, municipio_id, vigencia_desde, activo,
             created_by_user_id, updated_by_user_id)
          SELECT $1::bigint, $2::bigint, x, CURRENT_DATE, TRUE, $3::bigint, $3::bigint
          FROM unnest($4::bigint[]) AS x
          ON CONFLICT (usuario_id, empresa_id, municipio_id)
          DO UPDATE SET activo = TRUE, vigencia_hasta = NULL,
            updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()
        `,
        [input.usuarioId, empresaId, tenant?.userId ?? null, validIds]
      );
    }
    await client.query('COMMIT');
    return { municipios_visibles_ids: validIds, municipios_nomina_ids: [] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getNominaMunicipalScope(
  userId: string | number,
  empresaId: string | number,
  tenant?: TenantAccessContext,
  contratoId?: string | number
): Promise<NominaMunicipalScope> {
  const empresa = Number(empresaId);
  const effectiveContratoId = contratoId ?? (
    tenant && !tenant.isGlobalAdmin && tenant.contratoIds.length === 1
      ? tenant.contratoIds[0]
      : undefined
  );
  if (tenant && !tenant.isGlobalAdmin && effectiveContratoId === undefined) {
    throw new AppError('contrato_id es requerido para consultar alcance municipal', 400, 'NOMINA_CONTRATO_REQUIRED');
  }
  if (tenant && !tenant.isGlobalAdmin && !tenant.empresaIds.includes(empresa)) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
  const effectiveMunicipalities = effectiveContratoId === undefined
    ? []
    : await getEffectivePayrollMunicipalityIds(userId, empresa, effectiveContratoId);
  const result = await dbPool.query<{ municipios_visibles_ids: number[] }>(
    `
      SELECT COALESCE((SELECT array_agg(umv.municipio_id ORDER BY umv.municipio_id)
          FROM usuario_municipio_visibilidad umv
          WHERE umv.usuario_id = $1::bigint AND umv.empresa_id = $2::bigint
            AND COALESCE(umv.activo, TRUE) = TRUE
            AND umv.vigencia_desde <= CURRENT_DATE
            AND (umv.vigencia_hasta IS NULL OR umv.vigencia_hasta >= CURRENT_DATE)), '{}') AS municipios_visibles_ids
    `,
    [userId, empresa]
  );
  const row = result.rows[0] ?? { municipios_visibles_ids: [] };
  const nomina = effectiveMunicipalities;
  return {
    municipios_nomina_ids: nomina,
    municipios_visibles_ids: [...new Set([...row.municipios_visibles_ids.map(Number), ...nomina])]
  };
}

export async function listNominaAssignableUsers(
  empresaId: string | number,
  tenant?: TenantAccessContext
) {
  const empresa = Number(empresaId);

  if (!Number.isInteger(empresa) || empresa <= 0) {
    throw new AppError(
      'empresa_id invalido',
      400,
      'EMPRESA_ID_INVALID'
    );
  }

  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    !tenant.empresaIds.includes(empresa)
  ) {
    throw new AppError(
      'Tenant access denied',
      403,
      'TENANT_FORBIDDEN'
    );
  }

  return (
    await dbPool.query(
      `
        SELECT
          u.id::text AS id,
          u.nombre_completo AS name,
          u.correo AS email,
          COALESCE(u.activo, TRUE) AS active,
          COALESCE(
            array_agg(DISTINCT r.nombre_rol)
              FILTER (WHERE r.nombre_rol IS NOT NULL),
            '{}'
          ) AS roles,
          ARRAY[$1::bigint] AS "empresaIds"
        FROM usuarios u
        INNER JOIN usuario_empresas ue
          ON ue.usuario_id = u.id
         AND ue.empresa_id = $1::bigint
         AND COALESCE(ue.activo, TRUE) = TRUE
        LEFT JOIN usuario_roles ur
          ON ur.usuario_id = u.id
         AND COALESCE(ur.activo, TRUE) = TRUE
        LEFT JOIN roles r
          ON r.id = ur.rol_id
         AND COALESCE(r.activo, TRUE) = TRUE
        WHERE COALESCE(u.activo, TRUE) = TRUE
          AND EXISTS (
            SELECT 1
            FROM usuario_roles ur_scope
            JOIN rol_permisos rp_scope ON rp_scope.rol_id = ur_scope.rol_id AND COALESCE(rp_scope.activo, TRUE) = TRUE
            JOIN permisos p_scope ON p_scope.id = rp_scope.permiso_id AND COALESCE(p_scope.activo, TRUE) = TRUE
            WHERE ur_scope.usuario_id = u.id
              AND COALESCE(ur_scope.activo, TRUE) = TRUE
              AND p_scope.modulo = 'nomina'
          )
        GROUP BY
          u.id,
          u.nombre_completo,
          u.correo,
          u.activo
        ORDER BY
          u.nombre_completo,
          u.correo,
          u.id
      `,
      [empresa]
    )
  ).rows;
}

export function appendNominaCoberturaScope(
  conditions: string[],
  params: unknown[],
  tenant?: TenantAccessContext,
  aliases = {
    vinculacion: 'v',
    periodo: 'np'
  }
) {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (!tenant.userId) {
    conditions.push('1=0');
    return;
  }

  params.push(tenant.userId);

  const userParamSql = `$${params.length}`;

  conditions.push(
    buildNominaCoberturaScopeSql(
      userParamSql,
      `${aliases.vinculacion}.id`,
      `${aliases.vinculacion}.empresa_id`,
      `${aliases.vinculacion}.contrato_id`,
      `${aliases.periodo}.fecha_inicio`,
      `${aliases.periodo}.fecha_fin`,
      tenant
    )
  );
}

export async function assertNominaEmpleadoCoberturaScope(
  empleadoId: string | number,
  tenant?: TenantAccessContext,
  client: any = dbPool
): Promise<void> {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (!tenant.userId) {
    throw new AppError(
      'Usuario sin responsabilidad para este proceso',
      403,
      'NOMINA_RESPONSABILIDAD_FORBIDDEN'
    );
  }

  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM nomina_empleados ne
        JOIN vinculaciones v
          ON v.id = ne.vinculacion_id
        JOIN nomina_periodos np
          ON np.id = ne.periodo_id
        WHERE ne.id = $1::bigint
          AND ${buildNominaCoberturaScopeSql(
            '$2',
            'v.id',
            'v.empresa_id',
            'v.contrato_id',
            'np.fecha_inicio',
            'np.fecha_fin',
            tenant
          )}
      ) allowed
    `,
    [empleadoId, tenant.userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new AppError(
      'Registro fuera del alcance de nomina',
      403,
      'NOMINA_SCOPE_FORBIDDEN'
    );
  }
}

export async function assertNominaPeriodoCoberturaScope(
  periodoId: string | number,
  tenant?: TenantAccessContext,
  client: any = dbPool
): Promise<void> {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (!tenant.userId) {
    throw new AppError(
      'Usuario sin responsabilidad para este proceso',
      403,
      'NOMINA_RESPONSABILIDAD_FORBIDDEN'
    );
  }

  const responsibility = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM nomina_responsabilidades_usuario
        WHERE usuario_id = $1::bigint
          AND proceso = 'COBERTURA'
          AND activo = TRUE
      ) allowed
    `,
    [tenant.userId]
  );

  if (!responsibility.rows[0]?.allowed) {
    throw new AppError(
      'Usuario sin responsabilidad para este proceso',
      403,
      'NOMINA_RESPONSABILIDAD_FORBIDDEN'
    );
  }

  const result = await client.query(
    `
      SELECT NOT EXISTS (
        SELECT 1
        FROM nomina_empleados ne
        JOIN vinculaciones v
          ON v.id = ne.vinculacion_id
        JOIN nomina_periodos np
          ON np.id = ne.periodo_id
        WHERE ne.periodo_id = $1::bigint
          AND NOT ${buildNominaCoberturaScopeSql(
            '$2',
            'v.id',
            'v.empresa_id',
            'v.contrato_id',
            'np.fecha_inicio',
            'np.fecha_fin',
            tenant
          )}
      ) allowed
    `,
    [periodoId, tenant.userId]
  );

  if (!result.rows[0]?.allowed) {
    throw new AppError(
      'Periodo contiene registros fuera del alcance de nomina',
      403,
      'NOMINA_SCOPE_FORBIDDEN'
    );
  }
}

export async function listNominaAsistenciaPersonal(
  areaId: string | number,
  fecha: string,
  tenant?: TenantAccessContext
) {
  if (tenant && !tenant.isGlobalAdmin) {
    if (!tenant.userId) {
      throw new AppError(
        'Usuario sin responsabilidad para este proceso',
        403,
        'NOMINA_RESPONSABILIDAD_FORBIDDEN'
      );
    }

    const allowed = await dbPool.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM nomina_responsabilidades_usuario nru
          JOIN nomina_responsabilidad_areas nra
            ON nra.responsabilidad_id = nru.id
          WHERE nru.usuario_id = $1::bigint
            AND nru.empresa_id = (
              SELECT empresa_id
              FROM nomina_areas
              WHERE id = $2::bigint
            )
            AND nru.proceso = 'ASISTENCIA'
            AND nru.activo = TRUE
            AND nra.area_id = $2::bigint
        ) allowed
      `,
      [tenant.userId, areaId]
    );

    if (!allowed.rows[0]?.allowed) {
      throw new AppError(
        'Area fuera del alcance de nomina',
        403,
        'NOMINA_AREA_FORBIDDEN'
      );
    }
  }

  return (
    await dbPool.query(
      `
        SELECT
          v.id vinculacion_id,
          p.id persona_id,
          CONCAT_WS(
            ' ',
            p.primer_nombre,
            p.segundo_nombre,
            p.primer_apellido,
            p.segundo_apellido
          ) AS nombre_completo,
          va.area_id
        FROM nomina_vinculacion_areas va
        JOIN nomina_areas a
          ON a.id = va.area_id
        JOIN vinculaciones v
          ON v.id = va.vinculacion_id
        JOIN personas p
          ON p.id = v.persona_id
        WHERE va.area_id = $1::bigint
          AND va.activo = TRUE
          AND va.vigencia_desde <= $2::date
          AND (
            va.vigencia_hasta IS NULL
            OR va.vigencia_hasta >= $2::date
          )
          AND a.activo = TRUE
        ORDER BY
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
          p.id
      `,
      [areaId, fecha]
    )
  ).rows;
}

export async function listNominaAreas(
  empresaId: string | number,
  tenant?: TenantAccessContext
) {
  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    !tenant.empresaIds.includes(Number(empresaId))
  ) {
    throw new AppError(
      'Tenant access denied',
      403,
      'TENANT_FORBIDDEN'
    );
  }

  return (
    await dbPool.query(
      `
        SELECT
          id::text,
          empresa_id::text,
          codigo,
          nombre,
          activo,
          orden
        FROM nomina_areas
        WHERE empresa_id = $1::bigint
        ORDER BY
          COALESCE(orden, 999999),
          id
      `,
      [empresaId]
    )
  ).rows;
}

export async function createNominaArea(
  input: {
    empresaId: string | number;
    codigo: string;
    nombre: string;
    orden?: number;
  },
  tenant?: TenantAccessContext
) {
  const empresaId = Number(input.empresaId);

  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    !tenant.empresaIds.includes(empresaId)
  ) {
    throw new AppError(
      'Tenant access denied',
      403,
      'TENANT_FORBIDDEN'
    );
  }

  return (
    await dbPool.query(
      `
        INSERT INTO nomina_areas(
          empresa_id,
          codigo,
          nombre,
          orden
        )
        VALUES(
          $1::bigint,
          $2,
          $3,
          $4
        )
        RETURNING
          id::text,
          empresa_id::text,
          codigo,
          nombre,
          activo,
          orden
      `,
      [
        empresaId,
        input.codigo.trim(),
        input.nombre.trim(),
        input.orden ?? null
      ]
    )
  ).rows[0];
}

export async function updateNominaArea(
  id: string | number,
  input: {
    nombre?: string;
    activo?: boolean;
    orden?: number;
  },
  tenant?: TenantAccessContext
) {
  const result = await dbPool.query(
    `
      UPDATE nomina_areas
      SET
        nombre = COALESCE($2, nombre),
        activo = COALESCE($3, activo),
        orden = COALESCE($4, orden),
        updated_at = NOW()
      WHERE id = $1::bigint
      ${
        tenant && !tenant.isGlobalAdmin
          ? 'AND empresa_id = ANY($5::bigint[])'
          : ''
      }
      RETURNING
        id::text,
        empresa_id::text,
        codigo,
        nombre,
        activo,
        orden
    `,
    tenant && !tenant.isGlobalAdmin
      ? [
          id,
          input.nombre ?? null,
          input.activo ?? null,
          input.orden ?? null,
          tenant.empresaIds
        ]
      : [
          id,
          input.nombre ?? null,
          input.activo ?? null,
          input.orden ?? null
        ]
  );

  if (!result.rows[0]) {
    throw new AppError(
      'Area no encontrada',
      404,
      'NOMINA_AREA_NOT_FOUND'
    );
  }

  return result.rows[0];
}

export async function replaceNominaResponsibility(
  input: {
    usuarioId: string | number;
    empresaId: string | number;
    contratoId?: string | number;
    proceso: string;
    municipioIds?: Array<string | number>;
    areaIds?: Array<string | number>;
    activo?: boolean;
  },
  tenant?: TenantAccessContext
) {
  const proceso = normalize(input.proceso);
  const empresaId = Number(input.empresaId);
  const contratoId = input.contratoId === undefined || input.contratoId === null ? null : Number(input.contratoId);

  if (tenant && !tenant.isGlobalAdmin && contratoId === null) {
    throw new AppError('contrato_id es requerido para guardar responsabilidades de Nómina', 400, 'NOMINA_CONTRATO_REQUIRED');
  }

  if (
    tenant &&
    !tenant.isGlobalAdmin &&
    !tenant.empresaIds.includes(empresaId)
  ) {
    throw new AppError(
      'Tenant access denied',
      403,
      'TENANT_FORBIDDEN'
    );
  }

  if (contratoId !== null) {
    const contract = await dbPool.query<{ empresa_id: string }>(
      'SELECT empresa_id::text FROM contratos WHERE id = $1::bigint AND COALESCE(activo, TRUE) = TRUE LIMIT 1',
      [contratoId],
    );
    if (!contract.rows[0] || Number(contract.rows[0].empresa_id) !== empresaId) {
      throw new AppError('Contrato fuera de la empresa seleccionada', 400, 'NOMINA_CONTRATO_EMPRESA_MISMATCH');
    }
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const activo =
      proceso !== 'OPS'
        ? proceso === 'COBERTURA'
          ? Boolean(input.municipioIds?.length)
          : Boolean(input.areaIds?.length)
        : input.activo === true;

    const row = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_responsabilidades_usuario(
          usuario_id,
          empresa_id,
          contrato_id,
          proceso,
          activo
        )
        VALUES(
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4,
          $5
        )
        ON CONFLICT(
          usuario_id,
          empresa_id,
          proceso,
          (COALESCE(contrato_id, 0))
        )
        DO UPDATE
        SET
          activo = $5,
          updated_at = NOW()
        RETURNING id::text
      `,
      [
        input.usuarioId,
        empresaId,
        contratoId,
        proceso,
        activo
      ]
    );

    const id = row.rows[0]!.id;

    await client.query(
      `
        DELETE FROM nomina_responsabilidad_municipios
        WHERE responsabilidad_id = $1::bigint
      `,
      [id]
    );

    await client.query(
      `
        DELETE FROM nomina_responsabilidad_areas
        WHERE responsabilidad_id = $1::bigint
      `,
      [id]
    );

    if (
      proceso === 'COBERTURA' &&
      input.municipioIds?.length
    ) {
      await client.query(
        `
          INSERT INTO nomina_responsabilidad_municipios(
            responsabilidad_id,
            municipio_id
          )
          SELECT
            $1::bigint,
            x
          FROM unnest($2::bigint[]) x
        `,
        [
          id,
          input.municipioIds.map(Number)
        ]
      );

      // Regla de integridad: todo municipio operativo de Nómina también
      // queda habilitado para lectura territorial.
      await client.query(
        `
          INSERT INTO usuario_municipio_visibilidad
            (usuario_id, empresa_id, municipio_id, vigencia_desde, activo,
             created_by_user_id, updated_by_user_id)
          SELECT $1::bigint, $2::bigint, x, CURRENT_DATE, TRUE, $3::bigint, $3::bigint
          FROM unnest($4::bigint[]) AS x
          ON CONFLICT (usuario_id, empresa_id, municipio_id)
          DO UPDATE SET activo = TRUE, vigencia_hasta = NULL,
            updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()
        `,
        [input.usuarioId, empresaId, tenant?.userId ?? null, [...new Set(input.municipioIds.map(Number))]]
      );
    }

    if (
      proceso === 'ASISTENCIA' &&
      input.areaIds?.length
    ) {
      await client.query(
        `
          INSERT INTO nomina_responsabilidad_areas(
            responsabilidad_id,
            area_id
          )
          SELECT
            $1::bigint,
            x
          FROM unnest($2::bigint[]) x
        `,
        [
          id,
          input.areaIds.map(Number)
        ]
      );
    }

    await client.query('COMMIT');

    return {
      id,
      proceso,
      empresa_id: empresaId,
      contrato_id: contratoId
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveNominaVinculacionArea(
  vinculacionId: string | number,
  fecha: string,
  tenant?: TenantAccessContext
) {
  const result = await dbPool.query<{
    area_id: number;
    codigo: string;
    nombre: string;
  }>(
    `
      SELECT
        a.id area_id,
        a.codigo,
        a.nombre
      FROM nomina_vinculacion_areas va
      JOIN nomina_areas a
        ON a.id = va.area_id
      JOIN vinculaciones v
        ON v.id = va.vinculacion_id
      JOIN contratos c
        ON c.id = v.contrato_id
      WHERE va.vinculacion_id = $1::bigint
        AND va.activo = TRUE
        AND va.vigencia_desde <= $2::date
        AND (
          va.vigencia_hasta IS NULL
          OR va.vigencia_hasta >= $2::date
        )
        AND (
          $3::boolean
          OR c.empresa_id = ANY($4::bigint[])
        )
      ORDER BY
        va.vigencia_desde DESC,
        va.id DESC
      LIMIT 1
    `,
    [
      vinculacionId,
      fecha,
      tenant?.isGlobalAdmin ?? true,
      tenant?.empresaIds ?? []
    ]
  );

  return result.rows[0] ?? null;
}

export async function assertNominaScope(input: {
  userId: string | number;
  empresaId: string | number;
  proceso: string;
  municipioId?: string | number;
  areaId?: string | number;
  contratoId?: string | number;
  tenant?: TenantAccessContext;
}): Promise<void> {
  const proceso = normalize(input.proceso);

  if (
    input.tenant &&
    !input.tenant.isGlobalAdmin &&
    !input.tenant.empresaIds.includes(
      Number(input.empresaId)
    )
  ) {
    throw new AppError(
      'Tenant access denied',
      403,
      'TENANT_FORBIDDEN'
    );
  }

  if (input.contratoId !== undefined && input.tenant && !input.tenant.isGlobalAdmin) {
    const contract = await dbPool.query<{ empresa_id: string }>('SELECT empresa_id::text FROM contratos WHERE id = $1::bigint LIMIT 1', [input.contratoId]);
    if (!contract.rows[0] || Number(contract.rows[0].empresa_id) !== Number(input.empresaId)) {
      throw new AppError('Contrato fuera de la empresa seleccionada', 403, 'NOMINA_CONTRATO_EMPRESA_MISMATCH');
    }
  }

  const access = (
    await getNominaProcessAccess(
      input.userId,
      input.empresaId,
      input.tenant,
      input.contratoId
    )
  ).find(
    (item) => item.proceso === proceso
  );

  if (!access?.responsable) {
    throw new AppError(
      'Usuario sin responsabilidad para este proceso',
      403,
      'NOMINA_RESPONSABILIDAD_FORBIDDEN'
    );
  }

  if (
    proceso === 'COBERTURA' &&
    input.municipioId !== undefined &&
    !access.municipios.includes(
      Number(input.municipioId)
    )
  ) {
    throw new AppError(
      'Municipio fuera del alcance de nomina',
      403,
      'NOMINA_MUNICIPIO_FORBIDDEN'
    );
  }

  if (
    proceso === 'ASISTENCIA' &&
    input.areaId !== undefined &&
    !access.areas.includes(
      Number(input.areaId)
    )
  ) {
    throw new AppError(
      'Area fuera del alcance de nomina',
      403,
      'NOMINA_AREA_FORBIDDEN'
    );
  }
}
