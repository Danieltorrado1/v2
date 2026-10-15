// Isolated executor process. Only explicit loopback PG17.11 and exact local PDF copy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const native=require('../../dist/scripts/nomina-turno-202-native-local.js');
const core=require('../../dist/scripts/nomina-turno-202-integral-local.js');
const docs=require('../../dist/scripts/nomina-turno-202-document-local.js');
const [cluster,portText,backup,out]=process.argv.slice(2),port=Number(portText);
let db,manifest,store,key,first,second,newPdf,storage,ports,oldKey='historical/account-77.pdf';
const write=(name,v)=>fs.writeFileSync(path.join(out,name),Buffer.isBuffer(v)?v:JSON.stringify(v,null,2)+'\n');
const memory={sampled_rss_peak:0,sampled_heap_peak:0};
function sample(){const m=process.memoryUsage();memory.sampled_rss_peak=Math.max(memory.sampled_rss_peak,m.rss);memory.sampled_heap_peak=Math.max(memory.sampled_heap_peak,m.heapUsed);}
const sampler=setInterval(sample,10);
const options=()=>{const ticket=core.localTicket(manifest,Date.now(),300000);return{mode:'Mutate',enableLocalMutate:true,ticket,confirmation:ticket.confirmation,custodyKey:key,custodyKeyId:'local-native-performance',store};};
async function init(database='postgres'){
 db=await native.Native202Local.connect(cluster,port,database);
 if(!manifest){
  db.phase='preflight';const before=(await db.query('SELECT to_jsonb(t) AS row FROM cobertura_cuentas_cobro_externas t WHERE id=77')).rows[0].row;
  const actor=Number((await db.query('SELECT u.id FROM usuarios u WHERE u.activo ORDER BY (u.id=(SELECT revisado_por FROM nomina_revision_operativa WHERE id=20114)) DESC,u.id LIMIT 1')).rows[0].id);
  const bytes=fs.readFileSync(path.join(backup,'historical-account-77.pdf'));
  if(core.digest(bytes)!=='cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4')throw Error('HISTORICAL_PDF_HASH_DRIFT');
  store=new core.LocalEvidenceStore({bucket:before.generado_bucket,path:before.generado_path,bytes,approved:false,sent:false,signed:false,paid:false,posted:false});
  const certificationBaseline=JSON.parse(fs.readFileSync(path.join(out,'initial-table-digests.json'),'utf8'));
  manifest=await native.prepareNativeManifest(db,actor,{store},core.digest(certificationBaseline));key=crypto.randomBytes(32);
 }
}
async function command(name){
 if(name==='INIT'){const at=performance.now();await init();return{identity:db.identity,preflight_and_baseline_ms:performance.now()-at,manifest_sha256:core.digest(manifest),baseline_rows:Object.fromEntries(Object.entries(manifest.before).map(([t,r])=>[t,r.length]))};}
 if(name==='GUARDS'){
  const results=[];
  const expect=async(label,m,o,code)=>{try{await native.executeNative202Local(db,m,o);throw Error('GUARD_DID_NOT_REJECT_'+label)}catch(e){if(!e.message.includes(code))throw e;results.push({label,rejected:code})}};
  const base=options();await expect('default_disabled',manifest,{...base,enableLocalMutate:false},'MUTATE_DISABLED');
  await expect('confirmation',manifest,{...base,confirmation:'incorrect'},'CONFIRMATION_NONCE');
  await expect('forged_nonce',manifest,{...base,ticket:{...base.ticket}},'CONFIRMATION_NONCE');
  await expect('custody',manifest,{...base,custodyKey:Buffer.alloc(31)},'LOCAL_CUSTODY_KEY');
  const expired=core.localTicket(manifest,1,1);await expect('expired',manifest,{...base,ticket:expired,confirmation:expired.confirmation},'CONFIRMATION_NONCE');
  const drift=structuredClone(manifest);drift.before.nomina_empleados[0].ibc=Number(drift.before.nomina_empleados[0].ibc??0)+1;
  const driftTicket=core.localTicket(drift);await expect('protected_IBC_baseline',drift,{...base,ticket:driftTicket,confirmation:driftTicket.confirmation},'EXACT_BEFORE_STATE_DRIFT');
  const trigger={...manifest,triggerHash:'wrong'},triggerTicket=core.localTicket(trigger);await expect('trigger_function_hash',trigger,{...base,ticket:triggerTicket,confirmation:triggerTicket.confirmation},'TRIGGER_DRIFT');
  return{results,frozen_manifest:Object.isFrozen(manifest)&&Object.isFrozen(manifest.before.nomina_empleados[0])};
 }
 if(name==='APPLY'){
  let locks=[];const at=performance.now();first=await native.executeNative202Local(db,manifest,options(),async()=>{locks=(await db.query('SELECT locktype,mode,granted,count(*)::int AS count FROM pg_locks WHERE pid=pg_backend_pid() GROUP BY 1,2,3 ORDER BY 1,2,3')).rows;});
  return{...first,wall_ms:performance.now()-at,locks};
 }
 if(name==='IDEMPOTENT'){second=await native.executeNative202Local(db,manifest,options());return second;}
 if(name==='DOCUMENT_FAIL'){
  if(first?.status!=='APPLIED_LOCAL_ONLY')throw Error('ECONOMIC_COMMIT_REQUIRED');
  newPdf=await docs.renderLocalProofPdf();write('new-local-proof.pdf',newPdf);storage=new docs.LocalVersionStorage();storage.putNew(oldKey,store.evidence.bytes);const intents=[];
  ports={render:async()=>newPdf,extract:async bytes=>execFileSync('py',['-c','import sys,io;from pypdf import PdfReader;print("\\n".join(p.extract_text() for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages))'],{input:bytes,encoding:'utf8',windowsHide:true}),persistIntent:async intent=>{intents.push({...intent});write('document-intents.json',intents)},publishPendingReference:async()=>{throw Error('INDUCED_POST_COMMIT_DOCUMENT_FAILURE')}};
  try{await docs.prepareVersionLocal(first,oldKey,storage,ports);}catch(e){if(!e.message.startsWith('DOCUMENT_STAGE_FAILED_ACCOUNT_BLOCKED:'))throw e;return{failed_after_commit:true,economy_reexecuted:false};}throw Error('DOCUMENT_DID_NOT_FAIL');
 }
 if(name==='DOCUMENT_RECOVER'){
  ports.publishPendingReference=async()=>{};const result=await docs.prepareVersionLocal(second,oldKey,storage,ports);
  if(storage.objects.size!==2||core.digest(storage.read(oldKey))!==manifest.documentSha256||result.intent.sha256===manifest.documentSha256)throw Error('DOCUMENT_IMMUTABILITY_FAILED');
  return{...result,historical_sha256:manifest.documentSha256,historical_preserved:true,object_count:storage.objects.size,publish_adapter:'LOCAL_STUB_NO_DATABASE_OR_REMOTE_STORAGE'};
 }
 if(name==='ROLLBACK'){
  await db.close();await init('rollback_case');const at=performance.now();try{await native.executeNative202Local(db,manifest,options());}catch(e){if(e.code!=='23514')throw e;return{induced_sqlstate:e.code,ms:performance.now()-at};}throw Error('INDUCED_ROLLBACK_DID_NOT_FAIL');
 }
 if(name==='STOP'){await db?.close();clearInterval(sampler);return{stopped:true};}
 throw Error('UNKNOWN_LOCAL_COMMAND');
}
process.on('message',async message=>{const offset=db?.measurements.length??0;const resourceAt=process.resourceUsage();try{
 const result=await command(message.command);sample();process.send({id:message.id,result,queries:db?.measurements.slice(message.command==='ROLLBACK'?0:offset)??[],memory:{...memory,resource_max_rss:process.resourceUsage().maxRSS*1024,scope:'this isolated Node executor PID only; excludes certification runner and PostgreSQL'},cpu_delta_us:{user:process.resourceUsage().userCPUTime-resourceAt.userCPUTime,system:process.resourceUsage().systemCPUTime-resourceAt.systemCPUTime}});
 if(message.command==='STOP')process.disconnect();
 }catch(e){sample();process.send({id:message.id,error:{code:e.code??e.message},queries:db?.measurements.slice(offset)??[],memory});}});
process.on('disconnect',()=>{clearInterval(sampler);if(db)void db.close().catch(()=>{});});
