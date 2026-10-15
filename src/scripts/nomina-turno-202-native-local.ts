/** Loopback-only PostgreSQL 17.11 executor. No env, application services or production CLI. */
import {Pool,type PoolClient,type QueryResultRow} from 'pg';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {ACTION,TARGETS,WRITE_TABLES,canonical,digest,assertObserved,assertAfter,verifyAudit,
 sanitized,historyDiff,protectReference,recoverReference,validateNativeLocalTicket,nativeLocalTicketConsumed,
 type Manifest,type ExecuteOptions,type DatabaseState,type Row,type Ticket} from './nomina-turno-202-integral-local';

export type QueryMeasurement={phase:string;sql:string;ms:number;returned:number;written:number;rss:number;heap:number};
export class Native202Local {
 readonly #pool:Pool;
 #client:PoolClient|undefined;
 #verified=false;
 phase='connection';
 readonly measurements:QueryMeasurement[]=[];
 readonly identity:Record<string,unknown>={};
 private constructor(readonly cluster:string,readonly port:number,database:string){
  this.#pool=new Pool({host:'127.0.0.1',port,database,user:'supabase_admin',password:'',ssl:false,max:1,
   application_name:'nomina202_offline_performance',options:'-c timezone=UTC -c search_path=pg_catalog,public -c statement_timeout=120000'});
 }
 static async connect(cluster:string,port:number,database:'postgres'|'rollback_case'='postgres'){
  const resolved=realpathSync(cluster),parent=realpathSync(path.resolve('tmp'));
  if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('nomina-202-performance-cluster-')||!Number.isInteger(port)||port<1024||port>65535||[5432,5433].includes(port))throw Error('LOCAL_CLUSTER_PATH_OR_PORT_REJECTED');
  const db=new Native202Local(resolved,port,database);
  try{
   db.#client=await db.#pool.connect();
   const row=(await db.#client.query(`SELECT current_setting('server_version') AS version,current_setting('data_directory') AS directory,host(inet_server_addr()) AS host,inet_server_port() AS port,current_database() AS database,pg_backend_pid() AS pid`)).rows[0] as Row;
   if(row.version!=='17.11'||realpathSync(row.directory)!==resolved||row.host!=='127.0.0.1'||row.port!==port||row.database!==database)throw Error('LOCAL_IDENTITY_REJECTED');
   Object.assign(db.identity,row);db.#verified=true;return db;
  }catch(e){await db.close();throw e;}
 }
 async query<T extends QueryResultRow=Row>(sql:string,params:unknown[]=[]){
  if(!this.#verified||!this.#client)throw Error('UNVERIFIED_NATIVE_LOCAL_SESSION');
  const start=performance.now();let returned=0,written=0;
  try{const result=await this.#client.query<T>(sql,params),results=Array.isArray(result)?result:[result];returned=results.reduce((n,r)=>n+(r.rows?.length??0),0);written=results.reduce((n,r)=>n+(['INSERT','UPDATE','DELETE'].includes(r.command)?r.rowCount??0:0),0);return result;}
  finally{const memory=process.memoryUsage();this.measurements.push({phase:this.phase,sql:sql.replace(/'[^']*'/g,"'?'"),ms:performance.now()-start,returned,written,rss:memory.rss,heap:memory.heapUsed});}
 }
 async close(){this.#verified=false;this.#client?.release();this.#client=undefined;await this.#pool.end();}
}

const scopeSpecs=[
 ['nomina_movimientos',"id=192 OR (externo_id=33 AND periodo_id=3 AND activo AND tipo_movimiento='TURNO_EXTERNO' AND estado<>'RECHAZADO')"],
 ['cobertura_cuenta_cobro_externa_detalle','cuenta_id=77 OR id=220'],
 ['cobertura_cuentas_cobro_externas','id=77 OR (empresa_id=15 AND contrato_id=24 AND periodo_id=3 AND externo_id=33)'],
 ['nomina_revision_operativa','id=20114'],['nomina_periodos','id=3'],
 ['nomina_novedad_turnos','id=202 OR (movimiento_id=192 AND activo)'],
 ['nomina_novedades','id=929'],['nomina_movimiento_tarifas','id=1'],['usuarios','id=$1'],
 ['contratos','id=24'],['empresas','id=15'],['nomina_empleados','id=837'],['vinculaciones','id=847'],['personas','id=668']
] as const;
const auditSpecs=[['auditoria','accion',5],['auditoria_eventos','accion',5],['historial_cambios','motivo',43]] as const;
export const SCOPE_SQL='SELECT * FROM ('+scopeSpecs.map(([t,p])=>`SELECT '${t}' AS table_name,to_jsonb(t) AS row FROM (SELECT * FROM public.${t} WHERE ${p} LIMIT 2) t`).join(' UNION ALL ')+') scope ORDER BY table_name,row::text';
// Existing schema has no action/motive indexes in legacy audit/history. These bounded
// result queries must inspect the corpus to enforce global operation identity; never
// materialize unrelated historical rows in Node. No local-only index masks that cost.
export const AUDIT_SQL=auditSpecs.map(([t,col,limit])=>`SELECT '${t}' AS table_name,to_jsonb(t) AS row FROM (SELECT * FROM public.${t} WHERE ${col}=$1 ORDER BY id LIMIT ${limit}) t`).join(' UNION ALL ');
export const TRIGGER_SQL=`SELECT pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS fn,t.tgenabled AS enabled FROM pg_trigger t WHERE t.tgrelid='public.nomina_movimientos'::regclass AND t.tgname='trg_nomina_movimientos_invalida_revision'`;
export async function readNativeScope(db:Native202Local,actorId:number,audits=false):Promise<DatabaseState>{
 const result:DatabaseState=Object.fromEntries([...scopeSpecs.map(([t])=>t),...auditSpecs.map(([t])=>t)].sort().map(t=>[t,[]]));
 for(const x of (await db.query<{table_name:string;row:Row}>(SCOPE_SQL,[actorId])).rows)result[x.table_name]!.push(x.row);
 if(audits)for(const x of (await db.query<{table_name:string;row:Row}>(AUDIT_SQL,[ACTION])).rows)result[x.table_name]!.push(x.row);
 return result;
}
export async function nativeTriggerHash(db:Native202Local){const rows=(await db.query(TRIGGER_SQL)).rows;if(rows.length!==1||rows[0]?.enabled!=='O')throw Error('MANDATORY_TRIGGER_MISSING');return digest(rows);}
export function assertScopeTenant(s:DatabaseState){if(s.contratos?.[0]?.empresa_id!==15||s.empresas?.[0]?.id!==15)throw Error('TENANT_DRIFT');}
export async function prepareNativeManifest(db:Native202Local,actorId:number,o:Pick<ExecuteOptions,'store'>,certificationBaselineSha256:string){
 if(!(db instanceof Native202Local))throw Error('NATIVE_LOCAL_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(certificationBaselineSha256))throw Error('CERTIFICATION_BASELINE_DIGEST_REQUIRED');
 db.phase='baseline';const before=await readNativeScope(db,actorId);
 const m:Manifest&{certificationBaselineSha256:string}={before,documentSha256:digest(o.store.evidence.bytes),referenceSha256:digest(o.store.evidence.bucket+'/'+o.store.evidence.path),triggerHash:await nativeTriggerHash(db),actorId,technicalActorIds:[actorId],certificationBaselineSha256};
 assertObserved(m,o.store);assertScopeTenant(before);
 const freeze=(x:any)=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}};freeze(m);return m;
}
export function buildNativeAuditRows(before:DatabaseState,after:DatabaseState,t:Ticket,m:Manifest,envelope:ReturnType<typeof protectReference>){
 const events:Row[]=[],legacy:Row[]=[],history:Row[]=[];
 for(const [table,id]of Object.entries(TARGETS)){
  const b=sanitized(before[table]!.find(x=>x.id===id)!,table,envelope,m),row=after[table]!.find(x=>x.id===id)!;
  const a={...row,run_id:t.runId,operation_key:ACTION,manifest_hash:digest(m)};
  const common={usuario_id:t.actorId,accion:ACTION,descripcion:ACTION,datos_anteriores:b,datos_nuevos:a};
  events.push({...common,empresa_id:15,contrato_id:24,modulo:'NOMINA',entidad:table,entidad_id:String(id)});
  legacy.push({...common,tabla_afectada:table,registro_id:id});
  for(const d of [{campo:'__snapshot__',valor_anterior:canonical(b),valor_nuevo:canonical(a)},...historyDiff(b,a)])history.push({usuario_id:t.actorId,tabla_afectada:table,registro_id:id,...d,motivo:ACTION});
 }
 return{events,legacy,history};
}
export const INSERT_EVENTS=`INSERT INTO auditoria_eventos(usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos) SELECT usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos FROM jsonb_to_recordset($1::jsonb) AS x(usuario_id bigint,empresa_id bigint,contrato_id bigint,modulo text,entidad text,entidad_id text,accion text,descripcion text,datos_anteriores jsonb,datos_nuevos jsonb) RETURNING to_jsonb(auditoria_eventos.*) AS row`;
export const INSERT_LEGACY=`INSERT INTO auditoria(usuario_id,tabla_afectada,registro_id,accion,descripcion,datos_anteriores,datos_nuevos) SELECT usuario_id,tabla_afectada,registro_id,accion,descripcion,datos_anteriores,datos_nuevos FROM jsonb_to_recordset($1::jsonb) AS x(usuario_id bigint,tabla_afectada text,registro_id bigint,accion text,descripcion text,datos_anteriores jsonb,datos_nuevos jsonb) RETURNING to_jsonb(auditoria.*) AS row`;
export const INSERT_HISTORY=`INSERT INTO historial_cambios(usuario_id,tabla_afectada,registro_id,campo,valor_anterior,valor_nuevo,motivo) SELECT usuario_id,tabla_afectada,registro_id,campo,valor_anterior,valor_nuevo,motivo FROM jsonb_to_recordset($1::jsonb) AS x(usuario_id bigint,tabla_afectada text,registro_id bigint,campo text,valor_anterior text,valor_nuevo text,motivo text) RETURNING to_jsonb(historial_cambios.*) AS row`;
export const LOCK_SQL=`WITH m AS MATERIALIZED(SELECT id FROM nomina_movimientos WHERE id=192 FOR UPDATE),d AS MATERIALIZED(SELECT id FROM cobertura_cuenta_cobro_externa_detalle WHERE id=220 FOR UPDATE),c AS MATERIALIZED(SELECT id FROM cobertura_cuentas_cobro_externas WHERE id=77 FOR UPDATE),r AS MATERIALIZED(SELECT id FROM nomina_revision_operativa WHERE id=20114 FOR UPDATE) SELECT (SELECT count(*)::int FROM m) AS m,(SELECT count(*)::int FROM d) AS d,(SELECT count(*)::int FROM c) AS c,(SELECT count(*)::int FROM r) AS r`;
const busy=new WeakSet<Native202Local>();
export async function executeNative202Local(db:Native202Local,m:Manifest,o:ExecuteOptions,onBeforeCommit?:()=>Promise<void>){
 if(!(db instanceof Native202Local))throw Error('NATIVE_LOCAL_REQUIRED');
 const t=validateNativeLocalTicket(m,o);if(busy.has(db))throw Error('LOCAL_EXECUTOR_BUSY');busy.add(db);
 const start=performance.now();const timings:Record<string,number>={};let began=false,lockAt=0,commitMs=0,instrumentMs=0;
 try{
  db.phase='preflight';const pre=performance.now();assertObserved(m,o.store);assertScopeTenant(m.before);timings.preflight_ms=performance.now()-pre;
  db.phase='transaction_control';const txAt=performance.now();await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');began=true;
  const gatesAt=performance.now();await db.query("SELECT set_config('lock_timeout','2000ms',true),set_config('statement_timeout','10000ms',true)");
  db.phase='gates';lockAt=performance.now();const gate=(await db.query("SELECT current_setting('transaction_isolation') AS isolation,pg_try_advisory_xact_lock(202,192) AS locked")).rows[0]!;
  if(gate.isolation!=='serializable'||gate.locked!==true)throw Error('SERIALIZABLE_OR_ADVISORY_LOCK_REQUIRED');
  if(Object.values((await db.query(LOCK_SQL)).rows[0]!).some(x=>x!==1))throw Error('TARGET_LOCK_MISSING');
  if(await nativeTriggerHash(db)!==m.triggerHash)throw Error('TRIGGER_DRIFT');
  const observed=(await db.query(`SELECT c.relname AS table_name,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,[[...WRITE_TABLES]])).rows;
  if(canonical(observed)!==canonical([{table_name:'nomina_movimientos',tgname:'trg_nomina_movimientos_invalida_revision'}]))throw Error('UNREVIEWED_TRIGGER_WRITE_SET');
  if((await db.query("SELECT rulename FROM pg_rules WHERE schemaname='public' AND tablename=ANY($1::text[])",[[...WRITE_TABLES]])).rows.length)throw Error('UNREVIEWED_RULE_WRITE_SET');
  const before=await readNativeScope(db,m.actorId,true);assertScopeTenant(before);
  timings.gates_ms=performance.now()-gatesAt;
  if(auditSpecs.some(([table])=>before[table]!.length)){
   const event=before.auditoria_eventos!.find(x=>x.entidad==='cobertura_cuentas_cobro_externas'),env=event?.datos_anteriores?.historical_document?.reference_envelope;
   if(!env)throw Error('HISTORICAL_REFERENCE_MISSING');
   if(canonical(recoverReference(env,o.custodyKey))!==canonical({bucket:o.store.evidence.bucket,path:o.store.evidence.path}))throw Error('CUSTODY_RECOVERY_DRIFT');
   const runId=verifyAudit(before,m,env);assertAfter(m.before,before,m.actorId,before.nomina_movimientos!.find(x=>x.id===192)!.updated_at);
   db.phase='transaction_control';await db.query('ROLLBACK');began=false;
   timings.transaction_ms=performance.now()-txAt;timings.lock_ms=performance.now()-lockAt;timings.total_ms=performance.now()-start;
   return{status:'ALREADY_APPLIED',run_id:runId,changed_rows:0,audits_added:0,history_added:0,timings};
  }
  if(canonical(before)!==canonical(m.before))throw Error('EXACT_BEFORE_STATE_DRIFT');
  if(nativeLocalTicketConsumed(t))throw Error('NONCE_ALREADY_CONSUMED');
  const envelope=protectReference({bucket:o.store.evidence.bucket,path:o.store.evidence.path},o.custodyKey,o.custodyKeyId);
  db.phase='transaction_control';await db.query('SET LOCAL ROLE nomina202_integral_local');
  const stamp=(await db.query('SELECT to_jsonb(now()) AS stamp')).rows[0]!.stamp;
  db.phase='dml';const dmlAt=performance.now();const update=async(sql:string,params:unknown[])=>{if((await db.query(sql+' RETURNING id',params)).rows.length!==1)throw Error('GUARDED_UPDATE_DIVERGENCE');};
  await update("UPDATE nomina_movimientos SET cantidad=2,valor_calculado=195600,valor_total=195600,updated_by=$1,updated_at=now() WHERE id=192 AND cantidad=1 AND valor_total=97800 AND estado='PENDIENTE' AND afecta_seguridad_social=false",[m.actorId]);
  await update('UPDATE cobertura_cuenta_cobro_externa_detalle SET valor=195600 WHERE id=220 AND cuenta_id=77 AND movimiento_id=192 AND turno_id=202 AND valor=97800',[]);
  await update("UPDATE cobertura_cuentas_cobro_externas SET valor_total=195600,generado_bucket=NULL,generado_path=NULL,generado_at=NULL,updated_by=$1,updated_at=now() WHERE id=77 AND estado='PENDIENTE' AND valor_total=97800 AND firmado_path IS NULL",[m.actorId]);
  timings.dml_including_trigger_ms=performance.now()-dmlAt;
  db.phase='scoped_postflight';const scopedAt=performance.now();const after=await readNativeScope(db,m.actorId),rows=buildNativeAuditRows(before,after,t,m,envelope);timings.scoped_capture_and_payload_ms=performance.now()-scopedAt;
  const auditAt=performance.now();
  for(const [phase,table,sql,batch]of [
   ['audit_events','auditoria_eventos',INSERT_EVENTS,rows.events],['audit_legacy','auditoria',INSERT_LEGACY,rows.legacy],['history','historial_cambios',INSERT_HISTORY,rows.history]
  ] as const){db.phase=phase;after[table]=(await db.query<{row:Row}>(sql,[JSON.stringify(batch)])).rows.map(x=>x.row);if(after[table]!.length!==batch.length)throw Error('AUDIT_BATCH_DIVERGENCE');}
  timings.audit_batches_ms=performance.now()-auditAt;
  db.phase='scoped_postflight';const verifyAt=performance.now();assertAfter(before,after,m.actorId,stamp);verifyAudit(after,m,envelope);o.store.verify(m.documentSha256);timings.scoped_verification_ms=performance.now()-verifyAt;
  if(rows.history.length!==42)throw Error('CANONICAL_HISTORY_COUNT_DRIFT');
  if(onBeforeCommit){db.phase='test_instrumentation';const at=performance.now();await onBeforeCommit();instrumentMs=performance.now()-at;}
  db.phase='commit';const ct=performance.now();await db.query('COMMIT');commitMs=performance.now()-ct;began=false;nativeLocalTicketConsumed(t,true);
  timings.transaction_ms=performance.now()-txAt;timings.commit_ms=commitMs;timings.lock_ms=performance.now()-lockAt;timings.instrumentation_ms=instrumentMs;timings.corrector_excluding_instrumentation_ms=performance.now()-start-instrumentMs;timings.total_ms=performance.now()-start;
  return{status:'APPLIED_LOCAL_ONLY',run_id:t.runId,changed_rows:4,audits_added:8,history_added:rows.history.length,write_tables:[...WRITE_TABLES].sort(),timings};
 }catch(e){if(began){db.phase='rollback';await db.query('ROLLBACK');}throw e;}finally{busy.delete(db);}
}
