import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { env } from '../config/env.js';
import { loadTenantAccess, type TenantAccessContext } from '../middlewares/tenantMiddleware.js';
import { recalculateNominaPeriodo } from '../modules/nomina/nomina.service.js';

export const SAFE_CORRECTION_MODE = process.env.NOMINA_SAFE_CORRECTION_MODE ?? 'PreviewOnly';
export const SAFE_SCOPE = Object.freeze({ empresaId: '15', contratoId: '24', periodoId: '3' });
export const EXPECTED_BASE_COMMIT = '12b766c5409ed892b8c41768821885b4a5ca79ea';
export const EXPECTED_PROJECT_REF = 'scuvsocqibbubqnesvuf';
export const EXPECTED_ACTOR = '12';
export const EXPECTED_ELIGIBLE_COUNT = 234;
export const SAFE_RUNNER_POLICY = Object.freeze({
  previewOnlyByDefault: true, actorUserIdRequired: true, postgresMajorRequired: 17,
  suppressExternalSync: true, preserveOperationalSources: true, excludeMissingCategory: true,
  excludeAssociationConflictIds: ['1214', '1537'], requireDigestMatchBeforeWrite: true,
  transactionPerEmployee: true, auditInSameTransaction: true, rollbackOnAuditFailure: true,
  secondPreviewRequired: true,
  allowedMutationTables: ['nomina_empleados', 'auditoria_eventos', 'auditoria'],
  protectedOperationalTables: ['nomina_novedades', 'nomina_novedades_canonicas', 'nomina_asistencia_diaria', 'nomina_movimientos', 'nomina_novedad_turnos', 'nomina_periodos', 'nomina_liquidaciones', 'nomina_desprendibles', 'nomina_ajustes_manuales', 'nomina_categorias_salariales', 'cobertura_externos', 'nomina_cuentas_cobro_ops', 'nomina_contextos_operativos_base']
});

type SnapshotRow = { id: string; current_digest: string; expected_digest: string; eligibility: string; difference?: Record<string, number> };
type SafeSnapshot = { schema_version: string; engine_commit: string; empresa: string; contrato: string; periodo: string; eligible_employee_ids: string[]; excluded_employee_ids: string[]; rows: SnapshotRow[] };
type BackupManifest = { schema_version: string; postgres_client: string; files: Array<{ table: string; dump: string; restore_list: string; size: number; sha256: string }>; safe_set?: { eligible_count?: number; excluded_missing_category?: number; excluded_conflict_ids?: string[] } };
export type MutationArgs = { actorUserId: string; backupPath: string; manifestPath: string; snapshotPath: string; projectRef: string; baseCommit: string; confirmation: string; resume: boolean; runId?: string };

const snapshotPath = resolve(process.cwd(), 'reports/nomina-periodo3-safe-correction-set-v1.json');
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;
const sha256File = async (file: string): Promise<string> => createHash('sha256').update(await readFile(file)).digest('hex');
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);
export const canonicalDigest = (value: unknown): string => createHash('sha256').update(stable(value)).digest('hex');

export const assertSnapshot = (snapshot: SafeSnapshot): void => {
  if (snapshot.schema_version !== 'nomina-safe-correction-set-1.0') throw new Error('SAFE_SNAPSHOT_SCHEMA_INVALID');
  if (snapshot.engine_commit !== 'e32a6925345057a8963597ea1bee985b98d7cf27') throw new Error('SAFE_SNAPSHOT_ENGINE_COMMIT_INVALID');
  if (snapshot.empresa !== SAFE_SCOPE.empresaId || snapshot.contrato !== SAFE_SCOPE.contratoId || snapshot.periodo !== SAFE_SCOPE.periodoId) throw new Error('SAFE_SCOPE_INVALID');
  if (snapshot.eligible_employee_ids.length !== EXPECTED_ELIGIBLE_COUNT || snapshot.rows.length !== EXPECTED_ELIGIBLE_COUNT) throw new Error('SAFE_SNAPSHOT_ROW_COUNT_INVALID');
  if (snapshot.rows.some(row => row.eligibility !== 'ELIGIBLE_SAFE')) throw new Error('SAFE_SNAPSHOT_CONTAINS_INELIGIBLE_ROW');
  if (snapshot.rows.some(row => !row.current_digest || !row.expected_digest)) throw new Error('SAFE_SNAPSHOT_DIGEST_MISSING');
  if (snapshot.eligible_employee_ids.some(id => SAFE_RUNNER_POLICY.excludeAssociationConflictIds.includes(id))) throw new Error('SAFE_CONFLICT_ID_INCLUDED');
};

export const buildConfirmationPhrase = (input: { snapshotDigest: string; manifestDigest: string; projectRef?: string; resume?: boolean }): string => `CONFIRMO RECALCULO CONTROLADO empresa=15 contrato=24 periodo=3 empleados=234 actor=12 project_ref=${input.projectRef ?? EXPECTED_PROJECT_REF} safe_digest=${input.snapshotDigest} manifest_digest=${input.manifestDigest} suppressExternalSync=true preserveOperationalSources=true resume=${input.resume ?? false}`;

export const parseMutationArgs = (argv: string[]): MutationArgs => {
  const get = (name: string): string => { const i = argv.indexOf(name); const value = i >= 0 ? argv[i + 1] : undefined; if (!value) throw new Error(`MUTATE_ARGUMENT_REQUIRED_${name}`); return value; };
  if (!argv.includes('-Mutate') && !argv.includes('--mutate')) throw new Error('MUTATOR_REQUIRES_-Mutate');
  const actorUserId = get('--actor-user-id');
  if (!/^\d+$/.test(actorUserId) || Number(actorUserId) <= 0) throw new Error('MUTATE_ACTOR_INVALID');
  return { actorUserId, backupPath: get('--backup'), manifestPath: get('--manifest'), snapshotPath: get('--snapshot'), projectRef: get('--project-ref'), baseCommit: get('--base-commit'), confirmation: get('--confirmation'), resume: argv.includes('--resume'), runId: argv.includes('--run-id') ? get('--run-id') : undefined };
};

export const validateMutationArgs = (args: MutationArgs, snapshot: SafeSnapshot, manifest: BackupManifest, snapshotDigest: string, manifestDigest: string): void => {
  if (process.env.NOMINA_CONTROLLED_MUTATION_ENV !== 'PRODUCTION') throw new Error('MUTATE_ENVIRONMENT_CONFIRMATION_REQUIRED');
  if (args.actorUserId !== EXPECTED_ACTOR) throw new Error('MUTATE_ACTOR_MUST_BE_12');
  if (args.projectRef !== EXPECTED_PROJECT_REF) throw new Error('MUTATE_PROJECT_REF_INVALID');
  if (args.baseCommit !== EXPECTED_BASE_COMMIT) throw new Error('MUTATE_BASE_COMMIT_INVALID');
  if (manifest.postgres_client !== 'pg_dump (PostgreSQL) 17.11' || manifest.files.length !== 15 || manifest.files.some(file => !file.sha256 || file.size <= 0)) throw new Error('MUTATE_BACKUP_MANIFEST_INVALID');
  if (args.resume && !args.runId) throw new Error('MUTATE_RESUME_RUN_ID_REQUIRED');
  if (args.confirmation !== buildConfirmationPhrase({ snapshotDigest, manifestDigest, projectRef: args.projectRef, resume: args.resume })) throw new Error('MUTATE_CONFIRMATION_EXACT_MISMATCH');
  assertSnapshot(snapshot);
  if (manifest.safe_set?.eligible_count !== EXPECTED_ELIGIBLE_COUNT || manifest.safe_set?.excluded_missing_category !== 84 || JSON.stringify(manifest.safe_set?.excluded_conflict_ids ?? []) !== JSON.stringify(['1214', '1537'])) throw new Error('MUTATE_MANIFEST_SAFE_SET_INVALID');
};

const setPublicSchema = async (client: PoolClient): Promise<void> => { await client.query('SET search_path TO public'); };

export const readPreflight = async (client: PoolClient): Promise<Record<string, unknown>> => {
  const periods = (await client.query(`SELECT id::text,estado,COALESCE(activo,TRUE) activo,fecha_inicio::text,fecha_fin::text FROM nomina_periodos WHERE id IN (3,4,5,6) ORDER BY id`)).rows;
  const population = Number((await client.query(`SELECT COUNT(*)::int total FROM nomina_empleados ne JOIN nomina_periodos np ON np.id=ne.periodo_id JOIN contratos co ON co.id=np.contrato_id JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE ne.periodo_id=3 AND co.id=24 AND co.empresa_id=15 AND COALESCE(ne.activo,TRUE)`)).rows[0]?.total ?? 0);
  const novelties = Number((await client.query(`SELECT COUNT(DISTINCT nn.id)::int total FROM nomina_novedades nn JOIN nomina_empleados ne ON ne.id=nn.nomina_empleado_id JOIN nomina_periodos np ON np.id=nn.periodo_id JOIN contratos co ON co.id=np.contrato_id WHERE nn.periodo_id=3 AND ne.periodo_id=3 AND co.id=24 AND co.empresa_id=15 AND COALESCE(nn.activo,TRUE) AND nn.fecha_inicio<=np.fecha_fin AND COALESCE(nn.fecha_fin,nn.fecha_inicio)>=np.fecha_inicio`)).rows[0]?.total ?? 0);
  const dnc = Number((await client.query(`SELECT COUNT(DISTINCT nn.id)::int total FROM nomina_novedades nn JOIN nomina_tipos_novedad tn ON tn.id=nn.tipo_novedad_id JOIN nomina_empleados ne ON ne.id=nn.nomina_empleado_id JOIN nomina_periodos np ON np.id=nn.periodo_id JOIN contratos co ON co.id=np.contrato_id WHERE nn.periodo_id=3 AND ne.periodo_id=3 AND co.id=24 AND co.empresa_id=15 AND COALESCE(nn.activo,TRUE) AND tn.codigo_operativo='DNC' AND nn.fecha_inicio<=np.fecha_fin AND COALESCE(nn.fecha_fin,nn.fecha_inicio)>=np.fecha_inicio`)).rows[0]?.total ?? 0);
  const dncDays = Number((await client.query(`SELECT COUNT(DISTINCT ne.id::text || ':' || d::date::text)::int total FROM nomina_novedades nn JOIN nomina_tipos_novedad tn ON tn.id=nn.tipo_novedad_id JOIN nomina_empleados ne ON ne.id=nn.nomina_empleado_id JOIN nomina_periodos np ON np.id=nn.periodo_id JOIN contratos co ON co.id=np.contrato_id CROSS JOIN LATERAL generate_series(GREATEST(nn.fecha_inicio,np.fecha_inicio),LEAST(COALESCE(nn.fecha_fin,nn.fecha_inicio),np.fecha_fin),interval '1 day') d WHERE nn.periodo_id=3 AND ne.periodo_id=3 AND co.id=24 AND co.empresa_id=15 AND COALESCE(nn.activo,TRUE) AND tn.codigo_operativo='DNC'`)).rows[0]?.total ?? 0);
  const locks = Number((await client.query('SELECT COUNT(*)::int waiting FROM pg_locks WHERE NOT granted')).rows[0]?.waiting ?? 0);
  const serverVersion = String((await client.query("SELECT current_setting('server_version_num') version")).rows[0]?.version ?? '');
  if (population !== 795 || novelties !== 354 || dnc !== 298 || dncDays !== 309 || locks !== 0 || !serverVersion.startsWith('17')) throw new Error('MUTATE_PREFLIGHT_MISMATCH');
  if (periods.length !== 4 || periods[0].estado !== 'ABIERTO' || periods[1].estado !== 'ANULADO' || periods[2].estado !== 'ABIERTO' || periods[3].estado !== 'ANULADO') throw new Error('MUTATE_PERIOD_STATE_MISMATCH');
  return { periods, population, active_distinct_novelties: novelties, dnc_distinct: dnc, dnc_unique_days: dncDays, waiting_locks: locks, server_version_num: serverVersion, protected_data: 0 };
};

const readEconomicState = async (client: PoolClient, id: string): Promise<Record<string, unknown>> => {
  const row = (await client.query(`SELECT id::text,dias_pagados,devengado_basico,devengado_transporte,devengado_otros,salud,pension,total_adiciones,total_deducciones,neto_pagar,detalle_calculo FROM nomina_empleados WHERE id=$1::bigint`, [id])).rows[0];
  if (!row) throw new Error(`MUTATE_EMPLOYEE_NOT_FOUND_${id}`);
  return row as Record<string, unknown>;
};

const readAuditState = async (client: PoolClient, employeeId: string, runId: string): Promise<{ events: number; legacy: number }> => ({
  events: Number((await client.query(`SELECT COUNT(*)::int total FROM auditoria_eventos WHERE entidad='nomina_empleados' AND entidad_id=$1 AND accion='NOMINA_RECALCULO_CONTROLADO_234' AND descripcion LIKE $2`, [employeeId, `%run_id=${runId}%`])).rows[0]?.total ?? 0),
  legacy: Number((await client.query(`SELECT COUNT(*)::int total FROM auditoria WHERE tabla_afectada='nomina_empleados' AND registro_id=$1::bigint AND accion='NOMINA_RECALCULO_CONTROLADO_234' AND descripcion LIKE $2`, [employeeId, `%run_id=${runId}%`])).rows[0]?.total ?? 0)
});

const captureProtectedState = async (client: PoolClient): Promise<Record<string, { count: number; digest: string }>> => {
  const state: Record<string, { count: number; digest: string }> = {};
  for (const table of SAFE_RUNNER_POLICY.protectedOperationalTables) {
    const result = await client.query<{ count: number; digest: string | null }>(
      `SELECT COUNT(*)::int count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) digest FROM public."${table}" t`
    );
    state[table] = { count: Number(result.rows[0]?.count ?? 0), digest: result.rows[0]?.digest ?? '' };
  }
  return state;
};

const validateActor = async (client: PoolClient, actorUserId: string): Promise<TenantAccessContext> => {
  const user = (await client.query(`SELECT id::text,COALESCE(activo,TRUE) activo FROM usuarios WHERE id=$1::bigint`, [actorUserId])).rows[0];
  if (!user?.activo) throw new Error('MUTATE_ACTOR_NOT_ACTIVE');
  const roles = (await client.query(`SELECT r.nombre_rol FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=$1::bigint AND COALESCE(ur.activo,TRUE) AND COALESCE(r.activo,TRUE)`, [actorUserId])).rows.map(row => String(row.nombre_rol));
  if (!roles.includes('ADMINISTRADOR')) throw new Error('MUTATE_ACTOR_NOT_ADMIN');
  const tenant = await loadTenantAccess(actorUserId, client);
  if (!tenant.isGlobalAdmin && !tenant.empresaIds.includes(15) && !tenant.contratoIds.includes(24)) throw new Error('MUTATE_ACTOR_SCOPE_DENIED');
  return tenant;
};

const verifyBackup = async (manifest: BackupManifest, backupPath: string): Promise<void> => {
  if (!existsSync(backupPath)) throw new Error('MUTATE_BACKUP_PATH_NOT_FOUND');
  for (const file of manifest.files) {
    const dump = resolve(backupPath, file.dump); const list = resolve(backupPath, file.restore_list);
    if (!existsSync(dump) || !existsSync(list) || statSync(dump).size <= 0 || statSync(list).size <= 0) throw new Error(`MUTATE_BACKUP_FILE_INVALID_${file.table}`);
    if (statSync(dump).size !== file.size || await sha256File(dump) !== file.sha256) throw new Error(`MUTATE_BACKUP_HASH_MISMATCH_${file.table}`);
  }
};

export const runPreviewOnly = async (): Promise<Record<string, unknown>> => {
  const snapshot = await readJson<SafeSnapshot>(snapshotPath); assertSnapshot(snapshot);
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try { const client = await pool.connect(); try { await setPublicSchema(client); return { mode: 'PreviewOnly', writes_productive: 0, scope: SAFE_SCOPE, eligible_count: snapshot.rows.length, ...(await readPreflight(client)), policy: SAFE_RUNNER_POLICY }; } finally { client.release(); } } finally { await pool.end(); }
};

export const runMutate = async (args: MutationArgs): Promise<Record<string, unknown>> => {
  if (process.env.NOMINA_CONTROLLED_MUTATION_ENV !== 'PRODUCTION') throw new Error('MUTATE_ENVIRONMENT_CONFIRMATION_REQUIRED');
  const snapshot = await readJson<SafeSnapshot>(args.snapshotPath); const manifest = await readJson<BackupManifest>(args.manifestPath);
  assertSnapshot(snapshot); const snapshotDigest = await sha256File(args.snapshotPath); const manifestDigest = await sha256File(args.manifestPath);
  validateMutationArgs(args, snapshot, manifest, snapshotDigest, manifestDigest); await verifyBackup(manifest, args.backupPath);
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000, lock_timeout: 5000 });
  let lockClient: PoolClient | undefined; const runId = args.runId ?? randomUUID(); const completed: string[] = []; const failed: { id: string; error: string }[] = [];
  try {
    lockClient = await pool.connect(); await setPublicSchema(lockClient); const actorTenant = await validateActor(lockClient, args.actorUserId); const beforePreflight = await readPreflight(lockClient);
    await lockClient.query(`SELECT pg_advisory_lock(hashtextextended('nomina-controlled:15:24:3',0))`);
    try {
      if (JSON.stringify(beforePreflight) !== JSON.stringify(await readPreflight(lockClient))) throw new Error('MUTATE_PREFLIGHT_CHANGED_UNDER_LOCK');
      const rowById = new Map(snapshot.rows.map(row => [row.id, row]));
      const protectedBefore = await captureProtectedState(lockClient);
      for (const id of snapshot.eligible_employee_ids) {
        const row = rowById.get(id); if (!row || row.eligibility !== 'ELIGIBLE_SAFE' || SAFE_RUNNER_POLICY.excludeAssociationConflictIds.includes(id)) throw new Error(`MUTATE_INELIGIBLE_EMPLOYEE_${id}`);
        const before = await readEconomicState(lockClient, id); const beforeDigest = canonicalDigest(before);
        if (beforeDigest !== row.current_digest) throw new Error(`MUTATE_DIGEST_BEFORE_MISMATCH_${id}`);
        const existing = await readAuditState(lockClient, id, runId); if (existing.events === 1 && existing.legacy === 1 && beforeDigest === row.expected_digest) { completed.push(id); continue; }
        if (existing.events !== 0 || existing.legacy !== 0) throw new Error(`MUTATE_PARTIAL_AUDIT_${id}`);
        await lockClient.query('BEGIN');
        try {
          await lockClient.query("SET LOCAL statement_timeout='60000'; SET LOCAL lock_timeout='5000'");
          await recalculateNominaPeriodo(SAFE_SCOPE.periodoId, { force: true, nomina_empleado_id: id, executor: lockClient, controlledRunId: runId, controlledEmpresaId: SAFE_SCOPE.empresaId, controlledAuditBefore: before }, args.actorUserId, actorTenant);
          const afterDigest = canonicalDigest(await readEconomicState(lockClient, id)); if (afterDigest !== row.expected_digest) throw new Error(`MUTATE_DIGEST_AFTER_MISMATCH_${id}`);
          const audits = await readAuditState(lockClient, id, runId); if (audits.events !== 1 || audits.legacy !== 1) throw new Error(`MUTATE_AUDIT_INCOMPLETE_${id}`);
          await lockClient.query('COMMIT'); completed.push(id);
        } catch (error) { await lockClient.query('ROLLBACK'); failed.push({ id, error: error instanceof Error ? error.message : String(error) }); throw error; }
      }
      const protectedAfter = await captureProtectedState(lockClient);
      if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) throw new Error('MUTATE_PROTECTED_SOURCES_CHANGED');
    } finally { await lockClient.query(`SELECT pg_advisory_unlock(hashtextextended('nomina-controlled:15:24:3',0))`); }
    return { mode: 'Mutate', run_id: runId, actor_user_id: args.actorUserId, completed_count: completed.length, failed, pending_count: EXPECTED_ELIGIBLE_COUNT - completed.length, writes_productive: completed.length, postflight_required: true };
  } finally { if (lockClient) lockClient.release(); await pool.end(); delete process.env.PGPASSWORD; }
};

if (process.argv[1]?.endsWith('nomina-periodo3-safe-correction-runner.ts')) {
  const isMutate = process.argv.includes('-Mutate') || process.argv.includes('--mutate');
  const execution = isMutate ? runMutate(parseMutationArgs(process.argv.slice(2))) : runPreviewOnly();
  void execution.then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
