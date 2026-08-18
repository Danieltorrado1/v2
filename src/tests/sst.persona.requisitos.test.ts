import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('fase SST ya define catalogo y registros historicos para examenes de persona', () => {
  const sql = readFileSync(
    path.join(root, 'sql/phase-12-3-sst-examenes-ocupacionales.sql'),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS sst_examenes_ocupacionales/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sst_examenes_persona/i);
  assert.match(sql, /documento_persona_id/i);
  assert.match(sql, /fecha_examen/i);
  assert.match(sql, /fecha_vencimiento/i);
});

test('modulos de expediente y personal reutilizan SST para salud y requisitos', () => {
  const expedienteSource = readFileSync(
    path.join(root, 'src/modules/expedientes/expedientes.service.ts'),
    'utf8',
  );
  const drawerSource = readFileSync(
    path.join(root, 'FrontendNuevo/src/pages/personal/PersonalMasterDrawer.tsx'),
    'utf8',
  );

  assert.match(expedienteSource, /listSstExamenesPersonaByPersonaId/);
  assert.match(drawerSource, /listarExamenesPersonaSst/);
  assert.match(drawerSource, /listarExamenesOcupacionalesSst/);
  assert.match(drawerSource, /crearExamenPersonaSst/);
});
