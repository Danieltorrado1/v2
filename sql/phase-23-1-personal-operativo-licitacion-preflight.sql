SELECT
  table_name,
  COUNT(*) AS columnas_existentes
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'contrato_ubicaciones_laborales',
    'personal_asignaciones_laborales',
    'contrato_perfiles_licitacion',
    'personal_presentaciones_licitacion'
  )
GROUP BY table_name
ORDER BY table_name;
