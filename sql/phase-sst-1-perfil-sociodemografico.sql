ALTER TABLE IF EXISTS sst_perfil_demografico
  ADD COLUMN IF NOT EXISTS vinculacion_id BIGINT NULL REFERENCES vinculaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_caracterizacion DATE NULL,
  ADD COLUMN IF NOT EXISTS origen TEXT NULL,
  ADD COLUMN IF NOT EXISTS motivo_ultima_actualizacion TEXT NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requiere_revision BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sst_perfil_demografico_vinculacion
  ON sst_perfil_demografico (vinculacion_id);

CREATE TABLE IF NOT EXISTS sst_perfil_demografico_versiones (
  id BIGSERIAL PRIMARY KEY,
  perfil_id BIGINT NOT NULL REFERENCES sst_perfil_demografico(id) ON DELETE CASCADE,
  persona_id BIGINT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  vinculacion_id BIGINT NULL REFERENCES vinculaciones(id) ON DELETE SET NULL,
  version_numero INTEGER NOT NULL,
  vigente_desde TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  vigencia_hasta TIMESTAMP WITHOUT TIME ZONE NULL,
  es_vigente BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_caracterizacion DATE NULL,
  origen TEXT NULL,
  motivo_cambio TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  importacion_lote_id BIGINT NULL REFERENCES importacion_lotes(id) ON DELETE SET NULL,
  requiere_revision BOOLEAN NOT NULL DEFAULT FALSE,
  nacionalidad TEXT NULL,
  estrato_socioeconomico TEXT NULL,
  tipo_vivienda TEXT NULL,
  grupo_etnico TEXT NULL,
  nivel_escolaridad TEXT NULL,
  profesion_ocupacion TEXT NULL,
  personas_dependen_economicamente INTEGER NULL,
  cabeza_familia BOOLEAN NULL,
  total_hijos INTEGER NULL,
  hijos_viven_con_usted INTEGER NULL,
  hijos_menores_edad INTEGER NULL,
  hijos_mayores_edad INTEGER NULL,
  tiene_discapacidad BOOLEAN NULL,
  tipo_discapacidad TEXT NULL,
  redes_apoyo_social TEXT NULL,
  presenta_alergias TEXT NULL,
  medicamentos_permanentes TEXT NULL,
  enfermedad TEXT NULL,
  autorizacion_tratamiento_datos BOOLEAN NULL,
  observaciones TEXT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sst_perfil_demografico_versiones_perfil_version UNIQUE (perfil_id, version_numero),
  CONSTRAINT chk_sst_perfil_demografico_versiones_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigente_desde)
);

CREATE INDEX IF NOT EXISTS idx_sst_perfil_demografico_versiones_persona
  ON sst_perfil_demografico_versiones (persona_id, version_numero DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sst_perfil_demografico_versiones_perfil
  ON sst_perfil_demografico_versiones (perfil_id, version_numero DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sst_perfil_demografico_versiones_vinculacion
  ON sst_perfil_demografico_versiones (vinculacion_id, version_numero DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sst_perfil_demografico_versiones_persona_vigente
  ON sst_perfil_demografico_versiones (persona_id)
  WHERE es_vigente = TRUE;

INSERT INTO sst_perfil_demografico_versiones (
  perfil_id,
  persona_id,
  vinculacion_id,
  version_numero,
  vigente_desde,
  vigencia_hasta,
  es_vigente,
  fecha_caracterizacion,
  origen,
  motivo_cambio,
  created_by_user_id,
  importacion_lote_id,
  requiere_revision,
  nacionalidad,
  estrato_socioeconomico,
  tipo_vivienda,
  grupo_etnico,
  nivel_escolaridad,
  profesion_ocupacion,
  personas_dependen_economicamente,
  cabeza_familia,
  total_hijos,
  hijos_viven_con_usted,
  hijos_menores_edad,
  hijos_mayores_edad,
  tiene_discapacidad,
  tipo_discapacidad,
  redes_apoyo_social,
  presenta_alergias,
  medicamentos_permanentes,
  enfermedad,
  autorizacion_tratamiento_datos,
  observaciones,
  created_at
)
SELECT
  spd.id AS perfil_id,
  spd.persona_id,
  spd.vinculacion_id,
  1 AS version_numero,
  COALESCE(spd.updated_at, spd.created_at, NOW()) AS vigente_desde,
  NULL AS vigencia_hasta,
  TRUE AS es_vigente,
  spd.fecha_caracterizacion,
  spd.origen,
  spd.motivo_ultima_actualizacion,
  COALESCE(spd.updated_by_user_id, spd.created_by_user_id),
  NULL AS importacion_lote_id,
  COALESCE(spd.requiere_revision, FALSE),
  spd.nacionalidad,
  spd.estrato_socioeconomico,
  spd.tipo_vivienda,
  spd.grupo_etnico,
  spd.nivel_escolaridad,
  spd.profesion_ocupacion,
  spd.personas_dependen_economicamente,
  spd.cabeza_familia,
  spd.total_hijos,
  spd.hijos_viven_con_usted,
  spd.hijos_menores_edad,
  spd.hijos_mayores_edad,
  spd.tiene_discapacidad,
  spd.tipo_discapacidad,
  spd.redes_apoyo_social,
  spd.presenta_alergias,
  spd.medicamentos_permanentes,
  spd.enfermedad,
  spd.autorizacion_tratamiento_datos,
  spd.observaciones,
  COALESCE(spd.created_at, spd.updated_at, NOW()) AS created_at
FROM sst_perfil_demografico spd
WHERE NOT EXISTS (
  SELECT 1
  FROM sst_perfil_demografico_versiones hist
  WHERE hist.perfil_id = spd.id
    AND hist.version_numero = 1
);
