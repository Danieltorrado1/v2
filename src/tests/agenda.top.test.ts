import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import { getTop, replaceTop } from '../modules/agenda/agenda.service';
import { topSchema, topQuerySchema } from '../modules/agenda/agenda.schemas';
import { agendaRoutes } from '../modules/agenda/agenda.routes';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';

const tenant: TenantAccessContext = { empresaIds: [1], contratoIds: [], isGlobalAdmin: false, roleNames: [] };
const date = '2026-09-16';
const write = (ids: (number|null)[], expected: (number|null)[] = []) => ({ fecha: date, tarea_ids: ids, esperado: expected });

test('Top schema valida fecha, posiciones 1-3, limite, duplicados y rechaza suplantacion', () => {
  assert.equal(topSchema.safeParse(write([null, null, 10])).success, true);
  for (const input of [write([1, 2, 3, 4]), write([1, 1]), write([0]), write([-1]), { ...write([1]), posicion: 4 }, { ...write([1]), usuario_id: 8 }, { ...write([1]), empresa_id: 2 }, { fecha: date, tarea_ids: [] }]) assert.equal(topSchema.safeParse(input).success, false);
  assert.equal(topQuerySchema.safeParse({ fecha: '2026-02-29' }).success, false);
  assert.equal(topQuerySchema.safeParse({ fecha: date, usuario_id: 8 }).success, false);
});
test('rutas reales GET y POST Top solo habilitan permisos autorizados', () => {
  for (const method of ['get', 'post']) {
    const route = (agendaRoutes as any).stack.find((layer: any) => layer.route?.path === '/top' && layer.route.methods[method]).route;
    for (const permissions of [['agenda.update'], ['agenda.manage'], []]) {
      let error: any = 'not called';
      route.stack[0].handle({ user: { permissions } }, {}, (result: any) => { error = result; });
      if (permissions.length) assert.equal(error, undefined); else assert.equal(error.statusCode, 403);
    }
  }
});

test('Top usa tabla existente, transaccion y usuario autenticado con SQL real', async (t) => {
  const db = new PGlite();
  const locks: string[] = [];
  let failInsert = false;
  // PGlite has one physical session: serialize transactions as a connection pool adapter.
  let transaction = Promise.resolve();
  const query = async (sql: string, params?: any[]) => {
    if (/INSERT INTO\s+(auditoria_eventos|auditoria|historial_cambios)\b/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('pg_advisory_xact_lock')) locks.push(params![0]);
    if (failInsert && sql.includes('INSERT INTO agenda_top_tareas')) throw new Error('Fallo de escritura');
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  t.mock.method(dbPool, 'query', query);
  t.mock.method(dbPool, 'connect', async () => {
    let release: (() => void) | undefined;
    return { release() {}, query: async (sql: string, params?: any[]) => {
      if (sql === 'BEGIN') { const previous = transaction; transaction = new Promise<void>(resolve => { release = resolve; }); await previous; }
      try { return await query(sql, params); } finally { if (sql === 'COMMIT' || sql === 'ROLLBACK') release?.(); }
    } };
  });
  try {
    await db.exec(`CREATE TABLE agenda_tareas(id int PRIMARY KEY,empresa_id int,creador_id int,responsable_id int,archivada boolean DEFAULT false,titulo text,estado text,prioridad text);
      INSERT INTO agenda_tareas(id,empresa_id,creador_id,responsable_id,titulo) VALUES(10,1,7,7,'Uno'),(11,1,7,7,'Dos'),(12,1,7,7,'Tres'),(13,1,7,7,'Cuatro'),(20,2,7,7,'Otra empresa'),(30,1,8,8,'Privada');
      CREATE TABLE agenda_tarea_participantes(tarea_id int,usuario_id int);
      CREATE TABLE agenda_top_tareas(empresa_id int,usuario_id int,fecha date,tarea_id int REFERENCES agenda_tareas(id),posicion smallint CHECK(posicion BETWEEN 1 AND 3),PRIMARY KEY(empresa_id,usuario_id,fecha,posicion),UNIQUE(empresa_id,usuario_id,fecha,tarea_id));
      INSERT INTO agenda_top_tareas VALUES(1,8,'2026-09-16',11,1),(2,7,'2026-09-16',20,1);`);
    await t.test('consulta solo Top del usuario y fecha seleccionada', async () => {
      assert.deepEqual((await getTop(date, 7, tenant, ['agenda.read'])).tarea_ids, [null,null,null]);
      assert.deepEqual((await getTop(date, 8, tenant, ['agenda.read'])).tarea_ids, [11,null,null]);
      await assert.rejects(() => getTop(date, 7, tenant, []), { statusCode: 403 });
    });
    await t.test('agrega en tercera posicion libre sin compactar espacios', async () => {
      const result = await replaceTop(write([null,null,10]), 7, tenant, ['agenda.update']);
      assert.deepEqual(result.tarea_ids, [null,null,10]); assert.equal(result.items[0].posicion, 3);
    });
    await t.test('mueve, llena, intercambia, sustituye y retira atomicamente', async () => {
      await replaceTop(write([10], [null,null,10]), 7, tenant, ['agenda.update']);
      await replaceTop(write([10,11,12], [10]), 7, tenant, ['agenda.update']);
      await replaceTop(write([11,10,12], [10,11,12]), 7, tenant, ['agenda.update']);
      await replaceTop(write([11,13,12], [11,10,12]), 7, tenant, ['agenda.update']);
      assert.deepEqual((await replaceTop(write([11,null,12], [11,13,12]), 7, tenant, ['agenda.update'])).tarea_ids, [11,null,12]);
    });
    await t.test('limite y duplicados rechazados sin alterar Top existente', async () => {
      for (const ids of [[10,11,12,13], [10,10], [0]]) await assert.rejects(() => replaceTop(write(ids, [11,null,12]), 7, tenant, ['agenda.manage']), { statusCode: 400 });
      assert.deepEqual((await getTop(date, 7, tenant, ['agenda.read'])).tarea_ids, [11,null,12]);
    });
    await t.test('no cruza tenant ni permite tareas sin visibilidad', async () => {
      await assert.rejects(() => replaceTop(write([20], [11,null,12]), 7, tenant, ['agenda.manage']), { statusCode: 403 });
      await assert.rejects(() => replaceTop(write([30], [11,null,12]), 7, tenant, ['agenda.update']), { statusCode: 403 });
      await assert.rejects(() => replaceTop(write([10]), 7, { ...tenant, empresaIds: [1,2] }, ['agenda.manage']), { statusCode: 403 });
      assert.deepEqual((await getTop(date, 7, { ...tenant, empresaIds: [2] }, ['agenda.manage'])).tarea_ids, [20,null,null]);
    });
    await t.test('manage no suplanta al propietario ni altera Top personal ajeno', async () => {
      await assert.rejects(() => replaceTop({ ...write([10], [11,null,12]), usuario_id: 8 }, 7, tenant, ['agenda.manage']), { statusCode: 400 });
      await replaceTop(write([30], [11,null,12]), 7, tenant, ['agenda.manage']);
      assert.deepEqual((await getTop(date, 8, tenant, ['agenda.read'])).tarea_ids, [11,null,null]);
    });
    await t.test('fallo entre borrar e insertar hace rollback sin desaparicion parcial', async () => {
      failInsert = true;
      await assert.rejects(() => replaceTop(write([10], [30]), 7, tenant, ['agenda.manage']), /Fallo de escritura/);
      failInsert = false;
      assert.deepEqual((await getTop(date, 7, tenant, ['agenda.manage'])).tarea_ids, [30,null,null]);
    });
    await t.test('dos envios con misma lectura: uno gana y otro recibe 409', async () => {
      const results = await Promise.allSettled([replaceTop(write([10], [30]), 7, tenant, ['agenda.manage']), replaceTop(write([11], [30]), 7, tenant, ['agenda.manage'])]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
      assert.equal(rejected.reason.statusCode, 409);
      assert.equal(rejected.reason.code, 'AGENDA_TOP_CONFLICT');
      assert.deepEqual((await getTop(date, 7, tenant, ['agenda.manage'])).tarea_ids, [10,null,null]);
      assert.ok(locks.length > 0); assert.ok(locks.every(key => key === `agenda_top:1:7:${date}`));
    });
    await t.test('fecha distinta mantiene Top de hoy intacto', async () => {
      await replaceTop({ ...write([12]), fecha: '2026-09-17' }, 7, tenant, ['agenda.manage']);
      assert.deepEqual((await getTop(date, 7, tenant, ['agenda.manage'])).tarea_ids, [10,null,null]);
    });
  } finally { await db.close(); }
});
