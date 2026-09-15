import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { dbPool } from '../config/db';
import { NominaPoblacionService } from '../modules/nomina/application/nomina-poblacion.service';

test('NominaPoblacionService usa el mismo executor y recalcula solo después del commit', async () => {
  const events: string[] = [];
  const client = {
    async query(sql: string) {
      events.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release() { events.push('release'); }
  };
  mock.method(dbPool, 'connect', async () => client as never);

  try {
    const result = await new NominaPoblacionService().sync({
      syncWithinTransaction: async ({ client: executor }) => {
        assert.equal(executor, client);
        await executor.query('population operation');
        return { result: { imported: 2 }, recalculableEmployeeIds: ['10', '10', '11'] };
      },
      recalculate: async (employeeId) => { events.push(`recalculate:${employeeId}`); }
    });

    assert.deepEqual(result, { imported: 2 });
    assert.deepEqual(events, [
      'BEGIN', 'population operation', 'COMMIT',
      'recalculate:10', 'recalculate:11', 'release'
    ]);
  } finally {
    mock.restoreAll();
  }
});

test('NominaPoblacionService hace rollback y libera el mismo executor ante fallo', async () => {
  const events: string[] = [];
  const client = {
    async query(sql: string) {
      events.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release() { events.push('release'); }
  };
  mock.method(dbPool, 'connect', async () => client as never);

  try {
    await assert.rejects(() => new NominaPoblacionService().sync({
      syncWithinTransaction: async () => { throw new Error('population failure'); },
      recalculate: async () => undefined
    }), /population failure/);
    assert.deepEqual(events, ['BEGIN', 'ROLLBACK', 'release']);
  } finally {
    mock.restoreAll();
  }
});
