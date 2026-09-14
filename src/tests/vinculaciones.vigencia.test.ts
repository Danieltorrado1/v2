import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isVinculacionVigenteEnFecha,
  resolveEstadoVinculacionProyectado,
  vinculacionSolapaIntervalo
} from '../modules/vinculaciones/vigencia';

test('vigencia efectiva usa la primera fecha de retiro activa y conserva límites inclusivos', () => {
  const vinculacion = {
    fecha_inicio: '2026-07-29',
    fecha_fin: null,
    fecha_retiro_efectiva: '2026-08-13'
  };

  assert.equal(isVinculacionVigenteEnFecha(vinculacion, '2026-08-13'), true);
  assert.equal(isVinculacionVigenteEnFecha(vinculacion, '2026-08-14'), false);
  assert.equal(vinculacionSolapaIntervalo(vinculacion, '2026-08-01', '2026-08-13'), true);
  assert.equal(vinculacionSolapaIntervalo(vinculacion, '2026-08-14', '2026-08-31'), false);
});

test('la proyección prioriza retiro efectivo, preserva suspensión y no revive anulaciones', () => {
  assert.equal(resolveEstadoVinculacionProyectado('ACTIVA', '2026-08-13'), 'RETIRADA');
  assert.equal(resolveEstadoVinculacionProyectado('RETIRADA', null), 'ACTIVA');
  assert.equal(resolveEstadoVinculacionProyectado('SUSPENDIDA', null), 'SUSPENDIDA');
  assert.equal(resolveEstadoVinculacionProyectado('ANULADA', null), 'ANULADA');
});
