import type { EmpresaCapabilities } from '../services/saasApi';
import { tenantModules, type ModuleEntry } from './moduleCatalog';
import { visiblePayrollLinks } from './payrollNavigation';
import { getEffectiveConfig } from '../services/moduleVisibilityStore';
import { canAccessNominaConfiguration } from './nominaConfigurationAccess';

export type AccessUser = { roles: string[]; permissions: string[] };
export type ModuleCapabilities = Pick<EmpresaCapabilities, 'modulos' | 'modulos_habilitados'>;
export const isGlobalAdministrator = (user: AccessUser | null | undefined) => (user as (AccessUser & { isGlobalAdmin?: boolean }) | null | undefined)?.isGlobalAdmin === true;
export { canAccessNominaConfiguration, canManageNominaConfiguration, canReadNominaConfiguration } from './nominaConfigurationAccess';
export function hasPermission(user: AccessUser | null | undefined, required: string[]) {
  return !!user && (!required.length || required.some(code => code.endsWith('.*')
    ? user.permissions.some(permission => permission.startsWith(code.slice(0, -1)))
    : user.permissions.includes(code)));
}

/** The SaaS response exposes both the effective map and its canonical enabled-code list. */
export function isModuleEnabled(capabilities: ModuleCapabilities | null | undefined, code: string): boolean {
  if (!capabilities) return false;
  if (Object.prototype.hasOwnProperty.call(capabilities.modulos, code)) return capabilities.modulos[code] === true;
  return capabilities.modulos_habilitados.includes(code);
}

export function normalizeModuleFlags(capabilities: ModuleCapabilities): Record<string, boolean> {
  const flags = { ...capabilities.modulos };
  for (const code of capabilities.modulos_habilitados) {
    if (!Object.prototype.hasOwnProperty.call(flags, code)) flags[code] = true;
  }
  return flags;
}

/** Transitional adapter: existing entitlements stay authoritative. Unknown codes never enable a feature. */
export function featureEnabled(item: ModuleEntry, flags: Record<string, boolean>, parent?: ModuleEntry): boolean {
  if (item.code === 'CONFIG_EMPRESA_NOMINA' && parent?.code === 'CONFIGURACION_EMPRESA') {
    return flags.NOMINA === true;
  }
  if (item.code === 'CONFIGURACION_EMPRESA' || parent?.code === 'CONFIGURACION_EMPRESA') {
    return !(item.featureCode in flags) || flags[item.featureCode] === true;
  }
  if (item.code === 'PERSONAL' && !item.children.some(child => child.featureCode in flags)) {
    // PERSONAL was a standalone database module. Its new group also contains separately licensed legacy products.
    return item.legacyCodes.some(code => flags[code] === true);
  }
  if (item.featureCode in flags) return flags[item.featureCode] === true;
  // OPERACION and LOGISTICA are licensed as parent SaaS modules; their static
  // navigation children are not separate plan entitlements in the backend catalog.
  if (parent && (parent.code === 'OPERACION' || parent.code === 'LOGISTICA')) {
    return featureEnabled(parent, flags);
  }
  if (item.legacyCodes.length) return item.legacyCodes.some(code => flags[code] === true);
  // New child codes require explicit enrollment, even when the parent is licensed.
  return false;
}

export function catalogModuleEnabled(code: string, flags: Record<string, boolean>): boolean {
  const module = tenantModules.find((item) => item.code === code);
  return module ? featureEnabled(module, flags) : false;
}

export function canAccessEntry(item: ModuleEntry, user: AccessUser | null | undefined, flags: Record<string, boolean>, parent?: ModuleEntry): boolean {
  if (item.scope === 'GLOBAL') return isGlobalAdministrator(user);
  if (item.code === 'PERSONAL_NOMINA' && !visiblePayrollLinks(user).length) return false;
  const payrollConfigurationEntry = item.code === 'CONFIG_EMPRESA_NOMINA';
  const economicConfigurationAccess = item.code === 'CONFIG_EMPRESA_NOMINA'
    ? canAccessNominaConfiguration(user, catalogModuleEnabled('NOMINA', flags))
    : hasPermission(user, item.permission);
  const itemEnabled = payrollConfigurationEntry ? catalogModuleEnabled('NOMINA', flags) : featureEnabled(item, flags, parent);
  const parentEnabled = payrollConfigurationEntry || !parent || featureEnabled(parent, flags);
  return (!item.globalOnly || isGlobalAdministrator(user)) && itemEnabled
    && parentEnabled && economicConfigurationAccess
    && (!item.allowedRoles || item.allowedRoles.some((role) => user?.roles.includes(role)));
}

export function visibleTenantModules(user: AccessUser | null | undefined, capabilities: EmpresaCapabilities | null, empresaId: number | null): ModuleEntry[] {
  if (!empresaId || !capabilities || Number(capabilities.empresa.id) !== empresaId) return [];
  const flags = normalizeModuleFlags(capabilities);
  const visual = getEffectiveConfig(user, empresaId);
  return tenantModules.flatMap(parent => {
    if (visual.modules[parent.code] === false) return [];
    const parentEnabled = parent.code === 'CONFIGURACION_EMPRESA'
      ? featureEnabled(parent, flags) || catalogModuleEnabled('NOMINA', flags)
      : featureEnabled(parent, flags);
    if (!parentEnabled) return [];
    const children = parent.children.filter(child => visual.children[child.code] !== false && canAccessEntry(child, user, flags, parent));
    if (parent.children.length && !children.length) return [];
    if (!parent.children.length && !canAccessEntry(parent, user, flags)) return [];
    return [{ ...parent, children, route: children[0]?.route ?? parent.route }];
  });
}

function matches(route: string, pathname: string, search: string) {
  const [path, query] = route.split('?');
  if (query) return pathname === path && new URLSearchParams(search).get('tab') === new URLSearchParams(query).get('tab');
  return pathname === path || pathname.startsWith(`${path}/`);
}
export function resolveCatalogLocation(pathname: string, search = ''): { module: ModuleEntry; entry: ModuleEntry } | null {
  const candidates = tenantModules.flatMap(module => [
    ...(module.children.length ? [] : [module]),
    ...module.children,
  ].flatMap(entry => [entry.route, ...entry.aliases].map(route => ({ module, entry, route }))));
  // /personal is a legacy exact leaf, not a catch-all for disabled new submodules.
  const match = candidates.filter(item => item.route === '/personal' ? pathname === '/personal' : matches(item.route, pathname, search))
    .sort((a, b) => b.route.length - a.route.length)[0];
  if (match) return match;
  if (pathname === '/sst') {
    const module = tenantModules.find(item => item.code === 'SST')!;
    return { module, entry: module.children[1] };
  }
  if (pathname === '/dashboard') {
    const module = tenantModules.find(item => item.code === 'PERSONAL')!;
    return { module, entry: { ...module.children[0], permission: ['dashboard.read'], legacyCodes: ['DASHBOARD'] } };
  }
  const module = tenantModules.find(item => item.route === pathname);
  return module ? { module, entry: module } : null;
}
