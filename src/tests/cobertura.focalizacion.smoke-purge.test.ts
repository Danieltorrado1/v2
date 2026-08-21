import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  assertTechnicalSmokeSnapshot,
  runSmokePurgeTransaction,
  SMOKE_PURGE_CONFIRMATION,
  validateSmokePurgeProtection,
  type SmokePurgeSnapshot,
} from '../modules/cobertura/cobertura.focalizacion.smoke-purge';
import { AppError } from '../utils/AppError';

const scriptSource = readFileSync(
  path.join(process.cwd(), 'src/scripts/purge-focalizacion-smoke.ts'),
  'utf8',
);

const moduleSource = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.focalizacion.smoke-purge.ts'),
  'utf8',
);

const expectAppErrorCode = (expectedCode: string) => (error: unknown) => {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, expectedCode);
  return true;
};

const baseSnapshot = (): SmokePurgeSnapshot => ({
  officialLoad: {
    activo: true,
    archivo_bytes_len: null,
    archivo_sha256: 'official-sha',
    contrato_id: '24',
    created_at: new Date('2026-08-21T03:33:26.803Z'),
    created_by: '2',
    estado: 'PROCESADO',
    fecha_fin_vigencia: '2026-08-31',
    fecha_inicio_vigencia: '2026-08-01',
    id: '4',
    nombre_archivo: 'focalizacion-agosto-2026.xlsx',
    storage_bucket: null,
    storage_path: null,
    usuario_carga_id: '2',
  },
  officialReferenceCount: 2,
  officialReferences: [
    { oficial_carga_id: '4', oficial_vigencia_id: '185', previous_smoke_vigencia_id: '1' },
    { oficial_carga_id: '4', oficial_vigencia_id: '186', previous_smoke_vigencia_id: '19' },
  ],
  smokeAuditEvents: [
    { accion: 'focalizacion.import.upload', descripcion: 'smoke', entidad: 'focalizacion_cargas', entidad_id: '2', id: '1' },
    { accion: 'focalizacion.import.reprocess', descripcion: 'smoke', entidad: 'focalizacion_cargas', entidad_id: '2', id: '2' },
  ],
  smokeFinalCount: 0,
  smokeInstitucionHistoryCount: 0,
  smokeLegacyAuditCount: 3,
  smokeLegacyHistoryCount: 3,
  smokeLoad: {
    activo: true,
    archivo_bytes_len: 20882,
    archivo_sha256: 'smoke-sha',
    contrato_id: '24',
    created_at: new Date('2026-08-21T00:54:28.061Z'),
    created_by: '2',
    estado: 'PROCESADO',
    fecha_fin_vigencia: '2026-08-31',
    fecha_inicio_vigencia: '2026-08-01',
    id: '2',
    nombre_archivo: 'focalizacion-smoke-agosto-2026.xlsx',
    storage_bucket: null,
    storage_path: null,
    usuario_carga_id: '2',
  },
  smokeNovedadesCount: 0,
  smokePrelimCount: 2,
  smokeSedeHistoryCount: 1,
  smokeSedeInstitucionHistoryCount: 0,
  smokeSystemAlertCount: 0,
  smokeVigencias: [
    { id: '1', preliminar_id: '1', valor_anterior_id: null },
    { id: '19', preliminar_id: '3', valor_anterior_id: null },
  ],
});

test('proteccion exige contrato, load oficial y confirmacion explicita', () => {
  assert.throws(
    () => validateSmokePurgeProtection({ apply: true, contractId: '24', loadId: '2', officialLoadId: '4', confirm: 'OTRO' }),
    expectAppErrorCode('SMOKE_PURGE_CONFIRMATION_REQUIRED'),
  );
  assert.throws(
    () => validateSmokePurgeProtection({ apply: true, contractId: '24', loadId: '4', officialLoadId: '4', confirm: SMOKE_PURGE_CONFIRMATION }),
    expectAppErrorCode('SMOKE_PURGE_OFFICIAL_LOAD_PROTECTED'),
  );
  assert.doesNotThrow(
    () => validateSmokePurgeProtection({ apply: true, contractId: '24', loadId: '2', officialLoadId: '4', confirm: SMOKE_PURGE_CONFIRMATION }),
  );
});

test('plan de purga repara valor_anterior_id usando la cadena previa legitima', () => {
  const snapshot = baseSnapshot();
  snapshot.smokeVigencias[0]!.valor_anterior_id = '900';
  const plan = assertTechnicalSmokeSnapshot(snapshot);
  assert.deepEqual(plan.repairPlan, [
    { officialVigenciaId: '185', previousSmokeVigenciaId: '1', newValorAnteriorId: '900' },
    { officialVigenciaId: '186', previousSmokeVigenciaId: '19', newValorAnteriorId: null },
  ]);
});

test('purga aborta si la carga objetivo parece oficial o si tiene focalizacion_final', () => {
  const officialLike = baseSnapshot();
  officialLike.smokeLoad.nombre_archivo = 'focalizacion-agosto-2026.xlsx';
  assert.throws(
    () => assertTechnicalSmokeSnapshot(officialLike),
    expectAppErrorCode('SMOKE_PURGE_NOT_TECHNICAL_LOAD'),
  );

  const withFinal = baseSnapshot();
  withFinal.smokeFinalCount = 1;
  assert.throws(
    () => assertTechnicalSmokeSnapshot(withFinal),
    expectAppErrorCode('SMOKE_PURGE_FINAL_ROWS_PRESENT'),
  );
});

test('wrapper transaccional hace commit o rollback una sola vez', async () => {
  const queries: string[] = [];
  const client = { query: async (sql: string) => { queries.push(sql); } };
  await runSmokePurgeTransaction(client, async () => 'ok');
  assert.deepEqual(queries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);

  const rollbackQueries: string[] = [];
  const rollbackClient = { query: async (sql: string) => { rollbackQueries.push(sql); } };
  await assert.rejects(
    runSmokePurgeTransaction(rollbackClient, async () => {
      throw new Error('mid');
    }),
    /mid/,
  );
  assert.deepEqual(rollbackQueries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
});

test('modulo y CLI contienen las operaciones seguras de purga smoke', () => {
  assert.match(moduleSource, /UPDATE focalizacion_vigencias AS official/);
  assert.match(moduleSource, /SET valor_anterior_id = smoke\.valor_anterior_id/);
  assert.match(moduleSource, /archivo_origen_id = NULL/);
  assert.match(moduleSource, /DELETE FROM focalizacion_preliminar/);
  assert.match(moduleSource, /DELETE FROM focalizacion_vigencias/);
  assert.match(moduleSource, /DELETE FROM focalizacion_cargas/);
  assert.match(moduleSource, /focalizacion\.smoke\.purge/);
  assert.match(scriptSource, /--contract-id=24/);
  assert.match(scriptSource, /--load-id=2/);
  assert.match(scriptSource, /--official-load-id=4/);
  assert.match(scriptSource, /SMOKE_PURGE_CONFIRMATION/);
});
