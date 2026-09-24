-- Rollback destructivo: requiere aprobación expresa y ejecución controlada.
BEGIN;
DROP INDEX IF EXISTS public.uq_integracion_impacto_evento_vinculacion_periodo;
ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_estado,
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_attempts,
  DROP COLUMN IF EXISTS estado,
  DROP COLUMN IF EXISTS version_esperada,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS applied_at,
  DROP COLUMN IF EXISTS last_error_code,
  DROP COLUMN IF EXISTS last_error_message,
  DROP COLUMN IF EXISTS updated_at;

DO $$
BEGIN
  IF to_regclass('public.nomina_liquidaciones') IS NOT NULL THEN
    ALTER TABLE public.nomina_liquidaciones DROP COLUMN IF EXISTS requiere_recalculo;
  END IF;
END $$;

COMMIT;
