\set ON_ERROR_STOP on
\ir postflight-integracion-phase55.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    WHERE r.relname='integracion_evento_impactos'
      AND c.conname='chk_integracion_evento_impacto_estado'
      AND pg_get_constraintdef(c.oid) LIKE '%BLOQUEADO_PERIODIZACION%'
  ) THEN RAISE EXCEPTION 'PHASE_56_PERIODIZATION_STATE_MISSING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    WHERE r.relname='integracion_evento_impactos'
      AND c.conname='chk_integracion_evento_impacto_accion'
      AND pg_get_constraintdef(c.oid) LIKE '%BLOQUEADO_PERIODIZACION%'
  ) THEN RAISE EXCEPTION 'PHASE_56_PERIODIZATION_ACTION_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_impactos_periodizacion')
    THEN RAISE EXCEPTION 'PHASE_56_PERIODIZATION_INDEX_MISSING'; END IF;
END $$;

SELECT 'periodization_blocked_count' AS metric, COUNT(*)::bigint AS value
FROM public.integracion_evento_impactos WHERE estado='BLOQUEADO_PERIODIZACION';
