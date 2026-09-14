import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import {
  NominaPeriodoRepository,
  type NominaPeriodoRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-periodo.repository';

test('repositorio V1 de periodos conserva filtros, orden y paginacion del servicio', async () => {
  const db = new PGlite();
  const repository = new NominaPeriodoRepository();
  const executor = {
    query: <T extends Record<string, unknown>>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined)
  } as unknown as NominaPeriodoRepositoryExecutor;

  try {
    await db.exec(`
      CREATE TABLE contratos (
        id bigint PRIMARY KEY,
        empresa_id bigint,
        numero_contrato text,
        entidad_contratante text,
        fecha_inicio date,
        fecha_finalizacion date
      );
      INSERT INTO contratos VALUES
        (1, 10, 'C-1', 'Empresa 10', '2026-01-01', NULL),
        (2, 20, 'C-2', 'Empresa 20', '2026-01-01', NULL);
      CREATE TABLE nomina_periodos (
        id bigserial PRIMARY KEY,
        contrato_id bigint,
        nombre_periodo text,
        fecha_inicio date,
        fecha_fin date,
        tipo_periodo text,
        requiere_asistencia boolean,
        estado text,
        activo boolean,
        created_at timestamptz DEFAULT now()
      );
      INSERT INTO nomina_periodos
        (id, contrato_id, nombre_periodo, fecha_inicio, fecha_fin, tipo_periodo, requiere_asistencia, estado, activo)
      VALUES
        (1, 1, 'ENERO 2026', '2026-01-01', '2026-01-31', 'MENSUAL', true, 'ABIERTO', true),
        (2, 2, 'FEBRERO 2026', '2026-02-01', '2026-02-28', 'MENSUAL', true, 'CERRADO', true);
      SELECT setval('nomina_periodos_id_seq', 2, true);
    `);

    const scoped = await repository.list({
      limit: 10,
      page: 1,
      tenant: { contratoIds: [], empresaIds: [20], isGlobalAdmin: false }
    }, executor);

    assert.equal(scoped.total, 1);
    assert.deepEqual(scoped.rows.map((row) => row.id), ['2']);

    await executor.query('BEGIN');
    const createdId = await repository.create({
      contrato_id: '1',
      fecha_inicio: '2026-03-01',
      fecha_fin: '2026-03-31',
      tipo_periodo: 'MENSUAL',
      nombre_periodo: 'MARZO 2026',
      requiere_asistencia: true,
      activo: true
    }, executor);
    assert.equal(createdId, '3');

    const created = await repository.findById(createdId, executor);
    assert.equal(created?.estado, 'ABIERTO');

    const updatedId = await repository.update({
      periodo_id: createdId,
      contrato_id: '1',
      fecha_inicio: '2026-03-01',
      fecha_fin: '2026-03-31',
      tipo_periodo: 'MENSUAL',
      nombre_periodo: 'MARZO 2026 ACTUALIZADO',
      requiere_asistencia: false,
      activo: true
    }, executor);
    assert.equal(updatedId, createdId);
    assert.equal((await repository.findById(createdId, executor))?.nombre_periodo, 'MARZO 2026 ACTUALIZADO');

    await executor.query('ROLLBACK');
    assert.equal(await repository.findById(createdId, executor), null);
  } finally {
    await db.close();
  }
});

test('repositorio de periodos recibe el cliente transaccional para el lock advisory', async () => {
  const repository = new NominaPeriodoRepository();
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const executor = {
    query: async <T extends Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      calls.push({ text, values });
      return { rows: [] as T[], rowCount: 0 };
    }
  } as unknown as NominaPeriodoRepositoryExecutor;

  await repository.lockIdentity({
    contrato_id: '1',
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-01-31',
    tipo_periodo: 'MENSUAL'
  }, executor);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /pg_advisory_xact_lock/);
  assert.deepEqual(calls[0]!.values, ['1|2026-01-01|2026-01-31|MENSUAL']);
});
