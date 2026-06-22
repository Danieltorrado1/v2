CREATE TABLE IF NOT EXISTS nomina_vacaciones (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  fecha_inicio_causacion DATE NOT NULL,
  fecha_fin_causacion DATE NOT NULL,
  dias_causados NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_disfrutados NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_pagados NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_pendientes NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nomina_vacaciones_estado_check CHECK (estado IN ('ABIERTO', 'CERRADO', 'ANULADO')),
  CONSTRAINT nomina_vacaciones_dias_causados_check CHECK (dias_causados >= 0),
  CONSTRAINT nomina_vacaciones_dias_disfrutados_check CHECK (dias_disfrutados >= 0),
  CONSTRAINT nomina_vacaciones_dias_pagados_check CHECK (dias_pagados >= 0),
  CONSTRAINT nomina_vacaciones_dias_pendientes_check CHECK (dias_pendientes >= 0),
  CONSTRAINT nomina_vacaciones_fechas_check CHECK (fecha_fin_causacion >= fecha_inicio_causacion)
);

CREATE TABLE IF NOT EXISTS nomina_vacaciones_solicitudes (
  id BIGSERIAL PRIMARY KEY,
  vacacion_id BIGINT NOT NULL REFERENCES nomina_vacaciones(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_solicitados NUMERIC(10,2) NOT NULL,
  dias_habiles NUMERIC(10,2),
  dias_calendario NUMERIC(10,2),
  tipo_vacacion TEXT NOT NULL DEFAULT 'DISFRUTADA',
  estado TEXT NOT NULL DEFAULT 'SOLICITADA',
  aprobado_por TEXT,
  fecha_aprobacion DATE,
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nomina_vacaciones_solicitudes_tipo_check CHECK (tipo_vacacion IN ('DISFRUTADA', 'PAGADA', 'COMPENSADA')),
  CONSTRAINT nomina_vacaciones_solicitudes_estado_check CHECK (estado IN ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'DISFRUTADA', 'PAGADA', 'ANULADA')),
  CONSTRAINT nomina_vacaciones_solicitudes_dias_check CHECK (dias_solicitados > 0),
  CONSTRAINT nomina_vacaciones_solicitudes_dias_habiles_check CHECK (dias_habiles IS NULL OR dias_habiles >= 0),
  CONSTRAINT nomina_vacaciones_solicitudes_dias_calendario_check CHECK (dias_calendario IS NULL OR dias_calendario >= 0),
  CONSTRAINT nomina_vacaciones_solicitudes_fechas_check CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT nomina_vacaciones_solicitudes_aprobacion_check CHECK (fecha_aprobacion IS NULL OR fecha_aprobacion >= fecha_solicitud)
);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_empresa_contrato_activo
  ON nomina_vacaciones (empresa_id, contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_persona_activo
  ON nomina_vacaciones (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_vinculacion_activo
  ON nomina_vacaciones (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_estado_activo
  ON nomina_vacaciones (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_solicitudes_vacacion_estado_activo
  ON nomina_vacaciones_solicitudes (vacacion_id, estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_solicitudes_persona_activo
  ON nomina_vacaciones_solicitudes (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_solicitudes_vinculacion_activo
  ON nomina_vacaciones_solicitudes (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_vacaciones_solicitudes_created_at
  ON nomina_vacaciones_solicitudes (created_at DESC, id DESC);
