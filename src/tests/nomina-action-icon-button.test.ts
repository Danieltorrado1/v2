import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync('FrontendNuevo/src/components/nomina/NominaActionIconButton.tsx', 'utf8');
const styles = readFileSync('FrontendNuevo/src/components/nomina/NominaActionIconButton.css', 'utf8');
const turnos = readFileSync('FrontendNuevo/src/pages/nomina/TurnosPage.tsx', 'utf8');
const novedades = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.tsx', 'utf8');

test('Turnos y Novedades reutilizan el mismo componente de acciones', () => {
  assert.match(turnos, /import NominaActionIconButton/);
  assert.match(novedades, /import NominaActionIconButton/);
  assert.match(turnos, /NominaActionIconButton[^\n]*icon=\{Eye\}/);
  assert.match(novedades, /NominaActionIconButton[\s\S]*?icon=\{Eye\}/);
  assert.match(turnos, /icon=\{FileText\}/);
  assert.match(novedades, /icon=\{FileText\}/);
});

test('el componente centraliza iconos, accesibilidad, variantes y disabled', () => {
  assert.match(component, /title=\{title \?\? label\}/);
  assert.match(component, /aria-label=\{buttonProps\["aria-label"\] \?\? label\}/);
  assert.match(component, /nomina-action-icon--\$\{variant\}/);
  assert.match(styles, /width: 32px/);
  assert.match(styles, /height: 32px/);
  assert.match(styles, /\.nomina-action-icon:disabled/);
  assert.match(styles, /\.nomina-action-icon--success/);
  assert.match(styles, /\.nomina-action-icon--danger/);
});

test('acciones equivalentes conservan handlers y permisos existentes', () => {
  assert.match(turnos, /onClick=\{\(\) => openEditEditor\(movimiento\)\}/);
  assert.match(turnos, /onClick=\{\(\) => void handleDeactivate\(movimiento\)\}/);
  assert.match(novedades, /onClick=\{\(\) => handleEditNovedad\(novedad\)\}/);
  assert.match(novedades, /onClick=\{\(\) => handleDeactivateNovedad\(novedad\)\}/);
  assert.match(novedades, /canUpdateNovedad/);
  assert.match(novedades, /canDeactivateNovedad/);
});
