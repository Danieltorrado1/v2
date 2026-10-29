import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { PoolClient } from 'pg';
import { createHmac } from 'node:crypto';
import { planillaBaseline } from '../modules/nomina/planilla-operativa.xlsx';
import { readFileSync } from 'node:fs';
import { syntheticType } from './fixtures/planilla-operativa.synthetic';

Object.assign(process.env, {
  DATABASE_URL: 'postgres://test:test@127.0.0.1:1/forbidden', APP_NAME: 'planilla-readonly-test',
  API_PREFIX: '/api', NODE_ENV: 'test', PORT: '4000', JWT_SECRET: 'test-only', JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: 'http://localhost', TRUST_PROXY: 'false', RATE_LIMIT_WINDOW_MINUTES: '1', RATE_LIMIT_MAX_REQUESTS: '100',
  LOG_LEVEL: 'error', ENABLE_JOBS: 'false', SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only', SUPABASE_STORAGE_BUCKET: 'test-only',
  INTEGRACION_OUTBOX_ENABLED: 'false', INTEGRACION_SYNC_ENABLED: 'false', INTEGRACION_RECALC_ENABLED: 'false'
});

const { dbPool } = require('../config/db') as typeof import('../config/db');
const { loadPlanillaOperativaSnapshot } = require('../modules/nomina/nomina.service') as typeof import('../modules/nomina/nomina.service');
const { requirePermissions } = require('../middlewares/roleMiddleware') as typeof import('../middlewares/roleMiddleware');
const tenant = { userId: 7, contratoIds: [51], empresaIds: [], isGlobalAdmin: false, roleNames: ['GESTOR'] };

function fixture(t: TestContext, count = 2, withEvents = false, unsafe: 'coverage' | 'change' | null = null) {
  const sql: { text: string; values: unknown[] }[] = [];
  let released = false;
  const client = {
    async query(text: string, values: unknown[] = []) {
      sql.push({ text, values });
      assert.match(text.trim(), /^(SELECT|BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY|COMMIT|ROLLBACK)\b/);
      let rows: object[] = [];
      if (/FROM (?:public\.)?usuarios u/.test(text)) rows = [{ id: '7', active: true, roles: ['GESTOR'], permissions: ['nomina.export', 'nomina.operativa.read'] }];
      else if (/SELECT EXISTS/.test(text)) rows = [{ autorizado: true }];
      else if (/AS snapshot/.test(text)) rows = [{id:'101',snapshot:'synthetic-original',bloqueado:false,novedades_dependientes:[]}];
      else if (/AS empleado_id/.test(text)) rows = [{ empleado_id: '101', vinculacion_id: '81', municipio_id: '1', municipio: 'Norte',
        institucion_id: '11', sede_id: '21', modalidad_id: '1', institucion: 'Institucion Norte', sede: 'Sede Norte', modalidad: 'Modalidad', autorizado: true, consistente: true }];
      else if (/ne\.id::text AS id/.test(text)) rows = [{ id: '101', periodo_id: '71', vinculacion_id: '81', activo: true,
        estado: 'PENDIENTE', persona_id: '91', persona_numero_documento: '00001234', primer_nombre: 'Ana', primer_apellido: 'Sintética',
        vinculacion_empresa_id: '41', vinculacion_contrato_id: '51', fecha_inicio_vinculacion: '2026-01-01',
        fecha_fin_vinculacion: null, institucion_nombre: 'Institución sintética', sede_nombre: 'Sede sintética' }];
      else if (/np\.id::text AS id/.test(text)) rows = [{ id: '71', contrato_id: '51', contrato_empresa_id: '41',
        contrato_numero: 'SINTÉTICO', nombre_periodo: 'NOVIEMBRE', estado: 'ABIERTO', fecha_inicio: '2026-10-26', fecha_fin: '2026-11-25' }];
      else if (/SELECT c\.id::text/.test(text)) rows = [{ id: '51', empresa_id: '41' }];
      else if (withEvents && /FROM nomina_tipos_novedad/.test(text)) rows = [syntheticType('11', 'PNR')];
      else if (withEvents && /FROM nomina_novedades_canonicas/.test(text)) rows = [{ id: '501', vinculacion_id: '81', tipo_novedad_id: '11',
        fecha_inicio: '2026-10-27', fecha_fin: '2026-10-28', activo: true, created_at: '2026-10-28T12:00:00Z' }];
      else if (withEvents && /nn\.id::text AS id/.test(text)) rows = [{ id: '301', periodo_id: '71', nomina_empleado_id: '101',
        vinculacion_id: '81', tipo_novedad_id: '11', tipo_novedad_codigo_operativo: 'PNR', fecha_inicio: '2026-10-27',
        fecha_fin: '2026-10-27', activo: true, created_at: '2026-10-28T12:00:00Z',
        ...(unsafe === 'coverage' ? { cobertura_id: '901', cobertura_tipo_cobertura: 'PERSONA_INTERNA',
          cobertura_persona_cubre_id: '999', cobertura_vinculacion_cubre_id: '999' } : {}) }];
      else if (unsafe === 'change' && /FROM nomina_movimientos nm/.test(text)) rows = [{ id: '901', nomina_empleado_id: '101', vinculacion_id: '81',
        desde: '2026-10-27', hasta: null, tipo: 'CAMBIO_DE_SEDE', institucion_anterior: 'INSTITUCION AJENA', sede_anterior: 'SEDE AJENA', modalidad_anterior: 'Modalidad',
        institucion_nueva: 'Institucion Norte', sede_nueva: 'Sede Norte', modalidad_nueva: 'Modalidad' }];
      else if (/COUNT\(\*\).*total[\s\S]*nomina_asistencia_diaria/.test(text)) rows = [{ total: count }];
      else if (/nad\.id::text/.test(text)) {
        const offset = Number(values.at(-1));
        rows = offset === 0 ? Array.from({ length: Math.min(count, 1000) }, (_, i) => ({ id: String(i), vinculacion_id: '81', fecha: '2026-10-26', estado_dia: 'PRESENTE' })) :
          [{ id: 'last', vinculacion_id: '81', fecha: '2026-11-25', estado_dia: 'PENDIENTE' }];
      }
      return { rows, rowCount: rows.length };
    },
    release() { released = true; }
  };
  t.mock.method(dbPool, 'connect', async () => client as unknown as PoolClient);
  t.mock.method(dbPool, 'query', () => { throw new Error('Lectura fuera de transacción prohibida'); });
  return { sql, released: () => released };
}

test('snapshot de solo lectura reutiliza alcance contractual/municipal y no escribe ni sincroniza', async t => {
  const f = fixture(t);
  const result = await loadPlanillaOperativaSnapshot('71', tenant, { empresa_id: '41', contrato_id: '51' });
  assert.equal(f.sql[0]!.text, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.sql.at(-1)!.text, 'COMMIT'); assert.equal(f.released(), true);
  const employeeQuery = f.sql.find(q => /ne\.id::text AS id/.test(q.text))!;
  const scopeQuery = f.sql.find(q => /AS empleado_id/.test(q.text))!;
  assert.match(scopeQuery.text, /gestor_municipio_asignaciones/);
  assert.match(scopeQuery.text, /v\.contrato_id = \$2/);
  assert.ok(scopeQuery.values.includes(7));
  assert.equal(result.snapshot.trabajadores[0]!.municipio_id, '1');
  assert.equal(result.snapshot.trabajadores[0]!.institucion, 'Institucion Norte');
  assert.equal(result.snapshot.trabajadores[0]!.documento, '00001234');
  assert.equal(result.snapshot.asistencias.length, 2);
  assert.equal(result.signature, createHmac('sha256', 'test-only').update(JSON.stringify({
    purpose: 'planilla-operativa-export-2A', generado_at: result.snapshot.generado_at,
    alcance: result.snapshot.alcance, baseline: planillaBaseline(result.snapshot)
  })).digest('hex'));
});

test('paginación completa de asistencia superior a mil filas', async t => {
  fixture(t, 1001);
  const result = await loadPlanillaOperativaSnapshot('71', tenant);
  assert.equal(result.snapshot.asistencias.length, 1001);
  assert.equal(result.snapshot.asistencias.at(-1)!.id, 'last');
});

test('lectura conserva novedades ordinarias y canónicas con catálogo de la misma transacción', async t => {
  fixture(t, 2, true);
  const { snapshot } = await loadPlanillaOperativaSnapshot('71', tenant);
  assert.equal(snapshot.catalogo[0]!.codigo_operativo, 'PNR');
  assert.equal(snapshot.novedades.length, 2);
  assert.equal(snapshot.novedades[0]!.registro_tipo, 'ORDINARIA');
  assert.equal(snapshot.novedades[1]!.registro_tipo, 'CANONICA_PROYECTADA');
  assert.equal(snapshot.novedades[1]!.evento_canonico_id, '501');
});

test('empresa seleccionada ajena y tenant sin alcance: rollback sin consultar población', async t => {
  const f = fixture(t);
  await assert.rejects(loadPlanillaOperativaSnapshot('71', tenant, { empresa_id: '42' }), { code: 'PLANILLA_SCOPE_MISMATCH' });
  assert.equal(f.sql.at(-1)!.text, 'ROLLBACK'); assert.ok(!f.sql.some(q => /ne\.id::text AS id/.test(q.text)));
  await assert.rejects(loadPlanillaOperativaSnapshot('71', { ...tenant, contratoIds: [] }), { code: 'TENANT_FORBIDDEN' });
  await assert.rejects(loadPlanillaOperativaSnapshot('71', { ...tenant, userId: undefined }), { code: 'UNAUTHORIZED' });
});

for (const kind of ['coverage', 'change'] as const) test(`detalle ${kind} fuera del alcance conserva evento sin publicar identidad ajena`, async t => {
  const f = fixture(t, 2, kind === 'coverage', kind);
  const {snapshot}=await loadPlanillaOperativaSnapshot('71', tenant);
  const base=planillaBaseline(snapshot);
  if(kind==='coverage') {
    assert.equal(snapshot.novedades[0]!.cobertura!.persona_cubre_id,'999');
    assert.equal(base.novedades[0]!.persona_cubre_id,null);
    assert.equal(base.novedades[0]!.detalle_restringido,true);
    assert.equal(base.novedades.length,2);
  } else {
    assert.equal(snapshot.cambios_operativos![0]!.institucion_anterior,null);
    assert.ok(!JSON.stringify(base).includes('INSTITUCION AJENA'));
  }
  assert.equal(f.sql.at(-1)!.text, 'COMMIT');
});

test('descarga exige ambos permisos existentes y no tiene rutas de importación', () => {
  const route = readFileSync('src/modules/nomina/nomina.routes.ts', 'utf8');
  assert.match(route, /planilla-operativa\.xlsx'[\s\S]{0,120}requirePermissions\('nomina.export', 'nomina.operativa.read'\)/);
  const guard = requirePermissions('nomina.export', 'nomina.operativa.read');
  for (const permissions of [[], ['nomina.export'], ['nomina.operativa.read'], ['nomina.export', 'nomina.operativa.read']]) {
    let result: unknown;
    guard({ user: { permissions, roles: [] } } as never, {} as never, error => { result = error; });
    if (permissions.length === 2) assert.equal(result, undefined);
    else assert.equal((result as { statusCode: number }).statusCode, 403);
  }
  assert.doesNotMatch(route, /planilla-operativa\/importaciones/);
});
