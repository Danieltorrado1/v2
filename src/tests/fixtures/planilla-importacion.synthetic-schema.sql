-- New V1 import receipts. Review/apply only to an explicitly selected local DB.
-- Application requests never create tables. No production migration is run.
CREATE TABLE IF NOT EXISTS nomina_planilla_importaciones (
  id uuid PRIMARY KEY,
  template_key text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  file_hash text NOT NULL,
  periodo_id bigint NOT NULL REFERENCES nomina_periodos(id),
  empresa_id bigint NOT NULL,
  contrato_id bigint NOT NULL,
  usuario_id bigint NOT NULL REFERENCES usuarios(id),
  confirmado_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  motivo text NOT NULL CHECK (length(motivo) >= 10),
  resultado jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nomina_planilla_importacion_operaciones (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  importacion_id uuid NOT NULL REFERENCES nomina_planilla_importaciones(id),
  usuario_id bigint NOT NULL REFERENCES usuarios(id),
  fecha_evento timestamptz NOT NULL DEFAULT clock_timestamp(),
  origen text NOT NULL DEFAULT 'EXCEL_OPERATIVO' CHECK (origen = 'EXCEL_OPERATIVO'),
  municipio_id bigint NOT NULL,
  nomina_empleado_id bigint NOT NULL REFERENCES nomina_empleados(id),
  vinculacion_id bigint NOT NULL,
  fecha date NOT NULL,
  accion text NOT NULL CHECK (accion IN ('CREAR','SUSTITUIR','ASISTENCIA','MODIFICAR_RANGO')),
  contexto jsonb NOT NULL,
  anteriores jsonb NOT NULL,
  nuevos jsonb NOT NULL,
  motivo text NOT NULL,
  UNIQUE(importacion_id, nomina_empleado_id, fecha)
);
