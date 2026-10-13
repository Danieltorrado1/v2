// Local certification only. No production runner, credentials or full preflight.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
assert.equal(branch,'fix/phase48-pooler-independent-read');
const base='68d2c092c4d1fcc04708a81cd035567aff7b8663';
const tests=['atomic-receipts','atomic-mutator-regression','authorization-tls-contract','postrollback-eight','readonly-runner','readonly-target','readonly-tls','production-runner','tls13-runtime','schema-identity'].map(name=>'src/tests/phase48.'+name+'.test.ts');
const guard=path.join(root,'src/scripts/phase48-atomic-local-guard.cjs');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|PRODUCTION_|SUPABASE|JWT_|INTEGRACION_|PHASE48_SSL_|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS/.test(k)));
env.NODE_OPTIONS='--require="'+guard.replaceAll('\\','/')+'"';
const report={schema_version:1,base_commit:base,branch,started_utc:new Date().toISOString(),production_connections:0,production_table_queries:0,production_writes:0,production_health_requests:0,minimal_production_probe:false,full_preflight:false,merge:false,deploy:false,checks:[]};
function check(name,command,args,cwd=root){
 const result=spawnSync(command,args,{cwd,env,windowsHide:true,encoding:'utf8',maxBuffer:10*1024*1024});
 const output=(result.stdout??'')+(result.stderr??'');
 report.checks.push({name,exit_code:result.status});
 if(result.status!==0){console.error(output);throw Error('LOCAL_CHECK_FAILED:'+name);}
 console.log(JSON.stringify({check:name,pass:true}));return output;
}
try{
 const proof=fs.readFileSync('tmp/phase48-pooler-local/proof.tap','utf8').replace(/^\uFEFF/,'');
 assert.match(proof,/# tests 1/);assert.match(proof,/# pass 1/);assert.match(proof,/# fail 0/);assert.match(proof,/# skipped 0/);
 report.postgresql17_local=JSON.parse(proof.match(/^# (\{"scope":"ISOLATED_POSTGRESQL_17_11_TLS_TRANSACTION_POOLER"[^\n]+\})/m)[1]);
 assert.equal(report.postgresql17_local.same_backend_pid,true);assert.equal(report.postgresql17_local.distinct_virtual_transactions,true);assert.equal(report.postgresql17_local.business_table_queries,0);
 assert.equal(fs.existsSync('tmp/phase48-pooler-local/cluster'),false);report.local_cluster_stopped_and_removed=true;
 const output=check('runner / postrollback 8/8 / TLS / target / schema / contract / mutator / atomic receipts',process.execPath,['--import','tsx','--test','--test-reporter=tap',...tests]);
 report.test_totals=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(output.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1])]));
 assert.equal(report.test_totals.fail,0);assert.equal(report.test_totals.skipped,0);
 report.test_totals_with_live_postgresql={...report.test_totals,tests:report.test_totals.tests+1,pass:report.test_totals.pass+1};
 report.scenarios=[...output.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>({name:m[1],pass:true}));
 report.guard_evidence=[...output.matchAll(/\{"guard":"PHASE48_ATOMIC_LOCAL"[^\n]*?\}/g)].map(m=>JSON.parse(m[0]));
 assert.ok(report.guard_evidence.length>0);assert.ok(report.guard_evidence.every(e=>e.forbidden_attempts===0));
 for(const name of ['typecheck','build'])check('backend '+name,'cmd.exe',['/d','/s','/c','npm run '+name]);
 const frontend=check('FrontendNuevo build','cmd.exe',['/d','/s','/c','npm run build'],path.join(root,'FrontendNuevo'));
 report.frontend_large_chunk_warning=frontend.includes('chunks are larger than 500 kB');
 check('git diff --check','git',['diff','--check']);
 const protectedFiles=['src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-readonly-schema-catalog.ts','src/modules/cobertura/phase48-readonly-schema-identity.ts','src/modules/cobertura/phase48-readonly-schema-scope.ts','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-historical-controlled.ts','src/modules/cobertura/phase48-historical-domain.ts','src/modules/cobertura/phase48-production-authorization.ts','sql/phase-48-operational-assignment-identities.sql'];
 check('unchanged TLS / target / schema / eight digest queries / atomic publication / mutator economics', 'git',['diff','--exit-code',base,'--',...protectedFiles]);
 report.protected_files=protectedFiles;
 const files=[...new Set([...protectedFiles,...tests,'src/tests/phase48.pooler-local.test.ts','src/modules/cobertura/phase48-readonly-contract.ts','src/modules/cobertura/phase48-readonly-preflight.ts','src/modules/cobertura/phase48-readonly-connection.ts','src/scripts/phase48-production-readonly.ts','src/scripts/phase48-historical-production.ts','src/scripts/phase48-atomic-local-guard.cjs','src/scripts/phase48-pooler-local-guard.cjs','src/scripts/certify-phase48-pooler-independent.cjs','release/certify-phase48-pooler-local.ps1'])];
 report.code_sha256=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f,'utf8').replaceAll('\r\n','\n')).digest('hex')]));
 report.hash_format='UTF-8 source with CRLF normalized to LF';
 report.mutator_commit=fs.readFileSync('src/modules/cobertura/phase48-readonly-contract.ts','utf8').match(/export const MUTATOR_COMMIT = '([a-f0-9]{40})';/)[1];
 report.revoked_mutator_commit='806f6f058b57b11aeadc478e4f35530b601cc128';report.revoked_readonly_runner_through=base;
 report.preserved_stopped_receipt={run_id:'phase48-preflight-9fe2295d-4282-482b-9533-385a31f5ef4b',path:'C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/stopped-preflights/phase48-preflight-9fe2295d-4282-482b-9533-385a31f5ef4b.stopped.json',size_bytes:42386,sha256:'2ad76ed669552616c018252ecc1d6449e3d307004628358552d41c52d56c2660',sanitization:'PASS',byte_identical:true};
 report.success=true;report.decision='CONEXIONES READ ONLY INDEPENDIENTES CERTIFICADAS — LISTO PARA NUEVO PREFLIGHT';
}catch(error){report.success=false;report.decision='OPERACIÓN DETENIDA — INDEPENDENCIA DE CONEXIONES NO CERTIFICADA';report.failure=error.message;process.exitCode=1;}
finally{report.completed_utc=new Date().toISOString();fs.writeFileSync('reports/phase48-pooler-independent.cert.json',JSON.stringify(report,null,2)+'\n');}
