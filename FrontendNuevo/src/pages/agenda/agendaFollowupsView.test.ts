import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FollowupsListState, emptyFollowupFilters, followupQuery, followupEmptyMessage, relatedFollowupTask, type FollowupPage, type FollowupRecord } from './agendaFollowupsView.domain';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const page = (number = 1, total = 60): FollowupPage => ({ items: [], page: number, limit: 25, total, hoy: '2026-09-16' });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('snapshot estable al montar oculto y activar; renders no duplican cargas', async () => {
  let calls = 0;
  const model = new FollowupsListState(async () => { calls++; return page(); });
  const hidden = model.getSnapshot();
  model.setActive(false);
  for (let render = 0; render < 20; render++) assert.equal(model.getSnapshot(), hidden);
  assert.equal(calls, 0);
  model.setActive(true); await flush();
  const loaded = model.getSnapshot();
  for (let render = 0; render < 20; render++) {
    model.setActive(true);
    assert.equal(model.getSnapshot(), loaded);
  }
  assert.equal(calls, 1);
  model.setActive(false);
});

test('carga paginada, limites y bloqueo inmediato de clics repetidos', async () => {
  const calls: Record<string, string | number>[] = [];
  const pending = deferred<FollowupPage>();
  const model = new FollowupsListState(async query => { calls.push(query); return calls.length === 1 ? page() : pending.promise; });
  model.setActive(true); await flush();
  assert.deepEqual(calls, [{ page: 1, limit: 25 }]);
  model.goPage(0); model.goPage(4); model.goPage(1.5); assert.equal(calls.length, 1);
  model.goPage(2); model.goPage(2); model.goPage(3); assert.equal(calls.length, 2);
  assert.equal(model.getSnapshot().result?.page, 1);
  pending.resolve(page(2)); await flush();
  assert.equal(model.getSnapshot().page, 2); assert.equal(model.getSnapshot().loading, false);
  model.setActive(false);
});

test('todos los filtros viajan al backend y vuelven a pagina 1; limpiar y limite', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: Record<string, string | number>[] = [];
  const model = new FollowupsListState(async query => { calls.push(query); return page(Number(query.page)); });
  model.setActive(true); await flush(); model.goPage(2); await flush();
  const filters = { filtro: 'hoy', responsable_id: '7', tipo_tarea: 'OTRA', modulo_relacionado: 'PERSONAL', desde: '2026-09-01', hasta: '2026-09-16', q: ' llamada ' };
  for (const [key, value] of Object.entries(filters)) model.setFilter(key as keyof typeof filters, value);
  assert.equal(model.getSnapshot().page, 1);
  t.mock.timers.tick(300); await flush();
  assert.deepEqual(calls.at(-1), { ...filters, q: 'llamada', responsable_id: 7, page: 1, limit: 25 });
  model.setLimit(200); assert.equal(model.getSnapshot().limit, 25);
  model.setLimit(10); t.mock.timers.tick(1); await flush(); assert.equal(calls.at(-1)?.limit, 10);
  model.clearFilters(); t.mock.timers.tick(1); await flush(); assert.deepEqual(calls.at(-1), { page: 1, limit: 10 });
  model.setActive(false);
});

test('busqueda con debounce descarta respuestas antiguas incluso durante la espera', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = deferred<FollowupPage>(); const recent = deferred<FollowupPage>(); let calls = 0;
  const model = new FollowupsListState(() => ++calls === 1 ? old.promise : recent.promise);
  model.setActive(true); model.setFilter('q', 'a'); t.mock.timers.tick(200); model.setFilter('q', 'ab');
  old.resolve(page(1, 99)); await flush(); assert.equal(model.getSnapshot().result, null);
  t.mock.timers.tick(299); assert.equal(calls, 1); t.mock.timers.tick(1); assert.equal(calls, 2);
  recent.resolve(page(1, 2)); await flush(); assert.equal(model.getSnapshot().result?.total, 2);
  model.setActive(false);
});

test('respuesta tardia no reemplaza una respuesta nueva ya aplicada', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = deferred<FollowupPage>(); let calls = 0;
  const model = new FollowupsListState(async () => ++calls === 1 ? old.promise : page(1, 3));
  model.setActive(true); model.setFilter('filtro', 'vencidos'); t.mock.timers.tick(1); await flush();
  old.resolve(page(1, 99)); await flush(); assert.equal(model.getSnapshot().result?.total, 3);
  model.setActive(false);
});

test('error y 429 conservan datos filtros pagina y permiten Reintentar', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let failure: unknown; let calls = 0;
  const model = new FollowupsListState(async query => { calls++; if (failure) throw failure; return page(Number(query.page)); });
  model.setFilter('filtro', 'proximos'); model.setActive(true); await flush(); model.goPage(2); await flush();
  const result = model.getSnapshot().result;
  for (const error of [new Error('Sin conexion'), { status: 429, retryAfterMs: 12000 }]) {
    failure = error; model.refresh(); t.mock.timers.tick(100); await flush();
    assert.equal(model.getSnapshot().result, result); assert.equal(model.getSnapshot().page, 2);
    assert.equal(model.getSnapshot().filters.filtro, 'proximos'); assert.ok(model.getSnapshot().error);
  }
  assert.match(model.getSnapshot().error, /12 segundos/);
  failure = undefined; const before = calls; model.retry(); model.retry(); await flush();
  assert.equal(calls, before + 1); assert.equal(model.getSnapshot().error, ''); model.setActive(false);
});

test('regresar de pestaña conserva filtros/pagina; nuevo seguimiento refresca sin reiniciar', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let total = 60; let calls = 0;
  const model = new FollowupsListState(async query => { calls++; return page(Number(query.page), total); });
  model.setFilter('responsable_id', '7'); model.setActive(true); await flush(); model.goPage(2); await flush();
  model.setActive(false); model.setActive(true); await flush(); assert.equal(calls, 2);
  total = 61; model.refresh(); t.mock.timers.tick(100); await flush();
  assert.equal(model.getSnapshot().page, 2); assert.equal(model.getSnapshot().filters.responsable_id, '7'); assert.equal(model.getSnapshot().result?.total, 61);
  model.setActive(false); model.refresh(); model.setActive(true); await flush(); assert.equal(calls, 4);
  model.setActive(false);
});

test('pagina fuera de rango vuelve con seguridad a 1 y vacios distinguen filtros', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let total = 60;
  const calls: number[] = [];
  const model = new FollowupsListState(async query => { calls.push(Number(query.page)); return page(Number(query.page), total); });
  model.setActive(true); await flush(); model.goPage(3); await flush(); total = 0;
  model.refresh(); t.mock.timers.tick(100); await flush();
  assert.deepEqual(calls, [1, 3, 3, 1]); assert.equal(model.getSnapshot().page, 1);
  assert.equal(followupEmptyMessage(emptyFollowupFilters), 'Todavía no hay seguimientos.');
  assert.match(followupEmptyMessage({ ...emptyFollowupFilters, filtro: 'sin_fecha' }), /filtros/);
  model.setActive(false);
});

test('clic usa tarea_id; fechas laborales permanecen literales y rangos invalidos no se envian', () => {
  let id = 0; relatedFollowupTask({ id: 80, tarea_id: 10 } as FollowupRecord, value => { id = value; }); assert.equal(id, 10);
  assert.equal(followupQuery({ ...emptyFollowupFilters, desde: '2026-09-16' }, 1, 25).desde, '2026-09-16');
  assert.throws(() => followupQuery({ ...emptyFollowupFilters, desde: '2026-02-29' }, 1, 25));
  assert.throws(() => followupQuery({ ...emptyFollowupFilters, desde: '2026-09-17', hasta: '2026-09-16' }, 1, 25));
});
