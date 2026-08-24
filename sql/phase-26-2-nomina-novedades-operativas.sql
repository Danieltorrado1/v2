ALTER TABLE nomina_tipos_novedad
  ADD COLUMN IF NOT EXISTS codigo_operativo TEXT NULL,
  ADD COLUMN IF NOT EXISTS descripcion_operativa TEXT NULL,
  ADD COLUMN IF NOT EXISTS requiere_soporte BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS permite_rango BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requiere_revision BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_incapacidad BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_accidente_laboral BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_permiso BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_suspension BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_evento_operativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS afecta_dias_laborados BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS afecta_recargos BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS afecta_cobertura BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS efecto_pago TEXT NOT NULL DEFAULT 'PENDIENTE_CONFIGURACION',
  ADD COLUMN IF NOT EXISTS soporte_documento_tipo TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nomina_tipos_novedad_efecto_pago'
  ) THEN
    ALTER TABLE nomina_tipos_novedad
      ADD CONSTRAINT chk_nomina_tipos_novedad_efecto_pago
      CHECK (
        efecto_pago IN ('PENDIENTE_CONFIGURACION', 'SIN_EFECTO', 'REDUCE', 'AUMENTA', 'MIXTO')
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_tipos_novedad_codigo_operativo
  ON nomina_tipos_novedad (UPPER(codigo_operativo))
  WHERE codigo_operativo IS NOT NULL;

ALTER TABLE nomina_novedades
  ADD COLUMN IF NOT EXISTS tipo_novedad_codigo_operativo TEXT NULL,
  ADD COLUMN IF NOT EXISTS documento_persona_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomina_novedades_documento_persona_id_fkey'
  ) THEN
    ALTER TABLE nomina_novedades
      ADD CONSTRAINT nomina_novedades_documento_persona_id_fkey
      FOREIGN KEY (documento_persona_id)
      REFERENCES documentos_persona(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nomina_novedades_documento_persona_id
  ON nomina_novedades (documento_persona_id);

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'L50',
  descripcion_operativa = 'Dia de no clase',
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = FALSE,
  es_suspension = FALSE,
  es_evento_operativo = TRUE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(TRANSLATE(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUAEIOUNN')) = 'DIAS DE NO CLASE';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PR1',
  descripcion_operativa = 'Cita medica',
  requiere_soporte = TRUE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(TRANSLATE(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUAEIOUNN')) = 'CITA MEDICA';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PR2',
  descripcion_operativa = 'Incapacidad medica',
  requiere_soporte = TRUE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = TRUE,
  es_accidente_laboral = FALSE,
  es_permiso = FALSE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(TRANSLATE(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUAEIOUNN')) = 'INCAPACIDAD MEDICA';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PR3',
  descripcion_operativa = 'Calamidad familiar',
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(nombre) = 'CALAMIDAD FAMILIAR';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PR4',
  descripcion_operativa = 'Citaciones escolares, fiscales, judiciales u oficiales',
  requiere_soporte = TRUE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(nombre) = 'CITACIONES OFICIALES';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'PNR',
  descripcion_operativa = 'Permiso no remunerado',
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = TRUE,
  es_suspension = FALSE,
  es_evento_operativo = FALSE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(nombre) = 'PERMISO NO REMUNERADO';

UPDATE nomina_tipos_novedad
SET
  codigo_operativo = 'S',
  descripcion_operativa = 'Suspension',
  requiere_soporte = FALSE,
  permite_rango = TRUE,
  requiere_revision = TRUE,
  es_incapacidad = FALSE,
  es_accidente_laboral = FALSE,
  es_permiso = FALSE,
  es_suspension = TRUE,
  es_evento_operativo = FALSE,
  efecto_pago = 'PENDIENTE_CONFIGURACION',
  soporte_documento_tipo = 'NOMINA_NOVEDAD'
WHERE UPPER(TRANSLATE(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUAEIOUNN')) = 'SUSPENSION';

UPDATE nomina_tipos_novedad
SET
  descripcion_operativa = COALESCE(descripcion_operativa, 'Cita medica familiar'),
  soporte_documento_tipo = COALESCE(soporte_documento_tipo, 'NOMINA_NOVEDAD')
WHERE UPPER(TRANSLATE(nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUAEIOUNN')) = 'CITA MEDICA FAMILIAR';

UPDATE nomina_tipos_novedad
SET
  es_incapacidad = TRUE,
  es_accidente_laboral = TRUE,
  descripcion_operativa = COALESCE(descripcion_operativa, 'Incapacidad por accidente laboral'),
  soporte_documento_tipo = COALESCE(soporte_documento_tipo, 'NOMINA_NOVEDAD')
WHERE UPPER(nombre) = 'INCAPACIDAD POR ACCIDENTE LABORAL';

UPDATE nomina_tipos_novedad
SET
  descripcion_operativa = COALESCE(descripcion_operativa, 'Luto'),
  soporte_documento_tipo = COALESCE(soporte_documento_tipo, 'NOMINA_NOVEDAD')
WHERE UPPER(nombre) = 'LUTO';

UPDATE nomina_tipos_novedad
SET
  descripcion_operativa = COALESCE(descripcion_operativa, 'Licencia maternidad/paternidad'),
  soporte_documento_tipo = COALESCE(soporte_documento_tipo, 'NOMINA_NOVEDAD')
WHERE UPPER(nombre) = 'LICENCIA MATERNIDAD/PATERNIDAD';

UPDATE nomina_tipos_novedad
SET
  es_evento_operativo = TRUE,
  descripcion_operativa = COALESCE(
    descripcion_operativa,
    'Fecha de ingreso derivada de la vinculacion'
  )
WHERE UPPER(nombre) = 'FECHA DE INGRESO';

UPDATE nomina_tipos_novedad
SET
  es_evento_operativo = TRUE,
  descripcion_operativa = COALESCE(
    descripcion_operativa,
    'Fecha de retiro derivada de la vinculacion'
  )
WHERE UPPER(nombre) = 'FECHA DE RETIRO';

UPDATE nomina_tipos_novedad
SET
  es_evento_operativo = TRUE,
  descripcion_operativa = COALESCE(descripcion_operativa, 'Cambio operativo de modalidad')
WHERE UPPER(nombre) = 'CAMBIO DE MODALIDAD';

UPDATE nomina_tipos_novedad
SET
  es_evento_operativo = TRUE,
  descripcion_operativa = COALESCE(descripcion_operativa, 'Cambio operativo de sede')
WHERE UPPER(nombre) = 'CAMBIO DE SEDE';

UPDATE nomina_tipos_novedad
SET
  es_accidente_laboral = TRUE,
  descripcion_operativa = COALESCE(descripcion_operativa, 'Accidente de trabajo'),
  soporte_documento_tipo = COALESCE(soporte_documento_tipo, 'NOMINA_NOVEDAD')
WHERE UPPER(nombre) = 'ACCIDENTE DE TRABAJO';

UPDATE nomina_novedades nn
SET tipo_novedad_codigo_operativo = ntn.codigo_operativo
FROM nomina_tipos_novedad ntn
WHERE ntn.id = nn.tipo_novedad_id
  AND nn.tipo_novedad_codigo_operativo IS DISTINCT FROM ntn.codigo_operativo;
