import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import baseline from '../modules/cobertura/phase48-constant-sql-baseline.json';
import {certifyConstantExecute,certifyConstantSqlContext} from '../modules/cobertura/phase48-constant-sql';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {scopedFixture} from './fixtures/phase48-scoped-fixture';
import {createScopedLocalAuthority} from '../modules/cobertura/phase48-scoped-contract';
import {preflightScopedLocal,executeScopedLocal} from '../modules/cobertura/phase48-scoped-local';
test('exact certified function/template is the only constant EXECUTE exception',()=>{
 assert.equal(certifyConstantExecute(baseline.identity,baseline.definition)?.classification,'CONSTANT_PARAMETERIZED_READ');
 assert.throws(()=>certifyConstantExecute('other()',baseline.definition),/DYNAMIC_CRITICAL_DEFINITION_UNCERTIFIED/);
});
for(const [label,fragment] of [
 ['concat',"EXECUTE 'SELECT familia_movimiento FROM '||v_table||' WHERE id=$1' INTO v_family USING v_record;"],
 ['format',"EXECUTE format('SELECT familia_movimiento FROM %I WHERE id=$1',v_table) INTO v_family USING v_record;"],
 ['table','EXECUTE v_table INTO v_family USING v_record;'],
 ['column',"EXECUTE 'SELECT x FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record;"],
 ['where',"EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id<>$1' INTO v_family USING v_record;"],
 ['interpolation',"EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id='||v_record INTO v_family;"],
 ['no USING',"EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1' INTO v_family;"],
 ['extra parameter',"EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record,v_record;"],
 ['second statement',"EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1; DELETE FROM nomina_movimientos' INTO v_family USING v_record;"],
 ['DDL',"EXECUTE 'DROP TABLE nomina_movimientos' INTO v_family USING v_record;"],
 ['DML',"EXECUTE 'DELETE FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record;"],
 ['CALL',"EXECUTE 'CALL public.bad($1)' INTO v_family USING v_record;"],
 ['DO',"EXECUTE 'DO $$BEGIN END$$' INTO v_family USING v_record;"],
 ['COPY',"EXECUTE 'COPY nomina_movimientos TO PROGRAM bad' INTO v_family USING v_record;"],
 ['volatile function',"EXECUTE 'SELECT pg_notify($1, familia_movimiento) FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record;"],
 ['hidden comment',"EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1 -- hidden' INTO v_family USING v_record;"],
] as const)test('closed allowlist rejects '+label,()=>{
 const def=baseline.definition.replace("EXECUTE 'SELECT familia_movimiento FROM nomina_movimientos WHERE id=$1' INTO v_family USING v_record;",fragment);
 assert.throws(()=>certifyConstantExecute(baseline.identity,def),/CONSTANT_SQL_/);
});
test('even a comment-only change of the complete function hash is rejected',()=>{assert.throws(()=>certifyConstantExecute(baseline.identity,baseline.definition.replace('DECLARE','-- changed\nDECLARE')),/CONSTANT_SQL_FUNCTION_HASH_DRIFT/);});
test('removing EXECUTE does not silently remove the required function pin',()=>{assert.throws(()=>certifyConstantExecute(baseline.identity,'CREATE FUNCTION public.nomina_invalidar_revision_operativa() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$'),/CONSTANT_SQL_TEMPLATE_UNCERTIFIED/);});
async function sql(s:string){const c=localClient();await c.connect();try{return await c.query(s);}finally{await c.end();}}
test('path ambiguity rejected; explicit public-before-pg_temp prevents temporary table hijack',async()=>{
 await scopedFixture();const c=localClient();await c.connect();try{
  await c.query('CREATE TEMP TABLE nomina_movimientos(id bigint,familia_movimiento text)');
  await certifyConstantSqlContext(c);
  await c.query('SET search_path=public');await assert.rejects(certifyConstantSqlContext(c),/CONSTANT_SQL_SEARCH_PATH_UNSAFE/);
 }finally{await c.end();}
});
test('parameterized SELECT existing, missing and NULL IDs; trigger invalidation COMMIT/ROLLBACK and economic preservation',async()=>{
 await scopedFixture();const c=localClient();await c.connect();const observations:any={};
 try{
  await c.query("INSERT INTO personas(id) VALUES(999);UPDATE vinculaciones SET persona_id=999 WHERE id=1605;");
  const economic=(await c.query('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id')).rows;
  observations.sequence_before=(await c.query('SELECT last_value::text,is_called FROM nomina_revision_operativa_id_seq')).rows[0];
  await c.query('BEGIN');await c.query("INSERT INTO nomina_movimientos(id,periodo_id,nomina_empleado_id,familia_movimiento) VALUES(99901,5,2376,'CAMBIO_OPERATIVO')");
  observations.insert=(await c.query('SELECT estado_revision,motivo_invalidacion,version_revision FROM nomina_revision_operativa')).rows;
  assert.equal(observations.insert.length,1);assert.equal(observations.insert[0].motivo_invalidacion,'CAMBIO_OPERATIVO_MODIFICADO');
  for(const id of [99901,99902,null]){const rows=(await c.query(baseline.sql,[id])).rows;assert.equal(rows.length,id===99901?1:0);}
  await c.query('ROLLBACK');assert.equal((await c.query('SELECT count(*)::int n FROM nomina_revision_operativa')).rows[0].n,0);
  observations.sequence_after_rollback=(await c.query('SELECT last_value::text,is_called FROM nomina_revision_operativa_id_seq')).rows[0];assert.equal(observations.sequence_before.is_called,false);assert.equal(observations.sequence_after_rollback.is_called,true);
  await c.query("INSERT INTO nomina_movimientos(id,periodo_id,nomina_empleado_id,familia_movimiento) VALUES(99901,5,2376,'CAMBIO_OPERATIVO')");
  await c.query('UPDATE nomina_movimientos SET familia_movimiento=familia_movimiento WHERE id=99901');
  assert.equal((await c.query('SELECT version_revision FROM nomina_revision_operativa')).rows[0].version_revision,2);
  await c.query('DELETE FROM nomina_movimientos WHERE id=99901');assert.equal((await c.query('SELECT version_revision FROM nomina_revision_operativa')).rows[0].version_revision,3);
  assert.deepEqual((await c.query('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id')).rows,economic);
  observations.same_update_idempotent=false;observations.reason='Each invocation increments version_revision; deletion still invalidates with TA_MODIFICADO';observations.economics_unchanged=true;observations.rollback_rows_restored=true;observations.sequence_note='nextval from INSERT defaults is nontransactional; standalone invalidation can advance its sequence even on conflict or rollback';
 }finally{await c.end();}
 writeFileSync('tmp/phase48-pooler-local/constant-sql-local-observations.json',JSON.stringify(observations,null,2)+'\n');
});
test('actual Phase48 does not activate invalidation triggers, preserves revision table and economic rows, rollback exact',async()=>{
 await scopedFixture();const c=localClient();await c.connect();try{await c.query("INSERT INTO personas(id) VALUES(999);UPDATE vinculaciones SET persona_id=999 WHERE id=1605;");}finally{await c.end();}
 const authority=createScopedLocalAuthority(),target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')},pre=await preflightScopedLocal(authority,target,{readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40)});
 const before=(await sql('SELECT to_jsonb(t) row FROM nomina_revision_operativa t')).rows;
 const sequenceBefore=(await sql('SELECT last_value::text,is_called FROM nomina_revision_operativa_id_seq')).rows;
 const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true});assert.equal(result.status,'LOCAL_ROLLED_BACK');assert.deepEqual((await sql('SELECT to_jsonb(t) row FROM nomina_revision_operativa t')).rows,before);
 assert.deepEqual((await sql('SELECT last_value::text,is_called FROM nomina_revision_operativa_id_seq')).rows,sequenceBefore);
});
