-- Crea, solo cuando hay registros fechados en el siguiente corte, el período
-- mensual que falta y mueve esos registros por fecha efectiva.

BEGIN;

INSERT INTO public.nomina_periodos (
  contrato_id, nombre_periodo, fecha_inicio, fecha_fin, tipo_periodo,
  requiere_asistencia, estado, activo
)
SELECT DISTINCT source_period.contrato_id,
       'OCTUBRE 2026',
       DATE '2026-09-26',
       DATE '2026-10-25',
       'MENSUAL',
       COALESCE(source_period.requiere_asistencia, TRUE),
       'ABIERTO',
       TRUE
FROM public.nomina_periodos source_period
JOIN public.nomina_asistencia_diaria a ON a.periodo_id = source_period.id
WHERE a.fecha BETWEEN DATE '2026-09-26' AND DATE '2026-10-25'
  AND source_period.activo = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.nomina_periodos existing
    WHERE existing.contrato_id = source_period.contrato_id
      AND existing.fecha_inicio = DATE '2026-09-26'
      AND existing.fecha_fin = DATE '2026-10-25'
      AND existing.tipo_periodo = 'MENSUAL'
      AND existing.activo = TRUE
  );

WITH cambios AS (
  SELECT a.id, a.periodo_id AS anterior, target.id AS nuevo, a.fecha
  FROM public.nomina_asistencia_diaria a
  JOIN public.nomina_periodos target
    ON target.contrato_id = (SELECT contrato_id FROM public.nomina_periodos WHERE id = a.periodo_id)
   AND target.fecha_inicio = DATE '2026-09-26'
   AND target.fecha_fin = DATE '2026-10-25'
   AND target.tipo_periodo = 'MENSUAL'
   AND target.activo = TRUE
  WHERE a.fecha BETWEEN target.fecha_inicio AND target.fecha_fin
    AND a.periodo_id <> target.id
)
INSERT INTO public.nomina_periodo_26_25_auditoria (entidad, registro_id, periodo_anterior_id, periodo_nuevo_id, fecha_efectiva)
SELECT 'nomina_asistencia_diaria', id, anterior, nuevo, fecha FROM cambios
ON CONFLICT DO NOTHING;
UPDATE public.nomina_asistencia_diaria a
SET periodo_id = target.id
FROM public.nomina_periodos source_period
JOIN public.nomina_periodos target
  ON target.contrato_id = source_period.contrato_id
 AND target.fecha_inicio = DATE '2026-09-26'
 AND target.fecha_fin = DATE '2026-10-25'
 AND target.tipo_periodo = 'MENSUAL'
 AND target.activo = TRUE
WHERE a.periodo_id = source_period.id
  AND source_period.activo = TRUE
  AND a.fecha BETWEEN target.fecha_inicio AND target.fecha_fin;

COMMIT;
