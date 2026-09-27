import { dbPool } from '../config/db.js';
import { env } from '../config/env.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { recalculateNominaPeriodo } from '../modules/nomina/nomina.service.js';
import { registerAuditEntry } from '../modules/auditoria/auditoria.helper.js';
import {
  assertControlledPreflight,
  assertExactConfirmation,
  CONTROLLED_RECALC_PROJECT_REF,
  CONTROLLED_RECALC_SCOPE,
  CONTROLLED_RECOVERY_VALIDATED_IDS,
  assertExactRecoveryConfirmation,
  isPostgres17,
  type ControlledPreflight
} from '../modules/nomina/nomina.recalculo.controlado.js';

const HEALTH_URL = 'https://api.empiriasuite.com/api/health';
const LOCK_KEY = 'empiria:nomina:controlled-recalc:15:24:3';

type HealthResponse = {
  success?: boolean;
  data?: {
    status?: string;
    database?: { status?: string };
    integracion_outbox?: {
      configured?: boolean;
      enabled?: boolean;
      started?: boolean;
      running?: boolean;
      recalc?: { requested?: boolean; active?: boolean };
    };
  };
};

type Preflight = ControlledPreflight & {
  serverVersion: string;
  periodStates: Record<string, string>;
  activeNoveltyCount: number;
  activeNoveltyRows: number;
  activeNoveltyDays: number;
  excludedEmployees: number;
  employeesMaterialized: number;
  movementCount: number;
  activeMovementCount: number;
  activeTurnRecordCount: number;
  waitingLocks: number;
  period5Employees: number;
  period5ActiveNovelties: number;
  movementDigest: string;
  candidateDigest: string;
  noveltyDigest: string;
  actorUserId: number;
};

const queryReadOnly = async <T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
};

const readHealth = async (): Promise<HealthResponse> => {
  const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(20_000) });
  if (response.status !== 200) throw new Error(`Health público HTTP ${response.status}.`);
  const body = await response.json() as HealthResponse;
  const integration = body.data?.integracion_outbox;
  if (
    body.success !== true ||
    body.data?.status !== 'ok' ||
    body.data.database?.status !== 'ok' ||
    integration?.configured !== false ||
    integration.enabled !== false ||
    integration.started !== false ||
    integration.running !== false ||
    integration.recalc?.requested !== false ||
    integration.recalc.active !== false
  ) {
    throw new Error('Health público no cumple el estado seguro requerido.');
  }
  return body;
};

const readPreflight = async (actorUserId: number): Promise<Preflight> => queryReadOnly(async (client) => {
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) throw new Error('ActorUserId entero positivo obligatorio.');
  const actor = (await client.query<{ activo: boolean; is_admin: boolean; company_access: number; contract_access: number }>(
    `SELECT u.activo,
            EXISTS (SELECT 1 FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=u.id AND COALESCE(ur.activo,TRUE) AND COALESCE(r.activo,TRUE) AND r.nombre_rol IN ('ADMINISTRADOR','ADMIN')) AS is_admin,
            (SELECT COUNT(*)::int FROM usuario_empresas ue WHERE ue.usuario_id=u.id AND ue.empresa_id=$2::bigint AND COALESCE(ue.activo,TRUE)) AS company_access,
            (SELECT COUNT(*)::int FROM usuario_contratos uc WHERE uc.usuario_id=u.id AND uc.contrato_id=$3::bigint AND COALESCE(uc.activo,TRUE)) AS contract_access
       FROM usuarios u WHERE u.id=$1::bigint`, [actorUserId, 15, 24]
  )).rows[0];
  if (!actor || !actor.activo || !actor.is_admin || actor.company_access < 1 || actor.contract_access < 1) {
    throw new Error('ActorUserId no existe, no está activo, no es administrador o no tiene alcance autorizado.');
  }
  const version = (await client.query<{ server_version: string }>(
    "SELECT current_setting('server_version') AS server_version"
  )).rows[0]?.server_version ?? '';
  if (!isPostgres17(version)) throw new Error('El servidor PostgreSQL no es 17.x.');

  const periodRows = (await client.query<{ id: string; estado: string; contrato_id: string; empresa_id: string }>(
    `SELECT np.id::text AS id, np.estado, np.contrato_id::text AS contrato_id, c.empresa_id::text AS empresa_id
       FROM nomina_periodos np JOIN contratos c ON c.id=np.contrato_id
      WHERE np.id = ANY($1::bigint[]) ORDER BY np.id`, [[3, 4, 5, 6]]
  )).rows;
  const period3 = periodRows.find((row) => row.id === '3');
  if (!period3) throw new Error('No existe el periodo 3.');

  const candidates = (await client.query<{ id: string }>(
    `SELECT DISTINCT ne.id::text AS id
       FROM nomina_empleados ne
       JOIN vinculaciones v ON v.id=ne.vinculacion_id
       JOIN contratos c ON c.id=v.contrato_id
      WHERE ne.periodo_id=$1::bigint AND c.id=$2::bigint AND c.empresa_id=$3::bigint
        AND EXISTS (SELECT 1 FROM nomina_novedades n WHERE n.nomina_empleado_id=ne.id AND n.periodo_id=$1::bigint AND COALESCE(n.activo,TRUE)=TRUE)
      ORDER BY 1`, [3, 24, 15]
  )).rows.map((row) => row.id);

  const counts = (await client.query<{ empleados: number; novedades: number; dias: number }>(
    `WITH scoped_employees AS (
       SELECT DISTINCT ne.id
         FROM nomina_empleados ne
         JOIN vinculaciones v ON v.id=ne.vinculacion_id
         JOIN contratos c ON c.id=v.contrato_id
        WHERE ne.periodo_id=$1::bigint AND c.id=$2::bigint AND c.empresa_id=$3::bigint
     ), active_novelties AS (
       SELECT DISTINCT n.id, n.fecha_inicio::date, n.fecha_fin::date, np.fecha_inicio::date AS periodo_inicio, np.fecha_fin::date AS periodo_fin
         FROM nomina_novedades n
         JOIN scoped_employees se ON se.id=n.nomina_empleado_id
         JOIN nomina_periodos np ON np.id=$1::bigint
        WHERE n.periodo_id=$1::bigint AND COALESCE(n.activo,TRUE)
     )
     SELECT (SELECT COUNT(*)::int FROM scoped_employees) AS empleados,
            (SELECT COUNT(*)::int FROM active_novelties) AS novedades,
            COALESCE((SELECT SUM(GREATEST(0, LEAST(COALESCE(fecha_fin,fecha_inicio),periodo_fin)
              - GREATEST(fecha_inicio,periodo_inicio) + 1))::int FROM active_novelties),0)::int AS dias`, [3, 24, 15]
  )).rows[0];
  const period5 = (await client.query<{ empleados: number; novedades: number }>(
    `SELECT COUNT(DISTINCT ne.id)::int AS empleados,
            COUNT(DISTINCT nn.id) FILTER (WHERE COALESCE(nn.activo,TRUE))::int AS novedades
       FROM nomina_periodos np
       LEFT JOIN nomina_empleados ne ON ne.periodo_id=np.id
       LEFT JOIN nomina_novedades nn ON nn.nomina_empleado_id=ne.id AND nn.periodo_id=np.id
      WHERE np.id=5 GROUP BY np.estado`,
  )).rows[0] ?? { empleados: 0, novedades: 0 };
  const waitingLocks = (await client.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
       FROM pg_stat_activity a
       JOIN pg_locks l ON l.pid=a.pid AND NOT l.granted
      WHERE a.datname=current_database()`,
  )).rows[0]?.total ?? 0;
  const protectedRows = (await client.query<{ liquidations: number; payslips: number; adjustments: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM nomina_liquidaciones l JOIN nomina_empleados e ON e.vinculacion_id=l.vinculacion_id AND e.periodo_id=3 WHERE l.periodo_id=3 AND COALESCE(l.activo,TRUE) AND l.estado IN ('FINALIZADA','LIQUIDADA','PAGADA','CERRADA')) AS liquidations,
       (SELECT COUNT(*)::int FROM nomina_desprendibles d JOIN nomina_empleados e ON e.id=d.nomina_empleado_id AND e.periodo_id=3 WHERE d.periodo_id=3 AND COALESCE(d.activo,TRUE)) AS payslips,
       (SELECT COUNT(*)::int FROM nomina_ajustes_manuales a JOIN nomina_empleados e ON e.id=a.nomina_empleado_id AND e.periodo_id=3 WHERE a.periodo_id=3 AND COALESCE(a.activo,TRUE)) AS adjustments`
  )).rows[0] ?? { liquidations: 0, payslips: 0, adjustments: 0 };
  const movement = (await client.query<{ count: number; active_count: number; active_turn_count: number; turn_record_count: number; digest: string }>(
    `SELECT COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE COALESCE(m.activo,TRUE))::int AS active_count,
            COUNT(*) FILTER (WHERE COALESCE(m.activo,TRUE) AND m.tipo_movimiento IN ('TURNO_INTERNO','TURNO_EXTERNO'))::int AS active_turn_count,
            (SELECT COUNT(*)::int FROM nomina_novedad_turnos nnt WHERE nnt.periodo_id=3 AND COALESCE(nnt.activo,TRUE)) AS turn_record_count,
            md5(COALESCE(string_agg(to_jsonb(m)::text, '|' ORDER BY m.id), '')) AS digest
       FROM nomina_movimientos m WHERE m.periodo_id=$1::bigint`, [3]
  )).rows[0] ?? { count: 0, active_count: 0, active_turn_count: 0, turn_record_count: 0, digest: '' };

  const scope: ControlledPreflight = {
    empresaId: period3.empresa_id,
    contratoId: period3.contrato_id,
    periodoId: period3.id,
    periodoEstado: period3.estado,
    employeesMaterialized: Number(counts?.empleados ?? 0),
    candidateEmployeeIds: candidates,
    protectedLiquidations: Number(protectedRows.liquidations ?? 0),
    protectedPayslips: Number(protectedRows.payslips ?? 0),
    protectedManualAdjustments: Number(protectedRows.adjustments ?? 0),
    waitingLocks: Number(waitingLocks),
    period5Employees: Number(period5.empleados ?? 0),
    period5ActiveNovelties: Number(period5.novedades ?? 0),
    excludedEmployees: Number(counts?.empleados ?? 0) - candidates.length,
    activeNoveltyRows: Number(counts?.novedades ?? 0),
    activeNoveltyDays: Number(counts?.dias ?? 0)
  };
  assertControlledPreflight(scope);
  if (periodRows.some((row) => (row.id === '4' || row.id === '6') && row.estado !== 'ANULADO')) {
    throw new Error('Un periodo anulado de control no está ANULADO.');
  }
  return {
    ...scope,
    serverVersion: version,
    periodStates: Object.fromEntries(periodRows.map((row) => [row.id, row.estado])),
    activeNoveltyCount: Number(counts?.novedades ?? 0),
    activeNoveltyRows: Number(counts?.novedades ?? 0),
    activeNoveltyDays: Number(counts?.dias ?? 0),
    excludedEmployees: Number(counts?.empleados ?? 0) - candidates.length,
    employeesMaterialized: Number(counts?.empleados ?? 0),
    movementCount: Number(movement.count ?? 0),
    activeMovementCount: Number(movement.active_count ?? 0),
    activeTurnRecordCount: Number(movement.turn_record_count ?? movement.active_turn_count ?? 0),
    movementDigest: movement.digest,
    candidateDigest: createHash('sha256').update(candidates.join('|')).digest('hex'),
    noveltyDigest: (await client.query<{ digest: string }>(
      `SELECT md5(COALESCE(string_agg(n.id::text,'|' ORDER BY n.id),'')) AS digest
         FROM nomina_novedades n
         JOIN nomina_empleados ne ON ne.id=n.nomina_empleado_id AND ne.periodo_id=n.periodo_id
         JOIN vinculaciones v ON v.id=ne.vinculacion_id
         JOIN contratos c ON c.id=v.contrato_id
        WHERE n.periodo_id=$1::bigint AND COALESCE(n.activo,TRUE) AND c.id=$2::bigint AND c.empresa_id=$3::bigint`, [3,24,15]
    )).rows[0]?.digest ?? '',
    actorUserId
  };
});

const printPreflight = (health: HealthResponse, preflight: Preflight): void => {
  console.log(JSON.stringify({
    mode: 'PreflightOnly',
    health: {
      url: HEALTH_URL,
      success: health.success,
      status: health.data?.status,
      database: health.data?.database?.status,
      outbox: health.data?.integracion_outbox,
      sync_efectivo: false,
      recalc_efectivo: false
    },
    database: { server_version: preflight.serverVersion },
    scope: { empresa: 15, contrato: 24, periodo: 3, estado: preflight.periodoEstado },
    period_states: preflight.periodStates,
    empleados_materializados: preflight.employeesMaterialized,
    excluidos_sin_novedad: preflight.excludedEmployees,
    filas_novedades_activas: preflight.activeNoveltyRows,
    dias_novedades_activas: preflight.activeNoveltyDays,
    candidatos: preflight.candidateEmployeeIds.length,
    protected: {
      liquidaciones: preflight.protectedLiquidations,
      desprendibles: preflight.protectedPayslips,
      ajustes_manuales: preflight.protectedManualAdjustments
    },
    period5: {
      employees: preflight.period5Employees,
      active_novelties: preflight.period5ActiveNovelties,
      intact_baseline: preflight.period5Employees === 788 && preflight.period5ActiveNovelties === 1
    },
    waiting_locks: preflight.waitingLocks,
    digests: {
      candidatos: preflight.candidateDigest,
      novedades_activas: preflight.noveltyDigest,
      movimientos: preflight.movementDigest
    },
    movimientos_snapshot: {
      total: preflight.movementCount,
      activos: preflight.activeMovementCount,
      turnos_activos: preflight.activeTurnRecordCount,
      digest: preflight.movementDigest
    }
  }));
};

const runMutator = async (preflight: Preflight, pass: string, actorUserId: number): Promise<void> => {
  const lockClient = await dbPool.connect();
  let completed = 0;
  try {
    await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [LOCK_KEY]);
    const lockedPreflight = await readPreflight(actorUserId);
    if (
      lockedPreflight.candidateEmployeeIds.length !== preflight.candidateEmployeeIds.length ||
      lockedPreflight.candidateEmployeeIds.some((id, index) => id !== preflight.candidateEmployeeIds[index]) ||
      lockedPreflight.candidateDigest !== preflight.candidateDigest ||
      lockedPreflight.noveltyDigest !== preflight.noveltyDigest ||
      lockedPreflight.excludedEmployees !== preflight.excludedEmployees ||
      lockedPreflight.activeNoveltyRows !== preflight.activeNoveltyRows ||
      lockedPreflight.activeNoveltyDays !== preflight.activeNoveltyDays ||
      lockedPreflight.movementDigest !== preflight.movementDigest
    ) {
      throw new Error('El preflight cambió mientras se adquiría el advisory lock.');
    }
    for (const employeeId of lockedPreflight.candidateEmployeeIds) {
      await recalculateNominaPeriodo(
        CONTROLLED_RECALC_SCOPE.periodoId,
        {
          force: true,
          nomina_empleado_id: employeeId,
          controlledScope: {
            empresaId: CONTROLLED_RECALC_SCOPE.empresaId,
            contratoId: CONTROLLED_RECALC_SCOPE.contratoId,
            candidateEmployeeIds: lockedPreflight.candidateEmployeeIds,
            preserveOperationalSources: true,
            suppressExternalSync: true
          }
        },
        String(actorUserId),
        undefined,
        { user_agent: `nomina-controlado:${pass}` }
      );
      completed += 1;
    }
    const after = await readPreflight(actorUserId);
    if (after.movementCount !== lockedPreflight.movementCount || after.movementDigest !== lockedPreflight.movementDigest) {
      throw new Error('La protección de movimientos/turnos detectó una divergencia.');
    }
    console.log(JSON.stringify({ mode: 'Mutator', pass, completed, status: 'SUCCESS', idempotence: pass === 'second' }));
  } catch (error) {
    console.error(JSON.stringify({ mode: 'Mutator', pass, completed, status: 'FAILED', error: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY]).catch(() => undefined);
    lockClient.release();
  }
};

type RecoverySnapshot = {
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const loadRecoverySnapshots = (path: string): RecoverySnapshot[] => {
  const parsed = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as RecoverySnapshot[];
  if (!Array.isArray(parsed) || parsed.length !== CONTROLLED_RECOVERY_VALIDATED_IDS.length) {
    throw new Error('El snapshot de recuperación no contiene exactamente 15 registros.');
  }
  const expected = [...CONTROLLED_RECOVERY_VALIDATED_IDS];
  const actual = parsed.map((item) => item.id);
  if (actual.some((id, index) => id !== expected[index])) throw new Error('El snapshot de recuperación no coincide con los 15 IDs autorizados.');
  if (parsed.some((item) => !item.before || !item.after)) throw new Error('El snapshot de recuperación está incompleto.');
  return parsed;
};

const runResume = async (preflight: Preflight, actorUserId: number, confirmationValue: string, snapshotPath: string, backupManifest: string): Promise<void> => {
  if (actorUserId !== 12) throw new Error('La recuperación controlada exige ActorUserId 12.');
  assertExactRecoveryConfirmation(confirmationValue);
  const snapshots = loadRecoverySnapshots(snapshotPath);
  const validated = new Set<string>(CONTROLLED_RECOVERY_VALIDATED_IDS);
  const pending = preflight.candidateEmployeeIds.filter((id) => !validated.has(id));
  if (pending.length !== 172) throw new Error(`El complemento pendiente no contiene exactamente 172 candidatos: ${pending.length}.`);

  const lockClient = await dbPool.connect();
  let audited = 0;
  let completed = 0;
  try {
    await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [LOCK_KEY]);
    const locked = await readPreflight(actorUserId);
    if (locked.candidateDigest !== preflight.candidateDigest || locked.noveltyDigest !== preflight.noveltyDigest || locked.movementDigest !== preflight.movementDigest || locked.candidateEmployeeIds.length !== 187) {
      throw new Error('El conjunto productivo cambió al adquirir el advisory lock.');
    }
    const recoveryMeta = {
      incidente: 'INCIDENTE_NOMINA_ACTOR_0_FK',
      backup_manifest: backupManifest,
      operacion: 'NOMINA_RECALCULO_CONTROLADO_RECUPERADO'
    };
    for (const snapshot of snapshots) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query("SET LOCAL lock_timeout = '5s'");
        const event = (await client.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM auditoria_eventos WHERE accion=$1 AND entidad='nomina_empleados' AND entidad_id=$2 AND datos_nuevos->'recovery'->>'backup_manifest'=$3 AND datos_nuevos->'recovery'->>'digest_before'=$4 AND datos_nuevos->'recovery'->>'digest_after'=$5`,
          ['NOMINA_RECALCULO_CONTROLADO_RECUPERADO', snapshot.id, backupManifest, String(snapshot.before.detalle_calculo_digest), String(snapshot.after.detalle_calculo_digest)]
        )).rows[0]?.total ?? 0;
        const legacy = (await client.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM auditoria WHERE accion=$1 AND tabla_afectada='nomina_empleados' AND registro_id=$2 AND datos_nuevos->'recovery'->>'backup_manifest'=$3 AND datos_nuevos->'recovery'->>'digest_before'=$4 AND datos_nuevos->'recovery'->>'digest_after'=$5`,
          ['NOMINA_RECALCULO_CONTROLADO_RECUPERADO', snapshot.id, backupManifest, String(snapshot.before.detalle_calculo_digest), String(snapshot.after.detalle_calculo_digest)]
        )).rows[0]?.total ?? 0;
        if ((event > 0) !== (legacy > 0) || event > 1 || legacy > 1) throw new Error(`Auditoría correctiva inconsistente para empleado técnico ${snapshot.id}.`);
        if (event === 0) {
          await registerAuditEntry({
            client,
            usuario_id: String(actorUserId),
            empresa_id: '15',
            contrato_id: '24',
            accion: 'NOMINA_RECALCULO_CONTROLADO_RECUPERADO',
            tabla: 'nomina_empleados',
            registro_id: snapshot.id,
            descripcion: 'Auditoría correctiva de cálculo validado tras incidente controlado',
            before: { ...snapshot.before, recovery: { ...recoveryMeta, digest_before: snapshot.before.detalle_calculo_digest, digest_after: snapshot.after.detalle_calculo_digest } },
            after: { ...snapshot.after, recovery: { ...recoveryMeta, digest_before: snapshot.before.detalle_calculo_digest, digest_after: snapshot.after.detalle_calculo_digest } },
            user_agent: 'nomina-controlado:resume',
            strict: true
          });
          audited += 1;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
    for (const employeeId of pending) {
      await recalculateNominaPeriodo(
        CONTROLLED_RECALC_SCOPE.periodoId,
        {
          force: true,
          nomina_empleado_id: employeeId,
          controlledScope: {
            empresaId: CONTROLLED_RECALC_SCOPE.empresaId,
            contratoId: CONTROLLED_RECALC_SCOPE.contratoId,
            candidateEmployeeIds: locked.candidateEmployeeIds,
            preserveOperationalSources: true,
            suppressExternalSync: true
          }
        },
        String(actorUserId),
        undefined,
        { user_agent: 'nomina-controlado:resume' }
      );
      completed += 1;
    }
    console.log(JSON.stringify({ mode: 'Resume', audited_validated: audited, recalculated_pending: completed, status: 'SUCCESS' }));
  } catch (error) {
    console.error(JSON.stringify({ mode: 'Resume', audited_validated: audited, recalculated_pending: completed, status: 'FAILED', error: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY]).catch(() => undefined);
    lockClient.release();
  }
};

const args = process.argv.slice(2);
const mode = args.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'preflight';
const pass = args.includes('--second-pass') ? 'second' : 'first';
const confirmation = args.find((arg) => arg.startsWith('--confirmation='))?.slice('--confirmation='.length) ?? '';
const actorUserIdRaw = args.find((arg) => arg.startsWith('--actor-user-id='))?.slice('--actor-user-id='.length) ?? '';
const actorUserId = Number(actorUserIdRaw);
const previewIdsRaw = args.find((arg) => arg.startsWith('--preview-ids='))?.slice('--preview-ids='.length) ?? '';
const recoverySnapshotPath = args.find((arg) => arg.startsWith('--recovery-snapshot='))?.slice('--recovery-snapshot='.length) ?? '';
const recoveryBackupManifest = args.find((arg) => arg.startsWith('--recovery-backup-manifest='))?.slice('--recovery-backup-manifest='.length) ?? '';

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const parsePreviewIds = (preflight: Preflight): string[] => {
  const ids = previewIdsRaw.split(',').map((value) => value.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id))) throw new Error('PreviewIds debe contener IDs técnicos enteros separados por comas.');
  if (new Set(ids).size !== ids.length) throw new Error('PreviewIds contiene duplicados.');
  const candidateSet = new Set(preflight.candidateEmployeeIds);
  if (ids.some((id) => !candidateSet.has(id))) throw new Error('PreviewIds contiene empleados fuera del conjunto candidato validado.');
  return ids;
};

const runPreview = async (preflight: Preflight, actorUserId: number, ids: string[]): Promise<void> => {
  const results = [];
  for (const employeeId of ids) {
    const result = await recalculateNominaPeriodo(
      CONTROLLED_RECALC_SCOPE.periodoId,
      {
        force: true,
        nomina_empleado_id: employeeId,
        previewOnly: true,
        controlledScope: {
          empresaId: CONTROLLED_RECALC_SCOPE.empresaId,
          contratoId: CONTROLLED_RECALC_SCOPE.contratoId,
          candidateEmployeeIds: preflight.candidateEmployeeIds,
          preserveOperationalSources: true,
          suppressExternalSync: true
        }
      },
      String(actorUserId),
      undefined,
      { user_agent: 'nomina-controlado:preview' }
    );
    const preview = result.preview?.[0];
    if (!preview) throw new Error(`El preview no produjo resultado para empleado técnico ${employeeId}.`);
    const { detalle_calculo: detalleCalculo, ...economicPreview } = preview;
    results.push({
      ...economicPreview,
      detalle_calculo_digest: createHash('sha256').update(canonicalize(detalleCalculo)).digest('hex')
    });
  }
  console.log(JSON.stringify({ mode: 'PreviewOnly', actor_user_id: actorUserId, ids, results, status: 'SUCCESS' }));
};

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'production') throw new Error('El runner controlado requiere NODE_ENV=production.');
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) throw new Error('El runner requiere --actor-user-id entero positivo.');
  if (mode !== 'preflight' && mode !== 'preview' && mode !== 'mutate' && mode !== 'resume') throw new Error('Modo inválido.');
  const health = await readHealth();
  const preflight = await readPreflight(actorUserId);
  if (mode === 'preflight') {
    printPreflight(health, preflight);
    return;
  }
  if (mode === 'preview') {
    const ids = parsePreviewIds(preflight);
    await runPreview(preflight, actorUserId, ids);
    return;
  }
  if (mode === 'resume') {
    if (!recoverySnapshotPath || !recoveryBackupManifest) throw new Error('Resume requiere snapshot y manifiesto de backup.');
    await runResume(preflight, actorUserId, confirmation, recoverySnapshotPath, recoveryBackupManifest);
    return;
  }
  assertExactConfirmation(preflight.candidateEmployeeIds.length, confirmation);
  await runMutator(preflight, pass, actorUserId);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => dbPool.end().catch(() => undefined));
