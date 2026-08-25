CREATE TABLE IF NOT EXISTS public.organizaciones (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'ACTIVA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_organizaciones_estado
    CHECK (estado IN ('ACTIVA', 'INACTIVA'))
);

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS organizacion_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'empresas_organizacion_id_fkey'
      AND conrelid = 'public.empresas'::regclass
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_organizacion_id_fkey
      FOREIGN KEY (organizacion_id)
      REFERENCES public.organizaciones(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_empresas_organizacion_id
  ON public.empresas (organizacion_id);

INSERT INTO public.organizaciones (codigo, nombre, estado)
SELECT
  'ORG-EMPRESA-' || e.id::text AS codigo,
  e.nombre_empresa AS nombre,
  CASE WHEN COALESCE(e.activo, TRUE) THEN 'ACTIVA' ELSE 'INACTIVA' END AS estado
FROM public.empresas e
LEFT JOIN public.organizaciones o
  ON o.codigo = 'ORG-EMPRESA-' || e.id::text
WHERE e.organizacion_id IS NULL
  AND o.id IS NULL;

UPDATE public.empresas e
SET organizacion_id = o.id
FROM public.organizaciones o
WHERE e.organizacion_id IS NULL
  AND o.codigo = 'ORG-EMPRESA-' || e.id::text;

ALTER TABLE public.empresas
  ALTER COLUMN organizacion_id SET NOT NULL;
