import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';

export const appendVisibleMunicipalityScope = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  municipalitySql: string,
  empresaSql: string
): void => {
  if (!tenant || tenant.isGlobalAdmin) return;
  if (!tenant.userId) {
    conditions.push('1=0');
    return;
  }
  params.push(tenant.userId);
  conditions.push(`
    (
      EXISTS (
      SELECT 1 FROM usuario_municipio_visibilidad umv_scope
      WHERE umv_scope.usuario_id = $${params.length}::bigint
        AND umv_scope.empresa_id = ${empresaSql}
        AND umv_scope.municipio_id = ${municipalitySql}
        AND COALESCE(umv_scope.activo, TRUE) = TRUE
        AND umv_scope.vigencia_desde <= CURRENT_DATE
        AND (umv_scope.vigencia_hasta IS NULL OR umv_scope.vigencia_hasta >= CURRENT_DATE)
      )
      ${tenant.roleNames.includes('TALENTO_HUMANO') ? `
      OR EXISTS (
        SELECT 1
        FROM gestor_municipio_asignaciones gma_scope
        JOIN contratos c_scope ON c_scope.id = gma_scope.contrato_id
        WHERE gma_scope.usuario_id = $${params.length}::bigint
          AND c_scope.empresa_id = ${empresaSql}
          AND gma_scope.municipio_id = ${municipalitySql}
          AND COALESCE(gma_scope.activo, TRUE) = TRUE
          AND gma_scope.vigencia_desde <= CURRENT_DATE
          AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= CURRENT_DATE)
      )` : ''}
    )
  `);
};

export const appendVisiblePersonScope = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  personSql: string
): void => {
  if (!tenant || tenant.isGlobalAdmin) return;
  if (!tenant.userId) {
    conditions.push('1=0');
    return;
  }
  params.push(tenant.userId);
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
        AND (
          EXISTS (
            SELECT 1 FROM usuario_municipio_visibilidad umv_scope
            WHERE umv_scope.usuario_id = $${params.length}::bigint
              AND umv_scope.empresa_id = c_scope.empresa_id
              AND umv_scope.municipio_id = ff_scope.municipio_id
              AND COALESCE(umv_scope.activo, TRUE) = TRUE
              AND umv_scope.vigencia_desde <= CURRENT_DATE
              AND (umv_scope.vigencia_hasta IS NULL OR umv_scope.vigencia_hasta >= CURRENT_DATE)
          )
          ${tenant.roleNames.includes('TALENTO_HUMANO') ? `
          OR EXISTS (
            SELECT 1
            FROM gestor_municipio_asignaciones gma_scope
            JOIN contratos c_th_scope ON c_th_scope.id = gma_scope.contrato_id
            WHERE gma_scope.usuario_id = $${params.length}::bigint
              AND c_th_scope.empresa_id = c_scope.empresa_id
              AND gma_scope.municipio_id = ff_scope.municipio_id
              AND COALESCE(gma_scope.activo, TRUE) = TRUE
              AND gma_scope.vigencia_desde <= CURRENT_DATE
              AND (gma_scope.vigencia_hasta IS NULL OR gma_scope.vigencia_hasta >= CURRENT_DATE)
          )` : ''}
        )
    )
  `);
};
