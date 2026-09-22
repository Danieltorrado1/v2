import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGetRequestKey, normalizeQueryParams } from './apiRequestKey';

test('normaliza parámetros independientemente del orden', () => {
  assert.equal(
    normalizeQueryParams({ page: 2, limit: 100, empresa_id: 15 }),
    normalizeQueryParams({ empresa_id: 15, limit: 100, page: 2 }),
  );
});

test('distingue páginas, empresas y límites diferentes', () => {
  const base = buildGetRequestKey('token', '/x', { page: 2, limit: 100, empresa_id: 15 });
  assert.notEqual(base, buildGetRequestKey('token', '/x', { page: 3, limit: 100, empresa_id: 15 }));
  assert.notEqual(base, buildGetRequestKey('token', '/x', { page: 2, limit: 100, empresa_id: 16 }));
  assert.notEqual(base, buildGetRequestKey('token', '/x', { page: 2, limit: 50, empresa_id: 15 }));
  assert.notEqual(base, buildGetRequestKey('token', '/x', { page: 2, limit: 100, estado: 'APROBADO' }));
});

test('conserva parámetros repetidos y separa el contexto de autenticación', () => {
  const repeated = normalizeQueryParams({ tipo: ['A', 'B'] });
  assert.equal(repeated, 'tipo=A&tipo=B');
  assert.notEqual(buildGetRequestKey('token-a', '/x', {}), buildGetRequestKey('token-b', '/x', {}));
  assert.equal(buildGetRequestKey('token', '/x'), buildGetRequestKey('token', '/x', {}));
  assert.equal(
    buildGetRequestKey('token', '/x?page=2&limit=100'),
    buildGetRequestKey('token', '/x', { limit: 100, page: 2 }),
  );
});
