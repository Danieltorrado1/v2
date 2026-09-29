import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessNominaConfiguration } from './nominaConfigurationAccess';

const user = (roles: string[], permissions: string[]) => ({ roles, permissions });

test('nomina configuration allows only authorized administrative capabilities', () => {
  assert.equal(canAccessNominaConfiguration(user(['ADMINISTRADOR'], ['nomina.economico.read'])), true);
  assert.equal(canAccessNominaConfiguration(user(['TALENTO_HUMANO'], ['nomina.economico.read'])), true);
  assert.equal(canAccessNominaConfiguration(user(['TALENTO_HUMANO'], ['nomina.read'])), false);
  assert.equal(canAccessNominaConfiguration(user(['GESTOR'], ['nomina.economico.read', 'nomina.periodos.update'])), false);
  assert.equal(canAccessNominaConfiguration(user(['OPERARIO'], ['nomina.economico.read'])), false);
});
