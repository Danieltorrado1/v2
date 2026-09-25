\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset pager off
\echo 'POSTFLIGHT RECONCILIACION PERIODOS 3/4/6: solo lectura'

DO $$
DECLARE n bigint;
BEGIN
  IF (SELECT estado FROM public.nomina_periodos WHERE id=3) NOT IN ('ABIERTO','EN_PROCESO','REVISADO','CERRADO','PAGADO') THEN RAISE EXCEPTION 'POSTFLIGHT_CANONICO_3_INVALIDO'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=4 AND (estado <> 'ANULADO' OR activo IS DISTINCT FROM FALSE OR periodo_canonico_id IS DISTINCT FROM 3 OR anulado_at IS NULL OR anulado_por IS NULL OR NULLIF(BTRIM(motivo_anulacion),'') IS NULL)) THEN RAISE EXCEPTION 'POSTFLIGHT_PERIODO_4_INVALIDO'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=6 AND (estado <> 'ANULADO' OR activo IS DISTINCT FROM FALSE OR periodo_canonico_id IS NOT NULL OR anulado_at IS NULL OR anulado_por IS NULL OR NULLIF(BTRIM(motivo_anulacion),'') IS NULL)) THEN RAISE EXCEPTION 'POSTFLIGHT_PERIODO_6_INVALIDO'; END IF;
  IF EXISTS (SELECT 1 FROM public.nomina_periodos WHERE id=5 AND (estado='ANULADO' OR activo IS DISTINCT FROM TRUE OR periodo_canonico_id IS NOT NULL OR anulado_at IS NOT NULL OR anulado_por IS NOT NULL OR motivo_anulacion IS NOT NULL)) THEN RAISE EXCEPTION 'POSTFLIGHT_PERIODO_5_MODIFICADO'; END IF;
  IF (SELECT COUNT(*) FROM public.nomina_revision_operativa WHERE periodo_id=4) <> 47 THEN RAISE EXCEPTION 'POSTFLIGHT_REVISIONES_4_INVALIDAS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_eventos) <> 5 OR EXISTS (SELECT 1 FROM public.integracion_eventos WHERE periodo_id IS DISTINCT FROM 3) THEN RAISE EXCEPTION 'POSTFLIGHT_EVENTOS_INVALIDOS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos) <> 15 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_TOTALES_INVALIDOS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=3 AND estado='SUPERSEDED') <> 0 OR (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=3) <> 5 THEN RAISE EXCEPTION 'POSTFLIGHT_CANONICOS_3_INVALIDOS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id IN (4,6) AND estado='SUPERSEDED' AND accion_requerida='SUPERSEDED') <> 10 THEN RAISE EXCEPTION 'POSTFLIGHT_SUPERSEDED_NO_SON_10'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=4 AND (superseded_by_impact_id IS NULL OR superseded_reason IS NULL OR superseded_at IS NULL)) <> 0 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_4_TRAZABILIDAD_INVALIDA'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=6 AND (superseded_by_impact_id IS NOT NULL OR superseded_reason IS NULL OR superseded_at IS NULL)) <> 0 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_6_CANONICO_AMBIGUO'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos i4 JOIN public.integracion_evento_impactos i3 ON i3.id=i4.superseded_by_impact_id AND i3.evento_id=i4.evento_id AND i3.periodo_id=3 WHERE i4.periodo_id=4) <> 5 THEN RAISE EXCEPTION 'POSTFLIGHT_VINCULOS_4_INVALIDOS'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos i LEFT JOIN public.integracion_eventos e ON e.id=i.evento_id WHERE e.id IS NULL) OR EXISTS (SELECT 1 FROM public.integracion_evento_impactos i LEFT JOIN public.nomina_periodos p ON p.id=i.periodo_id WHERE p.id IS NULL) THEN RAISE EXCEPTION 'POSTFLIGHT_HUERFANOS'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT evento_id,periodo_id,vinculacion_id,fecha_desde,fecha_hasta FROM public.integracion_evento_impactos GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1) d) THEN RAISE EXCEPTION 'POSTFLIGHT_DUPLICADOS'; END IF;
  IF EXISTS (WITH RECURSIVE edges AS (SELECT id,superseded_by_impact_id AS next_id FROM public.integracion_evento_impactos WHERE superseded_by_impact_id IS NOT NULL), walk AS (SELECT id,next_id,ARRAY[id] path FROM edges UNION ALL SELECT w.id,e.next_id,w.path||e.id FROM walk w JOIN edges e ON e.id=w.next_id WHERE NOT e.id=ANY(w.path)) SELECT 1 FROM walk WHERE next_id=ANY(path)) THEN RAISE EXCEPTION 'POSTFLIGHT_CICLOS'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_evento_impactos WHERE requiere_recalculo IS TRUE OR recalc_estado <> 'SIN_CAMBIOS' OR recalc_attempts <> 0) THEN RAISE EXCEPTION 'POSTFLIGHT_RECALCULOS_INESPERADOS'; END IF;
  SELECT COUNT(*) INTO n FROM pg_locks WHERE NOT granted;
  IF n <> 0 THEN RAISE EXCEPTION 'POSTFLIGHT_LOCKS_ESPERANDO'; END IF;
END $$;

SELECT 'periodo_3' AS metric, estado::text AS value FROM public.nomina_periodos WHERE id=3
UNION ALL SELECT 'periodo_4', estado::text FROM public.nomina_periodos WHERE id=4
UNION ALL SELECT 'periodo_6', estado::text FROM public.nomina_periodos WHERE id=6
UNION ALL SELECT 'periodo_4_revisiones', COUNT(*)::text FROM public.nomina_revision_operativa WHERE periodo_id=4
UNION ALL SELECT 'impactos_totales', COUNT(*)::text FROM public.integracion_evento_impactos
UNION ALL SELECT 'impactos_3', COUNT(*)::text FROM public.integracion_evento_impactos WHERE periodo_id=3
UNION ALL SELECT 'impactos_4_superseded', COUNT(*)::text FROM public.integracion_evento_impactos WHERE periodo_id=4 AND estado='SUPERSEDED'
UNION ALL SELECT 'impactos_6_superseded', COUNT(*)::text FROM public.integracion_evento_impactos WHERE periodo_id=6 AND estado='SUPERSEDED';
