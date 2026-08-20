CREATE TABLE IF NOT EXISTS importacion_lotes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION',
  total_filas INTEGER NOT NULL DEFAULT 0,
  filas_validas INTEGER NOT NULL DEFAULT 0,
  filas_con_error INTEGER NOT NULL DEFAULT 0,
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT NOT NULL REFERENCES usuarios(id),
  confirmed_by BIGINT NULL REFERENCES usuarios(id),
  cancelado_por BIGINT NULL REFERENCES usuarios(id),
  contrato_id BIGINT NULL REFERENCES contratos(id),
  empresa_id BIGINT NULL REFERENCES empresas(id),
  archivo_mime_type TEXT NULL,
  archivo_sha256 TEXT NULL,
  archivo_bytes BYTEA NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ NULL,
  cancelado_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS importacion_staging_personas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id BIGINT NOT NULL REFERENCES importacion_lotes(id) ON DELETE CASCADE,
  fila_numero INTEGER NOT NULL,
  numero_documento TEXT NOT NULL DEFAULT '',
  tipo_documento_id BIGINT NULL REFERENCES tipos_documentos(id),
  primer_nombre TEXT NOT NULL DEFAULT '',
  segundo_nombre TEXT NULL,
  primer_apellido TEXT NOT NULL DEFAULT '',
  segundo_apellido TEXT NULL,
  fecha_nacimiento DATE NULL,
  fecha_expedicion_documento DATE NULL,
  municipio_nacimiento_id BIGINT NULL,
  municipio_expedicion_id BIGINT NULL,
  municipio_residencia_id BIGINT NULL,
  sexo_id BIGINT NULL,
  estado_civil_id BIGINT NULL,
  tipo_sangre_id BIGINT NULL,
  estatura NUMERIC NULL,
  telefono TEXT NULL,
  correo TEXT NULL,
  direccion TEXT NULL,
  barrio TEXT NULL,
  zona_id BIGINT NULL,
  activo BOOLEAN NULL,
  data_cruda JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado_validacion TEXT NOT NULL DEFAULT 'PENDIENTE',
  procesado BOOLEAN NOT NULL DEFAULT FALSE,
  persona_id BIGINT NULL REFERENCES personas(id),
  payload_resuelto JSONB NULL,
  resultado_estado TEXT NULL,
  resultado_mensaje TEXT NULL,
  persona_existente_id BIGINT NULL REFERENCES personas(id),
  identificacion_vigente_id BIGINT NULL REFERENCES persona_identificaciones(id),
  estado_final TEXT NULL,
  mensaje_final TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lote_id, fila_numero)
);

CREATE TABLE IF NOT EXISTS importacion_staging_vinculaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id BIGINT NOT NULL REFERENCES importacion_lotes(id) ON DELETE CASCADE,
  fila_numero INTEGER NOT NULL,
  numero_documento TEXT NOT NULL DEFAULT '',
  empresa_id BIGINT NULL REFERENCES empresas(id),
  contrato_id BIGINT NULL REFERENCES contratos(id),
  contrato_cargo_id BIGINT NULL REFERENCES contrato_cargos(id),
  tipo_vinculacion_id BIGINT NULL REFERENCES tipos_vinculacion(id),
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  estado TEXT NULL,
  metodo_pago TEXT NULL,
  observaciones TEXT NULL,
  data_cruda JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado_validacion TEXT NOT NULL DEFAULT 'PENDIENTE',
  procesado BOOLEAN NOT NULL DEFAULT FALSE,
  persona_id BIGINT NULL REFERENCES personas(id),
  vinculacion_id BIGINT NULL REFERENCES vinculaciones(id),
  payload_resuelto JSONB NULL,
  resultado_estado TEXT NULL,
  resultado_mensaje TEXT NULL,
  vinculacion_existente_id BIGINT NULL REFERENCES vinculaciones(id),
  estado_final TEXT NULL,
  mensaje_final TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lote_id, fila_numero)
);

CREATE TABLE IF NOT EXISTS importacion_errores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id BIGINT NOT NULL REFERENCES importacion_lotes(id) ON DELETE CASCADE,
  fila_numero INTEGER NOT NULL,
  staging_tipo TEXT NOT NULL,
  staging_id BIGINT NULL,
  campo TEXT NOT NULL,
  codigo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  data_cruda JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_importacion_lotes_contrato_estado
  ON importacion_lotes (contrato_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_importacion_staging_personas_lote
  ON importacion_staging_personas (lote_id, fila_numero);

CREATE INDEX IF NOT EXISTS idx_importacion_staging_vinculaciones_lote
  ON importacion_staging_vinculaciones (lote_id, fila_numero);

CREATE INDEX IF NOT EXISTS idx_importacion_errores_lote
  ON importacion_errores (lote_id, fila_numero, created_at);
