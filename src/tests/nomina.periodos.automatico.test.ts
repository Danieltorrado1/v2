import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.resolve(process.cwd(), 'src/modules/nomina/nomina.service.ts'),
  'utf8'
);

const sectionFrom = (marker: string) => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `No se encontró ${marker}`);
  const nextExport = source.indexOf('\nexport ', start + marker.length);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
};

test('el aseguramiento mensual calcula mes completo y conserva ABIERTO', () => {
  const section = sectionFrom('export const ensureCurrentNominaPeriods');

  assert.match(section, /date_trunc\('month', CURRENT_DATE\)/);
  assert.match(section, /interval '1 month - 1 day'/);
  assert.match(section, /tipo_periodo = 'MENSUAL'/);
  assert.match(section, /'ABIERTO'/);
  assert.match(section, /NOMINA_PERIODO_CREATE_AUTOMATICO/);
});

test('un periodo anterior abierto no bloquea ni se actualiza al asegurar el nuevo mes', () => {
  const section = sectionFrom('export const ensureCurrentNominaPeriods');

  assert.doesNotMatch(section, /UPDATE nomina_periodos/);
  assert.match(section, /if \(existing\) \{/);
  assert.match(section, /createdOrExisting\.push\(existing\)/);
});

test('la creación automática y manual comparten bloqueo transaccional de identidad', () => {
  const lockSection = sectionFrom('const lockNominaPeriodoIdentity');
  const manualSection = sectionFrom('export const createNominaPeriodo');

  assert.match(lockSection, /pg_advisory_xact_lock/);
  assert.match(manualSection, /await lockNominaPeriodoIdentity/);
  assert.match(sectionFrom('export const ensureCurrentNominaPeriods'), /await lockNominaPeriodoIdentity/);
});

test('listar periodos activa el aseguramiento existente sin tocar nómina económica', () => {
  const section = sectionFrom('export const listNominaPeriodos');

  assert.match(section, /await ensureCurrentNominaPeriods/);
  assert.doesNotMatch(section, /recalculateNominaPeriodo|UPDATE nomina_empleados|INSERT INTO nomina_empleados/);
});
