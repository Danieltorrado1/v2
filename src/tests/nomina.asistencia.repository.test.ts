import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import {
  NominaAsistenciaRepository,
  type NominaAsistenciaRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-asistencia.repository';

const schema = `
  CREATE TABLE nomina_periodos (
    id bigint PRIMARY KEY,
    contrato_id bigint NOT NULL,
    estado text NOT NULL,
    nombre_periodo text NOT NULL
  );
  CREATE TABLE vinculaciones (
    id bigint PRIMARY KEY,
    persona_id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    contrato_id bigint NOT NULL,
    contrato_cargo_id bigint
  );
  CREATE TABLE personas (
    id bigint PRIMARY KEY,
    numero_documento text,
    primer_nombre text,
    segundo_nombre text,
    primer_apellido text,
    segundo_apellido text
  );
  CREATE TABLE contrato_cargos (id bigint PRIMARY KEY, nombre_cargo text);
  CREATE TABLE nomina_asistencia_diaria (
    id bigserial PRIMARY KEY,
    periodo_id bigint NOT NULL,
    vinculacion_id bigint NOT NULL,
    fecha date NOT NULL,
    hora_ingreso time,
    hora_salida time,
    horas_trabajadas numeric,
    estado_dia text,
    observacion text,
    activo boolean,
    created_at timestamptz DEFAULT now()
  );
  INSERT INTO nomina_periodos VALUES
    (2, 24, 'ABIERTO', 'AGOSTO 2026'),
    (3, 24, 'CERRADO', 'SEPTIEMBRE 2026'),
    (4, 25, 'ABIERTO', 'OCTUBRE 2026');
  INSERT INTO personas VALUES
    (1, '100', 'ANA', NULL, 'ZETA', NULL),
    (2, '200', 'BEA', NULL, 'ALFA', NULL),
    (3, '300', 'CAR', NULL, 'BETA', NULL);
  INSERT INTO vinculaciones VALUES
    (101, 1, 15, 24, NULL),
    (102, 2, 15, 24, NULL),
    (201, 3, 16, 25, NULL);
  INSERT INTO nomina_asistencia_diaria (id, periodo_id, vinculacion_id, fecha, estado_dia, activo)
  VALUES
    (1, 2, 101, '2026-08-01', 'PRESENTE', TRUE),
    (2, 2, 102, '2026-08-31', 'PENDIENTE', TRUE),
    (3, 4, 201, '2026-10-01', 'PRESENTE', TRUE);
  SELECT setval('nomina_asistencia_diaria_id_seq', 3, true);
`;

function makeExecutor(db: PGlite): NominaAsistenciaRepositoryExecutor {
  return {
    query: <T extends Record<string, unknown>>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined)
  } as unknown as NominaAsistenciaRepositoryExecutor;
}

function dateOnly(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

const tenantEmpresa15 = {
  contratoIds: [],
  empresaIds: [15],
  isGlobalAdmin: false,
  roleNames: ['ADMINISTRADOR']
};

test('asistencia repository lee por periodo, vinculacion, fecha, orden y paginacion', async () => {
  const db = new PGlite();
  const repository = new NominaAsistenciaRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    assert.equal(dateOnly((await repository.getById('1', executor))!.fecha), '2026-08-01');
    assert.equal(await repository.getById('999', executor), null);

    const page = await repository.listByPeriodo({
      periodoId: '2', page: 1, limit: 1, tenant: tenantEmpresa15
    }, executor);
    assert.equal(page.total, 2);
    assert.deepEqual(page.rows.map((row) => row.id), ['1']);

    const second = await repository.listByPeriodo({
      periodoId: '2', page: 1, limit: 1, vinculacionId: '102', fecha: '2026-08-31',
      tenant: tenantEmpresa15
    }, executor);
    assert.deepEqual(second.rows.map((row) => row.id), ['2']);

    const wrongPeriod = await repository.listByPeriodo({
      periodoId: '3', page: 1, limit: 10, tenant: tenantEmpresa15
    }, executor);
    assert.equal(wrongPeriod.total, 0);

    const wrongTenant = await repository.listByPeriodo({
      periodoId: '2', page: 1, limit: 10,
      tenant: { ...tenantEmpresa15, empresaIds: [16] }
    }, executor);
    assert.equal(wrongTenant.total, 0);
  } finally {
    await db.close();
  }
});

test('upsert y bulkUpsert son idempotentes, conservan fechas límite y no duplican', async () => {
  const db = new PGlite();
  const repository = new NominaAsistenciaRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    const batch = [
      { periodoId: '2', vinculacionId: '101', fecha: '2026-08-01', presente: true },
      { periodoId: '2', vinculacionId: '101', fecha: '2026-08-31', presente: true }
    ];
    await repository.bulkUpsert(batch, executor);
    await repository.bulkUpsert(batch, executor);
    const rows = await repository.listByPeriodo({ periodoId: '2', page: 1, limit: 20 }, executor);
    assert.equal(rows.total, 3);
    assert.deepEqual(rows.rows.map((row) => dateOnly(row.fecha)), ['2026-08-01', '2026-08-31', '2026-08-31']);

    const before = rows.rows.find((row) => row.id === '1');
    assert.equal(before?.estado_dia, 'PRESENTE');
    await repository.upsert({ periodoId: '2', vinculacionId: '101', fecha: '2026-08-01', presente: false }, executor);
    assert.equal((await repository.getById('1', executor))?.estado_dia, 'PENDIENTE');
  } finally {
    await db.close();
  }
});

test('bulkUpsert usa el mismo executor y rollback elimina sus registros', async () => {
  const db = new PGlite();
  const repository = new NominaAsistenciaRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    await executor.query('BEGIN');
    await repository.bulkUpsert([
      { periodoId: '2', vinculacionId: '102', fecha: '2026-08-15', presente: true }
    ], executor);
    assert.equal((await repository.listByPeriodo({ periodoId: '2', page: 1, limit: 20 }, executor)).total, 3);
    await executor.query('ROLLBACK');
    assert.equal((await repository.listByPeriodo({ periodoId: '2', page: 1, limit: 20 }, executor)).total, 2);
  } finally {
    await db.close();
  }
});
