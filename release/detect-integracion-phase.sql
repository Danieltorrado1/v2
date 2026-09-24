\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

WITH
tables_ok AS (
  SELECT COUNT(*) AS present FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('integracion_eventos','integracion_evento_impactos')
),
phase52_objects AS (
  SELECT
    (SELECT COUNT(*) = 6 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname='public' AND r.relname IN ('integracion_eventos','integracion_evento_impactos')
      AND c.conname IN ('uq_integracion_eventos_idempotency','chk_integracion_eventos_status','chk_integracion_eventos_attempts',
        'uq_integracion_evento_impacto','chk_integracion_evento_impacto_accion','chk_integracion_evento_impacto_rango'))
      AND (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN (
        'idx_integracion_eventos_claim','idx_integracion_eventos_empresa_contrato','idx_integracion_eventos_vinculacion',
        'idx_integracion_eventos_persona','idx_integracion_eventos_periodo','idx_integracion_eventos_effective_date',
        'idx_integracion_impactos_periodo','idx_integracion_impactos_vinculacion')) = 8 AS ok
),
phase53_bits AS (
  SELECT
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name IN ('estado','version_esperada','attempts','applied_at','last_error_code','last_error_message','updated_at')) AS columns_present,
    (SELECT COUNT(*) = 7 FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name IN ('estado','version_esperada','attempts','applied_at','last_error_code','last_error_message','updated_at')) AS columns_ok,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='nomina_liquidaciones'
      AND column_name='requiere_recalculo') AS liquidacion_column_present,
    (SELECT COUNT(*) = 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nomina_liquidaciones'
      AND column_name='requiere_recalculo') AS liquidacion_column_ok,
    (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos'
      AND c.conname IN ('chk_integracion_evento_impacto_estado','chk_integracion_evento_impacto_attempts')) AS constraints_present,
    (SELECT COUNT(*) = 2 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos'
      AND c.conname IN ('chk_integracion_evento_impacto_estado','chk_integracion_evento_impacto_attempts')) AS constraints_ok,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='uq_integracion_impacto_evento_vinculacion_periodo') AS index_present,
    (SELECT COUNT(*) = 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_integracion_impacto_evento_vinculacion_periodo') AS index_ok
),
phase54_bits AS (
  SELECT
    (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos' AND c.conname='chk_integracion_evento_impacto_accion') AS action_present,
    (SELECT COUNT(*) = 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos' AND c.conname='chk_integracion_evento_impacto_accion'
      AND pg_get_constraintdef(c.oid) LIKE '%TRAZABILIDAD_PERSONAL%') AS action_ok,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_eventos_actividad_laboral') AS index_present,
    (SELECT COUNT(*) = 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_eventos_actividad_laboral') AS index_ok
),
phase55_bits AS (
  SELECT
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name IN ('recalc_estado','recalc_attempts','recalc_version_esperada','recalc_started_at','recalc_completed_at',
        'recalc_last_error_code','recalc_last_error_message','recalc_before','recalc_after')) AS columns_present,
    (SELECT COUNT(*) = 9 FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name IN ('recalc_estado','recalc_attempts','recalc_version_esperada','recalc_started_at','recalc_completed_at',
        'recalc_last_error_code','recalc_last_error_message','recalc_before','recalc_after')) AS columns_ok,
    (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos'
      AND c.conname IN ('chk_integracion_evento_impacto_recalc_estado','chk_integracion_evento_impacto_recalc_attempts')) AS constraints_present,
    (SELECT COUNT(*) = 2 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos'
      AND c.conname IN ('chk_integracion_evento_impacto_recalc_estado','chk_integracion_evento_impacto_recalc_attempts')) AS constraints_ok,
    (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_impactos_recalc') AS index_present,
    (SELECT COUNT(*) = 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_impactos_recalc') AS index_ok
),
phase56_bits AS (
  SELECT
    (SELECT COUNT(*) = 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      WHERE r.relname='integracion_evento_impactos' AND c.conname='chk_integracion_evento_impacto_estado'
      AND pg_get_constraintdef(c.oid) LIKE '%BLOQUEADO_PERIODIZACION%') AS state_ok,
    (SELECT COUNT(*) = 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      WHERE r.relname='integracion_evento_impactos' AND c.conname='chk_integracion_evento_impacto_accion'
      AND pg_get_constraintdef(c.oid) LIKE '%BLOQUEADO_PERIODIZACION%') AS action_ok,
    (SELECT COUNT(*) = 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_impactos_periodizacion') AS index_ok
),
state AS (
  SELECT CASE
    WHEN t.present < 2 AND (t.present > 0 OR p52.ok OR p53.columns_ok OR p53.liquidacion_column_ok OR p53.constraints_ok OR p53.index_ok OR p54.action_ok OR p54.index_ok OR p55.columns_ok OR p55.constraints_ok OR p55.index_ok OR p56.state_ok OR p56.action_ok OR p56.index_ok) THEN 'PARTIAL_INVALID'
    WHEN t.present = 0 THEN 'NONE'
    WHEN t.present = 2 AND p52.ok AND p53.columns_ok AND p53.liquidacion_column_ok AND p53.constraints_ok AND p53.index_ok
      AND p54.action_ok AND p54.index_ok AND p55.columns_ok AND p55.constraints_ok AND p55.index_ok
      AND NOT p56.state_ok AND NOT p56.action_ok AND NOT p56.index_ok THEN 'PHASE_55'
    WHEN t.present = 2 AND p52.ok AND p53.columns_ok AND p53.liquidacion_column_ok AND p53.constraints_ok AND p53.index_ok
      AND p54.action_ok AND p54.index_ok AND p55.columns_ok AND p55.constraints_ok AND p55.index_ok
      AND p56.state_ok AND p56.action_ok AND p56.index_ok THEN 'PHASE_56'
    WHEN t.present = 2 AND p52.ok AND p53.columns_ok AND p53.liquidacion_column_ok AND p53.constraints_ok AND p53.index_ok
      AND p54.action_ok AND p54.index_ok AND p55.columns_present=0 AND p55.constraints_present=0 AND p55.index_present=0 THEN 'PHASE_54'
    WHEN t.present = 2 AND p52.ok AND p53.columns_ok AND p53.liquidacion_column_ok AND p53.constraints_ok AND p53.index_ok
      AND NOT p54.action_ok AND p54.index_present=0 AND p55.columns_present=0 AND p55.constraints_present=0 AND p55.index_present=0 THEN 'PHASE_53'
    WHEN t.present = 2 AND p52.ok AND p53.columns_present=0 AND p53.liquidacion_column_present=0
      AND p53.constraints_present=0 AND p53.index_present=0 AND NOT p54.action_ok AND p54.index_present=0
      AND p55.columns_present=0 AND p55.constraints_present=0 AND p55.index_present=0 THEN 'PHASE_52'
    WHEN t.present = 2 AND NOT p52.ok THEN 'PARTIAL_INVALID'
    ELSE 'PARTIAL_INVALID'
  END AS phase
  FROM tables_ok t CROSS JOIN phase52_objects p52 CROSS JOIN phase53_bits p53
  CROSS JOIN phase54_bits p54 CROSS JOIN phase55_bits p55 CROSS JOIN phase56_bits p56
)
SELECT phase FROM state;
