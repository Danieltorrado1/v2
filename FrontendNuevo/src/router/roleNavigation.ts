type NavigationUser = { roles: string[]; permissions: string[] };

export const GESTOR_HOME_PATH = "/nomina/cobertura";

export function isGestorOnly(user: Pick<NavigationUser, "roles"> | null | undefined): boolean {
  return user?.roles.includes("GESTOR") === true && user.roles.includes("TALENTO_HUMANO") !== true;
}

export function canAccessDashboard(user: NavigationUser | null | undefined): boolean {
  return !isGestorOnly(user) && user?.permissions.includes("dashboard.read") === true;
}

export function resolveAuthenticatedHome(user: NavigationUser): string {
  if (isGestorOnly(user) && user.permissions.includes("nomina.operativa.read")) return GESTOR_HOME_PATH;
  if (canAccessDashboard(user)) return "/dashboard";
  if (user.permissions.includes("nomina.read")) return "/nomina";
  if (user.permissions.includes("nomina.operativa.read")) return GESTOR_HOME_PATH;
  if (user.permissions.includes("vinculaciones.read")) return "/personal";
  return "/portal";
}
