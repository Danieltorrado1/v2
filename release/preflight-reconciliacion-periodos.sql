\set ON_ERROR_STOP on
BEGIN READ ONLY;
\pset pager off
\pset footer off
\echo 'PREFLIGHT RECONCILIACION PERIODOS 3/4/6: solo lectura'

DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public.nomina_periodos') IS NULL OR to_regclass('public.nomina_revision_operativa') IS NULL
     OR to_regclass('public.integracion_eventos') IS NULL OR to_regclass('public.integracion_evento_impactos') IS NULL
  THEN RAISE EXCEPTION 'PREFLIGHT_REQUIRED_TABLE_MISSING'; END IF;
  SELECT string_agg(x, ',') INTO missing FROM (VALUES
    ('nomina_periodos.estado'),('nomina_periodos.activo'),('nomina_periodos.anulado_at'),('nomina_periodos.anulado_por'),('nomina_periodos.motivo_anulacion'),('nomina_periodos.periodo_canonico_id'),
    ('integracion_eventos.id'),('integracion_eventos.periodo_id'),('integracion_eventos.status'),('integracion_eventos.idempotency_key'),
    ('integracion_evento_impactos.id'),('integracion_evento_impactos.evento_id'),('integracion_evento_impactos.periodo_id'),('integracion_evento_impactos.estado'),('integracion_evento_impactos.accion_requerida'),('integracion_evento_impactos.requiere_recalculo'),('integracion_evento_impactos.recalc_estado'),('integracion_evento_impactos.recalc_attempts'),('integracion_evento_impactos.superseded_by_impact_id'),('integracion_evento_impactos.superseded_at'),('integracion_evento_impactos.superseded_reason')
  ) v(x) WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=split_part(v.x,'.',1) AND c.column_name=split_part(v.x,'.',2));
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'PREFLIGHT_REQUIRED_COLUMNS_MISSING: %', missing; END IF;
  IF to_regclass('public.nomina_calendarios_contractuales') IS NULL THEN RAISE EXCEPTION 'PREFLIGHT_PHASE57_CALENDAR_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_integracion_impactos_periodizacion') THEN RAISE EXCEPTION 'PREFLIGHT_PHASE56_INDEX_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_estado' AND pg_get_constraintdef(oid) LIKE '%SUPERSEDED%') THEN RAISE EXCEPTION 'PREFLIGHT_PHASE57_STATE_CONSTRAINT_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_integracion_impacto_superseded_by') THEN RAISE EXCEPTION 'PREFLIGHT_PHASE57_SUPERSEDED_FK_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_nomina_periodo_anulacion_phase57') THEN RAISE EXCEPTION 'PREFLIGHT_PHASE57_PERIOD_CONSTRAINT_MISSING'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_recalc_estado') THEN RAISE EXCEPTION 'PREFLIGHT_PHASE55_RECALC_CONSTRAINT_MISSING'; END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM public.nomina_periodos WHERE id IN (3,4,5,6);
  IF n <> 4 THEN RAISE EXCEPTION 'PREFLIGHT_PERIODS_MISSING: %', n; END IF;
  IF (SELECT estado FROM public.nomina_periodos WHERE id=3) NOT IN ('ABIERTO','EN_PROCESO','REVISADO','CERRADO','PAGADO') THEN RAISE EXCEPTION 'PREFLIGHT_PERIOD_3_NOT_OPERATIONAL'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id IN (4,6) AND estado='ANULADO') THEN RAISE EXCEPTION 'PREFLIGHT_PERIOD_ALREADY_CANCELLED'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=5 AND (estado='ANULADO' OR activo IS DISTINCT FROM TRUE OR periodo_canonico_id IS NOT NULL OR anulado_at IS NOT NULL OR anulado_por IS NOT NULL OR motivo_anulacion IS NOT NULL)) THEN RAISE EXCEPTION 'PREFLIGHT_PERIOD_5_NOT_INTACT'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_eventos) <> 5 THEN RAISE EXCEPTION 'PREFLIGHT_EVENT_COUNT_NOT_5'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_eventos WHERE periodo_id IS DISTINCT FROM 3) THEN RAISE EXCEPTION 'PREFLIGHT_EVENT_SOURCE_PERIOD_NOT_3'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos) <> 15 THEN RAISE EXCEPTION 'PREFLIGHT_IMPACT_COUNT_NOT_15'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=3) <> 5 OR (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=4) <> 5 OR (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=6) <> 5 THEN RAISE EXCEPTION 'PREFLIGHT_IMPACT_DISTRIBUTION_NOT_5_5_5'; END IF;
  IF (SELECT COUNT(*) FROM public.nomina_revision_operativa WHERE periodo_id=4) <> 47 THEN RAISE EXCEPTION 'PREFLIGHT_REVISIONS_4_NOT_47'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos WHERE superseded_by_impact_id IS NOT NULL OR estado='SUPERSEDED') THEN RAISE EXCEPTION 'PREFLIGHT_SUPERSEDED_ALREADY_PRESENT'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos WHERE requiere_recalculo IS TRUE OR recalc_estado <> 'SIN_CAMBIOS' OR recalc_attempts <> 0) THEN RAISE EXCEPTION 'PREFLIGHT_UNEXPECTED_RECALC'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos i LEFT JOIN public.integracion_eventos e ON e.id=i.evento_id WHERE e.id IS NULL) THEN RAISE EXCEPTION 'PREFLIGHT_EVENT_ORPHAN'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos i LEFT JOIN public.nomina_periodos p ON p.id=i.periodo_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'PREFLIGHT_PERIOD_ORPHAN'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT evento_id, periodo_id, vinculacion_id, fecha_desde, fecha_hasta FROM public.integracion_evento_impactos GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1) d) THEN RAISE EXCEPTION 'PREFLIGHT_DUPLICATE_IMPACT'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT idempotency_key FROM public.integracion_eventos GROUP BY 1 HAVING COUNT(*)>1) d) THEN RAISE EXCEPTION 'PREFLIGHT_DUPLICATE_EVENT'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos i4 JOIN public.integracion_evento_impactos i3 ON i3.evento_id=i4.evento_id AND i3.periodo_id=3 WHERE i4.periodo_id=4) <> 5 THEN RAISE EXCEPTION 'PREFLIGHT_PERIOD_4_CANONICAL_MATCH_NOT_5'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT i4.id FROM public.integracion_evento_impactos i4 JOIN public.integracion_evento_impactos i3 ON i3.evento_id=i4.evento_id AND i3.periodo_id=3 WHERE i4.periodo_id=4 GROUP BY i4.id HAVING COUNT(*)<>1) ambiguous) THEN RAISE EXCEPTION 'PREFLIGHT_AMBIGUOUS_CANONICAL_MATCH'; END IF;
  IF EXISTS (WITH RECURSIVE edges AS (SELECT id, superseded_by_impact_id AS next_id FROM public.integracion_evento_impactos WHERE superseded_by_impact_id IS NOT NULL), walk AS (SELECT id, next_id, ARRAY[id] AS path FROM edges UNION ALL SELECT w.id,e.next_id,w.path||e.id FROM walk w JOIN edges e ON e.id=w.next_id WHERE NOT e.id=ANY(w.path)) SELECT 1 FROM walk WHERE next_id=ANY(path)) THEN RAISE EXCEPTION 'PREFLIGHT_SUPERSEDED_CYCLE'; END IF;
  IF EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted) THEN RAISE EXCEPTION 'PREFLIGHT_LOCKS_WAITING'; END IF;
END $$;

DO $$
DECLARE n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM (
    SELECT periodo_id FROM public.nomina_empleados WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_asistencia_diaria WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_novedades WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_novedad_turnos WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_movimientos WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_contextos_operativos_base WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_liquidaciones WHERE periodo_id=6
  ) x;
  IF n <> 0 THEN RAISE EXCEPTION 'PREFLIGHT_PERIOD_6_HAS_OPERATIONAL_ACTIVITY: %', n; END IF;
END $$;

SELECT 'phase_56' AS metric, 'present' AS value WHERE EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_estado')
UNION ALL SELECT 'phase_57','present' WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nomina_calendarios_contractuales')
UNION ALL SELECT 'events',COUNT(*)::text FROM public.integracion_eventos
UNION ALL SELECT 'impacts',COUNT(*)::text FROM public.integracion_evento_impactos
UNION ALL SELECT 'impacts_3',COUNT(*)::text FROM public.integracion_evento_impactos WHERE periodo_id=3
UNION ALL SELECT 'impacts_4',COUNT(*)::text FROM public.integracion_evento_impactos WHERE periodo_id=4
UNION ALL SELECT 'impacts_6',COUNT(*)::text FROM public.integracion_evento_impactos WHERE periodo_id=6
UNION ALL SELECT 'revisions_4',COUNT(*)::text FROM public.nomina_revision_operativa WHERE periodo_id=4;
COMMIT;
