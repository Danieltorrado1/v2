import type {PoolClient} from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createReadOnlyRepository} from './phase48-readonly-repository';

export const READ_MODES=['PreflightOnly','PreviewOnly','PreflightAndPreview'] as const;
export const READ_BACKUP_SHA='4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26';
export const READ_PROJECT_REF='scuvsocqibbubqnesvuf';
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface ReadFlags {health200:boolean;databaseOk:boolean;outbox:boolean;sync:boolean;recalc:boolean;worker:boolean;}
export interface ReadOptions {mode?:string;target:'Local'|'Production';commit:string;backupSha:string;observeFlags:()=>Promise<ReadFlags>;}
function need(value:unknown,code:string):asserts value {if(!value)throw Error(code);}
export function validateReadOptions(o:ReadOptions){
 need(READ_MODES.includes((o.mode??'PreflightAndPreview') as typeof READ_MODES[number]),'UNKNOWN_READ_MODE');
 need(['Local','Production'].includes(o.target)&&/^[a-f0-9]{40}$/.test(o.commit)&&o.backupSha===READ_BACKUP_SHA&&typeof o.observeFlags==='function','READ_CONFIGURATION_INVALID');
 need(Object.keys(o).every(k=>['mode','target','commit','backupSha','observeFlags'].includes(k)),'READ_OPTION_NOT_ALLOWED');
}
function flagsGate(f:ReadFlags){need(f&&Object.values(f).length===6&&Object.values(f).every(v=>typeof v==='boolean')&&f.health200===true&&f.databaseOk===true&&f.outbox===false&&f.sync===false&&f.recalc===false&&f.worker===false,'FLAGS_UNAVAILABLE_OR_UNSAFE');}
export async function productionReadOnlyPreflight(client:Pick<PoolClient,'query'>,o:ReadOptions){
 const runId='phase48-preflight-'+randomUUID();let begun=false,result:any;
 try{
  validateReadOptions(o);const firstFlags=await o.observeFlags();flagsGate(firstFlags);
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  await client.query("SET LOCAL statement_timeout='120s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL search_path=pg_catalog,public");
  const repo=createReadOnlyRepository(client),session=await repo.session();
  need(session.read_only==='on'&&session.isolation==='repeatable read','READ_TRANSACTION_REQUIRED');
  if(o.target==='Local')need(session.host==='127.0.0.1'&&session.port===55466&&session.version==='17.11','LOCAL_READ_TARGET_REQUIRED');
  else need(session.version==='17.6'&&await repo.ssl(),'PRODUCTION_TLS_OR_VERSION_INVALID');
  await repo.safePolicies();await repo.actor();const locks=await repo.activity();need(locks.waiting===0&&locks.ddl===0,'LOCK_OR_DDL_DETECTED');
  const initial=await repo.snapshot();need(initial.data.length===224,'PUBLIC_TABLE_POPULATION_CHANGED');await repo.verify(initial);
  const candidates=await repo.candidates();need(candidates.length===730&&initial.data.find(r=>r.table==='cobertura_asignaciones')?.count==='730','PHASE48_POPULATION_CHANGED');
  const plan=await repo.plan();need(plan.every(p=>!p.applied)&&plan[0]?.category_id==='34'&&plan[1]?.category_id===null&&plan[1]?.estado_salarial==='REQUIERE_REVISION_SALARIAL','HISTORICAL_STATE_CHANGED');
  const coverage=await repo.coverage(),affected=await repo.affected(),periods=await repo.periods();
  const digests={schema_digest:digest({schema:initial.schema,constraints:initial.constraints,indexes:initial.indexes,routines:initial.routines,triggers:initial.triggers}),source_digest:initial.digest,phase48_candidate_digest:digest(candidates),albeny_before_digest:digest({coverage:coverage.filter(r=>r.row.vinculacion_id===1555),vinculacion:affected.filter(r=>r.row.id===1555)}),dary_before_digest:digest({coverage:coverage.filter(r=>r.row.vinculacion_id===249),vinculacion:affected.filter(r=>r.row.id===249)}),protected_tables_digest:digest(initial.data.filter(r=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(r.table))),periods_4_6_digest:digest(periods.filter(r=>[4,6].includes(r.row.id))),sequences_digest:digest(initial.sequences)};
  const preview=plan.map(p=>({vinculacion:p.vinculacion,coverage_id:p.coverage_id,desde:p.desde,hasta:p.hasta,modalidad_id:p.modalidad,category_id:p.category_id,estado_salarial:p.estado_salarial,following_coverage_id:p.siguiente,following_from:p.siguienteDesde,preserved_attendances:p.vinculacion==='1555'?16:0,created_attendances:0,automatic_recalculation:false,external_sync:false}));
  const final=await repo.snapshot(),finalSession=await repo.session(),finalLocks=await repo.activity(),finalFlags=await o.observeFlags();flagsGate(finalFlags);
  need(initial.digest===final.digest&&digest(session)===digest(finalSession)&&digest(locks)===digest(finalLocks)&&digest(firstFlags)===digest(finalFlags),'READ_SAMPLE_CHANGED');
  const nonce=randomBytes(32).toString('hex'),utc=new Date().toISOString(),expiresAt=new Date(Date.now()+10*60_000).toISOString();
  const phrase=`AUTHORIZE_PHASE48_HISTORICAL|commit=${o.commit}|backup=${READ_BACKUP_SHA}|project=${READ_PROJECT_REF}|empresa=15|contrato=24|actor=12|rows=730|${Object.entries(digests).map(([k,v])=>k+'='+v).join('|')}|nonce=${nonce}|expires_at=${expiresAt}|OUTBOX=false|SYNC=false|RECALC=false|suppressExternalSync=true|preserveOperationalSources=true|noPayrollRecalculation=true`;
  result={status:'PENDIENTE_DE_AUTORIZACION',mode:o.mode??'PreflightAndPreview',run_id:runId,utc,expires_at:expiresAt,commit:o.commit,backup_sha:READ_BACKUP_SHA,project_ref:READ_PROJECT_REF,scope:{actor:12,empresa:15,contrato:24},phase48_state:'NO_APLICADA',phase48_rows:730,counts:initial.data,digests,health:{http200:firstFlags.health200,database_ok:firstFlags.databaseOk,source:o.target==='Local'?'LOCAL_TEST_OBSERVER':'PUBLIC_HEALTH'},flags:firstFlags,locks,preview,session:{pid:session.pid,snapshot:session.snapshot,virtual_transaction:session.virtual_transaction,read_only:session.read_only,isolation:session.isolation,server_version:session.version},stability:{same_snapshot:true,same_session:true,snapshot_digest_unchanged:true,note:'Repeatable Read proves a stable snapshot, not absence of concurrent committed writes. Future mutation must independently capture and revalidate its immediate baseline.'},nonce,authorization_phrase:phrase,authorization:'PENDIENTE_DE_AUTORIZACION',previous_phrases:'REVOKED_BY_NEW_RECEIPT',writes:0,new_audits:0};
 }catch(error){const e=error as Error&{code?:string};result={status:'STOPPED',run_id:runId,utc:new Date().toISOString(),reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_PREFLIGHT_FAILED',sqlstate:e.code,writes:0,new_audits:0,authorization_phrase:null};}
 finally{if(begun)try{await client.query('ROLLBACK');result.rollback='CONFIRMED';}catch{result={...result,status:'STOPPED',reason:'READ_CONNECTION_LOST_ROLLBACK_UNCONFIRMED',authorization_phrase:null,rollback:'CONNECTION_CLOSED_REQUIRED'};}}
 return result;
}
