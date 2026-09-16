import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import * as service from '../modules/agenda/agenda.service';
import { agendaRepository as repo } from '../modules/agenda/agenda.repository';
import { agendaRoutes } from '../modules/agenda/agenda.routes';
import type { AgendaScope } from '../modules/agenda/agenda.types';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';

const tenant: TenantAccessContext = { empresaIds: [1], contratoIds: [], isGlobalAdmin: false, roleNames: [] };
const operations = [
  { name: 'editar', method: 'patch', path: '/tareas/:id', permission: 'agenda.update', call: (p: string[], t = tenant) => service.updateTask(10, { titulo: 'Editada' }, 7, t, p) },
  { name: 'asignar', method: 'post', path: '/tareas/:id/asignar', permission: 'agenda.assign', call: (p: string[], t = tenant) => service.assignTask(10, { responsable_id: 9 }, 7, t, p) },
  { name: 'participantes', method: 'put', path: '/tareas/:id/participantes', permission: 'agenda.update', call: (p: string[], t = tenant) => service.replaceParticipants(10, { participantes: [9] }, 7, t, p) },
  { name: 'iniciar', method: 'post', path: '/tareas/:id/iniciar', permission: 'agenda.update', call: (p: string[], t = tenant) => service.startTask(10, undefined, 1, 7, t, p) },
  { name: 'terminar', method: 'post', path: '/tareas/:id/terminar', permission: 'agenda.complete', call: (p: string[], t = tenant) => service.completeTask(10, undefined, 1, 7, t, p) },
  { name: 'reprogramar', method: 'post', path: '/tareas/:id/reprogramar', permission: 'agenda.update', call: (p: string[], t = tenant) => service.rescheduleTask(10, { fecha_prevista: '2026-09-20', motivo: 'Cambio', version: 1 }, 7, t, p) },
  { name: 'cancelar', method: 'post', path: '/tareas/:id/cancelar', permission: 'agenda.cancel', call: (p: string[], t = tenant) => service.cancelTask(10, { motivo: 'Cancelada', version: 1 }, 7, t, p) },
  { name: 'reabrir', method: 'post', path: '/tareas/:id/reabrir', permission: 'agenda.reopen', call: (p: string[], t = tenant) => service.reopenTask(10, undefined, 1, 7, t, p) },
  { name: 'seguimiento existente', method: 'post', path: '/tareas/:id/seguimientos', permission: 'agenda.update', call: (p: string[], t = tenant) => service.addFollowup(10, { tipo: 'COMENTARIO', comentario: 'Registro' }, 7, t, p) },
];

for (const op of operations) {
  test(`${op.name}: middleware real acepta permiso especifico o manage y rechaza sin ambos`, () => {
    const route = (agendaRoutes as any).stack.find((layer: any) => layer.route?.path === op.path && layer.route.methods[op.method]).route;
    for (const permissions of [[op.permission], ['agenda.manage'], [], ['agenda.read']]) {
      let result: any = 'not called';
      route.stack[0].handle({ user: { permissions } }, {}, (error: any) => { result = error; });
      if (permissions.includes(op.permission) || permissions.includes('agenda.manage')) assert.equal(result, undefined);
      else assert.equal(result.statusCode, 403);
    }
  });
  test(`${op.name}: servicio acepta manage, conserva empresa y auditoria, deniega sin permiso`, async (t) => {
    const before = { id: 10, empresa_id: 1, creador_id: 8, responsable_id: 8, estado: op.name === 'reabrir' ? 'TERMINADA' : 'PENDIENTE', version: 1 };
    const updated = { ...before, version: 2 };
    const queries: string[] = [];
    const client = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; }, release() {} };
    t.mock.method(dbPool, 'connect', async () => client);
    t.mock.method(repo, 'get', async (_id: number, scope: AgendaScope) => { assert.equal(scope.empresaId, 1); return before; });
    t.mock.method(repo, 'usersBelong', async (ids: number[], company: number) => { assert.equal(company, 1); return new Set(ids); });
    t.mock.method(repo, 'validateReferences', async () => undefined);
    for (const method of ['update', 'reassign', 'replaceParticipants'] as const) t.mock.method(repo, method, async (_id: number, _input: unknown, scope: AgendaScope) => { assert.equal(scope.empresaId, 1); return updated; });
    t.mock.method(repo, 'transition', async (_id: number, _state: string, _comment: unknown, scope: AgendaScope, version: number | undefined) => { assert.equal(scope.empresaId, 1); assert.equal(version, 1); return updated; });
    t.mock.method(repo, 'reschedule', async (_id: number, _input: unknown, scope: AgendaScope) => { assert.equal(scope.empresaId, 1); return { old: before, current: updated }; });
    t.mock.method(repo, 'followup', async () => updated);
    assert.deepEqual(await op.call(['agenda.manage']), updated);
    assert.ok(queries.some(sql => /INSERT INTO.*auditoria/s.test(sql)), 'registra auditoria');
    assert.ok(queries.includes('COMMIT'));
    for (const permissions of [[], ['agenda.read']]) await assert.rejects(() => op.call(permissions), { statusCode: 403 });
    for (const empresaIds of [[], [1, 2]]) await assert.rejects(() => op.call(['agenda.manage'], { ...tenant, empresaIds }), { statusCode: 403 });
  });
}

test('manage conserva estados invalidos, version y rollback en transiciones', async (t) => {
  const queries: string[] = [];
  t.mock.method(dbPool, 'connect', async () => ({ query: async (sql: string) => { queries.push(sql); }, release() {} }));
  let estado = 'TERMINADA';
  t.mock.method(repo, 'get', async () => ({ id: 10, estado, responsable_id: 8, creador_id: 8 }));
  const change = t.mock.method(repo, 'transition', async () => null);
  await assert.rejects(() => service.startTask(10, undefined, 1, 7, tenant, ['agenda.manage']), { statusCode: 409, code: 'AGENDA_TRANSICION_INVALIDA' });
  assert.equal(change.mock.callCount(), 0);
  estado = 'PENDIENTE';
  await assert.rejects(() => service.startTask(10, undefined, 1, 7, tenant, ['agenda.manage']), { statusCode: 409, code: 'AGENDA_VERSION_CONFLICT' });
  assert.equal(queries.filter(q => q === 'ROLLBACK').length, 2);
});

test('SQL real: manage no lee ni modifica otra empresa y Top existente sigue siendo personal', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE usuarios(id int PRIMARY KEY,nombre_completo text);
      INSERT INTO usuarios VALUES(7,'Actor'),(8,'Otro');
      CREATE TABLE agenda_tareas(id int PRIMARY KEY,empresa_id int,creador_id int,responsable_id int,archivada boolean DEFAULT false,titulo text,estado text,prioridad text,version int DEFAULT 1,updated_at timestamp);
      INSERT INTO agenda_tareas(id,empresa_id,creador_id,responsable_id,titulo) VALUES(10,1,8,8,'Local'),(20,2,8,8,'Ajena');
      CREATE TABLE agenda_tarea_participantes(tarea_id int,usuario_id int);
      CREATE TABLE agenda_top_tareas(empresa_id int,usuario_id int,fecha date,tarea_id int,posicion int);
      INSERT INTO agenda_top_tareas VALUES(1,8,'2026-09-16',10,1);`);
    const executor = { query: (sql: string, params?: any[]) => db.query(sql, params) } as any;
    const scope = { empresaId: 1, userId: 7, canManage: true, canAudit: false };
    assert.equal((await repo.get(10, scope, executor)).titulo, 'Local');
    assert.equal(await repo.get(20, scope, executor), null);
    assert.equal(await repo.update(20, { titulo: 'No' }, scope, executor), undefined);
    assert.equal(await repo.reassign(20, 7, scope, undefined, executor), null);
    assert.equal(await repo.reschedule(20, { fecha_prevista: '2026-09-20' }, scope, executor), null);
    assert.equal(await repo.get(10, { ...scope, canManage: false }, executor), null);
    await repo.replaceTop('2026-09-16', [10], scope, executor);
    const rows = await db.query('SELECT usuario_id,tarea_id FROM agenda_top_tareas ORDER BY usuario_id');
    assert.deepEqual(rows.rows, [{ usuario_id: 7, tarea_id: 10 }, { usuario_id: 8, tarea_id: 10 }]);
  } finally { await db.close(); }
});
