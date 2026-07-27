CREATE SEQUENCE IF NOT EXISTS nomina_cuentas_cobro_ops_numero_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1;

CREATE TABLE IF NOT EXISTS nomina_cuentas_cobro_ops (
  id BIGSERIAL PRIMARY KEY,
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  periodo_id BIGINT NOT NULL REFERENCES nomina_periodos(id),
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  documento_id BIGINT REFERENCES documentos_vinculacion(id),
  numero_cuenta BIGINT NOT NULL DEFAULT nextval('nomina_cuentas_cobro_ops_numero_seq'),
  fecha_generacion DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  valor_bruto NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuentos NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_neto NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  observaciones TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NOT NULL REFERENCES usuarios(id),
  updated_by BIGINT REFERENCES usuarios(id),
  CONSTRAINT nomina_cuentas_cobro_ops_estado_check CHECK (
    estado IN ('BORRADOR', 'GENERADA', 'REVISADA', 'APROBADA', 'PAGADA', 'ANULADA')
  ),
  CONSTRAINT nomina_cuentas_cobro_ops_fechas_check CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT nomina_cuentas_cobro_ops_valor_bruto_check CHECK (valor_bruto >= 0),
  CONSTRAINT nomina_cuentas_cobro_ops_descuentos_check CHECK (descuentos >= 0),
  CONSTRAINT nomina_cuentas_cobro_ops_valor_neto_check CHECK (valor_neto >= 0),
  CONSTRAINT nomina_cuentas_cobro_ops_numero_cuenta_unique UNIQUE (numero_cuenta)
);

CREATE TABLE IF NOT EXISTS nomina_cuenta_cobro_ops_detalle (
  id BIGSERIAL PRIMARY KEY,
  cuenta_cobro_ops_id BIGINT NOT NULL REFERENCES nomina_cuentas_cobro_ops(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL,
  valor_unitario NUMERIC(14,2) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  observacion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nomina_cuenta_cobro_ops_detalle_concepto_check CHECK (length(trim(concepto)) > 0),
  CONSTRAINT nomina_cuenta_cobro_ops_detalle_cantidad_check CHECK (cantidad > 0),
  CONSTRAINT nomina_cuenta_cobro_ops_detalle_valor_unitario_check CHECK (valor_unitario >= 0),
  CONSTRAINT nomina_cuenta_cobro_ops_detalle_subtotal_check CHECK (
    subtotal = round((cantidad * valor_unitario)::numeric, 2)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_nomina_cuentas_cobro_ops_vinculacion_periodo_activa
  ON nomina_cuentas_cobro_ops (vinculacion_id, periodo_id)
  WHERE activo = TRUE AND estado <> 'ANULADA';

CREATE INDEX IF NOT EXISTS idx_nomina_cuentas_cobro_ops_empresa_contrato_activo
  ON nomina_cuentas_cobro_ops (empresa_id, contrato_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cuentas_cobro_ops_periodo_activo
  ON nomina_cuentas_cobro_ops (periodo_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cuentas_cobro_ops_vinculacion_activo
  ON nomina_cuentas_cobro_ops (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cuentas_cobro_ops_estado_activo
  ON nomina_cuentas_cobro_ops (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_cuentas_cobro_ops_created_at
  ON nomina_cuentas_cobro_ops (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_nomina_cuenta_cobro_ops_detalle_cuenta
  ON nomina_cuenta_cobro_ops_detalle (cuenta_cobro_ops_id, orden, id);

INSERT INTO tipos_documentos (
  codigo,
  nombre_documento,
  requiere_fecha_expedicion,
  requiere_fecha_vencimiento,
  categoria_documento
)
SELECT
  'CUENTA_COBRO_OPS',
  'Cuenta de cobro OPS',
  FALSE,
  FALSE,
  'NOMINA'
WHERE NOT EXISTS (
  SELECT 1
  FROM tipos_documentos
  WHERE codigo = 'CUENTA_COBRO_OPS'
);
