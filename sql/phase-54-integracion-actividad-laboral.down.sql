-- Rollback destructivo: conserva eventos, normaliza impactos de trazabilidad y
-- requiere aprobación expresa antes de ejecutarse.
BEGIN;

UPDATE public.integracion_evento_impactos
SET accion_requerida='SIN_IMPACTO'
WHERE accion_requerida='TRAZABILIDAD_PERSONAL';

ALTER TABLE public.integracion_evento_impactos
  DROP CONSTRAINT IF EXISTS chk_integracion_evento_impacto_accion;

ALTER TABLE public.integracion_evento_impactos
  ADD CONSTRAINT chk_integracion_evento_impacto_accion
  CHECK (accion_requerida IN ('REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO'));

DROP INDEX IF EXISTS idx_integracion_eventos_actividad_laboral;

COMMIT;
