import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

type Harness = {
  api: { get: (path: string, options?: any) => Promise<any> };
  calls: Array<{ path: string; params?: Record<string, unknown> }>;
  rejectNext: boolean;
};

function loadApiClient(): Harness {
  const source = readFileSync(resolve('FrontendNuevo/src/services/apiClient.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const calls: Harness['calls'] = [];
  let rejectNext = false;
  const localValues = new Map<string, string>();
  const context = {
    exports,
    require(name: string) {
      if (name === '../config/env') return { env: { apiUrl: 'http://test.local/api' } };
      if (name === './tokenStorage') return {
        getAuthToken: () => localValues.get('token') ?? null,
        clearAuthSession: () => localValues.clear(),
      };
      if (name === '../types/api.types') return {};
      if (name === './apiRequestKey') {
        const keySource = readFileSync(resolve('FrontendNuevo/src/services/apiRequestKey.ts'), 'utf8');
        const keyCode = ts.transpileModule(keySource, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        const keyExports: Record<string, unknown> = {};
        runInNewContext(keyCode, { exports: keyExports, URLSearchParams }, { filename: 'apiRequestKey.ts' });
        return keyExports;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: (url: string) => {
      const parsed = new URL(url);
      const params = Object.fromEntries(parsed.searchParams.entries());
      calls.push({ path: parsed.pathname, params });
      return new Promise((resolveResponse, rejectResponse) => {
        setTimeout(() => {
          if (rejectNext) {
            rejectNext = false;
            rejectResponse(new Error('network failure'));
            return;
          }
          resolveResponse({
            status: 200,
            ok: true,
            headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
            json: async () => ({ ok: true }),
          });
        }, 5);
      });
    },
    URL,
    URLSearchParams,
    FormData,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    window: { dispatchEvent() {} },
    localStorage: { getItem: (key: string) => localValues.get(key) ?? null, removeItem: (key: string) => localValues.delete(key) },
  };
  runInNewContext(code, context, { filename: 'apiClient.ts' });
  return { api: (exports.apiClient as Harness['api']), calls, get rejectNext() { return rejectNext; }, set rejectNext(value: boolean) { rejectNext = value; } } as Harness;
}

test('deduplica GET idénticos y conserva GET sin parámetros', async () => {
  const h = loadApiClient();
  const [left, right] = await Promise.all([h.api.get('/x?page=2&limit=100'), h.api.get('/x?page=2&limit=100')]);
  assert.deepEqual(left, right);
  assert.equal(h.calls.length, 1);
  const [withoutParamsA, withoutParamsB] = await Promise.all([h.api.get('/tenant/me'), h.api.get('/tenant/me')]);
  assert.deepEqual(withoutParamsA, withoutParamsB);
  assert.equal(h.calls.length, 2);
});

test('no comparte páginas ni parámetros distintos', async () => {
  const h = loadApiClient();
  await Promise.all([h.api.get('/x', { params: { page: 2 } }), h.api.get('/x', { params: { page: 3 } })]);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls.map(call => call.params?.page).sort(), ['2', '3']);
  await Promise.all([
    h.api.get('/x', { params: { page: 4, limit: 100, empresa_id: 15 } }),
    h.api.get('/x', { params: { empresa_id: 15, limit: 100, page: 4 } }),
  ]);
  assert.equal(h.calls.length, 3);
});

test('el rechazo libera la clave para el siguiente intento', async () => {
  const h = loadApiClient();
  h.rejectNext = true;
  await assert.rejects(h.api.get('/x', { params: { page: 2 } }));
  await h.api.get('/x', { params: { page: 2 } });
  assert.equal(h.calls.length, 2);
});

test('getAllNominaPeriodoEmpleados conserva una respuesta distinta por página', async () => {
  const source = readFileSync(resolve('FrontendNuevo/src/services/nominaApi.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const calls: number[] = [];
  const context = {
    exports,
    require(name: string) {
      if (name === './apiClient') return {
        apiClient: {
          get: async (_path: string, options: { params: { page: number } }) => {
            const page = options.params.page;
            calls.push(page);
            const size = page === 8 ? 86 : 100;
            return { data: { items: Array.from({ length: size }, (_, index) => ({ vinculacion_id: `${page}-${index}` })), pagination: { page, limit: 100, total: 786, total_pages: 8 } } };
          },
        },
        ApiClientError: class ApiClientError extends Error {},
      };
      if (name === '../types/api.types' || name === '../types/nomina.types') return {};
      if (name === '../pages/nomina/nominaPeriods') return { normalizeNominaPeriods: (value: unknown) => value };
      if (name === '../config/env') return { env: { apiUrl: 'http://test.local/api' } };
      if (name === './tokenStorage') return { clearAuthSession() {}, getAuthToken: () => null };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  runInNewContext(code, context, { filename: 'nominaApi.ts' });
  const result = await (exports.getAllNominaPeriodoEmpleados as (id: string) => Promise<{ items: Array<{ vinculacion_id: string }> }>)('5');
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.sort((left, right) => left - right), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.items.length, 786);
  assert.equal(new Set(result.items.map(item => item.vinculacion_id)).size, 786);
});
