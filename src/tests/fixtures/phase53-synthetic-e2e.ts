/**
 * Harness E2E sintético de Fase 2.
 * No es migración ni dump: crea sólo las columnas consultadas por el worker,
 * el resolvedor contextual y NominaPoblacionService, y elimina todo al final.
 * Ejecutar únicamente contra empiria_integration_test local.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const root = process.cwd();
const envText = fs.readFileSync(path.join(root, '.env.integration-test.local'), 'utf8');
const envLine = envText.split(/\r?\n/).find((line) => line.startsWith('INTEGRATION_TEST_DATABASE_URL='));
if (!envLine) throw new Error('INTEGRATION_TEST_DATABASE_URL no encontrado');
const localUrl = envLine.slice(envLine.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
const parsedUrl = new URL(localUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(parsedUrl.hostname));
assert.equal(parsedUrl.port, '5433');
assert.equal(parsedUrl.username, 'empiria_integration_test');
assert.equal(parsedUrl.pathname.slice(1), 'empiria_integration_test');

Object.assign(process.env, {
  APP_NAME: 'phase53-synthetic', API_PREFIX: '/api', NODE_ENV: 'test', PORT: '5999',
  DATABASE_URL: localUrl, JWT_SECRET: 'phase53-synthetic', JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: 'http://localhost', TRUST_PROXY: 'false', RATE_LIMIT_WINDOW_MINUTES: '1',
  RATE_LIMIT_MAX_REQUESTS: '10', LOG_LEVEL: 'error', ENABLE_JOBS: 'false',
  SUPABASE_URL: 'https://example.com', SUPABASE_SERVICE_ROLE_KEY: 'phase53-synthetic',
  SUPABASE_STORAGE_BUCKET: 'phase53-synthetic', INTEGRACION_OUTBOX_ENABLED: 'true',
  INTEGRACION_SYNC_ENABLED: 'true'
});

const ids = { companyA: 910001, companyB: 910002, contractA: 920001, contractB: 920002, personA: 940001, personB: 940002, personC: 940003, cargoA: 950001, vincA: 960001, vincB: 960002, vincC: 960003, openA: 970001, closedA: 970002, openB: 970003, assignmentA: 980001, assignmentB: 980002, employeeClosed: 990002, liqA: 991001, liqB: 991002, liqClosed: 991003, attendance: 992001, novelty: 992002, turn: 992003 };
const syntheticTables = [
  'contrato_cargos', 'nomina_categorias_salariales', 'vinculacion_condiciones_economicas',
  'cobertura_asignaciones', 'focalizacion_final', 'municipios', 'personal_asignaciones_laborales',
  'contrato_ubicaciones_laborales', 'gestor_personal_asignaciones', 'gestor_municipio_asignaciones',
  'usuarios', 'nomina_empleados', 'nomina_liquidaciones', 'nomina_contextos_operativos_base',
  'nomina_asistencia_diaria', 'nomina_novedades', 'nomina_novedad_turnos', 'auditoria_eventos'
];
const ddl: Record<string, string> = {
  contrato_cargos: `CREATE TABLE IF NOT EXISTS contrato_cargos (id bigint PRIMARY KEY, nombre_cargo text)`,
  nomina_categorias_salariales: `CREATE TABLE IF NOT EXISTS nomina_categorias_salariales (id bigint PRIMARY KEY, contrato_id bigint, codigo_categoria text, nombre_categoria text, salario_base numeric, activo boolean DEFAULT true, vigente_desde date, vigente_hasta date, auxilio_transporte numeric DEFAULT 0)`,
  vinculacion_condiciones_economicas: `CREATE TABLE IF NOT EXISTS vinculacion_condiciones_economicas (id bigint PRIMARY KEY, vinculacion_id bigint, activo boolean DEFAULT true, tipo_condicion text, valor numeric, vigencia_desde date, vigencia_hasta date)`,
  municipios: `CREATE TABLE IF NOT EXISTS municipios (id bigint PRIMARY KEY, nombre_municipio text)`,
  focalizacion_final: `CREATE TABLE IF NOT EXISTS focalizacion_final (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, institucion_id bigint, sede_id bigint, modalidad_id bigint, institucion_final text, sede_final text, modalidad_final text, municipio_texto text, activo boolean DEFAULT true)`,
  cobertura_asignaciones: `CREATE TABLE IF NOT EXISTS cobertura_asignaciones (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, focalizacion_final_id bigint, vinculacion_id bigint, institucion text, sede text, modalidad text, fecha_inicio date, fecha_fin date, activo boolean DEFAULT true, observacion text)`,
  contrato_ubicaciones_laborales: `CREATE TABLE IF NOT EXISTS contrato_ubicaciones_laborales (id bigint PRIMARY KEY, contrato_id bigint, nombre_ubicacion text)`,
  personal_asignaciones_laborales: `CREATE TABLE IF NOT EXISTS personal_asignaciones_laborales (id bigint PRIMARY KEY, vinculacion_id bigint, ubicacion_laboral_id bigint, vigencia_desde date, vigencia_hasta date, estado text)`,
  usuarios: `CREATE TABLE IF NOT EXISTS usuarios (id bigint PRIMARY KEY, nombre_completo text)`,
  gestor_personal_asignaciones: `CREATE TABLE IF NOT EXISTS gestor_personal_asignaciones (id bigint PRIMARY KEY, vinculacion_id bigint, usuario_id bigint, activo boolean DEFAULT true, vigencia_desde date, vigencia_hasta date)`,
  gestor_municipio_asignaciones: `CREATE TABLE IF NOT EXISTS gestor_municipio_asignaciones (id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, usuario_id bigint, activo boolean DEFAULT true, vigencia_desde date, vigencia_hasta date)`,
  nomina_empleados: `CREATE TABLE IF NOT EXISTS nomina_empleados (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, periodo_id bigint, vinculacion_id bigint, metodo_liquidacion text, categoria_salarial_id bigint, salario_base numeric DEFAULT 0, auxilio_transporte numeric DEFAULT 0, otros_devengos numeric DEFAULT 0, fecha_inicio_pago date, fecha_fin_pago date, dias_periodo numeric DEFAULT 0, dias_pagados numeric DEFAULT 0, horas_trabajadas numeric DEFAULT 0, horas_extra_total numeric DEFAULT 0, devengado_basico numeric DEFAULT 0, devengado_transporte numeric DEFAULT 0, devengado_otros numeric DEFAULT 0, total_adiciones numeric DEFAULT 0, total_deducciones numeric DEFAULT 0, salud numeric DEFAULT 0, pension numeric DEFAULT 0, neto_pagar numeric DEFAULT 0, revisado boolean DEFAULT false, estado text DEFAULT 'PENDIENTE', activo boolean DEFAULT true, motivo_caso_especial text, detalle_calculo jsonb)`,
  nomina_liquidaciones: `CREATE TABLE IF NOT EXISTS nomina_liquidaciones (id bigint PRIMARY KEY, vinculacion_id bigint, periodo_id bigint, estado text DEFAULT 'GENERADA', activo boolean DEFAULT true, requiere_recalculo boolean NOT NULL DEFAULT false, total_liquidacion numeric DEFAULT 0)`,
  nomina_contextos_operativos_base: `CREATE TABLE IF NOT EXISTS nomina_contextos_operativos_base (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, periodo_id bigint, nomina_empleado_id bigint, vinculacion_id bigint, contexto jsonb, fuente text, created_by bigint, UNIQUE(periodo_id, nomina_empleado_id))`,
  nomina_asistencia_diaria: `CREATE TABLE IF NOT EXISTS nomina_asistencia_diaria (id bigint PRIMARY KEY, periodo_id bigint, vinculacion_id bigint, fecha date, payload jsonb)`,
  nomina_novedades: `CREATE TABLE IF NOT EXISTS nomina_novedades (id bigint PRIMARY KEY, nomina_empleado_id bigint, periodo_id bigint, payload jsonb)`,
  nomina_novedad_turnos: `CREATE TABLE IF NOT EXISTS nomina_novedad_turnos (id bigint PRIMARY KEY, nomina_empleado_id bigint, periodo_id bigint, payload jsonb)`,
  auditoria_eventos: `CREATE TABLE IF NOT EXISTS auditoria_eventos (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, empresa_id bigint, contrato_id bigint, modulo text, entidad text, entidad_id text, accion text, descripcion text, datos_anteriores jsonb, datos_nuevos jsonb)`
};

const q = async (client: Client, sql: string, params: unknown[] = []) => client.query(sql, params);
const snapshot = async (client: Client, table: string, minId: number) => {
  const result = await q(client, `SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(md5(to_jsonb(x)::text), '' ORDER BY to_jsonb(x)::text), '')) AS hash FROM (SELECT * FROM ${table} WHERE id >= $1) x`, [minId]);
  return { count: Number(result.rows[0].count), hash: result.rows[0].hash as string };
};
const print = (label: string, value: unknown) => console.log(`${label}: ${JSON.stringify(value)}`);

async function main() {
  const client = new Client({ connectionString: localUrl });
  await client.connect();
  const existed = new Map<string, boolean>();
  const addedBaseColumns: string[] = [];
  try {
    console.log('fixture: setup');
    for (const table of syntheticTables) {
      const result = await q(client, `SELECT to_regclass($1)::text AS name`, [`public.${table}`]);
      existed.set(table, Boolean(result.rows[0]?.name));
      if (!existed.get(table)) await q(client, ddl[table]!);
    }
    for (const column of ['metodo_pago', 'cargo_operativo_id']) {
      const columnResult = await q(client, `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vinculaciones' AND column_name=$1`, [column]);
      if (!columnResult.rowCount) { await q(client, `ALTER TABLE vinculaciones ADD COLUMN ${column} ${column === 'metodo_pago' ? 'text' : 'bigint'}`); addedBaseColumns.push(column); }
    }
    console.log('fixture: cleanup prior');
    await q(client, `DELETE FROM integracion_evento_impactos WHERE evento_id IN (SELECT id FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%')`);
    await q(client, `DELETE FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%'`);
    await q(client, `DELETE FROM vinculaciones WHERE id IN ($1,$2,$3)`, [ids.vincA, ids.vincB, ids.vincC]);
    await q(client, `DELETE FROM personas WHERE id IN ($1,$2,$3)`, [ids.personA, ids.personB, ids.personC]);
    await q(client, `DELETE FROM contratos WHERE id IN ($1,$2)`, [ids.contractA, ids.contractB]);
    await q(client, `DELETE FROM empresas WHERE id IN ($1,$2)`, [ids.companyA, ids.companyB]);
    for (const table of syntheticTables) await q(client, `DELETE FROM ${table} WHERE id >= 900000`);
    await q(client, `DELETE FROM nomina_empleados WHERE vinculacion_id IN ($1,$2,$3) OR periodo_id IN ($4,$5,$6)`, [ids.vincA, ids.vincB, ids.vincC, ids.openA, ids.closedA, ids.openB]);
    await q(client, `DELETE FROM nomina_liquidaciones WHERE vinculacion_id IN ($1,$2,$3) OR periodo_id IN ($4,$5,$6)`, [ids.vincA, ids.vincB, ids.vincC, ids.openA, ids.closedA, ids.openB]);
    await q(client, `DELETE FROM nomina_contextos_operativos_base WHERE vinculacion_id IN ($1,$2,$3) OR periodo_id IN ($4,$5,$6)`, [ids.vincA, ids.vincB, ids.vincC, ids.openA, ids.closedA, ids.openB]);
    console.log('fixture: seed');
    await q(client, fs.readFileSync(path.join(root, 'sql/phase-53-integracion-sync-selectiva.sql'), 'utf8'));
    await q(client, `INSERT INTO empresas(id,nombre_empresa) VALUES ($1,'Empresa Sintética A'),($2,'Empresa Sintética B') ON CONFLICT DO NOTHING`, [ids.companyA, ids.companyB]);
    await q(client, `INSERT INTO contratos(id,empresa_id) VALUES ($1,$3),($2,$4) ON CONFLICT DO NOTHING`, [ids.contractA, ids.contractB, ids.companyA, ids.companyB]);
    await q(client, `INSERT INTO personas(id,primer_nombre,primer_apellido) VALUES ($1,'Ana','Sintética'),($2,'Bruno','Sintético'),($3,'Cata','Sintética') ON CONFLICT DO NOTHING`, [ids.personA, ids.personB, ids.personC]);
    await q(client, `INSERT INTO contrato_cargos(id,nombre_cargo) VALUES ($1,'Cargo Sintético') ON CONFLICT DO NOTHING`, [ids.cargoA]);
    await q(client, `INSERT INTO vinculaciones(id,persona_id,contrato_id,estado_vinculacion,fecha_inicio,fecha_fin,cotiza_pension,contrato_cargo_id) VALUES ($1,$2,$3,'ACTIVA','2026-09-10',NULL,TRUE,$4),($5,$6,$3,'ACTIVA','2026-09-01',NULL,TRUE,$4),($7,$8,$9,'ACTIVA','2026-09-01',NULL,TRUE,$4) ON CONFLICT DO NOTHING`, [ids.vincA, ids.personA, ids.contractA, ids.cargoA, ids.vincB, ids.personB, ids.vincC, ids.personC, ids.contractB]);
    await q(client, `INSERT INTO nomina_periodos(id,contrato_id,fecha_inicio,fecha_fin,estado) VALUES ($1,$3,'2026-09-01','2026-09-30','ABIERTO'),($2,$3,'2026-09-01','2026-09-30','CERRADO'),($4,$5,'2026-09-01','2026-09-30','ABIERTO') ON CONFLICT DO NOTHING`, [ids.openA, ids.closedA, ids.contractA, ids.openB, ids.contractB]);
    await q(client, `INSERT INTO municipios(id,nombre_municipio) VALUES (985001,'Municipio Sintético') ON CONFLICT DO NOTHING`);
    await q(client, `INSERT INTO focalizacion_final(id,contrato_id,municipio_id,institucion_id,sede_id,modalidad_id,institucion_final,sede_final,modalidad_final,municipio_texto) VALUES (986001,$1,985001,987001,988001,989001,'Institución A','Sede A','Modalidad A','Municipio Sintético'),(986002,$1,985001,987001,988002,989002,'Institución A','Sede B','Modalidad B','Municipio Sintético'),(986003,$2,985001,987001,988003,989003,'Institución B','Sede C','Modalidad C','Municipio Sintético') ON CONFLICT DO NOTHING`, [ids.contractA, ids.contractB]);
    await q(client, `INSERT INTO cobertura_asignaciones(id,contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,modalidad,fecha_inicio,activo) VALUES ($1,$4,985001,986001,$2,'Institución A','Sede A','Modalidad A','2026-09-01',TRUE),($3,$4,985001,986003,$5,'Institución B','Sede C','Modalidad C','2026-09-01',TRUE) ON CONFLICT DO NOTHING`, [ids.assignmentA, ids.vincA, ids.assignmentB, ids.contractA, ids.vincC]);
    await q(client, `INSERT INTO nomina_liquidaciones(id,vinculacion_id,periodo_id,estado,activo,total_liquidacion) VALUES ($1,$2,$3,'GENERADA',TRUE,123),($4,$5,$3,'GENERADA',TRUE,456),($6,$2,$7,'GENERADA',TRUE,789) ON CONFLICT DO NOTHING`, [ids.liqA, ids.vincA, ids.openA, ids.liqB, ids.vincB, ids.liqClosed, ids.closedA]);
    await q(client, `INSERT INTO nomina_empleados(id,periodo_id,vinculacion_id,fecha_inicio_pago,fecha_fin_pago,dias_periodo,dias_pagados,estado,activo) VALUES ($1,$2,$3,'2026-09-01','2026-09-30',30,30,'PENDIENTE',TRUE) ON CONFLICT DO NOTHING`, [ids.employeeClosed, ids.closedA, ids.vincA]);
    await q(client, `INSERT INTO nomina_asistencia_diaria(id,periodo_id,vinculacion_id,fecha,payload) VALUES ($1,$2,$3,'2026-09-05','{"marca":"fija"}'),($4,$2,$3,'2026-09-06','{"marca":"fija"}') ON CONFLICT DO NOTHING`, [ids.attendance, ids.openA, ids.vincA, ids.attendance + 1]);
    await q(client, `INSERT INTO nomina_novedades(id,nomina_empleado_id,periodo_id,payload) VALUES ($1,NULL,$2,'{"novedad":"fija"}') ON CONFLICT DO NOTHING`, [ids.novelty, ids.openA]);
    await q(client, `INSERT INTO nomina_novedad_turnos(id,nomina_empleado_id,periodo_id,payload) VALUES ($1,NULL,$2,'{"turno":"fijo"}') ON CONFLICT DO NOTHING`, [ids.turn, ids.openA]);
    const operationalTables = ['nomina_asistencia_diaria', 'nomina_novedades', 'nomina_novedad_turnos'];
    const collectOperational = async () => { const result: Record<string, unknown> = {}; for (const table of operationalTables) result[table] = await snapshot(client, table, 992000); return result; };
    const beforeOperational = await collectOperational();
    const { processNextIntegracionEvent } = await import('../../modules/integracion/integracion.service.js');
    let eventCounter = 0;
    const event = async (type: string, vinc: number, contract: number, company: number, date: string, key: string, after: Record<string, unknown> = {}) => {
      const result = await q(client, `INSERT INTO integracion_eventos(event_type,aggregate_type,aggregate_id,empresa_id,contrato_id,persona_id,vinculacion_id,effective_date,payload_after,idempotency_key,status) SELECT $1,'vinculacion',$2::text,$3::bigint,$4::bigint,persona_id,$2::bigint,$5::date,$6::jsonb,$7,'PENDIENTE' FROM vinculaciones WHERE id=$2::bigint RETURNING id`, [type, vinc, company, contract, date, JSON.stringify(after), key]);
      assert.equal(result.rowCount, 1); eventCounter += 1; return String(result.rows[0].id);
    };
    const run = async (label: string) => { const result = await processNextIntegracionEvent(`phase53-harness-${label}`); console.log(`worker ${label}: ${result?.status ?? 'none'}${result?.last_error_code ? ` ${result.last_error_code}: ${result.last_error_message}` : ''}`); assert.ok(result); return result; };
    const incomeEvent = await event('VINCULACION_CREADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-10', 'phase53-income');
    await run('income');
    const incomeRow = await q(client, `SELECT fecha_inicio_pago::text,fecha_fin_pago::text FROM nomina_empleados WHERE periodo_id=$1 AND vinculacion_id=$2`, [ids.openA, ids.vincA]);
    assert.deepEqual(incomeRow.rows[0], { fecha_inicio_pago: '2026-09-10', fecha_fin_pago: '2026-09-30' }); print('ingreso intrames before/after', { before: null, after: incomeRow.rows[0], only_vinculation: true });
    await q(client, `UPDATE vinculaciones SET fecha_fin='2026-09-15',estado_vinculacion='RETIRADA' WHERE id=$1`, [ids.vincA]);
    await event('VINCULACION_RETIRADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-15', 'phase53-retirement', { fecha_fin: '2026-09-15' }); await run('retirement');
    const retirementRow = await q(client, `SELECT fecha_inicio_pago::text,fecha_fin_pago::text FROM nomina_empleados WHERE periodo_id=$1 AND vinculacion_id=$2`, [ids.openA, ids.vincA]);
    assert.deepEqual(retirementRow.rows[0], { fecha_inicio_pago: '2026-09-10', fecha_fin_pago: '2026-09-15' }); print('retiro intrames before/after', { before: incomeRow.rows[0], after: retirementRow.rows[0], historical_days_preserved: true });
    await q(client, `UPDATE cobertura_asignaciones SET fecha_fin='2026-09-19' WHERE id=$1`, [ids.assignmentA]);
    await q(client, `INSERT INTO cobertura_asignaciones(id,contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,modalidad,fecha_inicio,activo) VALUES (980003,$1,985001,986002,$2,'Institución A','Sede B','Modalidad B','2026-09-20',TRUE)`, [ids.contractA, ids.vincA]);
    await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-20', 'phase53-assignment-1', { sede: 'Sede B', modalidad: 'Modalidad B' }); await run('assignment-1');
    await q(client, `INSERT INTO cobertura_asignaciones(id,contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,modalidad,fecha_inicio,activo) VALUES (980004,$1,985001,986001,$2,'Institución A','Sede A','Modalidad A','2026-09-22',TRUE)`, [ids.contractA, ids.vincA]);
    await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-22', 'phase53-assignment-2', { sede: 'Sede A', modalidad: 'Modalidad A' }); await run('assignment-2');
    const assignments = await q(client, `SELECT sede,modalidad,fecha_inicio::text,fecha_fin::text FROM cobertura_asignaciones WHERE vinculacion_id=$1 ORDER BY fecha_inicio`, [ids.vincA]); assert.equal(assignments.rows.length, 3); print('sede/modalidad before/after', assignments.rows);
    await event('CONDICION_PENSION_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-23', 'phase53-pension', { cotiza_pension: false }); await run('pension');
    const pensions = await q(client, `SELECT id,requiere_recalculo,estado FROM nomina_liquidaciones ORDER BY id`); assert.equal(pensions.rows.find((row) => Number(row.id) === ids.liqA)?.requiere_recalculo, true); assert.equal(pensions.rows.find((row) => Number(row.id) === ids.liqB)?.requiere_recalculo, false); assert.equal(pensions.rows.find((row) => Number(row.id) === ids.liqClosed)?.requiere_recalculo, false); print('pensión liquidaciones before/after', pensions.rows);
    const repeated = await event('VINCULACION_ACTUALIZADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-23', 'phase53-repeat', {}); await run('repeat-1'); await q(client, `UPDATE integracion_eventos SET status='PENDIENTE',available_at=NOW() WHERE id=$1`, [repeated]); await run('repeat-2'); const repeatImpact = await q(client, `SELECT estado FROM integracion_evento_impactos WHERE evento_id=$1 AND periodo_id=$2`, [repeated, ids.openA]); assert.equal(repeatImpact.rows[0].estado, 'SIN_CAMBIOS'); print('evento repetido', repeatImpact.rows[0]);
    const closedBefore = await q(client, `SELECT requiere_recalculo,estado,total_liquidacion FROM nomina_liquidaciones WHERE id=$1`, [ids.liqClosed]); const closedEvent = await event('CONDICION_PENSION_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-24', 'phase53-closed', { cotiza_pension: true }); await run('closed'); const closedAfter = await q(client, `SELECT requiere_recalculo,estado,total_liquidacion FROM nomina_liquidaciones WHERE id=$1`, [ids.liqClosed]); assert.deepEqual(closedAfter.rows, closedBefore.rows); print('periodo cerrado before/after', { event: closedEvent, before: closedBefore.rows[0], after: closedAfter.rows[0] });
    const fast1 = await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-25', 'phase53-fast-1', { sede: 'Sede B' }); const fast2 = await event('ASIGNACION_OPERATIVA_CAMBIADA', ids.vincA, ids.contractA, ids.companyA, '2026-09-26', 'phase53-fast-2', { sede: 'Sede A' }); await run('fast-1'); await run('fast-2'); const versions = await q(client, `SELECT evento_id,version_esperada,estado FROM integracion_evento_impactos WHERE evento_id IN ($1,$2) AND periodo_id=$3 ORDER BY evento_id::bigint`, [fast1, fast2, ids.openA]); assert.ok(Number(versions.rows[0].evento_id) < Number(versions.rows[1].evento_id)); assert.equal(Number(versions.rows[0].version_esperada), Number(versions.rows[0].evento_id)); assert.equal(Number(versions.rows[1].version_esperada), Number(versions.rows[1].evento_id)); print('dos cambios rápidos', versions.rows);
    await q(client, `CREATE OR REPLACE FUNCTION phase53_fail_employee() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.vinculacion_id=960002 THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$`);
    await q(client, `DROP TRIGGER IF EXISTS phase53_fail_employee_trigger ON nomina_empleados`);
    await q(client, `CREATE TRIGGER phase53_fail_employee_trigger BEFORE INSERT OR UPDATE ON nomina_empleados FOR EACH ROW EXECUTE FUNCTION phase53_fail_employee()`);
    const rollbackEvent = await event('VINCULACION_ACTUALIZADA', ids.vincB, ids.contractA, ids.companyA, '2026-09-27', 'phase53-rollback', {}); await run('rollback'); const rollbackStatus = await q(client, `SELECT status FROM integracion_eventos WHERE id=$1`, [rollbackEvent]); assert.equal(rollbackStatus.rows[0].status, 'ERROR'); print('rollback por error', rollbackStatus.rows[0]); await q(client, `DROP TRIGGER phase53_fail_employee_trigger ON nomina_empleados`); await q(client, `DROP FUNCTION phase53_fail_employee()`);
    const isolationEvent = await event('VINCULACION_CREADA', ids.vincC, ids.contractB, ids.companyB, '2026-09-10', 'phase53-isolation', {}); await run('isolation'); const isolation = await q(client, `SELECT COUNT(*)::int AS count FROM nomina_empleados WHERE vinculacion_id=$1 AND periodo_id=$2`, [ids.vincC, ids.openB]); const mainEmployees = await q(client, `SELECT COUNT(*)::int AS count FROM nomina_empleados WHERE vinculacion_id=$1 AND periodo_id=$2`, [ids.vincA, ids.openA]); const isolationImpact = await q(client, `SELECT periodo_id,estado FROM integracion_evento_impactos WHERE evento_id=$1`, [isolationEvent]); print('aislamiento empresa/contrato', { other_scope: isolation.rows[0], main_scope: mainEmployees.rows[0], impact: isolationImpact.rows[0] }); assert.equal(Number(isolation.rows[0].count), 1); assert.equal(Number(mainEmployees.rows[0].count), 1);
    const afterOperational = await collectOperational(); assert.deepEqual(afterOperational, beforeOperational); print('asistencia/novedades/turnos conteos+hashes', { before: beforeOperational, after: afterOperational });
    const financial = await q(client, `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_liquidacion),0)::text AS total FROM nomina_liquidaciones WHERE id IN ($1,$2,$3)`, [ids.liqA, ids.liqB, ids.liqClosed]); assert.equal(financial.rows[0].total, '1368'); print('finanzas sin recálculo', financial.rows[0]);
    console.log(`E2E Phase 2: OK (${eventCounter} eventos sintéticos)`);
  } finally {
    try {
      await q(client, `DELETE FROM integracion_evento_impactos WHERE evento_id IN (SELECT id FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%')`);
      await q(client, `DELETE FROM integracion_eventos WHERE idempotency_key LIKE 'phase53-%'`);
      await q(client, `DROP TRIGGER IF EXISTS phase53_fail_employee_trigger ON nomina_empleados`);
      await q(client, `DROP FUNCTION IF EXISTS phase53_fail_employee()`);
      await q(client, `DELETE FROM vinculaciones WHERE id IN ($1,$2,$3)`, [ids.vincA, ids.vincB, ids.vincC]);
      await q(client, `DELETE FROM personas WHERE id IN ($1,$2,$3)`, [ids.personA, ids.personB, ids.personC]);
      await q(client, `DELETE FROM contratos WHERE id IN ($1,$2)`, [ids.contractA, ids.contractB]);
      await q(client, `DELETE FROM empresas WHERE id IN ($1,$2)`, [ids.companyA, ids.companyB]);
      for (const table of syntheticTables) await q(client, `DELETE FROM ${table} WHERE id >= 900000`);
      await q(client, `DELETE FROM nomina_empleados WHERE vinculacion_id IN ($1,$2,$3) OR periodo_id IN ($4,$5,$6)`, [ids.vincA, ids.vincB, ids.vincC, ids.openA, ids.closedA, ids.openB]);
      await q(client, `DELETE FROM nomina_liquidaciones WHERE vinculacion_id IN ($1,$2,$3) OR periodo_id IN ($4,$5,$6)`, [ids.vincA, ids.vincB, ids.vincC, ids.openA, ids.closedA, ids.openB]);
      await q(client, `DELETE FROM nomina_contextos_operativos_base WHERE vinculacion_id IN ($1,$2,$3) OR periodo_id IN ($4,$5,$6)`, [ids.vincA, ids.vincB, ids.vincC, ids.openA, ids.closedA, ids.openB]);
      for (const column of addedBaseColumns) await q(client, `ALTER TABLE vinculaciones DROP COLUMN IF EXISTS ${column}`);
      await q(client, `DELETE FROM nomina_contextos_operativos_base WHERE vinculacion_id >= 960000`);
      for (const table of ['nomina_asistencia_diaria','nomina_novedades','nomina_novedad_turnos','nomina_liquidaciones','nomina_empleados','cobertura_asignaciones','focalizacion_final','nomina_periodos','vinculaciones','personas','contratos','empresas']) { if (table === 'nomina_empleados' && !existed.get(table)) await q(client, `DROP TABLE IF EXISTS ${table}`); else if (existed.get(table) === false && syntheticTables.includes(table)) await q(client, `DROP TABLE IF EXISTS ${table}`); else if (existed.get(table) !== false) { /* rows are fixture-scoped and base tables are preserved */ } }
      for (const table of syntheticTables.slice().reverse()) if (existed.get(table) === false) await q(client, `DROP TABLE IF EXISTS ${table}`);
    } finally { await client.end(); try { const { dbPool } = await import('../../config/db.js'); await dbPool.end(); } catch { /* pool may not have initialized */ } }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
