-- Canonical documentary requirements for payroll novelties.
-- Idempotent: it normalizes the active catalog without changing economic effects.

ALTER TABLE public.nomina_tipos_novedad
  ADD COLUMN IF NOT EXISTS requiere_autorizacion_descuento BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nomina_novedad_documentos_tipo_relacion_check'
  ) THEN
    ALTER TABLE public.nomina_novedad_documentos
      DROP CONSTRAINT nomina_novedad_documentos_tipo_relacion_check;
  END IF;

  ALTER TABLE public.nomina_novedad_documentos
    ADD CONSTRAINT nomina_novedad_documentos_tipo_relacion_check
    CHECK (tipo_relacion IN ('SOPORTE_NOVEDAD', 'SOLICITUD_PERMISO', 'AUTORIZACION_DESCUENTO'));
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tipos_documentos WHERE codigo = 'NOMINA_AUTORIZACION_DESCUENTO') THEN
    INSERT INTO public.tipos_documentos (
      codigo,
      nombre_documento,
      requiere_fecha_expedicion,
      requiere_fecha_vencimiento,
      categoria_documento,
      alcance,
      tiene_vencimiento,
      requiere_revision,
      criticidad,
      bloquea_creacion,
      bloquea_inicio,
      bloquea_ejecucion,
      bloquea_cierre,
      dias_alerta_amarilla,
      dias_alerta_naranja,
      dias_alerta_roja,
      es_identificacion_personal
    ) VALUES (
      'NOMINA_AUTORIZACION_DESCUENTO',
      'Autorización de descuento de nómina',
      FALSE,
      FALSE,
      'NOMINA',
      'GENERAL',
      FALSE,
      FALSE,
      'MEDIA',
      FALSE,
      FALSE,
      FALSE,
      FALSE,
      30,
      15,
      7,
      FALSE
    );
  END IF;
END $$;

UPDATE public.nomina_tipos_novedad
SET requiere_soporte = FALSE,
    requiere_solicitud_permiso = FALSE,
    requiere_autorizacion_descuento = FALSE
WHERE activo IS NOT FALSE;

UPDATE public.nomina_tipos_novedad
SET requiere_solicitud_permiso = TRUE,
    requiere_soporte = TRUE
WHERE activo IS NOT FALSE
  AND (
    UPPER(BTRIM(COALESCE(codigo_operativo, ''))) IN ('PR1', 'PR2', 'PR3', 'PR4')
    OR UPPER(BTRIM(COALESCE(nombre, ''))) IN (
      'LUTO',
      'LICENCIA MATERNIDAD/PATERNIDAD',
      'ACCIDENTE DE TRABAJO'
    )
  );

UPDATE public.nomina_tipos_novedad
SET requiere_solicitud_permiso = FALSE,
    requiere_soporte = TRUE
WHERE activo IS NOT FALSE
  AND UPPER(BTRIM(COALESCE(codigo_operativo, ''))) IN ('INC_GENERAL', 'INC_ARL');

UPDATE public.nomina_tipos_novedad
SET requiere_solicitud_permiso = TRUE,
    requiere_soporte = TRUE,
    requiere_autorizacion_descuento = TRUE
WHERE activo IS NOT FALSE
  AND UPPER(BTRIM(COALESCE(codigo_operativo, ''))) = 'PNR';

UPDATE public.nomina_tipos_novedad
SET requiere_autorizacion_descuento = TRUE
WHERE activo IS NOT FALSE
  AND UPPER(BTRIM(COALESCE(codigo_operativo, ''))) = 'FNJ';

UPDATE public.nomina_tipos_novedad
SET soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE activo IS NOT FALSE
  AND requiere_soporte = TRUE;

UPDATE public.nomina_tipos_novedad
SET soporte_documento_tipo = NULL
WHERE activo IS NOT FALSE
  AND requiere_soporte = FALSE;
