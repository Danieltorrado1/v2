\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
DO $$
BEGIN
  IF (SELECT estado FROM public.nomina_periodos WHERE id=3) <> 'ABIERTO' THEN RAISE EXCEPTION 'POSTFLIGHT_CANONICO_3_INVALIDO'; END IF;
  IF (SELECT estado FROM public.nomina_periodos WHERE id=4) <> 'ANULADO' THEN RAISE EXCEPTION 'POSTFLIGHT_PERIODO_4_NO_ANULADO'; END IF;
  IF (SELECT estado FROM public.nomina_periodos WHERE id=6) <> 'ANULADO' THEN RAISE EXCEPTION 'POSTFLIGHT_PERIODO_6_NO_ANULADO'; END IF;
  IF (SELECT COUNT(*) FROM public.nomina_revision_operativa WHERE periodo_id=4) <> 47 THEN RAISE EXCEPTION 'POSTFLIGHT_REVISIONES_4_INVALIDAS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=3) <> 5 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_3_INVALIDOS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id IN (4,6) AND estado <> 'SUPERSEDED') <> 0 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_SUPERSEDED_INVALIDOS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=4 AND superseded_by_impact_id IS NULL) <> 0 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_4_SIN_CANONICO'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=6 AND superseded_by_impact_id IS NOT NULL) <> 0 THEN RAISE EXCEPTION 'POSTFLIGHT_IMPACTOS_6_CANONICO_AMBIGUO'; END IF;
END $$;
SELECT periodo_id, estado, accion_requerida, COUNT(*)::bigint FROM public.integracion_evento_impactos WHERE periodo_id IN (3,4,6) GROUP BY periodo_id,estado,accion_requerida ORDER BY periodo_id,estado;
SELECT id, estado, activo, periodo_canonico_id, motivo_anulacion IS NOT NULL AS tiene_motivo FROM public.nomina_periodos WHERE id IN (3,4,5,6) ORDER BY id;
