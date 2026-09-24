-- Phase 56: periodización explícita y bloqueo seguro de ambigüedades.
-- No reprocesa ni modifica impactos existentes. Aplicar sólo mediante el runner autorizado.
BEGIN;

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_estado;

ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_estado
  CHECK (estado IN ('PENDIENTE','APLICADO','SIN_CAMBIOS','BLOQUEADO_CIERRE','BLOQUEADO_PERIODIZACION','ERROR'));

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_accion;

ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_accion
  CHECK (accion_requerida IN ('REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO','TRAZABILIDAD_PERSONAL','BLOQUEADO_PERIODIZACION'));

CREATE INDEX IF NOT EXISTS idx_integracion_impactos_periodizacion
  ON public.integracion_evento_impactos (estado, accion_requerida, evento_id);

COMMIT;

COMMENT ON COLUMN public.integracion_evento_impactos.estado IS
  'Estado de aplicación del impacto; BLOQUEADO_PERIODIZACION requiere resolución manual y no autoriza sincronización.';
