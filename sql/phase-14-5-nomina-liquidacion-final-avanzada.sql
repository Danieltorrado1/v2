CREATE TABLE IF NOT EXISTS nomina_liquidaciones_finales (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),

  fecha_inicio_vinculacion DATE NOT NULL,
  fecha_retiro DATE NOT NULL,
  motivo_retiro TEXT,

  dias_trabajados NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_pendientes_pago NUMERIC(10,2) NOT NULL DEFAULT 0,
  dias_vacaciones_pendientes NUMERIC(10,2) NOT NULL DEFAULT 0,

  salario_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  auxilio_transporte NUMERIC(14,2) NOT NULL DEFAULT 0,

  valor_salario_pendiente NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_vacaciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_prima NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_cesantias NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_intereses_cesantias NUMERIC(14,2) NOT NULL DEFAULT 0,

  otros_devengos NUMERIC(14,2) NOT NULL DEFAULT 0,
  deducciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  indemnizacion NUMERIC(14,2) NOT NULL DEFAULT 0,

  total_devengado NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deducciones NUMERIC(14,2) NOT NULL DEFAULT 0,
  neto_pagar NUMERIC(14,2) NOT NULL DEFAULT 0,

  estado TEXT NOT NULL DEFAULT 'BORRADOR',

  fecha_pago DATE,
  observacion TEXT,

  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nomina_liquidaciones_finales_estado_check CHECK (
    estado IN ('BORRADOR', 'LIQUIDADA', 'PAGADA', 'ANULADA')
  ),
  CONSTRAINT nomina_liquidaciones_finales_fechas_check CHECK (fecha_retiro >= fecha_inicio_vinculacion),
  CONSTRAINT nomina_liquidaciones_finales_dias_trabajados_check CHECK (dias_trabajados >= 0 AND dias_trabajados <= 1080),
  CONSTRAINT nomina_liquidaciones_finales_dias_pendientes_pago_check CHECK (dias_pendientes_pago >= 0),
  CONSTRAINT nomina_liquidaciones_finales_dias_vacaciones_check CHECK (dias_vacaciones_pendientes >= 0),
  CONSTRAINT nomina_liquidaciones_finales_salario_check CHECK (salario_base >= 0),
  CONSTRAINT nomina_liquidaciones_finales_auxilio_check CHECK (auxilio_transporte >= 0),
  CONSTRAINT nomina_liquidaciones_finales_valor_salario_pendiente_check CHECK (valor_salario_pendiente >= 0),
  CONSTRAINT nomina_liquidaciones_finales_valor_vacaciones_check CHECK (valor_vacaciones >= 0),
  CONSTRAINT nomina_liquidaciones_finales_valor_prima_check CHECK (valor_prima >= 0),
  CONSTRAINT nomina_liquidaciones_finales_valor_cesantias_check CHECK (valor_cesantias >= 0),
  CONSTRAINT nomina_liquidaciones_finales_valor_intereses_check CHECK (valor_intereses_cesantias >= 0),
  CONSTRAINT nomina_liquidaciones_finales_otros_devengos_check CHECK (otros_devengos >= 0),
  CONSTRAINT nomina_liquidaciones_finales_deducciones_check CHECK (deducciones >= 0),
  CONSTRAINT nomina_liquidaciones_finales_indemnizacion_check CHECK (indemnizacion >= 0),
  CONSTRAINT nomina_liquidaciones_finales_total_devengado_check CHECK (total_devengado >= 0),
  CONSTRAINT nomina_liquidaciones_finales_total_deducciones_check CHECK (total_deducciones >= 0),
  CONSTRAINT nomina_liquidaciones_finales_neto_pagar_check CHECK (neto_pagar >= 0)
);

CREATE INDEX IF NOT EXISTS idx_nomina_liquidaciones_finales_empresa_contrato_activo
  ON nomina_liquidaciones_finales (empresa_id, contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_liquidaciones_finales_persona_activo
  ON nomina_liquidaciones_finales (persona_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_liquidaciones_finales_vinculacion_activo
  ON nomina_liquidaciones_finales (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_liquidaciones_finales_estado_activo
  ON nomina_liquidaciones_finales (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_liquidaciones_finales_created_at
  ON nomina_liquidaciones_finales (created_at DESC, id DESC);
