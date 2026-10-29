import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['FrontendNuevo/src/services/nominaApi.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env.VITE_API_URL': '"http://empiria.test/api"' } });
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));

test('descarga operativa: una petición GET autenticada, empresa explícita, archivo XLSX, cero sincronizaciones', async t => {
  const calls = []; const downloads = []; const removed = [];
  const anchor = { href: '', download: '', click() { downloads.push(this.download); }, remove() { removed.push(true); } };
  const globals = {
    window: { setTimeout, clearTimeout },
    localStorage: { getItem: key => key === 'empiria_access_token' ? 'session-synthetic' : null },
    document: { createElement: () => anchor, body: { appendChild() {} } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => prior ? Object.defineProperty(globalThis, key, prior) : delete globalThis[key]);
  }
  t.mock.method(URL, 'createObjectURL', () => 'blob:synthetic');
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response('PK-synthetic-file', { status: 200, headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="planilla-operativa-71.xlsx"' } });
  });
  await module.exports.exportPlanillaOperativaXlsx('71', '41');
  assert.equal(calls.length, 1); assert.match(calls[0].url, /periodos\/71\/planilla-operativa\.xlsx\?empresa_id=41$/);
  assert.ok(!calls[0].init.method || calls[0].init.method === 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer session-synthetic');
  assert.deepEqual(downloads, ['planilla-operativa-71.xlsx']);
});

test('botón no vacía asistencia, sincroniza ni recalcula; requiere ambos permisos', () => {
  const page = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
  const handler = page.slice(page.indexOf('const downloadPlanilla ='), page.indexOf('const syncPersonal ='));
  assert.match(handler, /exportPlanillaOperativaXlsx\(periodId, String\(empresaId\)\)/);
  assert.doesNotMatch(handler, /importNominaEmpleados|flushAttendance|recalculate|setReloadVersion/);
  assert.match(page, /permissions.includes\("nomina.export"\).*permissions.includes\("nomina.operativa.read"\)/);
});
