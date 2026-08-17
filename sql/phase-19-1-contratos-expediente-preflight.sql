SELECT
  'schema_reference_columns' AS check_name,
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'contratos' AND column_name IN ('id', 'empresa_id', 'fecha_inicio', 'fecha_finalizacion', 'estado_contractual', 'contrato_padre_id'))
    OR (table_name = 'empresas' AND column_name = 'id')
    OR (table_name = 'usuarios' AND column_name = 'id')
    OR (table_name = 'tipos_documentos' AND column_name = 'id')
    OR (table_name = 'alertas_documentales' AND column_name IN ('contrato_id', 'empresa_id', 'tipo_documento_id', 'tipo_alerta'))
    OR (table_name = 'auditoria_eventos' AND column_name IN ('id', 'usuario_id', 'tabla', 'registro_id'))
  )
ORDER BY table_name, column_name;

SELECT
  'contracts_overview' AS check_name,
  COUNT(*)::bigint AS total_contratos,
  COUNT(*) FILTER (WHERE empresa_id IS NULL)::bigint AS contratos_sin_empresa,
  COUNT(*) FILTER (WHERE fecha_finalizacion IS NOT NULL AND fecha_finalizacion < fecha_inicio)::bigint AS contratos_con_fechas_invalidas,
  COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = FALSE)::bigint AS contratos_inactivos,
  COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE AND fecha_inicio > CURRENT_DATE)::bigint AS contratos_pendientes_referencia,
  COUNT(*) FILTER (WHERE COALESCE(activo, TRUE) = TRUE AND fecha_inicio <= CURRENT_DATE)::bigint AS contratos_activos_referencia
FROM contratos;

SELECT
  'legacy_contract_states_reference' AS check_name,
  CASE
    WHEN COALESCE(activo, TRUE) = FALSE THEN 'LEGACY_INACTIVO'
    WHEN fecha_inicio > CURRENT_DATE THEN 'LEGACY_PENDIENTE_INICIO'
    ELSE 'LEGACY_ACTIVO'
  END AS estado_referencia,
  COUNT(*)::bigint AS total
FROM contratos
GROUP BY 2
ORDER BY 2;

SELECT
  'duplicate_contract_numbers' AS check_name,
  empresa_id,
  LOWER(REGEXP_REPLACE(BTRIM(numero_contrato), '\s+', ' ', 'g')) AS numero_normalizado,
  COUNT(*)::bigint AS total
FROM contratos
GROUP BY empresa_id, LOWER(REGEXP_REPLACE(BTRIM(numero_contrato), '\s+', ' ', 'g'))
HAVING COUNT(*) > 1
ORDER BY total DESC, empresa_id ASC;

SELECT
  'orphan_contract_companies' AS check_name,
  COUNT(*)::bigint AS total_huerfanos
FROM contratos c
LEFT JOIN empresas e ON e.id = c.empresa_id
WHERE e.id IS NULL;

SELECT
  'tipos_documentos_compatibles' AS check_name,
  COUNT(*)::bigint AS total,
  COUNT(*) FILTER (WHERE COALESCE(requiere_fecha_expedicion, FALSE) = TRUE)::bigint AS requieren_fecha_expedicion,
  COUNT(*) FILTER (WHERE COALESCE(requiere_fecha_vencimiento, FALSE) = TRUE)::bigint AS requieren_fecha_vencimiento,
  COUNT(*) FILTER (WHERE COALESCE(requiere_fecha_vencimiento, FALSE) = TRUE AND COALESCE(requiere_fecha_expedicion, FALSE) = FALSE)::bigint AS vigencia_sin_expedicion
FROM tipos_documentos;

SELECT
  'alertas_documentales_tipo_alerta' AS check_name,
  tipo_alerta,
  COUNT(*)::bigint AS total
FROM alertas_documentales
GROUP BY tipo_alerta
ORDER BY tipo_alerta;

SELECT
  'new_objects_presence' AS check_name,
  objeto,
  presente
FROM (
  VALUES
    ('contrato_eventos', to_regclass('public.contrato_eventos') IS NOT NULL),
    ('contrato_documento_requisitos', to_regclass('public.contrato_documento_requisitos') IS NOT NULL),
    ('documentos_contrato', to_regclass('public.documentos_contrato') IS NOT NULL),
    ('contrato_excepciones_documentales', to_regclass('public.contrato_excepciones_documentales') IS NOT NULL),
    ('idx_contratos_estado_contractual', to_regclass('public.idx_contratos_estado_contractual') IS NOT NULL),
    ('fk_contratos_contrato_padre', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contratos_contrato_padre')),
    ('chk_contratos_estado_contractual', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contratos_estado_contractual'))
) AS checks(objeto, presente)
ORDER BY objeto;

SELECT
  'blocking_constraints_and_conflicts' AS check_name,
  EXISTS (
    SELECT 1
    FROM contratos
    WHERE fecha_finalizacion IS NOT NULL
      AND fecha_finalizacion < fecha_inicio
  ) AS tiene_fechas_invalidas,
  EXISTS (
    SELECT 1
    FROM contratos
    GROUP BY empresa_id, LOWER(REGEXP_REPLACE(BTRIM(numero_contrato), '\s+', ' ', 'g'))
    HAVING COUNT(*) > 1
  ) AS tiene_duplicados_numero_contrato,
  EXISTS (
    SELECT 1
    FROM contratos c
    LEFT JOIN empresas e ON e.id = c.empresa_id
    WHERE e.id IS NULL
  ) AS tiene_empresas_huerfanas,
  EXISTS (
    SELECT 1
    FROM alertas_documentales
    WHERE tipo_alerta NOT IN (
      'DOCUMENTO_FALTANTE',
      'DOCUMENTO_VENCIDO',
      'DOCUMENTO_POR_VENCER',
      'EXPEDIENTE_INCOMPLETO',
      'DOCUMENTO_DEVUELTO',
      'REQUISITO_CRITICO_PENDIENTE',
      'EXCEPCION_POR_VENCER',
      'EXCEPCION_VENCIDA',
      'CONTRATO_SUSPENDIDO',
      'CONTRATO_POR_VENCER',
      'CONTRATO_SIN_ACTA_INICIO',
      'EVENTO_SIN_SOPORTE'
    )
  ) AS tiene_alertas_fuera_del_check_nuevo;
