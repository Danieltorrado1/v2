import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { env } from '../config/env.js';

export const SAFE_CORRECTION_MODE = process.env.NOMINA_SAFE_CORRECTION_MODE ?? 'PreviewOnly';
export const SAFE_SCOPE = Object.freeze({ empresaId: '15', contratoId: '24', periodoId: '3' });
export const SAFE_RUNNER_POLICY = Object.freeze({
  previewOnlyByDefault: true,
  actorUserIdRequired: true,
  postgresMajorRequired: 17,
  suppressExternalSync: true,
  preserveOperationalSources: true,
  excludeMissingCategory: true,
  excludeAssociationConflictIds: ['1214', '1537'],
  requireDigestMatchBeforeWrite: true,
  transactionPerEmployee: true,
  auditInSameTransaction: true,
  rollbackOnAuditFailure: true,
  secondPreviewRequired: true
});

type SafeSnapshot = {
  schema_version: string;
  engine_commit: string;
  empresa: string;
  contrato: string;
  periodo: string;
  eligible_employee_ids: string[];
  excluded_employee_ids: string[];
  rows: Array<{ id: string; current_digest: string; expected_digest: string; eligibility: string }>;
};

const snapshotPath = resolve(process.cwd(), 'reports/nomina-periodo3-safe-correction-set-v1.json');

const loadSnapshot = async (): Promise<SafeSnapshot> => JSON.parse(await readFile(snapshotPath, 'utf8')) as SafeSnapshot;

const assertSnapshot = (snapshot: SafeSnapshot): void => {
  if (snapshot.schema_version !== 'nomina-safe-correction-set-1.0') throw new Error('SAFE_SNAPSHOT_SCHEMA_INVALID');
  if (snapshot.empresa !== SAFE_SCOPE.empresaId || snapshot.contrato !== SAFE_SCOPE.contratoId || snapshot.periodo !== SAFE_SCOPE.periodoId) {
    throw new Error('SAFE_SCOPE_INVALID');
  }
  if (snapshot.eligible_employee_ids.length !== snapshot.rows.length) throw new Error('SAFE_SNAPSHOT_ROW_COUNT_INVALID');
  if (snapshot.rows.some(row => row.eligibility !== 'ELIGIBLE_SAFE')) throw new Error('SAFE_SNAPSHOT_CONTAINS_INELIGIBLE_ROW');
  if (snapshot.rows.some(row => !row.current_digest || !row.expected_digest)) throw new Error('SAFE_SNAPSHOT_DIGEST_MISSING');
  if (snapshot.eligible_employee_ids.some(id => SAFE_RUNNER_POLICY.excludeAssociationConflictIds.includes(id))) throw new Error('SAFE_CONFLICT_ID_INCLUDED');
};

export const canonicalDigest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value, Object.keys((value ?? {}) as object).sort())).digest('hex');

export const runPreviewOnly = async (): Promise<Record<string, unknown>> => {
  const snapshot = await loadSnapshot();
  assertSnapshot(snapshot);
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    try {
      const scope = await client.query<{ periodo_id: string; contrato_id: string; empresa_id: string; estado: string }>(
        `SELECT np.id::text periodo_id,np.contrato_id::text, c.empresa_id::text, np.estado
           FROM nomina_periodos np JOIN contratos c ON c.id=np.contrato_id
          WHERE np.id=$1::bigint`, [SAFE_SCOPE.periodoId]
      );
      const row = scope.rows[0];
      if (!row || row.contrato_id !== SAFE_SCOPE.contratoId || row.empresa_id !== SAFE_SCOPE.empresaId || row.estado !== 'ABIERTO') throw new Error('SAFE_SCOPE_OR_PERIOD_INVALID');
      const population = await client.query<{ total: string }>(
        `SELECT COUNT(*)::text total FROM nomina_empleados ne JOIN nomina_periodos np ON np.id=ne.periodo_id JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE ne.periodo_id=$1::bigint AND np.contrato_id=$2::bigint AND v.empresa_id=$3::bigint AND COALESCE(ne.activo,TRUE)`,
        [SAFE_SCOPE.periodoId, SAFE_SCOPE.contratoId, SAFE_SCOPE.empresaId]
      );
      const locks = await client.query<{ waiting: string }>('SELECT COUNT(*)::text waiting FROM pg_locks WHERE NOT granted');
      const server = await client.query<{ version: string }>("SELECT current_setting('server_version_num') version");
      if (Number(server.rows[0]?.version ?? 0) < 170000) throw new Error('POSTGRESQL_17_REQUIRED');
      if (Number(population.rows[0]?.total ?? 0) !== 795) throw new Error('POPULATION_CHANGED');
      if (Number(locks.rows[0]?.waiting ?? 0) !== 0) throw new Error('WAITING_LOCKS_PRESENT');
      return { mode: 'PreviewOnly', writes_productive: 0, scope: SAFE_SCOPE, eligible_count: snapshot.rows.length, population: Number(population.rows[0]?.total ?? 0), waiting_locks: Number(locks.rows[0]?.waiting ?? 0), server_version_num: server.rows[0]?.version, policy: SAFE_RUNNER_POLICY };
    } finally { client.release(); }
  } finally { await pool.end(); }
};

export const applySafeCorrection = async (_actorUserId: string): Promise<never> => {
  throw new Error('APPLY_DISABLED_IN_READ_ONLY_PREPARATION');
};

if (process.argv[1]?.endsWith('nomina-periodo3-safe-correction-runner.ts')) {
  if (SAFE_CORRECTION_MODE !== 'PreviewOnly' && SAFE_CORRECTION_MODE !== 'PreflightOnly') throw new Error('MUTATOR_MODE_NOT_EXECUTABLE_FROM_PREPARATION');
  void runPreviewOnly().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
