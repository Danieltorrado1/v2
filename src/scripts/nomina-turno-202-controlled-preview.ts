import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';

export const CASE_202 = Object.freeze({ empresa: 15, contrato: 24, periodo: 3, turno: 202, movimiento: 192 });
export const CASE_202_ACTION = 'NOMINA_TURNO_202_MOVIMIENTO_192_CORRECTION_V1';
export const FUTURE_AUTHORIZATION = 'REVOCADA/NO UTILIZABLE — AUTORIZO CORRECCION CONTROLADA empresa=15 contrato=24 periodo=3 turno=202 movimiento=192 cantidad=1->2 valor_unitario=97800 valor_calculado=97800->195600 valor_total=97800->195600 estado=PENDIENTE afecta_seguridad_social=false run_id=<POR_DEFINIR> actor=<POR_AUTORIZAR> write_set=nomina_movimientos,auditoria_eventos,auditoria SIN_RECALCULO SIN_DOCUMENTOS';
type Executor = Pick<PoolClient, 'query'>;
type Request = { turnoId: number; movimientoId: number };
type Snapshot = Record<string, string | number | boolean | null>;

const fail = (code: string): never => { throw new Error(code); };
const checkIds = (request: Request) => {
  if (request.turnoId !== 202 || request.movimientoId !== 192) fail('CASE_202_IDS_ONLY');
};

async function snapshot(client: Executor, lock = false): Promise<Snapshot> {
  const rows = (await client.query(`SELECT nt.id::int AS turno, nm.id::int AS movimiento,
    c.empresa_id::int AS empresa, np.contrato_id::int AS contrato, np.id::int AS periodo,
    nm.periodo_id::int AS movimiento_periodo, nn.periodo_id::int AS novedad_periodo,
    nt.nomina_novedad_id::int AS novedad, nt.nomina_empleado_id::int AS empleado,
    nm.nomina_empleado_id::int AS movimiento_empleado, nm.vinculacion_id::int AS vinculacion,
    nt.externo_id::int AS externo, nm.externo_id::int AS movimiento_externo,
    nt.tipo_turno, nm.tipo_movimiento, np.estado AS periodo_estado,
    nt.activo AS turno_activo, nn.activo AS novedad_activa, nm.activo AS movimiento_activo,
    nn.fecha_inicio::text, nn.fecha_fin::text, nm.fecha::text AS fecha_movimiento,
    nn.dias::float8 AS dias_novedad, (nn.fecha_fin-nn.fecha_inicio+1)::int AS dias_inclusivos,
    nm.cantidad::float8, nm.valor_unitario::float8, nm.valor_calculado::float8, nm.valor_total::float8,
    nm.estado, nm.afecta_seguridad_social, nm.es_devengado, nm.es_deduccion,
    nm.tarifa_config_id::int AS tarifa_id, nm.modalidad_id::int AS modalidad_id,
    tf.contrato_id::int AS tarifa_contrato, tf.modalidad_id::int AS tarifa_modalidad,
    tf.tipo_movimiento AS tarifa_tipo, tf.valor_unitario::float8 AS tarifa_unitaria, tf.activo AS tarifa_activa,
    tf.vigencia_desde::text, tf.vigencia_hasta::text, mo.codigo_base AS modalidad_codigo
    FROM nomina_novedad_turnos nt JOIN nomina_movimientos nm ON nm.id=nt.movimiento_id
    JOIN nomina_novedades nn ON nn.id=nt.nomina_novedad_id JOIN nomina_periodos np ON np.id=nt.periodo_id
    JOIN contratos c ON c.id=np.contrato_id JOIN nomina_movimiento_tarifas tf ON tf.id=nm.tarifa_config_id
    JOIN modalidades mo ON mo.id=nm.modalidad_id WHERE nt.id=202 AND nm.id=192
    ${lock ? 'FOR UPDATE OF nm, nt, nn, np, tf' : ''}`)).rows;
  if (rows.length !== 1) fail('CASE_202_RECORD_MISSING_OR_AMBIGUOUS');
  return rows[0] as Snapshot;
}

const EXPECTED = Object.freeze({ ...CASE_202, movimiento_periodo: 3, novedad_periodo: 3,
  novedad: 929, empleado: 837, movimiento_empleado: 837, vinculacion: 847, externo: 33, movimiento_externo: 33,
  tipo_turno: 'EXTERNO', tipo_movimiento: 'TURNO_EXTERNO', periodo_estado: 'ABIERTO',
  turno_activo: true, novedad_activa: true, movimiento_activo: true,
  fecha_inicio: '2026-09-08', fecha_fin: '2026-09-09', fecha_movimiento: '2026-09-08',
  dias_novedad: 2, dias_inclusivos: 2, valor_unitario: 97800, estado: 'PENDIENTE',
  afecta_seguridad_social: false, es_devengado: true, es_deduccion: false,
  tarifa_id: 1, modalidad_id: 1, tarifa_contrato: 24, tarifa_modalidad: 1,
  tarifa_tipo: 'TURNO_EXTERNO', tarifa_unitaria: 97800, tarifa_activa: true,
  vigencia_desde: '2026-07-29', vigencia_hasta: '2026-12-31', modalidad_codigo: 'CAA' });

function assertState(row: Snapshot, applied: boolean) {
  const expected = { ...EXPECTED, cantidad: applied ? 2 : 1, valor_calculado: applied ? 195600 : 97800, valor_total: applied ? 195600 : 97800 };
  for (const [key, value] of Object.entries(expected)) if (row[key] !== value) fail(`CASE_202_DRIFT_${key}`);
}

async function inspectSafety(client: Executor) {
  const duplicates = (await client.query(`SELECT id FROM nomina_movimientos m WHERE id<>192 AND periodo_id=3
    AND externo_id=33 AND tipo_movimiento='TURNO_EXTERNO' AND activo AND estado<>'RECHAZADO'
    AND (fecha BETWEEN '2026-09-08' AND '2026-09-09' OR EXISTS (
      SELECT 1 FROM nomina_novedad_turnos nt JOIN nomina_novedades nn ON nn.id=nt.nomina_novedad_id
      WHERE nt.movimiento_id=m.id AND nt.activo AND nn.activo
        AND nn.fecha_inicio<='2026-09-09' AND COALESCE(nn.fecha_fin,nn.fecha_inicio)>='2026-09-08'))`)).rows;
  const links = (await client.query('SELECT id FROM nomina_novedad_turnos WHERE movimiento_id=192 AND activo')).rows;
  const accounts = (await client.query(`SELECT cc.id,cc.estado,cc.activo,
    (cc.generado_path IS NOT NULL OR cc.firmado_path IS NOT NULL) AS has_file,
    d.id AS detalle_id,d.valor::float8 AS detalle_valor
    FROM cobertura_cuentas_cobro_externas cc LEFT JOIN cobertura_cuenta_cobro_externa_detalle d ON d.cuenta_id=cc.id
    WHERE (cc.empresa_id=15 AND cc.contrato_id=24 AND cc.periodo_id=3 AND cc.externo_id=33)
      OR d.movimiento_id=192 OR d.turno_id=202`)).rows;
  const derivatives = (await client.query(`SELECT 'nomina_liquidaciones' AS tabla,id::text,estado FROM nomina_liquidaciones WHERE periodo_id=3 AND vinculacion_id=847 AND activo
    UNION ALL SELECT 'nomina_liquidaciones_finales',id::text,estado FROM nomina_liquidaciones_finales WHERE vinculacion_id=847 AND activo
    UNION ALL SELECT 'nomina_desprendibles',id::text,estado FROM nomina_desprendibles WHERE periodo_id=3 AND (nomina_empleado_id=837 OR vinculacion_id=847) AND activo
    UNION ALL SELECT 'nomina_pagos_pendientes',id::text,estado FROM nomina_pagos_pendientes WHERE (periodo_origen_id=3 OR periodo_pago_id=3) AND (nomina_empleado_id=837 OR vinculacion_id=847) AND activo
    UNION ALL SELECT 'nomina_cuentas_cobro_turnos',id::text,estado FROM nomina_cuentas_cobro_turnos WHERE periodo_id=3 AND vinculacion_id=847 AND activo
    UNION ALL SELECT 'nomina_exportes',id::text,tipo_exporte FROM nomina_exportes WHERE periodo_id=3 AND activo`)).rows;
  const triggers = (await client.query(`SELECT r.relname AS table_name,t.tgname AS trigger_name FROM pg_trigger t
    JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname IN ('nomina_movimientos','auditoria','auditoria_eventos')
      AND NOT t.tgisinternal AND t.tgenabled<>'D' ORDER BY r.relname,t.tgname`)).rows;
  const audits = (await client.query(`SELECT 'auditoria_eventos' AS tabla,accion,datos_anteriores AS before,datos_nuevos AS after
    FROM auditoria_eventos WHERE entidad='nomina_movimientos' AND entidad_id='192'
    UNION ALL SELECT 'auditoria',accion,datos_anteriores,datos_nuevos FROM auditoria WHERE tabla_afectada='nomina_movimientos' AND registro_id=192`)).rows;
  const corrections = (await client.query('SELECT id FROM nomina_correcciones WHERE movimiento_id=192')).rows;
  const blockers: string[] = [];
  if (duplicates.length) blockers.push('EQUIVALENT_MOVEMENT_EXISTS');
  if (links.length !== 1 || Number(links[0]?.id) !== 202) blockers.push('TURN_LINKS_CHANGED');
  if (accounts.length) blockers.push(accounts.some(row=>row.has_file || row.estado!=='PENDIENTE') ? 'EXISTING_ACCOUNT_DOCUMENT' : 'EXISTING_DRAFT_ACCOUNT_REQUIRES_SEPARATE_SCOPE');
  if (derivatives.length) blockers.push('EXISTING_DERIVED_RECORDS');
  if (triggers.length) blockers.push('ENABLED_TRIGGER_REQUIRES_WRITE_SET_REVIEW');
  if (corrections.length) blockers.push('EXISTING_CORRECTION');
  return { blockers, duplicates: duplicates.length, links: links.length, accounts, derivatives, triggers, audits };
}

function inspectAudit(safety: Awaited<ReturnType<typeof inspectSafety>>, after: Snapshot): string | null {
  const own = safety.audits.filter(row=>row.accion===CASE_202_ACTION);
  if (!own.length) {
    if (safety.audits.some(row=>Number(row.after?.cantidad)===2 || Number(row.after?.valor_total)===195600)) fail('PRIOR_ECONOMIC_CORRECTION');
    return null;
  }
  if (own.length!==2 || new Set(own.map(row=>row.tabla)).size!==2) fail('STRICT_AUDIT_PAIR_MISSING_OR_DUPLICATED');
  for (const audit of own) {
    if (!audit.after?.run_id || audit.after?.operation_key!==CASE_202_ACTION) fail('STRICT_AUDIT_IDENTITY_INVALID');
    assertState(audit.before,false);
    const {run_id,operation_key,...economicAfter}=audit.after;
    assertState(economicAfter,true);
    const canonical=(row: Snapshot)=>JSON.stringify(Object.entries(row).sort(([left],[right])=>left.localeCompare(right)));
    if (canonical(economicAfter)!==canonical(after)) fail('STRICT_AUDIT_AFTER_DRIFT');
  }
  if (own[0].after.run_id!==own[1].after.run_id) fail('STRICT_AUDIT_RUN_ID_MISMATCH');
  return own[0].after.run_id;
}

/** Only this read-only entry point accepts a network PostgreSQL client. */
export async function previewCase202(client: Executor, request: Request) {
  checkIds(request);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const state = (await client.query('SHOW transaction_read_only')).rows[0];
    if (state?.transaction_read_only!=='on') fail('READ_ONLY_REQUIRED');
    const before=await snapshot(client);
    assertState(before,false);
    const safety=await inspectSafety(client);
    inspectAudit(safety,{...before,cantidad:2,valor_calculado:195600,valor_total:195600});
    return { mode:'PreviewOnly',decision:safety.blockers.length?'BLOCKED':'REQUIRES_SEPARATE_AUTHORIZATION',before,
      after:{...before,cantidad:2,valor_calculado:195600,valor_total:195600},difference:97800,
      safety:{...safety,audits:safety.audits.length},production_execution_enabled:false };
  } finally { await client.query('ROLLBACK'); }
}

/** A local embedded PostgreSQL instance is mandatory. No productive execution mode exists. */
export async function simulateCase202(db: PGlite, request: Request & { actorUserId: string; runId: string }) {
  checkIds(request);
  if (!(db instanceof PGlite)) fail('LOCAL_PGLITE_ONLY_PRODUCTION_DISABLED');
  if (!/^[1-9]\d*$/.test(request.actorUserId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.runId)) fail('ACTOR_AND_RUN_ID_REQUIRED');
  const client=db as unknown as Executor;
  await client.query('BEGIN');
  try {
    const locked=(await client.query('SELECT pg_try_advisory_xact_lock(202,192) AS locked')).rows[0];
    if (!locked?.locked) fail('CASE_202_LOCK_BUSY');
    const before=await snapshot(client,true);
    const safety=await inspectSafety(client);
    if (before.cantidad===2 && before.valor_total===195600) {
      assertState(before,true);
      const runId=inspectAudit(safety,before);
      if (!runId) fail('ALREADY_CHANGED_WITHOUT_STRICT_AUDIT');
      await client.query('ROLLBACK');
      return {status:'ALREADY_APPLIED',run_id:runId,changed_rows:0,audits_added:0};
    }
    assertState(before,false);
    if (inspectAudit(safety,{...before,cantidad:2,valor_calculado:195600,valor_total:195600})) fail('AUDIT_EXISTS_BUT_BEFORE_STATE_UNCHANGED');
    if (safety.blockers.length) fail(`CASE_202_BLOCKED:${safety.blockers.join(',')}`);
    const changed=await client.query(`UPDATE nomina_movimientos SET cantidad=2,valor_calculado=195600,valor_total=195600
      WHERE id=192 AND periodo_id=3 AND nomina_empleado_id=837 AND vinculacion_id=847 AND externo_id=33
      AND tipo_movimiento='TURNO_EXTERNO' AND cantidad=1 AND valor_unitario=97800 AND valor_calculado=97800 AND valor_total=97800
      AND estado='PENDIENTE' AND afecta_seguridad_social=FALSE AND activo=TRUE RETURNING id`);
    if (changed.rows.length!==1) fail('GUARDED_UPDATE_DIVERGENCE');
    const after=await snapshot(client);
    assertState(after,true);
    const auditedAfter={...after,run_id:request.runId,operation_key:CASE_202_ACTION};
    await client.query(`INSERT INTO auditoria_eventos(usuario_id,empresa_id,contrato_id,modulo,entidad,entidad_id,accion,descripcion,datos_anteriores,datos_nuevos)
      VALUES($1::bigint,15,24,'NOMINA','nomina_movimientos','192',$2,'Correccion local controlada del caso 202/192',$3::jsonb,$4::jsonb)`,
      [request.actorUserId,CASE_202_ACTION,JSON.stringify(before),JSON.stringify(auditedAfter)]);
    await client.query(`INSERT INTO auditoria(usuario_id,accion,tabla_afectada,registro_id,descripcion,datos_anteriores,datos_nuevos)
      VALUES($1::bigint,$2,'nomina_movimientos',192,'Correccion local controlada del caso 202/192',$3::jsonb,$4::jsonb)`,
      [request.actorUserId,CASE_202_ACTION,JSON.stringify(before),JSON.stringify(auditedAfter)]);
    const audited=await inspectSafety(client);
    if (!inspectAudit(audited,after)) fail('STRICT_AUDIT_POSTCHECK_FAILED');
    await client.query('COMMIT');
    return {status:'APPLIED_LOCAL_ONLY',run_id:request.runId,changed_rows:1,audits_added:2};
  } catch(error) { await client.query('ROLLBACK');throw error; }
}

export async function previewCli(args: string[]) {
  if (args.length && !(args.length===2 && args[0]==='--mode' && args[1]==='PreviewOnly')) fail('ONLY_PREVIEW_ONLY_CLI_PRODUCTION_EXECUTION_DISABLED');
  const {config}=await import('dotenv');
  config({path:process.env.ENV_FILE??'.env',quiet:true} as Parameters<typeof config>[0]);
  const {Client}=await import('pg');
  const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,
    options:'-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000 -c application_name=nomina-202-previewonly'});
  try { await client.connect();return await previewCase202(client as unknown as Executor,{turnoId:202,movimientoId:192}); }
  finally { await client.end(); }
}

if (process.argv[1]?.endsWith('nomina-turno-202-controlled-preview.ts')) {
  void previewCli(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error instanceof Error?error.message:'PREVIEW_FAILED');process.exitCode=1;});
}
