import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageAgendaAction, canStartAgendaTask, canCompleteAgendaTask, canReopenAgendaTask, canCancelAgendaTask, canRescheduleAgendaTask } from './agendaOperativa.domain';

const actions = [
  ['editar', 'agenda.update', (p: string[]) => canManageAgendaAction(p, 'agenda.update')],
  ['asignar', 'agenda.assign', (p: string[]) => canManageAgendaAction(p, 'agenda.assign')],
  ['participantes', 'agenda.update', (p: string[]) => canManageAgendaAction(p, 'agenda.update')],
  ['iniciar', 'agenda.update', (p: string[]) => canStartAgendaTask('PENDIENTE', p)],
  ['terminar', 'agenda.complete', (p: string[]) => canCompleteAgendaTask('EN_PROCESO', p)],
  ['reprogramar', 'agenda.update', (p: string[]) => canRescheduleAgendaTask('PENDIENTE', p)],
  ['cancelar', 'agenda.cancel', (p: string[]) => canCancelAgendaTask('PENDIENTE', p)],
  ['reabrir', 'agenda.reopen', (p: string[]) => canReopenAgendaTask('TERMINADA', p)],
] as const;
for (const [name, permission, visible] of actions) test(`${name}: visible con especifico o manage; oculto sin ambos`, () => {
  assert.equal(visible([permission]), true);
  assert.equal(visible(['agenda.manage']), true);
  assert.equal(visible([]), false);
  assert.equal(visible(['agenda.read']), false);
});

test('entrada Agenda admite manage y mantiene requisito del modulo SaaS', async () => {
  const { tenantModules } = await import('../../architecture/moduleCatalog');
  const { canAccessEntry } = await import('../../architecture/moduleAccess');
  const entry = tenantModules.find(item => item.code === 'AGENDA_OPERATIVA')!;
  assert.ok(entry);
  for (const permissions of [['agenda.read'], ['agenda.manage']]) {
    assert.equal(canAccessEntry(entry, { roles: [], permissions }, { AGENDA_OPERATIVA: true }), true);
    assert.equal(canAccessEntry(entry, { roles: [], permissions }, { AGENDA_OPERATIVA: false }), false);
  }
  assert.equal(canAccessEntry(entry, { roles: [], permissions: [] }, { AGENDA_OPERATIVA: true }), false);
});
