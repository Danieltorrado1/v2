import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {scopedFixture} from './fixtures/phase48-scoped-fixture';
import {certifiedManagedEvents} from '../modules/cobertura/phase48-managed-events';
import {scopedCapture,tableHashes} from '../modules/cobertura/phase48-scoped-repository';
import {createScopedLocalAuthority,scopedDigest} from '../modules/cobertura/phase48-scoped-contract';
import {captureDynamicBackupPrecheck} from '../modules/cobertura/phase48-backup-readonly-precheck';
import {preflightScopedLocal,executeScopedLocal,rollbackScopedPublishedLocal} from '../modules/cobertura/phase48-scoped-local';
const target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')};
const release={readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40)};
async function sql(s:string){const c=localClient();await c.connect();try{return await c.query(s);}finally{await c.end();}}
async function capture(){const c=localClient();await c.connect();try{return await scopedCapture(c);}finally{await c.end();}}
async function setup(){await scopedFixture();const authority=createScopedLocalAuthority();return {authority,pre:await preflightScopedLocal(authority,target,release)};}
const observations:any[]=[];
test('backup reader requires RR READ ONLY, accepts exact triggers without issuing a mutator grant',async()=>{
 await scopedFixture();const c=localClient();await c.connect();try{
  await assert.rejects(captureDynamicBackupPrecheck(c),/BACKUP_REPEATABLE_READ_ONLY_REQUIRED/);
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result=await captureDynamicBackupPrecheck(c);assert.equal(result.capture.set.candidate_count,733);assert.equal(result.mutator_authorization,false);assert.equal(result.capture.inventory.managed_events![0].events.length,2);
 }finally{await c.query('ROLLBACK');await c.end();}
});
test('previous scoped commits and phrases are revoked; replication bypass is rejected',async()=>{
 const {authority,pre}=await setup();
 for(const old of ['9f478ae8d519421759845e9a1826f8414c59efac','8e805730b5c00a2326ca748f82213bf69e38a701'])assert.throws(()=>authority.issue(pre.seal.set,pre.seal.run_id,old,release.mutator_commit),/LEGACY_COMMIT_REVOKED/);
 assert.throws(()=>authority.authenticate({...pre.seal,version:'PHASE48_SCOPED_DYNAMIC_V2'} as any),/LEGACY_OR_ECONOMIC_GRANT_REVOKED/);
 const c=localClient();await c.connect();try{await c.query("SET session_replication_role='replica'");await assert.rejects(certifiedManagedEvents(c),/MANAGED_REPLICATION_ROLE_UNSAFE/);}finally{await c.end();}
});
for(const [name,statement,error] of [
 ['missing','DROP EVENT TRIGGER pgrst_drop_watch','MANAGED_EVENT_MISSING'],
 ['disabled','ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE','MANAGED_EVENT_METADATA_DRIFT'],
 ['enabled always','ALTER EVENT TRIGGER pgrst_drop_watch ENABLE ALWAYS','MANAGED_EVENT_METADATA_DRIFT'],
 ['changed function',"CREATE FUNCTION extensions.fake_event() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;DROP EVENT TRIGGER pgrst_drop_watch;CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop EXECUTE FUNCTION extensions.fake_event();ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin",'MANAGED_EVENT_METADATA_DRIFT'],
 ['changed tags',"DROP EVENT TRIGGER pgrst_ddl_watch;CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end WHEN TAG IN('ALTER TABLE') EXECUTE FUNCTION extensions.pgrst_ddl_watch();ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin",'MANAGED_EVENT_METADATA_DRIFT'],
 ['persistent write',"CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger LANGUAGE plpgsql SET search_path TO '' AS $$BEGIN INSERT INTO public.ajena VALUES(2,'UNEXPECTED');END$$",'MANAGED_FUNCTION_DRIFT'],
 ['new dependency',"CREATE EXTENSION hstore;ALTER EXTENSION hstore ADD FUNCTION extensions.pgrst_drop_watch()",'MANAGED_FUNCTION_DRIFT|MANAGED_DEPENDENCY_DRIFT'],
 ['new relevant trigger',"CREATE FUNCTION public.new_event_fn() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;CREATE EVENT TRIGGER new_alter_watch ON ddl_command_start WHEN TAG IN('ALTER TABLE') EXECUTE FUNCTION public.new_event_fn()",'UNEXPECTED_PHASE48_EVENT_TRIGGER'],
] as const)test('managed event gate rejects '+name,async()=>{
 const {authority,pre}=await setup();await sql(statement);await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true}),new RegExp(error));
 assert.equal((await sql("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='cobertura_asignaciones' AND column_name='institucion_id'")).rows[0].n,0);
 // Reset extra managed test objects before the next fixture; never production.
 await sql('DROP EVENT TRIGGER IF EXISTS new_alter_watch;DROP EXTENSION IF EXISTS hstore CASCADE');
});
test('unrelated event is informational; exact definitions and notifications are in definition digest',async()=>{
 const {authority,pre}=await setup();await sql("CREATE FUNCTION public.unrelated_watch() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;CREATE EVENT TRIGGER unrelated_watch ON ddl_command_end WHEN TAG IN('CREATE EXTENSION') EXECUTE FUNCTION public.unrelated_watch()");
 try{const next=await capture();assert.deepEqual(next.set,pre.seal.set);const c=localClient();await c.connect();try{assert((await certifiedManagedEvents(c)).informational.some(e=>e.name==='unrelated_watch'));}finally{await c.end();}
  assert.equal(next.inventory.managed_events![0].classification,'MANAGED_NOTIFICATION_ONLY');assert(next.manifest.entries.some(e=>e.kind==='event_trigger'&&e.name==='pgrst_drop_watch'));
  await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true});
 }finally{await sql('DROP EVENT TRIGGER unrelated_watch');}
});
test('exact triggers: Phase48 commit, transaction rollback, run reversal and idempotence; only expected notifications',async()=>{
 const prepared=await setup(),authority=prepared.authority,before=await capture(),listener=localClient();let pre=prepared.pre;await listener.connect();const notifications:any[]=[];
 listener.on('notification',n=>notifications.push({channel:n.channel,payload:n.payload}));await listener.query('LISTEN pgrst');
 const settle=async()=>{await listener.query('SELECT 1');await new Promise(r=>setTimeout(r,100));};
 try{
  const rollback=await executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true});await settle();assert.equal(rollback.status,'LOCAL_ROLLED_BACK');assert.deepEqual(notifications,[]);assert.deepEqual((await capture()).set,before.set);
  pre=await preflightScopedLocal(authority,target,release);
  const committed=await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true});await settle();assert.equal(committed.status,'LOCAL_COMMITTED');assert.deepEqual(notifications,[{channel:'pgrst',payload:'reload schema'}]);
  const c=localClient();await c.connect();let economic;try{economic=await tableHashes(c,before.manifest.tables.filter(t=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(t)));}finally{await c.end();}assert.deepEqual(economic,before.data.filter(t=>!['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(t.table)));
  assert.equal((await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true})).status,'ALREADY_APPLIED');await settle();assert.equal(notifications.length,1);
  const reversed=await rollbackScopedPublishedLocal(authority,pre.seal,target,{definitions_window_confirmed:true});await settle();assert.equal(reversed.status,'LOCAL_REVERSED');assert.equal(notifications.length,2);
  const after=await capture();assert.equal(after.set.phase48_candidates_digest,before.set.phase48_candidates_digest);assert.equal(after.set.critical_definition_digest,before.set.critical_definition_digest);
  observations.push({test:'actual_local_phase48',rollback:rollback.status,commit:committed.status,reversal:reversed.status,notifications,economic_hashes_unchanged:true,definition_digest:before.set.critical_definition_digest});
 }finally{await listener.end();}
});
test('failure in exact trigger replacement rolls back full Phase48 and pending NOTIFY',async()=>{
 const {authority,pre}=await setup(),before=await capture();
 await assert.rejects(executeScopedLocal(authority,pre,target,{definitions_window_confirmed:true,hooks:{afterUpdate:async c=>{
  await c.query("CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger LANGUAGE plpgsql SET search_path TO '' AS $$BEGIN RAISE EXCEPTION 'LOCAL_TRIGGER_FAILURE';END$$");
 }}}),/LOCAL_TRIGGER_FAILURE/);
 assert.deepEqual((await capture()).set,before.set);observations.push({test:'trigger_failure_during_actual_phase48',all_phase48_changes_rolled_back:true});
});
test('CREATE ALTER DROP dispatch order and tags, NOTIFY commit/rollback semantics with exact managed bodies',async()=>{
 await scopedFixture();const c=localClient(),listener=localClient();await c.connect();await listener.connect();const notifications:any[]=[];listener.on('notification',n=>notifications.push({channel:n.channel,payload:n.payload}));
 await c.query(`CREATE TABLE public.event_trace(n bigserial,event text,tag text);
 CREATE FUNCTION public.trace_event() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.event_trace(event,tag) VALUES(TG_EVENT,TG_TAG);END$$;
 CREATE EVENT TRIGGER a_trace_start ON ddl_command_start EXECUTE FUNCTION public.trace_event();
 CREATE EVENT TRIGGER z_trace_end ON ddl_command_end EXECUTE FUNCTION public.trace_event();
 CREATE EVENT TRIGGER z_trace_drop ON sql_drop EXECUTE FUNCTION public.trace_event();TRUNCATE public.event_trace`);
 await listener.query('LISTEN pgrst');
 try{
  await c.query('BEGIN;CREATE TABLE public.dispatch_probe(id bigint);ALTER TABLE public.dispatch_probe ADD COLUMN v text;DROP TABLE public.dispatch_probe');
  const trace=(await c.query('SELECT event,tag FROM public.event_trace ORDER BY n')).rows;
  assert.deepEqual(trace,[{event:'ddl_command_start',tag:'CREATE TABLE'},{event:'ddl_command_end',tag:'CREATE TABLE'},{event:'ddl_command_start',tag:'ALTER TABLE'},{event:'ddl_command_end',tag:'ALTER TABLE'},{event:'ddl_command_start',tag:'DROP TABLE'},{event:'sql_drop',tag:'DROP TABLE'},{event:'ddl_command_end',tag:'DROP TABLE'}]);assert.deepEqual(notifications,[]);
  await c.query('ROLLBACK');await listener.query('SELECT 1');await new Promise(r=>setTimeout(r,100));assert.deepEqual(notifications,[]);assert.equal((await c.query('SELECT count(*)::int n FROM public.event_trace')).rows[0].n,0);
  await c.query('CREATE TABLE public.dispatch_probe(id bigint)');await listener.query('SELECT 1');await new Promise(r=>setTimeout(r,100));assert.deepEqual(notifications,[{channel:'pgrst',payload:'reload schema'}]);
  observations.push({test:'dispatch_instrumented_only',trace,rollback_notification_count:0,committed_notification:notifications[0],note:'trace observer adds local rows/sequence; it is absent from certified Phase48 tests and excluded from claims about managed function effects'});
 }finally{await c.query('DROP EVENT TRIGGER a_trace_start;DROP EVENT TRIGGER z_trace_end;DROP EVENT TRIGGER z_trace_drop');await c.end();await listener.end();}
 writeFileSync('tmp/phase48-pooler-local/managed-events-observations.json',JSON.stringify(observations,null,2)+'\n');
});
