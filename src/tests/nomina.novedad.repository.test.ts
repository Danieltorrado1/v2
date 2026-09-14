import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import {
  NominaNovedadRepository,
  type NominaNovedadRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-novedad.repository';

const schema = `
  CREATE TABLE contratos (id bigint PRIMARY KEY, empresa_id bigint NOT NULL);
  CREATE TABLE nomina_periodos (id bigint PRIMARY KEY, contrato_id bigint NOT NULL, fecha_inicio date NOT NULL, fecha_fin date NOT NULL);
  CREATE TABLE vinculaciones (id bigint PRIMARY KEY, persona_id bigint NOT NULL, empresa_id bigint NOT NULL, contrato_id bigint NOT NULL);
  CREATE TABLE personas (id bigint PRIMARY KEY, numero_documento text, primer_nombre text, segundo_nombre text, primer_apellido text, segundo_apellido text);
  CREATE TABLE nomina_empleados (id bigint PRIMARY KEY, periodo_id bigint NOT NULL, vinculacion_id bigint NOT NULL);
  CREATE TABLE nomina_tipos_novedad (
    id bigint PRIMARY KEY, codigo_operativo text, nombre text, categoria text, descripcion_operativa text,
    afecta_salario boolean, afecta_transporte boolean, afecta_dias_laborados boolean, afecta_recargos boolean,
    afecta_cobertura boolean, efecto_salario text, efecto_auxilio_transporte text, efecto_recargos_detallado text,
    efecto_liquidacion text, efecto_cobertura_config text, efecto_operativo text, efecto_pago text,
    modelo_registro text, proyecta_periodos boolean, bloquea_otras_novedades boolean, grupo_exclusividad text,
    observacion_plantilla text, es_adicion boolean, es_deduccion boolean, requiere_soporte boolean,
    permite_rango boolean, requiere_revision boolean, requiere_solicitud_permiso boolean, es_incapacidad boolean,
    es_accidente_laboral boolean, es_permiso boolean, es_suspension boolean, es_evento_operativo boolean,
    soporte_documento_tipo text, requiere_fechas boolean, requiere_dias boolean, requiere_horas boolean,
    requiere_valor boolean, activo boolean, created_at timestamptz DEFAULT now()
  );
  CREATE TABLE nomina_novedades (
    id bigserial PRIMARY KEY, periodo_id bigint NOT NULL, nomina_empleado_id bigint NOT NULL,
    vinculacion_id bigint NOT NULL, tipo_novedad_id bigint NOT NULL, tipo_novedad_codigo_operativo text,
    documento_persona_id bigint, fecha_inicio date, fecha_fin date, dias numeric, horas numeric,
    valor_manual numeric, categoria_anterior_id bigint, categoria_nueva_id bigint, observacion text,
    revisado boolean, activo boolean, requiere_cobertura boolean, cubierta boolean, created_at timestamptz DEFAULT now()
  );
  CREATE TABLE nomina_novedad_documentos (
    id bigserial PRIMARY KEY, nomina_novedad_id bigint NOT NULL, documento_persona_id bigint NOT NULL,
    tipo_relacion text NOT NULL, activo boolean DEFAULT true, created_by bigint
  );
  CREATE TABLE nomina_novedad_coberturas (
    id bigserial PRIMARY KEY, nomina_novedad_id bigint NOT NULL, tipo_cobertura text,
    persona_cubre_id bigint, vinculacion_cubre_id bigint, nombre_externo text, documento_externo text,
    observacion_externa text, observacion_interna text, snapshot_cobertura jsonb, activo boolean DEFAULT true
  );
  INSERT INTO contratos VALUES (24, 15), (25, 16);
  INSERT INTO nomina_periodos VALUES (2, 24, '2026-08-01', '2026-08-31'), (3, 25, '2026-08-01', '2026-08-31');
  INSERT INTO vinculaciones VALUES (101, 1, 15, 24), (201, 2, 16, 25);
  INSERT INTO personas VALUES (1, '100', 'ANA', NULL, 'ZETA', NULL), (2, '200', 'BEA', NULL, 'ALFA', NULL);
  INSERT INTO nomina_empleados VALUES (10, 2, 101), (20, 3, 201);
  INSERT INTO nomina_tipos_novedad (id, codigo_operativo, nombre, categoria, modelo_registro, activo)
    VALUES (7, 'PNR', 'Permiso no remunerado', 'AUSENCIA', 'ORDINARIA', TRUE),
           (8, 'PR1', 'Permiso remunerado', 'AUSENCIA', 'ORDINARIA', FALSE);
  INSERT INTO nomina_novedades (id, periodo_id, nomina_empleado_id, vinculacion_id, tipo_novedad_id, tipo_novedad_codigo_operativo, fecha_inicio, fecha_fin, dias, observacion, revisado, activo, requiere_cobertura, cubierta)
    VALUES (1, 2, 10, 101, 7, 'PNR', '2026-08-01', '2026-08-03', 3, 'Inicial', FALSE, TRUE, FALSE, FALSE),
           (2, 3, 20, 201, 7, 'PNR', '2026-08-01', '2026-08-02', 2, 'Otro tenant', FALSE, TRUE, FALSE, FALSE);
  SELECT setval('nomina_novedades_id_seq', 2, true);
`;

function makeExecutor(db: PGlite): NominaNovedadRepositoryExecutor {
  return {
    query: <T extends Record<string, unknown>>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined)
  } as unknown as NominaNovedadRepositoryExecutor;
}

const tenantEmpresa15 = {
  contratoIds: [],
  empresaIds: [15],
  isGlobalAdmin: false,
  roleNames: ['ADMINISTRADOR']
};

test('NominaNovedadRepository conserva lecturas, rango, orden, tenant y periodo', async () => {
  const db = new PGlite();
  const repository = new NominaNovedadRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    assert.equal((await repository.getById('1', tenantEmpresa15, executor))?.id, '1');
    assert.equal(await repository.getById('2', tenantEmpresa15, executor), null);
    assert.equal((await repository.list({ periodoId: '2', tenant: tenantEmpresa15 }, executor)).length, 1);
    assert.equal((await repository.list({ vinculacionId: '101', tenant: tenantEmpresa15 }, executor)).length, 1);
    assert.equal((await repository.list({ periodoId: '3', tenant: tenantEmpresa15 }, executor)).length, 0);
    assert.equal((await repository.list({ periodoId: '2', activo: true, tenant: tenantEmpresa15 }, executor))[0]?.id, '1');
    assert.equal((await repository.listTypes({ page: 1, limit: 1, activo: true }, executor)).total, 1);
    assert.equal((await repository.getTypeById('7', executor))?.codigo_operativo, 'PNR');
  } finally {
    await db.close();
  }
});

test('NominaNovedadRepository create/update/deactivate son explícitos e idempotentes por fila', async () => {
  const db = new PGlite();
  const repository = new NominaNovedadRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    const id = await repository.create({
      activo: true, categoria_anterior_id: null, categoria_nueva_id: null, cubierta: false,
      dias: 1, documento_persona_id: null, fecha_fin: '2026-08-10', fecha_inicio: '2026-08-10',
      horas: null, nomina_empleado_id: '10', observacion: 'Nueva', periodo_id: '2',
      requiere_cobertura: false, revisado: false, tipo_novedad_codigo_operativo: 'PNR',
      tipo_novedad_id: '7', valor_manual: null, vinculacion_id: '101'
    }, executor);
    assert.equal(id, '3');
    await repository.update({
      id, activo: true, categoria_anterior_id: null, categoria_nueva_id: null, cubierta: false,
      dias: 2, documento_persona_id: null, fecha_fin: '2026-08-11', fecha_inicio: '2026-08-10',
      horas: null, observacion: 'Editada', requiere_cobertura: false, revisado: true,
      tipo_novedad_codigo_operativo: 'PNR', tipo_novedad_id: '7', valor_manual: null
    }, executor);
    assert.equal((await repository.getById(id, tenantEmpresa15, executor))?.observacion, 'Editada');
    assert.equal(await repository.deactivate(id, executor), id);
    assert.equal((await repository.getById(id, tenantEmpresa15, executor))?.activo, false);
    await assert.rejects(repository.update({
      id: '999', activo: true, categoria_anterior_id: null, categoria_nueva_id: null, cubierta: false,
      dias: null, documento_persona_id: null, fecha_fin: null, fecha_inicio: null, horas: null,
      observacion: null, requiere_cobertura: false, revisado: false, tipo_novedad_codigo_operativo: null,
      tipo_novedad_id: '7', valor_manual: null
    }, executor), /found no row/);
  } finally {
    await db.close();
  }
});

test('NominaNovedadRepository conserva el PoolClient y rollback real', async () => {
  const db = new PGlite();
  const repository = new NominaNovedadRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    await executor.query('BEGIN');
    const id = await repository.create({
      activo: true, categoria_anterior_id: null, categoria_nueva_id: null, cubierta: false,
      dias: 1, documento_persona_id: null, fecha_fin: '2026-08-20', fecha_inicio: '2026-08-20',
      horas: null, nomina_empleado_id: '10', observacion: 'Rollback', periodo_id: '2',
      requiere_cobertura: false, revisado: false, tipo_novedad_codigo_operativo: 'PNR',
      tipo_novedad_id: '7', valor_manual: null, vinculacion_id: '101'
    }, executor);
    assert.equal((await repository.getById(id, tenantEmpresa15, executor))?.id, id);
    await executor.query('ROLLBACK');
    assert.equal(await repository.getById(id, tenantEmpresa15, executor), null);
  } finally {
    await db.close();
  }
});
