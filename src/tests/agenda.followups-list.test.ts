import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import { listFollowups, listAssignableUsers } from '../modules/agenda/agenda.service';
import { followupListSchema } from '../modules/agenda/agenda.schemas';
import { agendaRoutes } from '../modules/agenda/agenda.routes';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';

const tenant: TenantAccessContext = { empresaIds: [1], contratoIds: [], isGlobalAdmin: false, roleNames: [] };

test('contrato de listado valida clasificaciones, rango y paginacion', () => {
  for (const filtro of ['vencidos', 'hoy', 'proximos', 'sin_fecha']) assert.equal(followupListSchema.parse({ filtro }).filtro, filtro);
  for (const input of [{ page: 0 }, { page: 1.2 }, { limit: 101 }, { limit: 0 }, { desde: '2026-02-29' }, { desde: '2026-09-17', hasta: '2026-09-16' }]) assert.equal(followupListSchema.safeParse(input).success, false);
});

test('rutas de consulta permiten read/manage y rechazan sin permiso', () => {
  for (const path of ['/seguimientos', '/usuarios-asignables']) {
    const route = (agendaRoutes as any).stack.find((layer: any) => layer.route?.path === path).route;
    for (const permissions of [['agenda.read'], ['agenda.manage'], []]) {
      let error: any = 'pending'; route.stack[0].handle({ user: { permissions } }, {}, (value: any) => { error = value; });
      if (permissions.length) assert.equal(error, undefined); else assert.equal(error.statusCode, 403);
    }
  }
});

test('listado ejecuta SQL real con fechas Bogota, filtros y aislamiento empresarial', async t => {
  const db = new PGlite();
  t.mock.method(dbPool, 'query', async (sql: string, params?: any[]) => db.query(sql, params));
  const list = (input = {}, permissions = ['agenda.read'], actor = 7) => listFollowups(input, actor, tenant, permissions);
  try {
    await db.exec(`SET TIME ZONE 'Asia/Tokyo';
      CREATE TABLE usuarios(id int PRIMARY KEY,nombre_completo text,activo boolean DEFAULT true);
      INSERT INTO usuarios(id,nombre_completo) VALUES(7,'Actor'),(8,'Responsable'),(9,'Externo');
      CREATE TABLE usuario_empresas(usuario_id int,empresa_id int,activo boolean DEFAULT true);
      INSERT INTO usuario_empresas VALUES(7,1,true),(8,1,true),(9,2,true);
      CREATE TABLE roles(id int,nombre_rol text,activo boolean);
      CREATE TABLE usuario_roles(usuario_id int,rol_id int,activo boolean);
      CREATE TABLE agenda_tareas(id int PRIMARY KEY,empresa_id int,creador_id int,responsable_id int,archivada boolean DEFAULT false,titulo text,estado text DEFAULT 'PENDIENTE',tipo text DEFAULT 'OTRA',modulo_relacionado text DEFAULT 'PERSONAL',fecha_proxima_seguimiento date,municipio_id int,institucion_id int,sede_id int,persona_id int,vinculacion_id int,tipo_entidad_relacionada text,entidad_relacionada_id int);
      INSERT INTO agenda_tareas(id,empresa_id,creador_id,responsable_id,titulo,fecha_proxima_seguimiento) VALUES
      (10,1,7,8,'Vencida',(CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date-1),
      (11,1,8,7,'Hoy',(CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date),
      (12,1,8,8,'Proxima',(CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date+1),
      (13,1,7,8,'Sin fecha',NULL),(14,1,8,8,'Privada',NULL),(20,2,7,7,'Otra empresa',NULL);
      CREATE TABLE agenda_tarea_participantes(tarea_id int,usuario_id int);
      INSERT INTO agenda_tarea_participantes VALUES(12,7);
      CREATE TABLE agenda_tarea_seguimientos(id int PRIMARY KEY,empresa_id int,tarea_id int,usuario_id int,tipo text DEFAULT 'COMENTARIO',comentario text DEFAULT 'Llamada',created_at timestamptz DEFAULT '2026-09-17T02:00:00Z');
      INSERT INTO agenda_tarea_seguimientos(id,empresa_id,tarea_id,usuario_id) VALUES(1,1,10,7),(2,1,11,7),(3,1,12,7),(4,1,13,7),(5,1,14,8),(6,2,20,7),(7,1,20,7);`);
    await t.test('normal ve creado asignado participante; manage solo empresa activa', async () => {
      assert.deepEqual((await list()).items.map((row: any) => row.tarea_id), [13,12,11,10]);
      assert.equal((await list({}, ['agenda.manage'])).total, 5);
      assert.equal((await list({}, ['agenda.read', 'agenda.audit'])).total, 4);
      await assert.rejects(() => list({ empresa_id: 2 }, ['agenda.manage']), { statusCode: 403 });
      await assert.rejects(() => list({}, []), { statusCode: 403 });
      await assert.rejects(() => listFollowups({}, 7, { ...tenant, empresaIds: [1,2] }, ['agenda.manage']), { statusCode: 403 });
    });
    for (const [filtro, task] of [['vencidos',10], ['hoy',11], ['proximos',12], ['sin_fecha',13]] as const) await t.test(`clasificacion ${filtro} sin solapamiento`, async () => {
      const result = await list({ filtro }); assert.equal(result.total, 1); assert.equal(result.items[0].tarea_id, task); assert.equal(result.items[0].clasificacion, filtro);
      if (filtro === 'sin_fecha') assert.equal(result.items[0].fecha_proxima_seguimiento, null);
      else assert.match(result.items[0].fecha_proxima_seguimiento, /^\d{4}-\d{2}-\d{2}$/);
      if (filtro === 'hoy') assert.equal(result.items[0].fecha_proxima_seguimiento, result.hoy);
    });
    await t.test('paginacion SQL estable con total independiente del limite', async () => {
      const first = await list({ page: 1, limit: 2 }); const second = await list({ page: 2, limit: 2 });
      assert.equal(first.total, 4); assert.equal(second.total, 4); assert.equal(second.page, 2);
      assert.deepEqual([...first.items, ...second.items].map((row: any) => row.id), [4,3,2,1]);
      assert.equal((await list({ page: 3, limit: 2 })).items.length, 0);
    });
    await t.test('filtros combinados y rango segun fecha local del registro', async () => {
      const result = await list({ responsable_id: 8, tipo_tarea: 'OTRA', modulo_relacionado: 'PERSONAL', desde: '2026-09-16', hasta: '2026-09-16', q: 'vencida' });
      assert.equal(result.total, 1); assert.equal(result.items[0].usuario_registro_nombre, 'Actor'); assert.equal(result.items[0].responsable_nombre, 'Responsable');
      assert.equal((await list({ desde: '2026-09-17' })).total, 0);
      assert.equal((await list({ q: 'LLAMADA' })).total, 4);
      assert.equal((await list({ tipo_tarea: 'SST' })).total, 0);
      assert.equal((await list({ modulo_relacionado: 'DOCUMENTOS' })).total, 0);
      assert.equal((await list({ q: "' OR TRUE --" })).total, 0);
    });
    await t.test('responsables consultan solo usuarios activos de empresa activa', async () => {
      const users = await listAssignableUsers({ empresa_id: 1, limit: 100 }, 7, tenant, ['agenda.read']);
      assert.deepEqual(users.map((user: any) => user.id), [7,8]);
      assert.equal((await listAssignableUsers({ search: 'Respons', limit: 1 }, 7, tenant, ['agenda.read']))[0].id, 8);
      await assert.rejects(() => listAssignableUsers({ empresa_id: 2, limit: 100 }, 7, tenant, ['agenda.manage']), { statusCode: 403 });
      await db.exec('UPDATE usuario_empresas SET activo=false WHERE usuario_id=8');
      assert.equal((await listAssignableUsers({ limit: 100 }, 7, tenant, ['agenda.read'])).length, 1);
    });
  } finally { await db.close(); }
});
