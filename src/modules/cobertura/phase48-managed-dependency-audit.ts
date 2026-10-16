import {createHash} from 'node:crypto';
import {sha256HexEqual} from './phase48-sha256';
import {durableNode,serializeDependencyGraph,validateGraphInventory,type DurableNode,type DurableEdge,type GraphEvidence} from './phase48-managed-dependency-graph';

/** Dedicated catalog-only event-trigger dependency audit. This module has no
 * dependency on Phase 48 capture, business repositories, or mutation code. */
export const MANAGED_AUDIT_ROOTS = Object.freeze([
  Object.freeze({schema:'extensions',name:'pgrst_ddl_watch'}),
  Object.freeze({schema:'extensions',name:'pgrst_drop_watch'}),
] as const);

export const MANAGED_AUDIT_CATALOGS = Object.freeze([
  'pg_catalog.pg_event_trigger','pg_catalog.pg_proc','pg_catalog.pg_namespace',
  'pg_catalog.pg_depend','pg_catalog.pg_extension','pg_catalog.pg_class',
  'pg_catalog.pg_type','pg_catalog.pg_rewrite','pg_catalog.pg_language',
  'pg_catalog.pg_operator','pg_catalog.pg_cast','pg_catalog.pg_constraint',
  'pg_catalog.pg_trigger','pg_catalog.pg_collation','pg_catalog.pg_roles',
  'pg_catalog.pg_locks',
] as const);

const virtualTransactionSql = `SELECT count(*)::integer AS match_count,
       min(virtualxid::text) AS virtualxid
FROM pg_catalog.pg_locks
WHERE pid = pg_backend_pid()
  AND locktype = 'virtualxid'
  AND virtualxid IS NOT NULL
  AND granted = true`;

const rootSql = `SELECT e.oid::text AS event_oid, e.evtname AS event_name,
       e.evtevent AS event_type, e.evttags AS event_tags,
       e.evtenabled AS enabled, e.evtowner AS owner_oid,
       owner_role.rolname AS owner_name,
       p.oid::text AS function_oid, n.nspname AS function_schema,
       p.proname AS function_name, p.prokind AS function_kind,
       p.provolatile AS volatility, p.prosecdef AS security_definer,
       p.proconfig AS config, l.lanname AS language,
       pg_catalog.pg_get_functiondef(p.oid) AS definition,
       (SELECT x.extname FROM pg_catalog.pg_depend d
        JOIN pg_catalog.pg_extension x ON x.oid=d.refobjid
        WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass
          AND d.objid=p.oid AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
          AND d.deptype='e' LIMIT 1) AS extension_name
FROM pg_catalog.pg_event_trigger e
JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=e.evtowner
WHERE n.nspname='extensions'
  AND p.proname IN ('pgrst_ddl_watch','pgrst_drop_watch')
ORDER BY p.proname, e.evtname`;

const graphSql = `WITH RECURSIVE roots(classid,objid) AS (
  SELECT 'pg_catalog.pg_event_trigger'::pg_catalog.regclass::oid, e.oid
  FROM pg_catalog.pg_event_trigger e
  JOIN pg_catalog.pg_proc p ON p.oid=e.evtfoid
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='extensions' AND p.proname IN ('pgrst_ddl_watch','pgrst_drop_watch')
  UNION
  SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass::oid, p.oid
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='extensions' AND p.proname IN ('pgrst_ddl_watch','pgrst_drop_watch')
), walk(classid,objid,depth,path,from_classid,from_objid,deptype,direction,cycle) AS (
  SELECT r.classid,r.objid,0,ARRAY[(r.classid::text||':'||r.objid::text)],
         NULL::oid,NULL::oid,NULL::"char",'root'::text,false FROM roots r
  UNION ALL
  SELECT d.refclassid,d.refobjid,w.depth+1,
         w.path||(d.refclassid::text||':'||d.refobjid::text),
         w.classid,w.objid,d.deptype,'referenced'::text,
         (d.refclassid::text||':'||d.refobjid::text)=ANY(w.path)
  FROM walk w
  JOIN pg_catalog.pg_depend d ON d.classid=w.classid AND d.objid=w.objid
  WHERE w.depth < 13 AND NOT w.cycle
), reachable AS (
 SELECT classid,objid,min(depth) AS depth FROM walk GROUP BY classid,objid
), inventory AS (
 SELECT r.classid,r.objid,r.depth,NULL::oid AS from_classid,NULL::oid AS from_objid,
        NULL::text AS deptype,'root'::text AS direction,false AS cycle,
        NULL::text AS source_subobject,NULL::text AS target_subobject,'node'::text AS row_kind
 FROM reachable r
 UNION ALL
 SELECT d.refclassid,d.refobjid,src.depth+1,d.classid,d.objid,d.deptype::text,'referenced',
        EXISTS (SELECT 1 FROM walk w WHERE w.cycle AND w.classid=d.refclassid
          AND w.objid=d.refobjid AND w.from_classid=d.classid AND w.from_objid=d.objid),
        CASE WHEN d.objsubid=0 THEN NULL ELSE (pg_catalog.pg_identify_object(d.classid,d.objid,d.objsubid)).identity END,
        CASE WHEN d.refobjsubid=0 THEN NULL ELSE (pg_catalog.pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)).identity END,'edge'
 FROM pg_catalog.pg_depend d
 JOIN reachable src ON src.classid=d.classid AND src.objid=d.objid
 JOIN reachable dst ON dst.classid=d.refclassid AND dst.objid=d.refobjid
)
SELECT classid::text AS class_oid,objid::text AS object_oid,depth,row_kind,
       from_classid::text AS from_class_oid,from_objid::text AS from_object_oid,
       deptype,direction,cycle,source_subobject,target_subobject,
       classid::regclass::text AS class_catalog,
       (pg_catalog.pg_identify_object(classid,objid,0)).type AS object_type,
       (pg_catalog.pg_identify_object(classid,objid,0)).schema AS namespace,
       (pg_catalog.pg_identify_object(classid,objid,0)).name AS object_name,
       (pg_catalog.pg_identify_object(classid,objid,0)).identity AS identity
FROM inventory
ORDER BY depth,class_oid,object_oid,from_class_oid,from_object_oid,direction,deptype`;

const metadataSql = `SELECT version() AS server_version,
       pg_catalog.pg_backend_pid() AS backend_pid,
       pg_catalog.pg_current_snapshot()::text AS snapshot,
       current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation`;

const nodeDetailsSql = `WITH input AS (
  SELECT class_oid,object_oid FROM pg_catalog.jsonb_to_recordset($1::jsonb)
  AS x(class_oid oid,object_oid oid)
)
SELECT i.class_oid::text AS class_oid,i.object_oid::text AS object_oid,
       ident.type AS object_type,ident.schema AS namespace,ident.name AS object_name,ident.identity,
       owner_role.rolname AS owner_name,extension.extname AS extension_name,
       CASE ident.type
         WHEN 'function' THEN pg_catalog.pg_get_functiondef(i.object_oid)
         WHEN 'view' THEN pg_catalog.pg_get_viewdef(i.object_oid,true)
         WHEN 'materialized view' THEN pg_catalog.pg_get_viewdef(i.object_oid,true)
         WHEN 'constraint' THEN pg_catalog.pg_get_constraintdef(i.object_oid,true)
         WHEN 'trigger' THEN pg_catalog.pg_get_triggerdef(i.object_oid,true)
         ELSE pg_catalog.pg_describe_object(i.class_oid,i.object_oid,0)
       END AS normalized_definition
FROM input i
CROSS JOIN LATERAL pg_catalog.pg_identify_object(i.class_oid,i.object_oid,0) ident
LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=CASE ident.type
  WHEN 'function' THEN (SELECT p.proowner FROM pg_catalog.pg_proc p WHERE p.oid=i.object_oid)
  WHEN 'table' THEN (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid=i.object_oid)
  WHEN 'view' THEN (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid=i.object_oid)
  WHEN 'materialized view' THEN (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid=i.object_oid)
  WHEN 'index' THEN (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid=i.object_oid)
  WHEN 'sequence' THEN (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid=i.object_oid)
  WHEN 'type' THEN (SELECT t.typowner FROM pg_catalog.pg_type t WHERE t.oid=i.object_oid)
  WHEN 'schema' THEN (SELECT n.nspowner FROM pg_catalog.pg_namespace n WHERE n.oid=i.object_oid)
  WHEN 'language' THEN (SELECT l.lanowner FROM pg_catalog.pg_language l WHERE l.oid=i.object_oid)
  WHEN 'operator' THEN (SELECT o.oprowner FROM pg_catalog.pg_operator o WHERE o.oid=i.object_oid)
  WHEN 'collation' THEN (SELECT c.collowner FROM pg_catalog.pg_collation c WHERE c.oid=i.object_oid)
  WHEN 'extension' THEN (SELECT e.extowner FROM pg_catalog.pg_extension e WHERE e.oid=i.object_oid)
  ELSE NULL::oid END
LEFT JOIN pg_catalog.pg_depend d ON d.classid=i.class_oid AND d.objid=i.object_oid AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass AND d.deptype='e'
LEFT JOIN pg_catalog.pg_extension extension ON extension.oid=d.refobjid
ORDER BY i.class_oid,i.object_oid`;

const normalizeSql=(sql:string)=>sql.replace(/\s+/g,' ').trim();
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const queryDefinitions = [
  {query_id:'session.identity',sql:metadataSql,catalogs:[] as string[],purpose:'session and read-only transaction identity',max_rows:1},
  {query_id:'session.virtual_transaction',sql:virtualTransactionSql,catalogs:['pg_catalog.pg_locks'] as string[],purpose:'virtual transaction id for the current backend only',max_rows:1},
  {query_id:'roots.managed_event_triggers',sql:rootSql,catalogs:['pg_catalog.pg_event_trigger','pg_catalog.pg_proc','pg_catalog.pg_namespace','pg_catalog.pg_language','pg_catalog.pg_depend','pg_catalog.pg_extension','pg_catalog.pg_roles'] as string[],purpose:'resolve the two compiled roots and their invoking event triggers',max_rows:2},
  {query_id:'graph.dependency_closure',sql:graphSql,catalogs:['pg_catalog.pg_event_trigger','pg_catalog.pg_proc','pg_catalog.pg_namespace','pg_catalog.pg_depend'] as string[],purpose:'bounded referenced dependency closure; each reachable node and physical dependency row once',max_rows:512},
  {query_id:'graph.node_details',sql:nodeDetailsSql,catalogs:['pg_catalog.pg_depend','pg_catalog.pg_extension','pg_catalog.pg_class','pg_catalog.pg_type','pg_catalog.pg_proc','pg_catalog.pg_namespace','pg_catalog.pg_language','pg_catalog.pg_operator','pg_catalog.pg_constraint','pg_catalog.pg_trigger','pg_catalog.pg_collation','pg_catalog.pg_roles'] as string[],purpose:'sanitized structural node metadata, ownership hash, extension membership and definition hash',max_rows:256},
] as const;

export const MANAGED_AUDIT_QUERY_MANIFEST = Object.freeze(queryDefinitions.map(q=>Object.freeze({
  ...q,catalogs:Object.freeze([...q.catalogs]),sql_sha256:sha(normalizeSql(q.sql)),classification:'READ_ONLY' as const,
})));
export const MANAGED_AUDIT_QUERY_MANIFEST_DIGEST = sha(JSON.stringify(MANAGED_AUDIT_QUERY_MANIFEST.map(({query_id,sql_sha256,catalogs,purpose,max_rows,classification})=>({query_id,sql_sha256,catalogs,purpose,max_rows,classification}))));
const SEALED_QUERY_HASHES:Readonly<Record<string,string>>=Object.freeze({
  'session.identity':'6393155eb7da3edc0ff49d5f53bad0179223d31286b6acc353b13f30acc2c6a2',
  'session.virtual_transaction':'435dc0f6531c6e05316c2f34d09f4c42c6e0d88a6a95096c9d9f40333f4351f6',
  'roots.managed_event_triggers':'ed15c9312a8a922157adc9f7c383c43678c3395c1ad9eca4f965a10b639c9031',
  'graph.dependency_closure':'6e91448feef8f41a693b0054feb0de845ba204d5903fc21d2eed83423a5f7ddb',
  'graph.node_details':'2935a1957d85cd8aefad224f838c80438957ded8dde63757409e3d4c1eecc0b2',
});
const SEALED_MANIFEST_DIGEST='5a61d17be65a21b552bf3451ff0cd35cccf0498af2f47652b6ba3d6ad0d3ff1e';
const ALLOWED_SQL_FUNCTIONS=new Set(['version','pg_backend_pid','pg_current_snapshot','current_setting','pg_get_functiondef','pg_identify_object','pg_get_viewdef','pg_get_constraintdef','pg_get_triggerdef','pg_describe_object','jsonb_to_recordset','roots','walk','input','count','min','exists']);
const ALLOWED_CTE_NAMES=new Set(['roots','walk','input','reachable','inventory']);
const ALLOWED_TABLE_FUNCTIONS=new Set(['pg_identify_object','jsonb_to_recordset']);
export const MANAGED_AUDIT_LIMITS = Object.freeze({depth:12,nodes:256,edges:512});

const fail=(condition:unknown,code:string):void=>{if(!condition)throw Error(code);};

/** Structural gate for source-sealed templates; callers never supply runtime SQL. */
export function validateManagedAuditManifest(manifest:readonly {query_id:string;sql:string;sql_sha256:string;catalogs:readonly string[];max_rows:number;classification:string}[]=MANAGED_AUDIT_QUERY_MANIFEST){
  const ids=new Set<string>();
  for(const q of manifest){
    fail(!ids.has(q.query_id),'AUDIT_QUERY_ID_DUPLICATE');ids.add(q.query_id);
    fail(q.classification==='READ_ONLY','AUDIT_QUERY_NOT_READ_ONLY');
    fail(sha256HexEqual(sha(normalizeSql(q.sql)),q.sql_sha256),'AUDIT_QUERY_HASH_MISMATCH');
    if(manifest===MANAGED_AUDIT_QUERY_MANIFEST)fail(sha256HexEqual(q.sql_sha256,SEALED_QUERY_HASHES[q.query_id]),'AUDIT_QUERY_SEAL_MISMATCH');
    fail(!/;|\b(?:insert|update|delete|merge|create|alter|drop|truncate|copy|call|do|nextval|setval)\b|\bselect\b[\s\S]*?\binto\b/i.test(q.sql),'AUDIT_SQL_OPERATION_FORBIDDEN');
    const functionCalls=[...q.sql.matchAll(/(?:\b[a-z_][a-z0-9_]*\.)?\b([a-z_][a-z0-9_]*)\s*\(/gi)].map(m=>m[1]!.toLowerCase()).filter(n=>!['in','any','array','values','as','then','else','lateral','x'].includes(n));
    fail(functionCalls.every(name=>ALLOWED_SQL_FUNCTIONS.has(name)),'AUDIT_SQL_FUNCTION_FORBIDDEN');
    const sourceTokens=[...q.sql.matchAll(/\b(?:from|join)\s+(?:lateral\s+)?((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)(?=\s|\()/gi)];
    for(const match of sourceTokens){
      const relation=match[1]!.toLowerCase(),after=q.sql.slice((match.index??0)+match[0].length).trimStart();
      if(relation==='lateral')continue;
      if(after.startsWith('(')){
        const functionName=relation.split('.').at(-1)!;fail(ALLOWED_TABLE_FUNCTIONS.has(functionName),'AUDIT_SQL_FUNCTION_SOURCE_FORBIDDEN_'+functionName);
      }else if(!relation.includes('.'))fail(ALLOWED_CTE_NAMES.has(relation),'AUDIT_RELATION_NOT_ALLOWLISTED');
      else fail(MANAGED_AUDIT_CATALOGS.includes(relation as typeof MANAGED_AUDIT_CATALOGS[number]),'AUDIT_RELATION_NOT_ALLOWLISTED');
    }
    const usesLocks=/\bpg_catalog\.pg_locks\b/i.test(q.sql);
    if(usesLocks){
      fail(q.query_id==='session.virtual_transaction','AUDIT_PG_LOCKS_QUERY_ID_FORBIDDEN');
      validateVirtualTransactionSql(q.sql,q.sql_sha256);
    } else fail(q.query_id!=='session.virtual_transaction','AUDIT_VIRTUAL_TRANSACTION_QUERY_REQUIRED');
    fail(Number.isInteger(q.max_rows)&&q.max_rows>0&&q.max_rows<=MANAGED_AUDIT_LIMITS.edges,'AUDIT_QUERY_CARDINALITY_INVALID');
  }
  fail(ids.size===queryDefinitions.length&&queryDefinitions.every(q=>ids.has(q.query_id)),'AUDIT_QUERY_MANIFEST_INCOMPLETE');
  if(manifest===MANAGED_AUDIT_QUERY_MANIFEST)fail(sha256HexEqual(MANAGED_AUDIT_QUERY_MANIFEST_DIGEST,SEALED_MANIFEST_DIGEST),'AUDIT_MANIFEST_SEAL_MISMATCH');
  return true;
}

export function validateVirtualTransactionSql(sql:string,expectedHash=MANAGED_AUDIT_QUERY_MANIFEST.find(q=>q.query_id==='session.virtual_transaction')!.sql_sha256){
  fail(sha256HexEqual(sha(normalizeSql(sql)),expectedHash),'AUDIT_VIRTUAL_TRANSACTION_HASH_INVALID');
  const canonical=normalizeSql(virtualTransactionSql).toLowerCase();
  fail(normalizeSql(sql).toLowerCase()===canonical,'AUDIT_VIRTUAL_TRANSACTION_TEMPLATE_INVALID');
   fail(canonical==="select count(*)::integer as match_count, min(virtualxid::text) as virtualxid from pg_catalog.pg_locks where pid = pg_backend_pid() and locktype = 'virtualxid' and virtualxid is not null and granted = true",'AUDIT_VIRTUAL_TRANSACTION_SCOPE_INVALID');
  return true;
}

export interface ManagedAuditQueryResult {rows:Record<string,unknown>[];rowCount:number|null}
export interface ManagedAuditClient {connect():Promise<void>;query(sql:string,values?:unknown[]):Promise<ManagedAuditQueryResult>;end():Promise<void>;processID?:number}
export interface ManagedAuditGraphResult extends GraphEvidence {
 nodes:DurableNode[];edges:DurableEdge[];[key:string]:unknown;
}

export function validateDependencyGraphBounds(rows:readonly Record<string,unknown>[],limits=MANAGED_AUDIT_LIMITS){
  fail(rows.length<=limits.edges,'AUDIT_EDGE_LIMIT_EXCEEDED');
  const objects=new Set(rows.map(r=>`${String(r.class_oid)}:${String(r.object_oid)}`));
  fail(objects.size<=limits.nodes,'AUDIT_NODE_LIMIT_EXCEEDED');
  const maxDepth=Math.max(0,...rows.map(r=>Number(r.depth)));
  fail(Number.isFinite(maxDepth)&&maxDepth<=limits.depth,'AUDIT_DEPTH_LIMIT_EXCEEDED');
  return {node_count:objects.size,edge_count:rows.length,max_depth:maxDepth,cycles:rows.filter(r=>r.cycle===true).length};
}

export function validateManagedRootRows(rows:readonly Record<string,unknown>[]){
  fail(rows.length===2,'AUDIT_ROOT_MISSING_OR_DUPLICATED');
  for(const root of MANAGED_AUDIT_ROOTS)fail(rows.filter(r=>r.function_schema===root.schema&&r.function_name===root.name).length===1,'AUDIT_ROOT_MISSING_OR_DUPLICATED');
  return true;
}

export async function auditManagedDependencyGraph(client:ManagedAuditClient,options:{alreadyConnected?:boolean;expectedGraphEvidence?:unknown}={}){
  const startedAt=new Date().toISOString();let connected=options.alreadyConnected===true,connectAttempted=options.alreadyConnected!==true,transactionStarted=false,rollbackAttempted=false,rollbackConfirmed=false,closeAttempted=false,clientClosed=false;
  let result:ManagedAuditGraphResult|undefined,operationError:unknown,operationQueryId:string|null=null,rollbackError:unknown,closeError:unknown;
  const invocations:{query_id:string;duration_ms:number}[]=[];
  const run=async(queryId:string,values?:unknown[])=>{
    const q=MANAGED_AUDIT_QUERY_MANIFEST.find(item=>item.query_id===queryId);if(!q)throw Error('AUDIT_QUERY_ID_UNKNOWN');
    operationQueryId=queryId;const began=Date.now();const response=await client.query(q.sql,values);invocations.push({query_id:queryId,duration_ms:Date.now()-began});
    if(response.rows.length>q.max_rows)throw Error('AUDIT_QUERY_CARDINALITY_EXCEEDED');return response;
  };
  try{
    validateManagedAuditManifest();
    if(!connected){await client.connect();connected=true;}
    await client.query('BEGIN');
    transactionStarted=true;
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identityResult=await run('session.identity');
    fail(identityResult.rows.length===1,'AUDIT_SESSION_IDENTITY_CARDINALITY');
    const identity=identityResult.rows[0]!;
    fail(identity.read_only==='on'&&identity.isolation==='repeatable read','AUDIT_TRANSACTION_MODE_INVALID');
    const vtxResult=await run('session.virtual_transaction');
    fail(vtxResult.rows.length===1,'AUDIT_VIRTUAL_TRANSACTION_CARDINALITY');
    const vtx=vtxResult.rows[0]!;
    fail(vtx.match_count===1,'AUDIT_VIRTUAL_TRANSACTION_MATCH_COUNT');
    fail(Object.keys(vtx).sort().join(',')==='match_count,virtualxid'&&typeof vtx.virtualxid==='string'&&/^\d+\/\d+$/.test(vtx.virtualxid),'AUDIT_VIRTUAL_TRANSACTION_ROW_INVALID');
    const rootResult=await run('roots.managed_event_triggers');
    validateManagedRootRows(rootResult.rows);
    const graphResult=await run('graph.dependency_closure');
    const bounds=validateDependencyGraphBounds(graphResult.rows);
    const maxDepth=bounds.max_depth;
    fail(graphResult.rows.every(r=>r.row_kind==='node'||r.row_kind==='edge'),'AUDIT_GRAPH_ROW_KIND_INVALID');
    const nodeRows=graphResult.rows.filter(r=>r.row_kind==='node');
    const nodeInput=nodeRows.map(r=>({class_oid:String(r.class_oid),object_oid:String(r.object_oid)}));
    fail(new Set(nodeInput.map(r=>`${r.class_oid}:${r.object_oid}`)).size===nodeInput.length,'AUDIT_NODE_DUPLICATE');
    fail(nodeInput.length<=MANAGED_AUDIT_LIMITS.nodes,'AUDIT_NODE_LIMIT_EXCEEDED');
    const detailResult=await run('graph.node_details',[JSON.stringify(nodeInput)]);
    fail(detailResult.rows.length===nodeInput.length,'AUDIT_NODE_DETAIL_CARDINALITY');
    const details=new Map(detailResult.rows.map(r=>[`${r.class_oid}:${r.object_oid}`,r]));
    fail(details.size===nodeInput.length,'AUDIT_NODE_DETAIL_DUPLICATE');
    const nodes:DurableNode[]=[],sessionNodes=new Map<string,DurableNode>();
    for(const row of nodeRows){
      const sessionKey=`${row.class_oid}:${row.object_oid}`,detail=details.get(sessionKey);
      if(!detail)throw Error('AUDIT_NODE_DETAIL_MISSING');
      fail(detail.normalized_definition===null||typeof detail.normalized_definition==='string','AUDIT_NODE_DEFINITION_INVALID');
      fail(detail.owner_name===null||typeof detail.owner_name==='string','AUDIT_NODE_OWNER_INVALID');
      const catalog=typeof row.class_catalog==='string'&&!row.class_catalog.includes('.')?'pg_catalog.'+row.class_catalog:row.class_catalog;
      const node=durableNode({catalog_class:catalog,namespace:row.namespace,object_type:row.object_type,structural_identity:row.identity,extension_identity:detail.extension_name,owner_class:detail.owner_name===null?null:'role',owner_sha256:detail.owner_name===null?null:sha(detail.owner_name as string),normalized_definition_sha256:detail.normalized_definition===null?null:sha((detail.normalized_definition as string).replace(/\r\n/g,'\n').trim())});
      nodes.push(node);sessionNodes.set(sessionKey,node);
    }
    const edges=graphResult.rows.filter(r=>r.row_kind==='edge').map(row=>({from:sessionNodes.get(`${row.from_class_oid}:${row.from_object_oid}`),to:sessionNodes.get(`${row.class_oid}:${row.object_oid}`),deptype:row.deptype,direction:row.direction,relation:{catalog:'pg_catalog.pg_depend',source_subobject:row.source_subobject,target_subobject:row.target_subobject}}));
    const canonical=serializeDependencyGraph(nodes,edges);
    const canonicalNodes=canonical.nodes,canonicalEdges=canonical.edges;
    const rootDigests=Object.fromEntries(MANAGED_AUDIT_ROOTS.map(root=>[`${root.schema}.${root.name}`,sha(JSON.stringify(canonicalNodes.filter(n=>n.namespace===root.schema&&n.structural_identity.includes(root.name))))]));
    const definitionHashes=Object.fromEntries(rootResult.rows.map(r=>[`${r.function_schema}.${r.function_name}`,sha(String(r.definition).replace(/\r\n/g,'\n').trim())]));
    const rootEvents=rootResult.rows.map(r=>({event_name:String(r.event_name),event_type:String(r.event_type),event_tags:r.event_tags,enabled:String(r.enabled),root:`${r.function_schema}.${r.function_name}`,owner_sha256:r.owner_name?sha(String(r.owner_name)):null,definition_sha256:definitionHashes[`${r.function_schema}.${r.function_name}`],owning_extension:r.extension_name??null})).sort((a,b)=>a.event_name.localeCompare(b.event_name));
    result={status:'CAPTURED',started_at_utc:startedAt,server_version:String(identity.server_version),backend_pid:Number(identity.backend_pid),virtual_transaction:String(vtx.virtualxid),snapshot:String(identity.snapshot),read_only:String(identity.read_only),isolation:String(identity.isolation),roots:MANAGED_AUDIT_ROOTS.map(r=>`${r.schema}.${r.name}`),root_events:rootEvents,root_digests:rootDigests,nodes:canonicalNodes,edges:canonicalEdges,graph_serialization_version:canonical.graph_serialization_version,dependency_nodes_digest:canonical.dependency_nodes_digest,dependency_edges_digest:canonical.dependency_edges_digest,node_count:canonical.node_count,edge_count:canonical.edge_count,cycle_count:graphResult.rows.filter(e=>e.row_kind==='edge'&&e.cycle===true).length,max_depth:maxDepth,definition_sha256:definitionHashes,query_invocations:invocations,query_manifest_digest:MANAGED_AUDIT_QUERY_MANIFEST_DIGEST,query_manifest:MANAGED_AUDIT_QUERY_MANIFEST.map(({sql,...safe})=>safe),rollback_attempted:false,rollback_confirmed:false,client_end_attempted:false,client_closed:false,writes:0,mutator_invoked:false};
    validateGraphInventory(result,options.expectedGraphEvidence);
  } catch(error) { operationError=error; }
  finally {
    if(connected&&transactionStarted){rollbackAttempted=true;try{await client.query('ROLLBACK');rollbackConfirmed=true;}catch(error){rollbackError=error;}}
    if(connected||connectAttempted){closeAttempted=true;try{await client.end();clientClosed=true;}catch(error){closeError=error;}}
  }
  if(operationError)throw Object.assign(Error('MANAGED_AUDIT_OPERATION_FAILED'),{cause:operationError,query_id:operationQueryId,transaction_started:transactionStarted,rollback_attempted:rollbackAttempted,rollback_confirmed:rollbackConfirmed,rollback_error:rollbackError,close_attempted:closeAttempted,client_closed:clientClosed,close_error:closeError});
  if(rollbackError||closeError||!rollbackAttempted||!rollbackConfirmed||!closeAttempted||!clientClosed)throw Object.assign(Error('AUDIT_CLEANUP_UNCONFIRMED'),{rollback_attempted:rollbackAttempted,rollback_confirmed:rollbackConfirmed,rollback_error:rollbackError,close_attempted:closeAttempted,client_closed:clientClosed,close_error:closeError});
  Object.assign(result!,{transaction_started:transactionStarted,rollback_attempted:rollbackAttempted,rollback_confirmed:rollbackConfirmed,client_end_attempted:closeAttempted,client_closed:clientClosed});
  return result!;
}
