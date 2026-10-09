import {readFileSync,writeFileSync,existsSync,mkdirSync,rmdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {authorizationFields,buildAuthorizationPhrase,parseAuthorizationPhrase,exactEqual,validateCertificateHash,DIGEST_FIELDS} from './phase48-readonly-contract';

export const RECEIPT_FILE='phase48-production-preflight-current.json';
function verifiedEight(receipt:any){
 const exact=(value:any)=>value&&Object.keys(value).length===8&&Object.keys(value).every(k=>DIGEST_FIELDS.includes(k as typeof DIGEST_FIELDS[number]));
 return receipt.stable===true&&exact(receipt.first_digests)&&exact(receipt.post_rollback_digests)&&exact(receipt.digest_comparison)&&receipt.first_snapshot?.read_only==='on'&&receipt.post_rollback_snapshot?.read_only==='on'&&receipt.first_snapshot.pid!==receipt.post_rollback_snapshot.pid&&receipt.first_snapshot.virtual_transaction!==receipt.post_rollback_snapshot.virtual_transaction&&DIGEST_FIELDS.every(k=>/^[a-f0-9]{64}$/.test(receipt.first_digests[k])&&exactEqual(receipt.first_digests[k],receipt.post_rollback_digests[k])&&exactEqual(receipt.digests?.[k],receipt.first_digests[k])&&receipt.digest_comparison[k]===true);
}
export function saveReadReceipt(directory:string,receipt:any){
 validateCertificateHash(receipt.certificate_sha256);
 const file=resolve(directory,RECEIPT_FILE),temporary=resolve(directory,'.'+RECEIPT_FILE+'.tmp');
 if(!['PENDIENTE_DE_AUTORIZACION','STOPPED','STOPPED_DRIFT'].includes(receipt.status)||receipt.writes!==0)throw Error('FINAL_READ_RECEIPT_REQUIRED');
 if(receipt.status==='PENDIENTE_DE_AUTORIZACION'){
  if(!verifiedEight(receipt)||receipt.authorization_status!==receipt.status||receipt.rollback!=='CONFIRMED'||receipt.principal_connection_closed!==true||receipt.post_rollback_verification?.status!=='STABLE'||receipt.post_rollback_verification?.rollback!=='CONFIRMED'||receipt.post_rollback_verification?.connection_closed!==true||receipt.authorization_phrase!==buildAuthorizationPhrase(authorizationFields(receipt)))throw Error('VERIFIED_AUTHORIZATION_REQUIRED');
 }else if(receipt.authorization_phrase||receipt.nonce)throw Error('STOPPED_AUTHORIZATION_FORBIDDEN');
 mkdirSync(directory,{recursive:true});
 // Exclusive mkdir serializes publication without creating another file.
 // Never remove a lock directory owned by another/interrupted invocation.
 let owned=false;
 try{
  mkdirSync(temporary);owned=true;
  if(existsSync(file)){
   const previous=JSON.parse(readFileSync(file,'utf8'));
   receipt.previous_authorization=previous.nonce?{nonce:previous.nonce,run_id:previous.run_id,status:'REVOCADA',revoked_by:receipt.run_id}:{status:'NONE'};
  }else receipt.previous_authorization={status:'NONE'};
  // Single receipt file; a transient directory serializes publishers/consumers.
  // Interrupted writes fail closed (invalid JSON); no auxiliary file is emitted.
  writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 }finally{if(owned)rmdirSync(temporary);}
 return file;
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
 const file=resolve(directory,RECEIPT_FILE),lock=resolve(directory,'.'+RECEIPT_FILE+'.tmp');
 mkdirSync(lock);
 try{
  const receipt=JSON.parse(readFileSync(file,'utf8'));validateCurrentNonce(receipt,phrase);
  receipt.authorization_status='CONSUMED';receipt.status='CONSUMED';
  receipt.authorization_phrase=null;receipt.consumed_at=new Date().toISOString();
  writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 }finally{rmdirSync(lock);}
}
