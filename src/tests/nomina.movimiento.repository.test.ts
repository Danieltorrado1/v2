import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { selectTurnContext, type TurnContextOption } from '../modules/nomina/nomina.turn-context';
import { buildTurnosConsolidado } from '../modules/nomina/nomina.exporter';

import {
  NominaMovimientoRepository,
  type NominaMovimientoRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-movimiento.repository';

const schema = `
  CREATE TABLE contratos (id bigint PRIMARY KEY, empresa_id bigint NOT NULL);
  CREATE TABLE nomina_periodos (id bigint PRIMARY KEY, contrato_id bigint NOT NULL, estado text, nombre_periodo text);
  CREATE TABLE vinculaciones (id bigint PRIMARY KEY, persona_id bigint NOT NULL, empresa_id bigint NOT NULL, contrato_id bigint NOT NULL);
  CREATE TABLE personas (id bigint PRIMARY KEY, numero_documento text, primer_nombre text, segundo_nombre text, primer_apellido text, segundo_apellido text);
  CREATE TABLE cobertura_externos (id bigint PRIMARY KEY, nombre_completo text, numero_documento text);
  CREATE TABLE nomina_movimientos (
    id bigserial PRIMARY KEY, periodo_id bigint NOT NULL, nomina_empleado_id bigint NOT NULL, vinculacion_id bigint NOT NULL,
    fecha date, tipo_movimiento text, familia_movimiento text, estado text, descripcion text, cantidad numeric,
    valor_unitario numeric, valor_calculado numeric, valor_total numeric, es_devengado boolean, es_deduccion boolean,
    afecta_seguridad_social boolean, activo boolean, documento_persona_id bigint, externo_id bigint,
    persona_reemplazada_id bigint, vinculacion_reemplazada_id bigint, municipio_id bigint, institucion_id bigint,
    sede_id bigint, modalidad_id bigint, contexto_municipio text, contexto_institucion text, contexto_sede text,
    contexto_modalidad text, tarifa_config_id bigint, motivo_ajuste_valor text, motivo_estado text,
    alertas_validacion jsonb, posible_duplicado boolean, revisado_por bigint, revisado_at timestamptz,
    aprobado_por bigint, aprobado_at timestamptz, rechazado_por bigint, rechazado_at timestamptz,
    updated_at timestamptz DEFAULT now(), updated_by bigint, created_at timestamptz DEFAULT now()
  );
  INSERT INTO contratos VALUES (24, 15), (25, 16);
  INSERT INTO nomina_periodos VALUES (2, 24, 'ABIERTO', 'AGOSTO 2026'), (3, 25, 'ABIERTO', 'AGOSTO 2026');
  ALTER TABLE nomina_periodos ADD COLUMN fecha_inicio date DEFAULT '2026-08-01';
  ALTER TABLE nomina_periodos ADD COLUMN fecha_fin date DEFAULT '2026-08-31';
  INSERT INTO vinculaciones VALUES (101, 1, 15, 24), (201, 2, 16, 25);
  INSERT INTO personas VALUES (1, '100', 'ANA', NULL, 'ZETA', NULL), (2, '200', 'BEA', NULL, 'ALFA', NULL);
  INSERT INTO nomina_movimientos (id, periodo_id, nomina_empleado_id, vinculacion_id, fecha, tipo_movimiento, familia_movimiento, estado, descripcion, cantidad, valor_unitario, valor_total, activo)
    VALUES (1, 2, 10, 101, '2026-08-31', 'TURNO_INTERNO', 'ADICION_DEVENGO', 'APROBADO', 'Turno', 1, 56823.13, 56823.13, TRUE),
           (2, 3, 20, 201, '2026-08-31', 'TURNO_EXTERNO', 'ADICION_DEVENGO', 'APROBADO', 'Otro tenant', 2, 100, 200, TRUE);
  SELECT setval('nomina_movimientos_id_seq', 2, true);
`;

function makeExecutor(db: PGlite): NominaMovimientoRepositoryExecutor {
  return {
    query: <T extends Record<string, unknown>>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined)
  } as unknown as NominaMovimientoRepositoryExecutor;
}

const tenantEmpresa15 = {
  contratoIds: [], empresaIds: [15], isGlobalAdmin: false, roleNames: ['ADMINISTRADOR']
};

const dateOnly = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

test('turno persiste modalidad seleccionada y exporta su snapshot tras cambiar la asignacion habitual', async () => {
  const db=new PGlite();
  const repository=new NominaMovimientoRepository();
  const executor=makeExecutor(db);
  try {
    await db.exec(schema);
    await db.exec('ALTER TABLE vinculaciones ADD COLUMN modalidad_id bigint DEFAULT 1');
    const options=[{institucion_id:'1',modalidad_id:'1',modalidad:'CAA',sede_id:'1'}, {institucion_id:'1',modalidad_id:'2',modalidad:'CAARES',sede_id:'2'}] as TurnContextOption[];
    for (const modalidadId of ['1','2']) {
      const selected=selectTurnContext(options,{institucion_id:'1',sede_id:modalidadId,modalidad_id:modalidadId});
      const id=await repository.create(input({institucion_id:selected.institucion_id,sede_id:selected.sede_id,modalidad_id:selected.modalidad_id,contexto_modalidad:selected.modalidad}),executor);
      await db.exec('UPDATE vinculaciones SET modalidad_id=3 WHERE id=101');
      const stored=await repository.getById(id,undefined,executor);
      assert.equal(stored?.modalidad_id,modalidadId);
      assert.equal(stored?.institucion_id,'1');
      assert.equal(stored?.sede_id,modalidadId);
      assert.equal(stored?.contexto_modalidad,selected.modalidad);
      const exported=buildTurnosConsolidado([{documento_reemplazante:'100',nombre_reemplazante:'ANA',tipo_reemplazante:'INTERNO',modalidad:stored?.contexto_modalidad,cantidad:1,valor_total:100}]);
      assert.equal(exported.rows[0]?.[selected.modalidad],1);
    }
    const historical=await repository.create(input({modalidad_id:null,contexto_modalidad:null}),executor);
    const stored=await repository.getById(historical,undefined,executor);
    assert.equal(stored?.modalidad_id,null);
    const exported=buildTurnosConsolidado([{documento_reemplazante:'100',nombre_reemplazante:'ANA',tipo_reemplazante:'INTERNO',modalidad:stored?.contexto_modalidad,cantidad:1,valor_total:100}]);
    assert.ok(exported.headers.includes('SIN MODALIDAD'));
  } finally { await db.close(); }
});

test('filtro operativo por empleado destino conserva el turno histórico sin cambiar la lectura económica', async () => {
  const db=new PGlite();
  try {
    await db.exec(schema);
    await db.exec(`CREATE TABLE nomina_empleados(id bigint,periodo_id bigint,vinculacion_id bigint);
      INSERT INTO nomina_empleados VALUES (10,1,101),(11,2,101),(20,3,201)`);
    const repository=new NominaMovimientoRepository();
    const executor=makeExecutor(db);
    const filter={periodoId:'2',nominaEmpleadoId:'11',page:1,limit:10,tenant:tenantEmpresa15};
    assert.equal((await repository.list(filter,executor)).total,0);
    const operational=await repository.list({...filter,projectInternalEmployees:true},executor);
    assert.equal(operational.total,1);
    assert.equal(operational.rows[0]?.id,'1');
    assert.equal(operational.rows[0]?.nomina_empleado_id,'10');
    assert.equal((await repository.list({...filter,nominaEmpleadoId:'20',projectInternalEmployees:true},executor)).total,0);
  } finally {await db.close();}
});

test('turnos del 28/08 se consultan por rango 26–25, sin incluir 26/09', async () => {
  const db=new PGlite();
  const repository=new NominaMovimientoRepository();
  const executor=makeExecutor(db);
  try {
    await db.exec(schema);
    await db.exec("UPDATE nomina_periodos SET fecha_inicio='2026-08-26',fecha_fin='2026-09-25' WHERE id=2");
    await repository.create(input({fecha:'2026-08-28'}),executor);
    await repository.create(input({fecha:'2026-09-26'}),executor);
    const result=await repository.list({periodoId:'2',page:1,limit:100},executor);
    const dates=result.rows.map(row=>row.fecha);
    assert.ok(dates.includes('2026-08-28'));
    assert.equal(dates.includes('2026-09-26'),false);
  } finally { await db.close(); }
});

const input = (overrides: Record<string, unknown> = {}) => ({
  activo: true, afecta_seguridad_social: true, alertas_validacion: '[]', aprobado_at: null,
  aprobado_por: null, cantidad: 1, contexto_institucion: 'Institucion', contexto_modalidad: 'CAA',
  contexto_municipio: 'Municipio', contexto_sede: 'Sede', descripcion: 'Nuevo', documento_persona_id: null,
  es_deduccion: false, es_devengado: true, estado: 'PENDIENTE', familia_movimiento: 'GENERAL',
  fecha: '2026-08-15', institucion_id: null, modalidad_id: null, motivo_ajuste_valor: null,
  motivo_estado: null, municipio_id: null, nomina_empleado_id: '10', periodo_id: '2',
  persona_reemplazada_id: null, posible_duplicado: false, rechazado_at: null, rechazado_por: null,
  revisado_at: null, revisado_por: null, sede_id: null, tarifa_config_id: null,
  tipo_movimiento: 'BONIFICACION', valor_calculado: null, valor_total: 100, valor_unitario: 100,
  vinculacion_id: '101', vinculacion_reemplazada_id: null, updated_by: '7', ...overrides
});

test('NominaMovimientoRepository conserva lectura, filtros tenant, tipo, orden y paginacion', async () => {
  const db = new PGlite();
  const repository = new NominaMovimientoRepository();
  const executor = makeExecutor(db);
  try {
    await db.exec(schema);
    assert.equal((await repository.getById('1', tenantEmpresa15, executor))?.id, '1');
    assert.equal(await repository.getById('2', tenantEmpresa15, executor), null);
    const page = await repository.list({ periodoId: '2', page: 1, limit: 1, tenant: tenantEmpresa15 }, executor);
    assert.equal(page.total, 1);
    assert.deepEqual(page.rows.map((row) => row.id), ['1']);
    assert.equal((await repository.list({ tipoMovimiento: 'TURNO_INTERNO', page: 1, limit: 10, tenant: tenantEmpresa15 }, executor)).total, 1);
    assert.equal((await repository.list({ nominaEmpleadoId: '999', page: 1, limit: 10, tenant: tenantEmpresa15 }, executor)).total, 0);
    assert.equal((await repository.list({ periodoId: '2', page: 2, limit: 1, tenant: tenantEmpresa15 }, executor)).rows.length, 0);
  } finally { await db.close(); }
});

test('create, update explicito y deactivate preservan fecha, cantidad y valores', async () => {
  const db = new PGlite();
  const repository = new NominaMovimientoRepository();
  const executor = makeExecutor(db);
  try {
    await db.exec(schema);
    const id = await repository.create(input(), executor);
    assert.equal(id, '3');
    await repository.update({ ...input({ fecha: '2026-08-31', cantidad: 2, valor_unitario: 50, valor_total: 100, descripcion: 'Editado' }), id }, executor);
    const updated = await repository.getById(id, tenantEmpresa15, executor);
    assert.equal(dateOnly(updated?.fecha), '2026-08-31');
    assert.equal(Number(updated?.cantidad), 2);
    assert.equal(Number(updated?.valor_unitario), 50);
    assert.equal(Number(updated?.valor_total), 100);
    assert.equal(await repository.deactivate(id, '7', executor), id);
    assert.equal((await repository.getById(id, tenantEmpresa15, executor))?.activo, false);
  } finally { await db.close(); }
});

test('NominaMovimientoRepository usa el mismo executor y rollback real', async () => {
  const db = new PGlite();
  const repository = new NominaMovimientoRepository();
  const executor = makeExecutor(db);
  try {
    await db.exec(schema);
    await executor.query('BEGIN');
    const id = await repository.create(input({ descripcion: 'Rollback' }), executor);
    assert.equal((await repository.getById(id, tenantEmpresa15, executor))?.id, id);
    await executor.query('ROLLBACK');
    assert.equal(await repository.getById(id, tenantEmpresa15, executor), null);
  } finally { await db.close(); }
});
