import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

test('ADMIN-2A.2 expone listado global paginado y agregado sin N+1', () => {
  const service = read('src/modules/saas/saas.service.ts');
  const routes = read('src/modules/saas/saas.routes.ts');
  assert.match(service, /listGlobalCompanyControl/);
  assert.match(service, /LIMIT \$\$\{listParams\.length-1\}/);
  assert.match(service, /COUNT\(DISTINCT ue\.usuario_id\)/);
  assert.match(service, /COUNT\(DISTINCT v\.persona_id\)/);
  assert.match(routes, /companies-summary/);
  assert.match(routes, /max\(100\)/);
});

test('ADMIN-2A.2 protege estado global y conserva auditoría existente', () => {
  const routes = read('src/modules/saas/saas.routes.ts');
  const service = read('src/modules/configuracion/configuracion.admin.service.ts');
  assert.match(routes, /companies\/:empresaId\/status/);
  assert.match(routes, /globalAdmin\(req\)/);
  assert.match(service, /recordAudit\(client, actor, active \? 'ACTIVATE' : 'DEACTIVATE'/);
  assert.match(service, /ensureEmpresaCanDeactivate/);
});

test('ADMIN-2A.2 frontend usa catálogo dinámico, estado, uso y fallback de logo', () => {
  const page = read('FrontendNuevo/src/pages/workspace/CompaniesPage.tsx');
  assert.match(page, /saasApi\.plans\(\)/);
  assert.match(page, /saasApi\.setStatus/);
  assert.match(page, /companySettingsApi\.get/);
  assert.match(page, /logoError/);
  assert.match(page, /companySettingsApi\.saveGeneral/);
});
