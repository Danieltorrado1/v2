ALTER TABLE importacion_lotes
  ADD COLUMN IF NOT EXISTS contrato_id BIGINT NULL REFERENCES contratos(id),
  ADD COLUMN IF NOT EXISTS empresa_id BIGINT NULL REFERENCES empresas(id),
  ADD COLUMN IF NOT EXISTS archivo_mime_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS archivo_sha256 TEXT NULL,
  ADD COLUMN IF NOT EXISTS archivo_bytes BYTEA NULL;

ALTER TABLE importacion_staging_personas
  ADD COLUMN IF NOT EXISTS payload_resuelto JSONB NULL,
  ADD COLUMN IF NOT EXISTS resultado_estado TEXT NULL,
  ADD COLUMN IF NOT EXISTS resultado_mensaje TEXT NULL,
  ADD COLUMN IF NOT EXISTS persona_existente_id BIGINT NULL REFERENCES personas(id),
  ADD COLUMN IF NOT EXISTS identificacion_vigente_id BIGINT NULL REFERENCES persona_identificaciones(id),
  ADD COLUMN IF NOT EXISTS estado_final TEXT NULL,
  ADD COLUMN IF NOT EXISTS mensaje_final TEXT NULL;

ALTER TABLE importacion_staging_vinculaciones
  ADD COLUMN IF NOT EXISTS tipo_vinculacion_id BIGINT NULL REFERENCES tipos_vinculacion(id),
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT NULL,
  ADD COLUMN IF NOT EXISTS payload_resuelto JSONB NULL,
  ADD COLUMN IF NOT EXISTS resultado_estado TEXT NULL,
  ADD COLUMN IF NOT EXISTS resultado_mensaje TEXT NULL,
  ADD COLUMN IF NOT EXISTS vinculacion_existente_id BIGINT NULL REFERENCES vinculaciones(id),
  ADD COLUMN IF NOT EXISTS estado_final TEXT NULL,
  ADD COLUMN IF NOT EXISTS mensaje_final TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_importacion_staging_personas_lote_resultado
  ON importacion_staging_personas (lote_id, fila_numero, resultado_estado);

CREATE INDEX IF NOT EXISTS idx_importacion_staging_vinculaciones_lote_resultado
  ON importacion_staging_vinculaciones (lote_id, fila_numero, resultado_estado);
