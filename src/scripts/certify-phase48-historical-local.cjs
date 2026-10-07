// Fixed isolated loopback cluster. Never loads .env or accepts connection URLs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('pg');
const assert=require('node:assert/strict'),ts=require('typescript'),{runInNewContext}=require('node:vm');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'tmp/phase48-historical-cert');
const backup='C:/Users/CORE ULTRA/Documents/EmpiriaBackups/focalizacion-septiembre-pre-import-retry-20261001T125631Z';
const backupHash='2e2f0608f609e2e3123e6bfdf56067bae08f11719cc3939ca73d0cdc387f0bc1';
const conn={host:'127.0.0.1',port:55465,user:'modalidad_verifier',database:'phase48_historical',password:'',connectionTimeoutMillis:5000};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const check=(x,msg)=>{if(!x)throw Error(msg);};
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|SUPABASE|JWT_|INTEGRACION_/.test(k)));
function run(name,args,log){
 const fd=fs.openSync(path.join(out,log),'w');
 try{const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/'+name+'.exe',args,{env,windowsHide:true,stdio:['ignore',fd,fd]});check(!r.error&&r.status===0,name+'_FAILED');}finally{fs.closeSync(fd);}
}
function runPostgresRestore(database,log){
 check(['phase48_historical','phase48_historical_faults'].includes(database),'RESTORE_DATABASE_NOT_ALLOWED');
 run('pg_restore',['--host=127.0.0.1','--port=55465','--username=modalidad_verifier','--dbname='+database,'--no-password','--no-owner','--no-privileges','--exit-on-error','--single-transaction','--use-list='+path.join(backup,'local-restore-use-list.txt'),path.join(backup,'full.dump')],log);
}
async function identity(db){
 const r=(await db.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version') version,
 current_setting('data_directory') directory,current_setting('listen_addresses') listen,current_setting('max_worker_processes') workers,
 current_setting('shared_preload_libraries') preload`)).rows[0];
 check(r.host==='127.0.0.1'&&r.port===55465&&r.version==='17.11'&&r.directory.replaceAll('\\','/')===path.join(out,'cluster').replaceAll('\\','/')&&r.listen==='127.0.0.1'&&r.workers==='0'&&r.preload==='','LOCAL_IDENTITY_MISMATCH');
 return r;
}
async function annulledPeriodDigests(db){
 const tables=(await db.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='periodo_id' ORDER BY table_name`)).rows.map(r=>r.table_name);
 const rows=[];
 for(const period of ['4','6'])for(const table of ['nomina_periodos',...tables]){
  check(/^[a-z0-9_]+$/.test(table),'INVALID_PERIOD_TABLE');
  const r=(await db.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest
   FROM public."${table}" t WHERE ${table==='nomina_periodos'?'id':'periodo_id'}=$1::bigint`,[period])).rows[0];
  rows.push({periodo:period,table,...r});
 }
 return rows;
}
function load(file,dependencies={}){
 const exports={};const filename=path.join(root,file);
 runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Date,Buffer,process:{env:{}},__dirname:path.dirname(filename),require:name=>{
   if(name in dependencies)return dependencies[name];
   if(name.startsWith('node:'))return require(name);
   throw Error('UNISOLATED_DEPENDENCY:'+name);
  }});
 return exports;
}
async function certify(db){
 const controlled=load('src/modules/cobertura/phase48-historical-controlled.ts');
 const run=(operation,opts={})=>controlled.runPhase48HistoricalLocal(db,operation,{actor:'12',...opts});
 const mutation=(operation,preview,extra={})=>run(operation,{mode:'MutateLocal',enabled:true,confirmation:`LOCAL_ONLY:${operation}:15:24`,baseline:preview.baseline,revision:preview.revision,...extra});
 const snap=()=>controlled.historicalSnapshot(db);
 const report={started_utc:new Date().toISOString(),server:'17.11',backup_sha256:backupHash,production_connections:0,production_writes:0,checks:[]};
 const record=(name)=>{report.checks.push({name,pass:true});};
 const initial=await snap();
 const protectedPeriods=await annulledPeriodDigests(db);
 assert.equal((await db.query("SELECT count(*)::int n FROM nomina_periodos WHERE id IN(4,6) AND contrato_id=24 AND estado='ANULADO'")).rows[0].n,2);
 fs.writeFileSync(path.join(out,'baseline-digests.json'),JSON.stringify(initial,null,2));
 await assert.rejects(()=>run('Phase48',{actor:undefined}),/TECHNICAL_ACTOR_REQUIRED/);record('mandatory technical actor');
 await assert.rejects(()=>run('Phase48',{mode:'MutateLocal'}),/LOCAL_CONFIRMATION_AND_BASELINE_REQUIRED/);record('mutation disabled by default');
 const phasePreview=await run('Phase48');assert.equal(phasePreview.status,'PREVIEW_ONLY');assert.equal((await snap()).digest,initial.digest);record('Phase48 preview writes zero');
 fs.writeFileSync(path.join(out,'phase48-preview.json'),JSON.stringify(phasePreview,null,2));
 await assert.rejects(()=>mutation('Phase48',phasePreview,{baseline:'0'.repeat(64)}),/IMMEDIATE_BASELINE_CHANGED/);record('immediate baseline mismatch rejected');
 await assert.rejects(()=>mutation('Phase48',phasePreview,{revision:'0'.repeat(64)}),/PREVIEW_REVISION_CHANGED/);record('preview revision binds SQL and exact expected values');
 await assert.rejects(()=>mutation('Phase48',phasePreview,{failAt:'after-phase-ddl'}),/INDUCED_FAILURE_AFTER_PHASE_DDL/);
 assert.equal((await snap()).digest,initial.digest);record('Phase48 DDL rollback including data/schema/sequences');
 const phaseFirst=await mutation('Phase48',phasePreview);assert.equal(phaseFirst.status,'APPLIED_LOCAL');
 const phaseSecond=await mutation('Phase48',await run('Phase48'));assert.equal(phaseSecond.status,'ALREADY_APPLIED');assert.equal(phaseFirst.after.digest,phaseSecond.after.digest);record('Phase48 twice, second execution changes zero');
 assert.equal(phaseFirst.plan[0].backfill_count,727);assert.equal(phaseSecond.plan[0].backfill_count,0);
 report.phase48={first:phaseFirst.status,second:phaseSecond.status,first_backfill:727,second_backfill:0,sql_sha256:phaseFirst.sql_sha256,before:phaseFirst.before.digest,after:phaseFirst.after.digest};
 const historyPreview=await run('HistoricalCorrections');assert.equal(historyPreview.status,'PREVIEW_ONLY');
 assert.equal(historyPreview.plan[0].category_id,'34');assert.equal(historyPreview.plan[1].category_id,null);
 assert.equal(historyPreview.plan[1].estado_salarial,'REQUIERE_REVISION_SALARIAL');record('CAA category 34; CAA-JU unresolved, no equivalence');
 fs.writeFileSync(path.join(out,'historical-preview.json'),JSON.stringify(historyPreview,null,2));
 // A held advisory lock is a real concurrent session, not a mocked response.
 const other=new Client(conn);await other.connect();
 try{await other.query('BEGIN');await other.query('SELECT pg_advisory_xact_lock(15,2448)');await assert.rejects(()=>run('HistoricalCorrections'),/ADVISORY_LOCK_BUSY/);record('advisory lock concurrency');}
 finally{await other.query('ROLLBACK');await other.end();}
 const historyFirst=await mutation('HistoricalCorrections',historyPreview);assert.equal(historyFirst.status,'APPLIED_LOCAL');
 const historySecond=await mutation('HistoricalCorrections',await run('HistoricalCorrections'));assert.equal(historySecond.status,'ALREADY_APPLIED');assert.equal(historyFirst.after.digest,historySecond.after.digest);record('historical second execution no rows/audits/sequence changes');
 report.historical={first:historyFirst.status,second:historySecond.status,plan:historyFirst.plan,before:historyFirst.before.digest,after:historyFirst.after.digest};
 // After successful first/second execution, restore the SAME authorized dump
 // to a second database in this isolated cluster for fault injection. This is
 // not a new backup and never resets or alters the certified successful data.
 await db.query('DROP DATABASE IF EXISTS phase48_historical_faults WITH (FORCE)');
 await db.query('CREATE DATABASE phase48_historical_faults');
 runPostgresRestore('phase48_historical_faults','fault-restore.log');
 const faultDb=new Client({...conn,database:'phase48_historical_faults'});await faultDb.connect();
 try {
  const faultRun=(operation,extra={})=>controlled.runPhase48HistoricalLocal(faultDb,operation,{actor:'12',...extra});
  const faultMutate=(operation,p,extra={})=>faultRun(operation,{mode:'MutateLocal',enabled:true,confirmation:`LOCAL_ONLY:${operation}:15:24`,baseline:p.baseline,revision:p.revision,...extra});
  await faultMutate('Phase48',await faultRun('Phase48'));
  const p=await faultRun('HistoricalCorrections');const baseline=await controlled.historicalSnapshot(faultDb);
  report.rollback={isolated_database:'phase48_historical_faults',after_successful_double_application:true,before:baseline.digest,tests:[]};
  for(const fault of ['after-first-correction','after-audit']){
   await assert.rejects(()=>faultMutate('HistoricalCorrections',p,{failAt:fault}),/INDUCED_FAILURE/);
   const after=await controlled.historicalSnapshot(faultDb);assert.equal(after.digest,baseline.digest);
   report.rollback.tests.push({fault,after:after.digest,identical:true});record('total historical rollback '+fault+' including audit and sequences');
  }
 } finally {await faultDb.end();}
 const {AppError}=load('src/utils/AppError.ts');
 let pending=Promise.resolve();
 const serialQuery=(...args)=>{const result=pending.then(()=>db.query(...args));pending=result.catch(()=>{});return result;};
 const pool={query:serialQuery,connect:async()=>({query:serialQuery,release(){}})};
 const config={'../../config/db':{dbPool:pool,dbQuery:pool.query},'../../utils/AppError':{AppError}};
 const context=load('src/modules/integracion/contexto-laboral.service.ts',config);
 const salary=load('src/modules/nomina/canonical-salary-timeline.ts',{'../../utils/AppError':{AppError},'../integracion/contexto-laboral.service':context});
 const domain=load('src/modules/vinculaciones/vinculaciones.personal.domain.ts');
 const noWrites=async()=>{throw Error('READER_ATTEMPTED_MUTATION');};
 const tenant={assertTenantAccessForVinculacionId:async(_tenant,id)=>assert.ok(['249','1555'].includes(String(id)))};
 const personal=load('src/modules/vinculaciones/vinculaciones.personal.service.ts',{
  ...config,'../../middlewares/tenantMiddleware':tenant,'../auditoria/auditoria.helper':{registerAuditEntry:noWrites},
  '../integracion/integracion.service':{publicarEventoOutbox:noWrites},'../cobertura/cobertura-asignacion.service':{persistCanonicalAssignmentVersion:noWrites},
  '../nomina/infrastructure/repositories/nomina-poblacion.repository':{},'../documentos/documentos.checklist.service':{},'./vinculaciones.personal.domain':domain,
 });
 const dates=[['1555','2026-08-18',1],['1555','2026-09-08',1],['1555','2026-09-09',1],['249','2026-07-29',5],['249','2026-07-31',5],['249','2026-08-01',5]];
 report.readers=[];
 for(const [v,fecha,modality] of dates){
  const at=await context.resolveOperationalContextAtDate({empresaId:15,contratoId:24,vinculacionId:Number(v),fecha},db);
  assert.equal(at.modalidad_id,modality);
  const p=await personal.getVinculacionPersonalContext(Number(v),undefined,fecha);
  assert.equal(p.asignacion_operativa_actual.modalidad,modality===1?'CAA':'CAA-JU');
  assert.equal(p.asignacion_operativa_actual.id,at.id);
  report.readers.push({vinculacion:v,fecha,modalidad_id:modality,cobertura_id:at.id,personal:true,planilla:true});
 }
 record('Personal and daily Planilla canonical reader exact boundaries on restored database');
 for(const [v,desde,hasta] of [['1555','2026-08-18','2026-09-30'],['249','2026-07-29','2026-09-30']]){
  const line=await context.resolveOperationalContextTimeline({empresaId:15,contratoId:24,vinculacionId:Number(v),fechaInicio:desde,fechaFin:hasta},db);
  assert.equal(line.huecos.length,0);report.readers.push({vinculacion:v,huecos:0,tramos:line.tramos.map(r=>({id:r.id,desde:r.fecha_inicio,hasta:r.fecha_fin,modalidad_id:r.modalidad_id}))});
 }
 record('no gaps, no overlaps, IDs 11/1221/1223/1224 conserved');
 const albeny=await salary.canonicalSalaryTimeline(db,{empresaId:15,contratoId:24,vinculacionId:1555,fechaInicio:'2026-08-18',fechaFin:'2026-09-08'});
 assert.equal(albeny.length,1);assert.equal(albeny[0].categoria.categoria_id,'34');assert.equal(albeny[0].dias,22);
 await assert.rejects(()=>salary.canonicalSalaryTimeline(db,{empresaId:15,contratoId:24,vinculacionId:249,fechaInicio:'2026-07-29',fechaFin:'2026-07-31'}),e=>e.code==='REQUIERE_REVISION_SALARIAL');
 record('payroll forms Albeny 22-day segment; Dary economic calculation blocked');
 assert.equal(await context.resolveOperationalContextAtDate({empresaId:99,contratoId:24,vinculacionId:1555,fecha:'2026-08-18'},db),null);
 assert.equal(await context.resolveOperationalContextAtDate({empresaId:15,contratoId:99,vinculacionId:1555,fecha:'2026-08-18'},db),null);record('company/contract reader isolation');
 assert.equal((await db.query(`SELECT count(*)::int n FROM nomina_asistencia_diaria WHERE vinculacion_id=1555 AND fecha BETWEEN '2026-08-18' AND '2026-09-08'`)).rows[0].n,16);
 assert.equal((await db.query(`SELECT count(*)::int n FROM nomina_asistencia_diaria WHERE vinculacion_id=249 AND fecha BETWEEN '2026-07-29' AND '2026-07-31'`)).rows[0].n,0);record('16 existing attendances conserved, zero retroactive Dary attendances');
 const final=await snap();assert.equal(final.digest,historyFirst.after.digest);record('readers caused no writes or automatic calculation');
 const periodsAfter=await annulledPeriodDigests(db);assert.deepEqual(protectedPeriods,periodsAfter);
 report.periodos_anulados=protectedPeriods.map((before,i)=>({...before,after_count:periodsAfter[i].count,after_digest:periodsAfter[i].digest,equal:true}));
 record('periods 4 and 6 per-table counts and digests exactly preserved');
 report.protected=initial.data.filter(r=>!['cobertura_asignaciones','auditoria'].includes(r.table)).map(before=>{const after=final.data.find(r=>r.table===before.table);assert.deepEqual(before,after);return {...before,after_digest:after.digest,equal:true};});
 report.protected_table_count=report.protected.length;
 report.salary_audit={categories:(await db.query(`SELECT id::text,codigo_categoria,modalidad,activo,vigente_desde::text,vigente_hasta::text FROM nomina_categorias_salariales WHERE contrato_id=24 ORDER BY id`)).rows,
  configuration:(await db.query(`SELECT modalidad_id::text,estado,count(*)::int count FROM calculadora_personal_config WHERE contrato_id=24 GROUP BY modalidad_id,estado ORDER BY modalidad_id,estado`)).rows,
  history:(await db.query(`SELECT ca.id::text,ca.vinculacion_id::text,ca.modalidad_id::text,ca.fecha_inicio::text,ca.fecha_fin::text,ca.activo FROM cobertura_asignaciones ca WHERE ca.vinculacion_id IN(249,1555) ORDER BY ca.id`)).rows,
  economic_conditions:(await db.query(`SELECT vinculacion_id::text,tipo_condicion,vigencia_desde::text,vigencia_hasta::text,activo FROM vinculacion_condiciones_economicas WHERE vinculacion_id IN(249,1555) ORDER BY id`)).rows};
 report.final_digest=final.digest;report.status='SQL_CHECKS_PASS_TEMPORAL_PENDING';
 fs.writeFileSync(path.join(out,'final-digests.json'),JSON.stringify(final,null,2));
 fs.writeFileSync(path.join(out,'certification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,protected_tables:report.protected_table_count,phase48:report.phase48,historical_first:historyFirst.status,historical_second:historySecond.status,production_writes:0}));
}
async function main(){
 check(hash(fs.readFileSync(path.join(backup,'full.dump')))===backupHash,'BACKUP_HASH_MISMATCH');
 const admin=new Client({...conn,database:'postgres'});await admin.connect();
 try{
  await identity(admin);
  if(process.argv.includes('--fresh-local-restoration'))await admin.query('DROP DATABASE IF EXISTS phase48_historical WITH (FORCE)');
  if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[conn.database])).rowCount){
   if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='authenticated'")).rowCount)await admin.query('CREATE ROLE authenticated NOLOGIN');
   await admin.query('CREATE DATABASE phase48_historical');
   runPostgresRestore('phase48_historical','restore.log');
  }
 }finally{await admin.end();}
 const db=new Client(conn);await db.connect();
 try{
  await identity(db);
  const probe={
   cobertura:(await db.query(`SELECT ca.id,ca.vinculacion_id,ca.contrato_id,ca.fecha_inicio::text,ca.fecha_fin::text,ca.activo,ca.municipio_id,ca.focalizacion_final_id,ff.institucion_id,ff.sede_id,ff.modalidad_id FROM cobertura_asignaciones ca LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id WHERE ca.vinculacion_id IN(249,1555) ORDER BY ca.vinculacion_id,ca.id`)).rows,
   vinculaciones:(await db.query(`SELECT id,empresa_id,contrato_id,fecha_inicio::text,fecha_fin::text FROM vinculaciones WHERE id IN(249,1555)`)).rows,
   categorias:(await db.query(`SELECT id,contrato_id,codigo_categoria,modalidad,activo,vigente_desde::text,vigente_hasta::text FROM nomina_categorias_salariales WHERE contrato_id=24 ORDER BY id`)).rows,
   periodos:(await db.query(`SELECT id,estado,fecha_inicio::text,fecha_fin::text FROM nomina_periodos WHERE contrato_id=24 ORDER BY id`)).rows,
   asistencia:(await db.query(`SELECT vinculacion_id,count(*)::int count FROM nomina_asistencia_diaria WHERE vinculacion_id IN(249,1555) AND fecha BETWEEN '2026-07-29' AND '2026-09-08' GROUP BY vinculacion_id`)).rows
  };
  fs.writeFileSync(path.join(out,'restoration-probe.json'),JSON.stringify(probe,null,2));
  await certify(db);
  await db.query('DROP DATABASE IF EXISTS phase48_temporal_fixtures WITH (FORCE)');
  await db.query('CREATE DATABASE phase48_temporal_fixtures');
  const fd=fs.openSync(path.join(out,'postgres17-temporal.tap'),'w');
  try{
   const test=spawnSync(process.execPath,[path.join(root,'src/scripts/test-instituciones-modalidad.cjs'),'src/tests/instituciones.modalidad-temporal.test.ts'],
    {cwd:root,env:{...env,MODALIDAD_LOCAL_PG_CERT:'1'},windowsHide:true,stdio:['ignore',fd,fd]});
   check(!test.error&&test.status===0,'POSTGRES17_TEMPORAL_TEST_FAILED');
  }finally{fs.closeSync(fd);}
  const certificate=JSON.parse(fs.readFileSync(path.join(out,'certification.json'),'utf8'));
  const temporalLog=fs.readFileSync(path.join(out,'postgres17-temporal.tap'),'utf8');
  const passed=Number(temporalLog.match(/(?:ℹ pass|# pass) (\d+)/)?.[1]);
  const failed=Number(temporalLog.match(/(?:ℹ fail|# fail) (\d+)/)?.[1]);
  check(passed>=19&&failed===0,'TEMPORAL_TEST_SUMMARY_REQUIRED');
  certificate.postgresql_temporal_tests={pass:passed,fail:failed,log_sha256:hash(temporalLog)};
  certificate.status='PASS';
  certificate.finished_utc=new Date().toISOString();
  fs.writeFileSync(path.join(out,'certification.json'),JSON.stringify(certificate,null,2));
  console.log('PostgreSQL 17.11 temporal endpoint tests: PASS');
 }finally{await db.end();}
}
main().catch(e=>{console.error(e.message);console.error((e.stack??'').split('\n').filter(s=>s.includes('certify-phase48-historical-local.cjs')).join('\n'));process.exitCode=1;});
