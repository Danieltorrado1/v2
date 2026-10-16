import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRAPH_SERIALIZATION_VERSION,serializeDependencyGraph,validateGraphEvidence,validateGraphInventory,type DurableNode,type DurableEdge} from '../modules/cobertura/phase48-managed-dependency-graph';
import {sha256HexEqual} from '../modules/cobertura/phase48-sha256';
import {auditManagedDependencyGraph,MANAGED_AUDIT_QUERY_MANIFEST,type ManagedAuditClient} from '../modules/cobertura/phase48-managed-dependency-audit';
import ts from 'typescript';

const node=(identity='extensions.ñ()'):DurableNode=>({catalog_class:'pg_catalog.pg_proc',namespace:'extensions',object_type:'function',structural_identity:identity,extension_identity:null,owner_class:null,owner_sha256:null,normalized_definition_sha256:null});
const edge=(from:DurableNode,to:DurableNode):DurableEdge=>({from,to,deptype:'n',direction:'referenced',relation:{catalog:'pg_catalog.pg_depend',source_subobject:null,target_subobject:null}});
const roots={'extensions.pgrst_ddl_watch':'a'.repeat(64),'extensions.pgrst_drop_watch':'b'.repeat(64)};
const evidence=(n:DurableNode[],e:DurableEdge[])=>({...serializeDependencyGraph(n,e),root_digests:roots,query_manifest_digest:'c'.repeat(64)});
const same=(a:unknown,b:unknown)=>assert.ok(sha256HexEqual(a,b));
const different=(a:unknown,b:unknown)=>assert.ok(!sha256HexEqual(a,b));

test('graph serializer imports only crypto and strict SHA helper and has inert initialization',()=>{
 const audit=(text:string)=>{
  const ast=ts.createSourceFile('graph.ts',text,ts.ScriptTarget.Latest,true);
  for(const statement of ast.statements){
   if(ts.isImportDeclaration(statement))assert.ok(['node:crypto','./phase48-sha256'].includes((statement.moduleSpecifier as ts.StringLiteral).text));
   else if(ts.isVariableStatement(statement))for(const item of statement.declarationList.declarations)assert.ok(item.initializer&&(ts.isArrowFunction(item.initializer)||ts.isStringLiteral(item.initializer)||ts.isAsExpression(item.initializer)&&ts.isStringLiteral(item.initializer.expression)));
   else assert.ok(ts.isFunctionDeclaration(statement)||ts.isInterfaceDeclaration(statement));
  }
  const visit=(n:ts.Node)=>{
   if(ts.isCallExpression(n))assert.ok(n.expression.kind!==ts.SyntaxKind.ImportKeyword&&!['require','eval','Function','fetch'].includes(n.expression.getText(ast)));
   if(ts.isIdentifier(n))assert.notEqual(n.text,'process');
   ts.forEachChild(n,visit);
  };visit(ast);
 };
 const source=readFileSync('src/modules/cobertura/phase48-managed-dependency-graph.ts','utf8');audit(source);
 for(const altered of [source+'\nfetch("https://invalid");',"import fs from 'node:fs';\n"+source,source+'\nprocess.env.SECRET;'])assert.throws(()=>audit(altered));
});

test('fixed v1 canonical UTF-8 bytes and domain-separated SHA vectors',()=>{
 const vectors=JSON.parse(readFileSync('src/tests/fixtures/phase48-managed-graph-v1-vectors.json','utf8'));
 for(const vector of vectors){
  const result=serializeDependencyGraph(vector.nodes,vector.edges);
  assert.equal(result.nodes_json,vector.nodes_json);assert.equal(result.edges_json,vector.edges_json);
  assert.deepEqual(Buffer.from(result.nodes_json,'utf8'),Buffer.from(vector.nodes_utf8_hex,'hex'));
  assert.deepEqual(Buffer.from(result.edges_json,'utf8'),Buffer.from(vector.edges_utf8_hex,'hex'));
  same(result.dependency_nodes_digest,vector.dependency_nodes_digest);same(result.dependency_edges_digest,vector.dependency_edges_digest);
  different(result.dependency_nodes_digest,result.dependency_edges_digest);
 }
});

test('all query and property orders produce identical canonical bytes and digests',()=>{
 const a=node(),b=node('extensions.z(integer)'),e=edge(a,b),f=edge(b,a);
 const first=serializeDependencyGraph([a,b],[e,f]);
 const reorder=(x:object)=>Object.fromEntries(Object.entries(x).reverse());
 const second=serializeDependencyGraph([reorder(b),reorder(a)],[reorder(f),reorder(e)]);
 assert.equal(first.nodes_json,second.nodes_json);assert.equal(first.edges_json,second.edges_json);
 same(first.dependency_nodes_digest,second.dependency_nodes_digest);same(first.dependency_edges_digest,second.dependency_edges_digest);
});

test('every durable node field changes nodes digest; null and empty remain distinct',()=>{
 const a=node(),original=serializeDependencyGraph([a],[]);
 const changes=[{catalog_class:'pg_catalog.pg_type'},{namespace:null},{namespace:''},{object_type:'type'},{structural_identity:'extensions.Ñ()'},{extension_identity:''},{extension_identity:'plpgsql'},{owner_class:'role',owner_sha256:'a'.repeat(64)},{normalized_definition_sha256:'f'.repeat(64)}];
 for(const change of changes)different(original.dependency_nodes_digest,serializeDependencyGraph([{...a,...change}],[]).dependency_nodes_digest);
 different(serializeDependencyGraph([{...a,namespace:null}],[]).dependency_nodes_digest,serializeDependencyGraph([{...a,namespace:''}],[]).dependency_nodes_digest);
 assert.throws(()=>serializeDependencyGraph([{...a,namespace:undefined}],[]),/namespace/);
});

test('Unicode stays exact UTF-8 without locale ordering or normalization',()=>{
 const a=node('extensions.é()'),b=node('extensions.e\u0301()');
 different(serializeDependencyGraph([a],[]).dependency_nodes_digest,serializeDependencyGraph([b],[]).dependency_nodes_digest);
 assert.equal(serializeDependencyGraph([node('extensions.猫()')],[]).nodes_json.includes('猫'),true);
 assert.throws(()=>serializeDependencyGraph([node('\uD800')],[]),/structural_identity/);
});

test('each edge field and its full endpoint identity affect edges digest',()=>{
 const a=node(),b=node('extensions.b()'),c={...b,namespace:'different'},e=edge(a,b),base=serializeDependencyGraph([a,b],[e]);
 for(const change of [{deptype:'a'},{direction:'dependent'},{relation:{...e.relation,source_subobject:'extensions.ñ.column'}},{relation:{...e.relation,target_subobject:''}}])different(base.dependency_edges_digest,serializeDependencyGraph([a,b],[{...e,...change}]).dependency_edges_digest);
 different(base.dependency_edges_digest,serializeDependencyGraph([a,c],[edge(a,c)]).dependency_edges_digest);
 different(base.dependency_edges_digest,serializeDependencyGraph([a,b],[edge(b,a)]).dependency_edges_digest);
});

test('additional or missing nodes and edges affect their global digests',()=>{
 const a=node(),b=node('extensions.b()'),e=edge(a,b),base=serializeDependencyGraph([a,b],[e]);
 different(base.dependency_nodes_digest,serializeDependencyGraph([a,b,node('extensions.c()')],[e]).dependency_nodes_digest);
 different(base.dependency_nodes_digest,serializeDependencyGraph([a],[]).dependency_nodes_digest);
 different(base.dependency_edges_digest,serializeDependencyGraph([a,b],[e,edge(b,a)]).dependency_edges_digest);
 different(base.dependency_edges_digest,serializeDependencyGraph([a,b],[]).dependency_edges_digest);
});

test('duplicate canonical identities and edges fail, including conflicting metadata',()=>{
 const a=node(),b=node('extensions.b()'),e=edge(a,b);
 assert.throws(()=>serializeDependencyGraph([a,{...a}],[]),/duplicate_node/);
 assert.throws(()=>serializeDependencyGraph([a,{...a,extension_identity:'changed'}],[]),/duplicate_node/);
 assert.throws(()=>serializeDependencyGraph([a,b],[e,{...e}]),/duplicate_edge/);
});

test('session OID, PID, timestamp and traversal metadata never enter payloads',()=>{
 const a=node(),e=edge(a,a),base=serializeDependencyGraph([a],[e]);
 const modified=serializeDependencyGraph([{...a,oid:123,pid:456,timestamp:'2026-01-01',depth:4,cycle:true}],[{...e,oid:999,pid:42,timestamp:'other',depth:12,cycle:false}]);
 assert.equal(base.nodes_json,modified.nodes_json);assert.equal(base.edges_json,modified.edges_json);
 same(base.dependency_nodes_digest,modified.dependency_nodes_digest);same(base.dependency_edges_digest,modified.dependency_edges_digest);
});

test('incomplete identities, missing endpoints, malformed SHA and other versions fail',()=>{
 const a=node();
 for(const key of Object.keys(a)){const missing={...a} as Record<string,unknown>;delete missing[key];assert.throws(()=>serializeDependencyGraph([missing],[]));}
 assert.throws(()=>serializeDependencyGraph([{...a,structural_identity:''}],[]),/structural_identity/);
 assert.throws(()=>serializeDependencyGraph([{...a,owner_class:'role'}],[]),/owner_pair/);
 assert.throws(()=>serializeDependencyGraph([{...a,normalized_definition_sha256:'f'.repeat(63)}],[]),/SHA256_FORMAT_INVALID/);
 assert.throws(()=>serializeDependencyGraph([a],[edge(a,node('missing'))]),/edge_endpoint_not_in_inventory/);
 assert.throws(()=>serializeDependencyGraph([a],[{...edge(a,a),from:undefined}]),/node/);
 assert.throws(()=>serializeDependencyGraph([a],[],'phase48-managed-dependency-graph-v2'),/graph_serialization_version/);
});

test('summary parser and evidence comparison require both digests, roots, counts and version',()=>{
 const a=node(),good=evidence([a],[edge(a,a)]);
 assert.equal(validateGraphEvidence(good).graph_serialization_version,GRAPH_SERIALIZATION_VERSION);
 validateGraphInventory(JSON.parse(JSON.stringify(good)),good);
 for(const key of ['dependency_nodes_digest','dependency_edges_digest','query_manifest_digest']){
  for(const replacement of [undefined,'a'.repeat(63),'g'.repeat(64)])assert.throws(()=>validateGraphEvidence({...good,[key]:replacement}),/SHA256_FORMAT_INVALID/);
  assert.throws(()=>validateGraphEvidence({...good,[key]:'0'.repeat(64)},good),new RegExp(key));
 }
 assert.throws(()=>validateGraphEvidence({...good,root_digests:{}}),/root_digests/);
 assert.throws(()=>validateGraphEvidence({...good,node_count:-1}),/node_count/);
 assert.throws(()=>validateGraphEvidence({...good,node_count:2},good),/node_count/);
 assert.throws(()=>validateGraphEvidence({...good,graph_serialization_version:'v2'}),/graph_serialization_version/);
 assert.throws(()=>validateGraphInventory({...good,nodes:[{...a,namespace:'tampered'}]}),/edge_endpoint_not_in_inventory/);
 assert.throws(()=>validateGraphInventory({...good,dependency_nodes_digest:'0'.repeat(64)}),/dependency_nodes_digest/);
});

test('executed audit rejects missing or changed expected evidence and always rolls back and closes',async()=>{
 const make=()=>{
  const calls:string[]=[];
  const client:ManagedAuditClient={async connect(){calls.push('connect');},async end(){calls.push('end');},async query(sql){
   calls.push(sql);
   if(sql===MANAGED_AUDIT_QUERY_MANIFEST[0]!.sql)return {rows:[{server_version:'PostgreSQL 17.11',backend_pid:1,snapshot:'1:1:',read_only:'on',isolation:'repeatable read'}],rowCount:1};
   if(sql===MANAGED_AUDIT_QUERY_MANIFEST[1]!.sql)return {rows:[{match_count:1,virtualxid:'1/1'}],rowCount:1};
   if(sql===MANAGED_AUDIT_QUERY_MANIFEST[2]!.sql)return {rows:[{function_schema:'extensions',function_name:'pgrst_ddl_watch'},{function_schema:'extensions',function_name:'pgrst_drop_watch'}],rowCount:2};
   return {rows:[],rowCount:0};
  }};return {client,calls};
 };
 const good=await auditManagedDependencyGraph(make().client);
 validateGraphInventory(good);
 for(const change of [{dependency_nodes_digest:undefined},{dependency_edges_digest:'bad'},{dependency_nodes_digest:'0'.repeat(64)},{dependency_edges_digest:'0'.repeat(64)},{graph_serialization_version:'v2'}]){
  const fixture=make();
  await assert.rejects(auditManagedDependencyGraph(fixture.client,{expectedGraphEvidence:{...good,...change}}),(error:any)=>error.message==='MANAGED_AUDIT_OPERATION_FAILED'&&/SHA256_FORMAT_INVALID|GRAPH_INVALID/.test(error.cause.message));
  assert.deepEqual(fixture.calls.slice(-2),['ROLLBACK','end']);
 }
});
