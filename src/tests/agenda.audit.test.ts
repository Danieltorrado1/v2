import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import * as service from '../modules/agenda/agenda.service';
import { closeDaySchema } from '../modules/agenda/agenda.schemas';
import { agendaTenant } from '../modules/agenda/agenda.tenant';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';

const tenant: TenantAccessContext = { empresaIds: [1], contratoIds: [], isGlobalAdmin: false, roleNames: [] };
test('empresa seleccionada se valida antes de acotar tenant multiempresa', () => {
  for (const selected of ['1','2','3','0','abc',undefined]) {
    const request: any = { query: selected === undefined ? {} : { empresa_id: selected }, tenant: { ...tenant, empresaIds: [1,2] } };
    let error: any;
    agendaTenant(request, {} as any, value => { error = value; });
    if (selected === '1' || selected === '2') { assert.equal(error, undefined); assert.deepEqual(request.tenant.empresaIds,[Number(selected)]); }
    else { assert.ok(error); assert.deepEqual(request.tenant.empresaIds,[1,2]); }
  }
});
test('cierre rechaza fechas imposibles y clasificaciones duplicadas', () => {
  assert.equal(closeDaySchema.safeParse({ fecha: '2026-02-30' }).success, false);
  assert.equal(closeDaySchema.safeParse({ fecha: '2026-09-16', pendientes: [10,10] }).success, false);
});

test('auditoria funcional SQL de cierre, participantes, asignacion y reprogramacion', async t => {
  const db = new PGlite();
  const query = async (sql: string, params?: any[]) => {
    if (/INSERT INTO\s+(auditoria_eventos|auditoria|historial_cambios)\b/.test(sql)) return { rows: [], rowCount: 0 };
    const result = await db.query(sql, params); return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  t.mock.method(dbPool, 'query', query);
  t.mock.method(dbPool, 'connect', async () => ({ query, release() {} }));
  try {
    await db.exec(`CREATE TABLE usuarios(id int PRIMARY KEY,nombre_completo text,activo boolean DEFAULT true);
      INSERT INTO usuarios(id,nombre_completo) VALUES(7,'Actor'),(8,'Otro'),(9,'Participante');
      CREATE TABLE usuario_empresas(usuario_id int,empresa_id int,activo boolean DEFAULT true);
      INSERT INTO usuario_empresas VALUES(7,1,true),(8,1,true),(9,1,true);
      CREATE TABLE roles(id int,nombre_rol text,activo boolean);
      CREATE TABLE usuario_roles(usuario_id int,rol_id int,activo boolean);
      CREATE TABLE agenda_tareas(id int PRIMARY KEY,empresa_id int,creador_id int,responsable_id int,archivada boolean DEFAULT false,titulo text,estado text DEFAULT 'PENDIENTE',fecha_prevista date DEFAULT '2026-09-16',fecha_limite date,fecha_proxima_seguimiento date,fecha_terminacion date,motivo_reprogramacion text,version int DEFAULT 1,updated_at timestamp);
      INSERT INTO agenda_tareas(id,empresa_id,creador_id,responsable_id,titulo) VALUES(10,1,7,7,'Visible'),(11,1,8,8,'Privada'),(20,2,7,7,'Ajena');
      CREATE TABLE agenda_tarea_participantes(tarea_id int,usuario_id int,PRIMARY KEY(tarea_id,usuario_id));
      CREATE TABLE agenda_tarea_asignaciones(id int GENERATED ALWAYS AS IDENTITY,tarea_id int,empresa_id int,responsable_anterior_id int,responsable_nuevo_id int,asignado_por_id int,motivo text,fecha_asignacion timestamp DEFAULT now());
      CREATE TABLE agenda_tarea_seguimientos(id int GENERATED ALWAYS AS IDENTITY,empresa_id int,tarea_id int,usuario_id int,tipo text,comentario text,estado_anterior text,estado_nuevo text,fecha_anterior date,fecha_nueva date,evidencia_documento_id int,created_at timestamptz DEFAULT now());
      CREATE TABLE agenda_cierres_diarios(id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,empresa_id int,usuario_id int,fecha date,resumen text,resumen_dia text,terminadas text,pendientes text,reprogramadas text,observaciones text,version int DEFAULT 1,updated_at timestamp,UNIQUE(empresa_id,usuario_id,fecha));
      CREATE TABLE agenda_cierre_tareas(id int GENERATED ALWAYS AS IDENTITY,empresa_id int,cierre_id int,tarea_id int,clasificacion text);`);
    await t.test('guardar cierre devuelve las mismas tareas que recuperar, sin perderlas en segundo guardado', async () => {
      const input = { fecha: '2026-09-16', pendientes: [10], resumen_dia: 'Resumen', observaciones: 'Notas' };
      const saved = await service.closeDay(input,7,tenant,['agenda.update']);
      assert.deepEqual(saved.tareas, [{ tarea_id: 10, clasificacion: 'PENDIENTE' }]);
      assert.deepEqual((await service.getCloseDay(input.fecha,7,tenant,['agenda.update'])).tareas, saved.tareas);
      const again = await service.closeDay(input,7,tenant,['agenda.update']);
      assert.deepEqual(again.tareas, saved.tareas);
      assert.equal(await service.getCloseDay(input.fecha,8,tenant,['agenda.manage']), null);
    });
    await t.test('cierre no admite tarea privada ni otra empresa incluso con manage', async () => {
      await assert.rejects(() => service.closeDay({ fecha: '2026-09-16', pendientes: [11] },7,tenant,['agenda.update']), { statusCode: 403 });
      await assert.rejects(() => service.closeDay({ fecha: '2026-09-16', pendientes: [20] },7,tenant,['agenda.manage']), { statusCode: 403 });
    });
    await t.test('participantes devuelve historial actualizado', async () => {
      const saved = await service.replaceParticipants(10,{ participantes: [9] },7,tenant,['agenda.update']);
      assert.equal(saved.participantes[0].id,9); assert.ok(saved.seguimientos.some((item: any) => item.comentario === 'Participantes actualizados'));
    });
    await t.test('update no permite modificar participantes ni reprogramar una tarea privada', async () => {
      await assert.rejects(() => service.replaceParticipants(11,{ participantes: [9] },7,tenant,['agenda.update']), { statusCode: 403 });
      await assert.rejects(() => service.assignTask(11,{ responsable_id: 9 },7,tenant,['agenda.assign']), { statusCode: 403 });
      await assert.rejects(() => service.rescheduleTask(11,{ fecha_prevista: '2026-09-18', motivo: 'Cambio', version: 1 },7,tenant,['agenda.update']), { statusCode: 403 });
    });
    await t.test('asignar participante como responsable elimina su duplicacion', async () => {
      await service.assignTask(10,{ responsable_id: 9 },7,tenant,['agenda.assign']);
      const detail = await service.getTask(10,7,tenant,['agenda.read']);
      assert.equal(detail.responsable_id,9); assert.equal(detail.participantes.length,0);
      assert.equal(detail.asignaciones.length,1);
    });
    await t.test('reprogramacion rechaza version obsoleta y estados terminales sin escribir historia', async () => {
      await assert.rejects(() => service.rescheduleTask(10,{ fecha_prevista: '2026-09-18', motivo: 'Cambio', version: 999 },7,tenant,['agenda.manage']), { statusCode: 409 });
      await db.exec("UPDATE agenda_tareas SET estado='TERMINADA' WHERE id=10");
      await assert.rejects(() => service.rescheduleTask(10,{ fecha_prevista: '2026-09-18', motivo: 'Cambio' },7,tenant,['agenda.manage']), { statusCode: 409 });
      assert.equal((await db.query('SELECT * FROM agenda_tarea_seguimientos WHERE tipo=\'REPROGRAMACION\'')).rows.length,0);
      await db.exec("UPDATE agenda_tareas SET estado='PENDIENTE' WHERE id=10");
    });
    await t.test('reprogramacion valida conserva fecha limite e historial', async () => {
      await db.exec("UPDATE agenda_tareas SET fecha_limite='2026-09-30' WHERE id=10");
      const saved = await service.rescheduleTask(10,{ fecha_prevista: '2026-09-18', motivo: 'Cambio' },7,tenant,['agenda.manage']);
      assert.equal(saved.fecha_prevista,'2026-09-18'); assert.equal(saved.fecha_limite,'2026-09-30');
      assert.equal(saved.estado,'REPROGRAMADA');
    });
  } finally { await db.close(); }
});
