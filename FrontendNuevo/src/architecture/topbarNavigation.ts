import type { ModuleEntry } from './moduleCatalog';

export const promotedPersonalCodes = ['PERSONAL_NOMINA', 'PERSONAL_PORTAL_SERVICIOS'];

/** Presentation only: input must already be filtered by visibleTenantModules. */
export function topbarNavigation(modules: ModuleEntry[]): ModuleEntry[] {
  const order = ['AGENDA_OPERATIVA', 'PERSONAL', 'NOMINA', 'PERSONAL_NOMINA', 'OPERACION', 'LOGISTICA', 'SST', 'PERSONAL_PORTAL_SERVICIOS', 'CONFIGURACION_EMPRESA'];
  return modules.flatMap(item => {
    if (item.code === 'NOMINA') return [{ ...item, route: '/nomina/planilla-operativa' }];
    if (item.code !== 'PERSONAL') return [item];
    const children = item.children.filter(child => !promotedPersonalCodes.includes(child.code));
    const direct = children.find(child => child.code === 'PERSONAL_BASE_DATOS') ?? children[0];
    return [
      ...(direct ? [{ ...item, route: direct.route, children: [] }] : []),
      ...item.children.filter(child => promotedPersonalCodes.includes(child.code)).map(child => ({
        ...child, label: child.code === 'PERSONAL_PORTAL_SERVICIOS' ? 'Portal' : child.label,
      })),
    ];
  }).sort((a, b) => {
    const aIndex = order.indexOf(a.code);
    const bIndex = order.indexOf(b.code);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
}
