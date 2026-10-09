import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {spawn,execFileSync} from 'node:child_process';
import ts from 'typescript';
import * as contract from '../modules/cobertura/phase48-readonly-contract';
import {publishAtomicReceipt,saveReadReceipt,RECEIPT_FILE} from '../modules/cobertura/phase48-readonly-receipts';

const root=resolve('tmp/phase48-atomic-tests');fs.mkdirSync(root,{recursive:true});
const source=fs.readFileSync('src/modules/cobertura/phase48-readonly-receipts.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const receipt={run_id:'phase48-atomic-fixture',status:'STOPPED',writes:0,certificate_sha256:contract.CERTIFICATE_SHA256,text:'Español: áéíóú, 中文, 🧪\nsegunda línea\r\ntercera'};
const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n','utf8');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function fixture(body:(dir:string)=>void){const dir=fs.mkdtempSync(join(root,'case-'));try{body(dir);}finally{assert.ok(dir.startsWith(root+ '\\')||dir.startsWith(root+'/'));fs.rmSync(dir,{recursive:true,force:true});}}
function api(overrides:Record<string,unknown>={}){const exports:any={};runInNewContext(compiled,{exports,Buffer,Date,require:(name:string)=>name==='node:fs'?{...fs,...overrides}:name==='node:child_process'&&overrides.renameSync?{execFileSync:(_exe:string,_args:string[],options:any)=>(overrides.renameSync as Function)(options.env.PHASE48_RECEIPT_SOURCE,options.env.PHASE48_RECEIPT_DESTINATION)}:name==='./phase48-readonly-contract'?contract:require(name)});return exports;}
function absent(dir:string){assert.equal(fs.existsSync(join(dir,RECEIPT_FILE)),false);}

test('complete UTF-8 JSON immediately readable; published SHA/size and Unicode/newlines stable',()=>fixture(dir=>{
 const file=saveReadReceipt(dir,receipt);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),receipt);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.statSync(file).size,bytes.length);assert.equal(sha(fs.readFileSync(file)),sha(bytes));
 assert.deepEqual(fs.readdirSync(dir),[RECEIPT_FILE]);
}));

for(const stage of ['before-write','partial-write','during-write','fsync','close','before-rename','rename','verification'])test('controlled failure '+stage+': no visible partial JSON and no owned temporary remains',()=>fixture(dir=>{
 let calls=0,closed=false,synced=false;const error=Error('INDUCED_'+stage);
 const overrides:any={
  openSync:(p:string,...args:any[])=>{absent(dir);if(stage==='before-write')throw error;return (fs.openSync as any)(p,...args);},
  writeSync:(fd:number,b:Buffer,offset:number,length:number)=>{absent(dir);calls++;if(stage==='partial-write'&&calls===1)return fs.writeSync(fd,b,offset,7);if(stage==='partial-write'||stage==='during-write')throw error;return fs.writeSync(fd,b,offset,length);},
  fsyncSync:(fd:number)=>{absent(dir);if(stage==='fsync')throw error;fs.fsyncSync(fd);synced=true;},
  closeSync:(fd:number)=>{absent(dir);if(stage==='close'&&!closed){closed=true;throw error;}fs.closeSync(fd);closed=true;},
  readFileSync:(p:string,...args:any[])=>{if(stage==='verification'&&p.endsWith('.tmp'))return Buffer.from('truncated');return (fs.readFileSync as any)(p,...args);},
  statSync:(p:string)=>{if(stage==='before-rename')throw error;return fs.statSync(p);},
  renameSync:(from:string,to:string)=>{absent(dir);assert.equal(synced,true);assert.equal(closed,true);assert.deepEqual(fs.readFileSync(from),bytes);if(stage==='rename')throw error;fs.renameSync(from,to);}
 };
 assert.throws(()=>api(overrides).saveReadReceipt(dir,receipt),/INDUCED_|TEMP_VERIFICATION|ATOMIC_RENAME_FAILED/);absent(dir);assert.deepEqual(fs.readdirSync(dir),[]);
}));

test('short writes complete in a loop; final appears only after fsync and close at rename',()=>fixture(dir=>{
 const trace:string[]=[];
 const injected=api({writeSync:(fd:number,b:Buffer,o:number,n:number)=>{absent(dir);trace.push('write');return fs.writeSync(fd,b,o,Math.min(n,3));},fsyncSync:(fd:number)=>{absent(dir);trace.push('fsync');fs.fsyncSync(fd);},closeSync:(fd:number)=>{absent(dir);trace.push('close');fs.closeSync(fd);},renameSync:(a:string,b:string)=>{absent(dir);assert.deepEqual(trace.slice(-2),['fsync','close']);trace.push('rename');fs.renameSync(a,b);assert.deepEqual(fs.readFileSync(b),bytes);}});
 injected.saveReadReceipt(dir,receipt);assert.equal(trace.at(-1),'rename');assert.deepEqual(fs.readdirSync(dir),[RECEIPT_FILE]);
}));

test('exact preexisting run/hash is idempotent without opening, deleting or renaming a file',()=>fixture(dir=>{
 const file=saveReadReceipt(dir,receipt),before=fs.statSync(file);
 const reject=()=>assert.fail('idempotence must not write');
 assert.equal(api({openSync:reject,renameSync:reject,unlinkSync:reject}).saveReadReceipt(dir,receipt),file);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.statSync(file).ino,before.ino);
}));

test('different bytes or run_id, malformed JSON, directory, hardlink: no replacement/deletion',()=>fixture(dir=>{
 const file=saveReadReceipt(dir,receipt);
 for(const changed of [{...receipt,text:'different'},{...receipt,run_id:'phase48-other'}])assert.throws(()=>saveReadReceipt(dir,changed),/ALREADY_EXISTS_DIFFERENT/);
 assert.deepEqual(fs.readFileSync(file),bytes);
 fs.unlinkSync(file);fs.writeFileSync(file,'{');assert.throws(()=>saveReadReceipt(dir,receipt));assert.equal(fs.readFileSync(file,'utf8'),'{');
 fs.unlinkSync(file);fs.mkdirSync(file);assert.throws(()=>saveReadReceipt(dir,receipt),/FILE_UNSAFE/);fs.rmdirSync(file);
 fs.writeFileSync(file,bytes);fs.linkSync(file,join(dir,'alias'));assert.throws(()=>saveReadReceipt(dir,receipt),/FILE_UNSAFE/);assert.deepEqual(fs.readFileSync(file),bytes);
}));

test('two publishers collide under exclusive lock; loser preserves winner and its temporary',()=>fixture(dir=>{
 let collision=false;
 const writer=api({writeSync:(fd:number,b:Buffer,o:number,n:number)=>{assert.throws(()=>saveReadReceipt(dir,receipt),{code:'EEXIST'});assert.equal(fs.readdirSync(dir).length,2);collision=true;return fs.writeSync(fd,b,o,n);}});
 writer.saveReadReceipt(dir,receipt);assert.equal(collision,true);assert.deepEqual(fs.readFileSync(join(dir,RECEIPT_FILE)),bytes);
}));

test('exclusive temp open refuses preexisting unique temp without deleting another owner',()=>fixture(dir=>{
 let temp='';const writer=api({openSync:(p:string,...args:any[])=>{temp=p;fs.writeFileSync(p,'OTHER_OWNER',{flag:'wx'});return (fs.openSync as any)(p,...args);}});
 assert.throws(()=>writer.saveReadReceipt(dir,receipt),{code:'EEXIST'});assert.equal(fs.readFileSync(temp,'utf8'),'OTHER_OWNER');absent(dir);assert.deepEqual(fs.readdirSync(dir),[temp.slice(dir.length+1)]);
}));

test('authorized basename/directory; traversal, NTFS streams and non-receipt names rejected before filesystem access',()=>fixture(dir=>{
 for(const name of ['../escape.json','x.json','phase48-x.receipt.json:stream','C:\\escape.json','phase48-x\\receipt.json'])assert.throws(()=>publishAtomicReceipt(dir,name,receipt),/NAME_UNAUTHORIZED/);
 assert.throws(()=>saveReadReceipt(dir+'/../escape',receipt),/PATH_TRAVERSAL/);
 const invalid:any={...receipt};invalid.self=invalid;assert.throws(()=>saveReadReceipt(dir,invalid));assert.deepEqual(fs.readdirSync(dir),[]);
 for(const value of [{...receipt,run_id:'../escape'},{...receipt,writes:1},{...receipt,status:'SUCCESS'}])assert.throws(()=>saveReadReceipt(dir,value));
}));

test('Windows junction/reparse directory and symlink final (equivalent injected lstat) rejected; ACL unchanged',()=>fixture(dir=>{
 const target=join(dir,'target'),junction=join(dir,'junction');fs.mkdirSync(target);
 fs.symlinkSync(target,junction,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>saveReadReceipt(junction,receipt),/DIRECTORY_UNSAFE/);assert.deepEqual(fs.readdirSync(target),[]);
 assert.throws(()=>saveReadReceipt(join(junction,'nested'),receipt),/DIRECTORY_UNSAFE/);
 const original=fs.lstatSync;
 assert.throws(()=>api({lstatSync:(p:string)=>p===join(target,RECEIPT_FILE)?{...fs.statSync(target),isSymbolicLink:()=>true}:original(p)}).saveReadReceipt(target,receipt),/FILE_UNSAFE/);
 if(process.platform==='win32'){
  const acl=(p:string)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-Acl -LiteralPath $env:PHASE48_ACL_TEST).Sddl'],{env:{...process.env,PHASE48_ACL_TEST:p},encoding:'utf8',windowsHide:true}).trim();
  const before=acl(target);saveReadReceipt(target,receipt);assert.equal(acl(target),before);
 }
}));

test('READ ONLY and mutator SUCCESS/STOPPED/ROLLED_BACK/baseline use identical publisher',()=>fixture(dir=>{
 const writes:string[]=[];const shared=api({renameSync:(a:string,b:string)=>{writes.push(b);fs.renameSync(a,b);}});
 shared.saveReadReceipt(dir,receipt);
 for(const status of ['SUCCESS','STOPPED','ROLLED_BACK']){const run_id='phase48-'+status.replaceAll('_','-');shared.publishAtomicReceipt(dir,run_id+'.receipt.json',{run_id,status});}
 shared.publishAtomicReceipt(dir,'phase48-local.baseline.json',{run_id:'phase48-local',baseline:'a'.repeat(64)});assert.equal(writes.length,5);
 const entry=fs.readFileSync('src/scripts/phase48-historical-production.ts','utf8');assert.ok(entry.includes('publishAtomicReceipt(dir,opts.runId+\'.baseline.json\''));assert.ok(entry.includes('publishAtomicReceipt(dir,opts.runId+\'.receipt.json\''));assert.ok(!/writeFile|copyFile/.test(entry));
}));

// Separate native Node process: slow partial temp writes allow the parent to
// repeatedly inspect the final path; crash exits with no finally before rename.
function child(dir:string,crash=false){
 const code=`const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm'),cp=require('node:child_process');const exports={};const real={...fs};let first=true;const wrapped={...fs,writeSync:(fd,b,o,n)=>{if(first){process.stdout.write('WRITING\\n');first=false;}const end=Date.now()+2;while(Date.now()<end){}return real.writeSync(fd,b,o,Math.min(n,512));}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/modules/cobertura/phase48-readonly-receipts.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText,{exports,Buffer,Date,require:n=>n==='node:fs'?wrapped:n==='node:child_process'?{execFileSync:(...args)=>{if(${crash})process.exit(73);return cp.execFileSync(...args);}}:n==='./phase48-readonly-contract'?{validateCertificateHash:()=>{}}:require(n)});exports.publishAtomicReceipt(process.argv[1],'phase48-process.receipt.json',{run_id:'phase48-process',status:'SUCCESS',text:'漢字🧪'.repeat(20000)});`;
 return spawn(process.execPath,['-e',code,dir],{cwd:resolve('.'),stdio:['ignore','pipe','pipe'],windowsHide:true});
}
test('native Windows/process observer never sees partial final JSON; simultaneous process loses safely',async()=>{
 const dir=fs.mkdtempSync(join(root,'native-'));try{
  const writer=child(dir);let started=false,error='';writer.stdout.on('data',()=>{started=true;});writer.stderr.on('data',x=>{error+=x;});
  const finished=new Promise<number|null>(r=>writer.on('exit',r));
  while(!started){await new Promise(r=>setTimeout(r,5));if(writer.exitCode!==null)assert.fail(error);}
  const loser=child(dir);const loserExit=new Promise<number|null>(r=>loser.on('exit',r));loser.stderr.resume();loser.stdout.resume();
  let reads=0,absences=0;const observe=()=>{const file=join(dir,'phase48-process.receipt.json');if(fs.existsSync(file)){const r=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(r.text,'漢字🧪'.repeat(20000));reads++;}else absences++;};
  const timer=setInterval(observe,1);try{assert.equal(await finished,0,error);observe();assert.equal(await loserExit,1);}finally{clearInterval(timer);}
  assert.ok(absences>20);assert.ok(reads>0);assert.deepEqual(fs.readdirSync(dir),['phase48-process.receipt.json']);
  console.log(JSON.stringify({platform:process.platform,node:process.version,observer_absences:absences,complete_reads:reads,partial_json_observations:0}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('process crash before rename leaves only own closed/synced temp and lock; next publisher fails closed',async()=>{
 const dir=fs.mkdtempSync(join(root,'crash-'));try{
  const writer=child(dir,true);writer.stdout.resume();writer.stderr.resume();assert.equal(await new Promise(r=>writer.on('exit',r)),73);
  const files=fs.readdirSync(dir);assert.equal(files.length,2);assert.equal(fs.existsSync(join(dir,'phase48-process.receipt.json')),false);
  const temp=files.find(f=>f.endsWith('.tmp')&&fs.lstatSync(join(dir,f)).isFile())!;assert.equal(JSON.parse(fs.readFileSync(join(dir,temp),'utf8')).text,'漢字🧪'.repeat(20000));
  assert.throws(()=>publishAtomicReceipt(dir,'phase48-process.receipt.json',{run_id:'phase48-process'}),{code:'EEXIST'});assert.deepEqual(fs.readdirSync(dir),files);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native Windows rename refuses a competing final created after the last existence check',()=>fixture(dir=>{
 const other=Buffer.from(JSON.stringify({...receipt,run_id:'phase48-competing'})+'\n');
 const cp=require('node:child_process');const exports:any={};
 runInNewContext(compiled,{exports,Buffer,Date,require:(name:string)=>name==='node:child_process'?{execFileSync:(exe:string,args:string[],options:any)=>{
  fs.writeFileSync(options.env.PHASE48_RECEIPT_DESTINATION,other,{flag:'wx'});
  return cp.execFileSync(exe,args,options);
 }}:name==='./phase48-readonly-contract'?contract:require(name)});
 assert.throws(()=>exports.saveReadReceipt(dir,receipt),/ATOMIC_RENAME_FAILED/);
 assert.deepEqual(fs.readFileSync(join(dir,RECEIPT_FILE)),other);assert.deepEqual(fs.readdirSync(dir),[RECEIPT_FILE]);
}));
