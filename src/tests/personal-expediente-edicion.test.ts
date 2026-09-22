import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('src/modules/vinculaciones/vinculaciones.personal.service.ts', 'utf8');
const drawer = readFileSync('FrontendNuevo/src/pages/personal/PersonalMasterDrawer.tsx', 'utf8');
const seed = readFileSync('src/scripts/seed-personal-master-permisos.ts', 'utf8');

test('expediente permite crear asignación cuando no existe una vigente', () => {
  assert.match(service, /INSERT INTO cobertura_asignaciones/);
  assert.match(service, /target\.rows\[0\]\.municipio_id/);
  assert.match(service, /NOT EXISTS \(\s*SELECT 1 FROM cobertura_asignaciones ca0/);
});

test('expediente distingue sin asignación de falta de permiso', () => {
  assert.match(drawer, /Esta persona no tiene una asignaci/);
  assert.match(drawer, /No tienes permiso para editar/);
});

test('edición operativa expone municipio y mantiene catálogos dependientes', () => {
  assert.match(drawer, /assignmentMunicipality/);
  assert.match(drawer, /municipalities\.map/);
  assert.match(drawer, /scopedOptions/);
});

test('Talento Humano conserva permiso de edición de persona', () => {
  assert.match(seed, /TALENTO_HUMANO:[\s\S]*persona\.editar/);
});
