ALTER TABLE public.nomina_desprendibles
DROP CONSTRAINT IF EXISTS nomina_desprendibles_periodo_id_nomina_empleado_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_desprendibles_vigente
ON public.nomina_desprendibles (periodo_id, nomina_empleado_id)
WHERE COALESCE(es_vigente, TRUE) = TRUE
  AND COALESCE(activo, TRUE) = TRUE;
