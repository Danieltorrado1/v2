-- NOMINA-37: fuente económica independiente para ajustes manuales.
CREATE TABLE IF NOT EXISTS public.nomina_ajustes_manuales (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id),
  contrato_id BIGINT NOT NULL REFERENCES public.contratos(id),
  periodo_id BIGINT NOT NULL REFERENCES public.nomina_periodos(id),
  nomina_empleado_id BIGINT NOT NULL REFERENCES public.nomina_empleados(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ADICION', 'DEDUCCION')),
  concepto TEXT NOT NULL CHECK (length(trim(concepto)) > 0),
  observacion TEXT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  documento_soporte_id BIGINT NULL REFERENCES public.documentos_persona(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anulado_by BIGINT NULL REFERENCES public.usuarios(id),
  anulado_at TIMESTAMPTZ NULL,
  motivo_anulacion TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_nomina_ajustes_manuales_periodo ON public.nomina_ajustes_manuales(periodo_id);
CREATE INDEX IF NOT EXISTS idx_nomina_ajustes_manuales_empleado ON public.nomina_ajustes_manuales(nomina_empleado_id);
CREATE INDEX IF NOT EXISTS idx_nomina_ajustes_manuales_tipo_activo ON public.nomina_ajustes_manuales(tipo, activo);
CREATE INDEX IF NOT EXISTS idx_nomina_ajustes_manuales_empresa_contrato ON public.nomina_ajustes_manuales(empresa_id, contrato_id);
