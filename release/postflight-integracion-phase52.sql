\set ON_ERROR_STOP on
\pset footer off
\pset pager off
\echo 'POSTFLIGHT INTEGRACION PHASE 52: solo lectura'

DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public.integracion_eventos') IS NULL THEN RAISE EXCEPTION 'PHASE_52_REQUIRED_TABLE_MISSING: public.integracion_eventos'; END IF;
  IF to_regclass('public.integracion_evento_impactos') IS NULL THEN RAISE EXCEPTION 'PHASE_52_REQUIRED_TABLE_MISSING: public.integracion_evento_impactos'; END IF;
  SELECT string_agg(x, ',') INTO missing FROM (VALUES
    ('integracion_eventos.id'),('integracion_eventos.event_type'),('integracion_eventos.aggregate_type'),('integracion_eventos.aggregate_id'),
    ('integracion_eventos.effective_date'),('integracion_eventos.idempotency_key'),('integracion_eventos.status'),('integracion_eventos.attempts'),
    ('integracion_eventos.available_at'),('integracion_eventos.created_at'),('integracion_eventos.updated_at'),('integracion_evento_impactos.id'),
    ('integracion_evento_impactos.evento_id'),('integracion_evento_impactos.vinculacion_id'),('integracion_evento_impactos.fecha_desde'),
    ('integracion_evento_impactos.fecha_hasta'),('integracion_evento_impactos.periodo_estado'),('integracion_evento_impactos.accion_requerida'),
    ('integracion_evento_impactos.requiere_recalculo'),('integracion_evento_impactos.bloqueado_por_cierre'),('integracion_evento_impactos.created_at')
  ) v(x) WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public'
    AND c.table_name=split_part(v.x,'.',1) AND c.column_name=split_part(v.x,'.',2));
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'PHASE_52_REQUIRED_COLUMNS_MISSING: %', missing; END IF;
  IF (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname IN ('integracion_eventos','integracion_evento_impactos')
      AND c.conname IN ('uq_integracion_eventos_idempotency','chk_integracion_eventos_status','chk_integracion_eventos_attempts',
        'uq_integracion_evento_impacto','chk_integracion_evento_impacto_accion','chk_integracion_evento_impacto_rango')) <> 6
    THEN RAISE EXCEPTION 'PHASE_52_REQUIRED_CONSTRAINTS_MISSING'; END IF;
  IF (SELECT COUNT(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname='public' AND r.relname IN ('integracion_eventos','integracion_evento_impactos')
      AND c.contype='f') <> 8
    THEN RAISE EXCEPTION 'PHASE_52_REQUIRED_FKS_MISSING'; END IF;
  IF (SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN
      ('idx_integracion_eventos_claim','idx_integracion_eventos_empresa_contrato','idx_integracion_eventos_vinculacion',
       'idx_integracion_eventos_persona','idx_integracion_eventos_periodo','idx_integracion_eventos_effective_date',
       'idx_integracion_impactos_periodo','idx_integracion_impactos_vinculacion')) <> 8
    THEN RAISE EXCEPTION 'PHASE_52_REQUIRED_INDEXES_MISSING'; END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.integracion_eventos) THEN RAISE EXCEPTION 'PHASE_52_EVENTS_NOT_EMPTY'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos) THEN RAISE EXCEPTION 'PHASE_52_IMPACTS_NOT_EMPTY'; END IF;
END $$;

SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
SELECT 'integracion_eventos' AS object_name, COUNT(*)::bigint AS row_count FROM public.integracion_eventos
UNION ALL SELECT 'integracion_evento_impactos', COUNT(*)::bigint FROM public.integracion_evento_impactos;
