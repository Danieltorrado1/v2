CREATE TABLE IF NOT EXISTS nomina_intereses_cesantias (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  cesantia_id BIGINT REFERENCES nomina_cesantias(id),
  periodo TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_liquidados NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_cesantias NUMERIC(14,2) NOT NULL DEFAULT 0,
  porcentaje_interes NUMERIC(5,2) NOT NULL DEFAULT 12,
  valor_intereses NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nomina_intereses_cesantias_estado_check CHECK (
    estado IN ('PENDIENTE', 'LIQUIDADO', 'PAGADO', 'ANULADO')
  ),
  CONSTRAINT nomina_intereses_cesantias_dias_check CHECK (dias_liquidados >= 0 AND dias_liquidados <= 360),
  CONSTRAINT nomina_intereses_cesantias_valor_cesantias_check CHECK (valor_cesantias >= 0),
  CONSTRAINT nomina_intereses_cesantias_porcentaje_check CHECK (porcentaje_interes >= 0 AND porcentaje_interes <= 100),
  CONSTRAINT nomina_intereses_cesantias_valor_intereses_check CHECK (valor_intereses >= 0),
  CONSTRAINT nomina_intereses_cesantias_fechas_check CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_nomina_intereses_cesantias_empresa_contrato_activo
  ON nomina_intereses_cesantias (empresa_id, contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_intereses_cesantias_persona_activo
  ON nomina_intereses_cesantias (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_intereses_cesantias_vinculacion_activo
  ON nomina_intereses_cesantias (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_intereses_cesantias_cesantia
  ON nomina_intereses_cesantias (cesantia_id);

CREATE INDEX IF NOT EXISTS idx_nomina_intereses_cesantias_estado_activo
  ON nomina_intereses_cesantias (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_intereses_cesantias_created_at
  ON nomina_intereses_cesantias (created_at DESC, id DESC);
