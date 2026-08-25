CREATE TABLE IF NOT EXISTS public.nomina_novedad_coberturas (
  id BIGSERIAL PRIMARY KEY,
  nomina_novedad_id BIGINT NOT NULL REFERENCES public.nomina_novedades(id) ON DELETE CASCADE,
  tipo_cobertura TEXT NOT NULL,
  persona_cubre_id BIGINT NULL REFERENCES public.personas(id),
  vinculacion_cubre_id BIGINT NULL REFERENCES public.vinculaciones(id),
  nombre_externo TEXT NULL,
  documento_externo TEXT NULL,
  observacion_externa TEXT NULL,
  observacion_interna TEXT NULL,
  snapshot_cobertura JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id BIGINT NULL REFERENCES public.usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_nomina_novedad_coberturas_tipo
    CHECK (tipo_cobertura IN ('SIN_REEMPLAZO', 'PERSONAL_VINCULADO', 'PERSONA_EXTERNA')),
  CONSTRAINT chk_nomina_novedad_coberturas_vinculada
    CHECK (
      (tipo_cobertura = 'PERSONAL_VINCULADO' AND persona_cubre_id IS NOT NULL AND vinculacion_cubre_id IS NOT NULL)
      OR (tipo_cobertura = 'PERSONA_EXTERNA' AND nombre_externo IS NOT NULL AND documento_externo IS NOT NULL)
      OR (tipo_cobertura = 'SIN_REEMPLAZO' AND persona_cubre_id IS NULL AND vinculacion_cubre_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomina_novedad_coberturas_activas
  ON public.nomina_novedad_coberturas (nomina_novedad_id)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_nomina_novedad_coberturas_vinculacion_cubre
  ON public.nomina_novedad_coberturas (vinculacion_cubre_id, activo);

CREATE INDEX IF NOT EXISTS idx_nomina_novedad_coberturas_persona_cubre
  ON public.nomina_novedad_coberturas (persona_cubre_id, activo);

CREATE TABLE IF NOT EXISTS public.gestor_municipio_asignaciones (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id),
  contrato_id BIGINT NOT NULL REFERENCES public.contratos(id),
  municipio_id BIGINT NOT NULL REFERENCES public.municipios(id),
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  observacion TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id BIGINT NULL REFERENCES public.usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gestor_municipio_asignaciones_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_gestor_municipio_asignaciones_usuario_fecha
  ON public.gestor_municipio_asignaciones (usuario_id, contrato_id, activo, vigencia_desde DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_gestor_municipio_asignaciones_municipio_fecha
  ON public.gestor_municipio_asignaciones (municipio_id, contrato_id, activo, vigencia_desde DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.gestor_personal_asignaciones (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id),
  contrato_id BIGINT NOT NULL REFERENCES public.contratos(id),
  vinculacion_id BIGINT NOT NULL REFERENCES public.vinculaciones(id),
  municipio_id BIGINT NULL REFERENCES public.municipios(id),
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  observacion TEXT NULL,
  created_by_user_id BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id BIGINT NULL REFERENCES public.usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gestor_personal_asignaciones_vigencia
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_gestor_personal_asignaciones_vinculacion_fecha
  ON public.gestor_personal_asignaciones (vinculacion_id, contrato_id, activo, vigencia_desde DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_gestor_personal_asignaciones_usuario_fecha
  ON public.gestor_personal_asignaciones (usuario_id, contrato_id, activo, vigencia_desde DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_gestor_personal_asignaciones_municipio_fecha
  ON public.gestor_personal_asignaciones (municipio_id, contrato_id, activo, vigencia_desde DESC, id DESC);
