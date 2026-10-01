import type { Client, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertCertifiedSnapshot, APPROVED_SHA256, canonicalHash, hash, metrics, SCOPE } from './septiembre-controlled-preview';
import { calculateCoverageFromRule } from './cobertura.focalizacion.domain';
import { loadCoverageRuleForContext } from './cobertura.rules.service';

export const CERTIFIED_DIGEST = 'bfb2204f4a89b9fad18045a1a14ec128cbfe322a9bfc04a287c545f0e7b4f38e';
type Row = Record<string, any>;
type Db = Client;
const key = (r: Row) => r.sede_id+'|'+r.modalidad_id;
export const MONTHLY_WRITE_TABLES = ['focalizacion_cargas','focalizacion_preliminar','focalizacion_vigencias','focalizacion_final','historial_cambios','auditoria','auditoria_eventos'];
const quote = (s:string)=>'"'+s.replace(/"/g,'""')+'"';
export async function publicFingerprint(c:Db, excluded:string[]=[]) {
 const result:Row={};
 for(const {tablename} of (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){
  if(excluded.includes(tablename))continue;
  const rows=(await c.query(`SELECT to_jsonb(t) value FROM public.${quote(tablename)} t`)).rows;
  result[tablename]={count:rows.length,digest:canonicalHash(rows.map(r=>canonicalHash(r.value)).sort())};
 }
 return result;
}
export async function sequenceFingerprint(c:Db) {
 const result:Row={};
 for(const {sequencename}of(await c.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows)result[sequencename]=(await c.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0];
 return result;
}
async function augustHistory(c:Db) {
 const result:Row={};
 for(const table of ['focalizacion_cargas','focalizacion_preliminar','focalizacion_vigencias'])result[table]=(await c.query(`SELECT to_jsonb(t) value FROM ${table} t WHERE ${table==='focalizacion_cargas'?'id':'carga_id'}=4 ORDER BY id`)).rows;
 return canonicalHash(result);
}

/** Existing projection IDs/keys remain stable. New combinations have an ID-based key
 * even when the optional legacy sede_modalidades catalogue link does not exist. */
export function newProjectionKey(sede: string, modalidad: string) {
 if (!/^\d+$/.test(sede) || !/^\d+$/.test(modalidad)) throw Error('INVALID_PROJECTION_IDENTITY');
 return `sede:${sede}|modalidad:${modalidad}`;
}

async function assertLocal(c: Db) {
 const row=(await c.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version') version,current_setting('data_directory') directory,current_setting('listen_addresses') listen,current_setting('max_worker_processes') workers,current_setting('max_logical_replication_workers') logical_workers,current_setting('shared_preload_libraries') preload")).rows[0];
 if (row.host!=='127.0.0.1'||row.port!==55440||!['septiembre_local','septiembre_temporal_rollback'].includes(row.db)||row.version!=='17.11'||!String(row.directory).replace(/\\/g,'/').endsWith('/.worktrees/septiembre-importacion-controlada/tmp/septiembre-mutator-cluster')||row.listen!=='127.0.0.1'||row.workers!=='0'||row.logical_workers!=='0'||row.preload!=='') throw Error('LOCAL_RESTORATION_ONLY');
 return row;
}

export async function septemberPostflight(c: Db, snapshot: Row, load: string) {
 const results=(await c.query(`SELECT fp.fila_origen fila,fv.municipio_id::text,fv.institucion_id::text,fv.sede_id::text,fv.modalidad_id::text,i.municipio_id::text catalogo_institucion_municipio_id,s.municipio_id::text catalogo_sede_municipio_id,fv.techo_primaria,fv.techo_secundaria,fv.techo_total,fv.focalizacion_primaria,fv.focalizacion_secundaria,fv.focalizacion_total,fv.regla_config_id::int rule_id,fv.cobertura_requerida personal FROM focalizacion_vigencias fv JOIN focalizacion_preliminar fp ON fp.id=fv.preliminar_id AND fp.carga_id=fv.carga_id JOIN instituciones i ON i.id=fv.institucion_id JOIN sedes s ON s.id=fv.sede_id WHERE fv.contrato_id=24 AND fv.carga_id=$1 AND fv.activo AND fv.vigente_desde='2026-09-01' AND fv.vigente_hasta='2026-09-30' ORDER BY fv.sede_id,fv.modalidad_id`,[load])).rows.map(r=>({...r,reasons:[]}));
 const digest=canonicalHash({scope:snapshot.scope,source:snapshot.source.sha256,rows:results});
 if(results.length!==688||new Set(results.map(key)).size!==688||digest!==CERTIFIED_DIGEST)throw Error('POSTFLIGHT_CERTIFIED_SET_MISMATCH');
 const counts=(await c.query(`SELECT (SELECT count(*)::int FROM focalizacion_preliminar WHERE carga_id=$1) preliminares,(SELECT count(*)::int FROM focalizacion_final WHERE contrato_id=24 AND activo) active_projection,(SELECT count(*)::int FROM focalizacion_final WHERE contrato_id=24 AND activo AND carga_id=$1) monthly_projection,(SELECT count(*)::int FROM focalizacion_cargas WHERE contrato_id=24 AND fecha_inicio_vigencia='2026-09-01') loads,(SELECT count(*)::int FROM focalizacion_vigencias a JOIN focalizacion_vigencias b ON a.id<b.id AND a.contrato_id=b.contrato_id AND a.sede_id=b.sede_id AND a.modalidad_id=b.modalidad_id AND a.activo AND b.activo AND a.vigente_desde<=COALESCE(b.vigente_hasta,'infinity'::date) AND b.vigente_desde<=COALESCE(a.vigente_hasta,'infinity'::date) WHERE a.contrato_id=24) "overlaps",(SELECT count(*)::int FROM (SELECT sede_id,modalidad_id FROM focalizacion_final WHERE contrato_id=24 AND activo GROUP BY sede_id,modalidad_id HAVING count(*)>1) d) duplicates`,[load])).rows[0];
 if(Object.entries(counts).some(([k,v])=>Number(v)!==({preliminares:688,active_projection:688,monthly_projection:688,loads:1,overlaps:0,duplicates:0} as Row)[k]))throw Error('POSTFLIGHT_COUNTS_MISMATCH');
 const exclusions=(await c.query('SELECT fila_origen FROM focalizacion_preliminar WHERE carga_id=$1 AND fila_origen=ANY($2::int[])',[load,[691,692,693,697,699]])).rows;
 if(exclusions.length)throw Error('EXCLUDED_ROW_INSERTED');
 const inconsistent=(await c.query(`SELECT ff.id FROM focalizacion_final ff JOIN focalizacion_preliminar fp ON fp.id=ff.preliminar_id JOIN focalizacion_vigencias fv ON fv.preliminar_id=fp.id AND fv.carga_id=fp.carga_id WHERE ff.contrato_id=24 AND ff.activo AND (ff.carga_id IS DISTINCT FROM $1 OR ff.institucion_id IS DISTINCT FROM fv.institucion_id OR ff.sede_id IS DISTINCT FROM fv.sede_id OR ff.modalidad_id IS DISTINCT FROM fv.modalidad_id OR ff.municipio_id IS DISTINCT FROM fv.municipio_id OR ff.cupos_aprobados IS DISTINCT FROM fv.focalizacion_total OR ff.cupos_primaria IS DISTINCT FROM fv.focalizacion_primaria OR ff.cupos_secundaria IS DISTINCT FROM fv.focalizacion_secundaria OR ff.cobertura_requerida IS DISTINCT FROM fv.cobertura_requerida OR ff.vigente_desde IS DISTINCT FROM fv.vigente_desde OR ff.vigente_hasta IS DISTINCT FROM fv.vigente_hasta OR fp.focalizacion_vigencia_id IS DISTINCT FROM fv.id)`,[load])).rows;
 if(inconsistent.length)throw Error('PROJECTION_NOT_DERIVED_FROM_VIGENCIA');
 return {digest,rows:results.length,...counts,excluded_rows_inserted:0,positions:results.reduce((n,r)=>n+r.personal,0)};
}

/** Deliberately local-only until integration. Owns one transaction, lock and strict audits. */
export async function publishSeptemberLocal(c: Db, snapshot: Row, sources: Map<number,Row>, options: {mode?:'PreviewOnly'|'MutateLocal';confirmation?:string;failAfter?:number;fault?:'audit'|'postflight'}={}) {
 const mode=options.mode??'PreviewOnly';
 if(!['PreviewOnly','MutateLocal'].includes(mode)||mode==='MutateLocal'&&options.confirmation!=='LOCAL_RESTORATION_ONLY')throw Error('LOCAL_MUTATION_CONFIRMATION_REQUIRED');
 assertCertifiedSnapshot(snapshot,CERTIFIED_DIGEST);
 for(const r of snapshot.rows)if(metrics.some(k=>sources.get(r.fila)?.[k]!==r[k]))throw Error('SOURCE_METRICS_CHANGED');
 await assertLocal(c);
 await c.query(mode==='PreviewOnly'?'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE');
 try {
  await c.query("SET LOCAL statement_timeout='30s'"); await c.query("SET LOCAL lock_timeout='3s'");
  if(!(await c.query('SELECT pg_try_advisory_xact_lock(15,24092026) locked')).rows[0].locked)throw Error('MONTHLY_LOCK_BUSY');
  // The current projection is shared across months: protect it against other writers too.
  if(mode==='MutateLocal')await c.query('LOCK TABLE focalizacion_cargas,focalizacion_preliminar,focalizacion_vigencias,focalizacion_final IN SHARE ROW EXCLUSIVE MODE');
  if((await c.query('SELECT count(*)::int n FROM pg_locks WHERE NOT granted')).rows[0].n)throw Error('WAITING_LOCKS_PRESENT');
  const actor=(await c.query("SELECT u.id FROM usuarios u JOIN usuario_empresas ue ON ue.usuario_id=u.id JOIN usuario_contratos uc ON uc.usuario_id=u.id WHERE u.id=12 AND u.activo AND ue.empresa_id=15 AND ue.activo AND uc.contrato_id=24 AND uc.activo AND EXISTS(SELECT 1 FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id JOIN rol_permisos rp ON rp.rol_id=r.id JOIN permisos p ON p.id=rp.permiso_id WHERE ur.usuario_id=u.id AND ur.activo AND r.activo AND rp.activo AND p.activo AND p.modulo='cobertura' AND p.accion='update')")).rows;
  const contract=(await c.query('SELECT activo,fecha_inicio::text,fecha_finalizacion::text FROM contratos WHERE id=24 AND empresa_id=15')).rows[0];
  if(actor.length!==1||!contract?.activo||contract.fecha_inicio>SCOPE.desde||contract.fecha_finalizacion<SCOPE.hasta)throw Error('ACTOR_TENANT_CONTRACT_INVALID');
  const august=(await c.query('SELECT municipio_id::text,institucion_id::text,sede_id::text,modalidad_id::text,techo_primaria,techo_secundaria,techo_total,focalizacion_primaria,focalizacion_secundaria,focalizacion_total,cobertura_requerida,vigente_desde::text,vigente_hasta::text FROM focalizacion_vigencias WHERE contrato_id=24 AND carga_id=4 ORDER BY id')).rows;
  if(august.length!==687||hash(august)!==snapshot.august_digest)throw Error('AUGUST_BASELINE_CHANGED');
  const existing=(await c.query("SELECT id::text,estado,archivo_sha256,fecha_inicio_vigencia::text,fecha_fin_vigencia::text,resumen_json FROM focalizacion_cargas WHERE contrato_id=24 AND ((fecha_inicio_vigencia<='2026-09-30' AND fecha_fin_vigencia>='2026-09-01') OR archivo_sha256=$1)",[APPROVED_SHA256])).rows;
  if(existing.length){
   const load=existing[0]!;
   if(existing.length!==1||load.estado!=='PROCESADO'||load.archivo_sha256!==APPROVED_SHA256||load.fecha_inicio_vigencia!==SCOPE.desde||load.fecha_fin_vigencia!==SCOPE.hasta||load.resumen_json?.certified_digest!==CERTIFIED_DIGEST)throw Error('SEPTEMBER_PARTIAL_OR_CONFLICT');
   const postflight=await septemberPostflight(c,snapshot,load.id);
   const audit=(await c.query("SELECT (SELECT count(*)::int FROM auditoria WHERE tabla_afectada='focalizacion_cargas' AND registro_id=$1 AND datos_nuevos->>'run_id'=$2) legacy,(SELECT count(*)::int FROM auditoria_eventos WHERE entidad='focalizacion_cargas' AND entidad_id=$1::text AND datos_nuevos->>'run_id'=$2 AND usuario_id=12 AND empresa_id=15 AND contrato_id=24) events",[load.id,load.resumen_json.run_id])).rows[0];
   if(audit.legacy!==1||audit.events!==1)throw Error('IDEMPOTENCY_AUDIT_MISSING');
   await c.query('ROLLBACK'); return {status:'ALREADY_APPLIED',writes:0,load_id:load.id,run_id:load.resumen_json.run_id,postflight};
  }
  const protectedBefore=await publicFingerprint(c,MONTHLY_WRITE_TABLES);
  const augustBefore=await augustHistory(c);
  // Revalidate technical identities and rules in the locked transaction, never create catalogues.
  const rules=new Map<string,any>();
  for(const r of snapshot.rows){
   const ids=(await c.query('SELECT i.id FROM instituciones i JOIN sedes s ON s.institucion_id=i.id JOIN modalidades m ON m.id=$3 WHERE i.id=$1 AND s.id=$2 AND i.contrato_id=24 AND i.municipio_id=$4 AND s.municipio_id=$4',[r.institucion_id,r.sede_id,r.modalidad_id,r.municipio_id])).rows;
   if(ids.length!==1)throw Error('IDENTITY_CHANGED:'+r.fila);
   if(!rules.has(r.modalidad_id)){
    const start=await loadCoverageRuleForContext(c as unknown as PoolClient,{contratoId:24,modalidadId:Number(r.modalidad_id),fechaVigencia:SCOPE.desde});
    const end=await loadCoverageRuleForContext(c as unknown as PoolClient,{contratoId:24,modalidadId:Number(r.modalidad_id),fechaVigencia:SCOPE.hasta});
    if(!start||start.id!==end?.id)throw Error('COVERAGE_RULE_CHANGED'); rules.set(r.modalidad_id,start);
   }
   const rule=rules.get(r.modalidad_id), coverage=calculateCoverageFromRule(rule,r.focalizacion_total);
   if(rule.id!==r.rule_id||coverage.status!=='OK'||coverage.manipuladores_requeridos!==r.personal)throw Error('COVERAGE_CHANGED:'+r.fila);
  }
  if((await c.query("SELECT id FROM calculadora_personal_config WHERE estado='activo' AND COALESCE(dominio_calculo,'GENERAL')='COBERTURA_PAE' AND (contrato_id=24 OR contrato_id IS NULL) AND vigencia_desde<='2026-09-30' AND (vigencia_hasta IS NULL OR vigencia_hasta>='2026-09-01') AND (vigencia_desde>'2026-09-01' OR (vigencia_hasta IS NOT NULL AND vigencia_hasta<'2026-09-30'))")).rows.length)throw Error('INTRAMONTH_RULE_TRANSITION');
  const finals=(await c.query('SELECT * FROM focalizacion_final WHERE contrato_id=24 ORDER BY id')).rows;
  const byIdentity=new Map<string,Row>();
  for(const f of finals){if(byIdentity.has(key(f)))throw Error('AMBIGUOUS_PROJECTION_IDENTITY');byIdentity.set(key(f),f);}
  const target=new Set(snapshot.rows.map(key)), removed=finals.filter(f=>f.activo&&!target.has(key(f)));
  const updates=snapshot.rows.filter((r:Row)=>byIdentity.has(key(r))).length, additions=688-updates;
  if(updates!==663||additions!==25||removed.length!==24)throw Error('UNEXPLAINED_PROJECTION_DELTA');
  if(mode==='PreviewOnly'){await c.query('ROLLBACK');return {status:'PREVIEW_ONLY',writes:0,rows:688,updates:snapshot.rows.filter((r:Row)=>byIdentity.has(key(r))).length,additions:snapshot.rows.filter((r:Row)=>!byIdentity.has(key(r))).length,removals:removed.length,digest:CERTIFIED_DIGEST};}
  const run=randomUUID();
  const load=(await c.query("INSERT INTO focalizacion_cargas(contrato_id,nombre_archivo,periodo,usuario_carga_id,created_by,estado,fecha_inicio_vigencia,fecha_fin_vigencia,archivo_sha256,total_filas,resumen_json) VALUES(24,'focalizacion-septiembre-2026.xlsx','2026-09',12,12,'PROCESANDO','2026-09-01','2026-09-30',$1,688,$2::jsonb) RETURNING id::text",[APPROVED_SHA256,JSON.stringify({run_id:run,certified_digest:CERTIFIED_DIGEST})])).rows[0].id;
  const history=async(id:string|number,before:unknown,after:unknown,table='focalizacion_final')=>{await c.query('INSERT INTO historial_cambios(usuario_id,tabla_afectada,registro_id,campo,valor_anterior,valor_nuevo,motivo) VALUES(12,$1,$2,\'PUBLICACION_MENSUAL\',$3,$4,$5)',[table,id,before===null?null:JSON.stringify(before),JSON.stringify(after),run]);};
  for(const f of removed){await c.query('UPDATE focalizacion_final SET activo=FALSE,updated_at=now() WHERE id=$1 AND contrato_id=24',[f.id]);await history(f.id,f,{activo:false});}
  let processed=0;
  for(const r of snapshot.rows){
   const s=sources.get(r.fila)!, old=byIdentity.get(key(r));
   const clave=old?.clave_sede_modalidad??newProjectionKey(r.sede_id,r.modalidad_id);
   const prelim=(await c.query(`INSERT INTO focalizacion_preliminar(carga_id,contrato_id,municipio_id,municipio_texto,institucion_original,sede_original,consecutivo_original,modalidad_original,cupos_reportados,cupos_primaria,cupos_secundaria,techo_primaria,techo_secundaria,techo_total,fila_origen,institucion_id_resuelta,sede_id_resuelta,modalidad_id_resuelta,cobertura_requerida,fila_metadata,clave_sede_modalidad,estado_procesamiento) VALUES($1,24,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,'PROCESADA') RETURNING id::text`,[load,r.municipio_id,s.municipio,s.institucion,s.sede,String(s.consecutivo),s.modalidad,r.focalizacion_total,r.focalizacion_primaria,r.focalizacion_secundaria,r.techo_primaria,r.techo_secundaria,r.techo_total,r.fila,r.institucion_id,r.sede_id,r.modalidad_id,r.personal,JSON.stringify({run_id:run,fila:r.fila}),clave])).rows[0].id;
   const vigencia=(await c.query(`INSERT INTO focalizacion_vigencias(contrato_id,municipio_id,institucion_id,sede_id,modalidad_id,carga_id,preliminar_id,regla_config_id,focalizacion_total,focalizacion_primaria,focalizacion_secundaria,techo_total,techo_primaria,techo_secundaria,vigente_desde,vigente_hasta,cobertura_requerida,cobertura_estado,created_by,motivo) VALUES(24,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'2026-09-01','2026-09-30',$14,'OK',12,$15) RETURNING id::text`,[r.municipio_id,r.institucion_id,r.sede_id,r.modalidad_id,load,prelim,r.rule_id,r.focalizacion_total,r.focalizacion_primaria,r.focalizacion_secundaria,r.techo_total,r.techo_primaria,r.techo_secundaria,r.personal,run])).rows[0].id;
   await c.query('UPDATE focalizacion_preliminar SET focalizacion_vigencia_id=$2 WHERE id=$1',[prelim,vigencia]);
   const sm=(await c.query('SELECT id FROM sede_modalidades WHERE contrato_id=24 AND sede_id=$1 AND modalidad_id=$2',[r.sede_id,r.modalidad_id])).rows;
   if(sm.length>1)throw Error('AMBIGUOUS_SITE_MODE');
   const values=[prelim,load,r.municipio_id,s.institucion,s.sede,String(s.consecutivo),s.modalidad,r.focalizacion_total,r.focalizacion_primaria,r.focalizacion_secundaria,r.institucion_id,r.sede_id,r.modalidad_id,old?.sede_modalidad_id??sm[0]?.id??null,clave,r.personal];
   let id=old?.id;
   if(old){await c.query(`UPDATE focalizacion_final SET preliminar_id=$1,carga_id=$2,municipio_id=$3,municipio_texto=(SELECT nombre_municipio FROM municipios WHERE id=$3),institucion_final=$4,sede_final=$5,consecutivo_final=$6,modalidad_final=$7,cupos_aprobados=$8,cupos_primaria=$9,cupos_secundaria=$10,institucion_id=$11,sede_id=$12,modalidad_id=$13,sede_modalidad_id=$14,clave_sede_modalidad=$15,cobertura_requerida=$16,cobertura_estado='OK',vigente_desde='2026-09-01',vigente_hasta='2026-09-30',activo=TRUE,estado_validacion='APROBADO',updated_at=now() WHERE id=$17 AND contrato_id=24`,[...values,id]);}
   else{id=(await c.query(`INSERT INTO focalizacion_final(preliminar_id,carga_id,contrato_id,municipio_id,municipio_texto,institucion_final,sede_final,consecutivo_final,modalidad_final,cupos_aprobados,cupos_primaria,cupos_secundaria,institucion_id,sede_id,modalidad_id,sede_modalidad_id,clave_sede_modalidad,cobertura_requerida,cobertura_estado,vigente_desde,vigente_hasta,estado_validacion) VALUES($1,$2,24,$3,(SELECT nombre_municipio FROM municipios WHERE id=$3),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'OK','2026-09-01','2026-09-30','APROBADO') RETURNING id::text`,values)).rows[0].id;}
   await history(id,old??null,{...r,carga_id:load,preliminar_id:prelim,run_id:run});
   if(++processed===options.failAfter)throw Error('INDUCED_FAILURE_AT_'+processed);
  }
  const postflight=await septemberPostflight(c,snapshot,load);
  if(options.fault==='postflight')throw Error('INDUCED_POSTFLIGHT_FAILURE');
  if(augustBefore!==await augustHistory(c)||canonicalHash(protectedBefore)!==canonicalHash(await publicFingerprint(c,MONTHLY_WRITE_TABLES)))throw Error('PROTECTED_TABLE_CHANGED');
  const summary={run_id:run,certified_digest:CERTIFIED_DIGEST,rows:688,updated:updates,inserted:additions,removed:removed.length,protected_tables_verified:Object.keys(protectedBefore).length,august_history_intact:true,postflight};
  await c.query("INSERT INTO auditoria(usuario_id,tabla_afectada,registro_id,accion,datos_nuevos) VALUES(12,'focalizacion_cargas',$1,'PUBLICACION_MENSUAL',$2::jsonb)",[load,JSON.stringify(summary)]);
  if(options.fault==='audit')throw Error('INDUCED_AUDIT_FAILURE');
  await c.query("INSERT INTO auditoria_eventos(usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,datos_nuevos) VALUES(12,15,24,'cobertura','focalizacion_cargas',$1,'PUBLICACION_MENSUAL',$2::jsonb)",[load,JSON.stringify(summary)]);
  await c.query("UPDATE focalizacion_cargas SET estado='PROCESADO',filas_procesadas=688,resumen_json=$2::jsonb WHERE id=$1",[load,JSON.stringify(summary)]);
  await c.query('COMMIT'); return {status:'APPLIED_LOCAL',load_id:load,...summary};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
