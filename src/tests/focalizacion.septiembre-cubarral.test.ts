import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CUBARRAL_IDENTITIES,resolveApprovedMunicipality,municipalityTextMatches,assertCertifiedSnapshot,canonicalHash,compare,REVOKED_PREVIEW_DIGEST,readOnlyTransaction,hash,type TechnicalRow} from '../modules/cobertura/septiembre-controlled-preview';

function fixture(fila=559){
 const ids=CUBARRAL_IDENTITIES[fila]!;
 const source={fila,municipio:' Cubarral ',institucion:'Institution fixture',sede:'Site fixture'};
 const institution={id:ids.institucion_id,contrato_id:'24',municipio_id:'861',nombre_institucion:source.institucion};
 const site={id:ids.sede_id,institucion_id:ids.institucion_id,municipio_id:'861',nombre_sede:source.sede};
 const municipalities=[{id:'861',nombre_municipio:'SAN LUIS DE CUBARRAL'}];
 const august=[{...ids,municipio_id:'861'}];
 const evidence={scopedMunicipalities:municipalities,final:[{...ids,municipio_id:'861',carga_id:'4'}]};
 return {source,institution,site,municipalities,august,evidence};
}
test('CUBARRAL normalizado resuelve 861 sólo en las cuatro identidades aprobadas de 15/24',()=>{
 for(const fila of [559,560,561,562]){
  const f=fixture(fila);
  assert.equal(resolveApprovedMunicipality(f.source,f.institution,f.site,f.municipalities,f.august,15,24,f.evidence).id,'861');
  assert.equal(municipalityTextMatches(f.source,f.municipalities[0]),true);
 }
});
test('empresa, contrato y filas no autorizados no pueden aplicar la resolución Cubarral',()=>{
 const f=fixture();
 for(const scope of [[16,24],[15,25]])assert.throws(()=>resolveApprovedMunicipality(f.source,f.institution,f.site,f.municipalities,f.august,scope[0],scope[1],f.evidence),/TENANT_SCOPE_FORBIDDEN/);
 for(const fila of [558,563,700])assert.throws(()=>resolveApprovedMunicipality({...f.source,fila},f.institution,f.site,f.municipalities,f.august,15,24,f.evidence),/CUBARRAL_ROW_NOT_APPROVED/);
 assert.throws(()=>resolveApprovedMunicipality(f.source,{...f.institution,contrato_id:'25'},f.site,f.municipalities,f.august,15,24,f.evidence),/EVIDENCE_CHANGED/);
});
test('Cubarral exige institución/sede, ambos históricos y ausencia de otro candidato del contrato',()=>{
 const f=fixture();
 const run=(institution=f.institution,site=f.site,august=f.august,evidence=f.evidence)=>resolveApprovedMunicipality(f.source,institution,site,f.municipalities,august,15,24,evidence);
 assert.throws(()=>run({...f.institution,id:'98'}),/EVIDENCE_CHANGED/);
 assert.throws(()=>run(f.institution,{...f.site,id:'999'}),/EVIDENCE_CHANGED/);
 assert.throws(()=>run(f.institution,{...f.site,nombre_sede:'Different site'}),/EVIDENCE_CHANGED/);
 assert.throws(()=>run(f.institution,f.site,[]),/EVIDENCE_CHANGED/);
 assert.throws(()=>run(f.institution,f.site,f.august,{...f.evidence,final:[]}),/EVIDENCE_CHANGED/);
 assert.throws(()=>run(f.institution,f.site,f.august,{...f.evidence,scopedMunicipalities:[...f.municipalities,{id:'other',nombre_municipio:'CUBARRAL'}]}),/EVIDENCE_CHANGED/);
});
test('nuevo snapshot contiene 688 resueltas, 29 resoluciones aprobadas y cinco exclusiones',()=>{
 const r=JSON.parse(readFileSync('reports/septiembre-certified-snapshot.json','utf8'));
 assert.equal(r.certified,true);assert.equal(r.writes,0);assert.equal(r.rows.length,688);
 assert.equal(new Set(r.rows.map((row:TechnicalRow)=>row.sede_id+'|'+row.modalidad_id)).size,688);
 for(const row of r.rows){assert.deepEqual(row.reasons,[]);for(const key of ['municipio_id','institucion_id','sede_id','modalidad_id'])assert.ok(row[key]);}
 assert.equal(r.approved_resolutions.length,25);
 for(const a of r.approved_resolutions)assert.equal(a.municipio_id,'734');
 assert.deepEqual(r.approved_cubarral_resolutions.map((a:any)=>a.fila).sort((a:number,b:number)=>a-b),[559,560,561,562]);
 for(const a of r.approved_cubarral_resolutions){assert.equal(a.municipio_id,'861');assert.equal(a.evidence.scoped_municipality_candidates.length,1);assert.ok(a.evidence.august.length);assert.ok(a.evidence.focalizacion_final.length);}
 assert.deepEqual(r.approved_exclusions.map((a:any)=>a.fila),[691,692,693,697,699]);
 assert.equal(r.certified_counts.blocked_rows,0);assert.equal(r.certified_counts.unresolved_identities,0);
});
test('digest certificado determinista, revocación anterior y rechazo de un conjunto alterado',()=>{
 const r=JSON.parse(readFileSync('reports/septiembre-certified-snapshot.json','utf8'));
 assert.doesNotThrow(()=>assertCertifiedSnapshot(r,r.final_set_digest));
 assert.equal(canonicalHash({rows:r.rows,source:r.source.sha256,scope:r.scope}),r.final_set_digest);
 assert.throws(()=>assertCertifiedSnapshot(r,REVOKED_PREVIEW_DIGEST),/REVOKED_PREVIEW_DIGEST/);
 assert.throws(()=>assertCertifiedSnapshot({...r,certified:false},r.final_set_digest),/CERTIFIED_SNAPSHOT_REQUIRED/);
 const altered=structuredClone(r);altered.rows[0].techo_total++;
 assert.throws(()=>assertCertifiedSnapshot(altered,r.final_set_digest),/CERTIFIED_SNAPSHOT_REQUIRED/);
});
test('resultado recalculado coincide con el histórico y reordenar el mismo conjunto no introduce cambios',()=>{
 const r=JSON.parse(readFileSync('reports/septiembre-certified-snapshot.json','utf8'));
 const previous=JSON.parse(readFileSync('reports/septiembre-controlled-preview.json','utf8'));
 assert.equal(r.august_digest,previous.august_digest);
 assert.deepEqual(r.delta.counts,previous.delta.counts);
 const reordered=compare(r.rows,r.rows.slice().reverse());
 assert.equal(reordered.counts.altas,0);assert.equal(reordered.counts.bajas,0);assert.equal(reordered.counts.cambios_metricas,0);
});
test('PreviewOnly repetido ejecuta sólo lectura y rollback; escribe cero filas',async()=>{
 const calls:string[]=[];
 const stored=[{id:4}];const baseline=hash(stored);
 const db={query:async(sql:string)=>{calls.push(sql);if(sql.startsWith('SHOW'))return {rows:[{transaction_read_only:'on'}]};if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{locked:true}]};return {rows:stored};}};
 for(let i=0;i<2;i++)await readOnlyTransaction(db,async()=>{await db.query('SELECT id FROM focalizacion_cargas');});
 assert.equal(hash(stored),baseline);assert.equal(calls.filter(sql=>sql==='ROLLBACK').length,2);
 assert.ok(calls.every(sql=>/^(BEGIN|SHOW|SELECT|ROLLBACK)\b/.test(sql)));
});
