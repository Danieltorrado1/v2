import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveIntegracionFlagState } from '../modules/integracion/integracion.flags.js';

test('Fase 4: las ocho combinaciones de flags respetan dependencias', () => {
  for (const outbox of [false, true]) {
    for (const sync of [false, true]) {
      for (const recalc of [false, true]) {
        const state = resolveIntegracionFlagState({ outbox, sync, recalc });
        assert.equal(state.sync, outbox && sync, `${outbox}/${sync}/${recalc}: sync`);
        assert.equal(state.recalc, outbox && sync && recalc, `${outbox}/${sync}/${recalc}: recalc`);
        assert.equal(state.recalc_reason, recalc && (!outbox || !sync) ? 'DEPENDENCIES_REQUIRED' : recalc ? 'ACTIVE' : 'DISABLED');
      }
    }
  }
});
