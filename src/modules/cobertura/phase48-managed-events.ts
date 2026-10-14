import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import baseline from './phase48-managed-events-baseline.json';
const need=(ok:unknown,code:string)=>{if(!ok)throw Error(code);};
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Forward DDL, sequence-lock DDL and certified reversal. sql_drop cannot filter
// object types in its tags; a NULL tag list is conservatively treated as relevant.
export const PHASE48_DDL_TAGS=['ALTER TABLE','CREATE INDEX','ALTER SEQUENCE','DROP INDEX'] as const;
export async function certifiedManagedEvents(db:Pick<PoolClient,'query'>){
 need((await db.query("SELECT current_setting('session_replication_role') role")).rows[0].role==='origin','MANAGED_REPLICATION_ROLE_UNSAFE');
 const all=(await db.query(`SELECT e.oid::text oid,e.evtname name,e.evtevent event,e.evttags tags,e.evtenabled enabled,e.evtowner::regrole::text owner,e.evtfoid::text function_oid,e.evtfoid::regprocedure::text function_identity FROM pg_event_trigger e ORDER BY e.evtname`)).rows;
 const names=baseline.events.map(e=>e.name);
 const events=all.filter(e=>names.includes(e.name));
 need(events.length===names.length,'MANAGED_EVENT_MISSING');
 for(const expected of baseline.events){const actual=events.find(e=>e.name===expected.name)!;const {oid,function_oid,...semantic}=actual;need(hash(semantic)===hash(expected),'MANAGED_EVENT_METADATA_DRIFT');}
 const unknown=all.filter(e=>!names.includes(e.name));
 need(!unknown.some(e=>e.enabled!=='D'&&(e.tags===null||e.tags.some((tag:string)=>(PHASE48_DDL_TAGS as readonly string[]).includes(tag)))),'UNEXPECTED_PHASE48_EVENT_TRIGGER');
 const functions=(await db.query(`SELECT n.nspname schema,p.proname name,p.oid::regprocedure::text identity,p.proowner::regrole::text owner,l.lanname language,p.prosecdef security_definer,p.proconfig config,p.provolatile volatility,p.proacl::text acl,pg_get_functiondef(p.oid) definition,(SELECT x.extname FROM pg_depend d JOIN pg_extension x ON x.oid=d.refobjid WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e') extension FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=ANY($1::oid[]) ORDER BY p.proname`,[events.map(e=>e.function_oid)])).rows.map(f=>({...f,definition:f.definition.replaceAll('\r\n','\n')}));
 for(const expected of baseline.functions){const f=functions.find(f=>f.identity===expected.identity);need(f,'MANAGED_FUNCTION_MISSING');
  for(const k of ['schema','name','identity','owner','language','security_definer','config','volatility','extension','definition'] as const)need(hash(f[k])===hash(expected[k]),'MANAGED_FUNCTION_DRIFT');
 }
 // Compare the complete catalog closure to the captured baseline, independent
 // of OIDs. Literal PL/pgSQL calls are also sealed below: pg_depend omits them.
 const seeds=events.flatMap(e=>[{classid:'pg_event_trigger',oid:e.oid},{classid:'pg_proc',oid:e.function_oid}]);
 const deps=(await db.query(`WITH RECURSIVE nodes(classid,objid,path,depth) AS (
 SELECT x.classid::regclass::oid,x.oid::oid,ARRAY[x.classid||':'||x.oid],0 FROM jsonb_to_recordset($1::jsonb) x(classid text,oid text)
 UNION ALL SELECT d.refclassid,d.refobjid,n.path||(d.refclassid::regclass::text||':'||d.refobjid::text),n.depth+1 FROM nodes n JOIN pg_depend d ON d.classid=n.classid AND d.objid=n.objid WHERE n.depth<16 AND NOT (d.refclassid::regclass::text||':'||d.refobjid::text)=ANY(n.path)
 ) SELECT DISTINCT classid::regclass::text class,objid::text oid,pg_describe_object(classid,objid,0) object,depth FROM nodes ORDER BY depth,class,oid`,[JSON.stringify(seeds)])).rows;
 need(!deps.some(d=>d.depth===16),'MANAGED_DEPENDENCY_DEPTH_UNCERTIFIED');
 const objects=[...new Set(deps.map(d=>d.class+'|'+d.object))].sort();need(hash(objects)===hash(baseline.dependency_objects),'MANAGED_DEPENDENCY_DRIFT');
 const edges=(await db.query(`SELECT DISTINCT pg_describe_object(d.classid,d.objid,d.objsubid) origin,pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) target,d.deptype type FROM pg_depend d WHERE (d.classid::regclass::text||':'||d.objid::text)=ANY($1::text[]) ORDER BY 1,2,3`,[[...new Set(deps.map(d=>d.class+':'+d.oid))]])).rows;
 const native=(await db.query(`SELECT n.nspname schema,p.oid::regprocedure::text identity,l.lanname language,p.proowner::regrole::text owner,p.prosrc source,p.probin library,p.prosecdef security_definer,p.proconfig config,p.proacl::text acl,p.provolatile volatility FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE (n.nspname='pg_catalog' AND p.proname IN('pg_event_trigger_ddl_commands','pg_event_trigger_dropped_objects')) OR p.oid IN(SELECT objid FROM pg_depend WHERE false) ORDER BY 2`)).rows;
 need(native.length===2&&native.every(f=>f.language==='internal'&&!f.security_definer&&f.config===null&&f.library===null&&f.source===f.identity.replace('()','')),'MANAGED_NATIVE_DEPENDENCY_UNCERTIFIED');
 const language=(await db.query(`SELECT l.lanname name,l.lanpltrusted trusted,l.lanowner::regrole::text owner,h.oid::regprocedure::text handler,h.prosrc handler_source,h.probin handler_library,i.oid::regprocedure::text inline_handler,i.prosrc inline_source,i.probin inline_library,v.oid::regprocedure::text validator,v.prosrc validator_source,v.probin validator_library,x.extname extension,x.extversion version FROM pg_language l JOIN pg_proc h ON h.oid=l.lanplcallfoid JOIN pg_proc i ON i.oid=l.laninline JOIN pg_proc v ON v.oid=l.lanvalidator LEFT JOIN pg_depend d ON d.classid='pg_language'::regclass AND d.objid=l.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e' LEFT JOIN pg_extension x ON x.oid=d.refobjid WHERE l.lanname='plpgsql'`)).rows;
 need(language.length===1&&language[0].trusted&&language[0].extension==='plpgsql'&&language[0].version==='1.0'&&['handler','inline','validator'].every(k=>language[0][k+'_library']==='$libdir/plpgsql')&&language[0].handler_source==='plpgsql_call_handler'&&language[0].inline_source==='plpgsql_inline_handler'&&language[0].validator_source==='plpgsql_validator','MANAGED_LANGUAGE_UNCERTIFIED');
 return {critical:[{version:baseline.version,classification:baseline.classification,events:events.map(({oid,function_oid,...e})=>e),functions,dependency_objects:objects,dependency_edges:edges,native,language,notification:baseline.expected_notification}],informational:unknown.map(({oid,function_oid,...e})=>e)};
}
