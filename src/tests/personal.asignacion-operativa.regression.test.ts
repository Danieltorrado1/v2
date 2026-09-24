import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { AppError } from '../utils/AppError';

type AssignmentRow = { focalizacion_final_id: number; fecha_inicio: string; fecha_fin: string | null; activo: boolean };

const loadService = (dependencies: Record<string, unknown>) => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync('src/modules/vinculaciones/vinculaciones.personal.service.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  runInNewContext(code, {
    exports,
    require(name: string) {
      assert.ok(name in dependencies, `missing dependency ${name}`);
      return dependencies[name];
    }
  });
  return exports as { replaceAsignacionOperativaPersonal: Function };
};

const loadCanonicalService = (dependencies: Record<string, unknown>) => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync('src/modules/cobertura/cobertura-asignacion.service.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  runInNewContext(code, {
    exports,
    require(name: string) {
      assert.ok(name in dependencies, `missing dependency ${name}`);
      return dependencies[name];
    }
  });
  return exports as { persistCanonicalAssignmentVersion: Function };
};

const createFixture = async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE contratos(id bigint PRIMARY KEY, empresa_id bigint);
    INSERT INTO contratos VALUES (24,15);
    CREATE TABLE contrato_cargos(id bigint PRIMARY KEY, nombre_cargo text);
    INSERT INTO contrato_cargos VALUES (1,'Cargo sintético');
    CREATE TABLE vinculaciones(id bigint PRIMARY KEY, persona_id bigint, contrato_id bigint, contrato_cargo_id bigint, tipo_vinculacion_id bigint, estado_vinculacion text, fecha_inicio date, fecha_fin date);
    INSERT INTO vinculaciones VALUES (1027,9001,24,1,1,'ACTIVA','2026-07-29',NULL);
    CREATE TABLE nomina_periodos(id bigint PRIMARY KEY, contrato_id bigint, fecha_inicio date, fecha_fin date, estado text);
    INSERT INTO nomina_periodos VALUES (1,24,'2026-09-01','2026-09-30','ABIERTO');
    CREATE TABLE municipios(id bigint PRIMARY KEY, nombre_municipio text);
    INSERT INTO municipios VALUES (388,'Municipio sintético');
    CREATE TABLE focalizacion_final(id bigint PRIMARY KEY, contrato_id bigint, municipio_id bigint, municipio_texto text, institucion_id bigint, institucion_final text, sede_id bigint, sede_final text, consecutivo_final text, modalidad_id bigint, modalidad_final text, categoria_cobertura text, activo boolean);
    INSERT INTO focalizacion_final VALUES
      (275,24,388,'Municipio sintético',29,'Institución A',91,'Sede A','001',4,'Modalidad A','CAT',TRUE),
      (276,24,388,'Municipio sintético',29,'Institución A',92,'Sede B','002',4,'Modalidad A','CAT',TRUE);
    CREATE TABLE cobertura_asignaciones(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, contrato_id bigint, municipio_id bigint, focalizacion_final_id bigint,
      vinculacion_id bigint, institucion text, sede text, consecutivo_sede text, modalidad text, categoria_cobertura text,
      tipo_asignacion text, porcentaje_cobertura numeric, fecha_inicio date, fecha_fin date, observacion text, activo boolean DEFAULT TRUE
    );
    INSERT INTO cobertura_asignaciones(contrato_id,municipio_id,focalizacion_final_id,vinculacion_id,institucion,sede,consecutivo_sede,modalidad,categoria_cobertura,tipo_asignacion,porcentaje_cobertura,fecha_inicio,activo)
    VALUES (24,388,275,1027,'Institución A','Sede A','001','Modalidad A','CAT','PRINCIPAL',1,'2026-07-29',TRUE);
  `);
  return db;
};

const runChange = async (outboxEnabled: boolean) => {
  const db = await createFixture();
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const published: string[] = [];
  const canonical = loadCanonicalService({
    '../../utils/AppError': { AppError },
    '../auditoria/auditoria.helper': { registerAuditEntry: async () => undefined }
  });
  const service = loadService({
    '../../config/db': { dbPool: pool, dbQuery: query },
    '../../middlewares/tenantMiddleware': { assertTenantAccessForVinculacionId: async () => undefined },
    '../../utils/AppError': { AppError },
    '../auditoria/auditoria.helper': { registerAuditEntry: async () => undefined },
    '../integracion/integracion.service': { publicarEventoOutbox: async () => { if (outboxEnabled) published.push('ASIGNACION_OPERATIVA_CAMBIADA'); return outboxEnabled ? '1' : 'OUTBOX_DISABLED'; } },
    '../cobertura/cobertura-asignacion.service': { persistCanonicalAssignmentVersion: (...args: unknown[]) => canonical.persistCanonicalAssignmentVersion(...args) },
    '../documentos/documentos.checklist.service': {},
    './vinculaciones.personal.domain': {},
    './vinculaciones.personal.schemas': {}
  });
  const tenant = { isGlobalAdmin: true, roleNames: [], userId: 7, empresaIds: [15], contratoIds: [24] };
  const result = await service.replaceAsignacionOperativaPersonal(1027, 276, 7, tenant, {
    tipo_cambio: 'CAMBIO_REAL', fecha_desde: '2026-09-10', motivo: 'Cambio sintético de sede'
  });
  const rows = (await db.query<AssignmentRow>(`SELECT focalizacion_final_id,fecha_inicio::text,fecha_fin::text,activo FROM cobertura_asignaciones WHERE vinculacion_id=1027 ORDER BY id`)).rows;
  return { result, rows, published };
};

test('PATCH de asignación operativa real funciona con OUTBOX=false', async () => {
  const result = await runChange(false);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]!.activo, false);
  assert.equal(result.rows[0]!.fecha_fin, '2026-09-09');
  assert.equal(result.rows[1]!.activo, true);
  assert.deepEqual(result.published, []);
});

test('PATCH conserva publicación transaccional futura con OUTBOX=true', async () => {
  const result = await runChange(true);
  assert.deepEqual(result.published, ['ASIGNACION_OPERATIVA_CAMBIADA']);
  assert.equal(result.rows.filter((row: AssignmentRow) => row.activo).length, 1);
});

test('corrección inmediata actualiza la asignación seleccionada sin duplicarla', async () => {
  const db = await createFixture();
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const canonical = loadCanonicalService({
    '../../utils/AppError': { AppError },
    '../auditoria/auditoria.helper': { registerAuditEntry: async () => undefined }
  });
  const service = loadService({
    '../../config/db': { dbPool: pool, dbQuery: query },
    '../../middlewares/tenantMiddleware': { assertTenantAccessForVinculacionId: async () => undefined },
    '../../utils/AppError': { AppError },
    '../auditoria/auditoria.helper': { registerAuditEntry: async () => undefined },
    '../integracion/integracion.service': { publicarEventoOutbox: async () => 'OUTBOX_DISABLED' },
    '../cobertura/cobertura-asignacion.service': { persistCanonicalAssignmentVersion: (...args: unknown[]) => canonical.persistCanonicalAssignmentVersion(...args) },
    '../documentos/documentos.checklist.service': {},
    './vinculaciones.personal.domain': {},
    './vinculaciones.personal.schemas': {}
  });
  const tenant = { isGlobalAdmin: true, roleNames: [], userId: 7, empresaIds: [15], contratoIds: [24] };
  await service.replaceAsignacionOperativaPersonal(1027, 276, 7, tenant, {
    asignacion_id: 1, tipo_cambio: 'CORRECCION_DIGITACION', fecha_desde: '2026-09-10', motivo: 'Corrección sintética'
  });
  const rows = (await db.query<AssignmentRow>(`SELECT focalizacion_final_id,fecha_inicio::text,fecha_fin::text,activo FROM cobertura_asignaciones WHERE vinculacion_id=1027 ORDER BY id`)).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.focalizacion_final_id, 276);
  assert.equal(rows[0]!.activo, true);
});
