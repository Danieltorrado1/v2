import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.tsx', 'utf8');
const styles = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.css', 'utf8');
const noveltyStyles = readFileSync('FrontendNuevo/src/pages/nomina/nominaNovedadVisual.css', 'utf8');
const planillaStyles = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css', 'utf8');
const pnrMigration = readFileSync('sql/phase-43-nomina-pnr-document-requirement.sql', 'utf8');

test('Novedades comparte una grilla de siete columnas entre header y filas', () => {
  assert.match(styles, /--novedades-columns:\s*minmax\(32px, 4fr\).*minmax\(64px, 11fr\).*minmax\(0, 22fr\).*minmax\(0, 24fr\).*minmax\(0, 14fr\).*minmax\(72px, 10fr\).*minmax\(96px, 15fr\)/s);
  assert.match(page, /className="payroll-table-head novedades-grid"/);
  assert.match(page, /className="payroll-table-row novedades-grid"/);
  const header = page.match(/<div className="payroll-table-head novedades-grid">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.equal((header.match(/<span>/g) ?? []).length, 7);
  assert.match(header, /<span>#<\/span>[\s\S]*?<span>Tipo<\/span>[\s\S]*?<span>Titular<\/span>[\s\S]*?<span>Ubicación operativa<\/span>[\s\S]*?<span>Período<\/span>[\s\S]*?<span>Estado<\/span>[\s\S]*?<span>Acciones<\/span>/);
  assert.doesNotMatch(header, /Motivo/);
  assert.doesNotMatch(page, /novedad-motive-cell/);
  assert.match(page, /<span className="novedad-index">[\s\S]*?novedad-type-cell \$\{novedadVisualClass[\s\S]*?<span className="cell-employee">[\s\S]*?<span className="cell-stack novedad-location-cell">[\s\S]*?<span className="cell-stack novedad-period-cell">[\s\S]*?<span className="cell-stack">[\s\S]*?<div className="payroll-row-actions">/);
});

test('Nómina conserva la estructura Figma de sidebar KPI y tabla financiera', () => {
  const gestionHeader = page.match(/<div className="payroll-table-head">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.match(page, /className="payroll-kpis"/);
  assert.match(page, /label="Municipio"/);
  assert.match(page, /label="Institucion"/);
  assert.match(page, /label="Sede"/);
  assert.match(page, /label="Gestor"/);
  assert.match(page, /label="Revision"/);
  assert.match(page, /label="Novedades"/);
  assert.match(page, /label="Ordenar por"/);
  for (const label of ['Trabajador y contexto', 'Cargo \/ clasificacion', 'Devengado', 'Dias pagados', 'Deducciones', 'Neto', 'Novedades', 'Revision', 'Acciones']) {
    assert.match(gestionHeader, new RegExp(label));
  }
  assert.match(styles, /grid-template-columns: minmax\(0, 2\.65fr\).*minmax\(92px, 1fr\)/s);
  assert.match(styles, /\.nomina-page--gestion \.payroll-table-head[\s\S]*position: sticky/);
});

test('Nómina no renderiza acordeones ni una lista de períodos', () => {
  assert.match(page, /className="payroll-single-period-view(?: financial-panel-content)?"/);
  assert.match(page, /embeddedPeriodId=\{selectedPeriodId\}/);
  assert.doesNotMatch(page, /periodos\.filter\(/);
  assert.match(page, /periodos\.map\(\(periodo\) => <option/);
  assert.doesNotMatch(page, /expandedPeriodIds/);
  assert.doesNotMatch(page, /payroll-period-summary/);
  assert.doesNotMatch(page, /getPeriodStatusLabel/);
  assert.equal((page.match(/handleExportNomina/g) ?? []).length, 2);
});

test('Nómina usa workspace de ancho y altura completa con scroll solo en tabla', () => {
  assert.match(page, /className=\{`nomina-workspace/);
  assert.match(page, /className="nomina-financial-panel"/);
  assert.match(styles, /\.nomina-module-shell--gestion \.nomina-workspace\s*\{[\s\S]*grid-template-columns: 176px minmax\(0, 1fr\)/);
  assert.match(styles, /\.nomina-module-shell--gestion \.nomina-workspace > \.payroll-kpis\s*\{[\s\S]*display: flex[\s\S]*flex-direction: column[\s\S]*height: 100%/);
  assert.match(styles, /\.nomina-module-shell--gestion \.nomina-workspace > \.payroll-kpis \.payroll-kpi\s*\{[\s\S]*flex: 0 0 54px[\s\S]*min-height: 56px[\s\S]*max-height: 58px/);
  assert.match(styles, /\.nomina-module-shell--gestion \.nomina-workspace:not\(\.nomina-workspace--host\) > \.nomina-financial-panel\s*\{[\s\S]*height: 100%[\s\S]*border-radius: 12px/);
  assert.match(styles, /\.nomina-module-shell--gestion \.nomina-payroll-rows-scroll[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.nomina-module-shell--gestion \.payroll-filterbar[\s\S]*width: 100%/);
  assert.match(styles, /\.nomina-module-shell--gestion \.payroll-actionbar[\s\S]*width: 100%/);
});

test('Novedades muestra el cargo histórico entregado por contexto_operativo', () => {
  assert.match(page, /function getNovedadCargoLabel\(novedad: NominaNovedadApi\)/);
  assert.match(page, /novedad\.contexto_operativo\?\.cargo_nombre/);
  assert.match(page, /<small>\{getNovedadCargoLabel\(novedad\)\}<\/small>/);
  assert.match(page, /<div><dt>Cargo<\/dt><dd>\{getNovedadCargoLabel\(selectedNovedad\)\}<\/dd><\/div>/);
  assert.doesNotMatch(page, /<small>\{empleado \? getEmployeeCargoLabel\(empleado\) : "Cargo no disponible"\}<\/small>/);
});

test('Novedades reutiliza la paleta visual canónica de Planilla', () => {
  for (const code of ['PR1', 'PR2', 'PR3', 'PR4', 'PNR', 'S', 'DNC', 'FNJ', 'DCO', 'TA', 'NOV']) {
    assert.match(noveltyStyles, new RegExp(`\\.op-novelty-code-${code}\\s*\\{`));
  }
  assert.match(page, /novedadVisualClass/);
  assert.match(page, /novedad-type-badge/);
  assert.match(noveltyStyles, /color-mix\(in srgb, var\(--op-novelty-color\) 12%/);
  assert.match(planillaStyles, /var\(--op-novelty-color\) 22%/);
});

test('el resumen de Novedades usa el mismo dataset filtrado', () => {
  assert.match(page, /novedadesSummary\.total/);
  assert.match(page, /filteredNovedades\.length/);
  assert.match(page, /novedadesSummary\.documentosPendientesCarga/);
  assert.match(page, /novedadesSummary\.documentosPendientesValidacion/);
  assert.match(page, /novedadesSummary\.documentosAprobados/);
  assert.match(page, /novedadesSummary\.documentosRechazados/);
});

test('Novedades usa un drawer único y no renderiza detalle inline', () => {
  assert.match(page, /novedadDrawerMode.*"detail".*"documents".*"edit".*"create".*"review"/s);
  assert.match(page, /selectedNovedadId/);
  assert.match(page, /openNovedadDrawer\(novedad, "detail"\)/);
  assert.match(page, /openNovedadDrawer\(novedad, "documents"\)/);
  assert.match(page, /openNovedadDrawer\(novedad, "review"\)/);
  assert.match(page, /novedad-drawer-overlay/);
  assert.doesNotMatch(page, /expandedNovedadId/);
  assert.doesNotMatch(page, /\{isExpanded \?/);
});

test('Motivo prioriza el tipo real y deja la observación como segundo nivel', () => {
  assert.match(page, /function getNovedadMotivoDisplay/);
  assert.match(page, /const tipo = getVisibleNovedadTipoLabel\(novedad\.tipo_novedad\)/);
  assert.match(page, /const observacion = novedad\.observacion\?\.trim\(\) \|\| null/);
  assert.match(page, /getNovedadMotivoDisplay\(selectedNovedad\)/);
});

test('Novedades evita overflow horizontal con una plantilla responsive', () => {
  assert.match(styles, /grid-template-columns: var\(--novedades-columns\)/);
  assert.match(styles, /\.nomina-page--novedades \.novedades-grid > \*/);
  assert.doesNotMatch(page, /gridTemplateColumns:\s*"var\(--novedades-columns\)"/);
  assert.match(styles, /\.nomina-page--novedades \.payroll-table-head[\s\S]*min-width: 0/);
  assert.match(styles, /\.nomina-page--novedades \.payroll-filterbar[\s\S]*display: grid/);
  assert.match(styles, /grid-template-columns: minmax\(190px, 1\.35fr\) repeat\(9, minmax\(72px, 1fr\)\)/);
  assert.match(styles, /\.nomina-page--novedades \.payroll-filter-group[\s\S]*display: contents/);
});

test('Novedades no muestra el accionador Registrar novedad en su vista', () => {
  assert.match(page, /\{!isOperationalCoverageView \? \([\s\S]*?className="payroll-actionbar"/);
  assert.match(page, /\) : null\}/);
});

test('PNR usa la configuración documental canónica de solicitud de permiso', () => {
  assert.match(page, /getNovedadDocumentSlotLabel/);
  assert.match(page, /if \(tipo === "SOLICITUD_PERMISO"\) return "Solicitud de permiso"/);
  assert.match(page, /if \(tipo === "AUTORIZACION_DESCUENTO"\) return/);
  assert.match(page, /getNovedadDocumentStateLabel/);
  assert.match(page, /No requiere documentos/);
  assert.match(pnrMigration, /requiere_solicitud_permiso\s*=\s*TRUE/);
  assert.match(pnrMigration, /codigo_operativo.*PNR/);
});
