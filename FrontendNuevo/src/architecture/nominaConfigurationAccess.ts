export type NominaConfigurationUser = {
  roles: string[];
  permissions: string[];
};

export const NOMINA_CONFIGURATION_PERMISSION = 'nomina.economico.read';

export function canReadNominaConfiguration(user: NominaConfigurationUser | null | undefined): boolean {
  return Boolean(user?.roles.includes('ADMINISTRADOR') || user?.permissions.includes(NOMINA_CONFIGURATION_PERMISSION));
}

export function canManageNominaConfiguration(user: NominaConfigurationUser | null | undefined, permission: string): boolean {
  return Boolean(user?.roles.includes('ADMINISTRADOR') || user?.permissions.includes(permission));
}

export function canAccessNominaConfiguration(
  user: NominaConfigurationUser | null | undefined,
  nominaEnabled = true,
): boolean {
  return Boolean(
    nominaEnabled
      && user
      && (
        user.roles.includes('ADMINISTRADOR')
        || (
          user.roles.includes('TALENTO_HUMANO')
          && user.permissions.includes(NOMINA_CONFIGURATION_PERMISSION)
        )
      ),
  );
}
