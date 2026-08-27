import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const usersUi = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/UsuariosTab.tsx', 'utf8');
const configuracionApi = readFileSync('FrontendNuevo/src/services/configuracionApi.ts', 'utf8');
const configuracionSchemas = readFileSync('src/modules/configuracion/configuracion.admin.schemas.ts', 'utf8');
const usersRoutes = readFileSync('src/modules/users/adminUsers.routes.ts', 'utf8');
const usersService = readFileSync('src/modules/users/users.service.ts', 'utf8');
const gestorRoutes = readFileSync('src/modules/vinculaciones/vinculaciones.routes.ts', 'utf8');
const gestorService = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.procesos.ts', 'utf8');
const gestorMigration = readFileSync('src/scripts/migrate-admin-2d-gestor-role.ts', 'utf8');

test('ADMIN-2D usa el catalogo real y conserva roles multiples', () => {
  assert.match(usersUi, /configuracionApi\.listarRoles\(\)/);
  assert.match(usersUi, /getAllCatalogPages\(/);
  assert.match(usersUi, /CATALOG_BATCH_LIMIT = 100/);
  assert.doesNotMatch(usersUi, /limit:\s*500/);
  assert.match(configuracionApi, /listarEmpresas: \(filters: EmpresaFilters = \{\}\) => getPaginated<Empresa>\('\/configuracion\/empresas', filters\)/);
  assert.match(configuracionSchemas, /limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.default\(25\)/);
  assert.match(usersUi, /form\.roleIds\.includes/);
  assert.match(usersService, /INSERT INTO usuario_roles/);
  assert.match(usersService, /syncUserRoles/);
  assert.doesNotMatch(usersUi, /rol_id/i);
});

test('ADMIN-2D incorpora GESTOR al catalogo RBAC de forma idempotente', () => {
  assert.match(gestorMigration, /INSERT INTO roles/);
  assert.match(gestorMigration, /'GESTOR'/);
  assert.match(gestorMigration, /FROM rol_permisos rp/);
  assert.match(gestorMigration, /source_role\.nombre_rol = 'OPERACION'/);
  assert.match(gestorMigration, /ON CONFLICT \(rol_id, permiso_id\)/);
  assert.doesNotMatch(gestorMigration, /usuario_roles/);
});

test('ADMIN-2D permite crear y editar rol sin escalacion propia', () => {
  assert.match(usersRoutes, /post\('\/', createAdminUserHandler\)/);
  assert.match(usersRoutes, /patch\('\/:id', updateAdminUserHandler\)/);
  assert.match(usersRoutes, /requireRoles\('ADMINISTRADOR'\)/);
  assert.match(usersService, /SELF_ROLE_CHANGE_FORBIDDEN/);
  assert.match(usersService, /LAST_GLOBAL_ADMIN_PROTECTED/);
});

test('ADMIN-2D presenta municipios humanos, busqueda y seleccion multiple', () => {
  assert.match(usersUi, /Buscar municipio\.\.\./);
  assert.match(usersUi, /municipio\.label/);
  assert.match(usersUi, /Seleccionar todos/);
  assert.match(usersUi, /Limpiar selecci/);
  assert.match(usersUi, /toggleGestorMunicipio/);
  assert.doesNotMatch(usersUi, />municipio_id</i);
});

test('ADMIN-2D reutiliza asignaciones historicas y no elimina municipios ni usuarios', () => {
  assert.match(usersUi, /getGestorMunicipios/);
  assert.match(usersUi, /createGestorMunicipioAssignment/);
  assert.match(usersUi, /closeGestorMunicipioAssignment/);
  assert.match(gestorService, /vigencia_hasta/);
  assert.match(gestorService, /activo = FALSE/);
  assert.doesNotMatch(gestorService, /DELETE FROM gestor_municipio_asignaciones/);
});

test('ADMIN-2D protege contrato y tenant tambien en backend', () => {
  assert.match(gestorRoutes, /tenantMiddleware/);
  assert.match(gestorRoutes, /requirePermissions\('vinculaciones\.update'\)/);
  assert.match(gestorService, /GESTOR_CONTRATO_ACCESS_REQUIRED/);
  assert.match(gestorService, /FROM usuario_contratos uc/);
  assert.match(gestorService, /ensureContractTenantAccess/);
});

test('rol, asignacion general y responsabilidad de nomina permanecen separados', () => {
  assert.match(gestorService, /gestor_municipio_asignaciones/);
  assert.match(nominaService, /nomina_responsabilidad_municipios/);
  assert.doesNotMatch(nominaService, /gestor_municipio_asignaciones/);
  assert.match(usersUi, /El alcance de N.mina se configura aparte/);
});
