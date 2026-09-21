-- Mantiene una sola asignación municipal activa por gestor, contrato y municipio.
-- Las filas históricas permanecen intactas; solo se cierra el duplicado activo
-- más antiguo antes de crear la garantía estructural.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY usuario_id, contrato_id, municipio_id
      ORDER BY vigencia_desde DESC, id DESC
    ) AS rn
  FROM gestor_municipio_asignaciones
  WHERE COALESCE(activo, TRUE) = TRUE
)
UPDATE gestor_municipio_asignaciones gma
SET activo = FALSE,
    vigencia_hasta = CASE
      WHEN gma.vigencia_desde >= CURRENT_DATE THEN gma.vigencia_desde
      ELSE CURRENT_DATE - 1
    END,
    updated_at = NOW()
FROM ranked
WHERE ranked.id = gma.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gestor_municipio_asignacion_activa
  ON gestor_municipio_asignaciones (usuario_id, contrato_id, municipio_id)
  WHERE COALESCE(activo, TRUE) = TRUE;
