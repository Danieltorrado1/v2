import {sha256HexEqual} from './phase48-sha256';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {publishAtomicReceipt} from './phase48-readonly-receipts';
import {v6Hash} from './phase48-v6-evidence';
import {requireScoped} from './phase48-scoped-contract';
export const V6_RECEIPT_TYPES=['preflight','pending','started','seal','stopped','rolledback','committed','postflight','idempotency','reversed'] as const;
export type V6ReceiptType=typeof V6_RECEIPT_TYPES[number];
export const v6ReceiptPath=(directory:string,run:string,type:V6ReceiptType)=>join(directory,run+'.'+type+'.json');
export function publishV6Receipt(directory:string,run:string,type:V6ReceiptType,body:any,parents:{path:string;sha256:string}[]=[]){
 requireScoped(/^phase48-[a-f0-9-]{36}$/.test(run)&&V6_RECEIPT_TYPES.includes(type),'V6_RECEIPT_TYPE_REQUIRED');
 for(const parent of parents)requireScoped(sha256HexEqual(v6Hash(readFileSync(parent.path)),parent.sha256),'V6_PARENT_RECEIPT_CHANGED');
 const receipt={...body,run_id:run,receipt_type:type,parents};
 const path=publishAtomicReceipt(directory,run+'.'+type+'.json',receipt,{exclusive:true});
 return {path,sha256:v6Hash(readFileSync(path))};
}
export function claimV6Attempt(directory:string,run:string,nonce:string){
 // The marker is durable. A crash never permits a second mutation attempt.
 for(const type of V6_RECEIPT_TYPES.filter(t=>!['preflight','pending'].includes(t)))requireScoped(!existsSync(v6ReceiptPath(directory,run,type)),'V6_RECEIPT_DESTINATION_EXISTS:'+type);
 requireScoped(/^[a-f0-9]{64}$/.test(nonce),'V6_NONCE_INVALID');
 requireScoped(!existsSync(join(directory,'phase48-consumed-'+nonce+'.json'))&&!existsSync(join(directory,'phase48-consumed-'+nonce+'.claim')),'V6_NONCE_REVOKED_OR_REUSED');
 mkdirSync(join(directory,'phase48-consumed-'+nonce+'.claim'));
 mkdirSync(join(directory,'.'+run+'.attempt-claimed'));
}
