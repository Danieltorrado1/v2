import { isTenantAdmin, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { gestorApplicableCargoSql } from '../vinculaciones/vinculaciones.personal.domain';

/**
 * Alcance canónico de un gestor sobre trabajadores: contrato + municipio
 * de la cobertura vigente y asignación territorial vigente del usuario.
 * Se reutiliza en Personal y Nómina para evitar fuentes divergentes.
 */
export const buildGestorMunicipalityScopeExistsSql = (
  userParamSql: string,
  vinculacionSql: string,
  contratoSql: string,
  startDateSql: string,
  endDateSql: string,
): string => `
  EXISTS (
    SELECT 1
    FROM cobertura_asignaciones ca_scope
    INNER JOIN focalizacion_final ff_scope ON ff_scope.id = ca_scope.focalizacion_final_id
    INNER JOIN vinculaciones v_scope ON v_scope.id = ${vinculacionSql}
    INNER JOIN contrato_cargos cc_scope ON cc_scope.id = v_scope.contrato_cargo_id
    WHERE ca_scope.vinculacion_id = v_scope.id
      AND COALESCE(ca_scope.activo, TRUE) = TRUE
      AND COALESCE(ff_scope.activo, TRUE) = TRUE
      AND ca_scope.fecha_inicio <= ${endDateSql}
      AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= ${startDateSql})
      AND ${gestorApplicableCargoSql('cc_scope')}
      AND (
        EXISTS (SELECT 1 FROM gestor_municipio_asignaciones gma_scope WHERE gma_scope.usuario_id = ${userParamSql}::bigint AND gma_scope.contrato_id = ${contratoSql} AND ff_scope.municipio_id = gma_scope.municipio_id AND COALESCE(gma_scope.activo, TRUE) = TRUE AND gma_scope.vigencia_desde <= CURRENT_DATE AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= CURRENT_DATE))
        OR EXISTS (SELECT 1 FROM gestor_institucion_asignaciones gia_scope WHERE gia_scope.usuario_id = ${userParamSql}::bigint AND gia_scope.contrato_id = ${contratoSql} AND gia_scope.municipio_id = ff_scope.municipio_id AND gia_scope.institucion_id = ff_scope.institucion_id AND COALESCE(gia_scope.activo, TRUE) = TRUE AND gia_scope.vigencia_desde <= CURRENT_DATE AND (gia_scope.vigencia_hasta IS NULL OR gia_scope.vigencia_hasta >= CURRENT_DATE))
        OR EXISTS (SELECT 1 FROM gestor_personal_asignaciones gpa_scope WHERE gpa_scope.usuario_id = ${userParamSql}::bigint AND gpa_scope.contrato_id = ${contratoSql} AND gpa_scope.vinculacion_id = v_scope.id AND COALESCE(gpa_scope.activo, TRUE) = TRUE AND gpa_scope.vigencia_desde <= CURRENT_DATE AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= CURRENT_DATE))
      )
  )
`;

export const buildAnyGestorMunicipalityScopeExistsSql = (
  vinculacionSql: string,
  contratoSql: string,
  startDateSql: string,
  endDateSql: string,
): string => `
  EXISTS (
    SELECT 1
    FROM cobertura_asignaciones ca_scope
    INNER JOIN focalizacion_final ff_scope ON ff_scope.id = ca_scope.focalizacion_final_id
    INNER JOIN vinculaciones v_scope ON v_scope.id = ${vinculacionSql}
    INNER JOIN contrato_cargos cc_scope ON cc_scope.id = v_scope.contrato_cargo_id
    WHERE ca_scope.vinculacion_id = v_scope.id
      AND COALESCE(ca_scope.activo, TRUE) = TRUE
      AND COALESCE(ff_scope.activo, TRUE) = TRUE
      AND ca_scope.fecha_inicio <= ${endDateSql}
      AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= ${startDateSql})
      AND ${gestorApplicableCargoSql('cc_scope')}
      AND (
        EXISTS (SELECT 1 FROM gestor_municipio_asignaciones gma_scope WHERE gma_scope.contrato_id = ${contratoSql} AND ff_scope.municipio_id = gma_scope.municipio_id AND COALESCE(gma_scope.activo, TRUE) = TRUE AND gma_scope.vigencia_desde <= CURRENT_DATE AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= CURRENT_DATE))
        OR EXISTS (SELECT 1 FROM gestor_institucion_asignaciones gia_scope WHERE gia_scope.contrato_id = ${contratoSql} AND gia_scope.municipio_id = ff_scope.municipio_id AND gia_scope.institucion_id = ff_scope.institucion_id AND COALESCE(gia_scope.activo, TRUE) = TRUE AND gia_scope.vigencia_desde <= CURRENT_DATE AND (gia_scope.vigencia_hasta IS NULL OR gia_scope.vigencia_hasta >= CURRENT_DATE))
        OR EXISTS (SELECT 1 FROM gestor_personal_asignaciones gpa_scope WHERE gpa_scope.contrato_id = ${contratoSql} AND gpa_scope.vinculacion_id = v_scope.id AND COALESCE(gpa_scope.activo, TRUE) = TRUE AND gpa_scope.vigencia_desde <= CURRENT_DATE AND (gpa_scope.vigencia_hasta IS NULL OR gpa_scope.vigencia_hasta >= CURRENT_DATE))
      )
  )
`;

export const appendVisibleMunicipalityScope = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  municipalitySql: string,
  empresaSql: string
): void => {
  if (!tenant || tenant.isGlobalAdmin || isTenantAdmin(tenant)) return;
  if (!tenant.userId) {
    conditions.push('1=0');
    return;
  }
  const usesGestorMunicipalityScope = tenant.roleNames.some((role) => ['TALENTO_HUMANO', 'GESTOR'].includes(role));
  params.push(tenant.userId);
  const userParam = `$${params.length}`;
  const scopeSql = usesGestorMunicipalityScope
    ? `EXISTS (
        SELECT 1
        FROM gestor_municipio_asignaciones gma_scope
        JOIN contratos c_scope ON c_scope.id = gma_scope.contrato_id
        WHERE gma_scope.usuario_id = ${userParam}::bigint
          AND c_scope.empresa_id = ${empresaSql}
          AND gma_scope.municipio_id = ${municipalitySql}
          AND COALESCE(gma_scope.activo, TRUE) = TRUE
          AND gma_scope.vigencia_desde <= CURRENT_DATE
          AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= CURRENT_DATE)
      )`
    : `EXISTS (
        SELECT 1 FROM usuario_municipio_visibilidad umv_scope
        WHERE umv_scope.usuario_id = ${userParam}::bigint
          AND umv_scope.empresa_id = ${empresaSql}
          AND umv_scope.municipio_id = ${municipalitySql}
          AND COALESCE(umv_scope.activo, TRUE) = TRUE
          AND umv_scope.vigencia_desde <= CURRENT_DATE
          AND (umv_scope.vigencia_hasta IS NULL OR umv_scope.vigencia_hasta >= CURRENT_DATE)
      )`;
  conditions.push(`
    (${scopeSql})
  `);
};

export const appendVisiblePersonScope = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  personSql: string
): void => {
  if (!tenant || tenant.isGlobalAdmin || isTenantAdmin(tenant)) return;
  if (!tenant.userId) {
    conditions.push('1=0');
    return;
  }
  const usesGestorMunicipalityScope = tenant.roleNames.some((role) => ['TALENTO_HUMANO', 'GESTOR'].includes(role));
  params.push(tenant.userId);
  const userParam = `$${params.length}`;
  const scopeSql = usesGestorMunicipalityScope
    ? `EXISTS (
        SELECT 1
        FROM gestor_municipio_asignaciones gma_scope
        JOIN contratos c_th_scope ON c_th_scope.id = gma_scope.contrato_id
        WHERE gma_scope.usuario_id = ${userParam}::bigint
          AND c_th_scope.empresa_id = c_scope.empresa_id
          AND gma_scope.municipio_id = ff_scope.municipio_id
          AND COALESCE(gma_scope.activo, TRUE) = TRUE
          AND gma_scope.vigencia_desde <= CURRENT_DATE
          AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= CURRENT_DATE)
          AND EXISTS (
            SELECT 1 FROM cobertura_asignaciones ca_scope
            WHERE ca_scope.vinculacion_id = v_scope.id
              AND COALESCE(ca_scope.activo, TRUE) = TRUE
              AND ca_scope.fecha_inicio <= CURRENT_DATE
              AND (ca_scope.fecha_fin IS NULL OR ca_scope.fecha_fin >= CURRENT_DATE)
          )
      )`
    : `EXISTS (
        SELECT 1 FROM usuario_municipio_visibilidad umv_scope
        WHERE umv_scope.usuario_id = ${userParam}::bigint
          AND umv_scope.empresa_id = c_scope.empresa_id
          AND umv_scope.municipio_id = ff_scope.municipio_id
          AND COALESCE(umv_scope.activo, TRUE) = TRUE
          AND umv_scope.vigencia_desde <= CURRENT_DATE
          AND (umv_scope.vigencia_hasta IS NULL OR umv_scope.vigencia_hasta >= CURRENT_DATE)
      )`;
  conditions.push(`
    EXISTS (
      SELECT 1
      FROM vinculaciones v_scope
      JOIN contratos c_scope ON c_scope.id = v_scope.contrato_id
      JOIN cobertura_asignaciones ca_scope ON ca_scope.vinculacion_id = v_scope.id
      JOIN focalizacion_final ff_scope ON ff_scope.id = ca_scope.focalizacion_final_id
      WHERE v_scope.persona_id = ${personSql}
        AND COALESCE(ca_scope.activo, TRUE) = TRUE
        AND COALESCE(ff_scope.activo, TRUE) = TRUE
        AND (${scopeSql})
    )
  `);
};
