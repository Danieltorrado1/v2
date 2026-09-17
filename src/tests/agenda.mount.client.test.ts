import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const frontend = createRequire(resolve('FrontendNuevo/package.json'));
const React = frontend('react');
const router = frontend('react-router-dom');
const { renderToStaticMarkup } = frontend('react-dom/server');
const root = resolve('FrontendNuevo/src');
const user = { roles: ['OPERADOR'], permissions: ['agenda.read'] };
let company: any;
const cache = new Map<string, any>();
const unused = () => null;

// Execute the real catalog, route tree, access wrapper and Agenda components.
// Unrelated pages are inert; no backend or browser session is needed.
function load(file: string): any {
  if (cache.has(file)) return cache.get(file);
  const exports: any = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, URLSearchParams, setTimeout, clearTimeout, require: (name: string) => {
    if (!name.startsWith('.')) return frontend(name);
    if (name.endsWith('.css')) return {};
    const path = resolve(dirname(file), name).replaceAll('\\', '/');
    if (path.endsWith('/context/AuthContext')) return { useAuth: () => ({ user }) };
    if (path.endsWith('/context/CompanyContext')) return { useCompanyContext: () => company };
    if (path.endsWith('/services/moduleVisibilityStore')) return { getEffectiveConfig: () => ({ modules: {}, children: {} }) };
    if (path.endsWith('/architecture/payrollNavigation')) return { visiblePayrollLinks: () => [] };
    if (path.endsWith('/services/agendaApi')) return { createAgendaApi: () => ({}), agendaApi: {} };
    const actual = /\/pages\/agenda\//.test(path) || /\/(WorkspacePage|WorkspaceAccess|AppRouter)$/.test(path)
      || /\/architecture\/(moduleCatalog|moduleAccess)$/.test(path);
    if (actual) return load(`${path}.${/domain$|moduleCatalog$|moduleAccess$/.test(path) ? 'ts' : 'tsx'}`);
    return new Proxy({}, { get: (_target, key) => key === '__esModule' ? true : unused });
  } });
  return exports;
}

test('montar /agenda resuelve la ruta real del catalogo y muestra Agenda sin redirigir a /empresa', () => {
  company = { empresaId: 1, capabilities: { empresa: { id: 1 }, modulos: { AGENDA_OPERATIVA: true } }, isLoading: false, capabilitiesLoading: false };
  const AppRouter = load(resolve(root, 'router/AppRouter.tsx')).default;
  const { WorkspaceAccess } = load(resolve(root, 'architecture/WorkspaceAccess.tsx'));
  const tree = AppRouter();
  const routes = router.createRoutesFromElements(tree.props.children.props.children);
  const matches = router.matchRoutes(routes, '/agenda');
  assert.ok(matches?.length);
  const element = matches.at(-1).route.element;
  assert.equal(element.props.entry.code, 'AGENDA_OPERATIVA', 'Exercise the first matching route, not the shadowed explicit route');
  const mount = () => renderToStaticMarkup(React.createElement(router.MemoryRouter, { initialEntries: ['/agenda'] },
    React.createElement(WorkspaceAccess, null, element)));
  const html = mount();
  for (const label of ['Agenda Operativa', 'Mi día', 'Semana', 'Seguimientos', 'Mi Top 3']) assert.ok(html.includes(label), label);
  assert.ok(!html.includes('Cierre diario'), 'Read-only users retain their existing action permissions');
  company = { ...company, capabilities: { empresa: { id: 1 }, modulos: { AGENDA_OPERATIVA: false } } };
  assert.match(mount(), /Acceso no disponible/);
  company = { ...company, empresaId: null };
  assert.match(mount(), /Selecciona una empresa autorizada/);
});
