\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nomina_periodos' AND column_name='motivo_anulacion') THEN RAISE EXCEPTION 'PHASE_57_PERIOD_COLUMNS_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nomina_periodos' AND column_name='periodo_canonico_id') THEN RAISE EXCEPTION 'PHASE_57_CANONICAL_COLUMN_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nomina_calendarios_contractuales') THEN RAISE EXCEPTION 'PHASE_57_CALENDAR_TABLE_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integracion_evento_impactos' AND column_name='superseded_by_impact_id') THEN RAISE EXCEPTION 'PHASE_57_SUPERSEDED_COLUMN_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_estado' AND pg_get_constraintdef(oid) LIKE '%SUPERSEDED%') THEN RAISE EXCEPTION 'PHASE_57_SUPERSEDED_STATE_MISSING'; END IF;
END $$;
SELECT 'phase57', 'OK';
SELECT estado, COUNT(*)::bigint FROM public.integracion_evento_impactos GROUP BY estado ORDER BY estado;
SELECT estado, COUNT(*)::bigint FROM public.nomina_periodos GROUP BY estado ORDER BY estado;
