// Dedicated SELECT-only repository. No imports from any mutation module.
// The original local runner and LOCAL_RESTORATION_REQUIRED guard remain unchanged.
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {contractDigest} from './phase48-readonly-contract';
import {verifyReadServerIdentity,READ_IDENTITY_TABLES} from './phase48-readonly-target';

type Db = Pick<PoolClient,'query'>;
type Row = Record<string,any>;
const HISTORICAL_SCOPE = Object.freeze({empresa:15,contrato:24,actor:12});
const HISTORICAL_MARKER = 'PHASE48_HISTORICAL_15_24_V1';
const phaseMarker = 'PHASE48_IDENTITIES_15_24_V1';
const sha = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assert(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
const quote = (name:string) => '"'+name.replaceAll('"','""')+'"';
const digestSql = (expression:string) => `pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(pg_catalog.string_agg(${expression},E'\\n' ORDER BY ${expression}),''),'UTF8')),'hex')`;

async function schemaDefinition(db:Db) {
 const schema=(await db.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
 const constraints=(await db.query(`SELECT n.nspname,c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname`)).rows;
 const indexes=(await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
 const routines=(await db.query(`SELECT p.oid::regprocedure::text identity,pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`)).rows;
 const triggers=(await db.query(`SELECT c.relname,t.tgname,pg_catalog.pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
 return {schema,constraints,indexes,routines,triggers};
}
async function historicalSnapshot(db:Db) {
 const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
 const data:Row[]=[];
 for(const {tablename} of tables){
  const row=(await db.query(`SELECT pg_catalog.count(*)::text count,${digestSql('pg_catalog.to_jsonb(t)::text')} digest FROM public.${quote(tablename)} t`)).rows[0];
  data.push({table:tablename,...row});
 }
 const metadata=await schemaDefinition(db);
 const sequences:Row[]=[];
 for(const {sequencename} of (await db.query(`SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows){
  sequences.push({sequence:sequencename,...(await db.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0]});
 }
 const snapshot={data,...metadata,sequences};
 return {...snapshot,digest:sha(snapshot)};
}

async function actorGate(db:Db,actor:string|undefined){
 assert(actor===String(HISTORICAL_SCOPE.actor),'TECHNICAL_ACTOR_REQUIRED');
 const valid=(await db.query(`SELECT 1 FROM usuarios u WHERE u.id=$1::bigint AND u.activo
 AND EXISTS(SELECT 1 FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=u.id AND ur.activo AND r.activo AND r.nombre_rol='ADMINISTRADOR')
 AND EXISTS(SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=15 AND ue.activo)
 AND EXISTS(SELECT 1 FROM usuario_contratos uc WHERE uc.usuario_id=u.id AND uc.contrato_id=24 AND uc.activo)`,[actor])).rowCount;
 assert(valid,'TECHNICAL_ACTOR_SCOPE_INVALID');
}

const cases=Object.freeze([
 {vinculacion:'1555',institucion:'44',sede:'196',municipio:'477',modalidad:'1',codigo:'CAA',desde:'2026-08-18',hasta:'2026-09-08',siguiente:'1224',siguienteDesde:'2026-09-09',historica:null,categoria:'34'},
 {vinculacion:'249',institucion:'6',sede:'18',municipio:'4',modalidad:'5',codigo:'CAA-JU',desde:'2026-07-29',hasta:'2026-07-31',siguiente:'1221',siguienteDesde:'2026-08-01',historica:'11',categoria:null},
]);

async function historicalPlan(db:Db){
 const plan:Row[]=[];
 for(const c of cases){
  const v=(await db.query(`SELECT v.id::text,v.fecha_inicio::text,v.fecha_fin::text FROM vinculaciones v JOIN contratos ct ON ct.id=v.contrato_id
   WHERE v.id=$1::bigint AND v.empresa_id=15 AND v.contrato_id=24 AND ct.empresa_id=15
   AND ct.fecha_inicio<=$2::date AND COALESCE(ct.fecha_final_real,ct.fecha_final_estimada,ct.fecha_finalizacion)>=$3::date`,[c.vinculacion,c.desde,c.hasta])).rows[0];
  assert(v&&v.fecha_inicio===c.desde&&(!v.fecha_fin||v.fecha_fin>=c.hasta),'EXPECTED_VINCULACION_MISMATCH');
  const attendance=(await db.query(`SELECT id::text FROM nomina_asistencia_diaria WHERE vinculacion_id=$1::bigint
   AND fecha BETWEEN $2::date AND $3::date ORDER BY id`,[c.vinculacion,c.desde,c.hasta])).rows.map(r=>r.id);
  const expectedAttendance=c.vinculacion==='1555'?['13195','13196','13197','13198','13199','13200','13201','13202','13203','13204','19830','19833','19834','19837','19838','19841']:[];
  assert(sha(attendance)===sha(expectedAttendance),'EXPECTED_HISTORICAL_ATTENDANCE_IDS_CHANGED');
  const target=(await db.query(`SELECT i.id::text institucion_id,s.id::text sede_id,s.municipio_id::text municipio_id,m.id::text modalidad_id,
   i.nombre_institucion institucion,s.nombre_sede sede,COALESCE(m.codigo_original,m.nombre_modalidad) modalidad
   FROM instituciones i JOIN sedes s ON s.institucion_id=i.id CROSS JOIN modalidades m
   WHERE i.id=$1::bigint AND s.id=$2::bigint AND s.municipio_id=$3::bigint AND m.id=$4::bigint AND i.contrato_id=24
   AND i.activo AND s.activo AND m.activo AND (EXISTS(SELECT 1 FROM sede_modalidades sm WHERE sm.contrato_id=24 AND sm.modalidad_id=m.id AND sm.activo)
    OR EXISTS(SELECT 1 FROM calculadora_personal_config cp WHERE cp.contrato_id=24 AND cp.modalidad_id=m.id AND LOWER(cp.estado)='activo'))`,[c.institucion,c.sede,c.municipio,c.modalidad])).rows[0];
  assert(target&&target.modalidad===c.codigo,'EXPECTED_CONTRACT_CONTEXT_MISMATCH');
  const all=(await db.query(`SELECT ca.*,ff.institucion_id,ff.sede_id,ff.modalidad_id,ca.id::text,ca.fecha_inicio::text desde,ca.fecha_fin::text hasta FROM cobertura_asignaciones ca LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id
   WHERE ca.vinculacion_id=$1::bigint AND ca.contrato_id=24 ORDER BY ca.fecha_inicio,ca.id`,[c.vinculacion])).rows;
  const next=all.find(r=>r.id===c.siguiente);
  assert(next?.activo&&next.desde===c.siguienteDesde&&String(next.institucion_id)===c.institucion&&String(next.sede_id)===c.sede&&String(next.modalidad_id)===c.modalidad&&String(next.municipio_id)===c.municipio,'EXPECTED_NEXT_COVERAGE_MISMATCH');
  const candidates=(await db.query(`SELECT id::text,modalidad,vigente_desde::text,vigente_hasta::text FROM nomina_categorias_salariales
   WHERE contrato_id=24 AND activo AND LOWER(BTRIM(modalidad))=LOWER(BTRIM($1))
   AND (vigente_desde IS NULL OR vigente_desde<=$2::date) AND (vigente_hasta IS NULL OR vigente_hasta>=$3::date) ORDER BY id`,[c.codigo,c.desde,c.hasta])).rows;
  // Require a unique category at EVERY salary boundary, not just at entry.
  const intersects=(await db.query(`SELECT id::text FROM nomina_categorias_salariales WHERE contrato_id=24 AND activo
   AND LOWER(BTRIM(modalidad))=LOWER(BTRIM($1)) AND (vigente_desde IS NULL OR vigente_desde<=$3::date)
   AND (vigente_hasta IS NULL OR vigente_hasta>=$2::date)`,[c.codigo,c.desde,c.hasta])).rows;
  const category=candidates.length===1&&intersects.length===1?candidates[0].id:null;
  if(c.categoria)assert(category===c.categoria,'EXPECTED_CAA_CATEGORY_34_MISMATCH');
  const estado_salarial=category?'RESUELTO':'REQUIERE_REVISION_SALARIAL';
  const observation=`${HISTORICAL_MARKER}:${c.vinculacion}:${estado_salarial}`;
  const active=all.filter(r=>r.activo);
  const existing=active.filter(r=>r.desde<=c.hasta&&(!r.hasta||r.hasta>=c.desde));
  const applied=existing.length===1&&existing[0].desde===c.desde&&existing[0].hasta===c.hasta&&existing[0].observacion===observation
    &&String(existing[0].institucion_id)===c.institucion&&String(existing[0].sede_id)===c.sede&&String(existing[0].modalidad_id)===c.modalidad
    &&String(existing[0].municipio_id)===c.municipio&&(!c.historica||existing[0].id===c.historica);
  assert(!existing.length||applied,'HISTORICAL_OVERLAP_OR_UNCERTIFIED_VERSION');
  if(c.historica){const old=all.find(r=>r.id===c.historica);assert(old&&old.desde===c.desde&&old.hasta===c.hasta&&String(old.institucion_id)===c.institucion&&String(old.sede_id)===c.sede&&String(old.modalidad_id)===c.modalidad,'EXPECTED_HISTORY_11_MISMATCH');}
  for(let i=1;i<active.length;i++){const p=active[i-1]!,n=active[i]!;
   assert(p.hasta&&p.hasta<n.desde,'ACTIVE_COVERAGE_OVERLAP');
   const nextDay=new Date(p.hasta+'T00:00:00Z');nextDay.setUTCDate(nextDay.getUTCDate()+1);
   assert(nextDay.toISOString().slice(0,10)===n.desde,'ACTIVE_COVERAGE_GAP');
  }
  const periods=(await db.query(`SELECT id::text,estado FROM nomina_periodos WHERE contrato_id=24 AND fecha_fin>=$1::date AND fecha_inicio<=$2::date ORDER BY id`,[c.desde,c.hasta])).rows;
  const expectedId=applied?existing[0].id:c.historica??(await plannedId(db,'cobertura_asignaciones')).id;
  plan.push({...c,applied,coverage_id:expectedId,category_id:category,estado_salarial,observation,target,
   periodos_abiertos:periods.filter(r=>r.estado==='ABIERTO').map(r=>r.id),periodos_protegidos:periods.filter(r=>r.estado!=='ABIERTO').map(r=>r.id),
   automatic_recalculation:false,external_sync:false});
 }
 assert(plan.every(p=>p.applied)||plan.every(p=>!p.applied),'PARTIAL_HISTORICAL_APPLICATION');
 return plan;
}

async function plannedId(db:Db,table:string){
 const sequence=(await db.query('SELECT pg_catalog.pg_get_serial_sequence($1,\'id\') name',[table])).rows[0].name;
 assert(sequence&&/^public\.[a-z0-9_]+$/.test(sequence),'EXPECTED_SEQUENCE_REQUIRED');
 const value=(await db.query(`SELECT GREATEST(COALESCE((SELECT pg_catalog.max(id) FROM ${quote(table)}),0),(SELECT last_value FROM ${sequence}))+1 AS id`)).rows[0].id;
 return {id:String(value),sequence};
}

// SQL is private to this repository; callers cannot submit SQL or function names.
// This second barrier examines executable tokens, not words inside literals.
const permittedCalls=new Set('select and or not count encode sha256 convert_to coalesce string_agg to_jsonb md5 pg_get_functiondef pg_get_constraintdef pg_get_triggerdef pg_get_serial_sequence greatest max lower btrim exists in current_database current_setting pg_backend_pid pg_current_snapshot host inet_server_addr inet_server_port'.split(' '));
export function assertReadQuery(sql:string){
 const tokens=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/"((?:""|[^"])*)"/g,(_,s:string)=>s.replaceAll('""','"'));
 assert(/^\s*SELECT\b/i.test(tokens)&&!/[;]|--|\/\*/.test(tokens)&&! /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|WITH|INTO|FOR|CALL|DO|COPY|GRANT|REVOKE|LOCK)\b/i.test(tokens),'READ_QUERY_REQUIRED');
 for(const match of tokens.matchAll(/\b([a-z_][a-z_0-9]*)\s*\(/gi))assert(permittedCalls.has(match[1]!.toLowerCase()),'SQL_FUNCTION_NOT_ALLOWED');
 for(const match of tokens.matchAll(/\b([a-z_][a-z_0-9]*)\s*\.\s*[a-z_][a-z_0-9]*\s*\(/gi))assert(match[1]!.toLowerCase()==='pg_catalog','APPLICATION_FUNCTION_NOT_ALLOWED');
}
export function createReadOnlyRepository(client:Db){
 const db:Db={query:((sql:any,values?:any)=>{assert(typeof sql==='string','READ_QUERY_REQUIRED');assertReadQuery(sql);return client.query(sql,values);}) as Db['query']};
 return Object.freeze({
  safePolicies:async()=>assert((await db.query(`SELECT r.rolsuper OR r.rolbypassrls OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity) safe FROM pg_roles r WHERE r.rolname=current_user`)).rows[0]?.safe===true,'RLS_EXECUTION_NOT_SAFE'),
  targetIdentity:async(expectedDatabase:string)=>{
   const metadata=await schemaDefinition(db),tables=[...new Set(metadata.schema.map(r=>r.table_name as string))];
   assert(READ_IDENTITY_TABLES.every(t=>tables.includes(t)),'READ_SERVER_TABLES_INVALID');
   const identity=(await db.query(`SELECT pg_catalog.current_database() database,pg_catalog.current_setting('server_version') version,EXISTS(SELECT 1 FROM empresas WHERE id=15) empresa_exists,EXISTS(SELECT 1 FROM contratos WHERE id=24 AND empresa_id=15) contrato_exists`)).rows[0];
   return verifyReadServerIdentity({...identity,tables,schema_digest:contractDigest(metadata)} as Parameters<typeof verifyReadServerIdentity>[0],expectedDatabase);
  },
  snapshot:()=>historicalSnapshot(db),
  actor:()=>actorGate(db,'12'),
  plan:()=>historicalPlan(db),
  session:async()=> (await db.query(`SELECT pg_catalog.pg_backend_pid() pid,pg_catalog.pg_current_snapshot()::text snapshot,(SELECT virtualtransaction FROM pg_locks WHERE pid=pg_catalog.pg_backend_pid() AND locktype='virtualxid') virtual_transaction,pg_catalog.current_setting('transaction_read_only') read_only,pg_catalog.current_setting('transaction_isolation') isolation,pg_catalog.current_setting('server_version') version,pg_catalog.host(pg_catalog.inet_server_addr()) host,pg_catalog.inet_server_port() port`)).rows[0],
  activity:async()=> (await db.query(`SELECT (SELECT pg_catalog.count(*)::int FROM pg_locks WHERE NOT granted) waiting,(SELECT pg_catalog.count(*)::int FROM pg_stat_activity WHERE state='active' AND pid<>pg_catalog.pg_backend_pid() AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|GRANT|REVOKE)\\s') ddl`)).rows[0],
  ssl:async()=> {const row=(await db.query(`SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()`)).rows[0];return row?.ssl===true&&row.version==='TLSv1.3';},
  candidates:async()=> (await db.query(`SELECT ca.id::text cobertura_id,ff.institucion_id::text,ff.sede_id::text,ff.modalidad_id::text FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15 ORDER BY ca.id`)).rows,
  affected:async()=> (await db.query(`SELECT pg_catalog.to_jsonb(v) row FROM vinculaciones v WHERE id IN(249,1555) ORDER BY id`)).rows,
  coverage:async()=> (await db.query(`SELECT pg_catalog.to_jsonb(ca) row FROM cobertura_asignaciones ca WHERE contrato_id=24 AND vinculacion_id IN(249,1555) ORDER BY id`)).rows,
  periods:async()=> (await db.query(`SELECT pg_catalog.to_jsonb(p) row FROM nomina_periodos p WHERE contrato_id=24 ORDER BY id`)).rows,
  writeSet:async(snapshot:Awaited<ReturnType<typeof historicalSnapshot>>,candidates:Row[],coverage:Row[],affected:Row[])=>{
   const rows=(await db.query(`SELECT ca.id::text technical_id,pg_catalog.to_jsonb(ca) row FROM cobertura_asignaciones ca JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15 ORDER BY ca.id`)).rows;
   assert(rows.length===730,'PHASE48_POPULATION_CHANGED');
   return contractDigest({format:'PHASE48_WRITE_SET_V1_UTC_MICROSECONDS',
    schema:snapshot.schema.filter(r=>r.table_name==='cobertura_asignaciones'),
    constraints:snapshot.constraints.filter(r=>r.relname==='cobertura_asignaciones'),
    indexes:snapshot.indexes.filter(r=>r.tablename==='cobertura_asignaciones'),
    triggers:snapshot.triggers.filter(r=>r.relname==='cobertura_asignaciones'),
    candidates,candidate_rows:rows,affected_coverage:coverage,affected_vinculaciones:affected,
    specific_coverage:coverage.filter(r=>[1224,11].includes(r.row.id)),
    // Existing related rows are represented by count/hash only, never PII output.
    related_tables:snapshot.data.filter(r=>['cobertura_asignaciones','vinculaciones','focalizacion_final','contratos','instituciones','sedes','modalidades','sede_modalidades','calculadora_personal_config','nomina_categorias_salariales','nomina_asistencia_diaria','nomina_periodos'].includes(r.table)),
    sequences:snapshot.sequences.filter(r=>/^(cobertura_asignaciones|auditoria|auditoria_eventos)_/.test(r.sequence)),
    initial_audits:snapshot.data.filter(r=>['auditoria','auditoria_eventos'].includes(r.table))});
  },
  minimalState:async()=>{
   const columns=(await db.query(`SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='cobertura_asignaciones' AND column_name IN('institucion_id','sede_id','modalidad_id','focalizacion_final_id') ORDER BY column_name`)).rows;
   const applied=(await db.query(`SELECT (SELECT pg_catalog.count(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname='idx_cobertura_asignaciones_timeline') indexes,(SELECT pg_catalog.count(*)::int FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='cobertura_asignaciones' AND pg_catalog.pg_get_constraintdef(k.oid) ~ 'FOREIGN KEY \\((institucion_id|sede_id|modalidad_id)\\)') foreign_keys,(SELECT pg_catalog.count(*)::int FROM auditoria WHERE descripcion IN('PHASE48_ATOMIC_15_24_V1','PHASE48_IDENTITIES_15_24_V1','PHASE48_HISTORICAL_15_24_V1')) legacy_audits,(SELECT pg_catalog.count(*)::int FROM auditoria_eventos WHERE descripcion IN('PHASE48_ATOMIC_15_24_V1','PHASE48_IDENTITIES_15_24_V1','PHASE48_HISTORICAL_15_24_V1')) event_audits`)).rows[0];
   const count=(await db.query('SELECT pg_catalog.count(*)::int n FROM cobertura_asignaciones')).rows[0].n;
   const candidateCount=(await db.query(`SELECT pg_catalog.count(*)::int n FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15`)).rows[0].n;
   const coverage=(await db.query(`SELECT pg_catalog.to_jsonb(ca) row FROM cobertura_asignaciones ca WHERE contrato_id=24 AND vinculacion_id IN(249,1555) ORDER BY id`)).rows;
   const affected=(await db.query(`SELECT pg_catalog.to_jsonb(v) row FROM vinculaciones v WHERE id IN(249,1555) ORDER BY id`)).rows;
   const periods=(await db.query(`SELECT pg_catalog.to_jsonb(p) row FROM nomina_periodos p WHERE contrato_id=24 AND id IN(4,6) ORDER BY id`)).rows;
   const attendance=(await db.query(`SELECT pg_catalog.to_jsonb(a) row FROM nomina_asistencia_diaria a WHERE vinculacion_id=1555 AND fecha BETWEEN '2026-08-18'::date AND '2026-09-08'::date OR vinculacion_id=249 AND fecha BETWEEN '2026-07-01'::date AND '2026-07-31'::date ORDER BY id`)).rows;
   return {phase48_state:columns.length===1&&columns[0]?.column_name==='focalizacion_final_id'&&columns[0]?.is_nullable==='NO'&&Object.values(applied).every(v=>v===0)?'NO_APLICADA':'APLICADA_O_PARCIAL',count,candidate_count:candidateCount,
    albeny_before_digest:contractDigest({coverage:coverage.filter(r=>r.row.vinculacion_id===1555),vinculacion:affected.filter(r=>r.row.id===1555),attendance:attendance.filter(r=>r.row.vinculacion_id===1555)}),
    dary_before_digest:contractDigest({coverage:coverage.filter(r=>r.row.vinculacion_id===249),vinculacion:affected.filter(r=>r.row.id===249),attendance:attendance.filter(r=>r.row.vinculacion_id===249)}),
    periods_4_6_digest:contractDigest(periods)};
  },
  verify:async(snapshot:Awaited<ReturnType<typeof historicalSnapshot>>)=>{
   const columns=snapshot.schema.filter(r=>r.table_name==='cobertura_asignaciones');
   assert(columns.filter(r=>['institucion_id','sede_id','modalidad_id'].includes(r.column_name)).length===0&&columns.find(r=>r.column_name==='focalizacion_final_id')?.is_nullable==='NO'&&!snapshot.indexes.some(r=>r.indexname==='idx_cobertura_asignaciones_timeline')&&!snapshot.constraints.some(r=>r.relname==='cobertura_asignaciones'&&/FOREIGN KEY \((institucion_id|sede_id|modalidad_id)\)/.test(r.definition)),'PARTIAL_OR_APPLIED_STATE');
   assert(!(await db.query(`SELECT 1 FROM auditoria WHERE descripcion IN('PHASE48_ATOMIC_15_24_V1','PHASE48_IDENTITIES_15_24_V1','PHASE48_HISTORICAL_15_24_V1') UNION ALL SELECT 1 FROM auditoria_eventos WHERE descripcion IN('PHASE48_ATOMIC_15_24_V1','PHASE48_IDENTITIES_15_24_V1','PHASE48_HISTORICAL_15_24_V1') LIMIT 1`)).rowCount,'PARTIAL_AUDIT_STATE');
   assert(!(await db.query(`SELECT 1 FROM cobertura_asignaciones a JOIN cobertura_asignaciones b ON a.id<b.id AND a.contrato_id=b.contrato_id AND a.vinculacion_id=b.vinculacion_id AND a.activo AND b.activo AND a.fecha_inicio<=COALESCE(b.fecha_fin,'infinity'::date) AND b.fecha_inicio<=COALESCE(a.fecha_fin,'infinity'::date) LIMIT 1`)).rowCount,'ACTIVE_COVERAGE_OVERLAP');
   assert((await db.query(`SELECT pg_catalog.count(*)::int n FROM nomina_periodos WHERE id IN(4,6) AND contrato_id=24 AND estado='ANULADO'`)).rows[0].n===2,'ANNULLED_PERIOD_CHANGED');
   assert(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca LEFT JOIN vinculaciones v ON v.id=ca.vinculacion_id LEFT JOIN contratos c ON c.id=ca.contrato_id WHERE v.id IS NULL OR c.id IS NULL OR v.contrato_id<>ca.contrato_id OR v.empresa_id<>c.empresa_id LIMIT 1`)).rowCount,'TENANT_ORPHAN');
  },
 });
}
