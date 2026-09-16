import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeAssignableUsers,
  addParticipant,
  availableAssignableUsers,
  buildCancelPayload,
  buildReschedulePayload,
  canCancelAgendaTask,
  canCompleteAgendaTask,
  canRescheduleAgendaTask,
  canReopenAgendaTask,
  canStartAgendaTask,
  isAgendaDate,
  mergeParticipantUpdate,
  participantIds,
  participantListIsDirty,
  participantPayload,
  removeParticipant,
  transitionPayload,
  validateParticipantIds,
} from './agendaOperativa.domain';

test('carga participantes actuales de la respuesta del detalle', () => {
  assert.deepEqual(participantIds([{ id: 7 }, { usuario_id: '8' }, { id: 7 }]), [7, 8]);
});

test('lista candidatos desde usuarios asignables y excluye inactivos', () => {
  const users = [
    { id: 7, nombre_completo: 'Ana', rol: 'Talento Humano', activo: true },
    { id: 8, nombre_completo: 'Luis', rol: 'Gestor', activo: false },
    { id: 9, nombre_completo: 'Marta', rol: 'Gestor', active: false },
  ];
  assert.deepEqual(activeAssignableUsers(users, 99).map((user) => user.id), [7]);
  assert.equal(users[0]?.rol, 'Talento Humano');
});

test('responsable queda identificado y no puede seleccionarse', () => {
  const available = availableAssignableUsers([{ id: 4 }, { id: 5 }], 4, []);
  assert.deepEqual(available.map((user) => user.id), [5]);
  assert.deepEqual(addParticipant([], 4, 4), []);
  assert.match(validateParticipantIds([4], 4) ?? '', /responsable/);
});

test('agregar y retirar modifica el borrador sin duplicar usuarios', () => {
  let draft = addParticipant([], 12, 4);
  draft = addParticipant(draft, 12, 4);
  assert.deepEqual(draft, [12]);
  assert.deepEqual(removeParticipant(draft, 12), []);
});

test('evita duplicados en la lista y en la validación local', () => {
  assert.deepEqual(addParticipant([12], 12, 4), [12]);
  assert.match(validateParticipantIds([12, 12], 4) ?? '', /duplicados/);
});

test('permite guardar conjunto vacío y produce payload con el conjunto final', () => {
  assert.deepEqual(participantPayload([], 4), { error: null, payload: { participantes: [] } });
  const draft = addParticipant(removeParticipant([12, 13], 12), 15, 4);
  assert.deepEqual(participantPayload(draft, 4), { error: null, payload: { participantes: [13, 15] } });
});

test('detecta borrador sucio y restaurado cuando se revierten cambios', () => {
  assert.equal(participantListIsDirty([12], [12, 13]), true);
  assert.equal(participantListIsDirty([12], [12]), false);
});

test('mezcla participantes e historial devueltos por PUT en el detalle abierto', () => {
  const updated = mergeParticipantUpdate(
    { id: 5, participantes: [{ id: 7 }], seguimientos: [] },
    { participantes: [{ id: 8 }], seguimientos: [{ id: 9, tipo: 'COMENTARIO' }] },
  );
  assert.deepEqual(updated.participantes, [{ id: 8 }]);
  assert.deepEqual(updated.seguimientos, [{ id: 9, tipo: 'COMENTARIO' }]);
});

test('reprogramación requiere permiso y solo se ofrece en estados permitidos', () => {
  assert.equal(canRescheduleAgendaTask('PENDIENTE', ['agenda.update']), true);
  assert.equal(canRescheduleAgendaTask('EN_PROCESO', ['agenda.manage']), true);
  for (const state of ['REPROGRAMADA', 'TERMINADA', 'CANCELADA']) {
    assert.equal(canRescheduleAgendaTask(state, ['agenda.update']), false);
  }
  assert.equal(canRescheduleAgendaTask('PENDIENTE', ['agenda.cancel']), false);
});

test('reprogramación exige fecha válida, distinta y motivo mínimo', () => {
  assert.equal(isAgendaDate('2026-02-29'), false);
  assert.equal(isAgendaDate('2024-02-29'), true);
  assert.match(buildReschedulePayload({ fechaActual: '2026-09-14', fechaNueva: '', motivo: 'Cambio' }).error ?? '', /fecha/);
  assert.match(buildReschedulePayload({ fechaActual: '2026-09-14', fechaNueva: '2026-09-14', motivo: 'Cambio' }).error ?? '', /diferente/);
  assert.match(buildReschedulePayload({ fechaActual: '2026-09-14', fechaNueva: '2026-09-15', motivo: '  ' }).error ?? '', /motivo/);
});

test('payload de reprogramación respeta contrato y mantiene YYYY-MM-DD y fecha límite', () => {
  const prepared = buildReschedulePayload({ fechaActual: '2026-09-14', fechaNueva: '2026-09-18', fechaLimite: '2026-09-30', motivo: '  Cambio acordado  ', version: 3 });
  assert.deepEqual(prepared, { error: null, payload: { fecha_prevista: '2026-09-18', fecha_limite: '2026-09-30', motivo: 'Cambio acordado', version: 3 } });
  assert.equal(prepared.payload?.fecha_prevista, '2026-09-18');
});

test('cancelación requiere permiso y solo se ofrece en estados permitidos', () => {
  assert.equal(canCancelAgendaTask('PENDIENTE', ['agenda.cancel']), true);
  assert.equal(canCancelAgendaTask('EN_PROCESO', ['agenda.manage']), true);
  for (const state of ['REPROGRAMADA', 'TERMINADA', 'CANCELADA']) {
    assert.equal(canCancelAgendaTask(state, ['agenda.cancel']), false);
  }
  assert.equal(canCancelAgendaTask('PENDIENTE', ['agenda.update']), false);
});

test('cancelación exige motivo y prepara payload específico', () => {
  assert.match(buildCancelPayload('  ').error ?? '', /motivo/);
  assert.deepEqual(buildCancelPayload('  Solicitud cerrada  ', 5), { error: null, payload: { motivo: 'Solicitud cerrada', version: 5 } });
});
