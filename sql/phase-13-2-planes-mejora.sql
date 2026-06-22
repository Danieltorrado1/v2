CREATE TABLE IF NOT EXISTS evaluaciones_planes_mejora (
  id BIGSERIAL PRIMARY KEY,
  evaluacion_persona_id BIGINT NOT NULL REFERENCES evaluaciones_persona(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT REFERENCES vinculaciones(id),
  objetivo TEXT NOT NULL,
  descripcion TEXT,
  responsable TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_compromiso DATE NOT NULL,
  fecha_cierre DATE,
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evaluaciones_planes_mejora_estado CHECK (
    estado IN ('ABIERTO', 'EN_PROCESO', 'CERRADO', 'VENCIDO', 'CANCELADO')
  ),
  CONSTRAINT chk_evaluaciones_planes_mejora_fechas CHECK (
    fecha_compromiso >= fecha_inicio
  )
);

CREATE TABLE IF NOT EXISTS evaluaciones_planes_mejora_seguimientos (
  id BIGSERIAL PRIMARY KEY,
  plan_mejora_id BIGINT NOT NULL REFERENCES evaluaciones_planes_mejora(id),
  fecha_seguimiento DATE NOT NULL,
  comentario TEXT NOT NULL,
  porcentaje_avance INTEGER NOT NULL DEFAULT 0,
  responsable TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evaluaciones_planes_mejora_seguimientos_porcentaje CHECK (
    porcentaje_avance BETWEEN 0 AND 100
  )
);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_planes_mejora_evaluacion_persona_estado_activo
  ON evaluaciones_planes_mejora (evaluacion_persona_id, estado, activo);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_planes_mejora_persona_estado_activo
  ON evaluaciones_planes_mejora (persona_id, estado, activo);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_planes_mejora_fecha_compromiso
  ON evaluaciones_planes_mejora (fecha_compromiso);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_planes_mejora_seguimientos_plan_activo_fecha
  ON evaluaciones_planes_mejora_seguimientos (plan_mejora_id, activo, fecha_seguimiento DESC);

CREATE INDEX IF NOT EXISTS idx_evaluaciones_planes_mejora_seguimientos_activo
  ON evaluaciones_planes_mejora_seguimientos (activo);
