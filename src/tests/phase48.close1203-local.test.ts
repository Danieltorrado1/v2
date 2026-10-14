import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {scopedFixture} from './fixtures/phase48-scoped-fixture';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {scopedCapture,tableHashes} from '../modules/cobertura/phase48-scoped-repository';
import {createScopedLocalAuthority,scopedDigest} from '../modules/cobertura/phase48-scoped-contract';
import {preflightScopedLocal,executeScopedLocal,rollbackScopedPublishedLocal} from '../modules/cobertura/phase48-scoped-local';
import {validateOperationalRows,OPERATIONAL_CERTIFICATE,operationalRowDigest} from '../modules/cobertura/phase48-operational-close';
const target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')};
const release={readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40)};
async function sql(text:string,values?:any[]){const c=localClient();await c.connect();try{return await c.query(text,values);}finally{await c.end();}}
async function setup(){await scopedFixture(740);await sql('DELETE FROM nomina_empleados WHERE vinculacion_id BETWEEN 1608 AND 1614');const authority=createScopedLocalAuthority();const pre=await preflightScopedLocal(authority,target,release);return {authority,pre};}
async function capture(){const c=localClient();await c.connect();try{return await scopedCapture(c);}finally{await c.end();}}
test('exact closure, archival identities, absent salaries, atomic four audits, idempotence and sealed reversal',async()=>{
 const {authority,pre}=await setup();assert.equal(pre.seal.set.candidate_count,740);assert.equal(pre.operational_preview.archives.length,7);
 const old=await capture(),protectedBefore=old.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table));
 assert(pre.connections.length===2&&pre.connections.every(c=>c.read_only==='on'&&c.rollback==='CONFIRMED'&&c.closed));
 for(const id of ['1280','1281','1282','1283','1284','1285','1286'])assert(pre.preview.find(r=>r.id===id)?.requires_salary_review);
 const result=await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true});assert.equal(result.status,'LOCAL_COMMITTED');
 const after=(await sql('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
 const closed=after.find(r=>r.id===1203),before=old.coverage.find(r=>r.id===1203);const {institucion_id,sede_id,modalidad_id,...projection}=closed;
 assert.deepEqual(projection,{...before,fecha_fin:'2026-08-31'});assert.equal(closed.activo,true);assert.equal(institucion_id,110);assert.equal(sede_id,592);assert.equal(modalidad_id,1);
 assert(closed.fecha_fin==='2026-08-31'&&!(closed.fecha_inicio<='2026-09-01'&&closed.fecha_fin>='2026-09-01'));
 for(const a of OPERATIONAL_CERTIFICATE.archives){const row=after.find(r=>String(r.id)===a.id);assert.equal(row.activo,false);const {institucion_id,sede_id,modalidad_id,...rest}=row;assert.deepEqual(rest,old.coverage.find(r=>String(r.id)===a.id));}
 for(const id of ['1280','1281','1282','1283','1284','1285','1286']){const row=after.find(r=>String(r.id)===id),{institucion_id,sede_id,modalidad_id,...rest}=row;assert.deepEqual(rest,old.coverage.find(r=>String(r.id)===id));}
 const c=localClient();await c.connect();try{assert.deepEqual((await tableHashes(c,old.manifest.tables)).filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table)),protectedBefore);}finally{await c.end();}
 const logs=(await sql("SELECT datos_nuevos body FROM auditoria WHERE datos_nuevos->>'run_id'=$1 ORDER BY id",[pre.seal.run_id])).rows;
 assert.equal(logs.length,4);const audit=logs.find(r=>r.body.action==='CLOSE1203')!.body;assert.equal(audit.actor,12);assert.equal(audit.assignment_id,'1203');assert.equal(audit.reason,'RETIRO_CONFIRMADO');assert.equal(audit.old_date,'2026-11-30');assert.equal(audit.new_date,'2026-08-31');assert.equal(audit.before_digest,pre.operational_preview.close.before_digest);assert.equal(audit.after_digest,pre.operational_preview.close.after_digest);
 assert.equal((await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true})).status,'ALREADY_APPLIED');assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);
 await sql("UPDATE ajena SET state='PRESERVED_ACTIVITY';SELECT nextval('ajena_seq')");
 assert.equal((await rollbackScopedPublishedLocal(authority,pre.seal,target,{definitions_window_confirmed:true})).status,'LOCAL_REVERSED');
 assert.equal((await sql('SELECT fecha_fin::text,activo FROM cobertura_asignaciones WHERE id=1203')).rows[0].fecha_fin,'2026-11-30');assert.equal((await sql('SELECT state FROM ajena')).rows[0].state,'PRESERVED_ACTIVITY');assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,5);
});
for(const stage of ['BEFORE_PHASE48','AFTER_PHASE48','AFTER_ALBENY','AFTER_DARY','BEFORE_CLOSE1203','AFTER_CLOSE1203','AUDIT_PHASE48','AUDIT_CLOSE1203','BEFORE_COMMIT'])test('whole transaction rollback at '+stage,async()=>{
 const {authority,pre}=await setup(),before=await capture();
 await assert.rejects(executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true,hooks:{checkpoint:async(s)=>{if(s===stage)throw Error('INJECTED_FAILURE');}}}),/INJECTED_FAILURE/);
 assert.deepEqual((await capture()).set,before.set);assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);
});
test('actual audit constraint failure after previous three audits rolls back all writes',async()=>{
 const {authority,pre}=await setup(),before=await capture();await assert.rejects(executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true,hooks:{checkpoint:async(s,c)=>{if(s==='AUDIT_CLOSE1203')await c.query('ALTER TABLE auditoria ADD CONSTRAINT injected_audit_failure CHECK(FALSE) NOT VALID');}}}),/injected_audit_failure/);assert.deepEqual((await capture()).set,before.set);
});
for(const [label,statement] of [
 ['retirement',"UPDATE vinculaciones SET fecha_fin='2026-09-01' WHERE id=1461"],
 ['current date',"UPDATE cobertura_asignaciones SET fecha_fin='2026-11-29' WHERE id=1203"],
 ['missing row','DELETE FROM cobertura_asignaciones WHERE id=1203'],
 ['person','UPDATE vinculaciones SET persona_id=1135 WHERE id=1461'],
 ['institution','UPDATE focalizacion_final SET institucion_id=6 WHERE id=829'],
 ['site','UPDATE focalizacion_final SET sede_id=18 WHERE id=829'],
 ['modality','UPDATE focalizacion_final SET modalidad_id=3 WHERE id=829'],
 ['full row digest',"UPDATE cobertura_asignaciones SET observacion='CHANGED' WHERE id=1203"],
 ['active archive',"UPDATE cobertura_asignaciones SET activo=TRUE WHERE id=1214"],
 ['archive digest',"UPDATE cobertura_asignaciones SET observacion='CHANGED' WHERE id=1216"],
] as const)test('exact precondition rejects '+label,async()=>{const {authority,pre}=await setup();await sql(statement);await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true}),/CLOSE1203|ARCHIVED/);assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);});
test('1203 concurrent change before lock is detected despite early serializable snapshot',async()=>{const {authority,pre}=await setup();await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{beforeLock:async()=>{await sql("UPDATE cobertura_asignaciones SET observacion='RACE' WHERE id=1203");}}}),/CLOSE1203_BEFORE_DIGEST_CHANGED/);});
test('1203 writer blocked throughout critical locks',async()=>{const {authority,pre}=await setup();const writer=localClient();await writer.connect();try{await writer.query("SET lock_timeout='100ms'");assert.equal((await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterLock:async()=>{await assert.rejects(writer.query("UPDATE cobertura_asignaciones SET fecha_fin='2026-10-31' WHERE id=1203"),(e:any)=>e.code==='55P03');}}})).status,'LOCAL_ROLLED_BACK');}finally{await writer.end();}});
test('active duplicate and unknown inactive duplicates remain blocking',async()=>{
 for(const active of [true,false]){const {authority}=await setup();await sql(`INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,focalizacion_final_id,municipio_id,fecha_inicio,fecha_fin,activo) VALUES(1300,24,249,182,4,'2026-09-03',${active?'NULL':"'2026-09-03'"},$1)`,[active]);await assert.rejects(preflightScopedLocal(authority,target,release),/CANDIDATE_OVERLAP|CANDIDATE_DUPLICATE/);}
});
test('post-commit closed row divergence refuses reversal and preserves publication evidence',async()=>{const {authority,pre}=await setup();await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true});await sql("UPDATE cobertura_asignaciones SET fecha_fin='2026-08-30' WHERE id=1203");await assert.rejects(rollbackScopedPublishedLocal(authority,pre.seal,target,{definitions_window_confirmed:true}),/PUBLISHED_WRITE_SET_DIVERGENCE/);assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,4);});
test('productive full-row hash is pinned; synthetic data cannot pass the productive certificate',async()=>{
 await setup();const pins=JSON.parse(readFileSync('tmp/phase48-pooler-local/operational-synthetic-pins.json','utf8')),rows=(await sql('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row),v=(await sql('SELECT to_jsonb(v) row FROM vinculaciones v WHERE id=1461')).rows[0].row,ff=(await sql('SELECT to_jsonb(ff) row FROM focalizacion_final ff WHERE id=829')).rows[0].row;
 assert.throws(()=>validateOperationalRows(rows,v,ff),/CLOSE1203_BEFORE_DIGEST_CHANGED/);assert.equal(validateOperationalRows(rows,v,ff,pins).close.before_digest,operationalRowDigest(rows.find(r=>r.id===1203)));assert.notEqual(scopedDigest(pins),scopedDigest(OPERATIONAL_CERTIFICATE));
});
test('earlier active retirement novelty blocks while inactive novelty does not override confirmed retirement',async()=>{
 const {authority,pre}=await setup();await sql("INSERT INTO nomina_tipos_novedad(id,nombre) VALUES(990,'FECHA DE RETIRO');INSERT INTO nomina_novedades(id,vinculacion_id,tipo_novedad_id,fecha_inicio,activo) VALUES(990,1461,990,'2026-08-30',TRUE)");
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true}),/CLOSE1203_EFFECTIVE_RETIREMENT_CHANGED/);
 await sql('UPDATE nomina_novedades SET activo=FALSE WHERE id=990');assert.equal((await preflightScopedLocal(createScopedLocalAuthority(),target,release)).operational_preview.close.retirement,'2026-08-31');
});
test('a change to the inserted historical row is outside the exact write-set',async()=>{const {authority,pre}=await setup();await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterUpdate:async(c)=>{await c.query('UPDATE cobertura_asignaciones SET porcentaje_cobertura=2 WHERE vinculacion_id=1555 AND focalizacion_final_id IS NULL');}}}),/ALBENY_POSTIMAGE_CHANGED/);assert.equal((await sql('SELECT count(*)::int n FROM auditoria')).rows[0].n,0);});
test('previous runner, mutator and V5 seal are revoked',async()=>{
 const {authority,pre}=await setup();
 assert.throws(()=>authority.issue(pre.seal.set,pre.seal.run_id,'ee2e28f982ab651f5e8e2b40108f87b10594f9b7',release.mutator_commit),/LEGACY_COMMIT_REVOKED/);
 assert.throws(()=>authority.issue(pre.seal.set,pre.seal.run_id,release.readonly_runner_commit,'4a616e774fea82d57f2fc51e8902ab48a707bd4e'),/LEGACY_COMMIT_REVOKED/);
 assert.throws(()=>authority.authenticate({...pre.seal,version:'PHASE48_SCOPED_PSEUDORECORD_V5'} as any),/LEGACY_OR_ECONOMIC_GRANT_REVOKED/);
});
