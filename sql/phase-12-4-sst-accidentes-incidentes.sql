CREATE TABLE IF NOT EXISTS sst_accidentes_incidentes (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT REFERENCES vinculaciones(id),
  tipo_evento TEXT NOT NULL,
  fecha_evento DATE NOT NULL,
  hora_evento TIME,
  lugar_evento TEXT,
  descripcion TEXT NOT NULL,
  lesionado BOOLEAN NOT NULL DEFAULT FALSE,
  tipo_lesion TEXT,
  parte_cuerpo TEXT,
  dias_incapacidad INTEGER DEFAULT 0,
  requiere_investigacion BOOLEAN DEFAULT TRUE,
  severidad TEXT NOT NULL DEFAULT 'LEVE',
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_accidentes_incidentes_tipo_evento CHECK (
    tipo_evento IN ('ACCIDENTE_TRABAJO', 'INCIDENTE', 'CASI_ACCIDENTE')
  ),
  CONSTRAINT chk_sst_accidentes_incidentes_severidad CHECK (
    severidad IN ('LEVE', 'MODERADO', 'GRAVE', 'MORTAL')
  ),
  CONSTRAINT chk_sst_accidentes_incidentes_estado CHECK (
    estado IN ('ABIERTO', 'EN_INVESTIGACION', 'CERRADO')
  ),
  CONSTRAINT chk_sst_accidentes_incidentes_dias_incapacidad CHECK (
    dias_incapacidad IS NULL OR dias_incapacidad >= 0
  )
);

CREATE TABLE IF NOT EXISTS sst_accidentes_acciones (
  id BIGSERIAL PRIMARY KEY,
  accidente_id BIGINT NOT NULL REFERENCES sst_accidentes_incidentes(id),
  descripcion TEXT NOT NULL,
  responsable TEXT,
  fecha_compromiso DATE,
  fecha_cierre DATE,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_sst_accidentes_acciones_estado CHECK (
    estado IN ('ABIERTA', 'EN_PROCESO', 'CERRADA')
  ),
  CONSTRAINT chk_sst_accidentes_acciones_fechas CHECK (
    fecha_cierre IS NULL OR fecha_compromiso IS NULL OR fecha_cierre >= fecha_compromiso
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_empresa_id
  ON sst_accidentes_incidentes (empresa_id);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_contrato_id
  ON sst_accidentes_incidentes (contrato_id);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_persona_id
  ON sst_accidentes_incidentes (persona_id);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_vinculacion_id
  ON sst_accidentes_incidentes (vinculacion_id);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_tipo_evento
  ON sst_accidentes_incidentes (tipo_evento);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_estado
  ON sst_accidentes_incidentes (estado);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_severidad
  ON sst_accidentes_incidentes (severidad);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_fecha_evento
  ON sst_accidentes_incidentes (fecha_evento);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_incidentes_activo
  ON sst_accidentes_incidentes (activo);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_acciones_accidente_id
  ON sst_accidentes_acciones (accidente_id);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_acciones_estado
  ON sst_accidentes_acciones (estado);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_acciones_fecha_compromiso
  ON sst_accidentes_acciones (fecha_compromiso);

CREATE INDEX IF NOT EXISTS idx_sst_accidentes_acciones_activo
  ON sst_accidentes_acciones (activo);
