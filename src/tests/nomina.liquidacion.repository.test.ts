import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  NominaLiquidacionRepository,
  type NominaLiquidacionRepositoryExecutor,
  type NominaLiquidacionResultInput
} from '../modules/nomina/infrastructure/repositories/nomina-liquidacion.repository';

const schema = `
  CREATE TABLE contratos (
    id bigint PRIMARY KEY, empresa_id bigint, numero_contrato text, entidad_contratante text
  );
  CREATE TABLE nomina_periodos (
    id bigint PRIMARY KEY, contrato_id bigint, nombre_periodo text,
    fecha_inicio date, fecha_fin date, estado text
  );
  CREATE TABLE personas (
    id bigint PRIMARY KEY, numero_documento text, primer_nombre text,
    segundo_nombre text, primer_apellido text, segundo_apellido text
  );
  CREATE TABLE vinculaciones (
    id bigint PRIMARY KEY, persona_id bigint, contrato_id bigint,
    fecha_inicio date, fecha_fin date, motivo_retiro text, estado_vinculacion text
  );
  CREATE TABLE nomina_empleados (
    id bigint PRIMARY KEY, periodo_id bigint, vinculacion_id bigint,
    salud numeric, pension numeric
  );
  CREATE TABLE nomina_liquidaciones (
    id bigserial PRIMARY KEY, vinculacion_id bigint NOT NULL, periodo_id bigint NOT NULL,
    fecha_inicio_vinculacion date, fecha_fin_vinculacion date, fecha_retiro date,
    motivo_retiro text, dias_base_liquidacion numeric, dias_trabajados numeric,
    dias_vacaciones_pendientes numeric, salario_base numeric, auxilio_transporte numeric,
    promedio_salario numeric, promedio_auxilio_transporte numeric, cesantias numeric,
    intereses_cesantias numeric, prima_servicios numeric, vacaciones numeric,
    otros_devengos numeric, deducciones numeric, total_liquidacion numeric,
    estado text, activo boolean DEFAULT true, archivo_path text,
    documento_persona_id bigint, observacion text, created_at timestamptz DEFAULT now(),
    UNIQUE(periodo_id, vinculacion_id)
  );
  INSERT INTO contratos VALUES (10, 100, 'C-10', 'Entidad 10'), (20, 200, 'C-20', 'Entidad 20');
  INSERT INTO nomina_periodos VALUES
    (8, 10, 'AGOSTO', '2026-08-01', '2026-08-31', 'ABIERTO'),
    (9, 20, 'SEPTIEMBRE', '2026-09-01', '2026-09-30', 'ABIERTO');
  INSERT INTO personas VALUES (1, '111', 'Ana', NULL, 'Uno', NULL), (2, '222', 'Beto', NULL, 'Dos', NULL);
  INSERT INTO vinculaciones VALUES
    (801, 1, 10, '2026-01-01', '2026-08-15', 'RENUNCIA', 'RETIRADA'),
    (901, 2, 20, '2026-01-01', '2026-09-15', 'TERMINACION', 'RETIRADA');
  INSERT INTO nomina_empleados VALUES (1, 8, 801, 100, 100), (2, 9, 901, 200, 200);
`;

function executor(db: PGlite): NominaLiquidacionRepositoryExecutor {
  return {
    query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined) as unknown as Promise<QueryResult<T>>
  };
}

const result = (periodoId: string, vinculacionId: string): NominaLiquidacionResultInput => ({
  periodoId,
  vinculacionId,
  fechaInicioVinculacion: '2026-01-01',
  fechaFinVinculacion: '2026-08-15',
  fechaRetiro: '2026-08-15',
  motivoRetiro: 'RENUNCIA',
  diasBaseLiquidacion: 30,
  diasTrabajados: 15,
  diasVacacionesPendientes: 0,
  salarioBase: 1000000,
  auxilioTransporte: 100000,
  promedioSalario: 1000000,
  promedioAuxilioTransporte: 100000,
  cesantias: 45833.33,
  interesesCesantias: 229.17,
  primaServicios: 45833.33,
  vacaciones: 20833.33,
  otrosDevengos: 0,
  deducciones: 0,
  totalLiquidacion: 112729.16
});

test('NominaLiquidacionRepository preserva listados, identidad, estados y rollback', async () => {
  const db = new PGlite();
  const repository = new NominaLiquidacionRepository();
  const client = executor(db);
  try {
    await db.exec(schema);
    const id = await repository.create(result('8', '801'), client);
    assert.ok(id);
    assert.equal((await repository.listActiveKeys('8', client)).length, 1);
    assert.equal((await repository.countActiveByPeriodo('8', client)), 1);

    const listed = await repository.list({ periodoId: '8', page: 1, limit: 10 }, client);
    assert.equal(listed.total, 1);
    assert.equal(listed.rows[0]?.vinculacion_id, '801');
    assert.equal((await repository.getByPeriodoVinculacion('8', '801', undefined, client))?.id, id);
    assert.equal(await repository.getByPeriodoVinculacion('9', '801', undefined, client), null);

    await repository.persistResult(id, { ...result('8', '801'), cesantias: 50000, totalLiquidacion: 116895 }, client);
    assert.equal((await repository.getByPeriodoVinculacion('8', '801', undefined, client))?.cesantias, '50000');
    assert.equal(await repository.updateStateByPeriodo('8', 'FINALIZADA', client), 1);
    assert.equal((await repository.getByPeriodoVinculacion('8', '801', undefined, client))?.estado, 'FINALIZADA');
    await assert.rejects(repository.create(result('8', '801'), client));

    await client.query('BEGIN');
    await repository.create(result('9', '901'), client);
    assert.equal((await repository.countActiveByPeriodo('9', client)), 1);
    await client.query('ROLLBACK');
    assert.equal((await repository.countActiveByPeriodo('9', client)), 0);

    const forbiddenTenant = { userId: undefined, contratoIds: [], empresaIds: [], isGlobalAdmin: false, roleNames: [] };
    assert.equal((await repository.list({ periodoId: '8', page: 1, limit: 10, tenant: forbiddenTenant }, client)).total, 0);
  } finally {
    await db.close();
  }
});
