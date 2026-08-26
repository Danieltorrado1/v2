-- NÓMINA-4B: responsabilidades operativas independientes de roles.
CREATE TABLE IF NOT EXISTS nomina_responsabilidades_usuario (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  proceso TEXT NOT NULL CHECK (proceso IN ('COBERTURA','ASISTENCIA','OPS')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, empresa_id, proceso)
);
CREATE INDEX IF NOT EXISTS idx_nomina_responsabilidades_empresa ON nomina_responsabilidades_usuario(empresa_id, proceso, activo);

CREATE TABLE IF NOT EXISTS nomina_areas (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  orden INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, codigo),
  UNIQUE(empresa_id, nombre)
);
CREATE INDEX IF NOT EXISTS idx_nomina_areas_empresa_activo ON nomina_areas(empresa_id, activo, orden, id);

CREATE TABLE IF NOT EXISTS nomina_vinculacion_areas (
  id BIGSERIAL PRIMARY KEY,
  vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES nomina_areas(id) ON DELETE RESTRICT,
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);
CREATE INDEX IF NOT EXISTS idx_nomina_vinculacion_areas_historial ON nomina_vinculacion_areas(vinculacion_id, vigencia_desde DESC, id DESC);

CREATE TABLE IF NOT EXISTS nomina_responsabilidad_municipios (
  responsabilidad_id BIGINT NOT NULL REFERENCES nomina_responsabilidades_usuario(id) ON DELETE CASCADE,
  municipio_id BIGINT NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  PRIMARY KEY(responsabilidad_id, municipio_id)
);
CREATE TABLE IF NOT EXISTS nomina_responsabilidad_areas (
  responsabilidad_id BIGINT NOT NULL REFERENCES nomina_responsabilidades_usuario(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES nomina_areas(id) ON DELETE CASCADE,
  PRIMARY KEY(responsabilidad_id, area_id)
);

CREATE OR REPLACE FUNCTION nomina_validar_scope_responsabilidad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_empresa BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'nomina_responsabilidad_municipios' THEN
    SELECT empresa_id INTO v_empresa FROM nomina_responsabilidades_usuario WHERE id=NEW.responsabilidad_id;
    IF NOT EXISTS (SELECT 1 FROM municipios WHERE id=NEW.municipio_id) THEN RAISE EXCEPTION 'Municipio inexistente'; END IF;
  ELSE
    SELECT r.empresa_id INTO v_empresa FROM nomina_responsabilidades_usuario r WHERE r.id=NEW.responsabilidad_id;
    IF NOT EXISTS (SELECT 1 FROM nomina_areas WHERE id=NEW.area_id AND empresa_id=v_empresa) THEN
      RAISE EXCEPTION 'Área fuera de la empresa de la responsabilidad';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION nomina_validar_vinculacion_area_empresa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vinculaciones v JOIN contratos c ON c.id=v.contrato_id JOIN nomina_areas a ON a.id=NEW.area_id WHERE v.id=NEW.vinculacion_id AND a.empresa_id=c.empresa_id) THEN
    RAISE EXCEPTION 'Área de vinculación fuera de la empresa';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_nomina_vinculacion_area_empresa ON nomina_vinculacion_areas;
CREATE TRIGGER trg_nomina_vinculacion_area_empresa BEFORE INSERT OR UPDATE ON nomina_vinculacion_areas FOR EACH ROW EXECUTE FUNCTION nomina_validar_vinculacion_area_empresa();
DROP TRIGGER IF EXISTS trg_nomina_scope_municipio_empresa ON nomina_responsabilidad_municipios;
CREATE TRIGGER trg_nomina_scope_municipio_empresa BEFORE INSERT OR UPDATE ON nomina_responsabilidad_municipios
  FOR EACH ROW EXECUTE FUNCTION nomina_validar_scope_responsabilidad();
DROP TRIGGER IF EXISTS trg_nomina_scope_area_empresa ON nomina_responsabilidad_areas;
CREATE TRIGGER trg_nomina_scope_area_empresa BEFORE INSERT OR UPDATE ON nomina_responsabilidad_areas
  FOR EACH ROW EXECUTE FUNCTION nomina_validar_scope_responsabilidad();
