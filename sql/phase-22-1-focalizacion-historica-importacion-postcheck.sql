-- Phase 22.1 post-check
-- Verifica que la migracion historica de focalizacion haya quedado aplicada.

SELECT
  table_name,
  EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name = required.table_name
  ) AS exists
FROM (
  VALUES
    ('modalidad_aliases'),
    ('instituciones_identidad_historial'),
    ('sedes_identidad_historial'),
    ('sede_institucion_historial'),
    ('focalizacion_vigencias'),
    ('calculadora_personal_config'),
    ('calculadora_personal_rangos')
) AS required(table_name)
ORDER BY table_name;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'focalizacion_final'
  AND column_name IN ('vigente_desde', 'vigente_hasta', 'cobertura_requerida', 'cobertura_estado')
ORDER BY column_name;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'focalizacion_vigencias'
  AND column_name IN ('regla_config_id', 'cobertura_requerida', 'cobertura_estado', 'origen', 'motivo')
ORDER BY column_name;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calculadora_personal_config'
  AND column_name IN ('contrato_id', 'modalidad_id', 'dominio_calculo', 'factor_previo', 'formula', 'vigencia_desde', 'vigencia_hasta')
ORDER BY column_name;

SELECT
  COUNT(*)::int AS total_reglas_cobertura
FROM calculadora_personal_config
WHERE COALESCE(dominio_calculo, 'GENERAL') = 'COBERTURA_PAE';

SELECT
  c.contrato_id,
  c.modalidad_id,
  MAX(c.nombre) AS nombre,
  COUNT(r.id)::int AS total_rangos
FROM calculadora_personal_config c
LEFT JOIN calculadora_personal_rangos r ON r.config_id = c.id AND r.estado = 'activo'
WHERE COALESCE(c.dominio_calculo, 'GENERAL') = 'COBERTURA_PAE'
GROUP BY c.contrato_id, c.modalidad_id
ORDER BY c.contrato_id, c.modalidad_id;

SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'focalizacion_cargas' AND column_name = 'archivo_bytes';
