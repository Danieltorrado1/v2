-- Cuenta de cobro externa: snapshot completo para el PDF dinámico de turnos.
-- Idempotente. No altera la fuente económica; conserva el movimiento incluido.

ALTER TABLE public.cobertura_cuenta_cobro_externa_detalle
  ADD COLUMN IF NOT EXISTS titular_referencia TEXT NULL,
  ADD COLUMN IF NOT EXISTS municipio TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_cobertura_cuenta_detalle_movimiento_activo
  ON public.cobertura_cuenta_cobro_externa_detalle (movimiento_id, activo);
