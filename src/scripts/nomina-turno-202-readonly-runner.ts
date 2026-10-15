/**
 * PostgreSQL-only read-only preflight. This module has no import path to the
 * economic corrector and exposes no mutator command or nonce activation API.
 * Credentials are supplied only after offline pins, artifacts, CA and target
 * have passed validation.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, mkdir, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Client, type ClientConfig, type QueryResultRow } from 'pg';
import { execFileSync } from 'node:child_process';
import { ENTRY_CASE } from './nomina-turno-202-entry-contract';

export const HISTORICAL_PDF_SHA256='cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4';
export const DUMP_SHA256='dd1f9d298e83fb9664d1795c4e452698c26b274569cca11715b2c2f03ff99d75';
export const CORRECTOR_COMMIT='95fc6bb6879409d37a088e451fb64f2edafacb5f';
export const PRODUCTION_CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
export const CERTIFIED_REPORT_SHA256='4d9456973bc1433b5c6175d347497d603999fb1ed35995e7e2493415cda3da41';
export const WRITE_SET=Object.freeze([
  'nomina_movimientos','cobertura_cuenta_cobro_externa_detalle','cobertura_cuentas_cobro_externas',
  'nomina_revision_operativa','auditoria','auditoria_eventos','historial_cambios',
]);
export const SEQUENCE_MAX_ADVANCES=Object.freeze({
  'public.auditoria_id_seq':4,
  'public.auditoria_eventos_id_seq':4,
  'public.nomina_revision_operativa_id_seq':1,
  'public.historial_cambios_id_seq':42,
});
const OPERATION='NOMINA_202_192_INTEGRAL_LOCAL_V1';
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const canonical=(value:unknown):string=>JSON.stringify(value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(value as object).sort().map(k=>[k,JSON.parse(canonical((value as Record<string,unknown>)[k]))])));
const digest=(value:unknown)=>hash(canonical(value));
const fail=(code:string):never=>{throw new Error(`STOPPED_${code}`);};
const isSha=(value:string)=>/^[a-f0-9]{64}$/.test(value);
const isCommit=(value:string)=>/^[a-f0-9]{40}$/.test(value);
const absolute=(value:string)=>path.isAbsolute(value)&&path.resolve(value)===value;

export type OfflinePlan=Readonly<{
  workspaceRoot:string; branch:string; head:string; contractCommit:string;
  correctorCommit:string; dumpPath:string; dumpSha256:string; historicalPdfPath:string;
  historicalPdfSha256:string; reportPath:string; reportSha256:string; expectedReportSha256:string;
  caPath:string; caSha256:string; expectedCaSha256:string;
  host:string; servername:string; expectedServername:string; port:number; database:string;
  healthUrl:string; healthHostname:string;
  localCertification:boolean;
}>;
export type DbCredentials=Readonly<{user:string;password:string}>;
export type SyncConfirmation=Readonly<{source:'MANUAL_CURRENT';enabled:false;observedAt:string;expiresAt:string}>;
export type PdfRead=Readonly<{bytes:Buffer;reference:string;mime:string;etag:string}>;
export type HealthResponse=Readonly<{
  httpStatus:number; databaseStatus:'ok'|'error'; outbox:boolean; sync:boolean;
  recalcRequested:boolean; recalcActive:boolean; workerStopped:boolean;
}>;
export type PendingReceipt=Readonly<{
  status:'PENDING_USER_CONFIRMATION'; synthetic:boolean; generatedAt:string;
  connections:readonly Readonly<{id:string;serverVersion:string;tlsProtocol:string;servername:string;transactionReadOnly:true}>[];
  digests:Readonly<Record<string,string>>; sequenceBaseline:Readonly<Record<string,string>>;
  pdf:Readonly<{sha256:string;size:number;referenceSha256:string;mime:string;etag:string}>;
  checks:Readonly<Record<string,unknown>>;
}>;
export const READONLY_RECEIPT_ROUTES=Object.freeze({baseline:'baseline',pending:'pending',stopped:'stopped'});
export type RunnerDependencies=Readonly<{
  plan:OfflinePlan;
  readCredentials:()=>Promise<DbCredentials>;
  readPdf:()=>Promise<PdfRead>;
  syncConfirmation:SyncConfirmation;
  now?:()=>Date;
  onConnectionClosed?:(id:string)=>void;
  onQuery?:(kind:'capture'|'transaction')=>void;
}>;

/** Offline validation: must be called before credential providers or sockets. */
export async function validateOfflinePlan(plan:OfflinePlan):Promise<Readonly<{root:string;caPem:Buffer;dumpBytes:Buffer;pdfBytes:Buffer;reportBytes:Buffer}>>{
  if(!absolute(plan.workspaceRoot)||plan.branch!=='fix/nomina-turno-202-correction-entry-gate'||!isCommit(plan.head)||!isCommit(plan.contractCommit)||plan.head!==plan.contractCommit)fail('CONTRACT_HEAD_MISMATCH');
  try{
    if(execFileSync('git',['branch','--show-current'],{cwd:plan.workspaceRoot,encoding:'utf8',windowsHide:true}).trim()!==plan.branch||execFileSync('git',['rev-parse','HEAD'],{cwd:plan.workspaceRoot,encoding:'utf8',windowsHide:true}).trim()!==plan.head)fail('GIT_STATE_MISMATCH');
    execFileSync('git',['merge-base','--is-ancestor',CORRECTOR_COMMIT,plan.head],{cwd:plan.workspaceRoot,windowsHide:true});
    if(!plan.localCertification&&execFileSync('git',['status','--porcelain'],{cwd:plan.workspaceRoot,encoding:'utf8',windowsHide:true}).trim())fail('WORKTREE_NOT_CLEAN');
  }catch{fail('OFFLINE_GIT_VALIDATION_FAILED');}
  if(plan.correctorCommit!==CORRECTOR_COMMIT)fail('CORRECTOR_COMMIT_MISMATCH');
  if(!isSha(plan.dumpSha256)||plan.dumpSha256!==DUMP_SHA256||!isSha(plan.historicalPdfSha256)||plan.historicalPdfSha256!==HISTORICAL_PDF_SHA256||!isSha(plan.reportSha256)||plan.reportSha256!==plan.expectedReportSha256||!isSha(plan.caSha256)||plan.caSha256!==plan.expectedCaSha256||(!plan.localCertification&&plan.expectedCaSha256!==PRODUCTION_CA_SHA256))fail('OFFLINE_HASH_PIN_MISMATCH');
  if(!plan.servername||plan.servername!==plan.expectedServername||!Number.isInteger(plan.port)||plan.port<1024||plan.port>65535||[5432,5433].includes(plan.port)||!plan.database)fail('DESTINATION_REJECTED');
  if(plan.localCertification){if(!['127.0.0.1','::1','localhost'].includes(plan.host))fail('LOCAL_DESTINATION_REJECTED');}
  else if(plan.host!==plan.servername||plan.servername==='localhost')fail('PRODUCTION_HOST_PIN_REQUIRED');
  const health=(()=>{try{return new URL(plan.healthUrl);}catch{return fail('HEALTH_DESTINATION_INVALID');}})();
  if(health.hostname!==plan.healthHostname||health.username||health.password||health.search||health.hash||(!plan.localCertification&&health.protocol!=='https:')||(plan.localCertification&&!['127.0.0.1','::1','localhost'].includes(health.hostname)))fail('HEALTH_DESTINATION_REJECTED');
  for(const p of [plan.dumpPath,plan.historicalPdfPath,plan.reportPath,plan.caPath])if(!absolute(p))fail('ARTIFACT_PATH_NOT_ABSOLUTE');
  const [root,dumpBytes,pdfBytes,reportBytes,caPem]=await Promise.all([
    realpath(plan.workspaceRoot),readFile(plan.dumpPath),readFile(plan.historicalPdfPath),readFile(plan.reportPath),readFile(plan.caPath),
  ]);
  const reportReal=await realpath(plan.reportPath),reportsRoot=path.join(root,'reports'),reportRelative=path.relative(reportsRoot,reportReal);if(path.isAbsolute(reportRelative)||reportRelative.startsWith('..'))fail('EVIDENCE_PATH_OUTSIDE_WORKSPACE');
  if(hash(dumpBytes)!==plan.dumpSha256||hash(pdfBytes)!==plan.historicalPdfSha256||hash(reportBytes)!==plan.reportSha256||hash(caPem)!==plan.caSha256)fail('OFFLINE_ARTIFACT_HASH_MISMATCH');
  if(pdfBytes.length!==3051)fail('HISTORICAL_PDF_SIZE_MISMATCH');
  return Object.freeze({root,caPem,dumpBytes,pdfBytes,reportBytes});
}

function makeTlsConfig(plan:OfflinePlan,credentials:DbCredentials,caPem:Buffer):ClientConfig{
  if(!credentials.user||typeof credentials.password!=='string')fail('CREDENTIALS_INVALID');
  return {
    host:plan.host,port:plan.port,database:plan.database,user:credentials.user,password:credentials.password,
    connectionTimeoutMillis:8000,application_name:'nomina202_readonly_preflight',
    ssl:{rejectUnauthorized:true,ca:caPem,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',servername:plan.servername},
  };
}

const SCOPE_SQL=`SELECT * FROM (
 SELECT 'nomina_movimientos' table_name,to_jsonb(t) row FROM (SELECT * FROM public.nomina_movimientos WHERE id=192 OR (externo_id=33 AND periodo_id=3 AND activo AND tipo_movimiento='TURNO_EXTERNO' AND estado<>'RECHAZADO') LIMIT 3)t
 UNION ALL SELECT 'cobertura_cuenta_cobro_externa_detalle',to_jsonb(t) FROM (SELECT * FROM public.cobertura_cuenta_cobro_externa_detalle WHERE cuenta_id=77 OR id=220 LIMIT 3)t
 UNION ALL SELECT 'cobertura_cuentas_cobro_externas',to_jsonb(t) FROM (SELECT * FROM public.cobertura_cuentas_cobro_externas WHERE id=77 OR (empresa_id=15 AND contrato_id=24 AND periodo_id=3 AND externo_id=33) LIMIT 3)t
 UNION ALL SELECT 'nomina_revision_operativa',to_jsonb(t) FROM (SELECT * FROM public.nomina_revision_operativa WHERE id=20114 LIMIT 2)t
 UNION ALL SELECT 'nomina_periodos',to_jsonb(t) FROM (SELECT * FROM public.nomina_periodos WHERE id=3 LIMIT 2)t
 UNION ALL SELECT 'nomina_novedad_turnos',to_jsonb(t) FROM (SELECT * FROM public.nomina_novedad_turnos WHERE id=202 OR (movimiento_id=192 AND activo) LIMIT 3)t
 UNION ALL SELECT 'nomina_novedades',to_jsonb(t) FROM (SELECT * FROM public.nomina_novedades WHERE id=929 LIMIT 2)t
 UNION ALL SELECT 'nomina_movimiento_tarifas',to_jsonb(t) FROM (SELECT * FROM public.nomina_movimiento_tarifas WHERE id=1 LIMIT 2)t
 UNION ALL SELECT 'usuarios',to_jsonb(t) FROM (SELECT * FROM public.usuarios WHERE id=12 LIMIT 2)t
 UNION ALL SELECT 'contratos',to_jsonb(t) FROM (SELECT * FROM public.contratos WHERE id=24 LIMIT 2)t
 UNION ALL SELECT 'empresas',to_jsonb(t) FROM (SELECT * FROM public.empresas WHERE id=15 LIMIT 2)t
 UNION ALL SELECT 'nomina_empleados',to_jsonb(t) FROM (SELECT * FROM public.nomina_empleados WHERE id=837 LIMIT 2)t
 UNION ALL SELECT 'vinculaciones',to_jsonb(t) FROM (SELECT * FROM public.vinculaciones WHERE id=847 LIMIT 2)t
 UNION ALL SELECT 'personas',to_jsonb(t) FROM (SELECT * FROM public.personas WHERE id=668 LIMIT 2)t
)s ORDER BY table_name,row::text`;
const AUDIT_SQL=`SELECT * FROM (
 SELECT 'auditoria' table_name,to_jsonb(t) row FROM (SELECT * FROM public.auditoria WHERE accion=$1 OR (tabla_afectada=ANY($2::text[]) AND registro_id=ANY($3::bigint[])) ORDER BY id LIMIT 64)t
 UNION ALL SELECT 'auditoria_eventos',to_jsonb(t) FROM (SELECT * FROM public.auditoria_eventos WHERE accion=$1 OR (entidad=ANY($2::text[]) AND entidad_id=ANY($3::text[])) ORDER BY id LIMIT 64)t
 UNION ALL SELECT 'historial_cambios',to_jsonb(t) FROM (SELECT * FROM public.historial_cambios WHERE motivo=$1 OR (tabla_afectada=ANY($2::text[]) AND registro_id=ANY($3::bigint[])) ORDER BY id LIMIT 128)t
)a ORDER BY table_name,row::text`;
const SEQUENCES_SQL=`SELECT 'public.auditoria_id_seq' name,last_value::text FROM public.auditoria_id_seq UNION ALL SELECT 'public.auditoria_eventos_id_seq',last_value::text FROM public.auditoria_eventos_id_seq UNION ALL SELECT 'public.nomina_revision_operativa_id_seq',last_value::text FROM public.nomina_revision_operativa_id_seq UNION ALL SELECT 'public.historial_cambios_id_seq',last_value::text FROM public.historial_cambios_id_seq ORDER BY 1`;

type DbRow=Record<string,any>;
function groupRows(rows:readonly {table_name:string;row:DbRow}[]){const out:Record<string,DbRow[]>={};for(const x of rows)(out[x.table_name]??=[]).push(x.row);return out;}
function exactCase(s:Record<string,DbRow[]>){
  const one=(table:string,id:number)=>{const rows=(s[table]??[]).filter(r=>Number(r.id)===id);if(rows.length!==1)fail(`CASE_ROW_${table}_${id}`);return rows[0]!;};
  const m=one('nomina_movimientos',192),d=one('cobertura_cuenta_cobro_externa_detalle',220),a=one('cobertura_cuentas_cobro_externas',77),r=one('nomina_revision_operativa',20114),p=one('nomina_periodos',3),t=one('nomina_novedad_turnos',202),n=one('nomina_novedades',929),rate=one('nomina_movimiento_tarifas',1),u=one('usuarios',12),c=one('contratos',24),e=one('empresas',15),ne=one('nomina_empleados',837),v=one('vinculaciones',847),person=one('personas',668);
  const checks={movement:m.id===192&&m.periodo_id===3&&m.nomina_empleado_id===837&&m.vinculacion_id===847&&m.externo_id===33&&m.estado==='PENDIENTE'&&Number(m.cantidad)===1&&Number(m.valor_unitario)===97800&&Number(m.valor_calculado)===97800&&Number(m.valor_total)===97800&&m.afecta_seguridad_social===false&&m.activo===true,
    detail:d.id===220&&d.cuenta_id===77&&d.movimiento_id===192&&d.turno_id===202&&Number(d.valor)===97800&&d.activo===true&&d.fecha_inicio==='2026-09-08'&&d.fecha_fin==='2026-09-09'&&Number(d.dias_efectivos)===2,
    account:a.id===77&&a.empresa_id===15&&a.contrato_id===24&&a.periodo_id===3&&a.estado==='PENDIENTE'&&a.activo===true&&Number(a.valor_total)===97800&&!!a.generado_path&&!!a.generado_bucket&&!!a.generado_at,
    revision:r.id===20114&&r.estado_revision==='REVISADO'&&Number(r.version_revision)===30&&r.periodo_id===3&&r.nomina_empleado_id===837,
    period:p.id===3&&p.contrato_id===24&&p.estado==='ABIERTO',turn:t.id===202&&t.movimiento_id===192&&t.nomina_novedad_id===929&&t.nomina_empleado_id===837,
    novelty:n.id===929&&n.fecha_inicio==='2026-09-08'&&n.fecha_fin==='2026-09-09'&&Number(n.dias)===2,
    rate:rate.id===1&&rate.contrato_id===24&&rate.modalidad_id===1&&Number(rate.valor_unitario)===97800&&rate.activo===true,
    employee:ne.id===837&&ne.vinculacion_id===847,vinculation:v.id===847&&v.contrato_id===24&&v.persona_id===668,
    empresa:e.id===15,contract:c.id===24&&c.empresa_id===15,actor:u.id===12&&u.activo===true,person:person.id===668};
  if(Object.values(checks).some(x=>!x))fail('EXACT_BEFORE_STATE');
  return {movement:{id:192,status:m.estado,quantity:Number(m.cantidad),unitRate:Number(m.valor_unitario),calculated:Number(m.valor_calculado),total:Number(m.valor_total),socialSecurity:m.afecta_seguridad_social},detail:{id:220,amount:Number(d.valor),active:d.activo},account:{id:77,status:a.estado,total:Number(a.valor_total),active:a.activo,referenceHash:hash(`${a.generado_bucket}/${a.generado_path}`)},revision:{id:20114,status:r.estado_revision,version:Number(r.version_revision)},periodOpen:true,turn:{id:202,startDate:'2026-09-08',endDate:'2026-09-09',inclusiveDays:2},employeeId:837,empresaId:15,contratoId:24,actorId:12};
}

async function captureDatabase(client:Client,dependencies:RunnerDependencies){
  const q=async<T extends QueryResultRow>(sql:string,values:unknown[]=[])=>(dependencies.onQuery?.('capture'),await client.query<T>(sql,values)).rows;
  const session=(await q<{server_version:string;database:string;transaction_read_only:string;transaction_isolation:string}>(`SELECT current_setting('server_version') server_version,current_database() database,current_setting('transaction_read_only') transaction_read_only,current_setting('transaction_isolation') transaction_isolation`))[0]!;
  if(!session.server_version.startsWith('17.')||session.transaction_read_only!=='on'||session.transaction_isolation!=='repeatable read')fail('DATABASE_SESSION_POLICY');
  const scope=groupRows(await q<{table_name:string;row:DbRow}>(SCOPE_SQL));
  const targetIds=[192,220,77,20114];const relatedTables=['nomina_movimientos','cobertura_cuenta_cobro_externa_detalle','cobertura_cuentas_cobro_externas','nomina_revision_operativa'];
  const related=groupRows(await q<{table_name:string;row:DbRow}>(AUDIT_SQL,[OPERATION,relatedTables,targetIds]));
  if((related.auditoria??[]).length>=64||(related.auditoria_eventos??[]).length>=64||(related.historial_cambios??[]).length>=128)fail('RELATED_AUDIT_SCOPE_OVERFLOW');
  const target=evaluateExactCase(scope);
  const actorScope=(await q<{active_roles:string[];empresa_ok:boolean;contrato_ok:boolean}>(`SELECT ARRAY(SELECT DISTINCT r.nombre_rol FROM public.usuario_roles ur JOIN public.roles r ON r.id=ur.rol_id WHERE ur.usuario_id=12 AND COALESCE(ur.activo,TRUE) AND COALESCE(r.activo,TRUE) AND r.nombre_rol IN('ADMINISTRADOR','TALENTO_HUMANO') ORDER BY r.nombre_rol) active_roles,EXISTS(SELECT 1 FROM public.usuario_empresas ue WHERE ue.usuario_id=12 AND ue.empresa_id=15 AND COALESCE(ue.activo,TRUE)) empresa_ok,EXISTS(SELECT 1 FROM public.usuario_contratos uc WHERE uc.usuario_id=12 AND uc.contrato_id=24 AND COALESCE(uc.activo,TRUE)) contrato_ok`))[0]!;
  if(!actorScope.active_roles.length||!actorScope.empresa_ok||!actorScope.contrato_ok)fail('ACTOR_SCOPE_NOT_AUTHORIZED');
  const locks=(await q<{waiting:number;ddl:number}>(`SELECT (SELECT count(*)::int FROM pg_locks WHERE NOT granted) waiting,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query ~* '^\\s*(CREATE|ALTER|DROP|TRUNCATE|REINDEX|COMMENT|GRANT|REVOKE)\\b') ddl`))[0]!;
  if(locks.waiting!==0||locks.ddl!==0)fail('DATABASE_NOT_QUIESCENT');
  const tableSet=(await q<{tablename:string}>(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename`,[[...WRITE_SET]])).map(x=>x.tablename);
  if(canonical(tableSet)!==canonical([...WRITE_SET].sort()))fail(`WRITE_SET_SCHEMA_MISMATCH_${tableSet.join('_')}`);
  const trigger=(await q<{table_name:string;trigger_name:string;definition:string;enabled:string}>(`SELECT c.relname table_name,t.tgname trigger_name,pg_get_triggerdef(t.oid) definition,t.tgenabled enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal AND t.tgenabled<>'D' ORDER BY 1,2`,[[...WRITE_SET]]));
  if(trigger.length!==1||trigger[0]!.table_name!=='nomina_movimientos'||trigger[0]!.trigger_name!=='trg_nomina_movimientos_invalida_revision'||trigger[0]!.enabled!=='O')fail('WRITE_SET_TRIGGER_MISMATCH');
  const duplicates=(await q<{movements:string;details:string;accounts:string;turns:string}>(`SELECT (SELECT count(*)::text FROM public.nomina_movimientos m WHERE id<>192 AND periodo_id=3 AND externo_id=33 AND tipo_movimiento='TURNO_EXTERNO' AND activo AND estado<>'RECHAZADO' AND (fecha BETWEEN '2026-09-08' AND '2026-09-09' OR EXISTS(SELECT 1 FROM public.nomina_novedad_turnos nt JOIN public.nomina_novedades nn ON nn.id=nt.nomina_novedad_id WHERE nt.movimiento_id=m.id AND nt.activo AND nn.activo AND nn.fecha_inicio<='2026-09-09' AND COALESCE(nn.fecha_fin,nn.fecha_inicio)>='2026-09-08'))) movements,(SELECT count(*)::text FROM public.cobertura_cuenta_cobro_externa_detalle WHERE cuenta_id=77) details,(SELECT count(*)::text FROM public.cobertura_cuentas_cobro_externas WHERE empresa_id=15 AND contrato_id=24 AND periodo_id=3 AND externo_id=33) accounts,(SELECT count(*)::text FROM public.nomina_novedad_turnos WHERE movimiento_id=192 AND activo) turns`))[0]!;
  if(duplicates.movements!=='0'||duplicates.details!=='1'||duplicates.accounts!=='1'||duplicates.turns!=='1')fail('DUPLICATE_OR_EXTRA_LINK');
  const priorRepair=(await q<{present:boolean}>(`SELECT EXISTS(SELECT 1 FROM public.auditoria_eventos WHERE accion=$1 OR (accion ILIKE '%CORRECCION%' AND entidad_id='192')) OR EXISTS(SELECT 1 FROM public.auditoria WHERE accion=$1) OR EXISTS(SELECT 1 FROM public.historial_cambios WHERE motivo=$1) OR EXISTS(SELECT 1 FROM public.nomina_correcciones WHERE movimiento_id=192) present`,[OPERATION]))[0]!.present;
  if(priorRepair)fail('PRIOR_REPAIR_FOUND');
  const blockers=(await q<{rows:{table_name:string;id:string;state:string|null}[]}>(`SELECT array_agg(row_to_json(x) ORDER BY x.table_name,x.id) rows FROM (
    SELECT 'nomina_liquidaciones' table_name,id::text,estado::text state FROM public.nomina_liquidaciones WHERE periodo_id=3 AND vinculacion_id=847 AND activo
    UNION ALL SELECT 'nomina_liquidaciones_finales',id::text,estado::text FROM public.nomina_liquidaciones_finales WHERE vinculacion_id=847 AND activo
    UNION ALL SELECT 'nomina_desprendibles',id::text,estado::text FROM public.nomina_desprendibles WHERE periodo_id=3 AND (nomina_empleado_id=837 OR vinculacion_id=847) AND activo
    UNION ALL SELECT 'nomina_pagos_pendientes',id::text,estado::text FROM public.nomina_pagos_pendientes WHERE (periodo_origen_id=3 OR periodo_pago_id=3) AND (nomina_empleado_id=837 OR vinculacion_id=847) AND activo
    UNION ALL SELECT 'nomina_cuentas_cobro_turnos',id::text,estado::text FROM public.nomina_cuentas_cobro_turnos WHERE periodo_id=3 AND vinculacion_id=847 AND activo
    UNION ALL SELECT 'nomina_exportes',id::text,tipo_exporte::text FROM public.nomina_exportes WHERE periodo_id=3 AND activo
  )x`))[0]!;
  if(blockers.rows?.length)fail('PAYMENT_LIFECYCLE_BLOCKER');
  const sequenceRows=await q<{name:string;last_value:string}>(SEQUENCES_SQL),sequences=Object.fromEntries(sequenceRows.map(x=>[x.name,x.last_value]));
  if(canonical(Object.keys(sequences).sort())!==canonical(Object.keys(SEQUENCE_MAX_ADVANCES).sort())||Object.values(sequences).some(v=>!/^\d+$/.test(v)))fail('SEQUENCE_INVENTORY_MISMATCH');
  const health=await readHealthHttp(dependencies.plan);
  if(health.httpStatus!==200||health.databaseStatus!=='ok'||health.outbox||health.sync||health.recalcRequested||health.recalcActive||!health.workerStopped)fail('HEALTH_OR_FLAGS');
  const sync=dependencies.syncConfirmation,now=(dependencies.now?.()??new Date()).getTime(),observed=Date.parse(sync.observedAt),expires=Date.parse(sync.expiresAt);
  if(sync.source!=='MANUAL_CURRENT'||sync.enabled!==false||!Number.isFinite(observed)||!Number.isFinite(expires)||observed>now||expires<=now||now-observed>5*60_000)fail('SYNC_CONFIRMATION_STALE');
  const pdf=await dependencies.readPdf();if(pdf.mime!=='application/pdf'||pdf.bytes.length!==3051||hash(pdf.bytes)!==HISTORICAL_PDF_SHA256||!pdf.etag||!pdf.reference)fail('HISTORICAL_PDF_MISMATCH');
  const pdfMeta={sha256:hash(pdf.bytes),size:pdf.bytes.length,referenceSha256:hash(pdf.reference),mime:pdf.mime,etag:pdf.etag};
  const auditState={auditoria:related.auditoria??[],auditoria_eventos:related.auditoria_eventos??[],historial_cambios:related.historial_cambios??[]};
  if((auditState.auditoria_eventos as DbRow[]).filter(x=>x.accion===OPERATION).length|| (auditState.auditoria as DbRow[]).filter(x=>x.accion===OPERATION).length||(auditState.historial_cambios as DbRow[]).filter(x=>x.motivo===OPERATION).length)fail('PRIOR_REPAIR_FOUND');
  const digestSet={critical_schema:digest({tableSet,trigger}),sources:digest({actorScope,period:scope.nomina_periodos,turn:scope.nomina_novedad_turnos,novelty:scope.nomina_novedades,rate:scope.nomina_movimiento_tarifas,employee:scope.nomina_empleados,vinculation:scope.vinculaciones,person:scope.personas}),movement_192:digest(scope.nomina_movimientos),detail_220:digest(scope.cobertura_cuenta_cobro_externa_detalle),account_77:digest(scope.cobertura_cuentas_cobro_externas),revision_20114:digest(scope.nomina_revision_operativa),related_audits:digest(auditState),related_history:digest(auditState.historial_cambios),pdf_metadata:digest(pdfMeta),protected_tables:digest({company:scope.empresas,contract:scope.contratos,period:scope.nomina_periodos}),write_set_before:digest({movement:scope.nomina_movimientos,detail:scope.cobertura_cuenta_cobro_externa_detalle,account:scope.cobertura_cuentas_cobro_externas,revision:scope.nomina_revision_operativa}),sequence_baseline:digest(sequences)};
  return {session:{serverVersion:session.server_version,database:session.database},target,actor:{roles:actorScope.active_roles,empresaOk:actorScope.empresa_ok,contratoOk:actorScope.contrato_ok},locks,tableSet,duplicates,priorRepair,blockers,triggerSha256:digest(trigger),auditCounts:Object.fromEntries(Object.entries(auditState).map(([k,v])=>[k,(v as DbRow[]).length])),historyRows:(auditState.historial_cambios as DbRow[]).length,health,syncConfirmation:Object.freeze({...sync}),pdfMeta,digestSet,sequences};
}

async function readHealthHttp(plan:OfflinePlan):Promise<HealthResponse>{
  const response=await (async()=>{try{return await fetch(plan.healthUrl,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json'}});}catch{return fail('HEALTH_REQUEST_FAILED');}})();
  if(response.status!==200)fail('HEALTH_HTTP_STATUS');
  let body:any;try{body=await response.json();}catch{fail('HEALTH_BODY_INVALID');}
  const health:HealthResponse={httpStatus:response.status,databaseStatus:body?.database?.status==='ok'?'ok':'error',outbox:body?.OUTBOX!==false,sync:body?.SYNC!==false,recalcRequested:body?.RECALC?.requested!==false,recalcActive:body?.RECALC?.active!==false,workerStopped:body?.worker?.running===false};
  if(health.databaseStatus!=='ok'||health.outbox||health.sync||health.recalcRequested||health.recalcActive||!health.workerStopped)fail('HEALTH_OR_FLAGS');
  return health;
}
function evaluateExactCase(scope:Record<string,DbRow[]>){return exactCase(scope);}

async function openReadOnlyClient(plan:OfflinePlan,credentials:DbCredentials,caPem:Buffer){
  const client=new Client(makeTlsConfig(plan,credentials,caPem));const id=randomUUID();
  try{
    await client.connect();
    const stream=(client as unknown as {connection:{stream:import('node:tls').TLSSocket}}).connection.stream;
    if(!stream.encrypted||stream.authorized!==true||stream.getProtocol()!=='TLSv1.3'||stream.servername!==plan.servername)fail('TLS_CHANNEL_NOT_VERIFIED');
    return {id,client,stream};
  }catch{await client.end().catch(()=>{});fail('TLS_CONNECTION_REJECTED');}
}

/** Two new sequential TLS clients and READ ONLY repeatable snapshots; no mutator is imported or callable. */
export async function runReadOnlyEntryPreflight(plan:OfflinePlan,dependencies:RunnerDependencies):Promise<PendingReceipt>{
  let offline:Awaited<ReturnType<typeof validateOfflinePlan>>|undefined;
  try{offline=await validateOfflinePlan(plan);}catch(error){if(error instanceof Error&&error.message.startsWith('STOPPED_'))throw error;fail('OFFLINE_VALIDATION_FAILED');}
  // This is the first line at which the credential callback can be reached.
  let credentials:DbCredentials|undefined;try{credentials=await dependencies.readCredentials();}catch{fail('CREDENTIAL_SOURCE_FAILED');}
  const validatedOffline=offline??fail('OFFLINE_VALIDATION_FAILED');
  const validatedCredentials=credentials??fail('CREDENTIAL_SOURCE_FAILED');
  const snapshots:unknown[]=[],connections:PendingReceipt['connections'][number][]=[];
  for(let index=0;index<2;index++){
    let opened:Awaited<ReturnType<typeof openReadOnlyClient>>|undefined,started=false,rolledBack=false;
    try{
      opened=await openReadOnlyClient(plan,validatedCredentials,validatedOffline.caPem);
      const active=opened??fail('TLS_CONNECTION_REJECTED');
      dependencies.onQuery?.('transaction');await active.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');started=true;
      dependencies.onQuery?.('transaction');const state=(await active.client.query<{transaction_read_only:string;transaction_isolation:string}>('SELECT current_setting(\'transaction_read_only\') transaction_read_only,current_setting(\'transaction_isolation\') transaction_isolation')).rows[0]!;
      if(state.transaction_read_only!=='on'||state.transaction_isolation!=='repeatable read')fail('READ_ONLY_TRANSACTION_NOT_CONFIRMED');
      const captured=await captureDatabase(active.client,dependencies),pdf=await dependencies.readPdf();
      if(hash(pdf.bytes)!==captured.pdfMeta.sha256||pdf.bytes.length!==captured.pdfMeta.size||pdf.etag!==captured.pdfMeta.etag||hash(pdf.reference)!==captured.pdfMeta.referenceSha256)fail('PDF_CHANGED_DURING_SNAPSHOT');
      snapshots.push(captured);
      connections.push(Object.freeze({id:active.id,serverVersion:captured.session.serverVersion,tlsProtocol:active.stream.getProtocol()??'',servername:String(active.stream.servername??''),transactionReadOnly:true}));
    }catch(error){if(error instanceof Error&&error.message.startsWith('STOPPED_'))throw error;fail('SNAPSHOT_CAPTURE_FAILED');}
    finally{
      if(opened){try{if(started){dependencies.onQuery?.('transaction');await opened.client.query('ROLLBACK');rolledBack=true;}}finally{await opened.client.end();dependencies.onConnectionClosed?.(opened.id);}if(started&&!rolledBack)fail('SNAPSHOT_ROLLBACK_MISSING');}
    }
  }
  if(connections[0]!.id===connections[1]!.id||canonical(snapshots[0])!==canonical(snapshots[1]))fail('SNAPSHOT_DRIFT');
  const data=snapshots[0] as Awaited<ReturnType<typeof captureDatabase>>;
  return Object.freeze({status:'PENDING_USER_CONFIRMATION',synthetic:plan.localCertification,generatedAt:(dependencies.now?.()??new Date()).toISOString(),connections:Object.freeze(connections),digests:Object.freeze(data.digestSet),sequenceBaseline:Object.freeze(data.sequences),pdf:Object.freeze(data.pdfMeta),checks:Object.freeze({target:data.target,actor:data.actor,locks:data.locks,writeSet:data.tableSet,duplicates:data.duplicates,priorRepair:data.priorRepair,lifecycle:data.blockers,audits:data.auditCounts,historyRows:data.historyRows,health:data.health,syncConfirmation:data.syncConfirmation,readOnly:true,rollbackCompleted:true})});
}

/** Atomic, no-replace publication for read-only receipts. No COMMITTED route is exposed here. */
export async function publishReadOnlyReceipt(root:string,kind:'baseline'|'pending'|'stopped',receiptId:string,value:Readonly<Record<string,unknown>>){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId))fail('RECEIPT_ID_INVALID');
  const expected={baseline:'BASELINE_VERIFIED',pending:'PENDING_USER_CONFIRMATION',stopped:'STOPPED'}[kind];if(value.status!==expected)fail('RECEIPT_STATUS_ROUTE_MISMATCH');
  const rootReal=await realpath(root),parent=path.join(rootReal,'reports','nomina-202-entry',READONLY_RECEIPT_ROUTES[kind]),target=path.join(parent,`${receiptId}.json`);
  await mkdir(parent,{recursive:true});if(await realpath(parent)!==parent)fail('RECEIPT_ROUTE_SYMLINK_REJECTED');
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8'),temp=path.join(parent,`.${receiptId}.${randomUUID()}.tmp`),handle=await open(temp,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();await handle.close();await link(temp,target);}catch{await handle.close().catch(()=>{});await unlink(temp).catch(()=>{});fail('RECEIPT_PUBLICATION_FAILED');}
  await unlink(temp);return Object.freeze({path:target,sha256:hash(bytes)});
}

/** Local-only helper for deterministic tests; the production caller must provide the pinned plan and credential source. */
export async function readLocalArtifact(filePath:string){return readFile(filePath);}
