CREATE TABLE IF NOT EXISTS public.modulos (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(64) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(80),
  icono VARCHAR(80),
  ruta_base VARCHAR(180),
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.planes (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(64) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  precio_base NUMERIC(18,2),
  moneda VARCHAR(3),
  periodicidad VARCHAR(24),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_planes_precio CHECK (precio_base IS NULL OR precio_base >= 0),
  CONSTRAINT chk_planes_moneda CHECK (moneda IS NULL OR moneda ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_planes_periodicidad CHECK (periodicidad IS NULL OR periodicidad IN ('MENSUAL','TRIMESTRAL','SEMESTRAL','ANUAL','PERSONALIZADA'))
);

CREATE TABLE IF NOT EXISTS public.plan_modulos (
  plan_id BIGINT NOT NULL REFERENCES public.planes(id),
  modulo_id BIGINT NOT NULL REFERENCES public.modulos(id),
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  configuracion JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_id, modulo_id)
);

CREATE TABLE IF NOT EXISTS public.empresa_suscripciones (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id),
  plan_id BIGINT NOT NULL REFERENCES public.planes(id),
  estado VARCHAR(20) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_empresa_suscripcion_estado CHECK (estado IN ('ACTIVA','PRUEBA','SUSPENDIDA','VENCIDA','CANCELADA')),
  CONSTRAINT chk_empresa_suscripcion_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_suscripcion_abierta
  ON public.empresa_suscripciones (empresa_id)
  WHERE fecha_fin IS NULL AND estado IN ('ACTIVA','PRUEBA','SUSPENDIDA');
CREATE INDEX IF NOT EXISTS idx_empresa_suscripciones_historial
  ON public.empresa_suscripciones (empresa_id, fecha_inicio DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.empresa_modulo_overrides (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id),
  modulo_id BIGINT NOT NULL REFERENCES public.modulos(id),
  habilitado BOOLEAN NOT NULL,
  motivo TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_empresa_modulo_override_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$ BEGIN
  ALTER TABLE public.empresa_suscripciones ADD CONSTRAINT ex_empresa_suscripciones_sin_solape
    EXCLUDE USING gist (empresa_id WITH =, daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[]') WITH &&);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.empresa_modulo_overrides ADD CONSTRAINT ex_empresa_modulo_overrides_sin_solape
    EXCLUDE USING gist (empresa_id WITH =, modulo_id WITH =, daterange(fecha_inicio, COALESCE(fecha_fin, 'infinity'::date), '[]') WITH &&);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_modulo_override_abierto
  ON public.empresa_modulo_overrides (empresa_id, modulo_id)
  WHERE fecha_fin IS NULL;
CREATE INDEX IF NOT EXISTS idx_empresa_modulo_overrides_historial
  ON public.empresa_modulo_overrides (empresa_id, modulo_id, fecha_inicio DESC, id DESC);

INSERT INTO public.modulos (codigo, nombre, descripcion, categoria, icono, ruta_base, orden, activo)
VALUES
 ('DASHBOARD','Dashboard','Resumen operativo empresarial','GENERAL','LayoutDashboard','/dashboard',10,TRUE),
 ('PERSONAL','Personal','Gestión de personal y vinculaciones','OPERACION','Users','/personal',20,TRUE),
 ('DOCUMENTOS','Documentos','Gestión documental','OPERACION','FileText','/repositorio',30,TRUE),
 ('CONTRATOS','Contratos','Administración contractual','ADMINISTRACION','Briefcase','/admin',40,TRUE),
 ('NOMINA','Nómina','Operación y gestión de nómina','OPERACION','WalletCards','/nomina',50,TRUE),
 ('COBERTURA','Cobertura','Cobertura y focalización PAE','OPERACION','MapPinned','/herramientas/cobertura',60,TRUE),
 ('SST','SST','Seguridad y salud en el trabajo','OPERACION','ShieldCheck','/sst',70,TRUE),
 ('REPOSITORIO','Repositorio','Repositorio documental','OPERACION','FolderOpen','/repositorio',80,TRUE),
 ('EVALUACION','Evaluación','Evaluación de desempeño','OPERACION','ClipboardCheck',NULL,90,FALSE),
 ('PORTAL_COLABORADOR','Portal colaborador','Autoservicio del colaborador','PORTAL','Contact','/portal',100,TRUE),
 ('ADMINISTRACION','Administración','Configuración administrativa','ADMINISTRACION','Settings','/admin',110,TRUE)
ON CONFLICT (codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion, categoria=EXCLUDED.categoria,
 icono=EXCLUDED.icono, ruta_base=EXCLUDED.ruta_base, orden=EXCLUDED.orden,
 updated_at=NOW();
