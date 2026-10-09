// File-backed local evidence. No env files, backups, database engines or URLs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();assert.equal(branch,'fix/phase48-atomic-receipt');
const tests=['atomic-receipts','atomic-mutator-regression','authorization-tls-contract','postrollback-eight','readonly-runner','readonly-target','readonly-tls','production-runner'].map(name=>'src/tests/phase48.'+name+'.test.ts');
const guard=path.join(root,'src/scripts/phase48-atomic-local-guard.cjs');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|PRODUCTION_|SUPABASE|JWT_|INTEGRACION_|PHASE48_SSL_|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS/.test(k)));
env.NODE_OPTIONS='--require="'+guard.replaceAll('\\','/')+'"';
const report={schema_version:1,base_commit:'d25043019fca8c5dd6dc8513f67f083a30de5540',branch,platform:process.platform,node:process.version,started_utc:new Date().toISOString(),production_connections:0,production_writes:0,productive_env_read:false,productive_ca_read:false,productive_health_requests:0,database_queries_executed:0,merge:false,deploy:false,production_phrase_generated:false,checks:[]};
function check(name,command,args,cwd=root){
 const result=spawnSync(command,args,{cwd,env,windowsHide:true,encoding:'utf8',maxBuffer:10*1024*1024});
 const output=(result.stdout??'')+(result.stderr??'');
 report.checks.push({name,command:[command,...args],exit_code:result.status});
 if(result.status!==0){console.error(output);throw Error('LOCAL_CHECK_FAILED:'+name);}
 console.log(JSON.stringify({check:name,pass:true}));return output;
}
try{
 const output=check('atomic + contract + postrollback 8/8 + TLS + target + runner + mutator + rollback/idempotence',process.execPath,['--import','tsx','--test','--test-reporter=tap',...tests]);
 report.test_totals=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(output.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1])]));assert.equal(report.test_totals.fail,0);assert.equal(report.test_totals.skipped,0);
 report.scenarios=[...output.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>({name:m[1],pass:true}));
 report.observer=JSON.parse(output.match(/\{"platform":"win32","node":"[^"]+","observer_absences":\d+,"complete_reads":\d+,"partial_json_observations":0\}/)[0]);
 report.guard_evidence=[...output.matchAll(/\{"guard":"PHASE48_ATOMIC_LOCAL"[^\n]*?\}/g)].map(m=>JSON.parse(m[0]));assert.ok(report.guard_evidence.length>0);assert.ok(report.guard_evidence.every(e=>e.forbidden_attempts===0));
 for(const name of ['typecheck','build'])check('backend '+name,'cmd.exe',['/d','/s','/c','npm run '+name]);
 const frontend=check('FrontendNuevo build','cmd.exe',['/d','/s','/c','npm run build'],path.join(root,'FrontendNuevo'));report.frontend_large_chunk_warning=frontend.includes('chunks are larger than 500 kB');
 check('git diff --check','git',['diff','--check']);
 const protectedFiles=['src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-historical-controlled.ts','src/modules/cobertura/phase48-historical-domain.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-readonly-preflight.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-production-authorization.ts','sql/phase-48-operational-assignment-identities.sql'];
 check('unchanged economics / SQL / transactions / digests / write-set','git',['diff','--exit-code',report.base_commit,'--',...protectedFiles]);report.protected_files=protectedFiles;
 const pin=fs.readFileSync('src/modules/cobertura/phase48-readonly-contract.ts','utf8').match(/export const MUTATOR_COMMIT = '([a-f0-9]{40})';/)[1];report.mutator_commit=pin;
 const files=['src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-readonly-contract.ts','src/scripts/phase48-historical-production.ts','src/scripts/phase48-production-readonly.ts','src/scripts/certify-phase48-readonly-contract-local.cjs','src/scripts/certify-phase48-atomic-receipts.cjs','src/scripts/phase48-atomic-local-guard.cjs',...tests];
 report.code_sha256=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f,'utf8').replaceAll('\r\n','\n')).digest('hex')]));report.hash_format='UTF-8 source with CRLF normalized to LF';
 report.revoked_mutator_commit='57063aedca261557256a23eee616dae473b94f54';report.revoked_readonly_runner_through=report.base_commit;
 report.success=true;report.decision='PUBLICACIÓN ATÓMICA CERTIFICADA — LISTO PARA NUEVO PREFLIGHT READ ONLY';
}catch(error){report.success=false;report.decision='OPERACIÓN DETENIDA — PUBLICACIÓN ATÓMICA NO CERTIFICADA';report.failure=error.message;process.exitCode=1;}
finally{report.completed_utc=new Date().toISOString();fs.writeFileSync('reports/phase48-atomic-receipt.cert.json',JSON.stringify(report,null,2)+'\n');}
