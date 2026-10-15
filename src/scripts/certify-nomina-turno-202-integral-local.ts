/** Reproducible artifact producer; uses only PGlite + local files, never environment credentials. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {integralFixture} from '../tests/fixtures/nomina-202-integral-local-fixture';
import {canonical,capture,digest,executeIntegralLocal,recoverReference,FUTURE_AUTHORIZATION,WRITE_TABLES} from './nomina-turno-202-integral-local';
import {LocalVersionStorage,prepareVersionLocal,renderLocalProofPdf,type DocumentIntent} from './nomina-turno-202-document-local';

async function main(){
 const f=await integralFixture();try{
  const preview=await executeIntegralLocal(f.db,f.manifest,f.options(false));
  const options=f.options();options.custodyKeyId='local-'+options.ticket!.runId;
  await mkdir('tmp/nomina-202-local-custody',{recursive:true});
  const custodyPath=`tmp/nomina-202-local-custody/${options.ticket!.runId}.key`;
  await writeFile(custodyPath,f.key,{flag:'wx',mode:0o600});
  const first=await executeIntegralLocal(f.db,f.manifest,options),applied=await capture(f.db);
  const ref=recoverReference(first.before!.cobertura_cuentas_cobro_externas!.historical_document.reference_envelope,await readFile(custodyPath));
  if(ref.path!==f.store.evidence.path||ref.bucket!==f.store.evidence.bucket)throw Error('PERSISTED_CUSTODY_RECOVERY_FAILED');
  const second=await executeIntegralLocal(f.db,f.manifest,options);if(canonical(applied)!==canonical(await capture(f.db)))throw Error('IDEMPOTENCY_STATE_CHANGED');
  const bytes=await renderLocalProofPdf();await mkdir('tmp/pdfs',{recursive:true});await writeFile('tmp/pdfs/nomina-202-new-version-local-proof.pdf',bytes);
  const storage=new LocalVersionStorage();const oldKey=f.store.evidence.bucket+'/'+f.store.evidence.path;storage.putNew(oldKey,f.store.evidence.bytes);
  const intents:DocumentIntent[]=[];
  const doc=await prepareVersionLocal({status:first.status,run_id:first.run_id},oldKey,storage,{render:async()=>bytes,extract:async b=>{const r=spawnSync('py',['-c','import sys,io;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print("\\n".join(p.extract_text() for p in r.pages))'],{input:b,encoding:'utf8'});if(r.status!==0)throw Error('PDF_EXTRACTION_FAILED');return r.stdout;},persistIntent:async i=>{intents.push(i);},publishPendingReference:async()=>{/* Deliberately a local stub; no production publication adapter. */}});
  const original=await readFile('tmp/pdfs/nomina-202-account-77-original-readonly.pdf');
  if(digest(original)!=='cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4')throw Error('PRESERVED_REAL_PDF_HASH_CHANGED');
  const report={decision:'CORRECTOR_INTEGRAL_CERTIFICADO_LOCALMENTE',scope:'Local embedded PostgreSQL fixture; production execution unavailable',base_sha:'1effd71930d23a6e3fc26e9f8792858c6ef5995a',generated_at:new Date().toISOString(),write_tables:WRITE_TABLES,canonical_history_source:'src/modules/auditoria/auditoria.helper.ts insertLegacyAuditRows + buildHistorialDiffRows',fixture_fidelity:{physical_columns:'preserved READ ONLY catalog',constraints:'preserved READ ONLY definitions',mandatory_trigger:'observed production function + definition',identity_source:'sql/phase-6-auditoria-total.sql',synthetic_fields:['actor 9001 and technical allowlist','private path and old fixture bytes','text snapshots without identifying data','protected employee IBC/salary and other period'],production_before_state:false},preview,simulation:first,idempotency:second,document:{...doc,intents,original_real_pdf_preserved_sha256:digest(original),real_pdf_version_proof_sha256:digest(bytes),local_proof_path:'tmp/pdfs/nomina-202-new-version-local-proof.pdf',custody:{key_id:options.custodyKeyId,local_key_path:custodyPath,recovery_from_persisted_key:'PASS',production_key_provisioned:false},production_adapter:false,publish_adapter:'local stub; lifecycle protocol only'},production_connections:0,production_writes:0,production_recalculations:0,production_storage_mutations:0,production_regenerations:0,future_authorization:FUTURE_AUTHORIZATION};
  await writeFile('reports/nomina-202-integral-local-certification.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({decision:report.decision,simulation:first.status,idempotency:second.status,history_added:first.history_added,proof_pdf_sha256:digest(bytes),production_writes:0}));
 }finally{await f.db.close();}
}
void main().catch(e=>{console.error((e as Error).message);process.exitCode=1;});
