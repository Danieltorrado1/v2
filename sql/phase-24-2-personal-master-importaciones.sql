CREATE TABLE IF NOT EXISTS importacion_staging_maestro (
  id BIGSERIAL PRIMARY KEY,
  lote_id BIGINT NOT NULL REFERENCES importacion_lotes(id) ON DELETE CASCADE,
  fila_numero INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('DATOS_PERSONALES', 'INFORMACION_BANCARIA')),
  identidad_tipo_documento TEXT NULL,
  identidad_numero_documento TEXT NULL,
  nombre_referencia TEXT NULL,
  data_cruda JSONB NOT NULL DEFAULT '{}'::jsonb,
  mapping_aplicado JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_normalizado JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_actual JSONB NULL,
  diff JSONB NOT NULL DEFAULT '[]'::jsonb,
  errores JSONB NOT NULL DEFAULT '[]'::jsonb,
  advertencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  clasificacion TEXT NOT NULL,
  requiere_accion BOOLEAN NOT NULL DEFAULT FALSE,
  procesado BOOLEAN NOT NULL DEFAULT FALSE,
  resultado_aplicacion TEXT NULL,
  mensaje_aplicacion TEXT NULL,
  entidad_id BIGINT NULL REFERENCES personas(id) ON DELETE SET NULL,
  referencia_secundaria_id BIGINT NULL REFERENCES persona_cuentas_bancarias(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lote_id, fila_numero)
);

CREATE INDEX IF NOT EXISTS idx_importacion_staging_maestro_lote
  ON importacion_staging_maestro (lote_id, fila_numero);

CREATE INDEX IF NOT EXISTS idx_importacion_staging_maestro_lote_clasificacion
  ON importacion_staging_maestro (lote_id, clasificacion, requiere_accion);
