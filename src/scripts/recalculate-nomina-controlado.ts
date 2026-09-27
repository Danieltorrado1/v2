import { dbPool } from '../config/db.js';
import { env } from '../config/env.js';
import { createHash } from 'node:crypto';
import { recalculateNominaPeriodo } from '../modules/nomina/nomina.service.js';
import {
  assertControlledPreflight,
  assertExactConfirmation,
  CONTROLLED_RECALC_PROJECT_REF,
  CONTROLLED_RECALC_SCOPE,
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

const args = process.argv.slice(2);
const mode = args.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'preflight';
const pass = args.includes('--second-pass') ? 'second' : 'first';
const confirmation = args.find((arg) => arg.startsWith('--confirmation='))?.slice('--confirmation='.length) ?? '';
const actorUserIdRaw = args.find((arg) => arg.startsWith('--actor-user-id='))?.slice('--actor-user-id='.length) ?? '';
const actorUserId = Number(actorUserIdRaw);

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'production') throw new Error('El runner controlado requiere NODE_ENV=production.');
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) throw new Error('El runner requiere --actor-user-id entero positivo.');
  if (mode !== 'preflight' && mode !== 'mutate') throw new Error('Modo inválido.');
  const health = await readHealth();
  const preflight = await readPreflight(actorUserId);
  if (mode === 'preflight') {
    printPreflight(health, preflight);
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
