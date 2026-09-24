\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  revisions4 bigint;
  impacts3 bigint;
  impacts4 bigint;
  impacts6 bigint;
  events5 bigint;
  ops6 bigint;
  ops4 bigint;
  locks_waiting bigint;
BEGIN
  SELECT COUNT(*) INTO revisions4 FROM public.nomina_revision_operativa WHERE periodo_id=4;
  IF revisions4 <> 47 THEN RAISE EXCEPTION 'RECONCILIACION_PRECONDICION_REVISIONES'; END IF;
  SELECT COUNT(*) INTO impacts3 FROM public.integracion_evento_impactos WHERE periodo_id=3;
  SELECT COUNT(*) INTO impacts4 FROM public.integracion_evento_impactos WHERE periodo_id=4;
  SELECT COUNT(*) INTO impacts6 FROM public.integracion_evento_impactos WHERE periodo_id=6;
  SELECT COUNT(*) INTO events5 FROM public.integracion_eventos WHERE periodo_id=3;
  IF impacts3 <> 5 OR impacts4 <> 5 OR impacts6 <> 5 OR events5 <> 5 THEN RAISE EXCEPTION 'RECONCILIACION_PRECONDICION_EVENTOS_IMPACTOS'; END IF;
  IF EXISTS (SELECT 1 FROM public.integracion_eventos WHERE periodo_id IS DISTINCT FROM 3) THEN RAISE EXCEPTION 'RECONCILIACION_EVENTO_SIN_PERIODO_CANONICO'; END IF;
  SELECT COUNT(*) INTO ops4 FROM (
    SELECT periodo_id FROM public.nomina_empleados WHERE periodo_id=4
    UNION ALL SELECT periodo_id FROM public.nomina_asistencia_diaria WHERE periodo_id=4
    UNION ALL SELECT periodo_id FROM public.nomina_novedades WHERE periodo_id=4
    UNION ALL SELECT periodo_id FROM public.nomina_novedad_turnos WHERE periodo_id=4
    UNION ALL SELECT periodo_id FROM public.nomina_movimientos WHERE periodo_id=4
    UNION ALL SELECT periodo_id FROM public.nomina_contextos_operativos_base WHERE periodo_id=4
    UNION ALL SELECT periodo_id FROM public.nomina_liquidaciones WHERE periodo_id=4
  ) x;
  SELECT COUNT(*) INTO ops6 FROM (
    SELECT periodo_id FROM public.nomina_empleados WHERE periodo_id=6
    UNION ALL SELECT periodo_id FROM public.nomina_asistencia_diaria WHERE periodo_id=6
    UNION ALL SELECT periodo_id FROM public.nomina_novedades WHERE periodo_id=6
    UNION ALL SELECT periodo_id FROM public.nomina_novedad_turnos WHERE periodo_id=6
    UNION ALL SELECT periodo_id FROM public.nomina_movimientos WHERE periodo_id=6
    UNION ALL SELECT periodo_id FROM public.nomina_contextos_operativos_base WHERE periodo_id=6
    UNION ALL SELECT periodo_id FROM public.nomina_liquidaciones WHERE periodo_id=6
  ) x;
  IF ops4 <> 0 OR ops6 <> 0 THEN RAISE EXCEPTION 'RECONCILIACION_PERIODO_NO_VACIO'; END IF;
  SELECT COUNT(*) INTO locks_waiting FROM pg_locks WHERE NOT granted;
  IF locks_waiting <> 0 THEN RAISE EXCEPTION 'RECONCILIACION_LOCKS_ESPERANDO'; END IF;
END $$;

INSERT INTO public.auditoria_eventos(modulo, entidad, entidad_id, accion, descripcion, datos_anteriores, datos_nuevos)
SELECT 'NOMINA','nomina_periodos',p.id,'NOMINA_PERIODO_ANULACION',
       'Anulacion controlada por calendario 26-25; historial conservado',
       jsonb_build_object('estado',p.estado,'activo',p.activo,'periodo_canonico_id',p.periodo_canonico_id),
       jsonb_build_object('estado','ANULADO','activo',false,'periodo_canonico_id',CASE WHEN p.id=4 THEN 3 ELSE NULL END)
FROM public.nomina_periodos p
WHERE p.id IN (4,6)
  AND p.estado <> 'ANULADO';

UPDATE public.nomina_periodos
SET estado='ANULADO', activo=FALSE, anulado_at=COALESCE(anulado_at,NOW()),
    motivo_anulacion=COALESCE(motivo_anulacion,
      CASE WHEN id=4 THEN 'Duplicado exacto del periodo canonico 3; se conserva historial de revisiones.'
           ELSE 'Periodo solapado con dos ciclos 26-25; no se asigna un unico canonico.' END),
    periodo_canonico_id=CASE WHEN id=4 THEN 3 ELSE NULL END
WHERE id IN (4,6) AND estado <> 'ANULADO';

INSERT INTO public.auditoria_eventos(modulo, entidad, entidad_id, accion, descripcion, datos_anteriores, datos_nuevos)
SELECT 'INTEGRACION','integracion_evento_impactos',i.id,'INTEGRACION_IMPACTO_SUPERSEDED',
       'Impacto reemplazado por el impacto canonico del mismo evento en periodo 3',
       jsonb_build_object('estado',i.estado,'accion_requerida',i.accion_requerida,'periodo_id',i.periodo_id),
       jsonb_build_object('estado','SUPERSEDED','accion_requerida','SUPERSEDED','periodo_canonico_id',3)
FROM public.integracion_evento_impactos i
WHERE i.periodo_id IN (4,6)
  AND i.estado <> 'SUPERSEDED';

UPDATE public.integracion_evento_impactos old
SET estado='SUPERSEDED', accion_requerida='SUPERSEDED', superseded_at=COALESCE(old.superseded_at,NOW()),
    superseded_reason=COALESCE(old.superseded_reason, CASE WHEN old.periodo_id=4
      THEN 'Periodo 4 duplicado; reemplazado por impacto canonico del periodo 3'
      ELSE 'Periodo 6 atraviesa dos ciclos 26-25; superseded sin canon unico' END),
    superseded_by_impact_id=canon.id, updated_at=NOW()
FROM public.integracion_evento_impactos canon
WHERE old.periodo_id=4
  AND canon.periodo_id=3
  AND canon.evento_id=old.evento_id;

UPDATE public.integracion_evento_impactos
SET estado='SUPERSEDED', accion_requerida='SUPERSEDED', superseded_at=COALESCE(superseded_at,NOW()),
    superseded_reason=COALESCE(superseded_reason,'Periodo 6 atraviesa dos ciclos 26-25; superseded sin canon unico'),
    superseded_by_impact_id=NULL, updated_at=NOW()
WHERE periodo_id=6;
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.nomina_revision_operativa WHERE periodo_id=4) <> 47 THEN RAISE EXCEPTION 'RECONCILIACION_REVISIONES_MODIFICADAS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id=3) <> 5 THEN RAISE EXCEPTION 'RECONCILIACION_CANONICOS_MODIFICADOS'; END IF;
  IF (SELECT COUNT(*) FROM public.integracion_evento_impactos WHERE periodo_id IN (4,6) AND estado <> 'SUPERSEDED') <> 0 THEN RAISE EXCEPTION 'RECONCILIACION_SUPERSEDED_INCOMPLETA'; END IF;
END $$;
COMMIT;
