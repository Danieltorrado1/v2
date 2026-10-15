/** Isolated local certification kernel. No pg, env, network, application services or production Mutate route. */
import { PGlite } from '@electric-sql/pglite';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

export const WRITE_TABLES = ['nomina_movimientos','cobertura_cuenta_cobro_externa_detalle','cobertura_cuentas_cobro_externas','nomina_revision_operativa','auditoria','auditoria_eventos','historial_cambios'] as const;
export const TARGETS = {nomina_movimientos:192,cobertura_cuenta_cobro_externa_detalle:220,cobertura_cuentas_cobro_externas:77,nomina_revision_operativa:20114} as const;
export const ACTION='NOMINA_202_192_INTEGRAL_LOCAL_V1';
export const FUTURE_AUTHORIZATION='REVOCADA/NO UTILIZABLE — AUTORIZO CORRECCION INTEGRAL empresa=15 contrato=24 periodo=3 turno=202 movimiento=192 cuenta=77 detalle=220 empleado=837 revision=20114 cantidad=1->2 unitario=97800 calculado=97800->195600 total=97800->195600 revision_version=30->31 estado=PENDIENTE afecta_seguridad_social=false INVALIDAR_REFERENCIA_PDF_PRESERVAR_OBJETO SIN_RECALCULO SIN_REGENERACION_PRODUCTIVA write_set=nomina_movimientos,cobertura_cuenta_cobro_externa_detalle,cobertura_cuentas_cobro_externas,nomina_revision_operativa,auditoria,auditoria_eventos,historial_cambios actor=<PENDIENTE> run_id=<PENDIENTE> nonce=<PENDIENTE> expires_at=<PENDIENTE>';
export type Row=Record<string,any>;
export type DatabaseState=Record<string,Row[]>;
export const canonical=(x:any):string=>JSON.stringify(x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])));
export const digest=(x:any)=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:canonical(x)).digest('hex');
const fail=(s:string):never=>{throw Error(s);};
const equal=(a:any,b:any,label:string)=>{if(canonical(a)!==canonical(b))fail(label);};
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const assertLocal=(db:PGlite)=>{if(!(db instanceof PGlite))fail('LOCAL_PGLITE_ONLY_PRODUCTION_DISABLED');};
export async function capture(db:PGlite):Promise<DatabaseState>{
 const tables=(await db.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const state:DatabaseState={};
 for(const {tablename} of tables)state[tablename]=(await db.query<{row:Row}>(`SELECT to_jsonb(t) AS row FROM public.${quote(tablename)} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row);
 return state;
}
export type DocumentEvidence={bucket:string;path:string;bytes:Buffer;approved:boolean;sent:boolean;signed:boolean;paid:boolean;posted:boolean};
export class LocalEvidenceStore {
 readonly objects=new Map<string,Buffer>();
 constructor(readonly evidence:DocumentEvidence){this.objects.set(evidence.bucket+'/'+evidence.path,Buffer.from(evidence.bytes));}
 verify(expectedHash:string){
  const e=this.evidence;
  if(e.approved||e.sent||e.signed||e.paid||e.posted)fail('DOCUMENT_ALREADY_FINALIZED');
  const bytes=this.objects.get(e.bucket+'/'+e.path);
  if(!bytes||digest(bytes)!==expectedHash||digest(e.bytes)!==expectedHash)fail('DOCUMENT_EVIDENCE_FAILURE');
 }
}
export type Manifest={before:DatabaseState;documentSha256:string;referenceSha256:string;triggerHash:string;actorId:number;technicalActorIds:readonly number[]};
type Ticket={runId:string;actorId:number;nonce:string;expiresAt:number;confirmation:string;manifestHash:string};
const tickets=new WeakMap<object,string>();
const consumed=new WeakSet<object>();
const activeDatabases=new WeakSet<PGlite>();
const manifestHash=(m:Manifest)=>digest(m);
export function localTicket(m:Manifest,now=Date.now(),ttlMs=60000):Ticket{
 if(!Number.isSafeInteger(ttlMs)||ttlMs<=0||ttlMs>300000)fail('EXPIRATION_INVALID');
 const nonce=randomBytes(24).toString('hex'),runId=randomUUID();
 const t={runId,actorId:m.actorId,nonce,expiresAt:now+ttlMs,manifestHash:manifestHash(m),confirmation:`LOCAL_ONLY ${ACTION} actor=${m.actorId} run_id=${runId} nonce=${nonce} expires_at=${now+ttlMs} manifest=${manifestHash(m)}`};
 tickets.set(t,digest(t));return t;
}
export type Envelope={algorithm:'aes-256-gcm';keyId:string;iv:string;tag:string;ciphertext:string};
export function protectReference(ref:{bucket:string;path:string},key:Buffer,keyId:string):Envelope{
 if(key.length!==32||!/^local-[a-z0-9-]{1,60}$/.test(keyId))fail('LOCAL_CUSTODY_KEY_REQUIRED');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(ACTION));
 const encrypted=Buffer.concat([cipher.update(canonical(ref)),cipher.final()]);
 return {algorithm:'aes-256-gcm',keyId,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:encrypted.toString('hex')};
}
export function recoverReference(e:Envelope,key:Buffer){const d=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'hex'));d.setAAD(Buffer.from(ACTION));d.setAuthTag(Buffer.from(e.tag,'hex'));return JSON.parse(Buffer.concat([d.update(Buffer.from(e.ciphertext,'hex')),d.final()]).toString()) as {bucket:string;path:string};}
const targetRow=(s:DatabaseState,t:keyof typeof TARGETS)=>s[t]?.find(r=>r.id===TARGETS[t])??fail('TARGET_MISSING_'+t);
export async function triggerHash(db:PGlite){
 const r=(await db.query<{definition:string;fn:string;enabled:string}>(`SELECT pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS fn,t.tgenabled AS enabled FROM pg_trigger t WHERE t.tgrelid='public.nomina_movimientos'::regclass AND t.tgname='trg_nomina_movimientos_invalida_revision'`)).rows;
 if(r.length!==1||r[0]?.enabled!=='O')fail('MANDATORY_TRIGGER_MISSING');return digest(r);
}
function assertObserved(m:Manifest,store:LocalEvidenceStore){
 const s=m.before,mv=targetRow(s,'nomina_movimientos'),d=targetRow(s,'cobertura_cuenta_cobro_externa_detalle'),cc=targetRow(s,'cobertura_cuentas_cobro_externas'),r=targetRow(s,'nomina_revision_operativa');
 const subset=(row:Row,expected:Row,label:string)=>{for(const k of Object.keys(expected))equal(row[k],expected[k],label+'_'+k);};
 subset(mv,{id:192,periodo_id:3,nomina_empleado_id:837,vinculacion_id:847,externo_id:33,tipo_movimiento:'TURNO_EXTERNO',familia_movimiento:'ADICION_DEVENGO',fecha:'2026-09-08',cantidad:1,valor_unitario:97800,valor_calculado:97800,valor_total:97800,estado:'PENDIENTE',afecta_seguridad_social:false,activo:true,tarifa_config_id:1,modalidad_id:1,aprobado_at:null},'MOVEMENT_BEFORE');
 subset(d,{id:220,cuenta_id:77,movimiento_id:192,turno_id:202,valor:97800,dias_efectivos:2,valor_diario:97800,fecha_inicio:'2026-09-08',fecha_fin:'2026-09-09',activo:true},'DETAIL_BEFORE');
 subset(cc,{id:77,empresa_id:15,contrato_id:24,periodo_id:3,externo_id:33,estado:'PENDIENTE',activo:true,valor_total:97800,firmado_bucket:null,firmado_path:null,firmado_at:null},'ACCOUNT_BEFORE');
 subset(r,{id:20114,periodo_id:3,nomina_empleado_id:837,estado_revision:'REVISADO',version_revision:30,invalidado_at:null,motivo_invalidacion:null},'REVISION_BEFORE');
 if(!r.revisado_por||!r.revisado_at||!cc.generado_at)fail('REVIEW_OR_DOCUMENT_PROVENANCE_MISSING');
 equal({bucket:cc.generado_bucket,path:cc.generado_path},{bucket:store.evidence.bucket,path:store.evidence.path},'DOCUMENT_REFERENCE_DRIFT');
 equal(digest(cc.generado_bucket+'/'+cc.generado_path),m.referenceSha256,'DOCUMENT_REFERENCE_HASH_DRIFT');
 const period=s.nomina_periodos?.find(x=>x.id===3);subset(period??{}, {id:3,contrato_id:24,estado:'ABIERTO'},'PERIOD_BEFORE');
 const turns=s.nomina_novedad_turnos?.filter(x=>x.movimiento_id===192&&x.activo);if(turns?.length!==1||turns[0]?.id!==202)fail('TURN_LINKS_DRIFT');
 subset(turns![0]!,{nomina_novedad_id:929,nomina_empleado_id:837,externo_id:33,tipo_turno:'EXTERNO'},'TURN_BEFORE');
 subset(s.nomina_novedades?.find(x=>x.id===929)??{}, {fecha_inicio:'2026-09-08',fecha_fin:'2026-09-09',dias:2,activo:true},'NOVELTY_BEFORE');
 subset(s.nomina_movimiento_tarifas?.find(x=>x.id===1)??{},{contrato_id:24,modalidad_id:1,valor_unitario:97800,tipo_movimiento:'TURNO_EXTERNO',activo:true,vigencia_desde:'2026-07-29',vigencia_hasta:'2026-12-31'},'RATE_BEFORE');
 if(s.cobertura_cuenta_cobro_externa_detalle?.filter(x=>x.cuenta_id===77).length!==1)fail('EXTRA_DETAIL');
 if(s.cobertura_cuentas_cobro_externas?.filter(x=>x.empresa_id===15&&x.contrato_id===24&&x.periodo_id===3&&x.externo_id===33).length!==1)fail('EXTRA_ACCOUNT');
 if(s.nomina_movimientos?.some(x=>x.id!==192&&x.externo_id===33&&x.periodo_id===3&&x.activo&&x.tipo_movimiento==='TURNO_EXTERNO'&&x.estado!=='RECHAZADO'))fail('DUPLICATE_MOVEMENT');
 const actor=s.usuarios?.find(x=>x.id===m.actorId);if(!actor?.activo||!m.technicalActorIds.includes(m.actorId))fail('VALIDATED_TECHNICAL_ACTOR_REQUIRED');
 store.verify(m.documentSha256);
}
function sanitized(row:Row,table:string,envelope:Envelope,m:Manifest){
 const result=structuredClone(row);
 if(table==='cobertura_cuentas_cobro_externas'&&result.generado_path){result.generado_bucket='[ENCRYPTED]';result.generado_path='[ENCRYPTED]';result.historical_document={alias:'account-77-original',sha256:m.documentSha256,reference_sha256:m.referenceSha256,reference_envelope:envelope};}
 return result;
}
const auditTables=['auditoria','auditoria_eventos','historial_cambios'];
const flatten=(value:any,prefix=''):Record<string,string|null>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?Object.assign({},...Object.entries(value).map(([k,v])=>flatten(v,prefix?prefix+'.'+k:k))):{[prefix||'root']:value===null?null:typeof value==='string'?value:canonical(value)};
function historyDiff(before:Row,after:Row){const a=flatten(before),b=flatten(after);return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>(a[k]??null)!==(b[k]??null)).sort().map(campo=>({campo,valor_anterior:a[campo]??null,valor_nuevo:b[campo]??null}));}
async function appendAudit(db:PGlite,table:string,id:number,before:Row,after:Row,t:Ticket,m:Manifest){
 const a={...after,run_id:t.runId,operation_key:ACTION,manifest_hash:manifestHash(m)};
 await db.query(`INSERT INTO auditoria_eventos(usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,15,24,'NOMINA',$2,$3,$4,$4,$5,$6)`,[t.actorId,table,String(id),ACTION,JSON.stringify(before),JSON.stringify(a)]);
 await db.query(`INSERT INTO auditoria(usuario_id,tabla_afectada,registro_id,accion,descripcion,datos_anteriores,datos_nuevos) VALUES($1,$2,$3,$4,$4,$5,$6)`,[t.actorId,table,id,ACTION,JSON.stringify(before),JSON.stringify(a)]);
 await db.query(`INSERT INTO historial_cambios(usuario_id,tabla_afectada,registro_id,campo,valor_anterior,valor_nuevo,motivo) VALUES($1,$2,$3,'__snapshot__',$4,$5,$6)`,[t.actorId,table,id,canonical(before),canonical(a),ACTION]);
 for(const d of historyDiff(before,a))await db.query(`INSERT INTO historial_cambios(usuario_id,tabla_afectada,registro_id,campo,valor_anterior,valor_nuevo,motivo) VALUES($1,$2,$3,$4,$5,$6,$7)`,[t.actorId,table,id,d.campo,d.valor_anterior,d.valor_nuevo,ACTION]);
}
function verifyAudit(s:DatabaseState,m:Manifest,env:Envelope){
 let runId:string|undefined;
 let expectedHistoryCount=0;
 for(const [table,id] of Object.entries(TARGETS)){
  const ae=s.auditoria_eventos?.filter(x=>x.accion===ACTION&&x.entidad===table&&x.entidad_id===String(id))??[];
  const al=s.auditoria?.filter(x=>x.accion===ACTION&&x.tabla_afectada===table&&x.registro_id===id)??[];
  if(ae.length!==1||al.length!==1)fail('STRICT_AUDIT_PAIR_INVALID');
  const event=ae[0]!,legacy=al[0]!;
  if(event.usuario_id!==m.actorId||legacy.usuario_id!==m.actorId)fail('AUDIT_ACTOR_DRIFT');
  equal(event.datos_anteriores,legacy.datos_anteriores,'AUDIT_BEFORE_PAIR_DRIFT');equal(event.datos_nuevos,legacy.datos_nuevos,'AUDIT_AFTER_PAIR_DRIFT');
  equal(event.datos_anteriores,sanitized(targetRow(m.before,table as keyof typeof TARGETS),table,env,m),'AUDIT_BEFORE_DRIFT');
  const {run_id,operation_key,manifest_hash,...row}=event.datos_nuevos;
  if(operation_key!==ACTION||manifest_hash!==manifestHash(m)||!run_id)fail('AUDIT_IDENTITY_INVALID');if(runId&&runId!==run_id)fail('AUDIT_RUN_MISMATCH');runId=run_id;
  equal(row,targetRow(s,table as keyof typeof TARGETS),'AUDIT_AFTER_DRIFT');
  const h=s.historial_cambios?.filter(x=>x.motivo===ACTION&&x.tabla_afectada===table&&x.registro_id===id)??[];
  const expected=[{campo:'__snapshot__',valor_anterior:canonical(event.datos_anteriores),valor_nuevo:canonical(event.datos_nuevos)},...historyDiff(event.datos_anteriores,event.datos_nuevos)];
  expectedHistoryCount+=expected.length;
  if(h.some(x=>x.usuario_id!==m.actorId))fail('HISTORY_ACTOR_DRIFT');
  equal(h.map(x=>({campo:x.campo,valor_anterior:x.valor_anterior,valor_nuevo:x.valor_nuevo})).sort((a,b)=>a.campo.localeCompare(b.campo)),expected.sort((a,b)=>a.campo.localeCompare(b.campo)),'CANONICAL_HISTORY_DRIFT');
 }
 if(s.auditoria_eventos?.filter(x=>x.accion===ACTION).length!==4||s.auditoria?.filter(x=>x.accion===ACTION).length!==4||s.historial_cambios?.filter(x=>x.motivo===ACTION).length!==expectedHistoryCount)fail('UNEXPECTED_AUDIT_ENTITY');
 return runId!;
}
function assertAfter(before:DatabaseState,after:DatabaseState,actorId:number,stamp:string){
 const changes:Record<string,Row>={nomina_movimientos:{cantidad:2,valor_calculado:195600,valor_total:195600,updated_by:actorId,updated_at:stamp},cobertura_cuenta_cobro_externa_detalle:{valor:195600},cobertura_cuentas_cobro_externas:{valor_total:195600,generado_bucket:null,generado_path:null,generado_at:null,updated_by:actorId,updated_at:stamp},nomina_revision_operativa:{estado_revision:'REQUIERE_REVISION',version_revision:31,revisado_por:null,revisado_at:null,invalidado_at:stamp,motivo_invalidacion:'TA_MODIFICADO',updated_at:stamp}};
 equal(Object.keys(after),Object.keys(before),'ADDITIONAL_TABLE_IN_WRITE_SET');
 for(const table of Object.keys(before)){
  if(auditTables.includes(table))continue;
  const expected=before[table]!.map(row=>changes[table]&&row.id===TARGETS[table as keyof typeof TARGETS]?{...row,...changes[table]}:row);
  equal(after[table]!.map(canonical).sort(),expected.map(canonical).sort(),'WRITE_SET_DRIFT_'+table);
 }
 for(const table of auditTables){const old=before[table]??[];for(const row of old)if(!after[table]?.some(x=>canonical(x)===canonical(row)))fail('EXISTING_AUDIT_MODIFIED');const added=after[table]!.filter(x=>!old.some(y=>y.id===x.id));if(table!=='historial_cambios'&&added.length!==4)fail('AUDIT_COUNT_INVALID');if(added.some(x=>(x.accion??x.motivo)!==ACTION))fail('UNEXPECTED_AUDIT_WRITE');}
}
export type ExecuteOptions={mode?:'PreviewOnly'|'Mutate';enableLocalMutate?:boolean;ticket?:Ticket;confirmation?:string;custodyKey:Buffer;custodyKeyId:string;store:LocalEvidenceStore};
export async function executeIntegralLocal(db:PGlite,m:Manifest,o:ExecuteOptions){
 assertLocal(db);
 const mutate=(o.mode??'PreviewOnly')==='Mutate';
 if(mutate&&(!o.enableLocalMutate||!o.ticket))fail('MUTATE_DISABLED_BY_DEFAULT');
 if(o.custodyKey.length!==32)fail('LOCAL_CUSTODY_KEY_REQUIRED');
 const t=o.ticket;
 if(mutate){if(!t||tickets.get(t)!==digest(t)||t.manifestHash!==manifestHash(m)||t.actorId!==m.actorId||o.confirmation!==t.confirmation||t.expiresAt<=Date.now())fail('CONFIRMATION_NONCE_OR_EXPIRATION_INVALID');}
 if(activeDatabases.has(db))fail('LOCAL_EXECUTOR_BUSY');activeDatabases.add(db);
 try {
 await db.query(mutate?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY');
 try{
  await db.query("SET LOCAL lock_timeout='2000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");
  if((await db.query<{transaction_isolation:string}>('SHOW transaction_isolation')).rows[0]?.transaction_isolation!=='serializable')fail('SERIALIZABLE_REQUIRED');
  if(!(await db.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(202,192) AS locked')).rows[0]?.locked)fail('ADVISORY_LOCK_BUSY');
  if(mutate)for(const [table,id] of Object.entries(TARGETS))await db.query(`SELECT id FROM ${quote(table)} WHERE id=$1 FOR UPDATE`,[id]);
  equal(await triggerHash(db),m.triggerHash,'TRIGGER_DRIFT');
  const triggers=(await db.query<{table_name:string;tgname:string}>(`SELECT c.relname AS table_name,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,[[...WRITE_TABLES]])).rows;
  equal(triggers,[{table_name:'nomina_movimientos',tgname:'trg_nomina_movimientos_invalida_revision'}],'UNREVIEWED_TRIGGER_WRITE_SET');
  if((await db.query(`SELECT rulename FROM pg_rules WHERE schemaname='public' AND tablename=ANY($1::text[])`,[[...WRITE_TABLES]])).rows.length)fail('UNREVIEWED_RULE_WRITE_SET');
  assertObserved(m,o.store);
  const before=await capture(db);
  if(before.auditoria_eventos?.some(x=>x.accion===ACTION)||before.auditoria?.some(x=>x.accion===ACTION)||before.historial_cambios?.some(x=>x.motivo===ACTION)){
   const event=before.auditoria_eventos?.find(x=>x.accion===ACTION&&x.entidad==='cobertura_cuentas_cobro_externas');
   const env=event?.datos_anteriores?.historical_document?.reference_envelope as Envelope|undefined;if(!env)fail('HISTORICAL_REFERENCE_MISSING');
   equal(recoverReference(env!,o.custodyKey),{bucket:o.store.evidence.bucket,path:o.store.evidence.path},'CUSTODY_RECOVERY_DRIFT');
   const runId=verifyAudit(before,m,env!);
   const stamp=targetRow(before,'nomina_movimientos').updated_at;assertAfter(m.before,before,m.actorId,stamp);
   await db.query('ROLLBACK');return {status:'ALREADY_APPLIED',run_id:runId,changed_rows:0,audits_added:0};
  }
  equal(before,m.before,'EXACT_BEFORE_STATE_DRIFT');
  if(t&&consumed.has(t))fail('NONCE_ALREADY_CONSUMED');
  const env=protectReference({bucket:o.store.evidence.bucket,path:o.store.evidence.path},o.custodyKey,o.custodyKeyId);
  equal(recoverReference(env,o.custodyKey),{bucket:o.store.evidence.bucket,path:o.store.evidence.path},'CUSTODY_RECOVERY_FAILURE');
  if(!mutate){await db.query('ROLLBACK');return {status:'PREVIEW_ONLY',write_tables:WRITE_TABLES,production_mutation_enabled:false,manifest_hash:manifestHash(m),projected:{cantidad:2,valor_total:195600,detalle_id:220,cuenta_estado:'PENDIENTE',revision_version:31}};}
  // Provisioned only in the isolated fixture, never on production. Invoker-rights
  // triggers cannot write other tables, even if their net change would be zero.
  await db.query('SET LOCAL ROLE nomina202_integral_local');
  const stamp=(await db.query<{stamp:string}>('SELECT to_jsonb(now()) AS stamp')).rows[0]!.stamp;
  const update=async(sql:string,p:any[])=>{if((await db.query(sql+' RETURNING id',p)).rows.length!==1)fail('GUARDED_UPDATE_DIVERGENCE');};
  await update(`UPDATE nomina_movimientos SET cantidad=2,valor_calculado=195600,valor_total=195600,updated_by=$1,updated_at=now() WHERE id=192 AND cantidad=1 AND valor_total=97800 AND estado='PENDIENTE' AND afecta_seguridad_social=false`,[m.actorId]);
  await update('UPDATE cobertura_cuenta_cobro_externa_detalle SET valor=195600 WHERE id=220 AND cuenta_id=77 AND movimiento_id=192 AND turno_id=202 AND valor=97800',[]);
  await update(`UPDATE cobertura_cuentas_cobro_externas SET valor_total=195600,generado_bucket=NULL,generado_path=NULL,generado_at=NULL,updated_by=$1,updated_at=now() WHERE id=77 AND estado='PENDIENTE' AND valor_total=97800 AND firmado_path IS NULL`,[m.actorId]);
  const changed=await capture(db);
  for(const [table,id] of Object.entries(TARGETS))await appendAudit(db,table,id,sanitized(targetRow(before,table as keyof typeof TARGETS),table,env,m),targetRow(changed,table as keyof typeof TARGETS),t!,m);
  const after=await capture(db);assertAfter(before,after,m.actorId,stamp);verifyAudit(after,m,env);o.store.verify(m.documentSha256);
  const known=[...WRITE_TABLES].sort(),actual=Object.keys(before).filter(k=>canonical(before[k])!==canonical(after[k])).sort();equal(actual,known,'STRICT_WRITE_SET_MISMATCH');
  await db.query('COMMIT');consumed.add(t!);
  return {status:'APPLIED_LOCAL_ONLY',run_id:t!.runId,changed_rows:4,audits_added:8,history_added:after.historial_cambios!.length-before.historial_cambios!.length,write_tables:actual,before:Object.fromEntries(Object.keys(TARGETS).map(k=>[k,sanitized(targetRow(before,k as keyof typeof TARGETS),k,env,m)])),after:Object.fromEntries(Object.keys(TARGETS).map(k=>[k,targetRow(after,k as keyof typeof TARGETS)]))};
 }catch(error){await db.query('ROLLBACK');throw error;}
 }finally{activeDatabases.delete(db);}
}
export function integralCli(args:string[]){if(args.length&&!(args.length===2&&args[0]==='--mode'&&args[1]==='PreviewOnly'))fail('PRODUCTION_MUTATE_NOT_IMPLEMENTED');return {mode:'PreviewOnly',production_mutation_enabled:false,local_api:'executeIntegralLocal(PGlite, manifest, options)',future_authorization:FUTURE_AUTHORIZATION};}
if(/^nomina-turno-202-integral-local\.(ts|js)$/.test(process.argv[1]?.split(/[\\/]/).pop()??'')){try{console.log(JSON.stringify(integralCli(process.argv.slice(2)),null,2));}catch(e){console.error((e as Error).message);process.exitCode=1;}}
