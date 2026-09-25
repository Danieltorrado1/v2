import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeNumeroDocumento } from '../modules/personas/personas.identificaciones.helpers';

const nomina = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const planilla = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
const personas = readFileSync('src/modules/personas/personas.service.ts', 'utf8');

test('asistencia filtra novedades ordinarias por periodo y devuelve rango sanitizado', () => {
  assert.match(nomina, /n\.periodo_id = \$2::bigint/);
  assert.match(nomina, /\$\{first\.fecha_inicio\} a \$\{first\.fecha_fin\}/);
});

test('documentos se comparan con la misma normalización en búsqueda y vinculación', () => {
  assert.equal(normalizeNumeroDocumento('  cc-1.234  '), 'CC1234');
  assert.match(personas, /regexp_replace\(upper\(COALESCE\(p\.numero_documento/);
  assert.match(personas, /normalizeNumeroDocumento\(numeroDocumento\)/);
});

test('Planilla no pinta turnos externos ni anulados como adicionales internos', () => {
  assert.match(planilla, /item\.tipo_turno !== "INTERNO"/);
  assert.match(planilla, /item\.estado === "ANULADO"/);
  assert.match(nomina, /nnt\.movimiento_id IS NULL OR COALESCE\(nm\.activo, TRUE\) = TRUE/);
});

test('bulk registra claves de idempotencia y la UI sólo confirma tras confirmados', () => {
  assert.match(nomina, /idempotency_keys/);
  assert.match(planilla, /CONFIRMADO_SERVIDOR/);
  assert.match(planilla, /Asistencia guardada por el servidor/);
});

test('la cola intenta flush al abandonar contexto y advierte antes de cerrar', () => {
  assert.match(planilla, /visibilitychange/);
  assert.match(planilla, /pagehide/);
  assert.match(planilla, /beforeunload/);
  assert.match(planilla, /event\.returnValue/);
});

test('el indicador de turno interno es accesible y coexiste con asistencia y novedad', () => {
  assert.match(planilla, /className="op-internal-turn-indicator"/);
  assert.match(planilla, /aria-label=\{additionalTurnsOnThisDay.length === 1/);
  assert.match(planilla, /title=\{additionalTurnsOnThisDay.length === 1/);
  assert.match(planilla, /Clock3/);
  assert.match(planilla, /op-attendance-mark/);
  assert.match(planilla, /op-novelty-mark/);
  assert.match(planilla, /getNominaNovedadTurnosOperativos/);
});

test('el diagnóstico de la cola es exportable y no incluye identidad personal', () => {
  const queue = readFileSync('FrontendNuevo/src/pages/nomina/attendanceQueue.ts', 'utf8');
  assert.match(queue, /buildAttendanceDiagnostic/);
  assert.match(queue, /attendanceDiagnosticCsv/);
  assert.doesNotMatch(queue, /nombre_completo|numero_documento/);
});
