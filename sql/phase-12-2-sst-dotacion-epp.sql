CREATE TABLE IF NOT EXISTS sst_dotacion_epp (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  nombre_item TEXT NOT NULL,
  tipo_item TEXT NOT NULL,
  descripcion TEXT,
  talla_requerida BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_reposicion BOOLEAN NOT NULL DEFAULT FALSE,
  frecuencia_reposicion_dias INTEGER,
  obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_dotacion_epp_tipo_item CHECK (
    tipo_item IN ('DOTACION', 'EPP', 'BIOSEGURIDAD', 'HERRAMIENTA')
  ),
  CONSTRAINT chk_sst_dotacion_epp_frecuencia CHECK (
    frecuencia_reposicion_dias IS NULL OR frecuencia_reposicion_dias > 0
  )
);

CREATE TABLE IF NOT EXISTS sst_dotacion_epp_entregas (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES sst_dotacion_epp(id),
  persona_id BIGINT NOT NULL REFERENCES personas(id),
  vinculacion_id BIGINT REFERENCES vinculaciones(id),
  fecha_entrega DATE NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL DEFAULT 1,
  talla TEXT,
  estado_entrega TEXT NOT NULL DEFAULT 'ENTREGADO',
  fecha_proxima_reposicion DATE,
  documento_persona_id BIGINT REFERENCES documentos_persona(id),
  recibido_por TEXT,
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_dotacion_epp_entregas_estado CHECK (
    estado_entrega IN ('ENTREGADO', 'PENDIENTE', 'RECHAZADO', 'REPUESTO', 'DEVUELTO')
  ),
  CONSTRAINT chk_sst_dotacion_epp_entregas_cantidad CHECK (
    cantidad > 0
  ),
  CONSTRAINT chk_sst_dotacion_epp_entregas_fechas CHECK (
    fecha_proxima_reposicion IS NULL OR fecha_proxima_reposicion >= fecha_entrega
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_empresa_id
  ON sst_dotacion_epp (empresa_id);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_contrato_id
  ON sst_dotacion_epp (contrato_id);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_tipo_item
  ON sst_dotacion_epp (tipo_item);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_obligatorio
  ON sst_dotacion_epp (obligatorio);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_activo
  ON sst_dotacion_epp (activo);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_entregas_item_id
  ON sst_dotacion_epp_entregas (item_id);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_entregas_persona_id
  ON sst_dotacion_epp_entregas (persona_id);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_entregas_vinculacion_id
  ON sst_dotacion_epp_entregas (vinculacion_id);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_entregas_estado
  ON sst_dotacion_epp_entregas (estado_entrega);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_entregas_fecha_proxima_reposicion
  ON sst_dotacion_epp_entregas (fecha_proxima_reposicion);

CREATE INDEX IF NOT EXISTS idx_sst_dotacion_epp_entregas_activo
  ON sst_dotacion_epp_entregas (activo);
