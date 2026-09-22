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
  CREATE TABLE contrato_cargos (id bigint PRIMARY KEY, nombre_cargo text NOT NULL);
  CREATE TABLE vinculaciones (
    id bigint PRIMARY KEY, persona_id bigint NOT NULL, empresa_id bigint NOT NULL, contrato_id bigint NOT NULL,
    contrato_cargo_id bigint, fecha_inicio date DEFAULT '2026-01-01', fecha_fin date
  );
  CREATE TABLE personas (id bigint PRIMARY KEY, numero_documento text, primer_nombre text, segundo_nombre text, primer_apellido text, segundo_apellido text);
  CREATE TABLE nomina_empleados (id bigint PRIMARY KEY, periodo_id bigint NOT NULL, vinculacion_id bigint NOT NULL);
  CREATE TABLE nomina_contextos_operativos_base (
    id bigserial PRIMARY KEY, periodo_id bigint NOT NULL, nomina_empleado_id bigint NOT NULL,
    contexto jsonb NOT NULL
  );
  CREATE TABLE nomina_movimientos (
    id bigserial PRIMARY KEY, periodo_id bigint, nomina_empleado_id bigint NOT NULL,
    vinculacion_id bigint NOT NULL, familia_movimiento text NOT NULL, fecha date NOT NULL,
    fecha_fin_efectiva date, contexto_nuevo jsonb, activo boolean DEFAULT true,
    estado text DEFAULT 'APROBADO'
  );
  CREATE TABLE municipios (id bigint PRIMARY KEY, nombre_municipio text NOT NULL);
  CREATE TABLE instituciones (id bigint PRIMARY KEY, nombre_institucion text NOT NULL);
  CREATE TABLE sedes (id bigint PRIMARY KEY, nombre_sede text NOT NULL);
  CREATE TABLE modalidades (id bigint PRIMARY KEY, nombre_modalidad text NOT NULL);
  CREATE TABLE focalizacion_final (
    id bigint PRIMARY KEY, municipio_id bigint, municipio_texto text, institucion_id bigint,
    institucion_final text, sede_id bigint, sede_final text, modalidad_id bigint,
    modalidad_final text
  );
  CREATE TABLE cobertura_asignaciones (
    id bigserial PRIMARY KEY, vinculacion_id bigint NOT NULL, fecha_inicio date NOT NULL,
    fecha_fin date, activo boolean DEFAULT true, municipio_id bigint, focalizacion_final_id bigint,
    institucion text, sede text, modalidad text
  );
  CREATE TABLE nomina_tipos_novedad (
    id bigint PRIMARY KEY, codigo_operativo text, nombre text, categoria text, descripcion_operativa text,
    afecta_salario boolean, afecta_transporte boolean, afecta_dias_laborados boolean, afecta_recargos boolean,
    afecta_cobertura boolean, efecto_salario text, efecto_auxilio_transporte text, efecto_recargos_detallado text,
    efecto_liquidacion text, efecto_cobertura_config text, efecto_operativo text, efecto_pago text,
    modelo_registro text, proyecta_periodos boolean, bloquea_otras_novedades boolean, grupo_exclusividad text,
    observacion_plantilla text, es_adicion boolean, es_deduccion boolean, requiere_soporte boolean,
    permite_rango boolean, requiere_revision boolean, requiere_solicitud_permiso boolean, es_incapacidad boolean,
    es_accidente_laboral boolean, es_permiso boolean, es_suspension boolean, es_evento_operativo boolean,
    permite_asistencia_simultanea boolean,
    requiere_autorizacion_descuento boolean,
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
    tipo_relacion text NOT NULL, activo boolean DEFAULT true, created_by bigint,
    estado_revision text DEFAULT 'PENDIENTE_VALIDACION'
  );
  CREATE TABLE nomina_novedad_coberturas (
    id bigserial PRIMARY KEY, nomina_novedad_id bigint NOT NULL, tipo_cobertura text,
    persona_cubre_id bigint, vinculacion_cubre_id bigint, nombre_externo text, documento_externo text,
    observacion_externa text, observacion_interna text, snapshot_cobertura jsonb, activo boolean DEFAULT true
  );
  INSERT INTO contratos VALUES (24, 15), (25, 16);
  INSERT INTO nomina_periodos VALUES (2, 24, '2026-08-01', '2026-08-31'), (3, 25, '2026-08-01', '2026-08-31');
  INSERT INTO contrato_cargos VALUES (33, 'Cargo historico');
  INSERT INTO vinculaciones (id, persona_id, empresa_id, contrato_id, contrato_cargo_id, fecha_inicio, fecha_fin)
    VALUES (101, 1, 15, 24, 33, '2026-07-01', '2026-08-20'), (201, 2, 16, 25, 33, '2026-07-01', NULL);
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

    await db.exec(`
      INSERT INTO nomina_tipos_novedad (id, codigo_operativo, nombre, categoria, modelo_registro, activo)
      VALUES (9, 'DNC', 'Día de no clase', 'INFORMATIVA', 'ORDINARIA', TRUE),
             (10, 'DCO', 'Día compensatorio', 'INFORMATIVA', 'ORDINARIA', TRUE),
             (11, 'TA', 'Turno adicional', 'OPERATIVA', 'ORDINARIA', TRUE);
      INSERT INTO nomina_novedades
        (id, periodo_id, nomina_empleado_id, vinculacion_id, tipo_novedad_id, tipo_novedad_codigo_operativo,
         fecha_inicio, fecha_fin, dias, observacion, revisado, activo, requiere_cobertura, cubierta)
      VALUES (3, 2, 10, 101, 9, 'DNC', '2026-08-04', '2026-08-04', 1, 'Informativa', FALSE, TRUE, FALSE, FALSE),
             (4, 2, 10, 101, 10, 'DCO', '2026-08-05', '2026-08-05', 1, 'Informativa', FALSE, TRUE, FALSE, FALSE),
             (5, 2, 10, 101, 11, 'TA', '2026-08-06', '2026-08-06', 1, 'Operativa', FALSE, TRUE, FALSE, FALSE);
    `);

    const gestionRows = await repository.list({
      periodoId: '2',
      tenant: tenantEmpresa15,
      excludeInformative: true,
    }, executor);
    assert.deepEqual(
      gestionRows.map((row) => row.tipo_novedad_codigo_operativo),
      ['TA', 'PNR'],
    );
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

test('NominaNovedadRepository resuelve contexto operativo historico por fecha y conserva scope', async () => {
  const db = new PGlite();
  const repository = new NominaNovedadRepository();
  const executor = makeExecutor(db);

  try {
    await db.exec(schema);
    await db.exec(`
      INSERT INTO vinculaciones (id, persona_id, empresa_id, contrato_id, contrato_cargo_id, fecha_inicio, fecha_fin)
        VALUES (301, 3, 15, 24, NULL, '2026-01-01', '2026-08-31');
      INSERT INTO personas VALUES (3, '300', 'SIN', NULL, 'ASIGNACION', NULL);
      INSERT INTO nomina_empleados VALUES (30, 2, 301);
      INSERT INTO nomina_novedades
        (id, periodo_id, nomina_empleado_id, vinculacion_id, tipo_novedad_id, tipo_novedad_codigo_operativo,
         fecha_inicio, fecha_fin, dias, observacion, revisado, activo, requiere_cobertura, cubierta)
      VALUES
        (10, 2, 10, 101, 7, 'PNR', '2026-08-10', '2026-08-10', 1, 'Exacta', FALSE, TRUE, FALSE, FALSE),
        (11, 2, 10, 101, 7, 'PNR', '2026-08-31', '2026-08-31', 1, 'Historica', FALSE, TRUE, FALSE, FALSE),
        (12, 2, 30, 301, 7, 'PNR', '2026-09-15', '2026-09-15', 1, 'Sin asignacion', FALSE, TRUE, FALSE, FALSE);
      INSERT INTO municipios VALUES (1, 'Municipio historico'), (2, 'Municipio actual');
      INSERT INTO instituciones VALUES (1, 'Institucion historica'), (2, 'Institucion actual');
      INSERT INTO sedes VALUES (1, 'Sede historica'), (2, 'Sede actual');
      INSERT INTO modalidades VALUES (1, 'Modalidad historica'), (2, 'Modalidad actual');
      INSERT INTO focalizacion_final
        (id, municipio_id, institucion_id, sede_id, modalidad_id)
      VALUES (1, 1, 1, 1, 1), (2, 2, 2, 2, 2);
      INSERT INTO cobertura_asignaciones
        (id, vinculacion_id, fecha_inicio, fecha_fin, activo, municipio_id, focalizacion_final_id)
      VALUES
        (1, 101, '2026-08-01', '2026-08-20', TRUE, 1, 1),
        (2, 101, '2026-08-21', '2026-08-31', TRUE, 2, 2),
        (3, 101, '2026-09-01', NULL, TRUE, 2, 2);
    `);

    const rows = await repository.list({ periodoId: '2', tenant: tenantEmpresa15 }, executor);
    const byObservation = new Map(rows.map((row) => [row.observacion, row]));
    assert.equal(byObservation.get('Exacta')?.contexto_municipio, 'Municipio historico');
    assert.equal(byObservation.get('Exacta')?.contexto_cargo, 'Cargo historico');
    assert.equal(byObservation.get('Historica')?.contexto_cargo, 'Cargo historico');
    assert.equal(byObservation.get('Sin asignacion')?.contexto_cargo, null);
    assert.equal(byObservation.get('Exacta')?.contexto_sede, 'Sede historica');
    assert.equal(byObservation.get('Historica')?.contexto_institucion, 'Institucion actual');
    assert.equal(byObservation.get('Historica')?.contexto_sede, 'Sede actual');
    assert.equal(byObservation.get('Historica')?.contexto_modalidad, 'Modalidad actual');
    assert.equal(byObservation.get('Sin asignacion')?.contexto_municipio, null);
    assert.equal(rows.some((row) => row.observacion === 'Otro tenant'), false);
  } finally {
    await db.close();
  }
});
