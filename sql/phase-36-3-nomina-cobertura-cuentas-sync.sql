-- NOMINA-36.3: detalle historico e integracion idempotente de cuentas de cobro externas.
-- Extiende la cuenta externa de COBERTURA con snapshot operativo de tarifa/modalidad/sede.

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS tarifa_config_id BIGINT NULL REFERENCES public.nomina_movimiento_tarifas(id);

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS modalidad_id BIGINT NULL REFERENCES public.modalidades(id);

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS modalidad TEXT NULL;

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS institucion TEXT NULL;

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS sede TEXT NULL;

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE NULL,
  ADD COLUMN IF NOT EXISTS fecha_fin DATE NULL,
  ADD COLUMN IF NOT EXISTS dias_efectivos INTEGER NULL,
  ADD COLUMN IF NOT EXISTS valor_diario NUMERIC(14,2) NULL;

CREATE INDEX IF NOT EXISTS idx_cobertura_cuenta_detalle_tarifa
  ON public.cobertura_cuenta_cobro_externa_detalle (tarifa_config_id);

CREATE INDEX IF NOT EXISTS idx_cobertura_cuenta_detalle_modalidad
  ON public.cobertura_cuenta_cobro_externa_detalle (modalidad_id);
