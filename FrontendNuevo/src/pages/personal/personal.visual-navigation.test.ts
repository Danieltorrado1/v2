import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTenantModules, resolveCatalogLocation } from '../../architecture/moduleAccess';
import { topbarNavigation } from '../../architecture/topbarNavigation';
import { getAllCatalogPages } from '../../services/catalogPagination';
import { catalogDocument, repositoryCell, repositoryGroup, repositoryKey, type RepositoryRow } from '../../pages/personal/personalRepositoryModel';
import { configuracionTiposDocumentoListQuerySchema } from '../../../../src/modules/configuracion/configuracion.admin.schemas';
import type { EmpresaCapabilities } from '../../services/saasApi';

const capabilities = (modulos: Record<string, boolean>): EmpresaCapabilities => ({
  empresa: { id: 8, nombre: 'Empresa' }, organizacion: null, legacy: true,
  suscripcion: null, modulos, modulos_habilitados: [], modulos_deshabilitados: [], modulos_plan: [], overrides: [],
});

test('Personal es directo y las entradas promovidas conservan autorización y rutas', () => {
  const user = { roles: ['ADMINISTRADOR'], permissions: ['vinculaciones.read', 'nomina.read', 'portal.read'] };
  const visible = visibleTenantModules(user, capabilities({ PERSONAL: true, NOMINA: true, PORTAL_COLABORADOR: true }), 8);
  const navigation = topbarNavigation(visible);
  const personal = navigation.find(item => item.code === 'PERSONAL')!;
  assert.equal(personal.route, '/personal/base-datos');
  assert.deepEqual(personal.children, []);
  assert.equal(navigation.find(item => item.code === 'NOMINA')?.route, '/nomina/planilla-operativa');
  for (const code of ['PERSONAL_PORTAL_SERVICIOS']) {
    assert.equal(navigation.find(item => item.code === code)?.route, visible.find(item => item.code === 'PERSONAL')?.children.find(item => item.code === code)?.route);
  }
  assert.equal(resolveCatalogLocation('/nomina/asistencia')?.module.code, 'NOMINA');
  assert.equal(resolveCatalogLocation('/personal')?.entry.code, 'PERSONAL_BASE_DATOS');
});

test('el cambio visual no concede módulos sin licencia, sin permiso o de otra empresa', () => {
  const user = { roles: ['TALENTO_HUMANO'], permissions: ['vinculaciones.read'] };
  const navigation = topbarNavigation(visibleTenantModules(user, capabilities({ PERSONAL: true, NOMINA: true, PORTAL_COLABORADOR: false }), 8));
  assert.deepEqual(navigation.map(item => item.code), ['PERSONAL']);
  assert.deepEqual(topbarNavigation(visibleTenantModules(user, capabilities({ PERSONAL: true }), 9)), []);
  assert.deepEqual(topbarNavigation(visibleTenantModules(user, capabilities({ PERSONAL: false }), 8)), []);
});

test('usuarios con sólo nómina conservan su entrada sin recibir la base de Personal', () => {
  const user = { roles: ['ADMINISTRADOR'], permissions: ['nomina.read'] };
  const navigation = topbarNavigation(visibleTenantModules(user, capabilities({ NOMINA: true }), 8));
  assert.equal(navigation.find(item => item.code === 'NOMINA')?.route, '/nomina/planilla-operativa');
  assert.ok(!navigation.some(item => item.route === '/personal/base-datos'));
});

test('la paginación respeta el máximo del backend y recupera todos los catálogos', async () => {
  const calls: number[] = [];
  const items = await getAllCatalogPages(async (page, limit) => {
    assert.equal(configuracionTiposDocumentoListQuerySchema.safeParse({ page, limit, activo: 'true' }).success, true);
    calls.push(page);
    return { items: [page], pagination: { total_pages: 3 } };
  });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(items, [1, 2, 3]);
  assert.equal(configuracionTiposDocumentoListQuerySchema.safeParse({ page: 1, limit: 200 }).success, false);
});

test('los errores de catálogos se propagan, sin devolver resultados truncados', async () => {
  await assert.rejects(getAllCatalogPages(async (page) => {
    if (page === 2) throw new Error('Error real de API');
    return { items: [1], pagination: { total_pages: 2 } };
  }), /Error real de API/);
});

test('matriz: GENERAL admite documentos personales sin inventar requisitos ni progreso', () => {
  const column = catalogDocument({ id: 11, label: 'Acta de Bachiller', alcance: 'GENERAL' });
  const row = { documents: [], worker: {} } as RepositoryRow;
  const item = repositoryCell(row, column);
  assert.equal(item.ambito_documental, 'PERSONA');
  assert.equal(item.estado_detallado, 'SIN_DOCUMENTO');
  assert.equal(item.documento_id, null);
  assert.equal(row.checklist, undefined);
  assert.equal(repositoryGroup(column), 'DATOS_PERSONALES');
});

test('matriz: distingue ámbitos y no infiere aprobaci?n ni vigencia de archivos sin revisi?n', () => {
  const persona = catalogDocument({ id: 2, label: 'ARL', alcance: 'GENERAL' });
  const laboral = catalogDocument({ id: 2, label: 'ARL', alcance: 'VINCULACION' });
  const row = { documents: [{ tipo_documento_id: 2, origen: 'vinculacion', documento_id: 91, estado_documental: 'vencido' }], worker: {} } as RepositoryRow;
  assert.notEqual(repositoryKey(persona), repositoryKey(laboral));
  assert.equal(repositoryCell(row, persona).documento_id, null);
  assert.equal(repositoryCell(row, laboral).documento_id, 91);
  assert.equal(repositoryCell(row, laboral).estado_detallado, 'PENDIENTE_REVISION');
  assert.equal(repositoryGroup({ ...laboral, group: 'SEGURIDAD_SOCIAL' }), 'SEGURIDAD_SOCIAL');
});
