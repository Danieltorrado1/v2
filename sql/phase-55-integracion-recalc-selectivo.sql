-- Fase 4: estado durable del recálculo selectivo por impacto.
-- Idempotente y exclusivamente local durante la validación de integración.
ALTER TABLE public.integracion_evento_impactos
  ADD COLUMN IF NOT EXISTS recalc_estado TEXT NOT NULL DEFAULT 'SIN_CAMBIOS',
  ADD COLUMN IF NOT EXISTS recalc_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recalc_version_esperada BIGINT NULL,
  ADD COLUMN IF NOT EXISTS recalc_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS recalc_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS recalc_last_error_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS recalc_last_error_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS recalc_before JSONB NULL,
  ADD COLUMN IF NOT EXISTS recalc_after JSONB NULL;

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_recalc_estado;
ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_recalc_estado
  CHECK (recalc_estado IN ('PENDIENTE','PROCESANDO','RECALCULADA','SIN_CAMBIOS','BLOQUEADA_CIERRE','BLOQUEADA_FINALIZADA','VERSION_DESACTUALIZADA','ERROR'));

CREATE INDEX IF NOT EXISTS idx_integracion_impactos_recalc
  ON public.integracion_evento_impactos (recalc_estado, periodo_id, vinculacion_id);

COMMENT ON COLUMN public.integracion_evento_impactos.recalc_estado IS
  'Estado del recálculo financiero selectivo; no implica recálculo si la bandera o sus dependencias están inactivas.';
