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
const focalizaciones = [{ id: '9', nombre: 'September 2026', anio: 2026, mes: 9, empresa_id: '15', contrato_id: '24', estado: 'PROCESADO' }, { id: '4', nombre: 'August 2026', anio: 2026, mes: 8, empresa_id: '15', contrato_id: '24', estado: 'PROCESADO' }];
const institutions = { ...fixture, items, total: 3, total_pages: 1, filter_options: { periodos: [{ id: '1', nombre: 'Septiembre' }], municipios: [], instituciones: [], sedes: [], modalidades: [], rectores: [], gestores: [], estados: [] } };
try {
  for (const scenario of legacy ? [{ role: 'ADMINISTRADOR', september: false }] : [{ role: 'ADMINISTRADOR', september: false }, { role: 'ADMINISTRADOR', september: true }, { role: 'ADMINISTRADOR', september: true, defaultSelection: true }, { role: 'GESTOR', september: true }]) {
    const { role, september, defaultSelection } = scenario;
    const scenarioStart = requests.length;
    const session = await browser.newContext({ serviceWorkers: 'block' });
    await session.addInitScript(({ role }) => {
      localStorage.setItem('empiria_access_token', 'synthetic-only');
      localStorage.setItem('empiria_auth_user', JSON.stringify({ id: 'fixture-user', name: 'Fixture', roles: [role], permissions: ['vinculaciones.read', 'operacion.read', 'nomina.movimientos.create'], isGlobalAdmin: false }));
      localStorage.setItem('empiria_empresa_id', '15');
    }, { role });
    await session.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      requests.push(url.pathname + url.search);
      if (req.method() !== 'GET') { mutations.push(`${req.method()} ${url.pathname}`); return route.abort(); }
      let data;
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/tenant/me') data = tenant;
      else if (path.endsWith('/capabilities')) data = { empresa: { id: 15 }, modulos: { OPERACION: true }, modulos_habilitados: ['OPERACION'] };
      else if (path === '/operacion/instituciones') {
        const options = september ? focalizaciones : focalizaciones.slice(1);
        const selected = url.searchParams.get('focalizacion_id') ?? (url.searchParams.get('focalizacion_vigencia_id') ? '4' : options[0].id);
        data = legacy ? { ...institutions, items: items.slice(0, 2) } : { ...institutions, focalizacion_id: selected, filter_options: { ...institutions.filter_options,
          focalizaciones: [...options, ...options, { ...focalizaciones[0], id: '100', empresa_id: '16', contrato_id: '25' }] } };
      }
      else if (path === '/operacion/instituciones/nomina-periodo') {
        assert.equal(url.searchParams.get('empresa_id'), '15');
        assert.equal(url.searchParams.get('contrato_id'), '24');
        const date = url.searchParams.get('fecha_efectiva');
        assert.ok(['2026-09-15','2026-09-26','2027-01-01'].includes(date));
        data = date === '2027-01-01' ? null : { nomina_periodo_id: date === '2026-09-15' ? '3' : '5', estado: 'ABIERTO', nombre_periodo: 'Período fixture', fecha_inicio: date === '2026-09-15' ? '2026-08-26' : '2026-09-26', fecha_fin: date === '2026-09-15' ? '2026-09-25' : '2026-10-25' };
      }
      else if (path === '/nomina/periodos') data = [{ id: '1', estado: 'ABIERTO', nombre_periodo: 'Septiembre', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30' }];
      else if (['/nomina/periodos/3/empleados','/nomina/periodos/5/empleados'].includes(path)) data = { items: [{ id: '1', vinculacion_id: '1', persona: { nombre_completo: 'Trabajador fixture' }, contexto_operativo: context }], pagination };
      else if (path.endsWith('/asignacion-operativa/opciones')) data = [{ id: '1', ...context }, { id: '2', ...context, modalidad_id: '4', modalidad: 'CAA' }];
      else if (path.includes('/contexto-operativo/')) {
        assert.ok(path.startsWith('/nomina/periodos/3/') && path.endsWith('/2026-09-15') || path.startsWith('/nomina/periodos/5/') && path.endsWith('/2026-09-26'), 'context uses payroll resolved for the current date');
        data = { contexto: context };
      }
      else { unexpected.push(path); return route.fulfill({ status: 404, body: '{}' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    const page = await session.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500) errors.push('HTTP ' + response.status()); });
    await page.goto(`${origin}/operacion/instituciones?q=fixture&${defaultSelection ? '' : 'periodo_id=168&'}page=1&page_size=50`);
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
      await page.waitForURL(url => url.searchParams.get('focalizacion_id') === (defaultSelection ? '9' : '4') && !url.searchParams.has('focalizacion_vigencia_id'));
      assert.equal(new URL(page.url()).searchParams.has('periodo_id'), false, 'legacy URL normalized without payroll');
      const options = page.getByRole('combobox', { name: 'Focalización', exact: true }).locator('option');
      assert.deepEqual(await options.allTextContents(), september ? ['Todas las focalizaciones', 'Septiembre 2026', 'Agosto 2026'] : ['Todas las focalizaciones', 'Agosto 2026']);
      assert.doesNotMatch(await page.locator('main').innerText(), /Nomina period not found/);
      assert.equal(requests.slice(scenarioStart).some(path => path.includes('/nomina/')), false, 'listing never loads payroll');
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
        assert.equal(requests.slice(scenarioStart).some(path => path.includes('/nomina/') || path.includes('/nomina-periodo')), false, 'opening without date never resolves payroll');
        await dialog.getByLabel('Fecha efectiva', { exact: true }).first().fill('2026-09-15');
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).waitFor();
        await dialog.getByText('CAA', { exact: true }).waitFor({ state: 'attached' });
        const modality = dialog.getByRole('combobox', { name: /^Modalidad/ });
        assert.equal(await modality.inputValue(), '3');
        await modality.selectOption('4');
        assert.equal(await modality.inputValue(), '4');
        assert.match(await dialog.innerText(), /REQUIERE_REVISION_SALARIAL/);
        await dialog.getByLabel('Fecha efectiva', { exact: true }).first().fill('2026-09-26');
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).waitFor();
        await dialog.getByLabel('Período abierto', { exact: true }).locator('option[value="5"]').waitFor({ state: 'attached', timeout: 5000 }).catch(async error => { console.log(JSON.stringify({ dialog: await dialog.innerText(), requests, errors, unexpected })); throw error; });
        await dialog.getByLabel('Fecha efectiva', { exact: true }).first().fill('2027-01-01');
        await dialog.getByText('No hay período de Nómina ABIERTO aplicable a esta fecha y contrato.', { exact: true }).waitFor();
        assert.equal(await dialog.getByRole('button', { name: 'Guardar novedad', exact: true }).count(), 0);
        await dialog.getByLabel('Fecha efectiva', { exact: true }).first().fill('2026-09-15');
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(await dialog.count(), 0);
        assert.equal(page.url(), before, 'cancel preserves filters and pagination');
      }
      console.log(`${role}, September focalizacion ${september}: real route, canonical options/URL, distinct payroll3, cupos, cancellation PASS`);
    }
    await session.close();
  }
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  assert.ok(requests.length < 90, 'bounded requests, no loop');
  console.log('No mutations, rendering errors, unexpected API requests or request loops');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
