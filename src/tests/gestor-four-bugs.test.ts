import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const router = readFileSync('FrontendNuevo/src/router/AppRouter.tsx', 'utf8');
const login = readFileSync('FrontendNuevo/src/pages/auth/LoginPage.tsx', 'utf8');
const drawer = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaProcesosTab.tsx', 'utf8');
const routes = readFileSync('src/modules/nomina/nomina.routes.ts', 'utf8');
const procesos = readFileSync('src/modules/nomina/nomina.procesos.ts', 'utf8');
const nomina = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const externos = readFileSync('src/modules/nomina/cobertura.externos.service.ts', 'utf8');
const navigation = readFileSync('FrontendNuevo/src/router/roleNavigation.ts', 'utf8');
const moduleRoute = readFileSync('FrontendNuevo/src/router/ModuleRoute.tsx', 'utf8');

test('GESTOR queda restringido a cobertura y no puede cargar Dashboard', () => {
  assert.match(navigation, /GESTOR_HOME_PATH = "\/nomina\/cobertura"/);
  assert.match(navigation, /roles\.includes\("GESTOR"\).*roles\.includes\("TALENTO_HUMANO"\) !== true/s);
  assert.match(navigation, /return !isGestorOnly\(user\) && user\?\.permissions\.includes\("dashboard\.read"\)/);
  assert.match(moduleRoute, /input\.roles\.includes\('GESTOR'\) \? '\/nomina\/cobertura' : '\/nomina'/);
  assert.match(router, /path="dashboard"[\s\S]*code="DASHBOARD"[\s\S]*dashboard\.read/);
  assert.match(moduleRoute, /canAccessDashboard\(user\)/);
  assert.match(login, /resolveAuthenticatedHome\(user\)/);
});

test('ADMIN y TH conservan Dashboard cuando tienen permiso', () => {
  assert.match(navigation, /roles\.includes\("ADMINISTRADOR"\)\) return "\/admin-global"/);
  assert.match(navigation, /return "\/empresa"/);
  assert.match(navigation, /return !isGestorOnly\(user\) && user\?\.permissions\.includes\("dashboard\.read"\)/);
});

test('Turnos reutilizan scope canónico en listado y mutaciones por empleado', () => {
  assert.match(nomina, /getNominaMovimientos[\s\S]*appendNominaCoberturaScope\(conditions, params, tenant\)/);
  assert.match(nomina, /listNominaNovedadTurnosOperativos[\s\S]*appendNominaCoberturaScope\(conditions, params, tenant\)/);
  assert.ok((nomina.match(/assertNominaEmpleadoCoberturaScope\(current\.nomina_empleado_id/g) ?? []).length >= 2);
  assert.match(nomina, /assertNominaEmpleadoCoberturaScope\(input\.nomina_empleado_id/);
  assert.match(nomina, /empleadoReemplazado[\s\S]*assertNominaEmpleadoCoberturaScope/);
  assert.match(externos, /listCoberturaExternosOperativos[\s\S]*appendNominaCoberturaScope/);
});

test('Planilla resuelve el alcance canónico con prioridad y desempate estable', () => {
  assert.match(nomina, /gestorApplicableCargoSql\('cc'\)/);
  assert.match(nomina, /'MUNICIPIO'::text[\s\S]*1 AS prioridad/);
  assert.match(nomina, /'INSTITUCION'::text[\s\S]*2/);
  assert.match(nomina, /'PERSONA'::text[\s\S]*3/);
  assert.match(nomina, /scope\.prioridad ASC, scope\.vigencia_desde DESC, scope\.id DESC/);
  assert.match(nomina, /LIMIT 1/);
  assert.match(nomina, /gma\.vigencia_desde <= np\.fecha_fin/);
  assert.match(nomina, /gma\.vigencia_hasta IS NULL OR gma\.vigencia_hasta >= np\.fecha_inicio/);

  const overlapsPeriod = (start: string, end: string | null, periodStart: string, periodEnd: string) =>
    start <= periodEnd && (end === null || end >= periodStart);
  assert.equal(overlapsPeriod('2026-08-26', '2026-09-25', '2026-08-26', '2026-09-25'), true);
  assert.equal(overlapsPeriod('2026-08-01', '2026-08-25', '2026-08-26', '2026-09-25'), false);
  assert.equal(overlapsPeriod('2026-09-26', null, '2026-08-26', '2026-09-25'), false);
  assert.equal(overlapsPeriod('2026-08-26', '2026-08-27', '2026-09-01', '2026-09-25'), false);
  assert.equal(overlapsPeriod('2026-08-01', '2026-09-01', '2026-08-26', '2026-09-25'), true);
  assert.equal(overlapsPeriod('2026-08-26', '2026-09-25', '2026-08-26', '2026-09-25'), true);
  assert.match(nomina, /assertPeriodoAllowsOpenMutations/);
  assert.match(nomina, /np\.contrato_id = v\.contrato_id/);
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

test('Turnos protegen externos y cuentas por alcance municipal', () => {
  assert.match(procesos, /assertNominaExternoCoberturaScope/);
  assert.match(externos, /listCoberturaExternos[\s\S]*filterCoberturaExternosByScope/);
  assert.match(externos, /uploadCoberturaExternoDocumento[\s\S]*assertNominaExternoCoberturaScope/);
  assert.match(externos, /generateCoberturaCuenta[\s\S]*assertNominaExternoCoberturaScope/);
  assert.match(externos, /getCoberturaCuentaDownload[\s\S]*assertNominaExternoCoberturaScope/);
  assert.match(externos, /uploadCoberturaCuentaFirmada[\s\S]*assertNominaExternoCoberturaScope/);
  assert.match(routes, /cobertura\/externos\/:id\/documentos/);
  assert.match(routes, /cobertura\/cuentas-cobro\/:id\/download/);
  assert.match(routes, /cobertura\/cuentas-cobro\/:id\/firmada/);
});
