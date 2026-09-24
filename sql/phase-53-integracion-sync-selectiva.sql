-- Fase 2: proyección selectiva de impactos hacia periodos abiertos.
-- Aplicar únicamente mediante el runner de release controlado, después de Phase 52.
BEGIN;

ALTER TABLE public.integracion_evento_impactos
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS version_esperada BIGINT NULL,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_estado;
ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_estado
  CHECK (estado IN ('PENDIENTE','APLICADO','SIN_CAMBIOS','BLOQUEADO_CIERRE','ERROR'));

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_attempts;

ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_attempts CHECK (attempts >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integracion_impacto_evento_vinculacion_periodo
  ON public.integracion_evento_impactos (evento_id, vinculacion_id, COALESCE(periodo_id, 0));

DO $$
BEGIN
  IF to_regclass('public.nomina_liquidaciones') IS NOT NULL THEN
    ALTER TABLE public.nomina_liquidaciones
      ADD COLUMN IF NOT EXISTS requiere_recalculo BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

COMMIT;

COMMENT ON COLUMN public.integracion_evento_impactos.version_esperada IS
  'Id del evento que produjo el impacto; evita aplicar una versión obsoleta.';
