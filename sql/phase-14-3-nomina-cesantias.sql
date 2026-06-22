CREATE TABLE IF NOT EXISTS nomina_cesantias (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  periodo TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_liquidados NUMERIC(10,2) NOT NULL DEFAULT 0,
  salario_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  auxilio_transporte NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_cesantias NUMERIC(14,2) NOT NULL DEFAULT 0,
  fondo_cesantias TEXT,
  fecha_consignacion DATE,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nomina_cesantias_estado_check CHECK (
    estado IN ('PENDIENTE', 'LIQUIDADA', 'CONSIGNADA', 'PAGADA', 'ANULADA')
  ),
  CONSTRAINT nomina_cesantias_dias_check CHECK (dias_liquidados >= 0 AND dias_liquidados <= 360),
  CONSTRAINT nomina_cesantias_salario_check CHECK (salario_base >= 0),
  CONSTRAINT nomina_cesantias_auxilio_check CHECK (auxilio_transporte >= 0),
  CONSTRAINT nomina_cesantias_valor_check CHECK (valor_cesantias >= 0),
  CONSTRAINT nomina_cesantias_fechas_check CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT nomina_cesantias_consignacion_check CHECK (
    fecha_consignacion IS NULL OR fecha_consignacion >= fecha_inicio
  )
);

CREATE INDEX IF NOT EXISTS idx_nomina_cesantias_empresa_contrato_activo
  ON nomina_cesantias (empresa_id, contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cesantias_persona_activo
  ON nomina_cesantias (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cesantias_vinculacion_activo
  ON nomina_cesantias (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cesantias_estado_activo
  ON nomina_cesantias (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cesantias_created_at
  ON nomina_cesantias (created_at DESC, id DESC);
