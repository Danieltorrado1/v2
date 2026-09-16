import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
function load(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, ...globals });
  return exports;
}
test('API Top consulta fecha explicita y envia solo Top propio al endpoint existente', async () => {
  const calls: any[] = [];
  const { agendaApi } = load('FrontendNuevo/src/services/agendaApi.ts', { './apiClient': { apiClient: { get: (...args: any[]) => { calls.push(['get', ...args]); }, post: (...args: any[]) => { calls.push(['post', ...args]); } } } });
  const payload = { fecha: '2026-09-16', tarea_ids: [null,10,null], esperado: [null,null,null] };
  await agendaApi.getTop(payload.fecha); await agendaApi.replaceTop(payload);
  assert.equal(calls[0][0], 'get'); assert.equal(calls[0][1], '/agenda/top'); assert.equal(calls[0][2].params.fecha, payload.fecha);
  assert.equal(calls[1][0], 'post'); assert.equal(calls[1][1], '/agenda/top'); assert.equal(calls[1][2], payload);
  assert.equal('usuario_id' in calls[1][2], false);
});
test('cliente real Top 429 no borra sesion ni dispara cierre de sesion', async () => {
  let clears = 0; let events = 0;
  const { apiClient } = load('FrontendNuevo/src/services/apiClient.ts', {
    '../config/env': { env: { apiUrl: 'http://localhost/api' } },
    './tokenStorage': { getAuthToken: () => 'session', clearAuthSession: () => { clears++; } },
  }, { URL, FormData, AbortController, DOMException, setTimeout, clearTimeout,
    window: { dispatchEvent: () => { events++; } },
    fetch: async () => new Response(JSON.stringify({ message: 'Limite' }), { status: 429, headers: { 'Content-Type': 'application/json' } }),
  });
  await assert.rejects(() => apiClient.post('/agenda/top', {}), (error: any) => error.status === 429);
  assert.equal(clears, 0); assert.equal(events, 0);
});
test('componente real muestra posiciones, tareas ocupantes y acciones segun estado y permisos', () => {
  const requireFrontend = createRequire(resolve('FrontendNuevo/package.json'));
  const React = requireFrontend('react');
  const { renderToStaticMarkup } = requireFrontend('react-dom/server');
  const common = load('FrontendNuevo/src/pages/agenda/agendaOperativa.domain.ts', {});
  const domain = load('FrontendNuevo/src/pages/agenda/agendaTopThree.domain.ts', { './agendaOperativa.domain': common });
  let slots: (number|null)[] = [null,null,null];
  class ReadyState extends domain.TopThreeState {
    constructor(taskId: number) {
      super(taskId, '2026-09-16');
      this.state = { ...this.getSnapshot(), loading: false, snapshot: { fecha: '2026-09-16', tarea_ids: slots, items: slots.flatMap((id, index) => id === null ? [] : [{ tarea_id: id, posicion: index+1, titulo: `Tarea ${id}` }]) } };
    }
  }
  const { default: Component } = load('FrontendNuevo/src/pages/agenda/components/AgendaTaskTopThree.tsx', {
    react: React, 'react/jsx-runtime': requireFrontend('react/jsx-runtime'), '../../../services/agendaApi': { agendaApi: {} }, '../agendaTopThree.domain': { ...domain, TopThreeState: ReadyState },
  });
  const render = (permissions: string[]) => renderToStaticMarkup(React.createElement(Component, { taskId: 10, permissions, onSaved() {}, onStateChange() {} }));
  assert.match(render(['agenda.update']), /Agregar a mi Top 3/);
  assert.match(render(['agenda.manage']), /Agregar a mi Top 3/);
  assert.doesNotMatch(render(['agenda.read']), /Agregar a mi Top 3|Retirar de mi Top 3|Sustituir esta posición/);
  slots = [11,12,13]; const full = render(['agenda.manage']);
  assert.match(full, /Tu Top 3 está completo/); assert.match(full, /Sustituir esta posición/);
  for (const id of slots) assert.match(full, new RegExp(`Tarea ${id}`));
  assert.doesNotMatch(full, /Agregar a mi Top 3/);
  slots = [null,10,null]; assert.match(render(['agenda.update']), /Retirar de mi Top 3/); assert.match(render(['agenda.update']), /Posición 2/);
});
