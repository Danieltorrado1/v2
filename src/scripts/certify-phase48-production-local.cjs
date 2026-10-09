// Local certificate: no dotenv, productive URL, HTTP request or remote host.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process'),{Client}=require('pg'),ts=require('typescript'),{runInNewContext}=require('node:vm');
const root=path.resolve(__dirname,'../..'),out=root+'/tmp/phase48-production-cert',bin='C:/Program Files/PostgreSQL/17/bin';
const backup='C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const cfg={host:'127.0.0.1',port:55466,user:'modalidad_verifier',database:'phase48_production',password:'',options:'-c timezone=UTC',connectionTimeoutMillis:5000};
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|PRODUCTION_MIGRATION_DATABASE_URL|SUPABASE|JWT_|INTEGRACION_/.test(k)));
function native(name,args,label){const a=fs.openSync(out+'/'+label+'.raw.out','w'),b=fs.openSync(out+'/'+label+'.raw.err','w');try{const r=spawnSync(bin+'/'+name+'.exe',args,{env,windowsHide:true,stdio:['ignore',a,b]});assert.equal(r.status,0,label);}finally{fs.closeSync(a);fs.closeSync(b);}}
function load(file,deps={}){const exports={},filename=root+'/'+file;runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Buffer,__dirname:path.dirname(filename),require:n=>{if(n in deps)return deps[n];if(n.startsWith('node:'))return require(n);throw Error('UNEXPECTED_DEPENDENCY:'+n);}});return exports;}
const domain=load('src/modules/cobertura/phase48-historical-domain.ts');
const contract=load('src/modules/cobertura/phase48-readonly-contract.ts');
const target=load('src/modules/cobertura/phase48-readonly-target.ts',{'./phase48-readonly-contract':contract});
const readonlyRepository=load('src/modules/cobertura/phase48-readonly-repository.ts',{'./phase48-readonly-contract':contract,'./phase48-readonly-target':target});
const api=load('src/modules/cobertura/phase48-production-executor.ts',{'./phase48-historical-domain':domain,'./phase48-readonly-contract':contract,'./phase48-readonly-target':target,'./phase48-readonly-repository':readonlyRepository});
const localOriginal=load('src/modules/cobertura/phase48-historical-controlled.ts');
const report={started_utc:new Date().toISOString(),production_connections:0,production_writes:0,authorization:'REVOKED',scenarios:[],native:[],backup_sha:api.BACKUP_SHA,code_sha256:Object.fromEntries(['src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-production-authorization.ts','src/modules/cobertura/phase48-readonly-contract.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-historical-domain.ts','src/scripts/phase48-historical-production.ts','sql/phase-48-operational-assignment-identities.sql','src/modules/cobertura/phase48-historical-controlled.ts'].map(f=>[f,sha(fs.readFileSync(root+'/'+f))]))};
const options=extra=>({mode:'SimulateLocal',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:api.BACKUP_SHA,commit:'f'.repeat(40),actualCommit:'f'.repeat(40),projectRef:api.PROJECT_REF,runId:'phase48-'+crypto.randomUUID(),flags:{health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false},...extra});
const record=(scenario,evidence)=>{report.scenarios.push({scenario,pass:true,evidence});console.log(JSON.stringify({scenario,pass:true}));};
let admin,db,observer;
async function restore(database){await admin.query('CREATE DATABASE "'+database+'"');native('pg_restore',['--host=127.0.0.1','--port=55466','--username=modalidad_verifier','--dbname='+database,'--no-password','--no-owner','--no-privileges','--single-transaction','--exit-on-error','--use-list='+out+'/use-list.txt',backup+'/full.dump'],'restore-'+database);}
async function connect(database){const a=new Client({...cfg,database}),b=new Client({...cfg,database});await a.connect();await b.connect();return [a,b];}
async function close(a,b){await a.end();await b.end();}
async function main(){
 assert.equal(sha(fs.readFileSync(root+'/src/modules/cobertura/phase48-historical-controlled.ts')),sha(execFileSync('git',['show','fd6e4aa:src/modules/cobertura/phase48-historical-controlled.ts'],{cwd:root})));
 assert.equal(sha(fs.readFileSync(backup+'/full.dump')),api.BACKUP_SHA);
 const globals=fs.readFileSync(backup+'/globals.sql','utf8');assert.ok(!/\bPASSWORD\s+'(?!')/i.test(globals));
 const roles=[...globals.matchAll(/^CREATE ROLE ([a-z_]+);$/gm)].map(m=>m[1]);fs.writeFileSync(out+'/globals-local.sql',roles.map(r=>'CREATE ROLE "'+r+'" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;').join('\n'));
 const toc=spawnSync(bin+'/pg_restore.exe',['--list',backup+'/full.dump'],{env,encoding:'utf8',windowsHide:true});assert.equal(toc.status,0);
 const excluded=[];const list=toc.stdout.split('\n').map(l=>{if(/ EXTENSION - supabase_vault\s| COMMENT - EXTENSION supabase_vault\s| TABLE DATA vault secrets\s| EVENT TRIGGER - (issue_graphql_placeholder|issue_pg_cron_access|issue_pg_graphql_access|issue_pg_net_access|pgrst_ddl_watch|pgrst_drop_watch)\s/.test(l)){excluded.push(l);return ';'+l;}return l;}).join('\n');assert.equal(excluded.length,9);fs.writeFileSync(out+'/use-list.txt',list);report.local_exclusions=excluded;
 admin=new Client({...cfg,database:'postgres'});await admin.connect();
 assert.equal((await admin.query('SHOW server_version')).rows[0].server_version,'17.11');
 native('psql',['--host=127.0.0.1','--port=55466','--username=modalidad_verifier','--dbname=postgres','-X','--single-transaction','--set=ON_ERROR_STOP=1','--file='+out+'/globals-local.sql'],'globals');
 await restore('phase48_production');[db,observer]=await connect('phase48_production');
 const initial=await domain.historicalSnapshot(db);assert.equal(initial.data.length,224);
 // Compare all public table counts against the dump snapshot. Digest ordering
 // is explicitly COLLATE C, matching the verified backup evidence.
 const expected=JSON.parse(fs.readFileSync(backup+'/source-table-digests.json'));
 for(const e of expected){const actual=(await db.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex') digest FROM public."${e.table}" t`)).rows[0];assert.equal(actual.count,e.count);assert.equal(actual.digest,e.digest);}
 const run=extra=>api.executeAtomic(db,observer,options(extra));
 const pre=await run({mode:'PreflightOnly'});assert.equal(pre.status,'READY');record(1,'PreflightOnly READY');
 const preview=await run({mode:'PreviewOnly'});assert.equal(preview.status,'READY');assert.equal((await domain.historicalSnapshot(db)).digest,initial.digest);record(2,'PreviewOnly READY, zero writes');
 await close(db,observer);db=observer=null;await admin.query('CREATE DATABASE phase48_template TEMPLATE phase48_production');[db,observer]=await connect('phase48_production');
 const first=await run();assert.equal(first.status,'SUCCESS',first.reason);record(3,'SimulateLocal executes the atomic production domain, loopback identity enforced');
 assert.equal(first.writes.phase48,730);record(4,'730 identities');
 assert.equal(first.plan[0].desde,'2026-08-18');assert.equal(first.plan[0].hasta,'2026-09-08');assert.equal(first.plan[0].category_id,'34');record(5,'Albeny history, original 1224 preserved');
 assert.equal(first.plan[1].coverage_id,'11');assert.equal(first.plan[1].category_id,null);assert.equal(first.plan[1].estado_salarial,'REQUIERE_REVISION_SALARIAL');record(6,'Dary history, no inferred category');
 assert.equal(first.newAudits,6);record(7,'3 strict legacy + 3 strict event audits, same transaction');
 const successful=await domain.historicalSnapshot(db);const second=await run();assert.equal(second.status,'ALREADY_APPLIED',second.reason);assert.equal(second.writes,0);assert.equal(second.newAudits,0);assert.equal((await domain.historicalSnapshot(db)).digest,successful.digest);record(8,'Second execution ALREADY_APPLIED; data/schema/sequences unchanged');
 report.first={status:first.status,writes:first.writes,plan:first.plan,new_audits:6,run_id:first.receipt.run_id,baseline:first.receipt};report.second={status:second.status,writes:0,new_audits:0};
 report.audits={legacy:(await db.query('SELECT id::text,usuario_id::text,descripcion,datos_nuevos FROM auditoria WHERE descripcion=$1 ORDER BY id',[api.MARKER])).rows,events:(await db.query('SELECT id::text,usuario_id::text,empresa_id::text,contrato_id::text,descripcion,datos_nuevos FROM auditoria_eventos WHERE descripcion=$1 ORDER BY id',[api.MARKER])).rows};
 const protectedTables=initial.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table));assert.equal(protectedTables.length,221);for(const p of protectedTables)assert.deepEqual(successful.data.find(r=>r.table===p.table),p);
 report.protection={all_public_tables:224,unchanged_tables:221,authorized_audit_tables:2,protected:protectedTables,periods_4_6_unchanged:true,before:initial.digest,after:successful.digest,sequences_before:initial.sequences,sequences_after:successful.sequences,original_local_guard_source_unchanged:true};
 // Every failure gets a NEW clone of the unchanged restore; never reset a
 // pre-existing cluster/database or a successful execution.
 async function scenario(number,extra,setup,expectedReason){const name='phase48_case_'+number;await admin.query('CREATE DATABASE "'+name+'" TEMPLATE phase48_template');const [a,b]=await connect(name);try{await setup?.(a,b);const before=await domain.historicalSnapshot(a);const result=await api.executeAtomic(a,b,options(extra));assert.ok(['STOPPED','ROLLED_BACK'].includes(result.status),JSON.stringify(result));if(expectedReason)assert.ok(result.reason.includes(expectedReason),result.reason);if(number===12||number===13)assert.equal(result.sqlstate,'23502');assert.equal((await domain.historicalSnapshot(a)).digest,before.digest);record(number,{status:result.status,reason:result.reason,sqlstate:result.sqlstate,rollback_digest_equal:true});}finally{await close(a,b);await admin.query('DROP DATABASE "'+name+'"');}}
 for(const [n,failAt] of [[9,'during-phase48'],[10,'after-phase48'],[11,'between-corrections'],[12,'audit-events'],[13,'audit']])await scenario(n,{simulation:{failAt}},null,n>=12?'DATABASE_ERROR':'INDUCED');
 // Real second connection commits a change in a disposable clone. It must be
 // detected before any authorized write; this injected drift is not runner DML.
 for(const [n,hook] of [[14,'beforeLock'],[15,'insideLock']]){const name='phase48_drift_'+n;await admin.query('CREATE DATABASE '+name+' TEMPLATE phase48_template');const [a,b]=await connect(name);try{const original=await domain.historicalSnapshot(a);const result=await api.executeAtomic(a,b,options({simulation:{[hook]:async()=>{await b.query("UPDATE cobertura_asignaciones SET observacion=COALESCE(observacion,'')||' LOCAL_DRIFT' WHERE id=1224");}}}));assert.equal(result.status,'STOPPED');assert.equal(result.reason,'SOURCE_DRIFT_DETECTED');assert.equal((await a.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cobertura_asignaciones' AND column_name='institucion_id'")).rows[0].n,0);assert.equal((await a.query('SELECT count(*)::int n FROM cobertura_asignaciones')).rows[0].n,730);record(n,{status:'STOPPED',reason:result.reason,runner_writes:0,only_external_injected_drift:true,baseline:original.digest});}finally{await close(a,b);await admin.query('DROP DATABASE '+name);}}
 await scenario(16,{},async a=>{await a.query(`INSERT INTO cobertura_asignaciones SELECT (jsonb_populate_record(NULL::cobertura_asignaciones,to_jsonb(ca)||jsonb_build_object('id',(SELECT max(id)+1 FROM cobertura_asignaciones)))).* FROM cobertura_asignaciones ca WHERE id=11`);},'PHASE48_POPULATION_CHANGED');
 await scenario(17,{backupSha:'0'.repeat(64)},null,'BACKUP_SHA_INVALID');
 await scenario(18,{actor:'13'},null,'SCOPE_OR_ACTOR_INVALID');
 await scenario(19,{flags:{health200:true,databaseOk:true,outbox:true,sync:false,recalc:false,worker:false}},null,'HEALTH_OR_FLAGS_UNSAFE');
 await scenario(20,{},async a=>{await a.query('ALTER TABLE cobertura_asignaciones ADD COLUMN institucion_id bigint');},'PARTIAL_STATE_DETECTED');
 await scenario(21,{mode:'MutateProduction',enabled:true,authorization:'REVOKED',confirmation:'revoked'},null,'AUTHORIZATION_REVOKED');
 await assert.rejects(()=>localOriginal.assertHistoricalLocalIdentity({query:async()=>({rows:[{host:'192.0.2.1',port:5432,version:'17.6',directory:'/production',listen:'*',workers:'8',preload:'',database:'postgres'}]})}),/LOCAL_RESTORATION_REQUIRED/);record(22,'Original local runner rejects remote identity; no remote connection opened');
 await scenario(23,{},async(a,b)=>{await b.query('SELECT pg_advisory_lock(15,2448)');},'ADVISORY_LOCK_BUSY');
 // Immediate production baseline gate uses an exclusively loopback client.
 // Only version/TLS metadata are synthetic; every snapshot query is real local.
 const certificationNow=Date.now(),issued=new Date(certificationNow-1000).toISOString(),expires=new Date(certificationNow+599000).toISOString();
 const phraseReceipt=digests=>({commit:'f'.repeat(40),backup_sha:api.BACKUP_SHA,certificate_sha256:contract.CERTIFICATE_SHA256,project_ref:api.PROJECT_REF,scope:{empresa:15,contrato:24,actor:12},phase48_rows:730,digests,nonce:'b'.repeat(64),issued_at:issued,expires_at:expires});
 const baselineCase='phase48_immediate_baseline';await admin.query('CREATE DATABASE '+baselineCase+' TEMPLATE phase48_template');
 const [immediate,immediateObserver]=await connect(baselineCase);
 try{
  const before=await domain.historicalSnapshot(immediate);
  const o=options({mode:'MutateProduction',target:'Production',authorization:'ACTIVE',enabled:true,certificateSha:contract.CERTIFICATE_SHA256,nonceConsumed:true,baseline:'0'.repeat(64),authorizationIssuedAt:issued,authorizationExpiresAt:expires,observeFlags:async()=>options().flags,saveBaseline:async()=>{}});
  o.authorizationPhrase=contract.buildAuthorizationPhrase(contract.authorizationFields(phraseReceipt(Object.fromEntries(contract.DIGEST_FIELDS.map(k=>[k,'a'.repeat(64)])))));
  o.confirmation=api.confirmation(o,o.baseline);
  const proxy={query:(sql,values)=>sql==='SHOW server_version'?Promise.resolve({rows:[{server_version:'17.6'}]}):sql==='SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()'?Promise.resolve({rows:[{ssl:true,version:'TLSv1.3'}]}):immediate.query(sql,values)};
  const result=await api.executeAtomic(proxy,immediateObserver,o);
  assert.equal(result.reason,'IMMEDIATE_BASELINE_CHANGED');assert.equal(result.writes,0);assert.equal((await domain.historicalSnapshot(immediate)).digest,before.digest);
  record(24,{immediate_baseline_rejected:true,loopback_only:true,synthetic_version_tls_metadata:true,zero_writes:true});
  const repo=readonlyRepository.createReadOnlyRepository(immediate),candidates=await repo.candidates(),coverage=await repo.coverage(),affected=await repo.affected(),minimal=await repo.minimalState();
  const exact={schema_digest:contract.contractDigest({schema:before.schema,constraints:before.constraints,indexes:before.indexes,routines:before.routines,triggers:before.triggers}),source_digest:before.digest,phase48_candidate_digest:contract.contractDigest(candidates),albeny_before_digest:minimal.albeny_before_digest,dary_before_digest:minimal.dary_before_digest,protected_tables_digest:contract.contractDigest(before.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table))),periods_4_6_digest:minimal.periods_4_6_digest,write_set_before_digest:await repo.writeSet(before,candidates,coverage,affected)};
  o.baseline=before.digest;
  for(const key of contract.DIGEST_FIELDS){
   o.authorizationPhrase=contract.buildAuthorizationPhrase(contract.authorizationFields(phraseReceipt({...exact,[key]:'0'.repeat(64)})));o.confirmation=api.confirmation(o,o.baseline);
   const drifted=await api.executeAtomic(proxy,immediateObserver,o);assert.equal(drifted.reason,'AUTHORIZATION_BASELINE_CHANGED:'+key);assert.equal(drifted.writes,0);assert.equal((await domain.historicalSnapshot(immediate)).digest,before.digest);
  }
  record(25,{eight_digests_revalidated:true,every_stale_digest_rejected:true,loopback_only:true,zero_writes:true});
  o.authorizationPhrase=contract.buildAuthorizationPhrase(contract.authorizationFields(phraseReceipt(exact)));o.confirmation=api.confirmation(o,o.baseline);
  const valid=await api.executeAtomic(proxy,immediateObserver,o);assert.equal(valid.status,'SUCCESS',valid.reason);assert.equal(valid.newAudits,6);assert.equal(valid.writes.phase48,730);
  record(26,{complete_authorization_baseline_accepted:true,atomic_local_execution:true,loopback_only:true,synthetic_version_tls_metadata:true,production_connections:0,production_writes:0});
 }finally{await close(immediate,immediateObserver);await admin.query('DROP DATABASE '+baselineCase);}
 // Additional adversarial gates beyond the requested 22.
 for(const extra of [{mode:'UNKNOWN'},{empresa:16},{contrato:25},{projectRef:'wrong'},{commit:'0'.repeat(40)},{flags:{health200:false,databaseOk:false,outbox:false,sync:false,recalc:false,worker:false}}])assert.throws(()=>api.validateOptions(options(extra)));
 await close(db,observer);db=observer=null;
 await admin.query('CREATE DATABASE phase48_malformed_audit TEMPLATE phase48_production');
 const [malformed,malformedObserver]=await connect('phase48_malformed_audit');
 try{await malformed.query('UPDATE auditoria SET datos_nuevos=NULL WHERE id=$1',[report.audits.legacy[0].id]);const before=await domain.historicalSnapshot(malformed);const result=await api.executeAtomic(malformed,malformedObserver,options());assert.equal(result.status,'STOPPED');assert.equal(result.reason,'PARTIAL_STATE_DETECTED');assert.equal((await domain.historicalSnapshot(malformed)).digest,before.digest);report.adversarial={malformed_audit_registry:{status:result.status,reason:result.reason,writes:0,digest_unchanged:true}};}finally{await close(malformed,malformedObserver);await admin.query('DROP DATABASE phase48_malformed_audit');}
 await admin.query('DROP DATABASE phase48_production');await admin.query('DROP DATABASE phase48_template');report.success=true;
}
(async()=>{try{await main();}catch(e){report.success=false;report.failure={message:e.message,code:e.code};process.exitCode=1;console.error(JSON.stringify({status:'CERTIFICATION_FAILED',message:e.message,code:e.code}));}finally{for(const c of [db,observer,admin])if(c)await c.end().catch(()=>{});delete process.env.PGPASSWORD;delete process.env.PRODUCTION_MIGRATION_DATABASE_URL;report.completed_utc=new Date().toISOString();fs.writeFileSync(out+'/certificate.json',JSON.stringify(report,null,2)+'\n');}})();
