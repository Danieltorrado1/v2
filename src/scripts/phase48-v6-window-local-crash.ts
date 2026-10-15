// Child of the local certificate only. Cannot read production credentials.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {mutateV6,type V6Host} from '../modules/cobertura/phase48-v6-entry';
import {V6_EVIDENCE} from '../modules/cobertura/phase48-v6-evidence';
import cp from 'node:child_process';
if(process.env.PHASE48_WINDOW_LOCAL_CERT!=='true'||process.env.PHASE48_DYNAMIC_LOCAL_CERT!=='true')throw Error('LOCAL_CERT_REQUIRED');
const [directory,approvalPath,stage]=process.argv.slice(2);
if(!directory||!approvalPath||!stage||!resolve(directory).startsWith(resolve('tmp/phase48-v6-local/receipts')+'/')&&!resolve(directory).startsWith(resolve('tmp/phase48-v6-local/receipts')+'\\'))throw Error('LOCAL_RECEIPT_PATH_REQUIRED');
const crash=()=>process.exit(77);
const execute=cp.execFileSync;
cp.execFileSync=((...args:any[])=>{const dest=args[2]?.env?.PHASE48_RECEIPT_DESTINATION as string|undefined;
 const type=dest?.match(/\.(started|seal|committed|postflight|idempotency)\.json$/)?.[1];
 if(type&&stage==='PUBLISH_BEFORE_'+type)crash();const result=(execute as any)(...args);if(type&&stage==='PUBLISH_AFTER_'+type)crash();return result;}) as any;
const release={readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40)};
const flags={health200:true,success:true,databaseOk:true,outbox:false,sync:false,recalc_requested:false,recalc_active:false,worker_started:false,worker_running:false};
const host:V6Host={directory,enabled:true,key:()=>Buffer.alloc(32,7),offline:async()=>{if(stage==='OFFLINE')crash();return{release,evidence:{...V6_EVIDENCE}};},flags:async()=>flags,
 client:role=>{const c=localClient();return {connect:async()=>{await c.connect();if(stage==='CONNECTED'&&role==='writer')crash();},end:()=>c.end(),query:(async(sql:any,values?:any)=>{const r=await c.query(sql,values);if(role==='writer'&&((stage==='SERIALIZABLE'&&String(sql).startsWith('BEGIN ISOLATION'))||(stage==='ADVISORY'&&String(sql).includes('pg_try_advisory'))||(stage==='TABLE_LOCKS'&&String(sql).startsWith('LOCK TABLE'))||(stage==='SEQUENCE_LOCKS'&&String(sql).startsWith('ALTER SEQUENCE'))||(stage==='COMMITTED'&&sql==='COMMIT')))crash();return r;}) as any};},
 identity:async(db)=>{const r=(await db.query("SELECT current_setting('server_version') version,current_setting('data_directory') directory,host(inet_server_addr()) host,inet_server_port() port")).rows[0];if(r.version!=='17.11'||r.host!=='127.0.0.1'||r.port!==55470||resolve(r.directory)!==resolve('tmp/phase48-v6-window-local/cluster'))throw Error('LOCAL_IDENTITY_REQUIRED');return r;}};
mutateV6(host,readFileSync(approvalPath,'utf8'),{checkpoint:async(s)=>{if(s===stage)crash();}}).then(async()=>{if(stage.endsWith('_idempotency'))await mutateV6(host,readFileSync(approvalPath,'utf8'));process.exitCode=2;}).catch(e=>{console.error(/^[A-Z0-9_:]+$/.test(e.message)?e.message:'LOCAL_ERROR');process.exitCode=3;});
