// Execute exactly the same common files, executable, arguments and env on main
// and release. Each environment is unable to connect to a real database.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const baseline=path.join(root,'tmp/release-origin-main-baseline');
const logs=path.join(root,'tmp/modalidad-release-cert');
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
  ?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]);
const files=[...walk(path.join(root,'src/tests')),...walk(path.join(root,'FrontendNuevo/src'))]
  .filter(file=>file.endsWith('.test.ts')).map(file=>path.relative(root,file).replaceAll('\\','/')).sort();
const common=files.filter(file=>fs.existsSync(path.join(baseline,file)));
const newFiles=files.filter(file=>!common.includes(file));
const env={...process.env,ENV_FILE:path.join(root,'nonexistent-isolated-test-env'),APP_NAME:'isolated-release-comparison',
 API_PREFIX:'/api',NODE_ENV:'test',PORT:'3999',DATABASE_URL:'postgresql://isolated:isolated@127.0.0.1:1/isolated',
 JWT_SECRET:'isolated-test-only',JWT_EXPIRES_IN:'1h',CORS_ORIGIN:'http://localhost',TRUST_PROXY:'false',
 RATE_LIMIT_WINDOW_MINUTES:'1',RATE_LIMIT_MAX_REQUESTS:'100',LOG_LEVEL:'error',ENABLE_JOBS:'false',
 INTEGRACION_OUTBOX_ENABLED:'false',INTEGRACION_SYNC_ENABLED:'false',INTEGRACION_RECALC_ENABLED:'false',
 SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SERVICE_ROLE_KEY:'isolated-test-only',SUPABASE_STORAGE_BUCKET:'test'};
const args=[path.join(root,'node_modules/tsx/dist/cli.mjs'),'--test','--test-concurrency=1','--test-reporter=tap',...common];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const report={timestamp_utc:new Date().toISOString(),production_connections:0,production_writes:0,
 common_files:common.length,new_files:newFiles,files_sha256:digest(JSON.stringify(common)),
 environment_sha256:digest(JSON.stringify(env)),arguments_sha256:digest(JSON.stringify(args)),files:common};
const analyzeOnly=process.argv.includes('--analyze-existing');
const previous=analyzeOnly?JSON.parse(fs.readFileSync(path.join(root,'reports/instituciones-release-suite-comparison.json'),'utf8')):null;
if(previous && ['files_sha256','environment_sha256','arguments_sha256'].some(key=>previous[key]!==report[key]))
  throw Error('Comparison input changed: execute both suites again');
async function main() {
await Promise.all([['origin_main',baseline],['release',root]].map(async ([name,cwd])=>{
  const log=path.join(logs,name+'-full-suite.tap');
  const fd=analyzeOnly?null:fs.openSync(log,'w');
  console.log(`Starting ${name}: ${common.length} common test files`);
  const result=analyzeOnly?{status:previous[name].exit}:await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore',fd,fd]});
    child.on('error',reject);child.on('close',status=>resolve({status}));
  });if(fd!==null)fs.closeSync(fd);
  const content=fs.readFileSync(log,'utf8');
  if(analyzeOnly && digest(content)!==previous[name].log_sha256)throw Error('Comparison log changed');
  if(content.includes('spawn EPERM'))throw Error('SANDBOX_PROCESS_DENIED: rerun with approved process execution');
  const summary=Object.fromEntries([...content.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)/gm)].map(match=>[match[1],Number(match[2])]));
  const failed=content.split('\n').filter(line=>/^\s*not ok \d+ - /.test(line)).map(line=>line.replace(/^\s*not ok \d+ - /,'').replace(/\r$/,''));
  report[name]={exit:result.status,...summary,failed,log_sha256:digest(content)};
  console.log(JSON.stringify({name,exit:result.status,...summary,failed_count:failed.length},null,2));
}));
report.new_failures=report.release.failed.filter(name=>!report.origin_main.failed.includes(name));
report.resolved_failures=report.origin_main.failed.filter(name=>!report.release.failed.includes(name));
report.no_new_regressions=report.new_failures.length===0;
fs.writeFileSync(path.join(root,'reports/instituciones-release-suite-comparison.json'),JSON.stringify(report,null,2)+'\n');
process.exitCode=report.no_new_regressions?0:1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
