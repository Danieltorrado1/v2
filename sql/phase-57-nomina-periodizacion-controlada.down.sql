-- Down manual solamente con aprobacion expresa y respaldo.
BEGIN;
DROP TRIGGER IF EXISTS trg_nomina_periodo_anulacion ON public.nomina_periodos;
DROP FUNCTION IF EXISTS public.validate_nomina_periodo_anulacion();
ALTER TABLE public.integracion_evento_impactos DROP CONSTRAINT IF EXISTS fk_integracion_impacto_superseded_by;
DROP INDEX IF EXISTS public.idx_integracion_impactos_superseded;
ALTER TABLE public.integracion_evento_impactos DROP COLUMN IF EXISTS superseded_by_impact_id, DROP COLUMN IF EXISTS superseded_at, DROP COLUMN IF EXISTS superseded_reason;
DROP TABLE IF EXISTS public.nomina_calendarios_contractuales;
ALTER TABLE public.nomina_periodos DROP CONSTRAINT IF EXISTS chk_nomina_periodo_anulacion_phase57, DROP CONSTRAINT IF EXISTS chk_nomina_periodo_estado_phase57, DROP CONSTRAINT IF EXISTS fk_nomina_periodo_canonico, DROP CONSTRAINT IF EXISTS fk_nomina_periodo_anulado_por;
ALTER TABLE public.nomina_periodos DROP COLUMN IF EXISTS anulado_at, DROP COLUMN IF EXISTS anulado_por, DROP COLUMN IF EXISTS motivo_anulacion, DROP COLUMN IF EXISTS periodo_canonico_id;
COMMIT;
