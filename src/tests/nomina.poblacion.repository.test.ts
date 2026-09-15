import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  NominaPoblacionRepository,
  type InsertNominaPoblacionInput,
  type NominaPoblacionRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-poblacion.repository';

const schema = `
  CREATE TABLE nomina_periodos (id bigint PRIMARY KEY, contrato_id bigint NOT NULL);
  CREATE TABLE vinculaciones (id bigint PRIMARY KEY, persona_id bigint NOT NULL, empresa_id bigint NOT NULL);
  CREATE TABLE nomina_empleados (
    id bigserial PRIMARY KEY, periodo_id bigint NOT NULL, vinculacion_id bigint NOT NULL,
    metodo_liquidacion text NOT NULL, categoria_salarial_id bigint, salario_base numeric,
    auxilio_transporte numeric, otros_devengos numeric, fecha_inicio_pago date,
    fecha_fin_pago date, dias_periodo numeric, dias_pagados numeric,
    horas_trabajadas numeric, horas_extra_total numeric, devengado_basico numeric,
    devengado_transporte numeric, devengado_otros numeric, total_adiciones numeric,
    total_deducciones numeric, salud numeric, pension numeric, neto_pagar numeric,
    revisado boolean, estado text, activo boolean, motivo_caso_especial text,
    UNIQUE(periodo_id, vinculacion_id)
  );
  INSERT INTO nomina_periodos VALUES (8, 100), (9, 100), (10, 200);
  INSERT INTO vinculaciones VALUES (801, 1, 11), (802, 2, 11), (901, 3, 11), (1001, 4, 22);
`;

const input = (periodoId: string, vinculacionId: string): InsertNominaPoblacionInput => ({
  periodoId, vinculacionId, metodoLiquidacion: 'ASISTENCIA', categoriaSalarialId: null,
  salarioBase: null, auxilioTransporte: null, diasPeriodo: 31, diasPagados: 31,
  fechaInicioPago: '2026-08-01', fechaFinPago: '2026-08-31'
});

function executor(db: PGlite): NominaPoblacionRepositoryExecutor {
  return {
    query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined) as unknown as Promise<QueryResult<T>>
  };
}

test('NominaPoblacionRepository preserva identidad, aislamiento y snapshots recibidos', async () => {
  const db = new PGlite();
  const repository = new NominaPoblacionRepository();
  const exec = executor(db);
  try {
    await db.exec(schema);
    assert.deepEqual(await repository.listExistingByPeriodo({ periodoId: '8' }, exec), []);
    const id = await repository.insert({ ...input('8', '801'), categoriaSalarialId: '7', salarioBase: '1234', auxilioTransporte: '56' }, exec);
    assert.ok(id);
    assert.equal((await repository.listExistingByPeriodo({ periodoId: '8' }, exec)).length, 1);
    assert.equal((await repository.listExistingByPeriodo({ periodoId: '9' }, exec)).length, 0);
    assert.equal((await repository.listExistingByPeriodo({ periodoId: '10', contratoId: '100' }, exec)).length, 0);
    assert.equal((await repository.listExistingByPeriodo({ periodoId: '8', contratoId: '100', empresaId: '22' }, exec)).length, 0);
    assert.equal((await repository.listExistingByPeriodo({ periodoId: '8', contratoId: '100', empresaId: '11' }, exec)).length, 1);

    const bulkIds = await repository.bulkInsert([input('8', '802'), input('9', '901')], exec);
    assert.equal(bulkIds.length, 2);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM nomina_empleados')).rows[0]?.count, 3);

    await exec.query('BEGIN');
    await repository.reactivate('8', '801', 'OTRA_MARCA', exec);
    assert.equal((await repository.listExistingByPeriodo({ periodoId: '8' }, exec))[0]?.activo, true);
    await exec.query('ROLLBACK');
    assert.equal((await db.query<{ motivo_caso_especial: string | null }>("SELECT motivo_caso_especial FROM nomina_empleados WHERE periodo_id=8 AND vinculacion_id=801")).rows[0]?.motivo_caso_especial, null);

    const snapshot = (await db.query('SELECT categoria_salarial_id, salario_base, auxilio_transporte, neto_pagar, detalle_calculo FROM (SELECT categoria_salarial_id, salario_base, auxilio_transporte, neto_pagar, NULL::jsonb AS detalle_calculo FROM nomina_empleados) x')).rows[0];
    assert.deepEqual(snapshot, { categoria_salarial_id: 7, salario_base: '1234', auxilio_transporte: '56', neto_pagar: '0', detalle_calculo: null });
    await assert.rejects(repository.insert(input('8', '801'), exec));
  } finally {
    await db.close();
  }
});
