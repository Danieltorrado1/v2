import crypto from 'node:crypto';

import { env } from '../config/env';
import { assertIntegracionOutboxSchema, integracionRecalcState, processNextIntegracionEvent } from '../modules/integracion/integracion.service';

const BATCH_SIZE = 10;
let timer: NodeJS.Timeout | undefined;
let running = false;
let stopping = false;
let lastRunAt: string | null = null;
let lastError: string | null = null;
let processed = 0;
const workerId = `integracion-${process.pid}-${crypto.randomUUID()}`;

export const getIntegracionWorkerHealth = (): { enabled: boolean; running: boolean; stopping: boolean; worker_id: string; last_run_at: string | null; last_error: string | null; processed: number; schema?: 'ok' | 'disabled'; recalc: ReturnType<typeof integracionRecalcState> } => ({
  enabled: env.INTEGRACION_OUTBOX_ENABLED,
  running,
  stopping,
  worker_id: workerId,
  last_run_at: lastRunAt,
  last_error: lastError,
  processed,
  recalc: integracionRecalcState()
});

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
  if (!env.INTEGRACION_OUTBOX_ENABLED || timer) return;
  stopping = false;
  const schedule = (): void => {
    timer = setTimeout(async () => {
      try { await runIntegracionWorkerCycle(); } catch { /* health exposes the failure; next cycle remains safe */ }
      if (!stopping) schedule();
    }, env.INTEGRACION_WORKER_INTERVAL_MS);
  };
  schedule();
};

export const stopIntegracionWorker = async (): Promise<void> => {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = undefined;
  while (running) await new Promise((resolve) => setTimeout(resolve, 25));
};
