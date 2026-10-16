import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,realpathSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';

export const FIXTURE_HEAD='d740cd902888cbe45bc60c22a2fd3f8ec9625b70';
export const FIXTURE_BRANCH='fix/phase48-v6-sha-comparison-unification';
const workspace=resolve(__dirname,'../../..');
const sha=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');

export function v6CliGitFixture(options:{branch?:string;head?:string;dirty?:boolean}={}){
 const root=join(workspace,'tmp','phase48-v6-cli-fixtures');mkdirSync(root,{recursive:true});
 const parent=realpathSync(mkdtempSync(join(root,'run-')));
 const repo=join(parent,'repo'),inputs=join(parent,'inputs'),backup=join(inputs,'backup');
 const head=options.head??FIXTURE_HEAD,branch=options.branch??FIXTURE_BRANCH;
 const rawGit=(cwd:string,args:string[])=>execFileSync('git',args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
 const git=(args:string[])=>rawGit(repo,args).toString('utf8').trim();
 const manifest:Record<string,unknown>={source_ref:head,branch,repo,clone_flags:['--local','--no-hardlinks','--no-checkout'],materialization:'git checkout',verified:false};
 const publish=()=>{
  const bytes=JSON.stringify(manifest,null,2)+'\n';writeFileSync(join(parent,'manifest.json'),bytes);
  writeFileSync(join(parent,'manifest.sha256'),sha(bytes)+'\n');
 };
 const dispose=(passed=false)=>{
  // Every child command is synchronous; no launcher or Git handle survives.
  const actual=realpathSync(repo),controlled=realpathSync(root)+sep;
  if(actual!==repo||!actual.startsWith(controlled)||!actual.endsWith(sep+'repo'))throw Error('FIXTURE_CLEANUP_PATH_INVALID');
  manifest.test_passed=passed;publish();
  if(passed)rmSync(actual,{recursive:true,force:true});
 };
 try{
  // Git materializes tracked content. Never copy/query the source working tree.
  execFileSync('git',['clone','--local','--no-hardlinks','--no-checkout',workspace,repo],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  git(['checkout','--quiet','-b',branch,head]);
  git(['config','remote.origin.url',workspace]);
  git(['config','remote.origin.fetch','+refs/heads/'+branch+':refs/remotes/origin/'+branch]);
  git(['update-ref','refs/remotes/origin/'+branch,head]);
  const status=rawGit(repo,['status','--porcelain=v2','-z']);writeFileSync(join(parent,'status.nul'),status);
  if(status.length)throw Error('FIXTURE_DIRTY_BEFORE_LAUNCHER:'+status.toString('utf8'));
  if(git(['rev-parse','HEAD'])!==head||git(['branch','--show-current'])!==branch||git(['rev-parse','refs/remotes/origin/'+branch])!==head)throw Error('FIXTURE_REF_MISMATCH');
  const sourceNames=rawGit(workspace,['ls-tree','-r','--name-only','-z',head]);
  const fixtureNames=rawGit(repo,['ls-files','-z']);
  writeFileSync(join(parent,'source-names.nul'),sourceNames);writeFileSync(join(parent,'fixture-names.nul'),fixtureNames);
  if(!sourceNames.equals(fixtureNames))throw Error('FIXTURE_TRACKED_NAME_MISMATCH');
  const sourceTree=rawGit(workspace,['ls-tree','-r','-z',head]);
  const expectedIndex=Buffer.from(sourceTree.toString('utf8').split('\0').map(entry=>entry.replace(/^(\d+) blob ([a-f0-9]+)\t/,'$1 $2 0\t')).join('\0'),'utf8');
  const fixtureIndex=rawGit(repo,['ls-files','--stage','-z']);
  writeFileSync(join(parent,'source-tree.nul'),sourceTree);writeFileSync(join(parent,'fixture-index.nul'),fixtureIndex);
  if(!expectedIndex.equals(fixtureIndex))throw Error('FIXTURE_TRACKED_BLOB_MISMATCH');
  const names=sourceNames.toString('utf8').split('\0').filter(Boolean);
  const xlsx=names.find(name=>name==='data/SST/Caracterización adicional (respuestas).xlsx');
  if(xlsx){
   const physical=readdirSync(join(repo,'data','SST')).find(name=>name==='Caracterización adicional (respuestas).xlsx');
   if(!physical||!existsSync(join(repo,xlsx))||!Buffer.from('data/SST/'+physical).equals(Buffer.from(xlsx)))throw Error('FIXTURE_UTF8_NAME_MISMATCH:'+xlsx);
   const sourceBlob=rawGit(workspace,['rev-parse',head+':'+xlsx]).toString().trim();
   const observedBlob=git(['hash-object','--path='+xlsx,join(repo,xlsx)]);
   if(observedBlob!==sourceBlob)throw Error('FIXTURE_UTF8_BLOB_MISMATCH:'+xlsx+':'+sourceBlob+':'+observedBlob);
   manifest.xlsx={path:xlsx,blob:sourceBlob,physical_name:physical};
  }else if(head===FIXTURE_HEAD)throw Error('FIXTURE_UTF8_TRACKED_FILE_MISSING');
  manifest.verified=true;manifest.tracked_files=names.length;manifest.names_sha256=sha(sourceNames);manifest.index_sha256=sha(fixtureIndex);manifest.source_tree_sha256=sha(sourceTree);manifest.remote_ref='refs/remotes/origin/'+branch;manifest.remote_head=head;publish();
  mkdirSync(backup,{recursive:true});
  if(options.dirty)writeFileSync(join(repo,'dirty-fixture.txt'),'controlled dirty tree\n');
  for(const name of ['certified.json','blocked.json','credential-sentinel.txt','ca-sentinel.crt'])writeFileSync(join(inputs,name),'NEVER_READ\n');
  const directory=join(inputs,'receipts');mkdirSync(directory);
  const args=['--mode=PreflightOnly','--backup-directory='+backup,'--certified-preflight='+join(inputs,'certified.json'),'--blocked-request='+join(inputs,'blocked.json'),'--credential-path='+join(inputs,'credential-sentinel.txt'),'--ca-path='+join(inputs,'ca-sentinel.crt'),'--ca-sha256='+'a'.repeat(64),'--receipt-directory='+directory,'--sync-manually-confirmed=false'];
  return {repo,backup,git,dispose,run(){
   const launcher=resolve(workspace,'src/scripts/phase48-v6-production.ts');
   const harness='require('+JSON.stringify(launcher)+').runV6Cli(JSON.parse(process.argv[1])).then(()=>{throw Error("FIXTURE_UNEXPECTED_SUCCESS")}).catch(e=>process.stdout.write(JSON.stringify({message:e.message,code:e.code,path:e.path,status:e.status})))';
   const output=execFileSync(process.execPath,['--require',resolve(workspace,'node_modules/tsx/dist/cjs/index.cjs'),'-e',harness,JSON.stringify(args)],{cwd:repo,encoding:'utf8',windowsHide:true,timeout:30000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
   const result=JSON.parse(output) as {message:string;code?:string;path?:string;status?:number};manifest.launcher_result=result;publish();return result;
  }};
 }catch(error){manifest.failure=error instanceof Error?error.message:String(error);publish();throw error;}
}
