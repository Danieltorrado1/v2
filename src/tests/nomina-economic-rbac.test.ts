import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { requirePermissions } from '../middlewares/roleMiddleware';

type TestUser = {
  permissions: string[];
  roles: string[];
};

const checkPermission = (user: TestUser, permission: string): Error | undefined => {
  let result: Error | undefined;
  requirePermissions(permission)(
    { user } as never,
    {} as never,
    (error?: unknown) => {
      result = error instanceof Error ? error : undefined;
    }
  );
  return result;
};

const OPERATIVE = 'nomina.operativa.read';
const ECONOMIC = 'nomina.economico.read';

test('ADMINISTRADOR puede consultar DTO operativo y economico', () => {
  const user = { roles: ['ADMINISTRADOR'], permissions: [OPERATIVE, ECONOMIC] };
  assert.equal(checkPermission(user, OPERATIVE), undefined);
  assert.equal(checkPermission(user, ECONOMIC), undefined);
});

test('GESTOR conserva lectura operativa y no obtiene lectura economica', () => {
  const user = { roles: ['GESTOR'], permissions: [OPERATIVE] };
  assert.equal(checkPermission(user, OPERATIVE), undefined);
  assert.equal((checkPermission(user, ECONOMIC) as Error & { statusCode?: number }).statusCode, 403);
});

test('NOMINA y TALENTO_HUMANO reciben lectura economica explicita', () => {
  for (const role of ['NOMINA', 'TALENTO_HUMANO']) {
    const user = { roles: [role], permissions: [ECONOMIC] };
    assert.equal(checkPermission(user, ECONOMIC), undefined);
  }
});

test('endpoints operativo y economico exigen permisos diferentes', () => {
  const routes = readFileSync('src/modules/nomina/nomina.routes.ts', 'utf8');
  assert.match(routes, /empleados-operativos'[\s\S]*requirePermissions\('nomina\.operativa\.read'\)/);
  assert.match(routes, /'\/periodos\/:id\/empleados'[\s\S]*rejectRoles\('GESTOR'\)[\s\S]*requirePermissions\('nomina\.economico\.read'\)/);
});

test('seed asigna matrices separadas y bloquea economia para GESTOR', () => {
  const seed = readFileSync('src/scripts/seed-admin-2e-operational-permissions.ts', 'utf8');
  assert.match(seed, /OPERATIONAL_ROLE_NAMES = \['ADMINISTRADOR', 'GESTOR', 'TALENTO_HUMANO'\]/);
  assert.match(seed, /ECONOMIC_ROLE_NAMES = \['ADMINISTRADOR', 'NOMINA', 'TALENTO_HUMANO'\]/);
  assert.match(seed, /'nomina\.economico\.read'/);
  assert.match(seed, /ON CONFLICT \(rol_id, permiso_id\) DO UPDATE SET activo = TRUE/);
  assert.match(seed, /--env-file=/);
});
