import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import { addFollowup } from '../modules/agenda/agenda.service';
import { followupSchema, manualFollowupTypes } from '../modules/agenda/agenda.schemas';
import { agendaRepository } from '../modules/agenda/agenda.repository';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';

const tenant: TenantAccessContext = { empresaIds: [1], contratoIds: [], isGlobalAdmin: false, roleNames: [] };

test('contrato manual exige comentario y excluye eventos automaticos y campos de estado', () => {
  for (const tipo of manualFollowupTypes) assert.equal(followupSchema.parse({ tipo, comentario: ' Texto ' }).comentario, 'Texto');
  for (const tipo of ['CAMBIO_ESTADO', 'REPROGRAMACION', 'REASIGNACION', 'CIERRE', 'REAPERTURA', 'CANCELACION']) assert.equal(followupSchema.safeParse({ tipo, comentario: 'Texto' }).success, false);
  for (const comentario of ['', '  ', 'x'.repeat(5001)]) assert.equal(followupSchema.safeParse({ comentario }).success, false);
  assert.equal(followupSchema.safeParse({ comentario: 'Texto', estado_nuevo: 'TERMINADA' }).success, false);
});

test('fecha laboral opcional: valida calendario, admite pasado y hoy sin conversion UTC', () => {
  for (const fecha of [undefined, null, '2000-02-29', '2026-09-16']) assert.equal(followupSchema.parse({ comentario: 'Texto', fecha_proxima_seguimiento: fecha }).fecha_proxima_seguimiento, fecha);
  for (const fecha of ['2026-02-29', '2026-13-01', '2026-09-16T00:00:00Z', '16/09/2026', '']) assert.equal(followupSchema.safeParse({ comentario: 'Texto', fecha_proxima_seguimiento: fecha }).success, false);
});

test('seguimiento usa SQL real y transaccion con alcance tenant', async (t) => {
  const db = new PGlite();
  const audits: string[] = [];
  let failInsert = false;
  const client = {
    query: async (sql: string, params?: any[]) => {
      if (/INSERT INTO\s+(auditoria_eventos|auditoria|historial_cambios)\b/.test(sql)) { audits.push(sql); return { rows: [], rowCount: 0 }; }
      if (failInsert && sql.includes('INSERT INTO agenda_tarea_seguimientos')) throw new Error('Fallo simulado');
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }, release() {},
  };
  t.mock.method(dbPool, 'connect', async () => client);
  try {
    await db.exec(`CREATE TABLE usuarios(id int PRIMARY KEY,nombre_completo text);
      INSERT INTO usuarios VALUES(7,'Registrador'),(8,'Responsable');
      CREATE TABLE agenda_tareas(id int PRIMARY KEY,empresa_id int,creador_id int,responsable_id int,archivada boolean DEFAULT false,titulo text,requiere_seguimiento boolean DEFAULT false,fecha_proxima_seguimiento date,version int DEFAULT 1,updated_at timestamp);
      INSERT INTO agenda_tareas(id,empresa_id,creador_id,responsable_id,titulo) VALUES(10,1,7,8,'Visible'),(20,2,7,8,'Otra empresa'),(30,1,8,8,'Privada');
      CREATE TABLE agenda_tarea_participantes(tarea_id int,usuario_id int);
      CREATE TABLE roles(id int,nombre_rol text,activo boolean);
      CREATE TABLE usuario_roles(usuario_id int,rol_id int,activo boolean);
      CREATE TABLE agenda_tarea_asignaciones(tarea_id int,id int,fecha_asignacion timestamp);
      CREATE TABLE agenda_tarea_seguimientos(id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,empresa_id int,tarea_id int,usuario_id int,tipo text,comentario text,estado_anterior text,estado_nuevo text,fecha_anterior date,fecha_nueva date,evidencia_documento_id int,created_at timestamptz DEFAULT now());`);
    await t.test('guarda comentario, autor, programacion e historial en la empresa activa', async () => {
      const item = await addFollowup(10, { tipo: 'COMENTARIO', comentario: ' Contactar ', fecha_proxima_seguimiento: '2026-09-16', requiere_seguimiento: true }, 7, tenant, ['agenda.update']);
      assert.equal(item.comentario, 'Contactar'); assert.equal(item.usuario_id, 7); assert.equal(item.empresa_id, 1);
      const rows = await db.query("SELECT requiere_seguimiento,to_char(fecha_proxima_seguimiento,'YYYY-MM-DD') fecha FROM agenda_tareas WHERE id=10");
      assert.deepEqual(rows.rows, [{ requiere_seguimiento: true, fecha: '2026-09-16' }]);
      const detail = await agendaRepository.detail(10, { empresaId: 1, userId: 7, canManage: false, canAudit: false }, client as any);
      assert.equal(detail.seguimientos[0].usuario_registro_nombre, 'Registrador');
      assert.equal(detail.seguimientos[0].fecha_proxima_seguimiento, '2026-09-16');
      assert.ok(detail.seguimientos[0].created_at);
      assert.ok(audits.length > 0);
    });
    await t.test('manage puede registrar evidencia textual en tarea ajena de la misma empresa', async () => {
      const item = await addFollowup(30, { tipo: 'EVIDENCIA', comentario: 'Confirmacion telefonica' }, 7, tenant, ['agenda.manage']);
      assert.equal(item.tarea_id, 30); assert.equal(item.evidencia_documento_id, null);
    });
    await t.test('sin permiso devuelve 403 y sin visibilidad devuelve 404', async () => {
      await assert.rejects(() => addFollowup(10, { comentario: 'Texto' }, 7, tenant, []), { statusCode: 403 });
      await assert.rejects(() => addFollowup(30, { comentario: 'Texto' }, 7, tenant, ['agenda.update']), { statusCode: 404 });
    });
    await t.test('otra empresa es rechazada incluso con manage y no inserta historial', async () => {
      for (const permissions of [['agenda.update'], ['agenda.manage']]) await assert.rejects(() => addFollowup(20, { comentario: 'Texto', fecha_proxima_seguimiento: '2026-09-20' }, 7, tenant, permissions), { statusCode: 404 });
      assert.deepEqual((await db.query('SELECT * FROM agenda_tarea_seguimientos WHERE empresa_id=2')).rows, []);
      assert.equal((await db.query<{fecha_proxima_seguimiento: string | null}>('SELECT fecha_proxima_seguimiento FROM agenda_tareas WHERE id=20')).rows[0]!.fecha_proxima_seguimiento, null);
    });
    await t.test('servicio rechaza tipos automaticos y evidencia fisica aunque se omita controller', async () => {
      await assert.rejects(() => addFollowup(10, { tipo: 'REASIGNACION', comentario: 'Falso' }, 7, tenant, ['agenda.manage']), { statusCode: 400 });
      await assert.rejects(() => addFollowup(10, { tipo: 'EVIDENCIA', comentario: 'Archivo', evidencia_documento_id: 9 }, 7, tenant, ['agenda.manage']), { code: 'AGENDA_EVIDENCIA_FUERA_DE_FASE' });
    });
    await t.test('error de escritura revierte la proxima fecha y no duplica historia', async () => {
      failInsert = true;
      await assert.rejects(() => addFollowup(10, { comentario: 'Falla', fecha_proxima_seguimiento: '2026-10-01' }, 7, tenant, ['agenda.update']), /Fallo simulado/);
      failInsert = false;
      assert.equal((await db.query<{fecha: string}>("SELECT to_char(fecha_proxima_seguimiento,'YYYY-MM-DD') fecha FROM agenda_tareas WHERE id=10")).rows[0]!.fecha, '2026-09-16');
      assert.equal((await db.query<{total: number}>('SELECT count(*)::int total FROM agenda_tarea_seguimientos WHERE tarea_id=10')).rows[0]!.total, 1);
    });
    await t.test('fecha omitida conserva programacion; null la limpia sin alterar snapshot anterior', async () => {
      await addFollowup(10, { comentario: 'Sin cambiar fecha' }, 7, tenant, ['agenda.update']);
      await addFollowup(10, { comentario: 'Sin proxima fecha', fecha_proxima_seguimiento: null, requiere_seguimiento: false }, 7, tenant, ['agenda.update']);
      const detail = await agendaRepository.detail(10, { empresaId: 1, userId: 7, canManage: false, canAudit: false }, client as any);
      assert.equal(detail.fecha_proxima_seguimiento, null);
      assert.deepEqual(detail.seguimientos.map((s: any) => s.fecha_proxima_seguimiento), ['2026-09-16', '2026-09-16', null]);
    });
  } finally { await db.close(); }
});
