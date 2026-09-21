import test from 'node:test';
import assert from 'node:assert/strict';
import { dbPool } from '../config/db';
import { getRepositoryPageSummary } from '../modules/documentos/documentos.repository.service';

test('resumen de página conserva entregas repetidas, separa personas y no modifica el porcentaje', async t => {
  const queries: string[] = [];
  t.mock.method(dbPool, 'query', async (sql: string, params: unknown[]) => {
    queries.push(sql);
    if (sql.includes('FROM vinculaciones')) return { rows: [{ id: String(params[0]), persona_id: String(params[0]), contrato_id: '3', contrato_cargo_id: '1', tipo_vinculacion_id: '1' }] };
    if (sql.includes('FROM sst_dotacion_epp_entregas')) return { rows: [
      { id: 1, persona_id: 1, tipo: 'DOTACION' }, { id: 2, persona_id: 1, tipo: 'DOTACION' },
      { id: 3, persona_id: 1, tipo: 'EPP' }, { id: 4, persona_id: 1, tipo: 'EPP' },
      { id: 5, persona_id: 2, tipo: 'EPP' },
    ] };
    return { rows: [] };
  });
  const rows = await getRepositoryPageSummary([1, 2], undefined, true);
  assert.deepEqual(rows[0]!.entregas?.map(e => e.id), [1, 2, 3, 4]);
  assert.deepEqual(rows[1]!.entregas?.map(e => e.id), [5]);
  assert.equal(rows[0]!.checklist.total_requisitos, 0);
  assert.equal(rows[0]!.checklist.cumplimiento_porcentaje, 0);
  assert.equal(queries.filter(q => q.includes('FROM sst_dotacion_epp_entregas')).length, 1);
  assert.ok(queries.every(q => !/\b(INSERT|UPDATE|DELETE)\b/.test(q)));
});

test('sin permiso SST no consulta ni devuelve históricos como si estuvieran vacíos', async t => {
  const queries: string[] = [];
  t.mock.method(dbPool, 'query', async (sql: string) => {
    queries.push(sql);
    if (sql.includes('FROM vinculaciones')) return { rows: [{ id: '1', persona_id: '1', contrato_id: '3', contrato_cargo_id: '1', tipo_vinculacion_id: '1' }] };
    return { rows: [] };
  });
  const rows = await getRepositoryPageSummary([1], undefined, false);
  assert.equal(rows[0]!.entregas, null);
  assert.equal(queries.some(q => q.includes('FROM sst_dotacion_epp_entregas')), false);
});
