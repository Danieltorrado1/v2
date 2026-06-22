CREATE TABLE IF NOT EXISTS sst_plan_anual (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  anio INTEGER NOT NULL,
  nombre_plan TEXT NOT NULL,
  objetivo TEXT,
  presupuesto NUMERIC(14,2),
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_plan_anual_presupuesto CHECK (
    presupuesto IS NULL OR presupuesto >= 0
  ),
  CONSTRAINT chk_sst_plan_anual_estado CHECK (
    estado IN ('ABIERTO', 'EN_EJECUCION', 'FINALIZADO', 'CERRADO')
  )
);

CREATE TABLE IF NOT EXISTS sst_plan_anual_actividades (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES sst_plan_anual(id),
  actividad TEXT NOT NULL,
  descripcion TEXT,
  responsable TEXT NOT NULL,
  fecha_programada DATE NOT NULL,
  fecha_ejecucion DATE,
  presupuesto NUMERIC(14,2),
  porcentaje_avance INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  documento_persona_id BIGINT NULL REFERENCES documentos_persona(id),
  observacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_plan_anual_actividades_estado CHECK (
    estado IN ('PENDIENTE', 'EN_PROCESO', 'EJECUTADA', 'VENCIDA', 'CANCELADA')
  ),
  CONSTRAINT chk_sst_plan_anual_actividades_porcentaje CHECK (
    porcentaje_avance BETWEEN 0 AND 100
  ),
  CONSTRAINT chk_sst_plan_anual_actividades_presupuesto CHECK (
    presupuesto IS NULL OR presupuesto >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_plan_anual_empresa_contrato_anio_estado_activo
  ON sst_plan_anual (empresa_id, contrato_id, anio, estado, activo);

CREATE INDEX IF NOT EXISTS idx_sst_plan_anual_actividades_plan_estado_fecha_activo
  ON sst_plan_anual_actividades (plan_id, estado, fecha_programada, activo);

CREATE INDEX IF NOT EXISTS idx_sst_plan_anual_actividades_documento_persona_id
  ON sst_plan_anual_actividades (documento_persona_id);
