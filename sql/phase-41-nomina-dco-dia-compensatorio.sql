-- DCO: día compensatorio. Es un registro operativo neutro y no representa ausencia.
-- Idempotente: puede ejecutarse después de las fases de catálogo y matriz de efectos.

ALTER TABLE nomina_tipos_novedad
  ADD COLUMN IF NOT EXISTS permite_asistencia_simultanea BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO nomina_tipos_novedad (
  nombre, categoria, afecta_salario, afecta_transporte, es_adicion, es_deduccion,
  requiere_fechas, requiere_dias, requiere_horas, requiere_valor, activo, codigo_operativo,
  descripcion_operativa, requiere_soporte, permite_rango, requiere_revision, es_incapacidad,
  es_accidente_laboral, es_permiso, es_suspension, es_evento_operativo, afecta_dias_laborados,
  afecta_recargos, afecta_cobertura, efecto_pago, soporte_documento_tipo, efecto_salario,
  efecto_auxilio_transporte, efecto_recargos_detallado, efecto_liquidacion, efecto_cobertura_config,
  efecto_operativo, modelo_registro, proyecta_periodos, bloquea_otras_novedades, grupo_exclusividad,
  observacion_plantilla, permite_asistencia_simultanea
)
SELECT
  'Día compensatorio', 'NOMINA', FALSE, FALSE, FALSE, FALSE,
  TRUE, TRUE, FALSE, FALSE, TRUE, 'DCO',
  'Día compensatorio sin efecto económico', FALSE, TRUE, FALSE, FALSE,
  FALSE, FALSE, FALSE, TRUE, FALSE,
  FALSE, FALSE, 'SIN_EFECTO', NULL, 'SIN_EFECTO',
  'SIN_EFECTO', 'SIN_EFECTO', 'SIN_EFECTO', 'SIN_EFECTO',
  'SIN_EFECTO', 'POR_PERIODO', FALSE, FALSE, 'NINGUNA',
  'Día compensatorio: no descuenta salario, transporte ni recargos y no genera liquidación por sí solo.', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM nomina_tipos_novedad WHERE UPPER(COALESCE(codigo_operativo, '')) = 'DCO'
);

UPDATE nomina_tipos_novedad
SET
  nombre = 'Día compensatorio',
  categoria = 'NOMINA',
  descripcion_operativa = 'Día compensatorio sin efecto económico',
  afecta_salario = FALSE,
  afecta_transporte = FALSE,
  afecta_dias_laborados = FALSE,
  afecta_recargos = FALSE,
  afecta_cobertura = FALSE,
  es_adicion = FALSE,
  es_deduccion = FALSE,
  es_permiso = FALSE,
  es_suspension = FALSE,
  es_evento_operativo = TRUE,
  efecto_pago = 'SIN_EFECTO',
  efecto_salario = 'SIN_EFECTO',
  efecto_auxilio_transporte = 'SIN_EFECTO',
  efecto_recargos_detallado = 'SIN_EFECTO',
  efecto_liquidacion = 'SIN_EFECTO',
  efecto_cobertura_config = 'SIN_EFECTO',
  efecto_operativo = 'SIN_EFECTO',
  modelo_registro = 'POR_PERIODO',
  proyecta_periodos = FALSE,
  bloquea_otras_novedades = FALSE,
  grupo_exclusividad = 'NINGUNA',
  observacion_plantilla = 'Día compensatorio: no descuenta salario, transporte ni recargos y no genera liquidación por sí solo.',
  permite_asistencia_simultanea = TRUE
WHERE UPPER(COALESCE(codigo_operativo, '')) = 'DCO';
