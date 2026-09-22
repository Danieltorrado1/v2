-- Estados y trazabilidad para la validación documental de novedades.
-- Idempotente. Los documentos existentes quedan pendientes de validación.

ALTER TABLE public.nomina_novedad_documentos
  ADD COLUMN IF NOT EXISTS estado_revision VARCHAR(32) NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  ADD COLUMN IF NOT EXISTS aprobado_por BIGINT NULL,
  ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rechazado_por BIGINT NULL,
  ADD COLUMN IF NOT EXISTS rechazado_en TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT NULL;

UPDATE public.nomina_novedad_documentos
SET estado_revision = 'PENDIENTE_VALIDACION'
WHERE estado_revision IS NULL OR BTRIM(estado_revision) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nomina_novedad_documentos_estado_revision_check'
  ) THEN
    ALTER TABLE public.nomina_novedad_documentos
      DROP CONSTRAINT nomina_novedad_documentos_estado_revision_check;
  END IF;

  ALTER TABLE public.nomina_novedad_documentos
    ADD CONSTRAINT nomina_novedad_documentos_estado_revision_check
    CHECK (estado_revision IN ('PENDIENTE_VALIDACION', 'APROBADO', 'RECHAZADO'));
END $$;

CREATE INDEX IF NOT EXISTS idx_nomina_novedad_documentos_revision
  ON public.nomina_novedad_documentos (nomina_novedad_id, tipo_relacion, activo, estado_revision);
