import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessNominaConfiguration, canManageNominaConfiguration, canReadNominaConfiguration } from './nominaConfigurationAccess';

const user = (roles: string[], permissions: string[]) => ({ roles, permissions });

test('nomina configuration allows only authorized administrative capabilities', () => {
  assert.equal(canAccessNominaConfiguration(user(['ADMINISTRADOR'], [])), true);
  assert.equal(canAccessNominaConfiguration(user(['ADMINISTRADOR'], ['nomina.economico.read'])), true);
  assert.equal(canAccessNominaConfiguration(user(['TALENTO_HUMANO'], ['nomina.economico.read'])), true);
  assert.equal(canAccessNominaConfiguration(user(['TALENTO_HUMANO'], ['nomina.read'])), false);
  assert.equal(canAccessNominaConfiguration(user(['GESTOR'], ['nomina.economico.read', 'nomina.periodos.update'])), false);
  assert.equal(canAccessNominaConfiguration(user(['OPERARIO'], ['nomina.economico.read'])), false);
  assert.equal(canReadNominaConfiguration(user(['ADMINISTRADOR'], [])), true);
  assert.equal(canManageNominaConfiguration(user(['ADMINISTRADOR'], []), 'nomina.categorias.manage'), true);
});
