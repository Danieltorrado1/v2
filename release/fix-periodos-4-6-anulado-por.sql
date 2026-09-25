\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('app.fix_actor_user_id', :'actor_user_id', false);

DO $$
DECLARE actor_id bigint := current_setting('app.fix_actor_user_id')::bigint;
    already_set bigint;
    mismatched bigint;
BEGIN
  IF actor_id IS NULL OR actor_id <= 0 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_ACTOR_REQUIRED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.usuario_roles ur ON ur.usuario_id=u.id AND COALESCE(ur.activo,TRUE)
    JOIN public.roles r ON r.id=ur.rol_id AND COALESCE(r.activo,TRUE)
    JOIN public.usuario_empresas ue ON ue.usuario_id=u.id AND ue.empresa_id=15 AND COALESCE(ue.activo,TRUE)
    WHERE u.id=actor_id AND COALESCE(u.activo,TRUE) AND r.nombre_rol='ADMINISTRADOR'
  ) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_ACTOR_INVALIDO'; END IF;

  SELECT COUNT(*) FILTER (WHERE anulado_por IS NOT NULL), COUNT(*) FILTER (WHERE anulado_por IS NOT NULL AND anulado_por <> actor_id)
    INTO already_set, mismatched FROM public.nomina_periodos WHERE id IN (4,6);
  IF mismatched <> 0 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_ACTOR_DIFFERENT'; END IF;
  IF already_set <> 0 AND already_set <> 2 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_PARTIAL_STATE'; END IF;

  IF (SELECT estado FROM public.nomina_periodos WHERE id=3) NOT IN ('ABIERTO','EN_PROCESO','REVISADO','CERRADO','PAGADO') THEN RAISE EXCEPTION 'FIX_ANULADO_POR_PERIOD_3_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=5 AND (estado='ANULADO' OR activo IS DISTINCT FROM TRUE OR periodo_canonico_id IS NOT NULL OR anulado_at IS NOT NULL OR anulado_por IS NOT NULL OR motivo_anulacion IS NOT NULL)) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_PERIOD_5_CHANGED'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=4 AND (estado <> 'ANULADO' OR activo IS DISTINCT FROM FALSE OR periodo_canonico_id IS DISTINCT FROM 3 OR anulado_at IS NULL OR (anulado_por IS NOT NULL AND anulado_por <> actor_id) OR NULLIF(BTRIM(motivo_anulacion),'') IS NULL)) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_PERIOD_4_PRECONDITION'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=6 AND (estado <> 'ANULADO' OR activo IS DISTINCT FROM FALSE OR periodo_canonico_id IS NOT NULL OR anulado_at IS NULL OR (anulado_por IS NOT NULL AND anulado_por <> actor_id) OR NULLIF(BTRIM(motivo_anulacion),'') IS NULL)) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_PERIOD_6_PRECONDITION'; END IF;
  IF (SELECT COUNT(*) FROM public.nomina_revision_operativa WHERE periodo_id=4) <> 47 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_REVISIONS_4'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_eventos) <> 5 OR EXISTS (SELECT 1 FROM public.integracion_eventos WHERE periodo_id IS DISTINCT FROM 3) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_EVENTS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos) <> 15 OR (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=3) <> 5 OR (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=4) <> 5 OR (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=6) <> 5 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_IMPACTS'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos i WHERE i.periodo_id IN (4,6) AND (i.estado <> 'SUPERSEDED' OR i.accion_requerida <> 'SUPERSEDED' OR i.superseded_reason IS NULL OR i.superseded_at IS NULL)) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_IMPACT_STATE'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos i4 JOIN public.integracion_evento_impactos i3 ON i3.id=i4.superseded_by_impact_id AND i3.evento_id=i4.evento_id AND i3.periodo_id=3 WHERE i4.periodo_id=4) <> 5 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_LINKS_4'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos WHERE periodo_id=6 AND superseded_by_impact_id IS NOT NULL) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_LINKS_6'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos i LEFT JOIN public.integracion_eventos e ON e.id=i.evento_id WHERE e.id IS NULL) OR EXISTS (SELECT 1 FROM public.integracion_evento_impactos i LEFT JOIN public.nomina_periodos p ON p.id=i.periodo_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_ORPHANS'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT evento_id,periodo_id,vinculacion_id,fecha_desde,fecha_hasta FROM public.integracion_evento_impactos GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1)d) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_DUPLICATES'; END IF;
  IF EXISTS (WITH RECURSIVE edges AS (SELECT id,superseded_by_impact_id next_id FROM public.integracion_evento_impactos WHERE superseded_by_impact_id IS NOT NULL),walk AS (SELECT id,next_id,ARRAY[id] path FROM edges UNION ALL SELECT w.id,e.next_id,w.path||e.id FROM walk w JOIN edges e ON e.id=w.next_id WHERE NOT e.id=ANY(w.path)) SELECT 1 FROM walk WHERE next_id=ANY(path)) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_CYCLES'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos WHERE requiere_recalculo IS TRUE OR recalc_estado <> 'SIN_CAMBIOS' OR recalc_attempts <> 0) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_RECALC'; END IF;
  IF (SELECT COUNT(*) FROM (SELECT periodo_id FROM public.nomina_empleados WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_asistencia_diaria WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_novedades WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_novedad_turnos WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_movimientos WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_contextos_operativos_base WHERE periodo_id=6 UNION ALL SELECT periodo_id FROM public.nomina_liquidaciones WHERE periodo_id=6)x) <> 0 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_ACTIVITY_6'; END IF;
  IF EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted) THEN RAISE EXCEPTION 'FIX_ANULADO_POR_LOCKS'; END IF;
END $$;

DO $$
DECLARE updated_count bigint; audit_count bigint;
BEGIN
  WITH updated AS (
    UPDATE public.nomina_periodos
    SET anulado_por=current_setting('app.fix_actor_user_id')::bigint
    WHERE id IN (4,6) AND anulado_por IS NULL
    RETURNING id
  ) SELECT COUNT(*) INTO updated_count FROM updated;
  IF updated_count = 0 THEN
    IF (SELECT COUNT(*) FROM public.nomina_periodos WHERE id IN (4,6) AND anulado_por=actor_id) <> 2 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_ROWCOUNT: 0'; END IF;
    RAISE NOTICE 'FIX_ANULADO_POR_IDEMPOTENT_NOOP';
  ELSIF updated_count = 2 THEN
    INSERT INTO public.auditoria_eventos(modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos)
    SELECT 'NOMINA','nomina_periodos',p.id,'NOMINA_PERIODO_ANULACION_TRAZABILIDAD_CORREGIDA',
      'Correccion controlada exclusiva de anulado_por tras reconciliacion; no se alteraron otros campos',
      jsonb_build_object('anulado_por',NULL),jsonb_build_object('anulado_por',current_setting('app.fix_actor_user_id')::bigint)
    FROM public.nomina_periodos p WHERE p.id IN (4,6);
    GET DIAGNOSTICS audit_count = ROW_COUNT;
    IF audit_count <> 2 THEN RAISE EXCEPTION 'FIX_ANULADO_POR_AUDIT_ROWCOUNT: %', audit_count; END IF;
  ELSE
    RAISE EXCEPTION 'FIX_ANULADO_POR_ROWCOUNT: %', updated_count;
  END IF;
END $$;

COMMIT;
