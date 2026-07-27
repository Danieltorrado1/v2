DO $$
DECLARE
  has_legacy_shape BOOLEAN;
  legacy_rows BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name IN ('descripcion', 'valor_corregido', 'observacion')
  )
  INTO has_legacy_shape;

  IF has_legacy_shape THEN
    SELECT COUNT(*) INTO legacy_rows FROM nomina_correcciones;

    IF legacy_rows > 0 THEN
      RAISE EXCEPTION
        'Legacy nomina_correcciones schema detected with % rows. Automatic normalization is blocked to avoid altering historical data.',
        legacy_rows;
    END IF;
  END IF;
END $$;

DROP VIEW IF EXISTS vw_alertas_nomina;

CREATE TABLE IF NOT EXISTS nomina_correcciones (
  id BIGSERIAL PRIMARY KEY,
  periodo_id BIGINT NOT NULL REFERENCES nomina_periodos(id),
  nomina_empleado_id BIGINT NOT NULL REFERENCES nomina_empleados(id),
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  tipo_correccion TEXT NOT NULL,
  concepto TEXT NOT NULL,
  motivo TEXT NOT NULL,
  valor_anterior NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_nuevo NUMERIC(14,2) NOT NULL DEFAULT 0,
  diferencia NUMERIC(14,2) GENERATED ALWAYS AS (round((valor_nuevo - valor_anterior)::numeric, 2)) STORED,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  observacion_revision TEXT,
  solicitado_por BIGINT REFERENCES usuarios(id),
  revisado_por BIGINT REFERENCES usuarios(id),
  aprobado_por BIGINT REFERENCES usuarios(id),
  aplicado_por BIGINT REFERENCES usuarios(id),
  fecha_solicitud TIMESTAMPTZ,
  fecha_revision TIMESTAMPTZ,
  fecha_aprobacion TIMESTAMPTZ,
  fecha_aplicacion TIMESTAMPTZ,
  movimiento_id BIGINT REFERENCES nomina_movimientos(id),
  novedad_id BIGINT REFERENCES nomina_novedades(id),
  liquidacion_id BIGINT REFERENCES nomina_liquidaciones(id),
  desprendible_origen_id BIGINT REFERENCES nomina_desprendibles(id),
  desprendible_resultado_id BIGINT REFERENCES nomina_desprendibles(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'descripcion'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'concepto'
  ) THEN
    ALTER TABLE nomina_correcciones RENAME COLUMN descripcion TO concepto;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'valor_corregido'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'valor_nuevo'
  ) THEN
    ALTER TABLE nomina_correcciones RENAME COLUMN valor_corregido TO valor_nuevo;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'observacion'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'observacion_revision'
  ) THEN
    ALTER TABLE nomina_correcciones RENAME COLUMN observacion TO observacion_revision;
  END IF;
END $$;

ALTER TABLE nomina_correcciones
  DROP CONSTRAINT IF EXISTS chk_estado_correccion_nomina,
  DROP CONSTRAINT IF EXISTS chk_tipo_correccion_nomina;

DROP INDEX IF EXISTS idx_nomina_correcciones_periodo;
DROP INDEX IF EXISTS idx_nomina_correcciones_empleado;
DROP INDEX IF EXISTS idx_nomina_correcciones_estado;

ALTER TABLE nomina_correcciones DROP COLUMN IF EXISTS diferencia;

ALTER TABLE nomina_correcciones
  ADD COLUMN IF NOT EXISTS concepto TEXT,
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS valor_nuevo NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS observacion_revision TEXT,
  ADD COLUMN IF NOT EXISTS solicitado_por BIGINT,
  ADD COLUMN IF NOT EXISTS revisado_por BIGINT,
  ADD COLUMN IF NOT EXISTS aprobado_por BIGINT,
  ADD COLUMN IF NOT EXISTS aplicado_por BIGINT,
  ADD COLUMN IF NOT EXISTS fecha_solicitud TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_revision TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_aplicacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS movimiento_id BIGINT,
  ADD COLUMN IF NOT EXISTS novedad_id BIGINT,
  ADD COLUMN IF NOT EXISTS liquidacion_id BIGINT,
  ADD COLUMN IF NOT EXISTS desprendible_origen_id BIGINT,
  ADD COLUMN IF NOT EXISTS desprendible_resultado_id BIGINT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE nomina_correcciones
SET
  concepto = COALESCE(NULLIF(trim(concepto), ''), 'Correccion migrada'),
  motivo = COALESCE(NULLIF(trim(motivo), ''), NULLIF(trim(concepto), ''), 'Correccion migrada'),
  valor_anterior = COALESCE(valor_anterior, 0),
  valor_nuevo = COALESCE(valor_nuevo, 0),
  estado = CASE
    WHEN estado = 'PENDIENTE' THEN 'BORRADOR'
    ELSE estado
  END,
  activo = COALESCE(activo, TRUE),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, created_at, NOW())
WHERE
  concepto IS NULL
  OR trim(concepto) = ''
  OR motivo IS NULL
  OR trim(motivo) = ''
  OR valor_anterior IS NULL
  OR valor_nuevo IS NULL
  OR estado = 'PENDIENTE'
  OR activo IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'created_at'
      AND udt_name = 'timestamp'
  ) THEN
    ALTER TABLE nomina_correcciones
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'fecha_revision'
      AND udt_name = 'date'
  ) THEN
    ALTER TABLE nomina_correcciones
      ALTER COLUMN fecha_revision TYPE TIMESTAMPTZ
      USING fecha_revision::timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nomina_correcciones'
      AND column_name = 'fecha_aprobacion'
      AND udt_name = 'date'
  ) THEN
    ALTER TABLE nomina_correcciones
      ALTER COLUMN fecha_aprobacion TYPE TIMESTAMPTZ
      USING fecha_aprobacion::timestamptz;
  END IF;
END $$;

ALTER TABLE nomina_correcciones
  ALTER COLUMN concepto SET NOT NULL,
  ALTER COLUMN motivo SET NOT NULL,
  ALTER COLUMN valor_anterior TYPE NUMERIC(14,2),
  ALTER COLUMN valor_anterior SET DEFAULT 0,
  ALTER COLUMN valor_anterior SET NOT NULL,
  ALTER COLUMN valor_nuevo TYPE NUMERIC(14,2),
  ALTER COLUMN valor_nuevo SET DEFAULT 0,
  ALTER COLUMN valor_nuevo SET NOT NULL,
  ALTER COLUMN estado SET DEFAULT 'BORRADOR',
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN fecha_solicitud DROP DEFAULT,
  ALTER COLUMN fecha_revision DROP DEFAULT,
  ALTER COLUMN fecha_aprobacion DROP DEFAULT,
  ALTER COLUMN fecha_aplicacion DROP DEFAULT,
  ALTER COLUMN activo SET DEFAULT TRUE,
  ALTER COLUMN activo SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE nomina_correcciones
  ADD COLUMN IF NOT EXISTS diferencia NUMERIC(14,2) GENERATED ALWAYS AS (round((valor_nuevo - valor_anterior)::numeric, 2)) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_solicitado_por_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_solicitado_por_fkey
      FOREIGN KEY (solicitado_por) REFERENCES usuarios(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_revisado_por_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_revisado_por_fkey
      FOREIGN KEY (revisado_por) REFERENCES usuarios(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_aprobado_por_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_aprobado_por_fkey
      FOREIGN KEY (aprobado_por) REFERENCES usuarios(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_aplicado_por_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_aplicado_por_fkey
      FOREIGN KEY (aplicado_por) REFERENCES usuarios(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_movimiento_id_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_movimiento_id_fkey
      FOREIGN KEY (movimiento_id) REFERENCES nomina_movimientos(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_novedad_id_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_novedad_id_fkey
      FOREIGN KEY (novedad_id) REFERENCES nomina_novedades(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_liquidacion_id_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_liquidacion_id_fkey
      FOREIGN KEY (liquidacion_id) REFERENCES nomina_liquidaciones(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_desprendible_origen_id_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_desprendible_origen_id_fkey
      FOREIGN KEY (desprendible_origen_id) REFERENCES nomina_desprendibles(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_desprendible_resultado_id_fkey'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_desprendible_resultado_id_fkey
      FOREIGN KEY (desprendible_resultado_id) REFERENCES nomina_desprendibles(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_tipo_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_tipo_check
      CHECK (
        tipo_correccion IN (
          'DEVENGADO',
          'DEDUCCION',
          'NOVEDAD',
          'MOVIMIENTO',
          'LIQUIDACION',
          'DESPRENDIBLE',
          'OTRO'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_estado_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_estado_check
      CHECK (
        estado IN (
          'BORRADOR',
          'SOLICITADA',
          'EN_REVISION',
          'APROBADA',
          'RECHAZADA',
          'APLICADA',
          'ANULADA'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_concepto_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_concepto_check
      CHECK (length(trim(concepto)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_motivo_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_motivo_check
      CHECK (length(trim(motivo)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_valor_anterior_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_valor_anterior_check
      CHECK (valor_anterior >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_valor_nuevo_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_valor_nuevo_check
      CHECK (valor_nuevo >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_observacion_final_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_observacion_final_check
      CHECK (
        estado NOT IN ('RECHAZADA', 'ANULADA')
        OR length(trim(COALESCE(observacion_revision, ''))) > 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_solicitud_pair_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_solicitud_pair_check
      CHECK (
        (solicitado_por IS NULL AND fecha_solicitud IS NULL)
        OR (solicitado_por IS NOT NULL AND fecha_solicitud IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_revision_pair_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_revision_pair_check
      CHECK (
        (revisado_por IS NULL AND fecha_revision IS NULL)
        OR (revisado_por IS NOT NULL AND fecha_revision IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_aprobacion_pair_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_aprobacion_pair_check
      CHECK (
        (aprobado_por IS NULL AND fecha_aprobacion IS NULL)
        OR (aprobado_por IS NOT NULL AND fecha_aprobacion IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_correcciones_aplicacion_pair_check'
  ) THEN
    ALTER TABLE nomina_correcciones
      ADD CONSTRAINT nomina_correcciones_aplicacion_pair_check
      CHECK (
        (aplicado_por IS NULL AND fecha_aplicacion IS NULL)
        OR (aplicado_por IS NOT NULL AND fecha_aplicacion IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_periodo_activo
  ON nomina_correcciones (periodo_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_empleado_activo
  ON nomina_correcciones (nomina_empleado_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_vinculacion_activo
  ON nomina_correcciones (vinculacion_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_estado_activo
  ON nomina_correcciones (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_tipo_activo
  ON nomina_correcciones (tipo_correccion, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_movimiento
  ON nomina_correcciones (movimiento_id);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_novedad
  ON nomina_correcciones (novedad_id);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_liquidacion
  ON nomina_correcciones (liquidacion_id);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_desprendible_origen
  ON nomina_correcciones (desprendible_origen_id);

CREATE INDEX IF NOT EXISTS idx_nomina_correcciones_created_at
  ON nomina_correcciones (created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_correcciones_abiertas_recurso
  ON nomina_correcciones (
    periodo_id,
    nomina_empleado_id,
    vinculacion_id,
    tipo_correccion,
    lower(concepto),
    COALESCE(movimiento_id, 0),
    COALESCE(novedad_id, 0),
    COALESCE(liquidacion_id, 0),
    COALESCE(desprendible_origen_id, 0)
  )
  WHERE COALESCE(activo, TRUE) = TRUE
    AND estado IN ('BORRADOR', 'SOLICITADA', 'EN_REVISION', 'APROBADA');

CREATE OR REPLACE VIEW vw_alertas_nomina AS
SELECT
  id,
  periodo_id,
  nomina_empleado_id,
  vinculacion_id,
  tipo_correccion,
  COALESCE(origen_correccion, 'REVISION_INTERNA') AS origen_correccion,
  concepto AS descripcion,
  valor_anterior,
  valor_nuevo AS valor_corregido,
  diferencia,
  estado,
  COALESCE(requiere_pago_adicional, diferencia > 0) AS requiere_pago_adicional,
  COALESCE(requiere_descuento, diferencia < 0) AS requiere_descuento,
  fecha_revision,
  fecha_aprobacion,
  observacion_revision AS observacion,
  activo,
  created_at
FROM nomina_correcciones
WHERE estado IN ('SOLICITADA', 'EN_REVISION', 'APROBADA');
