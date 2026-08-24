ALTER TABLE nomina_tipos_novedad
  ADD COLUMN IF NOT EXISTS efecto_salario TEXT NOT NULL DEFAULT 'SIN_EFECTO',
  ADD COLUMN IF NOT EXISTS efecto_auxilio_transporte TEXT NOT NULL DEFAULT 'SIN_EFECTO',
  ADD COLUMN IF NOT EXISTS efecto_recargos_detallado TEXT NOT NULL DEFAULT 'SIN_EFECTO',
  ADD COLUMN IF NOT EXISTS efecto_liquidacion TEXT NOT NULL DEFAULT 'SIN_EFECTO',
  ADD COLUMN IF NOT EXISTS efecto_cobertura_config TEXT NOT NULL DEFAULT 'SIN_EFECTO',
  ADD COLUMN IF NOT EXISTS efecto_operativo TEXT NOT NULL DEFAULT 'SIN_EFECTO',
  ADD COLUMN IF NOT EXISTS modelo_registro TEXT NOT NULL DEFAULT 'POR_PERIODO',
  ADD COLUMN IF NOT EXISTS proyecta_periodos BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bloquea_otras_novedades BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS grupo_exclusividad TEXT NOT NULL DEFAULT 'NINGUNA',
  ADD COLUMN IF NOT EXISTS observacion_plantilla TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_salario'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_salario
      CHECK (efecto_salario IN ('SIN_EFECTO', 'DESCUENTA_PROPORCIONAL', 'LIQUIDACION_ESPECIAL', 'PENDIENTE_CONFIGURACION'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_auxilio_transporte'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_auxilio_transporte
      CHECK (efecto_auxilio_transporte IN ('SIN_EFECTO', 'DESCUENTA_DIA', 'PENDIENTE_CONFIGURACION'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_recargos_detallado'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_recargos_detallado
      CHECK (efecto_recargos_detallado IN ('SIN_EFECTO', 'EXCLUIR_DIA', 'PENDIENTE_CONFIGURACION'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_liquidacion'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_liquidacion
      CHECK (efecto_liquidacion IN ('SIN_EFECTO', 'PREPARAR_LIQUIDACION', 'PENDIENTE_CONFIGURACION'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_cobertura_config'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_cobertura_config
      CHECK (efecto_cobertura_config IN ('SIN_EFECTO', 'PENDIENTE_CONFIGURACION'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_operativo'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_operativo
      CHECK (efecto_operativo IN ('SIN_EFECTO', 'PENDIENTE_NOMINA_3'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_modelo_registro'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_modelo_registro
      CHECK (modelo_registro IN ('POR_PERIODO', 'EVENTO_CANONICO_RANGO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_grupo_exclusividad'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_grupo_exclusividad
      CHECK (grupo_exclusividad IN ('NINGUNA', 'LICENCIA_MATERNIDAD_PATERNIDAD'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS nomina_novedades_canonicas (
  id BIGSERIAL PRIMARY KEY,
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id) ON DELETE RESTRICT,
  tipo_novedad_id BIGINT NOT NULL REFERENCES nomina_tipos_novedad(id) ON DELETE RESTRICT,
  tipo_novedad_codigo_operativo TEXT NULL,
  documento_persona_id BIGINT NULL REFERENCES documentos_persona(id) ON DELETE SET NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  observacion TEXT NULL,
  origen TEXT NOT NULL DEFAULT 'NOMINA',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_nomina_novedades_canonicas_vinculacion_fecha
  ON nomina_novedades_canonicas (vinculacion_id, fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS idx_nomina_novedades_canonicas_tipo
  ON nomina_novedades_canonicas (tipo_novedad_id);

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = TRUE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = FALSE,
  grupo_exclusividad = 'NINGUNA',
  observacion_plantilla = 'Se descuenta transporte y recargos por {dias} dia/dias de no clase.'
WHERE codigo_operativo = 'L50';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta transporte por {dias} dia/dias de cita medica.'
WHERE codigo_operativo = 'PR1';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'PREPARAR_LIQUIDACION',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Incapacidad medica por {dias} dia/dias. Se descuenta transporte.'
WHERE codigo_operativo = 'PR2';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta transporte por {dias} dia/dias de calamidad familiar.'
WHERE codigo_operativo = 'PR3';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta transporte por {dias} dia/dias de citacion oficial.'
WHERE codigo_operativo = 'PR4';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = TRUE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = TRUE,
  afecta_recargos = TRUE,
  efecto_salario = 'DESCUENTA_PROPORCIONAL',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta salario, transporte y recargos por {dias} dia/dias de permiso no remunerado.'
WHERE codigo_operativo = 'PNR';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = TRUE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = TRUE,
  afecta_recargos = TRUE,
  efecto_salario = 'DESCUENTA_PROPORCIONAL',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta salario, transporte y recargos por {dias} dia/dias de suspension.'
WHERE codigo_operativo = 'S';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta transporte por {dias} dia/dias de licencia por luto.'
WHERE UPPER(nombre) = 'LUTO';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Se descuenta transporte por {dias} dia/dias de cita medica familiar.'
WHERE UPPER(TRANSLATE(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUAEIOUNN')) = 'CITA MEDICA FAMILIAR';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = TRUE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'DESCUENTA_DIA',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'PREPARAR_LIQUIDACION',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  observacion_plantilla = 'Incapacidad por accidente laboral por {dias} dia/dias. Se descuenta transporte.'
WHERE UPPER(nombre) = 'INCAPACIDAD POR ACCIDENTE LABORAL';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = FALSE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = TRUE,
  efecto_salario = 'PENDIENTE_CONFIGURACION',
  efecto_auxilio_transporte = 'PENDIENTE_CONFIGURACION',
  efecto_recargos_detallado = 'EXCLUIR_DIA',
  efecto_liquidacion = 'PREPARAR_LIQUIDACION',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  modelo_registro = 'EVENTO_CANONICO_RANGO',
  proyecta_periodos = TRUE,
  bloquea_otras_novedades = TRUE,
  grupo_exclusividad = 'LICENCIA_MATERNIDAD_PATERNIDAD',
  observacion_plantilla = 'Licencia de maternidad/paternidad del {fecha_inicio} al {fecha_fin}.'
WHERE UPPER(nombre) = 'LICENCIA MATERNIDAD/PATERNIDAD';

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = FALSE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'SIN_EFECTO',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'PENDIENTE_NOMINA_3',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = FALSE,
  grupo_exclusividad = 'NINGUNA'
WHERE UPPER(nombre) IN ('CAMBIO DE MODALIDAD', 'CAMBIO DE SEDE');

UPDATE nomina_tipos_novedad
SET
  afecta_salario = FALSE,
  afecta_transporte = FALSE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'SIN_EFECTO',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = FALSE,
  grupo_exclusividad = 'NINGUNA'
WHERE UPPER(nombre) IN ('ACCIDENTE DE TRABAJO', 'FECHA DE INGRESO', 'FECHA DE RETIRO');
