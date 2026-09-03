-- Planilla operativa fixes: habilita rangos en tipos cuya semantica ya es multidia.
UPDATE public.nomina_tipos_novedad
SET permite_rango = TRUE
WHERE COALESCE(activo, TRUE) = TRUE
  AND COALESCE(permite_rango, FALSE) = FALSE
  AND (
    modelo_registro = 'EVENTO_CANONICO_RANGO'
    OR UPPER(TRIM(COALESCE(nombre, ''))) = 'LUTO'
  );
