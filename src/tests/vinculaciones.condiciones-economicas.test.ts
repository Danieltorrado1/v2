import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertNoEconomicOverlap,
  resolveCondicionEconomicaEnFecha,
  validateCondicionEconomica,
} from '../modules/vinculaciones/vinculaciones.condiciones-economicas.domain';
import { buildCondicionesEconomicasService } from '../modules/vinculaciones/vinculaciones.condiciones-economicas.service';

const base = {
  activo: true,
  tipo_condicion: 'CASO_ESPECIAL',
  valor: 150000,
  vigencia_desde: '2026-07-29',
  vigencia_hasta: null,
  vinculacion_id: 10,
};

test('normaliza condición genérica y exige trazabilidad mínima', () => {
  const result = validateCondicionEconomica({ ...base, tipo_condicion: ' caso especial ', motivo: 'Acuerdo contractual' });
  assert.equal(result.tipo_condicion, 'CASO_ESPECIAL');
  assert.equal(result.motivo, 'Acuerdo contractual');
  assert.throws(() => validateCondicionEconomica({ ...base, motivo: '' }), /MOTIVO_CONDICION_REQUERIDO/);
});

test('rechaza vigencias invertidas y solapadas para vinculación y tipo iguales', () => {
  assert.throws(() => validateCondicionEconomica({ ...base, motivo: 'x', vigencia_hasta: '2026-07-28' }), /VIGENCIA_ECONOMICA_INVERTIDA/);
  assert.throws(() => assertNoEconomicOverlap(
    { ...base, vigencia_desde: '2026-08-01' },
    [{ ...base, id: 1, vigencia_hasta: '2026-08-15' }],
  ), /VIGENCIA_ECONOMICA_SOLAPADA/);
  assert.doesNotThrow(() => assertNoEconomicOverlap(
    { ...base, vigencia_desde: '2026-08-16' },
    [{ ...base, id: 1, vigencia_hasta: '2026-08-15' }],
  ));
});

test('nómina puede resolver la condición vigente por fecha', () => {
  const result = resolveCondicionEconomicaEnFecha([
    { ...base, id: 1, vigencia_desde: '2026-07-01', vigencia_hasta: '2026-07-31' },
    { ...base, id: 2, valor: 175000, vigencia_desde: '2026-08-01', vigencia_hasta: null },
  ], 10, 'caso especial', '2026-08-21');
  assert.equal(result?.id, 2);
  assert.equal(result?.valor, 175000);
});

test('migración propuesta incluye auditoría, FK y exclusión de solapes', async () => {
  const sql = await readFile('sql/phase-23-2-vinculacion-condiciones-economicas.sql', 'utf8');
  assert.match(sql, /vinculacion_id BIGINT NOT NULL REFERENCES vinculaciones\(id\)/);
  assert.match(sql, /created_by BIGINT NOT NULL REFERENCES usuarios\(id\)/);
  assert.match(sql, /updated_by BIGINT NULL REFERENCES usuarios\(id\)/);
  assert.match(sql, /EXCLUDE USING gist/);
  assert.match(sql, /DATERANGE\(vigencia_desde/);
});

test('servicio valida antes de delegar persistencia y ofrece consulta para nómina', async () => {
  const stored = [{
    ...base,
    id: 1,
    motivo: 'Acuerdo',
    created_at: '2026-07-29T00:00:00Z',
    created_by: 7,
    updated_at: '2026-07-29T00:00:00Z',
    updated_by: null,
  }];
  const service = buildCondicionesEconomicasService({
    insert: async (input, userId) => ({ ...input, id: 2, created_at: 'now', created_by: userId, updated_at: 'now', updated_by: null }),
    listByVinculacion: async () => stored,
  });
  const current = await service.resolveForPayroll(10, 'CASO_ESPECIAL', '2026-08-21');
  assert.equal(current?.id, 1);
  await assert.rejects(() => service.create({ ...base, motivo: 'Nuevo' }, 7), /VIGENCIA_ECONOMICA_SOLAPADA/);
});
