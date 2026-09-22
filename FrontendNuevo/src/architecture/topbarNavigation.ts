import type { ModuleEntry } from './moduleCatalog';

export const promotedPersonalCodes = ['PERSONAL_NOMINA', 'PERSONAL_PORTAL_SERVICIOS'];

/** Presentation only: input must already be filtered by visibleTenantModules. */
export function topbarNavigation(modules: ModuleEntry[]): ModuleEntry[] {
  const order = ['AGENDA_OPERATIVA', 'PERSONAL', 'PERSONAL_NOMINA', 'OPERACION', 'LOGISTICA', 'SST', 'PERSONAL_PORTAL_SERVICIOS', 'CONFIGURACION_EMPRESA'];
  return modules.flatMap(item => {
    if (item.code !== 'PERSONAL') return [item];
    const children = item.children.filter(child => !promotedPersonalCodes.includes(child.code));
    const direct = children.find(child => child.code === 'PERSONAL_BASE_DATOS') ?? children[0];
    return [
      ...(direct ? [{ ...item, route: direct.route, children: [] }] : []),
      ...item.children.filter(child => promotedPersonalCodes.includes(child.code)).map(child => ({
        ...child, label: child.code === 'PERSONAL_PORTAL_SERVICIOS' ? 'Portal' : child.label,
      })),
    ];
  }).sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
}
