CREATE TABLE IF NOT EXISTS sst_inspecciones (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  nombre_inspeccion TEXT NOT NULL,
  tipo_inspeccion TEXT NOT NULL,
  fecha_programada DATE,
  fecha_realizada DATE,
  responsable TEXT,
  estado TEXT NOT NULL DEFAULT 'PROGRAMADA',
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_inspecciones_tipo CHECK (
    tipo_inspeccion IN (
      'LOCATIVA',
      'COCINA',
      'EPP',
      'EXTINTORES',
      'BOTIQUINES',
      'VEHICULOS',
      'ALMACENAMIENTO',
      'RIESGO_BIOLOGICO',
      'RIESGO_QUIMICO',
      'OTRO'
    )
  ),
  CONSTRAINT chk_sst_inspecciones_estado CHECK (
    estado IN ('PROGRAMADA', 'REALIZADA', 'CANCELADA', 'VENCIDA')
  )
);

CREATE TABLE IF NOT EXISTS sst_inspecciones_hallazgos (
  id BIGSERIAL PRIMARY KEY,
  inspeccion_id BIGINT NOT NULL REFERENCES sst_inspecciones(id),
  tipo_hallazgo TEXT NOT NULL DEFAULT 'CONDICION_INSEGURA',
  descripcion TEXT NOT NULL,
  nivel_riesgo TEXT NOT NULL DEFAULT 'BAJO',
  requiere_accion BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_inspecciones_hallazgos_tipo CHECK (
    tipo_hallazgo IN (
      'CONDICION_INSEGURA',
      'ACTO_INSEGURO',
      'NO_CONFORMIDAD',
      'OBSERVACION',
      'OPORTUNIDAD_MEJORA'
    )
  ),
  CONSTRAINT chk_sst_inspecciones_hallazgos_nivel CHECK (
    nivel_riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')
  )
);

CREATE TABLE IF NOT EXISTS sst_inspecciones_acciones (
  id BIGSERIAL PRIMARY KEY,
  hallazgo_id BIGINT NOT NULL REFERENCES sst_inspecciones_hallazgos(id),
  descripcion TEXT NOT NULL,
  responsable TEXT,
  fecha_compromiso DATE,
  fecha_cierre DATE,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_inspecciones_acciones_estado CHECK (
    estado IN ('ABIERTA', 'EN_PROCESO', 'CERRADA', 'VENCIDA')
  ),
  CONSTRAINT chk_sst_inspecciones_acciones_fechas CHECK (
    fecha_cierre IS NULL OR fecha_compromiso IS NULL OR fecha_cierre >= fecha_compromiso
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_inspecciones_empresa_contrato_tipo_estado_activo
  ON sst_inspecciones (empresa_id, contrato_id, tipo_inspeccion, estado, activo);

CREATE INDEX IF NOT EXISTS idx_sst_inspecciones_hallazgos_inspeccion_nivel_activo
  ON sst_inspecciones_hallazgos (inspeccion_id, nivel_riesgo, activo);

CREATE INDEX IF NOT EXISTS idx_sst_inspecciones_acciones_hallazgo_estado_compromiso_activo
  ON sst_inspecciones_acciones (hallazgo_id, estado, fecha_compromiso, activo);
