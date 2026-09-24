BEGIN;

DROP INDEX IF EXISTS public.idx_integracion_impactos_periodizacion;

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_estado;
ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_estado
  CHECK (estado IN ('PENDIENTE','APLICADO','SIN_CAMBIOS','BLOQUEADO_CIERRE','ERROR'));

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_accion;
ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_accion
  CHECK (accion_requerida IN ('REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO','TRAZABILIDAD_PERSONAL'));

COMMIT;
