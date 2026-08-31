-- COBERTURA: document requirements remain data-driven by novelty type.
ALTER TABLE public.nomina_tipos_novedad
  ADD COLUMN IF NOT EXISTS requiere_solicitud_permiso BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.nomina_novedad_documentos
  ADD COLUMN IF NOT EXISTS tipo_relacion VARCHAR(40) NOT NULL DEFAULT 'SOPORTE_NOVEDAD';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_novedad_documentos_tipo_relacion_check'
  ) THEN
    ALTER TABLE public.nomina_novedad_documentos
      ADD CONSTRAINT nomina_novedad_documentos_tipo_relacion_check
      CHECK (tipo_relacion IN ('SOPORTE_NOVEDAD', 'SOLICITUD_PERMISO'));
  END IF;
END $$;

UPDATE public.nomina_novedad_documentos
SET tipo_relacion = 'SOPORTE_NOVEDAD'
WHERE tipo_relacion IS NULL
   OR BTRIM(tipo_relacion) = '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_nomina_novedad_documento_tipo_activo
  ON public.nomina_novedad_documentos (nomina_novedad_id, tipo_relacion)
  WHERE activo = TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tipos_documentos
    WHERE codigo = 'NOMINA_SOLICITUD_PERMISO'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tipos_documentos'
      AND column_name = 'requiere_vencimiento'
  ) THEN
    INSERT INTO public.tipos_documentos (
      codigo,
      nombre_documento,
      requiere_vencimiento,
      requiere_expedicion,
      modulo
    )
    VALUES ('NOMINA_SOLICITUD_PERMISO', 'Solicitud de permiso de nomina', FALSE, FALSE, 'NOMINA');
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tipos_documentos'
      AND column_name = 'requiere_fecha_vencimiento'
  ) THEN
    INSERT INTO public.tipos_documentos (
      codigo,
      nombre_documento,
      requiere_fecha_expedicion,
      requiere_fecha_vencimiento,
      categoria_documento
    )
    VALUES ('NOMINA_SOLICITUD_PERMISO', 'Solicitud de permiso de nomina', FALSE, FALSE, 'NOMINA');
  ELSE
    INSERT INTO public.tipos_documentos (codigo, nombre_documento)
    VALUES ('NOMINA_SOLICITUD_PERMISO', 'Solicitud de permiso de nomina');
  END IF;
END $$;

-- These operational events are explicitly exempt from supporting documents.
UPDATE public.nomina_tipos_novedad
SET requiere_soporte = FALSE,
    requiere_solicitud_permiso = FALSE
WHERE UPPER(COALESCE(codigo_operativo, '')) IN ('INGRESO', 'S', 'FNJ', 'L50')
   OR UPPER(BTRIM(COALESCE(nombre, ''))) IN ('INGRESO', 'SUSPENSION', 'FALLA NO JUSTIFICADA', 'DIA NO CLASE');
