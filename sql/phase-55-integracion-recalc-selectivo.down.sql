-- Rollback destructivo e idempotente. No elimina Phase 52, 53 ni 54.
-- Requiere aprobación expresa; nunca se ejecuta automáticamente en producción.
BEGIN;
DROP INDEX IF EXISTS public.idx_integracion_impactos_recalc;
ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_recalc_estado,
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_recalc_attempts;
ALTER TABLE public.integracion_evento_impactos
  DROP COLUMN IF EXISTS recalc_after,
  DROP COLUMN IF EXISTS recalc_before,
  DROP COLUMN IF EXISTS recalc_last_error_message,
  DROP COLUMN IF EXISTS recalc_last_error_code,
  DROP COLUMN IF EXISTS recalc_completed_at,
  DROP COLUMN IF EXISTS recalc_started_at,
  DROP COLUMN IF EXISTS recalc_version_esperada,
  DROP COLUMN IF EXISTS recalc_attempts,
  DROP COLUMN IF EXISTS recalc_estado;

COMMIT;
