import {Client} from 'pg';
import {readFileSync} from 'node:fs';
import {requireScoped} from './phase48-scoped-contract';
import {assertCriticalSchema} from './phase48-readonly-schema-identity';
import {verifiedProductionConfig,inspectProductionTls,clearReadTlsEnvironment} from './phase48-readonly-tls';
import {readDatabaseUrl} from './phase48-readonly-target';
import {v6ExternalKey,v6PrivatePath,v6Release,verifyV6Evidence,type V6EvidencePaths} from './phase48-v6-evidence';
import type {V6Host} from './phase48-v6-entry';
import type {V6Client} from './phase48-v6-atomic';
export interface V6ProductionOptions {evidence:V6EvidencePaths;credentialPath:string;caPath:string;caSha256:string;directory:string;keyPath?:string;syncManuallyConfirmed:false;}
export function productionV6Host(options:V6ProductionOptions):V6Host{
 let offlineVerified=false;let config:ReturnType<typeof verifiedProductionConfig>['config']|undefined;
 const natives=new WeakMap<object,Client>();
 const offline=async()=>{const release=v6Release(),evidence=verifyV6Evidence(options.evidence);v6PrivatePath(options.directory,true);clearReadTlsEnvironment();process.env.PHASE48_SSL_ROOT_CERT_PATH=options.caPath;process.env.PHASE48_SSL_ROOT_CERT_SHA256=options.caSha256;
  // CA/ACL/hash checks run before this callback is allowed to read the credential.
  config=verifiedProductionConfig(()=>readDatabaseUrl(readFileSync(options.credentialPath,'utf8'))).config;clearReadTlsEnvironment();requireScoped(options.syncManuallyConfirmed===false,'V6_CURRENT_SYNC_CONFIRMATION_REQUIRED');requireScoped(process.env.PHASE48_DYNAMIC_LOCAL_CERT!=='true','V6_SYNTHETIC_CERTIFICATE_FORBIDDEN');offlineVerified=true;return {release,evidence};};
 const client=(role:'writer'|'observer')=>{requireScoped(offlineVerified&&config,'V6_OFFLINE_VERIFICATION_REQUIRED');const c=new Client({...config,application_name:role==='writer'?'phase48_v6_writer':'phase48_v6_observer'});c.on('error',()=>{});if(role==='writer'){natives.set(c,c);return c as unknown as V6Client;}
  let inTransaction=false;
  const query=async(sql:string,values?:any[])=>{
   if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){requireScoped(!inTransaction,'V6_NESTED_OBSERVER_TRANSACTION');await c.query(sql);inTransaction=true;return {rows:[],rowCount:0};}
   if(sql==='ROLLBACK'){const r=await c.query(sql);inTransaction=false;return r;}
   const control=["SET LOCAL search_path=pg_catalog,public,pg_temp","SET LOCAL timezone='UTC'","SET LOCAL statement_timeout='120s'"];
   const tokens=sql.replace(/'(?:''|[^'])*'/g,"''");requireScoped(control.includes(sql)||/^\s*(SELECT|WITH RECURSIVE nodes\()/.test(sql)&&!/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|CALL|DO|COPY|GRANT|REVOKE|LOCK|nextval|setval|pg_notify)\b|;|--|\/\*/i.test(tokens),'V6_OBSERVER_READ_ONLY_QUERY_REQUIRED');
   if(inTransaction)return c.query(sql,values);requireScoped(!control.includes(sql),'V6_OBSERVER_CONTROL_OUTSIDE_TRANSACTION');
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{await c.query('SET LOCAL search_path=pg_catalog,public,pg_temp');await c.query("SET LOCAL statement_timeout='120s'");return await c.query(sql,values);}finally{await c.query('ROLLBACK');}
  };
  const wrapped={connect:async()=>{await c.connect();},end:async()=>{await c.end();},query:query as V6Client['query']};natives.set(wrapped,c);return wrapped;
 };
 return {offline,client,directory:options.directory,enabled:process.env.PHASE48_V6_ENABLE_MUTATION==='true',key:()=>{requireScoped(offlineVerified&&options.keyPath,'V6_PERSISTENT_KEY_REQUIRED');return v6ExternalKey(options.keyPath);},
 flags:async()=>{requireScoped(offlineVerified,'V6_OFFLINE_VERIFICATION_REQUIRED');const resp=await fetch('https://api.empiriasuite.com/api/health',{signal:AbortSignal.timeout(15000)}),b=await resp.json() as any,o=b.data?.integracion_outbox;return {health200:resp.status===200,success:b.success===true,databaseOk:b.data?.database?.status==='ok',outbox:o?.configured===false&&o?.enabled===false?false:true,sync:options.syncManuallyConfirmed,recalc_requested:o?.recalc?.requested===false?false:true,recalc_active:o?.recalc?.active===false?false:true,worker_started:o?.started===false?false:true,worker_running:o?.running===false?false:true};},
 identity:async(db,readOnly)=>{
  inspectProductionTls(natives.get(db)??db);const r=(await db.query("SELECT current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,current_setting('server_version') version,current_database() database,pg_backend_pid() pid,pg_current_snapshot()::text snapshot,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='virtualxid') virtual_transaction,(SELECT count(*)::int FROM pg_locks WHERE NOT granted) locks_waiting,(SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|VACUUM\\s+FULL|GRANT|REVOKE)\\s') ddl_active")).rows[0];
  requireScoped(/^17\./.test(r.version)&&r.database==='postgres'&&!r.locks_waiting&&!r.ddl_active,'V6_PRODUCTIVE_IDENTITY_OR_ACTIVITY_UNSAFE');if(readOnly)requireScoped(r.read_only==='on'&&r.isolation==='repeatable read','V6_READ_ONLY_TRANSACTION_REQUIRED');
  requireScoped((await db.query("SELECT (SELECT count(*)::int FROM public.empresas WHERE id=15)=1 AND (SELECT count(*)::int FROM public.contratos WHERE id=24 AND empresa_id=15)=1 AND (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) safe")).rows[0].safe,'V6_SCOPE_OR_RLS_UNSAFE');if(readOnly)await assertCriticalSchema(db);return r;
 }};
}
