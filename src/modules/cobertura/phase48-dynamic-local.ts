// Deliberately isolated from production dispatch and all historical corrections.
// Only the ephemeral cluster created by certify-phase48-dynamic-local.ps1 is accepted.
import {Client} from 'pg';
import {resolve,relative} from 'node:path';
import {readFileSync} from 'node:fs';
import {digest, orderedIds, DynamicSeal, DynamicSet, LocalGateAuthority} from './phase48-dynamic-gate';

const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const identities=['institucion_id','sede_id','modalidad_id'];
export type LocalTarget={clusterDirectory:string};
export function localClient():Client {
 if(process.env.PHASE48_DYNAMIC_LOCAL_CERT!=='true')throw Error('LOCAL_CERTIFICATION_REQUIRED');
 if(process.env.PHASE48_READ_QUERY_LOCAL_CERT==='true'){
  const root=resolve('tmp/phase48-v6-read-query-certification');
  const directory=resolve(process.env.PHASE48_READ_QUERY_LOCAL_CLUSTER??'');
  const port=Number(process.env.PHASE48_READ_QUERY_LOCAL_PORT),pid=Number(process.env.PHASE48_READ_QUERY_LOCAL_PID);
  const ca=process.env.PHASE48_READ_QUERY_LOCAL_CA;
  const rel=relative(root,directory).replaceAll('\\','/');
  if(!/^run-[a-f0-9]{32}\/cluster$/i.test(rel)||!Number.isInteger(port)||port<49152||port>65535||!Number.isInteger(pid)||pid<1||!ca)throw Error('READ_QUERY_LOCAL_CERTIFICATE_SCOPE_REQUIRED');
  return new Client({host:'127.0.0.1',port,user:'phase48_dynamic_local',database:'postgres',ssl:{ca:readFileSync(ca,'utf8'),rejectUnauthorized:true,servername:'localhost'},options:"-c search_path=public,pg_temp"});
 }
 return new Client({host:'127.0.0.1',port:55470,user:'phase48_dynamic_local',database:'postgres',ssl:false,options:"-c search_path=public,pg_temp"});
}
async function identity(db:Client,target:LocalTarget) {
 const expected=resolve(process.cwd(),'tmp/phase48-pooler-local/dynamic-cluster');
 if(resolve(target.clusterDirectory)!==expected)throw Error('LOCAL_CLUSTER_PATH_REQUIRED');
 const r=(await db.query(`SELECT current_setting('server_version') version, current_setting('data_directory') directory,
  current_setting('transaction_isolation') isolation, host(inet_server_addr()) host, inet_server_port() port`)).rows[0];
 if(r.version!=='17.11'||resolve(r.directory)!==expected||r.host!=='127.0.0.1'||r.port!==55470)
  throw Error('LOCAL_CLUSTER_IDENTITY_INVALID');
 return r;
}
async function tableNames(db:Client):Promise<string[]> {
 return (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(r=>r.tablename);
}
// Hash every full row, preserving nulls, dates and protected technical/economic columns.
// Raw full rows never leave this module, nor appear in local evidence.
async function capture(db:Client):Promise<DynamicSet> {
 const tables=await tableNames(db), data:any[]=[];
 for(const table of tables) {
  const r=(await db.query(`SELECT count(*)::text count, encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM public.${q(table)} t`)).rows[0];
  data.push({table,...r});
 }
 const columns=(await db.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
 const constraints=(await db.query(`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname`)).rows;
 const indexes=(await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
 const triggers=(await db.query(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2`)).rows;
 const routines=(await db.query(`SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`)).rows;
 // This local Phase48-only executor does not certify sequence/trigger side effects.
 // Fail closed; production requires the full restored schema certification separately.
 if(triggers.length || (await db.query(`SELECT 1 FROM pg_sequences WHERE schemaname='public'`)).rowCount)
  throw Error('LOCAL_FIXTURE_SIDE_EFFECTS_UNCERTIFIED');
 const candidates=(await db.query(`SELECT ca.id::text id, ff.institucion_id::text institucion_id, ff.sede_id::text sede_id, ff.modalidad_id::text modalidad_id
  FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id
  JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15 ORDER BY ca.id`)).rows;
 const scoped=(await db.query(`SELECT count(*)::int n FROM cobertura_asignaciones WHERE contrato_id=24`)).rows[0].n;
 if(candidates.length!==scoped || candidates.some(r=>identities.some(k=>r[k]===null)))throw Error('INVALID_CANDIDATE_IDENTITY');
 if(columns.some(r=>r.table_name==='cobertura_asignaciones'&&identities.includes(r.column_name)))throw Error('PHASE48_ALREADY_APPLIED');
 const candidate_ids=orderedIds(candidates.map(r=>r.id));
 const write=(await db.query(`SELECT encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(ca)::text,E'\n' ORDER BY ca.id),''),'UTF8')),'hex') digest FROM cobertura_asignaciones ca WHERE contrato_id=24`)).rows[0].digest;
 const albeny=(await db.query(`SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca WHERE vinculacion_id=1555 ORDER BY id`)).rows;
 const dary=(await db.query(`SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca WHERE vinculacion_id=249 ORDER BY id`)).rows;
 const periods=(await db.query(`SELECT to_jsonb(p) row FROM nomina_periodos p WHERE id IN (4,6) ORDER BY id`)).rows;
 if(periods.length!==2 || periods.some(r=>r.row.estado!=='ANULADO'))throw Error('ANNULLED_PERIODS_CHANGED');
 return {candidate_count:candidate_ids.length,candidate_ids,candidate_ids_digest:digest(candidate_ids),lock_tables:tables,
  schema_digest:digest({columns,constraints,indexes,triggers,routines}),source_digest:digest(data),
  phase48_candidates_digest:digest(candidates),write_set_before_digest:write,
  protected_tables_digest:digest(data.filter(r=>r.table!=='cobertura_asignaciones')),
  albeny_before_digest:digest(albeny),dary_before_digest:digest(dary),periods_4_6_digest:digest(periods)};
}
export async function certifyDynamicLocal(authority:LocalGateAuthority,target:LocalTarget):Promise<DynamicSeal> {
 let first:DynamicSet|undefined, prior:Client|undefined;
 for(let i=0;i<2;i++) {
  const db=localClient();if(db===prior)throw Error('CLIENT_REUSED');
  await db.connect();
  try {
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await identity(db,target);
   if((await db.query(`SELECT current_setting('transaction_read_only') r`)).rows[0].r!=='on')throw Error('READ_ONLY_REQUIRED');
   const set=await capture(db);
   if(first && digest(set)!==digest(first))throw Error('STOPPED_DRIFT');first=set;
  } finally {try{await db.query('ROLLBACK');}finally{await db.end();}}
  prior=db; // next Client is created only after the previous connection has ended.
 }
 return authority.issue(first!);
}

export type LocalExecution={status:'LOCAL_COMMITTED'|'LOCAL_ROLLED_BACK';processed_ids:string[]; rollback_verified:boolean};
export async function executeDynamicLocal(authority:LocalGateAuthority,seal:DynamicSeal,target:LocalTarget,
 mode:'Rollback'|'Commit'='Rollback', hooks:{afterLock?:(db:Client)=>Promise<void>; afterUpdate?:(db:Client)=>Promise<void>}={}):Promise<LocalExecution> {
 authority.consume(seal);
 // Own a copy: callbacks/caller cannot substitute IDs or lock manifest during awaits.
 seal=structuredClone(seal);
 const db=localClient();await db.connect();let finished=false;
 try {
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await db.query(`SET LOCAL lock_timeout='2s'`);
  await db.query(`SET LOCAL statement_timeout='10s'`);
  // NO SELECT before this utility statement: first MVCC snapshot is taken under locks.
  // ACCESS EXCLUSIVE also rejects concurrent TRUNCATE and table DDL. NOWAIT avoids a stale wait.
  await db.query('LOCK TABLE '+seal.set.lock_tables.map(t=>'public.'+q(t)).join(',')+' IN ACCESS EXCLUSIVE MODE NOWAIT');
  if((await identity(db,target)).isolation!=='serializable')throw Error('SERIALIZABLE_REQUIRED');
  await db.query('SELECT pg_advisory_xact_lock(15,2448)');
  await hooks.afterLock?.(db);
  authority.revalidate(seal,await capture(db));
  // Last expiry check before first DDL/DML. No refresh, no automatic retry.
  authority.assertLive(seal);
  await db.query(`ALTER TABLE cobertura_asignaciones
   ADD COLUMN institucion_id bigint REFERENCES instituciones(id),
   ADD COLUMN sede_id bigint REFERENCES sedes(id),
   ADD COLUMN modalidad_id bigint REFERENCES modalidades(id)`);
  await db.query('ALTER TABLE cobertura_asignaciones ALTER COLUMN focalizacion_final_id DROP NOT NULL');
  const changed=(await db.query(`UPDATE cobertura_asignaciones ca SET institucion_id=ff.institucion_id,sede_id=ff.sede_id,modalidad_id=ff.modalidad_id
   FROM focalizacion_final ff,contratos c WHERE ca.id=ANY($1::bigint[]) AND ca.contrato_id=24 AND c.id=ca.contrato_id AND c.empresa_id=15
   AND ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id
   AND ca.institucion_id IS NULL AND ca.sede_id IS NULL AND ca.modalidad_id IS NULL
   RETURNING ca.id::text id, ca.institucion_id::text institucion_id,ca.sede_id::text sede_id,ca.modalidad_id::text modalidad_id`,[seal.set.candidate_ids])).rows;
  const processed_ids=orderedIds(changed.map(r=>r.id));
  if(digest(processed_ids)!==seal.set.candidate_ids_digest || digest(changed.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1))!==seal.set.phase48_candidates_digest)
   throw Error('WRITE_SET_NOT_EXACT');
  await db.query('CREATE INDEX idx_cobertura_asignaciones_timeline ON cobertura_asignaciones(contrato_id,vinculacion_id,fecha_inicio,fecha_fin)');
  await hooks.afterUpdate?.(db);
  // Verify every pre-existing assignment field, including economic fields and special cases.
  const write=(await db.query(`SELECT encode(sha256(convert_to(COALESCE(string_agg((to_jsonb(ca)-'institucion_id'-'sede_id'-'modalidad_id')::text,E'\n' ORDER BY ca.id),''),'UTF8')),'hex') digest FROM cobertura_asignaciones ca WHERE contrato_id=24`)).rows[0].digest;
  if(write!==seal.set.write_set_before_digest)throw Error('PROTECTED_ASSIGNMENT_DRIFT');
  const afterData:any[]=[];
  for(const table of seal.set.lock_tables) {
   const expression=table==='cobertura_asignaciones'?"(to_jsonb(t)-'institucion_id'-'sede_id'-'modalidad_id')::text":'to_jsonb(t)::text';
   const row=(await db.query(`SELECT count(*)::text count, encode(sha256(convert_to(COALESCE(string_agg(${expression},E'\n' ORDER BY ${expression}),''),'UTF8')),'hex') digest FROM public.${q(table)} t`)).rows[0];
   afterData.push({table,...row});
  }
  if(digest(afterData)!==seal.set.source_digest)throw Error('PROTECTED_TABLE_DRIFT');
  authority.assertLive(seal);
  await db.query(mode==='Commit'?'COMMIT':'ROLLBACK');finished=true;
  if(mode==='Rollback') {
   // New physically independent read transactions recalculate all eight digests and IDs.
   const restored=await certifyDynamicLocal(authority,target);
   authority.revalidate(seal,restored.set);
   return {status:'LOCAL_ROLLED_BACK',processed_ids,rollback_verified:true};
  }
  // Local-only committed test; production grant, audit and postcommit receipt are deliberately absent.
  return {status:'LOCAL_COMMITTED',processed_ids,rollback_verified:false};
 } finally {
  try {if(!finished)await db.query('ROLLBACK');} finally {await db.end();}
 }
}
