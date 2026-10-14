import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Client} from 'pg';
import {createLocalGateAuthority,DYNAMIC_DIGESTS,digest} from '../modules/cobertura/phase48-dynamic-gate';
import {localClient,certifyDynamicLocal,executeDynamicLocal} from '../modules/cobertura/phase48-dynamic-local';

const target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')};
// Synthetic technical rows only. No employees, people or vinculaciones are created.
async function fixture(n=733) {
 if(![730,733,734].includes(n))throw Error('FIXTURE_COUNT_INVALID');
 const db=localClient();await db.connect();
 try {
  await db.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
   CREATE TABLE contratos(id bigint PRIMARY KEY,empresa_id bigint NOT NULL);
   CREATE TABLE instituciones(id bigint PRIMARY KEY);
   CREATE TABLE sedes(id bigint PRIMARY KEY);
   CREATE TABLE modalidades(id bigint PRIMARY KEY);
   CREATE TABLE focalizacion_final(id bigint PRIMARY KEY,contrato_id bigint REFERENCES contratos(id),institucion_id bigint REFERENCES instituciones(id),sede_id bigint REFERENCES sedes(id),modalidad_id bigint REFERENCES modalidades(id));
   CREATE TABLE cobertura_asignaciones(id bigint PRIMARY KEY,contrato_id bigint REFERENCES contratos(id),focalizacion_final_id bigint NOT NULL REFERENCES focalizacion_final(id),vinculacion_id bigint NOT NULL,fecha_inicio date NOT NULL,fecha_fin date,activo boolean NOT NULL,technical_state text NOT NULL);
   CREATE TABLE nomina_periodos(id bigint PRIMARY KEY,estado text NOT NULL);
   CREATE TABLE protected_source(id bigint PRIMARY KEY,technical_state text NOT NULL);
   INSERT INTO contratos VALUES(24,15),(25,16);
   INSERT INTO instituciones VALUES(6),(42),(39);
   INSERT INTO sedes VALUES(16),(167),(132);
   INSERT INTO modalidades VALUES(1),(3);
   INSERT INTO focalizacion_final VALUES(180,24,6,16,3),(356,24,42,167,1),(319,24,39,132,3),(400,25,6,16,3);
   INSERT INTO nomina_periodos VALUES(4,'ANULADO'),(6,'ANULADO');
   INSERT INTO protected_source VALUES(1,'PRESERVED');
   INSERT INTO cobertura_asignaciones SELECT CASE WHEN x=730 THEN 1224 WHEN x>730 THEN 1276+x-730 ELSE x END,24,CASE WHEN x=732 THEN 356 WHEN x=733 THEN 319 ELSE 180 END,CASE WHEN x=730 THEN 1555 WHEN x=11 THEN 249 ELSE 2000+x END,'2026-09-01',NULL,true,'PRESERVED' FROM generate_series(1,${n}) x;
   INSERT INTO cobertura_asignaciones VALUES(9999,25,400,9999,'2026-09-01',NULL,true,'OTHER_TENANT');`);
 } finally {await db.end();}
}
async function sql(text:string) {const db=localClient();await db.connect();try{return await db.query(text);}finally{await db.end();}}
async function setup(n=733,clock?:()=>number) {await fixture(n);const authority=createLocalGateAuthority(clock);const seal=await certifyDynamicLocal(authority,target);return {authority,seal};}

test('local engine refuses execution without local certification flag',()=>{
 const flag=process.env.PHASE48_DYNAMIC_LOCAL_CERT;delete process.env.PHASE48_DYNAMIC_LOCAL_CERT;
 try {assert.throws(localClient,/LOCAL_CERTIFICATION_REQUIRED/);}finally{process.env.PHASE48_DYNAMIC_LOCAL_CERT=flag;}
});
for(const count of [730,733,734])test(`dynamic ${count}: exact IDs and transactional DDL/DML rollback 8/8`,async()=>{
 const {authority,seal}=await setup(count);assert.equal(seal.set.candidate_count,count);
 assert.equal(seal.expires_at-seal.issued_at,120000);
 const result=await executeDynamicLocal(authority,seal,target);
 assert.equal(result.status,'LOCAL_ROLLED_BACK');assert.equal(result.rollback_verified,true);
 assert.deepEqual(result.processed_ids,seal.set.candidate_ids);
 await assert.rejects(executeDynamicLocal(authority,seal,target),/GATE_NONCE_REVOKED/);
});
test('local commit updates only sealed tenant IDs; no insert or economic/correction DML',async()=>{
 const {authority,seal}=await setup();
 const result=await executeDynamicLocal(authority,seal,target,'Commit');assert.equal(result.processed_ids.length,733);
 const rows=(await sql('SELECT id::text, institucion_id::text,technical_state FROM cobertura_asignaciones WHERE id IN (11,1224,1277,1278,1279,9999) ORDER BY id')).rows;
 assert.deepEqual(rows.map(r=>r.institucion_id),['6','6','6','42','39',null]);
 assert.ok(rows.every(r=>r.technical_state=== (r.id==='9999'?'OTHER_TENANT':'PRESERVED')));
 assert.equal((await sql('SELECT count(*)::int n FROM cobertura_asignaciones')).rows[0].n,734);
});
for(const [label,change] of [
 ['new candidate',"INSERT INTO cobertura_asignaciones SELECT 1280,contrato_id,focalizacion_final_id,vinculacion_id,fecha_inicio,fecha_fin,activo,technical_state FROM cobertura_asignaciones WHERE id=1279"],
 ['deleted original','DELETE FROM cobertura_asignaciones WHERE id=1'],
 ['candidate identity','UPDATE focalizacion_final SET institucion_id=42 WHERE id=180'],
 ['technical field',"UPDATE cobertura_asignaciones SET technical_state='CHANGED' WHERE id=1277"],
 ['protected table',"UPDATE protected_source SET technical_state='CHANGED' WHERE id=1"],
 ['annulled period',"UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=4"],
 ['schema','ALTER TABLE protected_source ADD COLUMN changed bigint'],
 ] as const)test(`intermediate ${label} invalidates seal before DDL/DML and burns nonce`,async()=>{
 const {authority,seal}=await setup();await sql(change);
 await assert.rejects(executeDynamicLocal(authority,seal,target),/STOPPED_DRIFT|ANNULLED_PERIODS_CHANGED/);
 assert.equal((await sql("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cobertura_asignaciones' AND column_name='institucion_id'")).rows[0].n,0);
 await assert.rejects(executeDynamicLocal(authority,seal,target),/GATE_NONCE_REVOKED/);
});
test('same count, replaced ID is refused',async()=>{
 const {authority,seal}=await setup();await sql('UPDATE cobertura_asignaciones SET id=1280 WHERE id=1279');
 await assert.rejects(executeDynamicLocal(authority,seal,target),/STOPPED_DRIFT/);
});
test('gate expiry at exactly 120 seconds, clock rollback and expiry after locking stop execution',async()=>{
 let now=1000;let s=await setup(733,()=>now);now+=120000;
 await assert.rejects(executeDynamicLocal(s.authority,s.seal,target),/GATE_EXPIRED/);
 now=1000;s=await setup(733,()=>now);now--;
 await assert.rejects(executeDynamicLocal(s.authority,s.seal,target),/GATE_EXPIRED/);
 now=1000;s=await setup(733,()=>now);
 await assert.rejects(executeDynamicLocal(s.authority,s.seal,target,'Rollback',{afterLock:async()=>{now+=120000;}}),/GATE_EXPIRED/);
});
test('caller tampering with each digest, IDs, count, lock manifest or expiry fails authentication',async()=>{
 const {authority,seal}=await setup();
 for(const k of DYNAMIC_DIGESTS) {const changed=structuredClone(seal);changed.set[k]='0'.repeat(64);assert.throws(()=>authority.consume(changed),/GATE_SEAL_INVALID/);}
 for(const change of [(s:any)=>s.set.candidate_ids[0]='8888',(s:any)=>s.set.candidate_count++,
  (s:any)=>s.set.lock_tables.pop(),(s:any)=>s.expires_at++]) {
  const changed=structuredClone(seal);change(changed);assert.throws(()=>authority.consume(changed),/GATE_SEAL_INVALID/);
 }
});
test('8/8 digests revalidated, even individually divergent well-formed sets',async()=>{
 const {authority,seal}=await setup();for(const k of DYNAMIC_DIGESTS){const changed=structuredClone(seal.set);changed[k]='0'.repeat(64);assert.throws(()=>authority.revalidate(seal,changed),/STOPPED_DRIFT/);}
});
for(const [label,statement] of [
 ['INSERT',"INSERT INTO cobertura_asignaciones SELECT 1280,contrato_id,focalizacion_final_id,vinculacion_id,fecha_inicio,fecha_fin,activo,technical_state FROM cobertura_asignaciones WHERE id=1279"],
 ['UPDATE',"UPDATE cobertura_asignaciones SET technical_state='CONCURRENT' WHERE id=1277"],
 ['DELETE','DELETE FROM cobertura_asignaciones WHERE id=1277'],
 ['source identity','UPDATE focalizacion_final SET sede_id=167 WHERE id=180'],
 ['protected table',"UPDATE protected_source SET technical_state='CONCURRENT' WHERE id=1"],
 ['TRUNCATE','TRUNCATE protected_source'],
 ['DDL','ALTER TABLE protected_source ADD COLUMN concurrent bigint'],
 ] as const)test(`non-cooperating concurrent ${label} is blocked after lock before relevant SELECT`,async()=>{
 const {authority,seal}=await setup();const writer=localClient();await writer.connect();
 try {
  await writer.query("SET lock_timeout='100ms'");
  await executeDynamicLocal(authority,seal,target,'Rollback',{afterLock:async()=>{
   await assert.rejects(writer.query(statement),(error:any)=>error.code==='55P03');
  }});
 } finally {await writer.end();}
});
test('already active writer causes NOWAIT refusal and nonce revocation',async()=>{
 const {authority,seal}=await setup();const writer=localClient();await writer.connect();
 try {
  await writer.query('BEGIN');await writer.query("UPDATE cobertura_asignaciones SET technical_state='UNCOMMITTED' WHERE id=1277");
  await assert.rejects(executeDynamicLocal(authority,seal,target),(e:any)=>e.code==='55P03');
  await assert.rejects(executeDynamicLocal(authority,seal,target),/GATE_NONCE_REVOKED/);
 } finally {await writer.query('ROLLBACK');await writer.end();}
});
test('first execution SELECT follows BEGIN/SERIALIZABLE and full relation lock',async()=>{
 const {authority,seal}=await setup();const statements:string[]=[];const query=Client.prototype.query;
 Client.prototype.query=function(this:Client,...args:any[]):any {statements.push(String(args[0]));return (query as any).apply(this,args);};
 try{await executeDynamicLocal(authority,seal,target);}finally{Client.prototype.query=query;}
 const first=statements.findIndex(s=>s.startsWith('SELECT'));
 assert.equal(statements[0],'BEGIN ISOLATION LEVEL SERIALIZABLE');
 assert.ok(first>0&&statements[first-1]!.startsWith('LOCK TABLE '));
 for(const table of seal.set.lock_tables)assert.ok(statements[first-1]!.includes('public."'+table+'"'));
});
test('induced failure after update rolls back schema, identities and all protected tables',async()=>{
 const {authority,seal}=await setup();
 await assert.rejects(executeDynamicLocal(authority,seal,target,'Rollback',{afterUpdate:async()=>{throw Error('INDUCED_FAILURE');}}),/INDUCED_FAILURE/);
 const after=await certifyDynamicLocal(authority,target);assert.equal(digest(after.set),digest(seal.set));
});
test('unexpected protected changes inside local transaction are refused and rolled back',async()=>{
 const {authority,seal}=await setup();
 await assert.rejects(executeDynamicLocal(authority,seal,target,'Rollback',{afterUpdate:async db=>{await db.query("UPDATE protected_source SET technical_state='BAD' WHERE id=1");}}),/PROTECTED_TABLE_DRIFT/);
 const after=await certifyDynamicLocal(authority,target);assert.equal(digest(after.set),digest(seal.set));
});
test('STOP boundary: relation locks do not fence concurrent creation of a public source table',async()=>{
 const {authority,seal}=await setup();let firstDmlReached=false;
 // A non-cooperating catalog writer can create a new public relation without
 // taking a lock on any existing relation in the signed lock manifest.
 await assert.rejects(executeDynamicLocal(authority,seal,target,'Rollback',{
  afterLock:async()=>{await sql('CREATE TABLE concurrent_new_source(id bigint PRIMARY KEY)');},
  afterUpdate:async()=>{firstDmlReached=true;},
 }),/STOPPED_DRIFT/);
 assert.equal(firstDmlReached,true,'catalog drift was invisible to the SERIALIZABLE snapshot before DML');
 assert.equal((await sql("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cobertura_asignaciones' AND column_name='institucion_id'")).rows[0].n,0);
 await assert.rejects(executeDynamicLocal(authority,seal,target),/GATE_NONCE_REVOKED/);
});
