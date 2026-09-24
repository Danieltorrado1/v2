-- Fase 3: trazabilidad inversa de actividad laboral.
-- Aplicar únicamente mediante el runner de release controlado, después de Phase 53.
BEGIN;

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_accion;

ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_accion
  CHECK (accion_requerida IN ('REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO','TRAZABILIDAD_PERSONAL'));

CREATE INDEX IF NOT EXISTS idx_integracion_eventos_actividad_laboral
  ON public.integracion_eventos (vinculacion_id, periodo_id, event_type, created_at DESC);

COMMIT;
