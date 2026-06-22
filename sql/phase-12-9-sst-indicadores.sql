CREATE TABLE IF NOT EXISTS sst_indicadores_periodos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  nombre_periodo TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_indicadores_periodos_fechas CHECK (
    fecha_fin >= fecha_inicio
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_indicadores_periodos_empresa_id
  ON sst_indicadores_periodos (empresa_id);

CREATE INDEX IF NOT EXISTS idx_sst_indicadores_periodos_contrato_id
  ON sst_indicadores_periodos (contrato_id);

CREATE INDEX IF NOT EXISTS idx_sst_indicadores_periodos_fecha_inicio
  ON sst_indicadores_periodos (fecha_inicio);

CREATE INDEX IF NOT EXISTS idx_sst_indicadores_periodos_fecha_fin
  ON sst_indicadores_periodos (fecha_fin);

CREATE INDEX IF NOT EXISTS idx_sst_indicadores_periodos_activo
  ON sst_indicadores_periodos (activo);
