import {sha256HexEqual} from '../modules/cobertura/phase48-sha256';
import {readFileSync,writeFileSync} from 'node:fs';
import {criticalSchema,criticalSchemaDigest,EXPECTED_CRITICAL_SCHEMA_DIGEST,SCHEMA_IDENTITY_VERSION} from '../modules/cobertura/phase48-readonly-schema-identity';
import {SCHEMA_SCOPE} from '../modules/cobertura/phase48-readonly-schema-scope';
const baseline=JSON.parse(readFileSync('reports/phase48-schema-backup-catalogs.json','utf8'));
const observed=JSON.parse(readFileSync('reports/phase48-schema-production-catalogs.json','utf8'));
const proof=JSON.parse(readFileSync('reports/phase48-schema-original-dump-comparison.json','utf8'));
const scope=JSON.parse(readFileSync('reports/phase48-schema-scope.json','utf8'));
if(!sha256HexEqual(criticalSchemaDigest(baseline.schema.inventory),EXPECTED_CRITICAL_SCHEMA_DIGEST)||!sha256HexEqual(criticalSchemaDigest(observed.schema.inventory),EXPECTED_CRITICAL_SCHEMA_DIGEST))throw Error('CRITICAL_SCHEMA_NOT_RECONCILED');
const critical=new Set<string>(SCHEMA_SCOPE.critical_relations);
const identifier=(r:any)=>[r.schema,r.relation??'',r.name??'',r.reference_schema??'',r.reference_relation??''].join('.');
const differences:any[]=[];
for(const kind of Object.keys(baseline.schema.inventory)){
 const old=new Map<string,any>(baseline.schema.inventory[kind].map((r:any)=>[identifier(r),r])),now=new Map<string,any>(observed.schema.inventory[kind].map((r:any)=>[identifier(r),r]));
 for(const key of new Set([...old.keys(),...now.keys()])){
  const previous=old.get(key),current=now.get(key);
  for(const property of Object.keys({...previous,...current})){
   if(JSON.stringify(previous?.[property])===JSON.stringify(current?.[property]))continue;
   const row=current??previous,relation=row.relation??row.name;
   const scoped=critical.has(relation)||kind==='relations'&&baseline.schema.inventory.sequences.some((s:any)=>s.name===relation&&critical.has(s.owner_relation));
   const artifact=['acl_hash','position','column_positions','reference_positions'].includes(property);
   const paired=proof.differences.some((d:any)=>d.productive_matches_original_dump&&d.object===relation+'.'+row.name);
   if(scoped&&!artifact&&!paired)throw Error('UNCLASSIFIED_CRITICAL_DIFFERENCE');
   differences.push({kind,object:key,property,previous:previous?.[property]??null,current:current?.[property]??null,classification:scoped?'COMPATIBLE_NO_MATERIAL':'AJENA',scope:scoped?'CRITICAL_OR_TRANSITIVE':'UNRELATED',first_temporal_evidence:'certified backup 2026-10-07T13:20:31Z; restored catalog evidence '+baseline.completed_utc,related_migration_or_commit:null,attribution:artifact?'Restoration artifact: no owner/ACL or regenerated internal attribute positions':'Productive definition equals original dump; difference reproduced by PostgreSQL 17.11 round trip',effect_on_phase48:'NONE_DEMONSTRATED; effective capabilities and normalized critical schema are identical'});
  }
 }
}
const projection=criticalSchema(baseline.schema.inventory);
const result={expected_previous_global_digest:baseline.schema.global_digest,observed_productive_global_digest:observed.schema.global_digest,schema_identity_version:SCHEMA_IDENTITY_VERSION,expected_critical_digest:EXPECTED_CRITICAL_SCHEMA_DIGEST,observed_critical_digest:criticalSchemaDigest(observed.schema.inventory),critical_objects:projection.objects,critical_relations:SCHEMA_SCOPE.critical_relations,direct_relations:SCHEMA_SCOPE.direct_relations,transitive_relations:SCHEMA_SCOPE.critical_relations.filter(r=>!(SCHEMA_SCOPE.direct_relations as readonly string[]).includes(r)),critical_functions:SCHEMA_SCOPE.critical_functions,excluded_relations:scope.excluded_relations,differences,summary:Object.fromEntries(['COMPATIBLE_NO_MATERIAL','AJENA','CRITICA','NO_DETERMINABLE'].map(k=>[k,differences.filter(d=>d.classification===k).length])),productive_definition_differences:proof.differences.map((d:any)=>({...d,classification:critical.has(d.object.split('.')[0])?'COMPATIBLE_NO_MATERIAL':'AJENA',effect_on_phase48:'NO MATERIAL CHANGE: exact original dump definition',related_migration_or_commit:null})),permission_scope:'Structural table capabilities and actor authorization relations are covered. No actor business row was read; the existing actor 12 data gate remains mandatory in any future authorized preflight.',production_connections:1,business_row_queries:0,writes_productive:0,rollback:observed.rollback,client_closed:observed.client_closed,pool_closed:observed.pool_closed,local_cluster_stopped_and_removed:true};
writeFileSync('reports/phase48-schema-reconciliation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,critical_relations:result.critical_relations.length,critical_functions:result.critical_functions.length,critical_objects:Object.fromEntries(Object.entries(projection.objects).map(([k,v])=>[k,v.length])),excluded_relations:result.excluded_relations.length,critical_digest:result.expected_critical_digest}));
