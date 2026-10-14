import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {validatePseudorecords,sqlTableReferences} from '../modules/cobertura/phase48-pseudorecord-parser';
import baseline from '../modules/cobertura/phase48-pseudorecord-baseline.json';
import {scopedFixture} from './fixtures/phase48-scoped-fixture';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
import {createScopedLocalAuthority} from '../modules/cobertura/phase48-scoped-contract';
import {preflightScopedLocal,executeScopedLocal,rollbackScopedPublishedLocal} from '../modules/cobertura/phase48-scoped-local';
const binding=(type:number)=>[{schema:'public',relation:'personas',type,enabled:'O',columns:['identificador_interno']}];
const update='BEGIN IF NEW.identificador_interno IS DISTINCT FROM OLD.identificador_interno THEN RAISE EXCEPTION \'immutable\';END IF;RETURN NEW;END;';
test('UPDATE: OLD/NEW fields bound to actual row trigger; DISTINCT FROM is an operator',()=>{
 assert.equal(validatePseudorecords(update,'trigger',binding(19),['personas']).length,2);
 assert.deepEqual(sqlTableReferences(update,['identificador_interno']),[]);
 assert.throws(()=>sqlTableReferences(update),/PSEUDORECORD_CONTEXT_REQUIRED/);
});
test('INSERT NEW and DELETE OLD accepted',()=>{assert.equal(validatePseudorecords('BEGIN RETURN NEW.identificador_interno;END','trigger',binding(7),['personas']).length,1);assert.equal(validatePseudorecords('BEGIN RETURN OLD.identificador_interno;END','trigger',binding(11),['personas']).length,1);});
for(const [name,source,returns,bindings,tables,ambiguities,error] of [
 ['OLD on INSERT','RETURN OLD.identificador_interno','trigger',binding(7),['personas'],[],'EVENT'],
 ['NEW on DELETE','RETURN NEW.identificador_interno','trigger',binding(11),['personas'],[],'EVENT'],
 ['missing column','RETURN NEW.absent','trigger',binding(19),['personas'],[],'COLUMN'],
 ['non trigger','RETURN NEW.identificador_interno','text',binding(19),['personas'],[],'BINDING'],
 ['event trigger has no OLD row','RETURN OLD.identificador_interno','event_trigger',binding(19),['personas'],[],'BINDING'],
 ['no binding',update,'trigger',[],['personas'],[],'BINDING'],
 ['uncertified table',update,'trigger',binding(19),[],[],'TABLE'],
 ['disabled',update,'trigger',[{...binding(19)[0]!,enabled:'D'}],['personas'],[],'TABLE'],
 ['ambiguous schema',update,'trigger',binding(19),['personas'],['OLD'],'AMBIGUITY'],
 ['EXECUTE',"EXECUTE 'SELECT OLD.identificador_interno'",'trigger',binding(19),['personas'],[],'DYNAMIC'],
 ['concatenation',"RETURN NEW.identificador_interno||'x'",'trigger',binding(19),['personas'],[],'CONCATENATION'],
 ['unknown TG','IF TG_UNKNOWN IS NULL THEN RETURN NEW.identificador_interno;END IF','trigger',binding(19),['personas'],[],'VARIABLE'],
] as const)test('pseudorecord rejects '+name,()=>{assert.throws(()=>validatePseudorecords(source,returns,[...bindings],[...tables],[...ambiguities]),new RegExp(error));});
test('quoted OLD, public.old, SQL alias and CTE remain real SQL references',()=>{
 assert(sqlTableReferences('SELECT id FROM "OLD"').some(r=>r.name==='OLD'&&r.quoted));
 assert(sqlTableReferences('SELECT id FROM public.old').some(r=>r.schema==='public'&&r.name==='old'));
 const alias='SELECT OLD.id FROM public.real_source AS OLD';assert(sqlTableReferences(alias).some(r=>r.name==='real_source'));assert.deepEqual(validatePseudorecords(alias,'text',[],[]),[]);
 const cte='WITH OLD AS (SELECT id FROM public.real_source) SELECT OLD.id FROM OLD';const refs=sqlTableReferences(cte);assert(refs.some(r=>r.name==='real_source'));assert(refs.some(r=>r.name==='old'&&r.cte));assert.deepEqual(validatePseudorecords(cte,'text',[],[]),[]);
 assert(sqlTableReferences('UPDATE external.real_source SET x=1').some(r=>r.schema==='external'));
 assert(sqlTableReferences('INSERT INTO public.t VALUES(1);DELETE FROM public.t;MERGE INTO public.t USING public.u ON true WHEN MATCHED THEN DELETE').filter(r=>r.name==='t').length===3);
});
test('comments and strings are not blindly rewritten into dependency exceptions',()=>{
 assert.deepEqual(sqlTableReferences("RAISE EXCEPTION 'FROM OLD.x'; -- FROM NEW.y\nSELECT 1 FROM public.real_source"),[{schema:'public',name:'real_source',quoted:false,cte:false}]);
 assert(sqlTableReferences('SELECT 1 FROM OLD.identificador_interno',['identificador_interno']).some(r=>r.schema==='old'));
});
async function sql(text:string){const c=localClient();await c.connect();try{return await c.query(text);}finally{await c.end();}}
test('real protector stays enabled; unchanged UPDATE idempotent, changed identifier rejected and rollback exact',async()=>{
 await scopedFixture();await sql("INSERT INTO personas(id,identificador_interno) VALUES(999,'00000000-0000-4000-8000-000000000999')");
 await sql("BEGIN;UPDATE personas SET identificador_interno=identificador_interno WHERE id=999;COMMIT");
 await sql("UPDATE personas SET identificador_interno=identificador_interno WHERE id=999");
 const c=localClient();await c.connect();try{await c.query('BEGIN');await assert.rejects(c.query("UPDATE personas SET identificador_interno='00000000-0000-4000-8000-000000000998' WHERE id=999"),/identificador_interno is immutable/);await c.query('ROLLBACK');}finally{await c.end();}
 assert.equal((await sql('SELECT identificador_interno FROM personas WHERE id=999')).rows[0].identificador_interno,'00000000-0000-4000-8000-000000000999');
 assert.equal((await sql("SELECT tgenabled FROM pg_trigger WHERE tgname='trg_personas_prevent_identificador_interno_update'")).rows[0].tgenabled,'O');
});
test('Phase48 COMMIT, idempotence, reversal and rollback preserve personas and enabled protector',async()=>{
 await scopedFixture();await sql("INSERT INTO personas(id,identificador_interno) VALUES(999,'00000000-0000-4000-8000-000000000999')");
 const before=(await sql('SELECT to_jsonb(t) row FROM personas t ORDER BY id')).rows,seq=(await sql('SELECT last_value::text,is_called FROM nomina_revision_operativa_id_seq')).rows;
 const authority=createScopedLocalAuthority(),target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')},release={readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40)},pre=await preflightScopedLocal(authority,target,release);
 const committed=await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true});assert.equal(committed.status,'LOCAL_COMMITTED');assert.deepEqual((await sql('SELECT to_jsonb(t) row FROM personas t ORDER BY id')).rows,before);
 assert.equal((await executeScopedLocal(authority,pre,target,{mode:'Commit',definitions_window_confirmed:true})).status,'ALREADY_APPLIED');await rollbackScopedPublishedLocal(authority,pre.seal,target,{definitions_window_confirmed:true});
 const next=await preflightScopedLocal(authority,target,release);assert.equal((await executeScopedLocal(authority,next,target,{definitions_window_confirmed:true})).status,'LOCAL_ROLLED_BACK');
 assert.deepEqual((await sql('SELECT to_jsonb(t) row FROM personas t ORDER BY id')).rows,before);assert.deepEqual((await sql('SELECT last_value::text,is_called FROM nomina_revision_operativa_id_seq')).rows,seq);
 assert.equal((await sql("SELECT tgenabled FROM pg_trigger WHERE tgname='trg_personas_prevent_identificador_interno_update'")).rows[0].tgenabled,'O');
 writeFileSync('tmp/phase48-pooler-local/pseudorecord-observations.json',JSON.stringify({actual_function_hash:baseline.definition_sha256,phase48_commit:true,phase48_idempotent:true,phase48_reversal:true,phase48_rollback:true,personas_exactly_unchanged:true,trigger_enabled:'O',revision_sequence_unchanged:true},null,2)+'\n');
});
