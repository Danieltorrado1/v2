import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {publishAtomicReceipt} from './phase48-readonly-receipts';

export interface DiagnosticQueryResult {rows:any[];rowCount:number|null}
export interface DiagnosticClient {connect():Promise<void>;query(sql:string,values?:unknown[]):Promise<DiagnosticQueryResult>;end():Promise<void>}
export interface DiagnosticTlsEvidence extends Record<string,unknown> {protocol:'TLSv1.3';encrypted:true;authorized:true;rejectUnauthorized:true;ca_pinned:true;hostname_verified:true;servername_matches:true;authorization_error:null}
export interface DiagnosticOptions {
  directory:string;
  createClient():DiagnosticClient;
  validateTls(client:DiagnosticClient):Promise<DiagnosticTlsEvidence>;
  capture(db:{query(sql:string,values?:unknown[]):Promise<DiagnosticQueryResult>}):Promise<unknown>;
  runId?:string;
  fault?(phase:string):void|Promise<void>;
  publish?:(directory:string,name:string,receipt:unknown)=>{path:string;sha256:string};
}
export interface DiagnosticReceipt {
  kind:'PHASE48_V6_READ_QUERY_DIAGNOSTIC';run_id:string;status:'CAPTURED'|'STOPPED';phase:string;
  client_created:boolean;connect_attempted:boolean;tls_validated:boolean;transaction_started:boolean;
  query_id:string|null;rollback_attempted:boolean;rollback_confirmed:boolean;client_end_attempted:boolean;client_closed:boolean;pool_closed:false;
  connection_count:number;queries:{sequence:number;query_id:string;category:string;duration_ms:number|null;sqlstate:string|null;ok:boolean}[];
  first_error:Record<string,unknown>|null;operation_error:Record<string,unknown>|null;rollback_error:Record<string,unknown>|null;close_error:Record<string,unknown>|null;
  tls:Record<string,unknown>|null;capture_summary:Record<string,unknown>|null;writes:0;mutator_invoked:false;nonce_generated:false;phrase_generated:false;
}

const canonicalName=/^phase48-diagnostic-[a-f0-9-]{36}\.receipt\.json$/;
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const errorFields=(e:unknown)=>{const x=e as any;const frames=typeof x?.stack==='string'?x.stack.split(/\r?\n/).slice(1,9).map((f:string)=>f.trim().slice(0,240)).filter((f:string)=>/^at\s/.test(f)):[];return {error_type:typeof x?.name==='string'?x.name:'Error',sqlstate:typeof x?.code==='string'?x.code:null,severity:typeof x?.severity==='string'?x.severity:null,routine:typeof x?.routine==='string'?x.routine:null,position:typeof x?.position==='string'?x.position:null,internal_position:typeof x?.internalPosition==='string'?x.internalPosition:null,stack_frames:frames};};
const category=(sql:string)=>{const s=sql.toLowerCase();if(s.startsWith('begin'))return'transaction.begin';if(s==='rollback')return'transaction.rollback';if(s.startsWith('set local'))return'transaction.setting';if(s.includes('current_setting')&&s.includes('pg_backend_pid'))return'server_identity';if(s.includes('information_schema.columns'))return'schema.columns';if(s.includes('pg_constraint'))return'schema.constraints';if(s.includes('pg_indexes'))return'schema.indexes';if(s.includes('pg_event_trigger'))return'event_triggers';if(s.includes('pg_depend'))return'schema.dependencies';if(s.includes('pg_sequence'))return'sequences';if(s.includes('pg_proc')||s.includes('pg_get_functiondef'))return'definitions';if(s.includes('nomina_periodos'))return'periods';if(s.includes('nomina_empleados'))return'salary_decisions';if(s.includes('focalizacion_final'))return'candidates';if(s.includes('cobertura_asignaciones'))return'coverage';if(s.includes('empresas')&&s.includes('contratos'))return'scope';return'select';};
const stableId=(phase:string,sql:string,n:number)=>`read.${phase}.${category(sql)}.${sha(sql.replace(/\s+/g,' ').trim()).slice(0,12)}.${String(n).padStart(2,'0')}`;

export function parseReadQueryDiagnosticArgs(args:string[]){
 const allowed=new Set(['mode','receipt-directory']);const out:Record<string,string>=Object.create(null);
 for(const arg of args){const m=/^--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)=(.+)$/.exec(arg);if(!m||!allowed.has(m[1]!)||Object.hasOwn(out,m[1]!))throw Error('DIAGNOSTIC_ARGUMENT_INVALID');out[m[1]!]=m[2]!;}
 if(!['LocalFixture','ProductiveDiagnostic'].includes(out.mode??''))throw Error('DIAGNOSTIC_MODE_REQUIRED');if(!out['receipt-directory'])throw Error('DIAGNOSTIC_RECEIPT_DIRECTORY_REQUIRED');
 return {mode:out.mode as 'LocalFixture'|'ProductiveDiagnostic',directory:resolve(out['receipt-directory'])};
}

/** Exclusive same-volume hard-link publication: the final name appears only after a complete fsynced file exists. */
export function publishDiagnosticReceipt(directory:string,name:string,receipt:unknown){
 if(!canonicalName.test(name))throw Error('DIAGNOSTIC_RECEIPT_NAME_INVALID');const uuid=name.slice('phase48-diagnostic-'.length,-'.receipt.json'.length);const original=receipt as any;
 if(!original||original.run_id!==uuid)throw Error('DIAGNOSTIC_RECEIPT_RUN_ID_MISMATCH');
 const atomicRunId=`phase48-diagnostic-${uuid}`,atomicName=`${atomicRunId}.receipt.json`;
 const bytes=Buffer.from(JSON.stringify({...original,run_id:atomicRunId,diagnostic_run_id:uuid},null,2)+'\n','utf8');JSON.parse(bytes.toString('utf8'));
 const path=publishAtomicReceipt(directory,atomicName,JSON.parse(bytes.toString('utf8')),{exclusive:true});const stored=readFileSync(path);
 if(!stored.equals(bytes))throw Error('DIAGNOSTIC_RECEIPT_PUBLISHED_BYTES_MISMATCH');return {path,sha256:sha(stored)};
}

export async function runReadQueryDiagnostic(options:DiagnosticOptions){
 const runId=options.runId??randomUUID();if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('DIAGNOSTIC_RUN_ID_INVALID');
 const receipt:DiagnosticReceipt={kind:'PHASE48_V6_READ_QUERY_DIAGNOSTIC',run_id:runId,status:'STOPPED',phase:'offline_validation',client_created:false,connect_attempted:false,tls_validated:false,transaction_started:false,query_id:null,rollback_attempted:false,rollback_confirmed:false,client_end_attempted:false,client_closed:false,pool_closed:false,connection_count:0,queries:[],first_error:null,operation_error:null,rollback_error:null,close_error:null,tls:null,capture_summary:null,writes:0,mutator_invoked:false,nonce_generated:false,phrase_generated:false};
 let client:DiagnosticClient|undefined,connected=false,stopAfterFailure=false;const occurrences=new Map<string,number>();let primary:unknown;
 const phase=(name:string)=>{receipt.phase=name;return options.fault?.(name);};
 try{
  await phase('offline_validation');
  await phase('client_creation');client=options.createClient();receipt.client_created=true;receipt.connection_count=1;
  await phase('connect');receipt.connect_attempted=true;connected=true;await client.connect();
  await phase('tls_validation');const evidence=await options.validateTls(client);if(evidence.protocol!=='TLSv1.3'||evidence.encrypted!==true||evidence.authorized!==true||evidence.rejectUnauthorized!==true||evidence.ca_pinned!==true||evidence.hostname_verified!==true||evidence.servername_matches!==true||evidence.authorization_error!==null)throw Error('DIAGNOSTIC_TLS_EVIDENCE_INVALID');receipt.tls=evidence;receipt.tls_validated=true;
  const raw=client.query.bind(client);const db={query:async(sql:string,values?:unknown[])=>{
   if(stopAfterFailure)throw Error('DIAGNOSTIC_STOPPED_AFTER_FIRST_QUERY_FAILURE');
   const normalized=sql.replace(/\s+/g,' ').trim(),key=receipt.phase+'.'+sha(normalized),n=(occurrences.get(key)??0)+1;occurrences.set(key,n);const queryId=stableId(receipt.phase,sql,n);receipt.query_id=queryId;
   const item={sequence:receipt.queries.length+1,query_id:queryId,category:category(sql),duration_ms:null as number|null,sqlstate:null as string|null,ok:false};receipt.queries.push(item);const start=Date.now();
   try{const result=await raw(sql,values);item.duration_ms=Date.now()-start;item.ok=true;if(/^\s*BEGIN\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY\s*$/i.test(sql))receipt.transaction_started=true;return result;}
   catch(e){item.duration_ms=Date.now()-start;const fields=errorFields(e);item.sqlstate=fields.sqlstate as string|null;receipt.first_error={query_id:queryId,category:item.category,...fields};stopAfterFailure=true;throw e;}
  }};
  await phase('transaction_begin');await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await phase('capture');const captured=await options.capture(db);const c=captured as any;const digests=c?.digests&&typeof c.digests==='object'?c.digests:{};const digestEntries=Object.entries(digests);if(digestEntries.some(([key,value])=>!/^[a-z][a-z0-9_]*$/.test(key)||typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)))throw Error('DIAGNOSTIC_DIGEST_SHAPE_INVALID');receipt.capture_summary={candidate_count:Number.isInteger(c?.set?.candidate_count)?c.set.candidate_count:null,digest_count:digestEntries.length,digests:Object.fromEntries(digestEntries)};receipt.status='CAPTURED';
 }catch(e){primary=e;receipt.operation_error={phase:receipt.phase,...errorFields(e)};}
 finally{
  if(client&&connected){receipt.rollback_attempted=true;receipt.phase='rollback';try{await options.fault?.('rollback');}catch(e){receipt.rollback_error={phase:'rollback_instrumentation',...errorFields(e)};}try{await client.query('ROLLBACK');receipt.rollback_confirmed=true;}catch(e){receipt.rollback_error={phase:'rollback',...errorFields(e)};}}
  if(client){receipt.client_end_attempted=true;receipt.phase='client_end';try{await options.fault?.('client_end');}catch(e){receipt.close_error={phase:'client_end_instrumentation',...errorFields(e)};}try{await client.end();receipt.client_closed=true;}catch(e){receipt.close_error={phase:'client_end',...errorFields(e)};}}
  try{receipt.phase='receipt_publication';await options.fault?.('receipt_publication');const name=`phase48-diagnostic-${runId}.receipt.json`;const published=(options.publish??publishDiagnosticReceipt)(options.directory,name,receipt);return {receipt,publication:published,primary_error:primary};}
  catch(e){receipt.operation_error??={phase:receipt.phase,...errorFields(e)};throw Object.assign(Error('DIAGNOSTIC_RECEIPT_PUBLICATION_FAILED'),{cause:e,receipt,primary_error:primary});}
 }
}
