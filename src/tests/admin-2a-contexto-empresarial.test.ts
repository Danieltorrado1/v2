import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('phase-33-1 crea organizaciones y relacion 1:N sin tocar empresa_id operativo', () => {
  const source = readFileSync(
    path.join(root, 'sql/phase-33-1-organizaciones-contexto-empresarial.sql'),
    'utf8'
  );

  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.organizaciones/i);
  assert.match(source, /ADD COLUMN IF NOT EXISTS organizacion_id BIGINT/i);
  assert.match(source, /FOREIGN KEY \(organizacion_id\)\s+REFERENCES public\.organizaciones\(id\)/i);
  assert.match(source, /UPDATE public\.empresas e\s+SET organizacion_id = o\.id/i);
  assert.match(source, /ALTER COLUMN organizacion_id SET NOT NULL/i);
  assert.doesNotMatch(source, /UPDATE\s+empresas\s+SET\s+id\s*=/i);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+empresas/i);
});

test('schemas de administracion aceptan organizacion explicita o implicita', () => {
  const source = readFileSync(
    path.join(root, 'src/modules/configuracion/configuracion.admin.schemas.ts'),
    'utf8'
  );

  assert.match(source, /createEmpresaSchema = z/);
  assert.match(source, /organizacion_id:\s*positiveIntegerSchema\.nullable\(\)\.optional\(\)\.default\(null\)/);
  assert.match(source, /updateEmpresaSchema = z/);
  assert.match(source, /organizacion_id:\s*positiveIntegerSchema\.nullable\(\)\.optional\(\)/);
});

test('tenant service expone organizacionActual, empresasDisponibles y default organizacional', () => {
  const source = readFileSync(path.join(root, 'src/modules/tenant/tenant.service.ts'), 'utf8');

  assert.match(source, /organizacion_default_id/);
  assert.match(source, /organizaciones: TenantMeOrganizacion\[]/);
  assert.match(source, /organizacion:\s*TenantMeOrganizacion \| null/);
  assert.match(source, /new Map\(/);
});

test('tenant middleware centraliza validacion de acceso por empresa', () => {
  const source = readFileSync(path.join(root, 'src/middlewares/tenantMiddleware.ts'), 'utf8');

  assert.match(source, /export const hasTenantEmpresaAccess/);
  assert.match(source, /export const assertTenantAccessForEmpresaId/);
  assert.match(source, /throw new AppError\('Tenant access denied', 403, 'TENANT_FORBIDDEN'\)/);
});

test('SST direct details respetan tenant en busquedas por id', () => {
  const controllerSource = readFileSync(path.join(root, 'src/modules/sst/sst.controller.ts'), 'utf8');
  const serviceSource = readFileSync(path.join(root, 'src/modules/sst/sst.service.ts'), 'utf8');

  assert.match(controllerSource, /getSstEventoById\(id, req\.tenant\)/);
  assert.match(controllerSource, /getSstPlanAccionById\(id, req\.tenant\)/);
  assert.match(serviceSource, /ensureTenantScopeForEntity\(\s*tenant,\s*toNullableBigintNumber\(evento\.vinculacion\?\.contrato_id\),\s*toNullableBigintNumber\(evento\.vinculacion\?\.empresa_id\)\s*\)/);
  assert.match(serviceSource, /ensureTenantScopeForEntity\(\s*tenant,\s*toNullableBigintNumber\(plan\.origen_relacionado\.contrato_id\),\s*toNullableBigintNumber\(plan\.origen_relacionado\.empresa_id\)\s*\)/);
});

test('usuarios admin ya no obligan una sola empresa para no admin', () => {
  const source = readFileSync(path.join(root, 'src/modules/users/users.service.ts'), 'utf8');

  assert.match(source, /empresaIds\.length < 1/);
  assert.match(source, /must have at least one company assigned/);
  assert.doesNotMatch(source, /empresaIds\.length !== 1/);
});

test('CompanyContext centraliza empresa y organizacion con persistencia por localStorage', () => {
  const source = readFileSync(
    path.join(root, 'FrontendNuevo/src/context/CompanyContext.tsx'),
    'utf8'
  );

  assert.match(source, /getTenantContext\(\)/);
  assert.match(source, /const STORAGE_KEY = "empiria_empresa_id"/);
  assert.match(source, /organizacionActual/);
  assert.match(source, /empresaActual/);
  assert.match(source, /empresasDisponibles/);
  assert.match(source, /setEmpresaActual/);
  assert.match(source, /window\.localStorage\.setItem/);
  assert.match(source, /nextCompanies\[0\]\?\.id \?\? null/);
});

test('topbar solo muestra selector cuando hay multiples empresas y etiqueta discreta con una', () => {
  const source = readFileSync(path.join(root, 'FrontendNuevo/src/layouts/MainLayout.tsx'), 'utf8');

  assert.match(source, /empresasDisponibles\.length > 1/);
  assert.match(source, /empresasDisponibles\.length === 1 && empresaActual/);
  assert.match(source, /aria-label="Empresa activa"/);
  assert.doesNotMatch(source, /window\.location\.reload/);
});

test('cobertura reutiliza el contexto central de empresa y evita selects locales paralelos', () => {
  const herramientasSource = readFileSync(
    path.join(root, 'FrontendNuevo/src/pages/herramientas/CoberturaHerramientasPage.tsx'),
    'utf8'
  );
  const dashboardSource = readFileSync(
    path.join(root, 'FrontendNuevo/src/pages/herramientas/CoberturaDashboardPage.tsx'),
    'utf8'
  );

  assert.match(herramientasSource, /useCompanyContext/);
  assert.match(herramientasSource, /setEmpresaActual/);
  assert.doesNotMatch(herramientasSource, /window\.location\.reload/);
  assert.match(dashboardSource, /useCompanyContext/);
  assert.match(dashboardSource, /setEmpresaActual/);
});
