import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaEconomicaTabs.tsx', 'utf8');
const routes = readFileSync('src/modules/empresa-configuracion/empresa-configuracion.routes.ts', 'utf8');

test('categorias salariales expone correccion, preview y aplicacion operativa', () => {
  for (const token of [
    'Corregir categoría / vigencia',
    'Previsualizar selección',
    'Asignar categoría seleccionada',
    'Retirar categoría',
    'Observación de auditoría',
    'getNominaPeriodos',
  ]) {
    assert.ok(ui.includes(token), token);
  }

  assert.match(ui, /salary-categories\/assignments\/preview/);
  assert.match(ui, /salary-categories\/assignments\/apply/);
  assert.match(ui, /salary-categories\/\$\{editingCategoryId\}/);
});

test('rutas de categorias salariales protegen preview y apply con permisos especificos', () => {
  assert.match(
    routes,
    /router\.post\(\s*'\/:empresaId\/salary-categories\/assignments\/preview',\s*requirePermissions\('nomina\.economico\.read'\)/
  );
  assert.match(
    routes,
    /router\.post\(\s*'\/:empresaId\/salary-categories\/assignments\/apply',\s*requirePermissions\('nomina\.categorias\.manage'\)/
  );
});
