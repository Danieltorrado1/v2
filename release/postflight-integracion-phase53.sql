\set ON_ERROR_STOP on
\ir postflight-integracion-phase52.sql

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name IN ('estado','version_esperada','attempts','applied_at','last_error_code','last_error_message','updated_at')) <> 7
    THEN RAISE EXCEPTION 'PHASE_53_REQUIRED_COLUMNS_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nomina_liquidaciones'
      AND column_name='requiere_recalculo' AND is_nullable='NO' AND column_default='false')
    THEN RAISE EXCEPTION 'PHASE_53_REQUIRED_LIQUIDACION_COLUMN_INVALID'; END IF;
  IF (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos'
      AND c.conname IN ('chk_integracion_evento_impacto_estado','chk_integracion_evento_impacto_attempts')) <> 2
    THEN RAISE EXCEPTION 'PHASE_53_REQUIRED_CONSTRAINTS_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_integracion_impacto_evento_vinculacion_periodo')
    THEN RAISE EXCEPTION 'PHASE_53_REQUIRED_INDEX_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_liquidaciones WHERE requiere_recalculo IS DISTINCT FROM false)
    THEN RAISE EXCEPTION 'PHASE_53_EXISTING_LIQUIDATIONS_NOT_FALSE'; END IF;
END $$;

SELECT 'nomina_liquidaciones' AS object_name, COUNT(*)::bigint AS row_count,
       COUNT(*) FILTER (WHERE requiere_recalculo=false)::bigint AS false_count
FROM public.nomina_liquidaciones;
