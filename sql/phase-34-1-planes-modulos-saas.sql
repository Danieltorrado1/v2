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
 ('ADMINISTRACION','Administración','Configuración administrativa','ADMINISTRACION','Settings','/admin',110,TRUE),
 ('AGENDA_OPERATIVA','Agenda operativa','Agenda, tareas y pendientes empresariales','EMPRESA','CalendarDays','/agenda',120,TRUE),
 ('OPERACION','Operación','Operación empresarial','EMPRESA','Workflow','/operacion',119,TRUE),
 ('LOGISTICA','Logística','Logística empresarial','EMPRESA','Truck','/logistica',139,TRUE),
 ('CONFIGURACION_EMPRESA','Configuración de empresa','Configuración específica del tenant','CONFIGURACION','Settings','/configuracion',169,TRUE),
 ('PERSONAL_ESTADISTICAS','Estadísticas de personal','Indicadores de personal por contrato','PERSONAL','BarChart3','/personal/estadisticas',121,TRUE),
 ('PERSONAL_BASE_DATOS','Base de datos de personal','Vista maestra de personal','PERSONAL','Users','/personal/base-datos',122,TRUE),
 ('PERSONAL_REPOSITORIO','Repositorio de personal','Documentos del personal','PERSONAL','FolderOpen','/personal/repositorio',123,TRUE),
 ('PERSONAL_COBERTURA','Cobertura de personal','Cobertura operativa','PERSONAL','MapPinned','/personal/cobertura',124,TRUE),
 ('PERSONAL_NOMINA','Nómina de personal','Nómina empresarial','PERSONAL','WalletCards','/personal/nomina',125,TRUE),
 ('PERSONAL_PORTAL_SERVICIOS','Portal de servicios','Autoservicio del colaborador','PERSONAL','Contact','/personal/portal',126,TRUE),
 ('PERSONAL_EVALUACION_DESEMPENO','Evaluación de desempeño','Evaluación de desempeño','PERSONAL','ClipboardCheck','/personal/evaluacion',127,TRUE),
 ('PERSONAL_LEGISLACION','Legislación de personal','Normatividad y cumplimiento','PERSONAL','BookOpen','/personal/legislacion',128,TRUE),
 ('PERSONAL_HERRAMIENTAS','Herramientas de personal','Utilidades de apoyo','PERSONAL','Wrench','/personal/herramientas',129,TRUE),
 ('OPERACION_ESTADISTICAS','Estadísticas operacionales','Indicadores de operación','OPERACION','BarChart3','/operacion/estadisticas',130,TRUE),
 ('OPERACION_INSTITUCIONES','Instituciones','Instituciones y sedes','OPERACION','School','/operacion/instituciones',131,TRUE),
 ('OPERACION_SIMAT','Verificación SIMAT','Comparación de archivos SIMAT','OPERACION','FileCheck','/operacion/simat',132,TRUE),
 ('OPERACION_REPORTE_DIARIO','Reporte diario','Seguimiento diario de operación','OPERACION','ClipboardList','/operacion/reporte-diario',133,TRUE),
 ('OPERACION_DESCUENTOS_SEMANALES','Descuentos semanales','Descuentos de operación','OPERACION','BadgeDollarSign','/operacion/descuentos-semanales',134,TRUE),
 ('OPERACION_PLANILLA_FINAL','Planilla final','Cierre operativo','OPERACION','TableProperties','/operacion/planilla-final',135,TRUE),
 ('OPERACION_EVALUACION','Evaluación operacional','Evaluación de servicios','OPERACION','Gauge','/operacion/evaluacion',136,TRUE),
 ('LOGISTICA_ESTADISTICAS','Estadísticas logísticas','Indicadores logísticos','LOGISTICA','BarChart3','/logistica/estadisticas',140,TRUE),
 ('LOGISTICA_REMISIONES','Generador de remisiones','Remisiones y despacho','LOGISTICA','Send','/logistica/remisiones',141,TRUE),
 ('LOGISTICA_HISTORIAL_REMISIONES','Historial de remisiones','Historial y búsqueda de remisiones','LOGISTICA','History','/logistica/historial-remisiones',142,TRUE),
 ('LOGISTICA_INVENTARIO','Inventario','Existencias y movimientos','LOGISTICA','Boxes','/logistica/inventario',143,TRUE),
 ('LOGISTICA_BODEGAS','Bodegas','Bodegas y despachos','LOGISTICA','Warehouse','/logistica/bodegas',144,TRUE),
 ('LOGISTICA_DOCUMENTOS_BODEGA','Documentos de bodega','Documentos y vigencias','LOGISTICA','FileText','/logistica/documentos-bodega',145,TRUE),
 ('LOGISTICA_CONDUCTORES_VEHICULOS','Conductores y vehículos','Conductores, vehículos y vencimientos','LOGISTICA','Truck','/logistica/conductores-vehiculos',146,TRUE),
 ('SST_CLASIFICACION','Clasificación SST','Clasificación de empresa','SST','ShieldCheck','/sst/clasificacion',150,TRUE),
 ('SST_ESTADISTICAS','Estadísticas SST','Indicadores de seguridad y salud','SST','BarChart3','/sst/estadisticas',151,TRUE),
 ('SST_DOCUMENTOS','Documentos SST','Documentos del sistema SST','SST','FileText','/sst/documentos',152,TRUE),
 ('SST_LEGISLACION','Legislación SST','Normatividad SST','SST','BookOpen','/sst/legislacion',153,TRUE),
 ('SST_PLAN_TRABAJO','Plan de trabajo SST','Planes de acción SST','SST','ClipboardList','/sst/plan-trabajo',154,TRUE),
 ('SST_INSPECCIONES','Inspecciones SST','Inspecciones y hallazgos','SST','SearchCheck','/sst/inspecciones',155,TRUE),
 ('SST_INCIDENTES','Incidentes y accidentes SST','Eventos e investigaciones','SST','Siren','/sst/incidentes-accidentes',156,TRUE),
 ('SST_RIESGOS','Riesgos SST','Matriz de riesgos','SST','TriangleAlert','/sst/matriz-riesgos',157,TRUE),
 ('SST_CAPACITACIONES','Capacitaciones SST','Formación y evidencias','SST','GraduationCap','/sst/formacion',158,TRUE),
 ('SST_COMITES','Comités SST','Comités y actas','SST','UsersRound','/sst/comites',159,TRUE),
 ('SST_AUDITORIA','Auditoría SST','Programa y seguimiento','SST','ClipboardCheck','/sst/auditoria',160,TRUE),
 ('CONFIG_EMPRESA_GENERAL','Configuración general de empresa','Datos y parámetros de empresa','CONFIGURACION','Settings','/configuracion/empresa',170,TRUE),
 ('CONFIG_EMPRESA_CONTRATOS','Contratos de empresa','Contratos y requisitos','CONFIGURACION','Briefcase','/configuracion/contratos',171,TRUE),
 ('CONFIG_EMPRESA_NOMINA','Configuración de nómina','Parámetros de nómina','CONFIGURACION','WalletCards','/configuracion/nomina',172,TRUE),
 ('CONFIG_EMPRESA_REQUISITOS_DOCUMENTALES','Requisitos documentales','Requisitos por cargo y proceso','CONFIGURACION','FileCheck','/configuracion/requisitos-documentales',173,TRUE),
 ('CONFIG_EMPRESA_CARGOS','Cargos','Cargos contractuales','CONFIGURACION','BadgeCheck','/configuracion/cargos',174,TRUE),
 ('CONFIG_EMPRESA_AREAS','Áreas','Áreas y responsables','CONFIGURACION','Network','/configuracion/areas',175,TRUE),
 ('CONFIG_EMPRESA_USUARIOS','Usuarios','Usuarios de la empresa','CONFIGURACION','Users','/configuracion/usuarios',176,TRUE),
 ('CONFIG_EMPRESA_ROLES','Roles y permisos','Roles y permisos de empresa','CONFIGURACION','KeyRound','/configuracion/roles',177,TRUE),
 ('CONFIG_EMPRESA_CATALOGOS','Catálogos','Catálogos empresariales','CONFIGURACION','Library','/configuracion/catalogos',178,TRUE),
 ('CONFIG_EMPRESA_INTEGRACIONES','Integraciones','Conexiones e integraciones','CONFIGURACION','Plug','/configuracion/integraciones',179,TRUE)
ON CONFLICT (codigo) DO UPDATE SET
 nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion, categoria=EXCLUDED.categoria,
 icono=EXCLUDED.icono, ruta_base=EXCLUDED.ruta_base, orden=EXCLUDED.orden,
 updated_at=NOW();
