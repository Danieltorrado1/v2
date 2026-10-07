import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
export function saveReadReceipt(directory:string,receipt:any){
 mkdirSync(directory,{recursive:true});const indexPath=resolve(directory,'readonly-authorization-index.json'),lock=resolve(directory,'readonly-receipts.lock');
 writeFileSync(lock,'receipt serialization only\n',{flag:'wx'});
 try{
  const prior=existsSync(indexPath)?JSON.parse(readFileSync(indexPath,'utf8')):[];
  for(const item of prior){if(item.status==='PENDIENTE_DE_AUTORIZACION'){
   const file=resolve(directory,item.run_id+'.readonly.json'),old=JSON.parse(readFileSync(file,'utf8'));
   old.authorization='REVOCADA';old.status='REVOCADA';old.revoked_by=receipt.run_id;
   writeFileSync(file+'.tmp',JSON.stringify(old,null,2)+'\n');renameSync(file+'.tmp',file);item.status='REVOCADA';item.revoked_by=receipt.run_id;
  }}
  const file=resolve(directory,receipt.run_id+'.readonly.json');writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  prior.push({run_id:receipt.run_id,nonce:receipt.nonce??null,status:receipt.status,expires_at:receipt.expires_at??null});
  writeFileSync(indexPath+'.tmp',JSON.stringify(prior,null,2)+'\n');renameSync(indexPath+'.tmp',indexPath);
  return file;
 }finally{unlinkSync(lock);}
}
