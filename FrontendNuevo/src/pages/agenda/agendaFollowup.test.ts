import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowFollowupDiscard, buildFollowupPayload, canAddAgendaFollowup, followupDraftIsDirty, FollowupFormState, followupTimestamp, manualFollowupTypes, mergeSavedFollowup, refreshFollowupDetail } from './agendaFollowup.domain';

const initial = { tipo: 'COMENTARIO', comentario: '', fecha: '', requiere: false };
const draft = { ...initial, comentario: ' Llamada realizada ', fecha: '2026-09-16', requiere: true };

test('Agregar seguimiento visible con update o manage y oculto sin ambos', () => {
  assert.equal(canAddAgendaFollowup(['agenda.update']), true);
  assert.equal(canAddAgendaFollowup(['agenda.manage']), true);
  assert.equal(canAddAgendaFollowup(['agenda.read']), false);
  assert.equal(canAddAgendaFollowup([]), false);
});
test('comentario obligatorio, tipos manuales y payload especifico sin eventos automaticos', () => {
  assert.throws(() => buildFollowupPayload(initial), /obligatorio/);
  assert.throws(() => buildFollowupPayload({ ...initial, comentario: '  ' }), /obligatorio/);
  for (const tipo of manualFollowupTypes) assert.equal(buildFollowupPayload({ ...draft, tipo }).tipo, tipo);
  for (const tipo of ['REPROGRAMACION', 'REASIGNACION', 'CIERRE', 'CAMBIO_ESTADO', 'REAPERTURA', 'CANCELACION']) assert.throws(() => buildFollowupPayload({ ...draft, tipo }), /manual/);
  assert.deepEqual(buildFollowupPayload(draft), { tipo: 'COMENTARIO', comentario: 'Llamada realizada', fecha_proxima_seguimiento: '2026-09-16', requiere_seguimiento: true });
});
test('fecha laboral permanece YYYY-MM-DD, admite vacio, hoy y pasado; rechaza fechas imposibles', () => {
  for (const fecha of ['', '2026-09-16', '2000-02-29']) assert.equal(buildFollowupPayload({ ...draft, fecha }).fecha_proxima_seguimiento, fecha || null);
  for (const fecha of ['2026-02-29', '2026-13-01', '2026-09-16T00:00:00Z', '16/09/2026']) assert.throws(() => buildFollowupPayload({ ...draft, fecha }), /fecha/);
});
test('doble envio bloqueado incluso antes de render y tras exito; limpia solo borrador guardado', async () => {
  const form = new FollowupFormState(initial); form.change(draft);
  let resolve!: (value: unknown) => void;
  let calls = 0;
  const request = () => { calls++; return new Promise(r => { resolve = r; }); };
  const pending = form.save(request);
  assert.equal(form.getSnapshot().saving, true);
  form.change({ comentario: 'No debe cambiar durante guardado' });
  assert.equal(form.getSnapshot().draft.comentario, draft.comentario);
  assert.equal(await form.save(request), undefined);
  resolve({ id: 12 });
  assert.deepEqual((await pending)?.result, { id: 12 });
  assert.equal(await form.save(request), undefined);
  assert.equal(calls, 1); assert.equal(form.getSnapshot().saved, true);
  assert.deepEqual(form.getSnapshot().draft, initial);
});
for (const status of [400, 403, 404, 429, 500, 0]) test(`error ${status}: conserva borrador abierto y permite reintentar sin duplicar`, async () => {
  const form = new FollowupFormState(initial); form.change(draft);
  await form.save(async () => { throw Object.assign(new Error('Error de red'), { status }); });
  assert.deepEqual(form.getSnapshot().draft, draft);
  assert.equal(form.getSnapshot().saved, false); assert.equal(form.getSnapshot().saving, false);
  assert.match(form.getSnapshot().error, /borrador se conserva/);
  assert.ok(await form.save(async () => ({ id: 1 })));
});
test('exito actualiza detalle e historial y recarga vista/resumen sin modificar filtros', async () => {
  const old = { id: 10, seguimientos: [{ id: 1 }], participantes: [{ id: 7 }] };
  const merged = mergeSavedFollowup(old, { id: 2, comentario: 'Texto' }, buildFollowupPayload(draft));
  assert.deepEqual(merged.seguimientos.map(i => i.id), [1, 2]);
  assert.deepEqual(merged.participantes, old.participantes);
  assert.equal(mergeSavedFollowup(merged, { id: 2 }, buildFollowupPayload(draft)).seguimientos.length, 2);
  let detail = old; let reloads = 0;
  await refreshFollowupDetail(async () => merged, async () => { reloads++; }, updated => { detail = updated; });
  assert.equal(detail, merged); assert.equal(reloads, 1);
});
test('fallo de refresco no oculta detalle guardado ni provoca otro POST', async () => {
  const updated = { seguimientos: [{ id: 2 }] }; let detail: any;
  await assert.rejects(() => refreshFollowupDetail(async () => updated, async () => { throw new Error('Refresh'); }, value => { detail = value; }), /Refresh/);
  assert.equal(detail, updated);
});
test('cambios sin guardar requieren confirmar descarte y no se descartan durante guardado', () => {
  assert.equal(followupDraftIsDirty(initial, initial), false);
  for (const patch of [{ comentario: 'Texto' }, { tipo: 'EVIDENCIA' }, { fecha: '2026-09-16' }, { requiere: true }]) {
    const dirty = followupDraftIsDirty({ ...initial, ...patch }, initial);
    assert.equal(dirty, true);
    assert.equal(allowFollowupDiscard(dirty, false, () => false), false);
    assert.equal(allowFollowupDiscard(dirty, false, () => true), true);
  }
  assert.equal(allowFollowupDiscard(false, true, () => true), false);
});
test('fecha y hora usan Colombia; fecha laboral se transporta sin desplazamiento UTC', () => {
  assert.match(followupTimestamp('2026-09-17T02:00:00Z'), /16/);
  assert.equal(followupTimestamp('invalida'), '');
  assert.equal(buildFollowupPayload(draft).fecha_proxima_seguimiento, '2026-09-16');
});
