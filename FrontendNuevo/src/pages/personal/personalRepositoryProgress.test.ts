import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryProgress } from './repositoryProgressModel';
import type { VinculacionChecklistApi } from '../../types/expediente.types';

test('progress uses approved batch totals, never uploaded file count', () => {
  for (const [state, completos, proximos_vencer, percentage] of [
    ['pending', 0, 0, 0], ['approved', 1, 0, 25], ['rejected', 0, 0, 0],
    ['replacement', 0, 0, 0], ['expired', 0, 0, 0], ['expiring', 0, 1, 25],
  ] as const) {
    const checklist = { cargados: 99, completos, proximos_vencer, total_requisitos: 4, cumplimiento_porcentaje: percentage, no_aplica: 20 } as VinculacionChecklistApi;
    assert.deepEqual(repositoryProgress(checklist), { total: 4, approved: completos + proximos_vencer, percentage }, state);
  }
});

test('zero applicable requirements and unavailable summary remain distinct', () => {
  assert.equal(repositoryProgress(undefined), undefined);
  assert.deepEqual(repositoryProgress({ total_requisitos: 0, completos: 0, proximos_vencer: 0, cumplimiento_porcentaje: 0 } as VinculacionChecklistApi), { total: 0, approved: 0, percentage: 0 });
});
