/** Prepared, local-only document lifecycle. No filesystem, HTTP, Supabase or DB connector. */
import PDFDocument from 'pdfkit';
import { digest,canonical } from './nomina-turno-202-integral-local';

export const DOCUMENT_MODEL=Object.freeze({cuenta:77,turno:202,movimiento:192,detalle:220,dias:2,unitario:97800,total:195600});
export type DocumentIntent={runId:string;key:string;sha256:string;status:'PREPARED'|'UPLOADED'|'VERIFIED'|'PUBLISHED';expectedTotal:195600;accountStatus:'PENDIENTE'};
export class LocalVersionStorage {
 readonly objects=new Map<string,Buffer>();
 putNew(key:string,bytes:Buffer){const existing=this.objects.get(key);if(existing&&digest(existing)!==digest(bytes))throw Error('IMMUTABLE_KEY_COLLISION');if(!existing)this.objects.set(key,Buffer.from(bytes));}
 read(key:string){const bytes=this.objects.get(key);if(!bytes)throw Error('DOCUMENT_OBJECT_MISSING');return Buffer.from(bytes);}
}
export async function renderLocalProofPdf():Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margin:48,compress:false,info:{Title:'Simulacion local cuenta 77',CreationDate:new Date('2026-10-14T00:00:00Z'),ModDate:new Date('2026-10-14T00:00:00Z')}});
 const chunks:Buffer[]=[];const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.fontSize(11).fillColor('#8a2b17').text('SIMULACION LOCAL - SIN VALIDEZ DE COBRO');doc.moveDown();
 doc.fillColor('#172b4d').fontSize(24).text('Cuenta 77 - version propuesta');doc.moveDown();
 doc.fillColor('#333333').fontSize(12).text('Turno 202 | Movimiento 192 | Detalle 220');doc.moveDown();
 doc.text('Dias: 2');doc.text('Valor diario: $97.800');doc.moveDown();doc.fontSize(20).text('TOTAL A COBRAR: $195.600');
 doc.moveDown();doc.fontSize(10).text('Estado de la cuenta: PENDIENTE. No emitida, enviada, pagada ni contabilizada.');doc.moveDown();doc.text('El PDF anterior se conserva como evidencia historica. Este comprobante sanitizado solo valida el flujo local.');
 doc.end();return done;
}
export function validateExtractedDocument(text:string){
 const normalized=text.replace(/\s+/g,' ');
 if(!normalized.includes('Cuenta 77')||!normalized.includes('Turno 202 | Movimiento 192 | Detalle 220')||!normalized.includes('Dias: 2')||!normalized.includes('Valor diario: $97.800')||!normalized.includes('TOTAL A COBRAR: $195.600')||/TOTAL A COBRAR:\s*\$97[.,]800/.test(normalized))throw Error('DOCUMENT_ECONOMIC_VALIDATION_FAILED');
}
export type LocalDocumentPorts={
 render:()=>Promise<Buffer>;
 extract:(bytes:Buffer)=>Promise<string>;
 persistIntent:(intent:DocumentIntent)=>Promise<void>;
 // Future implementation must use the existing audit repositories for durable intent,
 // and atomically attach reference + strict audits/history. No production adapter exists.
 publishPendingReference:(intent:DocumentIntent)=>Promise<void>;
};
export async function prepareVersionLocal(receipt:{status:string;run_id?:string},oldKey:string,storage:LocalVersionStorage,ports:LocalDocumentPorts){
 if(!(storage instanceof LocalVersionStorage))throw Error('LOCAL_STORAGE_ONLY');
 if(!['APPLIED_LOCAL_ONLY','ALREADY_APPLIED'].includes(receipt.status)||!receipt.run_id||!/^[0-9a-f-]{36}$/.test(receipt.run_id))throw Error('COMMITTED_CORRECTION_REQUIRED');
 // Deliberately AFTER the economic COMMIT. Failure here cannot undo that commit.
 const bytes=await ports.render();if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('DOCUMENT_NOT_PDF');
 validateExtractedDocument(await ports.extract(bytes));
 const sha256=digest(bytes),key=`cobertura/cuentas-cobro/77/versiones/${receipt.run_id}/CUENTA_77_195600_${sha256}.pdf`;
 if(key===oldKey)throw Error('HISTORICAL_KEY_REUSE_FORBIDDEN');
 const intent:DocumentIntent={runId:receipt.run_id,key,sha256,status:'PREPARED',expectedTotal:195600,accountStatus:'PENDIENTE'};
 // Durable intent MUST succeed before upload; same run/key/hash makes retries reconcilable.
 await ports.persistIntent({...intent});
 try{
  storage.putNew(key,bytes);intent.status='UPLOADED';await ports.persistIntent({...intent});
  const readback=storage.read(key);if(digest(readback)!==sha256)throw Error('DOCUMENT_READBACK_HASH_FAILURE');
  validateExtractedDocument(await ports.extract(readback));intent.status='VERIFIED';await ports.persistIntent({...intent});
  await ports.publishPendingReference({...intent});intent.status='PUBLISHED';await ports.persistIntent({...intent});
  return {status:'DOCUMENT_VERIFIED_ACCOUNT_STILL_PENDING',intent,model:DOCUMENT_MODEL};
 }catch(error){
  // Preserve old object and staged new object. Do not delete evidence or "roll back"
  // economic values. Persisted PREPARED/UPLOADED/VERIFIED intent identifies retry/reconciliation.
  throw new Error('DOCUMENT_STAGE_FAILED_ACCOUNT_BLOCKED:'+canonical(intent),{cause:error});
 }
}
