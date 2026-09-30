import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { canAccessNominaConfiguration, canManageNominaConfiguration, canReadNominaConfiguration } from './nominaConfigurationAccess';
import { canAccessEntry, catalogModuleEnabled, isModuleEnabled, normalizeModuleFlags, resolveCatalogLocation, visibleTenantModules } from './moduleAccess';
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
  assert.ok(visibleTenantModules(admin, { empresa: { id: 15 }, modulos: flags, modulos_habilitados: ['NOMINA'] } as never, 15)
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

test('reproduce el payload productivo sanitizado de empresa 15 y hereda el módulo Nómina canónico', () => {
  const admin = user(['ADMINISTRADOR'], ['nomina.read']);
  const capabilities = {
    empresa: { id: 15, nombre: 'Empresa 15' },
    organizacion: { id: 1, nombre: 'Organización sanitizada' },
    legacy: false,
    suscripcion: { id: 7, estado: 'ACTIVA', fecha_inicio: '2026-01-01', fecha_fin: null, plan: { id: 3, codigo: 'OPERATIVO', nombre: 'Operativo' } },
    modulos: { DASHBOARD: true, PERSONAL: true, CONFIGURACION_EMPRESA: false },
    modulos_habilitados: ['DASHBOARD', 'PERSONAL', 'NOMINA'],
    modulos_deshabilitados: [],
    modulos_plan: ['DASHBOARD', 'PERSONAL', 'NOMINA'],
    overrides: [],
  } as const;
  const location = resolveCatalogLocation('/configuracion/nomina/asignaciones');
  const nomina = tenantModules.find((module) => module.code === 'NOMINA')!;

  assert.equal(isModuleEnabled(capabilities, 'NOMINA'), true);
  assert.equal(isModuleEnabled(capabilities, 'CONFIG_EMPRESA_NOMINA'), false);
  assert.equal(catalogModuleEnabled('CONFIGURACION_EMPRESA', capabilities.modulos), false);
  assert.equal(canAccessEntry(location!.entry, admin, capabilities.modulos, configurationModule), false, 'regresión del guard anterior');
  assert.equal(canAccessEntry(location!.entry, admin, normalizeModuleFlags(capabilities), configurationModule), true);
  assert.ok(visibleTenantModules(admin, capabilities, 15).some((module) => module.code === nomina.code));
});
