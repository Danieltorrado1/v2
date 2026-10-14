import {readFileSync,mkdirSync,rmdirSync,lstatSync,realpathSync,openSync,writeSync,fsyncSync,closeSync,statSync,unlinkSync} from 'node:fs';
import type {Stats} from 'node:fs';
import {resolve,join,parse,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {platform} from 'node:os';
import {env} from 'node:process';
import {authorizationFields,buildAuthorizationPhrase,parseAuthorizationPhrase,exactEqual,validateCertificateHash,DIGEST_FIELDS} from './phase48-readonly-contract';

export const RECEIPT_FILE='phase48-production-preflight-current.json';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
// Directory ACLs must exclude untrusted writers: Node has no directory-relative
// open API to fence hostile reparse-point swaps. The lock serializes all Phase
// 48 publishers. Never remove another process's lock, including after crash.
function safeDirectory(directory:string){
 if(directory.split(/[\\/]/).includes('..'))throw Error('RECEIPT_PATH_TRAVERSAL');
 if(directory.startsWith('\\\\')||directory.startsWith('//'))throw Error('RECEIPT_NETWORK_DIRECTORY_FORBIDDEN');
 const absolute=resolve(directory),root=parse(absolute).root;
 let current=root;
 for(const part of absolute.slice(root.length).split(sep).filter(Boolean)){
  current=join(current,part);
  if(present(current)){
   const s=lstatSync(current);if(s.isSymbolicLink()||!s.isDirectory())throw Error('RECEIPT_DIRECTORY_UNSAFE');
  }
 }
 mkdirSync(absolute,{recursive:true,mode:0o700});
 const canonical=realpathSync.native(absolute);
 // Windows 8.3 aliases can legitimately expand; compare directory identity,
 // after rejecting every symlink/junction component, rather than path spelling.
 if(!sameFile(lstatSync(absolute),lstatSync(canonical)))throw Error('RECEIPT_DIRECTORY_ESCAPE');
 return canonical;
}
function regular(file:string){const s=lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1)throw Error('RECEIPT_FILE_UNSAFE');return s;}
function present(file:string){try{lstatSync(file);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}
function sameFile(a:Stats,b:Stats){return a.dev===b.dev&&a.ino===b.ino;}
function withPublicationLock<T>(directory:string,name:string,body:(dir:string)=>T){
 const dir=safeDirectory(directory),identity=lstatSync(dir),lock=join(dir,'.'+name+'.tmp');
 mkdirSync(lock,{mode:0o700});const owned=lstatSync(lock);
 try{
  if(!sameFile(identity,lstatSync(safeDirectory(dir))))throw Error('RECEIPT_DIRECTORY_CHANGED');
  return body(dir);
 }finally{if(sameFile(owned,lstatSync(lock)))rmdirSync(lock);}
}
function renameWithoutReplacement(from:string,to:string){
 // fs.renameSync uses replace-existing semantics on Windows. File.Move on
 // Windows .NET Framework invokes the native MoveFile (no replace flag).
 // Same directory/volume is enforced by construction; this is a rename,
 // never a copy. Fail closed on uncertified platforms rather than silently
 // weaken the no-overwrite guarantee. No shell interpolation of paths.
 if(platform()!=='win32'||!env.SystemRoot)throw Error('RECEIPT_ATOMIC_PLATFORM_UNCERTIFIED');
 const powershell=join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 try{
  execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; [System.IO.File]::Move($env:PHASE48_RECEIPT_SOURCE,$env:PHASE48_RECEIPT_DESTINATION)"],{
   windowsHide:true,stdio:'pipe',env:{SystemRoot:env.SystemRoot,PHASE48_RECEIPT_SOURCE:from,PHASE48_RECEIPT_DESTINATION:to}
  });
 }catch{throw Error('RECEIPT_ATOMIC_RENAME_FAILED');}
}
/** Immutable UTF-8 publication: exclusive temp, complete write, fsync, close,
 * verified size/hash, same-directory rename. No copy/chmod/final unlink.
 * Windows: no portable directory fsync; no power-loss durability guarantee
 * for the rename/directory entry. A process crash may leave its private temp
 * and lock; they are deliberately not scavenged by another invocation. */
export function publishAtomicReceipt(directory:string,name:string,receipt:any){
 if(!/^(phase48-production-preflight-current|phase48-[A-Za-z0-9-]+\.(?:baseline|receipt)|phase48-consumed-[a-f0-9]{64})\.json$/.test(name))throw Error('RECEIPT_NAME_UNAUTHORIZED');
 if(!receipt||typeof receipt.run_id!=='string'||!/^phase48-[A-Za-z0-9-]+$/.test(receipt.run_id))throw Error('RECEIPT_RUN_ID_INVALID');
 const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n','utf8');
 const decoded=JSON.parse(bytes.toString('utf8'));
 if(decoded.run_id!==receipt.run_id)throw Error('RECEIPT_SERIALIZATION_INVALID');
 if(name!==RECEIPT_FILE&&!name.startsWith('phase48-consumed-')&&name!==decoded.run_id+'.baseline.json'&&name!==decoded.run_id+'.receipt.json')throw Error('RECEIPT_NAME_RUN_MISMATCH');
 const digest=hash(bytes);
 return withPublicationLock(directory,name,dir=>publishLocked(dir,name,bytes,decoded.run_id,digest));
}
function publishLocked(dir:string,name:string,bytes:Buffer,runId:string,digest:string){
 const directoryIdentity=lstatSync(dir);
 const file=join(dir,name),temporary=join(dir,'.'+name+'.'+randomUUID()+'.tmp');
 const identical=()=>{
  if(!present(file))return false;
  regular(file);const prior=readFileSync(file);
  if(prior.length!==bytes.length||hash(prior)!==digest||!prior.equals(bytes)||JSON.parse(prior.toString('utf8')).run_id!==runId)throw Error('RECEIPT_ALREADY_EXISTS_DIFFERENT');
  return true;
 };
 if(identical())return file;
 let fd:number|undefined,owned:Stats|undefined;
 try{
  fd=openSync(temporary,'wx',0o600);owned=regular(temporary);
  let offset=0;
  while(offset<bytes.length){const count=writeSync(fd,bytes,offset,bytes.length-offset);if(count<=0)throw Error('RECEIPT_SHORT_WRITE');offset+=count;}
  fsyncSync(fd);closeSync(fd);fd=undefined;
  const current=regular(temporary);
  if(!sameFile(owned,current)||statSync(temporary).size!==bytes.length||hash(readFileSync(temporary))!==digest)throw Error('RECEIPT_TEMP_VERIFICATION_FAILED');
  if(!sameFile(directoryIdentity,lstatSync(safeDirectory(dir))))throw Error('RECEIPT_DIRECTORY_CHANGED');
  if(identical())return file;
  renameWithoutReplacement(temporary,file);
  owned=undefined;
  return file;
 }finally{
  try{if(fd!==undefined)closeSync(fd);}finally{
   if(owned&&present(temporary)&&sameFile(owned,lstatSync(temporary)))unlinkSync(temporary);
  }
 }
}
function verifiedEight(receipt:any){
 const exact=(value:any)=>value&&Object.keys(value).length===8&&Object.keys(value).every(k=>DIGEST_FIELDS.includes(k as typeof DIGEST_FIELDS[number]));
 return receipt.stable===true&&exact(receipt.first_digests)&&exact(receipt.post_rollback_digests)&&exact(receipt.digest_comparison)&&receipt.first_snapshot?.read_only==='on'&&receipt.post_rollback_snapshot?.read_only==='on'&&receipt.first_snapshot.pid!==receipt.post_rollback_snapshot.pid&&receipt.first_snapshot.virtual_transaction!==receipt.post_rollback_snapshot.virtual_transaction&&DIGEST_FIELDS.every(k=>/^[a-f0-9]{64}$/.test(receipt.first_digests[k])&&exactEqual(receipt.first_digests[k],receipt.post_rollback_digests[k])&&exactEqual(receipt.digests?.[k],receipt.first_digests[k])&&receipt.digest_comparison[k]===true);
}
export function saveReadReceipt(directory:string,receipt:any){
 receipt=JSON.parse(JSON.stringify(receipt));
 validateCertificateHash(receipt.certificate_sha256);
 if(!['PENDIENTE_DE_AUTORIZACION','STOPPED','STOPPED_DRIFT'].includes(receipt.status)||receipt.writes!==0)throw Error('FINAL_READ_RECEIPT_REQUIRED');
 if(receipt.status==='PENDIENTE_DE_AUTORIZACION'){
  if(!verifiedEight(receipt)||receipt.authorization_status!==receipt.status||receipt.rollback!=='CONFIRMED'||receipt.principal_connection_closed!==true||receipt.post_rollback_verification?.status!=='STABLE'||receipt.post_rollback_verification?.rollback!=='CONFIRMED'||receipt.post_rollback_verification?.connection_closed!==true||receipt.authorization_phrase!==buildAuthorizationPhrase(authorizationFields(receipt)))throw Error('VERIFIED_AUTHORIZATION_REQUIRED');
 }else if(receipt.authorization_phrase||receipt.nonce)throw Error('STOPPED_AUTHORIZATION_FORBIDDEN');
 return publishAtomicReceipt(directory,RECEIPT_FILE,receipt);
}
export function validateCurrentNonce(receipt:any,phrase:string){
 const fields=parseAuthorizationPhrase(phrase);
 validateCertificateHash(receipt.certificate_sha256);
 if(!verifiedEight(receipt)||receipt.status!=='PENDIENTE_DE_AUTORIZACION'||receipt.authorization_status!==receipt.status||receipt.rollback!=='CONFIRMED'||receipt.principal_connection_closed!==true||receipt.post_rollback_verification?.status!=='STABLE'||receipt.post_rollback_verification?.rollback!=='CONFIRMED'||receipt.post_rollback_verification?.connection_closed!==true||!exactEqual(receipt.nonce,fields.nonce)||!exactEqual(receipt.authorization_phrase,phrase)||!exactEqual(buildAuthorizationPhrase(authorizationFields(receipt)),phrase))throw Error('NONCE_REVOKED_OR_REUSED');
 return fields;
}
// Fail closed across processes and crashes. A claimed nonce is never restored
// after a failed connection or transaction; a new preflight must issue another.
export function consumeCurrentNonce(directory:string,phrase:string){
 return withPublicationLock(directory,RECEIPT_FILE,dir=>{
  const file=join(dir,RECEIPT_FILE);regular(file);
  const receipt=JSON.parse(readFileSync(file,'utf8'));validateCurrentNonce(receipt,phrase);
  const name='phase48-consumed-'+receipt.nonce+'.json';
  if(present(join(dir,name)))throw Error('NONCE_REVOKED_OR_REUSED');
  const consumed={run_id:receipt.run_id,status:'CONSUMED',nonce:receipt.nonce,receipt_sha256:hash(readFileSync(file)),consumed_at:new Date().toISOString()};
  return publishAtomicReceipt(dir,name,consumed);
 });
}
// Scoped managed-events v3 hosts inject this durable, serialized nonce claim into their
// signing authority. A crash leaves the claim/lock burned, never a reusable grant.
export function claimScopedLocalNonce(directory:string,seal:{version:string;nonce:string;run_id:string;mac:string}){
 if(seal.version!=='PHASE48_SCOPED_CONSTANT_SQL_V4'||!/^[a-f0-9]{64}$/.test(seal.nonce)||!/^[a-f0-9]{64}$/.test(seal.mac))throw Error('SCOPED_NONCE_INVALID');
 return withPublicationLock(directory,'phase48-scoped-nonce-registry',dir=>{
  const name='phase48-consumed-'+seal.nonce+'.json';if(present(join(dir,name)))throw Error('SCOPED_NONCE_REVOKED');
  return publishAtomicReceipt(dir,name,{run_id:seal.run_id,scope:seal.version,nonce:seal.nonce,seal_mac:seal.mac,status:'CONSUMED',consumed_at:new Date().toISOString()});
 });
}
