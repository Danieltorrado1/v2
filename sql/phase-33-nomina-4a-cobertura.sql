ALTER TABLE nomina_empleados
  ADD COLUMN IF NOT EXISTS detalle_calculo JSONB NULL;

ALTER TABLE nomina_categorias_salariales
  ADD COLUMN IF NOT EXISTS vigente_desde DATE NULL,
  ADD COLUMN IF NOT EXISTS vigente_hasta DATE NULL;

ALTER TABLE nomina_categorias_salariales
  DROP CONSTRAINT IF EXISTS nomina_categorias_salariales_contrato_id_codigo_categoria_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_categoria_salarial_vigencia'
      AND conrelid = 'nomina_categorias_salariales'::regclass
  ) THEN
    ALTER TABLE nomina_categorias_salariales
      ADD CONSTRAINT chk_nomina_categoria_salarial_vigencia
      CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_nomina_categoria_salarial_contrato_vigencia
  ON nomina_categorias_salariales (contrato_id, activo, vigente_desde, vigente_hasta, id);

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ex_nomina_categoria_salarial_sin_solape'
      AND conrelid = 'nomina_categorias_salariales'::regclass
  ) THEN
    ALTER TABLE nomina_categorias_salariales
      ADD CONSTRAINT ex_nomina_categoria_salarial_sin_solape
      EXCLUDE USING gist (
        contrato_id WITH =,
        (UPPER(BTRIM(codigo_categoria))) WITH =,
        (DATERANGE(COALESCE(vigente_desde, '-infinity'::date), COALESCE(vigente_hasta, 'infinity'::date), '[]')) WITH &&
      ) WHERE (activo = TRUE);
  END IF;
END;
$$;

-- Reutiliza los triggers de phase-32 y endurece su función: solo una fuente de un
-- período editable puede invalidar, y cualquier estado previo pasa a revisión.
CREATE OR REPLACE FUNCTION public.nomina_invalidar_revision_operativa()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_periodo BIGINT; v_empleado BIGINT; v_persona BIGINT; v_vinculacion BIGINT; v_reason TEXT; v_family TEXT; v_record BIGINT;
BEGIN
  v_periodo := COALESCE(NEW.periodo_id, OLD.periodo_id);
  IF NOT EXISTS (SELECT 1 FROM nomina_periodos WHERE id=v_periodo AND estado='ABIERTO') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='nomina_asistencia_diaria' THEN
    SELECT ne.id INTO v_empleado FROM nomina_empleados ne
    WHERE ne.periodo_id=v_periodo AND ne.vinculacion_id=COALESCE(NEW.vinculacion_id, OLD.vinculacion_id)
    ORDER BY ne.id LIMIT 1;
  ELSE v_empleado := COALESCE(NEW.nomina_empleado_id, OLD.nomina_empleado_id); END IF;
  v_reason := CASE WHEN TG_TABLE_NAME='nomina_novedades' THEN CASE WHEN TG_OP='INSERT' THEN 'NOVEDAD_CREADA' WHEN TG_OP='DELETE' THEN 'NOVEDAD_DESACTIVADA' ELSE 'NOVEDAD_MODIFICADA' END
    WHEN TG_TABLE_NAME='nomina_asistencia_diaria' THEN 'ASISTENCIA_MODIFICADA'
    WHEN TG_TABLE_NAME='nomina_movimientos' THEN 'TA_MODIFICADO' ELSE TG_TABLE_NAME||'_MODIFICADA' END;
  IF TG_TABLE_NAME='nomina_movimientos' THEN
    v_record := COALESCE(NEW.id, OLD.id);
    EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record;
    IF v_family='CAMBIO_OPERATIVO' THEN v_reason := 'CAMBIO_OPERATIVO_MODIFICADO'; END IF;
  END IF;
  IF v_empleado IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  SELECT ne.vinculacion_id,v.persona_id INTO v_vinculacion,v_persona FROM nomina_empleados ne
    JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE ne.id=v_empleado LIMIT 1;
  IF v_persona IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,invalidado_at,motivo_invalidacion,updated_at)
  VALUES(v_periodo,v_empleado,v_persona,v_vinculacion,'REQUIERE_REVISION',NOW(),v_reason,NOW())
  ON CONFLICT(periodo_id,nomina_empleado_id) DO UPDATE SET estado_revision='REQUIERE_REVISION',revisado_por=NULL,revisado_at=NULL,
    invalidado_at=NOW(),motivo_invalidacion=v_reason,version_revision=nomina_revision_operativa.version_revision+1,updated_at=NOW();
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

CREATE OR REPLACE FUNCTION nomina_invalidar_revision_condicion_economica() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  IF LOWER(BTRIM(COALESCE(NEW.tipo_condicion, OLD.tipo_condicion))) <> 'aporta_pension' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  FOR r IN
    SELECT np.id AS periodo_id, ne.id AS nomina_empleado_id, ne.vinculacion_id
    FROM nomina_periodos np JOIN nomina_empleados ne ON ne.periodo_id = np.id
    WHERE ne.vinculacion_id = COALESCE(NEW.vinculacion_id, OLD.vinculacion_id)
      AND np.estado = 'ABIERTO'
      AND np.fecha_fin >= COALESCE(NEW.vigencia_desde, OLD.vigencia_desde)
      AND np.fecha_inicio <= COALESCE(NEW.vigencia_hasta, OLD.vigencia_hasta, 'infinity'::date)
  LOOP
    INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,invalidado_at,motivo_invalidacion,updated_at)
    SELECT r.periodo_id,r.nomina_empleado_id,v.persona_id,r.vinculacion_id,'REQUIERE_REVISION',NOW(),'FUENTE_APORTA_PENSION',NOW()
    FROM vinculaciones v WHERE v.id=r.vinculacion_id
    ON CONFLICT(periodo_id,nomina_empleado_id) DO UPDATE SET estado_revision='REQUIERE_REVISION',revisado_por=NULL,revisado_at=NULL,
      invalidado_at=NOW(),motivo_invalidacion='FUENTE_APORTA_PENSION',version_revision=nomina_revision_operativa.version_revision+1,updated_at=NOW();
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_vinculacion_condicion_revision ON vinculacion_condiciones_economicas;
CREATE TRIGGER trg_vinculacion_condicion_revision
  AFTER INSERT OR UPDATE OR DELETE ON vinculacion_condiciones_economicas
  FOR EACH ROW
  EXECUTE FUNCTION nomina_invalidar_revision_condicion_economica();

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'DNC',
  nombre = 'DIA NO CLASE',
  descripcion_operativa = 'Conserva salario. Descuenta recargos y transporte. Conserva cotizacion SS.',
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = TRUE,
  afecta_cobertura = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = FALSE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  observacion_plantilla = 'Se conserva salario y se descuentan recargos/transporte por {dias} dia/dias no clase.',
  activo = TRUE
WHERE UPPER(COALESCE(codigo_operativo, '')) = 'L50'
   OR UPPER(BTRIM(COALESCE(nombre, ''))) IN ('DIA NO CLASE', 'DIAS DE NO CLASE', 'D�A NO CLASE', 'D�AS DE NO CLASE');

UPDATE nomina_tipos_novedad
SET
  descripcion_operativa = 'Permiso remunerado administrativo. Conserva salario y recargos. Descuenta transporte. Conserva cotizacion SS.',
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  afecta_cobertura = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  activo = TRUE
WHERE UPPER(COALESCE(codigo_operativo, '')) IN ('PR1', 'PR3', 'PR4');

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'INC_GENERAL',
  nombre = 'INCAPACIDAD GENERAL',
  descripcion_operativa = 'Conserva salario y recargos. Descuenta transporte. Conserva cotizacion SS.',
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  afecta_cobertura = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = TRUE,
  es_accidente_laboral = FALSE,
  es_permiso = FALSE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  observacion_plantilla = 'Se conserva salario y recargos; se descuenta transporte por {dias} dia/dias de incapacidad general.',
  activo = TRUE
WHERE id = 4
   OR UPPER(BTRIM(COALESCE(nombre, ''))) LIKE 'INCAPACIDAD%GENERAL'
   OR UPPER(COALESCE(codigo_operativo, '')) = 'INC_GENERAL';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PR2',
  descripcion_operativa = 'Permiso remunerado administrativo. Conserva salario y recargos. Descuenta transporte. Conserva cotizacion SS.',
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  afecta_cobertura = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  activo = TRUE
WHERE id = 3;

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'INC_ARL',
  nombre = 'INCAPACIDAD ARL',
  descripcion_operativa = 'Conserva salario y recargos. Descuenta transporte. Conserva cotizacion SS.',
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  afecta_cobertura = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = TRUE,
  es_accidente_laboral = TRUE,
  es_permiso = FALSE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  observacion_plantilla = 'Se conserva salario y recargos; se descuenta transporte por {dias} dia/dias de incapacidad ARL.',
  activo = TRUE
WHERE UPPER(BTRIM(COALESCE(nombre, ''))) IN ('INCAPACIDAD POR ACCIDENTE LABORAL', 'INCAPACIDAD ARL')
   OR UPPER(COALESCE(codigo_operativo, '')) IN ('INC_ARL', 'INCAP_ACL');

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PNR',
  nombre = 'PERMISO NO REMUNERADO',
  descripcion_operativa = 'Descuenta salario, recargos y transporte. Conserva cotizacion SS.',
  afecta_salario = TRUE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = TRUE,
  afecta_recargos = TRUE,
  afecta_cobertura = FALSE,
  efecto_salario = 'DESCUENTA_PROPORCIONAL',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  observacion_plantilla = 'Se descuenta salario, recargos y transporte por {dias} dia/dias de permiso no remunerado.',
  activo = TRUE
WHERE UPPER(COALESCE(codigo_operativo, '')) = 'PNR'
   OR UPPER(BTRIM(COALESCE(nombre, ''))) = 'PERMISO NO REMUNERADO';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'S',
  nombre = 'SUSPENSION',
  descripcion_operativa = 'Descuenta salario, recargos y transporte. Conserva cotizacion SS.',
  afecta_salario = TRUE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = TRUE,
  afecta_recargos = TRUE,
  afecta_cobertura = FALSE,
  efecto_salario = 'DESCUENTA_PROPORCIONAL',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'NINGUNA',
  requiere_fechas = TRUE,
  requiere_dias = TRUE,
  requiere_horas = FALSE,
  requiere_valor = FALSE,
  requiere_revision = TRUE,
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = FALSE,
  es_suspension = TRUE,
  es_evento_operativo = FALSE,
  soporte_documento_tipo = NULL,
  observacion_plantilla = 'Se descuenta salario, recargos y transporte por {dias} dia/dias de suspension.',
  activo = TRUE
WHERE UPPER(COALESCE(codigo_operativo, '')) = 'S'
   OR UPPER(BTRIM(COALESCE(nombre, ''))) IN ('SUSPENSION', 'SUSPENSI�N');

INSERT INTO nomina_tipos_novedad (
  nombre, categoria, afecta_salario, afecta_transporte, es_adicion, es_deduccion,
  requiere_fechas, requiere_dias, requiere_horas, requiere_valor, activo, codigo_operativo,
  descripcion_operativa, requiere_soporte, permite_rango, requiere_revision, es_incapacidad,
  es_accidente_laboral, es_permiso, es_suspension, es_evento_operativo, afecta_dias_laborados,
  afecta_recargos, afecta_cobertura, efecto_pago, soporte_documento_tipo, efecto_salario,
  efecto_auxilio_transporte, efecto_recargos_detallado, efecto_liquidacion, efecto_cobertura_config,
  efecto_operativo, modelo_registro, proyecta_periodos, bloquea_otras_novedades, grupo_exclusividad,
  observacion_plantilla
)
SELECT
  'FALLA NO JUSTIFICADA', 'NOMINA', TRUE, TRUE, FALSE, FALSE,
  TRUE, TRUE, FALSE, FALSE, TRUE, 'FNJ',
  'Descuenta salario, recargos y transporte. Conserva cotizacion SS.', FALSE, TRUE, TRUE, FALSE,
  FALSE, FALSE, FALSE, FALSE, TRUE,
  TRUE, FALSE, 'PENDIENTE_CONFIGURACION', NULL, 'DESCUENTA_PROPORCIONAL',
  'DESCUENTA_DIA', 'EXCLUIR_DIA', 'SIN_EFECTO', 'SIN_EFECTO',
  'SIN_EFECTO', 'POR_PERIODO', FALSE, TRUE, 'NINGUNA',
  'Se descuenta salario, recargos y transporte por {dias} dia/dias de falla no justificada.'
WHERE NOT EXISTS (
  SELECT 1
  FROM nomina_tipos_novedad
  WHERE UPPER(COALESCE(codigo_operativo, '')) = 'FNJ'
);
