import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('the planilla action, catalog route, and backend capabilities share the same contract', () => {
  const root = process.cwd();
  const catalog = readFileSync(join(root, 'FrontendNuevo/src/architecture/moduleCatalog.ts'), 'utf8');
  const access = readFileSync(join(root, 'FrontendNuevo/src/architecture/moduleAccess.ts'), 'utf8');
  const planilla = readFileSync(join(root, 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'), 'utf8');
  const routes = readFileSync(join(root, 'src/modules/nomina/nomina.routes.ts'), 'utf8');

  assert.match(catalog, /permission: \['nomina\.economico\.read'\]/);
  assert.match(catalog, /allowedRoles: \['ADMINISTRADOR', 'TALENTO_HUMANO'\]/);
  assert.match(access, /item\.allowedRoles/);
  assert.match(planilla, /canAccessNominaConfiguration\(user,\s*capabilities\?\.modulos\.NOMINA === true\)/);
  assert.doesNotMatch(planilla, /user\?\.permissions\.includes\("nomina\.periodos\.update"\).*op-config-action/);
  assert.match(routes, /\/procesos\/areas', requirePermissions\('nomina\.read'\)/);
  assert.match(routes, /\/procesos\/usuarios-asignables', requirePermissions\('nomina\.periodos\.update'\)/);
});

test('ADMINISTRADOR conserva acceso económico aunque el permiso no esté materializado', () => {
  const middleware = readFileSync(join(process.cwd(), 'src/middlewares/roleMiddleware.ts'), 'utf8');
  assert.match(middleware, /ADMINISTRADOR/);
  assert.match(middleware, /nomina\.economico\.read/);
  assert.match(middleware, /nomina\.parametros\.manage/);
  assert.match(middleware, /nomina\.categorias\.manage/);
});
