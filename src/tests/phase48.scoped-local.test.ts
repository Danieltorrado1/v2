import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {claimScopedLocalNonce} from '../modules/cobertura/phase48-readonly-receipts';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {createScopedLocalAuthority,SCOPED_DIGESTS,scopedDigest,SALARY_DECISION} from '../modules/cobertura/phase48-scoped-contract';
import {preflightScopedLocal,publishScopedPreflight,executeScopedLocal,rollbackScopedPublishedLocal} from '../modules/cobertura/phase48-scoped-local';
import {scopedCapture,tableHashes} from '../modules/cobertura/phase48-scoped-repository';
import {scopedFixture} from './fixtures/phase48-scoped-fixture';
const target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')};
const release={readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40)};
async function sql(text:string,values?:any[]){const db=localClient();await db.connect();try{return await db.query(text,values);}finally{await db.end();}}
async function setup(n=733){await scopedFixture(n);const authority=createScopedLocalAuthority();const pre=await preflightScopedLocal(authority,target,release);return {authority,pre};}
test('dynamic 730, 733, 734: exact rollback, protected salaries, Albeny/Dary and independent reads',async()=>{
 for(const n of [730,733,734]){
  const {authority,pre}=await setup(n);assert.equal(pre.seal.set.candidate_count,n);assert.equal(pre.connections.length,2);assert(pre.connections.every(r=>r.read_only==='on'&&r.rollback==='CONFIRMED'));
  const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true});assert.equal(result.status,'LOCAL_ROLLED_BACK');assert.equal(result.economic_authorization,false);
  if(n>=733){assert.deepEqual(pre.requires_salary_review,['1277','1279']);assert(pre.preview.filter(r=>['1277','1278','1279'].includes(r.id)).every(r=>r.id==='1278'?!r.requires_salary_review:r.requires_salary_review));}
  assert(!pre.manifest.tables.includes('ajena'));assert(!pre.manifest.sequences.includes('ajena_seq'));assert(!pre.manifest.functions.includes('ajena_fn()'));
  if(n===733){writeFileSync('tmp/phase48-pooler-local/scoped-example.json',JSON.stringify({candidate_count:n,digests:pre.seal.set,manifest:pre.manifest,preview:pre.preview,connections:pre.connections},null,2)+'\n');}
 }
});
test('commit strictly audits review decision, preserves category 35 and all economic rows; idempotent and exact run reversal',async()=>{
 const {authority,pre}=await setup();const before=await sql('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id');
 const result=await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true,receipt_directory:'tmp/phase48-pooler-local/scoped-receipts'});assert.equal(result.status,'LOCAL_COMMITTED');
 assert.deepEqual((await sql('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id')).rows,before.rows);
 assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);assert.equal((await sql('SELECT count(*)::int n FROM auditoria_eventos')).rows[0].n,4);
 const receipt=JSON.parse(readFileSync('tmp/phase48-pooler-local/scoped-receipts/'+pre.seal.run_id+'.receipt.json','utf8'));assert.equal(receipt.economic_authorization,false);assert.deepEqual(receipt.requires_salary_review,['1277','1279']);
 assert.equal((await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true})).status,'ALREADY_APPLIED');
 await sql("UPDATE ajena SET state='NEW_ACTIVITY'");await sql("SELECT nextval('ajena_seq')");
 assert.equal((await rollbackScopedPublishedLocal(authority,pre.seal,target,{definitions_window_confirmed:true})).status,'LOCAL_REVERSED');
 assert.equal((await sql('SELECT state FROM ajena')).rows[0].state,'NEW_ACTIVITY');assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,5);
 assert.deepEqual((await sql('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id')).rows,before.rows);
});
test('foreign table, DML, function and sequence are informational only during critical locks',async()=>{
 const {authority,pre}=await setup();const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterLock:async()=>{
  await sql("CREATE TABLE public.new_independent(id bigint);INSERT INTO public.new_independent VALUES(1);UPDATE ajena SET state='CHANGED';SELECT nextval('ajena_seq');CREATE OR REPLACE FUNCTION ajena_fn() RETURNS integer LANGUAGE SQL AS $$SELECT 2$$");
 }}});assert.equal(result.status,'LOCAL_ROLLED_BACK');
 const db=localClient();await db.connect();try{const fresh=await scopedCapture(db);assert.deepEqual(fresh.set,pre.seal.set);assert.notEqual(fresh.informational_global_digest,pre.informational.global_digest);}finally{await db.end();}
});
for(const [name,statement,error] of [
 ['same count different row',"UPDATE cobertura_asignaciones SET observacion='DRIFT' WHERE id=1277",'SCOPED_DRIFT'],
 ['candidate disappearance','DELETE FROM cobertura_asignaciones WHERE id=1279','SCOPED_DRIFT'],
 ['changed ID','UPDATE cobertura_asignaciones SET id=1288 WHERE id=1278','SCOPED_DRIFT'],
 ['category 35 changed','UPDATE nomina_empleados SET categoria_salarial_id=34 WHERE vinculacion_id=1605','SALARY_CATEGORY_CHANGED'],
 ['critical schema','ALTER TABLE focalizacion_final ADD COLUMN drift text','SCOPED_DRIFT'],
 ['critical index','CREATE INDEX drift ON focalizacion_final(id)','SCOPED_DRIFT'],
 ['critical sequence',"SELECT nextval('auditoria_id_seq')",'SCOPED_DRIFT'],
 ['critical function',"CREATE OR REPLACE FUNCTION fn_crear_evento_sst_desde_nomina() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF FALSE THEN RETURN NULL;END IF;RETURN NEW;END$$",'SCOPED_DRIFT'],
 ['period 4 preserved',"UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=4",'PERIODS_4_6_CHANGED'],
 ['Dary beforeimage changed',"UPDATE cobertura_asignaciones SET observacion='DRIFT' WHERE id=11",'SCOPED_DRIFT'],
 ['Albeny attendance lost','DELETE FROM nomina_asistencia_diaria WHERE id=13195','EXPECTED_HISTORICAL_ATTENDANCE_IDS_CHANGED'],
] as const)test('sealed drift | '+name,async()=>{
 const {authority,pre}=await setup();await sql(statement);await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true}),new RegExp(error));
 assert.equal((await sql("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cobertura_asignaciones' AND column_name='institucion_id'")).rows[0].n,0);
});
test('additional assignments before preflight are included; after preflight they are refused',async()=>{
 const {authority,pre}=await setup(735);assert.equal(pre.seal.set.candidate_count,735);assert(pre.seal.set.candidate_ids.includes('1281'));
 await sql("INSERT INTO vinculaciones(id,empresa_id,contrato_id,fecha_inicio) VALUES(1999,15,24,'2026-09-01');INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,activo) VALUES(1299,24,1999,183,1,'2026-09-01',TRUE)");
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true}),/SCOPED_DRIFT/);
});
for(const [operation,statement] of [
 ['INSERT',"INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,activo) VALUES(1299,24,1605,183,1,'2026-12-01',TRUE)"],
 ['UPDATE',"UPDATE cobertura_asignaciones SET observacion='RACE' WHERE id=1277"],
 ['DELETE','DELETE FROM cobertura_asignaciones WHERE id=1279'],
 ['ALTER','ALTER TABLE cobertura_asignaciones ADD COLUMN race integer'],
 ['SALARY',"UPDATE nomina_empleados SET categoria_salarial_id=34 WHERE vinculacion_id=1605"],
 ['nextval',"SELECT nextval('auditoria_id_seq')"],
 ['setval',"SELECT setval('cobertura_asignaciones_id_seq',99999)"],
] as const)test('critical operation blocked after locks | '+operation,async()=>{
 const {authority,pre}=await setup();const writer=localClient();await writer.connect();
 try{await writer.query("SET lock_timeout='100ms';SET statement_timeout='1s'");
  const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterLock:async()=>{await assert.rejects(writer.query(statement),(e:any)=>e.code==='55P03');}}});assert.equal(result.status,'LOCAL_ROLLED_BACK');
 }finally{await writer.end();}
});
test('function replacement exactly after validation aborts before Phase48 DDL',async()=>{
 const {authority,pre}=await setup();await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{beforeDml:async()=>{
  await sql("CREATE OR REPLACE FUNCTION fn_crear_evento_sst_desde_nomina() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF FALSE THEN RETURN NULL;END IF;RETURN NEW;END$$");
 }}}),/CRITICAL_DEFINITION_DRIFT/);
 assert.equal((await sql("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cobertura_asignaciones' AND column_name='institucion_id'")).rows[0].n,0);
});
test('failure during correction or economic tampering rolls back schema, all DML and audits',async()=>{
 const {authority,pre}=await setup();const db=localClient();await db.connect();const before=await scopedCapture(db);await db.end();
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterUpdate:async(db)=>{await db.query('UPDATE nomina_empleados SET salario_base=salario_base+1 WHERE vinculacion_id=1605');}}}),/PROTECTED_DATA_CHANGED/);
 const fresh=localClient();await fresh.connect();try{assert.deepEqual((await scopedCapture(fresh)).set,before.set);}finally{await fresh.end();}
});
test('postcommit reversal refuses divergent critical postimage',async()=>{
 const {authority,pre}=await setup();await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,mode:'Commit'});
 await sql("UPDATE cobertura_asignaciones SET observacion='EXTERNAL' WHERE id=1277");
 await assert.rejects(rollbackScopedPublishedLocal(authority,pre.seal,target,{definitions_window_confirmed:true}),/PUBLISHED_WRITE_SET_DIVERGENCE/);
 assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);
});
test('all digest fields, count, review block, nonce and old phrases are sealed',async()=>{
 const {authority,pre}=await setup();
 for(const field of [...SCOPED_DIGESTS,'salary_decision_digest','albeny_digest','dary_digest','periods_4_6_digest','manifest_digest'] as const){const tampered=structuredClone(pre.seal);tampered.set[field]='a'.repeat(64);assert.throws(()=>authority.authenticate(tampered),/SCOPED_SEAL_INVALID/);}
 const count=structuredClone(pre.seal);count.set.candidate_count--;assert.throws(()=>authority.authenticate(count),/SCOPED_SEAL_INVALID/);
 assert.throws(()=>authority.authenticate({...pre.seal,version:'PHASE48_DYNAMIC_LOCAL_V1'} as any),/LEGACY_OR_ECONOMIC_GRANT_REVOKED/);
 assert.throws(()=>authority.authenticate({...pre.seal,economic_authorization:true} as any),/LEGACY_OR_ECONOMIC_GRANT_REVOKED/);
 assert.throws(()=>authority.issue(pre.seal.set,pre.seal.run_id,release.readonly_runner_commit,'5759337bbdb8e936af4788491e4ab41cc6f31db3'),/LEGACY_COMMIT_REVOKED/);
 assert.throws(()=>{SALARY_DECISION.rows[0]!.requires_salary_review=false;});
 authority.consume(pre.seal);assert.throws(()=>authority.consume(pre.seal),/SCOPED_NONCE_REVOKED/);
});
test('definition window cannot be omitted; expired seal never mutates',async()=>{
 const {authority,pre}=await setup();await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:false}),/DEFINITION_WINDOW_REQUIRED/);
 let now=1000;const timed=createScopedLocalAuthority(()=>now);const expired=timed.issue(pre.seal.set,pre.seal.run_id,release.readonly_runner_commit,release.mutator_commit);now+=120000;
 await assert.rejects(executeScopedLocal(timed,{...pre,seal:expired},target,{definitions_window_confirmed:true}),/SCOPED_SEAL_EXPIRED/);
});
test('new trigger dependencies enter manifest; unresolved dynamic critical SQL refuses certification',async()=>{
 await scopedFixture();await sql("CREATE FUNCTION critical_probe() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER critical_probe BEFORE UPDATE ON focalizacion_final FOR EACH ROW EXECUTE FUNCTION critical_probe()");
 const authority=createScopedLocalAuthority(),pre=await preflightScopedLocal(authority,target,release);assert(pre.manifest.functions.includes('critical_probe()'));
 await sql("CREATE OR REPLACE FUNCTION critical_probe() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN EXECUTE 'SELECT 1';RETURN NEW;END$$");
 await assert.rejects(preflightScopedLocal(authority,target,release),/DYNAMIC_CRITICAL_DEFINITION_UNCERTIFIED/);
});
test('committed new candidate between early snapshot and lock is detected by mandatory fresh observer',async()=>{
 const {authority,pre}=await setup();
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{beforeLock:async()=>{
  await sql("INSERT INTO vinculaciones(id,empresa_id,contrato_id,fecha_inicio) VALUES(1999,15,24,'2026-09-01');INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,activo) VALUES(1299,24,1999,183,1,'2026-09-01',TRUE)");
 }}}),/SCOPED_DRIFT/);
 assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);
});
test('a sequence owned by an untouched protected table is not a consumed sequence',async()=>{
 await scopedFixture();await sql("CREATE SEQUENCE public.nomina_empleados_unused_seq OWNED BY nomina_empleados.id;ALTER TABLE nomina_empleados ALTER COLUMN id SET DEFAULT nextval('public.nomina_empleados_unused_seq')");
 const authority=createScopedLocalAuthority(),pre=await preflightScopedLocal(authority,target,release);assert(!pre.manifest.sequences.includes('nomina_empleados_unused_seq'));
 const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterLock:async()=>{await sql("SELECT nextval('nomina_empleados_unused_seq')");}}});assert.equal(result.status,'LOCAL_ROLLED_BACK');
 if('informational_after' in result&&result.informational_after)assert.notEqual(result.informational_after.excluded_digest,pre.informational.excluded_digest);
});
test('quoted table lookup from a critical trigger function enters dependency closure',async()=>{
 await scopedFixture();await sql('CREATE TABLE public.critical_extra(id bigint);CREATE FUNCTION public.critical_probe() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM 1 FROM "public"."critical_extra";RETURN NEW;END$$;CREATE TRIGGER critical_probe BEFORE UPDATE ON focalizacion_final FOR EACH ROW EXECUTE FUNCTION critical_probe()');
 const authority=createScopedLocalAuthority(),pre=await preflightScopedLocal(authority,target,release);assert(pre.manifest.tables.includes('critical_extra'));
 const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true});assert.equal(result.status,'LOCAL_ROLLED_BACK');
});
test('disappearing review flag or forged rollback beforeimage in audit is rejected cryptographically',async()=>{
 const {authority,pre}=await setup();await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,mode:'Commit'});
 await sql("UPDATE auditoria SET datos_nuevos=jsonb_set(datos_nuevos,'{requires_salary_review}','[]') WHERE datos_nuevos->>'action'='PHASE48'");
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,mode:'Commit'}),/PUBLISHED_WITNESS_INVALID/);
});
test('critical routine ACL drift is detected even when function body is unchanged',async()=>{
 const {authority,pre}=await setup();await sql('REVOKE ALL ON FUNCTION fn_crear_evento_sst_desde_nomina() FROM PUBLIC');
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true}),/SCOPED_DRIFT/);
});
test('unrelated ALTER and DROP remain permitted after locked revalidation, without incidental evidence locks',async()=>{
 const {authority,pre}=await setup();const writer=localClient();await writer.connect();await writer.query("SET lock_timeout='100ms'");
 try{const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{beforeDml:async()=>{
  await writer.query('ALTER TABLE public.ajena ADD COLUMN new_value text');
  await writer.query('DROP TABLE public.ajena');
 }}});assert.equal(result.status,'LOCAL_ROLLED_BACK');}finally{await writer.end();}
});
test('readonly seal publication is atomic and unchanged by excluded-object activity before execution',async()=>{
 const {authority,pre}=await setup();const directory='tmp/phase48-pooler-local/scoped-receipts';
 const file=publishScopedPreflight(directory,pre),before=readFileSync(file);
 await sql('CREATE TABLE public.extra_unrelated(id bigint)');
 const result=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,receipt_directory:directory});assert.equal(result.status,'LOCAL_ROLLED_BACK');
 assert(readFileSync(file).equals(before));
});
test('reloaded signing authority verifies publication and reversal; durable nonce forbids replay after rollback',async()=>{
 await scopedFixture();const key=randomBytes(32),directory='tmp/phase48-pooler-local/scoped-receipts';
 const persistence={key,claimNonce:(seal:any)=>{claimScopedLocalNonce(directory,seal);}};
 const a=createScopedLocalAuthority(Date.now,persistence),pre=await preflightScopedLocal(a,target,release);
 await executeScopedLocal(a,pre,target,{definitions_window_confirmed:true,mode:'Commit'});
 const reloaded=createScopedLocalAuthority(Date.now,persistence);
 assert.equal((await executeScopedLocal(reloaded,pre,target,{definitions_window_confirmed:true,mode:'Commit'})).status,'ALREADY_APPLIED');
 assert.equal((await rollbackScopedPublishedLocal(reloaded,pre.seal,target,{definitions_window_confirmed:true})).status,'LOCAL_REVERSED');
 const next=await preflightScopedLocal(a,target,release);await executeScopedLocal(a,next,target,{definitions_window_confirmed:true});
 await assert.rejects(executeScopedLocal(createScopedLocalAuthority(Date.now,persistence),next,target,{definitions_window_confirmed:true}),/SCOPED_NONCE_REVOKED/);
});
test('deferred critical trigger cannot defer economic effects until COMMIT',async()=>{
 await scopedFixture();await sql("CREATE FUNCTION critical_deferred() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE nomina_empleados SET salario_base=salario_base+1 WHERE vinculacion_id=1605;RETURN NEW;END$$;CREATE CONSTRAINT TRIGGER critical_deferred AFTER UPDATE ON cobertura_asignaciones DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION critical_deferred()");
 const authority=createScopedLocalAuthority(),pre=await preflightScopedLocal(authority,target,release);const before=(await sql('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id')).rows;
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,mode:'Commit'}),/PROTECTED_DATA_CHANGED/);
 assert.deepEqual((await sql('SELECT to_jsonb(t) row FROM nomina_empleados t ORDER BY id')).rows,before);
 assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);
});
