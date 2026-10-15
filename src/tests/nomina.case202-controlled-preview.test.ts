import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';
import observed from './fixtures/nomina-202-sanitized-readonly.json';
import { previewCase202, simulateCase202, previewCli, FUTURE_AUTHORIZATION } from '../scripts/nomina-turno-202-controlled-preview';

const request=()=>({turnoId:202,movimientoId:192,actorUserId:'9001',runId:randomUUID()});

async function fixture(mode:'observed'|'synthetic-eligible'='synthetic-eligible') {
  const db=new PGlite();
  await db.exec(`
    CREATE TABLE usuarios(id bigint PRIMARY KEY);
    INSERT INTO usuarios VALUES(9001);
    CREATE TABLE contratos(id bigint PRIMARY KEY,empresa_id bigint);
    INSERT INTO contratos VALUES(24,15);
    CREATE TABLE modalidades(id bigint PRIMARY KEY,codigo_base text);
    INSERT INTO modalidades VALUES(1,'CAA');
    CREATE TABLE vinculaciones(id bigint PRIMARY KEY,persona_id bigint,contrato_id bigint);
    INSERT INTO vinculaciones VALUES(847,668,24);
    CREATE TABLE nomina_periodos(id bigint PRIMARY KEY,contrato_id bigint,estado text);
    INSERT INTO nomina_periodos VALUES(3,24,'ABIERTO');
    CREATE TABLE nomina_empleados(id bigint PRIMARY KEY,periodo_id bigint,vinculacion_id bigint,
      estado text,revisado boolean,salud numeric(14,2),pension numeric(14,2),neto_pagar numeric(14,2));
    INSERT INTO nomina_empleados VALUES(837,3,847,'REVISADO',true,40000,40000,1000000);
    CREATE TABLE nomina_revision_operativa(periodo_id bigint,nomina_empleado_id bigint,persona_id bigint,
      vinculacion_id bigint,estado_revision text,version_revision integer DEFAULT 0,revisado_por bigint,revisado_at timestamptz,
      invalidado_at timestamptz,motivo_invalidacion text,updated_at timestamptz,UNIQUE(periodo_id,nomina_empleado_id));
    INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,version_revision)
      VALUES(3,837,668,847,'REVISADO',30);
    CREATE TABLE nomina_movimiento_tarifas(id bigint PRIMARY KEY,contrato_id bigint,modalidad_id bigint,
      tipo_movimiento text,valor_unitario numeric(14,2),activo boolean,vigencia_desde date,vigencia_hasta date);
    CREATE TABLE nomina_novedades(id bigint PRIMARY KEY,periodo_id bigint,fecha_inicio date,fecha_fin date,dias numeric(10,2),activo boolean);
    CREATE TABLE nomina_novedad_turnos(id bigint PRIMARY KEY,movimiento_id bigint,nomina_novedad_id bigint,
      periodo_id bigint,nomina_empleado_id bigint,vinculacion_id bigint,tipo_turno text,activo boolean,externo_id bigint);
    CREATE TABLE nomina_movimientos(id bigint PRIMARY KEY,periodo_id bigint,nomina_empleado_id bigint,vinculacion_id bigint,
      externo_id bigint,tipo_movimiento text,fecha date,cantidad numeric(14,2),valor_unitario numeric(14,2),
      valor_calculado numeric(14,2),valor_total numeric(14,2),estado text,afecta_seguridad_social boolean,
      es_devengado boolean,es_deduccion boolean,activo boolean,tarifa_config_id bigint,modalidad_id bigint,familia_movimiento text);
    CREATE TABLE cobertura_cuentas_cobro_externas(id bigint PRIMARY KEY,empresa_id bigint,contrato_id bigint,
      periodo_id bigint,externo_id bigint,estado text,activo boolean,valor_total numeric(14,2),generado_path text,firmado_path text);
    CREATE TABLE cobertura_cuenta_cobro_externa_detalle(id bigint PRIMARY KEY,cuenta_id bigint,movimiento_id bigint,
      turno_id bigint,valor numeric(14,2),activo boolean);
    CREATE TABLE nomina_liquidaciones(id bigint,periodo_id bigint,vinculacion_id bigint,estado text,activo boolean);
    CREATE TABLE nomina_liquidaciones_finales(id bigint,vinculacion_id bigint,estado text,activo boolean);
    CREATE TABLE nomina_desprendibles(id bigint,periodo_id bigint,nomina_empleado_id bigint,vinculacion_id bigint,estado text,activo boolean);
    CREATE TABLE nomina_pagos_pendientes(id bigint,periodo_origen_id bigint,periodo_pago_id bigint,nomina_empleado_id bigint,vinculacion_id bigint,estado text,activo boolean);
    CREATE TABLE nomina_cuentas_cobro_turnos(id bigint,periodo_id bigint,vinculacion_id bigint,estado text,activo boolean);
    CREATE TABLE nomina_exportes(id bigint,periodo_id bigint,tipo_exporte text,activo boolean);
    CREATE TABLE nomina_correcciones(id bigint,movimiento_id bigint);
    CREATE TABLE auditoria_eventos(id bigserial PRIMARY KEY,usuario_id bigint REFERENCES usuarios(id),empresa_id bigint,contrato_id bigint,
      modulo text,entidad text,entidad_id text,accion text,descripcion text,datos_anteriores jsonb,datos_nuevos jsonb);
    CREATE TABLE auditoria(id bigserial PRIMARY KEY,usuario_id bigint REFERENCES usuarios(id),accion text,tabla_afectada text,
      registro_id bigint,descripcion text,datos_anteriores jsonb,datos_nuevos jsonb);
  `);
  const row=observed.record;
  await db.query(`INSERT INTO nomina_movimiento_tarifas VALUES(1,24,1,'TURNO_EXTERNO',$1,true,$2::date,$3::date)`,[row.tarifa_unitaria,row.vigencia_desde,row.vigencia_hasta]);
  await db.query('INSERT INTO nomina_novedades VALUES(929,3,$1::date,$2::date,2,true)',[row.fecha_inicio,row.fecha_fin]);
  await db.exec("INSERT INTO nomina_novedad_turnos VALUES(202,192,929,3,837,847,'EXTERNO',true,33)");
  await db.query(`INSERT INTO nomina_movimientos VALUES(192,3,837,847,33,'TURNO_EXTERNO',$1::date,$2,$3,$4,$5,'PENDIENTE',false,true,false,true,1,1,'ADICION_DEVENGO')`,
    [row.fecha,row.cantidad,row.valor_unitario,row.valor_calculado,row.valor_total]);
  // Protected synthetic internal row: no real employee financial totals are exported.
  await db.exec(`INSERT INTO nomina_movimientos VALUES(901,3,900,900,NULL,'TURNO_INTERNO','2026-09-07',1,34740,34740,34740,'APROBADO',false,true,false,true,901,1,'ADICION_DEVENGO')`);
  if(mode==='observed') {
    await db.exec(`INSERT INTO cobertura_cuentas_cobro_externas VALUES(77,15,24,3,33,'PENDIENTE',true,97800,'fixture-generated.pdf',NULL);
      INSERT INTO cobertura_cuenta_cobro_externa_detalle VALUES(220,77,192,202,97800,true);`);
    for(const trigger of observed.triggers) {
      await db.exec(trigger.function_definition);
      await db.exec(trigger.definition);
    }
  }
  return db;
}

async function state(db:PGlite) {
  const tables=(await db.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  return Object.fromEntries(await Promise.all(tables.map(async({tablename})=>[tablename,(await db.query(`SELECT * FROM ${tablename} ORDER BY 1`)).rows])));
}

test('synthetic eligible: exact 1 -> 2 and 97800 -> 195600; only movement and strict audits change',async()=>{
  const db=await fixture();try{
    const before=await state(db);const req=request();
    const result=await simulateCase202(db,req);
    assert.equal(result.status,'APPLIED_LOCAL_ONLY');
    const after=await state(db);
    const changed=Object.keys(before).filter(table=>JSON.stringify(before[table])!==JSON.stringify(after[table]));
    assert.deepEqual(changed.sort(),['auditoria','auditoria_eventos','nomina_movimientos']);
    const movement=(after.nomina_movimientos as any[]).find(r=>r.id===192);
    assert.equal(Number(movement.cantidad),2);assert.equal(Number(movement.valor_total),195600);
    assert.equal(Number(movement.valor_calculado),195600);assert.equal(Number(movement.valor_unitario),97800);
    assert.equal(movement.estado,'PENDIENTE');assert.equal(movement.afecta_seguridad_social,false);
    assert.equal(after.nomina_movimientos!.length,2);assert.equal(after.nomina_novedad_turnos!.length,1);
    for(const table of ['auditoria','auditoria_eventos']) {
      assert.equal(after[table]!.length,1);
      const audit=after[table]![0] as any;
      assert.equal(audit.datos_anteriores.cantidad,1);assert.equal(audit.datos_nuevos.cantidad,2);
      assert.equal(audit.datos_nuevos.run_id,req.runId);
    }
    const internal=(after.nomina_movimientos as any[]).find(r=>r.id===901);
    assert.deepEqual(internal,(before.nomina_movimientos as any[]).find(r=>r.id===901));
    assert.equal(Number(internal.valor_unitario),34740);assert.equal(internal.afecta_seguridad_social,false);
    assert.deepEqual(after.nomina_empleados,before.nomina_empleados);
  }finally{await db.close();}
});

test('second execution: ALREADY_APPLIED, zero changes and zero additional audits, even with a new run_id',async()=>{
  const db=await fixture();try{
    const first=request();await simulateCase202(db,first);const before=await state(db);
    assert.deepEqual(await simulateCase202(db,request()),{status:'ALREADY_APPLIED',run_id:first.runId,changed_rows:0,audits_added:0});
    assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

test('failure in the second strict audit insert rolls back the movement and first audit completely',async()=>{
  const db=await fixture();try{
    await db.exec('ALTER TABLE auditoria ADD CONSTRAINT injected_failure CHECK (registro_id<>192)');
    const before=await state(db);
    await assert.rejects(simulateCase202(db,request()));
    assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

test('an incomplete strict audit pair is rejected rather than accepted as idempotent',async()=>{
  const db=await fixture();try{
    await simulateCase202(db,request());await db.exec('DELETE FROM auditoria');
    const before=await state(db);
    await assert.rejects(simulateCase202(db,request()),/STRICT_AUDIT_PAIR_MISSING_OR_DUPLICATED/);
    assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

for(const [name,sql] of [
  ['quantity', 'UPDATE nomina_movimientos SET cantidad=3 WHERE id=192'],
  ['unit rate', 'UPDATE nomina_movimientos SET valor_unitario=97801 WHERE id=192'],
  ['social security', 'UPDATE nomina_movimientos SET afecta_seguridad_social=true WHERE id=192'],
  ['status', "UPDATE nomina_movimientos SET estado='APROBADO' WHERE id=192"],
  ['dates', "UPDATE nomina_novedades SET fecha_fin='2026-09-10' WHERE id=929"],
  ['period', "UPDATE nomina_periodos SET estado='CERRADO' WHERE id=3"],
] as const) test(`reject drift: ${name}`,async()=>{
  const db=await fixture();try{
    await db.exec(sql);const before=await state(db);
    await assert.rejects(simulateCase202(db,request()),/CASE_202_DRIFT/);
    assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

test('reject equivalent movement; do not duplicate or correct any record',async()=>{
  const db=await fixture();try{
    await db.exec('INSERT INTO nomina_movimientos SELECT 193,periodo_id,nomina_empleado_id,vinculacion_id,externo_id,tipo_movimiento,fecha,cantidad,valor_unitario,valor_calculado,valor_total,estado,afecta_seguridad_social,es_devengado,es_deduccion,activo,tarifa_config_id,modalidad_id,familia_movimiento FROM nomina_movimientos WHERE id=192');
    const before=await state(db);await assert.rejects(simulateCase202(db,request()),/EQUIVALENT_MOVEMENT_EXISTS/);
    assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

test('observed fixture: PreviewOnly blocks the existing generated account and operational-revision trigger without writes',async()=>{
  const db=await fixture('observed');try{
    const before=await state(db);
    const preview=await previewCase202(db as unknown as Pick<PoolClient,'query'>,request());
    assert.equal(preview.decision,'BLOCKED');
    assert.ok(preview.safety.blockers.includes('EXISTING_ACCOUNT_DOCUMENT'));
    assert.ok(preview.safety.blockers.includes('ENABLED_TRIGGER_REQUIRES_WRITE_SET_REVIEW'));
    assert.equal(preview.after.valor_total,195600);assert.equal(preview.before.valor_total,97800);
    assert.deepEqual(await state(db),before);
    await assert.rejects(simulateCase202(db,request()),/CASE_202_BLOCKED/);
    assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

test('observed trigger probe: a plain movement update would write revision state REVISADO v30 -> REQUIERE_REVISION v31; rollback restores both',async()=>{
  const db=await fixture('observed');try{
    const before=await state(db);await db.exec('BEGIN');
    await db.exec('UPDATE nomina_movimientos SET cantidad=2,valor_calculado=195600,valor_total=195600 WHERE id=192');
    const revision=(await db.query<any>('SELECT estado_revision,version_revision FROM nomina_revision_operativa')).rows[0];
    assert.equal(revision.estado_revision,'REQUIERE_REVISION');assert.equal(revision.version_revision,31);
    const movement=(await db.query<any>('SELECT cantidad FROM nomina_movimientos WHERE id=192')).rows[0];assert.equal(Number(movement.cantidad),2);
    await db.exec('ROLLBACK');assert.deepEqual(await state(db),before);
  }finally{await db.close();}
});

test('wrong IDs and non-local executor are rejected before any transaction or connection',async()=>{
  let queries=0;const fake={query:async()=>{queries++;throw new Error('must not connect');}};
  for(const ids of [{turnoId:203,movimientoId:192},{turnoId:202,movimientoId:193}]) {
    await assert.rejects(previewCase202(fake as never,ids),/CASE_202_IDS_ONLY/);
    await assert.rejects(simulateCase202(fake as never,{...request(),...ids}),/CASE_202_IDS_ONLY/);
  }
  await assert.rejects(simulateCase202(fake as never,request()),/LOCAL_PGLITE_ONLY_PRODUCTION_DISABLED/);
  assert.equal(queries,0);
  await assert.rejects(previewCli(['--mode','ApplyProduction']),/ONLY_PREVIEW_ONLY_CLI/);
  assert.match(FUTURE_AUTHORIZATION,/^REVOCADA\/NO UTILIZABLE/);
});
