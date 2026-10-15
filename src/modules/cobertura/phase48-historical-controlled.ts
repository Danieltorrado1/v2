import {sha256HexEqual} from './phase48-sha256';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

type Db = Pick<PoolClient,'query'>;
type Row = Record<string,any>;
export const HISTORICAL_SCOPE = Object.freeze({empresa:15,contrato:24,actor:12});
export const HISTORICAL_MARKER = 'PHASE48_HISTORICAL_15_24_V1';
const phaseMarker = 'PHASE48_IDENTITIES_15_24_V1';
const sha = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assert(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
const quote = (name:string) => '"'+name.replaceAll('"','""')+'"';
const digestSql = (expression:string) => `encode(sha256(convert_to(COALESCE(string_agg(${expression},E'\\n' ORDER BY ${expression}),''),'UTF8')),'hex')`;
const phaseSql = () => readFileSync(resolve(__dirname,'../../../sql/phase-48-operational-assignment-identities.sql'),'utf8');

// This version has NO production transport. A future production executor needs
// a separate authorization, new verified backup and immediate baseline.
export async function assertHistoricalLocalIdentity(db:Db) {
 const r=(await db.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,
 current_setting('server_version') version,current_setting('data_directory') directory,
 current_setting('listen_addresses') listen,current_setting('max_worker_processes') workers,
 current_setting('shared_preload_libraries') preload,current_database() database`)).rows[0];
 assert(r?.host==='127.0.0.1'&&r.port===55465&&r.version==='17.11'
  &&r.directory.replaceAll('\\','/')==='C:/Users/CORE ULTRA/Desktop/V2-instituciones-modalidad/tmp/phase48-historical-cert/cluster'
  &&r.listen==='127.0.0.1'&&r.workers==='0'&&r.preload===''
  &&['phase48_historical','phase48_historical_faults'].includes(r.database),'LOCAL_RESTORATION_REQUIRED');
}

export async function historicalSnapshot(db:Db) {
 const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
 const data:Row[]=[];
 for(const {tablename} of tables){
  const row=(await db.query(`SELECT count(*)::text count,${digestSql('to_jsonb(t)::text')} digest FROM public.${quote(tablename)} t`)).rows[0];
  data.push({table:tablename,...row});
 }
 const schema=(await db.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
 const constraints=(await db.query(`SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname`)).rows;
 const indexes=(await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
 const routines=(await db.query(`SELECT p.oid::regprocedure::text identity,md5(pg_get_functiondef(p.oid)) digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`)).rows;
 const triggers=(await db.query(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
 const sequences:Row[]=[];
 for(const {sequencename} of (await db.query(`SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows){
  sequences.push({sequence:sequencename,...(await db.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0]});
 }
 const snapshot={data,schema,constraints,indexes,routines,triggers,sequences};
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
  assert(sha256HexEqual(sha(attendance),sha(expectedAttendance)),'EXPECTED_HISTORICAL_ATTENDANCE_IDS_CHANGED');
  const target=(await db.query(`SELECT i.id::text institucion_id,s.id::text sede_id,s.municipio_id::text municipio_id,m.id::text modalidad_id,
   i.nombre_institucion institucion,s.nombre_sede sede,COALESCE(m.codigo_original,m.nombre_modalidad) modalidad
   FROM instituciones i JOIN sedes s ON s.institucion_id=i.id CROSS JOIN modalidades m
   WHERE i.id=$1::bigint AND s.id=$2::bigint AND s.municipio_id=$3::bigint AND m.id=$4::bigint AND i.contrato_id=24
   AND i.activo AND s.activo AND m.activo AND (EXISTS(SELECT 1 FROM sede_modalidades sm WHERE sm.contrato_id=24 AND sm.modalidad_id=m.id AND sm.activo)
    OR EXISTS(SELECT 1 FROM calculadora_personal_config cp WHERE cp.contrato_id=24 AND cp.modalidad_id=m.id AND LOWER(cp.estado)='activo'))`,[c.institucion,c.sede,c.municipio,c.modalidad])).rows[0];
  assert(target&&target.modalidad===c.codigo,'EXPECTED_CONTRACT_CONTEXT_MISMATCH');
  const all=(await db.query(`SELECT ca.*,ca.id::text,ca.fecha_inicio::text desde,ca.fecha_fin::text hasta FROM cobertura_asignaciones ca
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
  const expectedId=applied?existing[0].id:c.historica??(await nextId(db,'cobertura_asignaciones')).id;
  plan.push({...c,applied,coverage_id:expectedId,category_id:category,estado_salarial,observation,target,
   periodos_abiertos:periods.filter(r=>r.estado==='ABIERTO').map(r=>r.id),periodos_protegidos:periods.filter(r=>r.estado!=='ABIERTO').map(r=>r.id),
   automatic_recalculation:false,external_sync:false});
 }
 assert(plan.every(p=>p.applied)||plan.every(p=>!p.applied),'PARTIAL_HISTORICAL_APPLICATION');
 return plan;
}

async function nextId(db:Db,table:string){
 const sequence=(await db.query('SELECT pg_get_serial_sequence($1,\'id\') name',[table])).rows[0].name;
 assert(sequence&&/^public\.[a-z0-9_]+$/.test(sequence),'EXPECTED_SEQUENCE_REQUIRED');
 const value=(await db.query(`SELECT GREATEST(COALESCE((SELECT max(id) FROM ${quote(table)}),0),(SELECT last_value FROM ${sequence}))+1 AS id`)).rows[0].id;
 return {id:String(value),sequence};
}
async function restartSequence(db:Db,sequence:string,id:string){
 assert(/^\d+$/.test(id),'INVALID_SEQUENCE_ID');
 await db.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${BigInt(id)+1n}`);
}
async function audit(db:Db,marker:string,actor:string,before:unknown,after:unknown){
 const allocated=await nextId(db,'auditoria');
 const result=await db.query(`INSERT INTO auditoria(id,usuario_id,tabla_afectada,registro_id,accion,descripcion,datos_anteriores,datos_nuevos)
 VALUES($1,$2,'cobertura_asignaciones',NULL,'UPDATE',$3,$4::jsonb,$5::jsonb) RETURNING id`,[allocated.id,actor,marker,JSON.stringify(before),JSON.stringify(after)]);
 assert(result.rowCount===1,'STRICT_AUDIT_FAILED');
 await restartSequence(db,allocated.sequence,allocated.id);
}
function protectedGate(before:Awaited<ReturnType<typeof historicalSnapshot>>,after:Awaited<ReturnType<typeof historicalSnapshot>>,phase:boolean){
 for(const old of before.data)if(!['cobertura_asignaciones','auditoria'].includes(old.table))assert(JSON.stringify(old)===JSON.stringify(after.data.find(r=>r.table===old.table)),'PROTECTED_TABLE_CHANGED:'+old.table);
 for(const old of before.sequences)if(!['cobertura_asignaciones_id_seq','auditoria_id_seq'].includes(old.sequence))assert(JSON.stringify(old)===JSON.stringify(after.sequences.find(r=>r.sequence===old.sequence)),'PROTECTED_SEQUENCE_CHANGED');
 assert(JSON.stringify(before.routines)===JSON.stringify(after.routines)&&JSON.stringify(before.triggers)===JSON.stringify(after.triggers),'APPLICATION_FUNCTION_OR_TRIGGER_CHANGED');
 if(!phase)for(const key of ['schema','constraints','indexes'] as const)assert(JSON.stringify(before[key])===JSON.stringify(after[key]),'SCHEMA_CHANGED');
}

export interface HistoricalRunOptions {
 actor?:string; mode?:'PreviewOnly'|'MutateLocal'; enabled?:boolean;
 confirmation?:string; baseline?:string; revision?:string; failAt?:'after-first-correction'|'after-audit'|'after-phase-ddl';
}
export async function runPhase48HistoricalLocal(db:Db,operation:'Phase48'|'HistoricalCorrections',options:HistoricalRunOptions={}){
 assert(['Phase48','HistoricalCorrections'].includes(operation),'INVALID_OPERATION');
 const mode=options.mode??'PreviewOnly';assert(['PreviewOnly','MutateLocal'].includes(mode),'INVALID_MODE');
 if(mode==='MutateLocal')assert(options.enabled===true&&options.confirmation===`LOCAL_ONLY:${operation}:15:24`
  &&/^[a-f0-9]{64}$/.test(options.baseline??'')&&/^[a-f0-9]{64}$/.test(options.revision??''),'LOCAL_CONFIRMATION_AND_BASELINE_REQUIRED');
 await assertHistoricalLocalIdentity(db);
 await db.query(mode==='PreviewOnly'?'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");
  assert((await db.query('SELECT pg_try_advisory_xact_lock(15,2448) locked')).rows[0].locked,'ADVISORY_LOCK_BUSY');
  if(mode==='MutateLocal'){
   const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
   await db.query(`LOCK TABLE ${tables.map(r=>'public.'+quote(r.tablename)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  }
  await actorGate(db,options.actor);
  const before=await historicalSnapshot(db);
  if(mode==='MutateLocal')assert(sha256HexEqual(options.baseline,before.digest),'IMMEDIATE_BASELINE_CHANGED');
  const columns=before.schema.filter(r=>r.table_name==='cobertura_asignaciones');
  const identities=columns.filter(r=>['institucion_id','sede_id','modalidad_id'].includes(r.column_name));
  assert(identities.length===0||identities.length===3&&identities.every(r=>r.data_type==='bigint'&&r.is_nullable==='YES'),'PARTIAL_PHASE48_SCHEMA');
  const sql=phaseSql();
  let plan:Row[]=[];let applied=false;
  const marker=operation==='Phase48'?phaseMarker:HISTORICAL_MARKER;
  const audits=(await db.query('SELECT id::text,datos_nuevos FROM auditoria WHERE descripcion=$1 ORDER BY id',[marker])).rows;
  assert(audits.length<=1,'DUPLICATE_OPERATION_AUDIT');
  if(operation==='Phase48'){
   if(identities.length===3){
    assert(columns.find(r=>r.column_name==='focalizacion_final_id')?.is_nullable==='YES','INCOMPLETE_PHASE48_NULLABILITY');
    assert(before.constraints.filter(r=>r.relname==='cobertura_asignaciones'&&r.definition.startsWith('FOREIGN KEY')&&/\((institucion_id|sede_id|modalidad_id)\)/.test(r.definition)).length===3,'INCOMPLETE_PHASE48_FKS');
    assert(before.indexes.some(r=>r.indexname==='idx_cobertura_asignaciones_timeline'),'INCOMPLETE_PHASE48_INDEX');
    assert(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id WHERE ca.contrato_id=24 AND (ca.institucion_id IS DISTINCT FROM ff.institucion_id OR ca.sede_id IS DISTINCT FROM ff.sede_id OR ca.modalidad_id IS DISTINCT FROM ff.modalidad_id) LIMIT 1`)).rowCount,'PHASE48_IDENTITY_MISMATCH');
    applied=true;
   }
   assert(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id WHERE ca.contrato_id<>ff.contrato_id LIMIT 1`)).rowCount,'CROSS_CONTRACT_FOCALIZATION');
   // The generic migration is global. Refuse it if its backfill would write
   // any identity outside the authorized tenant/contract.
   const otherPredicate=identities.length?'AND ca.institucion_id IS NULL AND ca.sede_id IS NULL AND ca.modalidad_id IS NULL':'';
   assert(!(await db.query(`SELECT 1 FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id JOIN contratos c ON c.id=ca.contrato_id WHERE (c.id<>24 OR c.empresa_id<>15) ${otherPredicate} LIMIT 1`)).rowCount,'PHASE48_BACKFILL_OUTSIDE_SCOPE');
   const identitiesToFill=(await db.query(`SELECT ca.id::text cobertura_id,ff.institucion_id::text,ff.sede_id::text,ff.modalidad_id::text
    FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id
    JOIN contratos c ON c.id=ca.contrato_id WHERE c.id=24 AND c.empresa_id=15 ${otherPredicate} ORDER BY ca.id`)).rows;
   plan=[{schema_columns:['institucion_id','sede_id','modalidad_id'],focalizacion_nullable:true,index:'idx_cobertura_asignaciones_timeline',
    backfill_count:identitiesToFill.length,expected_identities:identitiesToFill,backfill_digest:sha(identitiesToFill)}];
  }else{
   assert(identities.length===3,'PHASE48_REQUIRED');plan=await historicalPlan(db);applied=plan.every(r=>r.applied);
   assert(applied===Boolean(audits.length),'HISTORICAL_AUDIT_OR_STATE_MISMATCH');
  }
  const preview={status:applied?'ALREADY_APPLIED':'PREVIEW_ONLY',operation,baseline:before.digest,sql_sha256:createHash('sha256').update(sql).digest('hex'),scope:HISTORICAL_SCOPE,
   plan,writes:0,production_transport:'DISABLED',requires_new_production_backup:true};
  const revision=sha(preview);
  if(mode==='MutateLocal')assert(options.revision===revision,'PREVIEW_REVISION_CHANGED');
  if(mode==='PreviewOnly'||applied){await db.query('ROLLBACK');return {...preview,revision,before,after:before};}
  const originalCoverage=(await db.query(`SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca ORDER BY id`)).rows.map(r=>r.row);
  if(operation==='Phase48'){
   await db.query(sql);
   if(options.failAt==='after-phase-ddl')throw Error('INDUCED_FAILURE_AFTER_PHASE_DDL');
   const afterRows=(await db.query(`SELECT to_jsonb(ca)-'institucion_id'-'sede_id'-'modalidad_id' row FROM cobertura_asignaciones ca ORDER BY id`)).rows.map(r=>r.row);
   assert(sha256HexEqual(sha(originalCoverage),sha(afterRows)),'PHASE48_CHANGED_EXISTING_COVERAGE');
   const actual=(await db.query(`SELECT ca.id::text cobertura_id,ca.institucion_id::text,ca.sede_id::text,ca.modalidad_id::text
    FROM cobertura_asignaciones ca WHERE ca.id=ANY($1::bigint[]) ORDER BY ca.id`,[plan[0]!.expected_identities.map((r:Row)=>r.cobertura_id)])).rows;
   assert(sha256HexEqual(sha(actual),sha(plan[0]!.expected_identities)),'PHASE48_BACKFILL_POSTFLIGHT_FAILED');
  }else{
   for(let i=0;i<plan.length;i++){
    const p=plan[i]!;
    if(p.historica){
     const r=await db.query(`UPDATE cobertura_asignaciones SET activo=TRUE,observacion=$1 WHERE id=$2::bigint AND vinculacion_id=$3::bigint AND contrato_id=24 AND NOT activo RETURNING id`,[p.observation,p.historica,p.vinculacion]);
     assert(r.rowCount===1,'HISTORICAL_REACTIVATION_FAILED');
    }else{
     const allocated=await nextId(db,'cobertura_asignaciones');
     assert(allocated.id===p.coverage_id,'EXPECTED_NEW_COVERAGE_ID_CHANGED');
     const r=await db.query(`INSERT INTO cobertura_asignaciones(id,contrato_id,vinculacion_id,municipio_id,focalizacion_final_id,institucion_id,sede_id,modalidad_id,
      institucion,sede,modalidad,tipo_asignacion,porcentaje_cobertura,fecha_inicio,fecha_fin,observacion,activo)
      VALUES($1,24,$2,$3,NULL,$4,$5,$6,$7,$8,$9,'PRINCIPAL',1,$10,$11,$12,TRUE) RETURNING id`,
      [allocated.id,p.vinculacion,p.municipio,p.institucion,p.sede,p.modalidad,p.target.institucion,p.target.sede,p.codigo,p.desde,p.hasta,p.observation]);
     assert(r.rowCount===1,'HISTORICAL_INSERT_FAILED');await restartSequence(db,allocated.sequence,allocated.id);
    }
    if(i===0&&options.failAt==='after-first-correction')throw Error('INDUCED_FAILURE_AFTER_FIRST_CORRECTION');
   }
   const remaining=(await db.query(`SELECT to_jsonb(ca) row FROM cobertura_asignaciones ca WHERE id=ANY($1::bigint[]) ORDER BY id`,[originalCoverage.filter(r=>r.id!==11).map(r=>r.id)])).rows.map(r=>r.row);
   assert(sha256HexEqual(sha(originalCoverage.filter(r=>r.id!==11)),sha(remaining)),'EXISTING_COVERAGE_CHANGED');
   const old=originalCoverage.find(r=>r.id===11);const current=(await db.query(`SELECT to_jsonb(ca)-'activo'-'observacion' row FROM cobertura_asignaciones ca WHERE id=11`)).rows[0].row;
   const {activo:ignoredActive,observacion:ignoredObservation,...rest}=old;
   assert(sha256HexEqual(sha(rest),sha(current)),'HISTORICAL_11_OTHER_FIELDS_CHANGED');
   plan=await historicalPlan(db);assert(plan.every(r=>r.applied),'HISTORICAL_POSTFLIGHT_FAILED');
  }
  const afterData=await historicalSnapshot(db);protectedGate(before,afterData,operation==='Phase48');
  await audit(db,marker,options.actor!,{baseline:before.digest,tables:before.data},{operation,plan,tables:afterData.data,automatic_recalculation:false,external_sync:false});
  if(options.failAt==='after-audit')throw Error('INDUCED_FAILURE_AFTER_AUDIT');
  const after=await historicalSnapshot(db);protectedGate(before,after,operation==='Phase48');
  assert(after.data.find(r=>r.table==='auditoria')!.count===String(BigInt(before.data.find(r=>r.table==='auditoria')!.count)+1n),'STRICT_AUDIT_COUNT_FAILED');
  await db.query('COMMIT');return {...preview,revision,status:'APPLIED_LOCAL',plan,
   writes:operation==='Phase48'?plan[0]!.backfill_count+1:3,coverage_rows_changed:operation==='Phase48'?plan[0]!.backfill_count:2,new_audits:1,before,after};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
