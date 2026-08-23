CREATE TABLE IF NOT EXISTS persona_cuentas_bancarias (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES personas(id) ON DELETE RESTRICT,
  entidad_bancaria TEXT NOT NULL,
  tipo_cuenta TEXT NOT NULL CHECK (tipo_cuenta IN ('AHORROS', 'CORRIENTE', 'OTRA')),
  numero_cuenta TEXT NOT NULL,
  titular TEXT NOT NULL DEFAULT 'PERSONA',
  nombre_titular TEXT NULL,
  documento_titular TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'VERIFICADA', 'RECHAZADA', 'INACTIVA')),
  fecha_verificacion DATE NULL,
  observaciones TEXT NULL,
  soporte_documento_persona_id BIGINT NULL REFERENCES documentos_persona(id) ON DELETE SET NULL,
  vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta DATE NULL,
  es_vigente BOOLEAN NOT NULL DEFAULT TRUE,
  verified_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_cuentas_bancarias_persona_id
  ON persona_cuentas_bancarias (persona_id);

CREATE INDEX IF NOT EXISTS idx_persona_cuentas_bancarias_persona_vigente
  ON persona_cuentas_bancarias (persona_id, es_vigente, vigencia_desde DESC);

CREATE TABLE IF NOT EXISTS personal_export_templates (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  campos JSONB NOT NULL,
  orden JSONB NOT NULL,
  formato TEXT NOT NULL DEFAULT 'csv',
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_export_templates_nombre
  ON personal_export_templates (LOWER(nombre));

CREATE TABLE IF NOT EXISTS personal_bank_export_profiles (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  banco TEXT NULL,
  tipo_archivo TEXT NOT NULL DEFAULT 'csv',
  separador TEXT NOT NULL DEFAULT ',',
  encoding TEXT NOT NULL DEFAULT 'utf-8',
  columnas JSONB NOT NULL,
  transformaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  valores_fijos JSONB NOT NULL DEFAULT '{}'::jsonb,
  validaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_bank_export_profiles_nombre
  ON personal_bank_export_profiles (LOWER(nombre));
