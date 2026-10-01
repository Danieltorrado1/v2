import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { newProjectionKey, publishSeptemberLocal, CERTIFIED_DIGEST } from '../modules/cobertura/septiembre-monthly-publisher';
const snapshot=JSON.parse(readFileSync('reports/septiembre-certified-snapshot.json','utf8'));
const evidence=()=>JSON.parse(readFileSync('reports/septiembre-temporal-local-certification.json','utf8'));

test('claves de nuevas identidades son deterministas y no mezclan sede/modalidad',()=>{
 assert.equal(newProjectionKey('10','1'),newProjectionKey('10','1'));
 assert.notEqual(newProjectionKey('10','1'),newProjectionKey('1','10'));
 assert.notEqual(newProjectionKey('10','1'),newProjectionKey('10','2'));
 assert.throws(()=>newProjectionKey('10|1','2'),/INVALID_PROJECTION_IDENTITY/);
});
test('modo productivo y ausencia de confirmación se rechazan antes de conectar',async()=>{
 let calls=0;const db={query:()=>{calls++;throw Error('UNEXPECTED_SQL');}} as unknown as Client;
 for(const options of [{mode:'MutateLocal'},{mode:'MutateLocal',confirmation:'PRODUCTIVE'},{mode:'Mutate'}])await assert.rejects(publishSeptemberLocal(db,snapshot,new Map(),options as any),/LOCAL_MUTATION_CONFIRMATION_REQUIRED/);
 assert.equal(calls,0);
});
test('snapshot alterado se rechaza antes de conectar y abrir transacción',async()=>{
 let calls=0;const db={query:()=>{calls++;throw Error('UNEXPECTED_SQL');}} as unknown as Client;
 await assert.rejects(publishSeptemberLocal(db,{...snapshot,scope:{...snapshot.scope,empresa_id:16}},new Map()),/TENANT_SCOPE_FORBIDDEN/);
 assert.equal(calls,0);
});
test('publicación real conserva el índice y produce el conjunto certificado',()=>{
 const e=evidence();assert.equal(e.schema_unchanged,true);assert.equal(e.migration,null);
 assert.equal(e.mutate.status,'APPLIED_LOCAL');assert.equal(e.mutate.updated,663);assert.equal(e.mutate.inserted,25);assert.equal(e.mutate.removed,24);
 assert.equal(e.mutate.postflight.digest,CERTIFIED_DIGEST);assert.equal(e.mutate.postflight.rows,688);assert.equal(e.mutate.postflight.loads,1);
 assert.equal(e.mutate.postflight.overlaps,0);assert.equal(e.mutate.postflight.duplicates,0);assert.equal(e.mutate.postflight.excluded_rows_inserted,0);
 assert.equal(e.mutate.postflight.positions,695);assert.equal(e.mutate.august_history_intact,true);
});
test('servicios reales separan agosto histórico, septiembre y cobertura actual',()=>{
 const r=evidence().application_reads;
 assert.equal(r.august_institutions,687);assert.equal(r.august_dto_identical,true);assert.equal(r.september_institutions,688);assert.equal(r.all_months,1375);
 assert.equal(r.august_coverage,687);assert.equal(r.august_coverage_identical,true);assert.equal(r.september_coverage,688);assert.equal(r.current_coverage,688);
 assert.equal(r.nomina_periodo_id,'3');assert.equal(r.altas,25);assert.equal(r.bajas,24);assert.equal(r.cambios_modalidad,24);
});
test('idempotencia real conserva tablas, auditorías y secuencias sin escrituras',()=>{
 const e=evidence();assert.equal(e.preview.status,'PREVIEW_ONLY');assert.equal(e.preview.writes,0);
 assert.equal(e.second.status,'ALREADY_APPLIED');assert.equal(e.second.writes,0);assert.equal(e.second.data_and_sequences_identical,true);assert.equal(e.second.run_id,e.mutate.run_id);
 assert.equal(e.protected.verified_tables,217);assert.equal(e.protected.all_others_identical,true);assert.equal(e.production_connections,0);assert.equal(e.production_writes,0);
});
test('rollback completo en restauración limpia y secuencias sin reutilizar IDs abandonados',()=>{
 const r=evidence().clean_rollback;
 assert.equal(r.cases.length,3);assert.ok(r.cases.every((c:any)=>c.all_public_tables_identical));
 assert.ok(r.cases.some((c:any)=>c.code==='INDUCED_FAILURE_AT_344'));
 assert.ok(r.cases.some((c:any)=>c.code==='INDUCED_AUDIT_FAILURE'));
 assert.ok(r.cases.some((c:any)=>c.code==='INDUCED_POSTFLIGHT_FAILURE'));
 assert.ok(r.cases.every((c:any)=>c.sequence_policy==='FORWARD_ONLY_GAPS_ACCEPTED_NO_RESET_OR_REUSE'));
 assert.equal(r.followup_application.load_id_exceeds_abandoned_ids,true);
});
test('postflight rechaza vínculos nulos y el importador general conserva la identidad de la proyección',()=>{
 const e=JSON.parse(readFileSync('reports/septiembre-temporal-postflight-hardening.json','utf8'));
 assert.equal(e.corruption_cases.length,2);assert.ok(e.corruption_cases.every((c:any)=>c.nullable_link_corruption_rejected));
 assert.equal(e.legacy_sync.stable_id,true);assert.equal(e.legacy_sync.stable_key,true);assert.equal(e.legacy_sync.duplicates,0);
 assert.equal(e.legacy_sync.optional_site_mode_link_supported,true);assert.equal(e.all_tables_and_sequences_identical,true);
 assert.equal(e.second_after_hardening.status,'ALREADY_APPLIED');
});
