CREATE TABLE IF NOT EXISTS sst_matriz_riesgos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id),
  contrato_id BIGINT REFERENCES contratos(id),
  proceso TEXT NOT NULL,
  actividad TEXT NOT NULL,
  tarea TEXT,
  tipo_peligro TEXT NOT NULL,
  descripcion_peligro TEXT NOT NULL,
  consecuencia TEXT,
  probabilidad INTEGER NOT NULL,
  impacto INTEGER NOT NULL,
  nivel_riesgo INTEGER NOT NULL,
  clasificacion_riesgo TEXT NOT NULL,
  controles_existentes TEXT,
  controles_recomendados TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sst_matriz_riesgos_tipo_peligro CHECK (
    tipo_peligro IN (
      'BIOLOGICO',
      'QUIMICO',
      'FISICO',
      'ERGONOMICO',
      'PSICOSOCIAL',
      'MECANICO',
      'LOCATIVO',
      'PUBLICO',
      'ELECTRICO',
      'OTRO'
    )
  ),
  CONSTRAINT chk_sst_matriz_riesgos_probabilidad CHECK (
    probabilidad BETWEEN 1 AND 5
  ),
  CONSTRAINT chk_sst_matriz_riesgos_impacto CHECK (
    impacto BETWEEN 1 AND 5
  ),
  CONSTRAINT chk_sst_matriz_riesgos_nivel CHECK (
    nivel_riesgo = probabilidad * impacto
  ),
  CONSTRAINT chk_sst_matriz_riesgos_clasificacion CHECK (
    (nivel_riesgo BETWEEN 1 AND 4 AND clasificacion_riesgo = 'BAJO')
    OR (nivel_riesgo BETWEEN 5 AND 9 AND clasificacion_riesgo = 'MEDIO')
    OR (nivel_riesgo BETWEEN 10 AND 16 AND clasificacion_riesgo = 'ALTO')
    OR (nivel_riesgo BETWEEN 17 AND 25 AND clasificacion_riesgo = 'CRITICO')
  )
);

CREATE INDEX IF NOT EXISTS idx_sst_matriz_riesgos_empresa_id
  ON sst_matriz_riesgos (empresa_id);

CREATE INDEX IF NOT EXISTS idx_sst_matriz_riesgos_contrato_id
  ON sst_matriz_riesgos (contrato_id);

CREATE INDEX IF NOT EXISTS idx_sst_matriz_riesgos_tipo_peligro
  ON sst_matriz_riesgos (tipo_peligro);

CREATE INDEX IF NOT EXISTS idx_sst_matriz_riesgos_clasificacion_riesgo
  ON sst_matriz_riesgos (clasificacion_riesgo);

CREATE INDEX IF NOT EXISTS idx_sst_matriz_riesgos_activo
  ON sst_matriz_riesgos (activo);
