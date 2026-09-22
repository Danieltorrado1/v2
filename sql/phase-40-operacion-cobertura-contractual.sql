-- Fase 40: cobertura contractual de manipuladoras.
-- Reutiliza calculadora_personal_config/rangos creada en phase-22-1.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE calculadora_personal_config
  ADD COLUMN IF NOT EXISTS multiplicador_raciones numeric(12,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fuente text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

ALTER TABLE calculadora_personal_rangos
  ADD COLUMN IF NOT EXISTS minimo_incluido integer,
  ADD COLUMN IF NOT EXISTS maximo_incluido integer,
  ADD COLUMN IF NOT EXISTS mensaje_operativo text;

UPDATE calculadora_personal_rangos
SET minimo_incluido = desde,
    maximo_incluido = hasta
WHERE minimo_incluido IS NULL;

ALTER TABLE calculadora_personal_rangos
  ALTER COLUMN minimo_incluido SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calc_rango_minimo_no_negativo') THEN
    ALTER TABLE calculadora_personal_rangos ADD CONSTRAINT chk_calc_rango_minimo_no_negativo CHECK (minimo_incluido >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calc_rango_maximo_valido') THEN
    ALTER TABLE calculadora_personal_rangos ADD CONSTRAINT chk_calc_rango_maximo_valido CHECK (maximo_incluido IS NULL OR maximo_incluido >= minimo_incluido);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calc_rango_personal_no_negativo') THEN
    ALTER TABLE calculadora_personal_rangos ADD CONSTRAINT chk_calc_rango_personal_no_negativo CHECK (personal_requerido >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_calc_multiplicador_positivo') THEN
    ALTER TABLE calculadora_personal_config ADD CONSTRAINT chk_calc_multiplicador_positivo CHECK (multiplicador_raciones > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_calc_rangos_sin_solape') THEN
    ALTER TABLE calculadora_personal_rangos ADD CONSTRAINT ex_calc_rangos_sin_solape
      EXCLUDE USING gist (
        config_id WITH =,
        int8range(minimo_incluido::bigint, COALESCE((maximo_incluido + 1)::bigint, 9223372036854775807), '[)') WITH &&
      ) WHERE (estado = 'activo');
  END IF;
END $$;

DROP INDEX IF EXISTS uq_calc_personal_activo_contexto;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calc_regla_activa_contrato_modalidad_inicio
  ON calculadora_personal_config (COALESCE(contrato_id, 0), COALESCE(modalidad_id, 0), vigencia_desde)
  WHERE estado = 'activo';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ex_calc_reglas_vigencia_sin_solape') THEN
    ALTER TABLE calculadora_personal_config ADD CONSTRAINT ex_calc_reglas_vigencia_sin_solape
      EXCLUDE USING gist (
        COALESCE(contrato_id, 0) WITH =,
        COALESCE(modalidad_id, 0) WITH =,
        daterange(vigencia_desde, COALESCE(vigencia_hasta, 'infinity'::date), '[]') WITH &&
      ) WHERE (estado = 'activo');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_calc_regla_aplicable
  ON calculadora_personal_config (contrato_id, modalidad_id, estado, vigencia_desde, vigencia_hasta);

UPDATE calculadora_personal_config
SET multiplicador_raciones = CASE WHEN UPPER(COALESCE(modalidad, '')) = 'CAARES' THEN 4 ELSE 1 END,
    fuente = COALESCE(fuente, 'Pliego contractual PAE'),
    observaciones = COALESCE(observaciones, 'Regla contractual versionada; 801 o más se normaliza al rango abierto superior.')
WHERE dominio_calculo = 'COBERTURA_PAE';

UPDATE calculadora_personal_rangos
SET mensaje_operativo = 'Entrega a cargo del delegado del Comité de Alimentación Escolar'
FROM calculadora_personal_config c
JOIN modalidades m ON m.id = c.modalidad_id
WHERE calculadora_personal_rangos.config_id = c.id
  AND UPPER(COALESCE(m.codigo_original, '')) IN ('CAJM/JT-RI', 'CAJU-RI')
  AND calculadora_personal_rangos.minimo_incluido = 0
  AND calculadora_personal_rangos.maximo_incluido = 100;

-- Mapeo explícito: no se infiere por texto en el endpoint.
COMMENT ON TABLE calculadora_personal_config IS 'Reglas contractuales versionadas para cobertura de personal en Operación';
COMMENT ON COLUMN calculadora_personal_config.modalidad_id IS 'Modalidad operativa real; CAA/CAA-JU=almuerzo, CAARES=residencias, CAJM/JT-RI/CAJU-RI=industrializada';

INSERT INTO permisos (modulo, accion, descripcion, activo) VALUES
  ('operacion.cobertura', 'read', 'Consultar cobertura contractual de manipuladoras', TRUE),
  ('operacion.cobertura', 'manage', 'Administrar vigencias de reglas de cobertura contractual', TRUE)
ON CONFLICT (modulo, accion) DO UPDATE SET descripcion=EXCLUDED.descripcion, activo=TRUE;

INSERT INTO rol_permisos (rol_id, permiso_id, activo)
SELECT r.id, p.id, TRUE
FROM roles r CROSS JOIN permisos p
WHERE r.nombre_rol='ADMINISTRADOR' AND p.modulo='operacion.cobertura' AND p.accion IN ('read','manage')
ON CONFLICT (rol_id, permiso_id) DO UPDATE SET activo=TRUE;
