import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { effectiveRetirementSql } from '../modules/nomina/nomina.population';

// Never connect to an external database, even when the workspace has a real .env.
Object.assign(process.env, {
  DATABASE_URL: 'postgres://test:test@127.0.0.1:1/forbidden',
  APP_NAME: 'population-test', API_PREFIX: '/api', NODE_ENV: 'test', PORT: '4000',
  JWT_SECRET: 'test-only', JWT_EXPIRES_IN: '1h', CORS_ORIGIN: 'http://localhost',
  TRUST_PROXY: 'false', RATE_LIMIT_WINDOW_MINUTES: '1', RATE_LIMIT_MAX_REQUESTS: '100',
  LOG_LEVEL: 'error', ENABLE_JOBS: 'false', SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only', SUPABASE_STORAGE_BUCKET: 'test-only'
});

const schema = `
CREATE TABLE contratos (id bigint PRIMARY KEY, empresa_id bigint, numero_contrato text, entidad_contratante text, fecha_inicio date, fecha_finalizacion date);
INSERT INTO contratos VALUES (1,1,'TEST','TEST','2026-01-01',NULL);
CREATE TABLE nomina_periodos (id bigint PRIMARY KEY, contrato_id bigint, nombre_periodo text, fecha_inicio date, fecha_fin date, tipo_periodo text, requiere_asistencia boolean, estado text, activo boolean, created_at timestamptz);
INSERT INTO nomina_periodos VALUES (8,1,'AGOSTO','2026-08-01','2026-08-31','MENSUAL',true,'ABIERTO',true,now()),(9,1,'SEPTIEMBRE','2026-09-01','2026-09-30','MENSUAL',true,'ABIERTO',true,now());
CREATE TABLE tipos_vinculacion (id bigint PRIMARY KEY, codigo text);
CREATE TABLE vinculaciones (id bigint PRIMARY KEY, persona_id bigint, contrato_id bigint DEFAULT 1, fecha_inicio date, fecha_fin date, metodo_pago text DEFAULT 'ASISTENCIA', tipo_vinculacion_id bigint, contrato_cargo_id bigint);
CREATE TABLE nomina_empleados (id bigserial PRIMARY KEY, periodo_id bigint REFERENCES nomina_periodos, vinculacion_id bigint REFERENCES vinculaciones, metodo_liquidacion text, categoria_salarial_id bigint, salario_base numeric, auxilio_transporte numeric, otros_devengos numeric, fecha_inicio_pago date, fecha_fin_pago date, dias_periodo numeric, dias_pagados numeric, horas_trabajadas numeric, horas_extra_total numeric, devengado_basico numeric, devengado_transporte numeric, devengado_otros numeric, total_adiciones numeric, total_deducciones numeric, salud numeric, pension numeric, neto_pagar numeric, revisado boolean, estado text, activo boolean, motivo_caso_especial text, detalle_calculo jsonb, UNIQUE(periodo_id,vinculacion_id));
CREATE TABLE nomina_tipos_novedad (id bigint PRIMARY KEY, nombre text);
INSERT INTO nomina_tipos_novedad VALUES (1,'FECHA DE RETIRO');
CREATE TABLE nomina_novedades (id bigserial PRIMARY KEY, nomina_empleado_id bigint REFERENCES nomina_empleados, vinculacion_id bigint, tipo_novedad_id bigint, fecha_inicio date, fecha_fin date, activo boolean DEFAULT true);
CREATE TABLE nomina_asistencia_diaria (periodo_id bigint, vinculacion_id bigint, fecha date);
CREATE TABLE nomina_novedad_turnos (nomina_empleado_id bigint REFERENCES nomina_empleados, payload text);
CREATE TABLE nomina_movimientos (nomina_empleado_id bigint REFERENCES nomina_empleados, payload text);
CREATE TABLE nomina_ajustes_manuales (nomina_empleado_id bigint REFERENCES nomina_empleados, payload text);
CREATE TABLE nomina_revision_operativa (nomina_empleado_id bigint REFERENCES nomina_empleados, payload text);
`;

test('sincronizaci?n real sobre PostgreSQL aislado, sin conexiones externas', async t => {
  const { dbPool } = await import('../config/db.js');
  const { importNominaEmpleados } = await import('../modules/nomina/nomina.service.js');
  const db = new PGlite();
  await db.exec(schema);
  const statements: string[] = [];
  const audits: unknown[][] = [];
  const adapter = {
    release() {},
    async query(sql: string, params?: unknown[]) {
      statements.push(sql);
      if (/INSERT INTO (auditoria|historial_cambios)/i.test(sql)) {
        audits.push(params ?? []);
        return { rows: [{ id: '1' }], rowCount: 1 };
      }
      return db.query<Record<string, any>>(sql, params);
    }
  };
  mock.method(dbPool, 'connect', async () => adapter);
  mock.method(dbPool, 'query', () => { throw new Error('External pool query forbidden'); });
  const sync = () => importNominaEmpleados('9', '1');
  const active = async () => (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM nomina_empleados WHERE activo AND periodo_id=9')).rows[0]!.count;
  try {
    await t.test('materializa 750 con agosto abierto y valores econ?micos cero', async () => {
      await db.exec(`INSERT INTO vinculaciones(id,persona_id,fecha_inicio) SELECT n,n,'2026-08-01' FROM generate_series(1,750) n;
        INSERT INTO vinculaciones(id,persona_id,fecha_inicio,fecha_fin) VALUES (752,752,'2026-10-01',NULL),(753,753,'2026-08-01','2026-08-31');
        INSERT INTO nomina_empleados(periodo_id,vinculacion_id,neto_pagar,activo) VALUES (8,1,999999,true)`);
      assert.equal((await sync()).imported, 750);
      assert.equal(await active(), 750);
      assert.equal((await db.query<Record<string, any>>('SELECT neto_pagar FROM nomina_empleados WHERE periodo_id=8')).rows[0]!.neto_pagar, '999999');
      assert.equal((await db.query<Record<string, any>>('SELECT estado FROM nomina_periodos WHERE id=8')).rows[0]!.estado, 'ABIERTO');
      assert.equal((await db.query<Record<string, any>>('SELECT sum(neto_pagar)::int AS neto FROM nomina_empleados WHERE periodo_id=9')).rows[0]!.neto, 0);
    });
    await t.test('ingreso tard?o +1 e idempotencia', async () => {
      await db.exec(`INSERT INTO vinculaciones(id,persona_id,fecha_inicio) VALUES (751,751,'2026-09-03')`);
      assert.equal((await sync()).imported, 1);
      const repeat = await sync();
      assert.equal(repeat.imported, 0);
      assert.equal(repeat.excluded, 0);
      assert.equal(repeat.skipped_duplicates, 751);
      assert.equal(await active(), 751);
    });
    await t.test('retiro agosto excluye; septiembre y octubre permanecen', async () => {
      await db.exec(`UPDATE vinculaciones SET fecha_fin='2026-08-31' WHERE id=1;
        UPDATE vinculaciones SET fecha_fin='2026-09-15' WHERE id=2;
        UPDATE vinculaciones SET fecha_fin='2026-10-15' WHERE id=3;`);
      assert.equal((await sync()).excluded, 1);
      assert.equal(await active(), 750);
      assert.equal((await db.query<Record<string, any>>('SELECT activo FROM nomina_empleados WHERE periodo_id=9 AND vinculacion_id=2')).rows[0]!.activo, true);
      assert.equal((await db.query<Record<string, any>>('SELECT activo FROM nomina_empleados WHERE periodo_id=9 AND vinculacion_id=3')).rows[0]!.activo, true);
    });
    await t.test('retiro por novedad preserva asistencia, novedades, turnos, movimientos, ajustes y valores', async () => {
      const id = (await db.query<{ id: number }>('SELECT id FROM nomina_empleados WHERE vinculacion_id=4')).rows[0]!.id;
      await db.exec(`UPDATE nomina_empleados SET neto_pagar=123456, salario_base=2000000, detalle_calculo='{"original":true}' WHERE id=${id};
        INSERT INTO nomina_asistencia_diaria VALUES (9,4,'2026-09-01');
        INSERT INTO nomina_novedades(nomina_empleado_id,vinculacion_id,tipo_novedad_id,fecha_inicio) VALUES (${id},4,1,'2026-08-31');
        INSERT INTO nomina_novedad_turnos VALUES (${id},'turno original');
        INSERT INTO nomina_movimientos VALUES (${id},'movimiento original');
        INSERT INTO nomina_ajustes_manuales VALUES (${id},'ajuste original');`);
      const tables = ['nomina_asistencia_diaria','nomina_novedades','nomina_novedad_turnos','nomina_movimientos','nomina_ajustes_manuales'];
      const before = await Promise.all(tables.map(table => db.query<Record<string, any>>(`SELECT * FROM ${table}`)));
      const employeeBefore = (await db.query<Record<string, any>>('SELECT * FROM nomina_empleados WHERE id=$1',[id])).rows[0];
      const result = await sync();
      assert.deepEqual(result.requires_review, [String(id)]);
      assert.equal(result.excluded, 1);
      assert.deepEqual(await Promise.all(tables.map(table => db.query<Record<string, any>>(`SELECT * FROM ${table}`))), before);
      const employeeAfter = (await db.query<Record<string, any>>('SELECT * FROM nomina_empleados WHERE id=$1',[id])).rows[0];
      assert.deepEqual(employeeAfter, {...employeeBefore, activo: false, motivo_caso_especial: 'PERSONAL_FUERA_VIGENCIA'});
      assert.equal((await sync()).excluded, 0);
      assert.ok(audits.length > 0);
    });
    await t.test('fecha corregida reactiva solo exclusiones del sincronizador', async () => {
      await db.exec(`UPDATE vinculaciones SET fecha_fin=NULL WHERE id=1`);
      assert.equal((await sync()).reactivated, 1);
      assert.equal((await sync()).reactivated, 0);
    });
    await t.test('KPI retiro sin duplicado y novedad anulada ignorada', async () => {
      await db.exec(`INSERT INTO nomina_novedades(vinculacion_id,tipo_novedad_id,fecha_inicio) VALUES (2,1,'2026-09-15');
        INSERT INTO nomina_novedades(vinculacion_id,tipo_novedad_id,fecha_inicio,activo) VALUES (3,1,'2026-08-01',false)`);
      const result = await db.query<Record<string, any>>(`SELECT count(DISTINCT v.id)::int AS count FROM vinculaciones v WHERE ${effectiveRetirementSql} BETWEEN '2026-09-01' AND '2026-09-30'`);
      assert.equal(result.rows[0]!.count, 1);
      assert.equal((await sync()).excluded, 0);
    });
    await t.test('periodo cerrado rechaza la sincronizacion sin cambios', async () => {
      await db.exec("UPDATE nomina_periodos SET estado='CERRADO' WHERE id=9");
      const before = (await db.query('SELECT * FROM nomina_empleados ORDER BY id')).rows;
      await assert.rejects(sync());
      assert.deepEqual((await db.query('SELECT * FROM nomina_empleados ORDER BY id')).rows, before);
      await db.exec("UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=9");
    });
    await t.test('solo escribe poblaci?n y auditor?a, nunca recalcula ni borra', () => {
      assert.ok(!statements.some(sql => /DELETE\s+FROM/i.test(sql)));
      const updates = statements.filter(sql => /UPDATE nomina_empleados/i.test(sql));
      assert.ok(updates.every(sql => !/SET\s+(salario|neto|salud|pension|devengado)/i.test(sql)));
    });
  } finally {
    mock.restoreAll();
    await db.close();
    await dbPool.end();
  }
});
