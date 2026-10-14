// One authorized production RR READ ONLY precheck. No dump or mutator entry points.
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const {verifiedProductionConfig,clearReadTlsEnvironment}=require('../../src/modules/cobertura/phase48-readonly-tls.ts');
const {readDatabaseUrl}=require('../../src/modules/cobertura/phase48-readonly-target.ts');
const {freshReadConnectionFactory}=require('../../src/modules/cobertura/phase48-readonly-connection.ts');
const {captureDynamicBackupPrecheck}=require('../../src/modules/cobertura/phase48-backup-readonly-precheck.ts');
const {assertCriticalSchema}=require('../../src/modules/cobertura/phase48-readonly-schema-identity.ts');
const {scopedRelease}=require('../../src/modules/cobertura/phase48-scoped-release.ts');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const evidencePath='tmp/phase48-pooler-local/backup-precheck-'+new Date().toISOString().replaceAll(/[-:.]/g,'')+'.json';
const report={kind:'PHASE48_DYNAMIC_BACKUP_PRECHECK',started_utc:new Date().toISOString(),status:'PRECHECK',production_connections:0,production_writes:0,backup_started:false,local_restore_started:false,mutator_executed:false};
const need=(v,c)=>{if(!v)throw Error(c);};
async function main(){
 if(process.argv.slice(2).join(' ')!=='--sync-disabled-manual-confirmation')throw Error('MANUAL_SYNC_CONFIRMATION_REQUIRED');
 report.release=scopedRelease();need(cp.execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()==='','WORKING_TREE_DIRTY');
 report.remote_commit=cp.execFileSync('git',['ls-remote','--heads','origin','fix/phase48-close-assignment-1203'],{encoding:'utf8'}).trim().split(/\s/)[0];need(report.remote_commit===report.release.readonly_runner_commit,'REMOTE_MISMATCH');
 report.client_version=cp.execFileSync('C:/Program Files/PostgreSQL/17/bin/pg_dump.exe',['--version'],{encoding:'utf8'}).trim();need(report.client_version==='pg_dump (PostgreSQL) 17.11','CLIENT_VERSION_MISMATCH');
 const hr=await fetch('https://api.empiriasuite.com/api/health',{signal:AbortSignal.timeout(15000)}),body=await hr.json(),h=body.data,o=h?.integracion_outbox;
 report.health={http_status:hr.status,database_status:h?.database?.status,outbox_configured:o?.configured,outbox_enabled:o?.enabled,worker_started:o?.started,worker_running:o?.running,recalc_requested:o?.recalc?.requested,recalc_active:o?.recalc?.active,sync:false,sync_evidence:'USER_MANUAL_RENDER_CONFIRMATION',observed_utc:new Date().toISOString()};
 need(hr.status===200&&body.success===true&&h?.database?.status==='ok','HEALTH_FAILED');need([o?.configured,o?.enabled,o?.started,o?.running,o?.recalc?.requested,o?.recalc?.active].every(v=>v===false),'FLAGS_OR_WORKER_UNSAFE');need(o.sync_enabled!==true&&o.sync?.enabled!==true,'SYNC_UNSAFE');
 process.env.PHASE48_SSL_ROOT_CERT_PATH='C:/Users/CORE ULTRA/Documents/EmpiriaCertificates/supabase-prod-ca.crt';process.env.PHASE48_SSL_ROOT_CERT_SHA256='700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7';
 const verified=verifiedProductionConfig(()=>readDatabaseUrl(fs.readFileSync('C:/Users/CORE ULTRA/Desktop/V2/.env','utf8')));report.ca_sha256=verified.certificate_sha256;
 const conn=await freshReadConnectionFactory(verified.config,'Production')();report.production_connections++;let begun=false;
 try{
  await conn.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  for(const sql of ["SET LOCAL search_path=pg_catalog,public,pg_temp","SET LOCAL timezone='UTC'","SET LOCAL statement_timeout='120s'","SET LOCAL lock_timeout='5s'"])await conn.client.query(sql);
  report.session=(await conn.client.query("SELECT current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,pg_current_snapshot()::text snapshot,current_setting('server_version') server_version")).rows[0];need(report.session.read_only==='on'&&report.session.isolation==='repeatable read','READ_ONLY_REQUIRED');need(/^17\./.test(report.session.server_version),'SERVER_VERSION_MISMATCH');
  report.metrics=(await conn.client.query("SELECT (SELECT count(*)::int FROM pg_locks WHERE NOT granted) locks_waiting,(SELECT count(*)::int FROM pg_stat_activity WHERE state='active' AND pid<>pg_backend_pid() AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|GRANT|REVOKE)\\s') ddl_active")).rows[0];need(report.metrics.locks_waiting===0&&report.metrics.ddl_active===0,'LOCK_OR_DDL_ACTIVITY');
  report.critical_schema=await assertCriticalSchema(conn.client);
  const cols=(await conn.client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='cobertura_asignaciones'")).rows;
  need(!cols.some(r=>['institucion_id','sede_id','modalidad_id'].includes(r.column_name)),'PHASE48_APPLIED_OR_PARTIAL');report.phase48='NO_APLICADA';
  report.periods=(await conn.client.query('SELECT id::text id,estado FROM nomina_periodos WHERE id IN(4,6) ORDER BY id')).rows;need(report.periods.length===2&&report.periods.every(r=>r.estado==='ANULADO'),'PERIODS_CHANGED');
  report.event_triggers=(await conn.client.query("SELECT e.evtname name,e.evtevent event,e.evtenabled enabled,e.evttags tags,n.nspname function_schema,p.proname function_name,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_digest,(e.evtenabled<>'D' AND (e.evttags IS NULL OR e.evttags && ARRAY['ALTER TABLE','CREATE INDEX','ALTER SEQUENCE','DROP INDEX']::text[])) intersects_phase48_tags FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid JOIN pg_namespace n ON n.oid=p.pronamespace ORDER BY e.evtname")).rows;
  // Certified reader must decide whether the real scope is certifiable. Never bypass its guards.
  const checked=await captureDynamicBackupPrecheck(conn.client);const capture=checked.capture;
  report.dynamic_digests=capture.set;report.manifest=capture.manifest;report.salary_preview=capture.salary_preview;report.operational_preview=capture.operational;report.table_hashes=capture.data;report.critical_sequences=capture.sequences;report.critical_inventory=capture.inventory;
  report.status='PRECHECK_PASSED';
 }finally{
  try{if(begun){await conn.client.query('ROLLBACK');report.rollback='CONFIRMED';conn.evidence.rollback_at=new Date().toISOString();}}finally{await conn.close();report.connection_closed=conn.isClosed();report.connection_evidence=conn.evidence;}
 }
}
main().catch(e=>{report.status='STOPPED';report.reason=/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'PRECHECK_QUERY_OR_TRANSPORT_FAILED';report.sqlstate=e.code;process.exitCode=1;}).finally(()=>{clearReadTlsEnvironment();report.finished_utc=new Date().toISOString();fs.writeFileSync(evidencePath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({evidencePath,status:report.status,reason:report.reason,session:report.session,health:report.health,metrics:report.metrics,events_intersecting_phase48_tags:report.event_triggers?.filter(e=>e.intersects_phase48_tags),rollback:report.rollback,connection_closed:report.connection_closed,production_connections:report.production_connections,production_writes:0}));});
