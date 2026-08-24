-- NOMINA-3.2: relacion operativa novedad/turno y checklist de revision.
-- No inserta datos de agosto; las tablas se crean vacias.

CREATE TABLE IF NOT EXISTS public.nomina_novedad_turnos (
  id BIGSERIAL PRIMARY KEY,
  periodo_id BIGINT NOT NULL REFERENCES public.nomina_periodos(id),
  nomina_novedad_id BIGINT NOT NULL REFERENCES public.nomina_novedades(id),
  nomina_empleado_id BIGINT NOT NULL REFERENCES public.nomina_empleados(id),
  vinculacion_id BIGINT NOT NULL REFERENCES public.vinculaciones(id),
  tipo_turno TEXT NOT NULL,
  movimiento_id BIGINT NULL REFERENCES public.nomina_movimientos(id),
  persona_reemplazada_id BIGINT NULL REFERENCES public.personas(id),
  contexto_operativo JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacion TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT NULL REFERENCES public.usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_nomina_novedad_turnos_novedad UNIQUE (nomina_novedad_id),
  CONSTRAINT chk_nomina_novedad_turnos_tipo CHECK (tipo_turno IN ('INTERNO','EXTERNO')),
  CONSTRAINT chk_nomina_novedad_turnos_contexto CHECK (jsonb_typeof(contexto_operativo) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_nomina_novedad_turnos_periodo_empleado
  ON public.nomina_novedad_turnos(periodo_id, nomina_empleado_id, activo);

CREATE TABLE IF NOT EXISTS public.nomina_revision_operativa (
  id BIGSERIAL PRIMARY KEY,
  periodo_id BIGINT NOT NULL REFERENCES public.nomina_periodos(id),
  nomina_empleado_id BIGINT NOT NULL REFERENCES public.nomina_empleados(id),
  persona_id BIGINT NOT NULL REFERENCES public.personas(id),
  vinculacion_id BIGINT NOT NULL REFERENCES public.vinculaciones(id),
  estado_revision TEXT NOT NULL DEFAULT 'PENDIENTE',
  revisado_por BIGINT NULL REFERENCES public.usuarios(id),
  revisado_at TIMESTAMPTZ NULL,
  invalidado_por BIGINT NULL REFERENCES public.usuarios(id),
  invalidado_at TIMESTAMPTZ NULL,
  motivo_invalidacion TEXT NULL,
  version_revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_nomina_revision_operativa UNIQUE(periodo_id, nomina_empleado_id),
  CONSTRAINT chk_nomina_revision_operativa_estado CHECK (estado_revision IN ('PENDIENTE','REVISADO','REQUIERE_REVISION'))
);
CREATE INDEX IF NOT EXISTS idx_nomina_revision_operativa_estado
  ON public.nomina_revision_operativa(periodo_id, estado_revision);

CREATE OR REPLACE FUNCTION public.nomina_invalidar_revision_operativa()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_periodo BIGINT; v_empleado BIGINT; v_persona BIGINT; v_vinculacion BIGINT; v_reason TEXT; v_family TEXT; v_record BIGINT;
BEGIN
  v_periodo := COALESCE(NEW.periodo_id, OLD.periodo_id);
  v_empleado := COALESCE(NEW.nomina_empleado_id, OLD.nomina_empleado_id);
  v_reason := CASE WHEN TG_TABLE_NAME='nomina_novedades' THEN CASE WHEN TG_OP='INSERT' THEN 'NOVEDAD_CREADA' ELSE CASE WHEN TG_OP='DELETE' THEN 'NOVEDAD_DESACTIVADA' ELSE 'NOVEDAD_MODIFICADA' END END
               WHEN TG_TABLE_NAME='nomina_asistencia_diaria' THEN 'ASISTENCIA_MODIFICADA'
               WHEN TG_TABLE_NAME='nomina_movimientos' THEN 'TA_MODIFICADO'
               ELSE TG_TABLE_NAME||'_MODIFICADA' END;
  IF TG_TABLE_NAME='nomina_movimientos' THEN
    v_record := COALESCE(NEW.id, OLD.id);
    EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record;
    IF v_family='CAMBIO_OPERATIVO' THEN v_reason := 'CAMBIO_OPERATIVO_MODIFICADO'; END IF;
  END IF;
  IF v_empleado IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  SELECT ne.vinculacion_id, v.persona_id INTO v_vinculacion, v_persona
  FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE ne.id=v_empleado LIMIT 1;
  IF v_persona IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,invalidado_at,motivo_invalidacion,updated_at)
  VALUES(v_periodo,v_empleado,v_persona,v_vinculacion,'REQUIERE_REVISION',NOW(),v_reason,NOW())
  ON CONFLICT(periodo_id,nomina_empleado_id) DO UPDATE SET
    estado_revision=CASE WHEN nomina_revision_operativa.estado_revision='REVISADO' THEN 'REQUIERE_REVISION' ELSE nomina_revision_operativa.estado_revision END,
    invalidado_at=CASE WHEN nomina_revision_operativa.estado_revision='REVISADO' THEN NOW() ELSE nomina_revision_operativa.invalidado_at END,
    motivo_invalidacion=CASE WHEN nomina_revision_operativa.estado_revision='REVISADO' THEN v_reason ELSE nomina_revision_operativa.motivo_invalidacion END,
    updated_at=NOW();
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

DROP TRIGGER IF EXISTS trg_nomina_novedades_invalida_revision ON public.nomina_novedades;
CREATE TRIGGER trg_nomina_novedades_invalida_revision AFTER INSERT OR UPDATE OR DELETE ON public.nomina_novedades FOR EACH ROW EXECUTE FUNCTION public.nomina_invalidar_revision_operativa();
DROP TRIGGER IF EXISTS trg_nomina_movimientos_invalida_revision ON public.nomina_movimientos;
CREATE TRIGGER trg_nomina_movimientos_invalida_revision AFTER INSERT OR UPDATE OR DELETE ON public.nomina_movimientos FOR EACH ROW EXECUTE FUNCTION public.nomina_invalidar_revision_operativa();
DROP TRIGGER IF EXISTS trg_nomina_asistencia_invalida_revision ON public.nomina_asistencia_diaria;
CREATE TRIGGER trg_nomina_asistencia_invalida_revision AFTER INSERT OR UPDATE OR DELETE ON public.nomina_asistencia_diaria FOR EACH ROW EXECUTE FUNCTION public.nomina_invalidar_revision_operativa();
DROP TRIGGER IF EXISTS trg_nomina_novedad_turnos_invalida_revision ON public.nomina_novedad_turnos;
CREATE TRIGGER trg_nomina_novedad_turnos_invalida_revision AFTER INSERT OR UPDATE OR DELETE ON public.nomina_novedad_turnos FOR EACH ROW EXECUTE FUNCTION public.nomina_invalidar_revision_operativa();
