-- Aditiva e idempotente: revisión sobre las tablas documentales existentes.
-- No implica aprobación de archivos históricos sin evidencia de revisión.
BEGIN;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['documentos_persona','documentos_vinculacion'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS estado_revision text NOT NULL DEFAULT ''PENDIENTE_REVISION'', ADD COLUMN IF NOT EXISTS cargado_por bigint REFERENCES usuarios(id), ADD COLUMN IF NOT EXISTS revisado_por bigint REFERENCES usuarios(id), ADD COLUMN IF NOT EXISTS revisado_en timestamptz, ADD COLUMN IF NOT EXISTS motivo_rechazo text, ADD COLUMN IF NOT EXISTS metadatos_revision jsonb NOT NULL DEFAULT ''{}''::jsonb',t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=t||'_revision_estado_check' AND conrelid=to_regclass(t)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (estado_revision IN (''PENDIENTE_REVISION'',''APROBADO'',''RECHAZADO'') AND (estado_revision <> ''RECHAZADO'' OR (motivo_rechazo IS NOT NULL AND length(btrim(motivo_rechazo)) > 0)) AND (estado_revision = ''PENDIENTE_REVISION'' OR (revisado_por IS NOT NULL AND revisado_en IS NOT NULL)))',t,t||'_revision_estado_check');
    END IF;
  END LOOP;
END $$;
ALTER TABLE documentos_vinculacion
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS documento_reemplaza_id bigint REFERENCES documentos_vinculacion(id),
  ADD COLUMN IF NOT EXISTS es_vigente boolean NOT NULL DEFAULT true;
COMMIT;
