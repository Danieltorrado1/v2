import test from 'node:test';
import assert from 'node:assert/strict';
import { corsMiddleware } from '../config/security';

test('CORS expone Retry-After para que el repositorio respete el plazo del servidor', () => {
  const headers = new Map<string, unknown>();
  const req = { method: 'GET', headers: {} };
  const res = { setHeader: (key: string, value: unknown) => headers.set(key.toLowerCase(), value), getHeader: (key: string) => headers.get(key.toLowerCase()) };
  let called = false;
  corsMiddleware(req as never, res as never, () => { called = true; });
  assert.equal(called, true);
  assert.equal(headers.get('access-control-expose-headers'), 'Retry-After');
});
