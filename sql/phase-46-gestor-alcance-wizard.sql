-- Gestor coverage wizard: preserve legacy territorial history and add
-- institution-level partial coverage without materializing workers.
ALTER TABLE gestor_municipio_asignaciones
  ADD COLUMN IF NOT EXISTS tipo_alcance TEXT NOT NULL DEFAULT 'FULL';

UPDATE gestor_municipio_asignaciones
SET tipo_alcance = 'FULL'
WHERE tipo_alcance IS NULL OR tipo_alcance = '';

ALTER TABLE gestor_municipio_asignaciones
  DROP CONSTRAINT IF EXISTS gestor_municipio_asignaciones_tipo_alcance_ck;

ALTER TABLE gestor_municipio_asignaciones
  ADD CONSTRAINT gestor_municipio_asignaciones_tipo_alcance_ck
  CHECK (tipo_alcance IN ('FULL', 'PARTIAL'));

CREATE TABLE IF NOT EXISTS gestor_institucion_asignaciones (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  municipio_id BIGINT NOT NULL REFERENCES municipios(id),
  institucion_id BIGINT NOT NULL REFERENCES instituciones(id),
  vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta DATE NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  observacion TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id BIGINT NULL REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gestor_institucion_asignacion_activa
  ON gestor_institucion_asignaciones (usuario_id, contrato_id, municipio_id, institucion_id)
  WHERE COALESCE(activo, TRUE) = TRUE;

CREATE INDEX IF NOT EXISTS ix_gestor_institucion_asignacion_scope
  ON gestor_institucion_asignaciones (contrato_id, municipio_id, institucion_id, activo, vigencia_desde, vigencia_hasta);
