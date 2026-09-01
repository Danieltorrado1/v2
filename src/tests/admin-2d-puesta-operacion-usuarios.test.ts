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
  assert.ok(usersUi.includes('configuracionApi.listarRoles()'));
  assert.ok(usersUi.includes('getAllCatalogPages('));
  assert.ok(usersUi.includes('CATALOG_BATCH_LIMIT = 100'));
  assert.equal(usersUi.includes('limit: 500'), false);
  assert.ok(configuracionApi.includes("listarEmpresas: (filters: EmpresaFilters = {}) => getPaginated<Empresa>('/configuracion/empresas', filters)"));
  assert.ok(configuracionSchemas.includes('limit: z.coerce.number().int().min(1).max(100).default(25)'));
  assert.ok(usersUi.includes('form.roleIds.includes'));
  assert.ok(usersService.includes('INSERT INTO usuario_roles'));
  assert.ok(usersService.includes('syncUserRoles'));
  assert.equal(usersUi.toLowerCase().includes('rol_id'), false);
});

test('ADMIN-2D incorpora GESTOR al catalogo RBAC de forma idempotente', () => {
  assert.ok(gestorMigration.includes('INSERT INTO roles'));
  assert.ok(gestorMigration.includes("'GESTOR'"));
  assert.ok(gestorMigration.includes('FROM rol_permisos rp'));
  assert.ok(gestorMigration.includes("source_role.nombre_rol = 'OPERACION'"));
  assert.ok(gestorMigration.includes('ON CONFLICT (rol_id, permiso_id)'));
  assert.equal(gestorMigration.includes('usuario_roles'), false);
});

test('ADMIN-2D permite crear y editar rol sin escalacion propia', () => {
  assert.ok(usersRoutes.includes("post('/', createAdminUserHandler)"));
  assert.ok(usersRoutes.includes("patch('/:id', updateAdminUserHandler)"));
  assert.ok(usersRoutes.includes("requireRoles('ADMINISTRADOR')"));
  assert.ok(usersService.includes('SELF_ROLE_CHANGE_FORBIDDEN'));
  assert.ok(usersService.includes('LAST_GLOBAL_ADMIN_PROTECTED'));
});

test('ADMIN-2D filtra municipios por contrato y departamento antes de mostrar opciones', () => {
  assert.ok(usersUi.includes('getContractPersonalFilterOptions'));
  assert.ok(usersUi.includes('selectedDepartamentoIds'));
  assert.ok(usersUi.includes('Selecciona primero un departamento para consultar sus municipios'));
  assert.ok(usersUi.includes('Limpiar departamento'));
  assert.ok(usersUi.includes('Buscar municipio del departamento seleccionado'));
  assert.equal(usersUi.includes('filteredMunicipios'), false);
  assert.equal(usersUi.includes('municipio.label'), false);
});

test('ADMIN-2D reutiliza asignaciones historicas y no elimina municipios ni usuarios', () => {
  assert.ok(usersUi.includes('getGestorMunicipios'));
  assert.ok(usersUi.includes('createGestorMunicipioAssignment'));
  assert.ok(gestorService.includes('vigencia_hasta'));
  assert.ok(gestorService.includes('activo = FALSE'));
  assert.equal(gestorService.includes('DELETE FROM gestor_municipio_asignaciones'), false);
});

test('ADMIN-2D protege contrato, departamento y tenant tambien en backend', () => {
  assert.ok(gestorRoutes.includes('tenantMiddleware'));
  assert.ok(gestorRoutes.includes("requirePermissions('vinculaciones.update')"));
  assert.ok(gestorService.includes('GESTOR_CONTRATO_ACCESS_REQUIRED'));
  assert.ok(gestorService.includes('MUNICIPIO_DEPARTAMENTO_INVALIDO'));
  assert.ok(gestorService.includes('GESTOR_MUNICIPIO_CONTRATO_INVALIDO'));
  assert.ok(gestorService.includes('ensureContractTenantAccess'));
});

test('rol, asignacion general y responsabilidad de nomina permanecen separados', () => {
  assert.ok(gestorService.includes('gestor_municipio_asignaciones'));
  assert.ok(nominaService.includes('nomina_responsabilidad_municipios'));
  assert.ok(nominaService.includes('alcance_personal'));
  assert.ok(nominaService.includes('gestor_personal_asignaciones'));
  assert.ok(usersUi.includes('responsabilidad de Nomina se configura aparte'));
});
