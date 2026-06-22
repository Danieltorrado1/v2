CREATE TABLE IF NOT EXISTS public.nomina_movimientos (
  id bigserial PRIMARY KEY,
  periodo_id bigint NOT NULL REFERENCES public.nomina_periodos(id),
  nomina_empleado_id bigint NOT NULL REFERENCES public.nomina_empleados(id),
  vinculacion_id bigint NOT NULL REFERENCES public.vinculaciones(id),
  fecha date,
  tipo_movimiento text NOT NULL,
  descripcion text,
  cantidad numeric(12,2),
  valor_unitario numeric(14,2),
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  es_devengado boolean NOT NULL DEFAULT true,
  es_deduccion boolean NOT NULL DEFAULT false,
  afecta_seguridad_social boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_periodo_id
  ON public.nomina_movimientos (periodo_id);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_nomina_empleado_id
  ON public.nomina_movimientos (nomina_empleado_id);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_vinculacion_id
  ON public.nomina_movimientos (vinculacion_id);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_tipo_movimiento
  ON public.nomina_movimientos (tipo_movimiento);

CREATE INDEX IF NOT EXISTS idx_nomina_movimientos_activo
  ON public.nomina_movimientos (activo);
