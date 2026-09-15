import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  NominaCalculoRepository,
  type NominaCalculoRepositoryExecutor,
  type NominaCalculoResultInput
} from '../modules/nomina/infrastructure/repositories/nomina-calculo.repository';

const schema = `
  CREATE TABLE nomina_empleados (
    id bigint PRIMARY KEY,
    dias_pagados numeric, horas_trabajadas numeric,
    devengado_basico numeric, devengado_transporte numeric, devengado_otros numeric,
    salud numeric, pension numeric, total_adiciones numeric, total_deducciones numeric,
    neto_pagar numeric, detalle_calculo jsonb
  );
  INSERT INTO nomina_empleados VALUES (7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '{"original":true}');
`;

function executor(db: PGlite): NominaCalculoRepositoryExecutor {
  return {
    query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined) as unknown as Promise<QueryResult<T>>
  };
}

const result: NominaCalculoResultInput = {
  empleadoId: '7', diasPagados: 30, horasTrabajadas: 160,
  devengadoBasico: 1000000, devengadoTransporte: 100000,
  devengadoOtros: 25000, salud: 40000, pension: 40000,
  totalAdiciones: 1125000, totalDeducciones: 80000, netoPagar: 1045000,
  detalleCalculo: { motor: 'NOMINA_V1_0', componentes: { neto_pagar: 1045000 } }
};

test('NominaCalculoRepository persiste resultados exactos, lee y usa rollback', async () => {
  const db = new PGlite();
  const repository = new NominaCalculoRepository();
  const client = executor(db);
  try {
    await db.exec(schema);
    await client.query('BEGIN');
    assert.equal(await repository.persistResult(result, client), '7');
    const current = await repository.getCurrentResult('7', client);
    assert.equal(current?.devengado_otros, '25000');
    assert.equal(current?.neto_pagar, '1045000');
    assert.deepEqual(current?.detalle_calculo, result.detalleCalculo);
    await client.query('ROLLBACK');

    const rolledBack = await repository.getCurrentResult('7', client);
    assert.equal(rolledBack?.neto_pagar, '0');
    assert.deepEqual(rolledBack?.detalle_calculo, { original: true });
    await assert.rejects(repository.persistResult({ ...result, empleadoId: '999' }, client), /returned no id/);
  } finally {
    await db.close();
  }
});
