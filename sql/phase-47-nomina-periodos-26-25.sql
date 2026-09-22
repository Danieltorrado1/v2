-- Normaliza períodos mensuales al corte 26 del mes anterior -> 25 del mes de cierre.
-- Idempotente: solo modifica fechas que todavía no están normalizadas y filas cuyo
-- periodo_id realmente difiere del período que contiene su fecha efectiva.
-- Las cuentas de cobro conservan su snapshot histórico y no se reescriben aquí.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nomina_periodo_26_25_auditoria (
  id BIGSERIAL PRIMARY KEY,
  entidad TEXT NOT NULL,
  registro_id BIGINT NOT NULL,
  periodo_anterior_id BIGINT NOT NULL,
  periodo_nuevo_id BIGINT NOT NULL,
  fecha_efectiva DATE NULL,
  ejecutado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entidad, registro_id, periodo_nuevo_id)
);

CREATE TEMP TABLE tmp_nomina_periodos_26_25 ON COMMIT DROP AS
WITH catalogo AS (
  SELECT * FROM (VALUES
    ('ENERO', 1), ('FEBRERO', 2), ('MARZO', 3), ('ABRIL', 4),
    ('MAYO', 5), ('JUNIO', 6), ('JULIO', 7), ('AGOSTO', 8),
    ('SEPTIEMBRE', 9), ('OCTUBRE', 10), ('NOVIEMBRE', 11), ('DICIEMBRE', 12)
  ) AS value(nombre, mes)
), identificados AS (
  SELECT
    np.id,
    np.contrato_id,
    np.nombre_periodo,
    c.mes,
    substring(upper(trim(np.nombre_periodo)) FROM '[0-9]{4}$')::integer AS anio
  FROM public.nomina_periodos np
  JOIN catalogo c
    ON upper(trim(np.nombre_periodo)) ~ ('^' || c.nombre || ' [0-9]{4}$')
  WHERE np.activo IS DISTINCT FROM false
), calculados AS (
  SELECT
    id,
    contrato_id,
    nombre_periodo,
    make_date(anio, mes, 25) AS fecha_fin_nueva,
    (make_date(anio, mes, 25) - interval '1 month' + interval '1 day')::date AS fecha_inicio_nueva
  FROM identificados
)
SELECT * FROM calculados;

UPDATE public.nomina_periodos np
SET fecha_inicio = t.fecha_inicio_nueva,
    fecha_fin = t.fecha_fin_nueva
FROM tmp_nomina_periodos_26_25 t
WHERE np.id = t.id
  AND (np.fecha_inicio, np.fecha_fin) IS DISTINCT FROM (t.fecha_inicio_nueva, t.fecha_fin_nueva);

-- Evita fusionar silenciosamente dos registros operativos para la misma fecha.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.nomina_asistencia_diaria source
    JOIN tmp_nomina_periodos_26_25 target_period
      ON target_period.id = source.periodo_id
    JOIN public.nomina_periodos destination
      ON destination.contrato_id = target_period.contrato_id
     AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
     AND destination.id <> source.periodo_id
    JOIN public.nomina_asistencia_diaria existing
      ON existing.periodo_id = destination.id
     AND existing.vinculacion_id = source.vinculacion_id
     AND existing.fecha = source.fecha
     AND existing.id <> source.id
  ) THEN
    RAISE EXCEPTION 'Conflicto al reasignar nomina_asistencia_diaria al calendario 26-25';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.nomina_movimientos source
    JOIN tmp_nomina_periodos_26_25 source_period ON source_period.id = source.periodo_id
    JOIN public.nomina_periodos destination
      ON destination.contrato_id = source_period.contrato_id
     AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
     AND destination.id <> source.periodo_id
    JOIN public.nomina_movimientos existing
      ON existing.periodo_id = destination.id
     AND existing.nomina_empleado_id = source.nomina_empleado_id
     AND existing.fecha = source.fecha
     AND existing.id <> source.id
     AND existing.activo IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'Conflicto al reasignar nomina_movimientos al calendario 26-25';
  END IF;
END $$;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, destination.id AS nuevo, source.fecha
  FROM public.nomina_asistencia_diaria source
  JOIN tmp_nomina_periodos_26_25 source_period ON source_period.id = source.periodo_id
  JOIN public.nomina_periodos destination
    ON destination.contrato_id = source_period.contrato_id
   AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_asistencia_diaria', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_asistencia_diaria source
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_asistencia_diaria' AND audit.registro_id = source.id;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, destination.id AS nuevo, COALESCE(source.fecha_inicio, source.fecha_fin) AS fecha
  FROM public.nomina_novedades source
  JOIN tmp_nomina_periodos_26_25 source_period ON source_period.id = source.periodo_id
  JOIN public.nomina_periodos destination
    ON destination.contrato_id = source_period.contrato_id
   AND COALESCE(source.fecha_inicio, source.fecha_fin) BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_novedades', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_novedades source
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_novedades' AND audit.registro_id = source.id;

WITH cambios AS (
  SELECT source.id, source.periodo_id AS anterior, destination.id AS nuevo, source.fecha
  FROM public.nomina_movimientos source
  JOIN tmp_nomina_periodos_26_25 source_period ON source_period.id = source.periodo_id
  JOIN public.nomina_periodos destination
    ON destination.contrato_id = source_period.contrato_id
   AND source.fecha BETWEEN destination.fecha_inicio AND destination.fecha_fin
   AND destination.id <> source.periodo_id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_movimientos', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_movimientos source
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_movimientos' AND audit.registro_id = source.id;

-- Los turnos operativos heredan el período de su novedad/movimiento efectivo.
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
SET periodo_id = audit.periodo_nuevo_id
FROM public.nomina_periodo_26_25_auditoria audit
WHERE audit.entidad = 'nomina_novedad_turnos' AND audit.registro_id = source.id;

COMMIT;
