-- NOMINA-3: eventos operativos intrames y snapshot base por empleado de nomina.
-- No crea personas, vinculaciones, empleados, novedades, liquidaciones ni pagos.

CREATE TABLE IF NOT EXISTS public.nomina_contextos_operativos_base (
  id BIGSERIAL PRIMARY KEY,
  periodo_id BIGINT NOT NULL REFERENCES public.nomina_periodos(id),
  nomina_empleado_id BIGINT NOT NULL REFERENCES public.nomina_empleados(id),
  vinculacion_id BIGINT NOT NULL REFERENCES public.vinculaciones(id),
  contexto JSONB NOT NULL,
  fuente TEXT NOT NULL DEFAULT 'SNAPSHOT_PERIODO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT NULL REFERENCES public.usuarios(id),
  CONSTRAINT uq_nomina_contexto_base_empleado UNIQUE (periodo_id, nomina_empleado_id),
  CONSTRAINT chk_nomina_contexto_base_objeto CHECK (jsonb_typeof(contexto) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_nomina_contextos_base_vinculacion
  ON public.nomina_contextos_operativos_base (periodo_id, vinculacion_id);

ALTER TABLE public.nomina_movimientos
  ADD COLUMN IF NOT EXISTS fecha_fin_efectiva DATE NULL,
  ADD COLUMN IF NOT EXISTS contexto_anterior JSONB NULL,
  ADD COLUMN IF NOT EXISTS contexto_nuevo JSONB NULL,
  ADD COLUMN IF NOT EXISTS motivo_operativo TEXT NULL,
  ADD COLUMN IF NOT EXISTS regla_fecha_efectiva TEXT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_nomina_movimiento_rango_efectivo'
      AND conrelid = 'public.nomina_movimientos'::regclass
  ) THEN
    ALTER TABLE public.nomina_movimientos
      ADD CONSTRAINT chk_nomina_movimiento_rango_efectivo
      CHECK (fecha_fin_efectiva IS NULL OR fecha IS NULL OR fecha_fin_efectiva >= fecha);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_nomina_movimiento_contextos_operativos'
      AND conrelid = 'public.nomina_movimientos'::regclass
  ) THEN
    ALTER TABLE public.nomina_movimientos
      ADD CONSTRAINT chk_nomina_movimiento_contextos_operativos CHECK (
        familia_movimiento <> 'CAMBIO_OPERATIVO'
        OR (
          fecha IS NOT NULL
          AND contexto_anterior IS NOT NULL
          AND contexto_nuevo IS NOT NULL
          AND jsonb_typeof(contexto_anterior) = 'object'
          AND jsonb_typeof(contexto_nuevo) = 'object'
          AND BTRIM(COALESCE(motivo_operativo, '')) <> ''
          AND regla_fecha_efectiva IN ('MISMO_DIA', 'DIA_SIGUIENTE')
        )
      ) NOT VALID;
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_nomina_cambios_operativos_resolucion
  ON public.nomina_movimientos (periodo_id, vinculacion_id, fecha, id)
  WHERE familia_movimiento = 'CAMBIO_OPERATIVO' AND activo = TRUE;

COMMENT ON COLUMN public.nomina_movimientos.contexto_anterior IS
  'Snapshot explicativo del contexto vigente inmediatamente antes del evento operativo.';
COMMENT ON COLUMN public.nomina_movimientos.contexto_nuevo IS
  'Snapshot compuesto (FKs y etiquetas historicas minimas) que rige desde la fecha efectiva.';
