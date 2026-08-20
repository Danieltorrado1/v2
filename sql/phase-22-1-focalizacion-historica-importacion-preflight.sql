-- Phase 22.1 preflight
-- Verifica compatibilidad antes de aplicar la migracion historica de focalizacion.

SELECT current_setting('server_version') AS postgres_version;

SELECT
  current_database() AS database_name,
  current_user AS database_user,
  current_setting('application_name', true) AS application_name;

SELECT
  'runtime' AS section,
  'node_env' AS key,
  'Revisar .env local antes de aplicar' AS detail;

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
    ('instituciones'),
    ('sedes'),
    ('modalidades'),
    ('sede_modalidades'),
    ('focalizacion_cargas'),
    ('focalizacion_preliminar'),
    ('focalizacion_final'),
    ('cobertura_asignaciones'),
    ('calculadora_personal_config'),
    ('calculadora_personal_rangos')
) AS required(table_name)
ORDER BY table_name;

SELECT
  table_name,
  COUNT(*)::int AS total_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'focalizacion_cargas',
    'focalizacion_preliminar',
    'focalizacion_final',
    'focalizacion_vigencias',
    'calculadora_personal_config',
    'calculadora_personal_rangos'
  )
GROUP BY table_name
ORDER BY table_name;

SELECT 'instituciones' AS table_name, COUNT(*)::int AS total FROM instituciones
UNION ALL
SELECT 'sedes', COUNT(*)::int FROM sedes
UNION ALL
SELECT 'modalidades', COUNT(*)::int FROM modalidades
UNION ALL
SELECT 'sede_modalidades', COUNT(*)::int FROM sede_modalidades
UNION ALL
SELECT 'focalizacion_cargas', COUNT(*)::int FROM focalizacion_cargas
UNION ALL
SELECT 'focalizacion_preliminar', COUNT(*)::int FROM focalizacion_preliminar
UNION ALL
SELECT 'focalizacion_final', COUNT(*)::int FROM focalizacion_final
UNION ALL
SELECT 'focalizacion_vigencias', COUNT(*)::int FROM focalizacion_vigencias
UNION ALL
SELECT 'cobertura_asignaciones', COUNT(*)::int FROM cobertura_asignaciones
UNION ALL
SELECT
  'calculadora_personal_config',
  CASE
    WHEN to_regclass('public.calculadora_personal_config') IS NULL THEN 0
    ELSE (SELECT COUNT(*)::int FROM calculadora_personal_config)
  END
UNION ALL
SELECT
  'calculadora_personal_rangos',
  CASE
    WHEN to_regclass('public.calculadora_personal_rangos') IS NULL THEN 0
    ELSE (SELECT COUNT(*)::int FROM calculadora_personal_rangos)
  END
UNION ALL
SELECT
  'modalidad_aliases',
  CASE
    WHEN to_regclass('public.modalidad_aliases') IS NULL THEN 0
    ELSE (SELECT COUNT(*)::int FROM modalidad_aliases)
  END;

SELECT
  'orphan_focalizacion_final_modalidad' AS check_name,
  COUNT(*)::int AS total
FROM focalizacion_final ff
LEFT JOIN modalidades m ON m.id = ff.modalidad_id
WHERE ff.modalidad_id IS NOT NULL
  AND m.id IS NULL
UNION ALL
SELECT
  'orphan_focalizacion_final_sede_modalidad',
  COUNT(*)::int
FROM focalizacion_final ff
LEFT JOIN sede_modalidades sm ON sm.id = ff.sede_modalidad_id
WHERE ff.sede_modalidad_id IS NOT NULL
  AND sm.id IS NULL
UNION ALL
SELECT
  'orphan_cobertura_asignaciones_focalizacion_final',
  COUNT(*)::int
FROM cobertura_asignaciones ca
LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
WHERE ca.focalizacion_final_id IS NOT NULL
  AND ff.id IS NULL;

SELECT
  'duplicate_modalidad_aliases' AS check_name,
  0::int AS total
UNION ALL
SELECT
  'duplicate_focalizacion_final_contract_sede_modalidad',
  COUNT(*)::int
FROM (
  SELECT contrato_id, sede_modalidad_id
  FROM focalizacion_final
  WHERE sede_modalidad_id IS NOT NULL
  GROUP BY contrato_id, sede_modalidad_id
  HAVING COUNT(*) > 1
) duplicates;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'focalizacion_cargas',
    'focalizacion_preliminar',
    'focalizacion_final',
    'calculadora_personal_config',
    'calculadora_personal_rangos'
  )
ORDER BY tablename, indexname;
