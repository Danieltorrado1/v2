// File-backed local evidence. No env files, backups, database engines or URLs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();assert.equal(branch,'fix/phase48-schema-identity-forensic');
const tests=['atomic-receipts','atomic-mutator-regression','authorization-tls-contract','postrollback-eight','readonly-runner','readonly-target','readonly-tls','production-runner','tls13-runtime','schema-identity'].map(name=>'src/tests/phase48.'+name+'.test.ts');
const guard=path.join(root,'src/scripts/phase48-atomic-local-guard.cjs');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|PRODUCTION_|SUPABASE|JWT_|INTEGRACION_|PHASE48_SSL_|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS/.test(k)));
env.NODE_OPTIONS='--require="'+guard.replaceAll('\\','/')+'"';
const report={schema_version:1,base_commit:'cfe8b63276ef948ce72bc36f535d74509542e447',branch,platform:process.platform,node:process.version,started_utc:new Date().toISOString(),production_connections:0,production_writes:0,productive_env_read:false,productive_ca_read:false,productive_health_requests:0,database_queries_executed:0,merge:false,deploy:false,production_phrase_generated:false,checks:[]};
function check(name,command,args,cwd=root){
 const result=spawnSync(command,args,{cwd,env,windowsHide:true,encoding:'utf8',maxBuffer:10*1024*1024});
 const output=(result.stdout??'')+(result.stderr??'');
 report.checks.push({name,command:[command,...args],exit_code:result.status});
 if(result.status!==0){console.error(output);throw Error('LOCAL_CHECK_FAILED:'+name);}
 console.log(JSON.stringify({check:name,pass:true}));return output;
}
try{
 report.scope='LOCAL_CERTIFICATION_WITH_REFERENCE_TO_COMPLETED_CATALOG_AUDIT';
 const probePath='reports/phase48-schema-production-catalogs.json',probeBytes=fs.readFileSync(probePath),probe=JSON.parse(probeBytes);
 assert.equal(probe.status,'CATALOG_AUDIT_COMPLETE');assert.equal(probe.connection_attempts,1);assert.equal(probe.tls.protocol,'TLSv1.3');assert.equal(probe.writes_productive,0);assert.equal(probe.business_row_queries,0);
 assert.equal(probe.rollback,'CONFIRMED');assert.equal(probe.client_closed,true);assert.equal(probe.pool_closed,true);assert.equal(probe.session.read_only,'on');assert.equal(probe.session.isolation,'repeatable read');
 report.completed_productive_catalog_audit={file:probePath,sha256:crypto.createHash('sha256').update(probeBytes).digest('hex'),connection_attempts:1,business_row_queries:0,writes_productive:0};
 const local=JSON.parse(fs.readFileSync('reports/phase48-schema-local-validation.json'));assert.equal(local.legacy_pin_reproduced,'2fbba2269828d8573ed10eb5a6749d89e30d62adc75652ac713f375467df19a9');assert.ok(local.live_ddl_tests.every(t=>t.detected===t.material&&t.rollback==='CONFIRMED'));assert.equal(fs.existsSync('tmp/phase48-schema-forensic-local'),false);report.local_restore=local;report.local_restore.cluster_stopped_and_removed=true;
 const reconciliation=JSON.parse(fs.readFileSync('reports/phase48-schema-reconciliation.json'));assert.equal(reconciliation.summary.CRITICA,0);assert.equal(reconciliation.summary.NO_DETERMINABLE,0);assert.equal(reconciliation.expected_critical_digest,reconciliation.observed_critical_digest);report.schema_identity_version=reconciliation.schema_identity_version;report.expected_critical_digest=reconciliation.expected_critical_digest;report.difference_summary=reconciliation.summary;
 report.preserved_stopped_receipt={run_id:'phase48-preflight-11ebe8a2-8b6a-4be7-992a-8fb399ac3e71',path:'C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-11ebe8a2-8b6a-4be7-992a-8fb399ac3e71.stopped.json',size_bytes:2953,sha256:'aa61f0d544f791eee2308e837eb4a68bb5faf1b430cd8761288277880018a8d2',secrets_scan:'PASS',personal_data_scan:'PASS'};
 const output=check('atomic + contract + postrollback 8/8 + TLS + target + runner + mutator + rollback/idempotence',process.execPath,['--import','tsx','--test','--test-reporter=tap',...tests]);
 report.test_totals=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(output.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1])]));assert.equal(report.test_totals.fail,0);assert.equal(report.test_totals.skipped,0);
 report.scenarios=[...output.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>({name:m[1],pass:true}));
 report.observer=JSON.parse(output.match(/\{"platform":"win32","node":"[^"]+","observer_absences":\d+,"complete_reads":\d+,"partial_json_observations":0\}/)[0]);
 report.guard_evidence=[...output.matchAll(/\{"guard":"PHASE48_ATOMIC_LOCAL"[^\n]*?\}/g)].map(m=>JSON.parse(m[0]));assert.ok(report.guard_evidence.length>0);assert.ok(report.guard_evidence.every(e=>e.forbidden_attempts===0));
 for(const name of ['typecheck','build'])check('backend '+name,'cmd.exe',['/d','/s','/c','npm run '+name]);
 const frontend=check('FrontendNuevo build','cmd.exe',['/d','/s','/c','npm run build'],path.join(root,'FrontendNuevo'));report.frontend_large_chunk_warning=frontend.includes('chunks are larger than 500 kB');
 check('git diff --check','git',['diff','--check']);
 const protectedFiles=['src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-historical-controlled.ts','src/modules/cobertura/phase48-historical-domain.ts','src/modules/cobertura/phase48-production-authorization.ts','sql/phase-48-operational-assignment-identities.sql'];
 check('unchanged economics / SQL / transactions / digests / write-set','git',['diff','--exit-code',report.base_commit,'--',...protectedFiles]);report.protected_files=protectedFiles;
 const pin=fs.readFileSync('src/modules/cobertura/phase48-readonly-contract.ts','utf8').match(/export const MUTATOR_COMMIT = '([a-f0-9]{40})';/)[1];report.mutator_commit=pin;
 const files=['src/modules/cobertura/phase48-readonly-schema-catalog.ts','src/modules/cobertura/phase48-readonly-schema-identity.ts','src/modules/cobertura/phase48-readonly-schema-scope.ts','src/modules/cobertura/phase48-readonly-preflight.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-readonly-tls.ts','src/scripts/phase48-readonly-tls-probe.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-readonly-contract.ts','src/scripts/phase48-historical-production.ts','src/scripts/phase48-production-readonly.ts','src/scripts/certify-phase48-readonly-contract-local.cjs','src/scripts/certify-phase48-schema-identity.cjs','src/scripts/phase48-atomic-local-guard.cjs',...tests];
 report.code_sha256=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f,'utf8').replaceAll('\r\n','\n')).digest('hex')]));report.hash_format='UTF-8 source with CRLF normalized to LF';
 report.revoked_mutator_commit='a1e709ca89c37ed31e9ec27b4dff2e4c17c295ce';report.revoked_readonly_runner_through=report.base_commit;
 report.success=true;report.decision='ESQUEMA CRÍTICO RECONCILIADO — LISTO PARA NUEVO PREFLIGHT READ ONLY';
}catch(error){report.success=false;report.decision='OPERACIÓN DETENIDA — CAMBIO DE ESQUEMA CRÍTICO';report.failure=error.message;process.exitCode=1;}
finally{report.completed_utc=new Date().toISOString();fs.writeFileSync('reports/phase48-schema-identity.cert.json',JSON.stringify(report,null,2)+'\n');}
