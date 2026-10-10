import {contractDigest,canonical} from './phase48-readonly-contract';
import {SCHEMA_SCOPE} from './phase48-readonly-schema-scope';
import {collectSchemaForensic} from './phase48-readonly-schema-catalog';
export const SCHEMA_IDENTITY_VERSION='phase48-critical-schema-v1';
export const EXPECTED_CRITICAL_SCHEMA_DIGEST='b2721653fcb198b17c91d27e454c526fedc99a8e71e9d3e28f4c8e2f8e34d98a';
const tables=new Set<string>(SCHEMA_SCOPE.critical_relations),functions=new Set<string>(SCHEMA_SCOPE.critical_functions);
const key=(row:any)=>[row.schema,row.relation??'',row.name??'',row.reference_schema??'',row.reference_relation??''].join('.');
const stable=(rows:any[])=>rows.sort((a,b)=>{const x=JSON.stringify(canonical(a)),y=JSON.stringify(canonical(b));return x<y?-1:x>y?1:0;});
export function criticalSchema(inventory:Record<string,any[]>){
 const positions=new Map((inventory.columns??[]).map(c=>[c.schema+'.'+c.relation+'.'+c.position,c.name]));
 const sequenceNames=new Set((inventory.sequences??[]).filter(s=>s.owner_schema==='public'&&tables.has(s.owner_relation)).map(s=>s.name));
 const columnNames=(schema:string,table:string,positionsText:string|null)=>{
  if(!positionsText)return null;
  return positionsText.slice(1,-1).split(',').filter(Boolean).map(position=>{if(position==='0')return '<expression-pinned-by-definition>';const name=positions.get(schema+'.'+table+'.'+position);if(!name)throw Error('READ_SCHEMA_COLUMN_REFERENCE_UNRESOLVED');return name;});
 };
 const projection:Record<string,any[]>={};
 for(const kind of ['relations','columns','constraints','indexes','functions','triggers','sequences','views','view_dependencies','privileges','types']){
  const seen=new Set<string>();
  projection[kind]=stable((inventory[kind]??[]).filter(r=>{
   if(kind==='functions')return r.schema==='public'&&functions.has(r.name);
   if(kind==='sequences')return r.schema==='public'&&sequenceNames.has(r.name);
   if(kind==='types')return false; // No custom types in the certified scope.
   return r.schema==='public'&&(tables.has(r.relation??r.name)||kind==='relations'&&sequenceNames.has(r.name));
  }).map(row=>{
   const r={...row};
   const identifier=key(r);if(seen.has(identifier))throw Error('READ_SCHEMA_DUPLICATE_OBJECT');seen.add(identifier);
   if(kind==='columns'){
    delete r.position;
    if((inventory.types??[]).some(t=>r.type===t.name||r.type==='public.'+t.name))throw Error('READ_SCHEMA_CUSTOM_TYPE_UNCERTIFIED');
   }
   if(kind==='relations')delete r.acl_hash; // Restore omits ACL; effective required capabilities are pinned separately.
   if(kind==='constraints'){
    r.columns=columnNames(r.schema,r.relation,r.column_positions);r.reference_columns=columnNames(r.reference_schema,r.reference_relation,r.reference_positions);
    delete r.column_positions;delete r.reference_positions;
   }
   const equivalenceKey=kind+':'+r.schema+'.'+(r.relation?r.relation+'.':'')+r.name+':definition';
   const equivalents=(SCHEMA_SCOPE.cast_equivalences as Record<string,readonly string[]>)[equivalenceKey];
   if(equivalents?.includes(r.definition))r.definition=equivalents[0];
   return r;
  }));
 }
 for(const table of tables)if(!projection.relations!.some(r=>r.name===table))throw Error('READ_SCHEMA_CRITICAL_OBJECT_MISSING');
 for(const fn of functions)if(!projection.functions!.some(r=>r.name===fn))throw Error('READ_SCHEMA_CRITICAL_FUNCTION_MISSING');
 return {schema_identity_version:SCHEMA_IDENTITY_VERSION,scope:SCHEMA_SCOPE.critical_relations,functions:SCHEMA_SCOPE.critical_functions,objects:projection};
}
export const criticalSchemaDigest=(inventory:Record<string,any[]>)=>contractDigest(criticalSchema(inventory));
export function validateCriticalSchema(inventory:Record<string,any[]>,globalDigest:string){
 const observed=criticalSchemaDigest(inventory);
 if(observed!==EXPECTED_CRITICAL_SCHEMA_DIGEST)throw Object.assign(Error('READ_SCHEMA_IDENTITY_MISMATCH'),{expected_schema_digest:EXPECTED_CRITICAL_SCHEMA_DIGEST,observed_schema_digest:observed,canonicalization_version:SCHEMA_IDENTITY_VERSION,schema_identity_version:SCHEMA_IDENTITY_VERSION,schema_divergence_phase:'server_identity.critical_schema',observed_global_schema_digest:globalDigest});
 return {schema_identity_version:SCHEMA_IDENTITY_VERSION,expected_schema_digest:EXPECTED_CRITICAL_SCHEMA_DIGEST,observed_schema_digest:observed,global_schema_digest:globalDigest,schema_matches:true};
}
export async function assertCriticalSchema(db:{query:(sql:string)=>Promise<{rows:any[]}>}){const metadata=await collectSchemaForensic(db);return validateCriticalSchema(metadata.inventory,metadata.global_digest);}
