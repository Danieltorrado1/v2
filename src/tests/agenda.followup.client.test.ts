import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

function loadModule(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies, `Dependencia inesperada: ${name}`); return dependencies[name]; }, ...globals });
  return exports;
}

test('cliente HTTP real conserva sesion ante 429 y propaga error para reintentar', async () => {
  let clears = 0; let events = 0;
  const { apiClient } = loadModule('FrontendNuevo/src/services/apiClient.ts', {
    '../config/env': { env: { apiUrl: 'http://localhost/api' } },
    './tokenStorage': { getAuthToken: () => 'session', clearAuthSession: () => { clears++; } },
  }, {
    URL, FormData, AbortController, DOMException, setTimeout, clearTimeout,
    window: { dispatchEvent: () => { events++; } },
    fetch: async () => new Response(JSON.stringify({ message: 'Demasiadas solicitudes' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '1' } }),
  });
  await assert.rejects(() => apiClient.post('/agenda/tareas/10/seguimientos', { comentario: 'Texto' }), (error: any) => error.status === 429);
  assert.equal(clears, 0); assert.equal(events, 0);
});

test('agendaApi.followup usa exclusivamente POST del endpoint existente y conserva payload', async () => {
  const requests: any[] = [];
  const { agendaApi } = loadModule('FrontendNuevo/src/services/agendaApi.ts', { './apiClient': { apiClient: { post: (...args: any[]) => { requests.push(args); return Promise.resolve({ id: 1 }); } } } });
  const payload = { tipo: 'COMENTARIO', comentario: 'Texto', fecha_proxima_seguimiento: '2026-09-16', requiere_seguimiento: true };
  await agendaApi.followup(10, payload);
  assert.equal(requests.length, 1); assert.equal(requests[0][0], '/agenda/tareas/10/seguimientos'); assert.equal(requests[0][1], payload);
});

test('formulario renderiza tipos manuales y controles reales sin archivos ni fechas minimas', () => {
  const requireFrontend = createRequire(resolve('FrontendNuevo/package.json'));
  const React = requireFrontend('react');
  const { renderToStaticMarkup } = requireFrontend('react-dom/server');
  const common = loadModule('FrontendNuevo/src/pages/agenda/agendaOperativa.domain.ts', {});
  const domain = loadModule('FrontendNuevo/src/pages/agenda/agendaFollowup.domain.ts', { './agendaOperativa.domain': common });
  const { default: Form } = loadModule('FrontendNuevo/src/pages/agenda/components/AgendaTaskFollowupForm.tsx', {
    react: React, 'react/jsx-runtime': requireFrontend('react/jsx-runtime'),
    '../../../services/agendaApi': { agendaApi: {} }, '../agendaFollowup.domain': domain,
  });
  const html = renderToStaticMarkup(React.createElement(Form, { task: { id: 10, titulo: 'Tarea', fecha_proxima_seguimiento: '2026-09-16', requiere_seguimiento: true }, onSaved() {}, onCancel() {}, onClose() {}, onDirtyChange() {}, onSavingChange() {} }));
  assert.match(html, /Agregar seguimiento/); assert.match(html, /value="COMENTARIO"/); assert.match(html, /value="EVIDENCIA"/);
  assert.doesNotMatch(html, /CAMBIO_ESTADO|REASIGNACION|REPROGRAMACION|REAPERTURA|CIERRE|type="file"| min=/);
  assert.match(html, /type="date"[^>]*value="2026-09-16"/);
  assert.match(html, /<textarea[^>]*required/); assert.match(html, /Cancelar/); assert.match(html, /Guardar/);
});
