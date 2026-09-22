-- Corrección idempotente de phase-49: actualiza directamente las filas que aún
-- estén en un período duplicado inactivo, sin resolverlas nuevamente desde una
-- auditoría con versiones históricas.

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
SET periodo_id = canonical.id
FROM public.nomina_periodos duplicate
JOIN public.nomina_periodos canonical
  ON canonical.contrato_id = duplicate.contrato_id
 AND canonical.nombre_periodo = duplicate.nombre_periodo
 AND canonical.tipo_periodo = duplicate.tipo_periodo
 AND canonical.activo = TRUE
WHERE a.periodo_id = duplicate.id
  AND duplicate.activo = FALSE
  AND a.fecha BETWEEN canonical.fecha_inicio AND canonical.fecha_fin;

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
SET periodo_id = canonical.id
FROM public.nomina_periodos duplicate
JOIN public.nomina_periodos canonical
  ON canonical.contrato_id = duplicate.contrato_id
 AND canonical.nombre_periodo = duplicate.nombre_periodo
 AND canonical.tipo_periodo = duplicate.tipo_periodo
 AND canonical.activo = TRUE
WHERE n.periodo_id = duplicate.id
  AND duplicate.activo = FALSE
  AND COALESCE(n.fecha_inicio, n.fecha_fin) BETWEEN canonical.fecha_inicio AND canonical.fecha_fin;

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
SET periodo_id = canonical.id
FROM public.nomina_periodos duplicate
JOIN public.nomina_periodos canonical
  ON canonical.contrato_id = duplicate.contrato_id
 AND canonical.nombre_periodo = duplicate.nombre_periodo
 AND canonical.tipo_periodo = duplicate.tipo_periodo
 AND canonical.activo = TRUE
WHERE m.periodo_id = duplicate.id
  AND duplicate.activo = FALSE
  AND m.fecha BETWEEN canonical.fecha_inicio AND canonical.fecha_fin;

UPDATE public.nomina_novedad_turnos t
SET periodo_id = source.nuevo
FROM (
  SELECT t0.id, COALESCE(n.periodo_id, m.periodo_id) AS nuevo
  FROM public.nomina_novedad_turnos t0
  JOIN public.nomina_periodos duplicate ON duplicate.id = t0.periodo_id AND duplicate.activo = FALSE
  LEFT JOIN public.nomina_novedades n ON n.id = t0.nomina_novedad_id
  LEFT JOIN public.nomina_movimientos m ON m.id = t0.movimiento_id
  WHERE COALESCE(n.periodo_id, m.periodo_id) IS NOT NULL
) source
WHERE t.id = source.id;

COMMIT;
