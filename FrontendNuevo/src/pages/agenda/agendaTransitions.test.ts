import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canCompleteAgendaTask,
  canReopenAgendaTask,
  canStartAgendaTask,
  transitionPayload,
} from './agendaOperativa.domain';

test('Iniciar solo permite PENDIENTE con permiso efectivo agenda.update', () => {
  assert.equal(canStartAgendaTask('PENDIENTE', ['agenda.update']), true);
  assert.equal(canStartAgendaTask('EN_PROCESO', ['agenda.update']), false);
  assert.equal(canStartAgendaTask('PENDIENTE', ['agenda.manage']), false);
  assert.equal(canStartAgendaTask('PENDIENTE', ['agenda.complete']), false);
});

test('Terminar permite PENDIENTE o EN_PROCESO con agenda.complete', () => {
  assert.equal(canCompleteAgendaTask('PENDIENTE', ['agenda.complete']), true);
  assert.equal(canCompleteAgendaTask('EN_PROCESO', ['agenda.complete']), true);
  assert.equal(canCompleteAgendaTask('EN_PROCESO', ['agenda.manage']), false);
  for (const state of ['REPROGRAMADA', 'TERMINADA', 'CANCELADA']) assert.equal(canCompleteAgendaTask(state, ['agenda.complete']), false);
});

test('Reabrir permite TERMINADA o CANCELADA con agenda.reopen', () => {
  assert.equal(canReopenAgendaTask('TERMINADA', ['agenda.reopen']), true);
  assert.equal(canReopenAgendaTask('CANCELADA', ['agenda.reopen']), true);
  assert.equal(canReopenAgendaTask('CANCELADA', ['agenda.manage']), false);
  for (const state of ['PENDIENTE', 'EN_PROCESO', 'REPROGRAMADA']) assert.equal(canReopenAgendaTask(state, ['agenda.reopen']), false);
});

test('Transiciones envían version del contrato y no inventan motivo', () => {
  assert.deepEqual(transitionPayload(8), { version: 8 });
  assert.deepEqual(transitionPayload(undefined), {});
});
