CREATE TABLE IF NOT EXISTS sst_examenes_ocupacionales (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  nombre_examen TEXT NOT NULL,
  tipo_examen TEXT NOT NULL,
  descripcion TEXT,
  obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  vigencia_meses INTEGER,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_examenes_ocupacionales_tipo_examen CHECK (
    tipo_examen IN (
      'INGRESO',
      'PERIODICO',
      'RETIRO',
      'POST_INCAPACIDAD',
      'CAMBIO_OCUPACIONAL',
      'MANIPULACION_ALIMENTOS',
      'OTRO'
    )
  ),
  CONSTRAINT chk_sst_examenes_ocupacionales_vigencia CHECK (
    vigencia_meses IS NULL OR vigencia_meses > 0
  )
);

CREATE TABLE IF NOT EXISTS sst_examenes_persona (
  id BIGSERIAL PRIMARY KEY,
  examen_id BIGINT NOT NULL REFERENCES sst_examenes_ocupacionales(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT REFERENCES vinculaciones(id),
  fecha_examen DATE NOT NULL,
  fecha_vencimiento DATE,
  concepto_medico TEXT NOT NULL DEFAULT 'APTO',
  restricciones TEXT,
  documento_persona_id BIGINT REFERENCES documentos_persona(id),
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_examenes_persona_concepto_medico CHECK (
    concepto_medico IN ('APTO', 'APTO_CON_RESTRICCIONES', 'NO_APTO', 'PENDIENTE')
  ),
  CONSTRAINT chk_sst_examenes_persona_fechas CHECK (
    fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_examen
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_ocupacionales_empresa_id
  ON sst_examenes_ocupacionales (empresa_id);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_ocupacionales_contrato_id
  ON sst_examenes_ocupacionales (contrato_id);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_ocupacionales_tipo_examen
  ON sst_examenes_ocupacionales (tipo_examen);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_ocupacionales_obligatorio
  ON sst_examenes_ocupacionales (obligatorio);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_ocupacionales_activo
  ON sst_examenes_ocupacionales (activo);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_persona_examen_id
  ON sst_examenes_persona (examen_id);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_persona_persona_id
  ON sst_examenes_persona (persona_id);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_persona_vinculacion_id
  ON sst_examenes_persona (vinculacion_id);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_persona_fecha_vencimiento
  ON sst_examenes_persona (fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_persona_concepto_medico
  ON sst_examenes_persona (concepto_medico);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_persona_activo
  ON sst_examenes_persona (activo);
