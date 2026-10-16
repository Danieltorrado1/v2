import {createHash} from 'node:crypto';
import {normalizeSha256Hex,sha256HexEqual} from './phase48-sha256';

export const GRAPH_SERIALIZATION_VERSION='phase48-managed-dependency-graph-v1' as const;
export interface DurableNode {
 catalog_class:string;namespace:string|null;object_type:string;structural_identity:string;
 extension_identity:string|null;owner_class:string|null;owner_sha256:string|null;normalized_definition_sha256:string|null;
}
export interface DurableEdge {
 from:DurableNode;to:DurableNode;deptype:string;direction:string;
 relation:{catalog:string;source_subobject:string|null;target_subobject:string|null};
}
export interface GraphEvidence {
 graph_serialization_version:typeof GRAPH_SERIALIZATION_VERSION;node_count:number;edge_count:number;
 dependency_nodes_digest:string;dependency_edges_digest:string;root_digests:Record<string,string>;query_manifest_digest:string;
}
const fail=(ok:unknown,field:string):void=>{if(!ok)throw Object.assign(Error('GRAPH_INVALID:'+field),{code:'GRAPH_INVALID:'+field});};
const object=(value:unknown,field:string):Record<string,unknown>=>{fail(value!==null&&typeof value==='object'&&!Array.isArray(value),field);return value as Record<string,unknown>;};
const text=(value:unknown,field:string,empty=false):string=>{
 fail(typeof value==='string'&&(empty||value.length>0)&&!value.includes('\0')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),field);return value as string;
};
const nullableText=(value:unknown,field:string):string|null=>value===null?null:text(value,field,true);
const nullableHash=(value:unknown):string|null=>value===null?null:normalizeSha256Hex(value);

/** Select only the eight durable fields, in this exact key order. Undefined is
 * rejected even where explicit null is allowed. Session metadata is ignored. */
export function durableNode(value:unknown):DurableNode {
 const n=object(value,'node');
 const result:DurableNode={catalog_class:text(n.catalog_class,'catalog_class'),namespace:nullableText(n.namespace,'namespace'),object_type:text(n.object_type,'object_type'),structural_identity:text(n.structural_identity,'structural_identity'),extension_identity:nullableText(n.extension_identity,'extension_identity'),owner_class:n.owner_class===null?null:text(n.owner_class,'owner_class'),owner_sha256:nullableHash(n.owner_sha256),normalized_definition_sha256:nullableHash(n.normalized_definition_sha256)};
 fail(/^pg_catalog\.pg_[a-z_]+$/.test(result.catalog_class),'catalog_class');
 const hasOwner=result.owner_class!==null,hasOwnerBytes=typeof result.owner_sha256==='string';
 fail(hasOwner===hasOwnerBytes,'owner_pair');
 return result;
}
export function durableEdge(value:unknown):DurableEdge {
 const e=object(value,'edge'),r=object(e.relation,'relation');
 const result:DurableEdge={from:durableNode(e.from),to:durableNode(e.to),deptype:text(e.deptype,'deptype'),direction:text(e.direction,'direction'),relation:{catalog:text(r.catalog,'relation.catalog'),source_subobject:nullableText(r.source_subobject,'relation.source_subobject'),target_subobject:nullableText(r.target_subobject,'relation.target_subobject')}};
 fail(result.relation.catalog==='pg_catalog.pg_depend','relation.catalog');
 fail(/^[naxiesp]$/.test(result.deptype),'deptype');
 fail(result.direction==='referenced'||result.direction==='dependent','direction');
 return result;
}
const cmpText=(a:string,b:string)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
const cmpNullable=(a:string|null,b:string|null)=>a===null?(b===null?0:-1):b===null?1:cmpText(a,b);
// Compare every durable field explicitly; never use localeCompare or query order.
export const compareDurableNodes=(a:DurableNode,b:DurableNode):number=>cmpText(a.catalog_class,b.catalog_class)||cmpNullable(a.namespace,b.namespace)||cmpText(a.object_type,b.object_type)||cmpText(a.structural_identity,b.structural_identity)||cmpNullable(a.extension_identity,b.extension_identity)||cmpNullable(a.owner_class,b.owner_class)||cmpNullable(a.owner_sha256,b.owner_sha256)||cmpNullable(a.normalized_definition_sha256,b.normalized_definition_sha256);
export const compareDurableEdges=(a:DurableEdge,b:DurableEdge):number=>compareDurableNodes(a.from,b.from)||compareDurableNodes(a.to,b.to)||cmpText(a.deptype,b.deptype)||cmpText(a.direction,b.direction)||cmpText(a.relation.catalog,b.relation.catalog)||cmpNullable(a.relation.source_subobject,b.relation.source_subobject)||cmpNullable(a.relation.target_subobject,b.relation.target_subobject);
const identityKey=(n:DurableNode)=>JSON.stringify([n.catalog_class,n.namespace,n.object_type,n.structural_identity]);
const digest=(domain:string,json:string)=>createHash('sha256').update(GRAPH_SERIALIZATION_VERSION+':'+domain+'\0','utf8').update(json,'utf8').digest('hex');

/** Pure canonical JSON, UTF-8, no whitespace, fixed keys. No session values or
 * traversal diagnostics enter either payload. Duplicate identities fail closed. */
export function serializeDependencyGraph(nodes:readonly unknown[],edges:readonly unknown[],version:string=GRAPH_SERIALIZATION_VERSION){
 fail(version===GRAPH_SERIALIZATION_VERSION,'graph_serialization_version');
 const ns=nodes.map(durableNode).sort(compareDurableNodes),es=edges.map(durableEdge).sort(compareDurableEdges);
 const identities=new Set<string>(),inventory=new Set<string>();
 for(const n of ns){const key=identityKey(n);fail(!identities.has(key),'duplicate_node:'+key);identities.add(key);inventory.add(JSON.stringify(n));}
 let previous:DurableEdge|undefined;
 for(const e of es){
  fail(!previous||compareDurableEdges(previous,e)!==0,'duplicate_edge');previous=e;
  fail(inventory.has(JSON.stringify(e.from))&&inventory.has(JSON.stringify(e.to)),'edge_endpoint_not_in_inventory');
 }
 const nodes_json=JSON.stringify({graph_serialization_version:version,nodes:ns});
 const edges_json=JSON.stringify({graph_serialization_version:version,edges:es});
 return {graph_serialization_version:GRAPH_SERIALIZATION_VERSION,node_count:ns.length,edge_count:es.length,nodes:ns,edges:es,nodes_json,edges_json,dependency_nodes_digest:digest('dependency_nodes_digest',nodes_json),dependency_edges_digest:digest('dependency_edges_digest',edges_json)};
}

/** Public summary parser and comparison boundary. Invalid SHA formats retain the
 * strict helper error; mismatches identify the particular evidence field. */
export function validateGraphEvidence(value:unknown,expected?:unknown):GraphEvidence {
 const v=object(value,'evidence');fail(v.graph_serialization_version===GRAPH_SERIALIZATION_VERSION,'graph_serialization_version');
 const count=(key:string)=>{fail(Number.isSafeInteger(v[key])&&Number(v[key])>=0,key);return v[key] as number;};
 const roots=object(v.root_digests,'root_digests');fail(Object.keys(roots).length===2&&Object.hasOwn(roots,'extensions.pgrst_ddl_watch')&&Object.hasOwn(roots,'extensions.pgrst_drop_watch'),'root_digests');
 const result:GraphEvidence={graph_serialization_version:GRAPH_SERIALIZATION_VERSION,node_count:count('node_count'),edge_count:count('edge_count'),dependency_nodes_digest:normalizeSha256Hex(v.dependency_nodes_digest),dependency_edges_digest:normalizeSha256Hex(v.dependency_edges_digest),root_digests:Object.fromEntries(Object.keys(roots).sort(cmpText).map(key=>[key,normalizeSha256Hex(roots[key])])),query_manifest_digest:normalizeSha256Hex(v.query_manifest_digest)};
 if(expected!==undefined){
  const other=validateGraphEvidence(expected);
  fail(result.node_count===other.node_count,'node_count');fail(result.edge_count===other.edge_count,'edge_count');
  for(const key of ['dependency_nodes_digest','dependency_edges_digest','query_manifest_digest'] as const)fail(sha256HexEqual(result[key],other[key]),key);
  for(const key of Object.keys(result.root_digests))fail(sha256HexEqual(result.root_digests[key],other.root_digests[key]),'root_digests:'+key);
 }
 return result;
}

/** Validate a local detailed certificate against freshly reconstructed digests. */
export function validateGraphInventory(value:unknown,expected?:unknown):GraphEvidence {
 const v=object(value,'inventory');fail(Array.isArray(v.nodes)&&Array.isArray(v.edges),'inventory_arrays');
 const computed=serializeDependencyGraph(v.nodes as unknown[],v.edges as unknown[],text(v.graph_serialization_version,'graph_serialization_version'));
 const summary=validateGraphEvidence(v,{...computed,root_digests:v.root_digests,query_manifest_digest:v.query_manifest_digest});
 if(expected!==undefined)validateGraphEvidence(summary,expected);
 return summary;
}
