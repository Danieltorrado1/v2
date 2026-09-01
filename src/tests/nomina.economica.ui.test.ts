import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAssignmentPreviewQuery } from '../modules/empresa-configuracion/empresa-configuracion.service';

const ui = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaEconomicaTabs.tsx', 'utf8');
const routes = readFileSync('src/modules/empresa-configuracion/empresa-configuracion.routes.ts', 'utf8');
const service = readFileSync('src/modules/empresa-configuracion/empresa-configuracion.service.ts', 'utf8');
const layoutCss = readFileSync('FrontendNuevo/src/layouts/MainLayout.css', 'utf8');
const nominaCss = readFileSync('FrontendNuevo/src/pages/nomina/NominaPages.css', 'utf8');

test('categorias salariales expone PATCH de nombre, modalidad y preview vigente', () => {
  for (const token of [
    'Corregir categoría / vigencia',
    'nombre_categoria',
    'Paso 4 · Previsualizar',
    'Modalidad operativa del preview',
    'Conteo Institución + Sede',
    'Los filtros o la categoría destino cambiaron. Previsualiza nuevamente antes de aplicar cambios.',
    'Aplicar categoría',
    'Retirar categoría',
    'Observación de auditoría'
  ]) {
    assert.ok(ui.includes(token), token);
  }

  assert.match(ui, /salary-categories\/assignments\/options/);
  assert.match(ui, /preview_criteria: buildAssignmentCriteria\(\)/);
  assert.match(ui, /setSelectedEmployeeIds\(\[\]\)/);
  assert.doesNotMatch(ui, /setSelectedEmployeeIds\(nextPreview\.items\.map/);
  assert.match(ui, /const \[active, setActive\] = useState\('ACTIVOS'\)/);
});

test('preview server-side combina modalidad y conteo por institución y sede', () => {
  const { sql, params } = buildAssignmentPreviewQuery({
    periodo_id: 2,
    modalidad_id: 44,
    cargo: 'Manipuladora',
    municipio: 'Acacias',
    institucion_sede_count: { operator: 'BETWEEN', min: 1, max: 2 },
    without_category: true,
    limit: 50
  });

  assert.equal(params[0], 2);
  assert.match(sql, /modalidad_id = \$\d+::text/);
  assert.match(sql, /COALESCE\(cargo, ''\) ILIKE \$\d+/);
  assert.match(sql, /COALESCE\(municipio, ''\) ILIKE \$\d+/);
  assert.match(sql, /institucion_sede_count BETWEEN \$\d+::int AND \$\d+::int/);
  assert.match(sql, /categoria_id IS NULL/);
});

test('backend valida categoría activa y vigencia del periodo, y audita criterios de apply', () => {
  assert.match(service, /CATEGORY_INACTIVE/);
  assert.match(service, /CATEGORY_OUT_OF_PERIOD_RANGE/);
  assert.match(service, /accion_categoria: accionCategoria/);
  assert.match(service, /criterios_preview: previewCriteria/);
  assert.match(service, /UPDATE nomina_empleados[\s\S]*SET categoria_salarial_id = \$2::bigint/);
});

test('rutas de categorías exponen opciones y protegen preview y apply con permisos específicos', () => {
  assert.match(
    routes,
    /router\.get\(\s*'\/:empresaId\/salary-categories\/assignments\/options',\s*requirePermissions\('nomina\.economico\.read'\)/
  );
  assert.match(
    routes,
    /router\.post\(\s*'\/:empresaId\/salary-categories\/assignments\/preview',\s*requirePermissions\('nomina\.economico\.read'\)/
  );
  assert.match(
    routes,
    /router\.post\(\s*'\/:empresaId\/salary-categories\/assignments\/apply',\s*requirePermissions\('nomina\.categorias\.manage'\)/
  );
});

test('dark mode de nómina conserva logo y contraste de cards', () => {
  assert.match(layoutCss, /\.logo-image--dark\s*\{[\s\S]*object-fit:\s*cover/);
  assert.match(layoutCss, /transform:\s*translateX\(-2px\) scale\(1\.08\)/);
  assert.match(nominaCss, /\.payroll-process-card strong/);
  assert.match(nominaCss, /\.payroll-process-card:focus-visible/);
  assert.match(nominaCss, /\[data-theme="dark"\] \.payroll-process-card/);
});
