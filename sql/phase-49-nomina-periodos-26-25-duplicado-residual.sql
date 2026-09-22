-- Reasigna registros que todavía apuntaban a un duplicado ya inactivado por
-- phase-48. Es segura para repetir y conserva el historial de la reasignación.

BEGIN;

WITH cambios AS (
  SELECT a.id, a.periodo_id AS anterior, canonical.id AS nuevo, a.fecha
  FROM public.nomina_asistencia_diaria a
  JOIN public.nomina_periodos duplicate ON duplicate.id = a.periodo_id AND duplicate.activo = FALSE
  JOIN public.nomina_periodos canonical
    ON canonical.contrato_id = duplicate.contrato_id
   AND canonical.nombre_periodo = duplicate.nombre_periodo
   AND canonical.tipo_periodo = duplicate.tipo_periodo
   AND canonical.activo = TRUE
   AND a.fecha BETWEEN canonical.fecha_inicio AND canonical.fecha_fin
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_asistencia_diaria', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_asistencia_diaria a
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_asistencia_diaria' AND audit.registro_id = a.id;

WITH cambios AS (
  SELECT n.id, n.periodo_id AS anterior, canonical.id AS nuevo, COALESCE(n.fecha_inicio, n.fecha_fin) AS fecha
  FROM public.nomina_novedades n
  JOIN public.nomina_periodos duplicate ON duplicate.id = n.periodo_id AND duplicate.activo = FALSE
  JOIN public.nomina_periodos canonical
    ON canonical.contrato_id = duplicate.contrato_id
   AND canonical.nombre_periodo = duplicate.nombre_periodo
   AND canonical.tipo_periodo = duplicate.tipo_periodo
   AND canonical.activo = TRUE
   AND COALESCE(n.fecha_inicio, n.fecha_fin) BETWEEN canonical.fecha_inicio AND canonical.fecha_fin
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_novedades', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_novedades n
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_novedades' AND audit.registro_id = n.id;

WITH cambios AS (
  SELECT m.id, m.periodo_id AS anterior, canonical.id AS nuevo, m.fecha
  FROM public.nomina_movimientos m
  JOIN public.nomina_periodos duplicate ON duplicate.id = m.periodo_id AND duplicate.activo = FALSE
  JOIN public.nomina_periodos canonical
    ON canonical.contrato_id = duplicate.contrato_id
   AND canonical.nombre_periodo = duplicate.nombre_periodo
   AND canonical.tipo_periodo = duplicate.tipo_periodo
   AND canonical.activo = TRUE
   AND m.fecha BETWEEN canonical.fecha_inicio AND canonical.fecha_fin
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_movimientos', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_movimientos m
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_movimientos' AND audit.registro_id = m.id;

WITH cambios AS (
  SELECT t.id, t.periodo_id AS anterior, canonical.id AS nuevo,
         COALESCE(n.fecha_inicio, n.fecha_fin, m.fecha) AS fecha
  FROM public.nomina_novedad_turnos t
  JOIN public.nomina_periodos duplicate ON duplicate.id = t.periodo_id AND duplicate.activo = FALSE
  JOIN public.nomina_periodos canonical
    ON canonical.contrato_id = duplicate.contrato_id
   AND canonical.nombre_periodo = duplicate.nombre_periodo
   AND canonical.tipo_periodo = duplicate.tipo_periodo
   AND canonical.activo = TRUE
  LEFT JOIN public.nomina_novedades n ON n.id = t.nomina_novedad_id
  LEFT JOIN public.nomina_movimientos m ON m.id = t.movimiento_id
  WHERE COALESCE(n.periodo_id, m.periodo_id, canonical.id) = canonical.id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_novedad_turnos', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_novedad_turnos t
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_novedad_turnos' AND audit.registro_id = t.id;

COMMIT;
