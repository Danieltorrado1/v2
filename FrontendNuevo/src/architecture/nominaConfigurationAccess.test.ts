import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { canAccessNominaConfiguration, canManageNominaConfiguration, canReadNominaConfiguration } from './nominaConfigurationAccess';
import { canAccessEntry, resolveCatalogLocation, visibleTenantModules } from './moduleAccess';
import { tenantModules } from './moduleCatalog';

const user = (roles: string[], permissions: string[]) => ({ roles, permissions });

test('nomina configuration allows only authorized administrative capabilities', () => {
  assert.equal(canAccessNominaConfiguration(user(['ADMINISTRADOR'], [])), true);
  assert.equal(canAccessNominaConfiguration(user(['ADMINISTRADOR'], ['nomina.economico.read'])), true);
  assert.equal(canAccessNominaConfiguration(user(['TALENTO_HUMANO'], ['nomina.economico.read'])), true);
  assert.equal(canAccessNominaConfiguration(user(['TALENTO_HUMANO'], ['nomina.read'])), false);
  assert.equal(canAccessNominaConfiguration(user(['GESTOR'], ['nomina.economico.read', 'nomina.periodos.update'])), false);
  assert.equal(canAccessNominaConfiguration(user(['OPERARIO'], ['nomina.economico.read'])), false);
  assert.equal(canReadNominaConfiguration(user(['ADMINISTRADOR'], [])), true);
  assert.equal(canManageNominaConfiguration(user(['ADMINISTRADOR'], []), 'nomina.categorias.manage'), true);
});

const configurationModule = tenantModules.find((module) => module.code === 'CONFIGURACION_EMPRESA')!;
const payrollConfigurationEntry = configurationModule.children.find((entry) => entry.code === 'CONFIG_EMPRESA_NOMINA')!;

test('ADMINISTRADOR hereda la habilitación del módulo NOMINA, sin módulo económico independiente', () => {
  const admin = user(['ADMINISTRADOR'], []);
  const flags = { NOMINA: true, CONFIG_EMPRESA_NOMINA: false };
  assert.equal(canAccessEntry(payrollConfigurationEntry, admin, flags, configurationModule), true);
  assert.ok(visibleTenantModules(admin, { empresa: { id: 15 }, modulos: flags } as never, 15)
    .some((module) => module.children.some((entry) => entry.code === 'CONFIG_EMPRESA_NOMINA')));
});

test('la ruta directa y el botón comparten exactamente la decisión de módulo y rol', () => {
  const flags = { NOMINA: true, CONFIG_EMPRESA_NOMINA: false };
  for (const [roles, permissions, expected] of [
    [['ADMINISTRADOR'], [], true],
    [['TALENTO_HUMANO'], ['nomina.economico.read'], true],
    [['TALENTO_HUMANO'], [], false],
    [['GESTOR'], ['nomina.economico.read'], false],
  ] as const) {
    const currentUser = user([...roles], [...permissions]);
    assert.equal(canAccessNominaConfiguration(currentUser, flags.NOMINA), expected);
    assert.equal(canAccessEntry(payrollConfigurationEntry, currentUser, flags, configurationModule), expected);
  }
  assert.equal(canAccessNominaConfiguration(user(['ADMINISTRADOR'], []), false), false);
  assert.equal(canAccessEntry(payrollConfigurationEntry, user(['ADMINISTRADOR'], []), { NOMINA: false }, configurationModule), false);
});

test('la navegación directa resuelve el catálogo económico y la hidratación conserva la sesión al recargar', () => {
  const location = resolveCatalogLocation('/configuracion/nomina/asignaciones');
  assert.equal(location?.entry.code, 'CONFIG_EMPRESA_NOMINA');
  const router = readFileSync(join(process.cwd(), 'FrontendNuevo/src/router/AppRouter.tsx'), 'utf8');
  const auth = readFileSync(join(process.cwd(), 'FrontendNuevo/src/context/AuthContext.tsx'), 'utf8');
  const access = readFileSync(join(process.cwd(), 'FrontendNuevo/src/architecture/WorkspaceAccess.tsx'), 'utf8');
  assert.match(router, /configuracion\/nomina/);
  assert.match(auth, /getAuthToken\(\)/);
  assert.match(auth, /getAuthUser\(\)/);
  assert.match(access, /canAccessEntry\(current\.entry/);
});
