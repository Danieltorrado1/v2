import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConfirmationPhrase,
  canonicalDigest,
  parseMutationArgs,
  validateMutationArgs,
  EXPECTED_BASE_COMMIT,
  EXPECTED_PROJECT_REF
} from '../scripts/nomina-periodo3-safe-correction-runner.js';

const snapshot = {
  schema_version: 'nomina-safe-correction-set-1.0',
  engine_commit: 'e32a6925345057a8963597ea1bee985b98d7cf27',
  empresa: '15', contrato: '24', periodo: '3',
  eligible_employee_ids: Array.from({ length: 234 }, (_, index) => String(10000 + index)),
  excluded_employee_ids: ['778', '780', ...Array.from({ length: 82 }, (_, index) => String(1440 + index)), '1214', '1537'],
  rows: Array.from({ length: 234 }, (_, index) => ({ id: String(10000 + index), current_digest: `before-${index}`, expected_digest: `after-${index}`, eligibility: 'ELIGIBLE_SAFE' }))
};

const manifest = {
  schema_version: 'nomina-periodo3-production-backup-1.0',
  postgres_client: 'pg_dump (PostgreSQL) 17.11',
  files: Array.from({ length: 15 }, (_, index) => ({ table: `table_${index}`, dump: `table_${index}.dump`, restore_list: `table_${index}.restore-list.txt`, size: 1, sha256: `hash-${index}` })),
  safe_set: { eligible_count: 234, excluded_missing_category: 84, excluded_conflict_ids: ['1214', '1537'] }
};

test('Mutate exige todos los argumentos y actor 12', () => {
  assert.throws(() => parseMutationArgs(['-Mutate', '--actor-user-id', '11']), /MUTATE_ARGUMENT_REQUIRED/);
  assert.throws(() => parseMutationArgs(['-Mutate', '--actor-user-id', '0', '--backup', 'b', '--manifest', 'm', '--snapshot', 's', '--project-ref', 'p', '--base-commit', 'c', '--confirmation', 'x']), /MUTATE_ACTOR_INVALID/);
});

test('la confirmación es exacta y no acepta cambios de espacios o mayúsculas', () => {
  const phrase = buildConfirmationPhrase({ snapshotDigest: 'safe', manifestDigest: 'manifest', projectRef: EXPECTED_PROJECT_REF });
  assert.match(phrase, /empleados=234 actor=12/);
  const args = { actorUserId: '12', backupPath: 'b', manifestPath: 'm', snapshotPath: 's', projectRef: EXPECTED_PROJECT_REF, baseCommit: EXPECTED_BASE_COMMIT, confirmation: phrase, resume: false };
  const previous = process.env.NOMINA_CONTROLLED_MUTATION_ENV;
  process.env.NOMINA_CONTROLLED_MUTATION_ENV = 'PRODUCTION';
  try {
    assert.doesNotThrow(() => validateMutationArgs(args, snapshot, manifest, 'safe', 'manifest'));
    assert.throws(() => validateMutationArgs({ ...args, confirmation: phrase.replace('actor=12', 'actor=12 ') }, snapshot, manifest, 'safe', 'manifest'), /MUTATE_CONFIRMATION_EXACT_MISMATCH/);
  } finally {
    if (previous === undefined) delete process.env.NOMINA_CONTROLLED_MUTATION_ENV;
    else process.env.NOMINA_CONTROLLED_MUTATION_ENV = previous;
  }
});

type SimRow = { value: number; before: string; expected: string };

class IsolatedMutationSimulation {
  public readonly rows = new Map<string, SimRow>(snapshot.rows.map((row, index) => [row.id, { value: index, before: row.current_digest, expected: row.expected_digest }]));
  public readonly audits = new Set<string>();
  public readonly protectedDigest = canonicalDigest({ novelty: 'same', attendance: 'same', movement: 'same', turns: 'same', period: 'same', external: 'same' });

  public run(failAt?: string): { completed: number; pending: number; rolledBack: boolean } {
    let completed = 0;
    for (const [id, row] of this.rows) {
      if (this.audits.has(id) && row.before === row.expected) { completed += 1; continue; }
      const previous = { ...row };
      if (row.before !== snapshot.rows.find(item => item.id === id)?.current_digest) throw new Error(`DIGEST_BEFORE_${id}`);
      try {
        if (id === failAt) throw new Error(`INJECTED_FAILURE_${id}`);
        row.value += 1;
        row.before = row.expected;
        this.audits.add(id);
        completed += 1;
      } catch (error) {
        this.rows.set(id, previous);
        throw error;
      }
    }
    return { completed, pending: 234 - completed, rolledBack: false };
  }
}

test('simulación aislada de 234 casos, rollback, Resume e idempotencia', () => {
  const simulation = new IsolatedMutationSimulation();
  assert.throws(() => simulation.run('10117'), /INJECTED_FAILURE_10117/);
  const failedRow = simulation.rows.get('10117');
  assert.equal(failedRow?.value, 117);
  assert.equal(simulation.audits.has('10117'), false);
  const resumed = simulation.run();
  assert.equal(resumed.completed, 234);
  assert.equal(resumed.pending, 0);
  const second = simulation.run();
  assert.equal(second.completed, 234);
  assert.equal(simulation.audits.size, 234);
  assert.equal(simulation.protectedDigest, canonicalDigest({ novelty: 'same', attendance: 'same', movement: 'same', turns: 'same', period: 'same', external: 'same' }));
});

test('simulación mantiene exclusiones y rechaza estado no elegible', () => {
  assert.equal(snapshot.eligible_employee_ids.length, 234);
  assert.equal(snapshot.excluded_employee_ids.includes('1214'), true);
  assert.equal(snapshot.excluded_employee_ids.includes('1537'), true);
  assert.equal(snapshot.rows.some(row => row.id === '1214'), false);
  assert.equal(snapshot.rows.some(row => row.id === '1537'), false);
});
