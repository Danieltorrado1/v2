CREATE TABLE IF NOT EXISTS sst_capacitaciones (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  nombre_capacitacion TEXT NOT NULL,
  tema TEXT,
  categoria TEXT NOT NULL DEFAULT 'GENERAL',
  obligatoria BOOLEAN NOT NULL DEFAULT TRUE,
  vigencia_meses INTEGER,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sst_capacitaciones_persona (
  id BIGSERIAL PRIMARY KEY,
  capacitacion_id BIGINT NOT NULL REFERENCES sst_capacitaciones(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT REFERENCES vinculaciones(id),
  fecha_capacitacion DATE NOT NULL,
  fecha_vencimiento DATE,
  aprobado BOOLEAN NOT NULL DEFAULT TRUE,
  calificacion NUMERIC(5,2),
  documento_persona_id BIGINT REFERENCES documentos_persona(id),
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_empresa_id
  ON sst_capacitaciones (empresa_id);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_contrato_id
  ON sst_capacitaciones (contrato_id);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_categoria
  ON sst_capacitaciones (categoria);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_activo
  ON sst_capacitaciones (activo);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_persona_capacitacion_id
  ON sst_capacitaciones_persona (capacitacion_id);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_persona_persona_id
  ON sst_capacitaciones_persona (persona_id);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_persona_vinculacion_id
  ON sst_capacitaciones_persona (vinculacion_id);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_persona_fecha_vencimiento
  ON sst_capacitaciones_persona (fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_sst_capacitaciones_persona_activo
  ON sst_capacitaciones_persona (activo);
