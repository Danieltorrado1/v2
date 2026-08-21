-- DISEÑO PREPARADO. NO EJECUTAR DURANTE EL CIERRE PRE-SMOKE DE PERSONAL META-26.
-- La condición pertenece a una vinculación y conserva vigencias históricas.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS vinculacion_condiciones_economicas (
  id BIGSERIAL PRIMARY KEY,
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  tipo_condicion TEXT NOT NULL,
  valor NUMERIC(18, 2) NOT NULL,
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  motivo TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT NOT NULL REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT NULL REFERENCES usuarios(id),
  CONSTRAINT chk_vinculacion_condicion_tipo_no_vacio
    CHECK (BTRIM(tipo_condicion) <> ''),
  CONSTRAINT chk_vinculacion_condicion_valor_no_negativo
    CHECK (valor >= 0),
  CONSTRAINT chk_vinculacion_condicion_motivo_no_vacio
    CHECK (BTRIM(motivo) <> ''),
  CONSTRAINT chk_vinculacion_condicion_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_vinculacion_condiciones_economicas_consulta
  ON vinculacion_condiciones_economicas (
    vinculacion_id,
    tipo_condicion,
    activo,
    vigencia_desde DESC,
    id DESC
  );

-- Evita dos condiciones activas del mismo tipo con días de vigencia comunes.
-- El límite superior es inclusivo porque las fechas de negocio también lo son.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ex_vinculacion_condicion_economica_sin_solape'
      AND conrelid = 'vinculacion_condiciones_economicas'::regclass
  ) THEN
    ALTER TABLE vinculacion_condiciones_economicas
      ADD CONSTRAINT ex_vinculacion_condicion_economica_sin_solape
      EXCLUDE USING gist (
        vinculacion_id WITH =,
        (LOWER(BTRIM(tipo_condicion))) WITH =,
        (DATERANGE(vigencia_desde, COALESCE(vigencia_hasta, 'infinity'::date), '[]')) WITH &&
      )
      WHERE (activo = TRUE);
  END IF;
END;
$migration$;

COMMENT ON TABLE vinculacion_condiciones_economicas IS
  'Histórico auditable de condiciones económicas por vinculación, consumible por Nómina.';
COMMENT ON COLUMN vinculacion_condiciones_economicas.tipo_condicion IS
  'Código genérico, por ejemplo CASO_ESPECIAL; no limita futuros tipos de condición.';
