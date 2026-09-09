-- TH effective payroll scope: preserve legacy rows but deactivate OPS rows
-- created by the old save flow. Future OPS assignments remain independent.
UPDATE nomina_responsabilidades_usuario nru
SET activo = FALSE, updated_at = NOW()
WHERE nru.proceso = 'OPS'
  AND nru.activo = TRUE
  AND EXISTS (
    SELECT 1
    FROM usuario_roles ur
    JOIN roles r ON r.id = ur.rol_id
    WHERE ur.usuario_id = nru.usuario_id
      AND r.nombre_rol = 'TALENTO_HUMANO'
      AND COALESCE(ur.activo, TRUE) = TRUE
      AND COALESCE(r.activo, TRUE) = TRUE
  );

-- Current TH territorial assignments are also visible. No rows are deleted.
INSERT INTO usuario_municipio_visibilidad
  (usuario_id, empresa_id, municipio_id, vigencia_desde, activo)
SELECT DISTINCT gma.usuario_id, c.empresa_id, gma.municipio_id, CURRENT_DATE, TRUE
FROM gestor_municipio_asignaciones gma
JOIN contratos c ON c.id = gma.contrato_id
JOIN usuario_roles ur ON ur.usuario_id = gma.usuario_id AND COALESCE(ur.activo, TRUE) = TRUE
JOIN roles r ON r.id = ur.rol_id AND r.nombre_rol = 'TALENTO_HUMANO' AND COALESCE(r.activo, TRUE) = TRUE
WHERE COALESCE(gma.activo, TRUE) = TRUE
  AND gma.vigencia_desde <= CURRENT_DATE
  AND (gma.vigencia_hasta IS NULL OR gma.vigencia_hasta >= CURRENT_DATE)
ON CONFLICT (usuario_id, empresa_id, municipio_id)
DO UPDATE SET activo = TRUE, vigencia_hasta = NULL, updated_at = NOW();
