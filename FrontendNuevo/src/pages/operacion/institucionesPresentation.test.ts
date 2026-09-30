import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageOperationalChange, formatInstitutionNumber, normalizeInstitutionMetric } from './institucionesPresentation';

test('normaliza cupos reales y evita object object, NaN y pérdida de cero', () => {
  assert.deepEqual(normalizeInstitutionMetric({ primaria: 10, secundaria: 20, total: 30 }), { primaria: 10, secundaria: 20, total: 30 });
  assert.deepEqual(normalizeInstitutionMetric(0), { primaria: null, secundaria: null, total: 0 });
  assert.equal(formatInstitutionNumber({ primaria: 10, secundaria: 20, total: 30 }), '30');
  assert.equal(formatInstitutionNumber(null), 'Sin dato');
  assert.equal(formatInstitutionNumber(Number.NaN), 'Sin dato');
  assert.doesNotMatch(formatInstitutionNumber({ total: 30 }), /object Object|NaN/);
});

test('la acción depende de permisos efectivos y bloquea GESTOR', () => {
  assert.equal(canManageOperationalChange({ roles: ['ADMINISTRADOR'], permissions: ['nomina.movimientos.create'] }), true);
  assert.equal(canManageOperationalChange({ roles: ['TALENTO_HUMANO'], permissions: ['nomina.movimientos.update'] }), true);
  assert.equal(canManageOperationalChange({ roles: ['LECTURA'], permissions: ['nomina.read'] }), false);
  assert.equal(canManageOperationalChange({ roles: ['GESTOR'], permissions: ['nomina.movimientos.create'] }), false);
});
