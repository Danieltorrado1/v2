// Never inherit a database connection or job configuration from the developer.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const suites = [
  'instituciones.modalidad-temporal', 'operational-context.canonical',
  'operacion.instituciones.canonica', 'modalidad-vigencia.e2e',
  'nomina.cambio-contexto', 'personal.asignacion-operativa.regression',
  'vinculaciones.personal', 'personal-3a-asignacion-operativa',
  'personal-history-rbac', 'personal-cobertura-filtros',
  'nomina.planilla.context', 'planilla-consistencia', 'nomina.tramos-operativos',
  'nomina.cobertura', 'nomina.cobertura-cierre', 'nomina.population',
  'nomina.population-sync', 'nomina.population-economic-sync',
  'nomina.4b1.scopes', 'nomina-economic-rbac', 'nomina-admin-config-rbac',
  'nomina-turnos-gestor-rbac', 'gestor-scope-single-source',
  'integracion.fase1', 'integracion.fase4.flags', 'integracion.periodos-semantica',
  'contracts.security', 'admin-2a-contexto-empresarial', 'nomina.operational-cut'
].map(name => `src/tests/${name}.test.ts`).concat([
  'FrontendNuevo/src/pages/nomina/cambioOperativo.test.ts',
  'FrontendNuevo/src/pages/nomina/planillaOperativa.test.ts',
  'FrontendNuevo/src/pages/operacion/institucionesPresentation.test.ts'
]);
const env = { ...process.env, ENV_FILE: resolve(root, 'nonexistent-isolated-test-env'),
  APP_NAME: 'isolated-modality-tests', API_PREFIX: '/api', NODE_ENV: 'test', PORT: '3999',
  DATABASE_URL: 'postgresql://isolated:isolated@127.0.0.1:1/isolated',
  JWT_SECRET: 'isolated-test-only', JWT_EXPIRES_IN: '1h', CORS_ORIGIN: 'http://localhost',
  TRUST_PROXY: 'false', RATE_LIMIT_WINDOW_MINUTES: '1', RATE_LIMIT_MAX_REQUESTS: '100',
  LOG_LEVEL: 'error', ENABLE_JOBS: 'false', INTEGRACION_OUTBOX_ENABLED:'false',
  INTEGRACION_SYNC_ENABLED:'false', INTEGRACION_RECALC_ENABLED:'false', SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-only', SUPABASE_STORAGE_BUCKET: 'test'
};
const selected = process.argv.slice(2);
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'),
  '--test', '--test-concurrency=1', ...(selected.length ? selected : suites)],
  { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
