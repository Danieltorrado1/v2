import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const base = 'FrontendNuevo/src/pages/agenda/';
const requireFrontend = createRequire(resolve('FrontendNuevo/package.json'));
const React = requireFrontend('react');
function load(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, setTimeout, clearTimeout, ...globals });
  return exports;
}
const common = load(`${base}agendaOperativa.domain.ts`, {});
const followup = load(`${base}agendaFollowup.domain.ts`, { './agendaOperativa.domain': common });
const domain = load(`${base}agendaFollowupsView.domain.ts`, { './agendaOperativa.domain': common });
const top = load(`${base}agendaTopThree.domain.ts`, { './agendaOperativa.domain': common });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('GET real envia filtros y empresa; 429 con Retry-After conserva sesion y estado', async () => {
  let rateLimited = false; let clears = 0; let events = 0; const urls: URL[] = [];
  const { apiClient } = load('FrontendNuevo/src/services/apiClient.ts', {
    '../config/env': { env: { apiUrl: 'http://localhost/api' } }, './tokenStorage': { getAuthToken: () => 'session', clearAuthSession: () => { clears++; } },
  }, { URL, FormData, AbortController, DOMException, window: { dispatchEvent: () => { events++; } }, fetch: async (url: string) => {
    urls.push(new URL(url));
    return rateLimited ? new Response('{}', { status: 429, headers: { 'Retry-After': '17', 'Content-Type': 'application/json' } }) : new Response(JSON.stringify({ items: [{ id: 1 }], total: 60, page: Number(new URL(url).searchParams.get('page')), limit: 25 }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const { agendaApi } = load('FrontendNuevo/src/services/agendaApi.ts', { './apiClient': { apiClient } });
  const model = new domain.FollowupsListState((params: any) => agendaApi.followups({ ...params, empresa_id: 1 }));
  model.setFilter('q', 'Llamada'); model.setActive(true);
  // Fetch + Response.json may complete after the microtask queue.
  await new Promise(resolve => setTimeout(resolve, 20));
  const result = model.getSnapshot().result; assert.ok(result);
  rateLimited = true; model.goPage(2); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(model.getSnapshot().result, result); assert.equal(model.getSnapshot().page, 2); assert.equal(model.getSnapshot().filters.q, 'Llamada');
  assert.match(model.getSnapshot().error, /17 segundos/); assert.equal(clears, 0); assert.equal(events, 0);
  assert.equal(urls[0]!.pathname, '/api/agenda/seguimientos'); assert.equal(urls[0]!.searchParams.get('q'), 'Llamada'); assert.equal(urls[0]!.searchParams.get('empresa_id'), '1');
  await assert.rejects(() => agendaApi.users({ empresa_id: 1, search: 'Ana', limit: 100 }));
  assert.equal(urls.at(-1)!.pathname, '/api/agenda/usuarios-asignables'); assert.equal(urls.at(-1)!.searchParams.get('empresa_id'), '1');
  model.setActive(false);
});

test('tarjeta real muestra datos disponibles, fecha Bogota y omite opcionales vacios; CSS apila movil', () => {
  const { renderToStaticMarkup } = requireFrontend('react-dom/server');
  const { FollowupRecordCard, default: View } = load(`${base}components/AgendaFollowupsView.tsx`, {
    react: React, 'react/jsx-runtime': requireFrontend('react/jsx-runtime'), '../../../context/CompanyContext': { useCompanyContext: () => ({ empresaId: 1 }) },
    '../../../services/agendaApi': { agendaApi: {} }, '../agendaFollowup.domain': followup, '../agendaFollowupsView.domain': domain, './AgendaFollowupsView.css': {},
  });
  const item = { id: 80, tarea_id: 10, titulo: 'Contactar sede', tipo: 'COMENTARIO', comentario: 'Llamada realizada', usuario_registro_nombre: 'Ana', responsable_nombre: 'Luis', created_at: '2026-09-17T02:00:00Z', fecha_proxima_seguimiento: '2026-09-16', clasificacion: 'hoy', estado: 'PENDIENTE', tipo_tarea: 'OTRA', modulo_relacionado: 'PERSONAL', contexto: { sede_id: 4 } };
  const render = (value: any) => renderToStaticMarkup(React.createElement(FollowupRecordCard, { item: value, onOpenTask() {} }));
  const html = render(item);
  for (const text of ['Contactar sede', 'Llamada realizada', 'Ana', 'Luis', 'Para hoy', '2026-09-16', 'Sede #4']) assert.ok(html.includes(text));
  assert.match(html, />16(?:\/09\/| sept).*2026/);
  const empty = render({ ...item, comentario: null, usuario_registro_nombre: null, responsable_nombre: null, modulo_relacionado: null, contexto: null, fecha_proxima_seguimiento: null });
  assert.doesNotMatch(empty, /undefined|null|Registrado por|Responsable actual|Próxima fecha|Módulo/);
  const view = renderToStaticMarkup(React.createElement(View, { active: true, refreshRevision: 0, onOpenTask() {} }));
  for (const text of ['Clasificación', 'Responsable', 'Tipo de tarea', 'Módulo', 'Desde', 'Hasta', 'Limpiar filtros', 'Anterior', 'Siguiente']) assert.ok(view.includes(text));
  const css = readFileSync(`${base}components/AgendaFollowupsView.css`, 'utf8');
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.agenda-followups-record \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap: anywhere/); assert.match(css, /\.agenda-followups-filters \{ grid-template-columns: minmax\(0, 1fr\)/);
});

// Run the real page callbacks with persistent hook slots, without replacing drawer forms.
for (const stringIds of [false, true]) test(`drawer existente abre tarea correcta, cerrar conserva listado; guardados notifican refresco (IDs texto: ${stringIds})`, async () => {
  const slots: any[] = []; let cursor = 0; let effects: (() => void)[] = [];
  const hooks = {
    useState(initial: any) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial: any) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn: () => unknown) { cursor++; return fn(); },
    useEffect(fn: () => void, deps: any[]) { const index = cursor++; if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) { slots[index] = deps; effects.push(fn); } },
  };
  const children: Record<string, any> = {};
  const dependencies: Record<string, unknown> = { react: hooks, 'react/jsx-runtime': requireFrontend('react/jsx-runtime'), './agendaOperativa.domain': common, './agendaFollowup.domain': followup, './agendaTopThree.domain': top, './AgendaOperativaPage.css': {}, '../../context/AuthContext': { useAuth: () => ({ user: { permissions: ['agenda.manage'] } }) } };
  for (const name of ['AgendaFollowupsView', 'AgendaTaskFollowupForm', 'AgendaTaskTopThree', 'AgendaTaskEditForm', 'AgendaTaskAssignForm', 'AgendaTaskParticipantsForm', 'AgendaTaskRescheduleForm', 'AgendaTaskCancelForm', 'AgendaTaskTransitionConfirm']) { children[name] = () => null; dependencies[`./components/${name}`] = { default: children[name] }; }
  const ids: number[] = []; let task: any = { id: stringIds ? '10' : 10, titulo: 'Actualizada', responsable_id: 7, estado: 'PENDIENTE', tipo: 'OTRA', fecha_prevista: '2026-09-16', seguimientos: [] };
  dependencies['../../services/agendaApi'] = { createAgendaApi: () => ({ list: async () => ({ items: [] }), summary: async () => ({}), get: async (id: number) => { ids.push(id); return task; } }) };
  dependencies['../../context/CompanyContext'] = { useCompanyContext: () => ({ empresaId: 1 }) };
  dependencies['lucide-react'] = requireFrontend('lucide-react');
  const Page = load(`${base}AgendaOperativaPage.tsx`, dependencies, { window: { confirm: () => true } }).AgendaCompanyPage;
  let tree: any;
  const render = () => { cursor = 0; effects = []; tree = Page({ empresaId: 1 }); for (const effect of effects) effect(); };
  const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const find = (type: any) => nodes(tree).find(node => node.type === type);
  const click = (text: string) => { const button = nodes(tree).find(node => node.type === 'button' && node.props.children === text); assert.ok(button, text); button.props.onClick(); };
  render(); await flush(); render(); click('Seguimientos'); render(); await flush(); render();
  const view = find(children.AgendaFollowupsView); assert.equal(view.props.active, true);
  view.props.onOpenTask(10); await flush(); render(); assert.deepEqual(ids, [10]);
  assert.ok(nodes(tree).some(node => node.type === 'h2' && node.props.children === 'Actualizada'));
  click('Cerrar'); render(); assert.equal(find(children.AgendaFollowupsView).key, view.key); assert.equal(find(children.AgendaFollowupsView).props.active, true);
  assert.ok(!nodes(tree).some(node => node.type === 'aside' && node.props.className === 'agenda-drawer'));
  find(children.AgendaFollowupsView).props.onOpenTask(10); await flush(); render();
  for (const [button, form, update] of [['Cambiar responsable', 'AgendaTaskAssignForm', { responsable_id: 8 }], ['Iniciar', 'AgendaTaskTransitionConfirm', { estado: 'EN_PROCESO' }], ['Agregar seguimiento', 'AgendaTaskFollowupForm', { seguimientos: [{ id: 90, tipo: 'COMENTARIO', comentario: 'Nuevo' }] }]] as const) {
    const before = find(children.AgendaFollowupsView).props.refreshRevision;
    click(button); render(); task = { ...task, ...update };
    const saved = find(children[form]); assert.ok(saved);
    if (form === 'AgendaTaskFollowupForm') saved.props.onSaved({ id: 90, tarea_id: 10, tipo: 'COMENTARIO', comentario: 'Nuevo' }, { tipo: 'COMENTARIO', comentario: 'Nuevo', fecha_proxima_seguimiento: null, requiere_seguimiento: false });
    else saved.props.onSaved(task);
    await flush(); render(); render();
    assert.ok(find(children.AgendaFollowupsView).props.refreshRevision > before, button);
    assert.equal(find(children.AgendaFollowupsView).props.active, true);
  }
});
