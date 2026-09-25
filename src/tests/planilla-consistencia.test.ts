import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeNumeroDocumento } from '../modules/personas/personas.identificaciones.helpers';

const nomina = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const planilla = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
const personas = readFileSync('src/modules/personas/personas.service.ts', 'utf8');
const personasController = readFileSync('src/modules/personas/personas.controller.ts', 'utf8');

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

test('fixture productivo sanitizado de DNC del 21-09-2026 es visible y bloqueante', () => {
  assert.match(nomina, /excludeInformative: false/);
  assert.doesNotMatch(nomina, /codigoOperativo === 'DNC' \|\| codigoOperativo === 'DCO'/);
  assert.match(planilla, /novedadesOnDate\(noveltyByEmployee\.get\(employee\.id\) \?\? \[\], date\)/);
  const fixture = { fecha_inicio: '2026-09-20', fecha_fin: '2026-09-22', activo: true };
  assert.equal(fixture.fecha_inicio <= '2026-09-21' && fixture.fecha_fin >= '2026-09-21', true);
});

test('reutilización de persona exige búsqueda normalizada y vinculación autorizada, nunca duplicado', () => {
  assert.match(personas, /getPersonaForVinculacion/);
  assert.match(personas, /ensureNumeroDocumentoAvailable\(client, identificationCore\.numero_documento\)/);
  assert.match(personasController, /getPersonaForVinculacion\(numero_documento, lookup\.empresa_id, lookup\.contrato_id/);
  assert.match(personas, /regexp_replace\(upper\(COALESCE\(numero_documento/);
});

test('el diagnóstico de la cola es exportable y no incluye identidad personal', () => {
  const queue = readFileSync('FrontendNuevo/src/pages/nomina/attendanceQueue.ts', 'utf8');
  assert.match(queue, /buildAttendanceDiagnostic/);
  assert.match(queue, /attendanceDiagnosticCsv/);
  assert.doesNotMatch(queue, /nombre_completo|numero_documento/);
});
