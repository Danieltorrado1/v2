import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const scope = readFileSync('src/modules/users/municipal-scope.service.ts', 'utf8');
const nominaProcesos = readFileSync('src/modules/nomina/nomina.procesos.ts', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const vinculaciones = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const migration = readFileSync('sql/phase-45-gestor-municipio-single-source.sql', 'utf8');

test('alcance canónico compartido usa municipio, contrato, vigencia y cobertura', () => {
  assert.match(scope, /buildGestorMunicipalityScopeExistsSql/);
  assert.match(scope, /gestor_municipio_asignaciones gma_scope/);
  assert.match(scope, /gma_scope\.contrato_id/);
  assert.match(scope, /gma_scope\.vigencia_desde <= CURRENT_DATE/);
  assert.match(scope, /ff_scope\.municipio_id = gma_scope\.municipio_id/);
});

test('Nómina y Personal consumen el helper municipal, sin autorizar por gestor_personal', () => {
  assert.match(nominaProcesos, /buildGestorMunicipalityScopeExistsSql/);
  assert.match(nominaService, /buildGestorMunicipalityScopeExistsSql/);
  assert.match(vinculaciones, /buildGestorMunicipalityScopeExistsSql/);
  assert.doesNotMatch(nominaProcesos, /gestor_personal_asignaciones gpa_scope/);
});

test('asignaciones municipales activas quedan deduplicadas estructuralmente', () => {
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /uq_gestor_municipio_asignacion_activa/);
  assert.match(migration, /usuario_id, contrato_id, municipio_id/);
  assert.match(migration, /WHERE COALESCE\(activo, TRUE\) = TRUE/);
  assert.match(migration, /ranked\.rn > 1/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(migration, /vigencia_desde >= CURRENT_DATE/);
});
