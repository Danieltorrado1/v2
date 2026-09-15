import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  NominaDocumentoRepository,
  type NominaDocumentoRepositoryExecutor
} from '../modules/nomina/infrastructure/repositories/nomina-documento.repository';

const schema = `
  CREATE TABLE empresas (id bigint PRIMARY KEY, nombre_empresa text, nit text);
  CREATE TABLE contratos (id bigint PRIMARY KEY, empresa_id bigint, numero_contrato text, entidad_contratante text);
  CREATE TABLE nomina_periodos (id bigint PRIMARY KEY, contrato_id bigint, nombre_periodo text, fecha_inicio date, fecha_fin date, estado text);
  CREATE TABLE personas (id bigint PRIMARY KEY, numero_documento text, primer_nombre text, segundo_nombre text, primer_apellido text, segundo_apellido text);
  CREATE TABLE contrato_cargos (id bigint PRIMARY KEY, nombre_cargo text);
  CREATE TABLE vinculaciones (id bigint PRIMARY KEY, persona_id bigint, contrato_id bigint, contrato_cargo_id bigint, estado_vinculacion text);
  CREATE TABLE documentos_persona (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, persona_id bigint, tipo_documento_id bigint,
    fecha_expedicion date, fecha_vencimiento date, archivo_path text, fecha_carga timestamp,
    activo boolean, vinculacion_id bigint, version int, documento_reemplaza_id bigint,
    es_vigente boolean, storage_bucket text, storage_path text, nombre_original text,
    mime_type text, tamano_bytes bigint
  );
  CREATE TABLE nomina_empleados (
    id bigint PRIMARY KEY, periodo_id bigint, vinculacion_id bigint, salario_base numeric,
    auxilio_transporte numeric, devengado_basico numeric, devengado_transporte numeric,
    devengado_otros numeric, dias_pagados numeric, total_adiciones numeric,
    total_deducciones numeric, neto_pagar numeric, salud numeric, pension numeric, revisado boolean
  );
  CREATE TABLE nomina_desprendibles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, periodo_id bigint, nomina_empleado_id bigint,
    vinculacion_id bigint, tipo_desprendible text, archivo_path text, fecha_generacion timestamp,
    estado text, observacion text, activo boolean, created_at timestamp DEFAULT NOW(),
    documento_persona_id bigint, version int, es_vigente boolean, desprendible_reemplaza_id bigint
  );
  INSERT INTO empresas VALUES (10, 'Empresa A', '9001'), (20, 'Empresa B', '9002');
  INSERT INTO contratos VALUES (100, 10, 'C-100', 'A'), (200, 20, 'C-200', 'B');
  INSERT INTO nomina_periodos VALUES
    (1000, 100, 'Agosto', '2026-08-01', '2026-08-31', 'CERRADO'),
    (2000, 200, 'Septiembre', '2026-09-01', '2026-09-30', 'ABIERTO');
  INSERT INTO personas VALUES (500, '1', 'Ana', NULL, 'A', NULL), (600, '2', 'Bea', NULL, 'B', NULL);
  INSERT INTO contrato_cargos VALUES (700, 'Cargo A'), (800, 'Cargo B');
  INSERT INTO vinculaciones VALUES (900, 500, 100, 700, 'ACTIVA'), (901, 600, 200, 800, 'ACTIVA');
  INSERT INTO nomina_empleados VALUES
    (1100, 1000, 900, 1000, 100, 1000, 100, 0, 30, 1100, 80, 1020, 40, 40, TRUE),
    (2200, 2000, 901, 2000, 0, 2000, 0, 0, 30, 2000, 0, 2000, 80, 80, FALSE);
`;

function executor(db: PGlite): NominaDocumentoRepositoryExecutor {
  return {
    query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) =>
      db.query<T>(text, values as unknown[] | undefined) as unknown as Promise<QueryResult<T>>
  };
}

test('NominaDocumentoRepository preserva aislamiento, versionado, snapshots y rollback', async () => {
  const db = new PGlite();
  const repository = new NominaDocumentoRepository();
  const client = executor(db);
  try {
    await db.exec(schema);
    await client.query('BEGIN');
    const personaDoc = await repository.createPersonaMetadata({
      archivoPath: 'periodo-1000/pago.pdf', documentoTipoId: '1', fechaExpedicion: '2026-08-31',
      fileName: 'pago.pdf', mimeType: 'application/pdf', personaId: '500', storageBucket: 'documentos',
      storagePath: 'periodo-1000/pago.pdf', tamanoBytes: 12, vinculacionId: '900', version: 1
    }, client);
    const first = await repository.createMetadata({
      archivoPath: 'periodo-1000/pago.pdf', documentoPersonaId: personaDoc, observacion: '{"neto":1020}',
      periodoId: '1000', tipoDesprendible: 'DESPRENDIBLE_PAGO', vinculacionId: '900',
      nominaEmpleadoId: '1100', version: 1
    }, client);
    const current = await repository.listByPeriodo({ periodoId: '1000' }, client);
    assert.equal(current.length, 1);
    assert.equal(current[0]?.contrato_empresa_id, '10');
    assert.equal(current[0]?.neto_pagar, '1020');
    assert.equal((await repository.getLatestByPeriodoVinculacion('1000', '900', client))?.id, first);
    assert.equal((await repository.listByPeriodo({ periodoId: '2000' }, client)).length, 0);

    await repository.markReplaced(first, personaDoc, client);
    const second = await repository.createMetadata({
      archivoPath: 'periodo-1000/pago-v2.pdf', documentoPersonaId: personaDoc, observacion: '{"neto":1020}',
      periodoId: '1000', tipoDesprendible: 'DESPRENDIBLE_CORREGIDO', vinculacionId: '900',
      nominaEmpleadoId: '1100', version: 2, reemplazaDesprendibleId: first
    }, client);
    assert.equal((await repository.listByPeriodo({ periodoId: '1000' }, client))[0]?.id, second);
    assert.equal((await repository.listByPeriodo({ periodoId: '1000', includeVersions: true }, client)).length, 2);
    await client.query('ROLLBACK');

    assert.equal((await repository.listByPeriodo({ periodoId: '1000' }, client)).length, 0);
    assert.equal((await repository.listByPeriodo({ periodoId: '2000' }, client)).length, 0);
  } finally {
    await db.close();
  }
});
