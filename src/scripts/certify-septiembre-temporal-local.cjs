const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict'),crypto=require('crypto'),{Client}=require('pg');
const {publishSeptemberLocal,publicFingerprint,sequenceFingerprint,MONTHLY_WRITE_TABLES,CERTIFIED_DIGEST}=require('../../dist/modules/cobertura/septiembre-monthly-publisher');
const {inspectWorkbook,canonicalHash,compare}=require('../../dist/modules/cobertura/septiembre-controlled-preview');
const backup='C:/Users/CORE ULTRA/Documents/EmpiriaBackups/focalizacion-septiembre-pre-import-retry-20261001T125631Z';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const snapshotBytes=fs.readFileSync('reports/septiembre-certified-snapshot.json'),snapshot=JSON.parse(snapshotBytes),sourceBytes=fs.readFileSync('../../data/focalizacion-septiembre-2026.xlsx');
assert.equal(sha(fs.readFileSync(backup+'/full.dump')),'2e2f0608f609e2e3123e6bfdf56067bae08f11719cc3939ca73d0cdc387f0bc1');
assert.equal(sha(sourceBytes),'745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3');
const sources=new Map(inspectWorkbook(sourceBytes).rows.map(r=>[r.fila,r]));
const connect=async database=>{const c=new Client({host:'127.0.0.1',port:55440,user:'local_verifier',database});await c.connect();return c;};
const report={schema_version:'focalizacion.septiembre.temporal-local.v1',started_utc:new Date().toISOString(),production_connections:0,production_writes:0,migration:null,certified_digest:CERTIFIED_DIGEST};
const sequenceChanges=(a,b)=>Object.keys(a).filter(k=>canonicalHash(a[k])!==canonicalHash(b[k]));
const identical=(a,b)=>canonicalHash(a)===canonicalHash(b);
const priorCertification=()=>JSON.parse(fs.readFileSync(fs.existsSync('reports/septiembre-temporal-local-certification.json')?'reports/septiembre-temporal-local-certification.json':'reports/septiembre-temporal-local-stopped.json','utf8'));
// Run actual services with every database dependency replaced by this local SELECT-only executor.
function service(file,c,exposeSync=false){const cache=new Map();let queue=Promise.resolve();const select=(sql,values)=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i);return queue=queue.then(()=>c.query(sql,values));};function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
 const req=name=>{if(name.endsWith('/config/db'))return {dbQuery:select,dbPool:{query:select,connect:()=>{throw Error('NO_APPLICATION_MUTATION');}}};if(name.endsWith('auditoria.helper'))return {registerAuditEntry:()=>{throw Error('UNEXPECTED_AUDIT');}};
 if(name.startsWith('.')){let target=path.resolve(path.dirname(file),name);if(fs.existsSync(target+'.ts'))return load(target+'.ts');if(fs.existsSync(target+'/index.ts'))return load(target+'/index.ts');}return require(name);};
 const output=ts.transpileModule(fs.readFileSync(file,'utf8')+(exposeSync&&file.endsWith('cobertura.focalizacion.service.ts')?'\nexports.__sync = syncFocalizacionFinal;':''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(output,{module,exports:module.exports,require:req,__dirname:path.dirname(file),__filename:file,console,process,Buffer,Date,setTimeout,clearTimeout});return module.exports;}return load(file);}
const tenant={isGlobalAdmin:false,empresaIds:[15],contratoIds:[24],roleNames:['ADMINISTRADOR'],userId:'12'};
const query={contrato_id:24,q:'',municipio_id:null,institucion_id:null,sede_id:null,modalidad_id:null,periodo_id:null,rector:'',gestor_id:null,estado:'',page:1,page_size:1000};
async function readApplication(c){
 const institutions=service('src/modules/operacion/operacion.instituciones.service.ts',c),coverage=service('src/modules/cobertura/cobertura.service.ts',c);
 const august=await institutions.listInstituciones({...query,focalizacion_id:4},tenant);
 const coverageAugust=await coverage.getCoberturaResumen({contrato_id:'24',fecha:'2026-08-15',page:1,limit:1000},tenant);
 return {institutions,coverage,august,coverageAugust};
}
async function schemaSignature(c){return canonicalHash((await c.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'focalizacion%' ORDER BY indexname")).rows);}
async function main(){
 if(process.argv.includes('--resume-clean')||process.argv.includes('--resume-applied')){
  const prior=priorCertification();
  assert.equal(prior.clean_rollback.cases.length,3);assert.equal(prior.clean_rollback.followup_application.status,'APPLIED_LOCAL');
  report.clean_rollback=prior.clean_rollback;
  const clean=await connect('septiembre_temporal_rollback');try{const check=await publishSeptemberLocal(clean,snapshot,sources);assert.equal(check.status,'ALREADY_APPLIED');assert.equal(check.run_id,prior.clean_rollback.followup_application.run_id);}finally{await clean.end();}
 }else{
 const clean=await connect('septiembre_temporal_rollback');
 try{
  const baseline=await publicFingerprint(clean),sequences=await sequenceFingerprint(clean);report.clean_rollback={database:'septiembre_temporal_rollback',baseline_tables:Object.keys(baseline).length,cases:[]};
  for(const fault of [{failAfter:344},{fault:'audit'},{fault:'postflight'}]){
   let code;try{await publishSeptemberLocal(clean,snapshot,sources,{mode:'MutateLocal',confirmation:'LOCAL_RESTORATION_ONLY',...fault});}catch(e){code=e.message;}
   assert.ok(code?.startsWith('INDUCED_'),code);
   assert.ok(identical(baseline,await publicFingerprint(clean)),'CLEAN_ROLLBACK_DATA_CHANGED');
   const after=await sequenceFingerprint(clean),changes=sequenceChanges(sequences,after);
   assert.ok(changes.length);for(const k of changes)assert.ok(BigInt(after[k].last_value)>=BigInt(sequences[k].last_value));
   report.clean_rollback.cases.push({fault,code,all_public_tables_identical:true,sequence_changes:changes,sequence_policy:'FORWARD_ONLY_GAPS_ACCEPTED_NO_RESET_OR_REUSE'});
  }
  const afterFaults=await sequenceFingerprint(clean);
  const applied=await publishSeptemberLocal(clean,snapshot,sources,{mode:'MutateLocal',confirmation:'LOCAL_RESTORATION_ONLY'});
  assert.ok(BigInt(applied.load_id)>BigInt(afterFaults.focalizacion_cargas_id_seq.last_value));
  report.clean_rollback.followup_application={...applied,load_id_exceeds_abandoned_ids:true};
 }finally{await clean.end();}
 }
 const c=await connect('septiembre_local');
 try{
  let baseline,schema,app;
  if(process.argv.includes('--resume-applied')){
   const prior=priorCertification();assert.equal(prior.mutate.status,'APPLIED_LOCAL');
   const original=await connect('septiembre_temporal_baseline');try{baseline=await publicFingerprint(original);assert.ok(identical(baseline,prior.baseline));schema=await schemaSignature(original);const before=await readApplication(original);app={...await readApplication(c),august:before.august,coverageAugust:before.coverageAugust};}finally{await original.end();}
   report.preview=prior.preview;report.mutate=prior.mutate;
  }else{
   baseline=await publicFingerprint(c);const sequenceBaseline=await sequenceFingerprint(c);schema=await schemaSignature(c);app=await readApplication(c);
   report.preview=await publishSeptemberLocal(c,snapshot,sources);assert.equal(report.preview.status,'PREVIEW_ONLY');assert.ok(identical(baseline,await publicFingerprint(c)));assert.ok(identical(sequenceBaseline,await sequenceFingerprint(c)));
   report.mutate=await publishSeptemberLocal(c,snapshot,sources,{mode:'MutateLocal',confirmation:'LOCAL_RESTORATION_ONLY'});
  }
  report.baseline=baseline;assert.equal(app.august.total,687);assert.equal(app.coverageAugust.pagination.total,687);
  const after=await publicFingerprint(c);const changed=Object.keys(baseline).filter(k=>!identical(baseline[k],after[k]));assert.ok(changed.every(k=>MONTHLY_WRITE_TABLES.includes(k)));
  report.protected={verified_tables:Object.keys(baseline).length-MONTHLY_WRITE_TABLES.length,changed_tables:changed,all_others_identical:true};
  assert.equal(schema,await schemaSignature(c));report.schema_unchanged=true;
  const august=await app.institutions.listInstituciones({...query,focalizacion_id:4},tenant);
  assert.equal(august.total,687);assert.ok(identical(august.items,app.august.items));assert.ok(identical(august.summary,app.august.summary));
  const september=await app.institutions.listInstituciones({...query,focalizacion_id:Number(report.mutate.load_id)},tenant);
  const all=await app.institutions.listInstituciones({...query,all_focalizaciones:true,page_size:2000},tenant);
  assert.equal(september.total,688);assert.equal(all.total,1375);assert.equal(new Set(september.items.map(r=>r.sede_id+'|'+r.modalidad_id)).size,688);assert.equal(september.filter_options.focalizaciones.length,2);
  const oldCoverage=await app.coverage.getCoberturaResumen({contrato_id:'24',fecha:'2026-08-15',page:1,limit:1000},tenant);
  assert.equal(oldCoverage.pagination.total,687);assert.ok(identical(oldCoverage.items,app.coverageAugust.items));
  const newCoverage=await app.coverage.getCoberturaResumen({contrato_id:'24',fecha:'2026-09-15',page:1,limit:1000},tenant);
  const currentCoverage=await app.coverage.getCoberturaResumen({contrato_id:'24',page:1,limit:1000},tenant);
  assert.equal(newCoverage.pagination.total,688);assert.equal(currentCoverage.pagination.total,688);
  const effectivePayroll=await app.institutions.resolveInstitucionesNominaPeriodo(24,'2026-09-15',tenant);assert.equal(effectivePayroll.nomina_periodo_id,'3');
  const delta=compare(app.august.items.map(r=>({sede_id:r.sede_id,modalidad_id:r.modalidad_id,institucion_id:r.institucion_id})),september.items.map(r=>({sede_id:r.sede_id,modalidad_id:r.modalidad_id,institucion_id:r.institucion_id})));
  assert.equal(delta.counts.altas,25);assert.equal(delta.counts.bajas,24);assert.equal(delta.counts.modalidades,24);
  report.application_reads={august_institutions:august.total,august_dto_identical:true,september_institutions:september.total,all_months:all.total,selector_options:september.filter_options.focalizaciones.map(r=>({id:r.id,nombre:r.nombre})),august_coverage:oldCoverage.pagination.total,august_coverage_identical:true,september_coverage:newCoverage.pagination.total,current_coverage:currentCoverage.pagination.total,nomina_periodo_id:effectivePayroll.nomina_periodo_id,altas:delta.counts.altas,bajas:delta.counts.bajas,cambios_modalidad:delta.counts.modalidades};
  const beforeSecond=await publicFingerprint(c),beforeSequences=await sequenceFingerprint(c);
  report.second=await publishSeptemberLocal(c,snapshot,sources,{mode:'MutateLocal',confirmation:'LOCAL_RESTORATION_ONLY'});
  assert.equal(report.second.status,'ALREADY_APPLIED');assert.ok(identical(beforeSecond,await publicFingerprint(c)));assert.ok(identical(beforeSequences,await sequenceFingerprint(c)));report.second.data_and_sequences_identical=true;
  assert.equal(sha(fs.readFileSync('reports/septiembre-certified-snapshot.json')),sha(snapshotBytes));assert.equal(sha(fs.readFileSync('../../data/focalizacion-septiembre-2026.xlsx')),sha(sourceBytes));
  report.status='MODELO TEMPORAL CORREGIDO Y MUTADOR LOCAL CERTIFICADO — REQUIERE INTEGRACIÓN';report.finished_utc=new Date().toISOString();
  fs.writeFileSync('reports/septiembre-temporal-local-certification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,baseline:undefined},null,2));
 }finally{await c.end();}
}module.exports={service};if(require.main===module)main().catch(e=>{report.status='MUTADOR DETENIDO — MODELO TEMPORAL NO RESUELTO';report.failure={message:e.message,code:e.code??null};fs.writeFileSync('reports/septiembre-temporal-local-stopped.json',JSON.stringify(report,null,2));console.error(e.stack);process.exitCode=1});
