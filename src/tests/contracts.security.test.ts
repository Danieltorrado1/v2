import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('auth lookup ignora relaciones y permisos inactivos', () => {
  const source = readFileSync(path.join(root, 'src/middlewares/authMiddleware.ts'), 'utf8');
  assert.match(source, /COALESCE\(ur\.activo, TRUE\) = TRUE/);
  assert.match(source, /COALESCE\(r\.activo, TRUE\) = TRUE/);
  assert.match(source, /COALESCE\(rp\.activo, TRUE\) = TRUE/);
  assert.match(source, /COALESCE\(p\.activo, TRUE\) = TRUE/);
});

test('rutas legacy de contratos exigen tenantMiddleware antes del CRUD', () => {
  const source = readFileSync(path.join(root, 'src/modules/configuracion/configuracion.routes.ts'), 'utf8');
  assert.match(source, /configuracionRoutes\.use\('\/contratos', tenantMiddleware\);/);
});

test('rutas de empresas resuelven tenant antes de listar o editar', () => {
  const source = readFileSync(path.join(root, 'src/modules/configuracion/configuracion.routes.ts'), 'utf8');
  assert.match(source, /configuracionRoutes\.use\('\/empresas', tenantMiddleware\);/);
});

test('listado legacy de contratos aplica alcance tenant en SQL', () => {
  const source = readFileSync(path.join(root, 'src/modules/configuracion/configuracion.admin.service.ts'), 'utf8');
  assert.match(source, /appendContractTenantClauses\(/);
  assert.match(source, /contratoColumn: 'c\.id'/);
  assert.match(source, /empresaColumn: 'c\.empresa_id'/);
});

test('listado de personal por contrato exige tenant del contrato y busqueda backend', () => {
  const routesSource = readFileSync(path.join(root, 'src/modules/vinculaciones/vinculaciones.routes.ts'), 'utf8');
  const serviceSource = readFileSync(path.join(root, 'src/modules/vinculaciones/vinculaciones.service.ts'), 'utf8');
  assert.match(routesSource, /vinculacionesRoutes\.get\('\/personal', requirePermissions\('vinculaciones\.read'\), getContractPersonalHandler\);/);
  assert.match(serviceSource, /await ensureContractTenantAccess\(client, tenant, filters\.contrato_id\);/);
  assert.match(serviceSource, /p\.numero_documento ILIKE/);
  assert.match(serviceSource, /p\.primer_apellido ILIKE/);
});

test('preflight contractual es solo lectura', () => {
  const source = readFileSync(path.join(root, 'sql/phase-19-1-contratos-expediente-preflight.sql'), 'utf8').toUpperCase();
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/);
});

test('migracion contractual no usa DELETE fisico', () => {
  const source = readFileSync(path.join(root, 'sql/phase-19-1-contratos-expediente.sql'), 'utf8').toUpperCase();
  assert.doesNotMatch(source, /\bDELETE\b/);
});
