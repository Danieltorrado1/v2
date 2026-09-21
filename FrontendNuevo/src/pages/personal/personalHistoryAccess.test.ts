import test from 'node:test';
import assert from 'node:assert/strict';

import { canReadPersonalHistory, visiblePersonalTabIds } from './personalHistoryAccess';

test('administrador ve el historial global del expediente', () => {
  assert.equal(canReadPersonalHistory(['ADMINISTRADOR']), true);
  assert.deepEqual(visiblePersonalTabIds(['ADMINISTRADOR'], true), [
    'personal', 'laboral', 'academico', 'familia', 'sst', 'documentos', 'historial'
  ]);
});

test('talento humano no ve historial y conserva las seis tabs operativas', () => {
  assert.equal(canReadPersonalHistory(['TALENTO_HUMANO']), false);
  assert.deepEqual(visiblePersonalTabIds(['TALENTO_HUMANO'], true), [
    'personal', 'laboral', 'academico', 'familia', 'sst', 'documentos'
  ]);
});

test('otros roles tampoco reciben la pestaña global de auditoría', () => {
  for (const role of ['OPERACION', 'CALIDAD', 'GESTORES_AUXILIARES', 'AUDITORES_INTERNOS', 'INTERVENTORIA']) {
    assert.equal(canReadPersonalHistory([role]), false, role);
    assert.equal(visiblePersonalTabIds([role], true).includes('historial'), false, role);
  }
});
