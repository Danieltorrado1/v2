import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {requireScoped} from './phase48-scoped-contract';
export const V6_BASE='4588fa2e00fafc9ceb396c3f13c18297bc6350a1';
export const V6_MUTATOR_COMMIT='51c22eabd3ff717bc5b355d95d3a16b4382b010c';
export const V6_EVIDENCE={backup_sha256:'7b899f07210f09fbebb0facf1ba9b356510c2316d26a0e521a42639ba135b16c',manifest_sha256:'c672cc42378b956af3efd35d2910e486ecd42da30d94c88646b125cc2d653635',supplement_sha256:'081ecb79a064e48106d5b308af73b45d11bd8fae827068547c4bbf2a50989ef0',final_report_sha256:'3ff062f47ffe1f733b60d844aeaa4c5274e59ee40e1c80c953a66b5521ac04ff',certified_preflight_sha256:'4fe345365f5df29d8c6cdb3f911dc15a140cb184ad5c3ede6d4e01ee4dbe9732',blocked_request_sha256:'cb8d2db7218d138c5b3deeb9fbf6d423f456ec20ac2895f14db0224e0fb34d66'};
export const v6Hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
export function v6ReadFile(file:string){let cursor=resolve(file);while(true){requireScoped(!lstatSync(cursor).isSymbolicLink(),'V6_SYMLINK_FORBIDDEN');const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}const s=lstatSync(file);requireScoped(s.isFile()&&s.nlink===1,'V6_REGULAR_FILE_REQUIRED');return readFileSync(file);}
export interface V6EvidencePaths {backupDirectory:string;certifiedPreflight:string;blockedRequest:string;}
export function verifyV6Evidence(p:V6EvidencePaths){
 const names={backup_sha256:'full.dump',manifest_sha256:'manifest.json',supplement_sha256:'manifest-supplement-final.json',final_report_sha256:'CERTIFICACION-FINAL-SUPLEMENTARIA.md'};
 for(const [key,name] of Object.entries(names))requireScoped(v6Hash(v6ReadFile(resolve(p.backupDirectory,name)))===V6_EVIDENCE[key as keyof typeof V6_EVIDENCE],'V6_EVIDENCE_HASH:'+key);
 for(const [file,key] of [[p.certifiedPreflight,'certified_preflight_sha256'],[p.blockedRequest,'blocked_request_sha256']] as const)requireScoped(v6Hash(v6ReadFile(file))===V6_EVIDENCE[key],'V6_EVIDENCE_HASH:'+key);
 const s=JSON.parse(v6ReadFile(resolve(p.backupDirectory,names.supplement_sha256)).toString('utf8'));requireScoped(s.decision==='BACKUP VERIFICADO MEDIANTE SUPLEMENTO ENCADENADO'&&s.preservation.original_inventory.length===65,'V6_BACKUP_NOT_VERIFIED');
 for(const f of s.preservation.original_inventory){requireScoped(typeof f.path==='string'&&!isAbsolute(f.path)&&!f.path.split(/[\\/]/).includes('..'),'V6_BACKUP_PATH_INVALID');const b=v6ReadFile(resolve(p.backupDirectory,f.path));requireScoped(b.length===f.bytes&&v6Hash(b)===f.sha256,'V6_ORIGINAL_BACKUP_CHANGED');}
 const pre=JSON.parse(v6ReadFile(p.certifiedPreflight).toString('utf8'));requireScoped(pre.initial.candidate_count===740&&pre.findings.length===0&&Object.values(pre.comparison).every((x:any)=>x.equal),'V6_CERTIFIED_PREFLIGHT_INVALID');return {...V6_EVIDENCE};
}
const normalize=(file:string,value:string)=>value.replaceAll('\r\n','\n').replace(file.endsWith('phase48-v6-evidence.ts')?/export const V6_MUTATOR_COMMIT='[^']+';/:/$^/g,"export const V6_MUTATOR_COMMIT='<PIN>';" );
export function v6Release(){
 const git=(args:string[])=>{const output=execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});return args[0]==='show'?output:output.trim();};
 requireScoped(git(['branch','--show-current'])==='fix/phase48-v6-production-entry'&&git(['status','--porcelain=v1'])==='','V6_CLEAN_RELEASE_BRANCH_REQUIRED');const head=git(['rev-parse','HEAD']);requireScoped(/^[a-f0-9]{40}$/.test(V6_MUTATOR_COMMIT),'V6_RELEASE_UNPUBLISHED');git(['merge-base','--is-ancestor',V6_BASE,head]);git(['merge-base','--is-ancestor',V6_MUTATOR_COMMIT,head]);
 const files=git(['ls-tree','-r','--name-only',V6_MUTATOR_COMMIT]).split(/\r?\n/).filter(f=>f.startsWith('src/modules/cobertura/phase48-')||f.startsWith('src/scripts/phase48-')||['package.json','package-lock.json','tsconfig.json'].includes(f));
 const hashes:Record<string,string>={};for(const file of files){const live=normalize(file,v6ReadFile(file).toString('utf8')),pinned=normalize(file,git(['show',V6_MUTATOR_COMMIT+':'+file])+'\n');requireScoped(live.trimEnd()===pinned.trimEnd(),'V6_CERTIFIED_CODE_CHANGED:'+file);hashes[file]=v6Hash(live);}
 return {readonly_runner_commit:head,mutator_commit:V6_MUTATOR_COMMIT,code_sha256:hashes,authorization:'REVOKED'};
}
export function v6PrivatePath(file:string,directory=false){
 if(process.platform==='win32'){const script="$ErrorActionPreference='Stop';$a=Get-Acl -LiteralPath $env:V6_PRIVATE_PATH;$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;foreach($r in $a.Access){$sid=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;if($r.AccessControlType -eq 'Allow' -and $sid -notin @($me,'S-1-5-18','S-1-5-32-544')){throw 'UNSAFE'}};Write-Output 'PRIVATE'";requireScoped(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{SystemRoot:process.env.SystemRoot,V6_PRIVATE_PATH:file},encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim()==='PRIVATE','V6_PRIVATE_ACL_REQUIRED');}
 else requireScoped((lstatSync(file).mode&0o077)===0,'V6_PRIVATE_MODE_REQUIRED');
 if(directory){requireScoped(lstatSync(file).isDirectory()&&!lstatSync(file).isSymbolicLink(),'V6_PRIVATE_DIRECTORY_REQUIRED');}else v6ReadFile(file);
}
export function v6ExternalKey(file:string){v6PrivatePath(file);const real=realpathSync(file),rel=relative(realpathSync(process.cwd()),real);requireScoped(rel.startsWith('..')||isAbsolute(rel),'V6_KEY_OUTSIDE_REPOSITORY_REQUIRED');const bytes=v6ReadFile(file);requireScoped(bytes.length===32,'V6_KEY_LENGTH_REQUIRED');return bytes;}
