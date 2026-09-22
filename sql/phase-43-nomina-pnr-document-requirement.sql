-- PNR has a canonical documentary requirement: the permission request.
-- Keep the rule data-driven in nomina_tipos_novedad; this migration only
-- corrects the existing catalog value and does not alter payroll effects.
UPDATE public.nomina_tipos_novedad
SET requiere_solicitud_permiso = TRUE
WHERE UPPER(BTRIM(COALESCE(codigo_operativo, ''))) = 'PNR'
   OR UPPER(BTRIM(COALESCE(nombre, ''))) = 'PERMISO NO REMUNERADO';
