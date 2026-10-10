import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {criticalSchemaDigest,validateCriticalSchema,EXPECTED_CRITICAL_SCHEMA_DIGEST,SCHEMA_IDENTITY_VERSION} from '../modules/cobertura/phase48-readonly-schema-identity';
import {SCHEMA_SCOPE} from '../modules/cobertura/phase48-readonly-schema-scope';
import {LEGACY_SCHEMA_QUERIES,STRUCTURAL_QUERIES} from '../modules/cobertura/phase48-readonly-schema-catalog';
import {assertReadQuery} from '../modules/cobertura/phase48-readonly-repository';
import {runReadOnlyLifecycle} from '../modules/cobertura/phase48-readonly-preflight';
import {saveReadReceipt} from '../modules/cobertura/phase48-readonly-receipts';
import {BACKUP_SHA256,CERTIFICATE_SHA256,authorizationFields,buildAuthorizationPhrase,DIGEST_FIELDS,MUTATOR_COMMIT} from '../modules/cobertura/phase48-readonly-contract';
const backup=JSON.parse(readFileSync('reports/phase48-schema-backup-catalogs.json','utf8')).schema;
const productive=JSON.parse(readFileSync('reports/phase48-schema-production-catalogs.json','utf8')).schema;
const fresh=()=>structuredClone(backup.inventory);
const selected=(rows:any[])=>rows.find(r=>SCHEMA_SCOPE.critical_relations.includes((r.relation??r.name) as any));
test('backup-derived critical digest matches product catalogs while legacy global digest differs',()=>{
 assert.equal(backup.global_digest,'2fbba2269828d8573ed10eb5a6749d89e30d62adc75652ac713f375467df19a9');assert.equal(productive.global_digest,'c5ac9e39dffedbca6638a6fe0fb0a1d3d486627dc5e0d11dbbb5735933267630');assert.notEqual(backup.global_digest,productive.global_digest);
 assert.equal(criticalSchemaDigest(fresh()),EXPECTED_CRITICAL_SCHEMA_DIGEST);assert.equal(criticalSchemaDigest(productive.inventory),EXPECTED_CRITICAL_SCHEMA_DIGEST);assert.equal(validateCriticalSchema(fresh(),backup.global_digest).schema_identity_version,SCHEMA_IDENTITY_VERSION);
});
const mutations:Record<string,(s:any)=>void>={
 'critical column type':s=>{s.columns.find((r:any)=>r.relation==='cobertura_asignaciones').type='numeric(7,3)';},
 'nullability':s=>{const r=selected(s.columns);r.not_null=!r.not_null;},
 'relevant default':s=>{selected(s.columns).default_definition='0'.repeat(64);},
 'FK action':s=>{s.constraints.find((r:any)=>r.relation==='cobertura_asignaciones'&&r.type==='f').on_delete='c';},
 'UK':s=>{s.constraints.find((r:any)=>SCHEMA_SCOPE.critical_relations.includes(r.relation as any)&&r.type==='u').definition='0'.repeat(64);},
 'CHECK':s=>{s.constraints.find((r:any)=>r.relation==='calculadora_personal_config'&&r.type==='c').definition='0'.repeat(64);},
 'partial index':s=>{s.indexes.find((r:any)=>SCHEMA_SCOPE.critical_relations.includes(r.relation as any)&&r.predicate).predicate='0'.repeat(64);},
 'trigger':s=>{selected(s.triggers).enabled='D';},
 'function':s=>{s.functions.find((r:any)=>SCHEMA_SCOPE.critical_functions.includes(r.name as any)).definition='0'.repeat(64);},
 'sequence':s=>{s.sequences.find((r:any)=>r.owner_relation==='cobertura_asignaciones').increment='2';},
 'view in critical scope':s=>{s.views.push({schema:'public',name:'cobertura_asignaciones',kind:'v',definition:'0'.repeat(64)});},
 'transitive dependency':s=>{s.columns.find((r:any)=>r.relation==='personas').type='bytea';},
 'required permissions':s=>{s.privileges.find((r:any)=>r.name==='auditoria').can_insert=false;},
 'RLS':s=>{const r=s.relations.find((r:any)=>r.name==='cobertura_asignaciones');r.rls=!r.rls;}
};
for(const [name,mutate] of Object.entries(mutations))test('material schema mutation rejected: '+name,()=>{const sample=fresh();mutate(sample);assert.notEqual(criticalSchemaDigest(sample),EXPECTED_CRITICAL_SCHEMA_DIGEST);assert.throws(()=>validateCriticalSchema(sample,backup.global_digest),/READ_SCHEMA_IDENTITY_MISMATCH/);});
test('proven unrelated object ignored; all other digests remain independently enforced by lifecycle',()=>{const sample=fresh();assert.ok(!SCHEMA_SCOPE.critical_relations.includes('sst_matriz_riesgos' as any));sample.constraints.find((r:any)=>r.relation==='sst_matriz_riesgos').definition='0'.repeat(64);assert.equal(criticalSchemaDigest(sample),EXPECTED_CRITICAL_SCHEMA_DIGEST);});
test('row and property order does not change semantic identity',()=>{const sample=fresh();for(const kind of Object.keys(sample))sample[kind]=sample[kind].reverse().map((r:any)=>Object.fromEntries(Object.entries(r).reverse()));assert.equal(criticalSchemaDigest(sample),EXPECTED_CRITICAL_SCHEMA_DIGEST);});
test('only object-bound proven PostgreSQL cast representations are equivalent',()=>{const sample=fresh();const key='constraints:public.calculadora_personal_config.calculadora_personal_config_estado_check:definition';const pair=SCHEMA_SCOPE.cast_equivalences[key];const row=sample.constraints.find((r:any)=>r.name==='calculadora_personal_config_estado_check');row.definition=pair[1];assert.equal(criticalSchemaDigest(sample),EXPECTED_CRITICAL_SCHEMA_DIGEST);row.definition='f'.repeat(64);assert.notEqual(criticalSchemaDigest(sample),EXPECTED_CRITICAL_SCHEMA_DIGEST);});
test('catalog query barrier accepts only fixed SELECT catalog metadata',()=>{for(const sql of [...Object.values(LEGACY_SCHEMA_QUERIES),...Object.values(STRUCTURAL_QUERIES)])assertReadQuery(sql);});
test('READ ONLY and mutator share identity helper and pinned source protection',()=>{
 for(const path of ['src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-production-executor.ts'])assert.match(readFileSync(path,'utf8'),/assertCriticalSchema/);
 for(const path of ['src/scripts/phase48-production-readonly.ts','src/scripts/phase48-historical-production.ts','src/modules/cobertura/phase48-readonly-contract.ts'])for(const file of ['phase48-readonly-schema-catalog.ts','phase48-readonly-schema-identity.ts','phase48-readonly-schema-scope.ts'])assert.ok(readFileSync(path,'utf8').includes(file));
});
test('real mismatch evidence survives STOPPED and atomic publication with no nonce or row data',async()=>{
 const sample=fresh();mutations['critical column type']!(sample);
 const r=await runReadOnlyLifecycle(async()=>{validateCriticalSchema(sample,backup.global_digest);throw Error('UNREACHABLE');},{target:'Production',commit:'f'.repeat(40),backupSha:BACKUP_SHA256,certificateSha:CERTIFICATE_SHA256,observeFlags:async()=>({health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false})});
 assert.equal(r.status,'STOPPED');assert.equal(r.expected_schema_digest,EXPECTED_CRITICAL_SCHEMA_DIGEST);assert.equal(r.observed_schema_digest,criticalSchemaDigest(sample));assert.equal(r.canonicalization_version,SCHEMA_IDENTITY_VERSION);assert.equal(r.schema_divergence_phase,'server_identity.critical_schema');assert.equal(r.nonce,null);assert.equal(r.writes_productive,0);
 const dir=mkdtempSync(join(tmpdir(),'phase48-schema-stopped-'));try{const file=saveReadReceipt(dir,r),bytes=readFileSync(file);assert.equal(JSON.parse(bytes.toString()).observed_schema_digest,r.observed_schema_digest);saveReadReceipt(dir,r);assert.deepEqual(readFileSync(file),bytes);assert.equal(readdirSync(dir).length,1);}finally{for(const f of readdirSync(dir))unlinkSync(join(dir,f));rmdirSync(dir);}
});
test('previous readonly runner and mutator contracts revoked',()=>{
 const fields=authorizationFields({commit:'f'.repeat(40),backup_sha:BACKUP_SHA256,certificate_sha256:CERTIFICATE_SHA256,project_ref:'scuvsocqibbubqnesvuf',scope:{empresa:15,contrato:24,actor:12},phase48_rows:730,digests:Object.fromEntries(DIGEST_FIELDS.map(k=>[k,'a'.repeat(64)])),nonce:'b'.repeat(64),issued_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+60000).toISOString()});
 assert.throws(()=>buildAuthorizationPhrase({...fields,readonly_runner_commit:'cfe8b63276ef948ce72bc36f535d74509542e447'}),/REVOKED/);
 if(String(MUTATOR_COMMIT)!=='a1e709ca89c37ed31e9ec27b4dff2e4c17c295ce')assert.throws(()=>buildAuthorizationPhrase({...fields,mutator_commit:'a1e709ca89c37ed31e9ec27b4dff2e4c17c295ce'}),/INVALID/);
});
