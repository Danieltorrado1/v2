import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const router = readFileSync('FrontendNuevo/src/router/AppRouter.tsx', 'utf8');
const layout = readFileSync('FrontendNuevo/src/layouts/MainLayout.tsx', 'utf8');
const login = readFileSync('FrontendNuevo/src/pages/auth/LoginPage.tsx', 'utf8');
const drawer = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaProcesosTab.tsx', 'utf8');
const routes = readFileSync('src/modules/nomina/nomina.routes.ts', 'utf8');
const procesos = readFileSync('src/modules/nomina/nomina.procesos.ts', 'utf8');
const nomina = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const externos = readFileSync('src/modules/nomina/cobertura.externos.service.ts', 'utf8');
const navigation = readFileSync('FrontendNuevo/src/router/roleNavigation.ts', 'utf8');

test('GESTOR aterriza en Planilla y no puede cargar Dashboard', () => {
  assert.match(navigation, /isGestorOnly\(user\).*GESTOR_HOME_PATH/s);
  assert.match(navigation, /!isGestorOnly\(user\).*dashboard\.read/s);
  assert.match(router, /path="dashboard"[\s\S]*code="DASHBOARD"[\s\S]*dashboard\.read/);
  assert.match(layout, /canAccessDashboard\(user\)/);
  assert.match(login, /resolveAuthenticatedHome\(user\)/);
});

test('ADMIN y TH conservan Dashboard cuando tienen permiso', () => {
  assert.match(navigation, /if \(canAccessDashboard\(user\)\) return "\/dashboard"/);
  assert.doesNotMatch(navigation, /TALENTO_HUMANO.*GESTOR_HOME_PATH/);
});

test('Turnos reutilizan scope canónico en listado y mutaciones por empleado', () => {
  assert.match(nomina, /getNominaMovimientos[\s\S]*appendNominaCoberturaScope\(conditions, params, tenant\)/);
  assert.match(nomina, /listNominaNovedadTurnosOperativos[\s\S]*appendNominaCoberturaScope\(conditions, params, tenant\)/);
  assert.ok((nomina.match(/assertNominaEmpleadoCoberturaScope\(current\.nomina_empleado_id/g) ?? []).length >= 2);
  assert.match(nomina, /assertNominaEmpleadoCoberturaScope\(input\.nomina_empleado_id/);
  assert.match(nomina, /empleadoReemplazado[\s\S]*assertNominaEmpleadoCoberturaScope/);
  assert.match(externos, /listCoberturaExternosOperativos[\s\S]*appendNominaCoberturaScope/);
});

test('Planilla prioriza asignación directa y resuelve gestor territorial único sin elección arbitraria', () => {
  assert.match(nomina, /0 AS prioridad[\s\S]*1 AS prioridad/);
  assert.match(nomina, /COUNT\(DISTINCT gma\.usuario_id\) = 1/);
  assert.match(nomina, /Múltiples gestores/);
  assert.match(nomina, /gma\.vigencia_desde <= CURRENT_DATE/);
  assert.match(nomina, /'PERSONAL'::text AS gestor_origen/);
  assert.match(nomina, /'MUNICIPIO'::text ELSE 'MUNICIPIO_AMBIGUO'/);
});

test('Drawer usa usuarios asociados a empresa activa y expone estados reales', () => {
  assert.match(routes, /procesos\/usuarios-asignables/);
  assert.match(procesos, /INNER JOIN usuario_empresas ue/);
  assert.match(procesos, /ue\.empresa_id = \$1::bigint/);
  assert.match(drawer, /usuarios-asignables/);
  assert.match(drawer, /Cargando usuarios/);
  assert.match(drawer, /No hay usuarios disponibles/);
  assert.match(drawer, /No fue posible cargar los usuarios:/);
  assert.match(drawer, /user\.name} \$\{user\.email/);
  assert.match(drawer, /apiClient\.put\('\/nomina\/procesos\/responsabilidades'/);
});
