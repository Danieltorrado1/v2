import assert from 'node:assert/strict';
import { operationTabForPath, operationTabs } from './operacionNavigation';

assert.deepEqual(operationTabs.map((tab) => tab.label), [
  'Instituciones', 'Verificación SIMAT', 'Reporte diario', 'Descuentos semanales', 'Planilla final',
]);
assert.equal(operationTabs.some((tab) => /Estadísticas|Evaluación operacional/.test(tab.label)), false);
assert.equal(operationTabForPath('/operacion/instituciones')?.label, 'Instituciones');
assert.equal(operationTabForPath('/operacion/planilla-final')?.route, '/operacion/planilla-final');
assert.equal(operationTabForPath('/operacion/estadisticas'), null);
console.log('operation navigation checks passed');
