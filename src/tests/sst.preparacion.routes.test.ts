import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('sst-2-2 agrega fuente maestra, cola de revision y staging tecnico sin tocar tablas operativas', () => {
  const sql = readFileSync(
    path.join(root, 'sql/phase-sst-2-2-fuentes-maestras-revision.sql'),
    'utf8'
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS persona_formacion_academica/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sst_preparacion_personas/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sst_revision_casos/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sst_perfil_restringido/i);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
});

test('servicios SST exponen resumen, plan, pendientes y resolucion auditada', () => {
  const serviceSource = readFileSync(
    path.join(root, 'src/modules/sst/sst.preparacion.service.ts'),
    'utf8'
  );
  const controllerSource = readFileSync(
    path.join(root, 'src/modules/sst/sst.preparacion.controller.ts'),
    'utf8'
  );
  const seedSource = readFileSync(
    path.join(root, 'src/scripts/seed-sst-fuentes-revision-permisos.ts'),
    'utf8'
  );

  assert.match(serviceSource, /getSstPreparationSummary/);
  assert.match(serviceSource, /listSstReviewCases/);
  assert.match(serviceSource, /listSstPendingCapture/);
  assert.match(serviceSource, /listSstPreparationPlan/);
  assert.match(serviceSource, /resolveSstReviewCase/);
  assert.match(serviceSource, /registerAuditEntry\(/);
  assert.match(controllerSource, /resolveSstReviewCaseHandler/);
  assert.match(seedSource, /sst\.revision/);
  assert.match(seedSource, /sst\.restringido/);
  assert.match(seedSource, /formacion_academica/);
});
