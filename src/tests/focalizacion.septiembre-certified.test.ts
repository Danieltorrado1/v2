import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalHash,resolveApprovedMunicipality,APPROVED_EXCLUSIONS,approvedOperationalRows,APPROVED_SHA256,assertCertifiedCounts,FUTURE_REQUIRED_GATES,assertFutureEvidence} from '../modules/cobertura/septiembre-controlled-preview';

const forensic=JSON.parse(readFileSync('reports/septiembre-forensic-readonly.json','utf8'));
test('las 25 resoluciones exigen texto exacto, tenant, instituciones, sede, Meta e historial agosto',()=>{
 for(const d of forensic.detail){
  const source={fila:d.fila,municipio:d.municipio_excel,institucion:d.institucion_excel};
  assert.equal(resolveApprovedMunicipality(source,d.institucion,d.sede,forensic.municipios,d.agosto).id,'734');
  assert.throws(()=>resolveApprovedMunicipality({...source,municipio:'PUERTO LLERAS'},d.institucion,d.sede,forensic.municipios,d.agosto),/EVIDENCE_CHANGED/);
  assert.throws(()=>resolveApprovedMunicipality(source,d.institucion,d.sede,forensic.municipios,[]),/EVIDENCE_CHANGED/);
  assert.throws(()=>resolveApprovedMunicipality(source,d.institucion,d.sede,forensic.municipios,d.agosto,16,24),/TENANT_SCOPE_FORBIDDEN/);
 }
});
test('Puerto Rico Caqueta no puede sustituir el municipio aprobado aunque coincida el nombre',()=>{
 const d=forensic.detail[0],source={fila:d.fila,municipio:d.municipio_excel,institucion:d.institucion_excel};
 assert.throws(()=>resolveApprovedMunicipality(source,{...d.institucion,municipio_id:'733'},{...d.sede,municipio_id:'733'},forensic.municipios,d.agosto),/EVIDENCE_CHANGED/);
 assert.throws(()=>resolveApprovedMunicipality(source,d.institucion,d.sede,forensic.municipios.filter((m:any)=>m.id!=='734'),d.agosto),/EVIDENCE_CHANGED/);
});
test('cinco exclusiones explicitas sin omision de una sexta fila incompleta y con hash obligatorio',()=>{
 const rows=forensic.incomplete.map((d:any)=>d.original_sanitizado);
 const input={sha256:APPROVED_SHA256,rows:[...rows,{fila:700,issues:['IDENTIDAD_INCOMPLETA']}]} as any;
 assert.deepEqual(APPROVED_EXCLUSIONS.map(e=>e.fila),[691,692,693,697,699]);
 assert.deepEqual(approvedOperationalRows(input).map(r=>r.fila),[700]);
 assert.throws(()=>approvedOperationalRows({...input,sha256:'changed'}),/HASH_MISMATCH/);
 assert.throws(()=>approvedOperationalRows({...input,rows:rows.slice(1)}),/EXCLUSION_EVIDENCE_CHANGED/);
});
test('digest canonico independiente del orden de claves, sensible a identidad y metricas',()=>{
 assert.equal(canonicalHash({a:1,b:{c:2,d:3}}),canonicalHash({b:{d:3,c:2},a:1}));
 assert.notEqual(canonicalHash({id:734,total:10}),canonicalHash({id:733,total:10}));
 assert.notEqual(canonicalHash({id:734,total:10}),canonicalHash({id:734,total:11}));
});
test('conteos divergentes detienen el preview sin forzar valores',()=>{
 assert.throws(()=>assertCertifiedCounts({agosto:687,septiembre:688,altas:29},[],695,33),/COUNT_MISMATCH:altas:29!=25/);
});
test('evidencia detenida conserva las 25 resoluciones y expone cuatro identidades pendientes',()=>{
 const stopped=JSON.parse(readFileSync('reports/septiembre-preview-stopped-snapshot.json','utf8'));
 assert.equal(stopped.certified,false);assert.equal(stopped.writes,0);
 const approved=stopped.combinations.filter((r:any)=>r.fila>=491&&r.fila<=499||r.fila>=514&&r.fila<=529);
 assert.equal(approved.length,25);
 for(const r of approved){assert.equal(r.municipio_id,'734');assert.deepEqual(r.reasons,[]);}
 assert.deepEqual(stopped.unresolved_rows.map((r:any)=>r.fila),[559,560,561,562]);
 assert.equal(stopped.combinations.filter((r:any)=>!r.reasons.length).length,684);
 assert.equal(stopped.preflight.august_digest_unchanged,true);
});
test('digest del candidato detenido se reproduce sin modificar ni certificar el artefacto',()=>{
 const stopped=JSON.parse(readFileSync('reports/septiembre-preview-stopped-snapshot.json','utf8'));
 assert.equal(canonicalHash({scope:stopped.scope,source:stopped.source_sha256,rows:stopped.combinations}),stopped.uncertified_candidate_digest);
});
test('todos los requisitos futuros fallan cerrados y nunca habilitan mutacion',()=>{
 const complete=Object.fromEntries(FUTURE_REQUIRED_GATES.map(g=>[g,true]));
 for(const gate of FUTURE_REQUIRED_GATES)assert.throws(()=>assertFutureEvidence({...complete,[gate]:false}),new RegExp('FUTURE_GATE_REQUIRED:'+gate));
 assert.throws(()=>assertFutureEvidence(complete),/MUTATION_NOT_IMPLEMENTED/);
});
test('runner no usa consecutivos ni fragmentos DANE para resolver y exige baseline economico intacto',()=>{
 const script=readFileSync('src/scripts/preview-focalizacion-septiembre-controlada.ts','utf8');
 assert.doesNotMatch(script,/slice\(1,6\)|norm\(s\.consecutivo_sede\)/);
 assert.match(script,/default_transaction_read_only=on/);
 assert.match(script,/PAYROLL_PERIODS_CHANGED/);
 assert.match(script,/AUGUST_BASELINE_CHANGED/);
 assert.doesNotMatch(script,/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|COMMIT)\b/i);
});
