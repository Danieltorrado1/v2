export type NominaConfigurationUser = {
  roles: string[];
  permissions: string[];
};

export const NOMINA_CONFIGURATION_PERMISSION = 'nomina.economico.read';

export function canAccessNominaConfiguration(user: NominaConfigurationUser | null | undefined): boolean {
  return Boolean(
    user
      && ['ADMINISTRADOR', 'TALENTO_HUMANO'].some((role) => user.roles.includes(role))
      && user.permissions.includes(NOMINA_CONFIGURATION_PERMISSION),
  );
}
