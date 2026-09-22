-- TA: turno adicional informativo. La titular puede permanecer presente.
-- El turno real de apoyo se registra aparte en TURNO_INTERNO o TURNO_EXTERNO.

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
  'TURNO ADICIONAL', 'NOMINA', FALSE, FALSE, FALSE, FALSE,
  TRUE, TRUE, FALSE, FALSE, TRUE, 'TA',
  'Día con apoyo adicional sin ausencia de la titular', FALSE, TRUE, FALSE, FALSE,
  FALSE, FALSE, FALSE, TRUE, FALSE,
  FALSE, FALSE, 'SIN_EFECTO', NULL, 'SIN_EFECTO',
  'SIN_EFECTO', 'SIN_EFECTO', 'SIN_EFECTO', 'SIN_EFECTO',
  'SIN_EFECTO', 'POR_PERIODO', FALSE, FALSE, 'NINGUNA',
  'Turno adicional informativo: la titular continúa presente; el apoyo se registra como turno separado.', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM nomina_tipos_novedad WHERE UPPER(COALESCE(codigo_operativo, '')) = 'TA'
);

UPDATE nomina_tipos_novedad
SET
  nombre = 'TURNO ADICIONAL',
  categoria = 'NOMINA',
  descripcion_operativa = 'Día con apoyo adicional sin ausencia de la titular',
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
  observacion_plantilla = 'Turno adicional informativo: la titular continúa presente; el apoyo se registra como turno separado.',
  permite_asistencia_simultanea = TRUE
WHERE UPPER(COALESCE(codigo_operativo, '')) = 'TA';
