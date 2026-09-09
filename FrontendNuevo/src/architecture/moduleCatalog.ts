import { CalendarDays, Users, Workflow, Truck, ShieldCheck, Settings, LayoutDashboard, Building2, Layers, Boxes } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type FeatureState = 'PRODUCCION' | 'BETA' | 'PRUEBAS' | 'DESACTIVADO';
export interface ModuleEntry {
  id: string;
  code: string;
  label: string;
  description: string;
  icon: LucideIcon;
  scope: 'GLOBAL' | 'TENANT';
  route: string;
  order: number;
  permission: string[];
  featureCode: string;
  legacyCodes: string[];
  aliases: string[];
  target?: string;
  view?: string;
  sections: string[];
  children: ModuleEntry[];
  dependencies: string[];
  state: FeatureState;
  version: string | null;
  globalOnly?: boolean;
}

type Seed = Partial<ModuleEntry> & Pick<ModuleEntry, 'code' | 'label' | 'route'>;
function entry(seed: Seed, order: number): ModuleEntry {
  return { id: seed.code, description: `Gestión de ${seed.label.toLocaleLowerCase('es')}.`, icon: Boxes,
    scope: 'TENANT', order, permission: [], featureCode: seed.code, legacyCodes: [], aliases: [], sections: [],
    children: [], dependencies: [], state: 'PRUEBAS', version: null, ...seed };
}
function children(prefix: string, base: string, seeds: Array<[string, string, string, Partial<ModuleEntry>?]>): ModuleEntry[] {
  return seeds.map(([code, label, path, options], index) => entry({ code: `${prefix}_${code}`, label, route: `${base}/${path}`, ...options }, index));
}

export const moduleCatalog: ModuleEntry[] = [
  ...[
    ['ADMIN_DASHBOARD', 'Dashboard', '/admin-global', LayoutDashboard],
    ['ADMIN_EMPRESAS', 'Empresas / Clientes', '/admin-global/empresas', Building2],
    ['ADMIN_PLANES', 'Planes', '/admin-global/planes', Layers],
    ['ADMIN_MODULOS', 'Módulos', '/admin-global/modulos', Boxes],
    ['ADMIN_CONFIGURACION', 'Configuración general', '/admin-global/configuracion', Settings],
  ].map(([code, label, route, icon], order) => entry({ code: code as string, label: label as string, route: route as string, icon: icon as LucideIcon, scope: 'GLOBAL', state: 'PRODUCCION' }, order)),
  entry({ code: 'AGENDA_OPERATIVA', label: 'AGENDA', icon: CalendarDays, route: '/agenda', permission: ['agenda.read'],
    description: 'Organiza las tareas y los pendientes de tu operación.', sections: ['Hoy', 'Mi semana', 'Tareas', 'Pendientes', 'Recordatorios', 'Actividad próxima', 'Pendientes por módulo'] }, 0),
  entry({ code: 'PERSONAL', label: 'Personal', icon: Users, route: '/personal/estadisticas', legacyCodes: ['PERSONAL', 'NOMINA', 'COBERTURA', 'REPOSITORIO', 'PORTAL_COLABORADOR', 'DASHBOARD'],
    children: children('PERSONAL', '/personal', [
      ['ESTADISTICAS', 'Estadísticas', 'estadisticas', { permission: ['vinculaciones.read'], legacyCodes: ['PERSONAL'], view: 'personal-statistics', sections: ['Personal activo', 'Ingresos', 'Retiros', 'Contratos por vencer', 'Documentos pendientes', 'Distribución por cargo', 'Distribución por municipio', 'Distribución por modalidad'] }],
      ['BASE_DATOS', 'Base de datos', 'base-datos', { permission: ['vinculaciones.read'], legacyCodes: ['PERSONAL'], target: '/personal', aliases: ['/personal', '/administracion/vinculaciones', '/vinculaciones'], state: 'PRODUCCION' }],
      ['REPOSITORIO', 'Repositorio', 'repositorio', { permission: ['documentos.*'], legacyCodes: ['REPOSITORIO'], target: '/repositorio', aliases: ['/repositorio'], state: 'PRODUCCION' }],
      ['COBERTURA', 'Cobertura', 'cobertura', { permission: ['cobertura.read', 'cobertura.update'], legacyCodes: ['COBERTURA'], target: '/herramientas/cobertura', aliases: ['/herramientas/cobertura', '/herramientas/calculadora-cobertura'], state: 'PRODUCCION' }],
      ['NOMINA', 'Nómina', 'nomina', { permission: ['nomina.*'], legacyCodes: ['NOMINA'], target: '/nomina', aliases: ['/nomina'], state: 'PRODUCCION' }],
      ['PORTAL_SERVICIOS', 'Portal de servicios', 'portal', { permission: ['portal.read', 'portal.*'], legacyCodes: ['PORTAL_COLABORADOR'], view: 'portal', aliases: ['/portal'], sections: ['Bandeja', 'Certificaciones', 'Cesantías', 'Vacaciones', 'Permisos', 'Actualización de datos', 'Solicitudes documentales', 'Historial'] }],
      ['EVALUACION_DESEMPENO', 'Evaluación de desempeño', 'evaluacion', { permission: ['evaluacion.read'], sections: ['Dashboard', 'Ciclos', 'Pendientes', 'Realizadas', 'Competencias', 'Planes de mejora', 'Historial'] }],
      ['LEGISLACION', 'Legislación', 'legislacion', { permission: ['legislacion.read'], sections: ['Normatividad vigente', 'Obligaciones', 'Cambios', 'Cumplimiento', 'Evidencias', 'Alertas'] }],
      ['HERRAMIENTAS', 'Herramientas', 'herramientas', { permission: ['cobertura.read', 'cobertura.update', 'nomina.read'], legacyCodes: ['COBERTURA', 'NOMINA'], view: 'tools', aliases: ['/herramientas/calculadora-salario'], sections: ['Calculadora salarial'] }],
    ]) }, 1),
  entry({ code: 'OPERACION', label: 'Operación', icon: Workflow, route: '/operacion/estadisticas', children: children('OPERACION', '/operacion', [
    ['ESTADISTICAS', 'Estadísticas', 'estadisticas', { permission: ['operacion.read'], sections: ['Servicios programados', 'Servicios entregados', 'Novedades', 'Distribución por municipio'] }],
    ['INSTITUCIONES', 'Instituciones', 'instituciones', { permission: ['vinculaciones.read'], view: 'institutions', sections: ['Institución', 'Centro educativo', 'Sede', 'Municipio', 'Dirección', 'Modalidad', 'Cupos', 'Jornada', 'Estado'] }],
    ['SIMAT', 'Verificación SIMAT', 'simat', { permission: ['operacion.read'], sections: ['Cargar archivo', 'Comparar', 'Diferencias', 'Duplicados', 'Inconsistencias', 'Aprobados', 'Pendientes', 'Historial'] }],
    ['REPORTE_DIARIO', 'Reporte diario', 'reporte-diario', { permission: ['operacion.read'], sections: ['Institución', 'Sede', 'Modalidad', 'Programado', 'Entregado', 'Novedades', 'Observaciones', 'Soportes', 'Responsable'] }],
    ['DESCUENTOS_SEMANALES', 'Descuentos semanales', 'descuentos-semanales', { permission: ['operacion.read'], sections: ['Semana', 'Institución', 'Sede', 'Motivo', 'Cantidad', 'Valor', 'Soporte', 'Estado', 'Aprobación'] }],
    ['PLANILLA_FINAL', 'Planilla final', 'planilla-final', { permission: ['operacion.read'], sections: ['Institución', 'Sede', 'Modalidad', 'Días', 'Servicios', 'Descuentos', 'Novedades', 'Valor final', 'Revisión', 'Aprobación', 'Exportación'] }],
    ['EVALUACION', 'Evaluación operacional', 'evaluacion', { permission: ['operacion.read'], sections: ['Ciclos', 'Criterios operacionales', 'Resultados', 'Planes de mejora'] }],
  ]) }, 2),
  entry({ code: 'LOGISTICA', label: 'Logística', icon: Truck, route: '/logistica/estadisticas', children: children('LOGISTICA', '/logistica', [
    ['ESTADISTICAS', 'Estadísticas', 'estadisticas', { permission: ['logistica.read'], sections: ['Despachos', 'Recepciones', 'Existencias', 'Vencimientos'] }],
    ['REMISIONES', 'Generador de remisiones', 'remisiones', { permission: ['logistica.read'], sections: ['Remisión', 'Institución', 'Sede', 'Modalidad', 'Ruta', 'Paquete', 'Persona', 'QR', 'Stickers', 'Impresión', 'Despacho', 'Recepción'] }],
    ['HISTORIAL_REMISIONES', 'Historial de remisiones', 'historial-remisiones', { permission: ['logistica.read'], sections: ['Fecha', 'Número', 'Municipio', 'Institución', 'Sede', 'Ruta', 'Estado', 'Responsable'] }],
    ['INVENTARIO', 'Inventario', 'inventario', { permission: ['logistica.read'], sections: ['Productos / artículos', 'Existencias', 'Entradas', 'Salidas', 'Transferencias', 'Mínimos', 'Lotes', 'Movimientos'] }],
    ['BODEGAS', 'Bodegas', 'bodegas', { permission: ['logistica.read'], sections: ['Listado de bodegas', 'Responsable', 'Inventario', 'Movimientos', 'Documentos', 'Despachos', 'Recepciones'] }],
    ['DOCUMENTOS_BODEGA', 'Documentos de bodega', 'documentos-bodega', { permission: ['logistica.read'], sections: ['Documentos', 'Vigencias', 'Responsables', 'Historial'] }],
    ['CONDUCTORES_VEHICULOS', 'Conductores y vehículos', 'conductores-vehiculos', { permission: ['logistica.read'], sections: ['Conductores', 'Licencias', 'Vehículos', 'SOAT', 'Técnico-mecánica', 'Documentos', 'Vencimientos', 'Historial'] }],
  ]) }, 3),
  entry({ code: 'SST', label: 'SST', icon: ShieldCheck, route: '/sst/clasificacion', legacyCodes: ['SST'], children: children('SST', '/sst', [
    ['CLASIFICACION', 'Clasificación de empresa', 'clasificacion', { permission: ['sst.*'], legacyCodes: ['SST'], view: 'sst-classification', sections: ['Tamaño de empresa', 'Trabajadores', 'Actividad económica', 'Clase de riesgo', 'Centros de trabajo', 'Contratistas', 'Características especiales'] }],
    ['ESTADISTICAS', 'Estadísticas', 'estadisticas', { permission: ['sst.*'], legacyCodes: ['SST'], target: '/sst?tab=indicadores', aliases: ['/sst?tab=resumen', '/sst?tab=indicadores', '/sst/indicadores'], state: 'PRODUCCION' }],
    ['DOCUMENTOS', 'Documentos', 'documentos', { permission: ['sst.*'], sections: ['Documentos del sistema', 'Vigencias', 'Responsables', 'Evidencias'] }],
    ['LEGISLACION', 'Legislación activa', 'legislacion', { permission: ['sst.*'], sections: ['Normatividad', 'Aplicabilidad', 'Obligaciones', 'Evidencias'] }],
    ['PLAN_TRABAJO', 'Plan de trabajo', 'plan-trabajo', { permission: ['sst.*'], legacyCodes: ['SST'], target: '/sst?tab=planes', aliases: ['/sst?tab=planes'], state: 'PRODUCCION' }],
    ['INSPECCIONES', 'Inspecciones', 'inspecciones', { permission: ['sst.*'], legacyCodes: ['SST'], target: '/sst?tab=inspecciones', aliases: ['/sst?tab=inspecciones', '/sst?tab=hallazgos', '/sst/epp'], state: 'PRODUCCION' }],
    ['INCIDENTES', 'Incidentes / Accidentes', 'incidentes-accidentes', { permission: ['sst.*'], legacyCodes: ['SST'], target: '/sst?tab=accidentes', aliases: ['/sst?tab=eventos', '/sst?tab=accidentes', '/sst/incidentes', '/sst/examenes-medicos'], state: 'PRODUCCION' }],
    ['RIESGOS', 'Riesgos', 'matriz-riesgos', { permission: ['sst.*'], sections: ['Identificación', 'Evaluación', 'Controles', 'Seguimiento'] }],
    ['CAPACITACIONES', 'Capacitaciones', 'formacion', { permission: ['sst.*'], sections: ['Programación', 'Participantes', 'Evidencias', 'Historial'] }],
    ['COMITES', 'Comités', 'comites', { permission: ['sst.*'], sections: ['Integrantes', 'Reuniones', 'Actas', 'Compromisos'] }],
    ['AUDITORIA', 'Auditoría', 'auditoria', { permission: ['sst.*'], sections: ['Programa', 'Hallazgos', 'Evidencias', 'Seguimiento'] }],
  ]) }, 4),
  entry({ code: 'CONFIGURACION_EMPRESA', label: 'Configuración', icon: Settings, route: '/configuracion/empresa', children: children('CONFIG_EMPRESA', '/configuracion', [
    ['GENERAL', 'Empresa', 'empresa', { permission: ['configuracion.read', 'empresas.read'], view: 'company-settings' }],
    ['CONTRATOS', 'Contratos', 'contratos', { permission: ['configuracion.read', 'contratos.read', 'contracts.read'], view: 'contracts' }],
    ['NOMINA', 'Nómina', 'nomina/asignaciones', { permission: ['nomina.periodos.update'], aliases: ['/configuracion/nomina'], view: 'payroll-settings', sections: ['Asignaciones', 'Parámetros', 'Procesos'] }],
    ['REQUISITOS_DOCUMENTALES', 'Requisitos documentales', 'requisitos-documentales', { permission: ['configuracion.read', 'contratos.read'], view: 'requirements', sections: ['Cargo', 'Tipo de contrato', 'Proceso', 'Modalidad'] }],
    ['CARGOS', 'Cargos', 'cargos', { permission: ['configuracion.read', 'cargos.read'], view: 'positions' }],
    ['AREAS', 'Áreas', 'areas', { permission: ['nomina.periodos.update'], globalOnly: true, view: 'areas', sections: ['Áreas', 'Responsables', 'Procesos'] }],
    ['USUARIOS', 'Usuarios', 'usuarios', { permission: ['usuarios.read', 'users.read', 'configuracion.read'], globalOnly: true, view: 'users' }],
    ['ROLES', 'Roles y permisos', 'roles', { permission: ['configuracion.read', 'roles.read'], view: 'roles' }],
    ['CATALOGOS', 'Catálogos', 'catalogos', { permission: ['configuracion.read', 'catalogos.read'], view: 'catalogs' }],
    ['INTEGRACIONES', 'Integraciones', 'integraciones', { permission: ['configuracion.read'], sections: ['Conexiones', 'Credenciales', 'Sincronización', 'Historial'] }],
  ]) }, 5),
];

export const adminModules = moduleCatalog.filter(item => item.scope === 'GLOBAL');
export const tenantModules = moduleCatalog.filter(item => item.scope === 'TENANT');
export const tenantEntries = tenantModules.flatMap(item => [item, ...item.children]);

export interface PlanCapacity {
  implementation: number | null; includedUsers: number | null; includedEmployees: number | null; storageGb: number | null;
}
export interface ModuleDeployment {
  moduleCode: string; state: FeatureState; version: string | null; planIds: number[]; companyIds: number[];
}
