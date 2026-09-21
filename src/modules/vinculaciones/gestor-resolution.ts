export interface CanonicalGestorSqlInput {
  companySql: string;
  contractSql: string;
  municipalitySql: string;
  dateSql: string;
  vinculacionSql?: string;
}

export const GESTOR_SCOPE_SELECTED = 'PERSONAL_SELECCIONADO';
export const GESTOR_SCOPE_FULL = 'TODO_MUNICIPIO';

const validUserSql = (userSql: string, input: CanonicalGestorSqlInput): string => `
  AND COALESCE(${userSql}.activo, TRUE) = TRUE
  AND EXISTS (
    SELECT 1
    FROM usuario_roles ur_gestor
    INNER JOIN roles r_gestor ON r_gestor.id = ur_gestor.rol_id
    WHERE ur_gestor.usuario_id = ${userSql}.id
      AND COALESCE(ur_gestor.activo, TRUE) = TRUE
      AND COALESCE(r_gestor.activo, TRUE) = TRUE
      AND r_gestor.nombre_rol = 'GESTOR'
  )
  AND EXISTS (
    SELECT 1
    FROM usuario_empresas ue_gestor
    WHERE ue_gestor.usuario_id = ${userSql}.id
      AND ue_gestor.empresa_id = ${input.companySql}
      AND COALESCE(ue_gestor.activo, TRUE) = TRUE
  )
  AND EXISTS (
    SELECT 1
    FROM usuario_contratos uc_gestor
    INNER JOIN contratos c_gestor ON c_gestor.id = uc_gestor.contrato_id
    WHERE uc_gestor.usuario_id = ${userSql}.id
      AND uc_gestor.contrato_id = ${input.contractSql}
      AND COALESCE(uc_gestor.activo, TRUE) = TRUE
      AND COALESCE(c_gestor.activo, TRUE) = TRUE
  )`;

export const buildCanonicalGestorCandidatesSql = (input: CanonicalGestorSqlInput): string => `
  SELECT
    u.id::text AS usuario_id,
    u.nombre_completo AS nombre,
    gpa.vigencia_desde,
    gpa.id,
    0 AS prioridad
  FROM gestor_personal_asignaciones gpa
  INNER JOIN usuarios u ON u.id = gpa.usuario_id
  WHERE ${input.vinculacionSql ? `gpa.vinculacion_id = ${input.vinculacionSql} AND` : 'FALSE AND'}
    gpa.contrato_id = ${input.contractSql}
    AND COALESCE(gpa.activo, TRUE) = TRUE
    AND gpa.vigencia_desde <= ${input.dateSql}
    AND (gpa.vigencia_hasta IS NULL OR gpa.vigencia_hasta >= ${input.dateSql})
    ${validUserSql('u', input)}
  UNION ALL
  SELECT
    u.id::text AS usuario_id,
    u.nombre_completo AS nombre,
    gma.vigencia_desde,
    gma.id,
    1 AS prioridad
  FROM gestor_municipio_asignaciones gma
  INNER JOIN usuarios u ON u.id = gma.usuario_id
  WHERE gma.contrato_id = ${input.contractSql}
    AND gma.municipio_id = ${input.municipalitySql}
    AND COALESCE(gma.alcance_personal, '${GESTOR_SCOPE_SELECTED}') = '${GESTOR_SCOPE_FULL}'
    AND COALESCE(gma.activo, TRUE) = TRUE
    AND gma.vigencia_desde <= ${input.dateSql}
    AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= ${input.dateSql})
    ${validUserSql('u', input)}`;

export const buildCanonicalGestorJoinSql = (input: CanonicalGestorSqlInput): string => `
  LEFT JOIN LATERAL (
    SELECT candidate.usuario_id AS id, candidate.nombre
    FROM (${buildCanonicalGestorCandidatesSql(input)}) candidate
    ORDER BY candidate.prioridad ASC, candidate.vigencia_desde DESC, candidate.id DESC
    LIMIT 1
  ) gestor ON TRUE`;

export const buildCanonicalGestorFilterSql = (input: CanonicalGestorSqlInput, userParamSql: string): string => `
  COALESCE((
    SELECT candidate.usuario_id::bigint
    FROM (${buildCanonicalGestorCandidatesSql(input)}) candidate
    ORDER BY candidate.prioridad ASC, candidate.vigencia_desde DESC, candidate.id DESC
    LIMIT 1
  ), 0) = ${userParamSql}::bigint`;

export const buildCanonicalAnyGestorSql = (input: CanonicalGestorSqlInput): string => `
  EXISTS (
    SELECT 1
    FROM (${buildCanonicalGestorCandidatesSql(input)}) candidate
    ORDER BY candidate.prioridad ASC, candidate.vigencia_desde DESC, candidate.id DESC
    LIMIT 1
  )`;

export const buildPartialGestorsJoinSql = (input: CanonicalGestorSqlInput): string => `
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('id', candidate.id::text, 'nombre', candidate.nombre)
          ORDER BY candidate.nombre, candidate.id
        )
        FROM (
          SELECT DISTINCT u.id, u.nombre_completo AS nombre
          FROM gestor_municipio_asignaciones gma
          INNER JOIN usuarios u ON u.id = gma.usuario_id
          WHERE gma.contrato_id = ${input.contractSql}
            AND gma.municipio_id = ${input.municipalitySql}
            AND gma.alcance_personal = '${GESTOR_SCOPE_SELECTED}'
            AND COALESCE(gma.activo, TRUE) = TRUE
            AND gma.vigencia_desde <= ${input.dateSql}
            AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= ${input.dateSql})
            ${validUserSql('u', input)}
        ) candidate
      ),
      '[]'::jsonb
    ) AS gestores
  ) partial_gestores ON TRUE`;
