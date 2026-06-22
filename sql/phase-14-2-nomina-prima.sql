CREATE TABLE IF NOT EXISTS nomina_prima (
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
  valor_prima NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nomina_prima_estado_check CHECK (estado IN ('PENDIENTE', 'LIQUIDADA', 'PAGADA', 'ANULADA')),
  CONSTRAINT nomina_prima_dias_check CHECK (dias_liquidados >= 0 AND dias_liquidados <= 360),
  CONSTRAINT nomina_prima_salario_check CHECK (salario_base >= 0),
  CONSTRAINT nomina_prima_auxilio_check CHECK (auxilio_transporte >= 0),
  CONSTRAINT nomina_prima_valor_check CHECK (valor_prima >= 0),
  CONSTRAINT nomina_prima_fechas_check CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT nomina_prima_pago_check CHECK (fecha_pago IS NULL OR fecha_pago >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_nomina_prima_empresa_contrato_activo
  ON nomina_prima (empresa_id, contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_prima_persona_activo
  ON nomina_prima (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_prima_vinculacion_activo
  ON nomina_prima (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_prima_estado_activo
  ON nomina_prima (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_prima_created_at
  ON nomina_prima (created_at DESC, id DESC);
