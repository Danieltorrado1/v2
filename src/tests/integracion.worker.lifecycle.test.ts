import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workerModule = './src/jobs/integracion-outbox.job.ts';

const probe = (enableJobs: boolean, outbox: boolean) => {
  const script = `
    import { startIntegracionWorker, stopIntegracionWorker, getIntegracionWorkerHealth } from '${workerModule}';
    startIntegracionWorker();
    startIntegracionWorker();
    const before = getIntegracionWorkerHealth();
    await stopIntegracionWorker();
    await stopIntegracionWorker();
    const after = getIntegracionWorkerHealth();
    console.log(JSON.stringify({ before, after }));
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_NAME: 'worker-lifecycle-test',
      API_PREFIX: '/api',
      NODE_ENV: 'test',
      PORT: '5999',
      DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic',
      JWT_SECRET: 'synthetic-only',
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGIN: 'http://localhost',
      TRUST_PROXY: 'false',
      RATE_LIMIT_WINDOW_MINUTES: '1',
      RATE_LIMIT_MAX_REQUESTS: '10',
      LOG_LEVEL: 'error',
      ENABLE_JOBS: String(enableJobs),
      INTEGRACION_OUTBOX_ENABLED: String(outbox),
      INTEGRACION_SYNC_ENABLED: 'false',
      INTEGRACION_RECALC_ENABLED: 'false',
      INTEGRACION_WORKER_INTERVAL_MS: '60000',
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only',
      SUPABASE_STORAGE_BUCKET: 'synthetic-only'
    }
  });
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(line, result.stdout);
  return JSON.parse(line) as { before: Record<string, unknown>; after: Record<string, unknown> };
};

test('ENABLE_JOBS y OUTBOX controlan ciclos distintos', () => {
  const disabled = probe(false, false);
  assert.equal(disabled.before.started, false);
  assert.equal(disabled.before.mode, 'DISABLED');
  assert.equal(disabled.after.started, false);

  const independent = probe(false, true);
  assert.equal(independent.before.started, true);
  assert.equal(independent.before.mode, 'OBSERVATION');
  assert.equal(independent.after.started, false);

  const historicalOnly = probe(true, false);
  assert.equal(historicalOnly.before.started, false);
  assert.equal(historicalOnly.before.mode, 'DISABLED');

  const both = probe(true, true);
  assert.equal(both.before.started, true);
  assert.equal(both.before.mode, 'OBSERVATION');
});

test('doble inicio y doble shutdown son idempotentes y no reclaman eventos', () => {
  const result = probe(false, true);
  assert.equal(result.before.started, true);
  assert.equal(result.before.running, false);
  assert.equal(result.before.processed, 0);
  assert.equal(result.after.started, false);
  assert.equal(result.after.processed, 0);
});

test('el worker independiente no vuelve a registrar jobs históricos', () => {
  const jobs = readFileSync('src/jobs/jobs.index.ts', 'utf8');
  const server = readFileSync('src/server.ts', 'utf8');
  assert.doesNotMatch(jobs, /startIntegracionWorker/);
  assert.match(server, /startIntegracionWorker\(\);/);
  assert.match(server, /startScheduler\(\);/);
});

test('health expone estado de configuración, ciclo, modo e inactividad', () => {
  const worker = readFileSync('src/jobs/integracion-outbox.job.ts', 'utf8');
  const health = readFileSync('src/modules/health/health.controller.ts', 'utf8');
  assert.match(worker, /configured:/);
  assert.match(worker, /cycle_running:/);
  assert.match(worker, /mode:/);
  assert.match(worker, /inactive_reason:/);
  assert.match(worker, /WAITING_FOR_FIRST_CYCLE/);
  assert.match(health, /res\.status\(503\)/);
  assert.match(health, /INTEGRACION_OUTBOX_SCHEMA_UNAVAILABLE/);
});
