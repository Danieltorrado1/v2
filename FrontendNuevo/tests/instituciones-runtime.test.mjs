import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

// Exercise the real AppRouter and providers from the production build. Every
// API request is intercepted; no production credentials or network are used.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const fixture = JSON.parse(await readFile(join(root, 'src/pages/operacion/operacionInstituciones.fixture.json'), 'utf8'));
const legacy = process.argv.includes('--expect-legacy');
const cache = join(homedir(), 'AppData/Local/ms-playwright');
const installed = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a,b) => Number(b.split('-')[1])-Number(a.split('-')[1]));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || join(cache, installed[0], 'chrome-win64/chrome.exe');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname.startsWith('/assets/') ? join(dist, pathname) : join(dist, 'index.html');
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath, headless: true });
const mutations = [], errors = [], unexpected = [], requests = [];
const pagination = { page: 1, limit: 50, total: 1, total_pages: 1 };
const context = { institucion_id: '1', institucion: 'Institución fixture', sede_id: '2', sede: 'Sede fixture', modalidad_id: '3', modalidad: 'RI' };
const tenant = { empresas: [{ id: 15, nombre_empresa: 'Empresa fixture', activo: true }], contratos: [{ id: 24, empresa_id: 15, numero_contrato: 'Fixture', estado: 'ACTIVO' }], empresa_default_id: 15, contrato_default_id: 24 };
const items = fixture.items.map((item, index) => ({ ...item, ...context, municipio: 'Municipio fixture', periodo: { id: '1', nombre: 'Septiembre', anio: 2026, mes: 9 }, modalidad: 'RI', activo: true, estado: 'ACTIVA', matriculados: { primaria: 120, secundaria: 80, total: 200 }, jornada: 'MAÑANA', zona: 'URBANA', id: `fixture-${index}` }));
const institutions = { ...fixture, items, total: 3, total_pages: 1, filter_options: { periodos: [{ id: '1', nombre: 'Septiembre' }], municipios: [], instituciones: [], sedes: [], modalidades: [], rectores: [], gestores: [], estados: [] } };
try {
  for (const role of legacy ? ['ADMINISTRADOR'] : ['ADMINISTRADOR', 'GESTOR']) {
    const session = await browser.newContext({ serviceWorkers: 'block' });
    await session.addInitScript(({ role }) => {
      localStorage.setItem('empiria_access_token', 'synthetic-only');
      localStorage.setItem('empiria_auth_user', JSON.stringify({ id: 'fixture-user', name: 'Fixture', roles: [role], permissions: ['vinculaciones.read', 'operacion.read', 'nomina.movimientos.create'], isGlobalAdmin: false }));
      localStorage.setItem('empiria_empresa_id', '15');
    }, { role });
    await session.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      requests.push(url.pathname);
      if (req.method() !== 'GET') { mutations.push(`${req.method()} ${url.pathname}`); return route.abort(); }
      let data;
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/tenant/me') data = tenant;
      else if (path.endsWith('/capabilities')) data = { empresa: { id: 15 }, modulos: { OPERACION: true }, modulos_habilitados: ['OPERACION'] };
      else if (path === '/operacion/instituciones') data = legacy ? { ...institutions, items: items.slice(0, 2) } : institutions;
      else if (path === '/nomina/periodos') data = [{ id: '1', estado: 'ABIERTO', nombre_periodo: 'Septiembre', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30' }];
      else if (path === '/nomina/periodos/1/empleados') data = { items: [{ id: '1', vinculacion_id: '1', persona: { nombre_completo: 'Trabajador fixture' }, contexto_operativo: context }], pagination };
      else if (path.endsWith('/asignacion-operativa/opciones')) data = [{ id: '1', ...context }, { id: '2', ...context, modalidad_id: '4', modalidad: 'CAA' }];
      else if (path.includes('/contexto-operativo/')) data = { contexto: context };
      else { unexpected.push(path); return route.fulfill({ status: 404, body: '{}' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    const page = await session.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/operacion/instituciones?q=fixture&page=1&page_size=50`);
    await page.getByRole('cell', { name: 'Institución fixture', exact: true }).first().waitFor({ timeout: 10000 }).catch(async error => {
      console.log(JSON.stringify({ body: await page.locator('body').innerText(), errors, unexpected, requests }));
      throw error;
    });
    const text = await page.locator('main').innerText();
    if (legacy) {
      assert.match(text, /\[object Object\]/);
      assert.equal(await page.getByRole('button', { name: 'Cambiar modalidad', exact: true }).count(), 0);
      console.log('BASELINE REPRODUCED: real route renders object cupos and no modality action');
    } else {
      assert.doesNotMatch(text, /\[object Object\]|NaN/);
      const cells = page.locator('tbody tr').first().locator('td');
      assert.match(await cells.nth(5).innerText(), /Total: 200/);
      assert.match(await cells.nth(5).innerText(), /primaria: 120/);
      assert.match(await page.locator('tbody tr').nth(2).innerText(), /Sin dato/);
      const action = page.getByRole('button', { name: 'Cambiar modalidad', exact: true }).first();
      assert.equal(await action.isEnabled(), role === 'ADMINISTRADOR');
      if (role === 'ADMINISTRADOR') {
        const before = page.url();
        await action.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert.match(await dialog.innerText(), /Institución fixture/);
        assert.match(await dialog.innerText(), /Sede fixture/);
        assert.match(await dialog.innerText(), /Modalidad actual: RI/);
        await dialog.getByLabel('Fecha efectiva', { exact: true }).fill('2026-09-15');
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).waitFor();
        await dialog.getByText('CAA', { exact: true }).waitFor({ state: 'attached' });
        const modality = dialog.getByRole('combobox', { name: /^Modalidad/ });
        assert.equal(await modality.inputValue(), '3');
        await modality.selectOption('4');
        assert.equal(await modality.inputValue(), '4');
        assert.match(await dialog.innerText(), /REQUIERE_REVISION_SALARIAL/);
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(await dialog.count(), 0);
        assert.equal(page.url(), before, 'cancel preserves filters and pagination');
      }
      console.log(`${role}: real route, cupos, action, cancellation PASS`);
    }
    await session.close();
  }
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert.ok(requests.length < 30, 'bounded requests, no loop');
  console.log('No mutations, rendering errors, unexpected API requests or request loops');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
