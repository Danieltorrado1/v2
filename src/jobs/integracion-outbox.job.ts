import crypto from 'node:crypto';

import { env } from '../config/env';
import { assertIntegracionOutboxSchema, integracionRecalcState, processNextIntegracionEvent } from '../modules/integracion/integracion.service';

const BATCH_SIZE = 10;
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
let started = false;
let lastRunAt: string | null = null;
let lastError: string | null = null;
let processed = 0;
const workerId = `integracion-${process.pid}-${crypto.randomUUID()}`;

type IntegracionWorkerMode = 'DISABLED' | 'OBSERVATION' | 'SYNC' | 'RECALC';

export const getIntegracionWorkerHealth = (): {
  configured: boolean;
  enabled: boolean;
  started: boolean;
  running: boolean;
  cycle_running: boolean;
  stopping: boolean;
  worker_id: string;
  last_run_at: string | null;
  last_error: string | null;
  processed: number;
  mode: IntegracionWorkerMode;
  inactive_reason: string | null;
  schema?: 'ok' | 'disabled';
  recalc: ReturnType<typeof integracionRecalcState>;
} => {
  const recalc = integracionRecalcState();
  const mode: IntegracionWorkerMode = !env.INTEGRACION_OUTBOX_ENABLED
    ? 'DISABLED'
    : recalc.active
      ? 'RECALC'
      : env.INTEGRACION_SYNC_ENABLED
        ? 'SYNC'
        : 'OBSERVATION';
  const inactiveReason = !env.INTEGRACION_OUTBOX_ENABLED
    ? 'OUTBOX_DISABLED'
    : stopping
      ? 'STOPPING'
      : !started
        ? 'WORKER_NOT_STARTED'
        : !lastRunAt
          ? 'WAITING_FOR_FIRST_CYCLE'
          : null;

  return {
    configured: env.INTEGRACION_OUTBOX_ENABLED,
    enabled: env.INTEGRACION_OUTBOX_ENABLED,
    started,
    running,
    cycle_running: running,
    stopping,
    worker_id: workerId,
    last_run_at: lastRunAt,
    last_error: lastError,
    processed,
    mode,
    inactive_reason: inactiveReason,
    recalc
  };
};

export const runIntegracionWorkerCycle = async (): Promise<number> => {
  if (!env.INTEGRACION_OUTBOX_ENABLED || stopping || running) return 0;
  running = true;
  lastRunAt = new Date().toISOString();
  lastError = null;
  let count = 0;
  try {
    await assertIntegracionOutboxSchema();
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      const event = await processNextIntegracionEvent(workerId);
      if (!event) break;
      count += 1;
    }
    processed += count;
    return count;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    running = false;
  }
};

export const startIntegracionWorker = (): void => {
  if (!env.INTEGRACION_OUTBOX_ENABLED) {
    console.log('[jobs.integracion] Worker disabled by INTEGRACION_OUTBOX_ENABLED.');
    return;
  }
  if (started || timer) {
    console.log('[jobs.integracion] Worker already started. Skipping duplicate initialization.');
    return;
  }
  stopping = false;
  started = true;
  console.log(`[jobs.integracion] Worker started in ${getIntegracionWorkerHealth().mode} mode.`);
  const schedule = (): void => {
    timer = setTimeout(async () => {
      timer = undefined;
      try { await runIntegracionWorkerCycle(); } catch { /* health exposes the failure; next cycle remains safe */ }
      if (!stopping) schedule();
    }, env.INTEGRACION_WORKER_INTERVAL_MS);
  };
  schedule();
};

export const stopIntegracionWorker = async (): Promise<void> => {
  if (!started && !timer && !running) return;
  stopping = true;
  started = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  console.log('[jobs.integracion] Worker stopped.');
};
