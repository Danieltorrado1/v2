CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE personas
  ADD COLUMN IF NOT EXISTS identificador_interno UUID;

UPDATE personas
SET identificador_interno = gen_random_uuid()
WHERE identificador_interno IS NULL;

ALTER TABLE personas
  ALTER COLUMN identificador_interno SET DEFAULT gen_random_uuid();

ALTER TABLE personas
  ALTER COLUMN identificador_interno SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_identificador_interno
  ON personas (identificador_interno);

CREATE OR REPLACE FUNCTION personas_prevent_identificador_interno_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.identificador_interno IS DISTINCT FROM OLD.identificador_interno THEN
    RAISE EXCEPTION 'identificador_interno is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personas_prevent_identificador_interno_update ON personas;

CREATE TRIGGER trg_personas_prevent_identificador_interno_update
  BEFORE UPDATE OF identificador_interno ON personas
  FOR EACH ROW
  EXECUTE FUNCTION personas_prevent_identificador_interno_update();

CREATE TABLE IF NOT EXISTS persona_identificaciones (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  tipo_documento_id BIGINT NOT NULL REFERENCES tipos_documentos(id),
  numero_documento TEXT NOT NULL,
  fecha_expedicion_documento DATE,
  municipio_expedicion_id BIGINT REFERENCES municipios(id),
  es_vigente BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_cambio TEXT NOT NULL,
  registrado_por_usuario_id BIGINT REFERENCES usuarios(id),
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigente_hasta TIMESTAMPTZ,
  reemplaza_identificacion_id BIGINT REFERENCES persona_identificaciones(id),
  CONSTRAINT chk_persona_identificaciones_vigencia CHECK (
    (es_vigente = TRUE AND vigente_hasta IS NULL)
    OR (es_vigente = FALSE)
  )
);

CREATE INDEX IF NOT EXISTS idx_persona_identificaciones_persona_id
  ON persona_identificaciones (persona_id);

CREATE INDEX IF NOT EXISTS idx_persona_identificaciones_registrado_por_usuario_id
  ON persona_identificaciones (registrado_por_usuario_id);

CREATE INDEX IF NOT EXISTS idx_persona_identificaciones_tipo_documento_id
  ON persona_identificaciones (tipo_documento_id);

CREATE INDEX IF NOT EXISTS idx_persona_identificaciones_vigente_desde
  ON persona_identificaciones (vigente_desde DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_identificaciones_persona_vigente
  ON persona_identificaciones (persona_id)
  WHERE es_vigente = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_identificaciones_documento_vigente
  ON persona_identificaciones (numero_documento)
  WHERE es_vigente = TRUE;

INSERT INTO persona_identificaciones (
  persona_id,
  tipo_documento_id,
  numero_documento,
  fecha_expedicion_documento,
  municipio_expedicion_id,
  es_vigente,
  motivo_cambio,
  registrado_por_usuario_id,
  registrado_en,
  vigente_desde,
  vigente_hasta,
  reemplaza_identificacion_id
)
SELECT
  p.id,
  p.tipo_documento_id,
  p.numero_documento,
  p.fecha_expedicion_documento,
  p.municipio_expedicion_id,
  TRUE,
  'MIGRACION_INICIAL',
  NULL,
  NOW(),
  NOW(),
  NULL,
  NULL
FROM personas p
WHERE p.tipo_documento_id IS NOT NULL
  AND p.numero_documento IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM persona_identificaciones pi
    WHERE pi.persona_id = p.id
  );
