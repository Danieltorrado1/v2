CREATE TABLE IF NOT EXISTS contrato_ubicaciones_laborales (
  id BIGSERIAL PRIMARY KEY,
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  nombre_ubicacion TEXT NOT NULL,
  descripcion TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_ubicaciones_laborales_nombre_activo
  ON contrato_ubicaciones_laborales (
    contrato_id,
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(BTRIM(nombre_ubicacion)),
        'áéíóúàèìòùäëïöüâêîôûñ',
        'aeiouaeiouaeiouaeioun'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_contrato_ubicaciones_laborales_contrato
  ON contrato_ubicaciones_laborales (contrato_id, activo, id);

CREATE TABLE IF NOT EXISTS personal_asignaciones_laborales (
  id BIGSERIAL PRIMARY KEY,
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  ubicacion_laboral_id BIGINT NOT NULL REFERENCES contrato_ubicaciones_laborales(id),
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  estado TEXT NOT NULL DEFAULT 'ACTIVA',
  origen TEXT NOT NULL DEFAULT 'MANUAL',
  observacion TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_personal_asignaciones_laborales_estado
    CHECK (estado IN ('ACTIVA', 'FINALIZADA', 'ANULADA')),
  CONSTRAINT chk_personal_asignaciones_laborales_origen
    CHECK (origen IN ('MANUAL', 'IMPORTACION', 'AJUSTE')),
  CONSTRAINT chk_personal_asignaciones_laborales_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_personal_asignaciones_laborales_vinculacion
  ON personal_asignaciones_laborales (vinculacion_id, vigencia_desde DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_personal_asignaciones_laborales_contrato
  ON personal_asignaciones_laborales (contrato_id, estado, vigencia_desde DESC, id DESC);

CREATE TABLE IF NOT EXISTS contrato_perfiles_licitacion (
  id BIGSERIAL PRIMARY KEY,
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  codigo_perfil TEXT NOT NULL,
  nombre_perfil TEXT NOT NULL,
  cantidad_requerida INTEGER NOT NULL,
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  contrato_cargo_equivalente_id BIGINT NULL REFERENCES contrato_cargos(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contrato_perfiles_licitacion_cantidad
    CHECK (cantidad_requerida >= 0),
  CONSTRAINT chk_contrato_perfiles_licitacion_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_perfiles_licitacion_codigo_vigencia
  ON contrato_perfiles_licitacion (
    contrato_id,
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(BTRIM(codigo_perfil)),
        'áéíóúàèìòùäëïöüâêîôûñ',
        'aeiouaeiouaeiouaeioun'
      ),
      '\s+',
      ' ',
      'g'
    ),
    vigencia_desde,
    COALESCE(vigencia_hasta, DATE '9999-12-31')
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_contrato_perfiles_licitacion_nombre_vigencia
  ON contrato_perfiles_licitacion (
    contrato_id,
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(BTRIM(nombre_perfil)),
        'áéíóúàèìòùäëïöüâêîôûñ',
        'aeiouaeiouaeiouaeioun'
      ),
      '\s+',
      ' ',
      'g'
    ),
    vigencia_desde,
    COALESCE(vigencia_hasta, DATE '9999-12-31')
  );

CREATE INDEX IF NOT EXISTS idx_contrato_perfiles_licitacion_contrato
  ON contrato_perfiles_licitacion (contrato_id, activo, vigencia_desde DESC, id DESC);

CREATE TABLE IF NOT EXISTS personal_presentaciones_licitacion (
  id BIGSERIAL PRIMARY KEY,
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id),
  contrato_id BIGINT NOT NULL REFERENCES contratos(id),
  perfil_licitacion_id BIGINT NOT NULL REFERENCES contrato_perfiles_licitacion(id),
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  estado TEXT NOT NULL DEFAULT 'PRESENTADA',
  cumple_requisitos BOOLEAN NULL,
  observacion TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_personal_presentaciones_licitacion_estado
    CHECK (estado IN ('PRESENTADA', 'RETIRADA', 'REEMPLAZADA', 'ANULADA')),
  CONSTRAINT chk_personal_presentaciones_licitacion_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_personal_presentaciones_licitacion_vinculacion
  ON personal_presentaciones_licitacion (vinculacion_id, vigencia_desde DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_personal_presentaciones_licitacion_contrato
  ON personal_presentaciones_licitacion (contrato_id, estado, vigencia_desde DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_personal_presentaciones_licitacion_perfil
  ON personal_presentaciones_licitacion (perfil_licitacion_id, estado, vigencia_desde DESC, id DESC);

DO $phase23$
DECLARE
  expected_definition TEXT := 'CHECK (((metodo_pago IS NULL) OR (metodo_pago = ANY (ARRAY[''COBERTURA''::text, ''ASISTENCIA''::text, ''CASO_ESPECIAL''::text, ''CATEGORIA''::text, ''OPS_CUENTA_COBRO''::text, ''OPS_VALOR_FIJO''::text, ''OPS_POR_PRODUCTO''::text]))))';
  current_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
  INTO current_definition
  FROM pg_constraint con
  INNER JOIN pg_class cls ON cls.oid = con.conrelid
  INNER JOIN pg_namespace nsp ON nsp.oid = con.connamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname = 'vinculaciones'
    AND con.conname = 'chk_vinculaciones_metodo_pago'
  LIMIT 1;

  IF current_definition IS DISTINCT FROM expected_definition THEN
    IF current_definition IS NOT NULL THEN
      EXECUTE 'ALTER TABLE vinculaciones DROP CONSTRAINT chk_vinculaciones_metodo_pago';
    END IF;

    EXECUTE $sql$
      ALTER TABLE vinculaciones
      ADD CONSTRAINT chk_vinculaciones_metodo_pago
      CHECK (
        metodo_pago IS NULL
        OR metodo_pago = ANY (
          ARRAY[
            'COBERTURA'::text,
            'ASISTENCIA'::text,
            'CASO_ESPECIAL'::text,
            'CATEGORIA'::text,
            'OPS_CUENTA_COBRO'::text,
            'OPS_VALOR_FIJO'::text,
            'OPS_POR_PRODUCTO'::text
          ]
        )
      )
    $sql$;
  END IF;
END;
$phase23$;
