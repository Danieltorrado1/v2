-- Fase 3: trazabilidad inversa de actividad laboral.
-- Exclusivamente local/de pruebas; no ejecutar en producción.
ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_accion;

ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_accion
  CHECK (accion_requerida IN ('REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO','TRAZABILIDAD_PERSONAL'));

CREATE INDEX IF NOT EXISTS idx_integracion_eventos_actividad_laboral
  ON public.integracion_eventos (vinculacion_id, periodo_id, event_type, created_at DESC);
