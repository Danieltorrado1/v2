import { tenantModules, type ModuleEntry } from '../architecture/moduleCatalog';

/** Frontend-only preference store. It is intentionally browser/origin scoped until a tenant API is introduced. */
export type ModuleVisibilityConfig = { modules: Record<string, boolean>; children: Record<string, boolean> };
type VisibilityState = { roles: Record<string, ModuleVisibilityConfig>; users: Record<string, ModuleVisibilityConfig> };
type VisibilityUser = { id?: string | number; roles?: string[] };
export const MODULE_VISIBILITY_EVENT = 'empiria:module-visibility-changed';

const key = (empresaId: number) => `empiria:moduleVisibility:v1:${empresaId}`;
const clone = (value: ModuleVisibilityConfig): ModuleVisibilityConfig => ({ modules: { ...value.modules }, children: { ...value.children } });

function defaultConfig(role?: string): ModuleVisibilityConfig {
  const modules: Record<string, boolean> = {};
  const children: Record<string, boolean> = {};
  tenantModules.forEach((module) => {
    modules[module.code] = role === 'TALENTO_HUMANO' ? module.code === 'PERSONAL' : true;
    module.children.forEach((child) => { children[child.code] = true; });
  });
  return { modules, children };
}

function read(empresaId: number): VisibilityState {
  if (typeof window === 'undefined') return { roles: {}, users: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(empresaId)) ?? '{}') as Partial<VisibilityState>;
    return { roles: parsed.roles ?? {}, users: parsed.users ?? {} };
  } catch { return { roles: {}, users: {} }; }
}
function write(empresaId: number, state: VisibilityState) {
  window.localStorage.setItem(key(empresaId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(MODULE_VISIBILITY_EVENT, { detail: { empresaId } }));
}
export function getRoleConfig(role: string, empresaId: number): ModuleVisibilityConfig | null { return read(empresaId).roles[role] ? clone(read(empresaId).roles[role]) : null; }
export function setRoleConfig(role: string, config: ModuleVisibilityConfig, empresaId: number) { const state = read(empresaId); state.roles[role] = clone(config); write(empresaId, state); }
export function resetRoleConfig(role: string, empresaId: number) { const state = read(empresaId); delete state.roles[role]; write(empresaId, state); }
export function getUserOverride(userId: string | number, empresaId: number): ModuleVisibilityConfig | null { const value = read(empresaId).users[String(userId)]; return value ? clone(value) : null; }
export function setUserOverride(userId: string | number, config: ModuleVisibilityConfig, empresaId: number) { const state = read(empresaId); state.users[String(userId)] = clone(config); write(empresaId, state); }
export function clearUserOverride(userId: string | number, empresaId: number) { const state = read(empresaId); delete state.users[String(userId)]; write(empresaId, state); }
export function getEffectiveConfig(user: VisibilityUser | null | undefined, empresaId: number): ModuleVisibilityConfig {
  if (!user) return defaultConfig();
  const state = read(empresaId);
  const override = user.id == null ? null : state.users[String(user.id)];
  if (override) return clone(override);
  const role = (user.roles ?? []).find((name) => state.roles[name]);
  return role ? clone(state.roles[role]) : defaultConfig(user.roles?.[0]);
}
export function subscribeModuleVisibility(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(MODULE_VISIBILITY_EVENT, listener);
  return () => window.removeEventListener(MODULE_VISIBILITY_EVENT, listener);
}
export function moduleVisibilityEntries(): ModuleEntry[] { return tenantModules; }
export function getModuleVisibilityStorageKey(empresaId: number) { return key(empresaId); }
