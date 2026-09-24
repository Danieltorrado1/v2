\set ON_ERROR_STOP on
\ir postflight-integracion-phase53.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos' AND c.conname='chk_integracion_evento_impacto_accion'
      AND pg_get_constraintdef(c.oid) LIKE '%TRAZABILIDAD_PERSONAL%')
    THEN RAISE EXCEPTION 'PHASE_54_ACTION_CONSTRAINT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_eventos_actividad_laboral')
    THEN RAISE EXCEPTION 'PHASE_54_REQUIRED_INDEX_MISSING'; END IF;
END $$;
