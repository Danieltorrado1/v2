-- NÓMINA-4B.1: el alcance operativo pertenece a usuario + empresa + contrato + proceso.
ALTER TABLE nomina_responsabilidades_usuario
  ADD COLUMN IF NOT EXISTS contrato_id BIGINT NULL REFERENCES contratos(id) ON DELETE CASCADE;

-- Backfill only when the relationship is unambiguous. Ambiguous legacy rows
-- remain without contract and therefore cannot authorize a contract-specific
-- operation until an administrator saves them in the new UI.
UPDATE nomina_responsabilidades_usuario r
SET contrato_id = candidates.contrato_id
FROM (
  SELECT r0.id, MIN(uc.contrato_id) AS contrato_id
  FROM nomina_responsabilidades_usuario r0
  JOIN usuario_contratos uc ON uc.usuario_id = r0.usuario_id AND COALESCE(uc.activo, TRUE) = TRUE
  JOIN contratos c ON c.id = uc.contrato_id AND c.empresa_id = r0.empresa_id
  WHERE r0.contrato_id IS NULL
  GROUP BY r0.id
  HAVING COUNT(DISTINCT uc.contrato_id) = 1
) candidates
WHERE r.id = candidates.id;

ALTER TABLE nomina_responsabilidades_usuario
  DROP CONSTRAINT IF EXISTS nomina_responsabilidades_usuario_usuario_id_empresa_id_proceso_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_responsabilidad_contexto
  ON nomina_responsabilidades_usuario(usuario_id, empresa_id, proceso, COALESCE(contrato_id, 0));

CREATE INDEX IF NOT EXISTS idx_nomina_responsabilidades_contrato
  ON nomina_responsabilidades_usuario(contrato_id, proceso, activo);

CREATE OR REPLACE FUNCTION nomina_validar_responsabilidad_contrato() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contrato_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contratos c
    WHERE c.id = NEW.contrato_id AND c.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'Contrato fuera de la empresa de la responsabilidad';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_nomina_responsabilidad_contrato ON nomina_responsabilidades_usuario;
CREATE TRIGGER trg_nomina_responsabilidad_contrato
  BEFORE INSERT OR UPDATE ON nomina_responsabilidades_usuario
  FOR EACH ROW EXECUTE FUNCTION nomina_validar_responsabilidad_contrato();
