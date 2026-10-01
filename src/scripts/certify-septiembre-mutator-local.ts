/** Local certification only. No production connector, endpoint or commit path. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { assertCertifiedSnapshot, APPROVED_SHA256, canonicalHash, hash, inspectWorkbook, metrics, SCOPE } from '../modules/cobertura/septiembre-controlled-preview';

const DIGEST = 'bfb2204f4a89b9fad18045a1a14ec128cbfe322a9bfc04a287c545f0e7b4f38e';
const BACKUP_SHA = '2e2f0608f609e2e3123e6bfdf56067bae08f11719cc3939ca73d0cdc387f0bc1';
const BACKUP = 'C:/Users/CORE ULTRA/Documents/EmpiriaBackups/focalizacion-septiembre-pre-import-retry-20261001T125631Z';
const CLUSTER = resolve('tmp/septiembre-mutator-cluster').replace(/\\/g, '/');
// The official ignored XLSX is preserved in the original workspace; read it only.
const SOURCE = resolve('../../data/focalizacion-septiembre-2026.xlsx');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
type Row = Record<string, any>;

export function assertLocalArguments(args: string[]) {
 if (args.length > 1 || (args[0] !== undefined && args[0] !== '--simulate-local')) throw Error('LOCAL_ONLY_PRODUCTION_MUTATION_DISABLED');
 return args[0] === '--simulate-local' ? 'SimulateLocal' : 'PreviewOnly';
}

// Hash every restored public table. Only counts and digests are persisted.
async function fingerprint(c: Client) {
 const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result: Record<string, {count: number; digest: string}> = {};
 for (const {tablename} of tables) {
  const rows = (await c.query(`SELECT to_jsonb(t) AS value FROM public.${quote(tablename)} t`)).rows;
  result[tablename] = {count: rows.length, digest: canonicalHash(rows.map(r => canonicalHash(r.value)).sort())};
 }
 return result;
}

async function sequences(c: Client) {
 const names = (await c.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
 const result: Record<string, unknown> = {};
 for (const {sequencename} of names) result[sequencename] = (await c.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0];
 return result;
}

async function lockAndValidate(c: Client, snapshot: Row) {
 await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 await c.query("SET LOCAL statement_timeout='30s'");
 await c.query("SET LOCAL lock_timeout='3s'");
 if (!(await c.query('SELECT pg_try_advisory_xact_lock(15,24092026) locked')).rows[0].locked) throw Error('MONTHLY_LOCK_BUSY');
 const instance = (await c.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version') version,current_setting('data_directory') directory,current_setting('max_worker_processes') workers,current_setting('max_logical_replication_workers') logical_workers,current_setting('shared_preload_libraries') preload,current_setting('listen_addresses') listen")).rows[0];
 if (instance.db !== 'septiembre_local' || instance.host !== '127.0.0.1' || instance.port !== 55440 || !String(instance.version).startsWith('17.11') || instance.directory.replace(/\\/g, '/') !== CLUSTER || instance.workers !== '0' || instance.logical_workers !== '0' || instance.preload !== '' || instance.listen !== '127.0.0.1') throw Error('ISOLATED_PG1711_REQUIRED');
 const contract = (await c.query('SELECT activo,fecha_inicio::text,fecha_finalizacion::text FROM contratos WHERE id=24 AND empresa_id=15')).rows[0];
 if (!contract?.activo || contract.fecha_inicio > SCOPE.desde || contract.fecha_finalizacion < SCOPE.hasta) throw Error('TENANT_CONTRACT_DATE_INVALID');
 const actor = (await c.query('SELECT u.id FROM usuarios u JOIN usuario_empresas ue ON ue.usuario_id=u.id WHERE u.id=12 AND u.activo AND ue.empresa_id=15 AND ue.activo')).rows;
 const permission = (await c.query("SELECT p.id FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id JOIN rol_permisos rp ON rp.rol_id=r.id JOIN permisos p ON p.id=rp.permiso_id WHERE ur.usuario_id=12 AND ur.activo AND r.activo AND rp.activo AND p.activo AND p.modulo='cobertura' AND p.accion='update'")).rows;
 if (actor.length !== 1 || !permission.length) throw Error('ACTOR_TENANT_RBAC_INVALID');
 const waiting = (await c.query('SELECT count(*)::int n FROM pg_locks WHERE NOT granted')).rows[0].n;
 if (waiting !== 0) throw Error('WAITING_LOCKS_PRESENT');
 const august = (await c.query('SELECT municipio_id::text,institucion_id::text,sede_id::text,modalidad_id::text,techo_primaria,techo_secundaria,techo_total,focalizacion_primaria,focalizacion_secundaria,focalizacion_total,cobertura_requerida,vigente_desde::text,vigente_hasta::text FROM focalizacion_vigencias WHERE contrato_id=24 AND carga_id=4 ORDER BY id')).rows;
 if (august.length !== 687 || hash(august) !== snapshot.august_digest) throw Error('AUGUST_BASELINE_CHANGED');
 const existing = (await c.query("SELECT id FROM focalizacion_cargas WHERE contrato_id=24 AND ((fecha_inicio_vigencia<='2026-09-30' AND fecha_fin_vigencia>='2026-09-01') OR archivo_sha256=$1)", [APPROVED_SHA256])).rows;
 if (existing.length) throw Error('SEPTEMBER_ALREADY_PRESENT_UNCERTIFIED');
 const rows = snapshot.rows as Row[];
 const evidence = [];
 for (const r of rows) {
  const identity = (await c.query('SELECT i.id::text institucion_id,s.id::text sede_id,m.id::text modalidad_id,i.municipio_id::text municipio_id FROM instituciones i JOIN sedes s ON s.institucion_id=i.id JOIN modalidades m ON m.id=$3 WHERE i.id=$1 AND s.id=$2 AND i.contrato_id=24 AND i.municipio_id=$4 AND s.municipio_id=$4', [r.institucion_id, r.sede_id, r.modalidad_id, r.municipio_id])).rows;
  if (identity.length !== 1) throw Error('IDENTITY_CHANGED:' + r.fila);
  const finals = (await c.query('SELECT id::text,carga_id::text,clave_sede_modalidad,vigente_desde::text,vigente_hasta::text FROM focalizacion_final WHERE contrato_id=24 AND institucion_id=$1 AND sede_id=$2 AND modalidad_id=$3 AND activo', [r.institucion_id,r.sede_id,r.modalidad_id])).rows;
  if (finals.length) evidence.push({fila: r.fila, ...identity[0], existing_projection: finals});
 }
 const index = (await c.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_focalizacion_final_clave'")).rows;
 if (index.length !== 1) throw Error('PROJECTION_INDEX_CHANGED');
 return {instance, august_count: august.length, august_digest: hash(august), actor_id:12, tenant_rbac:true, waiting_locks:waiting, identities_resolved:rows.length, september_absent:true, projection_index:index[0].indexdef, overlapping_active_projection:evidence};
}

async function insertLoad(c: Client, run: string) {
 return (await c.query("INSERT INTO focalizacion_cargas(contrato_id,nombre_archivo,periodo,usuario_carga_id,created_by,estado,fecha_inicio_vigencia,fecha_fin_vigencia,archivo_sha256,total_filas,resumen_json) VALUES(24,'focalizacion-septiembre-2026.xlsx','2026-09',12,12,'PROCESANDO','2026-09-01','2026-09-30',$1,688,$2::jsonb) RETURNING id::text", [APPROVED_SHA256,JSON.stringify({run_id:run,certified_digest:DIGEST,local_simulation:true})])).rows[0].id as string;
}

async function insertRow(c: Client, load: string, r: Row, source: Row, run: string) {
 const prelim = (await c.query(`INSERT INTO focalizacion_preliminar(carga_id,contrato_id,municipio_id,municipio_texto,institucion_original,sede_original,consecutivo_original,modalidad_original,cupos_reportados,cupos_primaria,cupos_secundaria,techo_primaria,techo_secundaria,techo_total,fila_origen,institucion_id_resuelta,sede_id_resuelta,modalidad_id_resuelta,cobertura_requerida,fila_metadata) VALUES($1,24,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb) RETURNING id::text`, [load,r.municipio_id,source.municipio,source.institucion,source.sede,String(source.consecutivo),source.modalidad,r.focalizacion_total,r.focalizacion_primaria,r.focalizacion_secundaria,r.techo_primaria,r.techo_secundaria,r.techo_total,r.fila,r.institucion_id,r.sede_id,r.modalidad_id,r.personal,JSON.stringify({run_id:run,fila:r.fila})])).rows[0].id;
 const vigencia = (await c.query(`INSERT INTO focalizacion_vigencias(contrato_id,municipio_id,institucion_id,sede_id,modalidad_id,carga_id,preliminar_id,regla_config_id,focalizacion_total,focalizacion_primaria,focalizacion_secundaria,techo_total,techo_primaria,techo_secundaria,vigente_desde,vigente_hasta,cobertura_requerida,cobertura_estado,created_by,motivo) VALUES(24,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'2026-09-01','2026-09-30',$14,'OK',12,$15) RETURNING id::text`, [r.municipio_id,r.institucion_id,r.sede_id,r.modalidad_id,load,prelim,r.rule_id,r.focalizacion_total,r.focalizacion_primaria,r.focalizacion_secundaria,r.techo_total,r.techo_primaria,r.techo_secundaria,r.personal,run])).rows[0].id;
 await c.query('INSERT INTO historial_cambios(usuario_id,tabla_afectada,registro_id,campo,valor_nuevo,motivo) VALUES(12,\'focalizacion_vigencias\',$1,\'controlled_local_insert\',$2,$3)', [vigencia,DIGEST,run]);
 return {prelim, vigencia};
}

async function main() {
 const mode = assertLocalArguments(process.argv.slice(2));
 const snapshotBytes = readFileSync('reports/septiembre-certified-snapshot.json');
 const snapshot = JSON.parse(snapshotBytes.toString());
 assertCertifiedSnapshot(snapshot,DIGEST);
 const sourceBytes = readFileSync(SOURCE);
 if (sha(sourceBytes) !== APPROVED_SHA256 || sha(readFileSync(BACKUP+'/full.dump')) !== BACKUP_SHA) throw Error('CERTIFIED_ARTIFACT_CHANGED');
 const source = new Map(inspectWorkbook(sourceBytes).rows.map(r => [r.fila,r]));
 for (const r of snapshot.rows) if (metrics.some(k => source.get(r.fila)?.[k] !== r[k])) throw Error('SOURCE_METRICS_CHANGED');
 const c = new Client({host:'127.0.0.1',port:55440,user:'local_verifier',database:'septiembre_local',connectionTimeoutMillis:5000});
 await c.connect();
 const report: Row = {schema_version:'focalizacion.septiembre.local-mutator.v1',timestamp_utc:new Date().toISOString(),mode,production_writes:0,source_sha256:APPROVED_SHA256,backup_sha256:BACKUP_SHA,certified_digest:DIGEST};
 try {
  report.preflight = await lockAndValidate(c,snapshot);
  const baseline = await fingerprint(c), baselineSequences = await sequences(c);
  report.baseline = baseline;
  await c.query('ROLLBACK');
  if (mode === 'PreviewOnly') { report.status='LOCAL_PREFLIGHT_ONLY'; }
  else {
   const run = randomUUID(); report.induced_rollback={run_id:run,after_rows:344};
   try {
    await lockAndValidate(c,snapshot);
    const load = await insertLoad(c,run);
    // Include both strict audit channels in the same rollback test.
    await c.query("INSERT INTO auditoria(usuario_id,tabla_afectada,registro_id,accion,datos_nuevos) VALUES(12,'focalizacion_cargas',$1,'INSERT',$2::jsonb)",[load,JSON.stringify({run_id:run,digest:DIGEST})]);
    await c.query("INSERT INTO auditoria_eventos(usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,datos_nuevos) VALUES(12,15,24,'cobertura','focalizacion_cargas',$1,'INSERT',$2::jsonb)",[load,JSON.stringify({run_id:run,digest:DIGEST})]);
    for (const r of snapshot.rows.slice(0,344)) await insertRow(c,load,r,source.get(r.fila)!,run);
    throw Error('INDUCED_FAILURE_AT_344');
   } catch (e) { report.induced_rollback.error = (e as Error).message; }
   finally { await c.query('ROLLBACK'); }
   report.induced_rollback.all_public_tables_identical = canonicalHash(await fingerprint(c)) === canonicalHash(baseline);
   const afterSequences = await sequences(c);
   report.induced_rollback.sequence_changes = Object.keys(baselineSequences).filter(k=>canonicalHash(baselineSequences[k])!==canonicalHash(afterSequences[k]));
   if (report.induced_rollback.error !== 'INDUCED_FAILURE_AT_344' || !report.induced_rollback.all_public_tables_identical) throw Error('ROLLBACK_CERTIFICATION_FAILED');
   const projectionRun = randomUUID(); report.projection_simulation={run_id:projectionRun};
   try {
    await lockAndValidate(c,snapshot);
    const conflict = report.preflight.overlapping_active_projection[0];
    if (!conflict) throw Error('EXPECTED_PROJECTION_CONFLICT_MISSING');
    const r = snapshot.rows.find((r:Row)=>r.fila===conflict.fila), s = source.get(r.fila)!;
    const load = await insertLoad(c,projectionRun);
    const {prelim} = await insertRow(c,load,r,s,projectionRun);
    await c.query(`INSERT INTO focalizacion_final(preliminar_id,carga_id,contrato_id,municipio_id,institucion_final,sede_final,modalidad_final,cupos_aprobados,institucion_id,sede_id,modalidad_id,clave_sede_modalidad,vigente_desde,vigente_hasta,cobertura_requerida,estado_validacion) VALUES($1,$2,24,$3,$4,$5,$6,$7,$8,$9,$10,$11,'2026-09-01','2026-09-30',$12,'APROBADO')`, [prelim,load,r.municipio_id,s.institucion,s.sede,s.modalidad,r.focalizacion_total,r.institucion_id,r.sede_id,r.modalidad_id,conflict.existing_projection[0].clave_sede_modalidad,r.personal]);
    throw Error('EXPECTED_UNIQUE_CONFLICT_MISSING');
   } catch (e) { const error=e as Error & {code?:string;constraint?:string};report.projection_simulation.error={sqlstate:error.code??null,constraint:error.constraint??null,code:error.code==='23505'?'ACTIVE_PROJECTION_MONTH_CONFLICT':error.message}; }
   finally { await c.query('ROLLBACK'); }
   report.postflight={all_public_tables_identical:canonicalHash(await fingerprint(c))===canonicalHash(baseline),september_loads:(await c.query("SELECT count(*)::int n FROM focalizacion_cargas WHERE contrato_id=24 AND fecha_inicio_vigencia='2026-09-01'")).rows[0].n,august_count:(await c.query('SELECT count(*)::int n FROM focalizacion_vigencias WHERE carga_id=4')).rows[0].n};
   report.idempotency={status:'BLOCKED_NO_SUCCESSFUL_APPLICATION',second_mutation_executed:false};
   report.blockers=['ACTIVE_PROJECTION_UNIQUE_INDEX_HAS_NO_MONTH','PRODUCTION_MUTATOR_NOT_ENABLED'];
   report.status='MUTADOR DETENIDO — NO SEGURO PARA PRODUCCIÓN';
  }
  if (sha(readFileSync('reports/septiembre-certified-snapshot.json'))!==sha(snapshotBytes) || sha(readFileSync(SOURCE))!==APPROVED_SHA256) throw Error('CERTIFIED_ARTIFACT_CHANGED');
  writeFileSync(mode==='PreviewOnly'?'reports/septiembre-local-preflight.json':'reports/septiembre-local-mutator-certification.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,identities:report.preflight.identities_resolved,projection_overlap:report.preflight.overlapping_active_projection.length,rollback:report.induced_rollback,projection_simulation:report.projection_simulation,postflight:report.postflight,idempotency:report.idempotency},null,2));
 } finally { await c.query('ROLLBACK'); await c.end(); }
}
if (require.main === module) void main().catch(e=>{console.error({code:'LOCAL_CERTIFICATION_FAILED',message:e.message});process.exitCode=1;});
