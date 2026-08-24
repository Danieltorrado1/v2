CREATE TABLE IF NOT EXISTS persona_formacion_academica (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  nivel_educativo TEXT NULL,
  titulo_programa TEXT NULL,
  institucion TEXT NULL,
  estado_formacion TEXT NOT NULL DEFAULT 'FINALIZADO'
    CHECK (estado_formacion IN ('FINALIZADO', 'EN_CURSO', 'SUSPENDIDO', 'NO_INFORMADO')),
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  actualmente_estudia BOOLEAN NOT NULL DEFAULT FALSE,
  ciudad_municipio TEXT NULL,
  pais TEXT NULL,
  documento_soporte_id BIGINT NULL REFERENCES documentos_persona(id) ON DELETE SET NULL,
  origen TEXT NOT NULL DEFAULT 'IMPORTACION'
    CHECK (origen IN ('FORMULARIO_DIGITAL', 'FORMULARIO_FISICO', 'IMPORTACION', 'EDICION_MANUAL', 'PORTAL_COLABORADOR')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_formacion_persona
  ON persona_formacion_academica(persona_id);

CREATE INDEX IF NOT EXISTS idx_persona_formacion_estado
  ON persona_formacion_academica(persona_id, estado_formacion, activo);

CREATE TABLE IF NOT EXISTS sst_preparacion_personas (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  vinculacion_id BIGINT NULL REFERENCES vinculaciones(id) ON DELETE SET NULL,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  contrato_id BIGINT NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  documento TEXT NOT NULL,
  nombre TEXT NOT NULL,
  municipio TEXT NULL,
  institucion TEXT NULL,
  sede TEXT NULL,
  modalidad TEXT NULL,
  cargo TEXT NULL,
  fuente_formulario_1 BOOLEAN NOT NULL DEFAULT FALSE,
  fuente_formulario_2 BOOLEAN NOT NULL DEFAULT FALSE,
  estado_digital TEXT NOT NULL
    CHECK (estado_digital IN ('COMPLETA_DIGITAL', 'PARCIAL_DIGITAL', 'CONFLICTO_REAL', 'NO_ENCONTRADA_DIGITAL', 'REQUIERE_REVISION')),
  estado_preparacion TEXT NOT NULL
    CHECK (estado_preparacion IN ('APTO_APPLY_AUTOMATICO', 'APTO_APPLY_PARCIAL', 'REQUIERE_REVISION', 'SIN_DATOS_DIGITALES')),
  porcentaje_completitud INTEGER NOT NULL DEFAULT 0
    CHECK (porcentaje_completitud >= 0 AND porcentaje_completitud <= 100),
  completitud_estado TEXT NOT NULL DEFAULT 'INCOMPLETA'
    CHECK (completitud_estado IN ('COMPLETA', 'INCOMPLETA', 'NO_REALIZADA', 'REQUIERE_REVISION')),
  conflictos_aparentes INTEGER NOT NULL DEFAULT 0 CHECK (conflictos_aparentes >= 0),
  conflictos_reales INTEGER NOT NULL DEFAULT 0 CHECK (conflictos_reales >= 0),
  requiere_revision_humana BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_captura BOOLEAN NOT NULL DEFAULT FALSE,
  apto_apply BOOLEAN NOT NULL DEFAULT FALSE,
  propuesta_sst JSONB NOT NULL DEFAULT '{}'::jsonb,
  propuesta_contacto_emergencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  propuesta_formacion_academica JSONB NOT NULL DEFAULT '[]'::jsonb,
  propuesta_afiliaciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  campos_restringidos JSONB NOT NULL DEFAULT '[]'::jsonb,
  fuentes JSONB NOT NULL DEFAULT '[]'::jsonb,
  origen_principal TEXT NOT NULL DEFAULT 'FORMULARIO_DIGITAL',
  observaciones TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sst_preparacion_personas_unique UNIQUE (contrato_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_sst_preparacion_estado
  ON sst_preparacion_personas(contrato_id, estado_preparacion, activo);

CREATE INDEX IF NOT EXISTS idx_sst_preparacion_pendientes
  ON sst_preparacion_personas(contrato_id, requiere_captura, activo);

CREATE TABLE IF NOT EXISTS sst_revision_casos (
  id BIGSERIAL PRIMARY KEY,
  preparacion_id BIGINT NULL REFERENCES sst_preparacion_personas(id) ON DELETE SET NULL,
  persona_id BIGINT NULL REFERENCES personas(id) ON DELETE SET NULL,
  vinculacion_id BIGINT NULL REFERENCES vinculaciones(id) ON DELETE SET NULL,
  empresa_id BIGINT NULL REFERENCES empresas(id) ON DELETE SET NULL,
  contrato_id BIGINT NULL REFERENCES contratos(id) ON DELETE SET NULL,
  documento TEXT NOT NULL,
  persona_nombre TEXT NOT NULL,
  municipio TEXT NULL,
  institucion TEXT NULL,
  sede TEXT NULL,
  cargo TEXT NULL,
  tipo_conflicto TEXT NOT NULL
    CHECK (tipo_conflicto IN ('FORMULARIOS', 'DUPLICADO_F2', 'AFILIACION')),
  campo TEXT NOT NULL,
  fuente_a TEXT NOT NULL,
  valor_a TEXT NULL,
  fuente_b TEXT NOT NULL,
  valor_b TEXT NULL,
  recomendacion TEXT NULL,
  decision TEXT NULL
    CHECK (decision IS NULL OR decision IN ('USAR_FUENTE_A', 'USAR_FUENTE_B', 'INGRESAR_VALOR_MANUAL', 'MANTENER_MAESTRO', 'DESCARTAR_CAMBIO')),
  valor_resuelto TEXT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'RESUELTO', 'DESCARTADO')),
  observacion TEXT NULL,
  importacion_lote_id BIGINT NULL REFERENCES importacion_lotes(id) ON DELETE SET NULL,
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  huella TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  resuelto_por_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_resolucion TIMESTAMPTZ NULL,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sst_revision_casos_estado
  ON sst_revision_casos(contrato_id, estado, activo);

CREATE INDEX IF NOT EXISTS idx_sst_revision_casos_persona
  ON sst_revision_casos(persona_id, activo);

CREATE TABLE IF NOT EXISTS sst_perfil_restringido (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL UNIQUE REFERENCES personas(id) ON DELETE CASCADE,
  vinculacion_id BIGINT NULL REFERENCES vinculaciones(id) ON DELETE SET NULL,
  tipo_sangre_rh TEXT NULL,
  origen TEXT NOT NULL DEFAULT 'IMPORTACION'
    CHECK (origen IN ('FORMULARIO_DIGITAL', 'FORMULARIO_FISICO', 'IMPORTACION', 'EDICION_MANUAL', 'PORTAL_COLABORADOR')),
  motivo_ultima_actualizacion TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sst_perfil_restringido_persona
  ON sst_perfil_restringido(persona_id, activo);
