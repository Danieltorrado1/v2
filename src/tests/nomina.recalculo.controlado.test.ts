import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertControlledPreflight,
  assertExactConfirmation,
  calculateExcludedEmployees,
  expectedConfirmation,
  isPostgres17
} from '../modules/nomina/nomina.recalculo.controlado.js';

const valid = {
  empresaId: '15',
  contratoId: '24',
  periodoId: '3',
  periodoEstado: 'ABIERTO',
  employeesMaterialized: 624,
  candidateEmployeeIds: ['101', '102'],
  excludedEmployees: 622,
  activeNoveltyRows: 2,
  activeNoveltyDays: 2,
  protectedLiquidations: 0,
  protectedPayslips: 0,
  protectedManualAdjustments: 0,
  waitingLocks: 0,
  period5Employees: 788,
  period5ActiveNovelties: 1
} as const;

test('accepts PostgreSQL 17.x and rejects PostgreSQL 16', () => {
  assert.equal(isPostgres17('17.11'), true);
  assert.equal(isPostgres17('17.6'), true);
  assert.equal(isPostgres17('16.4'), false);
});

test('preflight scope rejects annulled periods, other companies and protected records', () => {
  assert.doesNotThrow(() => assertControlledPreflight(valid));
  assert.throws(() => assertControlledPreflight({ ...valid, periodoEstado: 'ANULADO' }));
  assert.throws(() => assertControlledPreflight({ ...valid, empresaId: '99' }));
  assert.throws(() => assertControlledPreflight({ ...valid, contratoId: '25' }));
  assert.throws(() => assertControlledPreflight({ ...valid, protectedLiquidations: 1 }));
  assert.throws(() => assertControlledPreflight({ ...valid, protectedPayslips: 1 }));
  assert.throws(() => assertControlledPreflight({ ...valid, protectedManualAdjustments: 1 }));
});

test('confirmation is dynamic and rejects stale or incorrect candidate counts', () => {
  const confirmation = expectedConfirmation(173);
  assert.doesNotThrow(() => assertExactConfirmation(173, confirmation));
  assert.throws(() => assertExactConfirmation(174, confirmation));
  assert.throws(() => assertExactConfirmation(173, confirmation.replace('PROJECT', 'WRONG')));
});

test('exclusions are calculated from the current population and candidates', () => {
  assert.equal(calculateExcludedEmployees(795, 187), 608);
  assert.doesNotThrow(() => assertControlledPreflight({ ...valid, employeesMaterialized: 795, candidateEmployeeIds: Array.from({ length: 187 }, (_, i) => String(i + 1)), excludedEmployees: 608, activeNoveltyRows: 354, activeNoveltyDays: 383 }));
  assert.throws(() => assertControlledPreflight({ ...valid, employeesMaterialized: 795, candidateEmployeeIds: Array.from({ length: 187 }, (_, i) => String(i + 1)), excludedEmployees: 622 }));
  assert.throws(() => calculateExcludedEmployees(10, 11));
});
