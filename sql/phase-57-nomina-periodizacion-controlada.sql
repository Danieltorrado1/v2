-- Phase 57: anulacion trazable, calendario contractual y reconciliacion segura.
-- No reconcilia datos existentes ni configura contratos productivos.
BEGIN;

ALTER TABLE public.nomina_periodos
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_por bigint,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS periodo_canonico_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_nomina_periodo_anulado_por') THEN
    ALTER TABLE public.nomina_periodos
      ADD CONSTRAINT fk_nomina_periodo_anulado_por FOREIGN KEY (anulado_por) REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_nomina_periodo_canonico') THEN
    ALTER TABLE public.nomina_periodos
      ADD CONSTRAINT fk_nomina_periodo_canonico FOREIGN KEY (periodo_canonico_id) REFERENCES public.nomina_periodos(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_nomina_periodo_estado_phase57') THEN
    ALTER TABLE public.nomina_periodos
      ADD CONSTRAINT chk_nomina_periodo_estado_phase57 CHECK (estado IN ('ABIERTO','EN_PROCESO','REVISADO','CERRADO','PAGADO','ANULADO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_nomina_periodo_anulacion_phase57') THEN
    ALTER TABLE public.nomina_periodos
      ADD CONSTRAINT chk_nomina_periodo_anulacion_phase57 CHECK (
        estado <> 'ANULADO' OR (
          motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> '' AND
          anulado_at IS NOT NULL AND (periodo_canonico_id IS NULL OR periodo_canonico_id <> id)
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nomina_calendarios_contractuales (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES public.empresas(id),
  contrato_id bigint NOT NULL REFERENCES public.contratos(id),
  dia_inicio smallint NOT NULL CHECK (dia_inicio BETWEEN 1 AND 31),
  dia_fin smallint NOT NULL CHECK (dia_fin BETWEEN 1 AND 31),
  regla text NOT NULL DEFAULT 'DIA_INICIO_A_DIA_FIN_MES_SIGUIENTE',
  vigencia_desde date NOT NULL,
  vigencia_hasta date,
  activo boolean NOT NULL DEFAULT true,
  created_by bigint REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde),
  CHECK (NOT (activo AND vigencia_hasta IS NOT NULL AND vigencia_hasta < vigencia_desde))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_calendario_contractual_activo
  ON public.nomina_calendarios_contractuales (empresa_id, contrato_id, vigencia_desde)
  WHERE activo;

CREATE INDEX IF NOT EXISTS idx_nomina_calendario_contractual_scope
  ON public.nomina_calendarios_contractuales (empresa_id, contrato_id, activo, vigencia_desde, vigencia_hasta);

ALTER TABLE public.integracion_evento_impactos
  ADD COLUMN IF NOT EXISTS superseded_by_impact_id bigint,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_integracion_impacto_superseded_by') THEN
    ALTER TABLE public.integracion_evento_impactos
      ADD CONSTRAINT fk_integracion_impacto_superseded_by FOREIGN KEY (superseded_by_impact_id) REFERENCES public.integracion_evento_impactos(id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_estado') THEN
    ALTER TABLE public.integracion_evento_impactos DROP CONSTRAINT chk_integracion_evento_impacto_estado;
  END IF;
  ALTER TABLE public.integracion_evento_impactos
    ADD CONSTRAINT chk_integracion_evento_impacto_estado
    CHECK (estado IN ('PENDIENTE','APLICADO','SIN_CAMBIOS','BLOQUEADO_CIERRE','BLOQUEADO_PERIODIZACION','SUPERSEDED','ERROR'));
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_accion') THEN
    ALTER TABLE public.integracion_evento_impactos DROP CONSTRAINT chk_integracion_evento_impacto_accion;
  END IF;
  ALTER TABLE public.integracion_evento_impactos
    ADD CONSTRAINT chk_integracion_evento_impacto_accion
    CHECK (accion_requerida IN ('REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO','TRAZABILIDAD_PERSONAL','BLOQUEADO_PERIODIZACION','SUPERSEDED'));
END $$;

CREATE INDEX IF NOT EXISTS idx_integracion_impactos_superseded
  ON public.integracion_evento_impactos (estado, periodo_id, evento_id);

CREATE OR REPLACE FUNCTION public.validate_nomina_periodo_anulacion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE canonical record;
BEGIN
  IF NEW.estado = 'ANULADO' THEN
    SELECT np.id, np.contrato_id, np.estado INTO canonical
      FROM public.nomina_periodos np WHERE np.id = NEW.periodo_canonico_id;
    IF NEW.periodo_canonico_id IS NOT NULL AND (canonical.id IS NULL OR canonical.contrato_id <> NEW.contrato_id OR canonical.estado = 'ANULADO') THEN
      RAISE EXCEPTION 'Periodo canonico invalido para anulacion' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nomina_periodo_anulacion ON public.nomina_periodos;
CREATE TRIGGER trg_nomina_periodo_anulacion
  BEFORE INSERT OR UPDATE ON public.nomina_periodos
  FOR EACH ROW EXECUTE FUNCTION public.validate_nomina_periodo_anulacion();

COMMIT;
