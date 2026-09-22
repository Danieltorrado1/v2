-- Corrige y consolida períodos mensuales duplicados que pudieron crearse durante
-- la transición al calendario 26->25. Conserva filas de auditoría y no elimina
-- registros históricos; un duplicado con conflictos de revisión queda inactivo.

BEGIN;

CREATE TEMP TABLE tmp_nomina_periodos_canonicos ON COMMIT DROP AS
SELECT id, contrato_id, nombre_periodo, fecha_inicio, fecha_fin, tipo_periodo
FROM (
  SELECT np.*,
         row_number() OVER (
           PARTITION BY np.contrato_id, upper(trim(np.nombre_periodo)), np.tipo_periodo, np.fecha_inicio, np.fecha_fin
           ORDER BY np.id
         ) AS orden
  FROM public.nomina_periodos np
  WHERE np.activo IS DISTINCT FROM false
    AND np.tipo_periodo = 'MENSUAL'
) ranked
WHERE orden = 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.nomina_asistencia_diaria source
    JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
    JOIN tmp_nomina_periodos_canonicos destination
      ON destination.contrato_id = source_period.contrato_id
     AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
     AND destination.id <> source.periodo_id
    JOIN public.nomina_asistencia_diaria existing
      ON existing.periodo_id = destination.id
     AND existing.vinculacion_id = source.vinculacion_id
     AND existing.fecha = source.fecha
     AND existing.id <> source.id
  ) THEN
    RAISE EXCEPTION 'Conflicto de asistencia al consolidar períodos 26-25';
  END IF;
END $$;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, destination.id AS nuevo, source.fecha
  FROM public.nomina_asistencia_diaria source
  JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos destination
    ON destination.contrato_id = source_period.contrato_id
   AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_asistencia_diaria', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_asistencia_diaria source
SET periodo_id = c.nuevo
FROM (
  SELECT source.id, destination.id AS nuevo
  FROM public.nomina_asistencia_diaria source
  JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos destination
    ON destination.contrato_id = source_period.contrato_id
   AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
) c
WHERE source.id = c.id;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, destination.id AS nuevo, COALESCE(source.fecha_inicio, source.fecha_fin) AS fecha
  FROM public.nomina_novedades source
  JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos destination
    ON destination.contrato_id = source_period.contrato_id
   AND COALESCE(source.fecha_inicio, source.fecha_fin) BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_novedades', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_novedades source
SET periodo_id = c.nuevo
FROM (
  SELECT source.id, destination.id AS nuevo
  FROM public.nomina_novedades source
  JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos destination
    ON destination.contrato_id = source_period.contrato_id
   AND COALESCE(source.fecha_inicio, source.fecha_fin) BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
) c
WHERE source.id = c.id;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, destination.id AS nuevo, source.fecha
  FROM public.nomina_movimientos source
  JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos destination
    ON destination.contrato_id = source_period.contrato_id
   AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_movimientos', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_movimientos source
SET periodo_id = c.nuevo
FROM (
  SELECT source.id, destination.id AS nuevo
  FROM public.nomina_movimientos source
  JOIN tmp_nomina_periodos_canonicos source_period ON source_period.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos destination
    ON destination.contrato_id = source_period.contrato_id
   AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
) c
WHERE source.id = c.id;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, COALESCE(n.periodo_id, m.periodo_id) AS nuevo,
         COALESCE(n.fecha_inicio, n.fecha_fin, m.fecha) AS fecha
  FROM public.nomina_novedad_turnos source
  LEFT JOIN public.nomina_novedades n ON n.id = source.nomina_novedad_id
  LEFT JOIN public.nomina_movimientos m ON m.id = source.movimiento_id
  WHERE COALESCE(n.periodo_id, m.periodo_id) IS NOT NULL
    AND COALESCE(n.periodo_id, m.periodo_id) <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_novedad_turnos', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_novedad_turnos source
SET periodo_id = c.nuevo
FROM (
  SELECT source.id, COALESCE(n.periodo_id, m.periodo_id) AS nuevo
  FROM public.nomina_novedad_turnos source
  LEFT JOIN public.nomina_novedades n ON n.id = source.nomina_novedad_id
  LEFT JOIN public.nomina_movimientos m ON m.id = source.movimiento_id
  WHERE COALESCE(n.periodo_id, m.periodo_id) IS NOT NULL
    AND COALESCE(n.periodo_id, m.periodo_id) <> source.periodo_id
) c
WHERE source.id = c.id;

-- Las revisiones tienen una restricción única por empleado y período. Se mueven
-- solo cuando no existe conflicto; los conflictos quedan trazables en el período
-- duplicado, que se desactiva para no aparecer como opción de trabajo.
WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, canonical.id AS nuevo
  FROM public.nomina_revision_operativa source
  JOIN public.nomina_periodos duplicate ON duplicate.id = source.periodo_id
  JOIN tmp_nomina_periodos_canonicos canonical
    ON canonical.contrato_id = duplicate.contrato_id
   AND canonical.nombre_periodo = duplicate.nombre_periodo
   AND canonical.id <> duplicate.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.nomina_revision_operativa existing
    WHERE existing.periodo_id = canonical.id
      AND existing.nomina_empleado_id = source.nomina_empleado_id
  )
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id)
SELECT 'nomina_revision_operativa', id, anterior, nuevo FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_revision_operativa source
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_revision_operativa' AND audit.registro_id = source.id;

INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id)
SELECT 'nomina_periodos', duplicate.id, duplicate.id, canonical.id
FROM public.nomina_periodos duplicate
JOIN tmp_nomina_periodos_canonicos canonical
  ON canonical.contrato_id = duplicate.contrato_id
 AND canonical.nombre_periodo = duplicate.nombre_periodo
 AND canonical.id <> duplicate.id
WHERE duplicate.activo IS DISTINCT FROM false
ON CONFLICT DO NOTHING;

UPDATE public.nomina_periodos duplicate
SET activo = FALSE
FROM tmp_nomina_periodos_canonicos canonical
WHERE duplicate.activo IS DISTINCT FROM false
  AND canonical.contrato_id = duplicate.contrato_id
  AND canonical.nombre_periodo = duplicate.nombre_periodo
  AND canonical.id <> duplicate.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_periodos_mensuales_26_25
  ON public.nomina_periodos (contrato_id, fecha_inicio, fecha_fin, tipo_periodo)
  WHERE activo IS DISTINCT FROM false;

COMMIT;
