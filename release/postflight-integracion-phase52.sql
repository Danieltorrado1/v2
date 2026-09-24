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
DECLARE
  invalid_count bigint;
BEGIN
  -- El postflight es reutilizable: una instalación limpia puede tener cero filas,
  -- pero una instalación operativa puede contener eventos legítimos.
  SELECT COUNT(*) INTO invalid_count
  FROM public.integracion_eventos
  WHERE status NOT IN ('PENDIENTE','PROCESANDO','PROCESADO','ERROR')
     OR attempts < 0
     OR (status = 'ERROR' AND NULLIF(BTRIM(COALESCE(last_error_code,'')), '') IS NULL)
     OR (status = 'PROCESANDO' AND (locked_at IS NULL OR NULLIF(BTRIM(COALESCE(locked_by,'')), '') IS NULL));
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_INVALID_EVENT_STATE: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.integracion_evento_impactos i
  WHERE i.periodo_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.nomina_periodos p WHERE p.id = i.periodo_id);
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_IMPACT_PERIOD_ORPHAN: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.integracion_evento_impactos i
  LEFT JOIN public.integracion_eventos e ON e.id = i.evento_id
  WHERE e.id IS NULL;
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_IMPACT_EVENT_ORPHAN: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.integracion_eventos
  WHERE idempotency_key IS NULL OR BTRIM(idempotency_key) = '';
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_IDEMPOTENCY_KEY_INVALID: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM (
    SELECT idempotency_key FROM public.integracion_eventos
    GROUP BY idempotency_key HAVING COUNT(*) > 1
  ) duplicates;
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_IDEMPOTENCY_DUPLICATE: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM (
    SELECT evento_id, vinculacion_id, periodo_id, fecha_desde, fecha_hasta
    FROM public.integracion_evento_impactos
    GROUP BY evento_id, vinculacion_id, periodo_id, fecha_desde, fecha_hasta
    HAVING COUNT(*) > 1
  ) duplicates;
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_IMPACT_DUPLICATE: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.integracion_eventos e
  JOIN public.integracion_evento_impactos i ON i.evento_id = e.id
  JOIN public.vinculaciones v ON v.id = i.vinculacion_id
  JOIN public.contratos cv ON cv.id = v.contrato_id
  LEFT JOIN public.nomina_periodos p ON p.id = i.periodo_id
  LEFT JOIN public.contratos cp ON cp.id = p.contrato_id
  WHERE (e.contrato_id IS NOT NULL AND e.contrato_id <> v.contrato_id)
     OR (e.empresa_id IS NOT NULL AND e.empresa_id <> cv.empresa_id)
     OR (p.id IS NOT NULL AND p.contrato_id <> v.contrato_id)
     OR (p.id IS NOT NULL AND cp.empresa_id <> cv.empresa_id);
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_IMPACT_SCOPE_INCOHERENT: %', invalid_count; END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM public.integracion_eventos e
  WHERE lower(COALESCE(e.idempotency_key,'') || ' ' || COALESCE(e.aggregate_type,'') || ' ' ||
              COALESCE(e.payload_before::text,'') || ' ' || COALESCE(e.payload_after::text,''))
        ~ '(^|[^a-z])(fixture|synthetic|qa-session|test)([^a-z]|$)';
  IF invalid_count > 0 THEN RAISE EXCEPTION 'PHASE_52_FIXTURE_MARKER: %', invalid_count; END IF;

  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos WHERE requiere_recalculo IS TRUE)
    THEN RAISE EXCEPTION 'PHASE_52_UNEXPECTED_RECALC_MARKER';
  END IF;
END $$;

SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
SELECT 'integracion_eventos' AS object_name, COUNT(*)::bigint AS row_count FROM public.integracion_eventos
UNION ALL SELECT 'integracion_evento_impactos', COUNT(*)::bigint FROM public.integracion_evento_impactos;
