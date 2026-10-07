// Pure rules copied from fd6e4aa; no connection transport or mutation runner.
// The original local runner and LOCAL_RESTORATION_REQUIRED guard remain unchanged.
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
export const phaseSql = () => readFileSync(resolve(__dirname,'../../../sql/phase-48-operational-assignment-identities.sql'),'utf8');

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

export async function actorGate(db:Db,actor:string|undefined){
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

export async function historicalPlan(db:Db){
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

export async function nextId(db:Db,table:string){
 const sequence=(await db.query('SELECT pg_get_serial_sequence($1,\'id\') name',[table])).rows[0].name;
 assert(sequence&&/^public\.[a-z0-9_]+$/.test(sequence),'EXPECTED_SEQUENCE_REQUIRED');
 const value=(await db.query(`SELECT GREATEST(COALESCE((SELECT max(id) FROM ${quote(table)}),0),(SELECT last_value FROM ${sequence}))+1 AS id`)).rows[0].id;
 return {id:String(value),sequence};
}
export async function restartSequence(db:Db,sequence:string,id:string){
 assert(/^\d+$/.test(id),'INVALID_SEQUENCE_ID');
 await db.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${BigInt(id)+1n}`);
}
export function protectedGate(before:Awaited<ReturnType<typeof historicalSnapshot>>,after:Awaited<ReturnType<typeof historicalSnapshot>>,phase:boolean){
 for(const old of before.data)if(!['cobertura_asignaciones','auditoria'].includes(old.table))assert(JSON.stringify(old)===JSON.stringify(after.data.find(r=>r.table===old.table)),'PROTECTED_TABLE_CHANGED:'+old.table);
 for(const old of before.sequences)if(!['cobertura_asignaciones_id_seq','auditoria_id_seq'].includes(old.sequence))assert(JSON.stringify(old)===JSON.stringify(after.sequences.find(r=>r.sequence===old.sequence)),'PROTECTED_SEQUENCE_CHANGED');
 assert(JSON.stringify(before.routines)===JSON.stringify(after.routines)&&JSON.stringify(before.triggers)===JSON.stringify(after.triggers),'APPLICATION_FUNCTION_OR_TRIGGER_CHANGED');
 if(!phase)for(const key of ['schema','constraints','indexes'] as const)assert(JSON.stringify(before[key])===JSON.stringify(after[key]),'SCHEMA_CHANGED');
}
