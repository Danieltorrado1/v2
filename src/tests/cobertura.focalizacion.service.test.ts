import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const serviceSource = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.focalizacion.service.ts'),
  'utf8',
);
const routesSource = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.routes.ts'),
  'utf8',
);
const coberturaSource = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.service.ts'),
  'utf8',
);
const jobSource = readFileSync(
  path.join(process.cwd(), 'src/jobs/cobertura.job.ts'),
  'utf8',
);
const alertasSource = readFileSync(
  path.join(process.cwd(), 'src/modules/alertas/alertas.generator.ts'),
  'utf8',
);

test('servicio de focalizacion guarda archivo original y usa sha256 para idempotencia', () => {
  assert.match(serviceSource, /createHash\('sha256'\)/);
  assert.match(serviceSource, /storage_bucket/);
  assert.match(serviceSource, /storage_path/);
  assert.match(serviceSource, /archivo_sha256/);
});

test('servicio de focalizacion versiona sobre focalizacion_vigencias y sincroniza focalizacion_final', () => {
  assert.match(serviceSource, /INSERT INTO focalizacion_vigencias/);
  assert.match(serviceSource, /UPDATE focalizacion_vigencias SET vigente_hasta/);
  assert.match(serviceSource, /INSERT INTO focalizacion_final/);
  assert.match(serviceSource, /UPDATE focalizacion_final/);
  assert.match(serviceSource, /regla_config_id/);
  assert.match(serviceSource, /cobertura_requerida/);
  assert.match(serviceSource, /cobertura_estado/);
  assert.match(serviceSource, /vigente_desde/);
  assert.match(serviceSource, /vigente_hasta/);
});

test('rutas de cobertura exponen plantilla, upload, reproceso y ajuste manual solo administrativo', () => {
  assert.match(routesSource, /tenantMiddleware/);
  assert.match(routesSource, /\/focalizacion\/template/);
  assert.match(routesSource, /\/focalizacion\/importaciones'/);
  assert.match(routesSource, /\/focalizacion\/importaciones\/:id'/);
  assert.match(routesSource, /\/focalizacion\/importaciones\/:id\/reporte'/);
  assert.match(routesSource, /\/focalizacion\/importaciones\/:id\/reprocesar'/);
  assert.match(routesSource, /\/focalizacion\/ajustes-manuales'/);
  assert.match(routesSource, /administracion\.configuracion_calculadoras\.update/);
});

test('servicio de focalizacion permite reproceso sin recargar XLSX y alerta archivo posterior a manual', () => {
  assert.match(serviceSource, /REPROCESSABLE_STATES/);
  assert.match(serviceSource, /SEDE_NO_RECONOCIDA/);
  assert.match(serviceSource, /MODALIDAD_NO_RECONOCIDA/);
  assert.match(serviceSource, /MUNICIPIO_NO_RECONOCIDO/);
  assert.match(serviceSource, /FECHA_VIGENCIA_NO_RECONOCIDA/);
  assert.match(serviceSource, /SIN_REGLA_COBERTURA/);
  assert.match(serviceSource, /createSystemAlertFromCandidate/);
  assert.match(serviceSource, /FOCALIZACION_OFICIAL_POSTERIOR_A_AJUSTE_MANUAL/);
  assert.match(serviceSource, /OFICIAL_POSTERIOR_AJUSTE_MANUAL/);
});

test('consumidores de cobertura ya no recalculan reglas contractuales hardcodeadas', () => {
  assert.doesNotMatch(coberturaSource, /calculateRequiredCoverage\(/);
  assert.doesNotMatch(jobSource, /COALESCE\(m\.codigo_base, ''\) = 'CAARES'/);
  assert.doesNotMatch(jobSource, /COALESCE\(ff\.cupos_aprobados, 0\) <= 100/);
  assert.doesNotMatch(alertasSource, /COALESCE\(m\.codigo_base, ''\) = 'CAARES'/);
  assert.doesNotMatch(alertasSource, /COALESCE\(ff\.cupos_aprobados, 0\) <= 100/);
  assert.match(jobSource, /ff\.cobertura_requerida AS manipuladores_requeridos/);
  assert.match(alertasSource, /ff\.cobertura_requerida AS manipuladores_requeridos/);
});
