CREATE TABLE IF NOT EXISTS public.nomina_movimiento_tarifas (
  id BIGSERIAL PRIMARY KEY,
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  tipo_movimiento TEXT NOT NULL,
  municipio_id BIGINT NULL REFERENCES municipios(id),
  institucion_id BIGINT NULL REFERENCES instituciones(id),
  sede_id BIGINT NULL REFERENCES sedes(id),
  modalidad_id BIGINT NULL REFERENCES modalidades(id),
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  valor_unitario NUMERIC(14,2) NOT NULL,
  observacion TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT NULL REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT NULL REFERENCES usuarios(id),
  CONSTRAINT chk_nomina_movimiento_tarifas_tipo_no_vacio
    CHECK (BTRIM(tipo_movimiento) <> ''),
  CONSTRAINT chk_nomina_movimiento_tarifas_valor_non_negative
    CHECK (valor_unitario >= 0),
  CONSTRAINT chk_nomina_movimiento_tarifas_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_nomina_movimiento_tarifas_lookup
  ON public.nomina_movimiento_tarifas (
    contrato_id,
    tipo_movimiento,
    activo,
    vigencia_desde DESC,
    id DESC
  );

ALTER TABLE public.nomina_movimientos
  ADD COLUMN IF NOT EXISTS familia_movimiento TEXT NULL,
  ADD COLUMN IF NOT EXISTS estado TEXT NULL,
  ADD COLUMN IF NOT EXISTS documento_persona_id BIGINT NULL REFERENCES documentos_persona(id),
  ADD COLUMN IF NOT EXISTS persona_reemplazada_id BIGINT NULL REFERENCES personas(id),
  ADD COLUMN IF NOT EXISTS vinculacion_reemplazada_id BIGINT NULL REFERENCES vinculaciones(id),
  ADD COLUMN IF NOT EXISTS municipio_id BIGINT NULL REFERENCES municipios(id),
  ADD COLUMN IF NOT EXISTS institucion_id BIGINT NULL REFERENCES instituciones(id),
  ADD COLUMN IF NOT EXISTS sede_id BIGINT NULL REFERENCES sedes(id),
  ADD COLUMN IF NOT EXISTS modalidad_id BIGINT NULL REFERENCES modalidades(id),
  ADD COLUMN IF NOT EXISTS contexto_municipio TEXT NULL,
  ADD COLUMN IF NOT EXISTS contexto_institucion TEXT NULL,
  ADD COLUMN IF NOT EXISTS contexto_sede TEXT NULL,
  ADD COLUMN IF NOT EXISTS contexto_modalidad TEXT NULL,
  ADD COLUMN IF NOT EXISTS tarifa_config_id BIGINT NULL REFERENCES nomina_movimiento_tarifas(id),
  ADD COLUMN IF NOT EXISTS valor_calculado NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS motivo_ajuste_valor TEXT NULL,
  ADD COLUMN IF NOT EXISTS alertas_validacion JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS posible_duplicado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revisado_por BIGINT NULL REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS revisado_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS aprobado_por BIGINT NULL REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS aprobado_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rechazado_por BIGINT NULL REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS rechazado_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS motivo_estado TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL REFERENCES usuarios(id);

UPDATE public.nomina_movimientos
SET
  familia_movimiento = CASE
    WHEN tipo_movimiento = 'TURNO_EXTERNO' THEN 'ADICION_DEVENGO'
    ELSE 'GENERAL'
  END,
  estado = COALESCE(NULLIF(BTRIM(estado), ''), 'APROBADO'),
  valor_calculado = COALESCE(valor_calculado, valor_total, 0),
  updated_at = COALESCE(updated_at, created_at, NOW())
WHERE
  familia_movimiento IS NULL
  OR estado IS NULL
  OR valor_calculado IS NULL
  OR updated_at IS NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_movimientos_familia_movimiento'
      AND conrelid = 'public.nomina_movimientos'::regclass
  ) THEN
    ALTER TABLE public.nomina_movimientos
      ADD CONSTRAINT chk_nomina_movimientos_familia_movimiento
      CHECK (familia_movimiento IN ('GENERAL', 'ADICION_DEVENGO', 'CAMBIO_OPERATIVO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_movimientos_estado'
      AND conrelid = 'public.nomina_movimientos'::regclass
  ) THEN
    ALTER TABLE public.nomina_movimientos
      ADD CONSTRAINT chk_nomina_movimientos_estado
      CHECK (estado IN ('PENDIENTE', 'REVISADO', 'APROBADO', 'RECHAZADO'));
  END IF;
END;
$migration$;

ALTER TABLE public.nomina_movimientos
  ALTER COLUMN familia_movimiento SET NOT NULL,
  ALTER COLUMN familia_movimiento SET DEFAULT 'GENERAL',
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_estado
  ON public.nomina_movimientos (estado, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_familia
  ON public.nomina_movimientos (familia_movimiento, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_fecha_tipo
  ON public.nomina_movimientos (periodo_id, vinculacion_id, fecha, tipo_movimiento);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_reemplazo
  ON public.nomina_movimientos (vinculacion_reemplazada_id, fecha);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_tarifa
  ON public.nomina_movimientos (tarifa_config_id);
