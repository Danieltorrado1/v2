import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canCompleteAgendaTask,
  canReopenAgendaTask,
  canStartAgendaTask,
  transitionPayload,
} from './agendaOperativa.domain';

test('Iniciar permite PENDIENTE y REPROGRAMADA con agenda.update o agenda.manage', () => {
  assert.equal(canStartAgendaTask('PENDIENTE', ['agenda.update']), true);
  assert.equal(canStartAgendaTask('REPROGRAMADA', ['agenda.update']), true);
  assert.equal(canStartAgendaTask('REPROGRAMADA', ['agenda.read']), false);
  assert.equal(canStartAgendaTask('EN_PROCESO', ['agenda.update']), false);
  assert.equal(canStartAgendaTask('PENDIENTE', ['agenda.manage']), true);
  assert.equal(canStartAgendaTask('PENDIENTE', ['agenda.complete']), false);
});

test('Terminar permite PENDIENTE o EN_PROCESO con agenda.complete o agenda.manage', () => {
  assert.equal(canCompleteAgendaTask('PENDIENTE', ['agenda.complete']), true);
  assert.equal(canCompleteAgendaTask('EN_PROCESO', ['agenda.complete']), true);
  assert.equal(canCompleteAgendaTask('EN_PROCESO', ['agenda.manage']), true);
  for (const state of ['REPROGRAMADA', 'TERMINADA', 'CANCELADA']) assert.equal(canCompleteAgendaTask(state, ['agenda.complete']), false);
});

test('Reabrir permite TERMINADA o CANCELADA con agenda.reopen o agenda.manage', () => {
  assert.equal(canReopenAgendaTask('TERMINADA', ['agenda.reopen']), true);
  assert.equal(canReopenAgendaTask('CANCELADA', ['agenda.reopen']), true);
  assert.equal(canReopenAgendaTask('CANCELADA', ['agenda.manage']), true);
  for (const state of ['PENDIENTE', 'EN_PROCESO', 'REPROGRAMADA']) assert.equal(canReopenAgendaTask(state, ['agenda.reopen']), false);
});

test('Transiciones envían version del contrato y no inventan motivo', () => {
  assert.deepEqual(transitionPayload(8), { version: 8 });
  assert.deepEqual(transitionPayload(undefined), {});
});
