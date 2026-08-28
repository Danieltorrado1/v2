-- NOMINA-5B.1: identidad externa y cuentas de cobro propias de COBERTURA.
-- Solo estructura y catalogos; no realiza backfill ni crea datos operativos.

CREATE TABLE IF NOT EXISTS public.cobertura_externos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id),
  tipo_documento TEXT NOT NULL DEFAULT 'CC',
  numero_documento TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  banco TEXT NULL,
  tipo_cuenta TEXT NULL,
  numero_cuenta TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cobertura_externos_documento_check CHECK (length(trim(numero_documento)) > 0),
  CONSTRAINT cobertura_externos_nombre_check CHECK (length(trim(nombre_completo)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobertura_externos_empresa_documento
  ON public.cobertura_externos (empresa_id, tipo_documento, numero_documento)
  WHERE activo = TRUE;

ALTER TABLE public.nomina_novedad_turnos
  ADD COLUMN IF NOT EXISTS externo_id BIGINT REFERENCES public.cobertura_externos(id);
ALTER TABLE public.nomina_movimientos
  ADD COLUMN IF NOT EXISTS externo_id BIGINT REFERENCES public.cobertura_externos(id);

CREATE TABLE IF NOT EXISTS public.cobertura_externo_documentos (
  id BIGSERIAL PRIMARY KEY,
  externo_id BIGINT NOT NULL REFERENCES public.cobertura_externos(id),
  tipo_documento TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  es_vigente BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cobertura_externo_documento_tipo_check CHECK (tipo_documento IN ('CEDULA_EXTERNO_COBERTURA','CERTIFICACION_BANCARIA_EXTERNO_COBERTURA'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobertura_externo_documento_vigente
  ON public.cobertura_externo_documentos (externo_id, tipo_documento)
  WHERE activo = TRUE AND es_vigente = TRUE;

CREATE SEQUENCE IF NOT EXISTS cobertura_cuentas_cobro_numero_seq AS BIGINT START WITH 1;
CREATE TABLE IF NOT EXISTS public.cobertura_cuentas_cobro_externas (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id),
  contrato_id BIGINT NOT NULL REFERENCES public.contratos(id),
  periodo_id BIGINT NOT NULL REFERENCES public.nomina_periodos(id),
  externo_id BIGINT NOT NULL REFERENCES public.cobertura_externos(id),
  numero_cuenta BIGINT NOT NULL DEFAULT nextval('cobertura_cuentas_cobro_numero_seq'),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  generado_bucket TEXT NULL,
  generado_path TEXT NULL,
  firmado_bucket TEXT NULL,
  firmado_path TEXT NULL,
  generado_at TIMESTAMPTZ NULL,
  firmado_at TIMESTAMPTZ NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NOT NULL REFERENCES public.usuarios(id),
  updated_by BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cobertura_cuenta_estado_check CHECK (estado IN ('PENDIENTE','GENERADA','FIRMADA')),
  CONSTRAINT cobertura_cuenta_valor_check CHECK (valor_total >= 0),
  CONSTRAINT cobertura_cuenta_numero_unique UNIQUE (numero_cuenta)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobertura_cuenta_externo_periodo
  ON public.cobertura_cuentas_cobro_externas (externo_id, empresa_id, contrato_id, periodo_id)
  WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS public.cobertura_cuenta_cobro_externa_detalle (
  id BIGSERIAL PRIMARY KEY,
  cuenta_id BIGINT NOT NULL REFERENCES public.cobertura_cuentas_cobro_externas(id) ON DELETE CASCADE,
  movimiento_id BIGINT NULL REFERENCES public.nomina_movimientos(id),
  turno_id BIGINT NULL REFERENCES public.nomina_novedad_turnos(id),
  fecha DATE NOT NULL,
  valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT cobertura_cuenta_detalle_origen_check CHECK (movimiento_id IS NOT NULL OR turno_id IS NOT NULL),
  CONSTRAINT cobertura_cuenta_detalle_valor_check CHECK (valor >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cobertura_cuenta_detalle_movimiento
  ON public.cobertura_cuenta_cobro_externa_detalle (cuenta_id, movimiento_id)
  WHERE movimiento_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nomina_novedad_documentos (
  id BIGSERIAL PRIMARY KEY,
  nomina_novedad_id BIGINT NOT NULL REFERENCES public.nomina_novedades(id) ON DELETE CASCADE,
  documento_persona_id BIGINT NOT NULL REFERENCES public.documentos_persona(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_nomina_novedad_documento_activo
  ON public.nomina_novedad_documentos (nomina_novedad_id, documento_persona_id)
  WHERE activo = TRUE;

INSERT INTO public.tipos_documentos (codigo, nombre_documento, requiere_fecha_expedicion, requiere_fecha_vencimiento, categoria_documento)
SELECT 'CEDULA_EXTERNO_COBERTURA', 'Cedula externo cobertura', FALSE, FALSE, 'NOMINA'
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_documentos WHERE codigo = 'CEDULA_EXTERNO_COBERTURA');
INSERT INTO public.tipos_documentos (codigo, nombre_documento, requiere_fecha_expedicion, requiere_fecha_vencimiento, categoria_documento)
SELECT 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA', 'Certificacion bancaria externo cobertura', FALSE, FALSE, 'NOMINA'
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_documentos WHERE codigo = 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA');
INSERT INTO public.tipos_documentos (codigo, nombre_documento, requiere_fecha_expedicion, requiere_fecha_vencimiento, categoria_documento)
SELECT 'CUENTA_COBRO_FIRMADA_EXTERNO_COBERTURA', 'Cuenta de cobro firmada externo cobertura', FALSE, FALSE, 'NOMINA'
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_documentos WHERE codigo = 'CUENTA_COBRO_FIRMADA_EXTERNO_COBERTURA');
INSERT INTO public.tipos_documentos (codigo, nombre_documento, requiere_fecha_expedicion, requiere_fecha_vencimiento, categoria_documento)
SELECT 'NOMINA_NOVEDAD', 'Soporte de novedad de nómina', FALSE, FALSE, 'NOMINA'
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_documentos WHERE codigo = 'NOMINA_NOVEDAD');
