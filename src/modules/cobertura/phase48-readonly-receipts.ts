import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {authorizationFields,buildAuthorizationPhrase,parseAuthorizationPhrase,exactEqual,validateCertificateHash} from './phase48-readonly-contract';

export const RECEIPT_FILE='phase48-production-preflight-current.json';
export function saveReadReceipt(directory:string,receipt:any){
 validateCertificateHash(receipt.certificate_sha256);
 const file=resolve(directory,RECEIPT_FILE),temporary=resolve(directory,'.'+RECEIPT_FILE+'.tmp');
 if(!['PENDIENTE_DE_AUTORIZACION','STOPPED','STOPPED_DRIFT'].includes(receipt.status)||receipt.writes!==0)throw Error('FINAL_READ_RECEIPT_REQUIRED');
 if(receipt.status==='PENDIENTE_DE_AUTORIZACION'){
  if(receipt.authorization_status!==receipt.status||receipt.rollback!=='CONFIRMED'||receipt.principal_connection_closed!==true||receipt.post_rollback_verification?.status!=='STABLE'||receipt.post_rollback_verification?.rollback!=='CONFIRMED'||receipt.post_rollback_verification?.connection_closed!==true||receipt.authorization_phrase!==buildAuthorizationPhrase(authorizationFields(receipt)))throw Error('VERIFIED_AUTHORIZATION_REQUIRED');
 }else if(receipt.authorization_phrase||receipt.nonce)throw Error('STOPPED_AUTHORIZATION_FORBIDDEN');
 mkdirSync(directory,{recursive:true});
 // wx on the one temporary also serializes publication between processes.
 // Never remove a temporary owned by a different or interrupted invocation.
 let descriptor:number|undefined,owned=false;
 try{
  descriptor=openSync(temporary,'wx',0o600);owned=true;
  if(existsSync(file)){
   const previous=JSON.parse(readFileSync(file,'utf8'));
   receipt.previous_authorization=previous.nonce?{nonce:previous.nonce,run_id:previous.run_id,status:'REVOCADA',revoked_by:receipt.run_id}:{status:'NONE'};
  }else receipt.previous_authorization={status:'NONE'};
  writeFileSync(descriptor,JSON.stringify(receipt,null,2)+'\n');closeSync(descriptor);descriptor=undefined;
  renameSync(temporary,file);
 }finally{if(descriptor!==undefined)closeSync(descriptor);if(owned&&existsSync(temporary))unlinkSync(temporary);}
 return file;
}
export function validateCurrentNonce(receipt:any,phrase:string){
 const fields=parseAuthorizationPhrase(phrase);
 validateCertificateHash(receipt.certificate_sha256);
 if(receipt.status!=='PENDIENTE_DE_AUTORIZACION'||receipt.authorization_status!==receipt.status||receipt.rollback!=='CONFIRMED'||receipt.principal_connection_closed!==true||receipt.post_rollback_verification?.status!=='STABLE'||receipt.post_rollback_verification?.rollback!=='CONFIRMED'||receipt.post_rollback_verification?.connection_closed!==true||!exactEqual(receipt.nonce,fields.nonce)||!exactEqual(receipt.authorization_phrase,phrase)||!exactEqual(buildAuthorizationPhrase(authorizationFields(receipt)),phrase))throw Error('NONCE_REVOKED_OR_REUSED');
 return fields;
}
// Fail closed across processes and crashes. A claimed nonce is never restored
// after a failed connection or transaction; a new preflight must issue another.
export function consumeCurrentNonce(directory:string,phrase:string){
 const file=resolve(directory,RECEIPT_FILE),lock=resolve(directory,'.'+RECEIPT_FILE+'.tmp');
 const fd=openSync(lock,'wx',0o600);
 try{
  const receipt=JSON.parse(readFileSync(file,'utf8'));validateCurrentNonce(receipt,phrase);
  receipt.authorization_status='CONSUMED';receipt.status='CONSUMED';
  receipt.authorization_phrase=null;receipt.consumed_at=new Date().toISOString();
  writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 }finally{closeSync(fd);unlinkSync(lock);}
}
