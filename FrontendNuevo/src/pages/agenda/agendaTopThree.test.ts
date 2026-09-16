import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTopChange, canLeaveTop, canManageOwnTop, syncTopSummary, topPosition, topToday, TopThreeState, type TopSnapshot, type TopWrite } from './agendaTopThree.domain';
const date = '2026-09-16';
const snapshot = (slots: (number|null)[], fecha = date): TopSnapshot => ({ fecha, tarea_ids: [0,1,2].map(i => slots[i] ?? null), items: slots.flatMap((id, i) => id === null ? [] : [{ tarea_id: id, posicion: i+1, titulo: `Tarea ${id}` }]) });

test('fecha laboral America/Bogota conserva dia anterior a medianoche UTC', () => {
  assert.equal(topToday(new Date('2026-09-17T02:00:00Z')), date);
  assert.equal(topToday(new Date('2026-09-17T05:00:00Z')), '2026-09-17');
});
test('propietario con update o manage puede gestionar su Top; no exige permiso ajeno', () => {
  assert.equal(canManageOwnTop(['agenda.update']), true); assert.equal(canManageOwnTop(['agenda.manage']), true);
  assert.equal(canManageOwnTop(['agenda.read']), false); assert.equal(canManageOwnTop([]), false);
});
test('agregar en posicion libre, limites y duplicados', () => {
  assert.deepEqual(buildTopChange(snapshot([]), 10, 3, 'place').next, [null,null,10]);
  for (const position of [0,4,-1,1.5]) assert.throws(() => buildTopChange(snapshot([]), 10, position, 'place'), /posición/);
  assert.throws(() => buildTopChange({ ...snapshot([]), tarea_ids: [10,10] }, 11, 1, 'place'), /inválido/);
  assert.throws(() => buildTopChange({ ...snapshot([]), tarea_ids: [10,11,12,13] }, 14, 1, 'place'), /inválido/);
});
test('mover a espacio libre, intercambio y sustitucion explicita; retiro confirmado', () => {
  assert.deepEqual(buildTopChange(snapshot([10]), 10, 3, 'place').next, [null,null,10]);
  assert.deepEqual(buildTopChange(snapshot([10,11]), 10, 2, 'place').next, [11,10,null]);
  const replacement = buildTopChange(snapshot([10,11,12]), 13, 2, 'place');
  assert.match(replacement.confirmation, /Sustituir.*Tarea 11/); assert.deepEqual(replacement.next, [10,13,12]);
  const removal = buildTopChange(snapshot([10,11,12]), 11, 2, 'remove');
  assert.match(removal.confirmation, /Retirar/); assert.deepEqual(removal.next, [10,null,12]);
});
test('sustitucion y retiro cancelados no envian solicitudes', async () => {
  for (const [id, action] of [[13, 'place'], [10, 'remove']] as const) {
    const model = new TopThreeState(id, date); await model.load(async () => snapshot([10,11,12]));
    let calls = 0;
    await model.save(action, () => false, async () => { calls++; return snapshot([]); });
    assert.equal(calls, 0); assert.deepEqual(model.getSnapshot().snapshot?.tarea_ids, [10,11,12]);
  }
});
test('doble envio bloqueado; exito actualiza drawer y Mi dia sin perder otros datos', async () => {
  const model = new TopThreeState(10, date); await model.load(async () => snapshot([])); model.selectPosition(3);
  let finish!: (s: TopSnapshot) => void; let calls = 0; let payload: TopWrite | undefined;
  const request = (input: TopWrite) => { calls++; payload = input; return new Promise<TopSnapshot>(resolve => { finish = resolve; }); };
  const pending = model.save('place', () => true, request);
  await model.save('place', () => true, request); assert.equal(calls, 1);
  finish(snapshot([null,null,10])); const result = (await pending)!;
  assert.deepEqual(payload, { fecha: date, tarea_ids: [null,null,10], esperado: [null,null,null] });
  assert.equal(topPosition(result, 10), 3); assert.equal(model.getSnapshot().dirty, false);
  const summary = { top_3: [], pendientes: 8 }; assert.equal(syncTopSummary(summary, result, date).pendientes, 8);
  assert.deepEqual(syncTopSummary(summary, result, date).top_3, result.items);
  assert.equal(syncTopSummary(summary, result, '2026-09-17'), summary);
});
for (const status of [400,403,404,429,500,0]) test(`error ${status} conserva fecha/posicion y permite reintentar`, async () => {
  const model = new TopThreeState(10, date); await model.load(async () => snapshot([])); model.selectPosition(2);
  await model.save('place', () => true, async () => { throw { status }; });
  assert.equal(model.getSnapshot().fecha, date); assert.equal(model.getSnapshot().position, 2);
  assert.equal(model.getSnapshot().saving, false); assert.equal(model.getSnapshot().dirty, true);
  assert.match(model.getSnapshot().error, /selección se conserva/);
  assert.ok(await model.save('place', () => true, async () => snapshot([null,10])));
});
test('409 bloquea reintentos hasta recarga explicita y conserva seleccion', async () => {
  const model = new TopThreeState(10, date); await model.load(async () => snapshot([])); model.selectPosition(2);
  let calls = 0;
  await model.save('place', () => true, async () => { calls++; throw { status: 409 }; });
  await model.save('place', () => true, async () => { calls++; return snapshot([]); }); assert.equal(calls, 1);
  await model.load(async () => snapshot([11])); assert.equal(model.getSnapshot().position, 2);
  await model.save('place', () => true, async payload => { assert.deepEqual(payload.esperado, [11,null,null]); return snapshot([11,10]); });
});
test('respuestas de otra fecha se descartan; seleccion sin enviar pide confirmacion', async () => {
  const model = new TopThreeState(10, date); let finish!: (s: TopSnapshot) => void;
  const old = model.load(() => new Promise(resolve => { finish = resolve; }));
  model.selectDate('2026-09-17'); await model.load(async fecha => snapshot([11], fecha)); finish(snapshot([10])); await old;
  assert.equal(model.getSnapshot().snapshot?.fecha, '2026-09-17'); assert.equal(model.getSnapshot().dirty, true);
  assert.equal(canLeaveTop(true, false, () => false), false); assert.equal(canLeaveTop(true, false, () => true), true);
  assert.equal(canLeaveTop(false, true, () => true), false);
});
