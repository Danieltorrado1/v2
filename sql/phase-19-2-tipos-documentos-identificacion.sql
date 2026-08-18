ALTER TABLE tipos_documentos
  ADD COLUMN IF NOT EXISTS es_identificacion_personal BOOLEAN NOT NULL DEFAULT FALSE;

WITH semantic_identification_types AS (
  SELECT td.id
  FROM tipos_documentos td
  CROSS JOIN LATERAL (
    SELECT
      LOWER(TRIM(COALESCE(td.codigo, ''))) AS normalized_code,
      LOWER(
        REGEXP_REPLACE(
          TRANSLATE(TRIM(COALESCE(td.nombre_documento, '')), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'),
          '\s+',
          ' ',
          'g'
        )
      ) AS normalized_name
  ) normalized
  WHERE normalized.normalized_code IN (
      'cc',
      'ce',
      'ti',
      'ppt',
      'pep',
      'dni',
      'pas',
      'pasaporte',
      'cedula',
      'cedula_ciudadania',
      'cedula_extranjeria'
    )
    OR normalized.normalized_name IN (
      'cedula de ciudadania',
      'cedula de extranjeria',
      'tarjeta de identidad',
      'permiso por proteccion temporal',
      'permiso especial de permanencia',
      'pasaporte',
      'documento nacional de identidad'
    )
)
UPDATE tipos_documentos td
SET es_identificacion_personal = TRUE
WHERE COALESCE(td.es_identificacion_personal, FALSE) = FALSE
  AND EXISTS (
    SELECT 1
    FROM semantic_identification_types semantic
    WHERE semantic.id = td.id
  );
