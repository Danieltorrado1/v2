BEGIN;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS manipulacion_modalidad text
  CHECK (manipulacion_modalidad IN ('COMBINADO','SEPARADO'));
ALTER TABLE vinculaciones ADD COLUMN IF NOT EXISTS manipulacion_modalidad text
  CHECK (manipulacion_modalidad IN ('COMBINADO','SEPARADO'));
-- NULL preserves legacy inference. No files, reviews or versions are rewritten.
COMMIT;
