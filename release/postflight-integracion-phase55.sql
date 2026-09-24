\set ON_ERROR_STOP on
\ir postflight-integracion-phase54.sql

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name IN ('recalc_estado','recalc_attempts','recalc_version_esperada','recalc_started_at','recalc_completed_at',
        'recalc_last_error_code','recalc_last_error_message','recalc_before','recalc_after')) <> 9
    THEN RAISE EXCEPTION 'PHASE_55_REQUIRED_COLUMNS_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name='recalc_estado' AND is_nullable='NO' AND column_default='''SIN_CAMBIOS''::text')
    THEN RAISE EXCEPTION 'PHASE_55_RECALC_DEFAULT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos'
      AND column_name='recalc_attempts' AND is_nullable='NO' AND column_default='0')
    THEN RAISE EXCEPTION 'PHASE_55_RECALC_ATTEMPTS_DEFAULT_INVALID'; END IF;
  IF (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname='integracion_evento_impactos'
      AND c.conname IN ('chk_integracion_evento_impacto_recalc_estado','chk_integracion_evento_impacto_recalc_attempts')) <> 2
    THEN RAISE EXCEPTION 'PHASE_55_REQUIRED_CONSTRAINTS_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_impactos_recalc')
    THEN RAISE EXCEPTION 'PHASE_55_REQUIRED_INDEX_MISSING'; END IF;
END $$;

SELECT 'unexpected_status_count' AS metric, COUNT(*)::bigint AS value FROM public.integracion_eventos
WHERE status NOT IN ('PENDIENTE','PROCESANDO','PROCESADO','ERROR')
UNION ALL SELECT 'unexpected_event_type_count', COUNT(*)::bigint FROM public.integracion_eventos
WHERE event_type NOT IN ('VINCULACION_CREADA','VINCULACION_ACTUALIZADA','VINCULACION_RETIRADA','ASIGNACION_OPERATIVA_CAMBIADA',
  'CONDICION_PENSION_CAMBIADA','ASISTENCIA_CAMBIADA','NOVEDAD_CREADA','NOVEDAD_ACTUALIZADA','NOVEDAD_DESACTIVADA',
  'TURNO_CREADO','TURNO_ACTUALIZADO','TURNO_DESACTIVADO','LIQUIDACION_RECALCULADA','LIQUIDACION_FINALIZADA')
UNION ALL SELECT 'event_count', COUNT(*)::bigint FROM public.integracion_eventos
UNION ALL SELECT 'impact_count', COUNT(*)::bigint FROM public.integracion_evento_impactos
UNION ALL SELECT 'non_default_recalc_count', COUNT(*)::bigint FROM public.integracion_evento_impactos
WHERE recalc_estado <> 'SIN_CAMBIOS' OR recalc_attempts <> 0;
