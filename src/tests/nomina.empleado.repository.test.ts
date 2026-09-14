import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import {
  NominaEmpleadoRepository,
  type NominaEmpleadoRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-empleado.repository';

const schema = `
  CREATE TABLE contratos (id bigint PRIMARY KEY, empresa_id bigint NOT NULL);
  CREATE TABLE nomina_periodos (
    id bigint PRIMARY KEY,
    contrato_id bigint NOT NULL,
    estado text NOT NULL
  );
  CREATE TABLE vinculaciones (id bigint PRIMARY KEY, empresa_id bigint NOT NULL);
  CREATE TABLE nomina_empleados (
    id bigint PRIMARY KEY,
    periodo_id bigint NOT NULL,
    vinculacion_id bigint NOT NULL,
    revisado boolean,
    estado text,
    activo boolean
  );
  INSERT INTO contratos VALUES (24, 15), (25, 16);
  INSERT INTO nomina_periodos VALUES (2, 24, 'CERRADO'), (3, 24, 'ABIERTO'), (4, 25, 'ABIERTO');
  INSERT INTO vinculaciones VALUES (101, 15), (102, 15), (201, 16);
  INSERT INTO nomina_empleados VALUES
    (10, 2, 101, false, 'PENDIENTE', true),
    (11, 2, 102, true, 'REVISADO', true),
    (12, 3, 101, false, 'PENDIENTE', true),
    (20, 4, 201, false, 'PENDIENTE', true);
`;

function makeExecutor(db: PGlite): NominaEmpleadoRepositoryExecutor {
  return {
    query: <T extends Record<string, unknown>>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined)
  } as unknown as NominaEmpleadoRepositoryExecutor;
}

test('NominaEmpleadoRepository conserva lecturas, filtros tenant, orden y paginacion', async () => {
  const db = new PGlite();
  const repository = new NominaEmpleadoRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);

    const byId = await repository.getById('10', executor);
    assert.deepEqual(
      { id: byId?.id, periodo_id: byId?.periodo_id, periodo_estado: byId?.periodo_estado },
      { id: '10', periodo_id: '2', periodo_estado: 'CERRADO' }
    );
    assert.equal(await repository.getById('999', executor), null);

    const byPeriodoVinculacion = await repository.getByPeriodoVinculacion('2', '102', executor);
    assert.equal(byPeriodoVinculacion?.id, '11');
    assert.equal(await repository.getByPeriodoVinculacion('3', '102', executor), null);

    const scoped = await repository.listByPeriodo({
      periodoId: '2',
      page: 1,
      limit: 1,
      tenant: { contratoIds: [], empresaIds: [15], isGlobalAdmin: false }
    }, executor);
    assert.equal(scoped.total, 2);
    assert.deepEqual(scoped.rows.map((row) => row.id), ['10']);

    const secondPage = await repository.listByPeriodo({
      periodoId: '2',
      page: 2,
      limit: 1,
      contratoId: '24',
      empresaId: '15',
      tenant: { contratoIds: [24], empresaIds: [], isGlobalAdmin: false }
    }, executor);
    assert.deepEqual(secondPage.rows.map((row) => row.id), ['11']);

    const otherTenant = await repository.listByPeriodo({
      periodoId: '2',
      page: 1,
      limit: 10,
      tenant: { contratoIds: [25], empresaIds: [16], isGlobalAdmin: false }
    }, executor);
    assert.equal(otherTenant.total, 0);

    const byVinculacion = await repository.listByPeriodo({
      periodoId: '2',
      vinculacionId: '102',
      page: 1,
      limit: 10
    }, executor);
    assert.deepEqual(byVinculacion.rows.map((row) => row.id), ['11']);
  } finally {
    await db.close();
  }
});

test('NominaEmpleadoRepository usa el mismo executor y conserva rollback', async () => {
  const db = new PGlite();
  const repository = new NominaEmpleadoRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    await executor.query('BEGIN');
    await repository.updateReviewState({ empleadoId: '10', revisado: true, estado: 'REVISADO' }, executor);
    assert.equal((await repository.getById('10', executor))?.estado, 'REVISADO');
    await executor.query('ROLLBACK');

    const rolledBack = await repository.getById('10', executor);
    assert.equal(rolledBack?.revisado, false);
    assert.equal(rolledBack?.estado, 'PENDIENTE');
  } finally {
    await db.close();
  }
});

test('updateReviewState rechaza registros inexistentes', async () => {
  const db = new PGlite();
  const repository = new NominaEmpleadoRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    await assert.rejects(
      repository.updateReviewState({ empleadoId: '999', revisado: true, estado: 'REVISADO' }, executor),
      /returned no id/
    );
  } finally {
    await db.close();
  }
});
