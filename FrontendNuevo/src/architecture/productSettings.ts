export interface ProductSettingSection { code: string; label: string; fields: string[] }
export const productSettings: ProductSettingSection[] = [
  { code: 'identidad', label: 'Identidad', fields: ['Logo principal', 'Logo compacto', 'Logo dark', 'Isotipo', 'Favicon', 'Nombre del producto', 'Nombre legal', 'Copyright', 'Texto de marca'] },
  { code: 'apariencia', label: 'Apariencia', fields: ['Primario', 'Secundario', 'Éxito', 'Advertencia', 'Error', 'Backgrounds', 'Bordes', 'Radios', 'Sombras'] },
  { code: 'tipografia', label: 'Tipografía', fields: ['Fuente principal', 'Títulos', 'Tamaños', 'Pesos', 'Labels', 'Tablas', 'Botones'] },
  { code: 'etiquetas', label: 'Etiquetas', fields: ['employee', 'employees', 'company', 'contract', 'payroll', 'documents'] },
  { code: 'formatos', label: 'Formatos', fields: ['Fecha', 'Moneda', 'Separadores', 'Decimales', 'Documentos', 'NIT', 'Teléfono', 'Consecutivos'] },
  { code: 'plantillas', label: 'Plantillas', fields: ['Desprendible', 'Certificado laboral', 'Remisiones', 'Formatos SST', 'Cartas', 'Reportes'] },
  { code: 'correos', label: 'Correos', fields: ['Remitente', 'Identidad', 'Plantillas', 'Notificaciones'] },
  { code: 'versiones', label: 'Versiones', fields: ['Frontend', 'Backend', 'Ambiente', 'Fecha de despliegue', 'Commit', 'Changelog'] },
  { code: 'feature-flags', label: 'Feature flags', fields: ['PRODUCCIÓN', 'BETA', 'PRUEBAS', 'DESACTIVADO'] },
  { code: 'sistema', label: 'Sistema', fields: ['Estado de servicios', 'Auditoría del producto', 'Integraciones', 'Mantenimiento'] },
];
export const productLabels: Record<string, string> = { employee: 'Empleado', employees: 'Empleados', company: 'Empresa', contract: 'Contrato', payroll: 'Nómina', documents: 'Documentos' };
export interface ProductConfiguration {
  identity: Partial<Record<string, string>>;
  appearance: Partial<Record<string, string>>;
  typography: Partial<Record<string, string | number>>;
  labels: Record<string, string>;
  formats: Partial<Record<string, string>>;
  flags: Record<string, import('./moduleCatalog').FeatureState>;
}
