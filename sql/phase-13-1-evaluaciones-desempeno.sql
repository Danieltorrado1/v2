CREATE TABLE IF NOT EXISTS evaluaciones_desempeno (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  nombre_evaluacion TEXT NOT NULL,
  descripcion TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evaluaciones_desempeno_fechas CHECK (
    fecha_fin >= fecha_inicio
  )
);

CREATE TABLE IF NOT EXISTS evaluaciones_competencias (
  id BIGSERIAL PRIMARY KEY,
  evaluacion_id BIGINT NOT NULL REFERENCES evaluaciones_desempeno(id),
  nombre_competencia TEXT NOT NULL,
  descripcion TEXT,
  peso NUMERIC(5,2) NOT NULL DEFAULT 1,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evaluaciones_competencias_peso CHECK (peso > 0)
);

CREATE TABLE IF NOT EXISTS evaluaciones_persona (
  id BIGSERIAL PRIMARY KEY,
  evaluacion_id BIGINT NOT NULL REFERENCES evaluaciones_desempeno(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT REFERENCES vinculaciones(id),
  calificacion_total NUMERIC(5,2),
  fortalezas TEXT,
  oportunidades_mejora TEXT,
  plan_accion TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evaluaciones_persona_estado CHECK (
    estado IN ('PENDIENTE', 'EN_PROCESO', 'FINALIZADA')
  ),
  CONSTRAINT chk_evaluaciones_persona_calificacion CHECK (
    calificacion_total IS NULL OR calificacion_total BETWEEN 0 AND 5
  )
);

CREATE TABLE IF NOT EXISTS evaluaciones_respuestas (
  id BIGSERIAL PRIMARY KEY,
  evaluacion_persona_id BIGINT NOT NULL REFERENCES evaluaciones_persona(id),
  competencia_id BIGINT NOT NULL REFERENCES evaluaciones_competencias(id),
  calificacion NUMERIC(5,2) NOT NULL,
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evaluaciones_respuestas_calificacion CHECK (
    calificacion BETWEEN 1 AND 5
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_evaluaciones_competencias_evaluacion_nombre
  ON evaluaciones_competencias (evaluacion_id, nombre_competencia);

CREATE UNIQUE INDEX IF NOT EXISTS ux_evaluaciones_persona_evaluacion_persona
  ON evaluaciones_persona (evaluacion_id, persona_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_evaluaciones_respuestas_persona_competencia
  ON evaluaciones_respuestas (evaluacion_persona_id, competencia_id);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_desempeno_empresa_contrato_activo_fecha
  ON evaluaciones_desempeno (empresa_id, contrato_id, activo, fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_desempeno_activo_created_at
  ON evaluaciones_desempeno (activo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_competencias_evaluacion_activo
  ON evaluaciones_competencias (evaluacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_persona_evaluacion_estado_activo
  ON evaluaciones_persona (evaluacion_id, estado, activo);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_persona_persona_activo
  ON evaluaciones_persona (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_respuestas_persona_activo
  ON evaluaciones_respuestas (evaluacion_persona_id, activo);
