import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { moduleCatalog } from './moduleCatalog';
import { isVisibleCatalogLocation, resolveCatalogLocation, resolveVisibleModulePath, shouldDeferModuleRoute } from './moduleAccess';
import { operationTabForPath } from '../pages/operacion/operacionNavigation';

const operation = moduleCatalog.find((module) => module.code === 'OPERACION');
assert.ok(operation);
const routerSource = readFileSync(resolve(dirname(import.meta.url.replace('file:///', '')), '../router/AppRouter.tsx'), 'utf8');
const shellSource = readFileSync(resolve(dirname(import.meta.url.replace('file:///', '')), '../pages/operacion/OperacionModuleShell.tsx'), 'utf8');
const institutionsSource = readFileSync(resolve(dirname(import.meta.url.replace('file:///', '')), '../pages/operacion/OperacionInstitucionesFinalPage.tsx'), 'utf8');
assert.match(routerSource, /path="operacion"[\s\S]*<Route path="instituciones"/);
assert.match(routerSource, /tenantEntries\.filter\(entry => !entry\.children\.length && !entry\.route\.startsWith\('\/operacion\/'\)/);
assert.match(shellSource, /<Outlet\s*\/>/);
assert.match(institutionsSource, /operacionApi\.institutions\(/);
assert.match(institutionsSource, /contrato_id: contractId/);
assert.match(institutionsSource, /status === 'loading'/);
assert.match(institutionsSource, /status === 'error'/);
assert.match(institutionsSource, /Reintentar/);
assert.equal(operation.route, '/operacion');
assert.equal(operation.children.map((entry) => entry.route).join('|'), [
  '/operacion/instituciones', '/operacion/simat', '/operacion/reporte-diario',
  '/operacion/descuentos-semanales', '/operacion/planilla-final',
].join('|'));

const location = resolveCatalogLocation('/operacion');
assert.equal(location?.module.code, 'OPERACION');
assert.equal(location?.entry.code, 'OPERACION');

const visible = [{ ...operation, children: [operation.children[1], operation.children[2], operation.children[4]] }];
assert.equal(isVisibleCatalogLocation(location, visible), true);
assert.equal(resolveVisibleModulePath(visible), '/operacion/simat');
assert.equal(operationTabForPath('/operacion/simat')?.label, 'Verificación SIMAT');
assert.equal(operationTabForPath('/operacion/estadisticas'), null);
assert.equal(shouldDeferModuleRoute({ empresaId: null, capabilitiesLoading: true, capabilities: null }), true);
assert.equal(shouldDeferModuleRoute({ empresaId: 42, capabilitiesLoading: true, capabilities: null }), true);
assert.equal(shouldDeferModuleRoute({ empresaId: 42, capabilitiesLoading: false, capabilities: {} }), false);

// The old implementation treated the root as hidden and selected Personal's first child.
const personal = moduleCatalog.find((module) => module.code === 'PERSONAL');
assert.ok(personal);
const oldFallback = [{ ...personal, children: [personal.children[0]] }, ...visible];
assert.notEqual(resolveVisibleModulePath(oldFallback), '/operacion/simat');
console.log('operation module-root regression checks passed');
