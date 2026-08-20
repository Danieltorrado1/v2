ALTER TABLE contrato_documento_requisitos
  ADD COLUMN IF NOT EXISTS objetivo_requisito TEXT NOT NULL DEFAULT 'CONTRATO',
  ADD COLUMN IF NOT EXISTS ambito_documental TEXT NULL,
  ADD COLUMN IF NOT EXISTS contrato_cargo_id BIGINT NULL REFERENCES contrato_cargos(id),
  ADD COLUMN IF NOT EXISTS tipo_vinculacion_id BIGINT NULL REFERENCES tipos_vinculacion(id),
  ADD COLUMN IF NOT EXISTS requiere_fecha_expedicion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requiere_fecha_vencimiento BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vigencia_meses INTEGER NULL,
  ADD COLUMN IF NOT EXISTS dias_proximo_vencimiento INTEGER NOT NULL DEFAULT 30;

ALTER TABLE contrato_documento_requisitos
  DROP CONSTRAINT IF EXISTS chk_contrato_documento_requisitos_objetivo;

ALTER TABLE contrato_documento_requisitos
  ADD CONSTRAINT chk_contrato_documento_requisitos_objetivo CHECK (
    objetivo_requisito IN ('CONTRATO', 'VINCULACION')
  );

ALTER TABLE contrato_documento_requisitos
  DROP CONSTRAINT IF EXISTS chk_contrato_documento_requisitos_ambito_documental;

ALTER TABLE contrato_documento_requisitos
  ADD CONSTRAINT chk_contrato_documento_requisitos_ambito_documental CHECK (
    (
      objetivo_requisito = 'CONTRATO'
      AND ambito_documental IS NULL
    )
    OR (
      objetivo_requisito = 'VINCULACION'
      AND ambito_documental IN ('PERSONA', 'VINCULACION')
    )
  );

ALTER TABLE contrato_documento_requisitos
  DROP CONSTRAINT IF EXISTS chk_contrato_documento_requisitos_vigencia_meses;

ALTER TABLE contrato_documento_requisitos
  ADD CONSTRAINT chk_contrato_documento_requisitos_vigencia_meses CHECK (
    vigencia_meses IS NULL OR vigencia_meses > 0
  );

ALTER TABLE contrato_documento_requisitos
  DROP CONSTRAINT IF EXISTS chk_contrato_documento_requisitos_dias_proximo_vencimiento;

ALTER TABLE contrato_documento_requisitos
  ADD CONSTRAINT chk_contrato_documento_requisitos_dias_proximo_vencimiento CHECK (
    dias_proximo_vencimiento >= 0
  );

UPDATE contrato_documento_requisitos r
SET
  objetivo_requisito = 'CONTRATO',
  ambito_documental = NULL
WHERE objetivo_requisito IS DISTINCT FROM 'CONTRATO'
   OR ambito_documental IS NOT NULL;

ALTER TABLE contrato_documento_requisitos
  DROP CONSTRAINT IF EXISTS chk_contrato_documento_requisitos_tipo_documento_vinculacion;

ALTER TABLE contrato_documento_requisitos
  ADD CONSTRAINT chk_contrato_documento_requisitos_tipo_documento_vinculacion CHECK (
    objetivo_requisito = 'CONTRATO'
    OR tipo_documento_id IS NOT NULL
  );

DROP INDEX IF EXISTS uq_contrato_documento_requisitos_nombre;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_documento_requisitos_contexto_activo
  ON contrato_documento_requisitos (
    contrato_id,
    objetivo_requisito,
    COALESCE(tipo_documento_id, -1),
    COALESCE(contrato_cargo_id, -1),
    COALESCE(tipo_vinculacion_id, -1),
    COALESCE(ambito_documental, '')
  )
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_contrato_documento_requisitos_vinculacion_contexto
  ON contrato_documento_requisitos (
    contrato_id,
    objetivo_requisito,
    contrato_cargo_id,
    tipo_vinculacion_id,
    activo
  );
