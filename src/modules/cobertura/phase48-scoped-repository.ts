import type {PoolClient} from 'pg';
import {SCHEMA_SCOPE} from './phase48-readonly-schema-scope';
import {collectSchemaForensic,STRUCTURAL_QUERIES} from './phase48-readonly-schema-catalog';
import {createHash} from 'node:crypto';
import {actorGate,historicalPlan} from './phase48-historical-domain';
import {certifiedManagedEvents} from './phase48-managed-events';
import {certifyConstantExecute,certifyConstantSqlContext} from './phase48-constant-sql';
import {certifiedPseudorecordContext,sqlTableReferences} from './phase48-pseudorecord-parser';
import {SALARY_DECISION,requireScoped,scopedDigest,sortScopedIds,type ScopedSet} from './phase48-scoped-contract';
import {operationalPins,validateOperationalRows,validateCloseRetirement,OPERATIONAL_CERTIFICATE} from './phase48-operational-close';
export type ScopedDb=Pick<PoolClient,'query'>;
export const sq=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export type ManifestEntry={kind:string;name:string;reason:string;category:'A_SOURCE'|'B_MODIFIED'|'C_PROTECTED'|'D_SEQUENCE'|'E_DEFINITION'|'F_SCHEMA'|'G_TRANSITIVE'};
export type ScopedManifest={version:'phase48-scoped-manifest-v2';tables:string[];sequences:string[];functions:string[];entries:ManifestEntry[];exclusions:{kind:string;name:string;reason:string}[]};
export type ScopedCapture={set:ScopedSet;manifest:ScopedManifest;inventory:Record<string,any[]>;data:any[];sequences:any[];candidates:any[];coverage:any[];plan:any[];salary_preview:any[];operational:ReturnType<typeof validateOperationalRows>;informational_global_digest:string;informational_excluded_digest:string};
export async function collectScopedSchema(db:ScopedDb,manifest:ScopedManifest){
 // Metadata formatting can itself acquire relation locks. Under the mutator
 // transaction never format or read unrelated relations merely for evidence.
 return collectSchemaForensic({query:async(sql:string)=>{
  let values:string[]=manifest.tables;
  if(sql.includes('FROM pg_proc')||sql.includes('FROM pg_catalog.pg_proc')){sql=sql.replace("WHERE n.nspname='public'","WHERE n.nspname='public' AND p.oid::regprocedure::text=ANY($1::text[])");values=manifest.functions;}
  else if(sql.includes('information_schema.columns'))sql=sql.replace("WHERE table_schema='public'","WHERE table_schema='public' AND table_name=ANY($1::text[])");
  else if(sql.includes('pg_indexes'))sql=sql.replace("WHERE schemaname='public'","WHERE schemaname='public' AND tablename=ANY($1::text[])");
  else if(sql.includes('pg_catalog.pg_type')){sql=sql.replace("WHERE n.nspname='public'","WHERE n.nspname='public' AND t.typname=ANY($1::text[])");values=[];}
  else if(sql.includes('pg_catalog.pg_sequence')){sql=sql.replace("WHERE n.nspname='public'","WHERE n.nspname='public' AND c.relname=ANY($1::text[])");values=manifest.sequences;}
  else{sql=sql.replace("WHERE n.nspname='public'","WHERE n.nspname='public' AND c.relname=ANY($1::text[])");if(sql.includes('c.relkind'))values=[...manifest.tables,...manifest.sequences];}
  return db.query(sql,[values]);
 }});
}
export async function scopedFunctions(db:ScopedDb){
 const sql=STRUCTURAL_QUERIES.functions.replace('p.proisstrict strict,',"p.proisstrict strict,p.proowner::regrole::text owner,md5(COALESCE(p.proacl::text,'')) acl_hash,");
 return (await db.query(sql)).rows.map(r=>({...r,definition:createHash('sha256').update(r.definition).digest('hex')}));
}
export async function scopedManifest(db:ScopedDb,inventory:Record<string,any[]>):Promise<ScopedManifest>{
 inventory.managed_events=(await certifiedManagedEvents(db)).critical;
 inventory.trigger_pseudorecords=await certifiedPseudorecordContext(db,SCHEMA_SCOPE.critical_relations);
 const relations=inventory.relations??[],constraints=inventory.constraints??[];
 const present=new Set(relations.filter(r=>['r','p','v','m'].includes(r.kind)).map(r=>r.schema+'.'+r.name));
 const tables=new Set<string>(),functions=new Set<string>(),entries:ManifestEntry[]=[];
 const add=(kind:string,name:string,reason:string,category:ManifestEntry['category'])=>{if(!entries.some(e=>e.kind===kind&&e.name===name))entries.push({kind,name,reason,category});};
 add('authorized_correction','public.cobertura_asignaciones:1203:fecha_fin','Retiro confirmado: 2026-11-30 -> 2026-08-31; activo y resto de campos preservados','B_MODIFIED');
 for(const a of OPERATIONAL_CERTIFICATE.archives)add('archived_version','public.cobertura_asignaciones:'+a.id,'Version inactiva certificada por full-row digest; solo backfill estructural, nunca reactivar o eliminar','C_PROTECTED');
 for(const group of inventory.managed_events)for(const e of group.events)add('event_trigger',e.name,'PostgREST notification-only; exact metadata, definitions and dependency closure sealed','E_DEFINITION');
 for(const group of inventory.managed_events)for(const f of group.functions)add('managed_function',f.identity,'Managed event trigger function; no business DML/DDL/sequence effects','E_DEFINITION');
 for(const group of inventory.managed_events)for(const d of group.dependency_objects)add('managed_dependency',d,'Exact managed event dependency closure plus PostgreSQL native metadata','G_TRANSITIVE');
 for(const group of inventory.managed_events)for(const f of group.native)add('managed_native_function',f.schema+'.'+f.identity,'Literal managed PL/pgSQL call omitted by pg_depend; native metadata sealed','G_TRANSITIVE');
 for(const t of SCHEMA_SCOPE.critical_relations){requireScoped(present.has('public.'+t),'CRITICAL_RELATION_MISSING:'+t);tables.add(t);
  add('table','public.'+t,(SCHEMA_SCOPE.direct_relations as readonly string[]).includes(t)?'Lectura/write-set/condición histórica directa de Phase 48':'Contexto certificado de tenant, autorización, integridad o datos protegidos', ['cobertura_asignaciones','auditoria','auditoria_eventos'].includes(t)?'B_MODIFIED':(SCHEMA_SCOPE.direct_relations as readonly string[]).includes(t)?'A_SOURCE':'C_PROTECTED');}
 const defs=(await db.query("SELECT p.oid::text oid,n.nspname schema,p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p') ORDER BY 3")).rows;
 const edges=(await db.query(`SELECT DISTINCT pg_describe_object(d.classid,d.objid,d.objsubid) origin,tn.nspname table_schema,t.relname table_name,pn.nspname function_schema,p.oid::regprocedure::text function_name
  FROM pg_depend d LEFT JOIN pg_class t ON d.refclassid='pg_class'::regclass AND t.oid=d.refobjid LEFT JOIN pg_namespace tn ON tn.oid=t.relnamespace
  LEFT JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND p.oid=d.refobjid LEFT JOIN pg_namespace pn ON pn.oid=p.pronamespace
  WHERE (tn.nspname='public' OR pn.nspname='public') ORDER BY 1,2,3,4,5`)).rows;
 for(const f of SCHEMA_SCOPE.critical_functions){requireScoped(defs.some(d=>d.identity===f),'CRITICAL_FUNCTION_MISSING:'+f);functions.add(f);add('function',f,'Definición fijada por phase48-critical-schema-v1','E_DEFINITION');}
 let changed=true;
 while(changed){changed=false;
  for(const c of constraints)if(c.schema==='public'&&tables.has(c.relation)&&c.reference_relation){
   requireScoped(c.reference_schema==='public','EXTERNAL_FK_DEPENDENCY_UNCERTIFIED');
   if(!tables.has(c.reference_relation)){requireScoped(present.has('public.'+c.reference_relation),'DEPENDENCY_RELATION_MISSING');tables.add(c.reference_relation);changed=true;add('table','public.'+c.reference_relation,'FK saliente '+c.relation+'.'+c.name,'G_TRANSITIVE');}
  }
  for(const view of inventory.view_dependencies??[])if(view.schema==='public'&&tables.has(view.relation)){
   requireScoped(view.reference_schema==='public','EXTERNAL_VIEW_DEPENDENCY_UNCERTIFIED');
   if(!tables.has(view.reference_relation)){tables.add(view.reference_relation);changed=true;add('table','public.'+view.reference_relation,'Fuente transitiva de vista '+view.relation,'G_TRANSITIVE');}
  }
  for(const t of inventory.triggers??[])if(t.schema==='public'&&tables.has(t.relation)){
   requireScoped(t.function_schema==='public','EXTERNAL_TRIGGER_DEPENDENCY_UNCERTIFIED');
   if(!functions.has(t.function_identity)){functions.add(t.function_identity);changed=true;}
   add('function',t.function_identity,'Función ejecutada por trigger '+t.relation+'.'+t.name,'E_DEFINITION');
  }
  for(const edge of edges){
   const related=[...tables].some(t=>new RegExp('(?:^|[ .])'+t+'(?:[ .]|$)').test(edge.origin))||[...functions].some(f=>edge.origin.includes(f));
   if(!related)continue;
   if(edge.table_schema==='public'&&present.has('public.'+edge.table_name)&&!tables.has(edge.table_name)){tables.add(edge.table_name);changed=true;add('table','public.'+edge.table_name,'Dependencia de catálogo: '+edge.origin,'G_TRANSITIVE');}
   if(edge.function_schema==='public'&&!functions.has(edge.function_name)){functions.add(edge.function_name);changed=true;add('function',edge.function_name,'Dependencia ejecutable: '+edge.origin,'E_DEFINITION');}
  }
  // pg_depend alone does not expose PL/pgSQL body lookups. Resolve literal
  // public table/function references and reject dynamic execution fail-closed.
  for(const name of functions){const def=defs.find(d=>d.identity===name);requireScoped(def,'CRITICAL_FUNCTION_UNRESOLVED');
   const constant=certifyConstantExecute(name,def.definition);
   if(constant){await certifyConstantSqlContext(db);add('constant_sql_read',constant.relation+'.'+constant.column,'Exact function/hash/template/USING; public binding under sealed search_path','G_TRANSITIVE');}
   const pseudo=inventory.trigger_pseudorecords.find(r=>r.identity===name);
   const references=[...sqlTableReferences(def.definition,pseudo?.refs.map((r:any)=>r.column)??[]),...(constant?sqlTableReferences(constant.sql):[])];
   for(const reference of references){
    const first=reference.schema,table=reference.name;
    if(reference.cte)continue;
    if(first)requireScoped(first==='public'||first==='pg_catalog','EXTERNAL_FUNCTION_TABLE_DEPENDENCY_UNCERTIFIED');
    if(first==='pg_catalog')continue;
    if(present.has('public.'+table)&&!tables.has(table)){tables.add(table);changed=true;add('table','public.'+table,'Referencia literal en '+name,'G_TRANSITIVE');}
   }
   for(const dependency of defs)if(dependency.identity!==name&&new RegExp('(?:public\\.)?'+dependency.identity.split('(')[0]+'\\s*\\(','i').test(def.definition)){
    if(!functions.has(dependency.identity)){functions.add(dependency.identity);changed=true;add('function',dependency.identity,'Invocación literal desde '+name,'G_TRANSITIVE');}
   }
  }
 }
 requireScoped((await db.query("SELECT r.rolsuper OR r.rolbypassrls OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relrowsecurity) safe FROM pg_roles r WHERE r.rolname=current_user",[[...tables]])).rows[0].safe,'SCOPED_RLS_UNCERTIFIED');
 requireScoped((inventory.functions??[]).filter(f=>functions.has(f.name)).every(f=>['sql','plpgsql'].includes(f.language)),'CRITICAL_FUNCTION_LANGUAGE_UNCERTIFIED');
 for(const col of inventory.columns??[])if(col.schema==='public'&&tables.has(col.relation))requireScoped(!(inventory.types??[]).some(t=>col.type===t.name||col.type==='public.'+t.name),'CUSTOM_CRITICAL_TYPE_UNCERTIFIED');
 requireScoped((await db.query(`SELECT count(*)::int n FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace rn ON rn.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace WHERE rn.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped AND tn.nspname<>'pg_catalog'`,[[...tables]])).rows[0].n===0,'CRITICAL_TYPE_NAMESPACE_UNCERTIFIED');
 const used=['cobertura_asignaciones_id_seq','auditoria_id_seq','auditoria_eventos_id_seq'];
 for(const sequence of used){requireScoped((inventory.sequences??[]).some(s=>s.schema==='public'&&s.name===sequence),'USED_SEQUENCE_MISSING:'+sequence);add('sequence','public.'+sequence,'IDs explícitos de correcciones y auditoría estricta','D_SEQUENCE');}
 // Any additional default/trigger sequence used by critical tables belongs in
 // scope too. Owned sequences are conservative dependencies of certified rows.
 const modified=['cobertura_asignaciones','auditoria','auditoria_eventos'];
 for(const s of inventory.sequences??[])if(s.owner_schema==='public'&&modified.includes(s.owner_relation)){if(!used.includes(s.name))used.push(s.name);add('sequence','public.'+s.name,'Secuencia de columna en relación modificada '+s.owner_relation,'D_SEQUENCE');}
 for(const edge of edges)if(edge.table_schema==='public'&&(inventory.sequences??[]).some(s=>s.name===edge.table_name)&&(modified.some(t=>edge.origin.includes(t))||[...functions].some(f=>edge.origin.includes(f)))){if(!used.includes(edge.table_name))used.push(edge.table_name);add('sequence','public.'+edge.table_name,'Default/rutina del write-set certificado','D_SEQUENCE');}
 const defaults=(await db.query(`SELECT c.relname relation,a.attname column_name,pg_get_expr(d.adbin,d.adrelid) definition FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.adnum WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,a.attname`,[modified])).rows;
 const sequenceConsumers=[...[...functions].map(name=>({name,definition:defs.find(d=>d.identity===name)!.definition})),...defaults.map(d=>({name:'default '+d.relation+'.'+d.column_name,definition:d.definition}))];
 for(const consumer of sequenceConsumers)for(const match of consumer.definition.matchAll(/\b(?:nextval|setval)\s*\(([^)]*)/gi)){
  const literal=/^\s*'((?:public\.)?[a-z_][a-z0-9_]*)'\s*(?:::\s*(?:pg_catalog\.)?regclass\s*)?(?:,|$)/i.exec(match[1]!);
  requireScoped(literal,'DYNAMIC_SEQUENCE_REFERENCE_UNCERTIFIED');const sequence=literal[1]!.replace(/^public\./,'');
  requireScoped((inventory.sequences??[]).some(s=>s.schema==='public'&&s.name===sequence),'CRITICAL_SEQUENCE_REFERENCE_UNRESOLVED');if(!used.includes(sequence))used.push(sequence);add('sequence','public.'+sequence,'Consumo literal desde '+consumer.name,'D_SEQUENCE');
 }
 for(const [kind,items] of Object.entries(inventory))for(const r of items){if(r.schema==='public'&&tables.has(r.relation)&&['constraints','indexes','triggers','columns','view_dependencies'].includes(kind))add(kind,'public.'+r.relation+'.'+(r.name??r.reference_relation??''),'Definición estructural de relación crítica',kind==='triggers'?'E_DEFINITION':'F_SCHEMA');}
 const exclusions=[];
 for(const r of relations)if(r.schema==='public'&&!tables.has(r.name)&&!used.includes(r.name))exclusions.push({kind:'relation',name:'public.'+r.name,reason:'Sin vínculo desde fuentes/write-set ni clausura crítica certificada; evidencia informativa'});
 for(const f of defs)if(!functions.has(f.identity))exclusions.push({kind:'function',name:f.identity,reason:'No invocada por fuentes, defaults, triggers ni rutinas críticas certificadas'});
 return {version:'phase48-scoped-manifest-v2',tables:[...tables].sort(),sequences:used.sort(),functions:[...functions].sort(),entries:entries.sort((a,b)=>(a.kind+a.name).localeCompare(b.kind+b.name)),exclusions};
}
export function projectScopedInventory(inventory:Record<string,any[]>,manifest:ScopedManifest){
 const result:Record<string,any[]>={};
 for(const [kind,rows] of Object.entries(inventory))result[kind]=['managed_events','trigger_pseudorecords'].includes(kind)?rows:rows.filter(r=>r.schema==='public'&&(kind==='functions'?manifest.functions.includes(r.name):kind==='sequences'?manifest.sequences.includes(r.name):manifest.tables.includes(r.relation??r.name)||kind==='relations'&&manifest.sequences.includes(r.name)));
 return result;
}
export async function scopedInformational(db:ScopedDb,manifest:ScopedManifest){
 const forensic=await collectSchemaForensic(db);
 forensic.inventory.functions=await scopedFunctions(db);
 const excludedTables=(forensic.inventory.relations??[]).filter((r:any)=>r.schema==='public'&&['r','p'].includes(r.kind)&&!manifest.tables.includes(r.name)).map((r:any)=>r.name).sort();
 const excludedSequences=(forensic.inventory.sequences??[]).filter((r:any)=>r.schema==='public'&&!manifest.sequences.includes(r.name)).map((r:any)=>r.name).sort();
 const data=await tableHashes(db,excludedTables),sequenceData=[];
 for(const name of excludedSequences)sequenceData.push({name,...(await db.query('SELECT last_value::text,is_called FROM public.'+sq(name))).rows[0]});
 const definitions=(forensic.inventory.functions??[]).filter((r:any)=>!manifest.functions.includes(r.name));
 const events=(await certifiedManagedEvents(db)).informational;
 return {global_schema_digest:forensic.global_digest,excluded_digest:scopedDigest({data,sequenceData,definitions,events}),excluded_tables:excludedTables,excluded_sequences:excludedSequences,excluded_event_triggers:events};
}
export async function tableHashes(db:ScopedDb,tables:string[]){
 const rows=[];for(const table of tables){const row=(await db.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM public.${sq(table)} t`)).rows[0];rows.push({table,...row});}return rows;
}
export async function sequenceStates(db:ScopedDb,manifest:ScopedManifest,inventory:Record<string,any[]>){
 const rows=[];for(const name of manifest.sequences){const metadata=inventory.sequences!.find(s=>s.schema==='public'&&s.name===name);const row=(await db.query('SELECT last_value::text,is_called FROM public.'+sq(name))).rows[0];rows.push({name,metadata,...row});}return rows;
}
export async function scopedCapture(db:ScopedDb,lockedManifest?:ScopedManifest):Promise<ScopedCapture>{
 const forensic=lockedManifest?await collectScopedSchema(db,lockedManifest):await collectSchemaForensic(db);forensic.inventory.functions=await scopedFunctions(db);const manifest=await scopedManifest(db,forensic.inventory);
 const inventory=projectScopedInventory(forensic.inventory,manifest),data=await tableHashes(db,manifest.tables),sequences=await sequenceStates(db,manifest,forensic.inventory);
 await actorGate(db,'12');
 const coverage=(await db.query('SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id')).rows.map(r=>r.row);
 const linkage=(await db.query('SELECT to_jsonb(v) row FROM vinculaciones v WHERE id=1461')).rows[0]?.row;
 const ff=(await db.query('SELECT to_jsonb(ff) row FROM focalizacion_final ff WHERE id=829')).rows[0]?.row;
 const operational=validateOperationalRows(coverage,linkage,ff,await operationalPins(db));
 await validateCloseRetirement(db);
 const candidates=(await db.query(`SELECT ca.id::text id,ff.institucion_id::text institucion_id,ff.sede_id::text sede_id,ff.modalidad_id::text modalidad_id FROM cobertura_asignaciones ca
 JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15 ORDER BY ca.id`)).rows;
 requireScoped((await db.query('SELECT count(*)::int n FROM cobertura_asignaciones WHERE contrato_id=24')).rows[0].n===candidates.length&&candidates.every(c=>c.institucion_id&&c.sede_id&&c.modalidad_id),'CANDIDATE_IDENTITY_INVALID');
 requireScoped(!(await db.query(`SELECT 1 FROM cobertura_asignaciones a JOIN cobertura_asignaciones b ON a.id<b.id AND a.contrato_id=b.contrato_id AND a.vinculacion_id=b.vinculacion_id AND a.activo AND b.activo AND a.fecha_inicio<=COALESCE(b.fecha_fin,'infinity'::date) AND b.fecha_inicio<=COALESCE(a.fecha_fin,'infinity'::date) LIMIT 1`)).rowCount,'CANDIDATE_OVERLAP');
 requireScoped(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca JOIN vinculaciones v ON v.id=ca.vinculacion_id JOIN contratos c ON c.id=ca.contrato_id WHERE v.empresa_id<>c.empresa_id OR v.contrato_id<>ca.contrato_id OR ca.fecha_fin<ca.fecha_inicio OR ca.fecha_inicio<v.fecha_inicio OR ca.fecha_inicio<c.fecha_inicio OR ca.fecha_inicio>COALESCE(c.fecha_final_real,c.fecha_final_estimada,c.fecha_finalizacion) OR ca.fecha_fin>COALESCE(c.fecha_final_real,c.fecha_final_estimada,c.fecha_finalizacion) OR ca.fecha_inicio>v.fecha_fin OR (ca.fecha_fin>v.fecha_fin AND ca.id<>1203) LIMIT 1`)).rowCount,'CANDIDATE_CONTRADICTION');
 requireScoped(!(await db.query(`SELECT 1 FROM cobertura_asignaciones a JOIN cobertura_asignaciones b ON a.id<b.id AND a.contrato_id=b.contrato_id AND a.vinculacion_id=b.vinculacion_id AND a.focalizacion_final_id IS NOT DISTINCT FROM b.focalizacion_final_id AND a.fecha_inicio=b.fecha_inicio AND a.fecha_fin IS NOT DISTINCT FROM b.fecha_fin AND a.activo IS NOT DISTINCT FROM b.activo WHERE NOT (a.activo IS FALSE AND b.activo IS FALSE AND a.id=ANY($1::bigint[]) AND b.id=ANY($1::bigint[])) LIMIT 1`,[operational.archives.map(r=>r.id)])).rowCount,'CANDIDATE_DUPLICATE');
 requireScoped(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca LEFT JOIN vinculaciones v ON v.id=ca.vinculacion_id LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id LEFT JOIN instituciones i ON i.id=ff.institucion_id LEFT JOIN sedes s ON s.id=ff.sede_id LEFT JOIN modalidades m ON m.id=ff.modalidad_id WHERE ca.contrato_id=24 AND (v.id IS NULL OR i.id IS NULL OR s.id IS NULL OR m.id IS NULL OR i.contrato_id<>24 OR s.institucion_id<>i.id OR s.municipio_id<>ca.municipio_id) LIMIT 1`)).rowCount,'CANDIDATE_REFERENCE_INVALID');
 const projected:ScopedDb={query:((sql:any,values?:any)=>{let text=String(sql);if(text.includes('SELECT ca.*,ca.id::text,ca.fecha_inicio::text desde'))text=text.replace('SELECT ca.*,','SELECT ca.*,ff.institucion_id,ff.sede_id,ff.modalidad_id,').replace(/FROM cobertura_asignaciones ca(?=\s+WHERE)/,'FROM cobertura_asignaciones ca LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id');return db.query(text,values);}) as ScopedDb['query']};
 const plan=await historicalPlan(projected);requireScoped(plan.every(p=>!p.applied)&&plan[0]?.category_id==='34'&&plan[1]?.category_id===null,'HISTORICAL_PLAN_CHANGED');
 const periods=(await db.query('SELECT to_jsonb(p) row FROM nomina_periodos p WHERE id IN(4,6) AND contrato_id=24 ORDER BY id')).rows;
 requireScoped(periods.length===2&&periods.every(r=>r.row.estado==='ANULADO'),'PERIODS_4_6_CHANGED');
 const salary_preview=[];
 for(const rule of SALARY_DECISION.rows){const ca=coverage.find(r=>String(r.id)===rule.id);if(!ca)continue;
  const employees=(await db.query('SELECT id::text id,categoria_salarial_id::text category_id FROM nomina_empleados WHERE vinculacion_id=$1 ORDER BY id',[ca.vinculacion_id])).rows;
  requireScoped(employees.length>0&&employees.every(r=>r.category_id===rule.category_id),'SALARY_CATEGORY_CHANGED:'+rule.id);
  salary_preview.push({...rule,estado_salarial:rule.requires_salary_review?'REQUIERE_REVISION_SALARIAL':'COMPATIBLE',economic_authorization:false,origin_attribution:'INDIRECT_AUDIT_CORRELATED',employee_ids:employees.map(r=>r.id)});
 }
 for(const id of ['1280','1281','1282','1283','1284','1285','1286']){const ca=coverage.find(r=>String(r.id)===id);if(!ca)continue;
  const employees=(await db.query('SELECT id::text id,categoria_salarial_id::text category_id FROM nomina_empleados WHERE vinculacion_id=$1 ORDER BY id',[ca.vinculacion_id])).rows;
  const missing=employees.length===0||employees.some(r=>r.category_id===null);
  salary_preview.push({id,category_ids:employees.map(r=>r.category_id),employee_ids:employees.map(r=>r.id),requires_salary_review:missing,estado_salarial:missing?'REQUIERE_REVISION_SALARIAL':'CATEGORIA_REGISTRADA_NO_RECLASIFICADA',economic_authorization:false});
 }
 const candidate_ids=sortScopedIds(candidates.map(c=>c.id));
 const set:ScopedSet={candidate_count:candidate_ids.length,candidate_ids,candidate_ids_digest:scopedDigest(candidate_ids),phase48_candidates_digest:scopedDigest(candidates),source_digest:scopedDigest(data),write_set_before_digest:scopedDigest(data.find(r=>r.table==='cobertura_asignaciones')),critical_schema_digest:scopedDigest(Object.fromEntries(Object.entries(inventory).filter(([k])=>!['functions','triggers','managed_events','trigger_pseudorecords'].includes(k)))),critical_definition_digest:scopedDigest({functions:inventory.functions,triggers:inventory.triggers,managed_events:inventory.managed_events,trigger_pseudorecords:inventory.trigger_pseudorecords}),critical_sequences_digest:scopedDigest(sequences),manifest_digest:scopedDigest({...manifest,exclusions:[]}),salary_decision_digest:scopedDigest(SALARY_DECISION),albeny_digest:scopedDigest(plan[0]),dary_digest:scopedDigest(plan[1]),periods_4_6_digest:scopedDigest(periods)};
 // Excluded data and definitions are measurable but absent from blocking hashes.
 const informational=lockedManifest?{global_schema_digest:'NOT_SAMPLED_UNDER_MUTATOR_LOCKS',excluded_digest:'NOT_SAMPLED_UNDER_MUTATOR_LOCKS'}:await scopedInformational(db,manifest);
 set.manifest_digest=scopedDigest({manifest:{...manifest,exclusions:[]},operational_certificate:OPERATIONAL_CERTIFICATE});
 return {set,manifest,inventory,data,sequences,candidates,coverage,plan,salary_preview,operational,informational_global_digest:informational.global_schema_digest,informational_excluded_digest:informational.excluded_digest};
}
